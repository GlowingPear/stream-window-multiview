// Live status checker for saved channels.
// Kick's own browser notifications come from its push system, which apps can't hook into,
// so instead we ask the sites for each saved channel's info every minute (each site's own way: sites/<id>/site.js)
// and notice when one switches from offline to live.
const SmvSites = require('../shared/sites');

// Channel ids (src/shared/sites.js): Kick "name", Twitch "tw:name", YouTube "yt:@handle" | "yt:c:UC…" | "yt:v:VIDEOID"
const { normCh, validCh } = SmvSites;
// The channel's site, by name ("Twitch")
const platformOf = c => (SmvSites.byId[SmvSites.siteOf(c)] || SmvSites.byId[SmvSites.DEFAULT]).name;
// A time from a site as ms since 1970, or null. Kick writes UTC times without a zone ("2026-10-11 19:02:11").
function toTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? (v < 1e12 ? v * 1000 : v) : null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const t = Date.parse(s);
  return Number.isFinite(t) && t > 0 ? t : null;
}
const decodeHtml = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\\u0026/g, '&').replace(/\\"/g, '"');

// The polling loop, in two parts so slow checks never hold up fast ones:
// - every batchIntervalMs, fetchBatch(list) answers many channels at once -> { results: Map(ch -> info),
//   rest: [channels it couldn't answer] } (optional; without it every channel is checked alone);
// - the rest are checked one at a time with fetchChannel(ch), spacingMs apart, then the same wait.
// info: parsed info | null (unknown) | { missing: true }. Batch answers may be { partial: true }: no
// title. Then the title comes from fetchChannel: straight away when the channel has just gone live (so
// the notification has it), otherwise later, one at a time.
// A check that never answers (a dead connection after sleep, a stuck page) would stop its loop for good, so
// each batch gets batchTimeoutMs and each single check oneTimeoutMs: after that it counts as no answer.
// auto: false (for tests) never starts the loops; run passes with _batchPass / _onePass.
function createLiveWatcher({ fetchChannel, fetchBatch, onStatus, onWentLive, intervalMs = 60000, batchIntervalMs = intervalMs, spacingMs = 1200,
  batchTimeoutMs = 5 * 60e3, oneTimeoutMs = 60e3, now = () => Date.now(), sleep, auto = true }) {
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
      if (info.live && prev && prev.live) { next.title = prev.title || ''; if (!next.startedAt && prev.startedAt) next.startedAt = prev.startedAt; }
      if (!next.name) next.name = (prev && prev.name) || slug;
      if (info.live && !next.title) needTitle.add(slug); else needTitle.delete(slug);
    } else needTitle.delete(slug);
    state.set(slug, next);
    // Only a real offline -> live change notifies (not channels that were already live when the app started).
    if (next.live && prev && !prev.live) onWentLive && onWentLive(slug, next);
  }
  const fetchOne = slug => withTimeout(Promise.resolve().then(() => fetchChannel(slug)), oneTimeoutMs, null).catch(() => null);

  async function batchPass() {
    if (!fetchBatch || !list.length) return;
    let r = null;
    try { r = await withTimeout(Promise.resolve().then(() => fetchBatch([...list])), batchTimeoutMs, null); } catch { r = null; }
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
    const l = { running: false, again: false, wake: null, timer: null };
    l.run = async () => {
      if (l.running) return;
      l.running = true;
      try {
        while (!stopped) {
          await pass();
          if (l.again) { l.again = false; continue; }      // poked during the pass: go again now, not in a minute
          await new Promise(r => { l.wake = r; l.timer = setTimeout(r, ms); });
          l.wake = null;
        }
      } finally { l.running = false; }
    };
    l.poke = () => {
      if (!auto) return;
      if (l.wake) { clearTimeout(l.timer); const w = l.wake; l.wake = null; w(); } else if (l.running) l.again = true; else if (!stopped) l.run();
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

// p's answer, or fallback when it takes longer than ms (p is left to finish on its own).
// Adds x to a Set and keeps only the newest max things in it (a Set keeps the order they were added in).
function keepLatest(set, x, max) {
  set.delete(x);
  set.add(x);
  while (set.size > max) set.delete(set.values().next().value);
  return set;
}
function withTimeout(p, ms, fallback) {
  let t;
  return Promise.race([p, new Promise(r => { t = setTimeout(() => r(fallback), ms); })]).finally(() => clearTimeout(t));
}

/* ---------- another browser's identity ----------
   For sign-in pages that refuse the app as it is (Google's: sites/youtube/site.js), which accept Firefox. */
// A current Firefox version: 128 shipped 2024-07-09 and a new one ships every 4 weeks.
function firefoxVersion(now = Date.now()) {
  return Math.max(128, 128 + Math.floor((now - Date.UTC(2024, 6, 9)) / (28 * 864e5)) - 1);
}
function firefoxUA(platform = process.platform, now) {
  const v = firefoxVersion(now);
  const os = platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' : platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
}

module.exports = { keepLatest, withTimeout, toTime, decodeHtml, firefoxVersion, firefoxUA, createLiveWatcher, normCh, validCh, platformOf };
