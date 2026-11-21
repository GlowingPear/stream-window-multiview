// Rumble's main-process side (src/main/sites/rumble/site.js): reading a channel's "Live" page (its videos' JSON), its
// oEmbed answer, a profile, links, and the adapter with Rumble's pages replaced by made-up ones. Runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const rumble = require('../../../../../src/main/sites/rumble/site');
const { parseRumbleLive, parseRumbleProfile, parseOembed, rumbleItems, rumbleItem, rumblePage, rumbleLivePage, fromLink, describeRequest, signedInOn } = rumble;
const { stubCtx, answer } = require('../stub-ctx');

const BY = { type: 'channel', url: 'https://rumble.com/c/NightOwl', name: 'Night Owl', title: 'Night Owl', followers: 144274, verified_badge: true,
  thumb: 'https://hugh.cdn.rumble.cloud/video/z8/owl.png' };
const item = (o = {}) => ({ object_type: 'video', id: 186945454, permalink_id: 'v35waq4', url: 'https://rumble.com/v35waq4-night-owl-live.html', title: 'Late show',
  live: true, live_placeholder: false, livestream_status: 2, watching_now: 568, live_streamed_on: '2026-11-20T19:30:42+00:00', by: BY, ...o });
// a channel's "Live" page, as Rumble draws it: its header, and its videos as JSON in its <rum-videos-grid>
const livePage = (items, head = '<h1 class="channel-header--title">Night Owl</h1><span>144K Followers</span>') =>
  `<html>${'x'.repeat(600)}${head}<rum-videos-grid>  <script type="application/json">${JSON.stringify({ items })}</script></rum-videos-grid></html>`;
const OEMBED = { type: 'video', title: 'Late show', author_name: 'Night Owl', author_url: 'https://rumble.com/c/NightOwl',
  html: '<iframe src="https://rumble.com/embed/v33aw1a/" width="1920"></iframe>' };

/* ---------- reading Rumble's pages ---------- */
test('its pages: a channel\'s, a user\'s, a video\'s (any words after its id), and their "Live" lists', () => {
  assert.deepEqual(['ru:nightowl', 'ru:u:pip', 'ru:v:v35waq4'].map(rumblePage), ['https://rumble.com/c/nightowl', 'https://rumble.com/user/pip', 'https://rumble.com/v35waq4-x.html']);
  assert.equal(rumbleLivePage('ru:u:pip'), 'https://rumble.com/user/pip/livestreams');
});

test('a channel\'s "Live" page: live (its stream\'s chat number, page, title, viewers, start), offline, and nothing to read', () => {
  const live = parseRumbleLive(livePage([item({ id: 1, live: false, permalink_id: 'old' }), item()]), 'ru:nightowl');
  assert.deepEqual({ ...live, checked: 0 }, { live: true, chat: '186945454', url: 'https://rumble.com/v35waq4-night-owl-live.html', title: 'Late show', viewers: 568, category: '',
    startedAt: Date.UTC(2026, 10, 20, 19, 30, 42), name: 'Night Owl', checked: 0 });
  assert.equal(parseRumbleLive(livePage([item({ livestream_status: 1 })]), 'ru:nightowl').live, false, 'one waiting to start isn\'t live');
  assert.equal(parseRumbleLive(livePage([item({ live_placeholder: true })]), 'ru:nightowl').live, false);
  const none = parseRumbleLive(livePage([]), 'ru:nightowl');
  assert.deepEqual([none.live, none.chat, none.name, none.viewers], [false, null, 'Night Owl', null], 'no videos: its name from its header');
  assert.equal(parseRumbleLive(livePage([], ''), 'ru:nightowl'), null);
  assert.equal(parseRumbleLive(null, 'ru:nightowl'), null);
  assert.equal(parseRumbleLive('<rum-videos-grid><script type="application/json">{bad</script>', 'ru:nightowl'), null);
  assert.equal(parseRumbleLive(livePage([item({ by: undefined, watching_now: 'many' })], ''), 'ru:nightowl').name, 'nightowl', 'no name anywhere: its id');
  assert.deepEqual(rumbleItems(`<rum-videos-grid><script type="application/json">{"items":[1,{"id":2}]}</script>`), [{ id: 2 }]);
  assert.equal(rumbleItems('<rum-videos-grid><script type="application/json">{"items":"no"}</script>'), null);
  assert.equal(rumbleItem(livePage([item()]), 'v35waq4').id, 186945454);
  assert.equal(rumbleItem(livePage([item()]), 'vnope'), null);
});

