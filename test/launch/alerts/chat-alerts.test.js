// Mention and spam alerts in real chat windows of the desktop app. Kick's chat page is replaced by a small
// stand-in page, and "are you a moderator here?" is answered by the test, so this needs no network or login.
// Uses a temporary data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { stubExists, openChannel, nameIs } = require('../app');
const { ROOT, playwright, killApp, tempDir } = require('../../helpers');

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
  const data = tempDir('alerts');
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', '--use-mock-keychain', ROOT], env, timeout: 60000 });
  await stubExists(app);
  const proc = app.process();
  process.once('exit', () => killApp(proc));   // never leave the app open if the tests die
  // Kick's chat page: a stand-in with a few old messages. You moderate "alpha", not "bravo".
  // Like a mod shortcut, it can stop some clicks on the window before anything else sees them (window.blockClicks).
  await app.evaluate(({ session, ipcMain }) => {
    const page = `<!doctype html><title>chat</title><script>
      ['pointerdown', 'click'].forEach(t => addEventListener(t, e => { if (window.blockClicks) e.stopImmediatePropagation(); }, true));
      </script><body><div id="chat">
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
  for (const ch of ['alpha', 'bravo']) await openChannel(win, ch, 'chat');
  await win.waitForFunction(() => document.querySelectorAll('#stage .win.chat webview').length === 2);
  await win.click('#layoutBtn'); await win.click('#layoutMenu [data-l=tile]');   // side by side, so no window covers another's bar
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) killApp(app.process());
});

// Run something inside a chat's page.
const inChat = (ch, fn, arg) => win.evaluate(([ch, src, arg]) => {
  const v = [...document.querySelectorAll('#stage .win.chat')].find(w => w.querySelector('.title').textContent.toLowerCase() === ch).querySelector('webview');
  return v.executeJavaScript(`(${src})(${JSON.stringify(arg)})`);
}, [ch, fn.toString(), arg]);
const say = (ch, sender, text) => inChat(ch, ([s, t]) => {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = '<b></b>: <span></span>'; d.querySelector('b').textContent = s; d.querySelector('span').textContent = t;
  document.getElementById('chat').appendChild(d);
}, [sender, text]);
const alertOf = ch => win.evaluate(ch => {
  const w = [...document.querySelectorAll('#stage .win.chat')].find(x => x.querySelector('.title').textContent.toLowerCase() === ch);
  return { level: ['al-1', 'al-2', 'al-3'].find(c => w.classList.contains(c)) || '', color: w.style.getPropertyValue('--al') };
}, ch);
const tagOf = (ch, text) => inChat(ch, t => {
  const row = [...document.querySelectorAll('.row')].find(r => r.textContent.includes(t));
  const tag = row && row.querySelector('[data-kmv-spam]');
  return tag ? tag.title : null;
}, text);
// What a chat's own connection to Kick brings (in-site/feed.js), as its page hands it over: its messages and news
const kickFrame = (event, data, channel = 'chatrooms.1.v2') => JSON.stringify({ push: { channel, pub: { data: { event, data: JSON.stringify(data) } } } });
let frameN = 0;
const kickMsg = (sender, content, extra = {}) => kickFrame('App\\Events\\ChatMessageEvent', { id: 'f' + (++frameN), content, type: 'message', created_at: new Date().toISOString(),
  sender: { id: 9, username: sender, slug: sender.toLowerCase(), identity: {} }, ...extra });
const feed = (ch, ...raw) => win.evaluate(async ([ch, raw]) => {
  const { siteMessage } = await import('./page/shared/incoming.js'), w = window.openWins().find(o => o.kind === 'chat' && o.channel === ch);
  siteMessage(w, w.view, '__kmv:feed ' + JSON.stringify({ s: 'kick', raw }));
}, [ch, raw]);
const notesOf = (kind, sender) => win.evaluate(([k, s]) => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(n => n.kind === k && (!s || n.sender === s)), [kind, sender]);
// Click a chat window's bar on its empty part (not its channel dropdown or a button).
const clickBar = ch => win.click(`#stage .win.chat:has(.title${nameIs(ch)}) .bar .grab`);
const ready = () => win.waitForTimeout(3000);   // the chat helper treats what's already there as old, for 2.5 s

test('a mention lights up that chat window and is listed, a normal message doesn\'t', T, async () => {
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=names]');   // (it opens on Alerts)
  await win.fill('#mentUser', 'mename');
  await win.press('#mentUser', 'Enter');
  await win.keyboard.press('Escape');
  await ready();
  await say('bravo', 'someone', 'nice one');
  await say('bravo', 'someone', '@mename are you on later?');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  assert.deepEqual(await alertOf('bravo'), { level: 'al-1', color: '#e8b84a' });
  assert.equal((await alertOf('alpha')).level, '', 'only that chat');
  await clickBar('bravo');
  assert.equal((await alertOf('bravo')).level, '', 'clicking the chat clears it');
  assert.ok(await win.$eval('#bellBtn .mb-count', e => e.hidden), 'and its mention is no longer counted');
  await win.click('#bellBtn');
  assert.equal(await win.textContent('#bellList .mp-row .mp-kind'), 'Mention');
  assert.match(await win.textContent('#bellList'), /someone.*bravo.*are you on later\?/s);
  assert.equal(await win.$$eval('#bellList .mp-row.unread', r => r.length), 0, 'already seen');
  await win.keyboard.press('Escape');
});

test('a mention in another chat is counted until you click into that chat, not another one', T, async () => {
  await say('alpha', 'someone', 'hey @mename');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  await clickBar('bravo');
  assert.equal(await win.textContent('#bellBtn .mb-count'), '1', 'bravo has no new mentions');
  await clickBar('alpha');
  assert.ok(await win.$eval('#bellBtn .mb-count', e => e.hidden));
});

test('clicking inside a chat that already has focus clears its alert and mention too', T, async () => {
  await say('bravo', 'someone', '@mename over here');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  assert.equal((await alertOf('bravo')).level, 'al-1');
  // a click in the chat page itself, with no change of focus for the app to notice
  await inChat('bravo', () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').hidden);
  assert.equal((await alertOf('bravo')).level, '');
});

test('typing in a chat that already has focus clears its alert and mention too', T, async () => {
  await say('bravo', 'someone', '@mename still there?');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  assert.equal((await alertOf('bravo')).level, 'al-1');
  // a key press in the chat page itself, with no change of focus for the app to notice
  await inChat('bravo', () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').hidden);
  assert.equal((await alertOf('bravo')).level, '');
});

test('a mention that comes after you last typed in that chat still alerts', T, async () => {
  await inChat('bravo', () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  await win.waitForTimeout(50);
  await say('bravo', 'someone', '@mename one more thing');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  assert.equal((await alertOf('bravo')).level, 'al-1');
  await clickBar('bravo');   // seen, so the next test starts clear
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').hidden);
});

test('the @ button on a chat\'s bar turns mentions off for that chat only', T, async () => {
  const at = `#stage .win.chat:has(.title${nameIs('alpha')}) [data-a=at]`;
  assert.equal(await win.$eval(at, b => b.hidden), false);
  await win.click(at);
  assert.ok(await win.$eval(at, b => b.classList.contains('off')));
  await win.waitForTimeout(500);
  await say('alpha', 'someone', '@mename quiet please');
  await say('bravo', 'someone', '@mename still here');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  await win.waitForTimeout(2000);
  assert.equal(await win.textContent('#bellBtn .mb-count'), '1', 'only bravo\'s mention');
  assert.equal((await alertOf('alpha')).level, '');
  await win.click(at);   // back on
  assert.equal(await win.$eval(at, b => b.classList.contains('off')), false);
  assert.equal(await win.evaluate(() => localStorage.getItem('kickMultiview.mentMuted')), '[]');
  await clickBar('bravo');   // seen
  await win.click('#bellBtn');
  await win.click('#bellClear');
  assert.match(await win.textContent('#bellList'), /^Nothing yet/);
  await win.keyboard.press('Escape');
});

test('chat bots on the list never count as a mention, a name that only contains one does, and the list is yours to change', T, async () => {
  const count = () => win.evaluate(() => { const c = document.querySelector('#bellBtn .mb-count'); return c.hidden ? '' : c.textContent; });
  const stored = () => win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(n => /^(mention|reply|word)$/.test(n.kind)).map(m => m.sender));
  await say('bravo', 'BotRix', '@mename thanks for the follow!');
  await say('bravo', 'griddlebot', '@mename won the giveaway');
  await say('bravo', 'botrix_fan', '@mename hi from a fan');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  await win.waitForTimeout(2000);
  assert.equal(await count(), '1', 'only the fan');
  assert.deepEqual(await stored(), ['botrix_fan'], 'the bots aren\'t in the mentions history');
  await clickBar('bravo');

  // taken off the app's list in Chat > Chat bots: it alerts again, the others still don't
  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  await win.click('[data-list=mbots] .st-chip:has-text("botrix") button');
  await win.keyboard.press('Escape');
  const saved = await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).mention.bots);
  assert.ok(!saved.includes('botrix') && saved.includes('nightbot'));
  await say('bravo', 'nightbot', '@mename still a bot');
  await say('bravo', 'BotRix', '@mename one more');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  assert.deepEqual((await stored()).slice(0, 2), ['BotRix', 'botrix_fan']);
  await clickBar('bravo');

  // Reset: the built-in list again
  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  await win.click('[data-reset=mbots]');
  await win.keyboard.press('Escape');
  await say('bravo', 'BotRix', '@mename last one');
  await win.waitForTimeout(2500);
  assert.equal(await count(), '');
  await win.click('#bellBtn');
  await win.click('#bellClear');
  await win.keyboard.press('Escape');
});

test('your own words count as mentions; the bell lists them and All notifications opens the history', T, async () => {
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=names]');
  await win.fill('#mentWordIn', 'Pear'); await win.press('#mentWordIn', 'Enter');
  await win.fill('#mentWordIn', 'big boss'); await win.click('#mentWordAdd');
  await win.fill('#mentWordIn', 'PEAR'); await win.click('#mentWordAdd');   // already there
  assert.deepEqual(await win.$$eval('#mentWords .st-chip > span', e => e.map(x => x.textContent)), ['Pear', 'big boss']);
  assert.equal(await win.evaluate(() => localStorage.getItem('kickMultiview.mentWords')), '["Pear","big boss"]');
  await win.keyboard.press('Escape');
  await ready();                                   // the chats look again with the new words
  await say('bravo', 'someone', 'pears are tasty');
  await say('bravo', 'someone', 'is pear on tonight?');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '1');
  assert.equal((await alertOf('bravo')).level, 'al-1', 'it lights the chat like a mention');
  for (let i = 0; i < 5; i++) await say('alpha', 'fan' + i, `hey big boss ${i}`);
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').textContent === '6');
  await win.click('#bellBtn');
  assert.equal(await win.$$eval('#bellList .mp-row.unread', r => r.length), 6, 'marked new while it shows them');
  await win.click('#bellPanel .nc-tabs [data-tab=mentions]');
  assert.equal(await win.$$eval('#bellList .mp-row', r => r.length), 6);
  assert.equal(await win.textContent('#bellList .mp-row .mp-kind'), 'Word: big boss');
  await win.waitForFunction(() => document.querySelector('#bellBtn .mb-count').hidden);   // the ones shown are seen
  assert.equal(await win.textContent('#bellAll'), 'All notifications (6) ›');
  await win.click('#bellAll');
  assert.ok(await win.isVisible('#noteDlg'));
  assert.equal(await win.textContent('#noteDlg .nc-tabs .on span'), 'Mentions', 'on the bell\'s tab');
  assert.equal(await win.$$eval('#nhList .mp-row', r => r.length), 6);
  assert.equal(await win.$eval('#nhList .mp-row:has-text("someone") .mp-body', e => e.innerHTML), 'is <mark>pear</mark> on tonight?');
  await win.click('#nhList .mp-row:has-text("someone")');
  assert.ok(await win.isHidden('#noteDlg'), 'a mention shows its chat');
  // tidy up for the next tests
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=names]');
  await win.click('#mentWords .st-chip button'); await win.click('#mentWords .st-chip button');
  assert.equal(await win.evaluate(() => localStorage.getItem('kickMultiview.mentWords')), '[]');
  await win.keyboard.press('Escape');
  await clickBar('alpha'); await clickBar('bravo');
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
  // listed in Settings > Spam alerts > History, with its score
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=history]');
  assert.equal(await win.$$eval('#spamHist .sh-row', r => r.length), 1, 'only the flagged one');
  assert.match(await win.textContent('#spamHist .sh-row'), /newacct\s*\d+ \/ 5 points.*alpha.*botkiva com.*Disguised link: botkiva com \+3/s);
  await win.click('#spamHist .sh-row');
  assert.ok(await win.$eval('#settingsDlg', e => e.hidden), 'clicking it shows the chat');
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamHistClear');
  assert.equal(await win.textContent('#spamHist'), 'Nothing flagged yet.');
  assert.equal(await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifications')).filter(n => n.kind === 'spam').length), 0);
  await win.click('#spamTabs [data-t=alerts]');
  await win.keyboard.press('Escape');
});

