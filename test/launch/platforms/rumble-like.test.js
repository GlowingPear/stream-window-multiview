// The like button on Rumble streams, and Settings › Rumble › Like streams automatically. Rumble's player has no like
// button: the app asks Rumble itself (like:state, like:set), which the test answers, so nothing is liked for real.
const test = require('node:test');
const { SIGNED_OUT, launchApp, inView, viewLoaded, winSel, assert, openChannel, setMode } = require('../app');

const T = { timeout: 60000 };
const VID = 'v33aw1a.186945454';
let a;
test.before(async () => {
  a = await launchApp({ storage: { ...SIGNED_OUT, 'kickMultiview.alerts': { mention: { sound: 'none' }, spam: { sound: 'none' } } } });
  // the channel is live with that video; Rumble's answers about your like are the test's
  await a.app.evaluate(({ ipcMain }) => {
    const r = globalThis.__rl = { signedIn: false, liked: false, asked: [], sent: [], take: true };
    ipcMain.removeHandler('live:resolve');
    ipcMain.handle('live:resolve', () => ({ live: true, videoId: 'v33aw1a.186945454', name: 'Night Owl' }));
    ipcMain.removeHandler('like:state');
    ipcMain.handle('like:state', (_e, ch, vid) => { r.asked.push([ch, vid]); return { signedIn: r.signedIn, liked: r.signedIn ? r.liked : null }; });
    ipcMain.removeHandler('like:set');
    ipcMain.handle('like:set', (_e, ch, vid, on) => { r.sent.push([ch, vid, on]); if (!r.take) return null; r.liked = on; return { liked: on }; });
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const clear = async () => { if (await a.win.locator('#stage .win').count()){ await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes'); } };
test.beforeEach(() => a && clear());
const rl = () => a.app.evaluate(() => globalThis.__rl);
const setRl = o => a.app.evaluate((_e, o) => Object.assign(globalThis.__rl, o), o);
const tip = sel => a.win.$eval(sel, e => e.title || e.dataset.tipTitle);   // the title is put aside while the pointer is on it
// opens the live Rumble channel as a stream and waits for its player; returns its window title
async function openStream() {
  await setMode(a.win, 'stream');
  await openChannel(a.win, 'https://rumble.com/c/nightowl');
  await a.win.waitForSelector('#stage .win.stream.plat-rumble webview');
  const title = await a.win.textContent('#stage .win.stream.plat-rumble .title');
  await viewLoaded(a.win, title, 'stream', /rumble\.com\/embed\/v33aw1a\//);
  return title;
}
const btn = title => `${winSel(title)} [data-a=like]`;
// its player playing (the stand-in's <video> never loads by itself)
const play = (title, on) => inView(a.win, title, 'stream', on => {
  const v = document.querySelector('video');
  Object.defineProperty(v, 'paused', { configurable: true, get: () => !on });
  Object.defineProperty(v, 'readyState', { configurable: true, get: () => (on ? 4 : 0) });
}, on);

test('signed out of Rumble: the button is greyed out, says how to sign in, and nothing is sent', T, async () => {
  await setRl({ signedIn: false, sent: [], asked: [] });
  const title = await openStream();
  const b = btn(title);
  await until(async () => /sign in to Rumble in Settings › Accounts/.test(await tip(b)));
  assert.equal(await a.win.$eval(b, e => e.classList.contains('dim')), true);
  assert.deepEqual((await rl()).asked[0], ['ru:nightowl', VID], 'Rumble asked about its live video');
  await a.win.click(b);
  assert.match(await a.win.textContent('#msg'), /sign in to Rumble/, 'clicking it says so');
  assert.equal(await a.win.evaluate(() => !document.querySelector('#settingsDlg').hidden && localStorage.getItem('kickMultiview.settingsTab')), 'accounts', 'and opens Settings › Accounts');
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
  assert.deepEqual((await rl()).sent, []);
});

test('signed in: the button shows your like on Rumble, likes and takes it back; Rumble asked now and then, not every second', T, async () => {
  await setRl({ signedIn: true, liked: true, sent: [], asked: [], take: true });
  const title = await openStream();
  const b = btn(title);
  await a.win.waitForSelector(`${b}.on`);
  assert.equal(await a.win.getAttribute(b, 'aria-pressed'), 'true');
  assert.match(await tip(b), /You like this stream on Rumble: click to remove your like/);
  await a.win.click(b);
  await a.win.waitForSelector(`${b}:not(.on):not(.dim)`);
  assert.equal(await tip(b), 'Like this stream on Rumble');
  await a.win.click(b);
  await a.win.waitForSelector(`${b}.on`);
  assert.deepEqual((await rl()).sent, [['ru:nightowl', VID, false], ['ru:nightowl', VID, true]]);
  // Rumble doesn't take it: the button stays as it was
  await setRl({ take: false });
  await a.win.click(b);
  await until(async () => (await rl()).sent.length === 3);
  await a.win.waitForTimeout(1200);
  assert.equal(await a.win.$eval(b, e => e.classList.contains('on')), true, 'still liked');
  assert.equal((await rl()).asked.length, 1, 'asked once while it plays (its page is big): pressing uses what it said');
  await setRl({ take: true });
});

test('Like streams automatically (Settings › Rumble): likes once the stream has played a few seconds, and only once', T, async () => {
  await setRl({ signedIn: true, liked: false, sent: [], asked: [] });
  await a.win.evaluate(() => { openSettings('rumble'); localStorage.removeItem('kickMultiview.ruAutoLiked'); });
  assert.equal(await a.win.isChecked('#ruAutoLike'), false, 'off at first');
  await a.win.check('#ruAutoLike');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.ruAutoLike')), '1');
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
  const title = await openStream();
  const b = btn(title);
  await a.win.waitForSelector(`${b}:not(.dim)`);
  await a.win.waitForTimeout(4500);
  assert.deepEqual((await rl()).sent, [], 'not before its player plays');
  await play(title, true);
  await a.win.waitForSelector(`${b}.on`, { timeout: 10000 });
  assert.deepEqual((await rl()).sent, [['ru:nightowl', VID, true]]);
  assert.deepEqual(await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.ruAutoLiked'))), [VID]);
  // you take it back: it isn't liked again, also after loading again
  await a.win.click(b);
  await a.win.waitForSelector(`${b}:not(.on)`);
  await a.win.click(`${winSel(title)} [data-a=reload]`);
  await viewLoaded(a.win, title, 'stream', /rumble\.com\/embed\/v33aw1a\//);
  await play(title, true);
  await a.win.waitForTimeout(4500);
  assert.equal((await rl()).sent.length, 2, 'not liked again');
  await a.win.evaluate(() => openSettings('rumble'));
  await a.win.uncheck('#ruAutoLike');
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
});
