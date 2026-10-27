import { ROLE, colsMode, modeSel, popped, wins } from '../../core.js';
import { buildCols } from '../../layout/columns.js';
import { colKey } from '../../layout/layouts.js';
import { addParsed } from '../../layout/placement.js';
import { mentCovered, mentMuted, mentOn, toggleChatMentions } from '../bell/bell.js';
import { autoOpen, fmtViewers, infoFor, notifyAll, notifyOff, saved, setNotify, svHue, svInitials, tabPlat,
  toggleAutoOpen, toggleSaved } from './channels.js';
import { follows } from './follow-suggestions.js';
import { openProfile } from '../profiles/profiles.js';
import { streamerName, streamerOf } from '../../platforms/linked.js';
import { PLATFORMS, PLAT_NAME, chLabel, chNames, externalFor, modUrl, normCh, parseInput, platOf, platform } from '../../platforms/platforms.js';
import { commands } from '../../shared/commands.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { store } from '../../shared/store.js';
import { soon } from '../../shared/timers.js';
import { chPhoto } from '../../windows/channel-picker.js';
import { isPaused } from '../../windows/pause.js';
import { goToWin, winActions } from '../../windows/window-commands.js';

/* ---- The search box's (Ctrl/⌘+K) channels: saved (live first), open here, from your follows, names the app has
   seen, and whatever's typed or pasted ("Open “xyz”"). A channel named in full comes first, drawn big with its own
   row of buttons, which depend on the channel: not open (Stream + chat, Stream only, Chat only, Profile, Save…),
   open (Go to it, Make big, Mute, Reload…), unknown (Open, Open & save… after asking the sites whether it exists),
   or a YouTube channel that isn't live. More… lists everything for it (Tab, on its row when it isn't big). */
let lastSite = '';
let typed = { name: '', site: '', picked: false };   // a bare name typed, and the site picked for it (K / T / Y)
const SITES = ['kick', 'twitch', 'youtube'];                       // the site of the channel you last opened from the box (for a bare name)
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

