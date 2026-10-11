// Chrome extensions in the real desktop app, with a small test extension (test/fixtures/marker-extension)
// that marks every page it runs on: installing it from a folder (with the install dialog), switching it on
// per site and window type in Settings, switching it off in one stream window, its popup and options page,
// and removing it. The sites are stand-in pages (see app.js), so this needs no network.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, inView, viewLoaded, winSel, assert } = require('./app');
const { ROOT } = require('../helpers');

const T = { timeout: 60000 };
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'marker-extension');
let a;
test.before(async () => {
  a = await launchApp({ storage: { 'kickMultiview.alerts': { mention: { sound: 'none' }, spam: { sound: 'none' } } } });
  // "Load folder…" picks the test extension without showing the system's folder picker
  await a.app.evaluate(({ session }) => globalThis.__fake(session.fromPartition('persist:kmv-webstore')));   // no network
  await a.app.evaluate(({ dialog }, dir) => {
    globalThis.__pick = dir;
    dialog.showOpenDialog = async () => globalThis.__pick ? { canceled: false, filePaths: [globalThis.__pick] } : { canceled: true, filePaths: [] };
  }, FIXTURE);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const until = async (fn, ms = 10000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const marked = (title, kind) => inView(a.win, title, kind, () => document.documentElement.getAttribute('data-test-marker') === '1').catch(() => null);
const markedNow = async (title, kind, want) => until(async () => (await marked(title, kind)) === want, 10000);
const add = async (mode, ...links) => {
  await a.win.selectOption('#mode', mode);
  for (const l of links) { await a.win.fill('#url', l); await a.win.click('#add'); }
};
// a window's extensions button (clicked directly: the windows here overlap each other's title bars)
const extBtn = sel => a.win.locator(sel).dispatchEvent('click');
const openPane = () => a.win.evaluate(() => openSettings('extensions'));
const closeSettings = () => a.win.evaluate(() => { document.querySelector('#settingsDlg').hidden = true; });
const windowUrls = () => a.app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => w.getURL()));

test('Settings > Extensions starts empty, and windows have no extensions button', T, async () => {
  await openPane();
  await a.win.waitForSelector('#settingsDlg .st-pane[data-s=extensions]:not([hidden]) .ex-empty:not([hidden])');
  assert.equal(await a.win.locator('#settingsDlg .ex-card').count(), 0);
  await closeSettings();
  await add('stream', 'alpha');
  await viewLoaded(a.win, 'alpha', 'stream', /player/);
  assert.equal(await a.win.locator(winSel('alpha') + ' [data-a=ext]').isHidden(), true);
  assert.equal(await marked('alpha', 'stream'), false);
});

test('Loading a folder asks first, and Cancel adds nothing', T, async () => {
  await openPane();
  await a.win.click('#settingsDlg .ex-folder');
  await a.win.waitForSelector('#extDlg:not([hidden])');
  assert.equal(await a.win.textContent('#extDlgTitle'), 'Add Test Marker?');
  assert.match(await a.win.textContent('#extDlg .ex-src'), /From a folder · 1\.2\.3/);
  assert.match(await a.win.textContent('#extDlg .ex-perms'), /Read and change everything on the pages it's switched on for/);
  assert.match(await a.win.textContent('#extDlg .ex-warn'), /capturing a page's sound/, 'what won\'t work here');
  await a.win.click('#extDlg .ex-no');
  await a.win.waitForSelector('#extDlg', { state: 'hidden' });
  await a.win.waitForTimeout(300);
  assert.equal(await a.win.locator('#settingsDlg .ex-card').count(), 0);
});

test('Installed: on where the grid says (streams by default, plus Twitch chats here)', T, async () => {
  await a.win.click('#settingsDlg .ex-folder');
  await a.win.waitForSelector('#extDlg:not([hidden])');
  const grid = await a.win.$$eval('#extDlg .ex-grid input', l => l.map(i => `${i.dataset.p}.${i.dataset.k}=${i.checked}`));
  assert.deepEqual(grid, ['kick.stream=true', 'twitch.stream=true', 'youtube.stream=true', 'kick.chat=false', 'twitch.chat=false', 'youtube.chat=false']);
  await a.win.check('#extDlg .ex-grid input[data-p=twitch][data-k=chat]');
  await a.win.click('#extDlg .ex-yes');
  await a.win.waitForSelector('#settingsDlg .ex-card');
  assert.equal(await a.win.textContent('#settingsDlg .ex-card .ex-t b'), 'Test Marker');
  assert.match(await a.win.textContent('#settingsDlg .ex-card .ex-t small'), /v1\.2\.3 · Loaded from a folder/);
  assert.equal(await a.win.isChecked('#settingsDlg .ex-card .ex-grid input[data-p=twitch][data-k=chat]'), true);
  await closeSettings();
  await markedNow('alpha', 'stream', true);                 // the open stream reloaded with it
  await add('chat', 'charlie', 'tw:bravo');
  await viewLoaded(a.win, 'bravo', 'chat', /chat/);
  await viewLoaded(a.win, 'charlie', 'chat', /chat/);
  await markedNow('bravo', 'chat', true);
  assert.equal(await marked('charlie', 'chat'), false, 'not in Kick chats');
  await until(() => a.win.locator(winSel('alpha') + ' [data-a=ext] .ext-n').textContent().then(t => t === '1'));
  assert.equal(await a.win.locator(winSel('charlie', 'chat') + ' [data-a=ext]').isVisible(), true, 'the button shows, to switch it on');
});

test('A stream window can switch it off for itself only; chats follow Settings', T, async () => {
  await extBtn(winSel('alpha') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-row');
  assert.equal(await a.win.textContent('#extMenu .em-t span'), 'On for Kick streams');
  await a.win.click('#extMenu .em-on');
  await a.win.waitForSelector('#extMenu', { state: 'hidden' });
  await markedNow('alpha', 'stream', false);
  await add('stream', 'delta');
  await viewLoaded(a.win, 'delta', 'stream', /player/);
  await markedNow('delta', 'stream', true);                 // other Kick streams keep it
  await extBtn(winSel('alpha') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-row');
  assert.equal(await a.win.textContent('#extMenu .em-t span'), 'Off in this window only');
  assert.equal(await a.win.isChecked('#extMenu .em-on'), false);
  await a.win.click('#extMenu .em-on');                     // back on: the same as Settings again
  await markedNow('alpha', 'stream', true);
  await extBtn(winSel('alpha') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-row');
  assert.equal(await a.win.textContent('#extMenu .em-t span'), 'On for Kick streams');
  await a.win.keyboard.press('Escape');
  await a.win.waitForSelector('#extMenu', { state: 'hidden' });

  await extBtn(winSel('charlie', 'chat') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-row');
  assert.equal(await a.win.isDisabled('#extMenu .em-on'), true, 'a chat can\'t differ from the other chats of its site');
  assert.match(await a.win.textContent('#extMenu .em-foot'), /Same for all Kick chats/);
  await a.win.click('#extMenu .em-set');
  await a.win.waitForSelector('#settingsDlg .st-pane[data-s=extensions]:not([hidden])');
  await a.win.check('#settingsDlg .ex-card .ex-grid input[data-p=kick][data-k=chat]');
  await closeSettings();
  await markedNow('charlie', 'chat', true);
});

test('Its popup and its options page open from the window\'s menu, in that window\'s session', T, async () => {
  await extBtn(winSel('delta') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-row .em-main:not([disabled])');
  await a.win.click('#extMenu .em-main');
  await until(async () => (await windowUrls()).some(u => /^chrome-extension:\/\/[a-p]{32}\/popup\.html$/.test(u)));
  await extBtn(winSel('delta') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-opt');
  await a.win.click('#extMenu .em-opt');
  await until(async () => (await windowUrls()).some(u => /^chrome-extension:\/\/[a-p]{32}\/options\.html$/.test(u)));
  const s = await a.app.evaluate(({ webContents }) => {
    const o = webContents.getAllWebContents().find(w => /options\.html$/.test(w.getURL()));
    return o.session.storagePath || '';
  });
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => /options\.html$/.test(w.webContents.getURL())).forEach(w => w.close()));
  assert.match(s, /kmv-stream-delta/, 'the stream\'s own session');
});

test('Switched off in Settings, then removed', T, async () => {
  await openPane();
  await a.win.click('#settingsDlg .ex-card .ex-on');
  await closeSettings();
  await markedNow('delta', 'stream', false);
  await markedNow('bravo', 'chat', false);
  await openPane();
  await a.win.click('#settingsDlg .ex-card .ex-pm');
  assert.match(await a.win.textContent('#settingsDlg .ex-card .ex-perms'), /Read and change everything/);
  await a.win.click('#settingsDlg .ex-card .ex-rm');
  await a.win.click('#askDlg .ask-yes');
  await a.win.waitForSelector('#settingsDlg .ex-empty:not([hidden])');
  await closeSettings();
  await until(() => a.win.locator(winSel('alpha') + ' [data-a=ext]').isHidden());
  const data = await a.app.evaluate(({ app }) => app.getPath('userData'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'extensions.json'), 'utf8')), []);
});

test('Install from link: a link that isn\'t one says so; the Web Store opens in its own window', T, async () => {
  await openPane();
  await a.win.click('#settingsDlg .ex-link');
  await a.win.fill('#settingsDlg .ex-linkrow input', 'https://example.com/not-an-extension');
  await a.win.click('#settingsDlg .ex-linkrow .btn');
  await a.win.waitForSelector('#settingsDlg .ex-msg:not([hidden])');
  assert.match(await a.win.textContent('#settingsDlg .ex-msg'), /isn't a Chrome Web Store link/);
  await a.win.click('#settingsDlg .ex-store');
  const storeWin = () => a.app.evaluate(({ BrowserWindow, session }) => BrowserWindow.getAllWindows()
    .filter(w => w.webContents.session === session.fromPartition('persist:kmv-webstore')).length);
  await until(async () => (await storeWin()) === 1);
  await a.win.click('#settingsDlg .ex-store');           // a second click brings the same window forward
  assert.equal(await storeWin(), 1);
  await a.app.evaluate(({ BrowserWindow, session }) => BrowserWindow.getAllWindows()
    .filter(w => w.webContents.session === session.fromPartition('persist:kmv-webstore')).forEach(w => w.close()));
  await closeSettings();
});
