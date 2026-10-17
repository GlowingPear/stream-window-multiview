import { $ } from '../../core.js';
import { openSettings } from '../settings/settings.js';
import { esc } from '../../shared/element.js';
import { DESKTOP, keyName } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { settings } from '../../shared/settings.js';

/* ---- Help: instructions, keyboard shortcuts, what's new ---- */
const SHORTCUTS = [
  ['General', [
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
    ['C', 'Columns'],
    ['Shift+C', 'Chat focus'],
    ['T', 'Tile'],
    ['A', 'Auto layout'],
    ['L', 'Layout menu'],
    ['Shift+L', 'Lock or unlock the layout'],
    ['S', 'Switch control on / off (floating)']
  ]],
  ['The big stream (Focus view; otherwise the first stream)', [
    ['1 – 9', 'Make stream 1–9 big'],
    ['← / →', 'Previous / next stream big (in Columns: scroll)'],
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
// Plain-text help files -> simple HTML (# title, ## section, ### subsection, - bullets, blank lines).
function helpHtml(text){
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  let out = '', inList = false;
  const close = () => { if (inList){ out += '</ul>'; inList = false; } };
  String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').forEach(line => {
    let m;
    if (/^\s*$/.test(line)){ close(); return; }
    if (/^={3,}\s*$|^-{3,}\s*$/.test(line)) return;
    if ((m = line.match(/^###\s+(.*)/))){ close(); out += `<h4>${inline(m[1])}</h4>`; return; }
    if ((m = line.match(/^##\s+(.*)/))){ close(); out += `<h3>${inline(m[1])}</h3>`; return; }
    if ((m = line.match(/^#\s+(.*)/))){ close(); out += `<h2>${inline(m[1])}</h2>`; return; }
    if ((m = line.match(/^(\s*)[-*]\s+(.*)/))){
      if (!inList){ out += '<ul>'; inList = true; }
      out += `<li${m[1].length >= 2 ? ' class="sub"' : ''}>${inline(m[2])}</li>`; return;
    }
    if (inList && /^\s{2,}\S/.test(line)){ out = out.replace(/<\/li>$/, ' ' + inline(line.trim()) + '</li>'); return; }
    close(); out += `<p>${inline(line.trim())}</p>`;
  });
  close();
  return out;
}
const kbdHtml = k => keyName(k).split(' or ').map(x => x.split(/(?<=\S)\+(?=\S)/).map(p => `<kbd>${esc(p)}</kbd>`).join('+')).join(' or ');
function shortcutsHtml(){
  return `<label class="chk sc-toggle"><input type="checkbox" id="keysOn"${keysOn ? ' checked' : ''}><b>Use keyboard shortcuts</b><span>Untick to switch them all off (Esc still closes menus).</span></label>` +
    '<p>Shortcuts work when the app itself has your keyboard. If you just clicked inside a stream or chat, click a title bar or an empty spot first. They are ignored while you type in a text box.</p><div class="sc-grid">' +
    SHORTCUTS.map(([g, rows]) => `<h4>${esc(g)}</h4>` + rows.map(([k, d]) => `<div class="sc-row"><span>${esc(d)}</span>${kbdHtml(k)}</div>`).join('')).join('') + '</div>';
}
// Help is part of Settings: Instructions and Keyboard shortcuts are tabs there, What's new is in Updates.
const HELP_TAB = { guide: 'guide', keys: 'keys', news: 'updates', upd: 'updates' };
async function showHelp(tab){
  await openSettings(HELP_TAB[tab] || 'guide');
  if (tab === 'news'){ const h = $('#settingsDlg .st-news-sec'); if (h) h.scrollIntoView({ block: 'start' }); }
}
async function readDoc(file){
  let text = null;
  if (DESKTOP && window.kmv.readHelp){ try { text = await window.kmv.readHelp(file); } catch {} }
  else { try { const r = await fetch('../' + file); if (r.ok) text = await r.text(); } catch {} }
  return text ? helpHtml(text) : `<p>Open <code>${file}</code> in the app folder to read this.</p>`;
}
// Fills in the help text for a Settings tab (Instructions, Keyboard shortcuts, or What's new under Updates).
async function renderDoc(tab){
  if (!appVersion && window.kmv && window.kmv.appVersion){ try { appVersion = await window.kmv.appVersion(); } catch {} }
  $('#settingsDlg .help-ver').textContent = appVersion ? 'v' + appVersion + (/^0\./.test(appVersion) ? ' beta' : '') : '';
  if (tab === 'keys'){
    const body = $('#settingsDlg [data-doc=keys]');
    body.innerHTML = shortcutsHtml();
    body.querySelector('#keysOn').onchange = e => setKeysOn(e.target.checked);
    body.querySelector('.sc-grid').classList.toggle('off', !keysOn);
  } else if (tab === 'guide'){
    const body = $('#settingsDlg [data-doc=guide]'), open = $('#settingsDlg [data-s=guide] .help-open');
    if (!body.childElementCount) body.innerHTML = await readDoc('INSTRUCTIONS.txt');
    open.hidden = !(DESKTOP && window.kmv.openHelp);
    open.onclick = () => window.kmv.openHelp('INSTRUCTIONS.txt');
  } else if (tab === 'updates'){
    const body = $('#settingsDlg [data-doc=news]');
    if (!body.childElementCount) body.innerHTML = await readDoc('CHANGELOG.md');
  }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  keysOn = settings.flag('keys', true);
}

export { appVersion, init, keysOn, renderDoc, setKeysOn, showHelp };
