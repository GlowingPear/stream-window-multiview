import { $, ROLE } from '../core.js';
import { vidLabel } from './layouts.js';
import { applyPreset, capturePreset } from './saved-layouts.js';
import { commands } from '../shared/commands.js';
import { IS_MAC, keyName } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { mountCapture } from '../windows/capture.js';
import { reloadWin } from '../windows/views.js';

/* ===================== 2.2: refresh, undo/redo, window capture, shortcuts, help ===================== */

/* Switch control: refresh one stream */
function refreshFromSwitcher(s, btn){
  if (s.kind === 'capture') mountCapture(s); else reloadWin(s);
  if (btn){ btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
  flash(`Refreshing ${vidLabel(s)}…`);
}

/* ---- Undo / redo: every change to which windows are open and where they are ----
   A snapshot is taken shortly after each change (window opened/closed/moved/resized, swaps,
   layout changes). Volume changes aren't undo steps. */
var undoStack = [], redoStack = [], histCur = null, histSig = '', histMute = 0, histT = 0;
// Other files change these through undoVars: a variable imported from another file can't be assigned to.
const undoVars = {
  get histCur(){ return histCur; }, set histCur(v){ histCur = v; },
  get histSig(){ return histSig; }, set histSig(v){ histSig = v; },
};
const histSnap = () => capturePreset('');
const histSigOf = p => JSON.stringify([p.mode, p.featured, p.sideCols, p.linked, p.streamCols, p.order,
  p.windows.map(w => [w.kind, w.channel || w.url, Math.round(w.x), Math.round(w.y), Math.round(w.w), Math.round(w.h), w.frame || '', !!w.hiddenTab, !!w.sbs, !!w.split])]);
function histRecord(){
  if (ROLE !== 'main' || typeof capturePreset !== 'function') return;
  clearTimeout(histT);
  histT = setTimeout(() => {
    if (Date.now() < histMute) return;
    const p = histSnap(), sg = histSigOf(p);
    if (sg === histSig) return;
    if (histCur){ undoStack.push(histCur); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; }
    histCur = p; histSig = sg;
    updateUndoBtns();
  }, 450);
}
function histApply(p, verb){
  histMute = Date.now() + 1200;
  clearTimeout(histT);
  applyPreset(p, { quiet: true, keepVol: true });
  histCur = p; histSig = histSigOf(p);
  setTimeout(() => { histCur = histSnap(); histSig = histSigOf(histCur); updateUndoBtns(); }, 1250);   // settle on what's really on screen
  updateUndoBtns();
  flash(verb);
}
function histUndo(){
  clearTimeout(histT);
  const now = histSnap();
  if (histCur && histSigOf(now) !== histSig){ undoStack.push(histCur); histCur = now; histSig = histSigOf(now); }   // a change still waiting to be recorded
  if (!undoStack.length){ flash('Nothing to undo'); return; }
  redoStack.push(histCur);
  histApply(undoStack.pop(), 'Undone');
}
function histRedo(){
  if (!redoStack.length){ flash('Nothing to redo'); return; }
  undoStack.push(histCur);
  histApply(redoStack.pop(), 'Redone');
}
function updateUndoBtns(){
  const u = $('#undoBtn'), r = $('#redoBtn'); if (!u) return;
  u.disabled = !undoStack.length; r.disabled = !redoStack.length;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  if (ROLE === 'main'){
    const u = $('#undoBtn'), r = $('#redoBtn');
    u.title = `Undo (${keyName('Ctrl+Z')})`; r.title = `Redo (${keyName(IS_MAC ? 'Ctrl+Shift+Z' : 'Ctrl+Y')})`;
    u.hidden = r.hidden = false;
    u.onclick = histUndo; r.onclick = histRedo;
    commands.add([
      { id: 'undo', title: 'Undo', sub: 'The last change to your windows', words: ['back'], icon: 'undo', keys: 'Ctrl+Z', button: '#undoBtn', offWhy: 'Nothing to undo' },
      { id: 'redo', title: 'Redo', icon: 'redo', keys: IS_MAC ? 'Ctrl+Shift+Z' : 'Ctrl+Y', button: '#redoBtn', offWhy: 'Nothing to redo' }
    ]);
  }
}

export { histCur, histRecord, histRedo, histSigOf, histSnap, histUndo, init, redoStack, refreshFromSwitcher,
  undoStack, undoVars, updateUndoBtns };
