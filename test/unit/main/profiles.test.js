// Streamer profiles: recording streams from the live checks, filling gaps from past broadcasts,
// the numbers the profile shows, and reading what Kick, Twitch and YouTube say about a channel.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory, profileSummary, parseKickProfile, parseKickVideos, parseTwitchProfile, parseYouTubeChannel, social, usualStart, GAP } = require('../../../src/main/profiles');
const { toTime } = require('../../../src/main/live');

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// a clock the test moves by hand
function clock(t) { const c = { t, now: () => c.t, go: ms => { c.t += ms; } }; return c; }
const at = (h, m = 0, dayOffset = 0) => { const d = new Date(2026, 9, 5 + dayOffset, h, m); return d.getTime(); };   // Mon Oct 5 2026, local time

test('a stream is recorded from the live checks: start, title and game changes, viewer counts, end', () => {
  const c = clock(at(19, 2));
  const h = createHistory(null, { now: c.now });
  h.record({ alpha: { live: true, title: 'Hello', category: 'Chess', viewers: 100, startedAt: at(19, 0) }, bravo: { live: false } });
  for (let i = 0; i < 10; i++) { c.go(MIN); h.record({ alpha: { live: true, title: i < 5 ? 'Hello' : 'Part 2', category: i < 7 ? 'Chess' : 'Just Chatting', viewers: 100 + i * 10 } }); }
  c.go(MIN); h.record({ alpha: { live: false } });
  const e = h.entry('alpha');
  assert.equal(e.sessions.length, 1);
  const s = e.sessions[0];
  assert.equal(s.start, at(19, 0), 'the site\'s start time, not when the app first saw it');
  assert.equal(s.exact, true);
  assert.equal(s.end, at(19, 12), 'ends when the app last saw it live');
  assert.equal(s.peak, 190);
  assert.deepEqual(s.titles.map(x => x.t), ['Hello', 'Part 2']);
  assert.deepEqual(s.cats.map(x => x.c), ['Chess', 'Just Chatting']);
  assert.equal(s.samples.length, 11, 'one viewer count a minute');
  assert.equal(h.entry('bravo').sessions.length, 0, 'an offline channel is tracked but has no streams');
  assert.ok(h.takeChanged() && !h.takeChanged(), 'says when there is something to save, once');
});

test('checks every 30 s keep one viewer count a minute; a missing channel is ignored', () => {
  const c = clock(at(20));
  const h = createHistory(null, { now: c.now });
  for (let i = 0; i < 9; i++) { h.record({ a: { live: true, viewers: 5 }, gone: { missing: true } }); c.go(30e3); }
  assert.equal(h.entry('a').sessions[0].samples.length, 5);
  assert.equal(h.entry('gone'), null);
});

test('without a start time from the site, a break of 20+ min starts a new stream; with one, the site decides', () => {
  const c = clock(at(18));
  const h = createHistory(null, { now: c.now });
  h.record({ a: { live: true } });
  c.go(10 * MIN); h.record({ a: { live: true } });            // app closed for 10 min: same stream
  c.go(GAP + MIN); h.record({ a: { live: true } });           // 21 min: a new one
  assert.equal(h.entry('a').sessions.length, 2);
  assert.equal(h.entry('a').sessions[0].end, at(18, 10));
  assert.equal(h.entry('a').sessions[0].exact, false, 'start time as first seen');

  const c2 = clock(at(18));
  const h2 = createHistory(null, { now: c2.now });
  h2.record({ b: { live: true, startedAt: at(17, 55) } });
  c2.go(2 * HOUR); h2.record({ b: { live: true, startedAt: at(17, 55) } });     // app was closed 2 h, same stream says the site
  assert.equal(h2.entry('b').sessions.length, 1);
  c2.go(MIN); h2.record({ b: { live: true, startedAt: at(20, 0) } });            // a restart: new start time
  assert.equal(h2.entry('b').sessions.length, 2);
  assert.equal(h2.entry('b').sessions[1].start, at(20, 0));
});

