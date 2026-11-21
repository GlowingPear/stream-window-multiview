/* ---- Runs inside a Kick, Twitch, YouTube or Rumble stream's player page (turned into text: see src/page/README.md). Sets how
   high its quality may go, and says what it can play and what it plays now (windows/quality.js asks every few seconds,
   as Kick puts its own 720p cap back whenever its player loads again).
   cap: the height it may go up to (it takes the highest it has at or under that, or its lowest), 0 for its lowest, or
   null to leave the choice to the site. Kick's and Twitch's players are Amazon IVS players, kept in a React ref (found
   from the <video>): they keep choosing by themselves under the cap, as the connection allows. YouTube's player picks
   the one asked for. An hls.js player (the page's window.Hls: Rumble's) keeps its instance to itself: it's caught as
   it runs (its own events, on Hls's prototype), so the first ask hooks it and a later one finds it; it keeps choosing
   by itself under the cap (autoLevelCapping). -> { all: [{ h, name }], now: { h, name } | null }, highest first, or null without a player. */
function qualityAgent(cap){
  const ivs = () => {
    const isPlayer = o => !!o && typeof o === 'object' && typeof o.setAutoMaxQuality === 'function' && typeof o.getQualities === 'function';
    for (let el = document.querySelector('video'), i = 0; el && i < 12; el = el.parentElement, i++){
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      for (let f = key ? el[key] : null, d = 0; f && d < 60; f = f.return, d++){
        for (let h = f.memoizedState; h && typeof h === 'object' && 'memoizedState' in h; h = h.next){
          const m = h.memoizedState;
          if (isPlayer(m)) return m;
          if (m && isPlayer(m.current)) return m.current;
        }
        for (const x of Object.values(f.memoizedProps || {})) if (isPlayer(x)) return x;
      }
    }
    return null;
  };
  const pick = (all, h) => cap === 0 ? all[all.length - 1] : all.find(q => q.h <= h) || all[all.length - 1];
  const p = ivs();
  if (p){
    const all = (p.getQualities() || []).map(q => ({ h: q.height, name: q.name, q })).sort((a, b) => b.h - a.h);
    if (!all.length) return null;
    const to = cap === null ? all[0] : pick(all, cap);
    if (p.__kmvCap !== to.name){
      if (typeof p.setAutoQualityMode === 'function' && p.isAutoQualityMode && !p.isAutoQualityMode()) p.setAutoQualityMode(true);
      p.setAutoMaxQuality(to.q);
      p.__kmvCap = to.name;          // (a player loaded again is a new one, without it)
    }
    const now = p.getQuality();
    return { all: all.map(({ h, name }) => ({ h, name })), now: now && now.height ? { h: now.height, name: now.name } : null };
  }
  const hl = (() => {
    const H = window.Hls;
    if (typeof H !== 'function' || !H.prototype) return null;
    if (!window.__kmvHlsHook){
      window.__kmvHlsHook = true;
      for (let pr = H.prototype; pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) ['emit', 'trigger'].forEach(n => {
        const f = Object.prototype.hasOwnProperty.call(pr, n) && pr[n];
        if (typeof f !== 'function' || f.__kmv) return;
        const w = function(...a){ if (Array.isArray(this.levels) && this.media) window.__kmvHls = this; return f.apply(this, a); };
        w.__kmv = true; pr[n] = w;
      });
    }
    const h = window.__kmvHls;
    return h && h.media && h.media.isConnected && Array.isArray(h.levels) ? h : null;
  })();
  if (hl){
    const all = hl.levels.map((l, i) => ({ h: +l.height || 0, name: l.height + 'p', i })).filter(q => q.h).sort((a, b) => b.h - a.h);
    if (!all.length) return null;
    const want = cap === null ? -1 : pick(all, cap).i;
    if (hl.autoLevelCapping !== want) hl.autoLevelCapping = want;
    // (a cap only counts at its next pick, which a live stream's long buffer puts off: playing above it, its next pick is
    // made now, still its own choice under the cap)
    const cur = hl.levels[hl.currentLevel];
    if (want >= 0 && cur && cur.height > hl.levels[want].height && hl.autoLevelEnabled && hl.nextAutoLevel !== want) hl.nextAutoLevel = want;
    const v = hl.media, now = v && v.videoHeight ? all.find(q => q.h <= v.videoHeight) : null;
    return { all: all.map(({ h, name }) => ({ h, name })), now: now ? { h: now.h, name: now.name } : null };
  }
  const yt = document.getElementById('movie_player');
  if (yt && typeof yt.setPlaybackQualityRange === 'function' && typeof yt.getAvailableQualityLevels === 'function'){
    const H = { highres: 4320, hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720, large: 480, medium: 360, small: 240, tiny: 144 };
    const all = yt.getAvailableQualityLevels().filter(n => H[n]).map(n => ({ h: H[n], name: H[n] + 'p' + (n === 'highres' ? '+' : ''), n })).sort((a, b) => b.h - a.h);
    if (!all.length) return null;
    const want = cap === null ? 'auto' : pick(all, cap).n;
    if (yt.__kmvCap !== want){ yt.setPlaybackQualityRange(want, want); yt.__kmvCap = want; }
    const v = document.querySelector('video'), playing = all.find(q => q.n === yt.getPlaybackQuality());
    const h = v && v.videoHeight ? all.find(q => q.h <= v.videoHeight) : null;
    const now = playing || h;
    return { all: all.map(({ h, name }) => ({ h, name })), now: now ? { h: now.h, name: now.name } : null };
  }
  return null;
}

export { qualityAgent };
