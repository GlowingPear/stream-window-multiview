// Logins, live alerts and notifications in the real desktop app. Who's logged in, who's live and the
// moderator check are answered by the test; nothing goes to Kick, Twitch or YouTube.
const test = require('node:test');
const { launchApp, winSel, nameIs, inView, viewLoaded, assert, openChannel, setMode, typeChannel } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => {
  a = await launchApp({ storage: { 'kickMultiview.saved': ['alpha', 'bravo', 'tw:charlie'] } });
  await a.app.evaluate(({ ipcMain, Notification }) => {
    const s = globalThis.__t = { kick: 'someone', twitch: 'tw_user', youtube: true, logouts: [], notes: [], logins: [] };
    ipcMain.removeHandler('me:detect'); ipcMain.handle('me:detect', () => s.kick || null);
    ipcMain.removeHandler('accounts:status'); ipcMain.handle('accounts:status', () => ({ kick: s.kick || null, twitch: s.twitch || null, youtube: s.youtube }));
    ipcMain.removeHandler('account:logout'); ipcMain.handle('account:logout', (_e, p) => { s.logouts.push(p); s[p] = p === 'youtube' ? false : ''; return true; });
    ipcMain.removeHandler('account:login'); ipcMain.handle('account:login', (_e, p) => { s.logins.push(p); });
    // desktop notifications are recorded instead of shown
    Notification.isSupported = () => true;          // (Linux test machines have no notification service)
    Notification.prototype.show = function () { s.notes.push({ title: this.title, body: this.body }); globalThis.__lastNote = this; };
  });
  // the app's own live checks can't reach the sites here: only the test says who's live
  await a.app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows().find(w => /index\.html/.test(w.webContents.getURL()) && !/role=streams/.test(w.webContents.getURL())).webContents;
    const send = wc.send.bind(wc);
    wc.send = (ch, ...args) => { if (ch !== 'live:status') send(ch, ...args); };
    globalThis.__sendLive = snap => send('live:status', snap);
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const st = () => a.app.evaluate(() => globalThis.__t);
const row = (where, p) => `${where} .am-row[data-p=${p}]`;

test('the Accounts menu shows who\'s logged in; Log out and Switch ask first', T, async () => {
  await a.win.click('#loginBtn');
  await a.win.waitForFunction(() => /someone/.test(document.querySelector('#accountMenu .am-row[data-p=kick] .am-st').textContent));
  assert.equal((await a.win.textContent('#loginBtn')).trim(), 'Logins', 'the button says Logins, not a username');
  assert.ok(await a.win.$eval('#loginBtn', b => b.classList.contains('has-acct')), 'green while logged in');
  assert.match(await a.win.$eval('#loginBtn', b => b.title || b.dataset.tipTitle), /Kick \(someone\), Twitch \(tw_user\), YouTube/, 'its tooltip names the logins');
  assert.match(await a.win.textContent(row('#accountMenu', 'twitch') + ' .am-st'), /Logged in as tw_user/);
  assert.ok(await a.win.isHidden(row('#accountMenu', 'kick') + ' .am-in'), 'no Log in when logged in');

  await a.win.click(row('#accountMenu', 'twitch') + ' .am-out');
  assert.equal(await a.win.textContent('#askTitle'), 'Log out of Twitch?');
  await a.win.click('#askDlg .ask-no');
  assert.deepEqual((await st()).logouts, [], 'Cancel: still logged in');
  await a.win.click('#loginBtn');
  await a.win.click(row('#accountMenu', 'twitch') + ' .am-out');
  await a.win.click('#askDlg .ask-yes');
  assert.deepEqual((await st()).logouts, ['twitch']);
  assert.match(await a.win.textContent('#msg'), /Logged out of Twitch/);
  // kept under the bell (App), with Log in
  await a.win.click('#bellBtn');
  await a.win.click('#bellPanel .nc-tabs [data-tab=app]');
  await a.win.click('#bellList .nc-row:has-text("Logged out of Twitch") button:text-is("Log in")');
  assert.equal((await st()).logins.at(-1), 'twitch', 'Log in from the bell');
  assert.ok(await a.win.isHidden('#bellPanel'));
  await a.win.click('#loginBtn');
  assert.match(await a.win.textContent(row('#accountMenu', 'twitch') + ' .am-st'), /Not logged in/);

  await a.win.click(row('#accountMenu', 'kick') + ' .am-sw');
  assert.equal(await a.win.textContent('#askTitle'), 'Switch Kick account?');
  await a.win.click('#askDlg .ask-yes');
  await a.win.waitForFunction(() => true);
  const s = await st();
  assert.deepEqual([s.logouts.at(-1), s.logins.at(-1)], ['kick', 'kick'], 'Switch logs out, then opens the login');

  // the menu bar's Account menu does the same
  await a.win.evaluate(() => window.kmv.accountsState({ kick: '', twitch: '', youtube: true }));
  await a.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.label === 'Account').submenu.items.find(x => /Log in to Twitch/.test(x.label)).click());
  await a.win.waitForTimeout(200);
  assert.equal((await st()).logins.at(-1), 'twitch');
});

