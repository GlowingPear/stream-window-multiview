// A stuck Kick player in the real app (#120): its error page ("This embed seems to be misconfigured") and its
// offline screen (/<name>/offline), which never recover by themselves, and Reload, which used to load that page
// again. The player is a stand-in page (see app.js), moved to those pages the way Kick's player does (in-page).
// Its video stopping (a part that never came), with a stand-in for the video's time; and streams that keep drawing
// while the window is behind others.
const test = require('node:test');
const { launchApp, inView, viewLoaded, winSel, assert, openChannel, setMode } = require('../app');

const T = { timeout: 90000 };
let a;
test.before(async () => {
  a = await launchApp();
  // Is the channel live? (an unsaved one is asked about, see stuck.js) Answered by the test.
  await a.app.evaluate(({ ipcMain }) => {
    globalThis.__live = {}; globalThis.__liveAsked = [];
    ipcMain.removeHandler('live:one');
    ipcMain.handle('live:one', (_e, ch) => { globalThis.__liveAsked.push(ch); return ch in globalThis.__live ? { live: globalThis.__live[ch] } : null; });
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const PLAYER = ch => new RegExp(`^https://player\\.kick\\.com/${ch}\\?autoplay=true`);
const times = t => a.win.evaluate(t => Object.assign(window.stuckTimes, t), t);
const FAST = { look: 100, ok: 300, offline: 300, retry: [400, 600, 800] };
// The player moves to its offline screen, or its error page, without loading a new page (as Kick's does)
const stuck = (ch, text) => inView(a.win, ch, 'stream', ([ch, text]) => {
  history.pushState({}, '', `/${ch}/offline`);
  document.body.innerText = text;
}, [ch, text]);
const onOffline = ch => viewLoaded(a.win, ch, 'stream', new RegExp(`/${ch}/offline$`));
const asked = () => a.app.evaluate(() => globalThis.__liveAsked.length);
const loaded = async ch => { await viewLoaded(a.win, ch, 'stream', PLAYER(ch)); await a.win.waitForTimeout(300); };

test('the error page: the channel\'s address is loaded again by itself; Reload loads it too, not the page it\'s on', T, async () => {
  await setMode(a.win, 'stream');
  await openChannel(a.win, 'stuckone');
  await times(FAST);
  await loaded('stuckone');
  await stuck('stuckone', 'Kick\nThis embed seems to be misconfigured');
  await onOffline('stuckone');
  await viewLoaded(a.win, 'stuckone', 'stream', PLAYER('stuckone'));

  // Reload on the offline screen: the player, not /stuckone/offline again (recovery is slowed right down here)
  await loaded('stuckone');
  await times({ look: 60000 });
  await stuck('stuckone', 'stuckone is offline');
  await onOffline('stuckone');
  await a.win.click(`${winSel('stuckone')} [data-a=reload]`);
  await viewLoaded(a.win, 'stuckone', 'stream', PLAYER('stuckone'));
});

test('the offline screen: back to the player as soon as the channel is live again; a paused stream is left alone', T, async () => {
  await openChannel(a.win, 'stucktwo');
  await times(FAST);
  await loaded('stucktwo');
  await a.app.evaluate(() => { globalThis.__live.stucktwo = false; globalThis.__liveAsked = []; });
  await stuck('stucktwo', 'stucktwo is offline');
  await onOffline('stucktwo');
  for (let i = 0; i < 100 && await asked() < 2; i++) await a.win.waitForTimeout(100);
  assert.ok(await asked() >= 2, 'it asks whether the channel is live, again and again');
  assert.equal(await inView(a.win, 'stucktwo', 'stream', () => location.pathname), '/stucktwo/offline', 'and stays while it isn\'t');
  await a.app.evaluate(() => { globalThis.__live.stucktwo = true; });
  await viewLoaded(a.win, 'stucktwo', 'stream', PLAYER('stucktwo'));

  // paused (from the switch control): not reloaded, on the error page or offline; playing again: it recovers
  await loaded('stucktwo');
  await a.win.evaluate(() => document.querySelector('#layoutMenu [data-l=focus]').click());
  const item = '#featSwitch .fs-item[data-ch=stucktwo]';
  await a.win.click(`${item} .fs-play`);
  assert.ok(await a.win.$eval(item, e => e.classList.contains('paused')), 'paused');
  await stuck('stucktwo', 'This embed seems to be misconfigured');
  await onOffline('stucktwo');
  await a.win.waitForTimeout(1500);
  assert.equal(await inView(a.win, 'stucktwo', 'stream', () => location.pathname), '/stucktwo/offline', 'left as it is while paused');
  await a.win.click(`${item} .fs-play`);
  await viewLoaded(a.win, 'stucktwo', 'stream', PLAYER('stucktwo'));
});

test('a channel that keeps failing is tried again less and less often', T, async () => {
  await openChannel(a.win, 'stuckthree');
  await times(FAST);
  await loaded('stuckthree');
  // every load of its player shows the error page straight away
  const loads = [];
  for (let i = 0; i < 3; i++){
    await stuck('stuckthree', 'This embed seems to be misconfigured');
    const t = Date.now();
    await viewLoaded(a.win, 'stuckthree', 'stream', PLAYER('stuckthree'));
    loads.push(Date.now() - t);
    await a.win.waitForTimeout(150);
  }
  assert.ok(loads[2] > loads[0] + 250, `waits longer each time (${loads.join(', ')} ms)`);
});

// The stand-in player's video, playing: its time (moving or not), what it has loaded, and where it was moved to
const fakeVideo = ch => inView(a.win, ch, 'stream', () => {
  const v = document.querySelector('video'), f = window.__f = { t: 5, end: 9, moving: true, paused: false, set: null };
  Object.defineProperty(v, 'paused', { get: () => f.paused });
  Object.defineProperty(v, 'currentTime', { get: () => f.t, set: x => { f.t = x; f.set = x; } });
  Object.defineProperty(v, 'buffered', { get: () => ({ length: 1, end: () => f.end }) });
  v.play = () => Promise.resolve();
  setInterval(() => { if (f.moving) f.t += 0.1; }, 50);
  return true;
});
const video = (ch, set) => inView(a.win, ch, 'stream', set => window.__f ? Object.assign(window.__f, set || {}) : null, set);
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (!(v = await fn().catch(() => null)) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };

test('a video that stopped: moved on to the newest part it has, then loaded again; a moving or paused one is left alone; both in the error log', T, async () => {
  await openChannel(a.win, 'stallone');
  await times(FAST);
  await loaded('stallone');
  await fakeVideo('stallone');
  await a.win.waitForTimeout(1500);
  assert.equal((await video('stallone')).set, null, 'moving: left alone');
  await video('stallone', { paused: true, moving: false });
  await a.win.waitForTimeout(1500);
  assert.equal((await video('stallone')).set, null, 'paused in its player: left alone');

  await video('stallone', { paused: false });
  assert.equal((await until(async () => { const f = await video('stallone'); return f && f.set != null && f; })).set, 8.5, 'stopped: moved on to the newest part');
  assert.ok(await until(async () => !(await video('stallone'))), 'still stopped there: loaded again');
  await viewLoaded(a.win, 'stallone', 'stream', PLAYER('stallone'));
  const log = (await a.win.evaluate(() => window.kmv.devInfo())).errors.filter(e => e.where === 'stallone').map(e => e.msg);
  assert.deepEqual(log, ['its video stayed stopped: loaded it again', 'its video stopped: moved it on to the newest part']);

  // moved on and playing again: not loaded again
  await loaded('stallone');
  await fakeVideo('stallone');
  await video('stallone', { moving: false });
  await until(async () => (await video('stallone')).set != null);
  await video('stallone', { moving: true });
  await a.win.waitForTimeout(1500);
  assert.ok(await video('stallone'), 'playing again: left as it is');
});

test('streams keep drawing while the window is behind others (Windows\' check for covered windows is off, the views aren\'t slowed down)', T, async () => {
  const r = await a.app.evaluate(({ app, webContents }) => ({
    features: app.commandLine.getSwitchValue('disable-features'),
    views: webContents.getAllWebContents().filter(w => w.getType() === 'webview').map(w => w.getBackgroundThrottling())
  }));
  assert.match(r.features, /\bCalculateNativeWinOcclusion\b/);
  assert.ok(r.views.length && r.views.every(t => t === false), JSON.stringify(r.views));
});
