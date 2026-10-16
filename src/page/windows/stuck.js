import { infoFor } from '../panels/channels/channels.js';
import { platform, srcFor } from '../platforms/platforms.js';
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
   A stream you paused is left as it is. The waits start again from 10 s once a load has worked for a minute
   (the player shows itself before it fails, so that isn't the first look after a load). */
const stuckTimes = { look: 3000, ok: 30000, offline: 60000, retry: [10000, 30000, 60000], calm: 60000 };

// The player has (re)loaded or moved: look at it shortly
function watchStuck(w){
  if (!DESKTOP || w.kind !== 'stream' || !w.channel || !platform(w.channel).stuckJs) return;
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
  if (st !== 'offline'){ again(stuckTimes.ok); return; }
  if (!isPaused(w) && await liveAgain(w.channel) && w.view === view){ loadView(view, srcFor(w)); return; }
  again(stuckTimes.offline);
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
}

export { init, watchStuck };