test('past broadcasts fill in streams the app missed and make its own records exact', () => {
  const c = clock(at(23));
  const h = createHistory(null, { now: c.now });
  c.t = at(19, 10); h.record({ a: { live: true, title: 'seen' } });                 // the app saw this one from 19:10 (no start time)
  while (c.t < at(21, 0)) { c.go(10 * MIN); h.record({ a: { live: true } }); }
  c.t = at(21, 2); h.record({ a: { live: false } });
  c.t = at(23);
  h.mergeVods('a', [
    { id: 'v1', start: at(19, 0), end: at(21, 30), title: 'seen', category: 'Chess', views: 900 },
    { id: 'v2', start: at(19, 0, -2), end: at(22, 0, -2), title: 'missed', category: 'Chess', views: 500 },
    { id: 'bad', start: at(19, 0, 3), end: at(20, 0, 3) },                          // in the future: ignored
    null
  ]);
  const ss = h.entry('a').sessions;
  assert.deepEqual(ss.map(s => s.src), ['vod', 'app']);
  assert.equal(ss[1].start, at(19, 0), 'the broadcast gives the exact start');
  assert.equal(ss[1].end, at(21, 30), 'and the exact end');
  assert.equal(ss[1].vod, 'v1');
  assert.equal(ss[0].title, 'missed');
  h.mergeVods('a', [{ id: 'v2', start: at(19, 0, -2), end: at(22, 0, -2) }]);
  assert.equal(h.entry('a').sessions.length, 2, 'the same broadcast isn\'t added twice');
});

test('the profile numbers: streams, length, usual start, days, streak, viewers, categories, heatmap, coverage', () => {
  const now = at(12, 0, 0);                     // Monday noon
  const c = clock(now - 30 * DAY);
  const h = createHistory(null, { now: c.now });
  c.t = now;
  const vods = [];
  for (let d = 1; d <= 28; d++) {               // the last 4 weeks: Tue, Wed and Thu at 7 PM for 4 hours
    const day = new Date(now - d * DAY), wd = (day.getDay() + 6) % 7;
    if (wd < 1 || wd > 3) continue;
    const s = new Date(day); s.setHours(19, 0, 0, 0);
    vods.push({ id: 'v' + d, start: s.getTime(), end: s.getTime() + 4 * HOUR, title: 'stream', category: d % 2 ? 'Chess' : 'Go', views: 10 });
  }
  h.mergeVods('a', vods);
  h.setFollowers('a', 1000);
  // the app saw one stream with viewer counts
  c.t = at(19, 0, -6); h.record({ a: { live: true, viewers: 50, startedAt: at(19, 0, -6) } });
  while (c.t < at(19, 50, -6)) { c.go(10 * MIN); h.record({ a: { live: true } }); }    // a check without a viewer count
  c.t = at(20, 0, -6); h.record({ a: { live: true, viewers: 150 } });
  while (c.t < at(23, 0, -6)) { c.go(10 * MIN); h.record({ a: { live: true } }); }
  c.t = at(23, 1, -6); h.record({ a: { live: false } });
  c.t = now;
  const sm = profileSummary(h.entry('a'), { now });
  assert.equal(sm.stats.streams30, 12);
  assert.equal(Math.round(sm.stats.avgLength / MIN), 240);
  assert.equal(sm.stats.usual.minute, 19 * 60, 'usually starts at 7 PM');
  assert.equal(sm.stats.usual.spread, 0);
  assert.deepEqual(sm.stats.dayCounts, [0, 4, 4, 4, 0, 0, 0]);
  assert.equal(sm.stats.avgViewers, 100, 'only from what the app saw');
  assert.equal(sm.stats.peak30, 150);
  assert.equal(sm.stats.streak.current, 0, 'nothing yesterday (Sunday)');
  assert.equal(sm.stats.streak.best, 3);
  assert.deepEqual(sm.categories.map(x => x.name).sort(), ['Chess', 'Go']);
  assert.equal(Math.round(sm.categories.reduce((a, x) => a + x.hours, 0)), 48);
  assert.equal(sm.coverage.appSeen30, 1);
  assert.equal(sm.coverage.vod30, 11);
  assert.equal(sm.followers.count, 1000);
  assert.equal(sm.history[0].src, 'vod');
  assert.equal(sm.history.find(x => x.src === 'both').peak, 150, 'the app\'s stream matched its broadcast');
  // heatmap: Tue 19-22 h live every week, Mon never
  assert.ok(sm.heat);
  assert.equal(sm.heat.cells[1][19], 1);
  assert.equal(sm.heat.cells[1][22], 1);
  assert.equal(sm.heat.cells[1][23], 0);
  assert.equal(sm.heat.cells[0][19], 0);
  assert.equal(sm.live, null);
  assert.equal(sm.recap.title, 'stream');
});

