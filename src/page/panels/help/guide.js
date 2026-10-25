import { $, ROLE } from '../../core.js';
import { startTour } from '../empty-stage/empty-stage.js';
import { SHORTCUTS, shortcutsGrid } from './help.js';
import { closeSettings, openSettings, settingsDlg } from '../settings/settings.js';
import { element, esc } from '../../shared/element.js';
import { DESKTOP, keyName } from '../../shared/env.js';
import { icon } from '../../shared/icons.js';
import { closeOnOutside } from '../../shared/popover.js';

/* ---- Settings › Guide: how to use the app, from the pages in docs/guide (one Markdown file per topic, each with a
   short header: its title, group, icon, a line about it, the Settings page it belongs to, what "Show me" points at,
   words to find it by, related topics, its place). The contents down the side, grouped; one topic at a time with
   Previous and Next; search at the top, which also finds Settings' own options and the keyboard shortcuts. A
   "Settings › Spam alerts" in the text opens that page, a link to another page opens that topic, and every Settings
   page has a ? that says what it's for and opens its topic. GitHub shows the same files, with docs/guide/README.md
   as their contents (the browser, for the UI tests, reads the topics' names from there too). ---- */
const GD_GROUPS = [['start', 'Start', 'sparkle'], ['watching', 'Watching', 'layout'], ['chat', 'Chat', 'chat'], ['alerts', 'Alerts', 'bell'],
  ['sites', 'Sites & apps', 'link'], ['app', 'The app', 'gear'], ['help', 'Help', 'book']];
// the Settings pages by the names the text uses ("Settings › Spam alerts", "Settings > Chat")
const GD_PANES = { 'connected apps': 'apps', 'spam alerts': 'spam', 'keyboard shortcuts': 'keys', notifications: 'notify', general: 'general', layouts: 'layouts',
  chat: 'chat', themes: 'themes', accounts: 'accounts', youtube: 'youtube', extensions: 'extensions', mentions: 'mentions', updates: 'updates', guide: 'guide', developer: 'developer' };
let GD_PANE_RE;
const GD_REPO = 'https://github.com/GlowingPear/stream-window-multiview/blob/main/docs/guide/README.md';
let topics = [], bySlug = new Map(), loading = null;
const gd = { topic: null, q: '', results: [], at: 0, pop: null, popFor: null };