test('its oEmbed answer: its player\'s id and its channel', () => {
  assert.deepEqual(parseOembed(OEMBED), { embed: 'v33aw1a', channel: 'https://rumble.com/c/NightOwl', title: 'Late show', name: 'Night Owl' });
  assert.equal(parseOembed({ html: '<iframe src="https://example.com/x">' }), null);
  assert.equal(parseOembed(null), null);
});

test('a profile: its name, picture and followers from its videos; with none, from its header', () => {
  const p = parseRumbleProfile(livePage([item()]), 'ru:nightowl');
  assert.deepEqual([p.platform, p.url, p.name, p.avatar, p.followers, p.followersText, p.verified], ['rumble', 'https://rumble.com/c/nightowl', 'Night Owl', BY.thumb, 144274, '', true]);
  const bare = parseRumbleProfile(livePage([]), 'ru:u:pip');
  assert.deepEqual([bare.name, bare.followers, bare.followersText, bare.avatar, bare.url], ['Night Owl', null, '144K', '', 'https://rumble.com/user/pip']);
  assert.equal(parseRumbleProfile(livePage([item({ by: { ...BY, thumb: 'http://x', followers: 'n/a' } })]), 'ru:nightowl').avatar, '', 'only https pictures');
  assert.equal(parseRumbleProfile(livePage([], ''), 'ru:nightowl'), null);
  assert.equal(parseRumbleProfile('short', 'ru:nightowl'), null);
});

test('links on its pages, requests in words, and whether a page shows you signed in', () => {
  assert.equal(fromLink('https://rumble.com/c/NightOwl'), 'ru:nightowl');
  assert.equal(fromLink('/user/Pip/'), 'ru:u:pip');
  assert.equal(fromLink('https://rumble.com/v35waq4-x.html'), null);
  assert.equal(fromLink('https://kick.com/c/x'), null);
  assert.equal(fromLink('http://['), null);
  assert.equal(describeRequest(new URL('https://rumble.com/c/x/livestreams')), 'live streams page');
  assert.equal(describeRequest(new URL('https://rumble.com/api/Media/oembed.json?url=x')), 'a video\'s player (oEmbed)');
  assert.equal(describeRequest(new URL('https://rumble.com/')), 'page');
  assert.equal(describeRequest(new URL('https://kick.com/')), null);
  assert.equal(signedInOn({ user: { logged_in: false }, data: {} }), false);
  assert.equal(signedInOn({ user: { logged_in: true } }), true);
  assert.equal(signedInOn({ user: {} }), null, 'not its answer: can\'t tell');
  assert.equal(signedInOn(null), null);
});

/* ---------- the adapter, with Rumble's pages made up ---------- */
// pages: { url part -> answer }
function rumbleWith(pages, over = {}) {
  const get = url => { const k = Object.keys(pages).find(p => url.includes(p)); return k ? pages[k] : answer({ status: 404 }); };
  const { ctx, rec } = stubCtx('rumble', { pageFetch: get, ...over });
  return { a: rumble.create(ctx), rec };
}

test('one channel: live, with its player\'s id from oEmbed (asked once a video); offline; missing; unreadable', async () => {
  const { a, rec } = rumbleWith({ '/c/nightowl/livestreams': answer({ text: livePage([item()]) }), oembed: answer({ json: OEMBED }),
    '/c/quiet/livestreams': answer({ text: livePage([item({ live: false })]) }), '/c/broken/livestreams': answer({ status: 500 }), '/c/junk/livestreams': answer({ text: 'junk' }) });
  const r = await a.liveOne('ru:nightowl');
  assert.deepEqual({ ...r, checked: 0 }, { live: true, videoId: 'v33aw1a.186945454', title: 'Late show', viewers: 568, category: '', startedAt: Date.UTC(2026, 10, 20, 19, 30, 42), name: 'Night Owl', checked: 0 });
  assert.equal(rec.fetched[1].url, 'https://rumble.com/api/Media/oembed.json?url=' + encodeURIComponent('https://rumble.com/v35waq4-night-owl-live.html'));
  await a.liveOne('ru:nightowl');
  assert.equal(rec.fetched.filter(f => f.url.includes('oembed')).length, 1, 'a video keeps its player');
  const q = await a.liveOne('ru:quiet');
  assert.deepEqual([q.live, q.videoId], [false, null]);
  assert.deepEqual(await a.liveOne('ru:gone'), { missing: true });
  assert.equal(await a.liveOne('ru:broken'), null);
  assert.equal(await a.liveOne('ru:junk'), null);
  const noPlayer = rumbleWith({ '/livestreams': answer({ text: livePage([item()]) }), oembed: answer({ status: 500 }) });
  assert.equal(await noPlayer.a.liveOne('ru:nightowl'), null, 'live, but its player can\'t be found: can\'t tell yet');
  const offline = rumbleWith({}, { pageFetch: () => { throw new Error('offline'); } });
  assert.equal(await offline.a.liveOne('ru:nightowl'), null);
});

