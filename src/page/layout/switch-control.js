import { blowOn, toggleBlowMode } from '../chat/blow-up.js';
import { newFor } from '../chat/new-messages.js';
import { ROLE, colsMode, lastLayout, shownWins } from '../core.js';
import { VOL_JS } from '../in-site/volume.js';
import { backToChatFocus } from './chat-focus.js';
import { isRail, showRailChat } from './chat-rail.js';
import { isStage, putOnStage } from './chat-stage.js';
import { updateSwBtn } from './column-drag.js';
import { buildCols, columnsLayout, sideCols } from './columns.js';
import { focusOnly, syncSwitcher, toggleFocusOnly } from './focus-only.js';
import { SH, SW } from './geometry.js';
import { colKey, featSwitch, featuredCh, fsResize, isVid, layoutVars, mkDiv, setFeatured, switchMode, switchRect,
  toggleFeatured, vidByKey } from './layouts.js';
import { fsMute, isFocusView, removeChannel, renderSwitcher, setSideCols, swapStreams, toggleCapPause } from './switcher.js';
import { refreshFromSwitcher } from './undo.js';
import { save } from '../persistence.js';
import { chLabel, platOf, streamSrc, trimPlayerPage, ytVidOf } from '../platforms/platforms.js';
import { youtube } from '../platforms/youtube.js';
import { commands } from '../shared/commands.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { pauseWhy } from '../windows/pause-state.js';
import { isPaused, miniPaused, togglePause } from '../windows/pause.js';
import { hiddenStreams, popOutHidden } from '../windows/popout.js';
import { runIn } from '../windows/view.js';
import { pushVol, saveSoon } from '../windows/windows.js';

