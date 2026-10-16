import '../layout/spotlight.js';   // runs after it (see app.js)
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { $, GAP, colWidth, colsMode, coreVars, lastLayout, mutedChk, popped, wins } from '../core.js';
import { setTb } from '../shared/icons.js';
import { chLabel } from '../platforms/platforms.js';
import { SW, focusWin } from '../layout/geometry.js';
import { createWin } from './windows.js';
import { releaseWin } from '../chat/view-menu.js';
import { defaultStreamRect } from '../layout/placement.js';
import { flash } from '../shared/flash.js';
import { chatFocusLayout, featBase, featSwitch, featW, featuredCh, layoutChatsOnly, scrollX, tile } from '../layout/layouts.js';
import { buildCols, columnsLayout } from '../layout/columns.js';
import { spotlight } from '../layout/spotlight.js';
import { save } from '../persistence.js';

/* ---------- streams pop-out ---------- */
function streamSpecs(){ return wins.filter(w => w.kind === 'stream').map(w => ({ channel: w.channel, vol: w.vol, muted: w.muted })); }
function updatePopBtn(){
  const b = $('#popBtn'); if (!b) return;
  setTb(b, popped ? 'Bring streams back' : 'Pop out streams', popped ? 'dock' : 'popwin');
  b.title = popped ? 'Close the streams window and put the streams back here' : 'Move every stream into its own window (drag it to another monitor). Chats then fill this window.';
  b.classList.toggle('primary', popped);
}
/* Highlight / Columns: send the streams you can't currently see to the Streams window (chats stay here). */
let popPartial = false;
// Other files change these through popoutVars: a variable imported from another file can't be assigned to.
const popoutVars = {
  get popPartial(){ return popPartial; }, set popPartial(v){ popPartial = v; },
};
popPartial = settings.flag('popPartial');
function hiddenStreams(){
  if (!colsMode || !colWidth) return [];
  const cols = buildCols().filter(c => !(featBase.length && c.key === featuredCh));
  const shown = Math.max(1, Math.round((SW() - GAP - featW) / colWidth));
  const first = Math.round(scrollX / colWidth);
  return cols.filter((c, i) => c.top && c.top.kind === 'stream' && (i < first || i >= first + shown)).map(c => c.top);
}
function updatePopHiddenBtn(){
  const b = featSwitch.querySelector('.fs-pophid'); if (!b) return;
  const n = hiddenStreams().length;
  b.disabled = !n;
  b.querySelector('em').textContent = n ? String(n) : '';
  b.title = n ? `Move the ${n} stream${n > 1 ? 's' : ''} you can't see right now into the Streams window (their chats stay here)` : 'Every stream is already on screen';
}
function popOutHidden(){
  const list = hiddenStreams();
  if (!list.length){ flash('No hidden streams to pop out'); return; }
  if (!popped){ popPartial = true; settings.set('popPartial', true); }   // decide before the window opens
  coreVars.popped = true;
  window.kmv.openStreams(list.map(w => ({ channel: w.channel, vol: w.vol, muted: w.muted })));
  list.forEach(releaseWin);
  coreVars.wins = wins.filter(w => !list.includes(w)); updatePopBtn(); store.changed('wins');
  settings.set('popped', '1');
  columnsLayout();
  flash(`${list.length} stream${list.length > 1 ? 's' : ''} sent to the Streams window`);
}
function popOutStreams(){
  const specs = streamSpecs();
  if (!specs.length){ flash('No streams open to pop out'); return; }
  window.kmv.openStreams(specs);
  wins.filter(w => w.kind === 'stream').forEach(releaseWin);
  coreVars.wins = wins.filter(w => w.kind !== 'stream');
  coreVars.popped = true; updatePopBtn(); store.changed('wins');
  settings.set('popped', '1');
  layoutChatsOnly();
}
function streamsCameBack(specs){
  settings.remove('streams.v1');
  (specs || []).forEach(s => {
    if (!wins.some(w => w.kind === 'stream' && w.channel === s.channel))
      createWin({ kind: 'stream', channel: s.channel, vol: s.vol, muted: s.muted }, defaultStreamRect());
  });
  if ((specs || []).length) chatFocusLayout();
}
function receiveStreams(specs){            // streams window
  (specs || []).forEach(s => {
    const ex = wins.find(w => w.kind === 'stream' && w.channel === s.channel);
    if (ex){ focusWin(ex); flash(`${chLabel(s.channel)} is already here`); return; }
    createWin({ kind: 'stream', channel: s.channel, vol: s.vol ?? 0.8, muted: s.muted ?? mutedChk.checked }, defaultStreamRect());
  });
  if (lastLayout === 'spot') spotlight(); else tile();
}
function receiveChat(channel){             // main window, "+ Chat" pressed in the streams window
  const ex = wins.find(w => w.kind === 'chat' && w.channel === channel);
  if (ex){ focusWin(ex); flash(`${chLabel(channel)}'s chat is already open`); return; }
  createWin({ kind: 'chat', channel }, defaultStreamRect());
  if (popped) layoutChatsOnly(); else save();
}

export { hiddenStreams, popOutHidden, popOutStreams, popoutVars, popPartial, receiveChat, receiveStreams,
  streamsCameBack, streamSpecs, updatePopBtn, updatePopHiddenBtn };
