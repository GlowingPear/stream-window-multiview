import { infoFor } from '../panels/channels/channels.js';
import { devError } from '../panels/developer/developer.js';
import { chLabel, platform, srcFor } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { winTimer } from '../shared/timers.js';
import { isPaused } from './pause.js';
import { askIn, loadView } from './view.js';

/* ---- A stream whose player is stuck loads its address again ----
   Kick's player ends up on its error page ("This embed seems to be misconfigured") when anything goes wrong
   while showing a channel: a stream that crashed (its offline page throws while the last video has no
   thumbnail yet), one failed check of a live stream, or loading /<name>/offline again. Nothing there tries
   again, and its offline screen never goes back to the player when the channel is live again. So each Kick
   stream's player is looked at now and then (the site's stuckJs):
   - its error page: the channel's address is loaded again, after 10 s, 30 s, then every minute
   - its offline screen: once a minute, is the channel live (saved channels: the live checks; others: asked)?
     Then its address is loaded again, straight away
   - its video stopped (its time hasn't moved for two looks, ~10 s, while playing: a part that never came, not a
     short wait for one): it moves on to the newest part it has, keeping a few seconds of it (moving to its very
     end left nothing to play, so it stopped again at once). If it stays stopped, or stops again within a minute,
     its address is loaded again
   A stream you paused is left as it is. The waits start again from 10 s once a load has worked for a minute
   (the player shows itself before it fails, so that isn't the first look after a load). What it does about a
   stopped video goes in the error log (Settings › Developer), so a report shows how often streams froze. */
const stuckTimes = { look: 3000, ok: 5000, offline: 60000, retry: [10000, 30000, 60000], calm: 60000, stalled: 2 };
// The video's time while it plays (null: none, paused or ended), and moving it on to the newest part it has (init())
let VIDEO_JS, CATCH_UP_JS;

// The player has (re)loaded or moved: look at it shortly
function watchStuck(w){
  if (!DESKTOP || w.kind !== 'stream' || !w.channel || !platform(w.channel).stuckJs) return;
  w.stall = null;
  winTimer(w, 'stuck', () => lookStuck(w), stuckTimes.look);
}
async function lookStuck(w){
  const view = w.view, js = platform(w.channel).stuckJs;
  if (!view || !w.ready) return;
  const st = await askIn(view, js).catch(() => null);
  if (w.view !== view) return;                                   // closed or loaded anew meanwhile (that watches again)
  const again = (ms, fn = () => lookStuck(w)) => winTimer(w, 'stuck', fn, ms);
  if (st === 'error'){
    const n = w.stuckTries || 0;
    again(stuckTimes.retry[Math.min(n, stuckTimes.retry.length - 1)], () => retryStuck(w, view));
    return;
  }
  if (Date.now() - (w.stuckAt || 0) >= stuckTimes.calm) w.stuckTries = 0;
  if (st !== 'offline'){ await lookStalled(w, view); return; }
  if (!isPaused(w) && await liveAgain(w.channel) && w.view === view){ loadView(view, srcFor(w)); return; }
  again(stuckTimes.offline);
}
// Playing, but its video's time hasn't moved for a few looks: move it on (once a minute at most), else load it again
async function lookStalled(w, view){
  const t = isPaused(w) ? null : await askIn(view, VIDEO_JS).catch(() => null);
  if (w.view !== view) return;
  const was = w.stall, movedOn = was && Date.now() - was.movedAt < stuckTimes.calm ? was.movedAt : 0;
  w.stall = typeof t === 'number' ? { t, looks: was && was.t === t ? was.looks + 1 : 0, movedAt: movedOn } : null;
  if (w.stall && w.stall.looks >= stuckTimes.stalled){
    if (movedOn){
      w.stall = null;
      devError('stream', chLabel(w.channel), 'its video stayed stopped: loaded it again');
      loadView(view, srcFor(w));
      return;
    }
    const now = await askIn(view, CATCH_UP_JS).catch(() => null);
    if (w.view !== view) return;
    w.stall = { t: typeof now === 'number' ? now : t, looks: 0, movedAt: Date.now() };
    devError('stream', chLabel(w.channel), now !== t ? 'its video stopped: moved it on to the newest part'
                                                     : 'its video stopped: started it again');
  }
  winTimer(w, 'stuck', () => lookStuck(w), stuckTimes.ok);
}
// Still on its error page: load its address again (not while you've paused it)
async function retryStuck(w, view){
  if (w.view !== view) return;
  const st = await askIn(view, platform(w.channel).stuckJs).catch(() => null);
  if (w.view !== view) return;
  if (st !== 'error'){ lookStuck(w); return; }
  if (isPaused(w)){ winTimer(w, 'stuck', () => retryStuck(w, view), stuckTimes.offline); return; }
  w.stuckTries = (w.stuckTries || 0) + 1; w.stuckAt = Date.now();
  loadView(view, srcFor(w));
}
// Is the channel live? The live checks know for saved channels; others are asked about (null: couldn't tell)
async function liveAgain(ch){
  const i = infoFor(ch);
  if (i && i.live) return true;
  if (!window.kmv || !window.kmv.liveOne) return false;
  const r = await window.kmv.liveOne(ch).catch(() => null);
  return !!(r && r.live);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.stuckTimes = stuckTimes;   // for the tests
  VIDEO_JS = `(() => { const v = document.querySelector('video');
    return v && !v.paused && !v.ended ? v.currentTime : null; })()`;
  CATCH_UP_JS = `(() => { const v = document.querySelector('video'); if (!v) return null;
    try { const b = v.buffered; if (b.length){ const end = b.end(b.length - 1); if (end - v.currentTime > 4) v.currentTime = end - 3; } } catch (e) {}
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    return v.currentTime; })()`;
}

export { init, watchStuck };
