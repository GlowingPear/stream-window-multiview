import { $, ROLE, colsMode, input, wins } from './core.js';
import { buildCols, columnsLayout } from './layout/columns.js';
import { syncSwitcher } from './layout/focus-only.js';
import { colKey, featuredCh, isVid, layoutVars, setFeatured } from './layout/layouts.js';
import { layoutLocked, setLayoutLocked } from './layout/lock.js';
import { scrollCols } from './layout/sideways-scroll.js';
import { fsMute, isFocusView } from './layout/switcher.js';
import { histRedo, histUndo } from './layout/undo.js';
import { closeNoteHistory } from './panels/bell/all-notifications.js';
import { extDlgDone } from './panels/extensions/extensions.js';
import { keysOn, showHelp } from './panels/help/help.js';
import { save } from './persistence.js';
import { chLabel } from './platforms/platforms.js';
import { flash } from './shared/flash.js';
import { setBarHidden } from './toolbar/header.js';
import { panel, savedBtn } from './toolbar/toolbar.js';
import { openCapturePicker } from './windows/capture.js';
import { isPaused, togglePause } from './windows/pause.js';
import { reloadWin } from './windows/views.js';
import { pushVol, saveSoon } from './windows/windows.js';

/* ---- Keyboard shortcuts ---- */
function bigStream(){
  const vids = buildCols().filter(c => isVid(c.top)).map(c => c.top);
  return (isFocusView() && vids.find(s => colKey(s) === featuredCh)) || vids.find(s => s.kind === 'stream') || null;
}
function makeBig(s){ if (!s) return; setFeatured(colKey(s)); layoutVars.scrollX = 0; columnsLayout(); }
function closeOverlays(){
  let any = false;
  // dialogs one at a time, the top one first (Import follows can sit over Settings); menus all at once
  const top = ['#extDlg', '#importDlg', '#ffDlg', '#capDlg', '#settingsDlg', '#profDlg', '#noteDlg'].map(sel => $(sel)).find(e => e && !e.hidden);
  if (top){ if (top.id === 'extDlg') extDlgDone(false); else if (top.id === 'noteDlg') closeNoteHistory(); else top.hidden = true; any = true; }
  else ['#layoutMenu', '#accountMenu', '#savedPanel', '#bellPanel', '#moreMenu', '#extMenu', '#barMenu'].forEach(sel => {
    const e = $(sel); if (e && !e.hidden){ e.hidden = true; any = true; }
  });
  const ae = document.activeElement;     // don't leave the keyboard in a box that just closed
  if (any && ae && ae !== document.body && ae.closest('.dlg-bg, .menu, #savedPanel, #bellPanel')) ae.blur();
  return any;
}
const layoutPick = l => { const b = document.querySelector(`#layoutMenu [data-l=${l}]`); if (b) b.click(); };

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === 'Escape'){ if (closeOverlays()) e.preventDefault(); return; }
    if (!keysOn) return;                                   // keyboard shortcuts switched off (Settings > General)
    if (k === 'F1'){ e.preventDefault(); showHelp('keys'); return; }
    if (typing || e.altKey) return;
    if (ctrl){
      if (ROLE !== 'main') return;
      const kk = k.toLowerCase();
      if (kk === 'z' && !e.shiftKey){ e.preventDefault(); histUndo(); }
      else if (kk === 'y' || (kk === 'z' && e.shiftKey)){ e.preventDefault(); histRedo(); }
      return;
    }
    if (k === '?'){ e.preventDefault(); showHelp('keys'); return; }
    if (ROLE !== 'main') return;
    const streams = () => buildCols().filter(c => isVid(c.top)).map(c => c.top);
    const big = bigStream();
    const digit = /^Digit([1-9])$/.exec(e.code);
    let handled = true;
    if (digit) makeBig(streams()[+digit[1] - 1]);
    else switch (k.length === 1 ? k.toLowerCase() : k){
      case 'n': case '/': if (panel.hidden) savedBtn.click(); input.focus(); input.select(); break;
      case 'b': $('#savedBtn').click(); break;
      case 'w': openCapturePicker(null); break;
      case 'h': setBarHidden(!document.body.classList.contains('focus')); break;
      case 'f': if (isFocusView()) layoutPick('columns'); else layoutPick('focus'); break;
      case 'c': layoutPick(e.shiftKey ? 'chatfocus' : 'columns'); break;
      case 'g': layoutPick('game'); break;
      case 't': layoutPick('tile'); break;
      case 'a': layoutPick('auto'); break;
      case 'l': if (e.shiftKey) setLayoutLocked(!layoutLocked); else $('#layoutBtn').click(); break;
      case 's': $('#swBtn').click(); break;
      case 'm':
        if (e.shiftKey){ wins.filter(o => o.kind === 'stream').forEach(o => { o.muted = true; pushVol(o); }); save(); syncSwitcher(); flash('All streams muted'); }
        else if (big && big.kind === 'stream'){ fsMute(big, false); flash(`${chLabel(big.channel)} ${big.muted ? 'muted' : 'unmuted'}`); }
        break;
      case ' ': case 'p': if (big && big.kind === 'stream'){ togglePause(big); flash(`${chLabel(big.channel)} ${isPaused(big) ? 'paused' : 'playing'}`); } break;
      case 'r':
        if (e.shiftKey){ wins.filter(o => o.kind === 'stream').forEach(reloadWin); flash('Refreshing every stream…'); }
        else if (big && big.kind === 'stream'){ reloadWin(big); flash(`Refreshing ${chLabel(big.channel)}…`); }
        break;
      case 'ArrowUp': case 'ArrowDown':
        if (big && big.kind === 'stream'){
          big.vol = Math.min(1, Math.max(0, Math.round((big.vol + (k === 'ArrowUp' ? 0.05 : -0.05)) * 100) / 100));
          big.muted = big.vol === 0; pushVol(big); saveSoon(); syncSwitcher();
          flash(`${chLabel(big.channel)} volume ${Math.round(big.vol * 100)}%`);
        }
        break;
      case 'ArrowLeft': case 'ArrowRight': {
        const d = k === 'ArrowRight' ? 1 : -1;
        if (isFocusView()){ const l = streams(), i = l.findIndex(s => colKey(s) === featuredCh); if (l.length) makeBig(l[(i + d + l.length) % l.length]); }
        else if (colsMode) scrollCols(d);
        else handled = false;
        break;
      }
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });
}

export { closeOverlays, init, layoutPick };
