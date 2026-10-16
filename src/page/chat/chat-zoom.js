import { wins } from '../core.js';
import { settings } from '../shared/settings.js';
import { setZoom } from '../windows/view.js';

/* Chat text size (applies to every chat window) */
const ZOOMS = [0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25];
let zoomIdx = 5;
// Other files change these through zoomVars: a variable imported from another file can't be assigned to.
const zoomVars = {
  get zoomIdx(){ return zoomIdx; }, set zoomIdx(v){ zoomIdx = v; },
};
function chatZoom(){ return ZOOMS[zoomIdx]; }
function applyChatZoom(){
  document.querySelectorAll('.zoomPct').forEach(e => { e.textContent = Math.round(chatZoom() * 100) + '%'; });
  document.querySelectorAll('.zoom [data-z]').forEach(b => { b.disabled = +b.dataset.z < 0 ? zoomIdx === 0 : zoomIdx === ZOOMS.length - 1; });
  wins.forEach(w => { if (w.kind === 'chat' && w.ready) setZoom(w.view, chatZoom()); });
  settings.set('chatZoom', zoomIdx);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  { const s = settings.get('chatZoom'); if (s !== null && ZOOMS[+s]) zoomIdx = +s; }
}

export { applyChatZoom, chatZoom, init, zoomIdx, ZOOMS, zoomVars };
