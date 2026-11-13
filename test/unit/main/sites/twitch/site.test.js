// Twitch's main-process side (src/main/sites/twitch/site.js): reading its answers (a channel, many channels, your follows,
// the moderator check, links), and the adapter, with Twitch's data service replaced by a fake. Runs offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const twitch = require('../../../../../src/main/sites/twitch/site');
const { parseTwitch, parseTwitchHtml, parseTwitchUsers, twitchFollowsFrom, canModerate, fromLink, describeRequest, CLIENT_ID } = twitch;
const { stubCtx, answer } = require('../stub-ctx');

/* ---------- reading Twitch's answers ---------- */
test('one channel: live, offline, missing, or an answer that says nothing', () => {
  const live = parseTwitch({ data: { user: { login: 'alpha', displayName: 'Alpha', stream: { title: 'hi', viewersCount: 3, createdAt: '2026-10-11T19:02:11Z', game: { name: 'Chess' } } } } }, 'alpha');
  assert.deepEqual({ ...live, checked: 0 }, { live: true, title: 'hi', viewers: 3, category: 'Chess', name: 'Alpha', startedAt: Date.UTC(2026, 9, 11, 19, 2, 11), checked: 0 });
  assert.equal(parseTwitch({ data: { user: { login: 'bravo', stream: null } } }, 'bravo').live, false);
  assert.deepEqual(parseTwitch({ data: { user: null } }, 'gone'), { missing: true });
  assert.equal(parseTwitch({ errors: [{}] }, 'x'), null);
});

test('the fallback: the channel page says whether it\'s broadcasting', () => {
  const page = live => '<html>' + 'x'.repeat(600) + `"isLiveBroadcast":${live}</html>`;
  assert.equal(parseTwitchHtml(page(true), 'alpha').live, true);
  assert.equal(parseTwitchHtml(page(false), 'alpha').live, false);
  assert.equal(parseTwitchHtml('short', 'alpha'), null);
});

