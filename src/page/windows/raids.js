import { allRaid } from '../chat/all-chat.js';
import { closeWin } from '../chat/view-menu.js';
import { ROLE, coreVars, lastLayout, wins } from '../core.js';
import { setRect } from '../layout/geometry.js';
import { colOrder, featuredCh, layoutVars, setFeatured } from '../layout/layouts.js';
import { addParsed } from '../layout/placement.js';
import { addNote } from '../panels/bell/bell.js';
import { fitOn, infoFor } from '../panels/channels/channels.js';
import { save } from '../persistence.js';
import { groupKey, nameOf, optFor, streamerOf } from '../platforms/linked.js';
import { PLAT_NAME, chLabel, chatSrc, platOf, platform, ytVidOf } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { frameNote, frameOf, leaderOf, openStreamer, putTabBack, showTab } from './frames.js';
import { createWin } from './windows.js';

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
let raidSeen = {};
function followRaid(from, to, tell){
  if (!from || !to || from === to || platOf(from) !== platOf(to)) return;
  if (raidSeen[from + '>' + to] && Date.now() - raidSeen[from + '>' + to] < 15000) return;   // both windows of a channel report it
  for (const k in raidSeen) if (Date.now() - raidSeen[k] >= 15000) delete raidSeen[k];
  raidSeen[from + '>' + to] = Date.now();
  const all = wins.filter(w => w.channel === from && (w.kind === 'stream' || w.kind === 'chat'));
  if (tell && DESKTOP && window.kmv.raidFollowed) window.kmv.raidFollowed(from, to);   // the other window (streams pop-out or main)
  // A linked streamer's tabs (windows/frames.js): a raid belongs to one tab. It's followed only from the tab you watch,
  // and only once none of their other accounts is live; otherwise that tab goes back to the streamer's own page.
  const stays = w => !!streamerOf(w.channel) && (optFor(w.channel, 'raid') === 'tell' || w.hiddenTab || frameOf(w).some(o => o !== w && infoFor(o.channel)?.live));
  const kept = all.filter(stays), old = all.filter(w => !kept.includes(w));
  kept.forEach(w => { putTabBack(w); if (!w.hiddenTab) raidSwitch(w, from, to); });
  // a tab of theirs you weren't watching raided: set to, the raided channel opens in a window of its own beside them
  const opened = !old.length && kept.some(w => w.hiddenTab) && optFor(from, 'raidOther') === 'open' && !wins.some(o => o.channel === to);
  if (opened) addParsed({ channel: to, only: null });
  if (streamerOf(from)) allRaid(from, to, opened || !!old.length);   // (a line in their ALL)
  // kept under the bell (the main window's, also for a raid the streams window followed); its pop-up where it switched
  const text = `${chLabel(from)} raided ${chLabel(to)}: switched to them`;
  addNote({ kind: 'raid', channel: to, from, label: chLabel(to) }, old.length ? text : null, `${chLabel(from)} raided ${chLabel(to)}`);
  if (!old.length) return;
  if (featuredCh === groupKey(from)) setFeatured(groupKey(to));     // the big one stays big
  const back = backTo(old);
  old.forEach(w => {
    if (!wins.some(o => o.kind === w.kind && o.channel === to)){
      const n = createWin({ kind: w.kind, channel: to, muted: w.muted, vol: w.vol }, { x: w.x, y: w.y, w: w.w, h: w.h });
      n.el.style.zIndex = w.el.style.zIndex; n.max = w.max;
      wins.splice(wins.indexOf(n), 1); wins.splice(wins.indexOf(w), 0, n);
      if (back && n.kind === 'stream') frameNote(n, ['Followed ', element('b', null, nameOf(from)), '\'s raid to ', element('b', null, chLabel(to))], [[`Back to ${nameOf(from)}`, () => back(n), true]], 30000);
    }
    frameOf(w).forEach(o => closeWin(o));                      // their other tabs (none of them live) go too
  });
  if (colOrder.includes(from)){
    layoutVars.colOrder = colOrder.includes(to) ? colOrder.filter(k => k !== from) : colOrder.map(k => k === from ? to : k);
    settings.set('colOrder', colOrder);
  }
  store.changed('wins'); save();
}

// The tab you watched raided while another of theirs is live: watch that one, and offer the raid
function raidSwitch(w, from, to){
  const live = frameOf(w).filter(o => o !== w && infoFor(o.channel)?.live), lead = live[0];
  const at = lead || w;
  if (lead && optFor(w.channel, 'ended') !== 'stay') showTab(lead);
  frameNote(at, [element('b', null, nameOf(from)), ' raided ', element('b', null, chLabel(to)), ` on ${PLAT_NAME[platOf(from)]}`],
    [[`Open ${chLabel(to)}`, () => addParsed({ channel: to, only: null }), true], ['Dismiss', () => {}]]);
}
// Following a raid closes the streamer's window: "Back to …" rebuilds it, with its tabs, where the raided one is
function backTo(old){
  const s = old.length && streamerOf(old[0].channel); if (!s) return null;
  const stream = old.find(w => w.kind === 'stream'), chs = stream ? frameOf(stream).map(o => o.channel) : [old[0].channel];
  const hasChat = old.some(w => w.kind === 'chat');
  return n => {
    const r = { x: n.x, y: n.y, w: n.w, h: n.h };
    wins.filter(o => o.channel === n.channel && (o.kind === 'stream' || o.kind === 'chat')).forEach(o => closeWin(o));
    const lead = openStreamer(chs[0], hasChat ? 'both' : 'stream', chs);
    if (lead) setRect(leaderOf(lead), r, true);
    store.changed('wins'); save();
  };
}

// You moved or resized a window yourself: don't auto-refit on window resize. Fitting in channels that open
// by themselves only works in Auto layout, so say so when it stops.
function arrangedByHand(){
  if (lastLayout === 'auto' && ROLE === 'main' && fitOn()) flash('Auto layout is off because you moved a window. Pick it again to fit in channels that go live.', { subject: 'layouts' });
  coreVars.lastLayout = null; store.changed('layout');
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  if (DESKTOP) fromApp('onRaid', (from, to) => followRaid(String(from), String(to), false));
  window.followRaid = followRaid; window.raidTarget = raidTarget;   // for the tests
}

export { arrangedByHand, init, watchRaid };
