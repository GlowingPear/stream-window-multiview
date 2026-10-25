import { ROLE } from '../../core.js';
import { openResult } from '../help/guide.js';
import { closeSettings, openSettings, settingsDlg } from './settings.js';
import { commands } from '../../shared/commands.js';
import { DESKTOP } from '../../shared/env.js';

/* ---- The search box's (Ctrl/⌘+K) Settings: each page, each tab inside a page, and each option ----
   An option with a switch flips right there (⇧Enter opens its page instead); an option with one button runs it;
   anything else opens its page with the option lit, as the guide's search does. Found by reading the Settings
   window itself, so a new option is found without anything added here. */
const paneName = btn => [...btn.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
const textOf = t => [...t.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !/^(SMALL|BUTTON|EM)$/.test(n.tagName))).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
// the pages showing here (a desktop-only page isn't in a browser), with their rail button
function stPanes(){
  return [...settingsDlg.querySelectorAll('.st-rail button[data-s]')].filter(b => !b.hidden)
    .map(b => ({ s: b.dataset.s, name: paneName(b), pane: settingsDlg.querySelector(`.st-pane[data-s="${b.dataset.s}"]`) })).filter(p => p.pane);
}
// a row that isn't there here: hidden itself (or something between it and its page is, other than a tab's part)
function stRowOff(row, pane){
  for (let e = row; e && e !== pane; e = e.parentElement){
    if (e.hidden && !e.classList.contains('st-subpane')) return true;
    if ((!DESKTOP && e.classList.contains('desk-only')) || (ROLE !== 'main' && e.classList.contains('main-only'))) return true;
  }
  return false;
}
// a tab inside a page (Spam alerts › Scoring): its name, and which page part it shows
const subOf = row => row.closest('.st-subpane[data-t]');
function stItems(){
  const out = [];
  for (const { s, name, pane } of stPanes()){
    out.push({ id: 'settings.' + s, kind: 'tab', group: 'Settings', title: 'Settings › ' + name, sub: (pane.querySelector('.st-sub') || {}).textContent || '', words: [name],
      icon: 'gear', run: () => openSettings(s) });
    pane.querySelectorAll('.st-tabs button[data-t]').forEach(t => {
      if (t.hidden) return;
      const tn = t.textContent.replace(/\s+\d+$/, '').trim();
      out.push({ id: `settings.${s}.${t.dataset.t}`, kind: 'tab', group: 'Settings', title: tn, sub: `Settings › ${name} › ${tn}`, words: [name + ' ' + tn],
        icon: 'gear', run: () => openSettings(s, { sub: t.dataset.t }) });
    });
    if (s === 'guide' || s === 'keys') continue;
    pane.querySelectorAll('.st-row, .ca-row').forEach((row, i) => {
      const t = row.querySelector('.st-t'); if (!t || stRowOff(row, pane)) return;
      const title = textOf(t); if (!title) return;
      const small = (t.querySelector('small') || {}).textContent || '', sub = subOf(row);
      const where = `Settings › ${name}` + (sub ? ' › ' + (pane.querySelector(`.st-tabs button[data-t="${sub.dataset.t}"]`)?.textContent.replace(/\s+\d+$/, '').trim() || '') : '');
      const inputs = [...row.querySelectorAll('input, select, textarea')].filter(x => x.type !== 'hidden');
      const buttons = [...row.querySelectorAll(':scope > button, :scope > .btn')].filter(b => !b.hidden);
      const sw = inputs.length === 1 && inputs[0].type === 'checkbox' ? inputs[0] : null;
      const show = () => openResult({ kind: 'setting', pane: s, el: row });
      const it = { id: `setting.${s}.${row.id || sw?.id || title}`, kind: 'setting', group: 'Settings', title, sub: where + (small ? ' · ' + small.trim() : ''), words: [name],
        icon: 'sliders', alt: show, altLabel: 'its page', disabled: () => (sw && sw.disabled && 'Not available right now') || '' };
      if (sw) it.toggle = { get: () => sw.checked, set: () => { sw.click(); } };
      else if (!inputs.length && buttons.length === 1){ it.run = () => { closeSettings(); buttons[0].click(); }; it.verb = buttons[0].textContent.trim() || 'Run'; it.alt = show; buttons[0].dataset.cmd ||= it.id; }
      else { it.run = show; it.verb = 'Show'; delete it.alt; }
      out.push(it);
    });
  }
  return out;
}
let stCache = null, stAt = 0;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  // its pages and tabs are marked with their commands (for the test that every button has one)
  settingsDlg.querySelectorAll('.st-rail button[data-s]').forEach(b => { b.dataset.cmd = 'settings.' + b.dataset.s; });
  settingsDlg.querySelectorAll('.st-pane[data-s] .st-tabs button[data-t]').forEach(b => { b.dataset.cmd = `settings.${b.closest('.st-pane').dataset.s}.${b.dataset.t}`; });
  commands.add({ id: 'settings', group: 'Settings', title: 'Settings', sub: 'General, accounts, alerts, themes and updates', words: ['preferences', 'options'], icon: 'gear', keys: 'Ctrl+,', button: '#settingsBtn' });
  // read again at most every 2 s (rows come and go with the desktop app, accounts and Developer tools)
  stCache = stItems(); stAt = Date.now();      // (and marks the buttons that are an option's command)
  commands.provide('settings', () => {
    if (!stCache || Date.now() - stAt > 2000){ stCache = stItems(); stAt = Date.now(); }
    return stCache;
  });
}

export { init };
