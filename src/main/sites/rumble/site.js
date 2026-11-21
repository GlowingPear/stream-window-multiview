// Rumble's main-process side (what every site module gives: sites/index.js). A channel's "Live" page
// (rumble.com/c/<name>/livestreams) answers the live checks and profiles: it carries its videos as JSON (in its
// <rum-videos-grid>), each saying whether it's live, with the channel's name, picture and followers. A live stream's
// player and chat need two ids (its player's embed id, which Rumble's oEmbed gives, and its chat's number), kept
// together as its video id: "<embed id>.<chat id>" (src/page/sites/rumble/site.js).
// The top half is plain logic (tested on its own); create() below wires it into the app.
const { SiteAdapter } = require('../adapter');   // (what every site's adapter has: adapter.js)
const { toTime, decodeHtml } = require('../../live');

const RU = 'https://rumble.com';

// A channel id's pages: its own, and its live streams' list
function rumblePage(ch) {
  if (ch.startsWith('ru:v:')) return `${RU}/${ch.slice(5)}-x.html`;   // (any words after its id: Rumble finds it by its id)
  return ch.startsWith('ru:u:') ? `${RU}/user/${ch.slice(5)}` : `${RU}/c/${ch.slice(3)}`;
}
const rumbleLivePage = ch => rumblePage(ch) + '/livestreams';

