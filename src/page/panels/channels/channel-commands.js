import { ROLE, modeSel, popped, wins } from '../../core.js';
import { addParsed } from '../../layout/placement.js';
import { mentCovered, mentMuted, mentOn, toggleChatMentions } from '../bell/bell.js';
import { autoOpen, fmtViewers, infoFor, notifyAll, notifyOff, saved, setNotify, svHue, svInitials, tabPlat,
  toggleAutoOpen, toggleSaved } from './channels.js';
import { follows } from './follow-suggestions.js';
import { openProfile } from '../profiles/profiles.js';
import { PLATFORMS, PLAT_NAME, chLabel, chNames, externalFor, modUrl, normCh, parseInput, platOf, platform } from '../../platforms/platforms.js';
import { commands } from '../../shared/commands.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { store } from '../../shared/store.js';
import { soon } from '../../shared/timers.js';
import { chPhoto } from '../../windows/channel-picker.js';
import { goToWin, winActions } from '../../windows/window-commands.js';

/* ---- The search box's (Ctrl/⌘+K) channels: saved (live first), open here, from your follows, names the app has
   seen, and whatever's typed or pasted ("Open “xyz”"). A channel named in full comes first, drawn big with its own
   row of buttons, which depend on the channel: not open (Stream + chat, Stream only, Chat only, Profile, Save…),
   open (Go to it, Make big, Mute, Reload…), unknown (Open, Open & save… after asking the sites whether it exists),
   or a YouTube channel that isn't live. Tab lists everything for it. */
