// Streamer profiles: what the app learns about each saved channel over time, and what the sites say.
//
// History is recorded from the app's own live checks (about once a minute, only while the app is
// open), so it only has the streams the app saw. Kick and Twitch past broadcasts fill in the rest
// when the streamer keeps them. Everything here is plain data: main.js loads and saves it, and
// sends the page the summary that profileSummary() makes.
const { toTime, decodeHtml } = require('./live');

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const GAP = 20 * MIN;            // not seen live for this long: that stream is over
const SAMPLE_EVERY = 50e3;       // at most one viewer count a minute (checks can come every 30 s)
const MAX_SAMPLES = 720;         // 12 h at one a minute; longer streams keep every other one
const KEEP_SAMPLES = 5;          // streams that keep their viewer counts (the graph); older ones keep peak and average
const MAX_SESSIONS = 500;
const MAX_AGE = 400 * DAY;
const MAX_TAGS = 12;

function emptyEntry(now) { return { tracked: now, sessions: [], followers: [] }; }

// The store: { v: 1, ch: { [channel]: entry }, meta: { [channel]: { notes, tags, fav, nick } } }
function createHistory(data, { now = () => Date.now() } = {}) {
  const d = data && data.v === 1 && data.ch && typeof data.ch === 'object' ? data : { v: 1, ch: {}, meta: {} };
  if (!d.meta || typeof d.meta !== 'object') d.meta = {};
  let changed = false;
  const entry = (ch, create) => {
    if (!d.ch[ch] && create) { d.ch[ch] = emptyEntry(now()); changed = true; }
    return d.ch[ch] || null;
  };
  const openOf = e => [...e.sessions.slice(-5)].reverse().find(s => !s.end) || null;
  const close = s => { s.end = s.last; changed = true; };

  // One round of live checks: { [channel]: { live, title, viewers, category, startedAt, missing } }
  function record(snap) {
    const t = now();
    for (const [ch, info] of Object.entries(snap || {})) {
      if (!info || info.missing) continue;
      const e = entry(ch, true);
      let s = openOf(e);
      if (!info.live) { if (s) close(s); continue; }
      const started = info.startedAt && info.startedAt <= t + MIN ? Math.min(info.startedAt, t) : null;
      // a stream the app last saw a while ago is over, unless the site says it's still the same one
      if (s) {
        const same = started && s.exact ? Math.abs(started - s.start) < 5 * MIN : started ? started <= s.last + MIN : t - s.last <= GAP;
        if (!same) { close(s); s = null; }
      }
      if (!s) {
        // a stream already known from its past broadcast (Twitch keeps one while the stream is still on)
        const from = started || t;
        s = e.sessions.slice(-5).find(x => x.src === 'vod' && from >= x.start - 10 * MIN && from <= x.end + GAP) || null;
        if (s) { delete s.end; s.src = 'app'; s.last = Math.max(s.last || 0, t); ['samples', 'titles', 'cats'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; }); }
        else {
          s = { start: from, exact: !!started, last: t, src: 'app', title: '', cat: '', peak: null, vsum: 0, vn: 0, samples: [], titles: [], cats: [] };
          e.sessions.push(s);
          e.sessions.sort((a, b) => a.start - b.start);
          trim(e);
        }
      } else if (started && !s.exact) { s.start = Math.min(s.start, started); s.exact = true; }
      s.last = t;
      if (info.title && info.title !== s.title) { s.title = String(info.title).slice(0, 200); s.titles.push({ at: t, t: s.title }); if (s.titles.length > 20) s.titles.shift(); }
      if (info.category && info.category !== s.cat) { s.cat = String(info.category).slice(0, 80); s.cats.push({ at: t, c: s.cat }); if (s.cats.length > 20) s.cats.shift(); }
      const v = Number.isFinite(+info.viewers) && info.viewers != null ? Math.max(0, Math.round(+info.viewers)) : null;
      if (v != null) {
        s.peak = Math.max(s.peak || 0, v); s.vsum += v; s.vn++;
        const lastS = s.samples[s.samples.length - 1];
        if (!lastS || t - lastS[0] >= SAMPLE_EVERY) {
          s.samples.push([t, v]);
          if (s.samples.length > MAX_SAMPLES) s.samples = s.samples.filter((_, i) => i % 2 === 0);
        }
      }
      changed = true;
    }
  }

  function trim(e) {
    const t = now();
    e.sessions = e.sessions.filter(s => (s.end || s.last || s.start) > t - MAX_AGE).slice(-MAX_SESSIONS);
    e.sessions.slice(0, -KEEP_SAMPLES).forEach(s => { if (s.samples && s.samples.length) s.samples = []; });
  }

  // Past broadcasts from the site: [{ id, start, end, title, category, views }]. They make the app's own
  // records exact and fill in streams the app didn't see.
  function mergeVods(ch, vods) {
    if (!Array.isArray(vods) || !vods.length) return;
    const e = entry(ch, true), t = now();
    for (const v of vods) {
      if (!v || !Number.isFinite(v.start) || !Number.isFinite(v.end) || v.end <= v.start || v.start < t - MAX_AGE || v.start > t) continue;
      if (v.end > t - GAP) continue;                  // probably still going (Twitch's broadcast grows while live): the live checks have it
      const len = v.end - v.start;
      const hit = e.sessions.find(s => {
        const sEnd = s.end || s.last;
        const overlap = Math.min(sEnd, v.end) - Math.max(s.start, v.start);
        return (overlap >= 0 && overlap >= Math.min(len, sEnd - s.start) * 0.5) || (s.vod && s.vod === v.id);
      });
      if (hit) {
        if (hit.vod === v.id && hit.src === 'vod') continue;
        if (!hit.vod) { hit.vod = v.id || true; changed = true; }
        if (!hit.exact) { hit.start = v.start; hit.exact = true; changed = true; }
        if (hit.end && Math.abs(hit.end - v.end) > MIN) { hit.end = v.end; hit.last = Math.max(hit.last, v.end); changed = true; }
        if (!hit.title && v.title) { hit.title = v.title; changed = true; }
        if (!hit.cat && v.category) { hit.cat = v.category; changed = true; }
        continue;
      }
      e.sessions.push({ start: v.start, end: v.end, last: v.end, exact: true, src: 'vod', vod: v.id || true, title: String(v.title || '').slice(0, 200),
        cat: String(v.category || '').slice(0, 80), views: Number.isFinite(v.views) ? v.views : null, peak: null, vsum: 0, vn: 0, samples: [], titles: [], cats: [] });
      changed = true;
    }
    e.sessions.sort((a, b) => a.start - b.start);
    trim(e);
  }

  // One follower count a day (the latest one that day).
  function setFollowers(ch, n) {
    if (!Number.isFinite(n) || n < 0) return;
    const e = entry(ch, true), day = dayKey(now());
    const last = e.followers[e.followers.length - 1];
    if (last && last[0] === day) { if (last[1] !== n) { last[1] = n; changed = true; } return; }
    e.followers.push([day, n]);
    if (e.followers.length > 400) e.followers.shift();
    changed = true;
  }

  // What the directory shows without asking the sites again: the last picture, name and follower count seen.
  function setInfo(ch, info) {
    const e = entry(ch, true), next = { name: str(info.name).slice(0, 60), avatar: httpsUrl(info.avatar), followers: num(info.followers), at: now() };
    if (JSON.stringify({ ...e.info, at: 0 }) !== JSON.stringify({ ...next, at: 0 })) changed = true;
    e.info = next;
  }
  const info = ch => (d.ch[ch] && d.ch[ch].info) || null;

  function getMeta(ch) { const m = d.meta[ch] || {}; return { notes: m.notes || '', tags: m.tags || [], fav: !!m.fav, nick: m.nick || '' }; }
  function setMeta(ch, patch) {
    const m = { ...getMeta(ch) };
    if (typeof patch.notes === 'string') m.notes = patch.notes.slice(0, 5000);
    if (Array.isArray(patch.tags)) m.tags = [...new Set(patch.tags.map(x => String(x).trim().slice(0, 24)).filter(Boolean))].slice(0, MAX_TAGS);
    if (typeof patch.fav === 'boolean') m.fav = patch.fav;
    if (typeof patch.nick === 'string') m.nick = patch.nick.trim().slice(0, 40);
    if (!m.notes && !m.tags.length && !m.fav && !m.nick) delete d.meta[ch]; else d.meta[ch] = m;
    changed = true;
    return getMeta(ch);
  }
  const allMeta = () => d.meta;

  return {
    record, mergeVods, setFollowers, setInfo, info, getMeta, setMeta, allMeta,
    entry: ch => entry(ch, false),
    data: () => d,
    takeChanged: () => { const c = changed; changed = false; return c; }
  };
}

