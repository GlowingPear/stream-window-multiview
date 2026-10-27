import { alerts, saveAlerts } from '../alerts/alerts.js';
import { pollMentions, revealChat } from '../alerts/spam-alerts.js';
import { $, ROLE, colsMode, lastLayout, modeSel, wins } from '../core.js';
import { chatRailLayout } from '../layout/chat-rail.js';
import { chatStageLayout } from '../layout/chat-stage.js';
import { columnsLayout } from '../layout/columns.js';
import { gameLayout } from '../layout/game-focus.js';
import { SH, SW, clampPos, setRect } from '../layout/geometry.js';
import { autoLayout, chatFocusLayout, tile } from '../layout/layouts.js';
import { addParsed } from '../layout/placement.js';
import { spotlight } from '../layout/spotlight.js';
import { pushMyName, renderMentions, setMyTwitch } from '../panels/bell/all-notifications.js';
import { bellVars, mentOn, myName, myTwitch, renderBell, seeBell, setMyName } from '../panels/bell/bell.js';
import { channelVars, gotLive, liveNote, liveNow, loadSavedProfiles, notifyAll, persistSaved, renderSaved, saved,
  savedTab, sendWatch } from '../panels/channels/channels.js';
import { follows, followsApi, loadFollows } from '../panels/channels/follow-suggestions.js';
import { addPlat, openBoxVars, openFromBox } from '../panels/channels/open-box.js';
import { syncAlertControls } from '../panels/settings/alerts.js';
import { syncLiveAlerts } from '../panels/settings/notifications.js';
import { groupKey, sameStreamer, streamerOf } from '../platforms/linked.js';
import { PLAT_NAME } from '../platforms/platforms.js';
import { commands } from '../shared/commands.js';
import { DESKTOP } from '../shared/env.js';
import { setTb } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { closeOnOutside } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { MAC_BAR, showLights, updateFocusBtn } from './header.js';
import { layoutBtn, layoutMenu } from './layout-menu.js';
import { openStreamer } from '../windows/frames.js';

/* ---- The toolbar on top or on the left (Layout menu and Settings > Layouts > Toolbar), main window only ----
   On the left, Labels is a column of named rows, Icons only a slim column of icons, each with its name in its tooltip.
   On a Mac the slim column has no room for the lights: they show while the pointer is on the pear (body.bar-lights). */
