// The optional YouTube API key in the real desktop app (Settings > Accounts): it's tested with Google before it's
// kept, wrong keys and over-quota keys get clear messages, the page never gets the key back, and "How to get
// one" opens the guide. Google is replaced by a local stand-in, so this needs no network. Uses a temporary
// data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { ROOT, playwright } = require('../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

const T = { timeout: 45000 };   // per test, so one stuck test can't hold up the run
const KEYS = { good: 'good_key_0123456789abcdefghij', bad: 'bad_key_0123456789abcdefghijk', quota: 'quota_key_0123456789abcdefgh' };
let app, win, server, asked = [];
const pageErrors = [];

// Google's YouTube Data API, as far as the key test needs it.
function fakeGoogle() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x'), key = u.searchParams.get('key');
      asked.push(u.pathname);
      const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (key === KEYS.good) return send(200, { items: [] });
      if (key === KEYS.quota) return send(403, { error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } });
      send(400, { error: { code: 400, errors: [{ reason: 'badRequest' }], details: [{ reason: 'API_KEY_INVALID' }] } });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test.before(async () => {
  server = await fakeGoogle();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-ytkey-'));
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', SMV_YT_API: `http://127.0.0.1:${server.address().port}`, ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => { try { proc.kill(); } catch {} });   // never leave the app open if the tests die
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#loginBtn:not([hidden])');
  // No system key store in the test (on a Mac it would ask for the Keychain): the key is kept for this run only.
  await app.evaluate(({ safeStorage }) => { safeStorage.isEncryptionAvailable = () => false; });
});
test.after(async () => {
  server?.close();
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) app.process().kill('SIGKILL');
});

const status = () => win.locator('#settingsDlg .am-yk-st').textContent();
async function openMenu() { if (await win.isHidden('#settingsDlg') || await win.isHidden('#settingsDlg .am-yk')) await win.evaluate(() => window.openSettings('accounts')); await win.waitForSelector('#settingsDlg .am-yk'); }
async function addKey(key) {
  await openMenu();
  await win.fill('#settingsDlg .am-yk-in', key);
  await win.click('#settingsDlg .am-yk-add');
  await win.waitForFunction(() => !document.querySelector('#settingsDlg .am-yk-add').disabled && !/Testing/.test(document.querySelector('#settingsDlg .am-yk-st').textContent));
}

test('Settings > Accounts offers an optional YouTube API key', T, async () => {
  await openMenu();
  assert.match(await status(), /faster and more reliable/);
  assert.ok(await win.isVisible('#settingsDlg .am-yk-in'));
  assert.equal(await win.getAttribute('#settingsDlg .am-yk-in', 'type'), 'password');
});

test('something that isn\'t a key is turned down without asking Google', T, async () => {
  asked = [];
  await addKey('not a key');
  assert.match(await status(), /doesn't look like an API key/);
  assert.deepEqual(asked, []);
});

test('a key Google refuses isn\'t kept', T, async () => {
  await addKey(KEYS.bad);
  assert.match(await status(), /didn't accept that key.*YouTube Data API v3/);
  assert.equal((await win.evaluate(() => window.kmv.ytKeyStatus())).set, false);
});

test('a working key is kept, and the page only hears that one is set', T, async () => {
  asked = [];
  await addKey(KEYS.good);
  assert.deepEqual(asked, ['/videos'], 'tested with one question');
  assert.match(await status(), /Key added/);
  assert.match(await status(), /until you close the app/, 'no key store here: kept for this run only');
  assert.ok(await win.isVisible('#settingsDlg .am-yk-rm'));
  assert.ok(await win.isHidden('#settingsDlg .am-yk-in'));
  assert.equal(await win.inputValue('#settingsDlg .am-yk-in'), '', 'the box is emptied');
  const st = await win.evaluate(() => window.kmv.ytKeyStatus());
  assert.equal(st.set, true);
  assert.ok(!JSON.stringify(st).includes(KEYS.good), 'the key itself never comes back to the page');
});

test('removing the key', T, async () => {
  await openMenu();
  await win.click('#settingsDlg .am-yk-rm');
  await win.click('#askDlg .ask-yes');   // "Remove the YouTube API key?"
  await win.waitForSelector('#settingsDlg .am-yk-in', { state: 'visible' });
  assert.equal((await win.evaluate(() => window.kmv.ytKeyStatus())).set, false);
});

test('a key that\'s over today\'s quota is kept, and says when it\'s used again', T, async () => {
  await addKey(KEYS.quota);
  assert.match(await status(), /Over today's quota: checking YouTube pages instead until \d/);
  const st = await win.evaluate(() => window.kmv.ytKeyStatus());
  assert.equal(st.state, 'quota');
  assert.ok(st.until > Date.now());
});

test('"How to get one" opens the guide at the YouTube API key section', T, async () => {
  await openMenu();
  await win.click('#settingsDlg .am-yk-how');
  await win.waitForSelector('#settingsDlg [data-doc=guide] h3');
  const h = win.locator('#settingsDlg [data-doc=guide] h3', { hasText: 'YouTube API key' });
  assert.equal(await h.count(), 1);
  const top = await h.evaluate(el => el.getBoundingClientRect().top - el.closest('.st-body').getBoundingClientRect().top);
  assert.ok(top >= -2 && top < 60, 'scrolled to the section');
  assert.deepEqual(pageErrors, []);
});
