import '../chat/view-menu.js';   // runs after it (see app.js)
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { ROLE, coreVars, lastLayout, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { chLabel, chatSrc, platOf, platform, ytVidOf } from '../platforms/platforms.js';
import { createWin } from './windows.js';
import { closeWin } from '../chat/view-menu.js';
import { fitOn } from '../panels/channels/channels.js';
import { addNote } from '../panels/bell/bell.js';
import { flash } from '../shared/flash.js';
import { colOrder, featuredCh, layoutVars, setFeatured } from '../layout/layouts.js';
import { save } from '../persistence.js';

/* ---- Raids: when a chat or player moves to another channel, every window of the old channel follows ----
   On a raid, Kick's pop-out chat loads the new channel's page (and Twitch can move its chat or player), so the
   chat shows a whole site page and the stream stays on the old, now offline, channel. */
// The channel a window's new address is for (same site only), or null when it isn't a channel's chat, page or player.
function raidTarget(w, url){
  if (!w || !w.channel || (w.kind !== 'chat' && w.kind !== 'stream')) return null;
  let u; try { u = new URL(url); } catch { return null; }
  return platform(w.channel).raidTarget(w.kind, u);
}
// What a window's view did: a different channel follows the raid; its own channel's page goes back to the pop-out chat.
function watchRaid(w, url){
  const to = raidTarget(w, url);
  if (!to) return;
  if (to !== w.channel){ followRaid(w.channel, to, true); return; }
  if (w.kind === 'chat' && w.view && !/\/popout\/|\/embed\//.test(url) && Date.now() - (w.backAt || 0) > 10000){
    w.backAt = Date.now();
    const src = chatSrc(w.channel, ytVidOf(w)); if (src) w.view.src = src;
  }
}
if (DESKTOP) fromApp('onRaid', (from, to) => followRaid(String(from), String(to), false));
window.followRaid = followRaid; window.raidTarget = raidTarget;   // for the tests
let raidSeen = {};
function followRaid(from, to, tell){
  if (!from || !to || from === to || platOf(from) !== platOf(to)) return;
  if (raidSeen[from + '>' + to] && Date.now() - raidSeen[from + '>' + to] < 15000) return;   // both windows of a channel report it
  for (const k in raidSeen) if (Date.now() - raidSeen[k] >= 15000) delete raidSeen[k];
  raidSeen[from + '>' + to] = Date.now();
  const old = wins.filter(w => w.channel === from && (w.kind === 'stream' || w.kind === 'chat'));
  if (tell && DESKTOP && window.kmv.raidFollowed) window.kmv.raidFollowed(from, to);   // the other window (streams pop-out or main)
  // kept under the bell (the main window's, also for a raid the streams window followed); its pop-up where it switched
  const text = `${chLabel(from)} raided ${chLabel(to)}: switched to them`;
  addNote({ kind: 'raid', channel: to, from, label: chLabel(to) }, old.length ? text : null, `${chLabel(from)} raided ${chLabel(to)}`);
  if (!old.length) return;
  if (featuredCh === from) setFeatured(to);                     // the big one stays big
  old.forEach(w => {
    if (!wins.some(o => o.kind === w.kind && o.channel === to)){
      const n = createWin({ kind: w.kind, channel: to, muted: w.muted, vol: w.vol }, { x: w.x, y: w.y, w: w.w, h: w.h });
      n.el.style.zIndex = w.el.style.zIndex; n.max = w.max;
      wins.splice(wins.indexOf(n), 1); wins.splice(wins.indexOf(w), 0, n);
    }
    closeWin(w);
  });
  if (colOrder.includes(from)){
    layoutVars.colOrder = colOrder.includes(to) ? colOrder.filter(k => k !== from) : colOrder.map(k => k === from ? to : k);
    settings.set('colOrder', colOrder);
  }
  store.changed('wins'); save();
}

// You moved or resized a window yourself: don't auto-refit on window resize. Fitting in channels that open
// by themselves only works in Auto layout, so say so when it stops.
function arrangedByHand(){
  if (lastLayout === 'auto' && ROLE === 'main' && fitOn()) flash('Auto layout is off because you moved a window. Pick it again to fit in channels that go live.', { subject: 'layouts' });
  coreVars.lastLayout = null; store.changed('layout');
}

export { arrangedByHand, watchRaid };