// The videos a channel's page carries (its <rum-videos-grid>'s JSON): [item], or null when it has none to read
function rumbleItems(html) {
  if (typeof html !== 'string') return null;
  const m = /<rum-videos-grid[^>]*>\s*<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { const d = JSON.parse(m[1]); return Array.isArray(d && d.items) ? d.items.filter(x => x && typeof x === 'object') : null; } catch { return null; }
}
// Whether one of them is live now (its stream running: not one waiting to start, livestream_status 1)
const isLive = v => v.live === true && !v.live_placeholder && (v.livestream_status === undefined || v.livestream_status === 2);
// The channel's name and numbers on its page: its <h1>, and "144K Followers" (when it has no videos to say them)
function rumbleHeader(html) {
  const name = decodeHtml(((/<h1[^>]*>([^<]+)<\/h1>/.exec(html) || [])[1] || '').trim());
  const followersText = ((/>\s*([\d.,]+\s?[KMB]?) Followers?\s*</i.exec(html) || [])[1] || '').trim();
  return { name, followersText };
}
// A channel's "Live" page -> its live info: { live, chat (its live stream's chat number), url (its page), title,
// viewers, startedAt, name }, or null when it can't be read
function parseRumbleLive(html, ch) {
  const items = rumbleItems(html);
  const head = typeof html === 'string' ? rumbleHeader(html) : { name: '' };
  if (!(items && items.length) && !head.name) return null;   // (a page with neither isn't a channel's)
  const by = ((items || []).find(v => v.by) || {}).by || {};
  const v = (items || []).find(isLive);
  return {
    live: !!v, chat: v && v.id ? String(v.id) : null, url: v ? String(v.url || '') : '', title: v ? String(v.title || '') : '',
    viewers: v && Number.isFinite(+v.watching_now) ? +v.watching_now : null, category: '', startedAt: v ? toTime(v.live_streamed_on) : null,
    name: String(by.title || by.name || head.name || ch.replace(/^ru:(u:|v:)?/, '')), checked: Date.now()
  };
}
// One video's item in a channel's list, by its page's id ("v35waq4": permalink_id), or null
const rumbleItem = (html, id) => (rumbleItems(html) || []).find(v => v.permalink_id === id) || null;
// Rumble's oEmbed answer -> { embed (its player's id), channel (its channel's page), title }, or null
function parseOembed(d) {
  if (!d || typeof d.html !== 'string') return null;
  const m = /rumble\.com\/embed\/(v[a-z0-9]+)\//.exec(d.html);
  return m ? { embed: m[1], channel: String(d.author_url || ''), title: String(d.title || ''), name: String(d.author_name || '') } : null;
}
// A streamer's profile from their channel's page (profiles.js's shape)
function parseRumbleProfile(html, ch) {
  if (typeof html !== 'string' || html.length < 500) return null;
  const items = rumbleItems(html) || [];
  const by = (items.find(v => v.by) || {}).by || null, head = rumbleHeader(html);
  const name = (by && (by.title || by.name)) || head.name;
  if (!name) return null;
  return {
    platform: 'rumble', ch, url: rumblePage(ch), name: String(name), avatar: by && /^https:\/\//.test(by.thumb || '') ? by.thumb : '', banner: '', bio: '',
    followers: by && Number.isFinite(+by.followers) ? +by.followers : null, followersText: by ? '' : head.followersText,
    verified: !!(by && by.verified_badge), partner: false, affiliate: false, created: null, socials: [], live: null, chat: null, badges: [], vods: []
  };
}
// Its emote list (service.php?name=emote.list&chat_id=<a live stream's chat>) -> the picker's groups (emote-picker.js):
// the channel's own (with its picture), then Rumble's own. Each is sent as ":name:", which its chat shows as the emote;
// subs: only its subscribers can use it. Empty sets are left out; null when it isn't its answer
function rumbleGroups(d) {
  const items = d && d.data && Array.isArray(d.data.items) ? d.data.items : null;
  if (!items) return null;
  return items.filter(g => g && Array.isArray(g.emotes)).map(g => {
    const emotes = g.emotes.filter(e => e && e.name && /^https:\/\//.test(e.file || ''))
      .map(e => ({ name: String(e.name), url: e.file, send: `:${e.name}:`, ...(e.is_subs_only ? { subs: true } : {}) }));
    if (!emotes.length) return null;
    const own = g.channel_id != null;
    return { id: own ? 'rumble-channel' : 'rumble', label: own ? String(g.title || 'Channel emotes') : 'Rumble', emotes,
      ...(own && /^https:\/\//.test(g.channel_picture || '') ? { pic: g.channel_picture } : {}) };
  }).filter(Boolean);
}
// Its chat connection's first event ("init", data: … can_moderate) -> whether you can moderate it, or null
const canModerateIn = d => (d && d.type === 'init' && d.data && typeof d.data.can_moderate === 'boolean' ? d.data.can_moderate : null);
// The first event in an event stream's text so far ("data: {…}\n"), or undefined until it's all there
function firstEvent(text) {
  const m = /^data:[ \t]*(\{.*)$/m.exec(text);
  if (!m || !/\n/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 1))) return undefined;
  try { return JSON.parse(m[1]); } catch { return null; }
}
// A link on its pages -> the channel id it's for, or null
function fromLink(href) {
  let u; try { u = new URL(href, RU); } catch { return null; }
  if (!/(^|\.)rumble\.com$/.test(u.hostname)) return null;
  const m = u.pathname.replace(/\/+$/, '').match(/^\/(c|user)\/([A-Za-z0-9_.-]{1,60})$/);
  return m ? (m[1] === 'c' ? 'ru:' : 'ru:u:') + m[2].toLowerCase() : null;
}
// A request to Rumble, in words for Settings › Developer (devlog.js), or null when it isn't Rumble's
function describeRequest(u) {
  if (!/(^|\.)rumble\.com$/.test(u.hostname)) return null;
  const p = u.pathname;
  return /\/livestreams$/.test(p) ? 'live streams page' : /^\/api\/Media\/oembed/.test(p) ? 'a video\'s player (oEmbed)' : 'page';
}
// Its Followed Channels page (rumble.com/followed-channels): the list, a row a channel, the name in a row (its picture's
// link comes first, with the name's first letter when there's no picture), and that page signed out (its "Sign in"
// link, no list)
const FOLLOW_SCOPE = 'ol.followed-channels__list';
const FOLLOW_NAME = '.line-clamp-2';
const SIGNED_OUT_JS = `(!document.querySelector('ol.followed-channels__list') && !!document.querySelector('a[href*="/login.php"]'))`;
// Its login's cookie
const LOGIN_COOKIE = 'u_s';
// Its own answers say whether you're signed in (user.logged_in, in any service.php answer): true, false, or null when
// it isn't one of them (its Cloudflare check's page, an error)
const signedInOn = d => (d && d.user && typeof d.user.logged_in === 'boolean' ? d.user.logged_in : null);

/* ---------- the app's side (ctx: sites/index.js) ---------- */
function create(ctx) {
  const { site } = ctx;
  const RU_PAGES = ctx.devEnv('SMV_RUMBLE_PAGES');   // the tests' stand-in for its pages
  const page = url => (RU_PAGES ? url.replace(/^https:\/\/rumble\.com/, RU_PAGES) : url);
  const CHAT_API = ctx.devEnv('SMV_RUMBLE_CHAT') || 'https://web7.rumble.com/chat/api';   // (and its chat's)
  const get = url => ctx.pageFetch(page(url), { headers: ctx.headers(), signal: ctx.netSignal() });
  // A video's player id (oEmbed), by its page: kept, as a video keeps it. -> its answer, false (Rumble has no such
  // video), or null (no answer)
  const embeds = new Map();
  async function oembed(url) {
    if (embeds.has(url)) return embeds.get(url);
    let o = null;
    try {
      const r = await get(`${RU}/api/Media/oembed.json?url=${encodeURIComponent(url)}`);
      if (r.status === 404) return false;
      if (r.ok) o = parseOembed(await r.json());
    } catch {}
    if (o) { if (embeds.size > 500) embeds.clear(); embeds.set(url, o); }
    return o;
  }
  // One channel (or video): is it live, and its live stream's ids
  async function liveOne(ch) {
    try {
      if (ch.startsWith('ru:v:')) {
        // a video: its channel (oEmbed), then that channel's list says whether it's live, and its chat's number
        const vid = ch.slice(5);
        const o = await oembed(rumblePage(ch));
        if (o === false) return { missing: true };
        if (!o) return null;
        const c = fromLink(o.channel);
        if (!c) return null;
        const r = await get(rumbleLivePage(c));
        if (!r.ok) return null;
        const it = rumbleItem(await r.text(), vid);
        const live = !!(it && isLive(it));
        return { live, videoId: live ? `${o.embed}.${it.id}` : null, title: o.title, viewers: live && Number.isFinite(+it.watching_now) ? +it.watching_now : null,
          category: '', startedAt: live ? toTime(it.live_streamed_on) : null, name: o.title || o.name, checked: Date.now() };
      }
      const r = await get(rumbleLivePage(ch));
      if (r.status === 404) return { missing: true };
      if (!r.ok) return null;
      const info = parseRumbleLive(await r.text(), ch);
      if (!info) return null;
      const { chat, url, ...rest } = info;
      if (!info.live) return { ...rest, videoId: null };
      const o = url ? await oembed(url) : null;
      return o ? { ...rest, videoId: `${o.embed}.${chat}` } : null;   // (live, but its player can't be found: can't tell yet)
    } catch { return null; }
  }
  // Signed in: its login cookie (u_s, kept only for its signed-in accounts)
  const signedIn = () => ctx.session().cookies.get({ name: LOGIN_COOKIE }).then(l => l.some(c => /(^|\.)rumble\.com$/.test(c.domain) && c.value), () => false);
  // Whether that login still works: its own answer, with it (its emote list's, the smallest)
  async function loginWorks() {
    try {
      const r = await ctx.loginFetch(page(RU + '/service.php?name=emote.list'), { headers: ctx.headers(), signal: ctx.netSignal() });
      return r.ok ? signedInOn(await r.json()) : null;
    } catch { return null; }
  }
  /* emotes: its live stream's chat's list (a channel's own emotes are only asked of its chat) */
  async function chatOf(ch) {
    const known = (ctx.live.snapshot() || {})[ch];
    const vid = (known && known.live && known.videoId) || ((await liveOne(ch)) || {}).videoId || '';
    return (/^v[a-z0-9]+\.(\d+)$/.exec(vid) || [])[1] || '';
  }
  async function emoteGroups(ch) {
    const chat = await chatOf(ch);
    if (!chat) return [];
    try {
      const r = await ctx.loginFetch(page(`${RU}/service.php?name=emote.list&chat_id=${chat}`), { headers: ctx.headers(), signal: ctx.netSignal() });
      return (r.ok && rumbleGroups(await r.json())) || [];
    } catch { return []; }
  }

  /* whether you can moderate a channel: its live chat's first event says, with your login (signed out, or not live:
     can't tell) */
  async function modCheck(ch) {
    if (!(await signedIn())) return null;
    const chat = await chatOf(ch);
    if (!chat) return null;
    const ac = new AbortController(), stop = setTimeout(() => ac.abort(), ctx.netTimeout || 20000);
    try {
      const r = await ctx.loginFetch(CHAT_API + `/chat/${chat}/stream`, { headers: { ...ctx.headers(), Accept: 'text/event-stream' }, signal: ac.signal });
      if (!r.ok || !r.body) return null;
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (let text = ''; text.length < 4e6; ) {
        const { value, done } = await rd.read();
        if (value) text += dec.decode(value, { stream: true });
        const d = firstEvent(text);
        if (d !== undefined) return canModerateIn(d);
        if (done) return null;
      }
      return null;
    } catch { return null; } finally { clearTimeout(stop); ac.abort(); }
  }

  /* the channels you follow: its Followed Channels page; for suggestions, read again in the background at most once a
     day while you're signed in (no live state) */
  const importFollows = () => ctx.scrapeFollowPage(RU + '/followed-channels', { scope: FOLLOW_SCOPE, name: FOLLOW_NAME, signedOut: SIGNED_OUT_JS });
  let followTried = 0;
  async function followsTick(now) {
    const saved = ctx.follows.saved();
    if ((!saved || now - saved.at > 24 * 3600e3) && now - followTried > 6 * 3600e3 && !ctx.importing.busy() && (await signedIn())) {
      await ctx.importing.run(async () => {
        followTried = now;
        const r = await importFollows().catch(() => null);
        if (r && r.items && r.items.length) ctx.follows.keep(r.items);
      });
    }
  }
  async function profile(ch) {
    if (ch.startsWith('ru:v:')) return { missing: true, video: true };
    const r = await get(rumbleLivePage(ch));
    if (r.status === 404) return { missing: true };
    return r.ok ? parseRumbleProfile(await r.text(), ch) : null;
  }

  return new SiteAdapter({
    id: site.id, site,
    loginUrl: RU + '/login.php',
    named: false,                     // (its pages only say that you're signed in)
    signedIn, account: signedIn, loginWorks,
    liveOne,
    follows: { import: importFollows, tick: followsTick, retry() { followTried = 0; } },
    modCheck,
    // its emotes: the picker's groups (ALL); the channel's own names (new emotes)
    emotes: {
      pick: async ch => ({ groups: await emoteGroups(ch), id: null }),
      list: async ch => { const g = (await emoteGroups(ch)).find(x => x.id === 'rumble-channel'); return g ? { names: g.emotes.map(e => e.name), id: null } : null; },
      addOns: {}
    },
    profile,
    byName: name => 'ru:' + String(name).toLowerCase(),
    // a name without a channel page (/c/<name>) may be a user's (/user/<name>): many streamers only have that
    alsoAt: ch => (/^ru:[^:]+$/.test(ch) ? 'ru:u:' + ch.slice(3) : null),
    fromLink,
    emoteHost: h => h === 'hugh.cdn.rumble.cloud'
  });
}

module.exports = { create, describeRequest, fromLink, rumbleGroups, canModerateIn, firstEvent, FOLLOW_SCOPE, SIGNED_OUT_JS, LOGIN_COOKIE, parseRumbleLive, parseRumbleProfile, parseOembed, rumbleItems, rumbleItem, rumblePage, rumbleLivePage, signedInOn };
