import { ROLE, coreVars, wins } from './core.js';
import { chatStageLayout } from './layout/chat-stage.js';
import { columnsLayout } from './layout/columns.js';
import { chatFocusLayout, featSwitch, switchMode } from './layout/layouts.js';
import { placeSwitcher, setSwitchMode } from './layout/switch-control.js';
import { histCur, histSigOf, histSnap, redoStack, undoStack, undoVars, updateUndoBtns } from './layout/undo.js';
import { restore, save } from './persistence.js';
import { DESKTOP } from './shared/env.js';
import { settings } from './shared/settings.js';
import { store } from './shared/store.js';
import { updatePopBtn } from './windows/popout.js';

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  restore();
  if (ROLE === 'main'){
    let wasCols = false;
    wasCols = settings.flag('cols');
    if (wasCols) columnsLayout();
    else { const ll = settings.text('lastLayout');
           if (ll === 'chatfocus' && wins.length) chatFocusLayout();
           else if (ll === 'stage' && wins.length) chatStageLayout();
           else if (ll === 'auto') coreVars.lastLayout = 'auto'; }   // the windows are already where it left them
    store.changed('layout');
    setTimeout(() => { undoVars.histCur = histSnap(); undoVars.histSig = histSigOf(histCur); undoStack.length = redoStack.length = 0; updateUndoBtns(); }, 800);   // history starts here
    if (switchMode === 'window') setSwitchMode('window');           // reopen it the way you left it
    else if (switchMode === 'float'){ featSwitch.classList.add('floating'); placeSwitcher(); }
  }
  if (DESKTOP && ROLE === 'streams'){
    const ll = settings.get('streams.lastLayout'); if (ll === 'tile' || ll === 'spot') coreVars.lastLayout = ll;
    save();   // report what's here to the app
  }
  if (DESKTOP && ROLE === 'main'){
    let wasPopped = false;
    wasPopped = settings.flag('popped');
    if (wasPopped){ coreVars.popped = true; updatePopBtn(); window.kmv.openStreams([]); }   // reopen it like last time
  }
  store.changed('wins');
}

export { init };
