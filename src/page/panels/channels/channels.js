import '../../layout/lock.js';   // runs after it (see app.js)
import { settings } from '../../shared/settings.js';
import { $, ROLE, colsMode, lastLayout, wins } from '../../core.js';
import { icon } from '../../shared/icons.js';
import { DESKTOP } from '../../shared/env.js';
import { PLAT_NAME, chLabel, infoNames, normCh, platIcon, platOf, rememberNames } from '../../platforms/platforms.js';
import { locked } from '../../layout/lock.js';
import { appendFollowSugs } from './follow-suggestions.js';
import { addNote, bell, dndOn, notes, renderBell, saveNotes } from '../bell/bell.js';
import { alerts } from '../../alerts/alerts.js';
import { addParsed } from '../../layout/placement.js';
import { flash } from '../../shared/flash.js';
import { autoLayout, chatFocusLayout } from '../../layout/layouts.js';
import { paintBarAvatars } from '../../windows/channel-picker.js';
import { columnsLayout } from '../../layout/columns.js';
import { activeP } from '../../layout/saved-layouts.js';
import { esRefresh } from '../empty-stage/empty-stage.js';
import { panel } from '../../toolbar/toolbar.js';
import { openProfile } from '../profiles/profiles.js';

/* ---------- saved channels (always A–Z) + live status ---------- */
const SAVED = 'saved';   // (a saved setting: shared/settings.js)
const abc = list => [...new Set(list)].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true }));
let saved = [];
try { saved = abc(settings.json(SAVED, [])); } catch {}
let liveInfo = {};                                  // channel -> { live, title, viewers, category, name, checked }
function gotLive(snap){ liveInfo = snap || {}; rememberNames(infoNames(liveInfo)); renderSaved(); paintBarAvatars(); checkAutoOpen(); if (!wins.length) esRefresh(); }
let notifyAll = true, notifyOff = [];
notifyAll = settings.flag('notifyAll', true); notifyOff = settings.json('notifyOff', []);
function sendWatch(){
  if (DESKTOP && ROLE === 'main' && window.kmv.watchLive) window.kmv.watchLive({ channels: saved, notifyAll, away: !!alerts && alerts.live.notify === 'unfocused', off: notifyOff.map(c => String(c).toLowerCase()) });
}
function persistSaved(){
  saved = abc(saved);
  settings.set(SAVED, saved);
  renderSaved(); refreshStars(); sendWatch();
}
function toggleSaved(ch){
  saved = saved.includes(ch) ? saved.filter(c => c !== ch) : [...saved, ch];
  persistSaved();
}
settings.onChange(SAVED, (_, v) => {            // a star clicked in the other window
  try { saved = abc(JSON.parse(v || '[]')); } catch {} renderSaved(); refreshStars(); sendWatch();
});
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
// Saved list tabs: All / Kick / Twitch / YouTube
let savedTab = 'all';
// Other files change these through channelVars: a variable imported from another file can't be assigned to.
const channelVars = {
  get saved(){ return saved; }, set saved(v){ saved = v; },
  get notifyAll(){ return notifyAll; }, set notifyAll(v){ notifyAll = v; },
  get notifyOff(){ return notifyOff; }, set notifyOff(v){ notifyOff = v; },
  get savedTab(){ return savedTab; }, set savedTab(v){ savedTab = v; },
};
savedTab = settings.text('savedTab', 'all');
const tabPlat = () => savedTab === 'all' ? 'kick' : savedTab;
// Channels that open by themselves when they go live
let autoOpen = [];
autoOpen = settings.json('autoOpen', []);
let autoFit = false;                  // Settings > Layouts: in Auto layout, fit them in as the last streams
autoFit = settings.flag('autoFit');
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
  renderSaved();
}
/* A saved channel went live: kept under the bell (Live). Opening by itself (checkAutoOpen) and the went-live
   message can come in either order, so they share one notification. */
