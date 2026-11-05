import { ALERT_KINDS, SOUND_KEY } from '../../alerts/alerts.js';
import { $, ROLE } from '../../core.js';
import { openSettings, settingsDlg } from './settings.js';
import { ask } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { flash, flashUndo } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { fromApp } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';

/* ---- Settings › Sync (#337): saved channels and settings, the same on every computer, through a folder a sync app
   already moves. The main process does the work (src/main/sync.js): this part sends it the synced values at start and
   each change after (settings.afterSet), applies what other computers changed (settings.applySynced, so each part
   takes it as it takes a change from the other window), and draws the page. ---- */
let sy = null;                   // the main process's status (sync.js status())
let syFound = [];                  // the folders already synced on this computer: [{ id, name, path }]
let syRenaming = false, syDraft = null;     // renaming this computer, and what's typed so far (a redraw keeps it)
const syOn = () => !!(sy && sy.on);
const SY_FOLDER_ICON = { icloud: 'cloud', dropbox: 'dropbox', onedrive: 'cloud', gdrive: 'cloud', nextcloud: 'cloud' };
// What a sync changed, in words: "2 channels added", "the theme changed"
const SY_KEY_WORDS = { theme: 'the theme', themes: 'your themes', toolbar: 'the toolbar', keys: 'keyboard shortcuts', mentWords: 'your mention words',
  myName: 'your Kick username', myTwitch: 'your Twitch username', shoutText: 'the shoutout message', streamers: 'your linked streamers' };
const syPlural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
function syDescribe(s){
  if (!s) return [];
  const out = [];
  if (s.added && s.added.length) out.push(syPlural(s.added.length, 'channel') + ' added');
  if (s.removed && s.removed.length) out.push(syPlural(s.removed.length, 'channel') + ' removed');
  if (s.changed && s.changed.length) out.push(syPlural(s.changed.length, 'channel') + ' changed');
  const keys = (s.keys || []), named = keys.filter(k => SY_KEY_WORDS[k]), sounds = keys.filter(k => /^alertSound\./.test(k));
  const rest = keys.length - named.length - sounds.length;
  named.forEach(k => out.push(SY_KEY_WORDS[k] + ' changed'));
  if (sounds.length) out.push(syPlural(sounds.length, 'alert sound') + ' changed');
  if (rest) out.push(syPlural(rest, 'setting') + ' changed');
  return out;
}

// "Just now", "3 min ago", "Yesterday", "2 days ago"; long: "2 minutes ago"
function syAgo(at, long = false){
  const now = (sy && sy.now) || Date.now(), s = Math.max(0, (now - at) / 1000);
  if (!at) return 'Not yet';
  if (s < 60) return 'Just now';
  if (s < 3600) return long ? syPlural(Math.floor(s / 60), 'minute') + ' ago' : Math.floor(s / 60) + ' min ago';
  if (s < 86400 && new Date(at).getDate() === new Date(now).getDate()) return syPlural(Math.floor(s / 3600), 'hour') + ' ago';
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 1 ? 'Yesterday' : days + ' days ago';
}
// "today at 14:02", "yesterday at 22:40", "on 3 Nov at 09:15"
function syWhen(at){
  const now = (sy && sy.now) || Date.now(), t = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400000);
  return (days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'on ' + new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) + ' at ' + t;
}
const syCap = t => t.charAt(0).toUpperCase() + t.slice(1);
const syTilde = p => (sy && sy.home && p && (p === sy.home || p.startsWith(sy.home + '/') || p.startsWith(sy.home + '\\'))) ? '~' + p.slice(sy.home.length) : p || '';
// The sync app a folder belongs to ("Dropbox"), from the folders found here
const syAppOf = folder => { const f = syFound.find(x => folder && (folder === x.path || folder.startsWith(x.path + '/') || folder.startsWith(x.path + '\\'))); return f ? f.name : ''; };

// The values this computer syncs, as the page stores them (the main process can't read them)
function syValues(){
  const out = {};
  for (const k of [...settings.synced(), ...ALERT_KINDS.map(SOUND_KEY)]) out[k] = settings.get(k);
  return out;
}
// What another computer changed (or Undo put back)
function syPull({ values: v = {}, versions = {}, from = '', summary = null, undo = false }){
  for (const [k, text] of Object.entries(v)){
    if (!settings.syncs(k)) continue;
    const t = settings.upgrade(k, versions[k] || 1, text);
    if (t !== undefined) settings.applySynced(k, t);
  }
  if (undo) flash('The last sync is undone, here and on your other computers');
  else if (from){
    const what = syDescribe(summary);
    flashUndo(`Synced from ${from}`, what.join(' · '), () => syUndo(), { subject: 'sync', ok: () => !!(sy && sy.undo), name: from });
  }
  syRefresh();
}
const syRefresh = async () => { if (window.kmv.syncStatus){ sy = await window.kmv.syncStatus(); syRender(); } };
async function syUndo(){ sy = await window.kmv.syncUndo(); syRender(); }