// Kick's ban shortcut on a sender's name: Cmd + Shift + Click on a Mac, Ctrl + Shift + Click on Windows and Linux.
const banClick = (ch, sender, keys) => inChat(ch, ([s, keys]) => {
  const name = [...document.querySelectorAll('.row b')].reverse().find(b => b.textContent === s);
  const o = { bubbles: true, cancelable: true, shiftKey: true, ...keys };
  name.dispatchEvent(new PointerEvent('pointerdown', o));
  name.dispatchEvent(new MouseEvent('mousedown', o));
  name.dispatchEvent(new MouseEvent('mouseup', o));
  name.dispatchEvent(new MouseEvent('click', o));
}, [sender, keys]);
const spamCount = () => win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(n => n.kind === 'spam').length);

test('banning a spammer with the mod shortcut clears the alert, even when the page stops the click', T, async () => {
  await clickBar('alpha');
  await say('alpha', 'promobot', 'hq ai stream upgrades botkiva com zero cost upgrades today');
  await win.waitForFunction(() => document.querySelector('#stage .win.chat.al-1'));
  assert.equal((await alertOf('alpha')).level, 'al-1');
  await inChat('alpha', () => { window.blockClicks = true; });
  await banClick('alpha', 'promobot', { metaKey: true });
  await win.waitForFunction(() => !document.querySelector('#stage .win.chat.al-1'));
  await inChat('alpha', () => { window.blockClicks = false; });
});