test('a live stream shows as live, with its viewer graph; an empty or new channel has no numbers to guess', () => {
  const c = clock(at(20));
  const h = createHistory(null, { now: c.now });
  h.record({ a: { live: true, viewers: 10, title: 'now', startedAt: at(19, 30) } });
  c.go(MIN); h.record({ a: { live: true, viewers: 20 } });
  const sm = profileSummary(h.entry('a'), { now: c.t });
  assert.equal(sm.live.title, 'now');
  assert.equal(sm.live.start, at(19, 30));
  assert.equal(sm.history[0].end, null);
  assert.equal(sm.viewers.length, 2);
  assert.equal(sm.heat, null, 'not enough streams for a heatmap');
  assert.equal(sm.stats.usual, null, 'one start is not "usually"');
  // seen live long ago and never offline since (the app was closed): that stream is over
  const later = profileSummary(h.entry('a'), { now: c.t + DAY });
  assert.equal(later.live, null);
  assert.equal(later.recap.end, at(20, 1));
  assert.deepEqual(profileSummary(null).history, []);
});

test('usual start: 11 PM and 1 AM average to midnight, not noon', () => {
  const r = usualStart([at(23, 0), at(1, 0, 1), at(23, 30, 2), at(0, 30, 4)]);
  assert.equal(r.minute % 1440 < 60 || r.minute > 1380, true, String(r.minute));
});

test('follower counts: one a day, growth over the month', () => {
  const c = clock(at(12));
  const h = createHistory(null, { now: c.now });
  h.setFollowers('a', 100); h.setFollowers('a', 105);
  assert.equal(h.entry('a').followers.length, 1, 'the latest count that day');
  c.go(DAY); h.setFollowers('a', 120);
  const f = profileSummary(h.entry('a'), { now: c.t }).followers;
  assert.deepEqual([f.count, f.change], [120, 15]);
  h.setFollowers('a', NaN);
  assert.equal(h.entry('a').followers.length, 2);
});

test('notes, tags, favourite and nickname are kept and tidied', () => {
  const h = createHistory(null);
  const m = h.setMeta('a', { notes: 'hi', tags: ['Friends', ' friends ', '', 'x'.repeat(40), 'Friends'], fav: true, nick: '  Al  ' });
  assert.deepEqual(m, { notes: 'hi', tags: ['Friends', 'friends', 'x'.repeat(24)], fav: true, nick: 'Al' });
  assert.deepEqual(h.getMeta('zz'), { notes: '', tags: [], fav: false, nick: '' });
  h.setMeta('a', { notes: '', tags: [], fav: false, nick: '' });
  assert.deepEqual(h.allMeta(), {}, 'nothing left: nothing stored');
});

test('the saved data loads back, and old streams and viewer counts are trimmed', () => {
  const c = clock(at(12));
  const h = createHistory(null, { now: c.now });
  for (let i = 0; i < 8; i++) { h.record({ a: { live: true, viewers: 1 } }); c.go(MIN); h.record({ a: { live: true, viewers: 2 } }); c.go(MIN); h.record({ a: { live: false } }); c.go(DAY); }
  const ss = h.entry('a').sessions;
  assert.equal(ss.length, 8);
  assert.deepEqual(ss.map(s => s.samples.length), [0, 0, 0, 2, 2, 2, 2, 2], 'only the last streams keep their viewer counts');
  const back = createHistory(JSON.parse(JSON.stringify(h.data())), { now: c.now });
  assert.equal(back.entry('a').sessions.length, 8);
  assert.equal(createHistory({ v: 99 }).entry('a'), null, 'an unknown file starts empty');
  c.go(500 * DAY); h.record({ a: { live: true } });
  assert.equal(h.entry('a').sessions.length, 1, 'streams over 400 days old are dropped');
});