/* ---- the switch control floating in the window / in its own window ---- */
function setSwitchMode(m){
  if (ROLE !== 'main') return;
  if (m === 'window' && !DESKTOP) m = 'float';
  const was = switchMode;
  layoutVars.switchMode = m;
  settings.set('switchMode', m);
  if (was === 'window' && m !== 'window') window.kmv.closeSwitcher();
  featSwitch.classList.toggle('floating', m === 'float');
  if (m !== 'float') fsResize.style.display = 'none';
  if (m === 'window'){ swLastSig = ''; window.kmv.openSwitcher(); pushSwitcherState(true); }
  if (colsMode) columnsLayout(); else { featSwitch.style.display = 'none'; placeSwitcher(); placeMinis(); }
  if (m === 'dock' && was !== 'dock' && !isFocusView()) flash('Switch control put away. It shows under the big stream in Focus view.');
  updateSwBtn();
}
function clampSwitchRect(){
  const W = SW(), H = SH();
  const r = switchRect;
  r.w = Math.max(340, Math.min(W - 8, r.w || 680)); r.h = Math.max(140, Math.min(H - 8, r.h || 380));
  if (r.x == null || r.y == null){ r.x = W - r.w - 16; r.y = H - r.h - 16; }
  r.x = Math.max(4 - r.w + 120, Math.min(W - 120, r.x)); r.y = Math.max(0, Math.min(H - 40, r.y));
}
function saveSwitchRect(){ settings.set('switchRect', switchRect); }
function placeSwitcher(){
  if (ROLE !== 'main' || switchMode === 'dock') return;
  if (switchMode === 'window'){
    featSwitch.style.display = 'none'; featSwitch.classList.remove('floating'); fsResize.style.display = 'none';
    placeMinis(); pushSwitcherState();
    return;
  }
  if (!shownWins().some(w => w.kind === 'stream')){
    featSwitch.style.display = 'none'; fsResize.style.display = 'none'; placeMinis(); return;
  }
  clampSwitchRect();
  const r = switchRect;
  featSwitch.classList.add('floating');
  Object.assign(featSwitch.style, { display: 'grid', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  Object.assign(fsResize.style, { display: 'block', left: (r.x + r.w - 16) + 'px', top: (r.y + r.h - 16) + 'px' });
  const keep = featSwitch.scrollTop;
  renderSwitcher();
  featSwitch.scrollTop = keep; placeMinis();
}
// Drag the floating switch control by its top bar.
function fsMoveStart(e){
  if (e.button !== 0 || e.target.closest('button, select, label, input')) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, x0 = switchRect.x, y0 = switchRect.y;
  document.body.classList.add('fs-moving');
  const move = ev => {
    switchRect.x = x0 + ev.clientX - sx; switchRect.y = y0 + ev.clientY - sy;
    clampSwitchRect();
    featSwitch.style.left = switchRect.x + 'px'; featSwitch.style.top = switchRect.y + 'px';
    fsResize.style.left = (switchRect.x + switchRect.w - 16) + 'px'; fsResize.style.top = (switchRect.y + switchRect.h - 16) + 'px';
    placeMinis();
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    document.body.classList.remove('fs-moving'); saveSwitchRect();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
// Own window: this window stays in charge; the switcher window shows its state and sends clicks back.
let swLastSig = '', swCss = null;
// Other files change these through switchVars: a variable imported from another file can't be assigned to.
const switchVars = {
  get swCss(){ return swCss; }, set swCss(v){ swCss = v; },
  get swLastSig(){ return swLastSig; }, set swLastSig(v){ swLastSig = v; },
};
function switcherCore(){
  const featOn = isFocusView();
  return {
    featOn, sideCols, focusOnly, blowOn, chatFocus: !colsMode && lastLayout === 'chatfocus', plainCols: colsMode && !featOn,
    hidden: featOn ? hiddenStreams().length : 0,
    items: buildCols().filter(c => isVid(c.top)).map(c => {
      const s = c.top;
      if (s.kind === 'capture') return { ch: colKey(s), cap: true, label: s.capName || 'Window', plat: 'capture', vol: 0, muted: true,
        paused: !!s.capPaused, why: s.capPaused ? 'you' : '', on: featOn && colKey(s) === featuredCh, preview: false, mini: null, miniPaused: false };
      return { ch: s.channel, label: chLabel(s.channel), plat: platOf(s.channel), vol: s.vol, muted: !!s.muted,
        paused: isPaused(s), why: pauseWhy(s.pause),
        on: featOn && s.channel === featuredCh, preview: !!s.preview,
        mini: s.preview ? streamSrc(s.channel, true, ytVidOf(s)) : null, miniPaused: miniPaused(s), n: newFor(s.channel) };
    })
  };
}
function pushSwitcherState(force){
  if (switchMode !== 'window' || !DESKTOP || ROLE !== 'main' || !window.kmv.sendSwitcherState) return;
  const core = switcherCore(), sig = JSON.stringify(core);
  if (!force && sig === swLastSig) return;
  swLastSig = sig;
  if (!swCss) swCss = {   // this window's look: its CSS files (the switcher loads them too, from the same folder) and <style> text
    files: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')),
    text: [...document.querySelectorAll('style')].map(x => x.textContent).join('\n')
  };
  window.kmv.sendSwitcherState({ ...core, css: swCss, icons: icon, scripts: { vol: VOL_JS, ytcss: youtube.playerCss, ytfit: youtube.playerFitJs } });
}
let miniClip;
let fsScrolledAt = 0;
// Layout menu > Focus view: the current big stream (or the first one) goes big.
function openFocusView(){
  const streams = buildCols().filter(c => isVid(c.top)).map(c => c.key);
  if (!streams.length){ flash('Open a stream first: Focus view makes one of them big.'); store.changed('layout'); return; }
  setFeatured(streams.includes(featuredCh) ? featuredCh : streams[0]);
  layoutVars.scrollX = 0; columnsLayout();
}
function focusChannel(ch){ if (isStage()) putOnStage(ch); else if (isRail()) showRailChat(ch); else if (ch === featuredCh) toggleFeatured(ch); else { setFeatured(ch); columnsLayout(); } }
function ensureMini(s){
  if (s.mini) return s.mini;
  const miniSrc = streamSrc(s.channel, true, ytVidOf(s));
  if (!miniSrc) return null;                              // YouTube channel that isn't live yet
  const wrap = document.createElement('div'); wrap.className = 'fs-miniwrap';
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:kmv-mini');      // separate from the real players (can't touch their volume)
  const cover = document.createElement('div'); cover.className = 'fs-cover';
  cover.title = `Put ${chLabel(s.channel)} in the big spot`;
  cover.innerHTML = `<span class="fs-paused">${icon.pause}</span>`;
  cover.onclick = () => focusChannel(s.channel);
  cover.addEventListener('wheel', e => { e.preventDefault(); featSwitch.scrollTop += e.deltaY; }, { passive: false });
  wrap.append(wv, cover);
  miniClip.appendChild(wrap);
  wv.src = miniSrc;
  wv.addEventListener('dom-ready', () => {
    trimPlayerPage(wv, s.channel);
    if (s.mini){ s.mini.ready = true; s.mini.sentPause = miniPaused(s); }
    runIn(wv, `${VOL_JS};window.__kmv.set(0,true);${miniPaused(s) ? 'window.__kmv.pause();' : ''}`);
  });
  s.mini = { wrap, wv };
  return s.mini;
}
function dropMini(s){ if (s && s.mini){ s.mini.wrap.remove(); s.mini = null; } }
function placeMinis(){
  if (!DESKTOP) return;
  const show = featSwitch.style.display === 'grid';
  shownWins().forEach(o => { if (o.kind === 'stream' && (!show || !o.preview)) dropMini(o); });
  if (!show){ miniClip.style.display = 'none'; return; }
  const headH = featSwitch.classList.contains('floating') ? (featSwitch.querySelector('.fs-head')?.offsetHeight || 0) - 2 : 0;   // floating: the top bar stays put over the list
  Object.assign(miniClip.style, {
    display: 'block', left: (featSwitch.offsetLeft + 1) + 'px', top: (featSwitch.offsetTop + 1 + headH) + 'px',
    width: featSwitch.clientWidth + 'px', height: Math.max(0, featSwitch.clientHeight - headH) + 'px'
  });
  const base = miniClip.getBoundingClientRect();
  featSwitch.querySelectorAll('.fs-item.pv').forEach(it => {
    const o = vidByKey(it.dataset.ch); if (!o || o.kind !== 'stream') return;
    const m = ensureMini(o); if (!m) return;
    const r = it.querySelector('.fs-thumb').getBoundingClientRect();
    Object.assign(m.wrap.style, { left: (r.left - base.left) + 'px', top: (r.top - base.top) + 'px', width: r.width + 'px', height: r.height + 'px' });
    m.wrap.classList.toggle('paused', miniPaused(o));
  });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  commands.fromControls('#featSwitch .fs-head', { group: 'Switch control', words: ['switcher'] });   // (the search box's, while it shows)
  fsResize.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); fsResize.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, w0 = switchRect.w, h0 = switchRect.h;
    let raf = 0;
    document.body.classList.add('dragging');
    const move = ev => {
      switchRect.w = w0 + ev.clientX - sx; switchRect.h = h0 + ev.clientY - sy;
      clampSwitchRect();
      Object.assign(featSwitch.style, { width: switchRect.w + 'px', height: switchRect.h + 'px' });
      Object.assign(fsResize.style, { left: (switchRect.x + switchRect.w - 16) + 'px', top: (switchRect.y + switchRect.h - 16) + 'px' });
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const k = featSwitch.scrollTop; renderSwitcher(); featSwitch.scrollTop = k; });
    };
    const up = () => {
      fsResize.removeEventListener('pointermove', move); fsResize.removeEventListener('pointerup', up); fsResize.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging'); saveSwitchRect();
    };
    fsResize.addEventListener('pointermove', move); fsResize.addEventListener('pointerup', up); fsResize.addEventListener('pointercancel', up);
  });
  window.addEventListener('resize', () => { if (switchMode === 'float') setTimeout(placeSwitcher, 60); });

  if (DESKTOP && ROLE === 'main' && window.kmv.onSwitcherCmd){
    setInterval(() => pushSwitcherState(), 300);
    fromApp('onSwitcherClosed', () => { if (switchMode === 'window') setSwitchMode('dock'); });
    fromApp('onSwitcherCmd', c => {
      const v = c.ch ? vidByKey(c.ch) : null, s = v && v.kind === 'stream' ? v : null;
      switch (c.type){
        case 'focus': if (v) focusChannel(colKey(v)); break;
        case 'play': if (s) togglePause(s); else if (v) toggleCapPause(v); break;
        case 'mute': if (s) fsMute(s, !!c.solo); break;
        case 'vol': if (s){ s.vol = Math.max(0, Math.min(1, +c.v || 0)); s.muted = s.vol === 0; s.adjusting = !c.final; pushVol(s); c.final ? save() : saveSoon(); syncSwitcher(); } break;
        case 'reload': if (v) refreshFromSwitcher(v); break;
        case 'preview': if (s){ s.preview = !s.preview; save(); if (featSwitch.style.display === 'grid') renderSwitcher(); } break;
        case 'remove': if (v) removeChannel(colKey(v)); break;
        case 'swap': if (c.ch && c.to) swapStreams(c.ch, c.to); break;
        case 'side': setSideCols(c.n); break;
        case 'tofocus': openFocusView(); break;
        case 'tocols': setFeatured(null); layoutVars.scrollX = 0; columnsLayout(); break;
        case 'tocf': backToChatFocus(); break;
        case 'pophid': popOutHidden(); break;
        case 'focusonly': toggleFocusOnly(); break;
        case 'blowup': toggleBlowMode(); break;
        case 'dock': setSwitchMode('dock'); break;
        case 'float': setSwitchMode('float'); break;
      }
      swLastSig = ''; pushSwitcherState();
    });
  }
  // Small live previews: a real, always-muted mini player per open preview. They live in their own
  // layer laid over the switcher (never inside it), so re-drawing the switcher never reloads them.
  miniClip = mkDiv('miniClip');
  featSwitch.addEventListener('scroll', () => { fsScrolledAt = performance.now(); placeMinis(); }, { passive: true });
}

export { dropMini, focusChannel, fsMoveStart, fsScrolledAt, init, openFocusView, placeMinis, placeSwitcher,
  pushSwitcherState, setSwitchMode, swCss, switchVars };
