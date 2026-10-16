import '../panels/bell/all-notifications.js';   // runs after it (see app.js)
import { SmvSpam } from './spam.js';
import { settings } from '../shared/settings.js';
import { wins } from '../core.js';
import { dndOn, readChat } from '../panels/bell/bell.js';

/* ---------- alerts: how a chat window gets your attention (Settings > Mentions, Spam alerts) ---------- */
const ALERT_DEFAULTS = {
  mention: { popup: true, hl: 'until', color: '#e8b84a', esc: 20, max: 'pulse', sound: 'chime', vol: 0.5, repeat: false, notify: 'unfocused',
             bots: null, botsOffered: null },   // bots: the chat bot list (null: built-in), spam alerts' too while they share it
  spam: { popup: true, on: false, hl: 'until', color: '#ff5f5f', esc: 0, max: 'pulse', tag: true, sound: 'knock', vol: 0.4, repeat: false, notify: 'never',
          sens: 'balanced', allow: null, words: null, openers: null, ignore: null, botsOffered: null,   // null: the built-in lists
          sharedBots: true },  // the chat bot list from Mentions instead of ignore
  // Settings > Notifications only: a saved channel went live, a raid was followed, the app's own messages
  live: { popup: true, notify: 'always', sound: 'none', vol: 0.5 },
  raid: { popup: true, notify: 'never', sound: 'none', vol: 0.5 },
  app: { popup: true, notify: 'never', sound: 'none', vol: 0.5 }
};
const ALERT_KINDS = Object.keys(ALERT_DEFAULTS);
var alerts = (() => {
  const a = settings.json('alerts', {}) || {};
  // From before mentions had a chat bot list: the one you made for spam alerts becomes the shared one.
  const m = a.mention = a.mention || {}, s = a.spam || {};
  if (!('bots' in m) && Array.isArray(s.ignore)){ m.bots = s.ignore.slice(); m.botsOffered = s.botsOffered || null; }
  // From before Settings > Notifications had a row for each kind: "Saved channels going live" and how the app's
  // messages showed (Settings > Notifications > Messages).
  if (!a.live) a.live = { notify: settings.get('notifyAll') === '0' ? 'never' : 'always' };
  if (!a.app){ const g = settings.json('msg', {}) || {};
               a.app = { popup: g.on !== false, notify: g.via === 'desktop' ? 'always' : 'never' }; }
  return Object.fromEntries(ALERT_KINDS.map(k => [k, { ...ALERT_DEFAULTS[k], ...(a[k] || {}) }]));
})();
const saveAlerts = () => { settings.set('alerts', alerts); };
// Chat bots added to the built-in list since: added to a list you changed, once (one you removed stays removed).
[[alerts.spam, 'ignore'], [alerts.mention, 'bots']].forEach(([a, k]) => {
  const r = SmvSpam.withNewBots(a[k], a.botsOffered);
  if (r.list === a[k] && JSON.stringify(r.offered) === JSON.stringify(a.botsOffered)) return;
  a[k] = r.list; a.botsOffered = r.offered; saveAlerts();
});
const SOUND_KEY = kind => 'alertSound.' + kind;      // your own sound file, as a data: URL (a saved setting)

// The built-in sounds are made on the fly, so there are no sound files to ship.
let audioCtx = null;
function tone(c, out, t0, f, dur, type, gain, f2){
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
const SOUNDS = {
  chime: (c, o, t) => { tone(c, o, t, 880, 0.35, 'sine', 0.5); tone(c, o, t + 0.12, 1318.5, 0.5, 'sine', 0.4); },
  ping: (c, o, t) => tone(c, o, t, 1760, 0.25, 'triangle', 0.5),
  pop: (c, o, t) => tone(c, o, t, 620, 0.09, 'sine', 0.8, 180),
  knock: (c, o, t) => { tone(c, o, t, 150, 0.12, 'sine', 1, 70); tone(c, o, t + 0.16, 150, 0.12, 'sine', 1, 70); }
};
function playSound(kind, test){
  const a = alerts[kind];
  if (!test && dndOn()) return;                                 // Do not disturb (the ▶ buttons still play)
  if (!a || a.sound === 'none' || !(a.vol > 0)) return;
  if (a.sound === 'custom'){
    const src = settings.text(SOUND_KEY(kind));
    if (src){ const el = new Audio(src); el.volume = a.vol; el.play().catch(() => {}); }
    return;
  }
  const f = SOUNDS[a.sound]; if (!f) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const out = audioCtx.createGain(); out.gain.value = a.vol; out.connect(audioCtx.destination);
    f(audioCtx, out, audioCtx.currentTime + 0.02);
  } catch {}
}
const wantNotify = kind => !dndOn() && (alerts[kind].notify === 'always' || (alerts[kind].notify === 'unfocused' && !document.hasFocus()));

// The window's border: a short glow, or lit until you click that chat, getting stronger while unseen.
function raiseAlert(w, kind, seen){
  const a = alerts[kind];
  if (!w || !a) return;
  playSound(kind);
  if (a.hl === 'off') return;
  w.el.style.setProperty('--al', a.color);
  const looking = seen || (document.hasFocus() && w.view && document.activeElement === w.view);   // you're in that chat right now
  if (a.hl === 'brief' || looking){
    w.el.classList.remove('al-brief'); void w.el.offsetWidth; w.el.classList.add('al-brief');
    setTimeout(() => w.el.classList.remove('al-brief'), 2600);
    return;
  }
  w.alert = { kind, since: Date.now(), sound: Date.now() };
  alertLevel(w, 1);
  alertTick();
}
function alertLevel(w, n){
  w.el.classList.remove('al-1', 'al-2', 'al-3');
  if (n) w.el.classList.add('al-' + n);
  w.alertLvl = n;
}
function clearAlert(w){
  if (!w || !w.alert) return;
  w.alert = null; alertLevel(w, 0);
}
let alertT = 0;
function alertTick(){
  clearTimeout(alertT);
  const now = Date.now();
  let any = false;
  wins.forEach(w => {
    if (!w.alert) return;
    any = true;
    const a = alerts[w.alert.kind], step = (+a.esc || 0) * 1000;
    const lvl = step ? Math.min(a.max === 'flash' ? 3 : 2, 1 + Math.floor((now - w.alert.since) / step)) : 1;
    if (lvl !== w.alertLvl) alertLevel(w, lvl);
    if (a.repeat && now - w.alert.sound >= (step || 30000)){ w.alert.sound = now; playSound(w.alert.kind); }
  });
  if (any) alertT = setTimeout(alertTick, 1000);
}
// Seen: clicking anywhere on that window (clicks inside the chat itself arrive as the chat getting focus).
document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest('.win');
  const w = el && wins.find(x => x.el === el);
  if (w){ clearAlert(w); if (w.kind === 'chat') readChat(w.channel); }
}, true);

export { ALERT_KINDS, alerts, clearAlert, playSound, raiseAlert, saveAlerts, SOUND_KEY, wantNotify };
