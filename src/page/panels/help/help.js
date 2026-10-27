import { $ } from '../../core.js';
import { renderGuide, showGuide } from './guide.js';
import { openSettings } from '../settings/settings.js';
import { commands } from '../../shared/commands.js';
import { esc } from '../../shared/element.js';
import { DESKTOP, keyName } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { settings } from '../../shared/settings.js';

/* ---- Help: the guide (guide.js), keyboard shortcuts, what's new ---- */
const SHORTCUTS = [
  ['General', [
    ['Ctrl+K', 'Search and actions: find and do anything'],
    ['F1 or ?', 'Show these keyboard shortcuts'],
    ['Ctrl+,', 'Settings'],
    ['Ctrl+Z', 'Undo the last change to your windows'],
    ['Ctrl+Y or Ctrl+Shift+Z', 'Redo'],
    ['N or /', 'Open a channel: type its name or paste a link'],
    ['B', 'Channels'],
    ['W', 'Show another app\'s window (e.g. Discord)'],
    ['H', 'Hide / show the toolbar'],
    ['Esc', 'Close menus and dialogs, or bring the toolbar back'],
    ['F11', 'Full screen']
  ]],
  ['Layouts', [
    ['F', 'Focus view (press again for plain Columns)'],
    ['G', 'Game focus'],
    ['K', 'Chat Stage'],
    ['Shift+K', 'Chat Rail'],
    ['C', 'Columns'],
    ['Shift+C', 'Chat focus'],
    ['T', 'Tile'],
    ['A', 'Auto layout'],
    ['L', 'Layout menu'],
    ['Shift+L', 'Lock or unlock the layout'],
    ['S', 'Switch control on / off (floating)']
  ]],
  ['Linked accounts (a window with a tab per site)', [
    ['Alt+1 – Alt+3', 'Switch the window you last clicked to its 1st–3rd site'],
    ['Alt+← / Alt+→', 'Previous / next site'],
    ['Tab / Shift+Tab', 'In an empty chat box: next / previous site (while you type, the site completes names)'],
    ['Middle-click a tab', 'Close that tab (+ brings it back)']
  ]],
  ['Chats', [
    ['Z', 'Blow up chat on click on / off'],
    ['Shift+Z', 'Blow up the chat you last clicked now (again, or Esc, puts it back)']
  ]],
  ['The big stream (Focus view; otherwise the first stream)', [
    ['1 – 9', 'Make stream 1–9 big'],
    ['← / →', 'Previous / next stream: big in Focus view, on the stage in Chat Stage, its chat in Chat Rail, picked in other layouts (in Columns: scroll)'],
    ['M', 'Mute / unmute it'],
    ['Shift+M', 'Mute every stream'],
    ['Space or P', 'Pause / play it'],
    ['↑ / ↓', 'Its volume up / down'],
    ['R', 'Refresh it'],
    ['Shift+R', 'Refresh every stream']
  ]]
];
var keysOn = true;
function setKeysOn(on){
  keysOn = !!on;
  settings.set('keys', keysOn);
  const g = $('#settingsDlg .sc-grid'); if (g) g.classList.toggle('off', !keysOn);
  const h = $('#keysOn'); if (h) h.checked = keysOn;
  const st = $('#keysSet'); if (st) st.checked = keysOn;
  flash(keysOn ? 'Keyboard shortcuts on' : 'Keyboard shortcuts off');
}
let appVersion = '';
const kbdHtml = k => keyName(k).split(' or ').map(x => x.split(/(?<=\S)\+(?=\S)/).map(p => `<kbd>${esc(p)}</kbd>`).join('+')).join(' or ');
// every shortcut, by group (Keyboard shortcuts, and the guide's page about them)
const shortcutsGrid = () => '<div class="sc-grid">' +
  SHORTCUTS.map(([g, rows]) => `<h4>${esc(g)}</h4>` + rows.map(([k, d]) => `<div class="sc-row"><span>${esc(d)}</span>${kbdHtml(k)}</div>`).join('')).join('') + '</div>';
function shortcutsHtml(){
  return `<label class="chk sc-toggle"><input type="checkbox" id="keysOn"${keysOn ? ' checked' : ''}><b>Use keyboard shortcuts</b><span>Untick to switch them all off (Esc still closes menus).</span></label>` +
    '<p>Shortcuts work when the app itself has your keyboard. If you just clicked inside a stream or chat, click a title bar or an empty spot first. They are ignored while you type in a text box.</p>' + shortcutsGrid();
}
// Help is part of Settings: Guide and Keyboard shortcuts are tabs there, What's new is in Updates.
// topic: a page of the guide (its file's name), opened at the words in q
const HELP_TAB = { guide: 'guide', keys: 'keys', news: 'updates', upd: 'updates' };
async function showHelp(tab, topic, q){
  if ((HELP_TAB[tab] || 'guide') === 'guide') return showGuide(topic, q);
  await openSettings(HELP_TAB[tab]);
  if (tab === 'news'){ const h = $('#settingsDlg .upd-news:not([hidden])'); if (h) h.scrollIntoView({ block: 'start' }); }
}
// A file from the app folder (CHANGELOG.md) as text, or null
async function readDocText(file){
  if (DESKTOP && window.kmv.readHelp){ try { return await window.kmv.readHelp(file); } catch { return null; } }
  try { const r = await fetch('../' + file); if (r.ok) return await r.text(); } catch {}
  return null;
}
// Fills in the help for a Settings tab (Guide or Keyboard shortcuts; What's new under Updates is updates.js's).
async function renderDoc(tab){
  if (!appVersion && window.kmv && window.kmv.appVersion){ try { appVersion = await window.kmv.appVersion(); } catch {} }
  $('#settingsDlg .help-ver').textContent = appVersion ? 'v' + appVersion + (/^0\./.test(appVersion) ? ' beta' : '') : '';
  if (tab === 'keys'){
    const body = $('#settingsDlg [data-doc=keys]');
    body.innerHTML = shortcutsHtml();
    body.querySelector('#keysOn').onchange = e => setKeysOn(e.target.checked);
    body.querySelector('.sc-grid').classList.toggle('off', !keysOn);
  } else if (tab === 'guide') await renderGuide();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  keysOn = settings.flag('keys', true);
  // the search box's (Ctrl/⌘+K): every shortcut, with its keys (Enter shows the list)
  commands.add(SHORTCUTS.flatMap(([g, rows]) => rows.map(([k, d]) => ({ id: 'keys:' + k, kind: 'help', group: 'Keyboard shortcuts', title: d, sub: g, keys: k.split(' or ')[0],
    words: ['shortcut', 'key ' + k], icon: 'keys', verb: 'Show', onlyScope: '?', run: () => showHelp('keys') }))));
}

export { appVersion, init, keysOn, readDocText, renderDoc, setKeysOn, SHORTCUTS, shortcutsGrid, showHelp };
