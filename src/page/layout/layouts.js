import '../panels/settings/notifications.js';   // runs after it (see app.js)
import { settings } from '../shared/settings.js';
import { $, BAR, GAP, ROLE, colWidth, colsMode, coreVars, stage, streamCols, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { chLabel } from '../platforms/platforms.js';
import { SH, SW, setRect } from './geometry.js';
import { locked } from './lock.js';
import { pageStep, scrollCols, scrollVars, smoothScrollTo, updatePageBtn } from './sideways-scroll.js';
import { schedulePicks } from '../windows/channel-picker.js';
import { buildCols, columnsLayout } from './columns.js';
import { placeMinis, placeSwitcher } from './switch-control.js';
import { applyFocusOnly } from './focus-only.js';
import { updateLayoutMenu } from './column-drag.js';
import { activeP, setPresetOpt } from './saved-layouts.js';
import { updateModeClass } from './chat-focus.js';
import { save } from '../persistence.js';

/* ---------- layouts ---------- */
function gridRects(n, X, Y, W, H, aspect){
  if (!n) return [];
  let best = null;
  for (let cols = 1; cols <= n; cols++){
    const rows = Math.ceil(n / cols), cw = W / cols, ch = H / rows;
    const vw = Math.min(cw, Math.max(0, ch - BAR) * aspect);
    const score = vw * (vw / aspect) * n;
    if (!best || score > best.s + 1) best = { s: score, cols, cw, ch };
  }
  return Array.from({ length: n }, (_, i) => ({
    x: X + (i % best.cols) * best.cw + GAP / 2,
    y: Y + Math.floor(i / best.cols) * best.ch + GAP / 2,
    w: best.cw - GAP, h: best.ch - GAP
  }));
}
/* Streams in rows that fill the area: rows can hold different numbers of streams (e.g. 5 = 1 + 2 + 2),
   each row as tall as its streams need at 16:9, scaled to fill the height. Picks the row count and order
   (fewer streams at the top or the bottom) that gives the most picture, so there are no empty cells. */
function rowRects(n, X, Y, W, H, aspect){
  if (!n) return [];
  let best = null;
  for (let r = 1; r <= n; r++){
    const base = Math.floor(n / r), extra = n % r;
    for (const fewFirst of [true, false]){
      const counts = Array.from({ length: r }, (_, i) => base + ((fewFirst ? i >= r - extra : i < extra) ? 1 : 0));
      const ideal = counts.map(k => W / k / aspect + BAR);
      const scale = H / ideal.reduce((a, b) => a + b, 0);
      const hs = ideal.map(h => h * scale);
      let score = 0;
      counts.forEach((k, i) => { const vw = Math.max(0, Math.min(W / k - GAP, (hs[i] - BAR - GAP) * aspect)); score += k * vw * vw / aspect; });
      if (!best || score > best.score + 1) best = { score, counts, hs };
    }
  }
  const rects = [];
  let y = Y;
  best.counts.forEach((k, i) => {
    const cw = W / k;
    for (let j = 0; j < k; j++) rects.push({ x: X + j * cw + GAP / 2, y: y + GAP / 2, w: cw - GAP, h: best.hs[i] - GAP });
    y += best.hs[i];
  });
  return rects;
}
function applyRects(list, rects){ list.forEach((w, i) => { w.max = null; setRect(w, rects[i], true); }); }

function autoLayout(){
  if (colsMode) return columnsLayout();
  const W = SW() - GAP, H = SH() - GAP, X = GAP / 2, Y = GAP / 2;
  const vids = wins.filter(w => w.kind !== 'chat');
  const order = vids.map(v => v.channel);
  const chats = wins.filter(w => w.kind === 'chat');
  if (!locked()) chats.sort((a, b) => (order.indexOf(a.channel) + 1 || 999) - (order.indexOf(b.channel) + 1 || 999));   // locked: where they were swapped to
  if (!vids.length){ layoutChatsOnly(); return; }
  const chatW = Math.min(340, W * 0.24);
  const chatArea = Math.min(chats.length, 3) * chatW;
  applyRects(vids, rowRects(vids.length, X, Y, W - chatArea, H, 16 / 9));
  // chats in rows too (5 = 3 + 2, the second row's chats wider), so none of the chat area is left empty
  if (chats.length) applyRects(chats, chatRects(chats.length, X + W - chatArea, Y, chatArea, H));
  save();
}
function tile(){
  if (colsMode) return columnsLayout();
  coreVars.lastLayout = 'tile';
  applyRects(wins, gridRects(wins.length, GAP / 2, GAP / 2, SW() - GAP, SH() - GAP, 16 / 9)); save();
}

/* Chats split a rectangle: as many rows as needed so each chat stays >= ~320px wide,
   otherwise as tall as possible. Rows with fewer chats get wider chats (no gaps). */
function chatRects(m, X, Y, CW, H){
  if (!m) return [];                 // nothing open (Auto with no windows lands here)
  let best = null;
  for (let r = 1; r <= m; r++){
    const perRow = Array.from({ length: r }, (_, i) => Math.floor(m / r) + (i < m % r ? 1 : 0));
    const minW = CW / Math.max(...perRow), h = H / r;
    const score = Math.min(minW / 320, 1) * Math.min(h / 650, 1) + (minW * h) / 1e8;
    if (!best || score > best.score) best = { score, perRow, h };
  }
  const rects = [];
  best.perRow.forEach((k, ri) => {
    const cw = CW / k;
    for (let j = 0; j < k; j++) rects.push({ x: X + j * cw + GAP / 2, y: Y + ri * best.h + GAP / 2, w: cw - GAP, h: best.h - GAP });
  });
  return rects;
}
// Every window that passes `test`, in the shared stream order (the same order Columns / highlight use).
// A channel's extra windows (e.g. a second copy of its chat) come straight after its first one.
function inColOrder(test){
  const rank = new Map(buildCols().map((c, i) => [c.key, i]));
  return wins.filter(test).sort((a, b) => rank.get(colKey(a)) - rank.get(colKey(b)));
}
const sortedChats = () => inColOrder(w => w.kind === 'chat');
function layoutChatsOnly(){
  if (colsMode) return columnsLayout();
  const W = SW() - GAP, H = SH() - GAP, X = GAP / 2, Y = GAP / 2;
  const others = wins.filter(w => w.kind !== 'chat'), chats = sortedChats();
  if (others.length){ chatFocusLayout(); return; }
  applyRects(chats, chatRects(chats.length, X, Y, W, H));
  coreVars.lastLayout = 'chatfocus';
  save();
}

/* Chat focus: every stream window is cut to exactly its 16:9 video (no black bars),
   and chats split all the remaining space, as tall columns whenever they fit. */
function chatFocusLayout(){
  if (colsMode) return columnsLayout();
  const W = SW() - GAP, H = SH() - GAP, X = GAP / 2, Y = GAP / 2;
  const vids = inColOrder(w => w.kind !== 'chat'), chats = sortedChats();
  if (!vids.length && chats.length){ applyRects(chats, chatRects(chats.length, X, Y, W, H)); coreVars.lastLayout = 'chatfocus'; save(); return; }
  if (!vids.length || !chats.length){ tile(); return; }

  const n = vids.length, maxCols = Math.min(n, 3);
  const cols = Math.min(streamCols, maxCols), rows = Math.ceil(n / cols);

  // Stream size: fill the height, width follows the 16:9 video exactly.
  let cellH = H / rows;
  let cellW = (cellH - GAP - BAR) * 16 / 9 + GAP;
  const maxCellW = (W * 0.62) / cols;               // always leave chats at least ~38%
  if (cellW > maxCellW){ cellW = maxCellW; cellH = (cellW - GAP) * 9 / 16 + BAR + GAP; }
  const streamArea = cols * cellW;
  applyRects(vids, vids.map((v, i) => ({
    x: X + (i % cols) * cellW + GAP / 2, y: Y + Math.floor(i / cols) * cellH + GAP / 2,
    w: cellW - GAP, h: cellH - GAP
  })));

  // Chats fill everything to the right of the streams.
  applyRects(chats, chatRects(chats.length, X + streamArea, Y, W - streamArea, H));
  coreVars.lastLayout = 'chatfocus';
  updateModeClass(); schedulePicks();
  save();
}

let colX0 = GAP / 2, featW = 0, featBase = [];
let colOrder = [], linked = true, featuredCh = null;
let scrollX = 0, maxScroll = 0, snapT = 0, scrollRaf = 0;
const HBAR = 14, SWITCH_MIN = 54;
colOrder = settings.json('colOrder', []);
linked = settings.flag('linked', true);
featuredCh = settings.text('featured', null);
const colKey = w => w.kind === 'web' ? 'web:' + w.id : w.kind === 'capture' ? 'cap:' + w.id : w.channel;
// "Videos": streams and other apps' windows. Both can be in the switch control and be the big one.
const isVid = w => !!w && (w.kind === 'stream' || w.kind === 'capture');
const vidByKey = k => wins.find(w => isVid(w) && colKey(w) === k);
const vidLabel = w => w.kind === 'capture' ? (w.capName || 'Window') : chLabel(w.channel);
const mkDiv = (id, html) => { const d = document.createElement('div'); d.id = id; if (html) d.innerHTML = html; stage.appendChild(d); return d; };
const featBg = mkDiv('featBg');                                   // covers columns passing under the highlight
const featSwitch = mkDiv('featSwitch');                           // stream switcher under the big stream
const fsResize = mkDiv('fsResize');                               // resize corner when it floats
fsResize.title = 'Drag to resize';
// Where the switch control lives: 'dock' (under the big stream in Focus view), 'float' (a panel you
// can drag anywhere in this window, in any layout) or 'window' (its own window, e.g. on another monitor).
let switchMode = 'dock', switchRect = { x: null, y: null, w: 680, h: 380 };
{
  const m = settings.get('switchMode');
  if (ROLE === 'main' && (m === 'float' || (m === 'window' && DESKTOP))) switchMode = m;
  Object.assign(switchRect, settings.json('switchRect', {}));
}
const hbar = mkDiv('hscroll', '<div class="thumb"></div>');       // our own sideways scrollbar
// Strip just above the columns: ‹ [which stream ▾] › to step or jump between them.
const colStrip = mkDiv('colStrip', '<button class="cs-btn" data-d="-1" title="Previous stream" aria-label="Previous stream">‹</button>' +
  '<select class="cs-pick" title="Jump to a stream" aria-label="Jump to a stream"></select><span class="cs-pos"></span>' +
  '<button class="cs-mode"></button>' +
  '<button class="cs-btn" data-d="1" title="Next stream" aria-label="Next stream">›</button>');
const STRIP_H = 34;
let colTopOff = 0, colKeysShown = [];
// Other files change these through layoutVars: a variable imported from another file can't be assigned to.
const layoutVars = {
  get featW(){ return featW; }, set featW(v){ featW = v; },
  get colX0(){ return colX0; }, set colX0(v){ colX0 = v; },
  get featBase(){ return featBase; }, set featBase(v){ featBase = v; },
  get colOrder(){ return colOrder; }, set colOrder(v){ colOrder = v; },
  get linked(){ return linked; }, set linked(v){ linked = v; },
  get scrollX(){ return scrollX; }, set scrollX(v){ scrollX = v; },
  get scrollRaf(){ return scrollRaf; }, set scrollRaf(v){ scrollRaf = v; },
  get snapT(){ return snapT; }, set snapT(v){ snapT = v; },
  get maxScroll(){ return maxScroll; }, set maxScroll(v){ maxScroll = v; },
  get switchMode(){ return switchMode; }, set switchMode(v){ switchMode = v; },
  get colTopOff(){ return colTopOff; }, set colTopOff(v){ colTopOff = v; },
  get colKeysShown(){ return colKeysShown; }, set colKeysShown(v){ colKeysShown = v; },
};
colStrip.addEventListener('click', e => {
  const b = e.target.closest('.cs-btn'); if (b) scrollCols(+b.dataset.d);
  if (e.target.closest('.cs-mode')){ scrollVars.pageStep = !pageStep; settings.set('pageStep', pageStep); updatePageBtn(); }
});
// Mouse wheel over the strip steps like the arrows (one notch = one click).
let stripWheelAt = 0;
colStrip.addEventListener('wheel', e => {
  e.preventDefault(); e.stopPropagation();
  const now = performance.now(); if (now - stripWheelAt < 220) return; stripWheelAt = now;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (d) scrollCols(d > 0 ? 1 : -1);
}, { passive: false });
colStrip.querySelector('.cs-pick').addEventListener('change', e => { smoothScrollTo(+e.target.value * colWidth); });

function setColsMode(on){
  coreVars.colsMode = on;
  document.body.classList.toggle('cols', on);
  document.body.classList.toggle('linked', on && linked);
  if (!on){
    cancelAnimationFrame(scrollRaf);
    scrollX = 0; maxScroll = 0;
    $('#colNav').hidden = true; hbar.style.display = 'none'; colStrip.style.display = 'none'; colTopOff = 0;
    clearFeaturedLook();
    wins.forEach(w => w.el.classList.remove('link-top', 'link-bot'));
  }
  if (ROLE === 'main') settings.set('cols', on ? '1' : null);
  updateLayoutMenu(); updateLinkBtn();
  if (typeof updateModeClass === 'function') updateModeClass();
}
const builtinLinked = () => settings.flag('linked', true);
// From the Layout menu: changes the layout in use (a saved layout keeps its own)
function setLinked(on){
  const ap = activeP();
  if (ap) setPresetOpt(ap, 'linked', on);
  else { settings.set('linked', on); liveLinked(on); }
}
function liveLinked(on){
  linked = on;
  document.body.classList.toggle('linked', colsMode && on);
  updateLinkBtn();
  if (colsMode) columnsLayout();
}
function updateLinkBtn(){ $('#lmLinked').checked = linked; $('#lyLinked').checked = builtinLinked(); }
function setFeatured(ch){
  featuredCh = ch;
  settings.set('featured', ch || null);
  refreshFeatButtons();
}
function toggleFeatured(ch){
  setFeatured(featuredCh === ch ? null : ch);
  scrollX = 0;
  columnsLayout();
}
function refreshFeatButtons(){
  wins.forEach(w => {
    const b = w.el.querySelector('[data-a=feat]'); if (!b) return;
    const on = featuredCh === colKey(w) && w.el.classList.contains('featured');
    b.classList.toggle('on', on);
    b.title = on ? 'Back to normal size' : 'Highlight: make this stream big';
  });
}
function clearFeaturedLook(){
  featBase.forEach(f => { f.w.el.classList.remove('featured'); f.w.el.style.zIndex = ++coreVars.zTop; });
  featBase = []; featW = 0;
  featBg.style.display = 'none';
  if (switchMode === 'dock'){ featSwitch.style.display = 'none'; placeMinis(); } else placeSwitcher();
  if (typeof applyFocusOnly === 'function') applyFocusOnly();   // no big stream -> resume what it paused
}

export { applyRects, autoLayout, builtinLinked, chatFocusLayout, chatRects, colKey, colOrder, colStrip, colTopOff,
  colX0, featBase, featBg, featSwitch, featuredCh, featW, fsResize, gridRects, hbar, HBAR, isVid, layoutChatsOnly,
  layoutVars, linked, liveLinked, maxScroll, mkDiv, refreshFeatButtons, scrollRaf, scrollX, setColsMode, setFeatured,
  setLinked, snapT, STRIP_H, SWITCH_MIN, switchMode, switchRect, tile, toggleFeatured, updateLinkBtn, vidByKey,
  vidLabel };
