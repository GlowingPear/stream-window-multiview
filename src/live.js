// Live status checker for saved channels.
// Kick's own browser notifications come from its push system, which apps can't hook into,
// so instead we ask Kick for each saved channel's info every minute (through your logged-in
// Kick session) and notice when one switches from offline to live.

// Channel ids: Kick "name", Twitch "tw:name", YouTube "yt:@handle" | "yt:c:UC…" | "yt:v:VIDEOID"
const SLUG_RE = /^[a-z0-9_-]{1,40}$/i;                       // a Kick channel name
function normCh(c) {
  c = String(c || '').trim();
  if (/^yt:(v|c):/i.test(c)) return 'yt:' + c.slice(3, 5).toLowerCase() + c.slice(5);   // video / channel ids are case-sensitive
  return c.toLowerCase();
}
function validCh(c) {
  return SLUG_RE.test(c) || /^tw:[a-z0-9_]{1,25}$/.test(c) || /^yt:@[\w.\-]{1,100}$/.test(c) ||
         /^yt:c:UC[\w-]{10,40}$/.test(c) || /^yt:v:[\w-]{11}$/.test(c);
}
const platformOf = c => /^tw:/.test(c) ? 'Twitch' : /^yt:/.test(c) ? 'YouTube' : 'Kick';
const decodeHtml = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\\u0026/g, '&').replace(/\\"/g, '"');

// Twitch: answer from Twitch's public data service ({ data: { user: { stream } } }).
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
    checked: Date.now()
  };
}
// Twitch fallback: the channel page itself says whether it's broadcasting.
function parseTwitchHtml(html, login) {
  if (typeof html !== 'string' || html.length < 500) return null;
  const live = /"isLiveBroadcast"\s*:\s*true/.test(html);
  return { live, title: '', viewers: null, category: '', name: login, checked: Date.now() };
}
// YouTube: the "/live" address of a channel turns into the live video's page while it's live.
function ytLiveUrl(ch) {
  const r = ch.slice(3);
  if (r.startsWith('v:')) return 'https://www.youtube.com/watch?v=' + r.slice(2);
  if (r.startsWith('c:')) return 'https://www.youtube.com/channel/' + r.slice(2) + '/live';
  return 'https://www.youtube.com/' + r + '/live';
}
function parseYouTube(html, ch) {
  if (typeof html !== 'string' || html.length < 500) return null;
  const canon = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  const vid = canon ? canon[1] : (/^yt:v:/.test(ch) ? ch.slice(5) : null);
  const isLive = /"isLive"\s*:\s*true/.test(html) || /"isLiveNow"\s*:\s*true/.test(html);
  const upcoming = /"isUpcoming"\s*:\s*true/.test(html);
  const live = !!(canon && isLive && !upcoming);
  const title = decodeHtml((html.match(/<meta name="title" content="([^"]*)"/) || [])[1]);
  const owner = (html.match(/"ownerChannelName"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1] ||
                (html.match(/<link itemprop="name" content="([^"]*)"/) || [])[1] ||
                (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '';
  const vc = html.match(/"concurrentViewers"\s*:\s*"(\d+)"/);
  return {
    live, videoId: vid, title: live ? title : '',
    viewers: live && vc ? +vc[1] : null, category: '',
    name: decodeHtml(owner) || ch.replace(/^yt:(v:|c:)?/, ''),
    checked: Date.now()
  };
}

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
    checked: Date.now()
  };
}

// The polling loop, in two parts so slow checks never hold up fast ones:
// - every batchIntervalMs, fetchBatch(list) answers many channels at once -> { results: Map(ch -> info),
//   rest: [channels it couldn't answer] } (optional; without it every channel is checked alone);
// - the rest are checked one at a time with fetchChannel(ch), spacingMs apart, then the same wait.
// info: parsed info | null (unknown) | { missing: true }. Batch answers may be { partial: true }: no
// title. Then the title comes from fetchChannel: straight away when the channel has just gone live (so
// the notification has it), otherwise later, one at a time.
// auto: false (for tests) never starts the loops; run passes with _batchPass / _onePass.
function createLiveWatcher({ fetchChannel, fetchBatch, onStatus, onWentLive, intervalMs = 60000, batchIntervalMs = intervalMs, spacingMs = 1200, now = () => Date.now(), sleep, auto = true }) {
  const wait = sleep || (ms => new Promise(r => setTimeout(r, ms)));
  let list = [], state = new Map(), stopped = false, oneByOne = [], needTitle = new Set();
  const loops = [];

  function setChannels(channels) {
    const next = [...new Set((channels || []).map(normCh).filter(validCh))];
    for (const k of [...state.keys()]) if (!next.includes(k)) state.delete(k);
    for (const k of [...needTitle]) if (!next.includes(k)) needTitle.delete(k);
    const added = next.some(c => !list.includes(c));
    list = next;
    if (!fetchBatch) oneByOne = list;
    if (added) checkSoon();
  }
  function snapshot() { const o = {}; for (const [k, v] of state) o[k] = v; return o; }

  function apply(slug, info) {
    if (!list.includes(slug) || !info) return;               // removed while we were checking, or unknown
    if (info.missing) { state.set(slug, { live: false, missing: true, title: '', viewers: null, category: '', name: slug, checked: now() }); return; }
    const prev = state.get(slug);
    let next = info;
    if (info.partial) {
      next = { ...info };
      delete next.partial;
      if (info.live && prev && prev.live) next.title = prev.title || '';
      if (!next.name) next.name = (prev && prev.name) || slug;
      if (info.live && !next.title) needTitle.add(slug); else needTitle.delete(slug);
    } else needTitle.delete(slug);
    state.set(slug, next);
    // Only a real offline -> live change notifies (not channels that were already live when the app started).
    if (next.live && prev && !prev.live) onWentLive && onWentLive(slug, next);
  }
  const fetchOne = async slug => { try { return await fetchChannel(slug); } catch { return null; } };

  async function batchPass() {
    if (!fetchBatch || !list.length) return;
    let r = null;
    try { r = await fetchBatch([...list]); } catch { r = null; }
    if (stopped) return;
    const before = oneByOne;
    if (!r) { oneByOne = [...list]; if (oneByOne.some(c => !before.includes(c))) slow.poke(); return; }   // the batch failed: check them one at a time
    for (const [slug, info] of r.results || []) {
      const prev = state.get(slug);
      let use = info;
      if (info && info.partial && info.live && prev && !prev.live) {   // just went live: get the title for the notification
        const full = await fetchOne(slug);
        if (full && full.live) use = { ...full, viewers: full.viewers ?? info.viewers, category: full.category || info.category };
      }
      apply(slug, use);
    }
    oneByOne = (r.rest || []).filter(c => list.includes(c));
    onStatus && onStatus(snapshot());
    if (oneByOne.some(c => !before.includes(c) || !state.has(c)) || needTitle.size) slow.poke();   // new to the one-at-a-time list: don't wait for its next round
  }
  async function onePass() {
    const todo = [...new Set([...oneByOne, ...needTitle])];
    for (const slug of todo) {
      if (stopped) return;
      if (!list.includes(slug)) continue;
      apply(slug, await fetchOne(slug));
      onStatus && onStatus(snapshot());
      await wait(spacingMs);
    }
  }

  function makeLoop(pass, ms) {
    const l = { running: false, wake: null, timer: null };
    l.run = async () => {
      if (l.running) return;
      l.running = true;
      try {
        while (!stopped) {
          await pass();
          await new Promise(r => { l.wake = r; l.timer = setTimeout(r, ms); });
          l.wake = null;
        }
      } finally { l.running = false; }
    };
    l.poke = () => {
      if (!auto) return;
      if (l.wake) { clearTimeout(l.timer); const w = l.wake; l.wake = null; w(); } else if (!l.running && !stopped) l.run();
    };
    loops.push(l);
    return l;
  }
  const fast = makeLoop(batchPass, batchIntervalMs), slow = makeLoop(onePass, intervalMs);
  function checkSoon() { if (auto) { fast.poke(); slow.poke(); } }
  function start() { fast.run(); slow.run(); }
  function stop() { stopped = true; loops.forEach(l => { clearTimeout(l.timer); if (l.wake) l.wake(); }); }

  return { setChannels, checkSoon, stop, snapshot, start, _batchPass: batchPass, _onePass: onePass, _state: state };
}

/* ---------- checking many channels at once ---------- */
// Twitch: { data: { users: [user | null, …] } } for users(logins: […]) -> Map(login -> info | { missing }).
function parseTwitchUsers(d, logins) {
  const users = d && d.data && d.data.users;
  if (!Array.isArray(users)) return null;
  const out = new Map();
  for (const u of users) if (u && u.login) out.set(String(u.login).toLowerCase(), parseTwitch({ data: { user: u } }, u.login));
  for (const l of logins) if (!out.has(l)) out.set(l, { missing: true });
  return out;
}

// Kick: the live channels you follow. followed-page lists live channels first, so a normal read stops
// at the first page with an offline one. allPages reads the whole list, which also gives every channel
// you follow and whether live channels still come first.
// get(url) as for readKickFollowPages. -> { live: Map(slug -> info), followed: Set | null, liveFirst } |
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

// YouTube: a channel's feed (https://www.youtube.com/feeds/videos.xml?channel_id=…) -> its latest videos.
function parseYtFeed(xml) {
  if (typeof xml !== 'string' || !/<feed[\s>]/.test(xml)) return null;
  const ids = [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map(m => m[1]);
  const channelId = (xml.match(/<yt:channelId>(UC[\w-]{10,40})<\/yt:channelId>/) || [])[1] || '';
  const name = decodeHtml((xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || '');
  return { ids: [...new Set(ids)], channelId, name };
}
// YouTube Data API videos.list (part=snippet,liveStreamingDetails) -> Map(videoId -> { state, title, viewers,
// channelId, channelTitle }). state: 'live', 'upcoming', or 'done' (a normal video or a finished stream: never live again).
function parseYtVideos(d) {
  if (!d || !Array.isArray(d.items)) return null;
  const out = new Map();
  for (const v of d.items) {
    if (!v || typeof v.id !== 'string') continue;
    const sn = v.snippet || {}, ld = v.liveStreamingDetails || null;
    const lbc = sn.liveBroadcastContent;
    const state = lbc === 'live' && !(ld && ld.actualEndTime) ? 'live' : lbc === 'upcoming' ? 'upcoming' : 'done';
    out.set(v.id, { state, title: String(sn.title || ''), viewers: ld && ld.concurrentViewers != null && Number.isFinite(+ld.concurrentViewers) ? +ld.concurrentViewers : null,
      channelId: String(sn.channelId || ''), channelTitle: String(sn.channelTitle || '') });
  }
  return out;
}

// When the YouTube API key may be used. fail({ status, reason }) after an error answer; while it can't be
// used, YouTube is checked by reading pages (as without a key).
//   out of quota  -> until the quota resets (midnight Pacific time)
//   too fast      -> 15 min, doubling up to 2 h while it keeps happening
//   key refused   -> until the key is changed
//   anything else -> just this pass
const YT_QUOTA = /^(quotaExceeded|dailyLimitExceeded)$/;
const YT_RATE = /^(rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED)$/;
const YT_BADKEY = /^(keyInvalid|keyExpired|API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|accessNotConfigured|SERVICE_DISABLED|forbidden|ipRefererBlocked)$/;
function nextPacificMidnight(t) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
  const g = k => +(parts.find(p => p.type === k) || {}).value || 0;
  return t - ((g('hour') * 60 + g('minute')) * 60 + g('second')) * 1000 - (t % 1000) + 864e5;
}
// The reason in a Google API error answer ({ error: { errors: [{ reason }], details: [{ reason }], status } }).
function ytErrorReason(d) {
  const e = d && d.error;
  if (!e) return '';
  // details (e.g. API_KEY_INVALID) says more than errors (e.g. badRequest)
  return (Array.isArray(e.details) && (e.details.find(x => x && x.reason) || {}).reason) || (Array.isArray(e.errors) && e.errors[0] && e.errors[0].reason) || e.status || '';
}
function createKeyGate({ now = () => Date.now() } = {}) {
  let st = { state: 'ok', until: 0, backoff: 0, reason: '' };
  return {
    usable: () => st.state === 'ok' || ((st.state === 'quota' || st.state === 'rate') && now() >= st.until),
    ok() { st = { state: 'ok', until: 0, backoff: 0, reason: '' }; },
    fail({ status = 0, reason = '' } = {}) {
      if (YT_QUOTA.test(reason)) st = { state: 'quota', until: nextPacificMidnight(now()), backoff: 0, reason };
      else if (status === 429 || YT_RATE.test(reason)) {
        const backoff = st.state === 'rate' ? Math.min(st.backoff * 2, 2 * 3600e3) : 15 * 60e3;
        st = { state: 'rate', until: now() + backoff, backoff, reason };
      } else if (status === 401 || YT_BADKEY.test(reason)) st = { state: 'badkey', until: 0, backoff: 0, reason };
      return st.state;
    },
    reset() { this.ok(); },
    status: () => ({ ...st })
  };
}

/* ---------- Google sign-in inside the app ----------
   Google refuses sign-in from embedded Chromium ("This browser or app may not be secure"): the
   page sees Chromium without the "Google Chrome" brand. Firefox has no such brand list, so the
   sign-in pages are shown a Firefox identity instead (and only those pages). */
const SIGNIN_HOST_RE = /^https:\/\/(accounts\.google\.com|accounts\.youtube\.com)(\/|$)/i;
const isGoogleSignin = url => SIGNIN_HOST_RE.test(String(url || ''));
// A current Firefox version: 128 shipped 2024-07-09 and a new one ships every 4 weeks.
function firefoxVersion(now = Date.now()) {
  return Math.max(128, 128 + Math.floor((now - Date.UTC(2024, 6, 9)) / (28 * 864e5)) - 1);
}
function firefoxUA(platform = process.platform, now) {
  const v = firefoxVersion(now);
  const os = platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' : platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}

/* ---------- importing the channels you follow ---------- */
// Kick's follow lists, best first: followed-page gives 20 channels a page, followed only 5.
const KICK_FOLLOW_APIS = ['/api/v2/channels/followed-page', '/api/v2/channels/followed', '/api/v1/user/following'];
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
// Kick: pull channel slugs out of whatever list Kick's API returns.
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
// Twitch: one page of { currentUser { follows { edges { node { login displayName } } } } }
function twitchFollowsFrom(d) {
  const f = d && d.data && d.data.currentUser && d.data.currentUser.follows;
  if (!f) return null;
  const edges = Array.isArray(f.edges) ? f.edges : [];
  const items = edges.filter(e => e && e.node && /^[a-z0-9_]{1,25}$/i.test(e.node.login || ''))
    .map(e => ({ ch: 'tw:' + e.node.login.toLowerCase(), name: e.node.displayName || e.node.login }));
  const last = edges.length ? edges[edges.length - 1].cursor : null;
  return { items, next: f.pageInfo && f.pageInfo.hasNextPage && last ? last : null };
}
// Whether you can moderate a channel, from each platform's answer: Kick's /api/v2/channels/<slug>/me,
// Twitch's { currentUser { login } user(login) { self { isModerator } } }. null when the answer doesn't say.
function canModerate(plat, d, ch) {
  if (!d || typeof d !== 'object') return null;
  if (plat === 'kick') return typeof d.is_moderator === 'boolean' ? !!(d.is_moderator || d.is_broadcaster) : null;
  const me = d.data && d.data.currentUser, self = d.data && d.data.user && d.data.user.self;
  if (!me) return null;
  if (String(me.login || '').toLowerCase() === String(ch || '').toLowerCase()) return true;   // your own channel
  return self ? !!(self.isModerator || self.isEditor) : false;
}
// A link on a "following" page -> channel id for that platform (or null).
const RESERVED = {
  kick: /^(categories|category|browse|following|search|settings|dashboard|privacy-policy|terms-of-service|community-guidelines|dmca-policy|contact|careers|about|faq|clips|video|videos|popout|subscriptions|login|signup|home|messages|notifications|wallet|transactions)$/,
  twitch: /^(directory|videos|settings|search|subscriptions|inventory|drops|wallet|p|downloads|jobs|turbo|prime|store|friends|messages|following|login|signup|payments|u|moderator|team|clips)$/
};
function channelFromLink(plat, href) {
  let u; try { u = new URL(href, plat === 'kick' ? 'https://kick.com' : plat === 'twitch' ? 'https://www.twitch.tv' : 'https://www.youtube.com'); } catch { return null; }
  const p = u.pathname.replace(/\/+$/, '');
  if (plat === 'youtube') {
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    let m = p.match(/^\/@([^/]+)$/);
    if (m) { let h; try { h = decodeURIComponent(m[1]); } catch { h = m[1]; } return /^[\w.\-]{1,100}$/.test(h) ? 'yt:@' + h.toLowerCase() : null; }
    m = p.match(/^\/channel\/(UC[\w-]{10,40})$/);
    return m ? 'yt:c:' + m[1] : null;
  }
  const m = p.match(/^\/([A-Za-z0-9_-]{1,40})$/);
  if (!m || RESERVED[plat].test(m[1].toLowerCase())) return null;
  if (plat === 'twitch') return /^[A-Za-z0-9_]{1,25}$/.test(m[1]) ? 'tw:' + m[1].toLowerCase() : null;
  return SLUG_RE.test(m[1]) ? m[1].toLowerCase() : null;
}

module.exports = { parseTwitchUsers, readKickLive, parseYtFeed, parseYtVideos, ytErrorReason, createKeyGate, nextPacificMidnight, isGoogleSignin, firefoxVersion, firefoxUA, KICK_FOLLOW_APIS, readKickFollowPages, kickFollowsFrom, twitchFollowsFrom, canModerate, channelFromLink, parseChannel, createLiveWatcher, SLUG_RE, normCh, validCh, platformOf, parseTwitch, parseTwitchHtml, ytLiveUrl, parseYouTube };
