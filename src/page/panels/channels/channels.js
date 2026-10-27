import { alerts } from '../../alerts/alerts.js';
import { $, ROLE, colsMode, lastLayout, modeSel, wins } from '../../core.js';
import { chatRailLayout } from '../../layout/chat-rail.js';
import { chatStageLayout } from '../../layout/chat-stage.js';
import { columnsLayout } from '../../layout/columns.js';
import { autoLayout, chatFocusLayout } from '../../layout/layouts.js';
import { locked } from '../../layout/lock.js';
import { addParsed } from '../../layout/placement.js';
import { activeP } from '../../layout/saved-layouts.js';
import { addNote, bell, dndOn, notes, saveNotes } from '../bell/bell.js';
import { appendFollowSugs } from './follow-suggestions.js';
import { esRefresh } from '../empty-stage/empty-stage.js';
import { openLinkCard } from '../linked/link-card.js';
import { openProfile } from '../profiles/profiles.js';
import { accountsOf, canLink, laterPair, link, linkedOn, listStreamers, nameOf, notSame, optFor, streamerName,
  streamerOf, suggestions } from '../../platforms/linked.js';
import { PLAT_NAME, chLabel, infoNames, normCh, platIcon, platOf, rememberNames } from '../../platforms/platforms.js';
import { element } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { panel } from '../../toolbar/toolbar.js';
import { openStreamer } from '../../windows/frames.js';

/* ---------- saved channels (always A–Z) + live status ---------- */
const SAVED = 'saved';   // (a saved setting: shared/settings.js)
const abc = list => [...new Set(list)].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true }));
let saved = [];
let liveInfo = {};                                  // channel -> { live, title, viewers, category, name, checked }
function gotLive(snap){ liveInfo = snap || {}; rememberNames(infoNames(liveInfo)); store.changed('live'); checkAutoOpen(); if (!wins.length) esRefresh(); }
let notifyAll = true, notifyOff = [];
function sendWatch(){
  if (DESKTOP && ROLE === 'main' && window.kmv.watchLive) window.kmv.watchLive({ channels: saved, notifyAll, away: !!alerts && alerts.live.notify === 'unfocused', off: notifyOff.map(c => String(c).toLowerCase()),
    groups: listStreamers().map(s => ({ name: streamerName(s), accounts: s.accounts })) });   // one notification for a linked streamer
}
function persistSaved(){
  saved = abc(saved);
  settings.set(SAVED, saved);
  store.changed('saved'); sendWatch();
}
function toggleSaved(ch){
  saved = saved.includes(ch) ? saved.filter(c => c !== ch) : [...saved, ch];
  persistSaved();
}
// A saved channel's live notification on or off (its bell in the Channels list, and the search box)
function setNotify(ch, on){
  notifyOff = on ? notifyOff.filter(c => c !== ch) : [...new Set([...notifyOff, ch])];
  settings.set('notifyOff', notifyOff);
  sendWatch(); store.changed('liveAlerts');
}
function refreshStars(){
  wins.forEach(w => {
    const b = w.el.querySelector('[data-a=star]'); if (!b) return;
    const on = saved.includes(w.channel);
    b.textContent = on ? '★' : '☆'; b.classList.toggle('on', on);
    b.title = on ? 'Remove from saved' : 'Save this channel';
  });
}
const infoFor = ch => liveInfo[normCh(ch)] || liveInfo[ch];
const liveNow = () => saved.filter(ch => infoFor(ch) && infoFor(ch).live);
// The saved channels as the Channels list shows them: a linked streamer once (with every account, saved or not),
// the others one each. [{ key, ch (the main account), chs, s (the streamer or null) }], A–Z by name.
function savedEntries(){
  const seen = new Map();
  for (const ch of saved){
    const s = streamerOf(ch), key = s ? 's:' + s.id : ch;
    if (!seen.has(key)) seen.set(key, s ? { key, ch: s.main, chs: accountsOf(ch), s } : { key, ch, chs: [ch], s: null });
  }
  return [...seen.values()].sort((a, b) => nameOf(a.ch).localeCompare(nameOf(b.ch), undefined, { sensitivity: 'base', numeric: true }));
}
const entryLive = e => e.chs.some(c => infoFor(c) && infoFor(c).live);
// Saved streamers live now (a linked one counts once)
const liveCount = () => savedEntries().filter(entryLive).length;
// Saved list tabs: All / Kick / Twitch / YouTube
let savedTab = 'all';
// Other files change these through channelVars: a variable imported from another file can't be assigned to.
const channelVars = {
  get saved(){ return saved; }, set saved(v){ saved = v; },
  get notifyAll(){ return notifyAll; }, set notifyAll(v){ notifyAll = v; },
  get notifyOff(){ return notifyOff; }, set notifyOff(v){ notifyOff = v; },
  get savedTab(){ return savedTab; }, set savedTab(v){ savedTab = v; },
};
const tabPlat = () => savedTab === 'all' ? 'kick' : savedTab;
// Channels that open by themselves when they go live
let autoOpen = [];
let autoFit = false;                  // Settings > Layouts: in Auto layout, fit them in as the last streams
function setAutoFit(on){         // Auto layout's own (Settings); the menu changes the layout in use
  autoFit = on;
  settings.set('autoFit', on);
  $('#autoFit').checked = on; $('#lmAutoFit').checked = fitOn();
}
const fitOn = () => { const ap = activeP(); return ap ? !!ap.autoFit : autoFit; };
const autoDone = new Set();            // opened during this live session (closing it won't make it reopen until the next time it goes live)
function toggleAutoOpen(ch){
  autoOpen = autoOpen.includes(ch) ? autoOpen.filter(c => c !== ch) : [...autoOpen, ch];
  settings.set('autoOpen', autoOpen);
  if (autoOpen.includes(ch)) checkAutoOpen(); else autoDone.delete(ch);
  store.changed('autoOpen');
}
/* A saved channel went live: kept under the bell (Live). Opening by itself (checkAutoOpen) and the went-live
   message can come in either order, so they share one notification. */
