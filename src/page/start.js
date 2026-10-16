import './panels/settings/alerts.js';   // runs after it (see app.js)
import { POPPED_KEY, ROLE, coreVars, wins } from './core.js';
import { DESKTOP } from './shared/env.js';
import { updateEmpty } from './layout/lock.js';
import { chatFocusLayout, featSwitch, switchMode } from './layout/layouts.js';
import { columnsLayout } from './layout/columns.js';
import { placeSwitcher, setSwitchMode } from './layout/switch-control.js';
import { updateLayoutMenu } from './layout/column-drag.js';
import { updateModeClass } from './layout/chat-focus.js';
import { updatePopBtn } from './windows/popout.js';
import { restore, save } from './persistence.js';
import { histCur, histSigOf, histSnap, redoStack, undoStack, undoVars, updateUndoBtns } from './layout/undo.js';

restore();
if (ROLE === 'main'){
  let wasCols = false;
  try { wasCols = localStorage.getItem('kickMultiview.cols') === '1'; } catch {}
  if (wasCols) columnsLayout();
  else { let ll = ''; try { ll = localStorage.getItem('kickMultiview.lastLayout') || ''; } catch {}
         if (ll === 'chatfocus' && wins.length) chatFocusLayout();
         else if (ll === 'auto') coreVars.lastLayout = 'auto'; }   // the windows are already where it left them
  updateLayoutMenu(); updateModeClass();
  setTimeout(() => { undoVars.histCur = histSnap(); undoVars.histSig = histSigOf(histCur); undoStack.length = redoStack.length = 0; updateUndoBtns(); }, 800);   // history starts here
  if (switchMode === 'window') setSwitchMode('window');           // reopen it the way you left it
  else if (switchMode === 'float'){ featSwitch.classList.add('floating'); placeSwitcher(); }
}
if (DESKTOP && ROLE === 'streams'){
  try { const ll = localStorage.getItem('kickMultiview.streams.lastLayout'); if (ll === 'tile' || ll === 'spot') coreVars.lastLayout = ll; } catch {}
  save();   // report what's here to the app
}
if (DESKTOP && ROLE === 'main'){
  let wasPopped = false;
  try { wasPopped = localStorage.getItem(POPPED_KEY) === '1'; } catch {}
  if (wasPopped){ coreVars.popped = true; updatePopBtn(); window.kmv.openStreams([]); }   // reopen it like last time
}
updateEmpty();
