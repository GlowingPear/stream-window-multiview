// A stream that ends (Settings › Windows › Close a channel's windows when its stream ends): a channel seen live
// while its windows are open, then offline for the setting's minutes, has its stream and chat closed, and the
// layout fits around what's left. The live checks are given with the page's liveStatus (as the app's arrive).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, windows, settled } = require('../app');
const { openApp } = setup();

const live = (page, on) => page.evaluate(on => window.smvNotes.liveStatus(Object.fromEntries(Object.entries(on).map(([ch, l]) => [ch, { live: l }]))), on);
const look = page => page.evaluate(() => window.lookEnded());
const titles = async page => (await windows(page)).map(w => w.kind + ':' + w.title).sort();
const streams = async page => (await windows(page)).filter(w => w.kind === 'stream').sort((p, q) => p.y - q.y || p.x - q.x);
// Auto layout, locked or not, and the setting (minutes; endedTimes.minute is 0, so "1 minute" is at the next look)
async function open(t, { minutes = 1, lock = true, fit = false } = {}){
  const page = await openApp(t, { init: `if (window === top){ localStorage.setItem('kickMultiview.closeEnded', '${minutes}');` + (fit ? `localStorage.setItem('kickMultiview.autoFit', '1');` : '') + '}' });   // (not in the windows' frames)
  await add(page, 'alpha', 'bravo', 'charlie');
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=auto]');
  await settled(page);
  if (lock) await page.keyboard.press('Shift+L');
  await page.evaluate(() => { window.endedTimes.minute = 0; });
  return page;
}

test('Settings › Windows: the setting, Never by default, remembered', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('windows', { sub: 'general' }));
  assert.equal(await page.inputValue('#closeEndedSet'), '0', 'Never');
  assert.match(await page.textContent('.st-pane[data-s="windows"] .st-row:has(#closeEndedSet) .st-t'), /Close a channel's windows when its stream ends/);
  await page.selectOption('#closeEndedSet', '5');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.closeEnded')), '5');
  await page.selectOption('#closeEndedSet', '0');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.closeEnded')), null, 'Never: not kept');
});

test('a stream that ends closes its stream and chat, and the locked Auto layout fits around what is left', async t => {
  const page = await open(t);
  await live(page, { alpha: true, bravo: true, charlie: true });
  const before = await streams(page);
  await live(page, { alpha: true, bravo: false, charlie: true });   // seen offline: the time starts
  await look(page); await settled(page);
  assert.deepEqual(await titles(page), ['chat:alpha', 'chat:charlie', 'stream:alpha', 'stream:charlie']);
  const after = await streams(page);
  assert.deepEqual(after.map(w => w.title), ['alpha', 'charlie']);
  assert.ok(after[1].y < before[2].y && after[1].h > before[1].h, 'charlie moved up into the room, bigger');
  assert.match(await page.textContent('#toast'), /bravo's stream ended: closed their windows/);
  await page.click('#toast button');                                 // Undo
  await settled(page);
  assert.deepEqual((await streams(page)).map(w => w.title), ['alpha', 'bravo', 'charlie'], 'Undo brings them back, fitted in');
});

test('back live before the time is up, opened while offline, or Never: the windows stay', async t => {
  const page = await open(t, { minutes: 5 });
  await page.evaluate(() => { window.endedTimes.minute = 60000; });
  await live(page, { alpha: true, bravo: true });                    // charlie: offline when it opened
  await live(page, { alpha: true, bravo: false, charlie: false });
  await look(page);
  await live(page, { alpha: true, bravo: true, charlie: false });    // bravo's back
  await page.evaluate(() => { window.endedTimes.minute = 0; });
  await look(page);
  assert.equal((await windows(page)).length, 6, 'nothing closed');
  await live(page, { alpha: true, bravo: false, charlie: false });   // bravo ends again: from now
  await look(page);
  assert.deepEqual(await titles(page), ['chat:alpha', 'chat:charlie', 'stream:alpha', 'stream:charlie'], 'charlie stays: it was never live');
  await page.evaluate(() => { const s = document.querySelector('#closeEndedSet'); s.value = '0'; s.dispatchEvent(new Event('change')); });
  await live(page, { alpha: false });
  await look(page);
  assert.equal((await windows(page)).length, 4, 'Never: alpha stays');
});

test('changed in the other window (or on another computer): this one goes by it', async t => {
  const page = await open(t, { minutes: 0 });
  await page.evaluate(() => { localStorage.setItem('kickMultiview.closeEnded', '2'); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.closeEnded', newValue: '2' })); });
  assert.equal(await page.$eval('#closeEndedSet', s => s.value), '2');
  await live(page, { alpha: true, bravo: true, charlie: true });
  await live(page, { alpha: true, bravo: true, charlie: false });
  assert.deepEqual((await streams(page)).map(w => w.title), ['alpha', 'bravo'], 'on: charlie closed');
});

// A linked streamer: their windows (every tab) close once none of their accounts is live, not after a raid
const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala'] };
async function linked(t){
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); localStorage.setItem('kickMultiview.streamers', ${JSON.stringify(JSON.stringify([STREAMER]))}); localStorage.setItem('kickMultiview.linkedOn', '1'); localStorage.setItem('kickMultiview.closeEnded', '1'); }` });
  await add(page, 'quietkoala', 'alpha');
  await page.evaluate(() => { window.endedTimes.minute = 0; });
  await live(page, { quietkoala: true, 'tw:quietkoala': true, alpha: true });
  return page;
}
const theirs = async page => (await page.evaluate(() => window.openWins().map(w => w.channel))).filter(c => /quietkoala/.test(c));

test('a linked streamer: open while another of their accounts is live; closed once none is', async t => {
  const page = await linked(t);
  assert.ok((await theirs(page)).length);
  await live(page, { quietkoala: false, 'tw:quietkoala': true, alpha: true });
  assert.ok((await theirs(page)).length, 'Twitch is still live');
  await live(page, { quietkoala: false, 'tw:quietkoala': false, alpha: true });
  assert.deepEqual(await theirs(page), [], 'every tab closed');
  assert.match(await page.textContent('#toast'), /quietkoala's stream ended/);
});

test('a raid from the channel: not an ended stream (a linked streamer\'s tab you weren\'t watching raided: they stay)', async t => {
  const page = await linked(t);
  const before = await theirs(page);
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:pixelmoth', true));
  await live(page, { quietkoala: false, 'tw:quietkoala': false, alpha: true });
  assert.deepEqual(await theirs(page), before, 'they stay');
});

test('unlocked Auto layout with Fit in channels that open by themselves: fits around them too', async t => {
  const page = await open(t, { lock: false, fit: true });
  await live(page, { alpha: true, bravo: true, charlie: true });
  const before = await streams(page);
  await live(page, { alpha: true, bravo: true, charlie: false });
  await look(page); await settled(page);
  const after = await streams(page);
  assert.deepEqual(after.map(w => w.title), ['alpha', 'bravo']);
  assert.ok(after[0].h > before[0].h, 'the others got bigger');
});
