import '../panels/empty-stage/empty-stage.js';   // runs after it (see app.js)
import { fromApp } from '../shared/incoming.js';
import { store } from '../shared/store.js';
import { $, coreVars, wins } from '../core.js';
import { setTb } from '../shared/icons.js';
import { releaseWin } from '../chat/view-menu.js';
import { spamFirst } from '../alerts/spam-alerts.js';
import { autoLayout, chatFocusLayout, tile } from '../layout/layouts.js';
import { save } from '../persistence.js';
import { ask } from '../shared/ask.js';

/* ---------- wiring ---------- */
$('#auto').onclick = () => { coreVars.lastLayout = 'auto'; autoLayout(); };
$('#chatFocus').onclick = () => chatFocusLayout();
$('#tile').onclick = tile;
$('#clear').onclick = async () => { if (wins.length && await ask('Close all windows?', 'Every stream, chat and other window closes. Undo brings them back.', { ok: 'Close all', danger: true })) { [...wins].forEach(releaseWin); coreVars.wins = []; spamFirst.clear(); store.changed('wins'); save(); } };
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
if (MAC_BAR){
  fromApp('onTop', () => peekBar());   // the mouse reached the top edge (see win:watchTop in main.js)
  fromApp('onFullscreen', on => {
    document.body.classList.toggle('fullscreen', on);
    clearTimeout(lightsT);
    const cls = document.body.classList;
    window.kmv.setLights(on || ((!cls.contains('focus') || cls.contains('peek')) && !(cls.contains('bar-icons') && !cls.contains('bar-lights'))));
  });
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
$('#focusBtn').onclick = () => setBarHidden(!document.body.classList.contains('focus'));
function peekBar(){
  if (!document.body.classList.contains('focus') || document.body.classList.contains('peek')) return;
  document.body.classList.add('peek');
  showLights(true);
}
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

export { MAC_BAR, setBarHidden, showLights, updateFocusBtn };
