// Kick's main-process side (src/main/sites/kick/site.js): reading its answers (a channel, the follow lists, the moderator
// check, links), and the adapter, with Kick's hidden kick.com window replaced by a fake page. Runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const kick = require('../../../../../src/main/sites/kick/site');
const { parseChannel, readKickLive, readKickFollowPages, kickFollowsFrom, canModerate, fromLink, describeRequest, KICK_FOLLOW_APIS } = kick;
const { stubCtx } = require('../stub-ctx');

const [FOLLOWED_PAGE, FOLLOWED, V1] = KICK_FOLLOW_APIS;
const channel = i => ({ channel_slug: `streamer${i}`, user_username: `Streamer${i}`, is_live: i < 10 });

/* ---------- a channel ---------- */
test('a channel: live with its title, viewers, category and start; offline; not channel data', () => {
  const d = { slug: 'pixelpear', user: { username: 'PixelPear' }, livestream: { is_live: true, session_title: 'Speedruns', viewer_count: '42',
    categories: [{ name: 'Retro' }], start_time: '2026-10-11 19:02:11' } };
  assert.deepEqual({ ...parseChannel(JSON.stringify(d), 'pixelpear'), checked: 0 },
    { live: true, title: 'Speedruns', viewers: 42, category: 'Retro', name: 'PixelPear', startedAt: Date.UTC(2026, 9, 11, 19, 2, 11), checked: 0 });
  assert.deepEqual({ ...parseChannel({ slug: 'pixelpear', livestream: null }, 'pixelpear'), checked: 0 },
    { live: false, title: '', viewers: null, category: '', name: 'pixelpear', startedAt: null, checked: 0 });
  assert.equal(parseChannel('<html>a security check</html>', 'x'), null);
  assert.equal(parseChannel({ message: 'Not found' }, 'x'), null);
});

/* ---------- the live channels you follow ---------- */
// A fake followed-page: `flags` is one string per channel, 1 = live, in Kick's order, 20 a page.
function fakeFollowList(flags) {
  const calls = [];
  const get = async url => {
    calls.push(url);
    assert.ok(url.startsWith(KICK_FOLLOW_APIS[0] + '?cursor='));
    const from = +url.split('=')[1];
    const channels = [...flags.slice(from, from + 20)].map((f, k) => ({ channel_slug: `ch${from + k}`, user_username: `Ch${from + k}`, is_live: f === '1', viewer_count: 7, category_name: 'Just Chatting' }));
    return { status: 200, d: from + 20 < flags.length ? { nextCursor: from + 20, channels } : { channels } };
  };
  return { get, calls };
}

test('a normal read stops at the first page with an offline channel', async () => {
  const k = fakeFollowList('1'.repeat(45) + '0'.repeat(300));
  const r = await readKickLive(k.get);
  assert.equal(k.calls.length, 3, '45 live channels: pages 1-3, not all 18');
  assert.equal(r.live.size, 45);
  assert.deepEqual({ ...r.live.get('ch0'), checked: 0 }, { live: true, partial: true, title: '', viewers: 7, category: 'Just Chatting', name: 'Ch0', checked: 0 });
  assert.equal(r.followed, null, 'not every channel was read');
  assert.equal(r.pages, 3);
});

test('reading the whole list gives every channel you follow, and checks live ones come first', async () => {
  const ok = await readKickLive(fakeFollowList('1'.repeat(30) + '0'.repeat(30)).get, { allPages: true });
  assert.equal(ok.followed.size, 60);
  assert.equal(ok.liveFirst, true);
  const mixed = await readKickLive(fakeFollowList('1'.repeat(10) + '0'.repeat(30) + '1').get, { allPages: true });
  assert.equal(mixed.liveFirst, false, 'a live channel after an offline one: Kick changed its order');
  assert.equal(mixed.live.size, 11);
});

test('the live channels you follow: signed out, or the list can\'t be read', async () => {
  assert.deepEqual(await readKickLive(async () => ({ login: true })), { login: true });
  assert.equal(await readKickLive(async () => ({ status: 403, d: null })), null);
  assert.equal(await readKickLive(async () => null), null);
});

/* ---------- importing the channels you follow ---------- */
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

test('import: reads every page, well past the old 300-channel limit', async () => {
  const k = fakeKick(366, { [FOLLOWED_PAGE]: { size: 20 }, [FOLLOWED]: { size: 5 } });
  const counts = [];
  const r = await readKickFollowPages(k.get, { onCount: n => counts.push(n) });
  const items = kickFollowsFrom(r.pages);
  assert.equal(items.length, 366);
  assert.equal(k.calls.length, 19, 'followed-page is used: 20 channels a request');
  assert.ok(k.calls.every(u => u.startsWith(FOLLOWED_PAGE + '?cursor=')));
  assert.deepEqual(counts.slice(0, 3), [20, 40, 60], 'progress after every page');
  assert.equal(counts.at(-1), 366);
});

