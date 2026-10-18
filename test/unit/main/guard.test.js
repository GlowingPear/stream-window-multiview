// What the app lets in (src/main/guard.js): who may send its messages, what pages may ask for, where pop-ups and
// links open, and what a web view may be.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { EventEmitter } = require('events');
const g = require('../../../src/main/guard');

test('addresses: only http and https open in your browser, without a name and password in them', () => {
  assert.equal(g.webUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(g.webUrl('HTTP://Example.com'), 'http://example.com/', 'in any capitals, tidied');
  for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'search-ms:query=x', 'ms-settings:', 'data:text/html,x', 'steam://run/1',
    'https://user:pass@example.com/', 'https://kick.com@evil.example/', ' ', '', null, undefined, 42, {}])
    assert.equal(g.webUrl(u), '', String(u));
});

test('the sites and their sign-in pages open inside the app; only over https', () => {
  for (const u of ['https://kick.com/x', 'https://www.twitch.tv/x', 'https://id.twitch.tv/oauth2', 'https://www.youtube.com/watch?v=x', 'https://youtu.be/x'])
    assert.ok(g.isSite(u) && g.inApp(u), u);
  for (const u of ['https://accounts.google.com/x', 'https://appleid.apple.com/auth', 'https://accounts.youtube.com/x'])
    assert.ok(g.isLogin(u) && g.inApp(u), u);
  for (const u of ['http://kick.com/x', 'file://kick.com/share', 'https://kick.com.evil.example/', 'https://evilkick.com/', 'https://google.com.evil.example/', 'nonsense'])
    assert.ok(!g.inApp(u), u);
});

test('pop-ups: the sites open in the app; other addresses in your browser, only just after you clicked; the app\'s own pages never open one', () => {
  assert.equal(g.popupFor('https://kick.com/login'), 'app');
  assert.equal(g.popupFor('https://accounts.google.com/o/oauth2'), 'app');
  assert.equal(g.popupFor('https://example.com/'), 'external');
  assert.equal(g.popupFor('https://example.com/', { recent: false }), 'deny', 'a page opening links by itself');
  assert.equal(g.popupFor('search-ms:query=x'), 'deny');
  assert.equal(g.popupFor('http://kick.com/'), 'external', 'not https: not in the app');
  assert.equal(g.popupFor('https://kick.com/x', { fromApp: true }), 'external', 'from the app\'s page: your browser');
  assert.equal(g.popupFor('https://example.com/', { fromApp: true, recent: false }), 'external');
  assert.equal(g.popupFor('file:///x', { fromApp: true }), 'deny');
  assert.ok(g.mayNavigate('https://kick.com/x') && g.mayNavigate('about:blank'));
  assert.ok(!g.mayNavigate('https://example.com/') && !g.mayNavigate('file:///etc/passwd') && !g.mayNavigate('chrome://gpu'));
});

test('web views: no preload or Node, sandboxed, https only, and only the app\'s own storage', () => {
  const prefs = { preload: '/x.js', preloadURL: 'file:///x.js', nodeIntegration: true, contextIsolation: false, sandbox: false, webSecurity: false,
    allowRunningInsecureContent: true, nodeIntegrationInSubFrames: true, nodeIntegrationInWorker: true, webviewTag: true, enableBlinkFeatures: 'X', plugins: true };
  assert.equal(g.lockWebview(prefs, { src: 'https://kick.com/popout/x/chat', partition: 'persist:kick' }), true);
  assert.deepEqual(prefs, { nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, contextIsolation: true, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, plugins: false, experimentalFeatures: false });
  for (const partition of ['persist:twitch', 'persist:youtube', 'persist:kmv-mini', 'persist:kmv-web', 'persist:kmv-stream-yt_v_abcdefghijk'])
    assert.equal(g.lockWebview({}, { src: 'https://x.example/', partition }), true, partition);
  for (const partition of ['', 'persist:kmv-webstore', 'kick', 'persist:other', 'persist:kmv-stream-', 'persist:kmv-stream-a/b'])
    assert.equal(g.lockWebview({}, { src: 'https://x.example/', partition }), false, partition);
  for (const src of ['http://kick.com/', 'file:///x', 'data:text/html,x', 'javascript:1', '', undefined])
    assert.equal(g.lockWebview({}, { src, partition: 'persist:kick' }), false, String(src));
});