const dayKey = t => { const x = new Date(t); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); };
const weekday = t => (new Date(t).getDay() + 6) % 7;     // Monday = 0

// Where a stream really ends, as far as is known: its end, or the last time the app saw it live.
function endOf(s, t) { return s.end || (t - s.last > GAP ? s.last : t); }
const isLive = (s, t) => !s.end && t - s.last <= GAP;

// The minute of the day most streams start at (a circular average, so 11 PM and 1 AM average to midnight),
// and how far starts usually are from it.
function usualStart(starts) {
  if (starts.length < 2) return null;
  const mins = starts.map(t => { const x = new Date(t); return x.getHours() * 60 + x.getMinutes(); });
  let sx = 0, sy = 0;
  mins.forEach(m => { const a = m / 1440 * 2 * Math.PI; sx += Math.cos(a); sy += Math.sin(a); });
  const mean = ((Math.atan2(sy, sx) / (2 * Math.PI) * 1440) + 1440) % 1440;
  const dist = m => { const x = Math.abs(m - mean) % 1440; return Math.min(x, 1440 - x); };
  const spread = mins.map(dist).sort((a, b) => a - b)[Math.floor(mins.length / 2)];
  return { minute: Math.round(mean), spread: Math.round(spread) };
}

// Hours streamed per category, splitting a stream where the app saw its category change.
function categoryHours(sessions, from, t) {
  const out = new Map();
  for (const s of sessions) {
    const end = endOf(s, t), start = Math.max(s.start, from);
    if (end <= start) continue;
    const marks = (s.cats && s.cats.length ? s.cats : [{ at: s.start, c: s.cat }]).filter(m => m.c);
    if (!marks.length) continue;
    marks.forEach((m, i) => {
      const a = Math.max(i === 0 ? s.start : m.at, start), b = Math.min(i + 1 < marks.length ? marks[i + 1].at : end, end);
      if (b > a) out.set(m.c, (out.get(m.c) || 0) + (b - a));
    });
  }
  return [...out].map(([name, ms]) => ({ name, hours: ms / HOUR })).sort((a, b) => b.hours - a.hours).slice(0, 6);
}

