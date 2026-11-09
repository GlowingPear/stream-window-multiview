/* ---- Runs inside a Kick, Twitch or YouTube stream's player page (turned into text: see src/page/README.md). Sets how
   high its quality may go, and says what it can play and what it plays now (windows/quality.js asks every few seconds,
   as Kick puts its own 720p cap back whenever its player loads again).
   cap: the height it may go up to (it takes the highest it has at or under that, or its lowest), 0 for its lowest, or
   null to leave the choice to the site. Kick's and Twitch's players are Amazon IVS players, kept in a React ref (found
   from the <video>): they keep choosing by themselves under the cap, as the connection allows. YouTube's player picks
   the one asked for. -> { all: [{ h, name }], now: { h, name } | null }, highest first, or null without a player. */
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
