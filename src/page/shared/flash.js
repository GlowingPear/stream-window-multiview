import '../layout/placement.js';   // runs after it (see app.js)
import { settings } from './settings.js';
import { msg } from '../core.js';
import { DESKTOP } from './env.js';
import { addNote } from '../panels/bell/bell.js';
import { alerts, wantNotify } from '../alerts/alerts.js';

let flashT, desktopNotify = true;      // (Settings > Notifications)
// Other files change these through flashVars: a variable imported from another file can't be assigned to.
const flashVars = {
  get desktopNotify(){ return desktopNotify; }, set desktopNotify(v){ desktopNotify = v; },
};
desktopNotify = settings.flag('desktopNotify', true);
/* A short message in the app ("Saved layout"). o: { subject, detail, act } also keeps it under the bell (App);
   true: a notification's pop-up (addNote checked it may show). The rest are the app's messages: they show and
   go to the desktop as Settings > Notifications > App messages says. */
function flash(t, o){
  if (t && o && o.subject) return void addNote({ kind: 'app', subject: o.subject, text: t, ...(o.detail ? { detail: o.detail } : {}), ...(o.act ? { act: o.act } : {}) }, t);
  if (!t || o === true || !alerts || alerts.app.popup !== false){
    msg.textContent = t; clearTimeout(flashT); if (t) flashT = setTimeout(() => msg.textContent = '', 3500);
  }
  if (t && o !== true && alerts && wantNotify('app') && DESKTOP && window.kmv.notifyMessage) window.kmv.notifyMessage(t);
}
msg.onclick = () => flash('');

export { desktopNotify, flash, flashVars };
