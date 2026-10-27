import { BAR, GAP, ROLE, colCount, colWidth, colsMode, coreVars, shownWins } from '../core.js';
import { updateColNav } from './column-drag.js';
import { applyFocusOnly } from './focus-only.js';
import { SH, SW, setRect } from './geometry.js';
import { HBAR, STRIP_H, SWITCH_MIN, colKey, colOrder, colStrip, colTopOff, colX0, featBase, featBg, featSwitch,
  featW, featuredCh, fsResize, isVid, layoutVars, linked, maxScroll, refreshFeatButtons, scrollRaf, scrollX,
  setColsMode, setFeatured, switchMode } from './layouts.js';
import { placeMinis, placeSwitcher } from './switch-control.js';
import { renderSwitcher } from './switcher.js';
import { save } from '../persistence.js';
import { chLabelP } from '../platforms/platforms.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { refreshPicks, updateHbar } from '../windows/channel-picker.js';

/* Columns, in the saved order. Each column: { key, top (stream or web page), chat }. */
function buildCols(){
  const map = new Map(), first = new Map();
  shownWins().forEach((w, i) => {
    const k = colKey(w);
    if (!map.has(k)){ map.set(k, { key: k }); first.set(k, i); }
    const c = map.get(k);
    if (w.kind === 'chat') c.chat = w; else c.top = w;
  });
  const rank = k => {
    const i = colOrder.indexOf(k);
    if (i >= 0) return i;
    return 10000 + (map.get(k).top ? 0 : 5000) + first.get(k);
  };
  return [...map.keys()].sort((a, b) => rank(a) - rank(b)).map(k => map.get(k));
}

/* Columns: one column per channel, stream on top (exact 16:9 at the column's width),
   its chat filling the rest. Columns stay >= COL_MIN wide; extra ones scroll sideways.
   A highlighted stream sits big on the left with its chat, fixed while the rest scroll,
   with a switcher underneath. preview = { key, slot } while a column is dragged. */
