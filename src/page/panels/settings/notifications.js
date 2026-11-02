import { ALERT_KINDS, alerts } from '../../alerts/alerts.js';
import { $, ROLE, msg } from '../../core.js';
import { bellCount, bellVars, dndOn, dndT, dndUntil, updateBellBtn } from '../bell/bell.js';
import { channelVars, notifyAll, sendWatch } from '../channels/channels.js';
import { syncAlertControls } from './alerts.js';
import { commands } from '../../shared/commands.js';
import { DESKTOP } from '../../shared/env.js';
import { desktopNotify, flash, flashVars } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';

let msgPos;
function loadMsgSettings(){
  const m = settings.json('msg', {}) || {};
  msgPos.value = [...msgPos.options].some(o => o.value === m.pos) ? m.pos : 'tc';
  msg.dataset.pos = msgPos.value;
}
/* Settings > Notifications: for each kind, a row with its pop-up, desktop notification and sound. Mentions and
   spam alerts' are the same settings as on their own pages (the same data-al). */
const NT_ROWS = [['mention', 'Mentions &amp; replies', 'mentions', 'More on Mentions ›'], ['spam', 'Likely spam', 'spam', 'More on Spam alerts ›'], ['support', 'Support', 'support', 'More on Support ›'], ['flagged', 'Flagged', 'flagged', 'More on Flagged ›'],
  ['live', 'Saved channel went live'], ['raid', 'Raids'], ['app', 'App messages']];
