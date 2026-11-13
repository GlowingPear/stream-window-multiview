import { $, ROLE, colsMode, lastLayout, wins } from '../core.js';
import { autoLayout, colKey } from '../layout/layouts.js';
import { locked } from '../layout/lock.js';
import { removeChannel } from '../layout/switcher.js';
import { fitOn, infoFor } from '../panels/channels/channels.js';
import { accountsOf, groupKey } from '../platforms/linked.js';
import { normCh } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';

/* ---- A stream that ends closes its windows (Settings › Windows) ----
   A channel that ends its stream without raiding anyone leaves its windows on the site's offline screen (Kick's
   player often just goes black), so the screen can't say it ended: the live checks do. A channel seen live while
   its windows are open, then offline for the setting's minutes, has its stream and chat closed as Remove does
   (Undo brings them back), and the layout fits around what's left. Live again before then, or a raid from it
   (raids.js), and they stay. A linked streamer's windows close once none of their accounts is live. Saved
   channels: the live checks (the main window's); others, and in the streams window: asked about each look. */
const endedTimes = { look: 60000, minute: 60000 };
let closeAfter = 0;                   // minutes (0: off)
const seenLive = new Set();           // windows' keys (colKey) seen live while open: only those close when it ends
const offSince = new Map();           // key → when it was first seen offline
let looking = false, lookT = 0;

// Is any of these channels live? null: couldn't tell (not a saved channel, and the site couldn't be asked)
async function anyLive(chs, snap){
  let known = false;
  for (const ch of chs){
    const i = infoFor(ch) || (snap && snap[normCh(ch)]);
    let live = i && !i.missing ? !!i.live : null;
    if (live == null && DESKTOP && window.kmv.liveOne){ const r = await window.kmv.liveOne(ch).catch(() => null); live = r ? !!r.live : null; }
    if (live) return true;
    if (live === false) known = true;
  }
  return known ? false : null;
}
// The open streams and chats, by window key, with every channel that keeps them open (a linked streamer's accounts)
function openGroups(){
  const groups = new Map();
  wins.forEach(w => {
    if (!w.channel || (w.kind !== 'stream' && w.kind !== 'chat')) return;
    const k = colKey(w);
    groups.set(k, [...new Set([...(groups.get(k) || []), ...accountsOf(w.channel)])]);
  });
  return groups;
}
async function lookEnded(){
  if (looking) return;
  if (!closeAfter){ seenLive.clear(); offSince.clear(); return; }
  looking = true;
  try {
    const groups = openGroups();
    for (const k of [...seenLive]) if (!groups.has(k)){ seenLive.delete(k); offSince.delete(k); }
    // the streams window doesn't get the live checks: it asks for them
    const snap = ROLE === 'streams' && DESKTOP && window.kmv.liveSnapshot ? await window.kmv.liveSnapshot().catch(() => null) : null;
    for (const [k, chs] of groups){
      const live = await anyLive(chs, snap);
      if (!closeAfter) return;                                   // switched off meanwhile
      if (live == null) continue;
      if (live){ seenLive.add(k); offSince.delete(k); continue; }
      if (!seenLive.has(k)) continue;                            // opened while offline: yours to close
      if (!offSince.has(k)) offSince.set(k, Date.now());
      if (Date.now() - offSince.get(k) >= closeAfter * endedTimes.minute) closeEnded(k);
    }
  } finally { looking = false; }
}
function closeEnded(k){
  seenLive.delete(k); offSince.delete(k);
  if (!wins.some(w => colKey(w) === k)) return;
  removeChannel(k, { ended: true });
  if (!locked() && !colsMode && lastLayout === 'auto' && fitOn()) autoLayout();   // as channels that open by themselves fit in
}
// A raid from this channel: its windows followed it, or stay on purpose (raids.js). Either way, not an ended stream.
function raidedFrom(ch){ const k = groupKey(ch); seenLive.delete(k); offSince.delete(k); }

function setCloseAfter(v){
  closeAfter = Math.max(0, Math.round(Number(v) || 0));
  $('#closeEndedSet').value = String(closeAfter);
  if (closeAfter) lookSoon();
}
function lookSoon(){ clearTimeout(lookT); lookT = setTimeout(() => lookEnded().finally(lookSoon), endedTimes.look); }

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  $('#closeEndedSet').addEventListener('change', e => { const v = +e.target.value; settings.set('closeEnded', v || null); setCloseAfter(v); });
  settings.onChange('closeEnded', (_, v) => setCloseAfter(v));
  setCloseAfter(settings.num('closeEnded', 0));
  if (ROLE === 'main') store.watch('live', () => { if (closeAfter) lookEnded(); });   // the main window hears each check
  window.lookEnded = lookEnded; window.endedTimes = endedTimes;   // for the tests
}

export { init, raidedFrom };
