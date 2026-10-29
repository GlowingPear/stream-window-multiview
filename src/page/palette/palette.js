import { openSettings } from '../panels/settings/settings.js';
import { PLAT_NAME, platIcon } from '../platforms/platforms.js';
import { commands } from '../shared/commands.js';
import { element } from '../shared/element.js';
import { IS_MAC, keyName } from '../shared/env.js';
import { flash, flashKeys } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';

/* ---- The search box: Ctrl/⌘+K anywhere (in a chat or stream too: main.js sends it), type a few letters, Enter ----
   It finds and runs anything the parts registered with commands.add / commands.provide (shared/commands.js):
   channels, windows, layouts, actions, Settings options, the guide, notifications. A channel named in full (or by
   the start of its name, 3 letters or more) comes first, drawn big with its own row of buttons.
   A channel a site found by the name typed is only drawn big when no channel you know is.
   Keys: ↑ ↓ (Ctrl+N / P) move · ← → a channel's buttons (in a row's list's two columns: the other column) ·
   Tab / ⇧Tab forward and back: the big row's next / previous button, a name typed's next / previous site, the other
   column, else the next / previous row (Tab on a row with a list of its own opens it; so do More… and Enter) ·
   Enter runs · ⇧Enter the second choice · Ctrl/⌘+1–9 a button or row · Esc steps back (a row's list, the words,
   then the box) · Del or ⌘⌫ / Ctrl+⌫ removes the Recent row you're on (plain ⌫ never does). As Pear Drops' box.
   Settings › Search box (panels/settings/search-box.js) turns the box off (palOn) and lists what it remembers.
   Prefixes: > actions · @ channels and windows · # Settings · ? help.
   How a row is drawn comes from its item: sub (text, or parts: 'text', { b: 'bold', t: ' after' }, nodes), live and
   viewers, tags and pills, chip, keys, side (a hint that always shows), sites (K / T / Y chips: pickSite, nextSite, prevSite),
   siteIcons (a linked streamer's sites after its name: [{ p, dim }]),
   and on the big row heroSub and buttons ({ label, icon, run, on, more }). */
let palBg, palBox, palQ, palChip, palCount, palList, palFoot, palLive, palHead, palMag, palK, palEsc;
let palScope = '';                // '>', '@', '#', '?' or ''
let palRows = [];                 // what's listed: { item, marks, hero }
let palSel = 0, palBtnAt = 0;          // the selected row, and the selected button on a channel's big row
let palStack = [];                // Tab: [{ item, text, sel }] — the rows the list was showing before
let palBack = null;               // where the keyboard was before the box opened
let palWhy = '';                  // why the last thing couldn't run (shown in the footer)
let palForgetting = false;        // Recent's Clear all asking first, in its heading: Enter clears, Esc keeps them
const PAL_MOD = IS_MAC ? '⌘' : 'Ctrl+';
const PAL_FORGET_KEY = IS_MAC ? '⌘⌫' : 'Del';
const PAL_NOUN = { '>': 'action', '@': 'channel', '#': 'setting' };   // the count says "9 actions" with a prefix
const palOpen = () => !!palBg && !palBg.hidden;
const palVal = v => { try { return typeof v === 'function' ? v() : v; } catch { return null; } };

