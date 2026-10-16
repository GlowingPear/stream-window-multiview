import { toggleBlowMode, updateBlowBtn } from '../chat/blow-up.js';
import { closeWin } from '../chat/view-menu.js';
import { $, ROLE, colsMode, lastLayout, wins } from '../core.js';
import { backToChatFocus } from './chat-focus.js';
import { buildCols, columnVars, columnsLayout, sideCols } from './columns.js';
import { syncSwitcher, toggleFocusOnly, updateFocusOnlyBtn } from './focus-only.js';
import { gameKey, gameLayout, setGameKey } from './game-focus.js';
import { setRect } from './geometry.js';
import { chatFocusLayout, colKey, colOrder, featBase, featSwitch, featuredCh, isVid, layoutVars, setFeatured,
  toggleFeatured, vidByKey } from './layouts.js';
import { focusChannel, fsMoveStart, fsScrolledAt, openFocusView, placeMinis, setSwitchMode } from './switch-control.js';
import { refreshFromSwitcher } from './undo.js';
import { addNote, noteActs, renderBell } from '../panels/bell/bell.js';
import { save } from '../persistence.js';
import { chLabel, platOf } from '../platforms/platforms.js';
import { DESKTOP, keyName } from '../shared/env.js';
import { icon } from '../shared/icons.js';
import { settings } from '../shared/settings.js';
import { refreshPicks } from '../windows/channel-picker.js';
import { togglePause } from '../windows/pause.js';
import { popOutHidden, updatePopHiddenBtn } from '../windows/popout.js';
import { createWin, pushVol, saveSoon } from '../windows/windows.js';

/* Switcher under the big stream: one item per open stream.
   Click the name to put it in the big spot; play/pause, mute + slider (mouse wheel over them too).
   Shift-click a mute button to hear only that stream. The arrow opens a small live preview. */
/* Remove a channel's stream + chat (switcher ×), with a few seconds to undo. */
/* It's kept under the bell too (App > Windows), where Undo works as long as it still can (ok()). */
let toastT = 0, undoFn = null, undoNote = null;
function toast(text, undo, ok){
  const t = $('#toast');
  t.querySelector('span').textContent = text;
  t.querySelector('button').hidden = !undo;
  undoFn = undo || null;
  t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; undoFn = null; }, 7000);
  const n = addNote({ kind: 'app', subject: 'windows', text, ...(undo ? { act: { t: 'undo' } } : {}) });
  undoNote = n && undo ? n.id : null;
  if (undoNote) noteActs.set(undoNote, { run: undo, ok: ok || (() => true) });
}
function removeChannel(ch){
  const cap = vidByKey(ch);
  if (cap && cap.kind === 'capture'){
    const wasBig = featuredCh === ch && featBase.length > 0;
    closeWin(cap);
    if (wasBig){ const next = buildCols().find(c => isVid(c.top)); setFeatured(next ? next.key : null); }
    if (colsMode) columnsLayout(); else relayout();
    toast(`Removed “${cap.capName}” (${keyName('Ctrl+Z')} brings it back)`);
    return;
  }
  const ws = wins.filter(w => w.channel === ch); if (!ws.length) return;
  const specs = ws.map(w => ({ kind: w.kind, channel: w.channel, muted: w.muted, vol: w.vol, preview: w.preview, rect: { x: w.x, y: w.y, w: w.w, h: w.h } }));
  const order = buildCols().map(c => c.key), idx = order.indexOf(ch);
  const wasBig = featuredCh === ch && featBase.length > 0;
  ws.forEach(closeWin);
  if (wasBig){                           // keep the highlight going with the next stream
    const next = buildCols().find(c => isVid(c.top));
    setFeatured(next ? next.key : null);
  }
  if (colsMode) columnsLayout(); else relayout();
  toast(`Removed ${chLabel(ch)}`, () => {
    if (wins.some(w => w.channel === ch)) return;
    specs.forEach(sp => createWin(sp, sp.rect));
    if (idx >= 0){ layoutVars.colOrder = colOrder.filter(k => k !== ch); colOrder.splice(Math.min(idx, colOrder.length), 0, ch); }
    if (wasBig) setFeatured(ch);
    if (colsMode) columnsLayout(); else if (lastLayout === 'chatfocus') chatFocusLayout();
    save();
  }, () => !wins.some(w => w.channel === ch));
}