test('import: falls back to the 5-a-page list when followed-page is missing', async () => {
  const k = fakeKick(366, { [FOLLOWED]: { size: 5 } });
  const r = await readKickFollowPages(k.get);
  assert.equal(kickFollowsFrom(r.pages).length, 366);
  assert.equal(k.calls[0], FOLLOWED_PAGE + '?cursor=0');
  assert.equal(k.calls.filter(u => u.startsWith(FOLLOWED + '?')).length, 74);
});

test('import: the old page-numbered list is read to the end too', async () => {
  const k = fakeKick(45, { [V1]: { size: 10 } });
  const r = await readKickFollowPages(k.get);
  assert.equal(kickFollowsFrom(r.pages).length, 45);
  assert.deepEqual(k.calls.filter(u => u.startsWith(V1)), [1, 2, 3, 4, 5].map(p => `${V1}?page=${p}`));
});

test('import: signed out stops at once', async () => {
  let calls = 0;
  const r = await readKickFollowPages(async () => { calls++; return { login: true }; });
  assert.deepEqual(r, { login: true });
  assert.equal(calls, 1);
});

test('import: when every list is blocked, the last status is reported (so the app can try the Following page)', async () => {
  const k = fakeKick(10, { [FOLLOWED_PAGE]: { status: 403 }, [FOLLOWED]: { status: 403 }, [V1]: { status: 403 } });
  const r = await readKickFollowPages(k.get);
  assert.deepEqual(r, { pages: [], status: 403 });
  assert.equal(k.calls.length, 3, 'one try per list');
});

