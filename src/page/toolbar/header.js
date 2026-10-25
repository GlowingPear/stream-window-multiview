import { spamFirst } from '../alerts/spam-alerts.js';
import { releaseWin } from '../chat/view-menu.js';
import { $, ROLE, coreVars, wins } from '../core.js';
import { autoLayout, chatFocusLayout, tile } from '../layout/layouts.js';
import { save } from '../persistence.js';
import { ask } from '../shared/ask.js';
import { commands } from '../shared/commands.js';
import { setTb } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { store } from '../shared/store.js';

// Hide bar: the toolbar slides away (it peeks out when the mouse touches the top edge). The same button,
// Esc and H bring it back.
// On macOS the traffic lights go with it: away as soon as it starts sliding off, back once it has slid in.
const MAC_BAR = !!(window.kmv && window.kmv.platform === 'darwin' && window.kmv.setLights);
let lightsT;
// In fullscreen macOS shows them itself, in the strip that drops down with the menu bar, so they're left alone there.
function showLights(on){
  if (!MAC_BAR) return;
  const cls = document.body.classList;
  if (cls.contains('bar-icons') && !cls.contains('bar-lights')) on = false;   // the slim left column has no room for them (but see setBarLights)
  clearTimeout(lightsT);
  if (document.body.classList.contains('fullscreen')) return;
  if (on) lightsT = setTimeout(() => window.kmv.setLights(true), 200);   // the header's slide takes .2s
  else window.kmv.setLights(false);
}
function setBarHidden(on){
  document.body.classList.toggle('focus', on);
  document.body.classList.remove('peek');
  showLights(!on);
  if (MAC_BAR) window.kmv.watchTop(on, document.body.classList.contains('bar-left') ? 'left' : 'top');
  updateFocusBtn();
  if (on && document.activeElement && document.activeElement.closest('header')) document.activeElement.blur();
  setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
}
function updateFocusBtn(){
  const on = document.body.classList.contains('focus'), left = document.body.classList.contains('bar-left'), b = $('#focusBtn');
  setTb(b, on ? 'Show bar' : 'Hide bar', (on ? 'showbar' : 'hidebar') + (left ? 'L' : ''));
  b.title = on ? 'Keep this toolbar showing (or press Esc)' : `Hide this toolbar (move the mouse to the ${left ? 'left' : 'top'} edge or press Esc to bring it back)`;
}
function peekBar(){
  if (!document.body.classList.contains('focus') || document.body.classList.contains('peek')) return;
  document.body.classList.add('peek');
  showLights(true);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* ---------- wiring ---------- */
  $('#auto').onclick = () => { coreVars.lastLayout = 'auto'; autoLayout(); };
  $('#chatFocus').onclick = () => chatFocusLayout();
  $('#tile').onclick = tile;
  $('#clear').onclick = async () => { if (wins.length && await ask('Close all windows?', 'Every stream, chat and other window closes. Undo brings them back.', { ok: 'Close all', danger: true })) { [...wins].forEach(releaseWin); coreVars.wins = []; spamFirst.clear(); store.changed('wins'); save(); } };
  if (MAC_BAR){
    fromApp('onTop', () => peekBar());   // the mouse reached the top edge (see win:watchTop in main.js)
    fromApp('onFullscreen', on => {
      document.body.classList.toggle('fullscreen', on);
      clearTimeout(lightsT);
      const cls = document.body.classList;
      window.kmv.setLights(on || ((!cls.contains('focus') || cls.contains('peek')) && !(cls.contains('bar-icons') && !cls.contains('bar-lights'))));
    });
  }
  $('#focusBtn').onclick = () => setBarHidden(!document.body.classList.contains('focus'));
  $('#focusBtn').dataset.cmd = 'toolbar.hide';   // (the search box's Hide the toolbar / Show the toolbar: shortcuts.js)
  commands.add([
    { id: 'windows.closeAll', title: 'Close every window', sub: 'Every stream, chat and other window (Undo brings them back)', words: ['clear', 'close all'], icon: 'bin', button: '#clear',
      disabled: () => !wins.length && 'Nothing open' },
    { id: 'streams.tile', group: 'Layouts', kind: 'layout', title: 'Tile', sub: 'Every window gets equal space', words: ['grid', 'even'], icon: 'tile', button: '#tile', when: () => ROLE === 'streams' },
    { id: 'streams.spotlight', group: 'Layouts', kind: 'layout', title: 'Spotlight', sub: 'The stream you last clicked big, the others beside it', icon: 'feat', button: '#spotBtn' }
  ]);
  $('#reveal').addEventListener('mouseenter', peekBar);
  $('#reveal').addEventListener('mousemove', peekBar);   // the mouse may already be up there when the bar slides away
  document.querySelector('header').addEventListener('mouseleave', e => {
    if (document.body.classList.contains('bar-left') ? e.clientX <= 0 : e.clientY <= 0) return;   // off the edge (in fullscreen, into the menu bar): still on its way to the bar
    document.body.classList.remove('peek');
    if (document.body.classList.contains('focus')) showLights(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('focus')) setBarHidden(false);
  });
}

export { init, MAC_BAR, setBarHidden, showLights, updateFocusBtn };