/* ---------- the sites ---------- */
test('Kick: the channel\'s profile, live stream, chat rules, socials and badges', () => {
  const p = parseKickProfile({
    slug: 'novakit', followers_count: 1234, verified: true, is_affiliate: true,
    banner_image: { url: 'https://files.kick.com/b.jpg' },
    user: { username: 'NovaKit', bio: 'hello', profile_pic: 'https://files.kick.com/a.png', instagram: 'nova', twitter: 'https://x.com/nova', discord: '', youtube: 'javascript:alert(1)' },
    livestream: { is_live: true, session_title: 'Live!', viewer_count: 50, start_time: '2026-10-11 19:02:11', categories: [{ name: 'Chess' }], thumbnail: { url: 'https://images.kick.com/t.jpg' } },
    chatroom: { followers_mode: true, following_min_duration: 10, slow_mode: true, message_interval: 5 },
    subscriber_badges: [{ months: 1, badge_image: { src: 'https://files.kick.com/1.png' } }, { months: 3, badge_image: { src: 'http://insecure/x.png' } }],
    previous_livestreams: [{ id: 9, start_time: '2026-10-10 18:00:00', duration: 7200000, session_title: 'Old', categories: [{ name: 'Go' }], views: 77 }]
  }, 'novakit');
  assert.equal(p.name, 'NovaKit');
  assert.equal(p.followers, 1234);
  assert.equal(p.verified, true);
  assert.equal(p.avatar, 'https://files.kick.com/a.png');
  assert.equal(p.banner, 'https://files.kick.com/b.jpg');
  assert.equal(p.live.startedAt, Date.UTC(2026, 9, 11, 19, 2, 11), 'Kick\'s times are UTC without a zone');
  assert.equal(p.live.category, 'Chess');
  assert.deepEqual(p.chat, { followersOnly: true, followMinutes: 10, subsOnly: false, emoteOnly: false, slowSeconds: 5 });
  assert.deepEqual(p.socials.map(s => [s.site, s.url]), [['Instagram', 'https://instagram.com/nova'], ['X', 'https://x.com/nova']], 'a script link is never kept');
  assert.equal(p.badges.length, 1, 'only https pictures');
  assert.deepEqual(p.vods, [{ id: '9', start: Date.UTC(2026, 9, 10, 18), end: Date.UTC(2026, 9, 10, 20), title: 'Old', category: 'Go', views: 77 }]);
  assert.equal(parseKickProfile({ message: 'nope' }), null);
  assert.equal(parseKickProfile({ slug: 'x', user: {}, livestream: null }).live, null);
});

test('Kick: past broadcasts, with the length in milliseconds or seconds', () => {
  const v = parseKickVideos([
    { id: 1, created_at: '2026-10-01T18:00:00.000000Z', duration: 3600000, session_title: 'ms', categories: [{ name: 'A' }], video: { uuid: 'u1', views: 5 } },
    { id: 2, start_time: '2026-10-02 18:00:00', duration: 5400, session_title: 's' },
    { id: 3, start_time: 'not a date', duration: 100 },
    'junk'
  ]);
  assert.deepEqual(v.map(x => (x.end - x.start) / MIN), [60, 90]);
  assert.equal(v[0].views, 5);
  assert.equal(parseKickVideos({}), null);
});