function liveNote(ch, info, auto){
  info = info || infoFor(ch) || {};
  // a linked streamer going live on several sites within 10 minutes: one note, updated ("is live on Kick and Twitch")
  const s = streamerOf(ch);
  if (s){
    const prev = notes.find(n => n.kind === 'live' && n.streamer === s.id && Date.now() - n.t < 10 * 60000);
    const by = { ...(prev && prev.viewersBy || {}), ...(info.viewers != null ? { [ch]: info.viewers } : {}) };
    if (prev){
      prev.sites = [...new Set([...(prev.sites || [prev.channel]), ch])]; prev.viewersBy = by; prev.at = { [prev.channel]: prev.t, ...(prev.at || {}), [ch]: (prev.at || {})[ch] || Date.now() };
      if (auto) prev.auto = true;
      saveNotes(); store.changed('notes');
      if (DESKTOP && window.kmv.notifyMessage && !auto && alerts.live.notify !== 'never' && !dndOn()) window.kmv.notifyMessage(`${nameOf(ch)} is live on ${prev.sites.map(c => PLAT_NAME[platOf(c)]).join(' and ')}`);
      return prev;
    }
    return addNote({ kind: 'live', channel: ch, streamer: s.id, sites: [ch], viewersBy: by, at: { [ch]: Date.now() }, label: nameOf(ch), title: info.title || '', category: info.category || '',
      ...(info.viewers != null ? { viewers: info.viewers } : {}), ...(auto ? { auto: true } : {}) }, auto ? null : `${nameOf(ch)} just went live on ${PLAT_NAME[platOf(ch)]}`);
  }
  const recent = notes.find(n => n.kind === 'live' && n.channel === ch && Date.now() - n.t < 10 * 60000);
  const data = { label: info.name || '', title: info.title || '', category: info.category || '', ...(info.viewers != null ? { viewers: info.viewers } : {}) };
  if (recent){
    Object.assign(recent, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '')), auto ? { auto: true } : {});
    saveNotes(); store.changed('notes');
    return recent;
  }
  return addNote({ kind: 'live', channel: ch, ...data, label: data.label || chLabel(ch), ...(auto ? { auto: true } : {}) },
    auto ? null : `${chLabel(ch)} just went live on ${PLAT_NAME[platOf(ch)]}`);
}
function checkAutoOpen(){
  if (ROLE !== 'main') return;
  const opened = [];
  autoOpen.forEach(ch => {
    if (!saved.includes(ch)) return;
    // a linked streamer: any of their accounts going live opens them (together as tabs, or each on its own)
    const s = streamerOf(ch);
    if (s && optFor(ch, 'autoOpen') === 'together'){
      const live = s.accounts.filter(c => infoFor(c) && infoFor(c).live);
      if (!live.length){ autoDone.delete('s:' + s.id); return; }
      if (autoDone.has('s:' + s.id)) return;
      autoDone.add('s:' + s.id);
      if (wins.some(w => w.kind === 'stream' && s.accounts.includes(w.channel))) return;   // already open: another site joins as a tab
      openStreamer(ch, 'both'); opened.push(s.main);
      return;
    }
    for (const c of s ? s.accounts : [ch]){
      const info = infoFor(c); if (!info) continue;
      if (!info.live){ autoDone.delete(c); continue; }
      if (autoDone.has(c)) continue;
      autoDone.add(c);
      if (wins.some(w => w.kind === 'stream' && w.channel === c)) continue;
      addParsed({ channel: c, only: null, separate: true }); opened.push(c);
    }
  });
  if (!opened.length) return;
  if (colsMode) columnsLayout(); else if (lastLayout === 'chatfocus') chatFocusLayout(); else if (lastLayout === 'stage') chatStageLayout(); else if (lastLayout === 'rail') chatRailLayout();
  else if (lastLayout === 'auto' && (fitOn() || locked())) autoLayout();     // new windows are last in the list, so they go last
  opened.forEach(ch => liveNote(ch, null, true));
  if (alerts.live.popup !== false && !dndOn()) flash(`Opened ${opened.map(nameOf).join(', ')} (just went live)`, true);
}
function fmtViewers(n){ if (n == null) return ''; n = Number(n) || 0; return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n); }
function updateSavedBadge(){
  const b = $('#savedBtn'); if (!b) return;
  const n = liveCount(), badge = b.querySelector('.sv-badge');
  badge.hidden = !n; badge.querySelector('b').textContent = n || '';
  badge.title = n ? `${n} saved channel${n > 1 ? 's' : ''} live now` : '';
}
// Names and pictures for the saved list, from what the app knows about each channel (src/main/profiles.js)
let svProf = {};
function loadSavedProfiles(){
  if (!DESKTOP || ROLE !== 'main' || !window.kmv.profileList) return;
  window.kmv.profileList(saved).then(l => { svProf = l || {}; if (!panel.hidden) renderSaved(); }).catch(() => {});
}
// "nightowl" -> NI, "ember_and_oak" -> EA (as on profiles)
const svInitials = n => { const w = String(n).replace(/^@/, '').split(/[\s_.\-]+/).filter(Boolean); return ((w.length > 1 ? w[0][0] + w[1][0] : String(n).slice(0, 2)) || '?').toUpperCase(); };
const svHue = ch => { let h = 0; for (const c of String(ch)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 35% 36%)`; };
// One row of the Channels list (a saved channel, or a suggestion from your follows): its picture (initials on its
// colour, its site's badge, its photo when known), its name, "open" when it's open here, what it's streaming,
// and room for numbers (meta) and buttons (acts) on the right.
function channelRow({ ch, name, site, live, photo, sub, subTitle, cls = '', title, picTitle }){
  const pic = element('span', { class: 'sv-av', title: picTitle, style: { '--c': svHue(ch) } },
    live ? svInitials(name) : name.replace(/^@/, '').slice(0, 1).toUpperCase());
  pic.insertAdjacentHTML('beforeend', platIcon(site));
  if (photo){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = photo; pic.appendChild(im); }
  const meta = element('div', 'sv-meta'), acts = element('div', 'sv-acts');
  const row = element('div', { class: `sv ${cls}${live ? 'live' : 'off'}`, title },
    pic,
    element('div', 'sv-txt',
      element('div', 'sv-line', element('span', 'nm', name), wins.some(w => w.channel === ch) && element('span', 'open', 'open')),
      element('div', { class: 'sv-sub', hidden: !sub, title: sub ? subTitle : null }, sub)),
    meta, acts);
  return { row, meta, acts };
}
const savedQuery = () => { const q = ($('#savedInput') || {}).value || ''; return /[/:]/.test(q) ? '' : q.trim().replace(/^@/, '').toLowerCase(); };
function renderSaved(){
  updateSavedBadge();
  const list = $('#savedList'); if (!list) return;
  list.innerHTML = '';
  const st = $('#liveStatus');
  const entries = savedEntries(), n = entries.filter(entryLive).length;
  if (st){
    const checked = Object.values(liveInfo).map(i => i.checked || 0);
    const last = checked.length ? Math.max(...checked) : 0;
    st.textContent = !saved.length ? '' : !DESKTOP ? `${entries.length} saved` : !last ? 'Checking who is live…'
      : `${n ? n + ' live now' : 'Nobody live right now'} · checked ${Math.max(0, Math.round((Date.now() - last) / 60000)) || '<1'} min ago`;
  }
  const nb = $('#spLive');
  if (nb){ nb.querySelector('svg')?.remove(); nb.insertAdjacentHTML('beforeend', notifyAll ? icon.bell : icon.bellOff); nb.title = notifyAll ? 'Notifying you when they go live (click to turn off)' : 'Notify me when they go live'; }
  const ol = $('#openLive'); if (ol){ ol.disabled = !n; ol.textContent = n ? `Open ${n} live` : 'Nobody live'; }
  const oa = $('#openAll'); if (oa) oa.textContent = saved.length ? `Open all ${entries.length}` : 'Open all';
  const so = $('#saveOpen');
  if (so){ const k = new Set(wins.filter(w => w.channel && !saved.includes(w.channel)).map(w => w.channel)).size; so.disabled = !k; so.innerHTML = `Save all open<small>${k ? k + ' not saved' : 'all saved'}</small>`; }
  if (!saved.length){ list.innerHTML = '<div class="sv-empty">Nothing saved yet. Click ☆ on any window, or type a name above.</div>'; appendFollowSugs(list, savedQuery()); return; }
  // tabs with counts (a streamer under every site it has an account on), then the list for the chosen tab
  const tabs = $('#savedTabs');
  if (tabs) tabs.querySelectorAll('button').forEach(b => {
    const t = b.dataset.t, list = t === 'all' ? entries : entries.filter(e => e.chs.some(c => platOf(c) === t));
    const nLive = list.filter(e => e.chs.some(c => (t === 'all' || platOf(c) === t) && infoFor(c) && infoFor(c).live)).length;
    b.classList.toggle('on', t === savedTab);
    b.innerHTML = `${t === 'all' ? 'All' : platIcon(t) + PLAT_NAME[t]} <em>${list.length}</em>${nLive ? `<i title="${nLive} live"></i>` : ''}`;
  });
  const q = savedQuery();
  const shown = e => (savedTab === 'all' || e.chs.some(c => platOf(c) === savedTab)) && (!q || [nameOf(e.ch), ...e.chs.map(chLabel)].some(x => x.toLowerCase().includes(q)));
  const liveList = entries.filter(e => shown(e) && entryLive(e)), offList = entries.filter(e => shown(e) && !entryLive(e));
  appendLinkSuggestion(list);
  if (!liveList.length && !offList.length){
    const e = document.createElement('div'); e.className = 'sv-empty';
    e.textContent = q ? `No saved channel matches “${q}”. Press Enter to open it.` : `No saved ${PLAT_NAME[savedTab]} channels yet. Type a name above.`;
    list.appendChild(e);
  }
  const head = (t, live) => { const h = document.createElement('div'); h.className = 'sv-sec' + (live ? ' live' : ''); h.textContent = t; list.appendChild(h); };
  [...liveList, ...offList].forEach((e, i) => {
    if (liveList.length && i === 0) head(`Live now · ${liveList.length}`, true);
    if (offList.length && i === liveList.length) head(`Offline · ${offList.length}`);
    list.appendChild(e.s ? streamerRow(e) : savedRow(e.ch));
    if (e.s && svExpanded.has(e.s.id)) list.appendChild(accountRows(e));
  });
  appendFollowSugs(list, q);
}
// The buttons on a saved channel's row: ⚡ opens by itself, 🔔 its live notification, its profile, ✕ remove
function rowButtons(acts, chs, { profile = true } = {}){
  const main = chs[0];
  if (DESKTOP && ROLE === 'main'){
    const aon = chs.some(c => autoOpen.includes(c)), on = notifyAll && chs.every(c => !notifyOff.includes(c));
    const au = element('button', { class: 'auto' + (aon ? ' on' : ''), html: icon.bolt,
      title: aon ? 'Opens by itself when it goes live (click to turn off)' : 'Open this channel by itself when it goes live',
      onclick: ev => { ev.stopPropagation(); setAutoOpen(chs, !aon); } });
    const bell = element('button', { class: 'bell' + (on ? ' on' : ''), html: on ? icon.bell : icon.bellOff, disabled: !notifyAll,
      title: !notifyAll ? 'Live notifications are off (turn them on above)' : on ? 'Notify me when this channel goes live (click to turn off)' : 'No notification for this channel (click to turn on)',
      onclick: ev => { ev.stopPropagation(); chs.forEach(c => setNotify(c, !on)); } });
    acts.append(au, bell);
  }
  if (profile && DESKTOP && ROLE === 'main' && !/^yt:v:/.test(main)){
    acts.appendChild(element('button', { class: 'prof', html: icon.user, title: `${nameOf(main)}'s profile: when they stream, past streams, your notes`,
      onclick: ev => { ev.stopPropagation(); panel.hidden = true; openProfile(main); } }));
  }
  acts.appendChild(element('button', { class: 'rm', html: icon.close, title: 'Remove from saved',
    onclick: ev => { ev.stopPropagation(); saved = saved.filter(c => !chs.includes(c)); persistSaved(); } }));
}
// ⚡ for several accounts at once (a linked streamer: any of them going live opens them)
function setAutoOpen(chs, on){
  autoOpen = on ? [...new Set([...autoOpen, chs[0]])] : autoOpen.filter(c => !chs.includes(c));
  settings.set('autoOpen', autoOpen);
  if (on) checkAutoOpen(); else chs.forEach(c => autoDone.delete(c));
  store.changed('autoOpen');
}
function savedRow(ch){
  const info = infoFor(ch), live = !!(info && info.live), prof = (svProf[ch] && svProf[ch].info) || {};
  const { row, meta, acts } = channelRow({ ch, name: chLabel(ch), site: platOf(ch), live, photo: prof.avatar,
    sub: live ? [...new Set([info.category, info.title].filter(Boolean))].join(' · ') : info && info.missing ? 'Channel not found' : '',
    subTitle: live ? info.title || '' : '', title: 'Add it (as set in the Stream / Chat dropdown)',
    picTitle: live ? 'Live now' : info ? (info.missing ? 'Channel not found' : 'Offline') : 'Checking…' });
  if (DESKTOP && ROLE === 'main'){
    if (autoOpen.includes(ch)) meta.insertAdjacentHTML('beforeend', `<span class="bolt" title="Opens by itself when it goes live">${icon.bolt}</span>`);
    if (notifyAll && notifyOff.includes(ch)) meta.insertAdjacentHTML('beforeend', `<span class="mute" title="No notification for this channel">${icon.bellOff}</span>`);
  }
  if (live && info.viewers != null) meta.insertAdjacentHTML('beforeend', `<span class="sv-view" title="Watching now">${fmtViewers(info.viewers)}</span>`);
  rowButtons(acts, [ch]);
  row.onclick = () => addParsed({ channel: ch, only: null });
  dragToLink(row, ch);
  return row;
}
/* ---- a linked streamer's row: its name, a tiny K / T / Y for each account (dimmed offline), each live site's
   viewers; ▾ shows the accounts under it, each with its own ⚡ / 🔔 / ✕ ---- */
