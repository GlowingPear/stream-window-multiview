// The page's timers (src/page/shared/timers.js): a debounce, and a window's own timers.
const test = require('node:test');
const assert = require('node:assert/strict');

let T;
test.before(async () => { T = await import('../../../../src/page/shared/timers.js'); });

test('soon: runs once, after the last call has been quiet for its wait; cancel drops it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let n = 0;
  const save = T.soon(() => n++, 600);
  save(); t.mock.timers.tick(400); save(); t.mock.timers.tick(400);
  assert.equal(n, 0, 'still being called');
  t.mock.timers.tick(200);
  assert.equal(n, 1);
  save(); save.cancel(); t.mock.timers.tick(1000);
  assert.equal(n, 1, 'cancelled');
});

test('a window\'s timers: starting one again restarts it, and closing the window stops them all', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = {}, ran = [];
  T.winTimer(w, 'anim', () => ran.push('anim'), 260);
  T.winTimer(w, 'yt', () => ran.push('yt'), 120000);
  t.mock.timers.tick(200);
  T.winTimer(w, 'anim', () => ran.push('anim again'), 260);
  t.mock.timers.tick(260);
  assert.deepEqual(ran, ['anim again']);
  assert.deepEqual(Object.keys(w.timers), ['yt'], 'a timer that ran is gone');
  T.stopWinTimer(w, 'yt');
  T.winTimer(w, 'yt', () => ran.push('yt'), 120000);
  T.stopWinTimers(w);
  t.mock.timers.tick(200000);
  assert.deepEqual(ran, ['anim again'], 'closed: nothing left to run');
  assert.deepEqual(w.timers, {});
});