test('Twitch: profile, roles, socials, live stream, past broadcasts and your follow', () => {
  const p = parseTwitchProfile({ data: { user: {
    login: 'ember', displayName: 'Ember', description: 'cozy', profileImageURL: 'https://static-cdn.jtvnw.net/a.png', bannerImageURL: null,
    createdAt: '2019-05-01T00:00:00Z', roles: { isPartner: false, isAffiliate: true }, followers: { totalCount: 64000 },
    channel: { socialMedias: [{ name: 'twitter', title: 'Twitter', url: 'https://twitter.com/ember' }, { name: 'other', title: 'Shop', url: 'ftp://nope' }] },
    stream: { createdAt: '2026-10-11T16:00:00Z', viewersCount: 300, title: 'Farming', game: { name: 'Cozy Farm' }, previewImageURL: 'https://static-cdn.jtvnw.net/p.jpg' },
    lastBroadcast: { startedAt: '2026-10-11T16:00:00Z', title: 'Farming', game: { name: 'Cozy Farm' } },
    videos: { edges: [{ node: { id: '77', title: 'Yesterday', createdAt: '2026-10-10T16:00:00Z', lengthSeconds: 7200, viewCount: 40, game: { name: 'Cozy Farm' } } }, null] },
    self: { follower: { followedAt: '2024-02-12T00:00:00Z' }, subscriptionBenefit: { tier: '1000', purchasedWithPrime: true } }
  } } }, 'ember');
  assert.equal(p.ch, 'tw:ember');
  assert.equal(p.followers, 64000);
  assert.equal(p.affiliate, true);
  assert.equal(p.banner, '');
  assert.equal(p.live.startedAt, Date.UTC(2026, 9, 11, 16));
  assert.deepEqual(p.socials.map(s => s.url), ['https://twitter.com/ember']);
  assert.deepEqual(p.vods.map(v => (v.end - v.start) / HOUR), [2]);
  assert.equal(p.following.since, Date.UTC(2024, 1, 12));
  assert.deepEqual(p.sub, { tier: '1', prime: true });
  assert.deepEqual(parseTwitchProfile({ data: { user: null } }, 'x'), { missing: true });
  assert.equal(parseTwitchProfile({ errors: [{}] }, 'x'), null);
  assert.equal(parseTwitchProfile({ data: { user: { login: 'x', self: { follower: null } } } }, 'x').following, false, 'not following');
});

test('YouTube: the channel page gives the name, picture, banner, about and subscribers', () => {
  const html = '<html><head><meta property="og:title" content="Driftline &amp; Co"><meta property="og:image" content="https://yt3.googleusercontent.com/av=s900">' +
    '<meta property="og:description" content="Lo-fi radio"><link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghij1234567890"></head>' +
    '<script>var x = {"pageHeaderBanner":{"image":{"sources":[{"url":"https://yt3.googleusercontent.com/banner=w1060"}]}},"content":"1.2M subscribers"};</script>' + ' '.repeat(600);
  const p = parseYouTubeChannel(html, 'yt:@driftline');
  assert.equal(p.name, 'Driftline & Co');
  assert.equal(p.avatar, 'https://yt3.googleusercontent.com/av=s900');
  assert.equal(p.banner, 'https://yt3.googleusercontent.com/banner=w1060');
  assert.equal(p.followersText, '1.2M subscribers'.replace(' subscribers', ''));
  assert.equal(p.url, 'https://www.youtube.com/channel/UCabcdefghij1234567890');
  assert.equal(parseYouTubeChannel('<html>short</html>', 'yt:@x'), null);
});

test('social links: handles become links, and only https links are kept', () => {
  assert.equal(social('tiktok', '@nova').url, 'https://tiktok.com/@nova');
  assert.equal(social('youtube', 'nova').url, 'https://youtube.com/@nova');
  assert.equal(social('discord', 'abc').url, 'https://discord.gg/abc');
  assert.equal(social('instagram', 'http://instagram.com/nova').url, 'https://instagram.com/nova');
  assert.equal(social('twitter', 'javascript:alert(1)'), null);
  assert.equal(social('instagram', ''), null);
});

test('times from the sites', () => {
  assert.equal(toTime('2026-10-11 19:02:11'), Date.UTC(2026, 9, 11, 19, 2, 11));
  assert.equal(toTime('2026-10-11T19:02:11Z'), Date.UTC(2026, 9, 11, 19, 2, 11));
  assert.equal(toTime(1791736000), 1791736000000, 'seconds');
  assert.equal(toTime(''), null);
  assert.equal(toTime('soon'), null);
});
