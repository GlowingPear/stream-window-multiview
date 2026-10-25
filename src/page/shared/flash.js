import { alerts, wantNotify } from '../alerts/alerts.js';
import { msg } from '../core.js';
import { addNote } from '../panels/bell/bell.js';
import { element } from './element.js';
import { DESKTOP } from './env.js';
import { settings } from './settings.js';

let flashT, desktopNotify = true;      // (Settings > Notifications)
// Other files change these through flashVars: a variable imported from another file can't be assigned to.
const flashVars = {
  get desktopNotify(){ return desktopNotify; }, set desktopNotify(v){ desktopNotify = v; },
};
/* A short message in the app ("Saved layout"). o: { subject, detail, act } also keeps it under the bell (App);
   true: a notification's pop-up (addNote checked it may show). The rest are the app's messages: they show and
   go to the desktop as Settings > Notifications > App messages says. */
function flash(t, o){
  if (t && o && o.subject) return void addNote({ kind: 'app', subject: o.subject, text: t, ...(o.detail ? { detail: o.detail } : {}), ...(o.act ? { act: o.act } : {}) }, t);
  if (!t || o === true || !alerts || alerts.app.popup !== false){
    msg.textContent = t; msg.classList.remove('keys'); clearTimeout(flashT); if (t) flashT = setTimeout(() => msg.textContent = '', 3500);
  }
  if (t && o !== true && alerts && wantNotify('app') && DESKTOP && window.kmv.notifyMessage) window.kmv.notifyMessage(t);
}

// A short message with the keys for what comes next: "Switched to Chat Stage  ⌘Z undo · ⌘K again"
function flashKeys(t, keys){
  flash(t);
  if (msg.textContent !== t) return;              // (pop-ups switched off)
  msg.classList.add('keys');
  msg.append(...keys.flatMap(([k, what], i) => [i ? element('i', 'pal-dot', '·') : ' ', element('kbd', null, k), ' ' + what]));
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  desktopNotify = settings.flag('desktopNotify', true);
  msg.onclick = () => flash('');
}

export { desktopNotify, flash, flashKeys, flashVars, init };
