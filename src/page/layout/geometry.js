import '../platforms/platforms.js';   // runs after it (see app.js)
import { BAR, GAP, SNAP, colsMode, coreVars, sizehint, snapChk, stage, wins, zTop } from '../core.js';
import { linked } from './layouts.js';

/* ---------- geometry helpers ---------- */
const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
function setRect(w, r, animate){
  w.x = Math.round(r.x); w.y = Math.round(r.y); w.w = Math.round(r.w); w.h = Math.round(r.h);
  if (animate){ w.el.classList.add('anim'); clearTimeout(w._t); w._t = setTimeout(() => w.el.classList.remove('anim'), 260); }
  Object.assign(w.el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
}
function clampPos(w){
  if (colsMode) return;   // columns can sit off-screen while scrolled
  const x = Math.min(Math.max(w.x, -(w.w - 80)), SW() - 80);
  const y = Math.min(Math.max(w.y, 0), Math.max(0, SH() - BAR));
  if (x !== w.x || y !== w.y) setRect(w, { x, y, w: w.w, h: w.h });
}
function edges(self){
  const xs = [GAP, SW() - GAP], ys = [GAP, SH() - GAP];
  for (const o of wins) if (o !== self){ xs.push(o.x - GAP, o.x + o.w + GAP, o.x, o.x + o.w); ys.push(o.y - GAP, o.y + o.h + GAP, o.y, o.y + o.h); }
  return { xs, ys };
}
function near(v, arr){
  let best = null, d = SNAP + 1;
  for (const a of arr){ const dd = Math.abs(a - v); if (dd < d){ d = dd; best = a; } }
  return best;
}
const snapE = (v, arr) => snapChk.checked ? (near(v, arr) ?? v) : v;

function focusWin(w){
  const partner = colsMode && linked && w.channel ? wins.find(o => o !== w && o.channel === w.channel && o.kind !== w.kind) : null;
  [partner, w].forEach(o => { if (o && !o.el.classList.contains('featured') && +o.el.style.zIndex !== zTop) o.el.style.zIndex = ++coreVars.zTop; });
  wins.forEach(o => o.el.classList.toggle('active', o === w || o === partner));
}
function showHint(e, w){
  sizehint.style.display = 'block';
  sizehint.textContent = `${w.w} × ${w.h - BAR}`;
  sizehint.style.left = (e.clientX + 14) + 'px'; sizehint.style.top = (e.clientY + 14) + 'px';
}

export { clampPos, edges, focusWin, near, setRect, SH, showHint, snapE, SW };
