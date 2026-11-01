import { SITE_BUTTONS, allOn, siteAction } from '../chat/all-chat.js';
import { newFor } from '../chat/new-messages.js';
import { $, wins } from '../core.js';
import { infoFor } from '../panels/channels/channels.js';
import { barButtons } from '../panels/settings/windows-pane.js';
import { PLAT_NAME, chLabel, platOf } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { icon } from '../shared/icons.js';
import { closeOnOutside } from '../shared/popover.js';
import { store } from '../shared/store.js';
import { tipName } from '../shared/tooltips.js';
import { tabChannels } from './frames.js';

/* ---------- title bars fit any window size ----------
   When a window's title bar is too narrow for everything, it first drops the volume %, then narrows the volume
   slider, then moves buttons into its ⋯ menu, and only then lets the title shrink. Last, its site tabs scroll sideways
   (the one you watch kept in sight). Close, mute, ⋯ and the button that's Never in ⋯ always stay on the bar. Re-fits when the window resizes or a button shows or hides.
   Settings › Windows says which buttons are always in the ⋯ menu, and the order: out of room, the leftmost go
   first. Until you change it there, the least-used go first (BAR_ORDER). */
const BAR_LEVELS = ['b1', 'b2'];
const BAR_ORDER = ['chat', 'mod', 'reload', 'popchat', 'pop', 'profile', 'overlay', 'at', 'feat', 'like', 'star', 'max'];
function fitBar(bar){
  if (!bar.isConnected || !bar.clientWidth) return;     // not on screen: fitted when it shows (it resizes then)
  const name = bar.querySelector('.col-pick') || bar.querySelector('.title'), more = bar.querySelector('[data-a=more]');
  const fits = () => bar.scrollWidth <= bar.clientWidth + 1;
  // start from everything showing, with the name keeping a few letters
  bar.classList.remove(...BAR_LEVELS, 'b3', 'b4', 'b5');
  bar.querySelectorAll('.btns .ovf').forEach(b => b.classList.remove('ovf'));
  const cfg = barButtons();
  if (more){
    for (const a of [...cfg.always, 'link', 'shout']){ const b = bar.querySelector(`.btns [data-a=${a}]`); if (b) b.classList.add('ovf'); }   // (Channel settings… and Shout out recent chatters only in ⋯)
    more.hidden = !bar.querySelector('.btns .ovf:not([hidden])');
  }
  name.style.minWidth = ''; name.style.flex = 'none';
  name.style.minWidth = Math.min(name.offsetWidth, 64 + (bar.querySelector('.bar-av') ? 21 : 0)) + 'px'; name.style.flex = '';   // (+ the picture on it)
  for (const c of BAR_LEVELS){ if (fits()) break; bar.classList.add(c); }
  if (!fits() && more){
    more.hidden = false;
    for (const a of (cfg.custom ? cfg.order : BAR_ORDER).filter(k => k !== cfg.never)){
      if (fits()) break;
      const b = bar.querySelector(`.btns [data-a=${a}]`);
      if (b && !b.hidden) b.classList.add('ovf');
    }
    more.hidden = !bar.querySelector('.btns .ovf:not([hidden])');
  }
  if (!fits()){ bar.classList.add('b3'); name.style.minWidth = ''; }
  if (!fits()) bar.classList.add('b4');
  if (!fits()) bar.classList.add('b5');
  fadeTabs(bar.querySelector('.ptabs'), true);
  bar.fitObs?.takeRecords();                               // ignore our own changes
}
// Site tabs that scroll (b5): the one you watch in sight, and a fade on the side that has more
function fadeTabs(box, toOn){
  if (!box) return;
  const on = box.querySelector('.ptab.on');
  if (toOn && on){
    const r = on.getBoundingClientRect(), b = box.getBoundingClientRect(), pad = 6;
    if (r.left < b.left + pad) box.scrollLeft -= b.left + pad - r.left;
    else if (r.right > b.right - pad) box.scrollLeft += r.right - (b.right - pad);
  }
  const end = box.scrollWidth - box.clientWidth;
  box.classList.toggle('fade-l', end > 1 && box.scrollLeft > 1);
  box.classList.toggle('fade-r', end > 1 && box.scrollLeft < end - 1);
}
let barSizes;
function watchBar(bar){
  barSizes.observe(bar);
  // a button showing or hiding (mod view, extensions, mentions) or a new title changes what fits
  bar.fitObs = new MutationObserver(() => fitBar(bar));
  bar.fitObs.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  const tabs = bar.querySelector('.ptabs');
  if (tabs){
    tabs.addEventListener('scroll', () => fadeTabs(tabs), { passive: true });
    // a mouse wheel scrolls them sideways
    tabs.addEventListener('wheel', e => {
      if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      tabs.scrollLeft += e.deltaY; e.preventDefault();
    }, { passive: false });
  }
}
let barMenu;
let barMenuFor = null;
function openBarMenu(more){
  if (!barMenu.hidden && barMenuFor === more){ barMenu.hidden = true; return; }
  barMenuFor = more;
  barMenu.innerHTML = '';
  barMenu.classList.remove('bm-all');
  const w = wins.find(o => o.el && o.el.contains(more));
  if (w && allOn(w)) return allBarMenu(w, more);
  let devHead = false;
  for (const b of more.closest('.btns').querySelectorAll('.ovf:not([hidden])')){
    // Developer tools' items (Settings › Developer) go last, under a heading of their own
    if (b.classList.contains('dev-b')){ devHead = true; continue; }
    barMenu.appendChild(barItem(b));
  }
  if (devHead){
    barMenu.appendChild(element('div', { class: 'bm-head', role: 'presentation' }, 'Developer'));
    for (const b of more.closest('.btns').querySelectorAll('.ovf.dev-b:not([hidden])')) barMenu.appendChild(barItem(b));
  }
  barMenu.hidden = false;
  const r = more.getBoundingClientRect(), mw = barMenu.offsetWidth;
  barMenu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
  barMenu.style.top = Math.min(innerHeight - barMenu.offsetHeight - 8, r.bottom + 4) + 'px';
}
// The top row's short names (a word each, under its icon)
const TILE_NAMES = { shout: 'Shout out', link: 'Settings', profile: 'Profile', reload: 'Reload', max: 'Maximize', at: 'Mentions', chat: 'Add chat', feat: 'Highlight', overlay: 'Overlay', like: 'Like' };
// ALL's ⋯ menu: what's for the whole streamer, then a line for each site with its buttons (icons, each with its tooltip)
function allBarMenu(w, more){
  const ovf = [...more.closest('.btns').querySelectorAll('.ovf:not([hidden])')], keys = new Set(ovf.map(b => b.dataset.a)), chs = tabChannels(w);
  barMenu.classList.add('bm-all');
  // the whole streamer's: a row of icons too
  const whole = ovf.filter(b => !SITE_BUTTONS.includes(b.dataset.a));
  if (whole.length) barMenu.appendChild(element('div', { class: 'bm-top', role: 'group', 'aria-label': 'Every site' }, ...whole.map(b => {
    const t = barItem(b).querySelector('.bm-t').textContent;
    return element('button', { type: 'button', role: 'menuitem', class: 'bm-act bm-tile' + (b.classList.contains('on') ? ' on' : ''), title: b.title || t, 'aria-label': t,
      onclick: () => { barMenu.hidden = true; if (b.isConnected) b.click(); } },
      element('span', { class: 'bm-ti', html: b.dataset.a === 'chat' ? icon.plus : b.querySelector('svg')?.outerHTML || '' }), element('span', 'bm-tl', TILE_NAMES[b.dataset.a] || t));
  })));
  // the mod view's place: only where you moderate one of their sites (then greyed where you don't, and YouTube's like)
  const modAny = chs.some(ch => { const x = siteAction('mod', ch); return x.key !== 'like' && !x.off; });
  const acts = SITE_BUTTONS.filter(a => keys.has(a) && (a !== 'mod' || modAny));
  if (acts.length){
    if (barMenu.children.length) barMenu.appendChild(element('hr', 'bm-hr'));
    for (const ch of chs){
      const p = platOf(ch), live = infoFor(ch)?.live;
      barMenu.appendChild(element('div', { class: 'bm-site', role: 'group', 'aria-label': PLAT_NAME[p] },
        element('span', { class: 'bm-sn', title: `${PLAT_NAME[p]}${live ? ' · live' : ''}` }, element('i', { class: 'pi pi-' + p + (live ? ' bm-live' : '') }, PLAT_NAME[p][0]), element('span', null, PLAT_NAME[p])),
        ...acts.map(a => {
          const x = siteAction(a, ch);
          return element('button', { type: 'button', role: 'menuitem', class: 'bm-act' + (x.on ? ' on' : '') + (x.dev ? ' bm-dev' : ''), disabled: x.off, title: x.title, 'aria-label': x.title, dataset: { cmd: 'win.site.' + (x.key || a) }, html: x.icon,
            onclick: () => { barMenu.hidden = true; x.run(more); if (x.keep) openBarMenu(more); } });
        })));
    }
  }
  barMenu.hidden = false;
  const r = more.getBoundingClientRect(), mw = barMenu.offsetWidth;
  barMenu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
  barMenu.style.top = Math.min(innerHeight - barMenu.offsetHeight - 8, r.bottom + 4) + 'px';
}
// One item of the ⋯ menu: what its button does.
function barItem(b){
  const item = document.createElement('button');
  item.setAttribute('role', 'menuitem');
  item.className = b.classList.contains('on') ? 'on' : '';
  item.innerHTML = '<span class="bm-ico"></span><span class="bm-t"></span>';
  item.querySelector('.bm-ico').innerHTML = b.dataset.a === 'chat' ? '+' : b.querySelector('svg')?.outerHTML || b.textContent;
  item.querySelector('.bm-t').textContent = b.dataset.a === 'chat' ? 'Add chat' : b.dataset.a === 'link' ? 'Channel settings…' : tipName(b) || b.title;
  const n = b.querySelector('.ext-n')?.textContent;
  if (n) item.append(element('span', 'bm-n', n));
  item.title = b.title;
  item.onclick = () => { barMenu.hidden = true; if (b.isConnected) b.click(); };
  return item;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
// New messages in a stream's chat while it's out of sight (chat/new-messages.js), next to the stream's name
function syncBarCounts(){
  wins.forEach(w => {
    const b = w.kind === 'stream' && w.el.querySelector('.bar-n'); if (!b) return;
    const n = newFor(w.channel);
    b.hidden = !n;
    b.textContent = n > 99 ? '99+' : String(n);
    b.title = n ? `${n} new message${n === 1 ? '' : 's'} in ${chLabel(w.channel)}'s chat` : '';
  });
}

function init(){
  barSizes = new ResizeObserver(es => es.forEach(e => fitBar(e.target)));
  if (document.fonts) document.fonts.ready.then(() => document.querySelectorAll('#stage .bar').forEach(fitBar));

  // The ⋯ menu: the buttons that didn't fit, each doing what its button does.
  barMenu = $('#barMenu');
  closeOnOutside(barMenu, { button: () => barMenuFor, capture: true });
  store.watch('unread', syncBarCounts);
}

export { init, openBarMenu, watchBar };
