// Mention and spam alerts in real chat windows of the desktop app. Kick's chat page is replaced by a small
// stand-in page, and "are you a moderator here?" is answered by the test, so this needs no network or login.
// Uses a temporary data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, playwright } = require('../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

const T = { timeout: 60000 };   // per test, so one stuck test can't hold up the run
let app, win;
const pageErrors = [];

test.before(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-alerts-'));
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => { try { proc.kill(); } catch {} });   // never leave the app open if the tests die
  // Kick's chat page: a stand-in with a few old messages. You moderate "alpha", not "bravo".
  await app.evaluate(({ session, ipcMain }) => {
    const page = `<!doctype html><title>chat</title><body><div id="chat">
      <div class="row"><b>regular</b>: <span>evening all</span></div>
      <div class="row"><b>another</b>: <span>gg</span></div></div></body>`;
    session.fromPartition('persist:kick').protocol.handle('https', req =>
      /\/popout\/[^/]+\/chat/.test(req.url) ? new Response(page, { headers: { 'content-type': 'text/html' } }) : new Response('', { status: 404 }));
    ipcMain.removeHandler('mod:check');
    ipcMain.handle('mod:check', (_e, ch) => ch === 'alpha');
  });
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#loginBtn:not([hidden])');
  await win.evaluate(() => localStorage.setItem('kickMultiview.alerts', JSON.stringify({ mention: { sound: 'none' }, spam: { sound: 'none' } })));
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  await win.selectOption('#mode', 'chat');
  for (const ch of ['alpha', 'bravo']) { await win.fill('#url', ch); await win.click('#add'); }
  await win.waitForFunction(() => document.querySelectorAll('#stage .win.chat webview').length === 2);
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) app.process().kill('SIGKILL');
});

// Run something inside a chat's page.
const inChat = (ch, fn, arg) => win.evaluate(([ch, src, arg]) => {
  const v = [...document.querySelectorAll('#stage .win.chat')].find(w => w.querySelector('.title').textContent === ch).querySelector('webview');
  return v.executeJavaScript(`(${src})(${JSON.stringify(arg)})`);
}, [ch, fn.toString(), arg]);
const say = (ch, sender, text) => inChat(ch, ([s, t]) => {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = '<b></b>: <span></span>'; d.querySelector('b').textContent = s; d.querySelector('span').textContent = t;
  document.getElementById('chat').appendChild(d);
}, [sender, text]);
const alertOf = ch => win.evaluate(ch => {
  const w = [...document.querySelectorAll('#stage .win.chat')].find(x => x.querySelector('.title').textContent === ch);
  return { level: ['al-1', 'al-2', 'al-3'].find(c => w.classList.contains(c)) || '', color: w.style.getPropertyValue('--al') };
}, ch);
const tagOf = (ch, text) => inChat(ch, t => {
  const row = [...document.querySelectorAll('.row')].find(r => r.textContent.includes(t));
  const tag = row && row.querySelector('[data-kmv-spam]');
  return tag ? tag.title : null;
}, text);
const ready = () => win.waitForTimeout(3000);   // the chat helper treats what's already there as old, for 2.5 s

test('a mention lights up that chat window and is listed, a normal message doesn\'t', T, async () => {
  await win.evaluate(() => window.openSettings('accounts'));
  await win.fill('#mentUser', 'mename');
  await win.press('#mentUser', 'Enter');
  await win.keyboard.press('Escape');
  await ready();
  await say('bravo', 'someone', 'nice one');
  await say('bravo', 'someone', '@mename are you on later?');
  await win.waitForFunction(() => document.querySelector('#mentBtn .mb-count').textContent === '1');
  assert.deepEqual(await alertOf('bravo'), { level: 'al-1', color: '#e8b84a' });
  assert.equal((await alertOf('alpha')).level, '', 'only that chat');
  await win.click('#mentBtn');
  assert.match(await win.textContent('#mentList'), /someone.*mentioned you.*are you on later\?/s);
  await win.keyboard.press('Escape');
  await win.click('#stage .win.chat:has(.title:text-is("bravo")) .bar');
  assert.equal((await alertOf('bravo')).level, '', 'clicking the chat clears it');
});

test('spam alerts: a promo bot in a chat you moderate is tagged and lights the window; elsewhere nothing happens', T, async () => {
  await win.evaluate(() => window.openSettings('spam'));
  await win.check('#spamOn');
  await win.keyboard.press('Escape');
  await ready();
  const bot = 'hq ai stream upgrades botkiva com zero cost upgrades';
  await say('alpha', 'regular', 'check the clip at kick.com/alpha/clips/abc');
  await say('alpha', 'newacct', bot);
  await say('bravo', 'newacct', bot);
  await win.waitForFunction(() => document.querySelector('#stage .win.chat.al-1'));
  await win.waitForTimeout(500);
  assert.deepEqual(await alertOf('alpha'), { level: 'al-1', color: '#ff5f5f' });
  assert.match(await tagOf('alpha', 'botkiva'), /Likely spam.*Disguised link: botkiva com.*Promo words/s);
  assert.equal(await tagOf('alpha', 'kick.com/alpha/clips'), null, 'a clip link isn\'t flagged');
  assert.equal((await alertOf('bravo')).level, '', 'bravo isn\'t a chat you moderate');
  assert.equal(await tagOf('bravo', 'botkiva'), null);
  assert.match(await win.textContent('#msg'), /Likely spam in alpha's chat/);
});

test('spam alerts off: chats stop handing over their messages', T, async () => {
  await win.evaluate(() => window.openSettings('spam'));
  await win.uncheck('#spamOn');
  await win.keyboard.press('Escape');
  await win.click('#stage .win.chat:has(.title:text-is("alpha")) .bar');
  await say('alpha', 'otherbot', 'cheap viewers at promo-site com, zero cost boost');
  await win.waitForTimeout(2500);
  assert.equal((await alertOf('alpha')).level, '');
  assert.equal(await tagOf('alpha', 'promo-site'), null);
  assert.deepEqual(pageErrors, []);
});
