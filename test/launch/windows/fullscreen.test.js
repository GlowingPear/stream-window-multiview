// A player's own fullscreen button (Kick's) in the real desktop app: when the player leaves fullscreen, Electron takes
// the window out of it but leaves the page in it, and the stream filled the whole window. The page leaves it too, once
// the window is out of its own (asked while the window is still on its way out, the page never hears back).
// Real fullscreen would take the screen, so the page's fullscreen is stood in for and the window's comes from main.
const test = require('node:test');
const { SIGNED_OUT, launchApp, viewLoaded, assert, openChannel } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => {
  a = await launchApp({ storage: SIGNED_OUT });
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'stream', /player/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// The stream's view as the page's fullscreen element, counting the page's asks to leave it
const standIn = () => a.win.evaluate(() => {
  const v = document.querySelector('#stage .win.stream webview');
  window.__fsEl = v; window.__exits = 0;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => window.__fsEl });
  document.exitFullscreen = () => { window.__exits++; window.__fsEl = null; return Promise.resolve(); };
});
const leave = () => a.win.evaluate(() => document.querySelector('#stage .win.stream webview').dispatchEvent(new Event('leave-html-full-screen')));
const exits = () => a.win.evaluate(() => window.__exits);
const winFullscreen = on => a.app.evaluate(({ BrowserWindow }, on) => {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && /index\.html(?!\?role)/.test(w.webContents.getURL())) w.webContents.send('win:fullscreen', on);
}, on);

test('the player leaves fullscreen while the window is still in it: the page leaves its own once the window is out', T, async () => {
  await standIn();
  await winFullscreen(true);
  await a.win.waitForFunction(() => document.body.classList.contains('fullscreen'));
  await leave();
  assert.equal(await exits(), 0, 'not while the window is on its way out');
  await winFullscreen(false);
  await a.win.waitForFunction(() => window.__exits === 1);
  assert.equal(await a.win.evaluate(() => document.fullscreenElement), null);
  await winFullscreen(true); await winFullscreen(false);
  assert.equal(await exits(), 1, 'and only then: the window leaving fullscreen another time doesn\'t ask again');
});

test('the player leaves fullscreen and the window isn\'t in it: the page leaves its own straight away, and only if it\'s the view\'s', T, async () => {
  await standIn();
  await leave();
  assert.equal(await exits(), 1);
  await a.win.evaluate(() => { window.__fsEl = document.body; });
  await leave();
  assert.equal(await exits(), 1, 'something else in fullscreen is left alone');
});
