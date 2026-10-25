import { $, ROLE } from '../../core.js';
import { appVersion, readDocText, showHelp } from '../help/help.js';
import { openSettings, settingsDlg, settingsTab } from '../settings/settings.js';
import { ago, downloadText, newerVersion, parseChangelog, percent, releaseDate } from './update-text.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon, setTb } from '../../shared/icons.js';
import { fromApp } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';

/* ---- Updates from GitHub: Settings › Updates, the toolbar's chip while a version is out, and the "Updated" card on a
   new version's first start ---- */
let updSt = null;       // the update status from the app (src/main/main.js updStatus)
let news = null;        // CHANGELOG.md's versions (parseChangelog), once read
let shownKey = '';      // what Settings › Updates shows, so a download's progress only moves its bar
const PEAR = '<svg class="pear" viewBox="0 0 64 64" aria-hidden="true"><path d="M33.2 15.5C33 11.5 34.2 8 36.6 4.8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M36.2 9.6C40 4.2 47.5 3.2 52.5 5.4 49.6 10.8 42.4 12.8 36.2 9.6Z"/><path d="M32 14.2C25.6 14.2 23.4 19.4 23.4 24.6 23.4 29.6 20.4 31.6 17.2 35.6 13.2 40.6 12 46.8 14.2 52 17.2 58.8 24.4 62 32 62 39.6 62 46.8 58.8 49.8 52 52 46.8 50.8 40.6 46.8 35.6 43.6 31.6 40.6 29.6 40.6 24.6 40.6 19.4 38.4 14.2 32 14.2Z"/></svg>';
const ver = t => element('b', 'upd-v', t);     // a version number in a sentence
const btnName = t => element('b', null, t);    // a button's name in a sentence
const waiting = u => !!u && ['available', 'downloading', 'ready'].includes(u.state);   // a new version is out
const restartLabel = u => (u.installed_app ? (u.platform === 'darwin' && !u.swap ? 'Install' : 'Restart and install') : 'Restart now');

