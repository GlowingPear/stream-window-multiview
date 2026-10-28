import { clearAlert } from '../alerts/alerts.js';
import { allOn, allTabFor, setAll } from '../chat/all-chat.js';
import { newFor } from '../chat/new-messages.js';
import { closeWin } from '../chat/view-menu.js';
import { $, BAR, GAP, ROLE, colsMode, lastLayout, shownWins, wins } from '../core.js';
import { focusBoxAgent } from '../in-site/chat-box-focus.js';
import { VOL_JS } from '../in-site/volume.js';
import { chatRailLayout } from '../layout/chat-rail.js';
import { chatStageLayout } from '../layout/chat-stage.js';
import { columnsLayout } from '../layout/columns.js';
import { gameLayout } from '../layout/game-focus.js';
import { SH, SW, focusWin, setRect } from '../layout/geometry.js';
import { autoLayout, chatFocusLayout, tile } from '../layout/layouts.js';
import { readChat } from '../panels/bell/bell.js';
import { infoFor } from '../panels/channels/channels.js';
import { openLinkCard } from '../panels/linked/link-card.js';
import { save } from '../persistence.js';
import { accountsOf, linkOpt, linkedOn, listStreamers, nameOf, optFor, setMain, streamerOf, unlink } from '../platforms/linked.js';
import { PLAT_NAME, chLabel, externalFor, platOf, platform, srcFor } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { DESKTOP, keyName } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromSite } from '../shared/incoming.js';
import { closeOnOutside } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { winTimer } from '../shared/timers.js';
import { isPaused } from './pause.js';
import { askIn, focusView, loadView, runIn } from './view.js';
import { createWin, pushVol } from './windows.js';

/* ---- Tabs: one window for a linked streamer's sites (Settings › Linked channels) ----
   Each site stays a window of its own in wins (its view, timers, pause, likes), so everything that goes over the
   windows (YouTube's ad skip and auto-like, mentions and spam checks, raids, stuck players, Pear Drops' sign-out of
   Kick players) reaches the tabs you can't see without knowing about tabs. The windows of one frame share w.frame:
   the tab you're watching shows, the others (w.hiddenTab) sit under it, the same size, invisible but loaded and
   playing, muted. Layouts only see the windows that show (shownWins in core.js).
   Side by side (a frame's w.sbs): every tab shows, a column each, under the title bar of the one you watch.
   A site taken out into its own window (w.split) keeps one icon and a Join button. Every window's bar has its
   site's icon: tabs, or for one site the badge on its picture. */
const newFrameId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const membersOf = id => id ? wins.filter(o => o.frame === id) : [];
const frameOf = w => w.frame ? membersOf(w.frame) : [w];
const leaderOf = w => frameOf(w).find(o => !o.hiddenTab) || w;
const sbsOn = w => !!leaderOf(w).sbs;
// classes that belong to one window, not to the place on screen (which the tab you switch to takes over)
const OWN = /^(win|stream|chat|web|capture|plat-.*|tab-.*|sbs-.*|al-.*|al-brief)$/;
let closedTabs = {};     // frame id -> channels closed in it (+ brings them back)
// Other files change these through frameVars: a variable imported from another file can't be assigned to.
const frameVars = {
  get closedTabs(){ return closedTabs; }, set closedTabs(v){ closedTabs = v; },
};

