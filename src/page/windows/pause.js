import { $, GAP, colsMode, wins } from '../core.js';
import { VOL_JS } from '../in-site/volume.js';
import { syncSwitcher } from '../layout/focus-only.js';
import { SH, SW } from '../layout/geometry.js';
import { featW } from '../layout/layouts.js';
import { DESKTOP } from '../shared/env.js';
import { settings } from '../shared/settings.js';
import { isPausedBy, miniPausedBy, pauseEvents } from './pause-state.js';
import { runIn } from './view.js';

/* A stream can be paused for three separate reasons: you paused it, "Pause all except focus",
   or auto-pause while hidden (w.pause, see pause-state.js). This sends it to the player. */
const isPaused = w => isPausedBy(w.pause);
const miniPaused = w => miniPausedBy(w.pause);          // mini previews keep playing while their stream is hidden
function applyPlay(w){
  const want = isPaused(w);
  if (w.ready && w.sentPause !== want){
    w.sentPause = want;
    runIn(w.view, `${VOL_JS};window.__kmv.${want ? 'pause' : 'play'}()`);
  }
  const mw = miniPaused(w);
  if (w.mini && w.mini.ready && w.mini.sentPause !== mw){
    w.mini.sentPause = mw;
    runIn(w.mini.wv, `window.__kmv && window.__kmv.${mw ? 'pause' : 'play'}()`);
  }
}
function togglePause(s){
  s.pause = isPaused(s) ? pauseEvents.youPlay(s.pause) : pauseEvents.youPause(s.pause);
  applyPlay(s); syncSwitcher();
}

let autoChk;
function streamHidden(w){
  if (w.hiddenTab) return true;                                  // a tab you're not watching (windows/frames.js)
  const W = SW(), H = SH();
  if (w.x + w.w <= 4 || w.x >= W - 4 || w.y + w.h <= 4 || w.y >= H - 4) return true;              // off-screen
  if (colsMode && featW && !w.el.classList.contains('featured') && w.x + w.w <= featW + GAP) return true;   // behind the big stream
  return false;
}
function autoPauseTick(){
  const now = Date.now();
  wins.forEach(w => {
    if (w.kind !== 'stream') return;
    const audible = !w.muted && w.vol > 0.001;
    const hidden = autoChk.checked && !audible && streamHidden(w);
    if (!hidden){
      w.hiddenSince = 0;
      const was = w.pause.auto;
      w.pause = pauseEvents.shown(w.pause);
      if (was){ applyPlay(w); syncSwitcher(); }
      return;
    }
    if (!w.hiddenSince) w.hiddenSince = now;
    if (now - w.hiddenSince < 2000) return;
    const next = pauseEvents.hiddenLong(w.pause);
    if (next !== w.pause){ w.pause = next; applyPlay(w); syncSwitcher(); }
  });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* Auto-pause hidden streams (toolbar checkbox) */
  autoChk = $('#autoPause');
  autoChk.checked = settings.flag('autoPause');
  autoChk.addEventListener('change', () => {
    settings.set('autoPause', autoChk.checked);
    autoPauseTick();
  });
  settings.onChange('autoPause', (_, v) => {          // keep the main and streams windows in step
    autoChk.checked = v === '1'; autoPauseTick();
  });
  if (DESKTOP) setInterval(autoPauseTick, 400);
}

export { applyPlay, init, isPaused, miniPaused, togglePause };
