// Chrome extensions in the real desktop app, with a small test extension (test/fixtures/marker-extension)
// that marks every page it runs on: installing it from a folder (with the install dialog), switching it on
// per site and window type in Settings, switching it off in one stream window, its popup and options page,
// and removing it. The sites are stand-in pages (see app.js), so this needs no network.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, inView, viewLoaded, winSel, assert, openChannel, setMode } = require('../../app');
const { ROOT } = require('../../../helpers');

const T = { timeout: 60000 };
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'marker-extension');
let a;
test.before(async () => {
  a = await launchApp({ storage: { 'kickMultiview.alerts': { mention: { sound: 'none' }, spam: { sound: 'none' } } } });
  // "Load folder" picks the test extension without showing the system's folder picker
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
  await setMode(a.win, mode);
  for (const l of links) { await openChannel(a.win, l); }
};
// Extensions in a window's ⋯ menu (clicked directly: the windows here overlap each other's title bars)
const extBtn = async sel => {
  await a.win.locator(sel.replace(/\[data-a=ext\]$/, '[data-a=more]')).dispatchEvent('click');
  await a.win.locator('#barMenu button:has(.bm-t:text-is("Extensions"))').dispatchEvent('click');
};
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
  assert.equal(await a.win.locator(winSel('charlie', 'chat') + ' [data-a=more]').isVisible(), true, 'the ⋯ menu shows, to switch it on');
  assert.equal(await a.win.locator(winSel('charlie', 'chat') + ' [data-a=ext]').isVisible(), false, 'with Extensions in it');
  await a.win.locator(winSel('alpha') + ' [data-a=more]').dispatchEvent('click');
  assert.equal(await a.win.textContent('#barMenu button:has(.bm-t:text-is("Extensions")) .bm-n'), '1', 'how many are on, in the menu');
  await a.win.keyboard.press('Escape');
  await a.win.waitForSelector('#barMenu', { state: 'hidden' });
  // each session it's on in listens for new pages on the app (the extensions library): the app's limit grows with
  // them, so Node never warns "11 web-contents-created listeners" with many channels open
  const [n, max] = await a.app.evaluate(({ app }) => [app.listenerCount('web-contents-created'), app.getMaxListeners()]);
  assert.ok(max > 10 && n <= max, `${n} listeners, limit ${max}`);
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
  // shown next to the button at its page's own size (the test popup is 160 px wide plus margins)
  const pop = await until(() => a.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(w => /popup\.html$/.test(w.webContents.getURL()));
    return w && w.isVisible() && w.getBounds().height > 25 ? w.getBounds() : null;
  }), 4000);
  assert.ok(pop.width >= 160 && pop.width < 300 && pop.height > 25 && pop.height < 200, JSON.stringify(pop));
  await extBtn(winSel('delta') + ' [data-a=ext]');
  await a.win.waitForSelector('#extMenu:not([hidden]) .em-opt');
  await a.win.click('#extMenu .em-opt');
  await until(async () => (await windowUrls()).some(u => /^chrome-extension:\/\/[a-p]{32}\/options\.html$/.test(u)));
  const s = await a.app.evaluate(({ webContents }) => {
    const o = webContents.getAllWebContents().find(w => /options\.html$/.test(w.getURL()));
    return o.session.storagePath || '';
  });
  // it has no "cookies" permission: chrome.cookies gives it nothing, not the session's login
  const cookies = await a.app.evaluate(async ({ webContents }) => {
    const o = webContents.getAllWebContents().find(w => /options\.html$/.test(w.getURL()));
    await o.session.cookies.set({ url: 'https://kick.com', name: 'session_token', value: 'secret', secure: true });
    return o.executeJavaScript('chrome.cookies.getAll({}).then(l => JSON.stringify(l || []), () => "[]")');
  });
  assert.deepEqual(JSON.parse(cookies), []);
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => /options\.html$/.test(w.webContents.getURL())).forEach(w => w.close()));
  assert.match(s, /kmv-stream-delta/, 'the stream\'s own session');
});