/* Drag a switcher button onto another to swap them (also swaps their columns). */
let fsJustDragged = false;
function fsDragStart(e, it){
  if (e.button !== 0 || e.target.closest('.fs-play, .fs-mute, .fs-pv, .fs-rl, .fs-x, input, .fs-volw')) return;
  const sx = e.clientX, sy = e.clientY, ch = it.dataset.ch;
  let dragging = false, target = null;   // (no pointer capture: a plain click must still reach the name button)
  const items = () => [...featSwitch.querySelectorAll('.fs-item')].filter(x => x !== it);
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!dragging){
      if (Math.hypot(dx, dy) < 6) return;
      dragging = true; it.classList.add('fs-dragging'); document.body.classList.add('fs-dragmode');
    }
    // auto-scroll the list near its top/bottom edge
    const fr = featSwitch.getBoundingClientRect();
    if (ev.clientY < fr.top + 28) featSwitch.scrollTop -= 12; else if (ev.clientY > fr.bottom - 28) featSwitch.scrollTop += 12;
    it.style.transform = `translate(${dx}px, ${dy + (featSwitch.scrollTop - st0)}px)`;
    const t = items().find(x => { const r = x.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; }) || null;
    if (t !== target){ target?.classList.remove('fs-drop'); target = t; target?.classList.add('fs-drop'); }
    placeMinis();
  };
  const st0 = featSwitch.scrollTop;
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (!dragging) return;
    fsJustDragged = true; setTimeout(() => { fsJustDragged = false; }, 0);
    it.classList.remove('fs-dragging'); it.style.transform = ''; document.body.classList.remove('fs-dragmode');
    target?.classList.remove('fs-drop');
    if (target){
      const keep = featSwitch.scrollTop;
      swapStreams(ch, target.dataset.ch);
      featSwitch.scrollTop = keep; placeMinis();
    } else placeMinis();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function renderSwitcher(){
  const featOn = isFocusView(), floating = featSwitch.classList.contains('floating');
  const isCF = !colsMode && lastLayout === 'chatfocus';
  featSwitch.innerHTML = `<div class="fs-head"><span class="fs-grip" title="Drag to move">${icon.grip}</span><span class="fs-label">${floating ? 'Switch control' : 'Focus'}</span>` +
    (featOn ? '<label class="fs-side" title="How many stream + chat columns to show beside the big stream. More columns make the big stream smaller."><span>Side chats</span><select>' +
    '<option value="0">Auto</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>' : '') +
    (!featOn && ROLE === 'main' ? `<button class="fs-back fs-tofocus" title="Make one stream big, with its chat beside it">${icon.feat}<span>Focus view</span></button>` : '') +
    (featOn || !colsMode ? `<button class="fs-back fs-tocols" title="Plain Columns (every stream above its chat, no highlight)">${icon.colsview}<span>Columns view</span></button>` : '') +
    (!isCF ? `<button class="fs-back fs-tocf" title="The Chat focus layout (streams down the side, chats filling the rest)">${icon.chatview}<span>Chat focus view</span></button>` : '') +
    (featOn && DESKTOP && ROLE === 'main' ? `<button class="fs-back fs-pophid">${icon.popwin}<span>Pop out hidden</span><em></em></button>` : '') +
    (featOn && DESKTOP ? '<button class="fs-only"></button>' : '') +
    '<button class="fs-blow"></button>' +
    (ROLE === 'main' ? '<span class="fs-modes">' +
      (floating ? `<button class="fs-mbtn fs-mdock" title="Dock: put the switch control back under the big stream in Focus view">${icon.dock}</button>`
                : `<button class="fs-mbtn fs-mfloat" title="Float: pop the switch control out so you can drag it anywhere in this window (works in every layout)">${icon.float}</button>`) +
      (DESKTOP ? `<button class="fs-mbtn fs-mwin" title="Own window: move the switch control into its own window (drag it anywhere, even another monitor)">${icon.popwin}</button>` : '') +
      '</span>' : '') +
    '</div>';
  const ph = featSwitch.querySelector('.fs-pophid'); if (ph){ ph.onclick = popOutHidden; updatePopHiddenBtn(); }
  const tf = featSwitch.querySelector('.fs-tofocus'); if (tf) tf.onclick = openFocusView;
  const tcf = featSwitch.querySelector('.fs-tocf'); if (tcf) tcf.onclick = backToChatFocus;
  const tco = featSwitch.querySelector('.fs-tocols'); if (tco) tco.onclick = () => { setFeatured(null); layoutVars.scrollX = 0; columnsLayout(); };
  const md = featSwitch.querySelector('.fs-mdock'); if (md) md.onclick = () => setSwitchMode('dock');
  const mf = featSwitch.querySelector('.fs-mfloat'); if (mf) mf.onclick = () => setSwitchMode('float');
  const mw = featSwitch.querySelector('.fs-mwin'); if (mw) mw.onclick = () => setSwitchMode('window');
  const fo = featSwitch.querySelector('.fs-only'); if (fo){ fo.onclick = toggleFocusOnly; updateFocusOnlyBtn(); }
  const fb = featSwitch.querySelector('.fs-blow'); if (fb){ fb.onclick = toggleBlowMode; updateBlowBtn(); }
  const sc = featSwitch.querySelector('.fs-side select');
  if (sc){
    sc.value = String(sideCols);
    sc.onchange = () => setSideCols(+sc.value);
  }
  if (floating) featSwitch.querySelector('.fs-head').addEventListener('pointerdown', fsMoveStart);
  // exact, equal card sizes (room kept for the scrollbar) so rows always fit their previews
  const inner = featSwitch.clientWidth - 16 - 10;
  const cols = Math.max(1, Math.floor((inner + 6) / (320 + 6)));
  const itemW = Math.floor((inner - 6 * (cols - 1)) / cols);
  featSwitch.style.gridTemplateColumns = `repeat(${cols}, ${itemW}px)`;
  const thumbH = Math.round(itemW * 9 / 16);
  buildCols().filter(c => isVid(c.top)).forEach(c => {
    const s = c.top, it = document.createElement('div');
    if (s.kind === 'capture'){ featSwitch.appendChild(captureItem(s)); return; }
    it.className = 'fs-item' + (s.channel === featuredCh ? ' on' : '') + (s.preview ? ' pv' : '');
    it.dataset.ch = s.channel;
    it.innerHTML =
      `<div class="fs-row">` +
      (DESKTOP ? `<button class="fs-play" title="Pause / play"></button>` : '') +
      `<button class="fs-name"><i class="dot"></i><span></span></button>` +
      (DESKTOP ? `<span class="fs-volw"><button class="fs-mute" title="Mute / unmute (Shift-click: hear only this one)"></button><input type="range" min="0" max="100" step="1" aria-label="Volume"><span class="fs-pct"></span></span>` : '') +
      `<button class="fs-rl" title="Refresh ${chLabel(s.channel)}">${icon.reload}</button>` +
      (DESKTOP ? `<button class="fs-pv" title="${s.preview ? 'Hide' : 'Show'} small live preview">${s.preview ? icon.chevUp : icon.chevDown}</button>` : '') +
      `<button class="fs-x" title="Remove ${chLabel(s.channel)} (stream and chat)">${icon.close}</button>` +
      `</div>` +
      (s.preview ? `<div class="fs-thumb" style="height:${thumbH}px"><span class="fs-nopv">Loading preview…</span></div>` : '');
    it.querySelector('.fs-name span').textContent = chLabel(s.channel);
    it.classList.add('plat-' + platOf(s.channel));
    const focusIt = () => { if (s.channel === featuredCh) toggleFeatured(s.channel); else { setFeatured(s.channel); columnsLayout(); } };
    it.querySelector('.fs-x').onclick = e => { e.stopPropagation(); removeChannel(s.channel); };
    it.querySelector('.fs-rl').onclick = e => { e.stopPropagation(); refreshFromSwitcher(s, e.currentTarget); };
    const nameBtn = it.querySelector('.fs-name');
    nameBtn.title = s.channel === featuredCh ? 'In focus. Click to put it back in its column' : `Put ${chLabel(s.channel)} in the big spot`;
    nameBtn.onclick = () => { if (fsJustDragged) return; focusIt(); };
    it.addEventListener('pointerdown', e => fsDragStart(e, it));

    if (DESKTOP){
      const mute = it.querySelector('.fs-mute'), slider = it.querySelector('input');
      it.querySelector('.fs-play').onclick = () => togglePause(s);
      it.querySelector('.fs-pv').onclick = () => { s.preview = !s.preview; save(); renderSwitcher(); };

      mute.onclick = e => fsMute(s, e.shiftKey);
      slider.addEventListener('pointerdown', () => { s.adjusting = true; });
      slider.addEventListener('input', () => { s.vol = slider.value / 100; s.muted = s.vol === 0; pushVol(s); });
      slider.addEventListener('change', () => { s.adjusting = false; save(); });
      // wheel over the volume controls changes volume; anywhere else it scrolls the list
      it.querySelector('.fs-volw').addEventListener('wheel', e => {
        if (performance.now() - fsScrolledAt < 450) return;   // mid list-scroll: keep scrolling, don't grab volume
        e.preventDefault(); e.stopPropagation();
        s.vol = Math.min(1, Math.max(0, Math.round((s.vol + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
        s.muted = s.vol === 0;
        pushVol(s); saveSoon();
      }, { passive: false });
    }
    featSwitch.appendChild(it);
  });
  if (!featSwitch.querySelector('.fs-item')) featSwitch.insertAdjacentHTML('beforeend', '<div class="fs-empty">No streams open in this window.</div>');
  syncSwitcher();
  placeMinis();
}
// A switch control entry for another app's window: pause (freeze the picture), name, refresh, ×.
function captureItem(s){
  const key = colKey(s), it = document.createElement('div');
  it.className = 'fs-item cap' + (key === featuredCh && isFocusView() ? ' on' : '');
  it.dataset.ch = key;
  it.innerHTML = `<div class="fs-row"><button class="fs-play" title="Pause / play the picture"></button>` +
    `<button class="fs-name"><i class="dot"></i><span></span><em class="fs-kind">window</em></button>` +
    `<button class="fs-rl" title="Reconnect to this window">${icon.reload}</button>` +
    `<button class="fs-x" title="Close this window">${icon.close}</button></div>`;
  it.querySelector('.fs-name span').textContent = s.capName || 'Window';
  const nameBtn = it.querySelector('.fs-name');
  nameBtn.title = key === featuredCh && isFocusView() ? 'In focus. Click to put it back in its column' : `Make “${s.capName}” the big one`;
  nameBtn.onclick = () => { if (fsJustDragged) return; focusChannel(key); };
  it.querySelector('.fs-play').onclick = () => toggleCapPause(s);
  it.querySelector('.fs-rl').onclick = e => { e.stopPropagation(); refreshFromSwitcher(s, e.currentTarget); };
  it.querySelector('.fs-x').onclick = e => { e.stopPropagation(); removeChannel(key); };
  it.addEventListener('pointerdown', e => fsDragStart(e, it));
  return it;
}
function toggleCapPause(s){
  s.capPaused = !s.capPaused;
  if (s.capStream) s.capStream.getVideoTracks().forEach(t => { t.enabled = !s.capPaused; });
  syncSwitcher();
}
const isFocusView = () => colsMode && featBase.length > 0 && !!featuredCh;
// Re-run whatever layout is showing (outside Columns).
function relayout(){
  if (colsMode) columnsLayout();
  else if (lastLayout === 'chatfocus') chatFocusLayout();
  else if (lastLayout === 'game') gameLayout();
}
function fsMute(s, solo){
  if (solo){   // hear only this one
    wins.filter(o => o.kind === 'stream').forEach(o => { o.muted = o !== s; if (o === s && o.vol < 0.02) o.vol = 0.5; pushVol(o); });
  } else {
    s.muted = !s.muted;
    if (!s.muted && s.vol < 0.02) s.vol = 0.5;
    pushVol(s);
  }
  save(); syncSwitcher();
}
function setSideCols(n){
  columnVars.sideCols = Math.max(0, Math.min(5, +n || 0));
  settings.set('sideCols', sideCols);
  layoutVars.scrollX = 0; columnsLayout();
}
// Swap two streams' places (and their chats) from the switch control, in any layout.
function swapStreams(a, b){
  if (a === b) return;
  if (colsMode){
    const order = buildCols().map(c => c.key), i = order.indexOf(a), j = order.indexOf(b);
    if (i >= 0 && j >= 0){ [order[i], order[j]] = [order[j], order[i]]; layoutVars.colOrder = order; }
    columnsLayout();
  } else if (lastLayout === 'chatfocus'){
    const order = buildCols().map(c => c.key), i = order.indexOf(a), j = order.indexOf(b);
    if (i >= 0 && j >= 0){ [order[i], order[j]] = [order[j], order[i]]; layoutVars.colOrder = order; }
    settings.set('colOrder', colOrder);
    chatFocusLayout();
  } else {
    const wa = vidByKey(a), wb = vidByKey(b);
    if (!wa || !wb) return;
    swapRects(wa, wb);
    if (lastLayout === 'game'){                // whichever moved into the game area is now the game
      if (gameKey === a) setGameKey(b); else if (gameKey === b) setGameKey(a);
      gameLayout(); return;
    }
    const ca = wins.find(x => x.kind === 'chat' && x.channel === a), cb = wins.find(x => x.kind === 'chat' && x.channel === b);
    if (ca && cb) swapRects(ca, cb);                // free layouts: chats swap too
    save(); refreshPicks();
  }
}
function swapRects(p, q){
  const rp = { x: p.x, y: p.y, w: p.w, h: p.h }, rq = { x: q.x, y: q.y, w: q.w, h: q.h };
  setRect(p, rq, true); setRect(q, rp, true);
  const i = wins.indexOf(p), j = wins.indexOf(q); if (i >= 0 && j >= 0) [wins[i], wins[j]] = [wins[j], wins[i]];
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  $('#toast button').onclick = () => {
    const f = undoFn; $('#toast').hidden = true; undoFn = null;
    if (undoNote){ noteActs.delete(undoNote); undoNote = null; renderBell(); }
    if (f) f();
  };
}

export { fsMute, init, isFocusView, removeChannel, renderSwitcher, setSideCols, swapStreams, toggleCapPause };