// Which hours of the week they're usually live: for each weekday and hour, the share of weeks they
// were live then. Only weeks the app knows about count (since it started tracking, or the oldest
// past broadcast), up to 13 weeks.
function heatmap(sessions, from, t) {
  const weeks = Math.max(1, Math.ceil((t - from) / (7 * DAY)));
  const seen = new Set();
  for (const s of sessions) {
    const end = Math.min(endOf(s, t), t);
    const first = new Date(Math.max(s.start, from)); first.setMinutes(0, 0, 0);
    for (let h = first.getTime(); h < end; h += HOUR) {
      const x = new Date(h);
      seen.add(`${weekday(h)}-${x.getHours()}-${Math.floor((t - h) / (7 * DAY))}`);
    }
  }
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const k of seen) { const [d, h] = k.split('-').map(Number); grid[d][h]++; }
  return { weeks, cells: grid.map(r => r.map(n => Math.min(1, n / weeks))) };
}

function streaks(sessions, t) {
  const days = new Set(sessions.map(s => dayKey(s.start)));
  const back = n => dayKey(t - n * DAY);
  let cur = 0, i = days.has(back(0)) ? 0 : 1;
  while (days.has(back(i))) { cur++; i++; }
  let best = 0, run = 0;
  for (let k = 120; k >= 0; k--) { if (days.has(back(k))) { run++; best = Math.max(best, run); } else run = 0; }
  return { current: cur, best: Math.max(best, cur) };
}