// The sites a window's bar shows: the streamer's accounts (not ones closed in it), or just its own
function tabChannels(w){
  const lead = leaderOf(w);
  if (!w.channel || lead.split || !streamerOf(w.channel)) return [w.channel];
  const closed = closedTabs[lead.frame] || [];
  const mine = frameOf(w).map(o => o.channel);
  return accountsOf(w.channel).filter(ch => mine.includes(ch) || (!closed.includes(ch) && !splitOut(lead, ch)));
}
// A site of this streamer that's in a window of its own right now
const splitOut = (lead, ch) => wins.some(o => o.split && o.kind === lead.kind && o.channel === ch && o !== lead);
const memberFor = (w, ch) => frameOf(w).find(o => o.channel === ch) || null;
// A site known to be offline: its tab can't be clicked and isn't loaded (it opens by itself when it goes live).
// Not known yet (no live check so far) counts as watchable.
const siteOffline = ch => { const i = infoFor(ch); return !!i && !i.live && !i.missing; };
// A chat window with ALL: their Kick and Twitch chats can be read, sent on and watched while offline too (YouTube's
// offline channel has no live chat)
const allKeeps = (w, ch) => w.kind === 'chat' && platOf(ch) !== 'youtube' && allTabFor(leaderOf(w));
const tabLocked = (w, ch) => siteOffline(ch) && leaderOf(w).channel !== ch && !allKeeps(w, ch);
// Where Tab, ⌥← and ⌥→ go: the one you watch, and the others known to be live (not ones offline, not found, or
// not checked yet)
const tabStep = (w, ch) => leaderOf(w).channel === ch || !!infoFor(ch)?.live;
const stepChannels = w => tabChannels(w).filter(ch => tabStep(w, ch));
const tabNo = (w, ch) => tabChannels(w).indexOf(ch) + 1;
function tabTip(w, ch){
  const info = infoFor(ch), p = platOf(ch), m = memberFor(w, ch);
  const state = info ? (info.missing ? 'channel not found: it may have been renamed (right-click to fix or unlink it)' : info.live ? 'live' + (info.viewers ? ` · ${Number(info.viewers).toLocaleString()} watching` : '') : 'offline') : '';
  const alert = m && m.alert ? (m.alert.kind === 'spam' ? ' · likely spam' : ' · a message mentions you') : (m && newFor(ch) && m.kind === 'chat' ? ` · ${newFor(ch)} new` : '');
  const solo = tabChannels(w).length < 2;
  const how = tabLocked(w, ch) ? '\nIt opens here when it goes live.' : `\nClick to watch it here (${keyName('Alt+' + tabNo(w, ch))}). Middle-click closes it. Drag it out for its own window.`;
  return `${PLAT_NAME[p]}${w.kind === 'chat' ? ' chat' : ''}${state ? ' · ' + state : ''}${alert}` + (solo ? '' : how);
}
// The tabs (K / T / Y) on one window's bar
function renderSiteTabs(w){
  const box = w.el.querySelector('.ptabs'); if (!box) return;
  const lead = leaderOf(w), chs = tabChannels(w), solo = chs.length < 2, all = allOn(w);
  const closed = (closedTabs[lead.frame] || []).filter(ch => accountsOf(w.channel).includes(ch) && !memberFor(w, ch));
  const parts = chs.map(ch => {
    const m = memberFor(w, ch), info = infoFor(ch), p = platOf(ch), on = !all && m && (m === lead || (lead.sbs && m.kind === lead.kind));
    const cls = ['ptab', p, on ? 'on' : '', info && info.live ? 'live' : info ? 'off' : '', m && m.alert ? (m.alert.kind === 'spam' ? 'spam' : 'at') : '',
      m && m !== lead && m.kind === 'chat' && newFor(ch) ? 'new' : '', m && m.glowUntil > Date.now() ? 'newsite' : '', solo ? 'solo' : '',
      info && info.missing && streamerOf(ch) ? 'gone' : '', !solo && tabLocked(w, ch) ? 'locked' : ''].filter(Boolean).join(' ');   // gone: a renamed or deleted channel (Fix or Unlink in its menu)
    const name = tabTip(w, ch);
    const b = element('button', { class: cls, type: 'button', role: 'tab', 'aria-selected': String(!!on), tabindex: on ? '0' : '-1', 'aria-disabled': !solo && tabLocked(w, ch) && 'true',
      'aria-label': name.split('\n')[0], dataset: { ch, cmd: 'win.tab' } }, (PLAT_NAME[p] || '?')[0]);
    b.title = name;
    return b;
  });
  // ALL: the streamer's chats as one list (chat/all-chat.js), before the sites
  if (allTabFor(w)) parts.unshift(element('button', { class: 'ptab all' + (all ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(all), tabindex: all ? '0' : '-1',
    title: `Every site's chat together${all ? '' : ' (click to show)'}`, 'aria-label': 'All sites\' chats together', dataset: { all: '1', cmd: 'win.all' } }, 'ALL'));
  if (!lead.split && closed.length) parts.push(element('button', { class: 'ptab-add', type: 'button', title: 'Open a closed site again', 'aria-label': 'Open a closed site again', dataset: { cmd: 'win.tabAdd' }, html: icon.plus || '+' }));
  if (lead.split && streamerOf(w.channel)) parts.push(element('button', { class: 'ptab-join', type: 'button', title: 'Put it back as a tab in their window', dataset: { cmd: 'win.join' } }, element('i', { html: icon.link }), 'Join'));
  const sig = parts.map(b => b.outerHTML).join('');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren(...parts);
  box.classList.toggle('solo', parts.length === 1 && solo);    // just its own site: no tab, the badge on the bar's picture says it (frames.css)
  const x = w.el.querySelector('[data-a=close]');
  if (x && w === lead) x.title = frameOf(w).length > 1 ? `Close ${nameOf(w.channel)} (${frameOf(w).map(o => PLAT_NAME[platOf(o.channel)]).join(', ')})` : 'Close';
}
const renderFrame = w => frameOf(w).forEach(renderSiteTabs);
const renderAllSiteTabs = () => wins.forEach(renderSiteTabs);

// Hidden tabs sit under the one you watch, the same size; side by side they're columns under its bar.
function syncFrameRects(w){
  if (!w.frame || w.hiddenTab) return;
  const members = membersOf(w.frame).filter(o => o !== w);
  if (!members.length){ w.el.style.setProperty('--sbs-n', 1); w.el.classList.remove('sbs-lead'); return; }
  const cols = w.sbs ? [w, ...members.filter(o => o.kind === w.kind)] : [];
  w.el.style.setProperty('--sbs-n', cols.length || 1);
  w.el.classList.toggle('sbs-lead', cols.length > 1);
  members.forEach(o => {
    const i = cols.indexOf(o);
    o.el.classList.toggle('sbs-col', i > 0);
    o.el.classList.toggle('tab-hidden', i <= 0);
    const r = i > 0 ? { x: w.x + Math.round(w.w * i / cols.length), y: w.y + BAR, w: Math.round(w.w / cols.length), h: w.h - BAR } : { x: w.x, y: w.y, w: w.w, h: w.h };
    o.x = r.x; o.y = r.y; o.w = r.w; o.h = r.h;
    Object.assign(o.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', zIndex: i > 0 ? w.el.style.zIndex : String(Math.max(1, +w.el.style.zIndex - 1)) });
    o.el.setAttribute('aria-hidden', String(i <= 0));
  });
}
// The window shows that one of its tabs needs you (a mention or spam in a chat you can't see)
function syncFrameAlert(w){
  if (!w.frame) return;
  const lead = leaderOf(w), members = membersOf(w.frame);
  const top = members.reduce((a, o) => (o.alertLvl || 0) > (a ? a.alertLvl || 0 : 0) ? o : a, null);
  if (lead.alert) return renderFrame(w);
  lead.el.classList.remove('al-1', 'al-2', 'al-3');
  if (top && top.alertLvl){ lead.el.style.setProperty('--al', top.el.style.getPropertyValue('--al')); lead.el.classList.add('al-' + top.alertLvl); }
  renderFrame(w);
}

// Watch another of the frame's tabs: it takes the place, size, sound and look of the one you watched.
function showTab(w, { follow = true } = {}){
  const lead = leaderOf(w);
  if (!w.frame || lead === w){ if (w.hiddenTab) w.hiddenTab = false; return; }
  const moved = [...lead.el.classList].filter(c => !OWN.test(c));
  lead.el.classList.remove(...moved, 'al-1', 'al-2', 'al-3', 'sbs-lead'); w.el.classList.add(...moved);
  w.hiddenTab = false; lead.hiddenTab = true;
  w.sbs = lead.sbs; lead.sbs = false;
  w.max = lead.max; lead.max = null;
  w.el.style.zIndex = lead.el.style.zIndex;
  const i = wins.indexOf(lead), j = wins.indexOf(w); if (i >= 0 && j >= 0){ wins[i] = w; wins[j] = lead; }
  w.el.classList.remove('tab-hidden', 'sbs-col'); w.el.removeAttribute('aria-hidden');
  if (w.kind === 'stream'){
    w.vol = lead.vol; w.muted = lead.muted; lead.muted = true;
    pushVol(lead); pushVol(w);
    playQuality(lead); playQuality(w);
    if (linkOpt('jumpLive') && w.ready && !isPaused(w)) runIn(w.view, `${VOL_JS};window.__kmv.play()`);   // the sites are seconds apart: catch up to live
  }
  setRect(w, { x: lead.x, y: lead.y, w: lead.w, h: lead.h });
  clearAlert(w); syncFrameAlert(w);
  if (w.kind === 'chat') readChat(w.channel);                  // seen: its mentions
  if (lead.el.classList.contains('active')) focusWin(w);
  renderFrame(w);
  if (follow && w.kind === 'stream' && linkOpt('chatFollows')){
    const c = wins.find(o => o.kind === 'chat' && o.channel === w.channel && o.frame && o.hiddenTab && !sbsOn(o));
    if (c && !c.typing) showTab(c, { follow: false });
  }
  dropOfflineTabs();
  store.changed('wins', 'tabs'); save();
}
// Tabs you're not watching whose site is offline are closed (not loaded, and not counted as closed by you: the
// tab comes back when that site goes live). The one you watch stays, also offline, and so do the chats ALL reads.
function dropOfflineTabs(){
  const gone = wins.filter(o => o.frame && o.hiddenTab && siteOffline(o.channel) && membersOf(o.frame).length > 1 && !allKeeps(o, o.channel));
  if (!gone.length) return;
  const leads = new Set(gone.map(o => leaderOf(o)));
  gone.forEach(o => closeWin(o));
  leads.forEach(l => { if (wins.includes(l)){ syncFrameRects(l); renderFrame(l); } });
  store.changed('tabs'); save();
}
// Tabs you're not watching play at the site's lowest quality (Settings › Linked channels › Playing), where it has one
function playQuality(w){
  const js = w.kind === 'stream' && w.ready && w.view && platform(w.channel).lowQualityJs;
  if (js) runIn(w.view, js(!!w.hiddenTab && linkOpt('quality') === 'low'));
}
// Open a site of the streamer as a tab of this window (hidden, or the one you watch)
function addTab(w, ch, show){
  const lead = leaderOf(w);
  if (!lead.frame) lead.frame = newFrameId();
  const ex = memberFor(lead, ch);
  if (ex){ if (show) showTab(ex); return ex; }
  if (closedTabs[lead.frame]) closedTabs[lead.frame] = closedTabs[lead.frame].filter(c => c !== ch);
  const n = createWin({ kind: lead.kind, channel: ch, muted: true, vol: lead.vol, frame: lead.frame, hiddenTab: true }, { x: lead.x, y: lead.y, w: lead.w, h: lead.h });
  syncFrameRects(lead);
  if (show) showTab(n); else { renderFrame(lead); store.changed('tabs'); save(); }
  return n;
}
// Close one tab; the others stay. The last one closes the window.
function closeTab(w){
  const members = frameOf(w);
  if (members.length < 2){ closeWin(w); return; }
  if (!w.hiddenTab){
    const next = members.find(o => o !== w && infoFor(o.channel)?.live) || members.find(o => o !== w);
    showTab(next, { follow: false });
  }
  const id = w.frame;
  closedTabs[id] = [...new Set([...(closedTabs[id] || []), w.channel])];
  closeWin(w);
  renderFrame(membersOf(id)[0]);
  store.changed('tabs'); save();
}
// The window's own ✕: every tab
function closeFrame(w){ frameOf(w).forEach(o => closeWin(o)); }
// Take a tab out into its own window, next to this one
function splitTab(w, rect){
  const members = frameOf(w);
  if (members.length < 2 && !streamerOf(w.channel)) return;
  const lead = leaderOf(w);
  if (lead === w && members.length > 1) showTab(members.find(o => o !== w && infoFor(o.channel)?.live) || members.find(o => o !== w), { follow: false });
  const nl = leaderOf(members.find(o => o !== w) || w);
  w.frame = null; w.hiddenTab = false; w.sbs = false; w.split = true;
  w.el.classList.remove('tab-hidden', 'sbs-col', 'sbs-lead'); w.el.removeAttribute('aria-hidden');
  const r = rect || besideRect(nl);
  setRect(w, r, true); w.el.style.zIndex = String(+nl.el.style.zIndex + 1); focusWin(w);
  if (membersOf(nl.frame).length < 2 && nl !== w){ syncFrameRects(nl); }
  rememberSplit(w, true);
  renderAllSiteTabs(); relayout(); store.changed('wins', 'tabs'); save();
}
function besideRect(o){
  const wd = Math.min(o.w, Math.max(260, Math.round(o.w / 2)));
  let x = o.x + o.w + GAP; if (x + wd > SW()) x = Math.max(0, o.x - wd - GAP);
  return { x, y: o.y, w: wd, h: Math.min(o.h, SH() - o.y) };
}
// Put a site taken out back as a tab of the streamer's window (or of the other window of that kind)
function joinTab(w, into){
  const target = into || shownWins().find(o => o !== w && o.kind === w.kind && !o.split && o.channel && streamerOf(o.channel) === streamerOf(w.channel));
  w.split = false; rememberSplit(w, false);
  if (!target){ renderAllSiteTabs(); save(); return; }
  const lead = leaderOf(target);
  if (!lead.frame) lead.frame = newFrameId();
  w.frame = lead.frame; w.hiddenTab = true; w.max = null;
  if (w.kind === 'stream'){ w.muted = true; pushVol(w); }
  w.el.classList.remove('active');
  if (closedTabs[lead.frame]) closedTabs[lead.frame] = closedTabs[lead.frame].filter(c => c !== w.channel);
  syncFrameRects(lead);
  renderAllSiteTabs(); relayout(); store.changed('wins', 'tabs'); save();
}
// Two or three chats in one window, a column each (and back to tabs)
function setSideBySide(w, on){
  const lead = leaderOf(w);
  if (on){ accountsOf(lead.channel).forEach(ch => { if (infoFor(ch)?.live || memberFor(lead, ch)) addTab(lead, ch, false); }); }
  lead.sbs = !!on && frameOf(lead).length > 1;
  if (!lead.sbs) frameOf(lead).forEach(o => o.el.classList.remove('sbs-col'));
  syncFrameRects(lead); renderAllSiteTabs();
  store.changed('tabs'); save();
}
// A streamer's split-out sites are remembered (Back to …, opening them later)
function rememberSplit(w, on){
  const s = streamerOf(w.channel); if (!s) return;
  const t = settings.json('linkedTabs', {}) || {}, k = s.id + ':' + w.kind, list = new Set(t[k] || []);
  if (on) list.add(w.channel); else list.delete(w.channel);
  t[k] = [...list]; if (!t[k].length) delete t[k];
  settings.set('linkedTabs', t);
}
// Switch by number (⌥1–3) or next / previous (⌥← ⌥→, Tab in an empty chat box)
function switchTo(w, n){
  const chs = tabChannels(w), ch = chs[n - 1]; if (!ch || tabLocked(w, ch)) return false;
  const m = memberFor(w, ch);
  if (m) showTab(m); else addTab(w, ch, true);
  return true;
}
function stepTab(w, d){
  const all = tabChannels(w), chs = stepChannels(w); if (chs.length < 2) return false;   // (only to live ones)
  const i = chs.indexOf(leaderOf(w).channel);
  return switchTo(w, all.indexOf(chs[(i + d + chs.length) % chs.length]) + 1);
}

/* ---- the tab menu (right-click a tab) ---- */
let tabMenu, tabMenuFor = null;
function openTabMenu(w, ch, at){
  const lead = leaderOf(w), m = memberFor(w, ch), p = platOf(ch), name = nameOf(ch), info = infoFor(ch), locked = tabLocked(w, ch);   // offline: nothing that loads it
  const item = (ico, label, run, { key, danger, cmd } = {}) => element('button', { type: 'button', role: 'menuitem', class: danger ? 'danger' : '', dataset: { cmd: cmd || 'win.tab' },
    onclick: () => { tabMenu.hidden = true; run(); } }, element('span', { class: 'tm-ico', html: icon[ico] || '' }), element('span', 'tm-t', label), key && element('small', null, key));
  tabMenu.replaceChildren(...[   // (the items that don't apply are false or undefined: left out, not shown as text)
    element('div', { class: 'tm-head', role: 'presentation' }, `${name} on ${PLAT_NAME[p]}` + (info ? info.missing ? ' · not found' : info.live ? ' · live' : ' · offline' : '')),
    info && info.missing && item('link', 'Fix: pick its new name', () => { unlink(ch); openLinkCard(streamerOf(lead.channel) ? lead.channel : accountsOf(lead.channel)[0], { add: true }); }),
    !locked && item('play', 'Watch here', () => m ? showTab(m) : addTab(lead, ch, true), { key: keyName('Alt+' + tabNo(w, ch)) }),
    !locked && item('pop', 'Open in its own window', () => splitTab(m || addTab(lead, ch, false))),
    !locked && frameOf(lead).length + (m ? 0 : 1) > 1 && item('columns', lead.sbs ? 'Back to tabs' : 'Both side by side in this window', () => { if (!m) addTab(lead, ch, false); setSideBySide(lead, !lead.sbs); }),
    m && item('close', 'Close this tab', () => closeTab(m), { key: 'Middle-click' }),
    element('hr'),
    streamerOf(ch)?.main !== ch && item('star', `Make ${PLAT_NAME[p]} the main channel`, () => setMain(ch)),
    item('link', `Open in a browser on ${new URL(externalFor({ kind: w.kind, channel: ch })).hostname.replace(/^www\./, '')}`, () => {
      const u = externalFor(m || { kind: w.kind, channel: ch });
      if (DESKTOP && window.kmv.openExternal) window.kmv.openExternal(u); else window.open(u, '_blank');
    }),
    element('hr'),
    item('unlink', `Unlink from ${name}`, () => unlinkTab(ch), { danger: true })].filter(Boolean));
  tabMenu.hidden = false; tabMenuFor = at;
  const r = at.getBoundingClientRect();
  tabMenu.style.left = Math.max(8, Math.min(innerWidth - tabMenu.offsetWidth - 8, r.left)) + 'px';
  tabMenu.style.top = Math.min(innerHeight - tabMenu.offsetHeight - 8, r.bottom + 6) + 'px';
}
// Unlinking one account: its tabs go into windows of their own
function unlinkTab(ch){
  wins.filter(o => o.channel === ch && o.frame && membersOf(o.frame).length > 1).forEach(o => splitTab(o));
  wins.filter(o => o.channel === ch).forEach(o => { o.split = false; });
  unlink(ch);
  flash(`${chLabel(ch)} on ${PLAT_NAME[platOf(ch)]} is its own channel again`);
}
// The + after the tabs: the sites closed in this window
function openAddMenu(w, at){
  const lead = leaderOf(w), closed = (closedTabs[lead.frame] || []).filter(ch => !memberFor(lead, ch));
  tabMenu.replaceChildren(element('div', { class: 'tm-head', role: 'presentation' }, 'Open again'),
    ...closed.map(ch => element('button', { type: 'button', role: 'menuitem', disabled: siteOffline(ch), dataset: { cmd: 'win.tabAdd' }, onclick: () => { tabMenu.hidden = true; addTab(lead, ch, true); } },
      element('span', { class: 'tm-ico', html: `<i class="pi pi-${platOf(ch)}">${PLAT_NAME[platOf(ch)][0]}</i>` }), element('span', 'tm-t', `${PLAT_NAME[platOf(ch)]} · ${chLabel(ch)}`),
      siteOffline(ch) && element('small', null, 'offline'))));
  tabMenu.hidden = false; tabMenuFor = at;
  const r = at.getBoundingClientRect();
  tabMenu.style.left = Math.max(8, Math.min(innerWidth - tabMenu.offsetWidth - 8, r.left)) + 'px';
  tabMenu.style.top = Math.min(innerHeight - tabMenu.offsetHeight - 8, r.bottom + 6) + 'px';
}

/* ---- a short note inside a window (a tab ended, a raid, windows put together), with its buttons ---- */
function frameNote(w, parts, buttons = [], ms = 15000){
  const lead = leaderOf(w), body = lead.el.querySelector('.body');
  body.querySelector('.tab-note')?.remove();
  const note = element('div', { class: 'tab-note', role: 'status' }, element('div', 'tn-t', ...parts),
    ...buttons.map(([label, run, primary]) => element('button', { type: 'button', class: 'btn' + (primary ? ' primary' : ''), onclick: () => { note.remove(); run(); } }, label)));
  body.appendChild(note);
  winTimer(lead, 'tabNote', () => note.remove(), ms);
  return note;
}

/* ---- live changes: another account goes live (its tab), the one you watch ends (switch after 60 s) ---- */
let prevLive = {};
function onLive(){
  if (!linkedOn()){ prevLive = {}; return; }
  const now = {};
  listStreamers().forEach(s => s.accounts.forEach(ch => { const i = infoFor(ch); if (i) now[ch] = !!i.live; }));
  const told = new Set();
  shownWins().filter(o => (o.kind === 'stream' || o.kind === 'chat') && o.channel && streamerOf(o.channel) && !o.split).forEach(lead => {
    const s = streamerOf(lead.channel);
    // another of their channels went live
    accountsOf(lead.channel).forEach(ch => {
      if (!now[ch] || prevLive[ch] !== false || memberFor(lead, ch) || splitOut(lead, ch) || (closedTabs[lead.frame] || []).includes(ch)) return;
      const how = optFor(ch, 'alsoLive'); if (how === 'none') return;
      const n = addTab(lead, ch, how === 'switch');
      n.glowUntil = Date.now() + 4000; renderFrame(lead); setTimeout(() => renderFrame(lead), 4100);
      if (!told.has(s.id)){ told.add(s.id); flash(`${nameOf(ch)} is now live on ${PLAT_NAME[platOf(ch)]} too: it's a tab in their window`); }
    });
    // the stream you watch ended while another of theirs is live
    if (lead.kind !== 'stream' || now[lead.channel] !== false || prevLive[lead.channel] !== true) return;
    winTimer(lead, 'tabEnd', () => tabEnded(lead), lead.raided ? 0 : 60000);
  });
  prevLive = now;
  dropOfflineTabs();
}
function tabEnded(w){
  if (!wins.includes(w) || w.hiddenTab || infoFor(w.channel)?.live || optFor(w.channel, 'ended') === 'stay') return;
  const members = frameOf(w), s = streamerOf(w.channel);
  const live = accountsOf(w.channel).filter(ch => ch !== w.channel && infoFor(ch)?.live && !splitOut(w, ch));
  if (!live.length) return;
  const to = live.includes(s.main) ? s.main : live[0], m = members.find(o => o.channel === to);
  const was = w.channel, id = w.frame || null;
  if (m) showTab(m); else addTab(w, to, true);
  const leadNow = () => (id && membersOf(id).find(o => !o.hiddenTab)) || leaderOf(w);
  frameNote(leadNow(), [element('b', null, nameOf(was)), `'s ${PLAT_NAME[platOf(was)]} stream ended: watching ${PLAT_NAME[platOf(to)]} now`],
    [[`Stay on ${PLAT_NAME[platOf(was)]}`, () => { const l = leadNow(), back = memberFor(l, was); if (back) showTab(back); else addTab(l, was, true); }, true]]);   // (its tab was closed as offline: open again)
}

/* ---- opening a linked streamer: their sites as tabs in one window (or as Settings says) ---- */
// chs: the sites to open (default: the live ones, or the main channel). Returns the stream frame's window or null.
function openStreamer(ch, mode = 'both', chs){
  const s = streamerOf(ch); if (!s) return null;
  const all = accountsOf(ch).filter(c => !/^yt:v:/.test(c));
  const live = all.filter(c => infoFor(c)?.live);
  let want = chs && chs.length ? chs : live.length ? live : [s.main];
  const first = want.includes(s.main) ? s.main : want[0];
  want = [first, ...want.filter(c => c !== first && !siteOffline(c))];   // an offline site only when it's the one asked for
  const tabs = optFor(ch, 'streams') !== 'separate', chats = linkOpt('chats');
  let streamLead = null;
  const open = (kind, list, together, rectOf) => {
    let lead = shownWins().find(o => o.kind === kind && o.channel && !o.split && streamerOf(o.channel) === s);
    const made = [];
    list.forEach(c => {
      const ex = wins.find(o => o.kind === kind && o.channel === c);
      if (ex){ if (c === first && ex.hiddenTab) showTab(ex, { follow: false }); if (!lead) lead = leaderOf(ex); return; }
      if (together && lead){ made.push(addTab(lead, c, c === first)); return; }
      const w = createWin({ kind, channel: c }, rectOf(lead));
      made.push(w); if (together && !lead) lead = w;
    });
    return { lead, made };
  };
  const placeStream = () => defaultRect();
  if (mode !== 'chat'){ const r = open('stream', want, tabs, placeStream); streamLead = r.lead; if (r.lead) focusWin(leaderOf(r.lead)); }
  if (mode !== 'stream'){
    const cr = streamLead ? chatBeside(leaderOf(streamLead)) : { ...defaultRect(), w: 340 };
    const r = open('chat', want, chats !== 'separate', () => cr);
    if (chats === 'side' && r.lead && frameOf(r.lead).length > 1) setSideBySide(r.lead, true);
  }
  relayout(); store.changed('wins'); save();
  maybeTip(streamLead);
  return streamLead;
}
const defaultRect = () => {
  const n = shownWins().length, off = (n % 8) * 28;
  let vw = Math.min(640, SW() * 0.6), h = vw * 9 / 16 + BAR;
  if (h > SH() - 40){ h = SH() - 40; vw = (h - BAR) * 16 / 9; }
  return { x: 20 + off, y: 20 + off, w: vw, h };
};
function chatBeside(r){
  const cw = 340; let x = r.x + r.w + GAP;
  if (x + cw > SW()) x = Math.max(0, r.x - cw - GAP);
  return { x, y: r.y, w: cw, h: Math.max(r.h, Math.min(600, SH() - r.y - 20)) };
}
// The layout in use fits the windows in again
function relayout(){
  if (ROLE !== 'main' && ROLE !== 'streams') return;
  if (colsMode) columnsLayout();
  else if (lastLayout === 'auto') autoLayout();
  else if (lastLayout === 'tile') tile();
  else if (lastLayout === 'chatfocus') chatFocusLayout();
  else if (lastLayout === 'stage') chatStageLayout();
  else if (lastLayout === 'rail') chatRailLayout();
  else if (lastLayout === 'game') gameLayout();
}

/* ---- linking and unlinking with their windows open, and the switch ---- */
// Put each linked streamer's open windows together: one stream window and one chat window, each with tabs.
// Returns what was merged, for Undo.
function mergeOpen(only){
  const merged = [];
  if (!linkedOn()) return merged;
  ['stream', 'chat'].forEach(kind => {
    const groups = new Map();
    shownWins().filter(o => o.kind === kind && o.channel && !o.split && streamerOf(o.channel)).forEach(o => {
      const s = streamerOf(o.channel); if (only && s.id !== only) return;
      if (kind === 'stream' && optFor(o.channel, 'streams') === 'separate') return;
      if (kind === 'chat' && linkOpt('chats') === 'separate') return;
      (groups.get(s.id) || groups.set(s.id, []).get(s.id)).push(o);
    });
    groups.forEach(list => {
      if (list.length < 2) return;
      const s = streamerOf(list[0].channel);
      const into = list.find(o => o.channel === s.main) || list[0];
      list.filter(o => o !== into).forEach(o => { joinTab(o, into); merged.push(o); });
      if (kind === 'chat' && linkOpt('chats') === 'side') setSideBySide(into, true);
    });
  });
  return merged;
}
// Every frame back into one window per site (the switch turned off, a streamer unlinked)
function splitAll(test = () => true){
  const frames = [...new Set(wins.filter(o => o.frame && test(o)).map(o => o.frame))];
  frames.forEach(id => {
    const members = membersOf(id), lead = members.find(o => !o.hiddenTab) || members[0];
    let r = { x: lead.x, y: lead.y, w: lead.w, h: lead.h };
    members.filter(o => o !== lead).forEach(o => {
      o.frame = null; o.hiddenTab = false; o.sbs = false;
      o.el.classList.remove('tab-hidden', 'sbs-col'); o.el.removeAttribute('aria-hidden');
      r = besideRect(r); setRect(o, r);
    });
    lead.frame = null; lead.sbs = false; lead.el.classList.remove('sbs-lead');
    delete closedTabs[id];
  });
  wins.forEach(o => { if (o.split && !streamerOf(o.channel)) o.split = false; });
  renderAllSiteTabs(); relayout(); store.changed('wins', 'tabs'); save();
}
let lastStreamers = '';
function streamersChanged(){
  wins.forEach(w => { const b = w.el.querySelector('[data-a=link]'); if (b) b.hidden = !linkedOn(); });   // the ⋯ menu's Link channels…
  const sig = linkedOn() ? JSON.stringify(settings.json('streamers', [])) : '';
  wins.forEach(w => { if (w.channel) w.el.querySelector('.title').textContent = nameOf(w.channel); });   // the name shown
  if (sig === lastStreamers){ renderAllSiteTabs(); return; }
  lastStreamers = sig;
  // a frame whose sites aren't one streamer any more comes apart
  splitAll(o => !streamerOf(o.channel) || membersOf(o.frame).some(x => streamerOf(x.channel) !== streamerOf(o.channel)));
  const merged = mergeOpen();
  if (merged.length){
    const s = streamerOf(merged[0].channel), lead = leaderOf(merged[0]);
    const sites = [...new Set(frameOf(lead).map(o => PLAT_NAME[platOf(o.channel)]))];
    frameNote(lead, [element('b', null, nameOf(lead.channel)), `'s ${sites.join(' and ')} windows are together now: one stream, one chat`],
      [['Undo', () => splitAll(o => streamerOf(o.channel) === s), true]]);
    maybeTip(lead);
  }
  renderAllSiteTabs();
}

/* ---- the first time a window has tabs: how they work, once ---- */
function maybeTip(w){
  if (!w || settings.flag('linkedTip') || frameOf(w).length + tabChannels(w).length < 3 || ROLE !== 'main') return;
  const c = $('#tabTip'); if (!c) return;
  settings.set('linkedTip', true);
  c.querySelector('.tt-name').textContent = nameOf(w.channel);
  c.hidden = false;
  // beside the window when there's room, else in the stage's corner (as the window tips)
  const r = leaderOf(w).el.getBoundingClientRect(), cw = c.offsetWidth, sr = $('#stage').getBoundingClientRect();
  if (r.left - cw - 16 > sr.left){ c.style.left = (r.left - cw - 16) + 'px'; c.style.top = Math.max(sr.top + 8, r.top + 40) + 'px'; }
  else if (r.right + cw + 16 < innerWidth && !shownWins().some(o => o !== leaderOf(w) && o.x < r.right - sr.left + cw + 16 && o.x + o.w > r.right - sr.left)){ c.style.left = (r.right + 16) + 'px'; c.style.top = Math.max(sr.top + 8, r.top + 40) + 'px'; }
  else { c.style.left = (sr.left + 16) + 'px'; c.style.top = Math.max(sr.top + 8, innerHeight - c.offsetHeight - 16) + 'px'; }
  setTimeout(() => { c.hidden = true; }, 30000);
}

/* ---- Tab in an empty chat box switches site (⇧Tab back): the site uses Tab to complete names while you type ---- */
// Runs inside the chat page: says when Tab is pressed in an empty chat box, and whether you're typing (the chat
// follows the stream's tab only once its box is empty)
function tabKeyAgent(){
  if (window.__kmvTabKey) return;
  window.__kmvTabKey = { on: false };
  const box = t => t && (t.isContentEditable || /^(TEXTAREA|INPUT)$/.test(t.tagName));
  const empty = t => !(t.isContentEditable ? t.textContent : t.value).trim();
  window.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || !window.__kmvTabKey.on || !box(e.target) || !empty(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    console.log('__kmv:tab-key ' + JSON.stringify({ back: e.shiftKey }));
  }, true);
  let was = false;
  window.addEventListener('input', e => { if (!box(e.target)) return; const now = !empty(e.target); if (now !== was){ was = now; console.log('__kmv:typing ' + JSON.stringify({ on: now })); } }, true);
  window.addEventListener('focusout', e => { if (box(e.target) && was){ was = false; console.log('__kmv:typing {"on":false}'); } }, true);
}
// Tab only switches where it would: a chat of a linked streamer, with the setting on, and another of its sites live
// (otherwise Tab is the site's own again)
const tabKeyJs = w => `window.__kmvTabKey && (window.__kmvTabKey.on = ${!!(streamerOf(w.channel) && linkOpt('tabKey') && stepChannels(w).length > 1)})`;
function syncTabKeys(){ wins.forEach(w => { if (w.kind === 'chat' && w.ready && w.view) runIn(w.view, tabKeyJs(w)); }); }
// The chat Tab switched to: the keyboard goes to its chat box, so you can type straight away. in-site/chat-box-focus.js
// waits for the site to draw its box; a chat still loading gets it once it has, and one that loads another page first
// (Kick's Cloudflare check) on that page too (windows/views.js, for 30 s). Done once it has the box, or you pressed first.
function focusChatBox(w){
  if (w.hiddenTab || !platform(w.channel).chatBox?.box) return;
  w.focusBoxUntil = Date.now() + 30000;
  focusView(w.view, { take: true });   // (the keyboard is still in the chat you pressed Tab in)
  focusBoxNow(w);
}
function focusBoxNow(w){
  if (!w.view || w.hiddenTab || !(w.focusBoxUntil > Date.now())) return;
  // (not when the keyboard went somewhere else in the app meanwhile)
  const a = document.activeElement;
  if (a && a !== document.body && !frameOf(w).some(o => o.view === a)){ w.focusBoxUntil = 0; return; }
  focusView(w.view);
  if (w.ready) askIn(w.view, `(${focusBoxAgent})(${JSON.stringify(platform(w.channel).chatBox.box)})`).then(r => { if (r !== 'none') w.focusBoxUntil = 0; }, () => {});
}

/* ---- saving and restoring: the app's windows (persistence.js), saved layouts and undo (saved-layouts.js) ---- */
const frameFields = w => w.frame ? { frame: w.frame, hiddenTab: !!w.hiddenTab, sbs: !!w.sbs, ...(closedTabs[w.frame] ? { closed: closedTabs[w.frame] } : {}) } : w.split ? { split: true } : {};
function restoreFrames(data){
  data.forEach(d => { if (d.frame && Array.isArray(d.closed)) closedTabs[d.frame] = d.closed.filter(c => typeof c === 'string'); });
  wins.filter(w => w.frame && !w.hiddenTab).forEach(syncFrameRects);
  // a frame whose shown tab is gone: another one shows
  [...new Set(wins.filter(w => w.frame).map(w => w.frame))].forEach(id => { const m = membersOf(id); if (m.length && m.every(o => o.hiddenTab)){ m[0].hiddenTab = false; m[0].el.classList.remove('tab-hidden'); m[0].el.removeAttribute('aria-hidden'); syncFrameRects(m[0]); } });
  renderAllSiteTabs();
}
// pairs: [[w, its saved record]]: each window back in its frame, the tab you watched showing
function applyFrames(pairs){
  pairs.forEach(([w, x]) => {
    w.frame = x.frame || null; w.hiddenTab = !!(x.frame && x.hiddenTab); w.sbs = !!(x.frame && x.sbs && !x.hiddenTab); w.split = !!x.split;
    w.el.classList.toggle('tab-hidden', w.hiddenTab); w.el.classList.remove('sbs-col', 'sbs-lead');
    if (w.hiddenTab){ w.el.setAttribute('aria-hidden', 'true'); w.el.classList.remove('active'); if (w.kind === 'stream' && !w.muted){ w.muted = true; pushVol(w); } }
    else w.el.removeAttribute('aria-hidden');
    if (x.frame && Array.isArray(x.closed)) closedTabs[x.frame] = x.closed.slice();
  });
  restoreFrames([]);
}

/* ---- keeping the tabs where they belong when the sites move a view (a raid in a tab you don't follow) ---- */
function putTabBack(w){
  if (!w.view) return;
  loadView(w.view, srcFor(w));
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  tabMenu = element('div', { id: 'tabMenu', class: 'pop tab-menu', role: 'menu', hidden: true });
  document.body.appendChild(tabMenu);
  closeOnOutside(tabMenu, { button: () => tabMenuFor });
  // the tabs on every window's bar: click, middle-click, right-click, drag out, arrow keys
  const stage = $('#stage');
  const tabOf = e => { const b = e.target.closest('.ptab, .ptab-add, .ptab-join'); const el = b && b.closest('.win'); const w = el && wins.find(o => o.el === el); return b && w ? { b, w } : null; };
  stage.addEventListener('click', e => {
    const t = tabOf(e); if (!t) return;
    e.stopPropagation();
    if (t.b.classList.contains('ptab-add')) return openAddMenu(t.w, t.b);
    if (t.b.classList.contains('ptab-join')) return joinTab(t.w);
    if (t.b.dataset.all) return setAll(t.w, true);
    if (t.b.classList.contains('solo') || t.b.classList.contains('locked') || t.b.dragged) return;
    if (allOn(t.w)) setAll(t.w, false);              // a site's tab: its own chat again
    const ch = t.b.dataset.ch, m = memberFor(t.w, ch);
    if (m) showTab(m); else addTab(t.w, ch, true);
  });
  stage.addEventListener('auxclick', e => {
    const t = tabOf(e); if (!t || e.button !== 1 || t.b.classList.contains('solo')) return;
    e.preventDefault(); const m = memberFor(t.w, t.b.dataset.ch); if (m) closeTab(m);
  });
  stage.addEventListener('mousedown', e => { const t = tabOf(e); if (t && (e.button === 1 || t.b.classList.contains('locked'))) e.preventDefault(); });   // (no autoscroll; an offline tab doesn't take the focus)
  stage.addEventListener('contextmenu', e => {
    const t = tabOf(e); if (!t || !t.b.dataset.ch || !streamerOf(t.b.dataset.ch)) return;
    e.preventDefault(); openTabMenu(t.w, t.b.dataset.ch, t.b);
  });
  stage.addEventListener('pointerdown', e => {
    const t = tabOf(e); if (!t || e.button !== 0) return;
    e.stopPropagation();                         // (the bar doesn't drag the window from a tab)
    if (t.b.classList.contains('solo') || t.b.classList.contains('locked') || !t.b.dataset.ch) return;
    const sx = e.clientX, sy = e.clientY, b = t.b; b.dragged = false;
    const move = ev => { if (Math.abs(ev.clientY - sy) > 40 || Math.abs(ev.clientX - sx) > 80){ b.dragged = true; b.classList.add('dragging-out'); } };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      b.classList.remove('dragging-out');
      if (!b.dragged) return;
      const m = memberFor(t.w, b.dataset.ch) || addTab(t.w, b.dataset.ch, false);
      const sr = stage.getBoundingClientRect(), lead = leaderOf(t.w);
      splitTab(m, { x: Math.max(0, ev.clientX - sr.left - 60), y: Math.max(0, ev.clientY - sr.top - 12), w: Math.round(lead.w * 0.6), h: Math.round(lead.h * 0.6) });
      setTimeout(() => { b.dragged = false; }, 0);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }, true);
  stage.addEventListener('keydown', e => {
    const t = tabOf(e); if (!t || e.altKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;   // (⌥← ⌥→ are the window's, below: not twice)
    e.preventDefault(); stepTab(t.w, e.key === 'ArrowRight' ? 1 : -1);
    leaderOf(t.w).el.querySelector('.ptab.on')?.focus();
  });
  // ⌥1–3, ⌥← / ⌥→: the focused window's tabs
  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const w = shownWins().find(o => o.el.classList.contains('active')); if (!w || !streamerOf(w.channel)) return;
    const n = /^Digit([1-3])$/.exec(e.code);
    if (n ? switchTo(w, +n[1]) : e.key === 'ArrowRight' ? stepTab(w, 1) : e.key === 'ArrowLeft' ? stepTab(w, -1) : false) e.preventDefault();
  });
  $('#tabTip .tip-ok')?.addEventListener('click', () => { $('#tabTip').hidden = true; });
  if ($('#tabTip')){ $('#tabTip .tt-k1').textContent = keyName('Alt+1'); $('#tabTip .tt-k3').textContent = keyName('Alt+3'); }
  store.watch(['live', 'unread', 'names'], () => { onLive(); renderAllSiteTabs(); });
  store.watch('streamers', () => streamersChanged());
  store.watch(['streamers', 'tabs', 'wins', 'live'], () => syncTabKeys());
  fromSite('tab-key', (w, json) => { let d = {}; try { d = JSON.parse(json); } catch {} if (stepTab(w, d.back ? -1 : 1)) focusChatBox(leaderOf(w)); });
  fromSite('typing', (w, json) => { let d = {}; try { d = JSON.parse(json); } catch {} w.typing = !!d.on; });
  lastStreamers = linkedOn() ? JSON.stringify(settings.json('streamers', [])) : '';
  window.focusBoxAgent = focusBoxAgent;   // for the tests
  window.frames_ = { showTab, addTab, closeTab, splitTab, joinTab, setSideBySide, openStreamer, mergeOpen, splitAll, frameOf, stepTab, switchTo };   // for the tests
}

export { addTab, applyFrames, closedTabs, closeFrame, closeTab, focusBoxNow, focusChatBox, frameFields, frameNote,
  frameOf, init, joinTab, leaderOf, mergeOpen, openStreamer, playQuality, putTabBack, renderSiteTabs, restoreFrames,
  setSideBySide, showTab, splitTab, stepTab, switchTo, syncFrameAlert, syncFrameRects, tabChannels, tabKeyAgent,
  tabKeyJs, unlinkTab };