test('import: a broken list can never loop forever', async () => {
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

test('import: a network error mid-list keeps the pages read so far', async () => {
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

/* ---------- the moderator check, links, requests ---------- */
test('canModerate: Kick moderators and the channel owner, from /api/v2/channels/<slug>/me', () => {
  assert.equal(canModerate({ is_moderator: true, is_broadcaster: false }), true);
  assert.equal(canModerate({ is_moderator: false, is_broadcaster: true }), true);
  assert.equal(canModerate({ is_moderator: false, is_broadcaster: false }), false);
  assert.equal(canModerate({ message: 'Unauthenticated.' }), null, 'signed out: unknown');
  assert.equal(canModerate(null), null);
});

test('a link on the Following page: a channel, not one of Kick\'s own pages', () => {
  assert.equal(fromLink('/PixelPear'), 'pixelpear');
  assert.equal(fromLink('https://kick.com/pixel_pear/'), 'pixel_pear');
  for (const l of ['/following', '/categories', '/pixelpear/videos', '/', 'http://[bad']) assert.equal(fromLink(l), null, l);
});

test('a request to Kick, in words (Settings › Developer)', () => {
  const d = u => describeRequest(new URL(u));
  assert.equal(d('https://kick.com/api/v2/channels/pixelpear'), 'channel');
  assert.equal(d('https://kick.com/api/v2/channels/followed-page?cursor=0'), 'follows');
  assert.equal(d('https://kick.com/emotes/pixelpear'), 'page');
  assert.equal(d('https://web.kick.com/api/v1/chat/emotes/favourites'), 'API v1/chat/emotes/favourites');
  assert.equal(d('https://www.twitch.tv/x'), null);
});

/* ---------- the adapter, with the hidden kick.com window faked ---------- */
// The hidden window's page: page(url, code) answers each script run in it (url: the address it fetches, if any).
function fakeWindows(page) {
  const made = [];
  class Win {
    constructor(opts) {
      this.opts = opts; this.loaded = []; this.destroyed = false; this.events = {};
      this.webContents = { setAudioMuted: m => { this.muted = m; }, on: (ev, fn) => { this.events[ev] = fn; },
        executeJavaScript: async code => { const m = /fetch\(("[^"]*")/.exec(code); return page(m ? JSON.parse(m[1]) : '', code, this); } };
      made.push(this);
    }
    on(ev, fn) { this.events[ev] = fn; }
    loadURL(u) { this.loaded.push(u); return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; if (this.events.closed) this.events.closed(); }
  }
  return { Win, made };
}
const signedIn = [{ name: 'session_token', value: 'x' }];
function kickWith(page, over = {}) {
  const w = fakeWindows(page);
  const { ctx, rec } = stubCtx('kick', { BrowserWindow: w.Win, ...over });
  return { a: kick.create(ctx), rec, made: w.made };
}
const chJson = (slug, live) => ({ slug, user: { username: slug.toUpperCase() }, livestream: live ? { is_live: true, session_title: 'On', viewer_count: 3 } : null });

test('one channel: Kick\'s answer from its own page, noted for Settings › Developer; a missing one; a blocked one read from the address itself', async () => {
  let blocked = false;
  const { a, rec, made } = kickWith((url, code) => {
    if (code.includes('innerText')) return JSON.stringify(chJson('walled', true));
    if (blocked) return { status: 403, body: '' };
    return url.endsWith('/gone') ? { status: 404, body: '' } : { status: 200, body: JSON.stringify(chJson(url.split('/').pop(), true)) };
  });
  assert.equal(await a.liveOne('not a name!'), null);
  const info = await a.liveOne('pixelpear');
  assert.equal(info.live, true);
  assert.equal(info.title, 'On');
  assert.equal(made.length, 1, 'one hidden window');
  assert.equal(made[0].opts.webPreferences.partition, 'persist:kick');
  assert.equal(made[0].opts.show, false);
  assert.equal(made[0].muted, true);
  assert.deepEqual(made[0].loaded, ['https://kick.com/robots.txt']);
  assert.equal(rec.notes[0][0], 'https://kick.com/api/v2/channels/pixelpear');
  assert.deepEqual(await a.liveOne('gone'), { missing: true });
  blocked = true;
  assert.equal((await a.liveOne('walled')).live, true, 'read from the page the address opens');
  assert.equal(made[0].loaded.at(-1), 'https://kick.com/api/v2/channels/walled');
  assert.equal(made.length, 1, 'the same window throughout');
});

test('many channels: a few are asked one by one; more come from your follow list, the rest one by one', async () => {
  const { a, rec, made } = kickWith(url => (url.startsWith(FOLLOWED_PAGE)
    ? { status: 200, d: { channels: [{ channel_slug: 'aa', user_username: 'AA', is_live: true, viewer_count: 9 }, { channel_slug: 'bb', is_live: false }] } }
    : null), { cookies: signedIn });
  assert.deepEqual(await a.liveBatch(['aa', 'bb']), { results: [], rest: ['aa', 'bb'] });
  assert.equal(made.length, 0, 'no window for a few channels');
  const r = await a.liveBatch(['aa', 'bb', 'cc', 'dd', 'ee']);
  assert.deepEqual(r.rest, ['cc', 'dd', 'ee'], 'channels you don\'t follow: one at a time');
  assert.deepEqual(r.results.map(([ch, x]) => [ch, x.live, x.partial]), [['aa', true, true], ['bb', false, true]]);
  assert.deepEqual(rec.kept, [[{ ch: 'aa', name: 'AA' }, { ch: 'bb', name: '' }]], 'the whole list is kept for suggestions');
  assert.equal(a.follows.live().get('aa').viewers, 9);
});

test('many channels: signed out of Kick, every one is asked one by one', async () => {
  const { a } = kickWith(() => ({ login: true }));
  const chs = ['a1', 'a2', 'a3', 'a4', 'a5'];
  assert.deepEqual(await a.liveBatch(chs), { results: [], rest: chs });
});

test('importing your follows: the API\'s lists, or the Following page when they\'re blocked', async () => {
  let status = 200;
  const { a, rec } = kickWith(url => (status === 200 ? { status, d: { channels: [channel(1), channel(2)] } } : { status, d: null }),
    { scrape: () => ({ items: [{ ch: 'fromthepage', name: 'From the page' }] }) });
  assert.deepEqual(await a.follows.import(), { items: [{ ch: 'streamer1', name: 'Streamer1' }, { ch: 'streamer2', name: 'Streamer2' }] });
  assert.deepEqual(rec.progress, ['Found 2 so far…']);
  status = 403;
  assert.deepEqual((await a.follows.import()).items, [{ ch: 'fromthepage', name: 'From the page' }]);
  assert.deepEqual(rec.scraped.map(s => s[0]), ['https://kick.com/following']);
  const out = kickWith(() => ({ login: true }));
  assert.deepEqual(await out.a.follows.import(), { error: 'login' });
});

test('suggestions in the background: the whole list while signed in; signed out, who\'s live is forgotten', async () => {
  const { a, rec } = kickWith(url => (url.startsWith(FOLLOWED_PAGE) ? { status: 200, d: { channels: [{ channel_slug: 'aa', is_live: true }] } } : null), { cookies: signedIn });
  await a.follows.tick(Date.now());
  assert.deepEqual(rec.kept, [[{ ch: 'aa', name: 'aa' }]]);
  assert.equal(a.follows.live().size, 1);
  await a.follows.tick(Date.now());
  assert.equal(rec.kept.length, 1, 'just read: not again');
  rec.cookies = [];
  await a.follows.tick(Date.now());
  assert.equal(a.follows.live().size, 0);
  assert.equal(rec.changed, 1, 'the page is told');
  a.follows.retry();
  a.follows.clearLive();
  assert.equal(a.follows.live().size, 0);
});

test('a profile: the channel, its past broadcasts, and (signed in) whether you follow it', async () => {
  const { a } = kickWith((url, code) => {
    const auth = code.includes('method = "GET"');
    if (url.endsWith('/videos')) return { status: 200, d: [{ id: 'v1', start_time: '2026-10-01 18:00:00', duration: 3600, session_title: 'Old' }], auth };
    if (url.endsWith('/me')) return { status: 200, d: { following: true, following_since: '2026-01-02 03:04:05', subscription: { months: 3 } }, auth };
    if (url.endsWith('/gone')) return { status: 404, d: null };
    return { status: 200, d: chJson('pixelpear', false), auth: true };
  }, { cookies: signedIn });
  const p = await a.profile('pixelpear');
  assert.equal(p.platform, 'kick');
  assert.equal(p.vods.length, 1);
  assert.equal(p.loggedIn, true);
  assert.deepEqual(p.following, { since: Date.UTC(2026, 0, 2, 3, 4, 5) });
  assert.deepEqual(p.sub, { tier: '', months: 3 });
  assert.deepEqual(await a.profile('gone'), { missing: true });
  assert.equal(await a.profileStale({ loggedIn: false }), true, 'kept from before you signed in: asked again');
  assert.equal(await a.profileStale({ loggedIn: true }), false);
});

test('emotes: the channel\'s for "new emotes", and the picker\'s groups with your favourites', async () => {
  const { a } = kickWith(url => (url === 'https://web.kick.com/api/v1/chat/emotes/favourites'
    ? { status: 200, d: { data: { emotes: [{ id: 2 }] } } }
    : { status: 200, d: [{ slug: 'pixelpear', user_id: 77, emotes: [{ id: 1, name: 'peHi' }, { id: 2, name: 'peBye' }] }] }));
  assert.deepEqual(await a.emotes.list('pixelpear'), { names: ['peHi', 'peBye'], id: '77' });
  const { groups, id } = await a.emotes.pick('pixelpear');
  assert.equal(id, 77);
  assert.deepEqual(groups.map(g => g.id), ['kick-favourites', 'kick-channel']);
  assert.deepEqual(a.emotes.addOns, { '7tv': 'kick' });
  const none = kickWith(() => ({ status: 500, d: null }));
  assert.equal(await none.a.emotes.list('pixelpear'), null);
  assert.deepEqual(await none.a.emotes.pick('pixelpear'), { groups: [], id: null });
});

test('the moderator check, your name, and Unfollow', async () => {
  let unfollow = 200;
  const cached = { following: { since: null } };
  const { a, rec } = kickWith((url, code) => {
    if (code.includes('/api/v1/user')) return 'Pear_Fan';
    if (url.endsWith('/follow')) return unfollow === 'login' ? { login: true } : { status: unfollow, d: null };
    return { status: 200, d: { is_moderator: true } };
  }, { cookies: signedIn, profiles: { pixelpear: cached } });
  assert.equal(await a.modCheck('pixelpear'), true);
  assert.equal(await rec.handlers.app['me:detect'](), 'Pear_Fan');
  const unf = rec.handlers.app['kick:unfollow'];
  assert.deepEqual(await unf(null, 'not a name!'), { error: 'bad' });
  assert.deepEqual(await unf(null, 'PixelPear'), { ok: true });
  assert.equal(cached.following, false, 'the kept profile says so too');
  unfollow = 403;
  assert.deepEqual(await unf(null, 'pixelpear'), { error: 'refused', status: 403 });
  unfollow = 'login';
  assert.deepEqual(await unf(null, 'pixelpear'), { error: 'login' });
});

test('signing in and out: the login cookie, and the hidden window starts again', async () => {
  const { a, rec, made } = kickWith(() => ({ status: 200, body: JSON.stringify(chJson('x', false)) }));
  assert.equal(await a.signedIn(), false);
  rec.cookies = signedIn;
  assert.equal(await a.account(), true);
  assert.equal(a.named, true);
  assert.equal(a.loginUrl, 'https://kick.com');
  await a.liveOne('x');
  assert.equal(a.keeps(made[0]), true, 'logging out leaves the hidden window to Kick');
  a.loggedOut();
  assert.equal(made[0].destroyed, true);
  await a.liveOne('x');
  assert.equal(made.length, 2, 'a fresh one next time');
  a.close();
  assert.equal(made[1].destroyed, true);
  assert.equal(a.byName('pixelpear'), 'pixelpear');
  assert.equal(a.emoteHost('files.kick.com'), true);
  assert.equal(a.emoteHost('evil.com'), false);
});