test('one video: its channel (oEmbed), whose list says whether it\'s live and its chat\'s number', async () => {
  const pages = { oembed: answer({ json: OEMBED }), '/c/nightowl/livestreams': answer({ text: livePage([item()]) }) };
  const r = await rumbleWith(pages).a.liveOne('ru:v:v35waq4');
  assert.deepEqual([r.live, r.videoId, r.viewers, r.name], [true, 'v33aw1a.186945454', 568, 'Late show']);
  const old = await rumbleWith({ ...pages, '/c/nightowl/livestreams': answer({ text: livePage([item({ live: false })]) }) }).a.liveOne('ru:v:v35waq4');
  assert.deepEqual([old.live, old.videoId, old.viewers], [false, null, null], 'a video that isn\'t live (its player alone isn\'t enough: no chat)');
  assert.deepEqual(await rumbleWith({}).a.liveOne('ru:v:v35waq4'), { missing: true });
  assert.equal(await rumbleWith({ oembed: answer({ status: 500 }) }).a.liveOne('ru:v:v35waq4'), null, 'no answer isn\'t missing');
  assert.equal(await rumbleWith({ oembed: answer({ json: { ...OEMBED, author_url: 'https://example.com/' } }) }).a.liveOne('ru:v:v35waq4'), null);
  assert.equal(await rumbleWith({ oembed: answer({ json: OEMBED }), '/livestreams': answer({ status: 500 }) }).a.liveOne('ru:v:v35waq4'), null);
});

test('a profile; a video has none; the tests\' stand-in pages', async () => {
  const { a } = rumbleWith({ '/c/nightowl/livestreams': answer({ text: livePage([item()]) }), '/c/broken': answer({ status: 500 }) });
  assert.equal((await a.profile('ru:nightowl')).followers, 144274);
  assert.deepEqual(await a.profile('ru:v:v35waq4'), { missing: true, video: true });
  assert.deepEqual(await a.profile('ru:gone'), { missing: true });
  assert.equal(await a.profile('ru:broken'), null);
  const stand = rumbleWith({ '127.0.0.1': answer({ text: livePage([]) }) }, { env: { SMV_RUMBLE_PAGES: 'http://127.0.0.1:9' } });
  await stand.a.liveOne('ru:nightowl');
  assert.equal(stand.rec.fetched[0].url, 'http://127.0.0.1:9/c/nightowl/livestreams');
});

test('the adapter: its login page, signed in by its login cookie, the login checked by its own answer, names and links', async () => {
  let logged = true;
  const none = rumbleWith({}, { cookies: [{ name: 'ui_t', domain: 'rumble.com', value: 'x' }] });
  assert.equal(await none.a.account(), false, 'only its own cookies, not its login\'s');
  const { a, rec } = rumbleWith({}, { cookies: [{ name: 'u_s', domain: '.rumble.com', value: 'x' }], loginFetch: () => answer({ json: { user: { logged_in: logged } } }) });
  assert.equal(a.loginUrl, 'https://rumble.com/login.php');
  assert.equal(a.named, false);
  assert.equal(await a.account(), true);
  assert.equal(await a.signedIn(), true);
  assert.equal(rec.fetched.length, 0, 'no question to Rumble for that');
  assert.equal(await a.loginWorks(), true);
  assert.equal(rec.fetched[0].url, 'https://rumble.com/service.php?name=emote.list');
  assert.equal(rec.fetched[0].login, true, 'with your login');
  logged = false;
  assert.equal(await a.loginWorks(), false, 'Rumble has signed the app out');
  assert.equal(await rumbleWith({}, { loginFetch: () => answer({ status: 503 }) }).a.loginWorks(), null, 'no answer: can\'t tell');
  assert.equal(await rumbleWith({}, { loginFetch: () => { throw new Error('offline'); } }).a.loginWorks(), null);
  assert.equal(await rumbleWith({}, { cookies: [{ name: 'u_s', domain: '.example.com', value: 'x' }] }).a.signedIn(), false, 'another site\'s cookie of that name');
  assert.equal(a.byName('NightOwl'), 'ru:nightowl');
  assert.deepEqual(['ru:nightowl', 'ru:u:pip', 'ru:v:v35waq4'].map(a.alsoAt), ['ru:u:nightowl', null, null], 'a channel\'s name may be a user\'s');
  assert.equal(a.fromLink('https://rumble.com/c/x'), 'ru:x');
  assert.equal(a.emoteHost('hugh.cdn.rumble.cloud'), true);
  assert.equal(a.emoteHost('example.com'), false);
});

