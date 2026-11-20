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
// Its own answers say whether you're signed in (user.logged_in, in any service.php answer): true, false, or null when
// it isn't one of them (its Cloudflare check's page, an error)
const signedInOn = d => (d && d.user && typeof d.user.logged_in === 'boolean' ? d.user.logged_in : null);

/* ---------- the app's side (ctx: sites/index.js) ---------- */
function create(ctx) {
  const { site } = ctx;
  const RU_PAGES = ctx.devEnv('SMV_RUMBLE_PAGES');   // the tests' stand-in for its pages
  const page = url => (RU_PAGES ? url.replace(/^https:\/\/rumble\.com/, RU_PAGES) : url);
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
  // Signed in: its own answer, with your login (its emote list's, the smallest; asked at most once a minute)
  let signed = { at: 0, v: null };
  async function signedIn() {
    // (no cookies of its own at all: never signed in here, so nothing to ask)
    const any = await ctx.session().cookies.get({ domain: 'rumble.com' }).then(l => l.length > 0, () => true);
    if (!any) return false;
    if (Date.now() - signed.at < 60e3 && signed.v !== null) return signed.v;
    let v = null;
    try { const r = await ctx.loginFetch(page(RU + '/service.php?name=emote.list'), { headers: ctx.headers(), signal: ctx.netSignal() }); if (r.ok) v = signedInOn(await r.json()); } catch {}
    if (v !== null) signed = { at: Date.now(), v };
    return v;
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
    signedIn: () => signedIn().then(Boolean),
    account: () => signedIn().then(v => v === true),
    loggedOut() { signed = { at: 0, v: null }; },
    liveOne,
    profile,
    byName: name => 'ru:' + String(name).toLowerCase(),
    // a name without a channel page (/c/<name>) may be a user's (/user/<name>): many streamers only have that
    alsoAt: ch => (/^ru:[^:]+$/.test(ch) ? 'ru:u:' + ch.slice(3) : null),
    fromLink,
    emoteHost: h => h === 'hugh.cdn.rumble.cloud'
  });
}

module.exports = { create, describeRequest, fromLink, parseRumbleLive, parseRumbleProfile, parseOembed, rumbleItems, rumbleItem, rumblePage, rumbleLivePage, signedInOn };
