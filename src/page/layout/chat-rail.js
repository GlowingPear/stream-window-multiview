import { clearNew, newCount } from '../chat/new-messages.js';
import { toNewest } from '../chat/stick-bottom.js';
import { GAP, ROLE, colsMode, coreVars, lastLayout, stage, wins } from '../core.js';
import { SH, SW } from './geometry.js';
import { applyRects, featuredCh, inColOrder, layoutChatsOnly, rowRects, setColsMode, sortedChats, tile, vidLabel } from './layouts.js';
import { save } from '../persistence.js';
import { chLabel } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { schedulePicks } from '../windows/channel-picker.js';
import { setViewScale } from '../windows/view.js';

/* ---- Chat Rail: every stream in a grid on the left, and a rail on the right with one chat in big, easy-to-read
   text. Tabs across the rail's top switch which chat it shows (or Show chat on a stream), with each chat's new
   messages and @ when it mentions you. The stream whose chat is shown is outlined. The other chats stay open out of
   sight under the shown one, so mentions, alerts and raids still work. */
const RAIL_SIZES = [1, 1.15, 1.3, 1.5, 1.75, 2];   // the rail chat, times the size of the other chats
const RAIL_W = 440, RAIL_MAX = 0.4, TABS_H = 38;
let railCh = null, railIdx = 2;
let tabsEl = null, alertObs = null, lastRailChat = null;

const isRail = () => ROLE === 'main' && !colsMode && lastLayout === 'rail';
const railChatOf = () => wins.find(w => w.kind === 'chat' && w.el.classList.contains('rl-chat')) || null;

// Where everything goes in the area: the streams in rows, the tabs and the chat in the rail
function railRects(nVids, X, Y, W, H){
  const rw = Math.min(RAIL_W, W * RAIL_MAX), lw = W - rw, rx = X + lw + GAP / 2;
  return {
    vids: rowRects(nVids, X, Y, lw, H, 16 / 9),
    tabs: { x: rx, y: Y + GAP / 2, w: rw - GAP, h: TABS_H },
    chat: { x: rx, y: Y + GAP / 2 + TABS_H, w: rw - GAP, h: H - GAP - TABS_H }
  };
}

function chatRailLayout(){
  if (ROLE !== 'main') return;
  if (colsMode) setColsMode(false);
  const vids = inColOrder(w => w.kind !== 'chat'), chats = sortedChats();
  if (!vids.length || !chats.length){ clearRailLook(); if (vids.length) tile(); else layoutChatsOnly(); return; }
  coreVars.lastLayout = 'rail';
  const chat = chats.find(c => c.channel === railCh) || chats.find(c => c.channel === featuredCh) || chats[0];
  railCh = chat.channel;
  const W = SW() - GAP, H = SH() - GAP, X = GAP / 2, Y = GAP / 2;
  const r = railRects(vids.length, X, Y, W, H);
  applyRects(vids, r.vids);
  // the other chats sit under the shown one, out of sight
  applyRects(chats, chats.map(() => r.chat));
  showRailLook(chat, chats, r);
  save(); schedulePicks();
}
// Show a channel's chat in the rail (remembered)
function showRailChat(ch){
  if (!wins.some(w => w.kind === 'chat' && w.channel === ch)) return;
  railCh = ch;
  settings.set('railCh', ch);
  chatRailLayout();
  store.changed('layout');
}

function showRailLook(chat, chats, r){
  document.body.classList.add('chatrail');
  wins.forEach(w => {
    w.el.classList.toggle('rl-chat', w === chat);
    w.el.classList.toggle('rl-off', w.kind === 'chat' && w !== chat);
    w.el.classList.toggle('rl-shown', w.kind !== 'chat' && !!w.channel && w.channel === chat.channel);
    if (w.kind === 'chat') setViewScale(w.view, w === chat ? RAIL_SIZES[railIdx] : 1);   // (this chat only: the site's zoom is shared)
    else addShow(w);
  });
  clearNew(chat);                                            // in the rail: read
  if (chat !== lastRailChat){ lastRailChat = chat; toNewest(chat); }     // switched to: its newest messages
  Object.assign(tabsEl.style, { display: 'flex', left: r.tabs.x + 'px', top: r.tabs.y + 'px', width: r.tabs.w + 'px', height: r.tabs.h + 'px' });
  renderTabs(chats, chat);
  watchAlerts();
}
function clearRailLook(){
  if (!document.body.classList.contains('chatrail')) return;
  document.body.classList.remove('chatrail');
  lastRailChat = null;
  const chat = railChatOf();
  wins.forEach(w => { w.el.classList.remove('rl-chat', 'rl-off', 'rl-shown'); w.el.querySelector('.rl-show')?.remove(); });
  // (going to Chat Stage, the chat there has its own size already)
  if (chat && !document.body.classList.contains('chatstage')) setViewScale(chat.view, 1);
  tabsEl.style.display = 'none';
  if (alertObs) alertObs.disconnect();
}
function updateRailLook(){
  if (!isRail()) return clearRailLook();
  const c = railChatOf(); if (c) setViewScale(c.view, RAIL_SIZES[railIdx]);   // another layout's look was just put away
}