test('A site watched signed in has one switch for its chats and streams; sites it doesn\'t run on are marked', T, async () => {
  const card = '#settingsDlg .ex-card', both = card + ' .ex-both input[data-p=kick][data-k=chat]';
  const watch = async on => {      // Settings > Accounts > Watch signed in
    await a.win.evaluate(() => openSettings('accounts'));
    await a.win.setChecked('#settingsDlg .am-watch input[data-w=kick]', on);
    await openPane();
  };
  await watch(true);
  assert.equal(await a.win.locator(card + ' .ex-grid input[data-p=kick]').count(), 1, 'one switch for Kick');
  assert.equal(await a.win.locator(card + ' .ex-grid input[data-p=twitch]').count(), 2);
  assert.equal(await a.win.isChecked(both), true, 'it shows the Chats setting');
  assert.match(await a.win.textContent(card + ' .ex-grid'), /signed in/);
  assert.match(await a.win.textContent(card + ' .ex-note'), /Signed-in streams share their chat's login/);
  assert.equal(await a.win.locator(card + ' .ex-off').count(), 0, 'it runs on every site');
  await a.win.uncheck(both);
  await closeSettings();
  await markedNow('delta', 'stream', false);
  await markedNow('charlie', 'chat', false);
  await openPane();
  await a.win.check(both);
  await closeSettings();
  await markedNow('delta', 'stream', true);
  await markedNow('charlie', 'chat', true);

  await openPane();
  await a.win.click(card + ' .ex-note [data-go=accounts]');
  await a.win.waitForSelector('#settingsDlg .st-pane[data-s=accounts]:not([hidden])');
  await watch(false);
  assert.equal(await a.win.locator(card + ' .ex-grid input[data-p=kick]').count(), 2, 'Streams and Chats again');
  assert.equal(await a.win.isHidden(card + ' .ex-note'), true);

  // an extension made for Kick only: Twitch and YouTube are marked in the install dialog
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'smv-kick-ext-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Kick Only', version: '1.0',
    content_scripts: [{ matches: ['https://kick.com/*'], js: ['c.js'] }] }));
  fs.writeFileSync(path.join(dir, 'c.js'), '');
  await a.app.evaluate((_e, d) => { globalThis.__pick = d; }, dir);
  try {
    await a.win.click('#settingsDlg .ex-folder');
    await a.win.waitForSelector('#extDlg:not([hidden])');
    const off = await a.win.$$eval('#extDlg .ex-grid .h.ex-off', l => l.map(h => h.textContent));
    assert.deepEqual(off, ['TwitchDoesn\'t run here', 'YouTubeDoesn\'t run here']);
    await a.win.click('#extDlg .ex-no');
    await a.win.waitForSelector('#extDlg', { state: 'hidden' });
  } finally { await a.app.evaluate((_e, d) => { globalThis.__pick = d; }, FIXTURE); }
  await closeSettings();
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

