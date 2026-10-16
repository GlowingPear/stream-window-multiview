import '../layout/switch-control.js';   // runs after it (see app.js)
import { settings } from '../shared/settings.js';
import { $, GAP, colsMode, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { VOL_JS } from '../in-site/volume.js';
import { SH, SW } from '../layout/geometry.js';
import { featW } from '../layout/layouts.js';
import { syncSwitcher } from '../layout/focus-only.js';

/* A stream can be paused for three separate reasons: you paused it, "Pause all except focus",
   or auto-pause while hidden. Each option only ever undoes its own pauses. */
const isPaused = w => !!(w.paused || w.pausedByFocus || w.autoPaused);
const miniPaused = w => !!(w.paused || w.pausedByFocus);          // mini previews keep playing while their stream is hidden
function applyPlay(w){
  const want = isPaused(w);
  if (w.ready && w.sentPause !== want){
    w.sentPause = want;
    w.view.executeJavaScript(`${VOL_JS};window.__kmv.${want ? 'pause' : 'play'}()`).catch(() => {});
  }
  const mw = miniPaused(w);
  if (w.mini && w.mini.ready && w.mini.sentPause !== mw){
    w.mini.sentPause = mw;
    w.mini.wv.executeJavaScript(`window.__kmv && window.__kmv.${mw ? 'pause' : 'play'}()`).catch(() => {});
  }
}
function togglePause(s){
  if (isPaused(s)){            // you want it playing: clear every reason, and keep the options from re-pausing it
    s.paused = s.pausedByFocus = s.autoPaused = false;
    s.focusExempt = true; s.noAuto = true;
  } else s.paused = true;
  applyPlay(s); syncSwitcher();
}

/* Auto-pause hidden streams (toolbar checkbox) */
const autoChk = $('#autoPause');
autoChk.checked = settings.flag('autoPause');
autoChk.addEventListener('change', () => {
  settings.set('autoPause', autoChk.checked);
  autoPauseTick();
});
settings.onChange('autoPause', (_, v) => {          // keep the main and streams windows in step
  autoChk.checked = v === '1'; autoPauseTick();
});
function streamHidden(w){
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
      w.hiddenSince = 0; w.noAuto = false;
      if (w.autoPaused){ w.autoPaused = false; applyPlay(w); syncSwitcher(); }
      return;
    }
    if (!w.hiddenSince) w.hiddenSince = now;
    if (!w.autoPaused && !w.noAuto && now - w.hiddenSince >= 2000){ w.autoPaused = true; applyPlay(w); syncSwitcher(); }
  });
}
if (DESKTOP) setInterval(autoPauseTick, 400);

export { applyPlay, isPaused, miniPaused, togglePause };
