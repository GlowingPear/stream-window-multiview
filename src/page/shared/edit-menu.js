import { element } from './element.js';
import { DESKTOP } from './env.js';
import { fromApp } from './incoming.js';
import { closeOnOutside } from './popover.js';

/* ---- The right-click menu in the app's own text boxes (ALL's box, the Channels box, Settings' boxes) ----
   As the sites' chat boxes have it (src/main/context-menu.js), but drawn here, as the app's page has no system menus:
   a misspelled word's suggestions and Add to dictionary, then Undo, Redo, Cut, Copy, Paste and Select all. The desktop
   app says what's under the pointer and does what's chosen (main.js editMenuFor). */
let menu = null;
function openEditMenu(d){
  if (!menu){
    menu = element('div', { class: 'pop edit-menu', role: 'menu', 'aria-label': 'Edit', hidden: true });
    document.body.append(menu);
    closeOnOutside(menu);
    menu.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); menu.hidden = true; } });
  }
  const can = d.can || {}, sugs = Array.isArray(d.sugs) ? d.sugs.filter(s => typeof s === 'string') : [];
  const item = (label, act, on = true, cls = '') => element('button', { type: 'button', role: 'menuitem', class: 'edit-mi' + (cls ? ' ' + cls : ''), disabled: !on, dataset: { cmd: 'edit.' + act.do },
    onclick: () => { menu.hidden = true; if (window.kmv && window.kmv.editDo) window.kmv.editDo(act); } }, label);
  const word = typeof d.word === 'string' ? d.word : '';
  menu.replaceChildren(...[
    ...(word ? [...(sugs.length ? sugs.map(s => item(s, { do: 'replaceMisspelling', word: s }, true, 'sug')) : [element('div', 'edit-none', 'No spelling suggestions')]),
      item('Add to dictionary', { do: 'addWord', word }), element('hr')] : []),
    item('Undo', { do: 'undo' }, !!can.undo), item('Redo', { do: 'redo' }, !!can.redo), element('hr'),
    item('Cut', { do: 'cut' }, !!can.cut), item('Copy', { do: 'copy' }, !!can.copy), item('Paste', { do: 'paste' }, !!can.paste), item('Select all', { do: 'selectAll' }, can.selectAll !== false)]);
  menu.hidden = false;
  const w = menu.offsetWidth, h = menu.offsetHeight, x = +d.x || 0, y = +d.y || 0;
  menu.style.left = Math.max(6, Math.min(innerWidth - w - 6, x)) + 'px';
  menu.style.top = Math.max(6, Math.min(innerHeight - h - 6, y + h > innerHeight - 6 ? y - h : y)) + 'px';
  menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  if (DESKTOP) fromApp('onEditMenu', openEditMenu);
  window.openEditMenu = openEditMenu;   // for the tests (the desktop app says when)
}

export { init };
