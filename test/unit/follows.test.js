// Importing the channels you follow: reading every page of Kick's follow lists (readKickFollowPages)
// and turning them into channels (kickFollowsFrom). Kick is replaced by a fake, so this runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readKickFollowPages, kickFollowsFrom, canModerate, KICK_FOLLOW_APIS } = require('../../src/live');

const [FOLLOWED_PAGE, FOLLOWED, V1] = KICK_FOLLOW_APIS;
const channel = i => ({ channel_slug: `streamer${i}`, user_username: `Streamer${i}`, is_live: i < 10 });

// A fake Kick: `total` followed channels, served by each list in pages of `size`.
// lists: { '<path>': { size } | { status } }. Records every URL asked for.
function fakeKick(total, lists) {
  const calls = [];
  const get = async url => {
    calls.push(url);
    const [base, query] = url.split('?');
    const list = lists[base];
    if (!list) return { status: 404, d: null };
    if (list.status) return { status: list.status, d: null };
    const q = new URLSearchParams(query);
    if (base === V1) {   // page numbers, Laravel style
      const page = +q.get('page'), from = (page - 1) * list.size;
      const data = Array.from({ length: Math.max(0, Math.min(list.size, total - from)) }, (_, k) => channel(from + k));
      return { status: 200, d: { data, next_page_url: from + list.size < total ? `${V1}?page=${page + 1}` : null } };
    }
    const from = +q.get('cursor');
    const channels = Array.from({ length: Math.max(0, Math.min(list.size, total - from)) }, (_, k) => channel(from + k));
    return { status: 200, d: from + list.size < total ? { nextCursor: from + list.size, channels } : { channels } };
  };
  return { get, calls };
}

test('Kick: reads every page, well past the old 300-channel limit', async () => {
  const kick = fakeKick(366, { [FOLLOWED_PAGE]: { size: 20 }, [FOLLOWED]: { size: 5 } });
  const counts = [];
  const r = await readKickFollowPages(kick.get, { onCount: n => counts.push(n) });
  const items = kickFollowsFrom(r.pages);
  assert.equal(items.length, 366);
  assert.equal(kick.calls.length, 19, 'followed-page is used: 20 channels a request');
  assert.ok(kick.calls.every(u => u.startsWith(FOLLOWED_PAGE + '?cursor=')));
  assert.deepEqual(counts.slice(0, 3), [20, 40, 60], 'progress after every page');
  assert.equal(counts.at(-1), 366);
});

test('Kick: falls back to the 5-a-page list when followed-page is missing', async () => {
  const kick = fakeKick(366, { [FOLLOWED]: { size: 5 } });
  const r = await readKickFollowPages(kick.get);
  assert.equal(kickFollowsFrom(r.pages).length, 366);
  assert.equal(kick.calls[0], FOLLOWED_PAGE + '?cursor=0');
  assert.equal(kick.calls.filter(u => u.startsWith(FOLLOWED + '?')).length, 74);
});

test('Kick: the old page-numbered list is read to the end too', async () => {
  const kick = fakeKick(45, { [V1]: { size: 10 } });
  const r = await readKickFollowPages(kick.get);
  assert.equal(kickFollowsFrom(r.pages).length, 45);
  assert.deepEqual(kick.calls.filter(u => u.startsWith(V1)), [1, 2, 3, 4, 5].map(p => `${V1}?page=${p}`));
});

test('Kick: signed out stops at once', async () => {
  let calls = 0;
  const r = await readKickFollowPages(async () => { calls++; return { login: true }; });
  assert.deepEqual(r, { login: true });
  assert.equal(calls, 1);
});

test('Kick: when every list is blocked, the last status is reported (so the app can try the Following page)', async () => {
  const kick = fakeKick(10, { [FOLLOWED_PAGE]: { status: 403 }, [FOLLOWED]: { status: 403 }, [V1]: { status: 403 } });
  const r = await readKickFollowPages(kick.get);
  assert.deepEqual(r, { pages: [], status: 403 });
  assert.equal(kick.calls.length, 3, 'one try per list');
});

test('Kick: a broken list can never loop forever', async () => {
  // the same cursor again
  let calls = 0;
  await readKickFollowPages(async () => { calls++; return { status: 200, d: { nextCursor: 0, channels: [channel(1)] } }; });
  assert.equal(calls, 1);
  // an empty page that still claims there's more
  calls = 0;
  await readKickFollowPages(async u => { calls++; return { status: 200, d: { nextCursor: 99, channels: u.endsWith('=0') ? [channel(1)] : [] } }; });
  assert.equal(calls, 2);
  // a list that never ends stops at the safety limit
  calls = 0;
  const r = await readKickFollowPages(async u => { calls++; const c = +u.split('=')[1]; return { status: 200, d: { nextCursor: c + 1, channels: [channel(c)] } }; }, { maxPages: 50 });
  assert.equal(calls, 50);
  assert.equal(r.pages.length, 50);
});

test('Kick: a network error mid-list keeps the pages read so far', async () => {
  const r = await readKickFollowPages(async u => (u.endsWith('=0') ? { status: 200, d: { nextCursor: 20, channels: [channel(1), channel(2)] } } : null));
  assert.equal(kickFollowsFrom(r.pages).length, 2);
});

test('kickFollowsFrom: channels and their names from followed-page, without duplicates', () => {
  const pages = [
    { nextCursor: 2, channels: [{ channel_slug: 'Shazam9468', user_username: 'Shazam9468', is_live: false }, channel(1)] },
    { channels: [channel(1), { channel_slug: 'bad slug!', user_username: 'x', is_live: false }] }
  ];
  assert.deepEqual(kickFollowsFrom(pages), [{ ch: 'shazam9468', name: 'Shazam9468' }, { ch: 'streamer1', name: 'Streamer1' }]);
});

test('canModerate: Kick moderators and the channel owner, from /api/v2/channels/<slug>/me', () => {
  assert.equal(canModerate('kick', { is_moderator: true, is_broadcaster: false }), true);
  assert.equal(canModerate('kick', { is_moderator: false, is_broadcaster: true }), true);
  assert.equal(canModerate('kick', { is_moderator: false, is_broadcaster: false }), false);
  assert.equal(canModerate('kick', { message: 'Unauthenticated.' }), null, 'signed out: unknown');
  assert.equal(canModerate('kick', null), null);
});

test('canModerate: Twitch moderators, editors and your own channel', () => {
  const tw = (login, self) => ({ data: { currentUser: login ? { login } : null, user: self === undefined ? null : { self } } });
  assert.equal(canModerate('twitch', tw('me', { isModerator: true, isEditor: false }), 'bravo'), true);
  assert.equal(canModerate('twitch', tw('me', { isModerator: false, isEditor: true }), 'bravo'), true);
  assert.equal(canModerate('twitch', tw('me', { isModerator: false, isEditor: false }), 'bravo'), false);
  assert.equal(canModerate('twitch', tw('Me', { isModerator: false, isEditor: false }), 'me'), true, 'your own channel');
  assert.equal(canModerate('twitch', tw('me'), 'gone'), false, 'no such channel');
  assert.equal(canModerate('twitch', tw(null, null), 'bravo'), null, 'signed out: unknown');
});