// What the state means: the sentence (children for element()), the card's look ('', 'glow' when there's something
// to do, 'bad' for a problem) and the pear's badge ('spin', 'drop' or an icon's name).
function updMsg(u){
  if (u.git){   // checking still works (to see the latest release and its notes), installing doesn't
    const now = u.state === 'checking' ? [' Checking…'] : u.state === 'error' ? [' The check didn\'t work.']
      : u.latest ? [' The newest version is ', ver(u.latest), '.'] : [];
    return { tone: '', badge: u.state === 'checking' ? 'spin' : 'lock', say: ['This copy is a git checkout, so it isn\'t updated automatically. Use ', element('code', null, 'git pull'), ' to update it.', ...now] };
  }
  switch (u.state){
    case 'norepo': return { tone: 'bad', badge: 'alert', say: ['No GitHub page is set yet. Enter the project\'s GitHub name below (owner/repository).'] };
    case 'checking': return { tone: '', badge: 'spin', say: ['Checking for updates…'] };
    case 'downloading': return { tone: '', badge: 'drop', say: ['Downloading version ', ver(u.latest), '…'] };
    case 'available': return { tone: 'glow', badge: 'sparkle', say: u.manual ? ['Version ', ver(u.latest), ' is available. Download it from the GitHub page.'] : ['Version ', ver(u.latest), ' is available.'] };
    case 'ready':
      if (u.installed_app && u.blocked) return { tone: 'bad', badge: 'alert', say: ['macOS stopped Stream Multiview updating itself. Click ', btnName('Open System Settings'), ', turn on Stream Multiview under ', btnName('App Management'), ', then click ', btnName('Restart and install'), ' again. Or use the disk image instead.'] };
      if (u.installed_app) return { tone: 'glow', badge: 'gift', say: u.platform === 'darwin' && !u.swap
        ? ['Version ', ver(u.installed), ' is downloaded. Click ', btnName('Install'), ', then drag Stream Multiview into Applications (replace the old one) and open it again.']
        : ['Version ', ver(u.installed), ' is downloaded. Click ', btnName('Restart and install'), ': the app closes, updates itself and opens again.'] };
      return { tone: 'glow', badge: 'gift', say: u.needsInstall
        ? ['Version ', ver(u.installed), ' is installed. Close the app and start it again with your shortcut (or Start Stream Multiview.bat) to finish: this update needs a one-time engine install.']
        : ['Version ', ver(u.installed), ' is installed. Restart the app to use it.'] };
    case 'uptodate': return { tone: '', badge: 'check', say: ['You have the newest version.'] };
    case 'error': return { tone: 'bad', badge: 'alert', say: u.error === 'notfound' ? ['That GitHub page wasn\'t found. Check the name, and that the repository is public.']
      : u.error === 'nowrite' ? ['Couldn\'t save the new files in the app folder. Move the app to a folder you own (like Documents) and try again.']
      : u.error === 'wrongapp' || u.error === 'nopkg' || u.error === 'incomplete' ? ['That GitHub page doesn\'t look like Stream Multiview.']
      : ['Couldn\'t check for updates right now (', element('span', 'upd-err', u.error), '). Try again later.'] };
    default: return { tone: '', badge: '', say: [u.repo ? 'Not checked yet.' : ''] };
  }
}
// GitHub's release notes as HTML (rendered and cleaned by GitHub, like on the release page). Only plain
// formatting, https links and videos (with controls, never autoplaying) are kept; anything else becomes its
// text. Links open in your browser.
const NOTE_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'CODE', 'TT', 'PRE', 'A', 'BR', 'BLOCKQUOTE', 'HR', 'DEL', 'IMG', 'VIDEO']);
const NOTE_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LINK', 'META', 'SUMMARY']);   // SUMMARY: the file name GitHub shows above a video
// A video attached to the notes comes as a signed link that stops working after 5 minutes, but the notes
// are kept from the last check. Its permanent address (which signs a fresh link each time) works for longer.
const noteVideo = src => src.replace(/^https:\/\/private-user-images\.githubusercontent\.com\/\d+\/\d+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.\w+(\?.*)?$/i,
  'https://github.com/user-attachments/assets/$1');