const COL_MIN = 360;
let sideCols = 0;                                     // highlight view: side columns shown (0 = auto)
// Other files change these through columnVars: a variable imported from another file can't be assigned to.
const columnVars = {
  get sideCols(){ return sideCols; }, set sideCols(v){ sideCols = v; },
};
function columnsLayout(preview){
  if (!colsMode) setColsMode(true);
  const all = buildCols();
  if (!preview){
    layoutVars.colOrder = all.map(c => c.key);
    settings.set('colOrder', colOrder);
  }
  const feat = featuredCh ? all.find(c => c.key === featuredCh && isVid(c.top)) : null;
  if (featuredCh && !feat) setFeatured(null);
  let cols = all.filter(c => c !== feat);
  if (preview){
    const d = cols.find(c => c.key === preview.key);
    cols = cols.filter(c => c !== d); cols.splice(preview.slot, 0, d);
  }
  coreVars.colCount = cols.length;
  const Hfull = SH() - GAP, Y = GAP / 2, avail = SW() - GAP;

  // Highlighted stream geometry
  let fg = null;
  // "Side chats" setting: how many columns sit beside the big stream (0 = automatic)
  const sideN = feat && sideCols ? Math.min(sideCols, Math.max(1, cols.length)) : 0;
  if (feat){
    let chatW = feat.chat ? Math.min(440, Math.max(320, avail * 0.22)) : 0;
    if (sideN >= 3 && chatW) chatW = Math.max(300, chatW - 40);
    let cellW = (Hfull - (switchMode === 'dock' ? SWITCH_MIN + GAP : 0) - BAR) * 16 / 9 + GAP;   // no switcher under it: use the full height
    const sideW = sideN === 1 ? COL_MIN : sideN === 2 ? 320 : 260;                                // width each side column aims for
    if (sideN) cellW = Math.min(cellW, Math.max(avail - chatW - sideN * sideW, avail * 0.28));   // big stream shrinks to make room
    else cellW = Math.min(cellW, Math.max(avail - chatW - COL_MIN, avail * 0.45));
    const cellH = (cellW - GAP) * 9 / 16 + BAR + GAP;
    fg = { chatW, cellW, cellH };
    layoutVars.featW = cellW + chatW;
  } else layoutVars.featW = 0;

  const rest = avail - featW;
  const perScreen = sideN || Math.max(1, Math.min(colCount || 1, Math.floor(rest / COL_MIN)));
  const oldWidth = colWidth;
  coreVars.colWidth = sideN ? rest / perScreen : feat ? Math.max(COL_MIN, rest / perScreen) : avail / perScreen;
  layoutVars.colX0 = GAP / 2 + featW;
  layoutVars.maxScroll = Math.max(0, colCount * colWidth - rest);
  // the space changed (window resized, toolbar moved): stay on the same column, lined up with the edge
  if (oldWidth && Math.abs(colWidth - oldWidth) > 0.5){ cancelAnimationFrame(scrollRaf); layoutVars.scrollX = Math.round(scrollX / oldWidth) * colWidth; }
  layoutVars.scrollX = Math.min(scrollX, maxScroll);
  const colH = Hfull - (maxScroll > 0 ? HBAR : 0);   // leave room for the scrollbar
  // navigation strip above the columns whenever there are more than fit
  const strip = ROLE === 'main' && maxScroll > 0;
  layoutVars.colTopOff = strip ? STRIP_H : 0;
  if (strip){
    Object.assign(colStrip.style, { display: 'flex', left: (colX0 + GAP / 2) + 'px', top: (GAP) + 'px', width: (SW() - colX0 - GAP * 1.5) + 'px', height: (STRIP_H - GAP) + 'px' });
    if (!preview){
      layoutVars.colKeysShown = cols.map(c => c.key);
      const pick = colStrip.querySelector('.cs-pick');
      pick.innerHTML = '';
      cols.forEach((c, i) => {
        const o = document.createElement('option'); o.value = i;
        o.textContent = c.top && c.top.channel ? chLabelP(c.top.channel) : (c.chat ? chLabelP(c.chat.channel) : (c.top ? (c.top.kind === 'capture' ? c.top.capName : (() => { try { return new URL(c.top.url).hostname; } catch { return 'window'; } })()) : 'window'));
        pick.appendChild(o);
      });
    }
  } else colStrip.style.display = 'none';

  if (!preview){
    featBase.forEach(f => { if (!feat || (f.w !== feat.top && f.w !== feat.chat)){ f.w.el.classList.remove('featured'); f.w.el.style.zIndex = ++coreVars.zTop; } });
    layoutVars.featBase = [];
    if (fg){
      const parts = [{ w: feat.top, x: GAP, y: Y + GAP / 2, ww: fg.cellW - GAP, hh: fg.cellH - GAP }];
      if (feat.chat) parts.push({ w: feat.chat, x: GAP / 2 + fg.cellW + GAP / 2, y: Y + GAP / 2, ww: fg.chatW - GAP, hh: Hfull - GAP });
      parts.forEach(p => {
        p.w.max = null;
        p.w.el.classList.add('featured'); p.w.el.classList.remove('link-top', 'link-bot');
        p.w.el.style.zIndex = 89995;
        setRect(p.w, { x: p.x, y: p.y, w: p.ww, h: p.hh }, true);
        featBase.push({ w: p.w });
      });
      featBg.style.display = 'block';
      featBg.style.width = (featW + GAP / 2) + 'px';
      // switcher fills the space under the big stream
      if (switchMode === 'dock'){
        const sy = Y + fg.cellH + GAP / 2;
        featSwitch.classList.remove('floating'); fsResize.style.display = 'none';
        Object.assign(featSwitch.style, { display: 'grid', left: GAP + 'px', top: sy + 'px', width: (fg.cellW - GAP) + 'px', height: Math.max(40, Y + Hfull - GAP / 2 - sy) + 'px' });
        renderSwitcher();
      }
    } else { featBg.style.display = 'none'; if (switchMode === 'dock'){ featSwitch.style.display = 'none'; placeMinis(); } }
    if (switchMode !== 'dock') placeSwitcher();
  }

  cols.forEach((col, i) => {
    if (preview && col.key === preview.key) return;
    placeCol(col, colX0 + i * colWidth - scrollX, colH, true);
  });
  if (!preview){ coreVars.lastLayout = 'columns'; save(); applyFocusOnly(); refreshPicks(); store.changed('layout'); }
  updateColNav(); updateHbar();
  refreshFeatButtons();
}
function placeCol(col, x, H, animate){
  const Y = GAP / 2 + colTopOff;          // leave room for the navigation strip
  H -= colTopOff;
  [col.top, col.chat].forEach(w => {      // anything in a column stays below the highlight layer
    if (!w) return;
    w.el.classList.remove('featured');
    if (+w.el.style.zIndex >= 89000) w.el.style.zIndex = ++coreVars.zTop;
  });
  const join = linked && col.top && col.chat;
  let top = null;
  if (col.top){
    let cellH = (colWidth - GAP) * 9 / 16 + BAR + GAP, cellW = colWidth;
    const maxH = col.chat ? H * 0.55 : H;               // always leave the chat at least ~45%
    if (cellH > maxH){ cellH = maxH; cellW = (cellH - GAP - BAR) * 16 / 9 + GAP; }
    col.top.max = null;
    top = { x: x + (colWidth - cellW) / 2 + GAP / 2, y: Y + GAP / 2, w: cellW - GAP, h: cellH - GAP + (join ? GAP / 2 : 0) };
    setRect(col.top, top, animate);
    col.top.el.classList.toggle('link-top', !!join);
    col.top.el.classList.remove('link-bot');
  }
  if (col.chat){
    const cy = top ? (join ? top.y + top.h : top.y + top.h + GAP) : Y + GAP / 2;
    col.chat.max = null;
    setRect(col.chat, { x: x + GAP / 2, y: cy, w: colWidth - GAP, h: Y + H - GAP / 2 - cy }, animate);
    col.chat.el.classList.toggle('link-bot', !!join);
    col.chat.el.classList.remove('link-top');
  }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  sideCols = Math.max(0, Math.min(5, settings.num('sideCols')));
}

export { buildCols, columnsLayout, columnVars, init, sideCols };