test('a moderator removing a flagged message doesn\'t raise the alert again', T, async () => {
  const flagged = await spamCount();
  await inChat('alpha', () => {
    const row = [...document.querySelectorAll('.row')].find(r => r.textContent.includes('upgrades today'));
    row.querySelector('span').textContent += ' (Deleted)';
  });
  await say('alpha', 'promobot', 'Deleted by a moderator');
  await win.waitForTimeout(3000);
  assert.equal((await alertOf('alpha')).level, '');
  assert.equal(await spamCount(), flagged, 'nothing new flagged');
});

test('a ban in the same moment the spam arrives still counts as seeing it', T, async () => {
  await inChat('alpha', () => {
    const d = document.createElement('div'); d.className = 'row';
    d.innerHTML = '<b>fastbot</b>: <span>cheap viewers at quickgrow com zero cost boost upgrades</span>';
    document.getElementById('chat').appendChild(d);
  });
  await banClick('alpha', 'fastbot', { ctrlKey: true });   // before the app next looks at the chat
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(h => h.kind === 'spam' && h.sender === 'fastbot'));
  await win.waitForTimeout(500);
  assert.match(await tagOf('alpha', 'quickgrow'), /Likely spam/, 'still flagged and tagged');
  assert.equal((await alertOf('alpha')).level, '', 'but the window isn\'t left lit');
});

