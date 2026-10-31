// Suggestions from the channels you follow, for the Channels box. The app keeps the last follow list it read from
// each site (names only, in the app's data: main/db.js): Kick's comes from the live checks, Twitch's and YouTube's from Import
// follows (and a daily refresh). Used by the main process (the store) and by the app page as window.SmvFollows
// (the suggestions), and by the tests (require). src/shared/ is for code both sides load, so it stays in a form
// both can: require() and a plain <script>.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmvFollows = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SITES = ['kick', 'twitch', 'youtube'];
  const MAX_ITEMS = 5000;            // per site: more than anyone follows, and a cap on what a bad answer can store
  const CH_RE = /^(tw:[a-z0-9_]{1,25}|yt:@[\w.\-]{2,100}|yt:c:UC[\w-]{10,40}|[a-z0-9_-]{1,40})$/;
  const siteOf = ch => /^tw:/.test(ch) ? 'twitch' : /^yt:/.test(ch) ? 'youtube' : 'kick';
  const label = ch => String(ch).replace(/^(tw:|yt:c:|yt:)/, '');

  // A store read from disk (or anything else) -> { v: 1, off?, kick?: { at, items: [{ ch, name }] }, twitch?, youtube? }
  function normStore(d) {
    const out = { v: 1 };
    if (!d || typeof d !== 'object') return out;
    if (d.off === true) { out.off = true; return out; }    // switched off: nothing kept
    for (const s of SITES) {
      const x = d[s];
      if (!x || typeof x !== 'object' || !Array.isArray(x.items)) continue;
      out[s] = { at: Number.isFinite(+x.at) ? +x.at : 0, items: cleanItems(x.items, s) };
    }
    return out;
  }
  // [{ ch, name }] for one site: valid channels on that site, lower case, once each, names as given
  function cleanItems(items, site) {
    const seen = new Map();
    for (const x of Array.isArray(items) ? items : []) {
      if (!x || typeof x.ch !== 'string') continue;
      const ch = /^yt:c:/i.test(x.ch) ? 'yt:c:' + x.ch.slice(5) : x.ch.toLowerCase();
      if (!CH_RE.test(ch) || siteOf(ch) !== site || seen.has(ch)) continue;
      const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 100) : label(ch);
      seen.set(ch, name);
      if (seen.size >= MAX_ITEMS) break;
    }
    return [...seen].map(([ch, name]) => ({ ch, name }));
  }
  // A new list for one site. A name the new list doesn't have (Kick's live checks only see slugs) keeps the old one.
  function setSite(store, site, items, at = Date.now()) {
    const s = normStore(store);
    if (!SITES.includes(site) || s.off) return s;
    const old = new Map(((s[site] || {}).items || []).map(x => [x.ch, x.name]));
    const list = cleanItems((items || []).map(x => typeof x === 'string' ? { ch: x } : x), site)
      .map(x => (x.name === label(x.ch) && old.has(x.ch) ? { ch: x.ch, name: old.get(x.ch) } : x));
    s[site] = { at, items: list };
    return s;
  }
  // Every followed channel from the sites in `sites` (default: all), as [{ ch, name, site }]
  function allFollows(store, sites = SITES) {
    const s = normStore(store), out = [];
    for (const site of SITES) if (sites.includes(site) && s[site]) s[site].items.forEach(x => out.push({ ...x, site }));
    return out;
  }
  const norm = q => String(q || '').trim().replace(/^@/, '').toLowerCase();
  // Up to `max` followed channels you haven't saved. With text: ones whose name matches it, live first, then names
  // that start with it, then the shortest. Without: the live ones, most viewers first. `live` maps a channel to
  // { live, viewers, ... } (only live ones need to be there).
  function suggest({ follows = [], saved = [], live = {}, q = '', max = 5 } = {}) {
    const skip = new Set(saved), text = norm(q);
    const isLive = ch => !!(live[ch] && live[ch].live !== false);
    const viewers = ch => (live[ch] && Number.isFinite(+live[ch].viewers) ? +live[ch].viewers : -1);
    const rows = [];
    for (const f of follows) {
      if (!f || skip.has(f.ch)) continue;
      const names = [String(f.name || '').toLowerCase(), label(f.ch).toLowerCase()];
      let score = 0;
      if (text) {
        if (names.some(n => n.startsWith(text))) score = 2;
        else if (names.some(n => n.includes(text))) score = 1;
        else continue;
      } else if (!isLive(f.ch)) continue;
      rows.push({ ...f, live: isLive(f.ch), score });
    }
    rows.sort((a, b) => (b.live - a.live) || (text ? b.score - a.score || a.name.length - b.name.length : viewers(b.ch) - viewers(a.ch))
      || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const seen = new Set();
    return rows.filter(r => !seen.has(r.ch) && seen.add(r.ch)).slice(0, max).map(({ score, ...r }) => r);
  }

  return { SITES, normStore, setSite, allFollows, suggest, siteOf };
});