test('A folder extension reloads after its files change, keeping its settings; a broken folder says what\'s wrong', T, async () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'smv-reload-ext-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const manifest = () => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const write = m => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m));
  const card = '#settingsDlg .ex-card', msg = '#settingsDlg .ex-msg';
  const small = () => a.win.textContent(card + ' .ex-t small');
  const reload = async () => { await a.win.click(card + ' .ex-reload'); await a.win.waitForSelector(card + ' .ex-reload:not([disabled])'); };
  const version = (title, kind) => inView(a.win, title, kind, () => document.documentElement.getAttribute('data-test-version')).catch(() => null);
  await a.app.evaluate((_e, d) => { globalThis.__pick = d; }, dir);
  try {
    await openPane();
    await a.win.click('#settingsDlg .ex-folder');
    await a.win.waitForSelector('#extDlg:not([hidden])');
    await a.win.check('#extDlg .ex-grid input[data-p=kick][data-k=chat]');
    await a.win.click('#extDlg .ex-yes');
    await a.win.waitForSelector(card + ' .ex-reload');
    await closeSettings();
    await markedNow('delta', 'stream', true);
    await markedNow('charlie', 'chat', true);
    await extBtn(winSel('alpha') + ' [data-a=ext]');          // off in this stream only
    await a.win.waitForSelector('#extMenu:not([hidden]) .em-row');
    await a.win.click('#extMenu .em-on');
    await markedNow('alpha', 'stream', false);
    const data = await a.app.evaluate(({ app }) => app.getPath('userData'));
    const saved = () => JSON.parse(fs.readFileSync(path.join(data, 'extensions.json'), 'utf8'))[0];
    const before = saved();

    // its files changed: the new version, in the windows it runs in (they reload), with the same settings
    write({ ...manifest(), version: '1.2.4' });
    fs.appendFileSync(path.join(dir, 'mark.js'), "\ndocument.documentElement.setAttribute('data-test-version', '2');\n");
    await openPane();
    assert.match(await a.win.getAttribute(card + ' .ex-reload', 'title'), /Read its folder again/);
    await reload();
    await until(async () => /v1\.2\.4 · Loaded from a folder/.test(await small()));
    assert.equal(await a.win.textContent(msg), 'Reloaded Test Marker v1.2.4.');
    assert.equal(await a.win.isChecked(card + ' .ex-grid input[data-p=kick][data-k=chat]'), true);
    assert.deepEqual(saved(), before, 'its settings are kept');
    await closeSettings();
    await until(async () => (await version('delta', 'stream')) === '2');
    await until(async () => (await version('charlie', 'chat')) === '2');
    assert.equal(await marked('alpha', 'stream'), false, 'still off in that stream');

    // the folder gone, then a broken manifest: it says so, and nothing changes
    fs.renameSync(dir, dir + '-moved');
    await openPane();
    await reload();
    assert.equal(await a.win.textContent(msg), 'Its folder isn\'t there any more: ' + dir);
    fs.renameSync(dir + '-moved', dir);
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{ "name": ');
    await reload();
    assert.match(await a.win.textContent(msg), /^Its manifest\.json has a mistake in it: /);
    assert.match(await small(), /v1\.2\.4 · Loaded from a folder$/, 'the loaded one stays');
    assert.equal(await a.win.locator(card).count(), 1);
    assert.equal(await version('delta', 'stream'), '2');

    // it asks for more than before: asked again, and Cancel keeps the loaded one
    write({ ...JSON.parse(fs.readFileSync(path.join(FIXTURE, 'manifest.json'), 'utf8')), version: '1.2.5', permissions: ['storage', 'tabCapture', 'cookies'] });
    await a.win.click(card + ' .ex-reload');
    await a.win.waitForSelector('#extDlg:not([hidden])');
    assert.equal(await a.win.textContent('#extDlgTitle'), 'Reload Test Marker?');
    assert.match(await a.win.textContent('#extDlg .ex-src'), /From a folder · 1\.2\.5 · It now asks for more than before/);
    assert.equal(await a.win.textContent('#extDlg .ex-yes'), 'Reload');
    assert.equal(await a.win.isChecked('#extDlg .ex-grid input[data-p=kick][data-k=chat]'), true, 'with its own settings');
    await a.win.click('#extDlg .ex-no');
    await a.win.waitForSelector(card + ' .ex-reload:not([disabled])');
    assert.match(await small(), /v1\.2\.4/);
    await a.win.click(card + ' .ex-reload');
    await a.win.waitForSelector('#extDlg:not([hidden])');
    await a.win.uncheck('#extDlg .ex-grid input[data-p=kick][data-k=chat]');
    await a.win.click('#extDlg .ex-yes');
    await until(async () => /v1\.2\.5/.test(await small()));
    assert.equal(saved().grid.kick.chat, false, 'what was chosen in the dialog');
    assert.equal(await a.win.isChecked(card + ' .ex-grid input[data-p=kick][data-k=chat]'), false);
    await closeSettings();
    await markedNow('charlie', 'chat', false);

    await openPane();
    await a.win.click(card + ' .ex-rm');
    await a.win.click('#askDlg .ask-yes');
    await a.win.waitForSelector('#settingsDlg .ex-empty:not([hidden])');
    await closeSettings();
  } finally {
    await a.app.evaluate((_e, d) => { globalThis.__pick = d; }, FIXTURE);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dir + '-moved', { recursive: true, force: true });
  }
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
  const socs = await a.app.evaluate(({ session }) => session.fromPartition('persist:kmv-webstore').cookies.get({ name: 'SOCS' }));
  assert.equal(socs.length, 1, 'Google\'s cookie question answered "Reject all"');
  await a.win.click('#settingsDlg .ex-store');           // a second click brings the same window forward
  assert.equal(await storeWin(), 1);
  await a.app.evaluate(({ BrowserWindow, session }) => BrowserWindow.getAllWindows()
    .filter(w => w.webContents.session === session.fromPartition('persist:kmv-webstore')).forEach(w => w.close()));
  await closeSettings();
});
