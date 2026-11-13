// Kick's main-process side (what every site module gives: sites/index.js). Kick answers most questions only from its own
// pages, so they're asked from a hidden, muted window on kick.com, with your Kick login when you're signed in (liveWin):
// the live checks, your follow list, profiles, emotes, the moderator check and Unfollow.
// The top half is plain logic (tested on its own); create() below wires it into the app.
const { SiteAdapter } = require('../adapter');   // (what every site's adapter has: adapter.js)
const { toTime, withTimeout } = require('../../live');
const { parseKickProfile, parseKickVideos } = require('../../profiles');
const { parseKickEmotes } = require('../../emote-lists');
const { kickGroups } = require('../../emote-picker');

const KICK = 'https://kick.com';
const SLUG_RE = /^[a-z0-9_-]{1,40}$/i;                       // a Kick channel name

// Turn Kick's channel JSON into what the app needs. Returns null if it isn't usable channel data.
function parseChannel(text, slug) {
  let d;
  try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  if (!d || typeof d !== 'object' || (!('livestream' in d) && !d.slug && !d.user)) return null;
  const ls = d.livestream;
  const live = !!(ls && ls.is_live !== false);
  const cat = ls && Array.isArray(ls.categories) && ls.categories[0] ? ls.categories[0].name : '';
  return {
    live,
    title: live ? String(ls.session_title || '') : '',
    viewers: live && Number.isFinite(+ls.viewer_count) ? +ls.viewer_count : null,
    category: live ? String(cat || '') : '',
    name: (d.user && d.user.username) || d.slug || slug,
    startedAt: live ? toTime(ls.start_time || ls.created_at) : null,
    checked: Date.now()
  };
}

// Kick's follow lists, best first: followed-page gives 20 channels a page, followed only 5.
const KICK_FOLLOW_APIS = ['/api/v2/channels/followed-page', '/api/v2/channels/followed', '/api/v1/user/following'];

// The live channels you follow. followed-page lists live channels first, so a normal read stops at the first page with
// an offline one. allPages reads the whole list, which also gives every channel you follow and whether live channels
// still come first. get(url) as for readKickFollowPages. -> { live: Map(slug -> info), followed: Set | null, liveFirst } |
// pages: how many were read. { login: true } | null (the list can't be read)
const kickLiveInfo = c => ({ live: true, partial: true, title: '', viewers: Number.isFinite(+c.viewer_count) ? +c.viewer_count : null,
  category: String(c.category_name || ''), name: String(c.user_username || c.channel_slug), checked: Date.now() });
async function readKickLive(get, { allPages = false, maxPages = 200 } = {}) {
  const live = new Map(), followed = new Set();
  let cursor = 0, sawOffline = false, liveFirst = true, done = false, pages = 0;
  for (let i = 0; i < maxPages; i++) {
    pages++;
    const r = await get(KICK_FOLLOW_APIS[0] + '?cursor=' + encodeURIComponent(cursor));
    if (r && r.login) return { login: true };
    if (!r || !r.d || !Array.isArray(r.d.channels)) return null;
    for (const c of r.d.channels) {
      const slug = String(c && c.channel_slug || '').toLowerCase();
      if (!SLUG_RE.test(slug)) continue;
      followed.add(slug);
      if (c.is_live) { live.set(slug, kickLiveInfo(c)); if (sawOffline) liveFirst = false; }
      else sawOffline = true;
    }
    const next = r.d.nextCursor;
    if (next == null || next === '' || String(next) === String(cursor) || !r.d.channels.length) { done = true; break; }
    if (sawOffline && !allPages) break;
    cursor = next;
  }
  return { live, followed: allPages && done ? followed : null, liveFirst: allPages && done ? liveFirst : null, pages };
}

