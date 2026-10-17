// Extend across monitors in the real app, with three made-up monitors: a layout's streams go in the Streams window on
// their monitor and its switch control in its own window on another, another layout brings them back, unplugging a
// monitor puts everything on one, and plugging it back puts them on their monitors again. Identify shows a number on
// each monitor for a moment.
const test = require('node:test');
const { launchApp, assert, openChannel } = require('../app');

// The made-up monitors: the main one where the app's window is, one on its right, one on its left a bit lower.
const DISPLAYS = [
  { id: 101, label: 'Main', bounds: { x: 0, y: 0, width: 1600, height: 900 }, workArea: { x: 0, y: 0, width: 1600, height: 860 }, scaleFactor: 1 },
  { id: 102, label: 'Right', bounds: { x: 1600, y: 0, width: 1280, height: 800 }, workArea: { x: 1600, y: 0, width: 1280, height: 760 }, scaleFactor: 1 },
  { id: 103, label: 'Left', bounds: { x: -1280, y: 100, width: 1280, height: 1024 }, workArea: { x: -1280, y: 100, width: 1280, height: 984 }, scaleFactor: 1 }
];

let a;
test.before(async () => {
  a = await launchApp();
  await a.app.evaluate(({ screen, BrowserWindow }, displays) => {
    global.fakeDisplays = displays;
    const inside = (d, p) => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width && p.y >= d.bounds.y && p.y < d.bounds.y + d.bounds.height;
    screen.getAllDisplays = () => global.fakeDisplays;
    screen.getPrimaryDisplay = () => global.fakeDisplays[0];
    screen.getDisplayMatching = r => { const p = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; return global.fakeDisplays.find(d => inside(d, p)) || global.fakeDisplays[0]; };
    // maximizing would put a window back on a real monitor: windows keep the place the app gives them
    const proto = BrowserWindow.prototype;
    proto.maximize = function () {}; proto.unmaximize = function () {}; proto.isMaximized = function () { return false; };
    const main = BrowserWindow.getAllWindows().find(w => /index\.html$/.test(w.webContents.getURL()));
    main.setBounds({ x: 100, y: 50, width: 1400, height: 800 });
  }, DISPLAYS);
  await openChannel(a.win, 'alpha');
  await openChannel(a.win, 'bravo');
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// The app's windows and the monitor each one is on
const where = () => a.app.evaluate(({ BrowserWindow, screen }) => {
  const kind = u => /role=streams/.test(u) ? 'streams' : /switcher\.html/.test(u) ? 'switch' : /index\.html/.test(u) ? 'main' : /^data:/.test(u) ? 'identify' : 'other';
  const out = {};
  for (const w of BrowserWindow.getAllWindows()) { if (w.isDestroyed()) continue; const k = kind(w.webContents.getURL()); (out[k] = out[k] || []).push(screen.getDisplayMatching(w.getBounds()).id); }
  return out;
});
async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await fn(); if (last === true) return; await new Promise(r => setTimeout(r, 200)); }
  assert.fail(`${what} (last: ${JSON.stringify(last)})`);
}
const placed = want => until(async () => { const w = await where(); return ['main', 'streams', 'switch'].every(k => JSON.stringify(w[k] || []) === JSON.stringify(want[k] || [])) || w; }, `windows on ${JSON.stringify(want)}`);
// a layout from the Layout menu, and wait until it's the one in use
async function layout(l) {
  await a.win.click('#layoutBtn'); await a.win.click(`#layoutMenu button[data-l=${l}]`);
  await a.win.waitForFunction(l => document.querySelector(`#layoutMenu button[data-l=${l}]`).classList.contains('on'), l, { timeout: 10000 });
}

test('Monitors: Tile\'s streams on the right monitor and its switch control on the left, and back for another layout', { timeout: 90000 }, async () => {
  await layout('tile');
  await a.win.evaluate(() => window.openSettings('layouts'));
  await a.win.click('#lyTabs [data-t=monitors]');
  await a.win.waitForSelector('#moMap .mo-mon');
  assert.equal(await a.win.locator('#moMap .mo-mon').count(), 3);
  assert.deepEqual(await a.win.$$eval('#moMap .mo-mon b', l => l.map(b => b.textContent)), ['1', '2', '3']);
  assert.ok(await a.win.$eval('#moMap .mo-mon.here', e => e.textContent.startsWith('2')), 'this window is on the main one, number 2');
  await a.win.selectOption('#moTable .mo-row[data-l=tile] select[data-part=streams]', '102');
  await a.win.selectOption('#moTable .mo-row[data-l=tile] select[data-part=switch]', '103');
  await placed({ main: [101], streams: [102], switch: [103] });
  await a.win.waitForFunction(() => !document.querySelector('#stage .win.stream'), null, { timeout: 15000 });   // the streams left this window
  // Columns has nothing set: the streams come back, and the switch control goes back the way it was
  await a.win.keyboard.press('Escape');
  await layout('columns');
  await placed({ main: [101] });
  await a.win.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 2, null, { timeout: 15000 });
  // Tile again: out to their monitors again
  await layout('tile');
  await placed({ main: [101], streams: [102], switch: [103] });
});

test('Monitors: the chats\' monitor moves this window there', { timeout: 60000 }, async () => {
  await a.win.evaluate(() => window.openSettings('layouts'));
  await a.win.click('#lyTabs [data-t=monitors]');
  await a.win.selectOption('#moTable .mo-row[data-l=tile] select[data-part=chats]', '103');
  await placed({ main: [103], streams: [102] });                  // the switch control is on the chats' monitor: back in this window
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.switchMode')), 'dock', 'the way it was before');
  await a.win.selectOption('#moTable .mo-row[data-l=tile] select[data-part=chats]', '101');
  await a.win.selectOption('#moTable .mo-row[data-l=tile] select[data-part=switch]', '103');
  await placed({ main: [101], streams: [102], switch: [103] });
  await a.win.keyboard.press('Escape');
});

test('Monitors: unplugging one puts everything on one monitor, and plugging it back puts them on their monitors again', { timeout: 90000 }, async () => {
  const plugBack = () => a.app.evaluate(({ screen }) => {
    if (!global.gone || global.fakeDisplays.includes(global.gone)) return;
    global.fakeDisplays = [...global.fakeDisplays, global.gone]; screen.emit('display-added', {}, global.gone);
  });
  try {
    await a.app.evaluate(({ screen }) => { const gone = global.fakeDisplays.find(d => d.id === 102); global.fakeDisplays = global.fakeDisplays.filter(d => d !== gone); global.gone = gone; screen.emit('display-removed', {}, gone); });
    await placed({ main: [101] });
    await a.win.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 2, null, { timeout: 15000 });
    await plugBack();
    await placed({ main: [101], streams: [102], switch: [103] });
  } finally { await plugBack(); }                                 // (the next test needs all three, even when this one fails)
});

test('Monitors: Identify shows a number on each monitor for a moment', { timeout: 30000 }, async () => {
  const ids = JSON.stringify(await a.app.evaluate(({ screen }) => screen.getAllDisplays().map(d => d.id).sort()));
  let most = [];                                                  // the most numbers seen at once (they go after 2.5 s)
  await a.win.evaluate(() => window.kmv.identifyMonitors());
  await until(async () => {
    const seen = ((await where()).identify || []).sort();
    if (seen.length > most.length) most = seen;
    return JSON.stringify(seen) === ids || { want: ids, most };
  }, 'a number on each monitor');
  await until(async () => !(await where()).identify || 'still there', 'gone again', 6000);
});
