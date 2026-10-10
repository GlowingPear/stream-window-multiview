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

// The polling loop. fetchChannel(slug) -> parsed info | null (unknown) | { missing: true }.
function createLiveWatcher({ fetchChannel, onStatus, onWentLive, intervalMs = 60000, spacingMs = 1200, now = () => Date.now(), sleep }) {
  const wait = sleep || (ms => new Promise(r => setTimeout(r, ms)));
  let list = [], state = new Map(), running = false, timer = null, stopped = false, wake = null;

  function setChannels(channels) {
    const next = [...new Set((channels || []).map(normCh).filter(validCh))];
    for (const k of [...state.keys()]) if (!next.includes(k)) state.delete(k);
    const added = next.some(c => !list.includes(c));
    list = next;
    if (added) checkSoon();
  }
  function snapshot() { const o = {}; for (const [k, v] of state) o[k] = v; return o; }

  async function pass() {
    for (const slug of [...list]) {
      if (stopped) return;
      let info = null;
      try { info = await fetchChannel(slug); } catch { info = null; }
      if (!list.includes(slug)) continue;                 // removed while we were checking
      if (info && !info.missing) {
        const prev = state.get(slug);
        state.set(slug, info);
        // Only a real offline -> live change notifies (not channels that were already live when the app started).
        if (info.live && prev && !prev.live) onWentLive && onWentLive(slug, info);
      } else if (info && info.missing) {
        state.set(slug, { live: false, missing: true, title: '', viewers: null, category: '', name: slug, checked: now() });
      }
      onStatus && onStatus(snapshot());
      await wait(spacingMs);
    }
  }
  async function loop() {
    if (running) return;
    running = true;
    try {
      while (!stopped) {
        await pass();
        await new Promise(r => { wake = r; timer = setTimeout(r, intervalMs); });
        wake = null;
      }
    } finally { running = false; }
  }
  function checkSoon() { if (wake) { clearTimeout(timer); const w = wake; wake = null; w(); } else if (!running && !stopped) loop(); }
  function stop() { stopped = true; clearTimeout(timer); if (wake) wake(); }

  return { setChannels, checkSoon, stop, snapshot, start: loop, _pass: pass, _state: state };
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

/* ---------- "use your browser's login": cookie files ----------
   Reads a cookies.txt (Netscape format, from a "Get cookies.txt" browser extension) or a JSON
   export (array of cookies). Only keeps cookies for the given domains. */
function parseCookieFile(text, domains) {
  const keep = d => domains.some(x => d === x || d.endsWith('.' + x));
  const out = [];
  const push = c => {
    const domain = String(c.domain || '').trim().toLowerCase();
    if (!domain || !c.name || !keep(domain.replace(/^\./, ''))) return;
    out.push({
      domain, hostOnly: !!c.hostOnly, path: c.path || '/', name: String(c.name), value: String(c.value ?? ''),
      secure: !!c.secure, httpOnly: !!c.httpOnly,
      expirationDate: Number.isFinite(+c.expirationDate) && +c.expirationDate > 0 ? +c.expirationDate : undefined,
      sameSite: ({ no_restriction: 'no_restriction', none: 'no_restriction', lax: 'lax', strict: 'strict' })[String(c.sameSite || '').toLowerCase()] || 'unspecified'
    });
  };
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    let d; try { d = JSON.parse(t); } catch { return []; }
    const list = Array.isArray(d) ? d : Array.isArray(d.cookies) ? d.cookies : [];
    list.forEach(c => push({ ...c, expirationDate: c.expirationDate ?? c.expires ?? c.expiry }));
    return out;
  }
  for (let line of t.split(/\r?\n/)) {
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) { httpOnly = true; line = line.slice(10); }
    else if (!line.trim() || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length < 7) continue;
    push({ domain: f[0], hostOnly: f[1].toUpperCase() !== 'TRUE', path: f[2], secure: f[3].toUpperCase() === 'TRUE', expirationDate: +f[4], name: f[5], value: f[6], httpOnly });
  }
  return out;
}

/* ---------- importing the channels you follow ---------- */
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

module.exports = { isGoogleSignin, firefoxVersion, firefoxUA, parseCookieFile, kickFollowsFrom, twitchFollowsFrom, channelFromLink, parseChannel, createLiveWatcher, SLUG_RE, normCh, validCh, platformOf, parseTwitch, parseTwitchHtml, ytLiveUrl, parseYouTube };
