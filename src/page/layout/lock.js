import '../windows/raids.js';   // runs after it (see app.js)
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { $, ROLE, colsMode, empty, lastLayout, wins } from '../core.js';
import { setTb } from '../shared/icons.js';
import { SH, SW, focusWin, setRect } from './geometry.js';
import { flash } from '../shared/flash.js';
import { autoLayout, chatFocusLayout, tile } from './layouts.js';
import { columnsLayout } from './columns.js';
import { save } from '../persistence.js';
import { gameLayout, isGame } from './game-focus.js';

/* Lock layout (Layout menu padlock, Shift+L): windows keep their size and place. Dragging one onto another swaps
   them, and the layout fits around windows that close or open. The main window's. */
let layoutLocked = false;
layoutLocked = settings.flag('layoutLocked');
const locked = () => layoutLocked && ROLE === 'main';
function setLayoutLocked(on, quiet){
  layoutLocked = !!on;
  settings.set('layoutLocked', on);
  document.body.classList.toggle('layout-locked', locked());
  const b = $('#layoutLock'), t = on ? 'Unlock layout' : 'Lock layout';
  b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', !!on); b.setAttribute('aria-label', t); b.title = t + ' (Shift+L)';
  setTb($('#layoutBtn'), 'Layout', locked() ? 'lock' : 'layout');
  if (quiet) return;      // (at start-up the menu isn't set up yet; it shows this when it is)
  store.changed('layout');
  flash(on ? 'Layout locked: drag a window onto another to swap them' : 'Layout unlocked');
}
setLayoutLocked(layoutLocked, true);
$('#layoutLock').onclick = () => setLayoutLocked(!layoutLocked);
// Locked: the layout in use fits around windows that opened or closed.
function refitLocked(){
  if (!locked()) return;
  if (colsMode) columnsLayout();
  else if (lastLayout === 'auto') autoLayout();
  else if (lastLayout === 'tile') tile();
  else if (lastLayout === 'chatfocus') chatFocusLayout();
  else if (lastLayout === 'game') gameLayout();
}
function toggleMax(w){
  if (w.max){ setRect(w, w.max, true); w.max = null; }
  else { w.max = { x: w.x, y: w.y, w: w.w, h: w.h }; setRect(w, { x: 0, y: 0, w: SW(), h: SH() }, true); focusWin(w); }
  save();
}
let colsT;
// Windows opened or closed: the empty stage's message, each "+ Chat" (only when that channel's chat isn't open,
// which frees room for the name), and the layout fitting them in. (The Channels list, the stars, the name
// dropdowns and the empty stage watch it too.)
store.watch('wins', () => {
  empty.style.display = wins.length ? 'none' : '';
  wins.forEach(w => { const b = w.el.querySelector('[data-a=chat]'); if (b) b.hidden = wins.some(o => o.kind === 'chat' && o.channel === w.channel); });
  if (colsMode){ clearTimeout(colsT); colsT = setTimeout(columnsLayout, 30); }
  else if (typeof isGame === 'function' && isGame()){ clearTimeout(colsT); colsT = setTimeout(gameLayout, 30); }
});

export { layoutLocked, locked, refitLocked, setLayoutLocked, toggleMax };
