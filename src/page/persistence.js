import { ROLE, STORE, lastLayout, wins } from './core.js';
import { clampPos } from './layout/geometry.js';
import { histRecord } from './layout/undo.js';
import { reportPlayers } from './platforms/pear-drops.js';
import { DESKTOP } from './shared/env.js';
import { settings } from './shared/settings.js';
import { frameFields, restoreFrames } from './windows/frames.js';
import { streamSpecs } from './windows/popout.js';
import { createWin } from './windows/windows.js';

/* ---------- persistence ---------- */
function save(){
  settings.set(STORE, wins.filter(w => w.kind !== 'capture').map(w => ({
    kind: w.kind, channel: w.channel, url: w.url, muted: w.muted, vol: w.vol, preview: !!w.preview,
    x: w.x, y: w.y, w: w.w, h: w.h, z: +w.el.style.zIndex, ord: wins.indexOf(w), ...frameFields(w)
  })));
  if (DESKTOP && ROLE === 'streams') window.kmv.reportStreams(streamSpecs());
  reportPlayers();   // the Kick streams open, for a linked Pear Drops
  settings.set(ROLE === 'main' ? 'lastLayout' : 'streams.lastLayout', lastLayout || '');
  histRecord();
}
function restore(){
  const data = settings.json(STORE, []);
  if (Array.isArray(data)) data.filter(d => d.kind !== 'capture').sort((a, b) => a.z - b.z).forEach(d => {
    const w = createWin(d, d); w._ord = d.ord; clampPos(w);
  });
  if (wins.length && wins.every(w => typeof w._ord === 'number')) wins.sort((a, b) => a._ord - b._ord);   // stacking by z, order as you left it
  if (Array.isArray(data)) restoreFrames(data);
}

export { restore, save };
