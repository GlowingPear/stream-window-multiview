import { platIcon } from '../platforms/platforms.js';
import { commands } from '../shared/commands.js';
import { element } from '../shared/element.js';
import { IS_MAC, keyName } from '../shared/env.js';
import { icon } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { store } from '../shared/store.js';

/* ---- The search box: Ctrl/⌘+K anywhere (in a chat or stream too: main.js sends it), type a few letters, Enter ----
   It finds and runs anything the parts registered with commands.add / commands.provide (shared/commands.js):
   channels, windows, layouts, actions, Settings options, the guide, notifications. A channel named in full (or by
   the start of its name, 3 letters or more) comes first, drawn big with its own row of buttons.
   Keys: ↑ ↓ (Ctrl+N / P) move · ← → a channel's buttons · Enter runs · ⇧Enter the second choice · Tab everything for
   the row, ⇧Tab back · Ctrl/⌘+1–9 a button or row · Esc steps back (Tab's list, the words, then the box).
   Prefixes: > actions · @ channels and windows · # Settings · ? help. */
let palBg, palBox, palQ, palChip, palCount, palList, palFoot, palLive, palCrumb;
let palScope = '';                // '>', '@', '#', '?' or ''
let palRows = [];                 // what's listed: { item, marks, hero }
let palSel = 0, palBtnAt = 0;          // the selected row, and the selected button on a channel's big row
let palStack = [];                // Tab: [{ item, text, sel }] — the rows the list was showing before
let palBack = null;               // where the keyboard was before the box opened
let palWhy = '';                  // why the last thing couldn't run (shown in the footer)
const PAL_MOD = IS_MAC ? '⌘' : 'Ctrl+';
const palOpen = () => !!palBg && !palBg.hidden;
const palVal = v => { try { return typeof v === 'function' ? v() : v; } catch { return null; } };

function openPalette(text = ''){
  if (!palBg) return;
  if (!palOpen()) palBack = document.activeElement;
  palBg.hidden = false;
  palStack = []; palWhy = '';
  setPalScope('');
  palQ.value = text;
  palPrefix();
  renderPalette();
  palQ.focus(); palQ.select();
}
function closePalette(restore){
  if (!palOpen()) return;
  palBg.hidden = true;
  palQ.setAttribute('aria-expanded', 'false');
  palStack = [];
  if (restore && palBack && palBack.isConnected && palBack.focus) palBack.focus();
  else if (palBox.contains(document.activeElement)) document.activeElement.blur();
  palBack = null;
}
const togglePalette = () => { if (palOpen()) closePalette(true); else openPalette(); };
function setPalScope(s){
  palScope = s;
  palChip.hidden = !s;
  palChip.firstChild.textContent = s ? commands.SCOPES[s].name : '';
  palQ.placeholder = s ? `Search ${commands.SCOPES[s].name.toLowerCase()}…` : 'Search channels, windows, actions and settings…';
}
// a prefix typed first becomes the chip
function palPrefix(){
  if (palScope || palStack.length) return;
  const p = commands.parse(palQ.value);
  if (p.scope){ setPalScope(p.scope); palQ.value = palQ.value.replace(/^\s*./, '').replace(/^\s+/, ''); }
}

/* ---- what's listed ---- */
// A channel's big row: named in full, or by the start of its name (3 letters or more) when nothing else comes close
function palHeroOf(found, text){
  const top = found[0];
  if (!top || top.item.kind !== 'channel' || !top.item.buttons) return false;
  if (top.match >= 100) return true;
  const next = found.find(r => r !== top && r.item.kind === 'channel');
  return text.length >= 3 && top.match >= 80 && (!next || next.match < 80 || next.item.title.toLowerCase() === top.item.title.toLowerCase());
}
function palCollect(){
  const text = palQ.value.trim();
  if (palStack.length){
    const it = palStack[palStack.length - 1].item, all = (it.more && it.more()) || [];
    if (!text) return all.map(item => ({ item, marks: [] }));
    return commands.search(text, { scope: '', only: all });
  }
  if (!text && !palScope) return palEmptyRows();
  const found = commands.search(text, { scope: palScope });
  if (found.length){
    if (palHeroOf(found, text)) found[0] = { ...found[0], hero: true };
    return found;
  }
  return commands.fallbacks(text).map(item => ({ item, marks: [] }));
}
// The empty box: what you ran lately, the window you last clicked, and saved channels that are live
function palEmptyRows(){
  const out = [];
  for (const id of commands.recent()){
    if (out.length >= 5) break;
    const it = commands.find(id);
    if (it && !commands.disabledWhy(it)) out.push({ item: { ...it, group: 'Recent' }, marks: [] });
  }
  const order = ['For this window', 'Live now'], at = r => (order.indexOf(r.item.group) + 1) || order.length + 1;
  for (const r of commands.search('', { keep: true }).sort((a, b) => at(a) - at(b))) if (!out.some(o => o.item.id === r.item.id)) out.push(r);
  return out;
}