test('a new login reloads that site\'s chats and fills in your username; "Forget my login" is saved', T, async () => {
  await setMode(a.win, 'chat');
  await openChannel(a.win, 'tw:charlie');
  await a.win.waitForSelector(`${winSel('charlie', 'chat')} webview`);
  await viewLoaded(a.win, 'charlie', 'chat', /chat/);
  await inView(a.win, 'charlie', 'chat', () => { window.__before = 1; });
  await a.app.evaluate(() => { globalThis.__t.twitch = 'new_name'; });
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('account:changed', { platform: 'twitch', loggedOut: false })));
  const end = Date.now() + 10000;
  while (await inView(a.win, 'charlie', 'chat', () => !!window.__before).catch(() => true)) { if (Date.now() > end) throw new Error('the chat didn\'t reload'); await new Promise(r => setTimeout(r, 200)); }
  await a.win.click('#loginBtn');
  await a.win.waitForFunction(() => /new_name/.test(document.querySelector('#accountMenu .am-row[data-p=twitch] .am-st').textContent));
  await a.win.keyboard.press('Escape');

  await a.win.evaluate(() => window.openSettings('accounts'));
  await a.win.check('#settingsDlg .am-forget input[data-f=youtube]');
  assert.match(await a.win.textContent('#msg'), /YouTube login will be wiped/);
  assert.equal((await a.win.evaluate(() => window.kmv.securityGet())).forget.youtube, true, 'kept by the app');
  await a.win.uncheck('#settingsDlg .am-forget input[data-f=youtube]');
  await a.win.keyboard.press('Escape');
  await a.win.click(`${winSel('charlie', 'chat')} [data-a=close]`);
  await setMode(a.win, 'both');
});

test('Saved channels show who\'s live, with bells, auto-open and Open live', T, async () => {
  await setMode(a.win, 'both');
  const now = Date.now();
  const send = snap => a.app.evaluate((_e, snap) => globalThis.__sendLive(snap), snap);
  await send({ alpha: { live: true, viewers: 1234, title: 'Big match', category: 'Games', checked: now }, bravo: { live: false, checked: now }, 'tw:charlie': { live: false, checked: now } });
  await a.win.click('#savedBtn');
  assert.match(await a.win.textContent('#savedList'), /Live now · 1.*alpha.*Games · Big match.*1\.2K.*Offline · 2.*bravo/s);
  assert.match(await a.win.textContent('#liveStatus'), /1 live now · checked/);
  assert.match(await a.win.textContent('#savedBtn'), /1/, 'the Saved button counts who\'s live');
  assert.equal(await a.win.textContent('#openLive'), 'Open 1 live');
  await a.win.click('#savedBtn .sv-badge');
  assert.equal(await a.win.isHidden('#savedPanel'), true, 'clicking the live count closes it too');
  await a.win.click('#savedBtn .sv-badge');
  assert.equal(await a.win.isVisible('#savedPanel'), true, '…and opens it');

  await a.win.click(`#savedList .sv:has(.nm${nameIs('bravo')}) .bell`);
  assert.deepEqual(JSON.parse(await a.win.evaluate(() => localStorage.getItem('kickMultiview.notifyOff'))), ['bravo'], 'no alerts for bravo');
  await a.win.uncheck('#notifyAll');
  assert.ok(await a.win.isDisabled(`#savedList .sv:has(.nm${nameIs('alpha')}) .bell`), 'with alerts off the bells are off');
  await a.win.check('#notifyAll');

  await a.win.click(`#savedList .sv:has(.nm${nameIs('bravo')}) .auto`);
  assert.deepEqual(JSON.parse(await a.win.evaluate(() => localStorage.getItem('kickMultiview.autoOpen'))), ['bravo']);
  await a.win.click('#openLive');
  assert.equal(await a.win.locator(winSel('alpha')).count(), 1, 'Open live opens the live ones');
  await a.win.keyboard.press('Escape');

  // bravo goes live: it opens by itself, once
  await send({ alpha: { live: true, checked: now }, bravo: { live: true, viewers: 5, checked: now + 1 }, 'tw:charlie': { live: false, checked: now } });
  await a.win.waitForSelector(winSel('bravo'));
  assert.match(await a.win.textContent('#msg'), /Opened bravo \(just went live\)/);
  await a.win.click(`${winSel('bravo')} [data-a=close]`);
  await send({ alpha: { live: true, checked: now }, bravo: { live: true, checked: now + 2 }, 'tw:charlie': { live: false, checked: now } });
  await a.win.waitForTimeout(300);
  assert.equal(await a.win.locator(winSel('bravo')).count(), 0, 'not again while it stays live');

  // "just went live" and clicking a live notification
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('live:went-live', 'tw:charlie', { live: true })));
  await a.win.waitForFunction(() => /charlie just went live on Twitch/i.test(document.getElementById('msg').textContent));
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('open-channel', 'tw:charlie')));
  await a.win.waitForSelector(winSel('charlie'));
  // both kept under the bell (Live): the one that opened by itself marked so
  assert.deepEqual(await a.win.evaluate(() => window.smvNotes.notes.filter(n => n.kind === 'live').map(n => [n.channel, !!n.auto])), [['tw:charlie', false], ['bravo', true]]);
  await a.win.click('#bellBtn');
  await a.win.click('#bellPanel .nc-tabs [data-tab=live]');
  assert.equal(await a.win.textContent('#bellList .nc-row:has-text("charlie") .nc-acts'), 'Already open');
  assert.match(await a.win.textContent('#bellList .nc-row:has-text("bravo")'), /opened by itself/);
  await a.win.keyboard.press('Escape');
  await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes');
});