test('messages: only the app\'s own windows, showing their own page, are answered', () => {
  const src = path.join(__dirname, 'app');
  const files = { main: path.join(src, 'index.html'), streams: path.join(src, 'index.html'), switcher: path.join(src, 'switcher.html') };
  const win = () => { const wc = {}; return { webContents: wc, isDestroyed: () => false }; };
  const w = { main: win(), streams: win(), switcher: win() };
  const roleOf = g.senderRole({ files, windows: () => w });
  const page = (f, q = '') => pathToFileURL(f).href + q;
  const msg = (wc, url, parent = null) => ({ sender: wc, senderFrame: { url, parent } });
  assert.equal(roleOf(msg(w.main.webContents, page(files.main))), 'main');
  assert.equal(roleOf(msg(w.streams.webContents, page(files.main, '?role=streams'))), 'streams');
  assert.equal(roleOf(msg(w.switcher.webContents, page(files.switcher))), 'switcher');
  assert.equal(roleOf(msg({}, page(files.main))), null, 'another web contents (a web view, a pop-up)');
  assert.equal(roleOf(msg(w.main.webContents, 'https://kick.com/')), null, 'the window went somewhere else');
  assert.equal(roleOf(msg(w.main.webContents, page(path.join(src, 'other.html')))), null, 'another file');
  assert.equal(roleOf(msg(w.switcher.webContents, page(files.main))), null, 'the wrong page for that window');
  assert.equal(roleOf(msg(w.main.webContents, page(files.main), {})), null, 'a frame inside the page');
  assert.equal(roleOf({ sender: w.main.webContents, senderFrame: null }), null, 'a frame that has gone');
  assert.equal(roleOf(msg(w.main.webContents, 'not a url')), null);
  assert.equal(roleOf(null), null);
  w.main.isDestroyed = () => true;
  assert.equal(roleOf(msg(w.main.webContents, page(files.main))), null, 'a closed window');
  w.main = null;
  assert.equal(roleOf(msg({}, page(files.main))), null);
});