/* ---- drawing ---- */
function syComputerRow(c){
  const sub = [c.os, c.app && 'v' + c.app].filter(Boolean).join(' · ') + (c.older ? ' · a few settings reach it once it updates' : c.newer ? ' · writes a newer sync file: update Multiview here to sync with it' : '');
  const ic = element('span', 'sy-ic'); ic.innerHTML = icon[c.os === 'Windows' ? 'desktop' : 'laptop'];
  if (c.me && syRenaming){
    const first = syDraft === null;
    const input = element('input', { value: first ? sy.name : syDraft, maxlength: 40, spellcheck: false, autocomplete: 'off', 'aria-label': "This computer's name",
      oninput: () => { syDraft = input.value; } });
    const save = async () => { syRenaming = false; syDraft = null; sy = await window.kmv.syncRename(input.value); syRender(); };
    const cancel = () => { syRenaming = false; syDraft = null; syRender(); };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ e.preventDefault(); save(); }
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cancel(); }
    });
    const row = element('div', 'sy-cr me', ic, element('span', 'sy-t', element('span', 'sy-edit', input,
      element('button', { type: 'button', class: 'btn primary', dataset: { cmd: 'sync.renameSave' }, onclick: save }, 'Save'),
      element('button', { type: 'button', class: 'btn', dataset: { cmd: 'sync.renameCancel' }, onclick: cancel }, 'Cancel')),
      element('small', 'sy-hint', 'Enter saves, Esc cancels. Your other computers see it the next time they sync.')));
    if (first) syDraft = sy.name;
    requestAnimationFrame(() => { input.focus(); if (first) input.select(); });
    return row;
  }
  const btn = (cls, ico, title, cmd, onclick) => { const b = element('button', { type: 'button', class: 'sy-btn ' + cls, title, 'aria-label': title, dataset: { cmd }, onclick }); b.innerHTML = icon[ico]; return b; };
  return element('div', { class: 'sy-cr' + (c.me ? ' me' : '') + (c.newer ? ' newer' : ''), dataset: { device: c.device } }, ic,
    element('span', 'sy-t', c.name, c.me ? element('span', 'sy-tag me', 'This computer') : c.older ? element('span', 'sy-tag wait', 'Older version') : c.newer ? element('span', 'sy-tag wait', 'Newer version') : '', element('small', null, sub)),
    c.newer ? element('button', { type: 'button', class: 'btn', dataset: { cmd: 'sync.updates' }, onclick: () => openSettings('updates') }, 'Check for updates') : element('span', 'sy-when', syAgo(c.at)),
    c.me ? btn('sy-pen', 'pencil', 'Rename this computer', 'sync.rename', () => { syRenaming = true; syRender(); })
      : btn('sy-x', 'close', `Forget ${c.name}`, 'sync.forget.' + c.device, () => syForget(c)));
}
function syFolderRow(f, first){
  const ic = element('span', 'sy-ic'); ic.innerHTML = icon[SY_FOLDER_ICON[f.id] || 'syncFolder'];
  return element('div', 'st-row sy-opt', ic, element('span', 'st-t', f.name, element('small', 'sy-mono', syTilde(f.path))),
    element('button', { type: 'button', class: 'btn' + (first ? ' primary' : ''), onclick: () => syStart(f.path) }, 'Use this'));
}
function syRender(){
  const pane = settingsDlg && settingsDlg.querySelector('.st-pane[data-s="sync"]');
  if (!pane || !sy) return;
  const on = syOn(), bad = on && sy.error === 'missing', card = $('#syncCard');
  card.querySelector('.sy-title').textContent = on ? 'Syncing through a folder' : 'Turn on sync';
  const app = on ? syAppOf(sy.folder) : '';
  // a sync app's folder by its name (the whole path on hover); another folder by its path
  const sum = card.querySelector('.sy-sum');
  sum.textContent = !on ? 'Each computer writes its own file to a place all your computers can reach. Nothing goes to us.' : app ? `${app} › Stream Multiview Sync` : '';
  sum.title = on ? syTilde(sy.dir) : '';
  card.querySelector('.sy-path').textContent = card.querySelector('.sy-path').title = on && !app ? syTilde(sy.dir) : '';
  const chip = card.querySelector('.ca-chip');
  chip.textContent = !on ? 'Off' : bad ? 'Folder not found' : 'Syncing';
  chip.className = 'ca-chip' + (!on ? '' : bad ? ' bad' : ' ok');
  card.querySelector('.sy-pick').hidden = on;
  $('#syncFoundHead').hidden = !syFound.length;
  const fk = JSON.stringify(syFound);              // (only when they change: a row mustn't go while it's being clicked)
  if ($('#syncFound').dataset.k !== fk){ $('#syncFound').dataset.k = fk; $('#syncFound').replaceChildren(...syFound.map((f, i) => syFolderRow(f, i === 0))); }
  const nameIn = $('#syncNameIn'); if (document.activeElement !== nameIn) nameIn.value = sy.name;
  const foot = card.querySelector('.sy-foot');
  foot.hidden = !on;
  foot.className = 'ca-foot sy-foot ' + (bad ? 'bad' : 'ok');
  const others = (sy.computers || []).length;
  foot.querySelector('.ca-line b').textContent = bad ? "Can't reach the folder" : 'Up to date';
  foot.querySelector('.ca-sub').textContent = bad
    ? `${app ? `Is ${app} running? ` : ''}Your changes wait here and sync once it's back.${sy.lastSync ? ` Last synced ${syWhen(sy.lastSync)}.` : ''}`
    : [`Last synced ${sy.lastSync ? syAgo(sy.lastSync, true).toLowerCase() : 'not yet'}`, syPlural(sy.channels, 'channel'), syPlural(others, 'computer')].join(' · ');
  $('#syncNow').hidden = bad; $('#syncRetry').hidden = !bad;
  pane.querySelectorAll('.sy-on').forEach(e => { e.hidden = !on; });
  $('#syncComputers').replaceChildren(...(on ? sy.computers.map(syComputerRow) : []));
  $('#syncChannels').checked = sy.what.channels; $('#syncSettings').checked = sy.what.settings; $('#syncSounds').checked = sy.what.sounds;
  const sounds = ALERT_KINDS.map(k => settings.get(SOUND_KEY(k))).filter(Boolean);
  const mb = sounds.reduce((n, s) => n + s.length * 0.75, 0) / 1048576;
  $('#syncSoundsSub').textContent = sounds.length ? `${syPlural(sounds.length, 'sound')}, ${mb < 0.1 ? '<0.1' : mb.toFixed(1)} MB.` : 'None added yet.';
  const u = sy.undo, row = $('#syncUndoRow');
  row.hidden = !on || !u;
  if (u) row.querySelector('small').textContent = `${syCap(syWhen(u.at))}${u.from ? `, from ${u.from}` : ''}: ${syDescribe(u.summary).join(', ') || 'nothing that shows'}.`;
}

