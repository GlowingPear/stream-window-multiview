import { ROLE, wins } from '../core.js';
import { featBase, featSwitch, featuredCh, vidByKey } from './layouts.js';
import { commands } from '../shared/commands.js';
import { icon } from '../shared/icons.js';
import { settings } from '../shared/settings.js';
import { pauseEvents, pauseWhy } from '../windows/pause-state.js';
import { applyPlay, isPaused, miniPaused } from '../windows/pause.js';

/* Pause all except focus (button at the top of the Focus area) */
let focusOnly = false;
function applyFocusOnly(){
  const featOn = featBase.length > 0 && !!featuredCh;
  wins.forEach(w => {
    if (w.kind !== 'stream') return;
    const should = focusOnly && featOn && w.channel !== featuredCh && !w.pause.focusExempt;
    const next = pauseEvents.focusPause(w.pause, should);
    if (next !== w.pause){ w.pause = next; applyPlay(w); }
    if (w.channel === featuredCh) w.pause = pauseEvents.focusReset(w.pause);
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
  settings.set('focusOnly', focusOnly);
  wins.forEach(w => { w.pause = pauseEvents.focusReset(w.pause); });
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
    pl.title = !ps ? 'Pause' : s.pause.you ? 'Play (jumps back to live)'
      : s.pause.focus ? 'Paused by "Pause all except focus". Click to play it anyway'
      : 'Auto-paused while hidden. Click to play it anyway';
    pl.classList.toggle('paused', ps);
    it.classList.toggle('paused', ps);
    it.classList.toggle('autopaused', pauseWhy(s.pause) === 'auto');
    if (s.mini) s.mini.wrap.classList.toggle('paused', miniPaused(s));
  });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  focusOnly = settings.flag('focusOnly');
  commands.add({ id: 'layout.focusOnly', group: 'Layout options', title: 'Pause all except focus', sub: 'Every stream except the big one pauses, to save bandwidth (Focus view)', words: ['bandwidth', 'pause others'],
    icon: 'pause', when: () => ROLE === 'main', toggle: { get: () => focusOnly, set: () => toggleFocusOnly() } });
}

export { applyFocusOnly, focusOnly, init, syncSwitcher, toggleFocusOnly, updateFocusOnlyBtn };
