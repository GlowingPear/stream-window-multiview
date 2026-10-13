// Live checks for saved channels: answering many channels at once (Twitch, Kick's follow list, YouTube
// with an API key), the YouTube key's fallbacks, and the watcher that notifies when a channel goes live.
// Every site is replaced by a fake, so this runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveWatcher, parseTwitchUsers, readKickLive, parseYtFeed, parseYtVideos, ytErrorReason, createKeyGate, createFeedGate, ytNoFeed,
  nextPacificMidnight, KICK_FOLLOW_APIS, withTimeout } = require('../../src/live');

const info = (live, extra = {}) => ({ live, title: live ? 'title' : '', viewers: live ? 5 : null, category: '', name: 'n', checked: 1, ...extra });

/* ---------- Twitch: many channels in one question ---------- */
test('Twitch: one answer for many channels, and channels that don\'t exist', () => {
  const d = { data: { users: [
    { login: 'alpha', displayName: 'Alpha', stream: { title: 'hi', viewersCount: 12, createdAt: '2026-10-11T19:02:11Z', game: { name: 'Chess' } } },
    { login: 'bravo', displayName: 'Bravo', stream: null },
    null
  ] } };
  const m = parseTwitchUsers(d, ['alpha', 'bravo', 'gone']);
  assert.deepEqual({ ...m.get('alpha'), checked: 0 }, { live: true, title: 'hi', viewers: 12, category: 'Chess', name: 'Alpha', startedAt: Date.UTC(2026, 9, 11, 19, 2, 11), checked: 0 });
  assert.equal(m.get('bravo').live, false);
  assert.deepEqual(m.get('gone'), { missing: true });
  assert.equal(parseTwitchUsers({ errors: [{}] }, ['alpha']), null, 'an error answer is not "every channel is missing"');
});

/* ---------- Kick: the live channels you follow ---------- */
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

test('Kick: a normal read stops at the first page with an offline channel', async () => {
  const k = fakeFollowList('1'.repeat(45) + '0'.repeat(300));
  const r = await readKickLive(k.get);
  assert.equal(k.calls.length, 3, '45 live channels: pages 1-3, not all 18');
  assert.equal(r.live.size, 45);
  assert.deepEqual({ ...r.live.get('ch0'), checked: 0 }, { live: true, partial: true, title: '', viewers: 7, category: 'Just Chatting', name: 'Ch0', checked: 0 });
  assert.equal(r.followed, null, 'not every channel was read');
  assert.equal(r.pages, 3);
});

test('Kick: reading the whole list gives every channel you follow, and checks live ones come first', async () => {
  const ok = await readKickLive(fakeFollowList('1'.repeat(30) + '0'.repeat(30)).get, { allPages: true });
  assert.equal(ok.followed.size, 60);
  assert.equal(ok.liveFirst, true);
  const mixed = await readKickLive(fakeFollowList('1'.repeat(10) + '0'.repeat(30) + '1').get, { allPages: true });
  assert.equal(mixed.liveFirst, false, 'a live channel after an offline one: Kick changed its order');
  assert.equal(mixed.live.size, 11);
});

test('Kick: signed out, or the list can\'t be read', async () => {
  assert.deepEqual(await readKickLive(async () => ({ login: true })), { login: true });
  assert.equal(await readKickLive(async () => ({ status: 403, d: null })), null);
  assert.equal(await readKickLive(async () => null), null);
});

