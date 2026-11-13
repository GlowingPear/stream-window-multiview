// Live checks for saved channels: channel ids, and the watcher that notifies when a channel goes live (each site's own
// checks are in test/unit/main/sites/). Every site is replaced by a fake, so this runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveWatcher, withTimeout, keepLatest, normCh, validCh, platformOf, toTime, firefoxUA, firefoxVersion } = require('../../../src/main/live');

const info = (live, extra = {}) => ({ live, title: live ? 'title' : '', viewers: live ? 5 : null, category: '', name: 'n', checked: 1, ...extra });

test('a channel id: each site\'s own form, and never a name every object already has', () => {
  for (const c of ['nightowl', 'night-owl_2', 'tw:owl', 'yt:@owl.tv', 'yt:c:UCabcdefghijklmnop', 'yt:v:abcdefghijk']) assert.equal(validCh(c), true, c);
  for (const c of ['__proto__', 'constructor', 'prototype', 'tw:__proto__', 'yt:@constructor', 'tw:"><b>', 'yt:v:short', 'a b', '', 'x'.repeat(41)])
    assert.equal(validCh(c), false, c);
});

test('a channel id as it\'s kept (lower case, but YouTube\'s ids keep theirs), and its site\'s name', () => {
  assert.equal(normCh(' NightOwl '), 'nightowl');
  assert.equal(normCh('TW:Owl'), 'tw:owl');
  assert.equal(normCh('YT:V:AbCdEfGhIjK'), 'yt:v:AbCdEfGhIjK');
  assert.equal(normCh('yt:@Owl.TV'), 'yt:@owl.tv');
  assert.deepEqual(['nightowl', 'tw:owl', 'yt:@owl', 'yt:v:abcdefghijk', ''].map(platformOf), ['Kick', 'Twitch', 'YouTube', 'YouTube', 'Kick']);
});

test('a site\'s time: seconds, milliseconds, UTC without a zone, or nothing', () => {
  assert.equal(toTime(1700000000), 1700000000000);
  assert.equal(toTime(1700000000000), 1700000000000);
  assert.equal(toTime('2026-10-11 19:02:11'), Date.UTC(2026, 9, 11, 19, 2, 11));
  for (const v of [null, '', 'soon', -5, NaN]) assert.equal(toTime(v), null, String(v));
});

test('a Firefox identity for sign-in pages that refuse the app: a current version, on this system', () => {
  assert.equal(firefoxVersion(Date.UTC(2024, 6, 9)), 128);
  assert.equal(firefoxVersion(Date.UTC(2025, 6, 9)), 140, 'a new one every 4 weeks');
  assert.match(firefoxUA('darwin', Date.UTC(2025, 6, 9)), /^Mozilla\/5\.0 \(Macintosh; Intel Mac OS X 10\.15; rv:140\.0\) Gecko\/20100101 Firefox\/140\.0$/);
  assert.match(firefoxUA('win32'), /Windows NT 10\.0/);
  assert.match(firefoxUA('linux'), /X11; Linux x86_64/);
});

/* ---------- the watcher ---------- */
function watcher({ batch, one }) {
  const went = [], asked = [];
  const w = createLiveWatcher({
    auto: false, sleep: async () => {},
    fetchBatch: batch, fetchChannel: async ch => { asked.push(ch); return one(ch); },
    onWentLive: (ch, i) => went.push([ch, i.title])
  });
  return { w, went, asked };
}

test('watcher: batch answers, and the rest are checked one at a time', async () => {
  const { w, asked } = watcher({
    batch: async list => ({ results: [['tw:alpha', info(true)], ['tw:gone', { missing: true }]], rest: list.filter(c => !c.startsWith('tw:')) }),
    one: () => info(false)
  });
  w.setChannels(['tw:alpha', 'tw:gone', 'kickone', 'yt:@someone']);
  await w._batchPass();
  assert.equal(w.snapshot()['tw:alpha'].live, true);
  assert.equal(w.snapshot()['tw:gone'].missing, true);
  await w._onePass();
  assert.deepEqual(asked, ['kickone', 'yt:@someone'], 'only what the batch couldn\'t answer');
});

test('watcher: when the batch fails, every channel is checked one at a time', async () => {
  const { w, asked } = watcher({ batch: async () => { throw new Error('offline'); }, one: () => info(false) });
  w.setChannels(['tw:alpha', 'kickone']);
  await w._batchPass(); await w._onePass();
  assert.deepEqual(asked, ['tw:alpha', 'kickone']);
});

test('watcher: going live notifies once, with the title fetched for Kick\'s title-less answer', async () => {
  let live = false;
  const { w, went, asked } = watcher({
    batch: async () => ({ results: [['kickone', live ? { live: true, partial: true, title: '', viewers: 9, category: 'Art', name: '', checked: 1 } : { live: false, partial: true, name: '', checked: 1 }]], rest: [] }),
    one: () => info(true, { title: 'Painting tonight', viewers: null })
  });
  w.setChannels(['kickone']);
  await w._batchPass();
  assert.equal(went.length, 0, 'offline at start');
  assert.equal(w.snapshot().kickone.name, 'kickone', 'a name even without one in the answer');
  live = true;
  await w._batchPass();
  assert.deepEqual(went, [['kickone', 'Painting tonight']]);
  assert.equal(w.snapshot().kickone.viewers, 9, 'viewers from the batch when the single answer has none');
  await w._batchPass(); await w._onePass();
  assert.equal(went.length, 1, 'still live: no second notification');
  assert.deepEqual(asked, ['kickone'], 'the title is kept, not asked for again');
  assert.equal(w.snapshot().kickone.title, 'Painting tonight');
});