/* ---- drawing ---- */
const palTile = it => {
  if (it.avatar !== undefined || it.site) return palAvatar(it, it.hero ? 'pal-av big' : 'pal-av');
  if (it.pic){ const p = document.querySelector(`#layoutMenu [data-l="${it.pic}"] .lm-pic`); if (p) return element('span', 'pal-ico pal-pic', p.cloneNode(true)); }
  return element('span', { class: 'pal-ico', html: icon[it.icon] || icon.point });
};
function palAvatar(it, cls){
  const name = String(it.title || '?').replace(/^@/, '');
  const a = element('span', { class: cls, style: { '--c': it.hue || 'var(--line2)' } }, it.initials || name.slice(0, 1).toUpperCase());
  if (it.site) a.insertAdjacentHTML('beforeend', platIcon(it.site));
  if (it.avatar){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = it.avatar; a.appendChild(im); }
  return a;
}
// the title, with the letters that matched in the accent colour
function palMarked(title, marks){
  const t = element('span', 'pal-t');
  const set = new Set(marks || []);
  let run = '', on = false;
  const flush = () => { if (run) t.append(on ? element('b', null, run) : run); run = ''; };
  [...String(title)].forEach((c, i) => { const m = set.has(i); if (m !== on){ flush(); on = m; } run += c; });
  flush();
  return t;
}
const palKbds = k => element('span', 'pal-keys', ...keyName(k).split(/(?<=\S)\+(?=\S)/).map(p => element('kbd', null, p)));
function palRight(it){
  if (it.toggle){
    let on = false; try { on = !!it.toggle.get(); } catch {}
    return element('span', { class: 'pal-sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': on ? 'On' : 'Off' });
  }
  if (it.live) return element('span', 'pal-live', element('i'), 'LIVE', it.viewers != null && element('em', null, String(it.viewers)));
  if (it.keys) return palKbds(it.keys);
  return element('span', 'pal-go', '↵ ' + (it.verb || 'Open'));
}
const palSubOf = (it, hero) => (hero && palVal(it.heroSub)) || palVal(it.sub) || '';
function palRowEl(r, i){
  const it = r.item, off = commands.disabledWhy(it);
  const el = element('div', { class: 'pal-row' + (r.hero ? ' hero' : '') + (off ? ' off' : '') + (i === palSel ? ' on' : ''), id: 'palRow' + i,
    role: 'option', 'aria-selected': String(i === palSel), 'aria-disabled': off ? 'true' : null, title: off || null, dataset: { id: it.id } },
    palTile(r.hero ? { ...it, hero: true } : it),
    element('span', 'pal-txt',
      element('span', 'pal-line', palMarked(it.title, r.marks), ...(palVal(it.tags) || []).map(t => element('span', 'pal-tag', t))),
      palSubOf(it, r.hero) && element('span', 'pal-sub', palSubOf(it, r.hero))),
    r.hero ? (it.live ? palRight(it) : null) : palRight(it));
  el.onpointermove = () => { if (palSel !== i){ palSel = i; palBtnAt = 0; palPaintSel(); } };
  el.onclick = e => { if (!e.target.closest('.pal-btn')){ palSel = i; palRun(i, e.shiftKey ? 'alt' : 'run'); } };
  if (r.hero && it.buttons){
    const bs = element('div', { class: 'pal-btns', role: 'group', 'aria-label': 'Actions for ' + it.title });
    it.buttons.forEach((b, k) => bs.append(element('button', { type: 'button', class: 'pal-btn' + (k === palBtnAt && i === palSel ? ' on' : '') + (k === 0 ? ' first' : ''), tabIndex: -1, dataset: { k },
      title: k < 9 ? `${b.label} (${PAL_MOD}${k + 1})` : b.label, onclick: () => { palSel = i; palBtnAt = k; palRun(i, k); } },
      b.icon && element('i', { html: icon[b.icon] || '' }), b.label)));
    el.querySelector('.pal-txt').append(bs);
  }
  return el;
}
function renderPalette(){
  if (!palOpen()) return;
  palRows = palCollect();
  if (palSel >= palRows.length) palSel = Math.max(0, palRows.length - 1);
  palList.innerHTML = '';
  const top = palStack[palStack.length - 1];
  palCrumb.hidden = !top;
  if (top) palCrumb.replaceChildren(element('button', { type: 'button', class: 'pal-backb', title: 'Back (⇧Tab)', 'aria-label': 'Back', html: icon.arrowL, onclick: () => palPop() }), element('span', null, top.item.title), element('em', null, 'every action'));
  const text = palQ.value.trim();
  const none = !palRows.length || palRows.every(r => r.item.fallback);
  if (none) palList.append(element('div', 'pal-none', text ? `Nothing found for “${text}”` : 'Nothing here yet'));
  let group = none ? 'Nothing found' : null;      // (what's still offered: no heading of its own)
  palRows.forEach((r, i) => {
    if (!r.hero && r.item.group !== group){
      group = r.item.group;
      const n = palRows.filter(x => !x.hero && x.item.group === group).length;
      palList.append(element('div', { class: 'pal-g', role: 'presentation' }, element('span', null, group), r.item.groupNote ? element('em', null, r.item.groupNote) : n > 1 && element('em', null, String(n))));
    } else if (r.hero) group = null;
    palList.append(palRowEl(r, i));
  });
  palCount.textContent = text || palScope ? `${palRows.length} result${palRows.length === 1 ? '' : 's'}` : '';
  palLive.textContent = text ? `${palRows.length} result${palRows.length === 1 ? '' : 's'}` : '';
  palQ.setAttribute('aria-expanded', String(palRows.length > 0));
  palPaintSel();
}
function palPaintSel(){
  [...palList.querySelectorAll('.pal-row')].forEach((el, i) => {
    el.classList.toggle('on', i === palSel); el.setAttribute('aria-selected', String(i === palSel));
    el.querySelectorAll('.pal-btn').forEach((b, k) => b.classList.toggle('on', i === palSel && k === palBtnAt));
  });
  const cur = palList.querySelector('#palRow' + palSel);
  if (cur){ palQ.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else palQ.removeAttribute('aria-activedescendant');
  palPaintFoot();
}
function palPaintFoot(){
  const r = palRows[palSel], k = (a, b) => [element('kbd', null, a), ' ', b];
  palFoot.replaceChildren();
  if (palWhy){ palFoot.append(element('span', 'pal-why', palWhy)); return; }
  palFoot.append(element('span', 'pal-keyhelp', ...k('↑↓', 'move'), ' · ', ...k('↵', 'run'), r && r.item.alt ? [' · ', ...k('⇧↵', r.item.altLabel || 'more')] : null,
    r && r.item.more ? [' · ', ...k('Tab', 'every action')] : null, palStack.length ? [' · ', ...k('⇧Tab', 'back')] : null, ' · ', ...k('Esc', palStack.length ? 'back' : 'close')));
  if (r && r.hero && r.item.buttons) palFoot.append(element('span', 'pal-pre', ...k('← →', 'pick an action')));
  else if (!palStack.length) palFoot.append(element('span', 'pal-pre', ...['>', '@', '#', '?'].flatMap((p, i) => [i ? ' ' : '', element('kbd', null, p), ' ' + commands.SCOPES[p].name.toLowerCase()])));
}

/* ---- doing it ---- */
function palRun(i, how){
  const r = palRows[i]; if (!r) return;
  const it = r.item;
  if (how === 'run' && r.hero && it.buttons) how = palBtnAt;
  if (typeof how === 'number' && it.buttons && it.buttons[how] && it.buttons[how].more){ if (it.more) palPush(it); return; }
  if (how === 'more'){ if (it.more) palPush(it); return; }
  if (how === 'alt' && !it.alt){ if (it.more) return palPush(it); how = 'run'; }
  palWhy = commands.run(it, how);
  if (palWhy){ palPaintFoot(); return; }
  if (it.toggle && how === 'run'){ renderPalette(); return; }    // a switch flips where it is
  if (it.stay){ palQ.value = ''; renderPalette(); return; }
  closePalette(false);
}
function palPush(it){
  palStack.push({ item: it, text: palQ.value, sel: palSel });
  palQ.value = ''; palSel = 0; palBtnAt = 0; palWhy = '';
  renderPalette();
}
function palPop(){
  const top = palStack.pop(); if (!top) return false;
  palQ.value = top.text; palSel = top.sel; palBtnAt = 0; palWhy = '';
  renderPalette(); palQ.focus();
  return true;
}
function palMove(d){
  if (!palRows.length) return;
  palSel = (palSel + d + palRows.length) % palRows.length; palBtnAt = 0; palWhy = '';
  palPaintSel();
}
function palKey(e){
  const k = e.key, mod = e.metaKey || e.ctrlKey, r = palRows[palSel];
  if (k === 'ArrowDown' || (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'n')){ e.preventDefault(); palMove(1); }
  else if (k === 'ArrowUp' || (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'p')){ e.preventDefault(); palMove(-1); }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && r && r.hero && r.item.buttons){
    e.preventDefault();
    const n = r.item.buttons.length;
    palBtnAt = (palBtnAt + (k === 'ArrowRight' ? 1 : -1) + n) % n; palWhy = '';
    palPaintSel();
  }
  else if (k === 'Enter'){ e.preventDefault(); palRun(palSel, e.shiftKey ? 'alt' : 'run'); }
  else if (k === 'Tab'){ e.preventDefault(); if (e.shiftKey) palPop(); else if (r) palRun(palSel, 'more'); }
  else if (mod && /^[1-9]$/.test(k)){
    e.preventDefault();
    const n = +k - 1;
    if (r && r.hero && r.item.buttons){ if (r.item.buttons[n]){ palBtnAt = n; palRun(palSel, n); } }
    else if (palRows[n]){ palSel = n; palRun(n, 'run'); }
  }
  else if (k === 'Escape'){
    e.preventDefault(); e.stopPropagation();
    if (palStack.length) palPop();
    else if (palQ.value || palScope){ palQ.value = ''; setPalScope(''); palSel = 0; renderPalette(); }
    else closePalette(true);
  }
  else if (k === 'Backspace' && !palQ.value && (palScope || palStack.length)){ e.preventDefault(); if (palStack.length) palPop(); else { setPalScope(''); renderPalette(); } }
  else return;
  e.stopPropagation();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  palQ = element('input', { id: 'palQ', type: 'text', spellcheck: false, autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'palList', 'aria-autocomplete': 'list', 'aria-label': 'Search channels, windows, actions and settings' });
  palChip = element('span', 'pal-scope', element('span'), element('button', { type: 'button', title: 'Search everything', 'aria-label': 'Search everything', html: icon.close, onclick: () => { setPalScope(''); renderPalette(); palQ.focus(); } }));
  palCount = element('span', 'pal-count');
  palCrumb = element('div', { class: 'pal-crumb', hidden: true });
  palList = element('div', { id: 'palList', class: 'pal-list', role: 'listbox', 'aria-label': 'Results' });
  palFoot = element('div', 'pal-foot');
  palLive = element('div', { class: 'pal-sr', 'aria-live': 'polite' });
  palBox = element('div', { id: 'palette', class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search and actions' },
    element('div', 'pal-in', element('span', { class: 'pal-mag', html: icon.search }), palChip, palQ, palCount, element('span', 'pal-k', element('kbd', null, IS_MAC ? '⌘K' : 'Ctrl K'))),
    palCrumb, palList, palFoot, palLive);
  palBg = element('div', { id: 'palBg', class: 'pal-bg', hidden: true }, palBox);
  document.body.append(palBg);
  palBg.addEventListener('pointerdown', e => { if (e.target === palBg) closePalette(true); });
  palQ.addEventListener('input', () => { palWhy = ''; palSel = 0; palBtnAt = 0; palPrefix(); renderPalette(); });
  palQ.addEventListener('keydown', palKey);
  palBox.addEventListener('keydown', e => { if (e.target !== palQ && (e.key === 'Escape' || e.key === 'Tab')){ palQ.focus(); palKey(e); } });
  // focus stays in the box: a click on its rows or headings leaves the keyboard in the words box
  palBox.addEventListener('mousedown', e => { if (!e.target.closest('input, button, select, textarea')) e.preventDefault(); });
  palBox.addEventListener('focusout', e => { if (palOpen() && !palBox.contains(e.relatedTarget)) setTimeout(() => { if (palOpen() && !palBox.contains(document.activeElement)) palQ.focus(); }); });
  // Ctrl/⌘+K anywhere on the page, ahead of everything else (also with keyboard shortcuts switched off: it's how
  // you'd find the switch to turn them back on). In a chat or stream the web view keeps its keys: main.js sends it.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); e.stopPropagation(); togglePalette(); }
  }, true);
  fromApp('onPaletteOpen', () => togglePalette());
  const pb = document.querySelector('#palBtn');
  if (pb){
    pb.hidden = false;
    pb.querySelector('.pal-kk').textContent = IS_MAC ? '⌘K' : 'Ctrl K';
    pb.title = `Search and actions (${keyName('Ctrl+K')})`;
    pb.onclick = () => togglePalette();
  }
  // an open box keeps up with what it lists
  store.watch(['wins', 'saved', 'live', 'names', 'notes', 'layout', 'autoOpen', 'liveAlerts', 'dev', 'link', 'reward', 'palette'], () => { if (palOpen() && !palStack.length) renderPalette(); });
  window.palette = { open: openPalette, close: closePalette, toggle: togglePalette, isOpen: palOpen, rows: () => palRows.map(r => ({ id: r.item.id, title: r.item.title, group: r.item.group, hero: !!r.hero })) };   // for the tests
}

export { init };