/* ---- what the buttons do ---- */
async function syRename(name){ if (name.trim() && name.trim() !== sy.name){ sy = await window.kmv.syncRename(name); syRender(); } }
// Turns sync on with a folder: asks first when another computer's file is already there
async function syStart(folder){
  if (!folder) return;
  await syRename($('#syncNameIn').value);
  const peek = await window.kmv.syncPeek(folder);
  let mode = 'combine';
  if (peek.ok && peek.others.length){
    const [o] = peek.others, more = peek.others.length - 1, one = !more;
    mode = await ask(one ? "This folder already has another computer's settings" : "This folder already has other computers' settings",
      [element('b', null, o.name || 'A computer'), ` synced here ${syAgo(o.at).toLowerCase()}: ${syPlural(o.channels, 'saved channel')} and its settings${more ? `, and ${syPlural(more, 'other computer')} with theirs` : ''}. This computer has ${syPlural(peek.channels, 'channel')}.`],
      { ok: 'Start syncing', note: "A backup of this computer's channels and settings is kept either way.", choices: [
        { v: 'combine', t: 'Combine them', tag: 'RECOMMENDED', sub: `Channels from ${one ? 'both computers' : 'every computer'}. Where a setting differs, the one changed most recently wins.` },
        { v: 'theirs', t: one ? `Use ${o.name || 'that computer'}'s` : 'Use theirs', sub: one ? 'This computer takes its channels and settings.' : 'This computer takes their channels and settings.' },
        { v: 'mine', t: "Use this computer's", sub: 'The other computers take yours the next time they sync.' }] });
    if (!mode) return;
  }
  const r = await window.kmv.syncStart(folder, mode);
  if (!r.ok){ flash("That folder can't be reached"); return; }
  sy = r; syRender();
}
async function syPickFolder(){ const f = await window.kmv.syncPick(); if (f) await syStart(f); }
async function syForget(c){
  if (!await ask(`Forget ${c.name}?`, "Its file goes from the sync folder. If it's still in use, it comes back the next time it syncs.", { ok: 'Forget' })) return;
  sy = await window.kmv.syncForget(c.device); syRender();
}
async function syStop(){
  if (!await ask('Stop syncing?', 'This computer keeps its channels and settings as they are. The other computers keep syncing.', { ok: 'Stop syncing' })) return;
  sy = await window.kmv.syncStop(); syRender();
}
async function sySetWhat(k, on){ sy = await window.kmv.syncWhat({ [k]: on }); syRender(); }
// Opening the page (settings.js): the folders here, the status, and the rail's "New" goes
async function renderSyncPane(){
  if (!settings.flag('syncSeen')){ settings.set('syncSeen', true); settingsDlg.querySelector('.st-rail [data-s="sync"] .st-new').hidden = true; }
  syFound = await window.kmv.syncFolders();
  await syRefresh();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  if (!window.kmv || !window.kmv.syncHello) return;           // the desktop app (or the UI tests' stand-in for it)
  settings.afterSet((name, text) => window.kmv.syncChanged(name, text));     // (both windows: the main process keeps one record)
  if (ROLE !== 'main') return;
  settingsDlg.querySelector('.st-rail [data-s="sync"] .st-new').hidden = settings.flag('syncSeen');
  fromApp('onSyncPull', syPull);
  fromApp('onSyncStatus', s => { sy = s; syRender(); });
  window.kmv.syncHello({ values: syValues(), versions: settings.versions() }).then(s => { sy = s; syRender(); });
  $('#syncChoose').onclick = syPickFolder;
  $('#syncChange').onclick = syPickFolder;
  $('#syncNow').onclick = async () => { sy = await window.kmv.syncNow(); syRender(); flash(sy.error ? "Can't reach the folder" : 'Synced'); };
  $('#syncRetry').onclick = async () => { sy = await window.kmv.syncNow(); syRender(); };
  $('#syncUndo').onclick = syUndo;
  $('#syncStop').onclick = syStop;
  const nameIn = $('#syncNameIn');
  nameIn.addEventListener('change', () => syRename(nameIn.value));
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); nameIn.blur(); } });
  [['#syncChannels', 'channels'], ['#syncSettings', 'settings'], ['#syncSounds', 'sounds']].forEach(([sel, k]) => $(sel).addEventListener('change', e => sySetWhat(k, e.target.checked)));
  $('#syncStaysBtn').onclick = e => { e.preventDefault(); const p = $('#syncStays'); p.hidden = !p.hidden; e.target.setAttribute('aria-expanded', !p.hidden); };
  commands.add([
    { id: 'sync.now', kind: 'setting', group: 'Settings', title: 'Sync now', sub: 'Settings › Sync', words: ['sync'], icon: 'syncFolder', button: '#syncNow' },
    { id: 'sync.retry', kind: 'setting', group: 'Settings', title: 'Sync: try the folder again', sub: 'Settings › Sync', words: ['sync'], icon: 'syncFolder', button: '#syncRetry' },
    { id: 'sync.change', kind: 'setting', group: 'Settings', title: 'Sync: change the folder', sub: 'Settings › Sync', words: ['sync'], icon: 'syncFolder', button: '#syncChange' },
    { id: 'sync.stop', kind: 'setting', group: 'Settings', title: 'Stop syncing', sub: 'Settings › Sync: this computer keeps its channels and settings as they are', words: ['sync'], icon: 'syncFolder', button: '#syncStop' },
    { id: 'sync.stays', kind: 'setting', group: 'Settings', title: 'Sync: what stays on each computer', sub: 'Settings › Sync', words: ['sync'], icon: 'syncFolder', button: '#syncStaysBtn' },
    { id: 'sync.rename', kind: 'setting', group: 'Settings', title: 'Rename this computer', sub: 'Settings › Sync: how your other computers list it', words: ['sync', 'computer name'], icon: 'pencil',
      syWhen: () => syOn(), run: () => { syRenaming = true; openSettings('sync'); } },
    { id: 'sync.updates', kind: 'setting', group: 'Settings', title: 'Sync: check for updates', sub: 'Another computer writes a newer sync file', words: ['sync'], icon: 'update',
      syWhen: () => syOn() && sy.computers.some(c => c.newer), run: () => openSettings('updates') }
  ]);
  commands.provide('sync', () => !syOn() ? [] : sy.computers.filter(c => !c.me).map(c => ({ id: 'sync.forget.' + c.device, kind: 'setting', group: 'Settings',
    title: `Forget ${c.name}`, sub: 'Settings › Sync: its file goes from the sync folder', words: ['sync', 'computer'], icon: 'close', run: () => syForget(c) })));
  window.smvSync = { describe: syDescribe, ago: syAgo, when: syWhen, get status(){ return sy; },   // for the tests
    unheard: () => [...settings.synced(), ...ALERT_KINDS.map(SOUND_KEY)].filter(k => !settings.listening(k)) };
}

export { init, renderSyncPane };
