import './chat/chat-zoom.js';   // runs after it (see app.js)
import { ROLE, STORE, lastLayout, wins } from './core.js';
import { DESKTOP } from './shared/env.js';
import { clampPos } from './layout/geometry.js';
import { createWin } from './windows/windows.js';
import { streamSpecs } from './windows/popout.js';
import { histRecord } from './layout/undo.js';

/* ---------- persistence ---------- */
function save(){
  try {
    localStorage.setItem(STORE, JSON.stringify(wins.filter(w => w.kind !== 'capture').map(w => ({
      kind: w.kind, channel: w.channel, url: w.url, muted: w.muted, vol: w.vol, preview: !!w.preview,
      x: w.x, y: w.y, w: w.w, h: w.h, z: +w.el.style.zIndex, ord: wins.indexOf(w)
    }))));
  } catch {}
  if (DESKTOP && ROLE === 'streams') window.kmv.reportStreams(streamSpecs());
  try { localStorage.setItem(ROLE === 'main' ? 'kickMultiview.lastLayout' : 'kickMultiview.streams.lastLayout', lastLayout || ''); } catch {}
  histRecord();
}
function restore(){
  let data = [];
  try { data = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch {}
  data.filter(d => d.kind !== 'capture').sort((a, b) => a.z - b.z).forEach(d => {
    const w = createWin(d, d); w._ord = d.ord; clampPos(w);
  });
  if (wins.length && wins.every(w => typeof w._ord === 'number')) wins.sort((a, b) => a._ord - b._ord);   // stacking by z, order as you left it
}

export { restore, save };