const svExpanded = new Set();
function streamerRow(e){
  const { s, chs } = e, live = chs.filter(c => infoFor(c) && infoFor(c).live);
  const lead = live.includes(s.main) ? s.main : live[0] || s.main, info = infoFor(lead) || {}, prof = (svProf[s.main] && svProf[s.main].info) || {};
  const { row, meta, acts } = channelRow({ ch: s.main, name: nameOf(s.main), site: null, live: !!live.length, photo: prof.avatar, cls: 'sv-multi ',
    sub: live.length ? [...new Set([info.category, info.title].filter(Boolean))].join(' · ') : '', subTitle: info.title || '',
    title: 'Open them (as set in the Stream / Chat dropdown and Settings › Linked accounts)', picTitle: live.length ? 'Live now' : 'Offline' });
  row.querySelector('.sv-av .pi')?.remove();
  row.querySelector('.sv-line .nm').after(element('span', 'sv-sites', ...chs.map(c => siteIcon(c))));
  live.forEach(c => { const i = infoFor(c); if (i.viewers != null) meta.append(element('span', { class: 'sv-view sv-pv', title: `${PLAT_NAME[platOf(c)]}: watching now` }, siteIcon(c, true), fmtViewers(i.viewers))); });
  if (DESKTOP && ROLE === 'main' && chs.some(c => autoOpen.includes(c))) meta.insertAdjacentHTML('beforeend', `<span class="bolt" title="Opens by itself when any of them goes live">${icon.bolt}</span>`);
  const open = svExpanded.has(s.id);
  acts.prepend(element('button', { class: 'exp' + (open ? ' on' : ''), html: icon.chevDown, title: open ? 'Hide their accounts' : 'Their accounts', 'aria-expanded': String(open),
    onclick: ev => { ev.stopPropagation(); if (open) svExpanded.delete(s.id); else svExpanded.add(s.id); renderSaved(); } }));
  rowButtons(acts, [s.main, ...chs.filter(c => c !== s.main)]);
  row.onclick = () => openStreamer(s.main, modeSel.value);
  dragToLink(row, s.main);
  return row;
}
// A site's tiny icon, dimmed when that account is offline
function siteIcon(ch, plain){
  const p = platOf(ch), info = infoFor(ch);
  return element('i', { class: `pi pi-${p}${!plain && !(info && info.live) ? ' dim' : ''}`, title: PLAT_NAME[p] + (plain ? '' : info ? info.live ? ' · live' : ' · offline' : ''), 'aria-label': PLAT_NAME[p] }, PLAT_NAME[p][0]);
}
function accountRows(e){
  const box = element('div', 'sv-accs');
  e.chs.forEach(ch => {
    const info = infoFor(ch), live = !!(info && info.live);
    const acts = element('div', 'sv-acts');
    rowButtons(acts, [ch], { profile: false });
    box.appendChild(element('div', { class: 'sv sv-acc ' + (live ? 'live' : 'off'), title: `Open ${chLabel(ch)} on ${PLAT_NAME[platOf(ch)]}`, onclick: () => openStreamer(ch, modeSel.value, [ch]) },
      siteIcon(ch, true), element('span', 'nm', chLabel(ch)),
      live ? element('span', 'sv-acc-live', fmtViewers(info.viewers)) : element('span', 'sv-acc-off', info && info.missing ? 'Channel not found' : 'offline'),
      ch === e.s.main && element('span', 'sv-main', 'Main'), acts));
  });
  box.appendChild(element('button', { class: 'sv-addacc', type: 'button', dataset: { cmd: 'link.card' }, onclick: () => { openLinkCard(e.s.main, { add: true }); } }, '+ Link another account…'));
  return box;
}
/* ---- linking from the list: the top suggestion, and dragging one row onto another ---- */
function appendLinkSuggestion(list){
  const sg = suggestions().find(x => saved.includes(x.a) || saved.includes(x.b)); if (!sg) return;
  const card = element('div', { class: 'sv-sug', role: 'group', 'aria-label': 'A suggestion' },
    element('div', 'sv-sug-h', siteIcon(sg.a, true), siteIcon(sg.b, true), element('b', null, `${chLabel(sg.a)} on ${PLAT_NAME[platOf(sg.a)]} and on ${PLAT_NAME[platOf(sg.b)]}: the same streamer?`)),
    element('p', null, `${sg.why}. Linked, they're one row here, and their streams and chats open as tabs in one window.`),
    element('div', 'sv-sug-acts',
      element('button', { class: 'btn primary', type: 'button', dataset: { cmd: `link.sug:${sg.a}|${sg.b}` }, onclick: () => linkPair(sg.a, sg.b) }, 'Link them'),
      element('button', { class: 'btn', type: 'button', dataset: { cmd: `link.not:${sg.a}|${sg.b}` }, onclick: () => notSame(sg.a, sg.b) }, 'Not the same'),
      element('span', 'sv-sug-gap'),
      element('button', { class: 'btn', type: 'button', dataset: { cmd: `link.later:${sg.a}|${sg.b}` }, onclick: () => laterPair(sg.a, sg.b) }, 'Later')));
  list.appendChild(card);
}
// Link two accounts, saving the new one too (so its live status is watched), with a message
function linkPair(a, b){
  const s = link(a, b); if (!s) return null;
  if (saved.includes(a) || saved.includes(b)){ saved = [...new Set([...saved, ...s.accounts])]; persistSaved(); }
  flash(`Linked: ${nameOf(a)} on ${s.accounts.map(c => PLAT_NAME[platOf(c)]).join(', ')}`);
  return s;
}
let dragCh = null;
function dragToLink(row, ch){
  if (!linkedOn()) return;
  row.draggable = true;
  row.addEventListener('dragstart', ev => { dragCh = ch; row.classList.add('drag-src'); ev.dataTransfer.effectAllowed = 'link'; ev.dataTransfer.setData('text/plain', ch); });
  row.addEventListener('dragend', () => { dragCh = null; row.classList.remove('drag-src'); document.querySelectorAll('.sv.drop-link').forEach(r => r.classList.remove('drop-link')); });
  row.addEventListener('dragover', ev => { if (!dragCh || !canLink(ch, dragCh)) return; ev.preventDefault(); row.classList.add('drop-link'); row.dataset.drop = 'Drop to link: one streamer'; });
  row.addEventListener('dragleave', () => row.classList.remove('drop-link'));
  row.addEventListener('drop', ev => { ev.preventDefault(); row.classList.remove('drop-link'); if (dragCh && canLink(ch, dragCh)) linkPair(ch, dragCh); });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  try { saved = abc(settings.json(SAVED, [])); } catch {}
  notifyAll = settings.flag('notifyAll', true); notifyOff = settings.json('notifyOff', []);
  settings.onChange(SAVED, (_, v) => {            // a star clicked in the other window
    try { saved = abc(JSON.parse(v || '[]')); } catch {} store.changed('saved'); sendWatch();
  });
  store.watch(['saved', 'wins'], () => refreshStars());
  savedTab = settings.text('savedTab', 'all');
  autoOpen = settings.json('autoOpen', []);
  autoFit = settings.flag('autoFit');
  // The Channels list shows the saved channels, their live status and names, which are open, the Channels box's
  // search and tab, and each one's auto-open and live alert.
  store.watch(['saved', 'live', 'wins', 'names', 'channelsBox', 'autoOpen', 'liveAlerts', 'streamers'], () => renderSaved());
}

export { autoFit, autoOpen, channelRow, channelVars, fitOn, fmtViewers, gotLive, infoFor, init, linkPair, liveInfo,
  liveNote, liveNow, loadSavedProfiles, notifyAll, notifyOff, persistSaved, renderSaved, saved, savedTab, sendWatch,
  setAutoFit, setNotify, svHue, svInitials, svProf, tabPlat, toggleAutoOpen, toggleSaved };
