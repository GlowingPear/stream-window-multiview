import './layouts.js';   // runs after it (see app.js)
import { GAP, colWidth, wins } from '../core.js';
import { SW } from './geometry.js';
import { colStrip, featW, layoutVars, maxScroll, scrollRaf, scrollX, snapT } from './layouts.js';
import { updateHbar } from '../windows/channel-picker.js';
import { updateColNav } from './column-drag.js';

/* ---- sideways scrolling (done by the app, so the highlighted area never moves) ---- */
function setScrollX(x){
  x = Math.max(0, Math.min(maxScroll, x));
  const d = x - scrollX;
  if (!d) return;
  layoutVars.scrollX = x;
  wins.forEach(w => {
    if (w.dragging || w.el.classList.contains('featured')) return;
    w.el.classList.remove('anim');
    w.x -= d; w.el.style.left = w.x + 'px';
  });
  updateColNav(); updateHbar();
}
function smoothScrollTo(target){
  cancelAnimationFrame(scrollRaf);
  target = Math.max(0, Math.min(maxScroll, target));
  const from = scrollX, t0 = performance.now(), dur = 240;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    setScrollX(from + (target - from) * e);
    if (k < 1) layoutVars.scrollRaf = requestAnimationFrame(step);
  };
  layoutVars.scrollRaf = requestAnimationFrame(step);
}
function snapSoon(){
  clearTimeout(snapT);
  layoutVars.snapT = setTimeout(() => { if (colWidth) smoothScrollTo(Math.round(scrollX / colWidth) * colWidth); }, 180);
}
let pageStep = false;                 // false: one column per click; true: a whole page of hidden columns
// Other files change these through scrollVars: a variable imported from another file can't be assigned to.
const scrollVars = {
  get pageStep(){ return pageStep; }, set pageStep(v){ pageStep = v; },
};
try { pageStep = localStorage.getItem('kickMultiview.pageStep') === '1'; } catch {}
function scrollCols(dir){   // steps one column (or one page); past the last it wraps to the first (and back)
  if (!colWidth || maxScroll <= 0) return;
  const lastIdx = Math.ceil(maxScroll / colWidth - 0.01);
  const shown = Math.max(1, Math.round((SW() - GAP - featW) / colWidth));
  const cur = Math.round(scrollX / colWidth);
  let i;
  if (!pageStep){ i = cur + dir; if (i > lastIdx) i = 0; else if (i < 0) i = lastIdx; }
  else if (dir > 0) i = cur >= lastIdx ? 0 : Math.min(cur + shown, lastIdx);   // reveal all the unseen ones (or just the rest)
  else i = cur <= 0 ? lastIdx : Math.max(cur - shown, 0);
  smoothScrollTo(i * colWidth);
}
function updatePageBtn(){
  const b = colStrip.querySelector('.cs-mode'); if (!b) return;
  b.textContent = pageStep ? 'Step: page' : 'Step: 1';
  b.classList.toggle('on', pageStep);
  b.title = pageStep ? 'Arrows reveal a whole page of hidden streams at a time (click for one at a time)' : 'Arrows move one stream at a time (click to reveal a whole page of hidden streams at a time)';
  ['-1', '1'].forEach(d => { const a = colStrip.querySelector(`.cs-btn[data-d="${d}"]`); if (a) a.title = (d === '1' ? 'Next' : 'Previous') + (pageStep ? ' page of streams' : ' stream'); });
}

export { pageStep, scrollCols, scrollVars, setScrollX, smoothScrollTo, snapSoon, updatePageBtn };
