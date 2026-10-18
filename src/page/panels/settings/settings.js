import { alerts, playSound, raiseAlert } from '../../alerts/alerts.js';
import { $, ROLE, refreshAccountsPane, wins } from '../../core.js';
import { removeChannel } from '../../layout/switcher.js';
import { bellCount, bellVars, dndOn, dndUntil, notes } from '../bell/bell.js';
import { gotLive, liveInfo, liveNote } from '../channels/channels.js';
import { renderExtPane } from '../extensions/extensions.js';
import { keysOn, renderDoc, showHelp } from '../help/help.js';
import { renderSpamHist, veilLists } from './alerts.js';
import { syncDnd, syncNotifyPane } from './notifications.js';
import { renderThemeDlg } from './themes.js';
import { renderUpdates } from '../updates/updates.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { fromApp } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';
import { renderLayoutsPane } from '../../toolbar/layout-menu.js';

let settingsDlg;
let settingsTab = 'general';
let MAIN_DESK;
const ST_ICONS = { general: 'sliders', layouts: 'layout', chat: 'chat', accounts: 'user', youtube: 'ytPlay', notify: 'bell', mentions: 'at', spam: 'mod', extensions: 'ext', themes: 'palette', updates: 'update', guide: 'book', keys: 'keys' };
function openSettings(tab){
  const ok = t => { const b = settingsDlg.querySelector(`.st-rail [data-s="${t}"]`); return b && !b.hidden; };
  settingsTab = ok(tab) ? tab : ok(settingsTab) ? settingsTab : 'general';
  settings.set('settingsTab', settingsTab);
  settingsDlg.hidden = false;
  settingsDlg.querySelectorAll('.st-rail button').forEach(b => b.classList.toggle('on', b.dataset.s === settingsTab));
  settingsDlg.querySelectorAll('.st-pane').forEach(p => { p.hidden = p.dataset.s !== settingsTab; });
  settingsDlg.querySelector('.st-body').scrollTop = 0;
  if (settingsTab === 'themes') renderThemeDlg();
  if (settingsTab === 'updates') renderUpdates();
  settingsDlg.querySelector('.upd-host').hidden = !MAIN_DESK;
  if ((settingsTab === 'accounts' || settingsTab === 'youtube') && typeof refreshAccountsPane === 'function') refreshAccountsPane();
  if (settingsTab === 'general') $('#keysSet').checked = keysOn;
  if (settingsTab === 'notify') syncNotifyPane();
  renderSpamHist();   // (only drawn while Settings is open)
  veilLists();
  if (settingsTab === 'extensions') renderExtPane();
  if (settingsTab === 'layouts') renderLayoutsPane(true);
  return renderDoc(settingsTab);
}
const closeSettings = () => { settingsDlg.hidden = true; };

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* ---------- Settings: one window for general options, accounts, alerts, themes and updates ---------- */
  settingsDlg = $('#settingsDlg');
  settingsTab = settings.text('settingsTab', 'general');
  MAIN_DESK = DESKTOP && ROLE === 'main';
  settingsDlg.querySelectorAll('.st-rail .desk-only').forEach(b => { b.hidden = !DESKTOP; });
  settingsDlg.querySelectorAll('.st-rail button[data-s]').forEach(b => { if (icon[ST_ICONS[b.dataset.s]]) b.insertAdjacentHTML('afterbegin', icon[ST_ICONS[b.dataset.s]]); });
  settingsDlg.querySelectorAll('.st-rail .main-desk').forEach(b => { b.hidden = !MAIN_DESK; });
  settingsDlg.querySelectorAll('.st-rail .main-only').forEach(b => { b.hidden = ROLE !== 'main'; });
  // a heading goes when none of its tabs work here (Sites in a browser)
  settingsDlg.querySelectorAll('.st-rail-sec').forEach(h => {
    let n = h.nextElementSibling, any = false;
    for (; n && !n.classList.contains('st-rail-sec'); n = n.nextElementSibling) any ||= !n.hidden;
    h.hidden = !any;
  });
  window.openSettings = openSettings;   // for the tests
  window.smvNotes = {   // for the tests
    get notes(){ return notes; }, get alerts(){ return alerts; }, get bellCount(){ return bellCount; }, get dndUntil(){ return dndUntil; },
    liveNote, flash, removeChannel, playSound, dndOn, endDnd(){ bellVars.dndUntil = Date.now() - 1; syncDnd(); }, setInfo(ch, i){ liveInfo[ch] = i; }, liveStatus: gotLive
  };
  window.raiseAlert = (ch, kind) => raiseAlert(wins.find(w => w.kind === 'chat' && w.channel === ch), kind);   // for the tests
  settingsDlg.querySelector('.help-x').innerHTML = icon.close;
  settingsDlg.querySelector('.help-x').onclick = closeSettings;
  settingsDlg.addEventListener('pointerdown', e => { if (e.target === settingsDlg) closeSettings(); });
  settingsDlg.querySelector('.st-rail').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) openSettings(b.dataset.s); });
  settingsDlg.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go){
      e.preventDefault(); openSettings(go.dataset.go);
      if (go.dataset.sub) settingsDlg.querySelector(`.st-pane[data-s="${go.dataset.go}"] .st-tabs button[data-t="${go.dataset.sub}"]`)?.click();   // and its sub-tab
      return;
    }
    const h = e.target.closest('[data-help]'); if (h){ e.preventDefault(); showHelp(h.dataset.help); }
  });
  document.querySelectorAll('.menu-set:empty').forEach(b => { b.innerHTML = icon.gear; });   // a menu's own settings (top right)
  $('#settingsBtn').onclick = () => openSettings();
  if (DESKTOP) fromApp('onSettingsShow', tab => openSettings(tab));
  document.addEventListener('keydown', e => {                    // Ctrl+, / ⌘, (the desktop app's menu also has it)
    if ((e.ctrlKey || e.metaKey) && e.key === ',' && !e.altKey){ e.preventDefault(); openSettings(); }
  });
}

export { closeSettings, init, openSettings, settingsDlg, settingsTab };