test('abuse: insults in a chat you moderate are tagged ABUSIVE, and a ban shown after them isn\'t a new message', T, async () => {
  await clickBar('alpha');
  const flagged = await spamCount();
  await say('alpha', 'troll', 'ur a whore');
  await say('alpha', 'troll', 'your a bish');
  await win.waitForFunction(n => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(h => h.kind === 'spam').length >= n + 2, flagged);
  assert.match(await tagOf('alpha', 'ur a whore'), /^Abusive \(5 points, 5 needed\):\n• Insult aimed at someone: "ur a whore" \(\+4\)\n• Started chatting/);
  assert.match(await tagOf('alpha', 'your a bish'), /Keeps at it: 1 more abusive message/);
  assert.equal(await inChat('alpha', () => {
    const row = [...document.querySelectorAll('.row')].find(r => r.textContent.includes('ur a whore'));
    return getComputedStyle(row.querySelector('[data-kmv-spam]'), '::after').content;
  }), '"ABUSIVE"');
  assert.match(await win.textContent('#msg'), /Abusive message in alpha's chat/);
  const notes = await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifications')).filter(n => n.kind === 'spam' && n.sender === 'troll'));
  assert.deepEqual(notes.map(n => n.abuse), [true, true]);
  // a moderator bans them: the chat adds a note after their messages
  await inChat('alpha', () => [...document.querySelectorAll('.row')].filter(r => r.querySelector('b').textContent === 'troll')
    .forEach(r => { r.querySelector('span').textContent += ' (Banned)'; }));
  await win.waitForTimeout(3000);
  assert.equal(await spamCount(), flagged + 2, 'nothing new flagged');
  await clickBar('alpha');
});

test('spam alerts check what the site sends, drawn or not (behind ALL, scrolled up): at once, and its line in the chat, drawn later, is tagged but not counted again', T, async () => {
  await clickBar('alpha');
  const flagged = await spamCount(), notes = sender => win.evaluate(s => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(n => n.kind === 'spam' && n.sender === s).length, sender);
  // heard by ALL from Kick while the chat's page, out of sight behind ALL, hasn't drawn it
  await win.evaluate(() => window.spamFromFeed('alpha', 'hiddenbot', 'hq ai stream upgrades nopelink com zero cost upgrades'));
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(n => n.kind === 'spam' && n.sender === 'hiddenbot'));
  assert.equal((await alertOf('alpha')).level, 'al-1', 'the window lights up straight away');
  // the chat shown again draws it: tagged there too, not a second alert
  await say('alpha', 'hiddenbot', 'hq ai stream upgrades nopelink com zero cost upgrades');
  await win.waitForTimeout(3000);
  assert.match(await tagOf('alpha', 'nopelink'), /Likely spam.*Disguised link: nopelink com/s);
  assert.equal(await notes('hiddenbot'), 1, 'counted once');
  // the other way round: drawn by the chat first, then heard by ALL
  await say('alpha', 'pagebot', 'cheap viewers at growfast com zero cost boost upgrades');
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(n => n.kind === 'spam' && n.sender === 'pagebot'));
  await win.evaluate(() => window.spamFromFeed('alpha', 'pagebot', 'cheap viewers at growfast com zero cost boost upgrades'));
  await win.waitForTimeout(500);
  assert.equal(await notes('pagebot'), 1, 'counted once');
  // without ALL: every chat the alerts read hands over its messages, so one its page hasn't drawn (scrolled up) is checked too
  for (const ch of ['alpha', 'bravo']) await win.waitForFunction(async ch => {
    const w = window.openWins().find(o => o.kind === 'chat' && o.channel === ch);
    return w.feedRead && await w.view.executeJavaScript('!!(window.__kmvFeed && window.__kmvFeed.on)');
  }, ch, { polling: 500 });
  await feed('alpha', kickMsg('unseenbot', 'hq ai stream upgrades unseenlink com zero cost upgrades'));
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(n => n.kind === 'spam' && n.sender === 'unseenbot'));
  // its connection works, so its page reads nothing more itself: a line flagged from the connection is tagged by its id there
  await win.waitForFunction(() => window.chatFeed.live('alpha'));
  assert.equal(await inChat('alpha', () => window.__kmvMention.screen()), false, 'its screen reader asleep');
  await feed('alpha', kickMsg('idbot', 'hq ai stream upgrades idlink com zero cost upgrades', { id: 'spam-id-1' }));
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(n => n.kind === 'spam' && n.sender === 'idbot'));
  await inChat('alpha', () => { const d = document.createElement('div'); d.className = 'row'; d.id = 'spam-id-1'; d.innerHTML = '<b>idbot</b>: <span>(drawn its own way) idlink</span>'; document.getElementById('chat').appendChild(d); });
  await win.waitForFunction(() => window.openWins().find(o => o.kind === 'chat' && o.channel === 'alpha').view.executeJavaScript('!!document.querySelector("#spam-id-1 [data-kmv-spam]")'), null, { polling: 500 });
  // spam alerts off: what ALL hears isn't checked
  await win.evaluate(() => window.openSettings('spam'));
  await win.uncheck('#spamOn');
  await win.keyboard.press('Escape');
  await win.evaluate(() => window.spamFromFeed('alpha', 'offbot', 'hq ai stream upgrades offlink com zero cost upgrades'));
  await win.waitForTimeout(500);
  assert.equal(await notes('offbot'), 0);
  assert.equal(await spamCount(), flagged + 4);
  await win.evaluate(() => window.chatFeed.failed('alpha'));   // (its screen read again, for the tests after this one)
  assert.equal(await inChat('alpha', () => window.__kmvMention.screen()), true);
  await win.evaluate(() => window.openSettings('spam'));
  await win.check('#spamOn');
  await win.keyboard.press('Escape');
  await clickBar('alpha');
});