test('In Auto layout, a channel that opens by itself is fitted in as the last stream (Settings > Layouts)', T, async () => {
  const now = Date.now();
  const send = (bravo, t) => a.app.evaluate((_e, snap) => globalThis.__sendLive(snap), { alpha: { live: true, checked: now }, bravo: { live: bravo, checked: now + t }, 'tw:charlie': { live: false, checked: now } });
  const rect = (title, kind) => a.win.$eval(winSel(title, kind), e => ['left', 'top', 'width', 'height'].map(k => parseFloat(e.style[k])));
  const rects = () => Promise.all([rect('alpha'), rect('charlie'), rect('alpha', 'chat'), rect('charlie', 'chat')]);
  const goesLive = async t => { await send(false, t); await send(true, t + 1); await a.win.waitForSelector(winSel('bravo')); };
  for (const ch of ['alpha', 'tw:charlie']){ await openChannel(a.win, ch); }
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu [data-l=auto]');

  // off (the default): the others stay where they are
  let before = await rects();
  await goesLive(10);
  assert.deepEqual(await rects(), before, 'nothing moved');

  // on: Auto layout is redone with bravo after the others
  await a.win.click(`${winSel('bravo')} [data-a=close]`); await a.win.click(`${winSel('bravo', 'chat')} [data-a=close]`);
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu [data-l=auto]');
  await a.win.evaluate(() => openSettings('layouts'));
  await a.win.check('#autoFit');
  await a.win.keyboard.press('Escape');
  before = await rects();
  await goesLive(20);
  await a.win.waitForTimeout(300);
  const [al, ch, alc, chc] = await rects(), br = await rect('bravo'), brc = await rect('bravo', 'chat');
  assert.notDeepEqual([al, ch, alc, chc], before, 'the layout was redone');
  const at = r => r[1] * 10000 + r[0];                   // reading order: rows, then left to right
  assert.ok(at(al) < at(ch) && at(ch) < at(br), `streams in order alpha, charlie, bravo (${JSON.stringify([al, ch, br])})`);
  assert.ok(at(alc) < at(chc) && at(chc) < at(brc), 'chats in the same order');
  assert.ok(al[0] + al[2] <= alc[0] && br[0] + br[2] <= alc[0], 'streams left of the chats');
  await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes');
});

test('mention and spam desktop notifications, and clicking one shows that chat', T, async () => {
  await a.win.evaluate(() => window.kmv.notifyMention({ kind: 'mention', channel: 'alpha', label: 'alpha', sender: 'viewer3', body: 'are you on later?' }));
  await a.win.evaluate(() => window.kmv.notifyMention({ kind: 'reply', channel: 'alpha', label: 'alpha', sender: 'viewer4', body: 'yes', quoted: 'what time' }));
  await a.win.evaluate(() => window.kmv.notifyMention({ kind: 'spam', channel: 'alpha', label: 'alpha', sender: 'newacct', body: 'cheap viewers at x com' }));
  await a.win.evaluate(() => window.kmv.notifyMention({ kind: 'spam', abuse: true, channel: 'alpha', label: 'alpha', sender: 'troll', body: 'kys' }));
  await a.win.waitForTimeout(300);
  const notes = (await st()).notes;
  assert.deepEqual(notes.map(n => n.title), ['viewer3 mentioned you in alpha\'s chat', 'viewer4 replied to you in alpha\'s chat', 'Likely spam in alpha\'s chat',
    'Abusive message in alpha\'s chat']);
  assert.match(notes[1].body, /"what time"\s+→\s+yes/);
  assert.equal(notes[2].body, 'newacct: cheap viewers at x com');
  await a.app.evaluate(() => globalThis.__lastNote.emit('click'));
  await a.win.waitForSelector(winSel('alpha', 'chat'));
  assert.ok(await a.win.locator(winSel('alpha', 'chat')).count(), 'clicking it opens that chat');
});

