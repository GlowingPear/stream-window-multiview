import { $, wins } from '../../core.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';

/* ---- Settings › Windows: stream and chat windows' title bars ----
   The channel's name on stream / chat windows (off: the picture and the site tabs), and each title bar button's
   place and ⋯ choice: Always in ⋯, When out of room (the default) or Never in ⋯ (one button at most, always the one
   next to ⋯). Dragging the rows sets the buttons' order on the bar; out of room, they go into ⋯ from the left.
   Saved as barButtons: { order, always, never }. Close, mute and ⋯ always stay. */
const BAR_BUTTONS = {
  chat: ['+ Chat', 'Stream windows: open its chat beside it', 'plus'],
  feat: ['Highlight', 'Make this stream big', 'feat'],
  at: ['Mentions (@)', 'Kick and Twitch chats', 'at'],
  overlay: ['Chat over the stream', 'Stream windows', 'chat'],
  like: ['Like', 'YouTube streams', 'like'],
  star: ['Save', 'Every window', 'star'],
  profile: ['Profile', 'Every window', 'user'],
  ext: ['Extensions', 'When a window has some', 'ext'],
  state: ['Copy window state', 'Developer tools', 'copy'],
  inspect: ['Inspect', 'Developer tools', 'code'],
  reload: ['Reload', 'Every window', 'reload'],
  mod: ['Mod view', 'Channels you moderate', 'mod'],
  pop: ['Channel page', 'Every window: in a pop-up', 'pop'],
  popchat: ['Chat pop-up', 'Chat windows: just the chat, in a pop-up', 'chatpop'],
  max: ['Maximize', 'Every window', 'max']
};
const DEFAULT_ORDER = Object.keys(BAR_BUTTONS);         // the order the bar always had
const DEFAULT_ALWAYS = ['ext', 'state', 'inspect'];
const CHOICES = [['always', 'Always in ⋯', 'It\'s never on the bar, only in the ⋯ menu'], ['room', 'When out of room', 'On the bar until it\'s too narrow, then in the ⋯ menu'],
  ['never', 'Never in ⋯', 'Always on the bar, right next to ⋯ (one button at most)']];
// What's saved, completed: every button once, in order
function barButtons(){
  const b = settings.json('barButtons', null) || {};
  const order = (Array.isArray(b.order) ? b.order : []).filter(k => BAR_BUTTONS[k]);
  DEFAULT_ORDER.forEach(k => { if (!order.includes(k)) order.splice(DEFAULT_ORDER.indexOf(k), 0, k); });
  const never = BAR_BUTTONS[b.never] ? b.never : null;
  return { order: [...new Set(order)], always: (Array.isArray(b.always) ? b.always : DEFAULT_ALWAYS).filter(k => BAR_BUTTONS[k] && k !== never), never, custom: !!settings.get('barButtons') };
}
const choiceOf = (cfg, k) => cfg.never === k ? 'never' : cfg.always.includes(k) ? 'always' : 'room';
function saveBar(cfg){ settings.set('barButtons', { order: cfg.order, always: cfg.always, never: cfg.never }); store.changed('barButtons'); }
function setChoice(k, c){
  const cfg = barButtons();
  movedK = k;
  cfg.always = cfg.always.filter(x => x !== k);
  if (cfg.never === k) cfg.never = null;
  if (c === 'always') cfg.always.push(k);
  if (c === 'never') cfg.never = k;      // the one before goes back to When out of room, in its place
  saveBar(cfg);
}
function resetBar(){ settings.remove('barButtons'); store.changed('barButtons'); }
// A window's buttons in the order Settings › Windows says, the Never in ⋯ one next to ⋯
function arrangeButtons(w){
  const btns = w.el.querySelector('.btns'), more = btns && btns.querySelector('[data-a=more]'); if (!more) return;
  const cfg = barButtons();
  for (const k of cfg.order){ if (k === cfg.never) continue; const b = btns.querySelector(`:scope > [data-a=${k}]`); if (b) btns.insertBefore(b, more); }
  const nb = cfg.never && btns.querySelector(`:scope > [data-a=${cfg.never}]`); if (nb) btns.insertBefore(nb, more);
  btns.querySelectorAll(':scope > .pinned').forEach(b => b.classList.remove('pinned'));
  if (nb) nb.classList.add('pinned');
}
// The bar's name: off for that kind of window (the picture, a small ▾ and the tabs)
const nameShown = w => w.kind === 'chat' ? settings.flag('barNameChat', true) : w.kind === 'stream' ? settings.flag('barNameStream', true) : true;
function syncBarName(w){
  const bar = w.el.querySelector('.bar'); if (!bar) return;
  bar.classList.toggle('nm-off', !!w.channel && !nameShown(w));
}