test('mentions from the site\'s connection: at once, drawn or not, once each (also when the page read it first); a reply; never yours or a bot\'s; its screen read again when the connection stops working', T, async () => {
  await clickBar('alpha'); await clickBar('bravo');
  await win.waitForFunction(() => window.openWins().find(o => o.kind === 'chat' && o.channel === 'bravo').feedRead, null, { polling: 500 });
  const mine = () => notesOf('mention').then(l => l.filter(n => n.channel === 'bravo').length);
  const before = await mine();
  // read by the page first (its connection hasn't brought anything yet), then by the connection: one alert
  await say('bravo', 'earlybird', '@mename the page saw this first');
  await win.waitForFunction(n => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(x => x.kind === 'mention' && x.channel === 'bravo').length > n, before);
  await feed('bravo', kickMsg('earlybird', '@mename the page saw this first'));
  await win.waitForFunction(() => window.chatFeed.live('bravo'));
  assert.equal(await mine(), before + 1, 'once');
  // the connection's alone (the page, scrolled up or behind ALL, never draws it): at once
  await feed('bravo', kickMsg('unseenfan', 'hey @mename, look at this'));
  await win.waitForFunction(n => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(x => x.kind === 'mention' && x.channel === 'bravo').length > n, before + 1);
  assert.deepEqual(await alertOf('bravo'), { level: 'al-1', color: '#e8b84a' });
  const id = 'f' + frameN;
  // the same message again (the connection re-sends), and the page drawing it later: still once
  await win.evaluate(([raw]) => window.chatFeed.fromFeed('bravo', { site: 'kick', kind: 'message', id: raw, sender: 'unseenfan', login: 'unseenfan', parts: [{ text: 'hey @mename, look at this' }], t: Date.now() }), [id]);
  await say('bravo', 'unseenfan', 'hey @mename, look at this');
  await win.waitForTimeout(2500);
  assert.equal(await mine(), before + 2);
  assert.equal(await win.evaluate(id => window.chatFeed.decided('bravo', id).v, id), 'alerted', 'what was decided, for Why didn\'t this alert?');
  // a reply to you; your own message and a chat bot's never
  await feed('bravo', kickMsg('replyfox', 'yes, tonight', { type: 'reply', metadata: { original_message: { id: 'o1', content: 'on later?' }, original_sender: { username: 'mename' } } }));
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(x => x.kind === 'reply' && x.sender === 'replyfox' && x.quoted === 'on later?'));
  await feed('bravo', kickMsg('mename', '@mename talking to myself'), kickMsg('Nightbot', '@mename follow the rules'), kickMsg('someone', 'just chatting'));
  await win.waitForTimeout(2000);
  assert.equal(await mine(), before + 2, 'not yours, not a bot\'s, not one without your name');
  assert.deepEqual([await win.evaluate(id => window.chatFeed.decided('bravo', id).v, 'f' + (frameN - 2)), await win.evaluate(id => window.chatFeed.decided('bravo', id).v, 'f' + frameN)], ['own', 'nomatch']);
  // the connection stopped working (its page drew new lines, it brought none: chat/all-health.js): its page reads its screen again
  // (rows as Kick's are, so the check sees them: a line each time it checks)
  await win.evaluate(async () => {
    const w = window.openWins().find(o => o.kind === 'chat' && o.channel === 'bravo');
    for (let i = 0; i < 3; i++){
      await w.view.executeJavaScript(`(() => { const d = document.createElement('div'); d.className = 'row'; d.dataset.index = '${900 + i}'; d.innerHTML = '<b>x</b>: <span>line ${i}</span>'; document.getElementById('chat').appendChild(d); })()`);
      await window.allHealth.checkAll();
    }
  });
  await win.waitForFunction(() => !window.chatFeed.live('bravo'));
  assert.equal(await inChat('bravo', () => window.__kmvMention.screen()), true, 'awake');
  await inChat('bravo', () => document.querySelectorAll('#chat [data-index]').forEach(r => r.remove()));   // (Kick-shaped rows: the page is read as Kick's then, for the tests after this)
  await clickBar('bravo');
  await ready();
  await say('bravo', 'afterfox', '@mename read from the page again');
  await win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').some(x => x.kind === 'mention' && x.sender === 'afterfox'));
  // and for a while its connection doesn't take over again
  await feed('bravo', kickMsg('laterfox', 'hello'));
  await win.waitForTimeout(500);
  assert.equal(await win.evaluate(() => window.chatFeed.live('bravo')), false);
  await clickBar('bravo');
  assert.deepEqual(pageErrors, []);
});