function openPalette(text = ''){
  if (!palBg) return;
  if (!palOpen()) palBack = document.activeElement;
  palBg.hidden = false;
  palStack = []; palWhy = ''; palForgetting = false;
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
// Settings › Search box: off, there's no Search button and Ctrl/⌘+K only says where to turn it back on
const palOn = () => settings.flag('paletteOn', true);
const togglePalette = () => {
  if (palOpen()) closePalette(true);
  else if (palOn()) openPalette();
  else flash('The search box is off. Turn it on in Settings › Search box');
};
function setPalScope(s){
  palScope = s;
  palChip.hidden = !s;
  palChip.firstChild.textContent = s ? commands.SCOPES[s].name : '';
  palPlaceholder();
}
const palPlaceholder = () => { palQ.placeholder = palStack.length ? 'Filter actions…' : palScope ? `Search ${commands.SCOPES[palScope].name.toLowerCase()}…` : 'Search channels, windows, actions and settings…'; };
// a prefix typed first becomes the chip
function palPrefix(){
  if (palScope || palStack.length) return;
  const p = commands.parse(palQ.value);
  if (p.scope){ setPalScope(p.scope); palQ.value = palQ.value.replace(/^\s*./, '').replace(/^\s+/, ''); }
}

/* ---- what's listed ---- */
// A channel's big row: the best channel the words name in full, or by the start of its name (3 letters or more).
// One you know (saved, open, followed, seen) before one a site found by the name typed, so it doesn't jump when the
// sites answer: that one is a row of its own below
function palHeroOf(found, text){
  const chan = r => r.item.kind === 'channel' && r.item.buttons && !r.item.openAs;
  const named = c => c && (c.match >= 100 || (text.length >= 3 && c.match >= 80));
  const known = found.find(r => chan(r) && !r.item.found), typed = found.find(r => chan(r) && r.item.found);
  return named(known) ? known : named(typed) ? typed : null;
}
function palCollect(){
  const text = palQ.value.trim();
  if (palStack.length){
    const it = palStack[palStack.length - 1].item, all = (it.more && it.more()) || [];
    if (!text) return all.map(item => ({ item, marks: [] }));
    return commands.search(text, { scope: '', only: all });
  }
  if (!text && !palScope) return palEmptyRows();
  let found = commands.search(text, { scope: palScope });
  // only the words as a new channel's name: nothing found, with what's still worth offering
  if (!found.length || found.every(r => r.item.openAs))
    return [...found, ...commands.fallbacks(text).map(item => ({ item, marks: [] }))];
  const best = palHeroOf(found, text), hero = best && { ...best, hero: true };
  // each group together, where its best row is (the big row first)
  found = commands.grouped(found.filter(r => r !== best)).flatMap(g => g.rows);
  return hero ? [hero, ...found] : found;
}
// The empty box: what you ran lately, the window you last clicked, and saved channels that are live
function palEmptyRows(){
  const out = [];
  for (const id of commands.recent()){
    if (out.length >= 5) break;
    const it = commands.find(id);
    if (it && !commands.disabledWhy(it)) out.push({ item: { ...it, group: 'Recent', groupNote: '' }, marks: [], recent: true });
  }
  const order = ['For this window', 'Live now'], at = r => (order.indexOf(r.item.group) + 1) || order.length + 1;
  for (const r of commands.search('', { keep: true }).sort((a, b) => at(a) - at(b))) if (!out.some(o => o.item.id === r.item.id)) out.push(r);
  return out;
}

/* ---- drawing ---- */
const palTile = (it, big) => {
  if (it.avatar !== undefined || it.site) return palAvatar(it, big ? 'pal-av big' : 'pal-av');
  if (it.pic){ const p = document.querySelector(`#layoutMenu [data-l="${it.pic}"] .lm-pic`); if (p) return element('span', 'pal-pic', p.cloneNode(true)); }
  return element('span', { class: 'pal-ico', html: icon[it.icon] || icon.point });
};
function palAvatar(it, cls){
  const name = String(it.title || '?').replace(/^@/, '');
  const a = element('span', { class: cls, style: { '--c': it.hue || 'var(--line2)' } }, (it.initials || name.slice(0, 2)).toUpperCase());
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
// a line from its parts, "a · b · c": text, { b: bold, t: after }, { ok: '✓ Found on Kick' }, or nodes (a snippet)
function palParts(parts){
  const out = [];
  for (const p of [].concat(parts || [])){
    if (p === null || p === undefined || p === '' || p === false) continue;
    if (out.length) out.push(element('i', 'pal-dot', '·'));
    if (Array.isArray(p)) out.push(...p);
    else if (p instanceof Node) out.push(p);
    else if (typeof p === 'object') out.push(p.ok ? element('b', 'pal-ok', p.ok) : element('b', null, p.b), p.t || '');
    else out.push(String(p));
  }
  return out;
}
const palKbds = k => element('span', 'pal-keys', ...keyName(k).split(/(?<=\S)\+(?=\S)/).map(p => element('kbd', null, p === 'Shift' ? '⇧' : p)));
const palLivePill = () => element('span', 'pal-livep', 'LIVE');
const palPill = (text, accent) => element('span', 'pal-tag' + (accent ? ' on' : ''), text);
function palSites(it, big){
  const sites = palVal(it.sites); if (!sites) return null;
  return element('span', 'pal-sites', ...sites.map(s => element('button', { type: 'button', tabIndex: -1, class: 'pal-site' + (s.on ? ' on' : ''), title: s.name,
    onclick: e => { e.stopPropagation(); it.pickSite(s.p); renderPalette(); } }, big ? `${s.letter} ${s.name}` : s.letter)));
}
function palRight(it, sel){
  if (it.toggle){
    let on = false; try { on = !!it.toggle.get(); } catch {}
    return element('span', { class: 'pal-sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': on ? 'On' : 'Off' });
  }
  if (it.sites) return palSites(it, false);
  if (it.live && it.viewers != null) return element('span', 'pal-views', String(it.viewers));
  const chip = palVal(it.chip);
  if (chip) return palPill(chip.text || chip, chip.accent);
  if (it.keys) return palKbds(it.keys);
  if (it.side) return element('span', 'pal-go always', element('kbd', null, '↵'), ' ' + it.side);
  return element('span', 'pal-go' + (sel ? ' on' : ''), element('kbd', null, '↵'), ' ' + (it.verb || 'Open'));
}
// A row's picture and its name and second line, as the box draws them (Settings › Search box lists Recent with them)
function palItemFace(it){
  const sub = palParts(palVal(it.sub));
  return [palTile(it, false), element('span', 'pal-txt', element('span', 'pal-line', element('span', 'pal-t', it.title)), sub.length ? element('span', 'pal-sub', ...sub) : null)];
}
function palRowEl(r, i){
  const it = r.item, off = commands.disabledWhy(it), hero = !!r.hero;
  const sub = palParts(palVal(hero && it.heroSub ? it.heroSub : it.sub));
  const line = element('span', 'pal-line', palMarked(it.title, r.marks),
    it.siteIcons && element('span', 'pal-sic', ...it.siteIcons.map(x => element('i', { class: `pi pi-${x.p}${x.dim ? ' dim' : ''}`, title: PLAT_NAME[x.p] }, PLAT_NAME[x.p][0]))),   // a linked streamer's sites
    hero && it.live && palLivePill(), ...(hero ? palVal(it.pills) || [] : []).map(p => palPill(p.text, p.accent)),
    ...(palVal(it.tags) || []).map(t => palPill(t)), hero && palSites(it, true));
  const subEl = (sub.length || (it.live && !hero)) && element('span', 'pal-sub', !hero && it.live && palLivePill(), ...sub);
  const el = element('div', { class: 'pal-row' + (hero ? ' hero' : '') + (off ? ' off' : '') + (i === palSel ? ' on' : ''), id: 'palRow' + i,
    role: 'option', 'aria-selected': String(i === palSel), 'aria-disabled': off ? 'true' : null, title: off || null, dataset: { id: it.id } },
    palTile(it, hero), element('span', 'pal-txt', line, subEl), !hero && palRight(it, i === palSel),
    r.recent && element('button', { type: 'button', tabIndex: -1, class: 'pal-forget', title: `Remove from Recent (${PAL_FORGET_KEY})`, 'aria-label': 'Remove from Recent',
      html: icon.close, onclick: e => { e.stopPropagation(); palForget(i); } }));
  el.onpointermove = () => { if (palSel !== i){ palSel = i; palBtnAt = 0; palPaintSel(); } };
  el.onclick = e => { if (!e.target.closest('.pal-btn, .pal-site')){ palSel = i; palRun(i, e.shiftKey ? 'alt' : 'run'); } };
  if (hero && it.buttons){
    // the first runs with Enter; the others with Ctrl/⌘+1–9; Tab / ⇧Tab and ← → move along them
    const bs = element('div', { class: 'pal-btns', role: 'group', 'aria-label': 'Actions for ' + it.title });
    it.buttons.forEach((b, k) => bs.append(element('button', { type: 'button', tabIndex: -1, dataset: { k },
      class: 'pal-btn' + (k === 0 ? ' first' : '') + (b.on ? ' pal-act' : '') + (k === palBtnAt && i === palSel ? ' on' : ''),
      title: b.more ? 'Everything for it' : k === 0 ? `${b.label} (Enter)` : k <= 9 ? `${b.label} (${PAL_MOD}${k})` : b.label,
      onclick: () => { palSel = i; palBtnAt = k; palRun(i, k); } },
      b.icon && element('i', { html: icon[b.icon] || '' }), b.label,
      b.more ? null : k === 0 ? element('kbd', null, '↵') : k <= 9 ? element('kbd', null, PAL_MOD.replace('+', '') + k) : null)));
    el.querySelector('.pal-txt').append(bs);
  }
  return el;
}
// A row's list: what it's for, in the words box's place
function palHeadFor(it){
  palHead.replaceChildren(
    element('button', { type: 'button', class: 'pal-backb', tabIndex: -1, title: 'Back (Esc)', 'aria-label': 'Back', html: icon.arrowL, onclick: () => palPop() }),
    (it.avatar !== undefined || it.site) ? palAvatar(it, 'pal-av sm') : element('span', { class: 'pal-ico sm', html: icon[it.icon] || icon.point }),
    element('b', 'pal-ht', it.title), it.live ? palLivePill() : '', element('i', 'pal-hsep'));
}
function renderPalette(){
  if (!palOpen()) return;
  palRows = palCollect();
  if (palSel >= palRows.length) palSel = Math.max(0, palRows.length - 1);
  const top = palStack[palStack.length - 1], text = palQ.value.trim();
  palBox.classList.toggle('tab', !!top);
  palHead.hidden = !top; palMag.hidden = !!top; palEsc.hidden = !top;
  if (top) palHeadFor(top.item);
  palPlaceholder();
  palList.replaceChildren();
  const none = !top && !!text && palRows.every(r => r.item.fallback || r.item.openAs);
  if (none) palList.append(element('div', 'pal-none', element('b', null, `Nothing called “${text}”`), element('span', null, 'Not a channel, window, action or setting the app knows.')));
  // groups, each in a block of its own. Tab's list: in two columns, the groups whose items say col: 1 on the right
  // (a channel's: Open and Share, then Channel and its windows), else as they balance
  const split = !!top && palRows.some(r => r.item.col), cols = split ? [element('div', 'pal-col'), element('div', 'pal-col')] : null;
  if (split) palList.append(...cols);
  let block = null, group;
  palRows.forEach((r, i) => {
    if (r.hero){ palList.append(palRowEl(r, i)); block = null; return; }
    if (!block || r.item.group !== group){
      group = r.item.group;
      block = element('div', { class: 'pal-grp', role: 'presentation' });
      const n = palRows.filter(x => !x.hero && x.item.group === group).length;
      if (!none) block.append(element('div', { class: 'pal-g', role: 'presentation' }, element('span', null, group),
        r.recent ? palRecentHead() : r.item.groupNote ? element('em', null, r.item.groupNote) : n > 1 && !top && element('em', null, String(n))));
      if (n > 8) block.classList.add('long');
      (split ? cols[r.item.col ? 1 : 0] : palList).append(block);
    }
    block.append(palRowEl(r, i));
  });
  palList.classList.toggle('cols', !!top && !split && palRows.length > 3);
  palList.classList.toggle('split', split);
  const noun = PAL_NOUN[palScope] || 'result', n = palRows.filter(r => !r.item.fallback && !r.item.openAs).length;
  palCount.textContent = top ? '' : none ? 'No results' : text || palScope ? `${n} ${noun}${n === 1 ? '' : 's'}` : '';
  palLive.textContent = text ? (none ? 'No results' : `${n} result${n === 1 ? '' : 's'}`) : '';
  palQ.setAttribute('aria-expanded', String(palRows.length > 0));
  palPaintSel();
}
function palPaintSel(){
  [...palList.querySelectorAll('.pal-row')].forEach((el, i) => {
    el.classList.toggle('on', i === palSel); el.setAttribute('aria-selected', String(i === palSel));
    el.querySelectorAll('.pal-btn').forEach((b, k) => b.classList.toggle('on', i === palSel && k === palBtnAt));
    el.querySelector('.pal-go:not(.always)')?.classList.toggle('on', i === palSel);
  });
  const cur = palList.querySelector('#palRow' + palSel);
  if (cur){ palQ.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else palQ.removeAttribute('aria-activedescendant');
  palPaintFoot();
}
function palPaintFoot(){
  const r = palRows[palSel], it = r && r.item, k = (keys, b) => element('span', 'pal-fk', ...[].concat(keys).map(x => element('kbd', null, x)), ' ' + b);
  palFoot.replaceChildren(element('span', 'pal-keyhelp', k(['↑', '↓'], 'move'), k('↵', 'run'), k('Esc', palStack.length ? 'back' : 'close')));
  let right;
  if (palWhy) right = element('span', 'pal-why', palWhy);
  else if (palForgetting) right = element('span', 'pal-fks', k('↵', 'clear all'), element('i', 'pal-dot', '·'), k('Esc', 'keep them'));
  else if (r && r.recent) right = k(IS_MAC ? ['⌘', '⌫'] : 'Del', 'remove from Recent');
  else if (palStack.length && palList.classList.contains('split')) right = element('span', 'pal-fks', k(['Tab', '⇧Tab'], 'other column'), element('i', 'pal-dot', '·'), k('Esc', 'back to results'));
  else if (palStack.length) right = k('Esc', 'back to results');
  else if (r && r.hero && it.buttons && it.sites) right = element('span', 'pal-fks', k(['←', '→'], 'pick an action'), element('i', 'pal-dot', '·'), k(['Tab', '⇧Tab'], 'next / previous site'));
  else if (r && r.hero && it.buttons) right = element('span', 'pal-fks', k(['←', '→'], 'or'), k(['Tab', '⇧Tab'], 'pick an action'));
  else if (it && it.sites) right = k(['Tab', '⇧Tab'], 'next / previous site');
  else if (it && it.more && !it.toggle) right = k('Tab', 'everything for it');
  else if (it && it.toggle && it.alt) right = element('span', 'pal-fks', k('↵', 'flips a switch'), element('i', 'pal-dot', '·'), k(['⇧', '↵'], 'opens its page'));
  else right = element('span', 'pal-fks pal-pre', ...['>', '@', '#', '?'].flatMap((p, i) => [i ? element('i', 'pal-dot', '·') : '', k(p, commands.SCOPES[p].name.toLowerCase())]));
  palFoot.append(right);
}

/* ---- doing it ---- */
function palRun(i, how){
  const r = palRows[i]; if (!r) return;
  const it = r.item;
  if (how === 'run' && r.hero && it.buttons) how = palBtnAt;
  if (typeof how === 'number' && it.buttons && it.buttons[how] && it.buttons[how].more){ if (it.more) palPush(it); return; }
  if (how === 'more'){
    if (it.more) palPush(it);
    return;
  }
  if (how === 'alt' && !it.alt){ if (it.more) return palPush(it); how = 'run'; }
  if (how === 'run' && it.more && !it.run && !it.toggle && !it.button) return palPush(it);   // (only a list: Enter opens it, as Tab does)
  palWhy = commands.run(it, how);
  if (palWhy){ palPaintFoot(); return; }
  if ((it.toggle && how === 'run') || it.stay){ renderPalette(); return; }    // a switch flips where it is (and Clear Recent asks there)
  closePalette(false);
  // a layout: what happened, and how to undo it or come back
  if (it.kind === 'layout' && how === 'run' && !it.fallback) flashKeys(`Switched to ${it.title}`, [[PAL_MOD.replace('+', '') + 'Z', 'undo'], [PAL_MOD.replace('+', '') + 'K', 'again']]);
}
function palPush(it){
  palStack.push({ item: it, text: palQ.value, sel: palSel });
  palQ.value = ''; palSel = 0; palBtnAt = 0; palWhy = '';
  renderPalette();
}
// A Recent row taken out of what's remembered (its ×, Del, ⌘⌫): the next row takes its place
function palForget(i){
  const r = palRows[i]; if (!r || !r.recent) return;
  commands.forget(r.item.id);
  palSel = i; palBtnAt = 0; palWhy = '';
  renderPalette();
}
// Recent's heading: Clear all (asking first, here) and Manage (Settings › Search box)
function palRecentHead(){
  if (palForgetting){
    const n = commands.recent().length;
    return element('span', 'pal-gacts', element('b', 'pal-gask', `Forget all ${n}?`),
      element('button', { type: 'button', tabIndex: -1, class: 'pal-gbtn', onclick: () => { palForgetting = false; renderPalette(); palQ.focus(); } }, 'Keep'),
      element('button', { type: 'button', tabIndex: -1, class: 'pal-gbtn danger', onclick: () => { commands.forgetAll(); palForgetting = false; renderPalette(); palQ.focus(); } },
        element('i', { html: icon.bin }), 'Clear all'));
  }
  return element('span', 'pal-gacts',
    element('button', { type: 'button', tabIndex: -1, class: 'pal-gbtn', dataset: { cmd: 'palette.clearRecent' }, onclick: () => { palForgetting = true; renderPalette(); palQ.focus(); } }, 'Clear all'),
    element('button', { type: 'button', tabIndex: -1, class: 'pal-gbtn acc', dataset: { cmd: 'settings.search' }, onclick: () => { closePalette(false); openSettings('search'); } }, 'Manage'));
}
// The toolbar's Search button, there while the box is on
function palShowButton(){
  const pb = document.querySelector('#palBtn');
  if (pb) pb.hidden = !palOn();
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
// Tab's two columns: ← → to the row beside this one in the other column
function palAcross(d){
  const els = [...palList.querySelectorAll('.pal-row')], cur = els[palSel]; if (!cur) return false;
  const c = cur.getBoundingClientRect();
  let best = -1, dist = Infinity;
  els.forEach((el, i) => {
    const b = el.getBoundingClientRect();
    if (d > 0 ? b.left <= c.right - 2 : b.right >= c.left + 2) return;
    const dy = Math.abs(b.top - c.top);
    if (dy < dist){ dist = dy; best = i; }
  });
  if (best < 0) return false;
  palSel = best; palPaintSel();
  return true;
}
function palKey(e){
  const k = e.key, mod = e.metaKey || e.ctrlKey, r = palRows[palSel];
  // Recent's Clear all asking: Enter clears, Esc (or anything else but moving) keeps them
  if (palForgetting && (k === 'Enter' || k === 'Escape')){
    e.preventDefault(); e.stopPropagation();
    if (k === 'Enter') commands.forgetAll();
    palForgetting = false; renderPalette(); return;
  }
  // a Recent row: Del, or ⌘⌫ / Ctrl+⌫ (a Mac has no Del without fn), removes it; plain ⌫ never does
  if (r && r.recent && (k === 'Delete' || (k === 'Backspace' && mod && !e.altKey))){ e.preventDefault(); e.stopPropagation(); palForget(palSel); return; }
  if (k === 'ArrowDown' || (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'n')){ e.preventDefault(); palMove(1); }
  else if (k === 'ArrowUp' || (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'p')){ e.preventDefault(); palMove(-1); }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && r && r.hero && r.item.buttons){
    e.preventDefault();
    const n = r.item.buttons.length;
    palBtnAt = (palBtnAt + (k === 'ArrowRight' ? 1 : -1) + n) % n; palWhy = '';
    palPaintSel();
  }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && palList.classList.contains('cols') && !palQ.value){ e.preventDefault(); palAcross(k === 'ArrowRight' ? 1 : -1); }
  else if (k === 'Enter'){ e.preventDefault(); palRun(palSel, e.shiftKey ? 'alt' : 'run'); }
  else if (k === 'Tab'){
    // forward with Tab, back with ⇧Tab: a name typed's sites, the big row's buttons, a row's list's two columns, else the rows
    e.preventDefault();
    const d = e.shiftKey ? -1 : 1, it = r && r.item;
    if (it && it.sites){ (d > 0 ? it.nextSite : it.prevSite)(); renderPalette(); }
    else if (r && r.hero && it.buttons){ const n = it.buttons.length; palBtnAt = (palBtnAt + d + n) % n; palWhy = ''; palPaintSel(); }
    else if (palList.classList.contains('split')) palAcross(d);
    else if (d > 0 && it && it.more && !palStack.length) palRun(palSel, 'more');
    else palMove(d);
  }
  else if (mod && /^[1-9]$/.test(k)){
    e.preventDefault();
    const n = +k;
    if (r && r.hero && r.item.buttons){ if (r.item.buttons[n]){ palBtnAt = n; palRun(palSel, n); } }
    else {
      // a row that shows these keys (Tab's list: the big row's buttons), else the nth row
      const at = palRows.findIndex(x => x.item.keys === 'Ctrl+' + n), i = at >= 0 ? at : n - 1;
      if (palRows[i]){ palSel = i; palRun(i, 'run'); }
    }
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
  palHead = element('span', { class: 'pal-head', hidden: true });
  palMag = element('span', { class: 'pal-mag', html: icon.search });
  palK = element('span', 'pal-k', ...(IS_MAC ? ['⌘', 'K'] : ['Ctrl', 'K']).map(x => element('kbd', null, x)));
  palEsc = element('span', { class: 'pal-esc', hidden: true }, element('kbd', null, 'Esc'), ' back');
  palList = element('div', { id: 'palList', class: 'pal-list', role: 'listbox', 'aria-label': 'Results' });
  palFoot = element('div', 'pal-foot');
  palLive = element('div', { class: 'pal-sr', 'aria-live': 'polite' });
  palBox = element('div', { id: 'palette', class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search and actions' },
    element('div', 'pal-in', palMag, palHead, palChip, palQ, palCount, palK, palEsc),
    palList, palFoot, palLive);
  palBg = element('div', { id: 'palBg', class: 'pal-bg', hidden: true }, palBox);
  document.body.append(palBg);
  palBg.addEventListener('pointerdown', e => { if (e.target === palBg) closePalette(true); });
  palQ.addEventListener('input', () => { palWhy = ''; palForgetting = false; palSel = 0; palBtnAt = 0; palPrefix(); renderPalette(); });
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
    palShowButton();
    pb.querySelector('.pal-kk').textContent = IS_MAC ? '⌘K' : 'Ctrl K';
    pb.title = 'Find and do anything: channels, windows, actions and settings';
    pb.dataset.keys = IS_MAC ? '⌘K' : 'Ctrl K';      // (its tooltip shows them as a key)
    pb.onclick = () => togglePalette();
  }
  // Settings › Search box: the box on or off, and what it remembers (also from the other window)
  store.watch('recent', () => { palShowButton(); if (palOpen() && !palOn()) closePalette(false); });
  settings.onChange(['palette', 'paletteOn', 'paletteRecent'], () => store.changed('recent'));
  // Clear Recent: asks in the empty box (Enter clears, Esc keeps them); it isn't remembered itself
  commands.add({ id: 'palette.clearRecent', kind: 'action', group: 'Search box', title: 'Clear Recent', icon: 'bin', stay: true, noRecent: true,
    sub: 'Forget what the search box remembers you ran, and how often', words: ['clear recent', 'search history', 'forget', 'clear all'],
    disabled: () => !commands.recent().length && 'Nothing to clear',
    run: () => { palQ.value = ''; setPalScope(''); palStack = []; palSel = 0; palForgetting = true; } });
  // an open box keeps up with what it lists
  store.watch(['wins', 'saved', 'live', 'names', 'notes', 'layout', 'autoOpen', 'liveAlerts', 'dev', 'link', 'reward', 'palette', 'recent', 'streamers', 'tabs'], () => { if (palOpen() && !palStack.length) renderPalette(); });
  window.palette = { open: openPalette, close: closePalette, toggle: togglePalette, isOpen: palOpen, rows: () => palRows.map(r => ({ id: r.item.id, title: r.item.title, group: r.item.group, hero: !!r.hero })) };   // for the tests
}

export { init, palItemFace };
