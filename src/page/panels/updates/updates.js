import '../help/help.js';   // runs after it (see app.js)
import { esc } from '../../shared/element.js';
import { fromApp } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';
import { $, ROLE, msg } from '../../core.js';
import { DESKTOP } from '../../shared/env.js';
import { notes } from '../bell/bell.js';
import { flash } from '../../shared/flash.js';
import { appVersion, showHelp } from '../help/help.js';
import { openSettings, settingsDlg, settingsTab } from '../settings/settings.js';

/* ---- Updates from GitHub ---- */
let updSt = null;
function updMsg(u){
  if (u.git){   // checking still works (to see the latest release and its notes), installing doesn't
    const now = u.state === 'checking' ? ' <span class="spin"></span> Checking…' : u.state === 'error' ? ' The check didn\'t work.'
      : u.latest ? ` The newest version is <b>${esc(u.latest)}</b>.` : '';
    return ['', 'This copy is a git checkout, so it isn\'t updated automatically. Use <code>git pull</code> to update it.' + now];
  }
  switch (u.state){
    case 'norepo': return ['bad', 'No GitHub page is set yet. Enter the project\'s GitHub name below (owner/repository).'];
    case 'checking': return ['', '<span class="spin"></span> Checking for updates…'];
    case 'downloading': return ['', `<span class="spin"></span> Downloading version ${esc(u.latest)}…`];
    case 'available': return ['ok', u.manual ? `Version <b>${esc(u.latest)}</b> is available. Download it from the GitHub page.` : `Version <b>${esc(u.latest)}</b> is available.`];
    case 'ready': if (u.installed_app && u.blocked) return ['bad', `macOS stopped Stream Multiview updating itself. Click <b>Open System Settings</b>, turn on Stream Multiview under <b>App Management</b>, then click <b>Restart and install</b> again. Or use the disk image instead.`];
      if (u.installed_app) return ['ok', u.platform === 'darwin' && !u.swap
        ? `Version <b>${esc(u.installed)}</b> is downloaded. Click <b>Install</b>, then drag Stream Multiview into Applications (replace the old one) and open it again.`
        : `Version <b>${esc(u.installed)}</b> is downloaded. Click <b>Restart and install</b>: the app closes, updates itself and opens again.`];
      return ['ok', u.needsInstall
      ? `Version <b>${esc(u.installed)}</b> is installed. Close the app and start it again with your shortcut (or Start Stream Multiview.bat) to finish: this update needs a one-time engine install.`
      : `Version <b>${esc(u.installed)}</b> is installed. Restart the app to use it.`];
    case 'uptodate': return ['ok', 'You have the newest version.'];
    case 'error': return ['bad', u.error === 'notfound' ? 'That GitHub page wasn\'t found. Check the name, and that the repository is public.'
      : u.error === 'nowrite' ? 'Couldn\'t save the new files in the app folder. Move the app to a folder you own (like Documents) and try again.'
      : u.error === 'wrongapp' || u.error === 'nopkg' || u.error === 'incomplete' ? 'That GitHub page doesn\'t look like Stream Multiview.'
      : `Couldn't check for updates right now (${esc(u.error)}). Try again later.`];
    default: return ['', u.repo ? 'Not checked yet.' : ''];
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
function renderUpdates(){
  const body = settingsDlg.querySelector('.upd-host');
  if (settingsDlg.hidden || settingsTab !== 'updates') return;
  const u = updSt || { current: appVersion, state: 'idle' };
  if (!DESKTOP || !window.kmv.updateStatus){ body.innerHTML = '<p>Updates work in the desktop app.</p>'; return; }
  const [cls, msg] = updMsg(u);
  const keep = body.querySelector('.upd-repo input'), typed = keep && document.activeElement === keep ? keep.value : null;
  body.innerHTML = `<div class="upd-box">
    <div class="upd-ver">v${esc(String(u.current || ''))}${/^0\./.test(String(u.current || '')) ? ' <small>beta</small>' : ''}<small>${u.lastCheck ? 'last checked ' + new Date(u.lastCheck).toLocaleString() : ''}</small></div>
    <div class="upd-state ${cls}">${msg || '&nbsp;'}</div>
    <div class="upd-row">
      <button class="btn upd-check"${!u.repo || u.state === 'checking' || u.state === 'downloading' ? ' disabled' : ''}>Check now</button>
      ${u.state === 'available' && !u.git ? `<button class="btn primary upd-install">${u.manual ? 'Open download page' : u.installed_app ? 'Download update' : 'Download and install'}</button>` : ''}
      ${u.state === 'ready' && !u.needsInstall ? `<button class="btn primary upd-restart">${u.installed_app ? (u.platform === 'darwin' && !u.swap ? 'Install' : 'Restart and install') : 'Restart now'}</button>` : ''}
      ${u.state === 'ready' && u.blocked ? '<button class="btn upd-privacy">Open System Settings</button><button class="btn upd-dmg">Use the disk image instead</button>' : ''}
      <label class="chk"><input type="checkbox" class="upd-auto"${u.auto ? ' checked' : ''}>Update automatically</label>
    </div>
    ${u.notes || u.notesHtml ? `<div><h4>What's in version ${esc(u.latest)}</h4><div class="upd-notes"></div></div>` : ''}
    <div><h4>GitHub page</h4><p>The app checks this GitHub repository for new versions (it must be public).</p>
      <div class="upd-repo"><input placeholder="owner/repository" spellcheck="false" autocomplete="off"><button class="btn upd-save">Save</button></div></div>
    <p style="color:var(--muted);font-size:12px">Updating replaces the app's files with the new version's (the old ones are kept as a backup). Your logins, saved channels, layouts and themes aren't touched.</p>
  </div>`;
  const inp = body.querySelector('.upd-repo input'); inp.value = typed != null ? typed : (u.repo || '');
  if (typed != null) inp.focus();
  const notes = body.querySelector('.upd-notes');
  if (notes && u.notesHtml){
    notes.classList.add('html');
    notes.replaceChildren(releaseNotes(u.notesHtml));
    notes.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      e.preventDefault();
      if (window.kmv.openExternal) window.kmv.openExternal(a.href);
    });
  } else if (notes) notes.textContent = u.notes;
  const on = (sel, f) => { const b = body.querySelector(sel); if (b) b.onclick = f; };
  on('.upd-check', () => window.kmv.updateCheck());
  on('.upd-install', () => window.kmv.updateInstall());
  on('.upd-restart', restartForUpdate);
  on('.upd-privacy', () => window.kmv.updatePrivacySettings());
  on('.upd-dmg', () => window.kmv.updateUseDmg());
  on('.upd-save', async () => { updSt = await window.kmv.updateSettings({ repo: inp.value }); renderUpdates(); if (updSt.repo) window.kmv.updateCheck(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') body.querySelector('.upd-save').click(); });
  body.querySelector('.upd-auto').onchange = async e => { updSt = await window.kmv.updateSettings({ auto: e.target.checked }); };
}
async function restartForUpdate(){
  const r = await window.kmv.updateRestart();
  if (r && r.needsInstall) flash('Close the app and start it again with your shortcut to finish the update', { subject: 'updates' });
  else if (r && r.blocked){ flash('macOS stopped the update: see Settings › Updates', { subject: 'updates' }); openSettings('updates'); }
  else if (r && r.mac) flash('Drag Stream Multiview into Applications (replace the old one), then open it again', { subject: 'updates' });
}
function updBanner(u){
  const b = $('#updBanner');
  if (u.state === 'ready' && u.installed && !sessionStorage.getItem('smvUpdLater' + u.installed)){
    b.querySelector('.ub-txt').textContent = u.needsInstall
      ? `Stream Multiview ${u.installed} is installed. Close the app and start it again with your shortcut to finish.`
      : u.installed_app ? `Stream Multiview ${u.installed} is downloaded and ready to install.`
      : `Stream Multiview ${u.installed} is ready. Restart to use it.`;
    b.querySelector('.ub-go').textContent = u.installed_app ? (u.platform === 'darwin' && !u.swap ? 'Install' : 'Restart and install') : 'Restart now';
    b.querySelector('.ub-go').hidden = !!u.needsInstall;
    b.hidden = false;
  }
}
if (DESKTOP && ROLE === 'main' && window.kmv.updateStatus){
  window.kmv.updateStatus().then(u => { updSt = u; }).catch(() => {});
  fromApp('onUpdateStatus', u => { updSt = u; renderUpdates(); updBanner(u); });
  fromApp('onUpdateShow', () => openSettings('updates'));
  fromApp('onHelpShow', tab => showHelp(tab));
  $('#updBanner .ub-go').onclick = restartForUpdate;
  $('#updBanner .ub-later').onclick = () => { $('#updBanner').hidden = true; try { sessionStorage.setItem('smvUpdLater' + (updSt && updSt.installed), '1'); } catch {} };
  // First start after an update: show what's new.
  window.kmv.appVersion().then(v => {
    const seen = settings.get('seenVersion');
    settings.set('seenVersion', v);
    if (seen && seen !== v) setTimeout(() => { showHelp('news'); flash(`Updated to version ${v}`, { subject: 'updates', act: { t: 'news' } }); }, 1500);
  }).catch(() => {});
}

export { renderUpdates };