test('watcher: channels already live at start get their titles later, one at a time, without notifying', async () => {
  const { w, went, asked } = watcher({
    batch: async () => ({ results: [['a', { live: true, partial: true, title: '', viewers: 1, category: '', name: 'A', checked: 1 }], ['b', { live: false, partial: true, name: 'B', checked: 1 }]], rest: [] }),
    one: () => info(true, { title: 'Hello' })
  });
  w.setChannels(['a', 'b']);
  await w._batchPass();
  assert.equal(w.snapshot().a.title, '');
  await w._onePass();
  assert.deepEqual(asked, ['a'], 'only the live one without a title');
  assert.equal(w.snapshot().a.title, 'Hello');
  assert.equal(went.length, 0);
});

test('watcher: a channel removed while it was being checked is dropped', async () => {
  let w;
  ({ w } = watcher({ batch: async () => { w.setChannels(['b']); return { results: [['a', info(true)], ['b', info(false)]], rest: [] }; }, one: () => null }));
  w.setChannels(['a', 'b']);
  await w._batchPass();
  assert.deepEqual(Object.keys(w.snapshot()), ['b']);
});

test('watcher: "check now" while a check is running checks again right after it, not a minute later', async () => {
  let release, passes = 0;
  const w = createLiveWatcher({
    intervalMs: 600000,
    fetchBatch: list => { passes++; return passes === 1 ? new Promise(r => { release = () => r({ results: [], rest: [] }); }) : { results: list.map(c => [c, info(true)]), rest: [] }; },
    fetchChannel: async () => info(false)
  });
  w.setChannels(['tw:alpha']);                       // starts the first check
  await new Promise(r => setImmediate(r));
  assert.equal(passes, 1);
  w.setChannels(['tw:alpha', 'tw:bravo']);           // a channel added while it runs
  release();
  for (let i = 0; i < 20 && passes < 2; i++) await new Promise(r => setImmediate(r));
  w.stop();
  assert.equal(passes, 2, 'checked again straight away');
  assert.equal(w.snapshot()['tw:bravo'].live, true);
});

test('keepLatest: only the newest things stay, and one added again counts as new', () => {
  const s = new Set();
  [1, 2, 3].forEach(x => keepLatest(s, x, 2));
  assert.deepEqual([...s], [2, 3]);
  keepLatest(s, 2, 2); keepLatest(s, 4, 2);
  assert.deepEqual([...s], [2, 4]);
});

test('withTimeout: the answer when it comes in time, the fallback when it doesn\'t', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'late'), 'ok');
  assert.equal(await withTimeout(new Promise(() => {}), 5, 'late'), 'late', 'never answers');
  await assert.rejects(withTimeout(Promise.reject(new Error('down')), 50, 'late'), /down/, 'a failure is still a failure');
});

test('watcher: a batch that never answers counts as failed, and every channel is checked one at a time', async () => {
  const asked = [];
  const w = createLiveWatcher({ auto: false, sleep: async () => {}, batchTimeoutMs: 5,
    fetchBatch: () => new Promise(() => {}), fetchChannel: async ch => { asked.push(ch); return info(false); } });
  w.setChannels(['tw:alpha', 'kickone']);
  await w._batchPass(); await w._onePass();
  assert.deepEqual(asked, ['tw:alpha', 'kickone']);
  assert.equal(w.snapshot()['tw:alpha'].live, false);
});

test('watcher: a channel that never answers doesn\'t hold up the rest', async () => {
  const w = createLiveWatcher({ auto: false, sleep: async () => {}, oneTimeoutMs: 5,
    fetchChannel: async ch => ch === 'stuck' ? new Promise(() => {}) : info(true) });
  w.setChannels(['stuck', 'kickone']);
  await w._onePass();
  assert.equal(w.snapshot().kickone.live, true);
  assert.equal(w.snapshot().stuck, undefined, 'no answer: nothing known yet');
});

test('watcher: an answer that comes after the time limit is ignored', async () => {
  let late;
  const w = createLiveWatcher({ auto: false, sleep: async () => {}, batchTimeoutMs: 5,
    fetchBatch: () => new Promise(r => { late = r; }), fetchChannel: async () => info(false) });
  w.setChannels(['tw:alpha']);
  await w._batchPass(); await w._onePass();
  late({ results: [['tw:alpha', info(true)]], rest: [] });
  await new Promise(r => setImmediate(r));
  assert.equal(w.snapshot()['tw:alpha'].live, false, 'the one-at-a-time answer stands');
});

test('watcher: after a batch gets stuck, the checks keep running and "check now" still works', async () => {
  let passes = 0;
  const w = createLiveWatcher({ intervalMs: 600000, batchIntervalMs: 600000, batchTimeoutMs: 10, spacingMs: 0,
    fetchBatch: list => { passes++; return passes === 1 ? new Promise(() => {}) : { results: list.map(c => [c, info(true)]), rest: [] }; },
    fetchChannel: async () => info(true) });
  w.setChannels(['tw:alpha']);                       // starts the first check, which never answers
  for (let i = 0; i < 200 && !w.snapshot()['tw:alpha']; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(w.snapshot()['tw:alpha'].live, true, 'checked one at a time after the time limit');
  w.checkSoon();
  for (let i = 0; i < 200 && passes < 2; i++) await new Promise(r => setTimeout(r, 5));
  w.stop();
  assert.equal(passes, 2, 'the batch loop runs again on "check now"');
});
