// Settings > Layouts > Monitors, and putting a layout's parts on their monitors, with a stand-in desktop app: three
// monitors like a real desk, and a record of what the page asks the app to do.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, press } = require('../app');
const { openApp } = setup();

const MONS = [
  { id: 3, n: 1, label: '', primary: false, x: -1920, y: 80, w: 1280, h: 720, work: { x: -1920, y: 80, width: 1280, height: 680 }, scale: 1, portrait: false },
  { id: 1, n: 2, label: 'Main', primary: true, x: 0, y: 0, w: 1920, h: 1080, work: { x: 0, y: 0, width: 1920, height: 1040 }, scale: 1, portrait: false },
  { id: 2, n: 3, label: 'Side', primary: false, x: 1920, y: -46, w: 1080, h: 1920, work: { x: 1920, y: -46, width: 1080, height: 1880 }, scale: 1, portrait: true }
];
// the stand-in app: places parts like the real one (a saved monitor by its id; empty: with the chats)
const fakeApp = mons => {
  window.calls = [];
  window.mons = mons;
  const log = (name, ...a) => window.calls.push([name, ...a]);
  window.kmv = {
    monitors: () => Promise.resolve({ monitors: window.mons, main: 1 }),
    applyMonitors: (parts, together) => {
      log('apply', JSON.parse(JSON.stringify(parts)), together);
      const has = k => !k || window.mons.some(m => m.id === k.id);
      if (!has(parts.chats) || !has(parts.streams) || !has(parts.switch)) return Promise.resolve({ chats: 1, streams: 1, switch: 1, missing: true });
      const chats = parts.chats ? parts.chats.id : 1;
      return Promise.resolve({ chats, streams: parts.streams ? parts.streams.id : chats, switch: parts.switch ? parts.switch.id : chats, missing: false });
    },
    identifyMonitors: () => log('identify'),
    openStreams: specs => log('openStreams', specs.map(s => s.channel)),
    closeStreams: () => log('closeStreams'),
    openSwitcher: () => log('openSwitcher'), closeSwitcher: () => log('closeSwitcher'), sendSwitcherState: () => {}
  };
};
async function monitorsTab(t, mons = MONS) {
  const page = await openApp(t, { init: { content: `(${fakeApp})(${JSON.stringify(mons)})` } });
  await page.evaluate(() => window.openSettings('layouts'));
  await page.click('#lyTabs [data-t=monitors]');
  await page.waitForSelector('#moMap .mo-mon');
  return page;
}
const calls = (page, name) => page.evaluate(n => window.calls.filter(c => c[0] === n), name);
const pick = (page, l, part, value) => page.selectOption(`#moTable .mo-row[data-l=${l}] select[data-part=${part}]`, value);

test('Monitors: a picture of the monitors as the system arranges them, and Identify monitors', async t => {
  const page = await monitorsTab(t);
  const mons = await page.$$eval('#moMap .mo-mon', l => l.map(e => ({ t: e.textContent, main: e.classList.contains('main'), here: e.classList.contains('here'), tall: e.classList.contains('tall'), x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight })));
  assert.deepEqual(mons.map(m => m.t), ['11280 × 720', '21920 × 1080main', '31080 × 1920']);
  assert.deepEqual(mons.map(m => [m.main, m.here, m.tall]), [[false, false, false], [true, true, false], [false, false, true]], 'the main one, the one this window is on, and the one on its side');
  assert.ok(mons[0].x < mons[1].x && mons[1].x < mons[2].x, 'left to right');
  assert.ok(mons[2].h > mons[2].w && mons[2].y < mons[1].y, 'the tall one sticks out above');
  assert.ok(mons[1].w > mons[0].w * 1.4, 'to scale');
  await page.click('#moIdentify');
  assert.equal((await calls(page, 'identify')).length, 1);
});