test('spam alerts: chat bots on the list are skipped, and History can add an account to it', T, async () => {
  await clickBar('alpha'); await clickBar('bravo');
  const timer = 'cheap viewers at promo-site com, zero cost boost';
  await say('bravo', 'NightBot', timer);
  await say('alpha', 'NightBot', timer);
  await win.waitForTimeout(2500);
  assert.equal(await tagOf('alpha', 'promo-site'), null, 'a bot on the built-in list');
  assert.equal((await alertOf('alpha')).level, '');
  // a link alone isn't enough, but with the same message in another open chat it would be: the bot's copy doesn't count
  await say('bravo', 'NightBot', 'new video up at promo-site.live tonight');
  await win.waitForTimeout(2500);
  await say('alpha', 'fan42', 'new video up at promo-site.live tonight');
  await win.waitForTimeout(2500);
  assert.equal(await tagOf('alpha', 'promo-site.live'), null, 'its repeats don\'t count against anyone');
  await say('alpha', 'timerbot', 'hq ai stream upgrades botkiva com zero cost upgrades, ask timerbot');
  await win.waitForFunction(() => document.querySelector('#stage .win.chat.al-1'));
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=history]');
  await win.click('#spamHist .sh-row .sh-ign');
  assert.equal(await win.$eval('#settingsDlg', e => e.hidden), false, 'the button doesn\'t open the chat');
  assert.match(await win.textContent('#msg'), /timerbot added to the chat bot list/);
  assert.equal(await win.textContent('#spamHist .sh-acts'), 'On the chat bot list: no longer flagged');
  assert.match(await win.textContent('#msg'), /never flagged as spam or counted as a mention/, 'the list is shared with mentions');
  assert.ok((await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).mention.bots)).includes('timerbot'));
  await win.keyboard.press('Escape');
  await clickBar('alpha');
  await say('alpha', 'TimerBot', 'hq ai stream upgrades botkiva com zero cost upgrades, again from timerbot');
  await win.waitForTimeout(2500);
  assert.equal(await tagOf('alpha', 'again from timerbot'), null, 'any case');
  assert.equal((await alertOf('alpha')).level, '');
  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  await win.click('[data-reset=mbots]');
  assert.equal(await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).mention.bots), null);
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=history]');
  assert.equal(await win.textContent('#spamHist .sh-acts'), 'Not spam: ignore this account', 'off the list again');
  await win.click('#spamHistClear');
  await win.click('#spamTabs [data-t=alerts]');
  await win.keyboard.press('Escape');
});