function liveNote(ch, info, auto){
  info = info || infoFor(ch) || {};
  const recent = notes.find(n => n.kind === 'live' && n.channel === ch && Date.now() - n.t < 10 * 60000);
  const data = { label: info.name || '', title: info.title || '', category: info.category || '', ...(info.viewers != null ? { viewers: info.viewers } : {}) };
  if (recent){
    Object.assign(recent, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '')), auto ? { auto: true } : {});
    saveNotes(); renderBell();
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
    const info = infoFor(ch); if (!info) return;
    if (!info.live){ autoDone.delete(ch); return; }
    if (autoDone.has(ch)) return;
    autoDone.add(ch);
    if (wins.some(w => w.kind === 'stream' && w.channel === ch)) return;
    addParsed({ channel: ch, only: null }); opened.push(ch);
  });
  if (!opened.length) return;
  if (colsMode) columnsLayout(); else if (lastLayout === 'chatfocus') chatFocusLayout();
  else if (lastLayout === 'auto' && (fitOn() || locked())) autoLayout();     // new windows are last in the list, so they go last
  opened.forEach(ch => liveNote(ch, null, true));
  if (alerts.live.popup !== false && !dndOn()) flash(`Opened ${opened.map(chLabel).join(', ')} (just went live)`, true);
}
function fmtViewers(n){ return n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n); }
function updateSavedBadge(){
  const b = $('#savedBtn'); if (!b) return;
  const n = liveNow().length, badge = b.querySelector('.sv-badge');
  badge.hidden = !n; badge.querySelector('b').textContent = n || '';
  badge.title = n ? `${n} saved channel${n > 1 ? 's' : ''} live now` : '';
}
// Names and pictures for the saved list, from what the app knows about each channel (src/profiles.js)
let svProf = {};
function loadSavedProfiles(){
  if (!DESKTOP || ROLE !== 'main' || !window.kmv.profileList) return;
  window.kmv.profileList(saved).then(l => { svProf = l || {}; if (!panel.hidden) renderSaved(); }).catch(() => {});
}
// "nightowl" -> NI, "ember_and_oak" -> EA (as on profiles)
const svInitials = n => { const w = String(n).replace(/^@/, '').split(/[\s_.\-]+/).filter(Boolean); return ((w.length > 1 ? w[0][0] + w[1][0] : String(n).slice(0, 2)) || '?').toUpperCase(); };
const svHue = ch => { let h = 0; for (const c of String(ch)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 35% 36%)`; };
const savedQuery = () => { const q = ($('#savedInput') || {}).value || ''; return /[/:]/.test(q) ? '' : q.trim().replace(/^@/, '').toLowerCase(); };
function renderSaved(){
  updateSavedBadge();
  const list = $('#savedList'); if (!list) return;
  list.innerHTML = '';
  const st = $('#liveStatus');
  const n = liveNow().length;
  if (st){
    const checked = Object.values(liveInfo).map(i => i.checked || 0);
    const last = checked.length ? Math.max(...checked) : 0;
    st.textContent = !saved.length ? '' : !DESKTOP ? `${saved.length} saved` : !last ? 'Checking who is live…'
      : `${n ? n + ' live now' : 'Nobody live right now'} · checked ${Math.max(0, Math.round((Date.now() - last) / 60000)) || '<1'} min ago`;
  }
  const nb = $('#spLive');
  if (nb){ nb.querySelector('svg')?.remove(); nb.insertAdjacentHTML('beforeend', notifyAll ? icon.bell : icon.bellOff); nb.title = notifyAll ? 'Notifying you when they go live (click to turn off)' : 'Notify me when they go live'; }
  const ol = $('#openLive'); if (ol){ ol.disabled = !n; ol.textContent = n ? `Open ${n} live` : 'Nobody live'; }
  const oa = $('#openAll'); if (oa) oa.textContent = saved.length ? `Open all ${saved.length}` : 'Open all';
  const so = $('#saveOpen');
  if (so){ const k = new Set(wins.filter(w => w.channel && !saved.includes(w.channel)).map(w => w.channel)).size; so.disabled = !k; so.innerHTML = `Save all open<small>${k ? k + ' not saved' : 'all saved'}</small>`; }
  if (!saved.length){ list.innerHTML = '<div class="sv-empty">Nothing saved yet. Click ☆ on any window, or type a name above.</div>'; appendFollowSugs(list, savedQuery()); return; }
  // tabs with counts, then the list for the chosen tab
  const tabs = $('#savedTabs');
  if (tabs) tabs.querySelectorAll('button').forEach(b => {
    const t = b.dataset.t, list = t === 'all' ? saved : saved.filter(c => platOf(c) === t);
    const nLive = list.filter(c => infoFor(c) && infoFor(c).live).length;
    b.classList.toggle('on', t === savedTab);
    b.innerHTML = `${t === 'all' ? 'All' : platIcon(t) + PLAT_NAME[t]} <em>${list.length}</em>${nLive ? `<i title="${nLive} live"></i>` : ''}`;
  });
  const q = savedQuery();
  const shown = c => (savedTab === 'all' || platOf(c) === savedTab) && (!q || chLabel(c).toLowerCase().includes(q));
  const liveList = liveNow().filter(shown), offList = saved.filter(ch => shown(ch) && !liveList.includes(ch));   // both already A–Z
  if (!liveList.length && !offList.length){
    const e = document.createElement('div'); e.className = 'sv-empty';
    e.textContent = q ? `No saved channel matches “${q}”. Press Enter to open it.` : `No saved ${PLAT_NAME[savedTab]} channels yet. Type a name above.`;
    list.appendChild(e);
  }
  const head = (t, live) => { const h = document.createElement('div'); h.className = 'sv-sec' + (live ? ' live' : ''); h.textContent = t; list.appendChild(h); };
  [...liveList, ...offList].forEach((ch, i) => {
    if (liveList.length && i === 0) head(`Live now · ${liveList.length}`, true);
    if (offList.length && i === liveList.length) head(`Offline · ${offList.length}`);
    const info = infoFor(ch), live = !!(info && info.live), prof = (svProf[ch] && svProf[ch].info) || {};
    const row = document.createElement('div'); row.className = 'sv ' + (live ? 'live' : 'off');
    row.title = 'Add it (as set in the Stream / Chat dropdown)';
    row.innerHTML = `<span class="sv-av" title="${live ? 'Live now' : info ? (info.missing ? 'Channel not found' : 'Offline') : 'Checking…'}"></span>
      <div class="sv-txt"><div class="sv-line"><span class="nm"></span></div><div class="sv-sub" hidden></div></div><div class="sv-meta"></div><div class="sv-acts"></div>`;
    const av = row.querySelector('.sv-av');
    av.style.setProperty('--c', svHue(ch)); av.textContent = live ? svInitials(chLabel(ch)) : chLabel(ch).replace(/^@/, '').slice(0, 1).toUpperCase(); av.insertAdjacentHTML('beforeend', platIcon(platOf(ch)));
    if (prof.avatar){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = prof.avatar; av.appendChild(im); }
    row.querySelector('.nm').textContent = chLabel(ch);
    if (wins.some(w => w.channel === ch)){ const o = document.createElement('span'); o.className = 'open'; o.textContent = 'open'; row.querySelector('.sv-line').appendChild(o); }
    const sub = row.querySelector('.sv-sub'), subText = live ? [...new Set([info.category, info.title].filter(Boolean))].join(' · ') : info && info.missing ? 'Channel not found' : '';
    if (subText){ sub.hidden = false; sub.textContent = subText; sub.title = live ? info.title || '' : ''; }
    const meta = row.querySelector('.sv-meta'), acts = row.querySelector('.sv-acts');
    if (DESKTOP && ROLE === 'main'){
      const aon = autoOpen.includes(ch), on = notifyAll && !notifyOff.includes(ch);
      if (aon) meta.insertAdjacentHTML('beforeend', `<span class="bolt" title="Opens by itself when it goes live">${icon.bolt}</span>`);
      if (notifyAll && !on) meta.insertAdjacentHTML('beforeend', `<span class="mute" title="No notification for this channel">${icon.bellOff}</span>`);
      const au = document.createElement('button'); au.className = 'auto';
      au.innerHTML = icon.bolt; au.classList.toggle('on', aon);
      au.title = aon ? 'Opens by itself when it goes live (click to turn off)' : 'Open this channel by itself when it goes live';
      au.onclick = e => { e.stopPropagation(); toggleAutoOpen(ch); };
      acts.appendChild(au);
      const bell = document.createElement('button'); bell.className = 'bell';
      bell.innerHTML = on ? icon.bell : icon.bellOff; bell.classList.toggle('on', on);
      bell.title = !notifyAll ? 'Live notifications are off (turn them on above)' : on ? 'Notify me when this channel goes live (click to turn off)' : 'No notification for this channel (click to turn on)';
      bell.disabled = !notifyAll;
      bell.onclick = e => {
        e.stopPropagation();
        notifyOff = notifyOff.includes(ch) ? notifyOff.filter(c => c !== ch) : [...notifyOff, ch];
        settings.set('notifyOff', notifyOff);
        sendWatch(); renderSaved();
      };
      acts.appendChild(bell);
    }
    if (live && info.viewers != null) meta.insertAdjacentHTML('beforeend', `<span class="sv-view" title="Watching now">${fmtViewers(info.viewers)}</span>`);
    if (DESKTOP && ROLE === 'main' && !/^yt:v:/.test(ch)){
      const pb = document.createElement('button'); pb.className = 'prof'; pb.innerHTML = icon.user;
      pb.title = `${chLabel(ch)}'s profile: when they stream, past streams, your notes`;
      pb.onclick = e => { e.stopPropagation(); panel.hidden = true; openProfile(ch); };
      acts.appendChild(pb);
    }
    const rm = document.createElement('button'); rm.className = 'rm'; rm.innerHTML = icon.close; rm.title = 'Remove from saved';
    rm.onclick = e => { e.stopPropagation(); toggleSaved(ch); };
    acts.appendChild(rm);
    row.onclick = () => addParsed({ channel: ch, only: null });
    list.appendChild(row);
  });
  appendFollowSugs(list, q);
}

export { autoFit, channelVars, fitOn, fmtViewers, gotLive, infoFor, liveInfo, liveNote, liveNow, loadSavedProfiles,
  notifyAll, notifyOff, persistSaved, refreshStars, renderSaved, saved, savedTab, sendWatch, setAutoFit, svHue,
  svInitials, svProf, tabPlat, toggleSaved };
