// Why a stream is paused (src/page/windows/pause-state.js): three reasons at once, and the events that change them.
const test = require('node:test');
const assert = require('node:assert/strict');

let P, E;
test.before(async () => { P = await import('../../../../src/page/windows/pause-state.js'); E = P.pauseEvents; });
const run = (s, ...events) => events.reduce((st, [name, arg]) => E[name](st, arg), s);

test('a new stream plays; each reason pauses it, and says why', () => {
  assert.equal(P.isPausedBy(P.PLAYING), false);
  assert.equal(P.pauseWhy(P.PLAYING), '');
  assert.equal(P.pauseWhy(E.youPause(P.PLAYING)), 'you');
  assert.equal(P.pauseWhy(E.focusPause(P.PLAYING, true)), 'focus');
  assert.equal(P.pauseWhy(E.hiddenLong(P.PLAYING)), 'auto');
  // several at once: yours first, then focus
  const all = run(P.PLAYING, ['hiddenLong'], ['focusPause', true], ['youPause']);
  assert.deepEqual([P.isPausedBy(all), P.pauseWhy(all)], [true, 'you']);
  assert.equal(P.pauseWhy(run(P.PLAYING, ['hiddenLong'], ['focusPause', true])), 'focus');
});

test('each option only undoes its own pause', () => {
  const s = run(P.PLAYING, ['youPause'], ['hiddenLong']);
  assert.equal(P.isPausedBy(E.shown(s)), true, 'shown again: still paused by you');
  assert.equal(P.isPausedBy(E.focusPause(E.focusPause(s, true), false)), true);
  assert.equal(P.isPausedBy(E.shown(E.hiddenLong(P.PLAYING))), false);
});

test('playing it yourself clears every reason, and the options leave it alone until focus moves to it or it\'s shown', () => {
  let s = run(P.PLAYING, ['focusPause', true], ['hiddenLong'], ['youPause'], ['youPlay']);
  assert.equal(P.isPausedBy(s), false);
  assert.equal(E.hiddenLong(s), s, 'still hidden: auto-pause leaves it playing');
  assert.equal(s.focusExempt, true, 'Pause all except focus skips it (the caller asks for focusPause only when it isn\'t exempt)');
  s = E.shown(s);
  assert.equal(P.pauseWhy(E.hiddenLong(s)), 'auto', 'hidden again after being shown: auto-pause applies again');
  s = E.focusReset(s);
  assert.equal(s.focusExempt, false, 'the big stream, or the option switched: it applies again');
});

test('an event that changes nothing gives the same state back (so the player isn\'t told again)', () => {
  const s = P.PLAYING;
  assert.equal(E.focusPause(s, false), s);
  assert.equal(E.focusReset(s), s);
  assert.equal(E.shown(s), s);
  const a = E.hiddenLong(s);
  assert.equal(E.hiddenLong(a), a);
});

test('mini previews keep playing while only their stream is hidden', () => {
  assert.equal(P.miniPausedBy(E.hiddenLong(P.PLAYING)), false);
  assert.equal(P.miniPausedBy(E.focusPause(P.PLAYING, true)), true);
  assert.equal(P.miniPausedBy(E.youPause(P.PLAYING)), true);
});