const SOUND_OPTS = '<option value="none">None</option><option value="chime">Chime</option><option value="ping">Ping</option><option value="pop">Pop</option><option value="knock">Low knock</option><option value="custom">Your own sound</option>';
// Live alerts: off (Never) also turns off the bell in Channels, and Away is checked by the app itself.
function syncLiveAlerts(){
  channelVars.notifyAll = alerts.live.notify !== 'never';
  settings.set('notifyAll', notifyAll);
  const na = $('#notifyAll'); if (na) na.checked = notifyAll;
  sendWatch(); store.changed('liveAlerts');
}
let dndOnEl, dndFor;
function syncDnd(){
  clearTimeout(dndT);
  const on = dndOn();
  if (!on && dndUntil > 0){ bellVars.dndUntil = 0; settings.set('dnd', '0'); }
  if (on && dndUntil > 0) bellVars.dndT = setTimeout(syncDnd, Math.min(dndUntil - Date.now() + 50, 2 ** 31 - 1));
  dndOnEl.checked = on;
  $('#dndSt').textContent = !on ? 'Still collected under the bell, but no pop-ups, sounds or desktop notifications.'
    : dndUntil < 0 ? 'On until you turn it off. Everything is still collected under the bell.'
    : `On until ${new Date(dndUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Everything is still collected under the bell.`;
  if (DESKTOP && ROLE === 'main' && window.kmv.notifyEnabled) window.kmv.notifyEnabled(desktopNotify && !on);
  document.querySelectorAll('.nc-dnd').forEach(b => {        // the quick switch in the bell and All notifications
    b.innerHTML = icon.bellOff; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    b.title = !on ? `Do not disturb (${dndFor.selectedOptions[0].textContent.toLowerCase()}): no pop-ups, sounds or desktop notifications`
      : dndUntil < 0 ? 'Do not disturb is on until you turn it off. Click to turn it off'
      : `Do not disturb is on until ${new Date(dndUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Click to turn it off`;
  });
  updateBellBtn();
}
function setDnd(on){
  bellVars.dndUntil = !on ? 0 : +dndFor.value ? Date.now() + +dndFor.value * 60000 : -1;
  settings.set('dnd', dndUntil) && settings.set('dndFor', dndFor.value);
  syncDnd();
}
let bellCountEl;
let dnOn, dnSt;
function syncNotifyPane(){ dnOn.checked = desktopNotify; syncDnd(); syncAlertControls(); }

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* Settings > Notifications: where pop-ups show */
  msgPos = $('#msgPos');
  loadMsgSettings();
  msgPos.addEventListener('change', () => {
    const m = settings.json('msg', {}) || {};
    settings.set('msg', { ...m, pos: msgPos.value });
    loadMsgSettings();
    flash('Pop-ups show here');
  });
  settings.onChange(['desktopNotify', 'msg', 'alerts', 'dnd'], (name, v) => {          // main and streams windows
    if (name === 'desktopNotify') flashVars.desktopNotify = v !== '0';
    if (name === 'msg') loadMsgSettings();
    if (name === 'alerts') try { const a = JSON.parse(v || '{}'); ALERT_KINDS.forEach(k => Object.assign(alerts[k], a[k] || {})); } catch {}
    if (name === 'dnd'){ bellVars.dndUntil = +v || 0; syncDnd(); }
  });
  NT_ROWS.forEach(([k, name, go, more]) => {
    // (the Mentions and Spam alerts pages are the desktop app's main window's)
    $('#ntGrid').insertAdjacentHTML('beforeend', `<span class="nt-k k-${k}"><i></i><span>${name}${go && DESKTOP && ROLE === 'main' ? `<button class="linkish" data-go="${go}" data-sub="alerts">${more}</button>` : ''}</span></span>`
      + `<span class="nt-c"><input type="checkbox" class="st-sw" data-al="${k}.popup" aria-label="Pop-up in the app"></span>`
      + `<span class="nt-c nt-desk"><span class="seg" data-al="${k}.notify" role="radiogroup" aria-label="Desktop notification"><button data-v="never">Never</button><button data-v="unfocused" title="When the app isn't in front">Away</button><button data-v="always">Always</button></span></span>`
      + `<span class="nt-c"><select data-al="${k}.sound" aria-label="Sound">${SOUND_OPTS}</select></span>`);
  });
  // Do not disturb: still collected under the bell, but quiet. The desktop notifications stop in the app itself too.
  dndOnEl = $('#dndOn'), dndFor = $('#dndFor');
  { const f = settings.get('dndFor'); if ([...dndFor.options].some(o => o.value === f)) dndFor.value = f; }
  dndOnEl.addEventListener('change', () => setDnd(dndOnEl.checked));
  document.querySelectorAll('.nc-dnd').forEach(b => b.addEventListener('click', () => {
    setDnd(!dndOn());
    flash(dndOn() ? (dndUntil < 0 ? 'Do not disturb on' : `Do not disturb until ${new Date(dndUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`) : 'Do not disturb off');
  }));
  // the search box's (Ctrl/⌘+K): Do not disturb for a while, until you turn it off, or off
  const dndFlash = () => flash(dndOn() ? (dndUntil < 0 ? 'Do not disturb on' : `Do not disturb until ${new Date(dndUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`) : 'Do not disturb off');
  commands.add([
    ...[['30', 'for 30 minutes'], ['60', 'for 1 hour'], ['0', 'until I turn it off']].map(([v, t]) => ({ id: 'dnd.' + v, group: 'Notifications', title: 'Do not disturb ' + t,
      sub: 'Notifications · no pop-ups or sounds', words: ['quiet', 'mute notifications', 'dnd'], icon: 'bellOff',
      run: () => { dndFor.value = v; setDnd(true); dndFlash(); } })),
    { id: 'dnd.off', group: 'Notifications', title: 'Turn off Do not disturb', words: ['dnd'], icon: 'bell', when: dndOn, run: () => { setDnd(false); dndFlash(); } },
    { id: 'dnd', group: 'Notifications', title: 'Do not disturb', sub: () => 'For ' + dndFor.selectedOptions[0].textContent.replace(/^For /, '').toLowerCase() + ', as Settings › Notifications says', words: ['dnd', 'quiet'],
      icon: 'bellOff', toggle: { get: dndOn, set: on => { setDnd(on); dndFlash(); } } }
  ]);
  document.querySelectorAll('.nc-dnd').forEach(b => { b.dataset.cmd = 'dnd'; });
  dndFor.addEventListener('change', () => { if (dndOn()) setDnd(true); else { settings.set('dndFor', dndFor.value); syncDnd(); } });
  // The red number on the bell.
  bellCountEl = $('#bellCount');
  bellCountEl.value = ['ms', 'all', 'off'].includes(bellCount) ? bellCount : 'ms';
  bellCountEl.addEventListener('change', () => { bellVars.bellCount = bellCountEl.value; settings.set('bellCount', bellCount); updateBellBtn(); });
  document.querySelectorAll('#settingsDlg .nt-desk').forEach(el => { el.hidden = !(DESKTOP && ROLE === 'main'); });
  /* Settings > Notifications: desktop notifications (the main window's: live alerts, mentions, spam) */
  dnOn = $('#dnOn'), dnSt = document.querySelector('#settingsDlg .dn-st');
  if (DESKTOP && ROLE === 'main' && window.kmv.notifyEnabled){
    document.querySelector('#ntTabs .dn-tab').hidden = false;
    dnOn.checked = desktopNotify;
    dnOn.addEventListener('change', () => {
      flashVars.desktopNotify = dnOn.checked;
      settings.set('desktopNotify', desktopNotify);
      syncDnd();
    });
    const sys = document.querySelector('#settingsDlg .dn-sys');
    sys.hidden = !['darwin', 'win32'].includes(window.kmv.platform);
    sys.onclick = () => window.kmv.notifySettings();
    const where = window.kmv.platform === 'darwin' ? 'System Settings > Notifications' : 'Settings > System > Notifications';
    document.querySelector('#settingsDlg .dn-test').onclick = async () => {
      dnSt.textContent = 'Sending…';
      const r = await window.kmv.notifyTest().catch(() => 'failed');
      dnSt.textContent = r === 'unsupported' ? 'This computer doesn\'t support desktop notifications.'
        : r === 'failed' ? `Your computer blocked it. Allow notifications for Stream Multiview in ${where}.`
        : `Sent. If you didn't see it, allow notifications for Stream Multiview in ${where}.`;
    };
  }
  syncDnd();
}

export { init, syncDnd, syncLiveAlerts, syncNotifyPane };