/* ---------- YouTube with an API key ---------- */
test('YouTube: a channel\'s feed gives its latest videos', () => {
  const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>UCabcdefghijklmnopqrstuv</yt:channelId>
    <author><name>Lofi &amp; Friends</name></author>
    <entry><yt:videoId>aaaaaaaaaaa</yt:videoId></entry><entry><yt:videoId>bbbbbbbbbbb</yt:videoId></entry><entry><yt:videoId>aaaaaaaaaaa</yt:videoId></entry></feed>`;
  assert.deepEqual(parseYtFeed(xml), { ids: ['aaaaaaaaaaa', 'bbbbbbbbbbb'], channelId: 'UCabcdefghijklmnopqrstuv', name: 'Lofi & Friends' });
  assert.equal(parseYtFeed('<html>consent page</html>'), null);
});

test('YouTube: videos are live, upcoming, or done (normal videos and finished streams are never asked about again)', () => {
  const m = parseYtVideos({ items: [
    { id: 'live0000000', snippet: { liveBroadcastContent: 'live', title: 'On air', channelId: 'UC1', channelTitle: 'One' }, liveStreamingDetails: { actualStartTime: '2026-10-11T19:00:00Z', concurrentViewers: '1234' } },
    { id: 'soon0000000', snippet: { liveBroadcastContent: 'upcoming', title: 'Later' }, liveStreamingDetails: { scheduledStartTime: 'x' } },
    { id: 'ended000000', snippet: { liveBroadcastContent: 'none', title: 'Was live' }, liveStreamingDetails: { actualStartTime: 'x', actualEndTime: 'y' } },
    { id: 'video000000', snippet: { liveBroadcastContent: 'none', title: 'A video' } }
  ] });
  assert.deepEqual(m.get('live0000000'), { state: 'live', title: 'On air', viewers: 1234, startedAt: Date.UTC(2026, 9, 11, 19), channelId: 'UC1', channelTitle: 'One' });
  assert.equal(m.get('soon0000000').state, 'upcoming');
  assert.equal(m.get('ended000000').state, 'done');
  assert.equal(m.get('video000000').state, 'done');
  assert.equal(parseYtVideos({ error: {} }), null);
});

test('YouTube key: the reason in Google\'s error answers', () => {
  assert.equal(ytErrorReason({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }), 'quotaExceeded');
  assert.equal(ytErrorReason({ error: { code: 400, errors: [{ reason: 'badRequest' }], details: [{ reason: 'API_KEY_INVALID' }] } }), 'API_KEY_INVALID');
  assert.equal(ytErrorReason(null), '');
});

test('YouTube key: out of quota -> page checks until the quota resets at midnight Pacific time', () => {
  let t = Date.UTC(2026, 9, 11, 15, 30);                          // 08:30 in Los Angeles (summer time)
  const g = createKeyGate({ now: () => t });
  assert.equal(g.fail({ status: 403, reason: 'quotaExceeded' }), 'quota');
  assert.equal(g.status().until, Date.UTC(2026, 9, 12, 7, 0), 'next midnight in Los Angeles');
  assert.equal(g.usable(), false);
  t = Date.UTC(2026, 9, 12, 7, 0);
  assert.equal(g.usable(), true, 'tried again once it resets');
  assert.equal(nextPacificMidnight(Date.UTC(2026, 0, 15, 20, 0)), Date.UTC(2026, 0, 16, 8, 0), 'winter time: midnight is 08:00 UTC');
});

test('YouTube key: too many requests -> 15 min, doubling up to 2 h, back to normal after a success', () => {
  let t = 0;
  const g = createKeyGate({ now: () => t });
  const waits = [];
  for (let i = 0; i < 5; i++) { g.fail({ status: 429 }); waits.push(g.status().until - t); }
  assert.deepEqual(waits.map(ms => ms / 60e3), [15, 30, 60, 120, 120]);
  assert.equal(g.usable(), false);
  t += 120 * 60e3;
  assert.equal(g.usable(), true);
  g.ok(); g.fail({ status: 403, reason: 'rateLimitExceeded' });
  assert.equal(g.status().until - t, 15 * 60e3, 'starts again from 15 min');
});

test('YouTube key: a refused key stays off until it\'s changed; a hiccup changes nothing', () => {
  const g = createKeyGate({ now: () => 0 });
  assert.equal(g.fail({ status: 503 }), 'ok', 'Google busy: just this round');
  assert.equal(g.fail({ status: 400, reason: 'badRequest' }), 'ok', 'a bad question is not a bad key');
  assert.equal(g.fail({ status: 400, reason: 'API_KEY_INVALID' }), 'badkey');
  assert.equal(g.usable(), false);
  g.reset();
  assert.equal(g.usable(), true, 'a new key gets a fresh start');
  assert.equal(g.fail({ status: 403, reason: 'accessNotConfigured' }), 'badkey', 'YouTube Data API not enabled for the key');
});

test('YouTube feeds: down after 3 rounds with no answer, then tried again after 1 min, doubling up to 30 min', () => {
  let t = 0;
  const g = createFeedGate({ now: () => t });
  g.fail(); g.fail();
  assert.equal(g.usable(), true, 'two misses: still asked');
  assert.equal(g.down(), false);
  const waits = [];
  for (let i = 0; i < 7; i++) { g.fail(); waits.push(g.status().until - t); }
  assert.deepEqual(waits.map(ms => ms / 60e3), [1, 2, 4, 8, 16, 30, 30]);
  assert.equal(g.down(), true);
  assert.equal(g.usable(), false, 'not asked while it waits');
  t += 30 * 60e3;
  assert.equal(g.usable(), true, 'asked again once the wait is over');
  g.ok();
  assert.equal(g.down(), false, 'one answer puts it back up');
  g.fail(); g.fail(); g.fail();
  assert.equal(g.status().until - t, 60e3, 'starts again from 1 min');
});

test('YouTube feeds: what happens to a channel whose feed couldn\'t be read', () => {
  const live = { live: true, videoId: 'k62wgMPmQeo', name: 'n' }, off = { live: false, videoId: null, name: 'n' };
  const failing = { allFailing: true, down: false };
  assert.equal(ytNoFeed(live, failing), 'recheck', 'was live: ask the API about the same video');
  assert.equal(ytNoFeed(live, { allFailing: true, down: true }), 'recheck', 'even while the feed is down');
  assert.equal(ytNoFeed(off, failing), 'keep', 'every feed failing for a round or two: keep its last result');
  assert.equal(ytNoFeed(off, { allFailing: true, down: true }), 'page', 'feed down: check its page');
  assert.equal(ytNoFeed(off, { allFailing: false, down: false }), 'page', 'only this channel\'s feed fails: check its page');
  assert.equal(ytNoFeed(undefined, failing), 'page', 'never checked yet: check its page');
  assert.equal(ytNoFeed({ live: false, missing: true }, failing), 'page');
  assert.equal(ytNoFeed({ live: true, videoId: null }, failing), 'keep', 'live without a known video: nothing to ask the API');
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