// On a stream that has a chat, in its title bar (the corners of the picture are the player's): Show chat, or that its
// chat is the one shown
function addShow(w){
  let b = w.el.querySelector('.rl-show');
  if (!wins.some(c => c.kind === 'chat' && c.channel === w.channel)){ b?.remove(); return; }
  if (!b){
    b = element('button', { class: 'rl-show', onclick: e => { e.stopPropagation(); showRailChat(w.channel); } });
    b.addEventListener('pointerdown', e => e.stopPropagation());      // not a drag of the window
    w.el.querySelector('.bar .grab').after(b);
  }
  const shown = w.el.classList.contains('rl-shown');
  b.textContent = shown ? 'Chat shown' : 'Show chat';
  b.disabled = shown;
  b.title = shown ? `${vidLabel(w)}'s chat is in the rail` : `Show ${vidLabel(w)}'s chat in the rail`;
}

// The tabs: one per chat, with its new messages and @
function renderTabs(chats, chat){
  const list = tabsEl.querySelector('.rl-list');
  list.replaceChildren(...chats.map(c => element('button', {
    class: 'rl-tab' + (c === chat ? ' on' : ''), role: 'tab', 'aria-selected': String(c === chat), 'data-ch': c.channel,
    onclick: () => showRailChat(c.channel)
  }, element('span', 'rl-nm', chLabel(c.channel)), element('span', 'rl-n'), element('span', 'rl-at', '@'))));
  chats.forEach(syncTab);
  const on = list.querySelector('.rl-tab.on');
  if (on && (on.offsetLeft < list.scrollLeft || on.offsetLeft + on.offsetWidth > list.scrollLeft + list.clientWidth))
    list.scrollLeft = on.offsetLeft - 6;
  showSize();
}
function syncTab(c){
  const t = [...tabsEl.querySelectorAll('.rl-tab')].find(t => t.dataset.ch === c.channel); if (!t) return;
  const n = newCount(c), at = !!c.alertLvl, name = chLabel(c.channel);
  t.querySelector('.rl-n').textContent = n > 99 ? '99+' : String(n);
  t.classList.toggle('new', n > 0);
  t.classList.toggle('at', at);
  t.title = [t.classList.contains('on') ? `${name}'s chat` : `Show ${name}'s chat`,
    n ? `${n} new message${n === 1 ? '' : 's'}` : '', at ? 'something for you' : ''].filter(Boolean).join(' · ');
}
function watchAlerts(){
  if (!alertObs) alertObs = new MutationObserver(() => wins.forEach(w => { if (w.kind === 'chat') syncTab(w); }));
  alertObs.disconnect();
  wins.forEach(w => { if (w.kind === 'chat') alertObs.observe(w.el, { attributes: true, attributeFilter: ['class'] }); });
}

// The rail chat's text size, at the end of the tabs
function showSize(){
  tabsEl.querySelector('.rl-pct').textContent = Math.round(RAIL_SIZES[railIdx] * 100) + '%';
  tabsEl.querySelector('[data-s="-1"]').disabled = railIdx === 0;
  tabsEl.querySelector('[data-s="1"]').disabled = railIdx === RAIL_SIZES.length - 1;
}
function railSize(d){
  const i = Math.max(0, Math.min(RAIL_SIZES.length - 1, railIdx + d));
  if (i === railIdx) return;
  railIdx = i;
  settings.set('railZoom', railIdx);
  showSize();
  const c = railChatOf(); if (c) setViewScale(c.view, RAIL_SIZES[railIdx]);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  railCh = settings.text('railCh') || null;
  { const s = settings.get('railZoom'); if (s !== null && RAIL_SIZES[+s]) railIdx = +s; }
  const list = element('div', { class: 'rl-list', role: 'tablist', 'aria-label': 'Chats in the rail' });
  // a mouse wheel scrolls the tabs sideways when there are more than fit
  list.addEventListener('wheel', e => { if (e.deltaY && list.scrollWidth > list.clientWidth){ list.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  tabsEl = element('div', { id: 'railTabs' }, list,
    element('span', { class: 'rl-size', title: 'Size of the chat in the rail, compared with the other chats' },
      element('button', { 'data-s': '-1', 'aria-label': 'Smaller rail chat text', onclick: () => railSize(-1) }, 'A−'),
      element('em', 'rl-pct'),
      element('button', { 'data-s': '1', 'aria-label': 'Bigger rail chat text', onclick: () => railSize(1) }, 'A+')));
  stage.append(tabsEl);
  store.watch('layout', updateRailLook);
  // a window opened or closed: arrange the rail again
  store.watch('wins', () => { if (isRail()) chatRailLayout(); });
  // new messages counted for a chat out of sight (chat/new-messages.js): on its tab
  store.watch('unread', () => { if (isRail()) wins.forEach(w => { if (w.kind === 'chat') syncTab(w); }); });
  window.showRailChat = showRailChat;   // for the tests
}

export { chatRailLayout, init, isRail, showRailChat };
