import './focus-only.js';   // runs after it (see app.js)
import { store } from '../shared/store.js';
import { $, GAP, colCount, colWidth, colsMode, coreVars, lastLayout, stage, streamCols, wins } from '../core.js';
import { SW, setRect } from './geometry.js';
import { locked } from './lock.js';
import { fitOn } from '../panels/channels/channels.js';
import { colKey, colOrder, colStrip, colX0, featBase, featW, featuredCh, layoutVars, linked, maxScroll, scrollX,
  switchMode } from './layouts.js';
import { setScrollX, snapSoon, updatePageBtn } from './sideways-scroll.js';
import { buildCols, columnsLayout } from './columns.js';
import { activePreset, renderPresets } from './saved-layouts.js';
import { updatePopHiddenBtn } from '../windows/popout.js';
import { renderLayoutsPane, syncLySw } from '../toolbar/layout-menu.js';

/* Drag a linked column by either title bar; the others slide aside to show where it lands. */
function startColDrag(e, w, bar){
  const key = colKey(w);
  const members = wins.filter(o => colKey(o) === key && !o.el.classList.contains('featured'));
  if (!members.length) return;
  const order = buildCols().filter(c => !(featBase.length && c.key === featuredCh)).map(c => c.key);
  let slot = order.indexOf(key);
  if (slot < 0) return;
  bar.setPointerCapture(e.pointerId);
  const start = members.map(m => ({ m, x: m.x }));
  const sx = e.clientX, s0 = scrollX, startLeft = slot * colWidth;
  members.forEach(m => { m.dragging = true; m.el.classList.remove('anim'); m.el.classList.add('lifted'); m.el.style.zIndex = ++coreVars.zTop; });
  document.body.classList.add('dragging', 'coldrag');
  let lastX = sx, moved = false, raf = 0;
  const apply = () => {
    const dx = lastX - sx;
    start.forEach(s => setRect(s.m, { x: s.x + dx, y: s.m.y, w: s.m.w, h: s.m.h }));
    const logical = startLeft + dx + (scrollX - s0);
    const t = Math.max(0, Math.min(order.length - 1, Math.floor((logical + colWidth / 2) / colWidth)));
    if (t !== slot){ slot = t; columnsLayout({ key, slot }); }
  };
  const tick = () => {           // auto-scroll near the edges
    const r = stage.getBoundingClientRect();
    const edgeL = r.left + colX0 + 60, edgeR = r.right - 60;
    let v = 0;
    if (lastX > edgeR) v = Math.min(22, (lastX - edgeR) / 2);
    else if (lastX < edgeL) v = -Math.min(22, (edgeL - lastX) / 2);
    if (v && moved){ setScrollX(scrollX + v); apply(); }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const move = ev => { if (Math.abs(ev.clientX - sx) > 3) moved = true; lastX = ev.clientX; if (moved) apply(); };
  const up = () => {
    cancelAnimationFrame(raf);
    bar.removeEventListener('pointermove', move);
    bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
    members.forEach(m => { m.dragging = false; m.el.classList.remove('lifted'); });
    document.body.classList.remove('dragging', 'coldrag');
    if (!moved) return;
    const next = order.filter(k => k !== key);
    next.splice(slot, 0, key);
    if (featuredCh && featBase.length){
      const fi = colOrder.indexOf(featuredCh);
      next.splice(fi < 0 ? next.length : Math.min(fi, next.length), 0, featuredCh);
    }
    layoutVars.colOrder = next;
    columnsLayout();
    snapSoon();
  };
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
}

function updateColNav(){
  if (typeof updatePopHiddenBtn === 'function') updatePopHiddenBtn();
  const nav = $('#colNav');
  const overflow = colsMode && maxScroll > 0;
  nav.hidden = !overflow;
  if (!overflow) return;
  const visible = SW() - GAP - featW;
  const first = Math.round(scrollX / colWidth) + 1;
  const shown = Math.max(1, Math.floor((visible + 1) / colWidth));
  const last = Math.min(colCount, first + shown - 1);
  const pos = $('#colPos');
  pos.textContent = `${first}/${colCount}`;
  pos.title = shown > 1 ? `Columns ${first}–${last} of ${colCount}` : `Column ${first} of ${colCount}`;
  nav.style.setProperty('--cn-left', Math.round(featW + GAP / 2 + 8) + 'px');
  if (colStrip.style.display === 'flex'){
    const pick = colStrip.querySelector('.cs-pick');
    if (document.activeElement !== pick) pick.value = String(first - 1);
    colStrip.querySelector('.cs-pos').textContent = shown > 1 ? `${first}–${last} of ${colCount}` : `${first} of ${colCount}`;
    updatePageBtn();
    const [prev, next] = colStrip.querySelectorAll('.cs-btn');
    prev.disabled = next.disabled = false;
    prev.title = scrollX <= 1 ? 'Previous stream (wraps to the last)' : 'Previous stream';
    next.title = scrollX >= maxScroll - 1 ? 'Next stream (wraps to the first)' : 'Next stream';
  }
}
const curLayout = () => colsMode ? (featBase.length && featuredCh ? 'focus' : 'columns') : lastLayout;
// The Layout menu shows the layout in use and its options.
store.watch('layout', () => updateLayoutMenu());
function updateLayoutMenu(){
  const b = $('#layoutBtn'); if (!b) return;
  const names = { focus: 'Focus view', game: 'Game focus', columns: 'Columns', chatfocus: 'Chat focus', auto: 'Auto layout', tile: 'Tile' };
  const cur = curLayout();
  // its name stays "Layout" (when there's room); the layout in use is in its tooltip
  b.title = (activePreset ? 'Layout: ' + activePreset : names[cur] ? 'Layout: ' + names[cur] : 'Layout') + (locked() ? ' (locked)' : '') + '. Arrange the windows';
  document.querySelectorAll('#layoutMenu button[data-l]').forEach(x => x.classList.toggle('on', x.dataset.l === cur && !activePreset));
  // the hint line describes the current layout until you point at another; options are the current layout's
  const curBtn = document.querySelector(`#layoutMenu button[data-l="${cur}"]`);
  $('#lmHint').textContent = curBtn ? curBtn.querySelector('span').textContent : 'Pick a layout.';
  let any = false;
  document.querySelectorAll('#lmOpts .lm-opt').forEach(o => { o.hidden = !(o.dataset.for === '*' || o.dataset.for.split(' ').includes(cur)); any ||= !o.hidden; });
  $('#lmOpts').hidden = !any;
  const nVids = wins.filter(w => w.kind !== 'chat').length;
  const maxCols = Math.max(1, Math.min(3, nVids));      // the count in use: fewer streams than columns use fewer
  document.querySelectorAll('#lmCols button').forEach(b => { b.classList.toggle('on', +b.dataset.n === Math.min(streamCols, maxCols)); b.disabled = +b.dataset.n > maxCols; });
  if (typeof renderPresets === 'function') renderPresets();
  $('#lmLinked').checked = linked; $('#lmAutoFit').checked = fitOn();   // the layout in use: built-in or saved
  if (!$('#settingsDlg').hidden) renderLayoutsPane();
  updateSwBtn();
}
function updateSwBtn(){
  const b = $('#swBtn'); if (!b || typeof switchMode === 'undefined') return;
  b.classList.toggle('on', switchMode !== 'dock');
  document.querySelectorAll('#swModes button').forEach(x => { x.classList.toggle('on', x.dataset.sw === switchMode); x.setAttribute('aria-checked', String(x.dataset.sw === switchMode)); });
  syncLySw();
}

export { curLayout, startColDrag, updateColNav, updateLayoutMenu, updateSwBtn };