test('one answer for many channels, and channels that don\'t exist', () => {
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

test('your follows: one page, and where the next one starts', () => {
  const page = twitchFollowsFrom({ data: { currentUser: { follows: { edges: [{ cursor: 'c1', node: { login: 'Alpha', displayName: 'ALPHA' } },
    { cursor: 'c2', node: { login: 'bad login!' } }], pageInfo: { hasNextPage: true } } } } });
  assert.deepEqual(page, { items: [{ ch: 'tw:alpha', name: 'ALPHA' }], next: 'c2' });
  assert.equal(twitchFollowsFrom({ data: { currentUser: { follows: { edges: [], pageInfo: { hasNextPage: false } } } } }).next, null);
  assert.equal(twitchFollowsFrom({ data: { currentUser: null } }), null, 'signed out');
});

test('canModerate: Twitch moderators, editors and your own channel', () => {
  const tw = (login, self) => ({ data: { currentUser: login ? { login } : null, user: self === undefined ? null : { self } } });
  assert.equal(canModerate(tw('me', { isModerator: true, isEditor: false }), 'bravo'), true);
  assert.equal(canModerate(tw('me', { isModerator: false, isEditor: true }), 'bravo'), true);
  assert.equal(canModerate(tw('me', { isModerator: false, isEditor: false }), 'bravo'), false);
  assert.equal(canModerate(tw('Me', { isModerator: false, isEditor: false }), 'me'), true, 'your own channel');
  assert.equal(canModerate(tw('me'), 'gone'), false, 'no such channel');
  assert.equal(canModerate(tw(null, null), 'bravo'), null, 'signed out: unknown');
  assert.equal(canModerate(null, 'bravo'), null);
});

test('a link on the Following page: a channel, not one of Twitch\'s own pages', () => {
  assert.equal(fromLink('/Alpha'), 'tw:alpha');
  assert.equal(fromLink('https://www.twitch.tv/alpha_2/'), 'tw:alpha_2');
  for (const l of ['/directory', '/videos', '/alpha/videos', '/has-dash', 'http://[bad']) assert.equal(fromLink(l), null, l);
});

test('a request to Twitch, in words (Settings › Developer)', () => {
  const d = (u, body) => describeRequest(new URL(u), body);
  assert.equal(d('https://gql.twitch.tv/gql', '{"query":"query($l:[String!]){users(logins:$l){login}}"}'), 'live check (many channels)');
  assert.equal(d('https://gql.twitch.tv/gql', 'isModerator'), 'moderator check');
  assert.equal(d('https://www.twitch.tv/alpha'), 'channel page');
  assert.equal(d('https://www.twitch.tv/directory/following'), 'page');
  assert.equal(d('https://kick.com/alpha'), null);
});

/* ---------- the adapter, with Twitch's data service faked ---------- */
const signedIn = [{ name: 'auth-token', domain: '.twitch.tv', value: 'tok' }, { name: 'login', domain: '.twitch.tv', value: 'Me_Myself' }];
const gqlBody = opts => JSON.parse(opts.body);
// gql(query, variables, opts) answers each question to gql.twitch.tv; page(url) Twitch's pages
function twitchWith({ gql = () => answer({ status: 500 }), page = () => answer({ status: 404 }), ...over } = {}) {
  const { ctx, rec } = stubCtx('twitch', { fetch: (url, opts) => (url === 'https://gql.twitch.tv/gql' ? gql(gqlBody(opts).query, gqlBody(opts).variables, opts) : page(url)), ...over });
  return { a: twitch.create(ctx), rec };
}
const userAnswer = (login, live) => ({ login, displayName: login.toUpperCase(), stream: live ? { title: 'On', viewersCount: 5 } : null });

test('one channel: Twitch\'s data service, with its web client id; its page when that fails', async () => {
  let down = false;
  const { a, rec } = twitchWith({
    gql: (q, v, opts) => { assert.equal(opts.headers['Client-Id'], CLIENT_ID); return down ? answer({ status: 500 }) : answer({ json: { data: { user: userAnswer('alpha', true) } } }); },
    page: () => answer({ text: 'x'.repeat(600) + '"isLiveBroadcast":true' })
  });
  assert.equal((await a.liveOne('tw:alpha')).title, 'On');
  assert.match(gqlBody(rec.fetched[0].opts).query, /user\(login:"alpha"\)/);
  down = true;
  const r = await a.liveOne('tw:alpha');
  assert.equal(r.live, true);
  assert.equal(rec.fetched.at(-1).url, 'https://www.twitch.tv/alpha');
  const off = twitchWith();
  assert.equal(await off.a.liveOne('tw:alpha'), null, 'neither answers');
});

test('many channels: one question per 100; a failed one leaves its channels to be checked one at a time', async () => {
  let asked = 0;
  const { a } = twitchWith({ gql: (q, v) => { asked++; return asked === 2 ? answer({ status: 500 }) : answer({ json: { data: { users: v.l.map(l => userAnswer(l, l === 'c0')) } } }); } });
  const chs = Array.from({ length: 150 }, (_, i) => 'tw:c' + i);
  const r = await a.liveBatch(chs);
  assert.equal(asked, 2);
  assert.equal(r.results.length, 100);
  assert.deepEqual(r.results[0][0], 'tw:c0');
  assert.equal(r.results[0][1].live, true);
  assert.deepEqual(r.rest, chs.slice(100));
});

test('signed in: your token, your name, and your follows page by page', async () => {
  const pages = { null: { edges: [{ cursor: 'a', node: { login: 'alpha', displayName: 'Alpha' } }], pageInfo: { hasNextPage: true } },
    a: { edges: [{ cursor: 'b', node: { login: 'bravo', displayName: 'Bravo' } }], pageInfo: { hasNextPage: false } } };
  const { a, rec } = twitchWith({ cookies: signedIn, gql: (q, v, opts) => {
    assert.equal(opts.headers.Authorization, 'OAuth tok');
    return answer({ json: { data: { currentUser: { follows: pages[v.after] } } } });
  } });
  assert.equal(await a.signedIn(), true);
  assert.equal(await a.account(), 'Me_Myself');
  assert.deepEqual(await a.follows.import(), { items: [{ ch: 'tw:alpha', name: 'Alpha' }, { ch: 'tw:bravo', name: 'Bravo' }] });
  assert.deepEqual(rec.progress, ['Found 1 so far…', 'Found 2 so far…']);
});

test('importing your follows: signed out, a refused token, or the Following page when the list can\'t be read', async () => {
  const out = twitchWith();
  assert.equal(await out.a.signedIn(), false);
  assert.equal(await out.a.account(), null);
  assert.deepEqual(await out.a.follows.import(), { error: 'login' });
  const refused = twitchWith({ cookies: signedIn, gql: () => answer({ status: 401 }) });
  assert.deepEqual(await refused.a.follows.import(), { error: 'login' });
  const broken = twitchWith({ cookies: signedIn, scrape: () => ({ items: [{ ch: 'tw:x', name: 'x' }] }) });
  assert.deepEqual(await broken.a.follows.import(), { items: [{ ch: 'tw:x', name: 'x' }] });
  assert.deepEqual(broken.rec.scraped.map(s => s[0]), ['https://www.twitch.tv/directory/following/channels']);
  const nobody = twitchWith({ cookies: signedIn, gql: () => answer({ json: { data: { currentUser: { follows: { edges: [], pageInfo: {} } } } } }) });
  assert.deepEqual(await nobody.a.follows.import({ scrape: false }), { items: [] }, 'follows nobody');
});

test('whether the login still works: Twitch names you, refuses the token (401), names nobody, or doesn\'t answer', async () => {
  let reply = answer({ json: { data: { currentUser: { login: 'me_myself' } } } }), asked = null;
  const { a } = twitchWith({ cookies: signedIn, gql: (q, v, opts) => { asked = { q, auth: opts.headers.Authorization }; return reply; } });
  assert.equal(await a.loginWorks(), true);
  assert.deepEqual(asked, { q: 'query{currentUser{login}}', auth: 'OAuth tok' }, 'with your login\'s token');
  reply = answer({ status: 401 });
  assert.equal(await a.loginWorks(), false, 'a token Twitch no longer takes');
  reply = answer({ json: { data: { currentUser: null } } });
  assert.equal(await a.loginWorks(), false, 'a token that isn\'t anyone\'s');
  reply = answer({ status: 500 });
  assert.equal(await a.loginWorks(), null, 'no answer: can\'t tell');
  reply = Promise.reject(new Error('offline'));
  reply.catch(() => {});
  assert.equal(await a.loginWorks(), null);
  assert.equal(await twitchWith().a.loginWorks(), null, 'no login here: nothing to check');
});

test('suggestions in the background: your follows once a day, and who\'s live among them', async () => {
  const { a, rec } = twitchWith({ cookies: signedIn, gql: (q, v) => (v && v.l
    ? answer({ json: { data: { users: v.l.map(l => userAnswer(l, l === 'alpha')) } } })
    : answer({ json: { data: { currentUser: { follows: { edges: [{ cursor: 'a', node: { login: 'alpha' } }, { cursor: 'b', node: { login: 'bravo' } }], pageInfo: {} } } } } })) });
  const now = Date.now();
  await a.follows.tick(now);
  assert.deepEqual(rec.kept, [[{ ch: 'tw:alpha', name: 'alpha' }, { ch: 'tw:bravo', name: 'bravo' }]]);
  rec.saved = { at: now, items: rec.kept[0] };
  await a.follows.tick(now);
  assert.deepEqual([...a.follows.live().keys()], ['tw:alpha']);
  assert.equal(rec.changed, 1);
  rec.cookies = [];
  await a.follows.tick(now);
  assert.equal(a.follows.live().size, 0, 'signed out: forgotten');
  a.follows.retry(); a.follows.clearLive();
});

test('a profile: the full question, the basic one when Twitch refuses a field, and (signed in) your follow', async () => {
  const user = { id: '1', login: 'alpha', displayName: 'Alpha', followers: { totalCount: 10 } };
  const { a } = twitchWith({ cookies: signedIn, gql: q => {
    if (/self\{follower/.test(q)) return answer({ json: { data: { user: { self: { follower: { followedAt: '2026-01-01T00:00:00Z' }, subscriptionBenefit: null } } } } });
    if (/videos\(first/.test(q)) return answer({ json: { errors: [{ message: 'no such field' }] } });
    return answer({ json: { data: { user } } });
  } });
  const p = await a.profile('tw:alpha');
  assert.equal(p.name, 'Alpha');
  assert.deepEqual(p.following, { since: Date.UTC(2026, 0, 1) });
  assert.equal(p.loggedIn, true);
  const gone = twitchWith({ gql: () => answer({ json: { data: { user: null } } }) });
  assert.deepEqual(await gone.a.profile('tw:gone'), { missing: true });
});

test('emotes, the moderator check, and the rest of the adapter', async () => {
  const { a, rec } = twitchWith({ cookies: signedIn,
    getJson: () => ({ data: { user: { id: '9', subscriptionProducts: [{ emotes: [{ token: 'alphaHi' }] }] } } }),
    gql: q => (/isModerator/.test(q) ? answer({ json: { data: { currentUser: { login: 'me' }, user: { self: { isModerator: true } } } } })
      : answer({ json: { data: { currentUser: { emoteSets: [{ id: 's', owner: { login: 'alpha' }, emotes: [{ id: 'e1', token: 'alphaHi' }] }] }, user: { id: '9' } } } })) });
  assert.deepEqual(await a.emotes.list('tw:alpha'), { names: ['alphaHi'], id: '9' });
  assert.equal(rec.fetched.at(-1).opts.headers['Client-Id'], CLIENT_ID);
  const pick = await a.emotes.pick('tw:alpha');
  assert.equal(pick.id, '9');
  assert.equal(pick.groups[0].id, 'twitch-channel');
  assert.deepEqual(a.emotes.addOns, { '7tv': 'twitch', bttv: 'twitch', ffz: 'twitch' });
  assert.equal(await a.modCheck('tw:alpha'), true);
  const out = twitchWith({ getJson: () => null });
  assert.equal(await out.a.modCheck('tw:alpha'), null, 'signed out: unknown');
  assert.deepEqual(await out.a.emotes.pick('tw:alpha'), { groups: [], id: null });
  assert.equal(await out.a.emotes.list('tw:alpha'), null);
  assert.equal(a.byName('alpha'), 'tw:alpha');
  assert.equal(a.loginUrl, 'https://www.twitch.tv/login');
  assert.equal(a.emoteHost('static-cdn.jtvnw.net'), true);
});