let barPos = 'top', barLabels = true;
const hdrEl = document.querySelector('header');
const iconsLeft = () => document.body.classList.contains('bar-icons');
let barLightsT = 0;
function setBarLights(on){
  clearTimeout(barLightsT);
  const cls = document.body.classList;
  on = !!on && iconsLeft();
  if (cls.contains('bar-lights') === on) return;
  cls.toggle('bar-lights', on);
  showLights(!cls.contains('focus') || cls.contains('peek'));
}
// On the pear: they show. Over them the page doesn't hear the pointer at all, so they stay while it was last in the
// corner they sit in (LIGHTS_AT in main.js, three buttons to x 70); anywhere else they go after a moment.
const LIGHTS_CORNER = { x: 80, y: 44 };
// Open each of these channels that isn't open yet: a linked streamer once, as its window with tabs
function openEach(chs){
  const done = new Set();
  chs.forEach(ch => {
    const k = groupKey(ch); if (done.has(k)) return; done.add(k);
    if (wins.some(w => w.kind === 'stream' && sameStreamer(w.channel, ch))) return;
    if (streamerOf(ch)) openStreamer(ch, modeSel.value); else addParsed({ channel: ch, only: null });
  });
}
// A row of tabs (role="tablist"): click one, or the arrow keys, Home and End. onPick(name) shows its part.
// list.selectTab(name) picks one from code.
function wireTabs(list, onPick){
  const tabs = () => [...list.querySelectorAll('[role=tab]')];
  const pick = (b, focus) => {
    tabs().forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
    onPick(b.dataset.t);
    if (focus) b.focus();
  };
  list.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) pick(b); });
  list.addEventListener('keydown', e => {
    const all = tabs(), i = all.indexOf(document.activeElement); if (i < 0) return;
    const n = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i - 1 + all.length) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault(); pick(all[n], true);
  });
  list.selectTab = t => { const b = tabs().find(x => x.dataset.t === t); if (b) pick(b); };
}
function updateFold(){
  const b = $('#barFold');
  if (barLabels){ setTb(b, 'Collapse', 'fold'); b.title = 'Show icons only'; }
  else { setTb(b, 'Show names', 'unfold'); b.title = 'Show each button\'s name'; }
}
function applyToolbar(start){
  const left = ROLE === 'main' && barPos === 'left', cls = document.body.classList;
  cls.toggle('bar-left', left);
  cls.toggle('bar-icons', left && !barLabels);
  if (!cls.contains('bar-icons')) cls.remove('bar-lights');
  const tbv = barPos === 'top' ? 'top' : barLabels ? 'left' : 'icons';
  document.querySelectorAll('[data-tbv]').forEach(b => { b.classList.toggle('on', b.dataset.tbv === tbv); b.setAttribute('aria-checked', String(b.dataset.tbv === tbv)); });
  updateFold(); updateFocusBtn();
  if (start && !cls.contains('bar-icons')) return;     // the lights are as macOS opened the window
  showLights(!cls.contains('focus') || cls.contains('peek'));
  if (start) return;
  if (MAC_BAR && cls.contains('focus')) window.kmv.watchTop(true, left ? 'left' : 'top');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 220);   // the layouts fit the new space
}
function setToolbar(pos, labels){
  barPos = pos === 'left' ? 'left' : 'top'; barLabels = !!labels;
  settings.set('toolbar', { pos: barPos, labels: barLabels });
  ['#accountMenu', '#savedPanel', '#bellPanel', '#moreMenu'].forEach(sel => { $(sel).hidden = true; });   // they were placed for the old toolbar
  applyToolbar();
  // the Layout menu stays open (its Toolbar tab is where you chose it), beside the new toolbar
  if (!layoutMenu.hidden) requestAnimationFrame(() => { if (!layoutMenu.hidden) placeMenu(layoutMenu, layoutBtn); });
}
// A toolbar menu or panel opens under its button, or beside the left toolbar, next to its row.
function placeMenu(el, anchor, alignRight){
  const r = anchor.getBoundingClientRect();
  if (document.body.classList.contains('bar-left') && anchor.closest('header')){
    const bw = parseFloat(getComputedStyle(document.body).getPropertyValue('--barw')) || 180;
    el.style.right = 'auto';
    el.style.left = (bw + 6) + 'px';
    el.style.top = Math.max(8, Math.min(r.top, innerHeight - el.offsetHeight - 8)) + 'px';
    return;
  }
  el.style.top = '';
  if (alignRight){ el.style.left = 'auto'; el.style.right = Math.max(8, innerWidth - r.right) + 'px'; }
  else { el.style.right = ''; el.style.left = Math.max(12, Math.min(r.left, innerWidth - el.offsetWidth - 12)) + 'px'; }
}
// The toolbar item whose menu or panel is open is marked (and the column of names closes)
const OPENS = [['#savedPanel', '#savedBtn'], ['#accountMenu', '#loginBtn'], ['#layoutMenu', '#layoutBtn'], ['#bellPanel', '#bellBtn'], ['#moreMenu', '#moreBtn']];
function syncOpen(){
  OPENS.forEach(([m, b]) => { const on = !$(m).hidden; $(b).setAttribute('aria-expanded', on); });
}
let openObs;
let refitT;
let panel, savedBtn;
let spMenu, spMore;
const showSpMenu = on => { spMenu.hidden = !on; spMore.classList.toggle('on', on); spMore.setAttribute('aria-expanded', on); };

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  { const t = settings.json('toolbar', {}); if (t.pos === 'left') barPos = 'left'; if (t.labels === false) barLabels = false; }
  if (MAC_BAR) document.addEventListener('pointermove', e => {
    if (!iconsLeft()) return;
    const b = hdrEl.querySelector('.brand').getBoundingClientRect(), x = e.clientX, y = e.clientY;
    const onPear = x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    if (onPear) setBarLights(true);
    else if (document.body.classList.contains('bar-lights') && !(x <= LIGHTS_CORNER.x && y <= LIGHTS_CORNER.y)){ clearTimeout(barLightsT); barLightsT = setTimeout(() => setBarLights(false), 300); }
    else clearTimeout(barLightsT);
  });
  // Toolbar: Top, Left, or Left with icons only (Top keeps the last Labels / Icons only for going back to the left)
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-tbv]'); if (!b) return;
    const v = b.dataset.tbv;
    setToolbar(v === 'top' ? 'top' : 'left', v === 'top' ? barLabels : v === 'left');
  });
  $('#barFold').onclick = () => setToolbar(barPos, !barLabels);
  commands.add({ id: 'toolbar.fold', group: 'Toolbar', title: 'Collapse the left toolbar', sub: 'Icons only: the most room for the streams', words: ['icons only', 'names'], icon: 'fold',
    button: '#barFold', when: () => document.body.classList.contains('bar-left'), toggle: { get: () => !barLabels, set: on => setToolbar(barPos, !on) } });
  applyToolbar(true);

  openObs = new MutationObserver(syncOpen);
  OPENS.forEach(([m]) => openObs.observe($(m), { attributes: true, attributeFilter: ['hidden'] }));
  syncOpen();

  window.addEventListener('resize', () => {
    wins.forEach(w => { if (w.max) setRect(w, { x: 0, y: 0, w: SW(), h: SH() }); clampPos(w); });
    // If a layout button arranged things (and you haven't moved anything since), re-fit to the new size.
    clearTimeout(refitT);
    refitT = setTimeout(() => {
      if (lastLayout === 'chatfocus') chatFocusLayout();
      else if (lastLayout === 'stage') chatStageLayout();
      else if (lastLayout === 'rail') chatRailLayout();
      else if (lastLayout === 'tile') tile();
      else if (lastLayout === 'spot') spotlight();
      else if (lastLayout === 'auto') autoLayout();
      else if (lastLayout === 'game') gameLayout();
      else if (colsMode) columnsLayout();
    }, 250);
  });

  panel = $('#savedPanel'), savedBtn = $('#savedBtn');
  savedBtn.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden){
      store.changed('channelsBox'); loadSavedProfiles(); loadFollows();
      placeMenu(panel, savedBtn);
      $('#savedInput').focus();
      if (DESKTOP && ROLE === 'main' && window.kmv.checkLiveNow) window.kmv.checkLiveNow();
    }
  };
  closeOnOutside(panel, { button: savedBtn });
  spMenu = $('#spMenu'), spMore = $('#spMore');
  closeOnOutside(spMenu, { button: spMore, close: () => showSpMenu(false) });
  spMore.onclick = () => showSpMenu(spMenu.hidden);
  spMenu.addEventListener('click', e => { if (e.target.closest('button')) showSpMenu(false); });
  if (followsApi()){
    fromApp('onFollowsChanged', loadFollows);
    loadFollows();
    $('#followsOn').onclick = () => { if (window.kmv.followsSetOn) window.kmv.followsSetOn(!follows.on).then(loadFollows).catch(() => {}); };
  }
  $('#savedInput').addEventListener('input', e => { if (!e.target.value.trim()) openBoxVars.addPlat = null; store.changed('channelsBox'); });
  $('#spOpen').onclick = () => openFromBox(false);
  $('#spOpenSave').onclick = () => openFromBox(true);
  $('#spPlat').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]'); if (!b || b.disabled) return;
    openBoxVars.addPlat = b.dataset.p; store.changed('channelsBox');
    $(`#spPlat [data-p=${addPlat}]`).focus();
  });
  $('#spPlat').addEventListener('keydown', e => {      // arrow keys move along the sites
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
    const bs = [...$('#spPlat').querySelectorAll('button:not(:disabled)')]; if (bs.length < 2) return;
    e.preventDefault();
    const i = bs.findIndex(b => b.classList.contains('on'));
    bs[(i + d + bs.length) % bs.length].click();
  });
  $('#spAddRow').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('#spPlat')){ e.preventDefault(); openFromBox(false); } });
  $('#savedInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') openFromBox(false);
    if (e.key !== 'Escape') return;
    // Esc steps back: the ⋯ menu, then the search, then the panel (the page-wide Esc closes that one)
    if (!spMenu.hidden){ showSpMenu(false); e.stopPropagation(); }
    else if (e.target.value){ e.target.value = ''; openBoxVars.addPlat = null; store.changed('channelsBox'); e.stopPropagation(); }
    else panel.hidden = true;
  });
  $('#savedTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    channelVars.savedTab = b.dataset.t;
    settings.set('savedTab', savedTab);
    $('#savedInput').placeholder = savedTab === 'all' ? 'Search, or type a channel name or link to open it' : `Search, or type a ${PLAT_NAME[savedTab]} channel to open it`;
    store.changed('channelsBox');
  });
  if (DESKTOP && ROLE === 'main' && window.kmv.watchLive){
    $('#spLive').hidden = false; $('#openLive').hidden = false;
    const na = $('#notifyAll'); na.checked = notifyAll;
    na.addEventListener('change', () => {          // the same as Settings > Notifications > Saved channel went live
      alerts.live.notify = !na.checked ? 'never' : alerts.live.notify === 'never' ? 'always' : alerts.live.notify;
      saveAlerts(); syncLiveAlerts(); syncAlertControls();
    });
    fromApp('onLiveStatus', gotLive);
    fromApp('onWentLive', (ch, info) => liveNote(ch, info, false));
    fromApp('onOpenChannel', ch => addParsed({ channel: ch, only: null }));
    window.kmv.liveSnapshot().then(gotLive).catch(() => {});
    $('#openLive').onclick = () => {
      openEach(liveNow());
      if (colsMode) columnsLayout(); else if (lastLayout === 'chatfocus') chatFocusLayout(); else if (lastLayout === 'stage') chatStageLayout(); else if (lastLayout === 'rail') chatRailLayout(); else autoLayout();
    };
    setInterval(() => { if (!$('#savedPanel').hidden) renderSaved(); }, 30000);   // keep "checked x min ago" fresh
    sendWatch();
  }
  // The bell: the main window's (opening it shows the tab it was on; its rows lose their "new" mark next time).
  if (ROLE === 'main'){
    const mb = $('#bellBtn'), mp = $('#bellPanel');
    mb.hidden = false;
    mb.onclick = () => {
      mp.hidden = !mp.hidden;
      if (!mp.hidden){ renderBell(); placeMenu(mp, mb); seeBell(); }
    };
    closeOnOutside(mp, { button: mb });
    setInterval(() => { if (!mp.hidden) renderBell(); }, 30000);   // keep "x min ago" fresh
    renderBell();
  }
  if (DESKTOP && ROLE === 'main' && window.kmv.notifyMention){
    $('#mentOn').checked = mentOn; $('#mentUser').value = myName; $('#mentTwitch').value = myTwitch;
    $('#mentTwitch').addEventListener('change', e => setMyTwitch(e.target.value));
    $('#mentTwitch').addEventListener('keydown', e => { if (e.key === 'Enter') setMyTwitch(e.target.value); });
    $('#mentOn').addEventListener('change', e => {
      bellVars.mentOn = e.target.checked;
      settings.set('mentOn', mentOn);
      pushMyName(); renderMentions(); syncAlertControls();
    });
    $('#mentUser').addEventListener('change', e => setMyName(e.target.value));
    $('#mentUser').addEventListener('keydown', e => { if (e.key === 'Enter') setMyName(e.target.value); });
    const detect = async quiet => {
      $('#mentNote').textContent = 'Checking your Kick login…';
      const n = await window.kmv.detectMe().catch(() => null);
      const st = window.kmv.accountsStatus ? await window.kmv.accountsStatus().catch(() => null) : null;
      if (n) setMyName(n);
      if (st && st.twitch && (!quiet || !myTwitch)) setMyTwitch(st.twitch);
      if (!n && !(st && st.twitch)) $('#mentNote').textContent = quiet && (myName || myTwitch) ? '' : 'Couldn’t read them from your logins. Make sure you’re logged in, or type them in.';
      else if (n || (st && st.twitch)) $('#mentNote').textContent = '';
    };
    $('#mentDetect').onclick = () => detect(false);
    fromApp('onFocusChat', ch => revealChat(ch));
    setInterval(pollMentions, 1500);
    if (!myName || !myTwitch) setTimeout(() => detect(true), 4000);
    renderMentions();
  }
  $('#openAll').onclick = () => {
    openEach(saved);
    autoLayout();
  };
  // the search box's (Ctrl/⌘+K): the Channels panel's buttons and tabs
  const openChannelsAt = t => { $(`#savedTabs [data-t="${t}"]`).click(); if (panel.hidden) savedBtn.click(); };
  commands.add([
    { id: 'channels.openLive', group: 'Channels', title: 'Open live channels', sub: 'Every saved channel that is live right now', icon: 'live', button: '#openLive', offWhy: 'Nobody is live' },
    { id: 'channels.openAll', group: 'Channels', title: 'Open all saved channels', sub: 'Every saved channel, auto-arranged', icon: 'star', button: '#openAll', when: () => ROLE === 'main', disabled: () => !saved.length && 'Nothing saved yet' },
    { id: 'channels.saveOpen', group: 'Channels', title: 'Save all open', sub: 'Every channel open now, into your channels', icon: 'star', button: '#saveOpen', when: () => ROLE === 'main', offWhy: 'They\'re all saved' },
    { id: 'channels.follows', group: 'Channels', title: 'Suggest channels you follow', sub: 'While you type in Channels, the channels you follow and haven\'t saved', icon: 'star', button: '#followsOn',
      toggle: { get: () => follows.on, set: on => { if (window.kmv.followsSetOn) window.kmv.followsSetOn(on).then(loadFollows).catch(() => {}); } } },
    { id: 'channels.notifyAll', group: 'Channels', title: 'Notify me when they go live', sub: 'For every saved channel', words: ['live alerts'], icon: 'bell',
      when: () => DESKTOP && ROLE === 'main' && !!window.kmv.watchLive, toggle: { get: () => $('#notifyAll').checked, set: () => $('#notifyAll').click() } },
    ...['all', 'kick', 'twitch', 'youtube'].map(t => ({ id: 'channels.tab.' + t, kind: 'tab', group: 'Channels', title: 'Channels: ' + (t === 'all' ? 'All' : PLAT_NAME[t]),
      sub: t === 'all' ? 'Your channels' : `Your ${PLAT_NAME[t]} channels only`, icon: 'star', when: () => ROLE === 'main', run: () => openChannelsAt(t) }))
  ]);
  document.querySelectorAll('#savedTabs [data-t]').forEach(b => { b.dataset.cmd = 'channels.tab.' + b.dataset.t; });
  document.querySelectorAll('#importRow [data-imp]').forEach(b => { b.dataset.cmd = `account.${b.dataset.imp}.import`; });
  $('#notifyAll').dataset.cmd = 'channels.notifyAll';
  $('#saveOpen').onclick = () => {
    wins.forEach(w => { if (w.channel && !saved.includes(w.channel)) saved.push(w.channel); });
    persistSaved();
  };
}

export { init, panel, placeMenu, savedBtn, showSpMenu, wireTabs };