// The big row's buttons: Enter runs the first, ← → or Tab / ⇧Tab pick one, Ctrl/⌘+1–9 run the others, More… everything
function buttonsFor(ch, known){
  const name = chLabel(ch), more = { label: 'More…', more: true }, sv = saved.includes(ch);
  if (isOpen(ch)){
    const s = streamOf(ch), acts = winActions(s || winsOf(ch)[0]), act = k => acts.find(a => a.id.endsWith(':' + k));
    return [
      { label: 'Go to it', icon: 'arrowR', run: () => goToWin(s || winsOf(ch)[0]) },
      ...['big', 'mute', 'bar.reload', 'bar.pop'].map(act).filter(Boolean).map(a => ({ label: a.title, icon: a.icon, run: a.run })),
      { label: winsOf(ch).length > 1 ? 'Close both' : 'Close', icon: 'close', run: () => winsOf(ch).forEach(w => w.el.querySelector('[data-a=close]')?.click()) },
      s && !wins.some(w => w.kind === 'chat' && w.channel === ch) && { label: '+ Chat', icon: 'chat', run: () => s.el.querySelector('[data-a=chat]')?.click() },
      more
    ].filter(Boolean);
  }
  if (!known) return [
    { label: 'Open', icon: 'colsview', run: () => openCh(ch) },
    { label: 'Open & save', icon: 'star', run: () => { saveCh(ch); openCh(ch); } },
    { label: 'Stream only', icon: 'ytPlay', run: () => openCh(ch, 'stream') },
    { label: 'Chat only', icon: 'chat', run: () => openCh(ch, 'chat') },
    canProfile(ch) && { label: 'Look up profile', icon: 'user', run: () => openProfile(ch) }
  ].filter(Boolean);
  if (platOf(ch) === 'youtube' && !liveOf(ch) && !/^yt:v:/.test(ch)) return [
    { label: 'Check now', icon: 'reload', run: () => { if (DESKTOP && window.kmv.checkLiveNow) window.kmv.checkLiveNow(); flash(`Checking whether ${name} is live…`); } },
    { label: 'Open its page', icon: 'pop', run: () => inBrowser(ch) },
    canProfile(ch) && { label: 'Profile', icon: 'user', run: () => openProfile(ch) },
    { label: sv ? 'Saved' : 'Save', icon: 'star', on: sv, run: () => toggleSaved(ch) },
    more
  ].filter(Boolean);
  return [...openButtons(ch).map(o => ({ label: o.title, icon: o.icon, run: o.run })),
    canProfile(ch) && { label: 'Profile', icon: 'user', run: () => openProfile(ch) },
    { label: sv ? 'Saved' : 'Save', icon: 'star', on: sv, run: () => toggleSaved(ch) },
    sv && DESKTOP && ROLE === 'main' && { label: 'Auto-open', icon: 'bolt', on: autoOpen.includes(ch), run: () => toggleAutoOpen(ch) },
    more
  ].filter(Boolean);
}
// Stream + chat, Stream only, Chat only: the Channels box's choice first
function openButtons(ch){
  const mode = modeSel ? modeSel.value : 'both';
  const all = { both: { title: 'Stream + chat', icon: 'colsview' }, stream: { title: 'Stream only', icon: 'ytPlay' }, chat: { title: 'Chat only', icon: 'chat' } };
  return [mode, ...['both', 'stream', 'chat'].filter(m => m !== mode)].map(m => ({ mode: m, ...all[m], run: () => openCh(ch, m) }));
}
const siteHost = ch => ({ Kick: 'kick.com', Twitch: 'twitch.tv', YouTube: 'youtube.com' })[platform(ch).name];
// More… (or Tab on its row): everything for a channel (the big row's buttons with the same keys)
function channelMore(ch){
  const name = chLabel(ch), g = name, out = [], keyOf = {};
  buttonsFor(ch, true).forEach((b, i) => { if (i && i <= 9 && !b.more) keyOf[b.label] = 'Ctrl+' + i; });
  const add = (id, title, x) => out.push({ id: `ch:${ch}:${id}`, group: x.group || g, title, icon: 'point', keys: keyOf[title], ...x });
  openButtons(ch).forEach((o, i) => add(o.mode, o.title, { group: 'Open', icon: o.icon, sub: i === 0 ? 'As the Channels box is set' : '', run: o.run }));
  if (popped && DESKTOP) add('streamsWin', 'In the streams window', { group: 'Open', icon: 'popwin', sub: 'On your second monitor', run: () => window.kmv.openStreams([{ channel: ch, vol: 0.8, muted: false }]) });
  add('site', `On ${siteHost(ch)}`, { group: 'Open', icon: 'link', sub: 'In a window of its own', run: () => inBrowser(ch) });
  add('copy', 'Copy link', { group: 'Share', icon: 'copy', sub: platform(ch).pageUrl(ch, 'stream').replace(/^https?:\/\/(www\.)?/, ''), run: () => copyLink(ch) });
  if (canProfile(ch)) add('profile', 'Profile', { group: 'Channel', col: 1, icon: 'user', sub: 'When they stream, past streams, notes', run: () => openProfile(ch) });
  add('saved', 'Saved', { group: 'Channel', col: 1, icon: 'star', sub: () => saved.includes(ch) ? 'Remove from your channels' : 'Add to your channels', toggle: { get: () => saved.includes(ch), set: () => toggleSaved(ch) } });
  if (DESKTOP && ROLE === 'main' && saved.includes(ch)){
    add('auto', 'Opens by itself when live', { group: 'Channel', col: 1, icon: 'bolt', sub: 'Once per stream', toggle: { get: () => autoOpen.includes(ch), set: () => toggleAutoOpen(ch) } });
    add('notify', 'Notify me when live', { group: 'Channel', col: 1, icon: 'bell', disabled: () => !notifyAll && 'Live notifications are off (Channels › the bell)',
      toggle: { get: () => notifyAll && !notifyOff.includes(ch), set: on => setNotify(ch, on) } });
  }
  if (DESKTOP && ROLE === 'main' && mentOn && mentCovered(ch)) add('mentions', 'Mentions in its chat', { group: 'Channel', col: 1, icon: 'at', sub: 'Kick and Twitch', toggle: { get: () => !mentMuted.has(ch), set: () => toggleChatMentions(ch) } });
  if (modUrl(ch) && isMod(ch)) add('mod', 'Mod view', { group: 'Channel', col: 1, icon: 'mod', sub: 'You moderate this channel', run: () => { const u = modUrl(ch); if (DESKTOP) window.kmv.openWindow(u, 1400, 900); else window.open(u, '_blank'); } });
  for (const w of winsOf(ch)) out.push(...winActions(w).map(x => ({ ...x, col: 1 })));
  return out;
}

