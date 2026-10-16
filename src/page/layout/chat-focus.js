import { ROLE, colsMode, coreVars, lastLayout, stage, wins } from '../core.js';
import { buildCols, columnsLayout } from './columns.js';
import { gameKey, gameLayout, setGameKey } from './game-focus.js';
import { clampPos, focusWin, setRect } from './geometry.js';
import { chatFocusLayout, colKey, colOrder, layoutVars, setColsMode, setFeatured } from './layouts.js';
import { save } from '../persistence.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { refreshPicks } from '../windows/channel-picker.js';

function updateModeClass(){
  const on = ROLE === 'main' && !colsMode && lastLayout === 'chatfocus';
  document.body.classList.toggle('chatfocus', on);
  if (on) wins.forEach(w => { const b = w.el.querySelector('[data-a=feat]'); if (b){ b.classList.remove('on'); b.title = 'Show this stream big (switches to the highlight view)'; } });
}
function backToChatFocus(){
  setFeatured(null);
  setColsMode(false);
  chatFocusLayout();
  store.changed('layout');
}
/* Drag a window onto another to swap them: streams in Chat focus (their chats swap too) and the streams window,
   and any window while the layout is locked (a stream onto a stream, a chat onto a chat). Dropped anywhere else, it goes back. */
let swapGhost = null;
const winName = o => o.el.querySelector('.title')?.textContent || '';
function startSwapDrag(e, w, bar){
  bar.setPointerCapture(e.pointerId);
  document.body.classList.add('dragging');      // cover the players right away, so they can't take the mouse moves
  const sx = e.clientX, sy = e.clientY, x0 = w.x, y0 = w.y, home = { x: w.x, y: w.y, w: w.w, h: w.h };
  // Chat focus, Game focus and Columns keep a stream and its chat together, so the pair moves (and lights up)
  const pairs = ROLE === 'main' && (colsMode || lastLayout === 'chatfocus' || lastLayout === 'game');
  const snaps = ROLE === 'main' || lastLayout === 'tile' || lastLayout === 'spot';   // dropped elsewhere it goes back (a free streams window leaves it there)
  let moved = false, target = null, lit = [];
  const others = () => wins.filter(o => o !== w && (o.kind === 'chat') === (w.kind === 'chat'));
  if (!swapGhost){ swapGhost = document.createElement('div'); swapGhost.id = 'swapGhost'; stage.appendChild(swapGhost); }
  const light = t => {
    lit.forEach(o => { o.el.classList.remove('swap-target'); delete o.el.querySelector('.shield')?.dataset.swap; });
    lit = !t ? [] : pairs ? wins.filter(o => o === t || (o !== w && colKey(o) === colKey(t))) : [t];
    lit.forEach(o => o.el.classList.add('swap-target'));
    const sh = t?.el.querySelector('.shield'); if (sh) sh.dataset.swap = `Swap ${winName(w)} ⇄ ${winName(t)}`;
    swapGhost.classList.toggle('back', !t); swapGhost.style.visibility = t || snaps ? '' : 'hidden';
    swapGhost.textContent = t ? winName(t) + ' goes here' : 'Drop it on another window to swap';
  };
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved){
      if (Math.hypot(dx, dy) < 5) return;
      moved = true;
      Object.assign(swapGhost.style, { display: 'grid', left: home.x + 'px', top: home.y + 'px', width: home.w + 'px', height: home.h + 'px', zIndex: ++coreVars.zTop });
      w.el.classList.remove('anim'); w.el.classList.add('lifted', 'shrunk'); w.el.style.zIndex = ++coreVars.zTop;
      w.el.style.transformOrigin = `${sx - stage.getBoundingClientRect().left - x0}px ${sy - stage.getBoundingClientRect().top - y0}px`;   // shrinks towards the pointer
      light(null);
    }
    setRect(w, { x: x0 + dx, y: y0 + dy, w: w.w, h: w.h });
    const r = stage.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
    const t = others().filter(o => px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h)
      .reduce((a, o) => (!a || (+o.el.style.zIndex || 0) > (+a.el.style.zIndex || 0) ? o : a), null);   // the one on top
    if (t !== target){ target = t; light(t); }
  };
  const up = () => {
    bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
    document.body.classList.remove('dragging');
    if (!moved) return;
    w.el.classList.remove('lifted', 'shrunk'); w.el.style.transformOrigin = '';
    light(null); swapGhost.style.display = 'none';
    if (ROLE === 'streams'){
      // Streams window: swap the two streams' spots (and their place in the order used by Tile / Spotlight)
      if (target){
        const mine = { x: x0, y: y0, w: w.w, h: w.h }, theirs = { x: target.x, y: target.y, w: target.w, h: target.h };
        const i = wins.indexOf(w), j = wins.indexOf(target);
        [wins[i], wins[j]] = [wins[j], wins[i]];
        setRect(target, mine, true); setRect(w, theirs, true);
      } else if (lastLayout === 'tile' || lastLayout === 'spot') setRect(w, { x: x0, y: y0, w: w.w, h: w.h }, true);   // snap back
      else clampPos(w);                                                                                                  // free layout: leave it there
      if (lastLayout === 'spot') focusWin(wins.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)));   // the big one stays the spotlight one
      save();
      return;
    }
    if (!colsMode && lastLayout === 'chatfocus'){
      if (target) swapColOrder(colKey(w), colKey(target));
      chatFocusLayout();     // swapped, or snap back if dropped elsewhere
      return;
    }
    // locked
    if (!target){ setRect(w, home, true); return; }
    if (pairs){                                  // Game focus, Columns (not linked): swap their places in the order
      const a = colKey(w), b = colKey(target);
      setRect(w, home); swapColOrder(a, b);
      if (colsMode) columnsLayout();
      else { if (gameKey === a) setGameKey(b); else if (gameKey === b) setGameKey(a); gameLayout(); }   // whichever moved into the game area is now the game
    } else {                                     // Auto layout, Tile, your own arrangement: just these two trade places
      const theirs = { x: target.x, y: target.y, w: target.w, h: target.h };
      setRect(target, home, true); setRect(w, theirs, true);
      const i = wins.indexOf(w), j = wins.indexOf(target); [wins[i], wins[j]] = [wins[j], wins[i]];
    }
    save(); refreshPicks();
  };
  bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
}
function swapColOrder(a, b){
  const order = buildCols().map(c => c.key), i = order.indexOf(a), j = order.indexOf(b);
  if (i >= 0 && j >= 0){ [order[i], order[j]] = [order[j], order[i]]; layoutVars.colOrder = order; }
  settings.set('colOrder', colOrder);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* ---- Chat focus <-> highlight ---- */
  store.watch('layout', () => updateModeClass());
  setInterval(updateModeClass, 300);   // lastLayout changes in many places; keep the look in step
}

export { backToChatFocus, init, startSwapDrag, updateModeClass };