test('Monitors: a row for each layout; picking monitors puts the layout in use on them, and back when nothing is set', async t => {
  const page = await monitorsTab(t);
  await page.keyboard.press('Escape');
  await add(page, 'alpha', 'bravo');
  await press(page, 't');                                         // Tile
  await page.evaluate(() => window.openSettings('layouts'));
  await page.click('#lyTabs [data-t=monitors]');
  const rows = await page.$$eval('#moTable .mo-row[data-l]', l => l.map(r => r.dataset.l));
  assert.deepEqual(rows, await page.$$eval('#layoutMenu .lm-grid button[data-l]', l => l.map(b => b.dataset.l)), 'the layouts of the Layout menu');
  assert.deepEqual(await page.$$eval('#moTable .mo-row[data-l=tile] select[data-part=streams] option', l => l.map(o => o.textContent)),
    ['With the chats', '1 · 1280 × 720', '2 · 1920 × 1080 (main)', '3 · 1080 × 1920']);
  assert.equal(await page.textContent('#moTable .mo-row[data-l=tile] select[data-part=chats] option'), 'Where this window is');
  // Tile's streams on monitor 3: the app is asked to place it, and the streams pop out to the Streams window there
  await pick(page, 'tile', 'streams', '2');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'openStreams'));
  const apply = (await calls(page, 'apply')).pop();
  assert.deepEqual(apply[1], { streams: { id: 2, label: 'Side', x: 1920, y: -46, w: 1080, h: 1920 } });
  assert.equal(apply[2], true, 'put everything back when one is unplugged: on at first');
  assert.deepEqual((await calls(page, 'openStreams'))[0][1], ['alpha', 'bravo']);
  await page.waitForTimeout(500);
  assert.equal((await calls(page, 'closeStreams')).length, 0, 'this window holding only the chats now isn\'t another layout: they stay out');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.monitors'))).layouts, { tile: apply[1] });
  // another layout with nothing set: the streams we popped out come back
  await page.keyboard.press('Escape');
  await press(page, 'c');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'closeStreams'));
  // "With the chats" again: forgotten
  await page.evaluate(() => window.openSettings('layouts'));
  await page.click('#lyTabs [data-t=monitors]');
  await pick(page, 'tile', 'streams', '');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.monitors'))).layouts, {});
});

test('Monitors: unplugging puts everything on one monitor; plugging it back puts the layout on its monitors again', async t => {
  const page = await monitorsTab(t);
  await page.keyboard.press('Escape');
  await add(page, 'alpha');
  await press(page, 't');
  await page.evaluate(() => window.openSettings('layouts'));
  await page.click('#lyTabs [data-t=monitors]');
  await pick(page, 'tile', 'streams', '3');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'openStreams'));
  // monitor 1 goes: the app closed the Streams window itself, so leaving Tile has nothing of ours to bring back
  await page.evaluate(() => { window.mons = window.mons.filter(m => m.id !== 3); window.monitorsChanged({ kind: 'removed', monitors: window.mons, main: 1 }); });
  assert.equal(await page.locator('#moMap .mo-mon').count(), 2, 'the picture shows what\'s there now');
  assert.match(await page.textContent('#moTable .mo-row[data-l=tile] select[data-part=streams]'), /1280 × 720 \(not plugged in\)/);
  assert.equal(await page.$eval('#moTable .mo-row[data-l=tile] select[data-part=streams]', s => s.value), 'gone');
  await pick(page, 'tile', 'streams', 'gone');                   // (picking it changes nothing)
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.monitors'))).layouts.tile);
  // back: asked to place Tile again
  const before = (await calls(page, 'apply')).length;
  await page.evaluate(m => { window.mons = m; window.monitorsChanged({ kind: 'added', monitors: m, main: 1 }); }, MONS);
  await page.waitForFunction(n => window.calls.filter(c => c[0] === 'apply').length > n, before);
  // the box off: saved, and the layout placed again with it
  await page.uncheck('#moTogether');
  await page.waitForFunction(() => window.calls.filter(c => c[0] === 'apply').pop()[2] === false);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.monitors'))).together, false);
});

test('Monitors: only in the desktop app', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('layouts'));
  assert.equal(await page.locator('#lyTabs [data-t=monitors]').count(), 0);
  assert.equal(await page.locator('#moMap').count(), 0);
});