let lastSite = '';                       // the site of the channel you last opened from the box (for a bare name)
const looked = new Map();                // a bare name -> { busy } or { items: what profile:lookup found } (kept for the session)
let lookFor = '';
const isOpen = ch => wins.some(w => w.channel === ch);
const canLook = () => !!(window.kmv && window.kmv.profileLookup);
const isFollowed = ch => follows.items.some(f => f.ch === ch);
const liveOf = ch => { const i = infoFor(ch) || (follows.live || {})[ch]; return i && i.live ? i : null; };
// how long it's been live: "for 2h 10m", "for 25m"
const liveFor = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)), h = Math.floor(m / 60); return t ? 'for ' + (h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`) : ''; };
const modeName = { both: 'Stream + chat', stream: 'Stream only', chat: 'Chat only' };
function openCh(ch, mode){
  lastSite = platOf(ch);
  addParsed({ channel: ch, only: null, ...(mode ? { mode } : {}) });
}
function inBrowser(ch){
  const url = externalFor({ channel: ch, kind: 'stream' });
  if (DESKTOP) window.kmv.openWindow(url, 1100, 700); else window.open(url, '_blank', 'width=1100,height=680');
}
function copyLink(ch){
  const url = platform(ch).pageUrl(ch, 'stream');
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => flash(`Copied ${url}`), () => flash(url));
}
const saveCh = ch => { if (!saved.includes(ch)) toggleSaved(ch); };
// what can be asked about a channel's windows
const winsOf = ch => wins.filter(w => w.channel === ch);
const streamOf = ch => wins.find(w => w.kind === 'stream' && w.channel === ch);
const canProfile = ch => DESKTOP && ROLE === 'main' && !!window.kmv.profileGet && !/^yt:v:/.test(ch);
const isMod = ch => wins.some(w => w.channel === ch && w.el.querySelector('[data-a=mod]:not([hidden])'));

// The big row's buttons: Enter runs the first, ← → pick one, Ctrl/⌘+1–9 run one
function buttonsFor(ch, known){
  const name = chLabel(ch), mode = modeSel ? modeSel.value : 'both', more = { label: 'More…', more: true };
  if (isOpen(ch)){
    const s = streamOf(ch), acts = winActions(s || winsOf(ch)[0]), act = k => acts.find(a => a.id.endsWith(':' + k));
    return [
      { label: 'Go to it', icon: 'arrowR', run: () => goToWin(s || winsOf(ch)[0]) },
      ...['big', 'mute', 'bar.reload', 'bar.pop'].map(act).filter(Boolean).map(a => ({ label: a.title, icon: a.icon, run: a.run })),
      { label: 'Close', icon: 'close', run: () => winsOf(ch).forEach(w => w.el.querySelector('[data-a=close]')?.click()) },
      s && !wins.some(w => w.kind === 'chat' && w.channel === ch) && { label: '+ Chat', icon: 'chat', run: () => s.el.querySelector('[data-a=chat]')?.click() },
      more
    ].filter(Boolean);
  }
  if (!known) return [
    { label: 'Open', icon: 'arrowR', run: () => openCh(ch) },
    { label: 'Open & save', icon: 'star', run: () => { saveCh(ch); openCh(ch); } },
    { label: 'Stream only', icon: 'pop', run: () => openCh(ch, 'stream') },
    { label: 'Chat only', icon: 'chat', run: () => openCh(ch, 'chat') },
    canProfile(ch) && { label: 'Look up profile', icon: 'user', run: () => openProfile(ch) },
    more
  ].filter(Boolean);
  if (platOf(ch) === 'youtube' && !liveOf(ch) && !/^yt:v:/.test(ch)) return [
    { label: 'Check now', icon: 'reload', run: () => { if (DESKTOP && window.kmv.checkLiveNow) window.kmv.checkLiveNow(); flash(`Checking whether ${name} is live…`); } },
    { label: 'Open its page', icon: 'pop', run: () => inBrowser(ch) },
    canProfile(ch) && { label: 'Profile', icon: 'user', run: () => openProfile(ch) },
    { label: saved.includes(ch) ? 'Saved' : 'Save', icon: 'star', run: () => toggleSaved(ch) },
    more
  ].filter(Boolean);
  return [
    { label: modeName[mode] || 'Stream + chat', icon: 'arrowR', run: () => openCh(ch) },
    mode !== 'stream' && { label: 'Stream only', icon: 'pop', run: () => openCh(ch, 'stream') },
    mode !== 'chat' && { label: 'Chat only', icon: 'chat', run: () => openCh(ch, 'chat') },
    mode !== 'both' && { label: 'Stream + chat', icon: 'colsview', run: () => openCh(ch, 'both') },
    canProfile(ch) && { label: 'Profile', icon: 'user', run: () => openProfile(ch) },
    { label: saved.includes(ch) ? 'Saved' : 'Save', icon: 'star', run: () => toggleSaved(ch) },
    saved.includes(ch) && DESKTOP && ROLE === 'main' && { label: autoOpen.includes(ch) ? 'Opens by itself' : 'Auto-open', icon: 'bolt', run: () => toggleAutoOpen(ch) },
    more
  ].filter(Boolean);
}
// Tab: everything for a channel
function channelMore(ch){
  const name = chLabel(ch), g = name, out = [];
  const add = (id, title, x) => out.push({ id: `ch:${ch}:${id}`, group: x.group || g, title, icon: 'point', ...x });
  add('both', 'Stream + chat', { group: 'Open', icon: 'colsview', run: () => openCh(ch, 'both') });
  add('stream', 'Stream only', { group: 'Open', icon: 'pop', run: () => openCh(ch, 'stream') });
  add('chat', 'Chat only', { group: 'Open', icon: 'chat', run: () => openCh(ch, 'chat') });
  if (popped && DESKTOP) add('streamsWin', 'In the streams window', { group: 'Open', icon: 'popwin', run: () => window.kmv.openStreams([{ channel: ch, vol: 0.8, muted: false }]) });
  add('site', `On ${platform(ch).name === 'Kick' ? 'kick.com' : platform(ch).name === 'Twitch' ? 'twitch.tv' : 'youtube.com'}`, { group: 'Open', icon: 'pop', sub: 'In a window of its own', run: () => inBrowser(ch) });
  if (canProfile(ch)) add('profile', 'Profile', { group: 'Channel', icon: 'user', sub: 'When they stream, past streams, your notes', run: () => openProfile(ch) });
  add('saved', 'Saved', { group: 'Channel', icon: 'star', sub: 'In your channels', toggle: { get: () => saved.includes(ch), set: () => toggleSaved(ch) } });
  if (DESKTOP && ROLE === 'main' && saved.includes(ch)){
    add('auto', 'Opens by itself when live', { group: 'Channel', icon: 'bolt', toggle: { get: () => autoOpen.includes(ch), set: () => toggleAutoOpen(ch) } });
    add('notify', 'Notify me when live', { group: 'Channel', icon: 'bell', disabled: () => !notifyAll && 'Live notifications are off (Channels › the bell)',
      toggle: { get: () => notifyAll && !notifyOff.includes(ch), set: on => setNotify(ch, on) } });
  }
  if (DESKTOP && ROLE === 'main' && mentOn && mentCovered(ch)) add('mentions', 'Mentions in its chat', { group: 'Channel', icon: 'at', toggle: { get: () => !mentMuted.has(ch), set: () => toggleChatMentions(ch) } });
  if (modUrl(ch) && isMod(ch)) add('mod', 'Mod view', { group: 'Channel', icon: 'mod', run: () => { const u = modUrl(ch); if (DESKTOP) window.kmv.openWindow(u, 1400, 900); else window.open(u, '_blank'); } });
  add('copy', 'Copy link', { group: 'Share', icon: 'copy', sub: platform(ch).pageUrl(ch, 'stream'), run: () => copyLink(ch) });
  for (const w of winsOf(ch)) out.push(...winActions(w));
  return out;
}

// One channel's item; known: saved, open, followed or named by a site
function channelItem(ch, { known = true, found = null } = {}){
  const name = chLabel(ch), live = liveOf(ch), sv = saved.includes(ch), open = isOpen(ch), fol = isFollowed(ch), info = infoFor(ch) || {};
  const state = live ? [live.category, live.title, liveFor(live.startedAt)].filter(Boolean).join(' · ') : !known ? (found || '') : info.missing ? 'Channel not found' : open ? 'Open here' : sv ? 'Offline' : fol ? 'You follow them · offline' : '';
  return { id: (known ? 'ch:' : 'open:') + ch, kind: 'channel', group: 'Channels', title: name, sub: [PLAT_NAME[platOf(ch)], state].filter(Boolean).join(' · '),
    heroSub: state || PLAT_NAME[platOf(ch)], words: [ch.replace(/^(tw:|yt:@?|yt:[vc]:)/, ''), PLAT_NAME[platOf(ch)]],
    avatar: chPhoto(ch), site: platOf(ch), hue: svHue(ch), initials: svInitials(name.replace(/^@/, '')), live: !!live, viewers: live && live.viewers != null ? fmtViewers(live.viewers) : null,
    tags: [sv && 'Saved', open && 'Open', !sv && fol && 'Following'].filter(Boolean),
    boost: (live ? 8 : 0) + (open ? 6 : 0) + (sv ? 5 : 0) + (fol ? 2 : 0),
    buttons: buttonsFor(ch, known), run: () => { const b = buttonsFor(ch, known)[0]; if (b) b.run(); }, verb: open ? 'Go to it' : 'Open',
    alt: () => openCh(ch, 'stream'), altLabel: 'stream only', more: () => channelMore(ch) };
}

// The channels there are to find, each once: saved, open, followed, names seen
function knownChannels(){
  const set = new Set([...saved, ...wins.map(w => w.channel).filter(Boolean), ...follows.items.map(f => f.ch), ...Object.keys(chNames)]);
  return [...set].filter(Boolean);
}
// Asking the sites about a bare name (400 ms after the last key, once per name)
let lookSoon;
function lookUpName(){
  const q = lookFor; if (!q || looked.has(q) || !canLook()) return;
  looked.set(q, { busy: true });
  window.kmv.profileLookup(q).then(items => { looked.set(q, { items: items || [] }); store.changed('palette'); }, () => { looked.set(q, { items: null }); store.changed('palette'); });
}
// Whatever's typed: a pasted link, or a name nobody saved, followed or opened
function typedItems(q){
  const raw = q.trim();
  if (!raw || /\s/.test(raw)) return [];
  const site = lastSite || tabPlat();
  const p = parseInput(raw, site);
  if (!p) return [];
  if (p.only === 'web' && !/^[\w-]+(\.[\w-]+)+/.test(new URL(p.url).hostname)) return [];      // (not a real address: "!!!")
  if (p.only === 'web') return [{ id: 'open:web', kind: 'channel', group: 'Open', title: `Open ${p.url.replace(/^https?:\/\//, '')}`, sub: 'As a web page in a window', icon: 'pop', matched: 100,
    run: () => addParsed(p) }];
  const known = new Set(knownChannels());
  const bare = /^[A-Za-z0-9_-]+$/.test(raw);
  // a link or @handle: that channel, first
  if (!bare) return [{ ...channelItem(p.channel, known.has(p.channel) ? {} : { known: false, found: 'From the link' }), matched: 100, boost: 50 }];
  const name = raw.toLowerCase();
  lookFor = name; if (!looked.has(name)) lookSoon();
  const look = looked.get(name), out = [];
  const sites = [site, ...Object.keys(PLATFORMS).filter(s => s !== site)];
  for (const s of sites){
    const ch = normCh(PLATFORMS[s].idFor(name));
    if (known.has(ch)) continue;
    const hit = look && look.items && look.items.find(x => x.ch === ch);
    const found = !look || look.busy ? (canLook() ? `Checking ${PLAT_NAME[s]}…` : '')
      : !look.items ? '' : hit ? `✓ Found on ${PLAT_NAME[s]}${hit.live ? ' · live' + (hit.live.viewers != null ? ' · ' + fmtViewers(hit.live.viewers) + ' watching' : '') : ''}`
      : `No ${PLAT_NAME[s]} channel called “${name}”`;
    if (look && look.items && !hit && s !== site) continue;           // the other sites only where it was found
    const it = channelItem(ch, { known: false, found });
    out.push({ ...it, title: s === site || hit ? name : `${name} on ${PLAT_NAME[s]}`, avatar: hit ? hit.avatar || '' : '', live: !!(hit && hit.live),
      viewers: hit && hit.live && hit.live.viewers != null ? fmtViewers(hit.live.viewers) : null, boost: (s === site ? 0 : -3) - (hit ? 0 : 40) });   // (below anything the words really name)
  }
  return out;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  lookSoon = soon(lookUpName, 400);
  commands.provide('channels', q => {
    const items = knownChannels().map(ch => channelItem(ch));
    // the empty box: saved channels that are live, by viewers
    if (!q) return items.filter(it => it.live && saved.includes(it.id.slice(3)))
      .sort((a, b) => (+(liveOf(b.id.slice(3)) || {}).viewers || 0) - (+(liveOf(a.id.slice(3)) || {}).viewers || 0)).slice(0, 5)
      .map(it => ({ ...it, group: 'Live now', keep: true }));
    return [...items, ...typedItems(q)];
  });
  // nothing found: open the words as a channel anyway
  commands.provide('channels.fallback', q => {
    const p = q && parseInput(q.trim(), lastSite || tabPlat());
    return p && p.channel ? [{ id: 'open:any', fallback: true, group: 'Nothing found', title: `Open “${q.trim()}” as a channel`, sub: `On ${PLAT_NAME[platOf(p.channel)]}`, icon: 'arrowR', run: () => openCh(p.channel) }] : [];
  });
}

export { init };