test('spam alerts off: nothing is checked or tagged', T, async () => {
  await win.evaluate(() => window.openSettings('spam'));
  await win.uncheck('#spamOn');
  await win.keyboard.press('Escape');
  await clickBar('alpha');
  await say('alpha', 'otherbot', 'cheap viewers at promo-site com, zero cost boost');
  await win.waitForTimeout(2500);
  assert.equal((await alertOf('alpha')).level, '');
  assert.equal(await tagOf('alpha', 'promo-site'), null);
  assert.deepEqual(pageErrors, []);
});

test('support alerts: a community gift in a chat glows its window and is listed once in the bell; under the smallest set, nothing', T, async () => {
  await win.evaluate(() => window.openSettings('support'));
  await win.click('label:has(#supportOn)');
  await win.keyboard.press('Escape');
  await ready();
  const notice = (ch, text) => inChat(ch, t => { const d = document.createElement('div'); d.className = 'row'; d.textContent = t; document.getElementById('chat').appendChild(d); }, text);
  await notice('bravo', 'quietkoala sent 50');                                   // under 100 KICKs
  await notice('bravo', 'giftfox88 gifted 5 subscriptions to the community!');
  await notice('bravo', 'giftfox88 gifted a sub to tinycomet');               // one of those five
  await win.waitForFunction(() => document.querySelector('#stage .win.chat.al-brief'), null, { timeout: 10000 });
  await win.click('#bellBtn');
  await win.waitForSelector('#bellList .nc-row.k-support');
  assert.deepEqual(await win.$$eval('#bellList .nc-row.k-support', l => l.map(r => r.querySelector('.mp-top b').textContent + ' ' + r.querySelector('.mp-body').textContent)),
    ['giftfox88 gifted 5 subs']);
  await win.keyboard.press('Escape');
  assert.deepEqual(pageErrors, []);
});

