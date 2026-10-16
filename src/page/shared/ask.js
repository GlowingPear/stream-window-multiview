import '../panels/extensions/extensions.js';   // runs after it (see app.js)
import { $ } from '../core.js';

/* ---------- asking before something can't be undone ----------
   ask(title, message, { ok, danger }) -> Promise<true | false>. An in-app dialog instead of the browser's
   confirm(), which ignores the theme, freezes the page while it's open and can open behind other windows.
   Enter answers yes, Esc or clicking outside no. */
const askDlg = $('#askDlg');
let askDone = null;
// With { check: 'label' } a tick box shows under the message; askChecked() says whether it was ticked.
function ask(title, message, { ok = 'OK', danger = false, check = '' } = {}){
  if (askDone) askDone(false);
  askDlg.querySelector('#askTitle').textContent = title;
  askDlg.querySelector('#askMsg').textContent = message || '';
  const chk = askDlg.querySelector('.ask-chk');
  chk.hidden = !check; chk.querySelector('span').textContent = check; chk.querySelector('input').checked = false;
  const yes = askDlg.querySelector('.ask-yes');
  yes.textContent = ok;
  yes.classList.toggle('primary', !danger); yes.classList.toggle('danger-fill', danger);
  askDlg.hidden = false;
  yes.focus();
  return new Promise(resolve => {
    askDone = v => { askDone = null; askDlg.hidden = true; resolve(v); };
  });
}
const askChecked = () => !askDlg.querySelector('.ask-chk').hidden && askDlg.querySelector('.ask-chk input').checked;
window.ask = ask;   // for the tests
askDlg.querySelector('.ask-yes').onclick = () => askDone && askDone(true);
askDlg.querySelector('.ask-no').onclick = () => askDone && askDone(false);
askDlg.addEventListener('pointerdown', e => {
  if (e.target === askDlg && askDone) askDone(false);
  e.stopPropagation();   // the menu that asked stays open behind it
});
document.addEventListener('keydown', e => {
  if (!askDone) return;
  if (e.key === 'Escape' || e.key === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); askDone(e.key === 'Enter' && document.activeElement !== askDlg.querySelector('.ask-no')); }
  else if (e.key !== 'Tab') e.stopImmediatePropagation();   // no keyboard shortcuts behind the dialog
}, true);

export { ask, askChecked };
