import { $ } from '../core.js';
import { linkConnected, linkIcon, linkState, showPearDrops } from '../platforms/pear-drops.js';
import { element } from '../shared/element.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { placeMenu } from './toolbar.js';

/* ---- The toolbar's farming widget (Settings › Connected apps, "Show what Pear Drops is farming in the toolbar"):
   while a linked Pear Drops farms, the channel's picture and name, the drop's progress and the next reward. Its hover
   card has the whole reward track. A click brings Pear Drops to the front. ---- */
let btn, card, tick = null, hideT = null, logo = '';

const farmingNow = () => {
  const f = linkState && linkState.farming;
  return settings.flag('link.widget', true) && linkConnected() && f && f.state === 'farming' ? f : null;
};
// "12m", "1h 5m", "3 days": how long until a time (null when it's gone or unknown)
function until(iso, long){
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return null;
  const min = Math.max(1, Math.round(ms / 60000));
  if (min >= 2 * 1440) return Math.round(min / 1440) + ' days';
  if (min >= 60) return Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + (min % 60) + 'm' : '');
  return min + (long ? ' min' : 'm');
}
const clock = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const pct = (n, total) => (total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0);
// A picture from Kick: its https address, with Pear Drops' logo (or nothing) in its place if it fails.
function setPic(img, src, fallback = logo){
  img.classList.remove('fw-none');
  img.onerror = () => { img.onerror = null; if (fallback) img.src = fallback; else img.classList.add('fw-none'); };
  if (src && /^(https|data):/.test(src)) img.src = src; else img.onerror();
}
const pic = (src, cls, fallback) => { const img = element('img', { class: cls, alt: '', referrerpolicy: 'no-referrer' }); setPic(img, src, fallback); return img; };

function renderChip(f){
  const ch = f.channel || {}, drop = f.drop || {}, prog = drop.progress || {}, next = drop.next;
  const name = ch.name || ch.slug || 'Pear Drops';
  const av = btn.querySelector('.fw-av');
  if (av.dataset.src !== (ch.avatar || '') || !av.getAttribute('src')){ av.dataset.src = ch.avatar || ''; setPic(av, ch.avatar); }
  btn.querySelector('.fw-name').textContent = name;
  btn.querySelector('.fw-bar').hidden = !prog.total;
  btn.querySelector('.fw-bar i').style.width = pct(prog.done, prog.total) + '%';
  const left = next && until(next.unlocksAt);
  btn.querySelector('.fw-next').textContent = next && next.name ? next.name + (left ? ' in ' + left : '') : '';
  btn.setAttribute('aria-label', `Pear Drops is farming on ${name}` + (drop.campaign ? ` (${drop.campaign})` : '') + '. Open Pear Drops');   // (the hover card says it: no tooltip)
}

function renderCard(f){
  const ch = f.channel || {}, drop = f.drop || {}, prog = drop.progress || {}, rewards = drop.rewards, next = drop.next;
  const name = ch.name || ch.slug || '';
  const unit = prog.unit === 'minutes' || !prog.unit ? 'min' : prog.unit;
  const head = element('div', 'fw-head', pic(logo, 'fw-logo'), element('div', 'fw-ht',
    element('b', null, drop.campaign || drop.category || 'Pear Drops'),
    element('span', null, 'Pear Drops is farming' + (name ? ' on ' + name : '') + (prog.total ? ` · ${prog.done || 0} / ${prog.total} ${unit}` : ''))));
  const parts = [head];
  if (prog.total){
    const items = (rewards && Array.isArray(rewards.items) ? rewards.items : []).filter(it => it && it.required > 0);
    parts.push(element('div', 'fw-track',
      element('div', 'fw-rail', element('i', { style: { width: pct(prog.done, prog.total) + '%' } })),
      ...items.map(it => element('span', {
        class: 'fw-item' + (it.state === 'claimed' ? ' claimed' : ''), title: it.name + (it.state === 'claimed' ? ' (claimed)' : ''),
        style: { left: pct(it.required, prog.total) + '%' }
      }, pic(it.image, 'fw-item-img', ''), it.state === 'claimed' ? element('em', null, '✓') : null))));
  }
  const left = next && until(next.unlocksAt, true);
  const row1 = element('div', 'fw-row',
    next && next.name ? element('span', null, element('b', null, next.name), left ? ' unlocks in ' + left : '') : element('span'),
    rewards && rewards.total ? element('span', null, `${rewards.claimed || 0} of ${rewards.total} claimed`) : null);
  const ends = drop.endsAt && until(drop.endsAt);
  const row2 = element('div', 'fw-row fw-dim',
    drop.doneAt && clock(drop.doneAt) ? element('span', null, 'All rewards by ' + clock(drop.doneAt)) : element('span'),
    ends ? element('span', null, 'Ends in ' + ends) : null);
  parts.push(row1, row2, element('button', { type: 'button', class: 'linkish fw-open', onclick: () => showPearDrops() }, 'Open Pear Drops →'));
  card.replaceChildren(...parts);
}

function render(){
  if (!btn) return;
  const f = farmingNow();
  btn.hidden = !f;
  if (!f){ card.hidden = true; clearInterval(tick); tick = null; return; }
  renderChip(f);
  if (!card.hidden){ renderCard(f); placeMenu(card, btn, true); }
  if (!tick) tick = setInterval(render, 30000);    // the times count down
}
function showCard(){
  clearTimeout(hideT);
  const f = farmingNow();
  if (!f) return;
  card.hidden = false;
  renderCard(f);
  placeMenu(card, btn, true);
}
const hideSoon = () => { clearTimeout(hideT); hideT = setTimeout(() => { card.hidden = true; }, 250); };

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  btn = $('#farmBtn'); card = $('#farmCard');
  if (!btn || !card) return;
  btn.onclick = () => showPearDrops();
  btn.addEventListener('pointerenter', showCard);
  btn.addEventListener('pointerleave', hideSoon);
  btn.addEventListener('focus', showCard);
  btn.addEventListener('blur', hideSoon);
  card.addEventListener('pointerenter', () => clearTimeout(hideT));
  card.addEventListener('pointerleave', hideSoon);
  linkIcon().then(src => { logo = src || ''; render(); });
  store.watch('link', render);
  render();
}

export { init };