// Reads every page of the first Kick follow list that answers. get(url) makes one call with your
// login and gives { status, d } (d = the JSON, or null if it failed), { login: true } when you're
// signed out, or null. onCount(n) hears the running total. -> { pages, status } or { login: true }
async function readKickFollowPages(get, { apis = KICK_FOLLOW_APIS, maxPages = 2000, onCount } = {}) {
  const pages = []; let status = 0;
  for (const base of apis) {
    let cursor = 0, found = 0;
    for (let i = 0; i < maxPages; i++) {   // maxPages is only a safety stop: the list ends long before
      const byCursor = base.includes('v2');   // v2 lists page by cursor, the old v1 list by page number
      const u = base + (byCursor ? '?cursor=' + encodeURIComponent(cursor) : '?page=' + (i + 1));
      const r = await get(u);
      if (r && r.login) return { login: true };
      status = r ? r.status : 0;
      if (!r || !r.d) break;
      const d = r.d;
      pages.push(d);
      const nc = d.nextCursor ?? d.next_cursor ?? (d.meta && (d.meta.next_cursor ?? d.meta.nextCursor)) ?? (d.next_page_url ? 'p' : null);
      const len = Array.isArray(d) ? d.length : Array.isArray(d.channels) ? d.channels.length : Array.isArray(d.data) ? d.data.length : 0;
      if (len && onCount) onCount(found += len);
      if (nc == null || (byCursor && nc === cursor) || !len) break;   // a repeated cursor would loop forever
      cursor = nc;
    }
    if (pages.length) break;
  }
  return { pages, status };
}
// Pull channel slugs out of whatever list Kick's API returns.
function kickFollowsFrom(data) {
  const out = new Map();
  const walk = o => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const slug = o.channel_slug || o.slug;
    const looksLikeChannel = o.channel_slug || 'user_username' in o || 'user' in o || 'username' in o || 'followers_count' in o || 'is_live' in o || 'livestream' in o;
    if (typeof slug === 'string' && looksLikeChannel && SLUG_RE.test(slug)) {
      const k = slug.toLowerCase();
      if (!out.has(k)) out.set(k, String(o.user_username || o.username || (o.user && o.user.username) || slug));
    }
    for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k]);
  };
  walk(data);
  return [...out].map(([ch, name]) => ({ ch, name }));
}
// Whether you can moderate a channel, from Kick's /api/v2/channels/<slug>/me. null when the answer doesn't say.
function canModerate(d) {
  if (!d || typeof d !== 'object') return null;
  return typeof d.is_moderator === 'boolean' ? !!(d.is_moderator || d.is_broadcaster) : null;
}
// A link on the Following page -> its channel id (or null): Kick's own pages aren't channels.
const RESERVED = /^(categories|category|browse|following|search|settings|dashboard|privacy-policy|terms-of-service|community-guidelines|dmca-policy|contact|careers|about|faq|clips|video|videos|popout|subscriptions|login|signup|home|messages|notifications|wallet|transactions)$/;
function fromLink(href) {
  let u; try { u = new URL(href, KICK); } catch { return null; }
  const p = u.pathname.replace(/\/+$/, '');
  const m = p.match(/^\/([A-Za-z0-9_-]{1,40})$/);
  if (!m || RESERVED.test(m[1].toLowerCase())) return null;
  return SLUG_RE.test(m[1]) ? m[1].toLowerCase() : null;
}
// A request to Kick, in words for Settings › Developer (devlog.js), or null when it isn't Kick's
function describeRequest(u) {
  const h = u.hostname, p = u.pathname;
  if (!/(^|\.)kick\.com$/.test(h)) return null;
  return /follow/i.test(p) ? 'follows' : /\/api\/v\d\/channels\/[^/]+\/?$/.test(p) ? 'channel' : /\/api\//.test(p) ? 'API ' + p.replace(/^\/api\//, '') : 'page';
}

