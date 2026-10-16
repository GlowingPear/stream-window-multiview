// The background profile queue (src/profile-queue.js): who gets fetched, how soon, and how often.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileQueue, DAY } = require('../../../src/main/profile-queue');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
async function settle(q) { for (let i = 0; i < 200 && q.busy(); i++) await tick(5); }

// A queue with a fake clock and a fake site: fetching sets the channel's "last looked at" time.
function make(o = {}) {
  let t = 1e12;
  const at = { ...(o.at || {}) }, calls = [];
  const q = createProfileQueue({
    now: () => t,
    infoAt: ch => at[ch],
    fetch: async ch => { calls.push(ch); if (o.fail && o.fail.includes(ch)) return null; at[ch] = t; return { name: ch }; },
    soonGap: 1, slowGap: 1, ...o.opts
  });
  return { q, calls, at, advance: ms => { t += ms; } };
}

test('at start-up, saved channels it knows nothing about (or not for a week) are fetched; recent ones are not', async () => {
  const { q, calls } = make({ at: { fresh: 1e12 - DAY, old: 1e12 - 8 * DAY } });
  q.setSaved(['new1', 'fresh', 'old', 'new2']);
  await settle(q);
  assert.deepEqual(calls, ['new1', 'old', 'new2']);
  q.setSaved(['new1', 'fresh', 'old', 'new2']);         // the same list again (a setting changed): nothing to do
  await settle(q);
  assert.equal(calls.length, 3);
  q.stop();
});

test('a channel saved later, or a whole import, goes before the slow fill', async () => {
  const { q, calls } = make({ opts: { slowGap: 60, soonGap: 1 } });
  q.setSaved(['a1', 'a2', 'a3']);
  await tick(10);                                         // a1 fetched, waiting out the slow gap
  q.setSaved(['a1', 'a2', 'a3', 'imp1', 'imp2']);
  await settle(q);
  assert.deepEqual(calls, ['a1', 'imp1', 'imp2', 'a2', 'a3']);
  q.stop();
});

test('a channel saved then removed before its turn is not fetched', async () => {
  const { q, calls } = make({ opts: { slowGap: 30 } });
  q.setSaved(['a1', 'gone']);
  await tick(5);
  q.setSaved(['a1']);
  await settle(q);
  assert.deepEqual(calls, ['a1']);
  q.stop();
});

test('going live fetches once (not on every check), at most once a day', async () => {
  const { q, calls, advance } = make({ at: { star: 1e12 - 2 * DAY + 1, other: 1e12 } });
  q.setSaved(['star', 'other']);
  await settle(q);
  assert.deepEqual(calls, [], 'both looked at within the week');
  const live = { star: { live: true }, other: { live: false }, notsaved: { live: true } };
  q.sawLive(live);
  await settle(q);
  assert.deepEqual(calls, ['star'], 'only the saved one that went live');
  q.sawLive(live); q.sawLive(live);
  await settle(q);
  assert.equal(calls.length, 1, 'still live: nothing new');
  q.sawLive({ star: { live: false } });
  q.sawLive({ star: { live: true } });                    // back live the same day
  await settle(q);
  assert.equal(calls.length, 1, 'already looked at today');
  advance(DAY + 1);
  q.sawLive({ star: { live: false } });
  q.sawLive({ star: { live: true } });
  await settle(q);
  assert.deepEqual(calls, ['star', 'star'], 'a day later: again');
  q.sawLive({ other: { live: true, missing: true } });
  await settle(q);
  assert.equal(calls.length, 2, 'a channel that is not found does not count as live');
  q.stop();
});

test('a failed fetch waits an hour before trying again', async () => {
  const { q, calls, advance } = make({ fail: ['down'] });
  q.setSaved(['down']);
  await settle(q);
  q.addStale(); q.sawLive({ down: { live: true } });
  await settle(q);
  assert.deepEqual(calls, ['down']);
  advance(61 * 60e3);
  q.addStale();
  await settle(q);
  assert.deepEqual(calls, ['down', 'down']);
  q.stop();
});

test('one at a time, and soon ones still wait the soon gap after a slow one', async () => {
  let active = 0, most = 0;
  const times = [];
  const q = createProfileQueue({
    infoAt: () => null, soonGap: 40, slowGap: 400,
    fetch: async ch => { active++; most = Math.max(most, active); times.push([ch, Date.now()]); await tick(5); active--; return {}; }
  });
  q.setSaved(['s1', 's2']);
  await tick(15);                                         // s1 done, waiting 400 ms before s2
  q.setSaved(['s1', 's2', 'new']);                        // "new" wakes it, but not sooner than 40 ms after s1
  await tick(120);
  assert.deepEqual(times.map(x => x[0]), ['s1', 'new']);
  assert.ok(times[1][1] - times[0][1] >= 40, 'waited the soon gap');
  assert.equal(most, 1);
  q.stop();
  await tick(5);
  assert.equal(q.busy(), false, 'stop ends the wait');
  assert.deepEqual(q.pending().slow, ['s2']);
});

test('nothing before the first saved list, and a fetch that throws counts as failed', async () => {
  const calls = [];
  const q = createProfileQueue({ infoAt: () => null, soonGap: 1, slowGap: 1, fetch: async ch => { calls.push(ch); throw new Error('net'); } });
  q.sawLive({ x1: { live: true } }); q.addStale();
  await tick(5);
  assert.deepEqual(calls, []);
  q.setSaved(['x1']);
  await settle(q);
  q.setSaved('not a list');
  q.setSaved(['x1']);                                      // re-added: failed a moment ago, so not yet
  await settle(q);
  assert.deepEqual(calls, ['x1']);
  q.stop();
});