test('messages: a handler only runs for the windows it\'s for; anyone else is refused and reported', async () => {
  const ipc = { handlers: {}, listeners: {}, handle(ch, fn) { this.handlers[ch] = fn; }, on(ch, fn) { this.listeners[ch] = fn; } };
  const denied = [];
  const roleOf = e => e.role || null;
  const main = g.guardedIpc(ipc, roleOf, ['main'], ch => denied.push(ch));
  const both = g.guardedIpc(ipc, roleOf, ['main', 'streams']);
  const ran = [];
  main.handle('a', (_e, x) => x * 2);
  both.on('b', (_e, x) => ran.push(x));
  assert.equal(await ipc.handlers.a({ role: 'main' }, 21), 42);
  await assert.rejects(async () => ipc.handlers.a({ role: 'streams' }, 1), /isn't allowed/);
  await assert.rejects(async () => ipc.handlers.a({}, 1), /isn't allowed/);
  ipc.listeners.b({ role: 'streams' }, 1);
  ipc.listeners.b({ role: 'switcher' }, 2);
  ipc.listeners.b({}, 3);
  assert.deepEqual(ran, [1]);
  assert.deepEqual(denied, ['a', 'a']);
  main.on('c', () => ran.push('c'));
  ipc.listeners.c({ role: 'streams' });
  assert.deepEqual(denied, ['a', 'a', 'c']);
});

test('permissions: the app\'s page may go full screen, copy and show a window you picked; the sites only full screen and copy', () => {
  for (const permission of ['fullscreen', 'clipboard-sanitized-write', 'display-capture']) {
    assert.equal(g.mayAsk({ app: true, permission }), true, permission);
    assert.equal(g.mayAsk({ app: false, permission }), permission !== 'display-capture', permission);
  }
  assert.equal(g.mayAsk({ app: true, permission: 'media', mediaTypes: ['video'] }), true, 'a window, as a picture');
  assert.equal(g.mayAsk({ app: true, permission: 'media', mediaTypes: ['video', 'audio'] }), false, 'never with sound');
  assert.equal(g.mayAsk({ app: true, permission: 'media', mediaTypes: [] }), false);
  assert.equal(g.mayAsk({ app: true, permission: 'media', mediaType: 'video' }), true);
  assert.equal(g.mayAsk({ app: true, permission: 'media', mediaType: 'audio' }), false);
  assert.equal(g.mayAsk({ app: true, permission: 'media' }), false);
  assert.equal(g.mayAsk({ app: false, permission: 'media', mediaTypes: ['video'] }), false, 'a site never sees your screen or camera');
  for (const permission of ['openExternal', 'notifications', 'geolocation', 'clipboard-read', 'midiSysex', 'hid', 'serial', 'usb', 'idle-detection', 'pointerLock', 'window-management', 'unknown'])
    for (const app of [true, false]) assert.equal(g.mayAsk({ app, permission }), false, `${permission} (${app ? 'app' : 'site'})`);
});

test('permissions: a session asks the rules, knows the app\'s page by its window and address, and picks no device', () => {
  const ses = new EventEmitter();
  ses.setPermissionRequestHandler = fn => { ses.request = fn; };
  ses.setPermissionCheckHandler = fn => { ses.check = fn; };
  ses.setDevicePermissionHandler = fn => { ses.device = fn; };
  const appWc = {}, siteWc = {};
  g.lockSession(ses, wc => wc === appWc);
  g.lockSession(ses, () => { throw new Error('only once'); });
  const ask = (wc, permission, details) => new Promise(r => ses.request(wc, permission, r, details));
  return (async () => {
    assert.equal(await ask(appWc, 'media', { requestingUrl: 'file:///app/index.html', mediaTypes: ['video'] }), true);
    assert.equal(await ask(appWc, 'media', { requestingUrl: 'https://kick.com/', mediaTypes: ['video'] }), false, 'the app\'s window, but not its page');
    assert.equal(await ask(siteWc, 'media', { requestingUrl: 'file:///app/index.html', mediaTypes: ['video'] }), false, 'a web view showing a file');
    assert.equal(await ask(siteWc, 'fullscreen', { requestingUrl: 'https://kick.com/' }), true);
    assert.equal(await ask(siteWc, 'openExternal', { requestingUrl: 'https://kick.com/', externalURL: 'search-ms:x' }), false);
    assert.equal(await ask(null, 'fullscreen'), true, 'no web contents: as a site');
    assert.equal(ses.check(appWc, 'media', 'file://', { mediaType: 'video' }), true);
    assert.equal(ses.check(appWc, 'media', 'file://', { requestingUrl: 'file:///app/index.html', mediaType: 'video' }), true);
    assert.equal(ses.check(siteWc, 'clipboard-read', 'https://kick.com', {}), false);
    assert.equal(ses.check(siteWc, 'clipboard-sanitized-write', 'https://kick.com'), true);
    assert.equal(ses.device({ deviceType: 'hid' }), false);
    for (const ev of ['select-hid-device', 'select-serial-port', 'select-usb-device']) {
      let prevented = false, answer = 'none';
      ses.emit(ev, { preventDefault: () => { prevented = true; } }, {}, a => { answer = a; });
      assert.equal(prevented, true, ev);
      assert.equal(answer, ev === 'select-usb-device' ? undefined : '', ev);
    }
    const broken = new EventEmitter();
    broken.setPermissionRequestHandler = fn => { broken.request = fn; };
    broken.setPermissionCheckHandler = () => {};
    g.lockSession(broken, () => { throw new Error('gone'); });
    assert.equal(await new Promise(r => broken.request({}, 'display-capture', r, { requestingUrl: 'file:///x' })), false, 'a failing check counts as a site');
    g.lockSession(null, () => true);
  })();
});
