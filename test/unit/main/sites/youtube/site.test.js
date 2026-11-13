// YouTube's main-process side (src/main/sites/youtube/site.js): reading its pages, feeds and Data API answers, when the API
// key may be used, Google's sign-in, links, and the adapter, with YouTube and Google replaced by fakes. Runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const youtube = require('../../../../../src/main/sites/youtube/site');
const { ytLiveUrl, parseYouTube, parseYtFeed, parseYtVideos, ytErrorReason, createKeyGate, createFeedGate, ytNoFeed, nextPacificMidnight,
  isGoogleSignin, fromLink, describeRequest, REJECT_ALL } = youtube;
const { stubCtx, answer } = require('../stub-ctx');

/* ---------- pages ---------- */
test('a channel\'s live address, and what its page says', () => {
  assert.equal(ytLiveUrl('yt:@lofi'), 'https://www.youtube.com/@lofi/live');
  assert.equal(ytLiveUrl('yt:c:UCabcdefghijklmnop'), 'https://www.youtube.com/channel/UCabcdefghijklmnop/live');
  assert.equal(ytLiveUrl('yt:v:abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
  const page = (extra = '') => `<html><link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk"><meta name="title" content="Rain &amp; beats">
    "ownerChannelName":"Lofi Friends" ${extra}` + 'x'.repeat(500);
  assert.deepEqual({ ...parseYouTube(page('"isLiveNow":true "concurrentViewers":"321"'), 'yt:@lofi'), checked: 0 },
    { live: true, videoId: 'abcdefghijk', title: 'Rain & beats', viewers: 321, category: '', name: 'Lofi Friends', checked: 0 });
  assert.equal(parseYouTube(page('"isLiveNow":true "isUpcoming":true'), 'yt:@lofi').live, false, 'scheduled, not live yet');
  assert.equal(parseYouTube(page(), 'yt:@lofi').live, false);
  assert.equal(parseYouTube('too short', 'yt:@lofi'), null);
  assert.equal(parseYouTube('x'.repeat(600), 'yt:c:UCabc').name, 'UCabc', 'no owner on the page: the channel id');
});

/* ---------- with an API key ---------- */
test('a channel\'s feed gives its latest videos', () => {
  const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><yt:channelId>UCabcdefghijklmnopqrstuv</yt:channelId>
    <author><name>Lofi &amp; Friends</name></author>
    <entry><yt:videoId>aaaaaaaaaaa</yt:videoId></entry><entry><yt:videoId>bbbbbbbbbbb</yt:videoId></entry><entry><yt:videoId>aaaaaaaaaaa</yt:videoId></entry></feed>`;
  assert.deepEqual(parseYtFeed(xml), { ids: ['aaaaaaaaaaa', 'bbbbbbbbbbb'], channelId: 'UCabcdefghijklmnopqrstuv', name: 'Lofi & Friends' });
  assert.equal(parseYtFeed('<html>consent page</html>'), null);
});

test('videos are live, upcoming, or done (normal videos and finished streams are never asked about again)', () => {
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

test('key: the reason in Google\'s error answers', () => {
  assert.equal(ytErrorReason({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }), 'quotaExceeded');
  assert.equal(ytErrorReason({ error: { code: 400, errors: [{ reason: 'badRequest' }], details: [{ reason: 'API_KEY_INVALID' }] } }), 'API_KEY_INVALID');
  assert.equal(ytErrorReason(null), '');
});

test('key: out of quota -> page checks until the quota resets at midnight Pacific time', () => {
  let t = Date.UTC(2026, 9, 11, 15, 30);                          // 08:30 in Los Angeles (summer time)
  const g = createKeyGate({ now: () => t });
  assert.equal(g.fail({ status: 403, reason: 'quotaExceeded' }), 'quota');
  assert.equal(g.status().until, Date.UTC(2026, 9, 12, 7, 0), 'next midnight in Los Angeles');
  assert.equal(g.usable(), false);
  t = Date.UTC(2026, 9, 12, 7, 0);
  assert.equal(g.usable(), true, 'tried again once it resets');
  assert.equal(nextPacificMidnight(Date.UTC(2026, 0, 15, 20, 0)), Date.UTC(2026, 0, 16, 8, 0), 'winter time: midnight is 08:00 UTC');
});

test('key: too many requests -> 15 min, doubling up to 2 h, back to normal after a success', () => {
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

test('key: a refused key stays off until it\'s changed; a hiccup changes nothing', () => {
  const g = createKeyGate({ now: () => 0 });
  assert.equal(g.fail({ status: 503 }), 'ok', 'Google busy: just this round');
  assert.equal(g.fail({ status: 400, reason: 'badRequest' }), 'ok', 'a bad question is not a bad key');
  assert.equal(g.fail({ status: 400, reason: 'API_KEY_INVALID' }), 'badkey');
  assert.equal(g.usable(), false);
  g.reset();
  assert.equal(g.usable(), true, 'a new key gets a fresh start');
  assert.equal(g.fail({ status: 403, reason: 'accessNotConfigured' }), 'badkey', 'YouTube Data API not enabled for the key');
});

test('feeds: down after 3 rounds with no answer, then tried again after 1 min, doubling up to 30 min', () => {
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

test('feeds: what happens to a channel whose feed couldn\'t be read', () => {
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

/* ---------- sign-in, links, requests ---------- */
test('Google\'s sign-in pages (shown a Firefox identity), and nothing else', () => {
  for (const u of ['https://accounts.google.com/v3/signin', 'https://accounts.youtube.com/accounts/SetSID']) assert.equal(isGoogleSignin(u), true, u);
  for (const u of ['https://www.youtube.com/', 'https://accounts.google.com.evil.example/', 'http://accounts.google.com/', null]) assert.equal(isGoogleSignin(u), false, String(u));
});

test('a link on the Subscriptions page: a handle or a channel id, on YouTube only', () => {
  assert.equal(fromLink('/@Lofi.Friends'), 'yt:@lofi.friends');
  assert.equal(fromLink('/@%E2%9C%A8'), null, 'not a handle YouTube allows');
  assert.equal(fromLink('/channel/UCabcdefghijklmnop'), 'yt:c:UCabcdefghijklmnop');
  for (const l of ['/feed/channels', '/watch?v=abc', 'https://example.com/@lofi', 'http://[bad']) assert.equal(fromLink(l), null, l);
});

test('a request to YouTube, in words (Settings › Developer)', () => {
  const d = u => describeRequest(new URL(u));
  assert.equal(d('https://www.googleapis.com/youtube/v3/videos?part=x'), 'API videos');
  assert.equal(d('https://www.youtube.com/@lofi/live'), 'live page');
  assert.equal(d('https://www.youtube.com/feeds/videos.xml?channel_id=UC1'), 'channel feed');
  assert.equal(d('https://translate.googleapis.com/x'), null);
});

/* ---------- the adapter, with YouTube faked ---------- */
const enc = { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async s => Buffer.from('enc:' + s),
  decryptStringAsync: async b => ({ result: b.toString().slice(4), shouldReEncrypt: false }) };
const KEY = 'AIzaSy' + 'k'.repeat(30);
const livePage = (vid, live) => `<link rel="canonical" href="https://www.youtube.com/watch?v=${vid}">"isLiveNow":${live} "ownerChannelName":"Lofi"` + 'x'.repeat(500);
function youtubeWith(over = {}) {
  const { ctx, rec } = stubCtx('youtube', { safeStorage: enc, ...over });
  return { a: youtube.create(ctx), rec };
}

test('one channel: its live page (with YouTube\'s cookie question answered), a missing one, and yt:resolve', async () => {
  const { a, rec } = youtubeWith({ pageFetch: url => (url.includes('@gone') ? answer({ status: 404 }) : answer({ text: livePage('abcdefghijk', true) })) });
  const r = await a.liveOne('yt:@lofi');
  assert.equal(r.live, true);
  assert.equal(rec.fetched[0].url, 'https://www.youtube.com/@lofi/live');
  assert.match(rec.fetched[0].opts.headers.Cookie, /SOCS=CAI/);
  assert.deepEqual(await a.liveOne('yt:@gone'), { missing: true });
  assert.equal((await rec.handlers.app['yt:resolve'](null, 'yt:@lofi')).videoId, 'abcdefghijk');
  assert.equal(await rec.handlers.app['yt:resolve'](null, 'tw:alpha'), null, 'only YouTube\'s channels');
  const stand = youtubeWith({ env: { SMV_YT_PAGES: 'http://127.0.0.1:9' }, pageFetch: () => answer({ text: livePage('abcdefghijk', false) }) });
  await stand.a.liveOne('yt:@lofi');
  assert.equal(stand.rec.fetched[0].url, 'http://127.0.0.1:9/@lofi/live', 'the tests\' stand-in pages');
});

test('the API key: checked with one question, kept encrypted, and read back at start-up', async () => {
  let refuse = '';
  const { a, rec } = youtubeWith({ fetch: url => (refuse ? answer({ status: 400, json: { error: { details: [{ reason: refuse }] } } }) : answer({ json: { items: [] } })) });
  const set = rec.handlers.main['ytkey:set'];
  assert.equal((await set(null, 'too short')).error, 'format');
  refuse = 'API_KEY_INVALID';
  assert.deepEqual(await set(null, KEY), { set: false, saved: false, state: 'ok', until: 0, backoff: 0, error: 'badkey', reason: 'API_KEY_INVALID' });
  refuse = '';
  const st = await set(null, KEY);
  assert.equal(st.set, true);
  assert.equal(st.saved, true);
  assert.equal(rec.checks, 1, 'the live checks run again with it');
  assert.match(rec.fetched.at(-1).url, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/videos\?part=id&id=dQw4w9WgXcQ&key=AIzaSy/);
  const file = JSON.parse(fs.readFileSync(rec.dir + '/youtube-key.json', 'utf8'));
  assert.equal(Buffer.from(file.enc, 'base64').toString(), 'enc:' + KEY, 'only the encrypted key is saved');
  // another start: read back
  const next = youtubeWith();
  fs.mkdirSync(next.rec.dir = rec.dir, { recursive: true });
  await next.a.ready();
  assert.equal((await next.rec.handlers.app['ytkey:status']()).set, true);
  assert.equal((await rec.handlers.main['ytkey:remove']()).set, false);
  assert.equal(fs.existsSync(rec.dir + '/youtube-key.json'), false);
  // over quota: the key is kept, and the page told when the key's state changes
  refuse = 'quotaExceeded';
  const q = await set(null, KEY);
  assert.equal(q.set, true);
  assert.equal(q.state, 'quota');
  assert.deepEqual(rec.sent.at(-1)[0], 'ytkey:status');
  const offline = youtubeWith();
  assert.equal((await offline.rec.handlers.main['ytkey:set'](null, KEY)).error, 'network');
});

test('many channels with the key: each feed, then one question for their videos; without it, every one by its page', async () => {
  const feed = (id, vids) => `<feed><yt:channelId>${id}</yt:channelId><author><name>Feed ${id}</name></author>${vids.map(v => `<yt:videoId>${v}</yt:videoId>`).join('')}</feed>`;
  const vid = (id, state) => ({ id, snippet: { liveBroadcastContent: state, title: 'T ' + id, channelTitle: 'C' }, liveStreamingDetails: state === 'live' ? { concurrentViewers: '7' } : null });
  const asked = [];
  const { a, rec } = youtubeWith({ fetch: url => {
    asked.push(url);
    if (url.includes('forHandle=%40lofi')) return answer({ json: { items: [{ id: 'UClofiaaaaaaaaaaaaaaaa' }] } });
    if (url.includes('forHandle=%40gone')) return answer({ json: { items: [] } });
    if (url.includes('videos.xml')) return answer({ text: feed('UClofiaaaaaaaaaaaaaaaa', ['live0000000', 'oldvideo000']) });
    if (url.includes('videos?part=snippet')) return answer({ json: { items: [vid('live0000000', 'live'), vid('oldvideo000', 'none'), vid('single00000', 'none')] } });
    return answer({ json: { items: [] } });
  } });
  const chs = ['yt:@lofi', 'yt:@gone', 'yt:v:single00000'];
  assert.deepEqual(await a.liveBatch(chs), { results: [], rest: chs }, 'no key yet');
  await rec.handlers.main['ytkey:set'](null, KEY);
  asked.length = 0;
  const r = await a.liveBatch(chs);
  assert.deepEqual(r.rest, []);
  const by = Object.fromEntries(r.results);
  assert.deepEqual({ ...by['yt:@lofi'], checked: 0 }, { live: true, videoId: 'live0000000', title: 'T live0000000', viewers: 7, category: '', startedAt: null, name: 'Feed UClofiaaaaaaaaaaaaaaaa', checked: 0 });
  assert.deepEqual(by['yt:@gone'], { missing: true });
  assert.equal(by['yt:v:single00000'].live, false);
  assert.equal(asked.filter(u => u.includes('videos?part=snippet')).length, 1, 'one question for every video');
  // the next round: the handle's channel id is known, and a finished video isn't asked about again
  asked.length = 0;
  await a.liveBatch(['yt:@lofi']);
  assert.equal(asked.some(u => u.includes('forHandle')), false);
  assert.match(asked.find(u => u.includes('videos?part=snippet')), /id=live0000000&key/);
});

test('many channels with the key: a feed that\'s down, a stream that was live, and the key over its quota', async () => {
  let quota = false;
  const { a, rec } = youtubeWith({
    snapshot: { 'yt:c:UCwasliveaaaaaaaaaaaaa': { live: true, videoId: 'stillon0000', name: 'Was live' } },
    fetch: url => {
      if (quota) return answer({ status: 403, json: { error: { errors: [{ reason: 'quotaExceeded' }] } } });
      if (url.includes('videos.xml')) return answer({ status: 404, text: '' });
      if (url.includes('videos?part=snippet')) return answer({ json: { items: [{ id: 'stillon0000', snippet: { liveBroadcastContent: 'live', title: 'Still on' } }] } });
      return answer({ json: { items: [] } });
    } });
  await rec.handlers.main['ytkey:set'](null, KEY);
  const r = await a.liveBatch(['yt:c:UCwasliveaaaaaaaaaaaaa', 'yt:c:UCneverseenaaaaaaaaaa']);
  assert.deepEqual(r.results.map(([ch, x]) => [ch, x.live, x.name]), [['yt:c:UCwasliveaaaaaaaaaaaaa', true, 'Was live']], 'still live: the same stream');
  assert.deepEqual(r.rest, ['yt:c:UCneverseenaaaaaaaaaa'], 'never checked: its page');
  quota = true;
  const q = await a.liveBatch(['yt:@lofi']);
  assert.deepEqual(q, { results: [], rest: ['yt:@lofi'] });
  assert.equal((await rec.handlers.app['ytkey:status']()).state, 'quota');
  assert.deepEqual(rec.sent.at(-1), ['ytkey:status', await rec.handlers.app['ytkey:status']()]);
  assert.deepEqual(await a.liveBatch(['yt:@lofi']), { results: [], rest: ['yt:@lofi'] }, 'not used again until the quota resets');
});

test('signing in: through Firefox (the page shows how), the login\'s cookies, and Google\'s sign-in shown as Firefox', async () => {
  const { a, rec } = youtubeWith();
  a.openLogin();
  assert.deepEqual(rec.sent, [['youtube:signin']]);
  assert.equal(a.named, false);
  assert.equal(await a.signedIn(), false);
  rec.cookies = [{ name: 'SAPISID', domain: '.youtube.com', value: 'x' }];
  assert.equal(await a.signedIn(), true);
  assert.equal(await a.account(), true);
  rec.cookies = [{ name: 'SAPISID', domain: '.example.com', value: 'x' }];
  assert.equal(await a.account(), false, 'the cookie of another site');
  assert.equal(a.signInAs.test('https://accounts.google.com/'), true);
  assert.match(a.signInAs.userAgent(), /Firefox\//);
  assert.ok(a.signInAs.urls.includes('https://*.google.com/*'));
});

test('YouTube\'s cookie question: "Reject all" saved in a player\'s storage or YouTube\'s, nowhere else', async () => {
  const { rec } = youtubeWith();
  const fallback = rec.handlers.app['youtube:consentFallback'];
  assert.equal(await fallback(null, 'persist:kmv-stream-abc'), true);
  assert.equal(rec.sessionOf, 'persist:kmv-stream-abc');
  assert.deepEqual([rec.setCookies[0].name, rec.setCookies[0].value, rec.setCookies[0].domain], ['SOCS', REJECT_ALL, '.youtube.com']);
  assert.equal(await fallback(null, 'persist:youtube'), true);
  for (const p of ['persist:kick', 'persist:kmv-web', 42]) assert.equal(await fallback(null, p), false, String(p));
  const broken = youtubeWith({ badSession: true });
  assert.equal(await broken.rec.handlers.app['youtube:consentFallback'](null, 'persist:youtube'), false);
});

test('follows: the Subscriptions page, read again in the background at most once a day', async () => {
  const { a, rec } = youtubeWith({ cookies: [{ name: 'LOGIN_INFO', domain: '.youtube.com', value: 'x' }],
    scrape: () => ({ items: [{ ch: 'yt:@lofi', name: 'Lofi' }, { ch: 'yt:@__proto__', name: 'x' }] }) });
  const r = await a.follows.import();
  assert.equal(r.items.length, 2, 'Import checks each channel itself');
  assert.equal(rec.scraped[0][0], 'https://www.youtube.com/feed/channels');
  assert.match(rec.scraped[0][1].signedOut, /LOGGED_IN/);
  await a.follows.tick(Date.now());
  assert.deepEqual(rec.kept, [[{ ch: 'yt:@lofi', name: 'Lofi' }]]);
  assert.equal(rec.ran, 1, 'one follow list at a time');
  await a.follows.tick(Date.now());
  assert.equal(rec.kept.length, 1, 'not again so soon');
  a.follows.retry();
  rec.saved = { at: Date.now(), items: [] };
  await a.follows.tick(Date.now());
  assert.equal(rec.kept.length, 1, 'read today');
  const busy = youtubeWith({ busy: true, cookies: rec.cookies });
  await busy.a.follows.tick(Date.now());
  assert.equal(busy.rec.scraped.length, 0, 'another import is running');
});

test('a profile from the channel\'s page; a video has none', async () => {
  const { a, rec } = youtubeWith({ pageFetch: url => (url.endsWith('@gone') ? answer({ status: 404 }) : answer({ text: '<html><meta property="og:title" content="Lofi"></html>' })) });
  assert.deepEqual(await a.profile('yt:v:abcdefghijk'), { missing: true, video: true });
  assert.deepEqual(await a.profile('yt:@gone'), { missing: true });
  await a.profile('yt:c:UCabcdefghijklmnop');
  assert.equal(rec.fetched.at(-1).url, 'https://www.youtube.com/channel/UCabcdefghijklmnop');
  assert.equal(a.byName('lofi'), 'yt:@lofi');
  assert.equal(a.heldTitle, 'Held for review');
  assert.equal(a.emoteHost('yt3.ggpht.com'), true);
  assert.equal(a.emoteHost('www.gstatic.com'), true);
  assert.equal(a.emoteHost('ggpht.com.evil.example'), false);
});

test('a login copied from Firefox goes into YouTube\'s storage, and the page is told', async t => {
  // (a stand-in for Firefox: the tests never read this computer's own)
  const firefox = require('../../../../../src/main/firefox-login');
  const cookies = [{ name: 'SAPISID', domain: '.youtube.com', value: 'x' }];
  let found = { cookies, profile: 'default-release' };
  t.mock.method(firefox, 'youtubeLoginFromFirefox', () => { if (!found) throw new Error('unreadable'); return found; });
  const { rec } = youtubeWith();
  const fromFirefox = rec.handlers.main['youtube:fromFirefox'];
  assert.deepEqual(await fromFirefox(), { ok: true, count: 1, profile: 'default-release', signedIn: false });
  assert.deepEqual(rec.loginCookies, cookies);
  assert.deepEqual(rec.sent, [['account:changed', { platform: 'youtube', loggedOut: false }]]);
  rec.cookies = cookies;
  assert.equal((await fromFirefox()).signedIn, true);
  found = { error: 'nologin' };
  assert.deepEqual(await fromFirefox(), { error: 'nologin' });
  found = null;
  assert.deepEqual(await fromFirefox(), { error: 'read' });
});