test('Settings > Notifications: off sends no desktop notifications, the live row is the switch in Saved, Do not disturb, and Send a test', T, async () => {
  const notes = async () => (await st()).notes.length;
  const mention = () => a.win.evaluate(() => window.kmv.notifyMention({ kind: 'mention', channel: 'alpha', label: 'alpha', sender: 'viewer3', body: 'hi' }));
  const live = v => a.win.click(`#ntGrid .seg[data-al="live.notify"] [data-v=${v}]`);
  const liveOn = () => a.win.getAttribute('#ntGrid .seg[data-al="live.notify"] .on', 'data-v');
  await a.win.evaluate(() => window.openSettings('notify'));
  assert.equal(await a.win.isChecked('#dnOn'), true, 'on to start with');
  assert.equal(await liveOn(), 'always', 'live alerts: Always, as the switch in Saved was');
  await live('never');
  assert.equal(await a.win.isChecked('#notifyAll'), false, 'the same setting as in Saved');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.notifyAll')), '0');
  await live('unfocused');
  assert.equal(await a.win.isChecked('#notifyAll'), true, 'Away is on too');
  await a.win.evaluate(() => { const na = document.querySelector('#notifyAll'); na.checked = false; na.dispatchEvent(new Event('change')); });
  assert.equal(await liveOn(), 'never', 'and the switch in Saved sets it');
  await a.win.evaluate(() => { const na = document.querySelector('#notifyAll'); na.checked = true; na.dispatchEvent(new Event('change')); });
  assert.equal(await liveOn(), 'always');
  await a.win.click('#ntTabs [data-t=desktop]');
  await a.win.uncheck('#dnOn');
  const before = await notes();
  await mention(); await a.win.waitForTimeout(300);
  assert.equal(await notes(), before, 'off: none at all');
  await a.win.click('#settingsDlg .dn-test');
  await a.win.waitForFunction(() => /^Sent/.test(document.querySelector('#settingsDlg .dn-st').textContent));
  assert.equal((await st()).notes.at(-1).title, 'Stream Multiview', 'the test is sent even when they\'re off');
  await a.win.check('#dnOn');
  await mention(); await a.win.waitForTimeout(300);
  assert.equal(await notes(), before + 2, 'on again');
  await a.win.check('#dndOn');
  await mention(); await a.win.waitForTimeout(300);
  assert.equal(await notes(), before + 2, 'Do not disturb: none either');
  await a.win.uncheck('#dndOn');
  await mention(); await a.win.waitForTimeout(300);
  assert.equal(await notes(), before + 3, 'and back when it ends');
  await a.win.reload();
  await a.win.waitForSelector('#loginBtn:not([hidden])');
  await a.win.evaluate(() => window.openSettings('notify'));
  assert.equal(await a.win.isChecked('#dnOn'), true, 'remembered');
  await a.win.keyboard.press('Escape');
});

test('app messages can be desktop notifications too, and the pop-up can be turned off', T, async () => {
  const titles = async () => (await st()).notes.map(n => n.title + ': ' + n.body);
  await a.win.evaluate(() => window.openSettings('notify'));
  assert.equal(await a.win.getAttribute('#ntGrid .seg[data-al="app.notify"] .on', 'data-v'), 'never', 'not to start with');
  const before = (await titles()).length;
  await a.win.click('#ntGrid .seg[data-al="app.notify"] [data-v=always]');
  await a.win.keyboard.press('Escape');
  for (let i = 0; i < 2; i++) { await typeChannel(a.win, '%%%'); }
  await a.win.waitForTimeout(300);
  assert.deepEqual((await titles()).slice(before), ['Stream Multiview: Couldn’t read that link or channel name'], 'sent once, not twice');
  assert.ok(await a.win.isVisible('#msg'), 'and the pop-up too');
  await a.win.evaluate(() => window.openSettings('notify'));
  await a.win.uncheck('#ntGrid [data-al="app.popup"]');
  await a.win.click('#ntTabs [data-t=desktop]');
  await a.win.uncheck('#dnOn');
  await a.win.keyboard.press('Escape');
  await a.win.evaluate(() => window.smvNotes.flash(''));
  await typeChannel(a.win, '%%%%');
  await a.win.waitForTimeout(300);
  assert.ok(await a.win.isHidden('#msg'), 'no pop-up');
  assert.equal((await titles()).length, before + 1, 'and with desktop notifications off, nothing');
  await a.win.evaluate(() => { localStorage.removeItem('kickMultiview.alerts'); localStorage.removeItem('kickMultiview.desktopNotify'); });
});