// Everything the profile page shows from the history, worked out here so the page only draws it.
function profileSummary(e, { now = Date.now() } = {}) {
  const t = now;
  if (!e) return { tracked: null, sessions: 0, live: null, history: [], stats: null, heat: null, categories: [], viewers: [], recap: null, followers: null, coverage: null };
  const all = e.sessions.filter(s => s.start <= t);
  const in30 = all.filter(s => endOf(s, t) > t - 30 * DAY), in90 = all.filter(s => endOf(s, t) > t - 90 * DAY);
  const ended = in90.filter(s => !isLive(s, t));
  const len = s => endOf(s, t) - s.start;
  const live = all.length && isLive(all[all.length - 1], t) ? all[all.length - 1] : null;
  const oldest = all.length ? all[0].start : t;
  const from = Math.max(t - 91 * DAY, Math.min(e.tracked || t, oldest));
  const seenBy = in30.filter(s => s.src === 'app');
  const withViewers = in30.filter(s => s.vn > 0);
  const vsum = withViewers.reduce((a, s) => a + s.vsum, 0), vn = withViewers.reduce((a, s) => a + s.vn, 0);
  const starts = in90.filter(s => s.exact || s.src === 'app').map(s => s.start);
  const dayCounts = Array(7).fill(0); in90.forEach(s => dayCounts[weekday(s.start)]++);
  const fol = e.followers || [];
  let followers = null;
  if (fol.length) {
    const latest = fol[fol.length - 1], monthAgo = dayKey(t - 30 * DAY);
    const base = fol.find(f => f[0] >= monthAgo) || fol[0];
    followers = { count: latest[1], change: base !== latest ? latest[1] - base[1] : null, since: base !== latest ? base[0] : null };
  }
  const last = [...all].reverse().find(s => !isLive(s, t)) || null;
  const graph = live || last;
  return {
    tracked: e.tracked || null,
    sessions: all.length,
    live: live && { start: live.start, exact: live.exact, title: live.title, cat: live.cat, peak: live.peak, titles: live.titles || [], cats: live.cats || [] },
    recap: last && { start: last.start, end: endOf(last, t), title: last.title, cat: last.cat, peak: last.peak, src: last.src },
    viewers: graph && graph.samples ? graph.samples.slice() : [],
    history: [...all].reverse().slice(0, 100).map(s => ({
      start: s.start, end: isLive(s, t) ? null : endOf(s, t), exact: !!s.exact, title: s.title || '', cat: s.cat || '',
      peak: s.peak, avg: s.vn ? Math.round(s.vsum / s.vn) : null, views: s.views ?? null,
      src: s.src === 'vod' ? 'vod' : s.vod ? 'both' : 'app'
    })),
    stats: {
      streams30: in30.length,
      hours30: in30.reduce((a, s) => a + Math.max(0, Math.min(endOf(s, t), t) - Math.max(s.start, t - 30 * DAY)), 0) / HOUR,
      avgLength: ended.length ? ended.reduce((a, s) => a + len(s), 0) / ended.length : null,
      longest: ended.length ? Math.max(...ended.map(len)) : null,
      usual: usualStart(starts),
      dayCounts,
      streak: streaks(all, t),
      avgViewers: vn ? Math.round(vsum / vn) : null,
      peak30: withViewers.length ? Math.max(...withViewers.map(s => s.peak || 0)) : null,
      seenWithViewers: withViewers.length
    },
    coverage: { since: e.tracked || null, oldest: all.length ? oldest : null, appSeen30: seenBy.length, vod30: in30.length - seenBy.length, total30: in30.length },
    heat: in90.length >= 3 ? heatmap(in90, from, t) : null,
    categories: categoryHours(in90, t - 90 * DAY, t),
    followers
  };
}