test('follows: its Followed Channels page (its list, signed out without it), read again in the background at most once a day', async () => {
  const cookies = [{ name: 'u_s', domain: '.rumble.com', value: 'x' }];
  const { a, rec } = rumbleWith({}, { cookies, scrape: () => ({ items: [{ ch: 'ru:u:pip', name: 'Pip' }, { ch: 'ru:nightowl', name: 'Night Owl' }] }) });
  const r = await a.follows.import();
  assert.equal(r.items.length, 2);
  assert.deepEqual([rec.scraped[0][0], rec.scraped[0][1].scope, rec.scraped[0][1].name], ['https://rumble.com/followed-channels', 'ol.followed-channels__list', '.line-clamp-2']);
  assert.match(rec.scraped[0][1].signedOut, /login\.php/);
  await a.follows.tick(Date.now());
  assert.deepEqual(rec.kept, [[{ ch: 'ru:u:pip', name: 'Pip' }, { ch: 'ru:nightowl', name: 'Night Owl' }]]);
  await a.follows.tick(Date.now());
  assert.equal(rec.kept.length, 1, 'not again so soon');
  a.follows.retry();
  rec.saved = { at: Date.now(), items: [] };
  await a.follows.tick(Date.now());
  assert.equal(rec.kept.length, 1, 'read today');
  const out = rumbleWith({});
  await out.a.follows.tick(Date.now());
  assert.equal(out.rec.scraped.length, 0, 'signed out: not read');
  const busy = rumbleWith({}, { busy: true, cookies });
  await busy.a.follows.tick(Date.now());
  assert.equal(busy.rec.scraped.length, 0, 'another import is running');
  const nothing = rumbleWith({}, { cookies, scrape: () => ({ items: [] }) });
  await nothing.a.follows.tick(Date.now());
  assert.equal(nothing.rec.kept.length, 0, 'an empty list isn\'t kept');
});

test('emotes: its live chat\'s list as the picker\'s groups (the channel\'s with its picture, then Rumble\'s), sent as :name:', async () => {
  const { rumbleGroups } = rumble;
  const LIST = { user: { logged_in: true }, data: { items: [
    { id: 1, title: 'Night Owl Emotes', channel_id: 669235, channel_picture: 'https://hugh.cdn.rumble.cloud/owl.png', emotes: [{ name: 'owlhoot', is_subs_only: true, file: 'https://hugh.cdn.rumble.cloud/hoot.png' }, { name: 'bad', file: 'http://x' }] },
    { id: 2, title: 'Rumble Emotes', channel_id: null, emotes: [{ name: 'r+rumblecharge', is_subs_only: false, file: 'https://hugh.cdn.rumble.cloud/charge.gif' }] },
    { id: 3, title: 'Empty', channel_id: 7, emotes: [] }, null] } };
  assert.deepEqual(rumbleGroups(LIST), [
    { id: 'rumble-channel', label: 'Night Owl Emotes', emotes: [{ name: 'owlhoot', url: 'https://hugh.cdn.rumble.cloud/hoot.png', send: ':owlhoot:', subs: true }], pic: 'https://hugh.cdn.rumble.cloud/owl.png' },
    { id: 'rumble', label: 'Rumble', emotes: [{ name: 'r+rumblecharge', url: 'https://hugh.cdn.rumble.cloud/charge.gif', send: ':r+rumblecharge:' }] }]);
  assert.equal(rumbleGroups({ user: {} }), null);
  // the live check knows the chat: asked with your login
  const { a, rec } = rumbleWith({}, { snapshot: { 'ru:nightowl': { live: true, videoId: 'v33aw1a.186945454' } }, loginFetch: () => answer({ json: LIST }) });
  const picked = await a.emotes.pick('ru:nightowl');
  assert.deepEqual([picked.groups.map(g => g.id), picked.id], [['rumble-channel', 'rumble'], null]);
  assert.equal(rec.fetched[0].url, 'https://rumble.com/service.php?name=emote.list&chat_id=186945454');
  assert.deepEqual(await a.emotes.list('ru:nightowl'), { names: ['owlhoot'], id: null }, 'the channel\'s own, for new emotes');
  assert.deepEqual(a.emotes.addOns, {});
  // not known yet: its live check says; offline: none
  const asked = rumbleWith({ '/livestreams': answer({ text: livePage([item()]) }), oembed: answer({ json: OEMBED }) }, { loginFetch: () => answer({ json: LIST }) });
  assert.equal((await asked.a.emotes.pick('ru:nightowl')).groups.length, 2);
  const off = rumbleWith({ '/livestreams': answer({ text: livePage([item({ live: false })]) }) }, { loginFetch: () => answer({ json: LIST }) });
  assert.deepEqual(await off.a.emotes.pick('ru:nightowl'), { groups: [], id: null });
  assert.equal(await off.a.emotes.list('ru:nightowl'), null);
  const broken = rumbleWith({}, { snapshot: { 'ru:nightowl': { live: true, videoId: 'v33aw1a.186945454' } }, loginFetch: () => { throw new Error('offline'); } });
  assert.deepEqual((await broken.a.emotes.pick('ru:nightowl')).groups, []);
});