test('support alerts: a raid banner over a chat glows its window and is listed once, also as its viewers count up', T, async () => {
  await win.evaluate(() => window.openSettings('support'));
  if (!(await win.isChecked('#supportOn'))) await win.click('label:has(#supportOn)');
  await win.keyboard.press('Escape');
  await ready();
  // Kick's raid banner: above the chat's messages
  const banner = (ch, text) => inChat(ch, t => {
    let b = document.getElementById('raid-banner');
    if (!b){ b = document.createElement('div'); b.id = 'raid-banner'; document.body.prepend(b); }
    b.textContent = t;
  }, text);
  const raids = () => win.$$eval('#bellList .nc-row.k-support', l => l.map(r => r.querySelector('.mp-top b').textContent + ' ' + r.querySelector('.mp-body').textContent).filter(t => /raided/.test(t)));
  await banner('alpha', 'pixelpear is hosting your channel with 120 viewers');
  await win.waitForFunction(() => document.querySelector('#stage .win.chat.al-brief'), null, { timeout: 10000 });
  await banner('alpha', 'pixelpear is hosting your channel with 126 viewers');
  await win.waitForTimeout(4000);                                                // the app asks the chats every few seconds
  await win.click('#bellBtn');
  await win.waitForSelector('#bellList .nc-row.k-support');
  assert.deepEqual(await raids(), ['pixelpear raided with 120 viewers']);
  await win.keyboard.press('Escape');
  assert.deepEqual(pageErrors, []);
});

test('support alerts from the site\'s connection: Kicks, gifted subs (once, also named two ways), a raid (once), a resub; under the smallest set, yours, and the page\'s line for one already said: nothing', T, async () => {
  await win.evaluate(() => window.openSettings('support'));
  if (!(await win.isChecked('#supportOn'))) await win.click('label:has(#supportOn)');
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=names]');
  if ((await win.inputValue('#mentUser')) !== 'mename'){ await win.fill('#mentUser', 'mename'); await win.press('#mentUser', 'Enter'); }   // (your own)
  await win.keyboard.press('Escape');
  await ready();
  const said = () => notesOf('support').then(l => l.filter(n => n.channel === 'bravo').map(n => `${n.sender} ${n.body}`));
  const before = await said();
  await feed('bravo',
    kickFrame('KicksGifted', { gift_transaction_id: 'k1', sender: { username: 'kicksender' }, gift: { name: 'Hell Yeah', amount: 150 } }, 'channel_1'),
    kickFrame('KicksGifted', { gift_transaction_id: 'k2', sender: { username: 'smallsender' }, gift: { name: 'Skull Emoji', amount: 50 } }, 'channel_1'),
    kickFrame('KicksGifted', { gift_transaction_id: 'k3', sender: { username: 'mename' }, gift: { name: 'Full Send', amount: 500 } }, 'channel_1'),
    kickFrame('GiftedSubscriptionsEvent', { correlation_id: 'pi_9', gifter_username: 'giftowl', gifted_usernames: ['a1', 'b2', 'c3'], gifted_total: 3 }, 'chatroom_1'),
    kickFrame('LuckyUsersWhoGotGiftSubscriptionsEvent', { correlation_id: 'pi_9', gifter_username: 'giftowl', usernames: ['a1', 'b2', 'c3'] }),
    kickFrame('App\\Events\\StreamHostedEvent', { message: { id: 'h1', numberOfViewers: 57 }, user: { username: 'mossyhost' } }, 'chatrooms.1'),
    kickFrame('App\\Events\\StreamHostEvent', { host_username: 'mossyhost', number_viewers: 57 }),
    kickFrame('App\\Events\\SubscriptionEvent', { username: 'loyalfern', months: 5 }));
  await win.waitForFunction(n => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(x => x.kind === 'support' && x.channel === 'bravo').length >= n + 4, before.length);
  await win.waitForTimeout(1000);
  assert.deepEqual((await said()).filter(x => !before.includes(x)).sort(), ['giftowl gifted 3 subs', 'kicksender sent 150 KICKs', 'loyalfern subscribed for 5 months', 'mossyhost raided with 57 viewers']);
  // the page draws one of them later (its screen reads it): not again
  await inChat('bravo', () => { const d = document.createElement('div'); d.className = 'row'; d.textContent = 'kicksender sent 150'; document.getElementById('chat').appendChild(d); });
  await win.waitForTimeout(4000);
  assert.equal((await said()).length, before.length + 4);
  assert.deepEqual(pageErrors, []);
});
