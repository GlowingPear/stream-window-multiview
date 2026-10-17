import { ROLE, popped, wins } from '../core.js';
import { curLayout } from './column-drag.js';
import { switchMode } from './layouts.js';
import { setSwitchMode } from './switch-control.js';
import { saved } from '../panels/channels/channels.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { soon } from '../shared/timers.js';
import { popOutStreams } from '../windows/popout.js';

/* ---- Extend across monitors (Settings > Layouts > Monitors): for each layout, the monitor its streams, chats and
   switch control go on. The chats stay in this (the main) window, which the desktop app moves to their monitor;
   streams on another monitor go in the Streams window there (Pop out), and the switch control in its own window.
   Nothing set for a layout: everything stays as you have it. Only what this part moved is put back. */
// { layouts: { focus: { chats, streams, switch }, ... }, together }: each a saved monitor ({ id, label, x, y, w, h })
let monPrefs = { layouts: {}, together: true };
let monList = [], monHere = null;          // the monitors there now, and the one this window is on
let appliedSig = '', ownPop = false, ownSwitch = false, switchBefore = 'dock';
let applySoon = null;
// The layout you picked, and what the layout in use says instead after this part (or unplugging) moved the streams:
// with only the chats left, this window counts as Chat focus, but it's still the layout you picked
let monLayout = null, heldAs = null;

const canMonitors = () => ROLE === 'main' && !!(window.kmv && window.kmv.applyMonitors);
const partsFor = l => monPrefs.layouts[l] || {};
const hasParts = p => !!(p.chats || p.streams || p.switch);
const keepTogether = () => monPrefs.together !== false;
function layoutNow(){
  const c = curLayout();
  if (heldAs && c === heldAs && monLayout) return monLayout;
  heldAs = null;
  return c;
}
function setPart(l, part, key){
  const p = { ...partsFor(l) };
  if (key) p[part] = key; else delete p[part];
  if (hasParts(p)) monPrefs.layouts[l] = p; else delete monPrefs.layouts[l];
  settings.set('monitors', monPrefs);
  appliedSig = '';
  if (l === layoutNow()) applyMonitors();
}
function setTogether(on){ monPrefs.together = !!on; settings.set('monitors', monPrefs); appliedSig = ''; applyMonitors(); }

// The monitors there now (from the desktop app)
async function refreshMonitors(){
  if (!canMonitors() || !window.kmv.monitors) return monList;
  try { const r = await window.kmv.monitors(); monList = r.monitors || []; monHere = r.main; } catch {}
  store.changed('monitors');
  return monList;
}

// Puts the layout in use on its monitors (when it, or what's set for it, changed), one at a time: two pickers changed
// quickly mustn't move the windows at the same time
let applying = null;
function applyMonitors(force){ return (applying = (applying || Promise.resolve()).then(() => placeNow(force), () => placeNow(force))); }
async function placeNow(force){
  if (!canMonitors()) return;
  const l = layoutNow(), parts = partsFor(l), sig = l + JSON.stringify(parts) + keepTogether();
  if (!force && sig === appliedSig) return;
  appliedSig = sig; monLayout = l;
  if (ownSwitch && switchMode !== 'window') ownSwitch = false;     // you changed it yourself since
  if (!hasParts(parts) && !ownPop && !ownSwitch) return;            // nothing set, nothing of ours to put back
  let p;
  try { p = await window.kmv.applyMonitors(parts, keepTogether()); } catch { return; }
  monHere = p.chats;
  // the streams: in the Streams window on their monitor, or back here
  const away = p.streams !== p.chats;
  if (away && !popped && wins.some(w => w.kind === 'stream')){
    ownPop = true; popOutStreams();
    heldAs = curLayout();                                     // (Chat focus: this window has only the chats now)
  }
  else if (!away && popped && ownPop){ ownPop = false; window.kmv.closeStreams(); }
  // the switch control: in its own window on its monitor, or back the way it was
  const swAway = p.switch !== p.chats;
  if (swAway && switchMode !== 'window'){ switchBefore = switchMode; ownSwitch = true; setSwitchMode('window'); }
  else if (!swAway && ownSwitch){ ownSwitch = false; setSwitchMode(switchBefore); }
  store.changed('monitors');
}
// A monitor was plugged in or out, or changed
function monitorsChanged(info){
  if (info && info.monitors){ monList = info.monitors; monHere = info.main; }
  if (info && info.kind === 'removed' && keepTogether()){
    if (ownPop) heldAs = 'chatfocus';                          // its streams come back here, as Chat focus
    ownPop = false; ownSwitch = false;                          // the app put everything here
  }
  appliedSig = '';
  store.changed('monitors');
  if (info && info.kind === 'added') applyMonitors(true);            // back on their monitors once they're all there
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  const s = settings.json('monitors');
  if (s && typeof s === 'object') monPrefs = { layouts: s.layouts && typeof s.layouts === 'object' ? s.layouts : {}, together: s.together !== false };
  if (!canMonitors()) return;
  applySoon = soon(() => applyMonitors(), 150);
  // a layout's streams were popped out last time: they're ours to bring back
  if (popped && partsFor(curLayout()).streams) ownPop = true;
  if (switchMode === 'window' && partsFor(curLayout()).switch) ownSwitch = true;
  store.watch('layout', () => applySoon());
  fromApp('onStreamsState', open => { if (!open) ownPop = false; });
  fromApp('onMonitorsChanged', monitorsChanged);
  refreshMonitors().then(() => applyMonitors(true));
  window.monitorsChanged = monitorsChanged;   // for the tests
}

const monitorsVars = { get monitors(){ return monList; }, get mainId(){ return monHere; }, get saved(){ return monPrefs; } };

export { init, monitorsVars, partsFor, refreshMonitors, setPart, setTogether };