// what its open windows are: "stream + chat", and how the stream is ("stream muted · column 3")
function openKinds(ch){ const k = winsOf(ch).map(w => w.kind); return k.includes('stream') && k.includes('chat') ? 'stream + chat' : k.join(' + '); }
function openState(ch){
  const s = streamOf(ch); if (!s) return [];
  const col = colsMode ? buildCols().findIndex(c => c.key === colKey(s)) + 1 : 0;
  return [s.muted ? 'stream muted' : '', isPaused(s) ? 'paused' : '', col > 0 ? 'column ' + col : ''];
}
// One channel's item; known: saved, open, followed or named by a site
function channelItem(ch, { known = true } = {}){
  const name = chLabel(ch), live = liveOf(ch), sv = saved.includes(ch), open = isOpen(ch), fol = isFollowed(ch), info = infoFor(ch) || {};
  const site = PLAT_NAME[platOf(ch)], views = live && live.viewers != null ? fmtViewers(live.viewers) : null;
  const sub = live ? [site, sv ? 'Saved' : fol ? 'from your follows' : '', live.title || live.category]
    : [site, info.missing ? 'Channel not found' : '', sv ? 'Saved' : fol ? 'from your follows' : '', open ? 'open here' : known ? 'offline' : ''];
  const heroSub = live ? [site, live.title && { b: live.title }, live.category, views && { b: views, t: ' watching' }, live.startedAt && liveFor(live.startedAt).replace(/^for /, 'live ')]
    : [site, { b: info.missing ? 'not found' : 'offline' }, ...(open ? openState(ch) : [sv ? 'Saved' : fol ? 'You follow them' : ''])];
  const st = streamerOf(ch);   // a linked streamer's account: listed under the streamer (panels/linked/linked-commands.js)
  return { id: (known ? 'ch:' : 'open:') + ch, kind: 'channel', group: st ? `${streamerName(st)}'s accounts` : 'Channels', title: name.replace(/^@/, ''), sub, heroSub, words: [ch.replace(/^(tw:|yt:@?|yt:[vc]:)/, ''), site],
    avatar: chPhoto(ch), site: platOf(ch), hue: svHue(ch), initials: svInitials(name.replace(/^@/, '')), live: !!live, viewers: views,
    pills: open ? [{ text: 'Open · ' + openKinds(ch), accent: true }] : sv ? [{ text: 'Saved' }] : [],
    boost: (live ? 8 + Math.min(4, Math.log10(1 + (+live.viewers || 0))) : 0) + (open ? 6 : 0) + (sv ? 5 : 0) + (fol ? 2 : 0) - (st ? 6 : 0),   // (live: more watching, a little higher; under its streamer)
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
  if (!bare) return [{ ...channelItem(p.channel, known.has(p.channel) ? {} : { known: false }), heroSub: known.has(p.channel) ? undefined : [PLAT_NAME[platOf(p.channel)], 'from the link'], matched: 100, boost: 50 }];
  // a bare name: the sites are asked whether it exists (400 ms after the last key); found, it's a channel of its
  // own (its big row unless a known channel is, K / T / Y to pick the site); until then, or not found, "Open “x” as a channel"
  const name = raw.toLowerCase();
  if (typed.name !== name) typed = { name, site, picked: false };
  lookFor = name; if (!looked.has(name)) lookSoon();
  const look = looked.get(name), hits = (look && look.items) || [];
  const chOf = s => normCh(PLATFORMS[s].idFor(name)), hitOf = s => hits.find(x => x.ch === chOf(s));
  const found = SITES.filter(s => hitOf(s) && !known.has(chOf(s)));
  if (!typed.picked && found.length && !hitOf(typed.site)) typed.site = found[0];
  const sites = () => SITES.map(s => ({ p: s, letter: PLATFORMS[s].letter, name: PLAT_NAME[s], on: s === typed.site }));
  const step = d => { typed.site = SITES[(SITES.indexOf(typed.site) + d + SITES.length) % SITES.length]; typed.picked = true; };
  const pick = { pickSite: s => { typed.site = s; typed.picked = true; }, nextSite: () => step(1), prevSite: () => step(-1) };
  const ch = chOf(typed.site), hit = hitOf(typed.site);
  if (known.has(ch)) return [];
  const stateOf = s => !look || look.busy ? `${PLAT_NAME[s]}: checking…` : !look.items ? '' : hitOf(s) ? `${PLAT_NAME[s]}: found` : `not on ${PLAT_NAME[s]}`;
  if (found.length){
    const it = channelItem(ch, { known: false }), live = hit && hit.live;
    return [{ ...it, title: name, found: true, sites, ...pick, avatar: hit ? hit.avatar || '' : '', live: !!live, viewers: live && live.viewers != null ? fmtViewers(live.viewers) : null, pills: [],
      heroSub: [hit ? { ok: `✓ Found on ${PLAT_NAME[typed.site]}` } : `No ${PLAT_NAME[typed.site]} channel called “${name}”`, live && 'live', live && live.title,
        live && live.viewers != null && `${fmtViewers(live.viewers)} watching`, ...SITES.filter(s => s !== typed.site).map(stateOf)] }];
  }
  return [{ id: 'open:as', kind: 'channel', openAs: true, group: 'Open as a channel', title: `Open “${name}” as a channel`, icon: 'plus', matched: 30, boost: -40,
    sub: !look || look.busy ? (canLook() ? 'Checking Kick, Twitch and YouTube…' : 'Kick, Twitch or YouTube') : look.items ? 'Not found on Kick, Twitch or YouTube' : 'Kick, Twitch or YouTube',
    sites, ...pick, run: () => openCh(chOf(typed.site)) }];
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  lookSoon = soon(lookUpName, 400);
  commands.provide('channels', q => {
    const items = knownChannels().map(ch => channelItem(ch));
    // the empty box: saved channels that are live, by viewers
    if (!q){
      const live = items.filter(it => it.live && saved.includes(it.id.slice(3)));
      return live.sort((a, b) => (+(liveOf(b.id.slice(3)) || {}).viewers || 0) - (+(liveOf(a.id.slice(3)) || {}).viewers || 0)).slice(0, 5)
        .map(it => ({ ...it, group: 'Live now', groupNote: `${live.length} of your channels`, keep: true }));
    }
    return [...items, ...typedItems(q)];
  });
}

export { init };
