// Twitch's main-process side (what every site module gives: sites/index.js). Twitch answers through its public data
// service (GQL) with its web client id, and with your login's token (the auth-token cookie) for what's yours: your
// follows, your emotes, whether you moderate a channel.
// The top half is plain logic (tested on its own); create() below wires it into the app.
const { SiteAdapter } = require('../adapter');   // (what every site's adapter has: adapter.js)
const SmvSites = require('../../../shared/sites');
const { toTime } = require('../../live');
const { parseTwitchProfile } = require('../../profiles');
const { parseTwitchEmotes } = require('../../emote-lists');
const { twitchGroups } = require('../../emote-picker');

const GQL = 'https://gql.twitch.tv/gql';
const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';   // Twitch's public web client id

// An answer from Twitch's public data service ({ data: { user: { stream } } }).
function parseTwitch(d, login) {
  const u = d && d.data ? d.data.user : undefined;
  if (u === undefined) return null;
  if (u === null) return { missing: true };
  const st = u.stream;
  return {
    live: !!st,
    title: st ? String(st.title || '') : '',
    viewers: st && Number.isFinite(+st.viewersCount) ? +st.viewersCount : null,
    category: st && st.game ? String(st.game.name || '') : '',
    name: u.displayName || u.login || login,
    startedAt: st ? toTime(st.createdAt) : null,
    checked: Date.now()
  };
}
// The fallback: the channel page itself says whether it's broadcasting.
function parseTwitchHtml(html, login) {
  if (typeof html !== 'string' || html.length < 500) return null;
  const live = /"isLiveBroadcast"\s*:\s*true/.test(html);
  return { live, title: '', viewers: null, category: '', name: login, checked: Date.now() };
}
// { data: { users: [user | null, …] } } for users(logins: […]) -> Map(login -> info | { missing }).
function parseTwitchUsers(d, logins) {
  const users = d && d.data && d.data.users;
  if (!Array.isArray(users)) return null;
  const out = new Map();
  for (const u of users) if (u && u.login) out.set(String(u.login).toLowerCase(), parseTwitch({ data: { user: u } }, u.login));
  for (const l of logins) if (!out.has(l)) out.set(l, { missing: true });
  return out;
}
// One page of { currentUser { follows { edges { node { login displayName } } } } }
function twitchFollowsFrom(d) {
  const f = d && d.data && d.data.currentUser && d.data.currentUser.follows;
  if (!f) return null;
  const edges = Array.isArray(f.edges) ? f.edges : [];
  const items = edges.filter(e => e && e.node && /^[a-z0-9_]{1,25}$/i.test(e.node.login || ''))
    .map(e => ({ ch: 'tw:' + e.node.login.toLowerCase(), name: e.node.displayName || e.node.login }));
  const last = edges.length ? edges[edges.length - 1].cursor : null;
  return { items, next: f.pageInfo && f.pageInfo.hasNextPage && last ? last : null };
}
// Whether you can moderate a channel, from { currentUser { login } user(login) { self { isModerator } } }: its
// moderators, its editors and your own channel. null when the answer doesn't say.
function canModerate(d, login) {
  if (!d || typeof d !== 'object') return null;
  const me = d.data && d.data.currentUser, self = d.data && d.data.user && d.data.user.self;
  if (!me) return null;
  if (String(me.login || '').toLowerCase() === String(login || '').toLowerCase()) return true;   // your own channel
  return self ? !!(self.isModerator || self.isEditor) : false;
}
// A link on the Following page -> its channel id (or null): Twitch's own pages aren't channels.
const RESERVED = /^(directory|videos|settings|search|subscriptions|inventory|drops|wallet|p|downloads|jobs|turbo|prime|store|friends|messages|following|login|signup|payments|u|moderator|team|clips)$/;
function fromLink(href) {
  let u; try { u = new URL(href, 'https://www.twitch.tv'); } catch { return null; }
  const p = u.pathname.replace(/\/+$/, '');
  const m = p.match(/^\/([A-Za-z0-9_-]{1,40})$/);
  if (!m || RESERVED.test(m[1].toLowerCase())) return null;
  return /^[A-Za-z0-9_]{1,25}$/.test(m[1]) ? 'tw:' + m[1].toLowerCase() : null;
}
// A request to Twitch, in words for Settings › Developer (devlog.js), or null when it isn't Twitch's
function describeRequest(u, body) {
  const h = u.hostname, p = u.pathname;
  if (h === 'gql.twitch.tv') {
    const q = String(body || '');
    return /users\s*\(\s*logins/.test(q) ? 'live check (many channels)' : /user\s*\(\s*login/.test(q) ? 'live check'
      : /follow/i.test(q) ? 'follows' : /moderat|isModerator|mod\b/i.test(q) ? 'moderator check' : 'GQL';
  }
  if (/(^|\.)twitch\.tv$/.test(h)) return /^\/[\w]+\/?$/.test(p) ? 'channel page' : 'page';
  return null;
}

const TW_PROFILE = `query($l:String!){user(login:$l){id login displayName description profileImageURL(width:300) bannerImageURL createdAt
  roles{isPartner isAffiliate} followers{totalCount} stream{createdAt viewersCount title game{name} previewImageURL(width:440,height:248)}
  lastBroadcast{startedAt title game{name}} channel{socialMedias{name title url}}
  videos(first:40,type:ARCHIVE,sort:TIME){edges{node{id title createdAt lengthSeconds viewCount game{name}}}}}}`;
const TW_BASIC = 'query($l:String!){user(login:$l){id login displayName description profileImageURL(width:300) bannerImageURL createdAt followers{totalCount} stream{createdAt viewersCount title game{name}}}}';
const TW_SELF = 'query($l:String!){user(login:$l){self{follower{followedAt} subscriptionBenefit{tier purchasedWithPrime}}}}';

/* ---------- the app's side (ctx: sites/index.js) ---------- */
function create(ctx) {
  const { site } = ctx;
  const login = ch => SmvSites.bare(ch);
  const gqlHeaders = () => ({ 'Client-Id': CLIENT_ID, 'Content-Type': 'text/plain;charset=UTF-8', ...ctx.headers() });

  // Your login's token, or '' when you're signed out
  async function token() {
    try {
      const c = await ctx.session().cookies.get({ name: 'auth-token' });
      return (c.find(x => /twitch\.tv$/.test(x.domain)) || {}).value || '';
    } catch { return ''; }
  }
  async function gql(tok, query, variables) {
    const r = await ctx.fetch(GQL, { method: 'POST',
      headers: { 'Client-Id': CLIENT_ID, Authorization: 'OAuth ' + tok, 'Content-Type': 'text/plain;charset=UTF-8', ...ctx.headers() },
      body: JSON.stringify({ query, variables }) });
    return { status: r.status, d: r.ok ? await r.json() : null };
  }
  async function query(q, variables, tok) {
    const headers = gqlHeaders();
    if (tok) headers.Authorization = 'OAuth ' + tok;
    const r = await ctx.fetch(GQL, { method: 'POST', headers, body: JSON.stringify({ query: q, variables }) });
    return r.ok ? r.json() : null;
  }

  /* live checks */
  async function liveOne(ch) {
    const l = login(ch);
    try {
      const r = await ctx.fetch(GQL, { method: 'POST', headers: gqlHeaders(),
        body: JSON.stringify({ query: `query{user(login:${JSON.stringify(l)}){login displayName stream{id title viewersCount createdAt game{name}}}}` }), signal: ctx.netSignal() });
      if (r.ok) { const info = parseTwitch(await r.json(), l); if (info) return info; }
    } catch {}
    try {   // fallback: the channel page
      const r = await ctx.fetch(`https://www.twitch.tv/${l}`, { headers: ctx.headers(), signal: ctx.netSignal() });
      if (r.ok) return parseTwitchHtml(await r.text(), l);
    } catch {}
    return null;
  }
  // One question for up to 100 channels
  async function liveBatch(chs) {
    const results = [], rest = [];
    for (let i = 0; i < chs.length; i += 100) {
      const part = chs.slice(i, i + 100), logins = part.map(login);
      let m = null;
      try {
        const r = await ctx.fetch(GQL, { method: 'POST', headers: gqlHeaders(),
          body: JSON.stringify({ query: 'query($l:[String!]){users(logins:$l){login displayName stream{id title viewersCount createdAt game{name}}}}', variables: { l: logins } }), signal: ctx.netSignal() });
        if (r.ok) m = parseTwitchUsers(await r.json(), logins);
      } catch {}
      if (!m) { rest.push(...part); continue; }
      for (const c of part) results.push([c, m.get(login(c))]);
    }
    return { results, rest };
  }

  /* the channels you follow */
  async function importFollows({ scrape = true } = {}) {
    const tok = await token();
    if (!tok) return { error: 'login' };
    const items = new Map(); let after = null, ok = false;
    for (let i = 0; i < 60; i++) {
      let page = null;
      try {
        const r = await gql(tok, 'query($after:Cursor){currentUser{follows(first:100,after:$after){edges{cursor node{login displayName}} pageInfo{hasNextPage}}}}', { after });
        if (r.status === 401) return { error: 'login' };
        if (r.d) page = twitchFollowsFrom(r.d);
      } catch {}
      if (!page) break;
      ok = true;
      page.items.forEach(x => items.set(x.ch, x.name));
      ctx.progress(`Found ${items.size} so far…`);
      if (!page.next) break;
      after = page.next;
    }
    if (ok && items.size) return { items: [...items].map(([ch, name]) => ({ ch, name })) };
    if (ok && !scrape) return { items: [] };               // follows nobody (Import also looks at the Following page)
    return scrape ? ctx.scrapeFollowPage('https://www.twitch.tv/directory/following/channels') : null;
  }
  // For suggestions while you're signed in: what Import follows found, read again at most once a day, and who's live
  // among them (one question per 100 channels every 2 minutes).
  let followLive = new Map(), followLiveAt = 0, followTried = 0;
  async function followsTick(now) {
    const tok = await token();
    if (tok) {
      const saved = ctx.follows.saved();
      if ((!saved || now - saved.at > 24 * 3600e3) && now - followTried > 6 * 3600e3) {
        followTried = now;
        const r = await importFollows({ scrape: false }).catch(() => null);
        if (r && r.items) ctx.follows.keep(r.items);
      }
      const chs = (ctx.follows.saved() || { items: [] }).items.map(x => x.ch);
      if (chs.length && now - followLiveAt > 120e3) {
        const r = await liveBatch(chs).catch(() => null);
        if (r) {
          const m = new Map(r.results.filter(([, x]) => x && x.live).map(([ch, x]) => [ch, x]));
          if (m.size || followLive.size) ctx.follows.changed();
          followLive = m; followLiveAt = Date.now();
        }
      }
    } else if (followLive.size) { followLive = new Map(); ctx.follows.changed(); }
  }

  /* a streamer's profile */
  async function profile(ch) {
    const l = login(ch);
    let d = await query(TW_PROFILE, { l }).catch(() => null);
    if (!d || (d.errors && !(d.data && d.data.user !== undefined))) d = await query(TW_BASIC, { l }).catch(() => null);   // a field Twitch no longer has
    const p = parseTwitchProfile(d, l);
    if (!p || p.missing) return p;
    const tok = await token();
    if (tok) {
      const me = await query(TW_SELF, { l }, tok).catch(() => null);
      const self = me && me.data && me.data.user && me.data.user.self;
      if (self) { const x = parseTwitchProfile({ data: { user: { login: l, self } } }, l); p.following = x.following; p.sub = x.sub; }
    }
    p.loggedIn = !!tok;
    return p;
  }

  /* emotes */
  // The channel's own emotes, for "new emotes" (emote-lists.js): { names, id } (id: the channel's user, for the add-ons)
  async function emoteList(ch) {
    const d = await ctx.getJson(GQL, { method: 'POST', headers: { 'Client-Id': CLIENT_ID, 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ query: 'query($l:String!){user(login:$l){id subscriptionProducts{emotes{token}}}}', variables: { l: login(ch) } }) });
    const t = parseTwitchEmotes(d);
    return t ? { names: t.names, id: t.userId } : null;
  }
  // The emotes to pick from in ALL (emote-picker.js): the ones your account can use (signed in). -> { groups, id }
  async function emotePicker(ch) {
    const tok = await token();
    // (the owners' pictures at the profiles' size, TW_PROFILE: the same address, so one download for both)
    const r = tok ? await gql(tok, 'query($l:String!){currentUser{emoteSets{id owner{login displayName profileImageURL(width:300)} emotes{id token}}} user(login:$l){id profileImageURL(width:300)}}', { l: login(ch) }).catch(() => null) : null;
    return { groups: twitchGroups(r && r.d, login(ch)) || [], id: r && r.d && r.d.data && r.d.data.user && r.d.data.user.id };
  }

  return new SiteAdapter({
    id: site.id, site,
    loginUrl: 'https://www.twitch.tv/login',
    named: true,                      // Twitch keeps your name in a cookie
    signedIn: () => token().then(Boolean),
    async account() {
      try {
        const c = await ctx.session().cookies.get({ name: 'login' });
        const tw = c.find(x => /twitch\.tv$/.test(x.domain));
        if (tw && /^[A-Za-z0-9_]{2,30}$/.test(tw.value)) return tw.value;
      } catch {}
      return null;
    },
    liveOne, liveBatch,
    follows: { import: importFollows, tick: followsTick, live: () => followLive,
      clearLive() { followLive = new Map(); }, retry() { followTried = 0; } },
    async modCheck(ch) {
      const tok = await token();
      if (!tok) return null;
      const r = await gql(tok, 'query($l:String!){currentUser{login} user(login:$l){self{isModerator isEditor}}}', { l: login(ch) });
      return canModerate(r.d, login(ch));
    },
    emotes: { list: emoteList, pick: emotePicker, addOns: { '7tv': 'twitch', bttv: 'twitch', ffz: 'twitch' } },
    emoteHost: h => h === 'static-cdn.jtvnw.net',
    profile,
    byName: name => 'tw:' + name,
    fromLink
  });
}

module.exports = { create, describeRequest, fromLink, shoutouts: true, ircChat: true, CLIENT_ID, parseTwitch, parseTwitchHtml, parseTwitchUsers, twitchFollowsFrom, canModerate };
