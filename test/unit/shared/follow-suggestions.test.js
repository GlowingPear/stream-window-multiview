// Suggestions from the channels you follow (src/follows.js): the lists the app keeps, and which channels the
// Channels box suggests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normStore, setSite, allFollows, suggest, siteOf } = require('../../../src/shared/follows');

test('the kept lists: only valid channels on their own site, once each, with a name', () => {
  const s = normStore({ v: 1, kick: { at: 5, items: [{ ch: 'Alpha', name: 'Alpha' }, { ch: 'alpha' }, { ch: 'tw:wrong' }, { ch: 'bad name!' }, null, 'x'] },
    twitch: { at: 'soon', items: [{ ch: 'tw:Bravo', name: '  Bravo TV  ' }, { ch: 'tw:charlie', name: '' }] }, youtube: { items: 'nope' }, other: { items: [] } });
  assert.deepEqual(s.kick, { at: 5, items: [{ ch: 'alpha', name: 'Alpha' }] });
  assert.deepEqual(s.twitch, { at: 0, items: [{ ch: 'tw:bravo', name: 'Bravo TV' }, { ch: 'tw:charlie', name: 'charlie' }] }, 'a missing name is the channel\'s');
  assert.equal(s.youtube, undefined);
  assert.equal(s.other, undefined);
  assert.deepEqual(normStore(null), { v: 1 });
  assert.deepEqual(normStore('x'), { v: 1 });
  assert.deepEqual(normStore({ off: true, kick: { at: 1, items: [{ ch: 'alpha' }] } }), { v: 1, off: true }, 'switched off: nothing kept');
  const yt = normStore({ youtube: { at: 1, items: [{ ch: 'yt:c:UCabcdefghij123', name: 'C' }, { ch: 'yt:@Lofi', name: 'Lofi' }] } });
  assert.deepEqual(yt.youtube.items.map(x => x.ch), ['yt:c:UCabcdefghij123', 'yt:@lofi'], 'a channel id keeps its case');
});

test('a new list for one site replaces it, keeps names the new one doesn\'t have, and leaves the others alone', () => {
  let s = setSite({}, 'twitch', [{ ch: 'tw:bravo', name: 'Bravo' }], 10);
  s = setSite(s, 'kick', [{ ch: 'alpha', name: 'AlphaGG' }, { ch: 'delta', name: 'Delta' }], 20);
  s = setSite(s, 'kick', ['alpha', 'echo'], 30);          // Kick's live checks only see slugs
  assert.deepEqual(s.kick, { at: 30, items: [{ ch: 'alpha', name: 'AlphaGG' }, { ch: 'echo', name: 'echo' }] }, 'delta unfollowed; alpha keeps its name');
  assert.deepEqual(s.twitch, { at: 10, items: [{ ch: 'tw:bravo', name: 'Bravo' }] });
  assert.deepEqual(setSite(s, 'nope', [{ ch: 'x' }]), s, 'not a site: nothing changes');
  assert.deepEqual(setSite({ off: true }, 'kick', ['alpha']), { v: 1, off: true }, 'switched off: not kept');
  const many = Array.from({ length: 6000 }, (_, i) => 'c' + i);
  assert.equal(setSite({}, 'kick', many).kick.items.length, 5000, 'capped');
  assert.deepEqual(allFollows(s).map(x => x.ch + ':' + x.site), ['alpha:kick', 'echo:kick', 'tw:bravo:twitch']);
  assert.deepEqual(allFollows(s, ['twitch']).map(x => x.ch), ['tw:bravo'], 'only the sites asked for (the ones you\'re signed in to)');
  assert.deepEqual(['alpha', 'tw:x', 'yt:@x', 'yt:c:UCx'].map(siteOf), ['kick', 'twitch', 'youtube', 'youtube']);
});

const F = [
  { ch: 'nightjar', name: 'Nightjar', site: 'kick' }, { ch: 'ninja_ferret', name: 'ninja_ferret', site: 'kick' },
  { ch: 'tw:nightfall_tv', name: 'Nightfall_TV', site: 'twitch' }, { ch: 'tw:onix', name: 'Onix', site: 'twitch' },
  { ch: 'yt:@nightskylofi', name: 'Night Sky Lofi', site: 'youtube' }, { ch: 'nightowl', name: 'nightowl', site: 'kick' },
  { ch: 'tw:pinata', name: 'Pinata', site: 'twitch' }, { ch: 'kniggit', name: 'Kniggit', site: 'kick' }
];
const live = { 'tw:nightfall_tv': { live: true, viewers: 300 }, 'tw:pinata': { live: true, viewers: 900 }, 'tw:onix': { live: true }, nightjar: { live: false } };

test('typing: followed channels you haven\'t saved whose name matches, live first, then names that start with it, at most 5', () => {
  const r = suggest({ follows: F, saved: ['nightowl'], live, q: 'ni' });
  assert.deepEqual(r.map(x => x.ch), ['tw:nightfall_tv', 'tw:onix', 'nightjar', 'ninja_ferret', 'yt:@nightskylofi']);
  assert.deepEqual(r.map(x => x.live), [true, true, false, false, false], 'live ones first, marked live');
  assert.ok(!r.some(x => x.ch === 'nightowl'), 'a saved channel isn\'t suggested');
  assert.equal(suggest({ follows: F, q: 'ni', max: 2 }).length, 2, 'the limit');
  assert.deepEqual(suggest({ follows: F, q: '@NIGHTSKY' }).map(x => x.ch), ['yt:@nightskylofi'], 'any case, a leading @');
  assert.deepEqual(suggest({ follows: F, q: 'lofi' }).map(x => x.ch), ['yt:@nightskylofi'], 'part of the name');
  assert.deepEqual(suggest({ follows: F, q: 'zzz' }), [], 'no match, no suggestions');
  // nobody live: names that start with the text (shortest first), then names that only contain it
  assert.deepEqual(suggest({ follows: F, q: 'ni', max: 10 }).map(x => x.ch),
    ['nightjar', 'nightowl', 'tw:nightfall_tv', 'ninja_ferret', 'yt:@nightskylofi', 'tw:onix', 'kniggit']);
});

test('empty box: the live ones you follow, most viewers first; nothing when nobody you follow is live', () => {
  assert.deepEqual(suggest({ follows: F, live }).map(x => x.ch), ['tw:pinata', 'tw:nightfall_tv', 'tw:onix'], 'no viewer count goes last');
  assert.deepEqual(suggest({ follows: F, saved: ['tw:pinata'], live }).map(x => x.ch), ['tw:nightfall_tv', 'tw:onix']);
  assert.deepEqual(suggest({ follows: F }), []);
  assert.deepEqual(suggest(), []);
  assert.deepEqual(suggest({ follows: [null, F[0], F[0]], q: 'night' }).map(x => x.ch), ['nightjar'], 'once each');
});