function releaseNotes(html){
  const t = document.createElement('template');
  t.innerHTML = String(html);
  [...t.content.querySelectorAll('*')].reverse().forEach(el => {
    const tag = el.tagName.toUpperCase();
    if (NOTE_DROP.has(tag)){ el.remove(); return; }
    if (!NOTE_TAGS.has(tag)){ el.replaceWith(...el.childNodes); return; }
    for (const a of [...el.attributes]) if (!['href', 'src', 'alt'].includes(a.name)) el.removeAttribute(a.name);
    for (const k of ['href', 'src']) if (el.hasAttribute(k) && !/^https:\/\//i.test(el.getAttribute(k))) el.removeAttribute(k);
    if (tag === 'VIDEO'){
      if (el.hasAttribute('src')) el.setAttribute('src', noteVideo(el.getAttribute('src')));
      el.setAttribute('controls', ''); el.setAttribute('muted', ''); el.setAttribute('preload', 'metadata');
    }
  });
  return t.content;
}
const openLink = url => { if (/^https:\/\//i.test(url || '') && window.kmv.openExternal) window.kmv.openExternal(url); };

// The pear with the state's badge
function pearArt(badge){
  const b = badge === 'spin' ? element('span', 'upd-badge', element('span', 'spin'))
    : badge === 'drop' ? element('span', 'upd-badge b-drop', element('span', { class: 'dl-arrow', html: icon.down }))
    : badge ? element('span', { class: 'upd-badge b-' + badge, html: icon[badge] || '' }) : null;
  return element('div', 'upd-pear', element('span', { class: 'upd-pear-ico', html: PEAR }), b);
}
const checkedText = u => [u.lastCheck ? 'Checked ' + ago(u.lastCheck) : '', u.repo ? 'github.com/' + u.repo : ''].filter(Boolean).join(' · ');
// A download's bar and "42% · 38 of 91 MB"; it moves back and forth while the size isn't known
function setProgress(el, u){
  const known = typeof u.progress === 'number';
  el.classList.toggle('ind', !known);
  el.querySelector('.upd-bar i').style.width = known ? Math.max(0, Math.min(100, u.progress * 100)) + '%' : '';
  el.querySelector('.upd-pct').textContent = downloadText(u);
}
// The card at the top: the app, its version, what's happening, and what you can do about it
function heroCard(u){
  const m = updMsg(u), cur = String(u.current || '');
  const acts = [];
  if (u.state === 'available' && !u.git) acts.push(element('button', { class: 'btn primary upd-install', html: icon.download, onclick: () => window.kmv.updateInstall() }, u.manual ? 'Open download page' : u.installed_app ? 'Download update' : 'Download and install'));
  if (u.state === 'ready' && u.blocked) acts.push(element('button', { class: 'btn primary upd-privacy', onclick: () => window.kmv.updatePrivacySettings() }, 'Open System Settings'));
  if (u.state === 'ready' && !u.needsInstall) acts.push(element('button', { class: 'btn upd-restart' + (u.blocked ? '' : ' primary'), html: icon.reload, onclick: restartForUpdate }, restartLabel(u)));
  if (u.state === 'ready' && u.blocked) acts.push(element('button', { class: 'btn upd-dmg', onclick: () => window.kmv.updateUseDmg() }, 'Use the disk image instead'));
  acts.push(element('button', { class: 'btn upd-check', html: icon.reload, dataset: { cmd: 'update.check' }, disabled: !u.repo || u.state === 'checking' || u.state === 'downloading', onclick: () => window.kmv.updateCheck() }, 'Check now'));
  let prog = null;
  if (u.state === 'downloading'){
    prog = element('div', 'upd-prog', element('div', 'upd-bar', element('i')), element('span', 'upd-pct'));
    setProgress(prog, u);
  }
  return element('div', { class: 'upd-hero' + (m.tone ? ' ' + m.tone : ''), dataset: { state: u.git ? 'git' : u.state || 'idle' } },
    pearArt(m.badge),
    element('div', 'upd-main',
      element('div', 'upd-title', element('b', null, 'Stream Multiview'), cur ? element('code', 'upd-cur', 'v' + cur) : null, /^0\./.test(cur) ? element('span', 'upd-beta', 'beta') : null),
      element('div', 'upd-state', m.say),
      element('div', 'upd-when', checkedText(u))),
    element('div', 'upd-acts', acts),
    prog);
}
// The new version: its number, date, release page and notes
function releaseCard(u){
  const v = u.state === 'ready' ? u.installed || u.latest : u.latest, date = releaseDate(u.published);
  const notes = u.notesHtml || u.notes ? element('div', 'upd-notes') : null;
  if (notes && u.notesHtml){
    notes.classList.add('html');
    notes.replaceChildren(releaseNotes(u.notesHtml));
    notes.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      openLink(a.href);
    });
  } else if (notes) notes.textContent = u.notes;
  return element('div', 'upd-rel',
    element('div', 'upd-rel-head',
      element('span', { class: 'upd-new', html: icon.sparkle }, 'New'),
      element('b', null, 'Version ' + v),
      date ? element('span', 'upd-date', date) : null,
      /^https:\/\//i.test(u.page || '') ? element('button', { class: 'upd-page', html: icon.pop, onclick: () => openLink(u.page) }, 'Release page') : null),
    notes);
}
function settingRows(u, typed){
  const inp = element('input', { placeholder: 'owner/repository', autocomplete: 'off', 'aria-label': 'GitHub repository', value: typed != null ? typed : (u.repo || '') });
  inp.spellcheck = false;
  const save = element('button', { class: 'btn upd-save', onclick: async () => { updSt = await window.kmv.updateSettings({ repo: inp.value }); shownKey = ''; renderUpdates(); if (updSt.repo) window.kmv.updateCheck(); } }, 'Save');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') save.click(); });
  return element('div', 'upd-rows',
    element('label', 'upd-row',
      element('div', 'upd-rt', element('b', null, 'Update automatically'), element('span', null, 'Downloads new versions in the background; they install when you restart.')),
      element('input', { type: 'checkbox', class: 'st-sw upd-auto', checked: !!u.auto, onchange: async e => { updSt = await window.kmv.updateSettings({ auto: e.target.checked }); } })),
    element('div', 'upd-row',
      element('div', 'upd-rt', element('b', null, 'GitHub repository'), element('span', null, 'Where new versions come from. It must be public.')),
      element('div', 'upd-repo', element('span', 'upd-pre', 'github.com/'), inp, save)));
}
async function loadNews(){
  if (!news){ const t = await readDocText('CHANGELOG.md'); news = t ? parseChangelog(t) : []; }
  return news;
}
// What's new: the changelog's newest versions as a timeline, this one marked
async function renderNews(){
  const host = settingsDlg.querySelector('.upd-news');
  host.hidden = DESKTOP && waiting(updSt);
  if (host.hidden || host.childElementCount) return;
  const list = await loadNews(), mine = appVersion || (list.find(x => x.current) || {}).version;
  if (host.childElementCount) return;
  host.append(element('h4', 'upd-news-h', 'What\'s new'), list.length
    ? element('ol', 'upd-tl', list.slice(0, 8).map(x => element('li', { class: 'upd-tv' + (x.version === mine ? ' this' : ''), dataset: { v: x.version } },
      element('div', 'upd-tv-h', element('code', null, x.version), x.version === mine ? element('span', 'upd-this', 'This version') : null),
      element('ul', null, x.lines.map(l => element('li', null, l))))))
    : element('p', 'upd-foot', 'Open CHANGELOG.md in the app folder to read this.'));
}
function renderUpdates(){
  if (settingsDlg.hidden || settingsTab !== 'updates') return;
  renderNews();
  const body = settingsDlg.querySelector('.upd-host');
  const u = updSt || { current: appVersion, state: 'idle' };
  if (!DESKTOP || !window.kmv.updateStatus){ body.replaceChildren(element('p', null, 'Updates work in the desktop app.')); return; }
  // while downloading, only the bar moves (the notes, and anything typed, stay as they are)
  const { progress, received, total, lastCheck, ...rest } = u;
  const key = JSON.stringify(rest), prog = body.querySelector('.upd-prog');
  if (key === shownKey && body.isConnected && (prog || u.state !== 'downloading')){
    if (prog) setProgress(prog, u);
    body.querySelector('.upd-when').textContent = checkedText(u);
    return;
  }
  shownKey = key;
  const keep = body.querySelector('.upd-repo input'), typed = keep && document.activeElement === keep ? keep.value : null;
  body.replaceChildren(heroCard(u), waiting(u) ? releaseCard(u) : '', settingRows(u, typed));
  settingsDlg.querySelector('.upd-foot.st-end').hidden = ROLE !== 'main';   // (like the card above, only in the main window)
  if (typed != null) body.querySelector('.upd-repo input').focus();
}
async function restartForUpdate(){
  const r = await window.kmv.updateRestart();
  if (r && r.needsInstall) flash('Close the app and start it again with your shortcut to finish the update', { subject: 'updates' });
  else if (r && r.blocked){ flash('macOS stopped the update: see Settings › Updates', { subject: 'updates' }); openSettings('updates'); }
  else if (r && r.mac) flash('Drag Stream Multiview into Applications (replace the old one), then open it again', { subject: 'updates' });
}
// The toolbar's chip, beside the bell: a version is out, downloading, or ready to install. Not in a git copy.
function renderChip(u){
  const b = $('#updChip');
  const st = !u || u.git ? '' : u.state === 'available' ? 'out' : u.state === 'downloading' ? 'dl' : u.state === 'ready' ? 'ready' : '';
  b.hidden = !st;
  if (!st) return;
  b.dataset.st = st;
  const pct = percent(u.progress);
  if (st === 'out') setTb(b, 'v' + u.latest, 'sparkle');
  else if (st === 'dl') setTb(b, pct || 'Downloading', 'down');
  else setTb(b, 'Update ready', 'gift');
  b.querySelector('i[data-ico]').classList.toggle('dl-arrow', st === 'dl');   // the arrow drops onto a line that stays still
  b.title = st === 'out' ? `Version ${u.latest} is out: see what's new` : st === 'dl' ? `Downloading version ${u.latest}${pct ? ' (' + pct + ')' : ''}` : `Version ${u.installed || u.latest} is ready to install`;
}
// The "Updated" card, on the first start of a newer version: what changed in it
async function showUpdated(from, to){
  const dlg = $('#updNewsDlg');
  const it = (await loadNews()).find(x => x.version === to);
  dlg.querySelector('.wn-from').textContent = 'Updated from ' + from;
  dlg.querySelector('.wn-to').textContent = to;
  const list = dlg.querySelector('.wn-list');
  list.replaceChildren(...(it ? it.lines : []).map(l => element('li', null, element('i', { html: icon.check }), element('span', null, l))));
  list.hidden = !list.childElementCount;
  dlg.hidden = false;
  dlg.querySelector('.wn-ok').focus();
}
const closeUpdated = () => { $('#updNewsDlg').hidden = true; };

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  if (DESKTOP && ROLE === 'main' && window.kmv.updateStatus){
    const got = u => { updSt = u; renderUpdates(); renderChip(u); };
    window.kmv.updateStatus().then(got).catch(() => {});
    fromApp('onUpdateStatus', got);
    fromApp('onUpdateShow', () => openSettings('updates'));
    fromApp('onHelpShow', tab => showHelp(tab));
    $('#updChip').onclick = () => openSettings('updates');
    // the search box's (Ctrl/⌘+K): what the Updates card's buttons do
    commands.add([
      { id: 'update.check', group: 'Updates', title: 'Check for updates', sub: () => updSt ? checkedText(updSt) : '', words: ['update', 'new version'], icon: 'reload',
        disabled: () => (!updSt || !updSt.repo) ? 'Not available in this copy' : (updSt.state === 'checking' || updSt.state === 'downloading') && 'Checking already',
        run: () => { window.kmv.updateCheck(); openSettings('updates'); } },
      { id: 'update.install', group: 'Updates', title: 'Install the update', sub: () => updSt && updSt.latest ? 'Version ' + updSt.latest : '', words: ['download update'], icon: 'download',
        when: () => !!updSt && updSt.state === 'available' && !updSt.git, run: () => window.kmv.updateInstall() },
      { id: 'update.restart', group: 'Updates', title: 'Restart to update', icon: 'reload', when: () => !!updSt && updSt.state === 'ready' && !updSt.needsInstall, run: restartForUpdate },
      { id: 'update.chip', group: 'Updates', title: 'Update', sub: 'Settings › Updates', icon: 'sparkle', button: '#updChip' }
    ]);
    setInterval(() => { const w = settingsDlg.querySelector('.upd-host .upd-when'); if (w && updSt && !settingsDlg.hidden) w.textContent = checkedText(updSt); }, 30000);   // "Checked 4m ago" keeps up
    const dlg = $('#updNewsDlg');
    dlg.querySelector('.wn-ok').onclick = closeUpdated;
    dlg.querySelector('.wn-all').onclick = () => { closeUpdated(); showHelp('news'); };
    dlg.addEventListener('pointerdown', e => { if (e.target === dlg) closeUpdated(); });
    // First start after an update: what's new in it
    window.kmv.appVersion().then(v => {
      const seen = settings.get('seenVersion');
      settings.set('seenVersion', v);
      if (seen && seen !== v) setTimeout(() => {
        if (newerVersion(v, seen)) showUpdated(seen, v);
        flash(`Updated to version ${v}`, { subject: 'updates', act: { t: 'news' } });
      }, 1500);
    }).catch(() => {});
  }
}

export { init, renderUpdates };