/* ---- reading the pages ---- */
const unq = s => /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s;
// "---\nkey: value\n---\nbody" -> [{ key: value }, body]; lists are [a, b], true / false and whole numbers are themselves
function frontMatter(text){
  const m = String(text || '').replace(/^﻿/, '').replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return [{}, String(text || '')];
  const fm = {};
  for (const line of m[1].split('\n')){
    const kv = line.match(/^(\w+):\s*(.*)$/); if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => unq(x.trim())).filter(Boolean);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else if (/^-?\d+$/.test(v)) v = +v;
    else v = unq(v);
    fm[kv[1]] = v;
  }
  return [fm, m[2]];
}
const slugOf = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
// A line of text as markup: **bold**, `code`, [a page](other.md), [a site](https://…), and "Settings › Chat" as a button.
function inline(t){
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([\w-]+)\.md(?:#([\w-]+))?\)/g, (_, txt, slug) => `<button type="button" class="gd-link" data-topic="${slug}">${txt}</button>`)
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(GD_PANE_RE, (all, name) => `<button type="button" class="gd-set" data-go="${GD_PANES[name.toLowerCase()]}">Settings › ${name}</button>`);
}
// A page's text as markup: ## and ### headings, - and 1. lists (two spaces in: one level in), > a tip, paragraphs.
function pageHtml(md){
  let out = '', list = '';
  const close = () => { if (list){ out += `</${list}>`; list = ''; } };
  for (const raw of String(md).split('\n')){
    let m;
    if (!raw.trim()){ close(); continue; }
    if ((m = raw.match(/^###\s+(.*)/))){ close(); out += `<h4 id="gd-${slugOf(m[1])}">${inline(m[1])}</h4>`; continue; }
    if ((m = raw.match(/^##\s+(.*)/))){ close(); out += `<h3 id="gd-${slugOf(m[1])}">${inline(m[1])}</h3>`; continue; }
    if ((m = raw.match(/^>\s?(.*)/))){ close(); out += `<div class="gd-tip">${icon.sparkle}<div>${inline(m[1])}</div></div>`; continue; }
    if ((m = raw.match(/^(\s*)(?:[-*]|(\d+)\.)\s+(.*)/))){
      const kind = m[2] ? 'ol' : 'ul';
      if (list !== kind){ close(); out += `<${kind}>`; list = kind; }
      out += `<li${m[1].length >= 2 ? ' class="sub"' : ''}>${inline(m[3])}</li>`;
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)){ out = out.replace(/<\/li>$/, ' ' + inline(raw.trim()) + '</li>'); continue; }
    close(); out += `<p>${inline(raw.trim())}</p>`;
  }
  close();
  return out;
}
// what search reads: the text without its markup
const plain = md => String(md).replace(/^#+\s+/gm, '').replace(/^>\s?/gm, '').replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
  .replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
function topicOf(name, text){
  const [fm, body] = frontMatter(text);
  if (!fm.title) return null;
  const words = [].concat(fm.words || []).map(String), txt = plain(body);
  return { slug: name, title: String(fm.title), group: GD_GROUPS.some(g => g[0] === fm.group) ? fm.group : 'help', icon: String(fm.icon || 'book'), lede: String(fm.lede || ''),
    settings: fm.settings ? String(fm.settings) : '', show: fm.show ? String(fm.show) : '', keys: fm.keys === true, words, related: [].concat(fm.related || []).map(String),
    order: typeof fm.order === 'number' ? fm.order : 999, html: pageHtml(body), text: txt, low: (fm.title + ' ' + fm.lede + ' ' + txt).toLowerCase() };
}
const groupOrder = g => GD_GROUPS.findIndex(x => x[0] === g);
// The pages: from the app's folder (desktop), or the files next to the page (the browser), once.
function loadGuide(){
  if (loading) return loading;
  loading = (async () => {
    let files = [];
    if (DESKTOP && window.kmv.readGuide) files = await window.kmv.readGuide().catch(() => []) || [];
    else try {
      const idx = await (await fetch('../docs/guide/README.md')).text();
      const names = [...new Set([...idx.matchAll(/\]\(([\w-]+)\.md\)/g)].map(m => m[1]))];
      files = await Promise.all(names.map(async n => ({ name: n, text: await (await fetch(`../docs/guide/${n}.md`)).text() })));
    } catch {}
    topics = files.map(f => topicOf(f.name, f.text)).filter(Boolean)
      .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.order - b.order || a.title.localeCompare(b.title));
    bySlug = new Map(topics.map(t => [t.slug, t]));
    addPaneHelp();
    return topics;
  })();
  return loading;
}

/* ---- search ---- */
const termsOf = q => String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
const countIn = (hay, w) => { let n = 0, i = 0; while ((i = hay.indexOf(w, i)) >= 0 && n < 99){ n++; i += w.length; } return n; };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Settings' own options: each row's name and what it says under it, on the pages that show here
function settingsRows(){
  const rows = [];
  settingsDlg.querySelectorAll('.st-pane[data-s]').forEach(p => {
    const btn = settingsDlg.querySelector(`.st-rail [data-s="${p.dataset.s}"]`);
    if (!btn || btn.hidden || p.dataset.s === 'guide') return;
    p.querySelectorAll('.st-row .st-t').forEach(t => {
      const title = [...t.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && n.tagName !== 'SMALL')).map(n => n.textContent).join('').trim();
      const small = (t.querySelector('small') || {}).textContent || '';
      if (title) rows.push({ title, small: small.trim(), pane: p.dataset.s, paneName: btn.textContent.trim(), el: t.closest('.st-row'), low: (title + ' ' + small).toLowerCase() });
    });
  });
  return rows;
}
// -> [{ kind: 'topic' | 'setting' | 'keys', title, where, text, score, … }], best first
function search(q){
  const terms = termsOf(q);
  if (!terms.length) return [];
  const out = [];
  for (const t of topics){
    let score = 0, hits = 0;
    const title = t.title.toLowerCase(), words = t.words.join(' ').toLowerCase(), lede = t.lede.toLowerCase();
    if (!terms.every(w => t.low.includes(w) || words.includes(w))) continue;
    for (const w of terms){
      const n = countIn(t.low, w);
      score += (title.includes(w) ? 12 : 0) + (words.includes(w) ? 6 : 0) + (lede.includes(w) ? 3 : 0) + Math.min(n, 6);
      hits += n;
    }
    out.push({ kind: 'topic', t, title: t.title, where: (GD_GROUPS.find(g => g[0] === t.group) || [])[1] || '', text: t.text, score, hits });
  }
  for (const r of settingsRows()) if (terms.every(w => r.low.includes(w)))
    out.push({ kind: 'setting', title: r.title, where: 'Settings › ' + r.paneName, text: r.small, pane: r.pane, el: r.el, score: 5 + terms.filter(w => r.title.toLowerCase().includes(w)).length * 4 });
  for (const [group, rows] of SHORTCUTS) for (const [k, d] of rows){
    const low = (k + ' ' + d + ' keyboard shortcut').toLowerCase();
    if (terms.every(w => low.includes(w))) out.push({ kind: 'keys', title: d, where: 'Keyboard shortcuts · ' + group, keys: k, text: '', score: 3 + (terms.some(w => d.toLowerCase().includes(w)) ? 2 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}
// A bit of text around the first match, the matches marked: [text | <mark>]
function snippet(text, terms, len = 150){
  const low = text.toLowerCase();
  let at = -1;
  for (const w of terms){ const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  let s = text, pre = '', post = '';
  if (text.length > len){
    const from = Math.max(0, at < 0 ? 0 : at - 50);
    s = text.slice(from, from + len); pre = from > 0 ? '…' : ''; post = from + len < text.length ? '…' : '';
  }
  const re = new RegExp('(' + terms.map(reEsc).join('|') + ')', 'gi');
  return [pre, ...s.split(re).map((p, i) => i % 2 ? element('mark', null, p) : p), post];
}

/* ---- drawing ---- */
const body = () => $('#settingsDlg .gd-body');
const groupName = g => (GD_GROUPS.find(x => x[0] === g) || [])[1] || '';
function renderToc(){
  const toc = $('#settingsDlg .gd-toc'); if (!toc) return;
  const terms = termsOf(gd.q), hits = new Map(gd.q ? gd.results.filter(r => r.kind === 'topic').map(r => [r.t.slug, r.hits]) : []);
  toc.replaceChildren(element('button', { type: 'button', class: 'gd-home' + (!gd.topic && !gd.q ? ' on' : ''), dataset: { topic: '' } }, element('span', { html: icon.book }), 'Guide'));
  for (const [g, name, ico] of GD_GROUPS){
    const list = topics.filter(t => t.group === g); if (!list.length) continue;
    toc.append(element('div', 'gd-grp', element('span', { html: icon[ico] || '' }), name));
    for (const t of list) toc.append(element('button', { type: 'button', class: 'gd-ti' + (gd.topic === t.slug ? ' on' : '') + (terms.length && !hits.has(t.slug) ? ' dim' : ''),
      dataset: { topic: t.slug }, 'aria-current': gd.topic === t.slug ? 'page' : null }, element('span', 'gd-tn', t.title), terms.length && hits.get(t.slug) ? element('span', 'gd-c', String(hits.get(t.slug))) : null));
  }
  toc.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
const gdTile = name => element('span', { class: 'gd-ico', html: icon[name] || icon.book });
function renderHome(){
  const b = body();
  b.replaceChildren(element('article', 'gd-art gd-homepage',
    element('div', 'gd-hero', gdTile('book'), element('div', null, element('h2', null, 'Guide'), element('p', 'gd-lede', 'How to use every part of the app. Search above, or pick a topic.'))),
    element('div', 'gd-cards', ...GD_GROUPS.map(([g, name, ico]) => {
      const list = topics.filter(t => t.group === g); if (!list.length) return null;
      return element('section', 'gd-card', element('h3', null, element('span', { html: icon[ico] || '' }), name),
        ...list.map(t => element('button', { type: 'button', class: 'gd-cl', dataset: { topic: t.slug }, title: t.lede }, t.title)));
    })),
    element('p', 'gd-foot', 'Something not working? ', element('button', { type: 'button', class: 'gd-link', dataset: { topic: 'reporting-a-problem' } }, 'Reporting a problem'),
      ' · ', element('a', { href: GD_REPO, target: '_blank', rel: 'noopener' }, 'Read it on GitHub'))));
  b.scrollTop = 0;
}
const paneShown = p => { const btn = settingsDlg.querySelector(`.st-rail [data-s="${p}"]`); return !!btn && !btn.hidden; };
const showable = sel => { try { const e = sel && document.querySelector(sel); return !!e && !e.hidden && ROLE === 'main'; } catch { return false; } };
function renderTopic(t, q){
  const i = topics.indexOf(t), prev = topics[i - 1], next = topics[i + 1], b = body();
  const paneName = t.settings && paneShown(t.settings) ? settingsDlg.querySelector(`.st-rail [data-s="${t.settings}"]`).textContent.trim() : '';
  const art = element('article', 'gd-art',
    element('div', 'gd-crumb', groupName(t.group), ' › ', t.title),
    element('div', 'gd-hero', gdTile(t.icon), element('div', null, element('h2', null, t.title), t.lede ? element('p', 'gd-lede', t.lede) : null)),
    paneName || showable(t.show) ? element('div', 'gd-acts',
      paneName && t.settings !== 'guide' ? element('button', { type: 'button', class: 'gd-chip pri', dataset: { go: t.settings } }, 'Open Settings › ' + paneName) : null,
      showable(t.show) ? element('button', { type: 'button', class: 'gd-chip', dataset: { show: t.slug } }, element('span', { html: icon.point }), 'Show me') : null) : null,
    element('div', { class: 'gd-text', html: t.html }),
    t.keys ? element('div', { class: 'gd-keys', html: shortcutsGrid() }) : null,
    element('nav', 'gd-pn',
      prev ? element('button', { type: 'button', class: 'gd-prev', dataset: { topic: prev.slug } }, element('span', { html: icon.arrowL }), element('span', null, element('small', null, 'Previous'), prev.title)) : element('span'),
      t.related.length ? element('div', 'gd-rel', ...t.related.map(s => bySlug.get(s)).filter(Boolean).map(r => element('button', { type: 'button', class: 'gd-chip', dataset: { topic: r.slug } }, r.title))) : element('span'),
      next ? element('button', { type: 'button', class: 'gd-next', dataset: { topic: next.slug } }, element('span', null, element('small', null, 'Next'), next.title), element('span', { html: icon.arrowR })) : element('span')));
  b.replaceChildren(art);
  b.scrollTop = 0;
  if (q) markHits(art.querySelector('.gd-text'), termsOf(q));
}
// The search's words in the topic, marked; the first one scrolled to.
function markHits(root, terms){
  if (!root || !terms.length) return;
  const re = new RegExp('(' + terms.map(reEsc).join('|') + ')', 'gi'), found = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (re.test(n.nodeValue)){ re.lastIndex = 0; found.push(n); }
  for (const n of found.slice(0, 60)){
    const parts = n.nodeValue.split(re);
    n.replaceWith(...parts.map((p, i) => i % 2 ? element('mark', 'gd-hit', p) : p));
  }
  root.querySelector('mark.gd-hit')?.scrollIntoView({ block: 'center' });
}
function renderResults(){
  const b = body(), terms = termsOf(gd.q), list = gd.results;
  $('#settingsDlg .gd-count').textContent = list.length ? `${list.length} result${list.length === 1 ? '' : 's'}` : 'No results';
  const KIND = { topic: 'Topic', setting: 'Setting', keys: 'Keys' };
  b.replaceChildren(element('div', 'gd-res',
    list.length ? element('div', 'gd-rh', element('span', null, 'Best matches'), element('span', { html: '<kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open' })) : null,
    ...list.map((r, i) => element('button', { type: 'button', class: 'gd-r' + (i === gd.at ? ' cur' : ''), dataset: { i }, role: 'option', 'aria-selected': String(i === gd.at) },
      element('span', 'gd-rt', r.kind === 'keys' ? element('span', { class: 'gd-rk', html: keyName(r.keys).split(' or ').map(x => `<kbd>${esc(x)}</kbd>`).join(' or ') }) : null, r.title,
        element('span', 'gd-rw', r.where), element('span', 'gd-kind gd-' + r.kind, KIND[r.kind])),
      r.text ? element('span', 'gd-rs', ...snippet(r.text, terms)) : null)),
    !list.length ? element('div', 'gd-none', element('p', null, `Nothing found for “${gd.q}”.`), element('p', null, 'Try fewer or other words, or ',
      element('button', { type: 'button', class: 'gd-link', dataset: { topic: '' } }, 'see every topic'), '.')) : null));
  b.querySelector('.gd-r.cur')?.scrollIntoView({ block: 'nearest' });
}
function render(){
  renderToc();
  if (gd.q) return renderResults();
  $('#settingsDlg .gd-count').textContent = '';
  const t = gd.topic && bySlug.get(gd.topic);
  if (t) renderTopic(t); else renderHome();
}

/* ---- going places ---- */
function openTopic(slug, q){
  gd.topic = bySlug.has(slug) ? slug : null;
  gd.q = ''; gd.results = []; gd.at = 0;
  const box = $('#gdSearch'); if (box) box.value = '';
  renderToc();
  $('#settingsDlg .gd-count').textContent = '';
  const t = gd.topic && bySlug.get(gd.topic);
  if (t) renderTopic(t, q); else renderHome();
}
function openResult(r){
  if (!r) return;
  if (r.kind === 'topic') return openTopic(r.t.slug, gd.q);
  if (r.kind === 'keys'){ openSettings('keys'); return; }
  openSettings(r.pane);
  // the option itself, lit for a moment
  const sub = r.el && r.el.closest('.st-subpane[data-t]');
  if (sub && sub.hidden) settingsDlg.querySelector(`.st-pane[data-s="${r.pane}"] .st-tabs button[data-t="${sub.dataset.t}"]`)?.click();
  if (r.el){ r.el.scrollIntoView({ block: 'center' }); r.el.classList.remove('gd-lit'); void r.el.offsetWidth; r.el.classList.add('gd-lit'); setTimeout(() => r.el.classList.remove('gd-lit'), 2200); }
}
function setQuery(q){
  gd.q = String(q || '').trim();
  gd.results = gd.q ? search(gd.q) : [];
  gd.at = 0;
  render();
}
// Settings › Guide at a topic (or its first page), from anywhere: F1's menu, a ? button, "How to get one"
async function showGuide(slug, q){
  await openSettings('guide');
  await loadGuide();
  openTopic(slug || '', q);
}
// Called when Settings shows the Guide (help.js renderDoc)
async function renderGuide(){
  await loadGuide();
  render();
}
function showMe(slug){
  const t = bySlug.get(slug); if (!t || !showable(t.show)) return;
  closeSettings();
  startTour([{ sel: t.show, t: t.title, d: t.lede }], false);
}

/* ---- the ? on each Settings page: what it's for, and its topic ---- */
function addPaneHelp(){
  if (!settingsDlg) return;
  settingsDlg.querySelectorAll('.st-pane[data-s] > h4').forEach(h => {
    const pane = h.closest('.st-pane').dataset.s, t = topics.find(x => x.settings === pane);
    if (!t || h.querySelector('.gd-q')) return;
    h.append(element('button', { type: 'button', class: 'gd-q', title: 'Help: ' + t.title, 'aria-label': 'Help: ' + t.title, dataset: { helpTopic: t.slug } }, '?'));
  });
}
function openPop(btn){
  const t = bySlug.get(btn.dataset.helpTopic); if (!t) return;
  if (gd.pop && !gd.pop.hidden && gd.popFor === btn){ gd.pop.hidden = true; return; }
  gd.popFor = btn;
  gd.pop.replaceChildren(element('div', 'gd-pt', gdTile(t.icon), element('b', null, t.title)), t.lede ? element('p', null, t.lede) : null,
    element('button', { type: 'button', class: 'gd-chip pri', onclick: () => { gd.pop.hidden = true; showGuide(t.slug); } }, 'Read the guide ›'));
  gd.pop.hidden = false;
  const r = btn.getBoundingClientRect(), w = gd.pop.offsetWidth;
  gd.pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - 12)) + 'px';
  gd.pop.style.top = Math.min(innerHeight - gd.pop.offsetHeight - 8, r.bottom + 6) + 'px';
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  GD_PANE_RE = new RegExp('Settings\\s*(?:›|&gt;)\\s*(' + Object.keys(GD_PANES).sort((a, b) => b.length - a.length).join('|') + ')\\b', 'gi');
  const pane = $('#settingsDlg .gd-pane'); if (!pane) return;
  const box = $('#gdSearch');
  box.addEventListener('input', () => setQuery(box.value));
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      if (!gd.results.length) return;
      e.preventDefault();
      gd.at = (gd.at + (e.key === 'ArrowDown' ? 1 : -1) + gd.results.length) % gd.results.length;
      renderResults();
    } else if (e.key === 'Enter'){ e.preventDefault(); openResult(gd.results[gd.at]); }
    else if (e.key === 'Escape' && box.value){ e.preventDefault(); e.stopPropagation(); box.value = ''; setQuery(''); }
  });
  pane.addEventListener('click', e => {
    const r = e.target.closest('.gd-r'); if (r){ openResult(gd.results[+r.dataset.i]); return; }
    const s = e.target.closest('[data-show]'); if (s){ showMe(s.dataset.show); return; }
    const t = e.target.closest('[data-topic]'); if (t){ openTopic(t.dataset.topic); return; }
  });
  // "/" or Ctrl+F (⌘F) while the Guide shows: to the search box
  document.addEventListener('keydown', e => {
    if (settingsDlg.hidden || pane.hidden) return;
    const typing = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f')){
      e.preventDefault(); e.stopImmediatePropagation(); box.focus(); box.select();
    }
  }, true);
  gd.pop = element('div', { class: 'gd-pop', role: 'dialog', hidden: true });
  document.body.append(gd.pop);
  closeOnOutside(gd.pop, { button: () => gd.popFor, capture: true });
  settingsDlg.addEventListener('click', e => { const q = e.target.closest('.gd-q'); if (q){ e.preventDefault(); e.stopPropagation(); openPop(q); } });
  settingsDlg.querySelector('.st-body').addEventListener('scroll', () => { if (gd.pop) gd.pop.hidden = true; }, { passive: true });
  loadGuide();
  window.guide = { load: loadGuide, search, show: showGuide, topics: () => topics, frontMatter, pageHtml };   // for the tests
}

export { init, renderGuide, showGuide };
