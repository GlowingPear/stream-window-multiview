let VOL_JS;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  // Runs inside each stream's player page: lets the title-bar slider drive the real player (YouTube's, or the <video>).
  VOL_JS = `(function(){
    if (window.__kmv) return true;
    // The app's volume / mute / pause for this stream is the truth. Kick's players share a saved
    // volume between them, so a change in one can leak into the others; anything that changes
    // here without you touching THIS player is put back.
    const st = { v: null, m: null, p: false }, seen = new WeakSet();
    let lastUser = 0, lastSync = 0, notYou = 0, undos = [];
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => window.addEventListener(t, () => { if (Date.now() > notYou) lastUser = Date.now(); }, true));
    // Don't let this player hear the other players' saved-volume updates at all.
    window.addEventListener('storage', e => { lastSync = Date.now(); e.stopImmediatePropagation(); }, true);
    const userRecent = () => Date.now() - lastUser < 2500 && Date.now() - lastSync > 400;
    const mayUndo = () => {            // safety valve: never fight back more than a few times a second
      const now = Date.now(); undos = undos.filter(t => now - t < 1000);
      if (undos.length >= 6) return false;
      undos.push(now); return true;
    };
    // YouTube's player keeps its own volume (the one its slider shows and saves) and sets the <video> from it,
    // scaled by its loudness levelling, so on YouTube the volume goes through the player instead.
    const ytp = () => { const p = document.querySelector('ytd-reel-video-renderer[is-active] #shorts-player, #movie_player');
      return p && typeof p.setVolume === 'function' && typeof p.getVolume === 'function' ? p : null; };
    const ytNow = p => ({ v: p.getVolume() / 100, m: !!p.isMuted() });
    let applied = false;
    const apply = vid => { try {
      const p = ytp();
      if (p){
        const n = ytNow(p);
        if (st.v !== null && Math.abs(n.v - st.v) > 0.001) p.setVolume(Math.round(st.v * 100));
        if (st.m !== null && n.m !== st.m) st.m ? p.mute() : p.unMute();
        if (st.m !== null && vid.muted !== st.m) vid.muted = st.m;   // the player catches up with its own mute a moment later
      } else {
        if (st.v !== null && Math.abs(vid.volume - st.v) > 0.001) vid.volume = st.v;
        if (st.m !== null && vid.muted !== st.m) vid.muted = st.m;
      }
      if (st.v !== null && st.m !== null) applied = true;
      if (st.p && !vid.paused) vid.pause();
    } catch (e) {} };
    const now = vid => { const p = ytp(); return p ? ytNow(p) : { v: vid.volume, m: vid.muted }; };
    const guard = vid => {
      vid.addEventListener('loadeddata', () => apply(vid));
      vid.addEventListener('volumechange', () => {
        if (userRecent()){ const n = now(vid); st.v = n.v; st.m = n.m; return; }   // you changed it in this player
        if (mayUndo()) apply(vid);                                           // something else did: undo
      });
      vid.addEventListener('play', () => { if (userRecent()) st.p = false; else if (st.p && mayUndo()) vid.pause(); });
      vid.addEventListener('pause', () => { if (userRecent()) st.p = true; });
    };
    setInterval(() => document.querySelectorAll('video').forEach(v => {
      if (!seen.has(v)) { seen.add(v); guard(v); apply(v); }
    }), 400);
    window.__kmv = {
      set(v, m) { st.v = v; st.m = m; document.querySelectorAll('video').forEach(apply); },
      get() {
        const v = document.querySelector('video'); if (!v) return null;
        const n = now(v);
        if (userRecent()){ st.v = n.v; st.m = n.m; st.p = v.paused; }   // only adopt your own changes
        return { v: st.v ?? n.v, m: st.m ?? n.m, p: st.p };
      },
      applied() { return applied; },   // the app's volume / mute has reached a player (until then its sound stays off)
      pause() { st.p = true; document.querySelectorAll('video').forEach(v => v.pause()); },
      notYou(ms) { notYou = Date.now() + ms; },   // the app is about to click in the player (Skip YouTube ads)
      thumb(w, h) {
        const v = [...document.querySelectorAll('video')].find(x => x.videoWidth);
        if (!v) return null;
        const c = window.__kmvC || (window.__kmvC = document.createElement('canvas'));
        c.width = w; c.height = h;
        const g = c.getContext('2d'), ar = v.videoWidth / v.videoHeight;
        let dw = w, dh = w / ar; if (dh > h){ dh = h; dw = h * ar; }
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
        try { return c.toDataURL('image/jpeg', 0.6); } catch (e) { return 'blocked'; }
      },
      play() {
        st.p = false;
        document.querySelectorAll('video').forEach(v => {
          // catch up to the newest part it has loaded: a live player's seekable end can be far past it (Twitch's is 2^30 s) and seeking there stalls it
          try { const b = v.buffered; if (b && b.length){ const end = b.end(b.length - 1); if (end - v.currentTime > 8) v.currentTime = end - 2; } } catch (e) {}
          const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
        });
      }
    };
    return true;
  })()`;
}

export { init, VOL_JS };
