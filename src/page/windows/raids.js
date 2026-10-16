import '../chat/view-menu.js';   // runs after it (see app.js)
import { settings } from '../shared/settings.js';
import { ROLE, coreVars, lastLayout, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { chLabel, chatSrc, parseInput, platOf, ytVidOf } from '../platforms/platforms.js';
import { createWin } from './windows.js';
import { closeWin } from '../chat/view-menu.js';
import { updateEmpty } from '../layout/lock.js';
import { fitOn } from '../panels/channels/channels.js';
import { addNote } from '../panels/bell/bell.js';
import { flash } from '../shared/flash.js';
import { colOrder, featuredCh, layoutVars, setFeatured } from '../layout/layouts.js';
import { updateLayoutMenu } from '../layout/column-drag.js';
import { save } from '../persistence.js';

/* ---- Raids: when a chat or player moves to another channel, every window of the old channel follows ----
   On a raid, Kick's pop-out chat loads the new channel's page (and Twitch can move its chat or player), so the
   chat shows a whole site page and the stream stays on the old, now offline, channel. */
const KICK_NOT_CH = new Set(['login', 'signup', 'register', 'categories', 'category', 'browse', 'following', 'search', 'settings', 'dashboard',
  'subscriptions', 'messages', 'notifications', 'wallet', 'video', 'videos', 'clips', 'clip', 'terms-of-service', 'privacy-policy',
  'community-guidelines', 'dmca-policy', 'popout', 'api', 'auth', 'oauth', 'verify', 'stream', 'chatroom', 'help', 'about', 'careers', 'kick-creators', 'emotes']);
// The channel a window's new address is for (same site only), or null when it isn't a channel's chat, page or player.
function raidTarget(w, url){
  if (!w || !w.channel || (w.kind !== 'chat' && w.kind !== 'stream')) return null;
  const plat = platOf(w.channel);
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, ''), parts = u.pathname.split('/').filter(Boolean).map(x => x.toLowerCase());
  let ch = null;
  if (plat === 'kick'){
    if (w.kind === 'stream') ch = host === 'player.kick.com' && parts.length === 1 ? parts[0] : null;
    else if (host === 'kick.com'){
      if (parts[0] === 'popout' && parts[2] === 'chat') ch = parts[1];
      else if (parts.length === 1 || (parts.length === 2 && parts[1] === 'chatroom')) ch = parts[0];
    }
    if (ch && (!/^[a-z0-9_-]{3,25}$/.test(ch) || KICK_NOT_CH.has(ch))) ch = null;
  } else if (plat === 'twitch'){
    const one = parseInput(u.href);
    if (one && /^tw:/.test(one.channel || '')){
      const player = host === 'player.twitch.tv';
      if (w.kind === 'stream' ? player : !player && (one.only === 'chat' || parts.length === 1)) ch = one.channel.slice(3);
    }
    return ch ? 'tw:' + ch : null;
  }
  return ch;
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
if (DESKTOP && window.kmv.onRaid) window.kmv.onRaid((from, to) => followRaid(String(from), String(to), false));
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
  updateEmpty(); save();
}

// You moved or resized a window yourself: don't auto-refit on window resize. Fitting in channels that open
// by themselves only works in Auto layout, so say so when it stops.
function arrangedByHand(){
  if (lastLayout === 'auto' && ROLE === 'main' && fitOn()) flash('Auto layout is off because you moved a window. Pick it again to fit in channels that go live.', { subject: 'layouts' });
  coreVars.lastLayout = null; updateLayoutMenu();
}

export { arrangedByHand, watchRaid };