/* ---------- what the sites say about a channel ---------- */
const str = v => (v == null ? '' : String(v));
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const httpsUrl = u => (/^https:\/\/[^\s"'<>]+$/i.test(str(u)) ? str(u) : '');

// Social links: a handle or a full link -> { site, label, url }
const SOCIAL = {
  instagram: ['Instagram', h => `https://instagram.com/${h}`],
  twitter: ['X', h => `https://x.com/${h}`],
  x: ['X', h => `https://x.com/${h}`],
  youtube: ['YouTube', h => `https://youtube.com/${/^(@|channel\/|c\/|user\/)/.test(h) ? h : '@' + h}`],
  discord: ['Discord', h => `https://discord.gg/${h}`],
  tiktok: ['TikTok', h => `https://tiktok.com/@${h.replace(/^@/, '')}`],
  facebook: ['Facebook', h => `https://facebook.com/${h}`],
  kick: ['Kick', h => `https://kick.com/${h}`],
  twitch: ['Twitch', h => `https://twitch.tv/${h}`]
};
function social(kind, value, title) {
  const k = str(kind).toLowerCase(), raw = str(value).trim();
  if (!raw) return null;
  const def = SOCIAL[k];
  let url = '';
  if (/^https?:\/\//i.test(raw)) url = raw.replace(/^http:/i, 'https:');
  else if (def && /^@?[\w.\-/]{1,100}$/.test(raw)) url = def[1](raw.replace(/^@/, ''));
  if (!httpsUrl(url)) return null;
  const label = title || raw.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return { site: def ? def[0] : (str(title) || k || 'Link').slice(0, 30), label: label.slice(0, 60), url };
}

// Kick: the channel's JSON (/api/v2/channels/<name>).
function parseKickProfile(d, slug) {
  if (!d || typeof d !== 'object' || (!d.slug && !d.user)) return null;
  const u = d.user || {}, ls = d.livestream, cr = d.chatroom || {};
  const live = !!(ls && ls.is_live !== false);
  const cat = ls && Array.isArray(ls.categories) && ls.categories[0] ? str(ls.categories[0].name) : '';
  const socials = ['instagram', 'twitter', 'youtube', 'discord', 'tiktok', 'facebook'].map(k => social(k, u[k])).filter(Boolean);
  return {
    platform: 'kick', ch: str(d.slug || slug).toLowerCase(), url: `https://kick.com/${str(d.slug || slug)}`,
    name: str(u.username || d.slug || slug), avatar: httpsUrl(u.profile_pic || u.profilepic), banner: httpsUrl((d.banner_image && (d.banner_image.url || d.banner_image.src)) || (d.offline_banner_image && (d.offline_banner_image.src || d.offline_banner_image.url))),
    bio: str(u.bio).slice(0, 1000), followers: num(d.followers_count ?? d.followersCount), verified: !!(d.verified), partner: false,
    affiliate: !!d.is_affiliate, created: toTime(u.created_at || d.created_at), socials,
    live: live ? { title: str(ls.session_title), category: cat, viewers: num(ls.viewer_count), startedAt: toTime(ls.start_time || ls.created_at),
      thumb: httpsUrl(ls.thumbnail && (ls.thumbnail.url || ls.thumbnail.src)), mature: !!ls.is_mature, language: str(ls.language) } : null,
    chat: { followersOnly: !!cr.followers_mode, followMinutes: num(cr.following_min_duration), subsOnly: !!cr.subscribers_mode, emoteOnly: !!cr.emotes_mode,
      slowSeconds: cr.slow_mode ? num(cr.message_interval) || null : null },
    badges: (Array.isArray(d.subscriber_badges) ? d.subscriber_badges : []).map(b => ({ months: num(b.months), src: httpsUrl(b.badge_image && (b.badge_image.src || b.badge_image.url)) })).filter(b => b.src).slice(0, 12),
    vods: parseKickVideos(d.previous_livestreams) || []
  };
}
// Kick past broadcasts: /api/v2/channels/<name>/videos (or previous_livestreams in the channel JSON).
function parseKickVideos(list) {
  if (!Array.isArray(list)) return null;
  return list.map(v => {
    if (!v || typeof v !== 'object') return null;
    const start = toTime(v.start_time || v.created_at);
    let dur = num(v.duration);
    if (!start || !dur) return null;
    if (dur < 86400) dur *= 1000;                   // seconds, not milliseconds
    const cat = Array.isArray(v.categories) && v.categories[0] ? str(v.categories[0].name) : str(v.category && v.category.name);
    return { id: str(v.id || (v.video && v.video.uuid) || v.slug), start, end: start + dur, title: str(v.session_title || v.title).slice(0, 200), category: cat,
      views: num(v.views ?? (v.video && v.video.views) ?? v.viewer_count) };
  }).filter(Boolean);
}

// Twitch: { data: { user } } from the profile question in main.js.
function parseTwitchProfile(d, login) {
  const u = d && d.data ? d.data.user : undefined;
  if (u === undefined || u === null) return u === null ? { missing: true } : null;
  const st = u.stream, ch = u.channel || {}, self = u.self || {};
  const vods = ((u.videos && u.videos.edges) || []).map(x => x && x.node).filter(Boolean).map(v => {
    const start = toTime(v.createdAt), len = num(v.lengthSeconds);
    return start && len ? { id: str(v.id), start, end: start + len * 1000, title: str(v.title).slice(0, 200), category: str(v.game && v.game.name), views: num(v.viewCount) } : null;
  }).filter(Boolean);
  const lb = u.lastBroadcast;
  return {
    platform: 'twitch', ch: 'tw:' + str(u.login || login).toLowerCase(), url: `https://twitch.tv/${str(u.login || login)}`,
    name: str(u.displayName || u.login || login), avatar: httpsUrl(u.profileImageURL), banner: httpsUrl(u.bannerImageURL),
    bio: str(u.description).slice(0, 1000), followers: num(u.followers && u.followers.totalCount),
    verified: false, partner: !!(u.roles && u.roles.isPartner), affiliate: !!(u.roles && u.roles.isAffiliate), created: toTime(u.createdAt),
    socials: (Array.isArray(ch.socialMedias) ? ch.socialMedias : []).map(s => s && social(s.name, s.url, s.title)).filter(Boolean).slice(0, 10),
    live: st ? { title: str(st.title), category: str(st.game && st.game.name), viewers: num(st.viewersCount), startedAt: toTime(st.createdAt),
      thumb: httpsUrl(st.previewImageURL), mature: false, language: '' } : null,
    lastBroadcast: lb && lb.startedAt ? { start: toTime(lb.startedAt), title: str(lb.title), category: str(lb.game && lb.game.name) } : null,
    following: self.follower ? { since: toTime(self.follower.followedAt) } : self.follower === null ? false : undefined,
    sub: self.subscriptionBenefit ? { tier: str(self.subscriptionBenefit.tier).replace(/000$/, ''), prime: !!self.subscriptionBenefit.purchasedWithPrime } : null,
    chat: null, badges: [], vods
  };
}

// YouTube: the channel's own page (avatar, banner, about, subscribers) - YouTube has no public API without a key.
function parseYouTubeChannel(html, ch) {
  if (typeof html !== 'string' || html.length < 500) return null;
  const meta = p => decodeHtml((html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1] || '');
  const name = meta('og:title');
  if (!name) return null;
  const banner = (html.match(/"(?:banner|pageHeaderBanner|imageBannerViewModel)"[\s\S]{0,300}?"url":"(https:\/\/yt3\.(?:googleusercontent|ggpht)\.com\/[^"]+)"/) || [])[1] || '';
  const subs = (html.match(/"(\d[\d.,]*\s?[KMB]?) subscribers"/) || html.match(/"content":"(\d[\d.,]*\s?[KMB]?) subscribers"/) || [])[1] || '';
  const canon = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/(channel\/UC[\w-]+|@[\w.\-]+)"/) || [])[1] || '';
  return {
    platform: 'youtube', ch, url: `https://www.youtube.com/${canon || ch.replace(/^yt:(c:)?/, (m, c) => c ? 'channel/' : '')}`,
    name, avatar: httpsUrl(meta('og:image')), banner: httpsUrl(banner.replace(/\\u0026/g, '&')), bio: meta('og:description').slice(0, 1000),
    followers: null, followersText: subs, verified: /"BADGE_STYLE_TYPE_VERIFIED"/.test(html), partner: false, affiliate: false, created: null,
    socials: [], live: null, chat: null, badges: [], vods: []
  };
}

module.exports = { createHistory, profileSummary, parseKickProfile, parseKickVideos, parseTwitchProfile, parseYouTubeChannel, social, usualStart, heatmap, dayKey, GAP };
