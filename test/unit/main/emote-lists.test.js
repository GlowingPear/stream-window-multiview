// New emotes (src/emote-lists.js): reading each site's emote list, and which emotes count as new.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKickEmotes, parseTwitchEmotes, parse7tv, parseBttv, parseFfz, createEmoteStore, KEEP_NEW } = require('../../../src/main/emote-lists');

test('reading the emote lists', () => {
  assert.deepEqual(parseKickEmotes([
    { slug: 'Alpha', user_id: 42, emotes: [{ name: 'pearHype' }, { name: 'pearWave' }, { name: '' }, null] },
    { id: 'Global', name: 'Global', emotes: [{ name: 'KEKW' }] },
    { id: 'Emoji', name: 'Emojis', emotes: [{ name: 'emojiSmile' }] }
  ], 'alpha'), { names: ['pearHype', 'pearWave'], userId: '42' });
  assert.deepEqual(parseKickEmotes([{ id: 'Global', emotes: [{ name: 'KEKW' }] }], 'alpha'), { names: [], userId: null }, 'no emotes of its own');
  assert.equal(parseKickEmotes({ message: 'Not found' }, 'alpha'), null);

  assert.deepEqual(parseTwitchEmotes({ data: { user: { id: '7', subscriptionProducts: [{ emotes: [{ token: 'oakCozy' }, { token: 'oakHi' }] }, { emotes: [{ token: 'oakCozy' }] }, null] } } }),
    { names: ['oakCozy', 'oakHi'], userId: '7' });
  assert.deepEqual(parseTwitchEmotes({ data: { user: { id: '7', subscriptionProducts: null } } }), { names: [], userId: '7' });
  assert.equal(parseTwitchEmotes({ data: { user: null } }), null, 'no such channel');
  assert.equal(parseTwitchEmotes(null), null);

  assert.deepEqual(parse7tv({ emote_set: { emotes: [{ name: 'catJam' }, { name: 'x'.repeat(61) }] } }), ['catJam'], 'over-long names are left out');
  assert.equal(parse7tv({ error: 'not found' }), null);
  assert.deepEqual(parseBttv({ channelEmotes: [{ code: 'a1' }], sharedEmotes: [{ code: 'b2' }] }), ['a1', 'b2']);
  assert.deepEqual(parseBttv({ channelEmotes: [] }), []);
  assert.equal(parseBttv({ message: 'user not found' }), null);
  assert.deepEqual(parseFfz({ sets: { 1: { emoticons: [{ name: 'ffzA' }] }, 2: { emoticons: [{ name: 'ffzB' }] }, 3: null } }), ['ffzA', 'ffzB']);
  assert.equal(parseFfz({}), null);
});

test('the first time is only a starting point; then what was added since is new, until pointed at', () => {
  let t = 1e12;
  const st = createEmoteStore(null, { now: () => t });
  assert.deepEqual(st.update('alpha', { kick: ['a', 'b'], '7tv': ['x'] }), [], 'first time: nothing new');
  assert.deepEqual(st.fresh('alpha'), []);
  t += 1000;
  assert.deepEqual(st.update('alpha', { kick: ['a', 'b', 'c'], '7tv': ['x', 'y', 'z'] }), ['c', 'y', 'z']);
  assert.deepEqual(st.fresh('alpha').sort(), ['c', 'y', 'z']);
  // asked again with the same lists: still new, not added again
  assert.deepEqual(st.update('alpha', { kick: ['a', 'b', 'c'], '7tv': ['x', 'y', 'z'] }), []);
  assert.deepEqual(st.fresh('alpha').sort(), ['c', 'y', 'z']);
  assert.equal(st.seen('alpha', 'c'), true);
  assert.equal(st.seen('alpha', 'c'), false, 'only once');
  assert.equal(st.seen('nobody', 'c'), false);
  assert.deepEqual(st.fresh('alpha').sort(), ['y', 'z']);
  assert.ok(st.takeChanged()); assert.equal(st.takeChanged(), false);
});

test('a source that didn\'t answer keeps its list; a new source starts quietly; removed and old ones stop being new', () => {
  let t = 1e12;
  const st = createEmoteStore(null, { now: () => t });
  st.update('tw:oak', { twitch: ['a'], bttv: ['b1', 'b2'] });
  st.update('tw:oak', { twitch: ['a', 'n1'] });                       // BTTV down this time
  st.update('tw:oak', { twitch: ['a', 'n1'], bttv: ['b1', 'b2'], ffz: ['f1'] });
  assert.deepEqual(st.fresh('tw:oak'), ['n1'], 'BTTV\'s emotes didn\'t become new, FFZ only started');
  st.update('tw:oak', { twitch: ['a', 'n1', 'n2'], ffz: ['f1', 'f2'] });
  st.update('tw:oak', { twitch: ['a', 'n2'], ffz: ['f1', 'f2'] });     // n1 was taken out again
  assert.deepEqual(st.fresh('tw:oak').sort(), ['f2', 'n2']);
  t += KEEP_NEW + 1;
  st.update('tw:oak', { twitch: ['a', 'n2'] });
  assert.deepEqual(st.fresh('tw:oak'), [], 'two weeks later: not new any more');
  assert.deepEqual(st.update('tw:oak', { twitch: 'not a list' }), []);
});

test('kept between runs, and only the 300 channels opened most recently', () => {
  let t = 1;
  const st = createEmoteStore(null, { now: () => t });
  for (let i = 0; i < 305; i++){ t++; st.update('c' + i, { kick: ['a'] }); }
  const d = st.data();
  assert.equal(Object.keys(d.ch).length, 300);
  assert.ok(!d.ch.c0 && d.ch.c304);
  const again = createEmoteStore(JSON.parse(JSON.stringify(d)), { now: () => t + 1 });
  assert.deepEqual(again.update('c304', { kick: ['a', 'b'] }), ['b'], 'the saved list is the starting point');
  assert.deepEqual(createEmoteStore({ v: 2 }).data(), { v: 1, ch: {} }, 'an unknown file starts empty');
});