/* ---------- the app's side (ctx: sites/index.js) ---------- */
function create(ctx) {
  const { site } = ctx;
  const sleep = ctx.sleep;

  /* the hidden kick.com window: Kick's answers come from its own page */
  let liveWin = null, liveLoading = null;
  const liveJs = code => liveWin && !liveWin.isDestroyed() ? withTimeout(liveWin.webContents.executeJavaScript(code, true), ctx.netTimeout, null) : Promise.resolve(null);   // null: no answer
  function ensureLiveWin() {
    if (liveWin && !liveWin.isDestroyed()) return liveLoading;
    liveWin = new ctx.BrowserWindow({ show: false, width: 900, height: 700,
      webPreferences: { partition: site.partition, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    liveWin.webContents.setAudioMuted(true);
    liveWin.on('closed', () => { liveWin = null; });
    // A crashed page never answers again: close it, and the next check opens a fresh one. (Not on 'unresponsive':
    // a busy computer sets that off too, and closing it then cuts off the checks in flight. Each one has a time limit.)
    const w = liveWin;
    w.webContents.on('render-process-gone', () => { if (!w.isDestroyed()) w.destroy(); });
    // Not on kick.com in time: its requests would run on a blank page (signed out, no answers), so start again next time
    liveLoading = withTimeout(w.loadURL(KICK + '/robots.txt').then(() => true, () => true), ctx.netTimeout, false)
      .then(ok => { if (ok) return; if (liveWin === w) liveWin = null; if (!w.isDestroyed()) w.destroy(); });
    return liveLoading;
  }
  const closeLiveWin = () => { if (liveWin && !liveWin.isDestroyed()) liveWin.destroy(); };
  // One API call from the kick.com page, so your login goes with it.
  async function kickGet(u) {
    if (!liveWin || liveWin.isDestroyed()) return null;
    const t0 = Date.now();
    return liveJs(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const t = ck('session_token'), x = ck('XSRF-TOKEN');
    if (!t) return { login: true };
    const h = { Accept: 'application/json', Authorization: 'Bearer ' + t };
    if (x) h['X-XSRF-TOKEN'] = x;
    try { const r = await fetch(${JSON.stringify(u)}, { credentials: 'include', headers: h }); return { status: r.status, d: r.ok ? await r.json() : null }; }
    catch (e) { return { status: 0, d: null }; }
  })()`).catch(() => null).then(r => { if (!r || !r.login) ctx.notePageRequest(new URL(u, KICK).href, t0, r && { status: r.status, body: r.d ? JSON.stringify(r.d) : '' }); return r; });
  }
  // One request to Kick's API from the kick.com page (with your login when you're logged in).
  // (web.kick.com, Kick's newer API: it refuses X-XSRF-TOKEN, and its own site says it's the web app)
  async function kickApi(u, method = 'GET') {
    await ensureLiveWin();
    if (!liveWin || liveWin.isDestroyed()) return null;
    const web = /^https:\/\/web\.kick\.com\//.test(u);
    return liveWin.webContents.executeJavaScript(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const t = ck('session_token'), x = ck('XSRF-TOKEN'), method = ${JSON.stringify(method)}, web = ${web};
    if (method !== 'GET' && !t) return { login: true };
    const h = { Accept: 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    if (x && !web) h['X-XSRF-TOKEN'] = x;
    if (web) h['x-app-platform'] = 'web';
    try {
      const r = await fetch(${JSON.stringify(u)}, { method, credentials: 'include', headers: h });
      let d = null; try { d = r.status === 204 ? null : await r.json(); } catch {}
      return { status: r.status, d, auth: !!t };
    } catch (e) { return { status: 0, d: null, auth: !!t }; }
  })()`, true).catch(() => null);
  }
  // Signed in to Kick (its login cookie), asked of the session itself: a page can still see the old cookies for a moment.
  const signedIn = () => ctx.session().cookies.get({ url: KICK, name: 'session_token' }).then(l => l.some(c => c.value), () => false);

  /* live checks */
  async function liveOne(slug) {
    if (!SLUG_RE.test(slug)) return null;
    await ensureLiveWin();
    if (!liveWin) return null;
    for (const ver of ['v2', 'v1']) {
      const url = `/api/${ver}/channels/${slug}`, t0 = Date.now();
      const r = await liveJs(
        `fetch(${JSON.stringify(url)},{credentials:'include',headers:{Accept:'application/json'}})` +
        `.then(async r=>({status:r.status,body:r.ok?await r.text():''})).catch(()=>({status:0,body:''}))`
      ).catch(() => null) || { status: 0, body: '' };
      ctx.notePageRequest(KICK + url, t0, r);
      if (r.status === 200){ const info = parseChannel(r.body, slug); if (info) return info; }
      if (r.status === 404) return { missing: true };
    }
    // Blocked (e.g. a security check): open the address directly so the browser can pass the check, then read it.
    try {
      await withTimeout(liveWin.loadURL(`${KICK}/api/v2/channels/${slug}`), ctx.netTimeout, null);
      for (let i = 0; i < 6; i++) {
        await sleep(1500);
        const txt = await liveJs('document.body ? document.body.innerText : ""').catch(() => '') || '';
        const info = parseChannel(txt, slug);
        if (info) { liveLoading = Promise.resolve(); return info; }
      }
    } catch {}
    return null;
  }
  // Signed in: the live channels you follow, from your follow list (live ones come first, so usually 1-4 pages); the
  // whole list is read every 30 min to know which saved channels you follow.
  let kickFollowed = null, kickFollowedAt = 0, kickLiveFirst = true, kickLivePages = 0;
  let followLive = new Map(), followLiveAt = 0, followTried = 0;   // for suggestions (the Channels box)
  // A read of the follow list (by the live checks or for suggestions): who's live, and the whole list when it was read
  function keptRead(r) {
    if (!r || r.login) return;
    followLive = r.live || new Map(); followLiveAt = Date.now();
    if (r.followed) ctx.follows.keep([...r.followed].map(ch => ({ ch, name: (r.live.get(ch) || {}).name || '' })));
    else ctx.follows.changed();
  }
  async function liveBatch(slugs) {
    // A few saved channels: asking for each is fewer requests than reading the follow list's live pages.
    if (slugs.length < Math.max(5, kickLivePages + 1)) return { results: [], rest: slugs };
    await ensureLiveWin();
    if (!liveWin) return { results: [], rest: slugs };
    const allPages = !kickFollowed || !kickLiveFirst || Date.now() - kickFollowedAt > 30 * 60e3;
    const get = async u => { const r = await kickGet(u); if (allPages) await sleep(400); return r; };   // the whole list: unhurried
    const r = await readKickLive(get, { allPages }).catch(() => null);
    if (!r || r.login) { if (r) kickFollowed = null; return { results: [], rest: slugs }; }
    if (r.followed) { kickFollowed = r.followed; kickFollowedAt = Date.now(); kickLiveFirst = r.liveFirst !== false; }
    if (!allPages) kickLivePages = r.pages;
    keptRead(r);
    const results = [], rest = [];
    for (const s of slugs) {
      if (!kickFollowed || !kickFollowed.has(s)) rest.push(s);
      else results.push([s, r.live.get(s) || { live: false, partial: true, title: '', viewers: null, category: '', name: '', checked: Date.now() }]);
    }
    return { results, rest };
  }

  /* the channels you follow */
  async function importFollows() {
    await ensureLiveWin();
    if (!liveWin) return { error: 'failed' };
    const r = await readKickFollowPages(kickGet, { onCount: n => ctx.progress(`Found ${n} so far…`) });
    if (r.login) return { error: 'login' };
    const { pages, status } = r;
    const items = kickFollowsFrom(pages);
    if (items.length) return { items };
    if ((status === 401 || status === 403) && !pages.length) {
      const s = await ctx.scrapeFollowPage(KICK + '/following');   // the API is blocked: read the Following page instead
      return s.items && s.items.length ? s : { error: 'login' };
    }
    return ctx.scrapeFollowPage(KICK + '/following');
  }
  // For suggestions while you're signed in: the whole list at start-up and every 30 minutes, the live ones (1-4 pages)
  // about once a minute when the live checks haven't just done it.
  async function followsTick(now) {
    if (await signedIn()) {
      const whole = (!kickFollowedAt || now - kickFollowedAt > 30 * 60e3 || !ctx.follows.saved()) && now - followTried > 30 * 60e3;
      if (whole) followTried = now;
      if (whole || now - followLiveAt > 75e3) {
        await ensureLiveWin();
        if (liveWin) {
          const get = async u => { const x = await kickGet(u); if (whole) await sleep(400); return x; };   // the whole list: unhurried
          const r = await readKickLive(get, { allPages: whole }).catch(() => null);
          if (r && r.login) { kickFollowed = null; followLive = new Map(); }
          else if (r) {
            if (r.followed) { kickFollowed = r.followed; kickFollowedAt = Date.now(); kickLiveFirst = r.liveFirst !== false; }
            keptRead(r);
          }
        }
      }
    } else if (followLive.size) { followLive = new Map(); ctx.follows.changed(); }
  }

  /* a streamer's profile */
  async function profile(ch) {
    const r = await kickApi(`/api/v2/channels/${encodeURIComponent(ch)}`);
    if (!r) return null;
    if (r.status === 404) return { missing: true };
    const p = r.status === 200 ? parseKickProfile(r.d, ch) : null;
    if (!p) return null;
    const v = await kickApi(`/api/v2/channels/${encodeURIComponent(ch)}/videos`);
    const vods = v && v.status === 200 ? parseKickVideos(Array.isArray(v.d) ? v.d : v.d && v.d.data) : null;
    if (vods && vods.length) p.vods = vods;
    p.loggedIn = !!r.auth;
    if (r.auth) {
      const me = await kickApi(`/api/v2/channels/${encodeURIComponent(ch)}/me`);
      const m = me && me.status === 200 && me.d;
      if (m && typeof m.following === 'boolean') p.following = m.following ? { since: toTime(m.following_since || m.followed_at) } : false;
      if (m && m.subscription) p.sub = { tier: '', months: Number.isFinite(+m.subscription.months) ? +m.subscription.months : null };
    }
    if (p.following === undefined && kickFollowed) p.following = kickFollowed.has(ch) ? { since: null } : false;
    return p;
  }

  /* emotes */
  // The channel's own emotes, for "new emotes" (emote-lists.js): { names, id } (id: the channel's user, for the add-ons)
  async function emoteList(ch) {
    const r = await kickApi(`/emotes/${encodeURIComponent(ch)}`).catch(() => null);
    const k = r && r.status === 200 ? parseKickEmotes(r.d, ch) : null;
    return k ? { names: k.names, id: k.userId } : null;
  }
  // The emotes to pick from in ALL (emote-picker.js): the channel's and the site's, and your favourites (signed in: the
  // ones you starred in Kick's emote menu). -> { groups, id }
  async function emotePicker(ch) {
    const [r, fav] = await Promise.all([kickApi(`/emotes/${encodeURIComponent(ch)}`).catch(() => null),
      kickApi('https://web.kick.com/api/v1/chat/emotes/favourites').catch(() => null)]);
    if (!(r && r.status === 200)) return { groups: [], id: null };
    const own = Array.isArray(r.d) && r.d.find(s => s && String(s.slug || '').toLowerCase() === ch);
    return { groups: kickGroups(r.d, ch, fav && fav.status === 200 ? fav.d : null) || [], id: own && own.user_id };
  }

  /* Kick only */
  // Who Kick says is signed in, asked from its own page with your login: { name } ('' when it answered with nobody: a
  // login it no longer takes answers 200 with nothing, like none at all), or null when it didn't answer (a 403 can be
  // Cloudflare's check, not Kick's answer).
  async function whoAmI() {
    await ensureLiveWin();
    if (!liveWin) return null;
    const r = await liveWin.webContents.executeJavaScript(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const h = { Accept: 'application/json' }, t = ck('session_token'), x = ck('XSRF-TOKEN');
    if (t) h.Authorization = 'Bearer ' + t;
    if (x) h['X-XSRF-TOKEN'] = x;
    let answered = false;
    for (const u of ['/api/v1/user', '/api/v2/user']) {
      try { const r = await fetch(u, { credentials: 'include', headers: h });
        if (r.status === 200 || r.status === 401) answered = true;
        if (r.ok) { const d = await r.json().catch(() => null); const n = d && (d.username || (d.user && d.user.username) || d.slug); if (n) return { name: String(n) }; } } catch (e) {}
    }
    return answered ? { name: '' } : null; })()`, true).catch(() => null);
    return r && typeof r === 'object' && typeof r.name === 'string' ? { name: r.name } : null;
  }
  // Best guess at your Kick username from your logged-in session (you can also type it in).
  ctx.ipc.app.handle('me:detect', async () => {
    const r = await whoAmI();
    return r && /^[A-Za-z0-9_]{2,30}$/.test(r.name) ? r.name : null;
  });
  // Whether the login cookie still signs you in: Kick names someone (or, answering with nobody, doesn't)
  async function loginWorks() {
    if (!(await signedIn())) return null;
    const r = await whoAmI();
    return r ? !!r.name : null;
  }
  // Unfollow on Kick itself (what the Unfollow button on the channel's page does).
  ctx.ipc.app.handle('kick:unfollow', async (_e, slug) => {
    slug = String(slug || '').toLowerCase();
    if (!SLUG_RE.test(slug)) return { error: 'bad' };
    const r = await kickApi(`/api/v2/channels/${encodeURIComponent(slug)}/follow`, 'DELETE');
    if (!r) return { error: 'failed' };
    if (r.login || r.status === 401) return { error: 'login' };
    if (r.status >= 200 && r.status < 300) {
      if (kickFollowed) kickFollowed.delete(slug);
      const c = ctx.cachedProfile(slug); if (c) c.following = false;
      return { ok: true };
    }
    return { error: r.status === 403 ? 'refused' : 'failed', status: r.status };
  });

  return new SiteAdapter({
    id: site.id, site,
    loginUrl: KICK,
    named: true,                      // its name comes from its pages (me:detect): account() is only whether you're signed in
    signedIn, account: signedIn, loginWorks,
    keeps: w => w === liveWin,
    loggedOut: closeLiveWin,          // the checker starts fresh, logged out
    close: closeLiveWin,              // the hidden checker must not keep the app running
    liveOne, liveBatch,
    follows: { import: importFollows, tick: followsTick, live: () => followLive,
      clearLive() { followLive = new Map(); }, retry() { followTried = 0; } },
    modCheck: async ch => { await ensureLiveWin(); const r = await kickGet(`/api/v2/channels/${encodeURIComponent(ch)}/me`); return r && r.d ? canModerate(r.d) : null; },
    emotes: { list: emoteList, pick: emotePicker, addOns: { '7tv': 'kick' } },
    emoteHost: h => h === 'files.kick.com',
    profile,
    // a profile kept from before you signed in (no follow state, no Unfollow): ask again
    profileStale: async d => d.loggedIn === false && await signedIn(),
    byName: name => name,
    fromLink
  });
}

module.exports = { create, describeRequest, fromLink, shoutouts: true, SLUG_RE, parseChannel, KICK_FOLLOW_APIS, readKickLive, readKickFollowPages, kickFollowsFrom, canModerate };