test('whether you moderate a channel: its live chat\'s first event (can_moderate), read as it comes, with your login', async () => {
  const { canModerateIn, firstEvent } = rumble;
  assert.equal(canModerateIn({ type: 'init', data: { can_moderate: true } }), true);
  assert.equal(canModerateIn({ type: 'messages', data: { can_moderate: true } }), null);
  assert.equal(canModerateIn(null), null);
  assert.equal(firstEvent(': \ndata: {"type":"in'), undefined, 'not all there yet');
  assert.deepEqual(firstEvent(': \ndata: {"type":"init"}\n'), { type: 'init' });
  assert.equal(firstEvent('data: {bad}\n'), null);
  // its stream, in pieces; the live check says its chat
  const stream = (...parts) => answer({ text: '' }) && { ok: true, status: 200, body: { getReader: () => { let i = 0; return { read: async () => (i < parts.length ? { value: new TextEncoder().encode(parts[i++]), done: false } : { value: undefined, done: true }) }; } } };
  const cookies = [{ name: 'u_s', domain: '.rumble.com', value: 'x' }], snapshot = { 'ru:nightowl': { live: true, videoId: 'v33aw1a.186945454' } };
  const mod = rumbleWith({}, { cookies, snapshot, loginFetch: url => stream(': ok\n\ndata: {"type":"init","data":{"chat":', '{"id":"1"},"can_moderate":true}}\n\n') });
  assert.equal(await mod.a.modCheck('ru:nightowl'), true);
  assert.equal(mod.rec.fetched[0].url, 'https://web7.rumble.com/chat/api/chat/186945454/stream');
  assert.equal(mod.rec.fetched[0].opts.headers.Accept, 'text/event-stream');
  assert.equal(await rumbleWith({}, { cookies, snapshot, loginFetch: () => stream('data: {"type":"init","data":{"can_moderate":false}}\n') }).a.modCheck('ru:nightowl'), false);
  assert.equal(await rumbleWith({}, { cookies, snapshot, loginFetch: () => stream('data: {"type":"in') }).a.modCheck('ru:nightowl'), null, 'it ended before its first event');
  assert.equal(await rumbleWith({}, { cookies, snapshot, loginFetch: () => answer({ status: 403 }) }).a.modCheck('ru:nightowl'), null);
  assert.equal(await rumbleWith({}, { cookies, snapshot, loginFetch: () => { throw new Error('offline'); } }).a.modCheck('ru:nightowl'), null);
  assert.equal(await rumbleWith({}, { snapshot }).a.modCheck('ru:nightowl'), null, 'signed out: can\'t tell');
  assert.equal(await rumbleWith({ '/livestreams': answer({ text: livePage([item({ live: false })]) }) }, { cookies }).a.modCheck('ru:nightowl'), null, 'not live: no chat to ask');
});