let list, preview, dragK = null, movedK = null;
// The rows and the preview's buttons glide to their new places, and the one you moved lifts off the list on its way
// there, then glows where it lands (a row's place before and after the change: FLIP)
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const placesOf = box => new Map([...box.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e.getBoundingClientRect()]));
function glide(box, before, axis){
  box.querySelectorAll('[data-k]').forEach(e => {
    const was = before.get(e.dataset.k), now = e.getBoundingClientRect(); if (!was) return;
    const d = axis === 'y' ? was.top - now.top : was.left - now.left, mine = e.dataset.k === movedK;
    const at = f => axis === 'y' ? `translateY(${d * f}px)` : `translateX(${d * f}px)`;
    if (mine && axis === 'y'){
      e.classList.add('wb-lift');
      const lifted = '0 14px 30px rgba(0,0,0,.55)';
      e.animate([{ transform: at(1) }, { transform: `${at(.82)} scale(1.035)`, boxShadow: lifted, offset: .22 }, { transform: 'scale(1.035)', boxShadow: lifted, offset: .8 }, { transform: 'none' }],
        { duration: d ? 760 : 420, easing: EASE }).finished.then(() => { e.classList.remove('wb-lift'); if (e.classList.contains('pinned')) e.classList.add('wb-glow'); }, () => {});
    } else if (mine) e.animate([{ transform: at(1) }, { transform: `${at(.4)} scale(1.25)`, offset: .5 }, { transform: 'none' }], { duration: 620, easing: EASE });
    else if (d) e.animate([{ transform: at(1) }, { transform: 'none' }], { duration: 420, easing: EASE });
  });
}
function renderWindowsPane(){
  if (!list) return;
  const cfg = barButtons();
  const anim = !!list.offsetParent && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rows = anim && placesOf(list), btns = anim && placesOf(preview);
  $('#barNameStream').checked = settings.flag('barNameStream', true);
  $('#barNameChat').checked = settings.flag('barNameChat', true);
  const row = k => {
    const [name, where, ico] = BAR_BUTTONS[k], c = choiceOf(cfg, k), pinned = c === 'never';
    const seg = element('div', { class: 'seg wb-seg', role: 'radiogroup', 'aria-label': `${name}: in the ⋯ menu` },
      ...CHOICES.map(([v, label, tip]) => element('button', { type: 'button', class: v === c ? 'on' : '', role: 'radio', 'aria-checked': String(v === c), title: tip,
        dataset: { cmd: `bar.${k}.${v}` }, onclick: () => setChoice(k, v) }, label)));
    const r = element('div', { class: 'wb-row' + (pinned ? ' pinned' : ''), role: 'listitem', draggable: pinned ? 'false' : 'true', dataset: { k, st: name, stSub: (pinned ? 'next to ⋯, always on the bar' : where) } },
      element('span', { class: 'wb-grip', html: pinned ? '' : icon.grip, title: pinned ? '' : 'Drag to change the order on the bar' }),
      element('span', { class: 'wb-ico', html: icon[ico] || '' }),
      element('span', 'wb-name', element('b', null, name), element('small', null, pinned ? 'next to ⋯, always on the bar' : where)), seg);
    r.addEventListener('dragstart', e => { dragK = k; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    r.addEventListener('dragend', () => { dragK = null; r.classList.remove('dragging'); list.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); });
    r.addEventListener('dragover', e => {
      if (!dragK || dragK === k || pinned) return;
      e.preventDefault();
      const after = e.offsetY > r.offsetHeight / 2;
      r.classList.toggle('drop-after', after); r.classList.toggle('drop-before', !after);
    });
    r.addEventListener('dragleave', () => r.classList.remove('drop-before', 'drop-after'));
    r.addEventListener('drop', e => {
      e.preventDefault(); if (!dragK || dragK === k) return;
      moveButton(dragK, k, r.classList.contains('drop-after'));
    });
    return r;
  };
  const keys = cfg.order.filter(k => k !== cfg.never).concat(cfg.never ? [cfg.never] : []);
  list.replaceChildren(...keys.map(row));
  // the preview: a title bar with the buttons in this order, the ones always in ⋯ left out
  const shown = keys.filter(k => !cfg.always.includes(k) && !['state', 'inspect'].includes(k));
  preview.replaceChildren(element('span', { class: 'wb-av' }, 'QU'), element('b', 'wb-nm', 'quietkoala ▾'), element('i', { class: 'pi pi-kick' }, 'K'), element('span', 'wb-gap'),
    ...shown.map(k => element('span', { class: 'wb-b' + (k === cfg.never ? ' pinned' : ''), title: BAR_BUTTONS[k][0], dataset: { k }, html: k === 'chat' ? icon.plus : icon[BAR_BUTTONS[k][2]] || '' })),
    element('span', { class: 'wb-b', title: 'More' }, '⋯'), element('span', { class: 'wb-b', html: icon.close }));
  if (anim){ glide(list, rows, 'y'); glide(preview, btns, 'x'); }
  movedK = null;
}
// Drag a row: it goes before (or after) another one
function moveButton(k, to, after){
  const cfg = barButtons(), order = cfg.order.filter(x => x !== k);
  order.splice(order.indexOf(to) + (after ? 1 : 0), 0, k);
  cfg.order = order; movedK = k; saveBar(cfg);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  list = $('#wbList'); preview = $('#wbPreview');
  if (!list) return;
  $('#barNameStream').addEventListener('change', e => { settings.set('barNameStream', e.target.checked); store.changed('barButtons'); });
  $('#barNameChat').addEventListener('change', e => { settings.set('barNameChat', e.target.checked); store.changed('barButtons'); });
  $('#wbReset').onclick = resetBar;
  settings.onChange(['barButtons', 'barNameStream', 'barNameChat'], () => store.changed('barButtons'));   // changed in the other window
  store.watch('barButtons', () => { renderWindowsPane(); wins.forEach(w => { arrangeButtons(w); syncBarName(w); }); });
  // each button's choice, from the search box: "Never in ⋯: Reload"
  commands.provide('barButtons', () => Object.entries(BAR_BUTTONS).flatMap(([k, [name]]) => CHOICES.map(([v, label]) => ({
    id: `bar.${k}.${v}`, kind: 'setting', group: 'Settings', title: `${label}: ${name}`, sub: 'Settings › Windows › Buttons and the ⋯ menu', words: ['title bar', 'button', 'menu'],
    icon: 'winbar', disabled: () => choiceOf(barButtons(), k) === v && 'Already chosen', run: () => setChoice(k, v) }))));
  renderWindowsPane();
  window.barButtons = barButtons;   // for the tests
}

export { arrangeButtons, barButtons, init, nameShown, syncBarName };
