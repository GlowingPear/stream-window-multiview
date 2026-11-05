import { $ } from '../core.js';
import { element } from './element.js';

let askDlg;
let askDone = null;
// With { check: 'label' } a tick box shows under the message; askChecked() says whether it was ticked.
// With { choices: [{ v, t, sub, tag }], value } you pick one of them, and the promise gives its v (or false).
// note: a line beside the buttons. message: text, or elements (a name in bold).
function ask(title, message, { ok = 'OK', danger = false, check = '', choices = null, value, note = '' } = {}){
  if (askDone) askDone(false);
  askDlg.querySelector('#askTitle').textContent = title;
  askDlg.querySelector('#askMsg').replaceChildren(...[].concat(message || ''));
  const chk = askDlg.querySelector('.ask-chk');
  chk.hidden = !check; chk.querySelector('span').textContent = check; chk.querySelector('input').checked = false;
  const opts = askDlg.querySelector('.ask-opts'), foot = askDlg.querySelector('.ask-note');
  let picked = choices ? (choices.some(c => c.v === value) ? value : choices[0].v) : true;
  const mark = () => opts.querySelectorAll('.ask-opt').forEach(b => { const on = b.dataset.v === picked; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  opts.hidden = !choices;
  opts.replaceChildren(...(choices || []).map(c => element('button', { type: 'button', class: 'ask-opt', role: 'radio', dataset: { v: c.v },
    onclick: () => { picked = c.v; mark(); } }, element('i'), element('span', null, element('b', null, c.t, c.tag ? element('em', null, c.tag) : ''), c.sub ? element('small', null, c.sub) : ''))));
  mark();
  foot.hidden = !note; foot.textContent = note;
  askDlg.querySelector('.dlg').classList.toggle('wide', !!choices);
  const yes = askDlg.querySelector('.ask-yes');
  yes.textContent = ok;
  yes.classList.toggle('primary', !danger); yes.classList.toggle('danger-fill', danger);
  askDlg.hidden = false;
  yes.focus();
  return new Promise(resolve => {
    askDone = v => { askDone = null; askDlg.hidden = true; resolve(v && picked); };
  });
}
const askChecked = () => !askDlg.querySelector('.ask-chk').hidden && askDlg.querySelector('.ask-chk input').checked;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* ---------- asking before something can't be undone ----------
     ask(title, message, { ok, danger }) -> Promise<true | false>. An in-app dialog instead of the browser's
     confirm(), which ignores the theme, freezes the page while it's open and can open behind other windows.
     Enter answers yes, Esc or clicking outside no. */
  askDlg = $('#askDlg');
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
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest && e.target.closest('.ask-opt')){   // the choices, as radio buttons
      e.preventDefault(); e.stopImmediatePropagation();
      const all = [...askDlg.querySelectorAll('.ask-opt')], i = all.indexOf(e.target.closest('.ask-opt'));
      const to = all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]; to.click(); to.focus();
    }
    else if (e.key !== 'Tab') e.stopImmediatePropagation();   // no keyboard shortcuts behind the dialog
  }, true);
}

export { ask, askChecked, init };
