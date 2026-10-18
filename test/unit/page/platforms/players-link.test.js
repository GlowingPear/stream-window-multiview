// Kick players while a linked Pear Drops farms (src/page/platforms/players-link.js): when they sign out, when they
// sign back in, what Pear Drops is told, and your own Kick choice kept while Auto has it.
const test = require('node:test');
const assert = require('node:assert/strict');

let L;
test.before(async () => { L = await import('../../../../src/page/platforms/players-link.js'); });
const farming = (user = 'pearfan', state = 'farming') => ({ state, account: user ? { platform: 'kick', user } : null, channel: { platform: 'kick', slug: 'pixelpear' } });

test('needOut: only while Auto is on and Pear Drops is farming, and not with another Kick account', () => {
  assert.equal(L.needOut({ auto: true, farming: farming(), mine: 'pearfan' }), true);
  assert.equal(L.needOut({ auto: true, farming: farming('PearFan'), mine: 'pearfan' }), true, 'names in other capitals are the same account');
  assert.equal(L.needOut({ auto: false, farming: farming(), mine: 'pearfan' }), false, 'Auto off');
  assert.equal(L.needOut({ auto: true, farming: null, mine: 'pearfan' }), false, 'not linked');
  assert.equal(L.needOut({ auto: true, farming: farming('otherfan'), mine: 'pearfan' }), false, 'another account: no conflict');
  assert.equal(L.needOut({ auto: true, farming: farming(null), mine: 'pearfan' }), true, 'its account unknown: out, to be safe');
  assert.equal(L.needOut({ auto: true, farming: farming('pearfan'), mine: '' }), true, 'not logged in here: out');
  for (const state of ['waiting', 'paused', 'done', 'signed-out', 'a-state-from-later'])
    assert.equal(L.needOut({ auto: true, farming: farming('pearfan', state), mine: 'pearfan' }), false, state + ' is not farming');
});

test('nextKickOut: out at once, back in only after the wait, and nothing reloads when farming comes back in time', () => {
  const WAIT = 300_000;
  let s = { out: false, backAt: null };
  s = L.nextKickOut(s, true, 0, WAIT);
  assert.deepEqual(s, { out: true, backAt: null, remount: true }, 'signed out at once');
  s = L.nextKickOut(s, true, 10, WAIT);
  assert.equal(s.remount, false, 'still farming: nothing to do');
  s = L.nextKickOut(s, false, 1000, WAIT);
  assert.deepEqual(s, { out: true, backAt: 1000 + WAIT, remount: false }, 'stopped: the wait starts, still out');
  s = L.nextKickOut(s, false, 2000, WAIT);
  assert.deepEqual(s, { out: true, backAt: 1000 + WAIT, remount: false }, 'asked again during the wait: the same end');
  const resumed = L.nextKickOut(s, true, 5000, WAIT);
  assert.deepEqual(resumed, { out: true, backAt: null, remount: false }, 'farming again within the wait: no reload');
  s = L.nextKickOut(s, false, 1000 + WAIT, WAIT);
  assert.deepEqual(s, { out: false, backAt: null, remount: true }, 'the wait is over: back in');
  assert.deepEqual(L.nextKickOut(s, false, 9e9, WAIT), { out: false, backAt: null, remount: false }, 'in, and nothing needs it: nothing to do');
  assert.equal(L.nextKickOut({ out: true, backAt: null }, false, 0).backAt, L.SIGN_BACK_IN_MS, '5 minutes by default');
  assert.equal(L.SIGN_BACK_IN_MS, 300_000);
});

test('effectiveSignedIn: your own choice, except Kick while Auto is on', () => {
  const watch = { kick: false, twitch: true, youtube: false };
  assert.equal(L.effectiveSignedIn('kick', { auto: false, out: true, watch }), false, 'Auto off: your choice');
  assert.equal(L.effectiveSignedIn('kick', { auto: true, out: false, watch }), true, 'Auto: signed in unless out');
  assert.equal(L.effectiveSignedIn('kick', { auto: true, out: true, watch }), false);
  assert.equal(L.effectiveSignedIn('twitch', { auto: true, out: true, watch }), true, 'other sites are left alone');
  assert.equal(L.effectiveSignedIn('youtube', { auto: true, out: false, watch }), false);
});

test('playersReport: what players.changed says about Kick (signed in now, the mode, the account, the open streams)', () => {
  const watch = { kick: true, twitch: false, youtube: false };
  assert.deepEqual(L.playersReport({ auto: true, out: true, watch, mine: 'pearfan', open: ['pixelpear', 'retrorally', 'pixelpear', ''] }), {
    platforms: { kick: { signedIn: false, mode: 'auto', account: { platform: 'kick', user: 'pearfan' }, open: [{ platform: 'kick', slug: 'pixelpear' }, { platform: 'kick', slug: 'retrorally' }] } }
  });
  assert.deepEqual(L.playersReport({ auto: false, out: false, watch, mine: '', open: [] }).platforms.kick, { signedIn: true, mode: 'signed-in', account: null, open: [] });
  assert.equal(L.playersReport({ auto: false, out: false, watch: { ...watch, kick: false }, mine: '', open: [] }).platforms.kick.mode, 'signed-out');
  assert.equal(L.playersReport({ auto: true, out: false, watch, mine: '', open: Array.from({ length: 150 }, (_, i) => 'ch' + i) }).platforms.kick.open.length, 100, 'at most 100 (the schema)');
});

test('autoSwitched: Auto keeps your Kick choice, and gives it back when it goes off', () => {
  assert.deepEqual(L.autoSwitched(false, true, true, null), { watchKick: true, before: true }, 'on: kept');
  assert.deepEqual(L.autoSwitched(false, true, false, null), { watchKick: false, before: false });
  assert.deepEqual(L.autoSwitched(true, false, false, true), { watchKick: true, before: null }, 'off: given back');
  assert.deepEqual(L.autoSwitched(true, false, true, null), { watchKick: true, before: null }, 'nothing kept: left as it is');
  assert.deepEqual(L.autoSwitched(true, true, true, false), { watchKick: true, before: false }, 'no change: nothing happens');
  assert.deepEqual(L.autoSwitched(false, false, true, null), { watchKick: true, before: null });
});
