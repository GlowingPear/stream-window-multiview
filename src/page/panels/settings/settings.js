import './themes.js';   // runs after it (see app.js)
import { fromApp } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';
import { $, ROLE, refreshAccountsPane, wins } from '../../core.js';
import { icon } from '../../shared/icons.js';
import { DESKTOP } from '../../shared/env.js';
import { gotLive, liveInfo, liveNote } from '../channels/channels.js';
import { bellCount, bellVars, dndOn, dndUntil, notes } from '../bell/bell.js';
import { alerts, playSound, raiseAlert } from '../../alerts/alerts.js';
import { flash } from '../../shared/flash.js';
import { syncDnd, syncNotifyPane } from './notifications.js';
import { removeChannel } from '../../layout/switcher.js';
import { renderLayoutsPane } from '../../toolbar/layout-menu.js';
import { keysOn, renderDoc, showHelp } from '../help/help.js';
import { renderUpdates } from '../updates/updates.js';
import { renderThemeDlg } from './themes.js';
import { renderSpamHist } from './alerts.js';
import { renderExtPane } from '../extensions/extensions.js';

/* ---------- Settings: one window for general options, accounts, alerts, themes and updates ---------- */
const settingsDlg = $('#settingsDlg');
let settingsTab = 'general';
settingsTab = settings.text('settingsTab', 'general');
const MAIN_DESK = DESKTOP && ROLE === 'main';
settingsDlg.querySelectorAll('.st-rail .desk-only').forEach(b => { b.hidden = !DESKTOP; });
const ST_ICONS = { general: 'sliders', layouts: 'layout', accounts: 'user', youtube: 'ytPlay', notify: 'bell', mentions: 'at', spam: 'mod', extensions: 'ext', themes: 'palette', updates: 'update', guide: 'book', keys: 'keys' };
settingsDlg.querySelectorAll('.st-rail button[data-s]').forEach(b => { if (icon[ST_ICONS[b.dataset.s]]) b.insertAdjacentHTML('afterbegin', icon[ST_ICONS[b.dataset.s]]); });
settingsDlg.querySelectorAll('.st-rail .main-desk').forEach(b => { b.hidden = !MAIN_DESK; });
settingsDlg.querySelectorAll('.st-rail .main-only').forEach(b => { b.hidden = ROLE !== 'main'; });
// a heading goes when none of its tabs work here (Sites in a browser)
settingsDlg.querySelectorAll('.st-rail-sec').forEach(h => {
  let n = h.nextElementSibling, any = false;
  for (; n && !n.classList.contains('st-rail-sec'); n = n.nextElementSibling) any ||= !n.hidden;
  h.hidden = !any;
});
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
  if (settingsTab === 'extensions') renderExtPane();
  if (settingsTab === 'layouts') renderLayoutsPane(true);
  return renderDoc(settingsTab);
}
window.openSettings = openSettings;   // for the tests
window.smvNotes = {   // for the tests
  get notes(){ return notes; }, get alerts(){ return alerts; }, get bellCount(){ return bellCount; }, get dndUntil(){ return dndUntil; },
  liveNote, flash, removeChannel, playSound, dndOn, endDnd(){ bellVars.dndUntil = Date.now() - 1; syncDnd(); }, setInfo(ch, i){ liveInfo[ch] = i; }, liveStatus: gotLive
};
window.raiseAlert = (ch, kind) => raiseAlert(wins.find(w => w.kind === 'chat' && w.channel === ch), kind);   // for the tests
const closeSettings = () => { settingsDlg.hidden = true; };
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

export { closeSettings, openSettings, settingsDlg, settingsTab };
