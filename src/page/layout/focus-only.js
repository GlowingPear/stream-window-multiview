import '../platforms/youtube-options.js';   // runs after it (see app.js)
import { wins } from '../core.js';
import { icon } from '../shared/icons.js';
import { featBase, featSwitch, featuredCh, vidByKey } from './layouts.js';
import { applyPlay, isPaused, miniPaused } from '../windows/pause.js';

/* Pause all except focus (button at the top of the Focus area) */
let focusOnly = false;
try { focusOnly = localStorage.getItem('kickMultiview.focusOnly') === '1'; } catch {}
function applyFocusOnly(){
  const featOn = featBase.length > 0 && !!featuredCh;
  wins.forEach(w => {
    if (w.kind !== 'stream') return;
    const should = focusOnly && featOn && w.channel !== featuredCh && !w.focusExempt;
    if (should !== !!w.pausedByFocus){ w.pausedByFocus = should; applyPlay(w); }
    if (w.channel === featuredCh) w.focusExempt = false;
  });
  syncSwitcher(); updateFocusOnlyBtn();
}
function updateFocusOnlyBtn(){
  const b = featSwitch.querySelector('.fs-only'); if (!b) return;
  b.classList.toggle('on', focusOnly);
  b.innerHTML = focusOnly ? `${icon.play}<span>Resume others</span>` : `${icon.pause}<span>Pause all except focus</span>`;
  b.title = focusOnly ? 'Resume the streams this paused' : 'Pause every stream except the big one (and their previews) to save bandwidth';
}
function toggleFocusOnly(){
  focusOnly = !focusOnly;
  try { localStorage.setItem('kickMultiview.focusOnly', focusOnly ? '1' : '0'); } catch {}
  wins.forEach(w => { w.focusExempt = false; });
  applyFocusOnly();
}
// Update the switcher's volume controls in place (never rebuild while you're dragging a slider).
function syncSwitcher(){
  if (featSwitch.style.display !== 'grid') return;
  featSwitch.querySelectorAll('.fs-item').forEach(it => {
    const s = vidByKey(it.dataset.ch);
    if (s && s.kind === 'capture'){
      const pl = it.querySelector('.fs-play');
      pl.innerHTML = s.capPaused ? icon.play : icon.pause; pl.classList.toggle('paused', !!s.capPaused);
      it.classList.toggle('paused', !!s.capPaused); return;
    }
    const mute = it.querySelector('.fs-mute'); if (!s || !mute) return;
    const pct = Math.round(s.vol * 100), off = s.muted || pct === 0;
    const slider = it.querySelector('input');
    if (!s.adjusting) slider.value = pct;
    it.querySelector('.fs-pct').textContent = off ? 'off' : pct + '%';
    mute.innerHTML = off ? icon.volOff : icon.volOn;
    mute.classList.toggle('muted', off);
    it.classList.toggle('muted', off);
    const pl = it.querySelector('.fs-play');
    const ps = isPaused(s);
    pl.innerHTML = ps ? icon.play : icon.pause;
    pl.title = !ps ? 'Pause' : s.paused ? 'Play (jumps back to live)'
      : s.pausedByFocus ? 'Paused by "Pause all except focus". Click to play it anyway'
      : 'Auto-paused while hidden. Click to play it anyway';
    pl.classList.toggle('paused', ps);
    it.classList.toggle('paused', ps);
    it.classList.toggle('autopaused', ps && !s.paused && !s.pausedByFocus);
    if (s.mini) s.mini.wrap.classList.toggle('paused', miniPaused(s));
  });
}

export { applyFocusOnly, focusOnly, syncSwitcher, toggleFocusOnly, updateFocusOnlyBtn };
