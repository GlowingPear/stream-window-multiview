import { ALERT_KINDS, SOUND_KEY } from '../../alerts/alerts.js';
import { $, ROLE } from '../../core.js';
import { openSettings, settingsDlg } from './settings.js';
import { chLabel, platIcon, platOf } from '../../platforms/platforms.js';
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
let syHist = { kind: 'all', device: '' };      // History's filters: what changed, and which computer it came from
let syRenaming = false, syDraft = null;     // renaming this computer, and what's typed so far (a redraw keeps it)
const syOn = () => !!(sy && sy.on);
const SY_FOLDER_ICON = { icloud: 'cloud', dropbox: 'dropbox', onedrive: 'cloud', gdrive: 'cloud', nextcloud: 'cloud' };
// What a sync changed, in words: "2 channels added", "the theme changed"
const SY_KEY_WORDS = { theme: 'the theme', themes: 'your themes', toolbar: 'the toolbar', keys: 'keyboard shortcuts', mentWords: 'your mention words',
  myName: 'your Kick username', myTwitch: 'your Twitch username', myYouTube: 'your YouTube handle', shoutText: 'the shoutout message', streamers: 'your linked streamers' };
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

// Each synced setting as History names it (a test checks every synced key has one)
const SY_LABEL = { theme: 'Theme', themes: 'Your themes', keys: 'Keyboard shortcuts', arrowSound: 'Sound follows the arrow keys',
  barNameStream: "Streams' title bars", barNameChat: "Chats' title bars", barButtons: 'Title bar buttons', toolbar: 'Toolbar',
  paletteOn: 'Search box', paletteRecent: 'Search box history', notifyAll: 'Live alerts for every channel', chanOpts: 'Channel settings',
  linkedOn: 'Linked channels', streamers: 'Linked streamers', linkedNot: 'Not the same streamer', linkedOpts: 'Linked channels options',
  allBots: "ALL: chat bots", allEvents: 'ALL: events', allSend: 'ALL: sending', allTimeout: 'ALL: timeouts', allHype: 'ALL: hype train', allHidden: 'ALL: hidden sites',
  mentOn: 'Mentions', mentMuted: 'Muted mentions', mentWords: 'Mention words', myName: 'Kick username', myTwitch: 'Twitch username', myYouTube: 'YouTube handle',
  dndFor: 'Do not disturb', desktopNotify: 'Desktop notifications', alerts: 'Alerts',
  autoTranslate: 'Translate chat', noTranslate: "Languages not translated", translateAll: 'Translate every message', emotePreview: 'Emote previews', newEmotes: 'New emotes', bigEmoteMenu: 'Big emote in menus',
  chatName: 'Name in chat', chatNameText: 'Name in chat text', chatOverlay: 'Chat overlay', chatOverlayOff: 'Chat overlay off for', chatOverlayKeep: 'Chat overlay stays',
  chatOverlaySecs: 'Chat overlay time', chatOverlayLines: 'Chat overlay lines', chatCounts: 'Chat counts',
  shoutOn: 'Shoutouts', shoutModOnly: 'Shoutouts: only as a mod', shoutSend: 'Shoutouts: sending', shoutText: 'Shoutout message', shoutChannels: 'Shoutout cards',
  shoutTwitch: "Twitch's shoutouts", shoutAgain: 'Shoutouts: asking again', shoutRunN: 'Shoutouts: run size', shoutStreamers: 'Shoutouts: streamers only', shoutListFirst: 'Shoutouts: list first',
  ytSkip: 'YouTube: skip ads', ytAutoLike: 'YouTube: auto-like', ytChatView: 'YouTube: chat view', startMuted: 'Start muted', autoPause: 'Auto-pause', snap: 'Snap windows',
  quality: 'Stream quality', qualityFit: 'Fits the window\'s range', qualityHidden: 'Hidden streams\' quality' };
const syLabel = k => SY_LABEL[k] || (/^alertSound\./.test(k) ? syCap(k.slice(11)) + ' sound' : '');

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
// "02:08" (today), else "yesterday at 22:40"
const syClock = at => { const w = syWhen(at); return w.startsWith('today at ') ? w.slice(9) : w; };
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
  const sub = [c.os, c.app && 'v' + c.app].filter(Boolean).join(' · ') + (c.newer ? ' · writes a newer sync file: update Multiview here to sync with it'
    : c.behind ? ` · hasn't got this computer's changes from ${syClock(c.behind)} yet` : c.older ? ' · a few settings reach it once it updates' : '');
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
    element('span', 'sy-t', c.name, c.me ? element('span', 'sy-tag me', 'This computer') : c.newer ? element('span', 'sy-tag wait', 'Newer version') : c.behind ? element('span', 'sy-tag wait', 'Waiting') : c.older ? element('span', 'sy-tag wait', 'Older version') : '', element('small', null, sub)),
    c.newer ? element('button', { type: 'button', class: 'btn', dataset: { cmd: 'sync.updates' }, onclick: () => openSettings('updates') }, 'Check for updates') : element('span', 'sy-when', syAgo(c.at)),
    c.me ? btn('sy-pen', 'pencil', 'Rename this computer', 'sync.rename', () => { syRenaming = true; syRender(); })
      : btn('sy-x', 'close', `Forget ${c.name}`, 'sync.forget.' + c.device, () => syForget(c)));
}
function syFolderRow(f, first){
  const ic = element('span', 'sy-ic'); ic.innerHTML = icon[SY_FOLDER_ICON[f.id] || 'syncFolder'];
  return element('div', 'st-row sy-opt', ic, element('span', 'st-t', f.name, element('small', 'sy-mono', syTilde(f.path))),
    element('button', { type: 'button', class: 'btn' + (first ? ' primary' : ''), onclick: () => syStart(f.path) }, 'Use this'));
}
/* ---- History: what each sync changed here, newest first, by day ---- */
const SY_MODE = { combine: 'Combined with the other computers', theirs: "Took the other computers' channels and settings", mine: "Kept this computer's channels and settings" };
const SY_CHIPS = 12;                  // a sync's changes shown; the rest are "+N more" (all of them on hover)
// One change: a channel added, removed or changed, or a setting or sound
function syChip(kind, text, ch){
  const c = element('span', 'sy-chip ' + kind);
  if (ch) c.insertAdjacentHTML('beforeend', platIcon(platOf(ch)));
  c.append(element('span', null, text));
  return c;
}
// A sync's changes as chips, only the kind the filter shows
function syChips(sum, kind){
  const out = [], s = sum || {}, keys = s.keys || [];
  if (kind === 'all' || kind === 'channels'){
    (s.added || []).forEach(ch => out.push(syChip('add', chLabel(ch), ch)));
    (s.removed || []).forEach(ch => out.push(syChip('rem', chLabel(ch), ch)));
    (s.changed || []).forEach(ch => out.push(syChip('chg', chLabel(ch), ch)));
  }
  keys.filter(k => /^alertSound\./.test(k) ? kind === 'all' || kind === 'sounds' : kind === 'all' || kind === 'settings')
    .forEach(k => out.push(syChip(/^alertSound\./.test(k) ? 'snd' : 'set', syLabel(k) || 'A setting')));
  if (out.length <= SY_CHIPS) return out;
  const rest = out.splice(SY_CHIPS - 1);
  return [...out, element('span', { class: 'sy-chip more', title: rest.map(c => c.textContent).join(', ') }, `+${rest.length} more`)];
}
// How many of a sync's changes the filter shows
function syCount(sum, kind){
  const s = sum || {}, keys = s.keys || [], snd = keys.filter(k => /^alertSound\./.test(k)).length;
  const ch = (s.added || []).length + (s.removed || []).length + (s.changed || []).length;
  return kind === 'channels' ? ch : kind === 'settings' ? keys.length - snd : kind === 'sounds' ? snd : ch + keys.length;
}
const syDay = at => { const w = syWhen(at); return w.startsWith('today') ? 'Today' : w.startsWith('yesterday') ? 'Yesterday'
  : new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
const syTime = at => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
// What History lists with its filters: [{ e, chips }]
function syHistShown(){
  const all = (sy && sy.history) || [], { kind, device } = syHist;
  return all.map(e => ({ e, chips: e.kind === 'pull' || e.kind === 'undo' ? syChips(e.summary, kind) : [] }))
    .filter(({ e, chips }) => (!device || e.device === device) && (e.kind === 'pull' || e.kind === 'undo' ? kind === 'all' || chips.length : kind === 'all' && !device));
}
function syEvent({ e, chips }){
  const ic = element('span', 'sy-ev-ic'), canUndo = e.kind === 'pull' && sy.undo && sy.undo.at === e.at;
  ic.innerHTML = icon[e.kind === 'undo' ? 'undo' : e.kind === 'start' ? 'syncFolder' : e.kind === 'stop' ? 'pause' : e.os === 'Windows' ? 'desktop' : 'laptop'];
  const n = syCount(e.summary, syHist.kind);
  const head = e.kind === 'pull' ? [element('b', null, e.from || 'A computer'), element('span', 'sy-ev-sub', n ? syPlural(n, 'change') : 'nothing that shows')]
    : e.kind === 'undo' ? [element('b', null, 'Undone'), element('span', 'sy-ev-sub', `what ${e.from || 'a computer'} changed`)]
    : e.kind === 'start' ? [element('b', null, 'Started syncing'), element('span', 'sy-ev-sub', [syAppOf(e.folder) || syTilde(e.folder), SY_MODE[e.mode]].filter(Boolean).join(' · '))]
    : [element('b', null, 'Stopped syncing')];
  return element('div', { class: `sy-ev k-${e.kind}` + (e.undone ? ' undone' : ''), role: 'listitem' }, ic,
    element('div', 'sy-ev-b',
      element('div', 'sy-ev-h', ...head, e.undone ? element('span', 'sy-tag wait', 'Undone') : '', element('time', 'sy-ev-at', syTime(e.at)),
        canUndo ? element('button', { type: 'button', class: 'btn', id: 'syncUndo', dataset: { cmd: 'sync.undo' }, title: 'Put back what this sync changed, here and on your other computers', onclick: syUndo }, 'Undo') : ''),
      chips.length ? element('div', 'sy-chips', ...chips) : ''));
}
let syHistKey = '';
function syRenderHistory(){
  const hist = (sy && sy.history) || [];
  // the computers it came from (each by its latest name), for the From filter when there's more than one
  const froms = [];
  for (const e of hist) if (e.device && !froms.some(f => f.device === e.device)) froms.push({ device: e.device, name: e.from || 'A computer' });
  if (syHist.device && !froms.some(f => f.device === syHist.device)) syHist.device = '';
  const key = JSON.stringify([hist, syHist, sy.undo && sy.undo.at, syDay(Date.now()), froms]);
  if (key === syHistKey) return;                 // (a status every minute: only redrawn when something changed)
  syHistKey = key;
  $('#syncKinds').querySelectorAll('button').forEach(b => { const on = b.dataset.v === syHist.kind; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const fromBtn = (device, name) => element('button', { type: 'button', role: 'radio', class: syHist.device === device ? 'on' : '', 'aria-checked': syHist.device === device,
    dataset: { v: device, cmd: 'sync.history.from.' + (device || 'any') }, onclick: () => { syHist.device = device; syRenderHistory(); } }, name);
  $('#syncFroms').hidden = froms.length < 2;
  $('#syncFroms').replaceChildren(...(froms.length < 2 ? [] : [fromBtn('', 'Any computer'), ...froms.map(f => fromBtn(f.device, f.name))]));
  const shown = syHistShown(), syncs = shown.filter(x => x.e.kind === 'pull').length;
  $('#syncHistCount').textContent = hist.length ? syPlural(syncs, 'sync') : '';
  $('#syncFilters').hidden = !hist.length;
  const list = $('#syncHistory'), out = [];
  if (!shown.length){
    const ic = element('span', 'sy-empty-ic'); ic.innerHTML = icon[hist.length ? 'search' : 'clock'];
    out.push(element('div', 'sy-empty', ic, element('b', null, hist.length ? 'Nothing here with these filters' : 'Nothing has synced yet'),
      element('span', null, hist.length ? 'Try Everything, or Any computer.' : 'What your other computers change shows here as it arrives, with Undo for the latest.')));
  }
  let day = '';
  for (const x of shown){
    const d = syDay(x.e.at);
    if (d !== day){ day = d; out.push(element('div', 'sy-day', d)); }
    out.push(syEvent(x));
  }
  list.replaceChildren(...out);
}
const syTab = t => {
  const pane = settingsDlg.querySelector('.st-pane[data-s="sync"]');
  pane.querySelectorAll('#syncTabs button').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  pane.querySelectorAll(':scope > .st-subpane').forEach(p => { p.hidden = p.dataset.t !== t; });
};

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
  // none of the other computers has this computer's latest change (a sync app that stopped carrying its file)
  const behind = on && !bad && sy.behind, rest = (sy.computers || []).filter(c => !c.me && !c.newer);
  foot.className = 'ca-foot sy-foot ' + (bad ? 'bad' : behind ? 'wait' : 'ok');
  const others = (sy.computers || []).length;
  foot.querySelector('.ca-line b').textContent = bad ? "Can't reach the folder" : behind ? 'Waiting for your other computers' : 'Up to date';
  foot.querySelector('.ca-sub').textContent = bad
    ? `${app ? `Is ${app} running? ` : ''}Your changes wait here and sync once it's back.${sy.lastSync ? ` Last synced ${syWhen(sy.lastSync)}.` : ''}`
    : behind ? `${rest.length === 1 ? `${rest[0].name} hasn't` : "They haven't"} got this computer's changes from ${syClock(sy.behind)}. If ${rest.length === 1 ? "it's" : "they're"} on, check ${app || 'your sync app'} is syncing here (restarting it can help).`
    : [`Last synced ${sy.lastSync ? syAgo(sy.lastSync, true).toLowerCase() : 'not yet'}`, syPlural(sy.channels, 'channel'), syPlural(others, 'computer')].join(' · ');
  $('#syncNow').hidden = bad; $('#syncRetry').hidden = !bad;
  pane.querySelectorAll('.sy-on').forEach(e => { e.hidden = !on; });
  $('#syncComputers').replaceChildren(...(on ? sy.computers.map(syComputerRow) : []));
  $('#syncChannels').checked = sy.what.channels; $('#syncSettings').checked = sy.what.settings; $('#syncSounds').checked = sy.what.sounds;
  const sounds = ALERT_KINDS.map(k => settings.get(SOUND_KEY(k))).filter(Boolean);
  const mb = sounds.reduce((n, s) => n + s.length * 0.75, 0) / 1048576;
  $('#syncSoundsSub').textContent = sounds.length ? `${syPlural(sounds.length, 'sound')}, ${mb < 0.1 ? '<0.1' : mb.toFixed(1)} MB.` : 'None added yet.';
  if (!on) syTab('overview');                    // (History is a tab only while syncing)
  syRenderHistory();
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
  $('#syncTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) syTab(b.dataset.t); });
  $('#syncKinds').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b){ syHist.kind = b.dataset.v; syRenderHistory(); } });
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
      when: () => syOn(), run: () => { syRenaming = true; openSettings('sync'); } },
    { id: 'sync.undo', kind: 'setting', group: 'Settings', title: 'Undo the last sync', sub: 'Settings › Sync › History: here and on your other computers', words: ['sync', 'undo'], icon: 'undo',
      when: () => syOn() && !!sy.undo, run: syUndo },
    { id: 'sync.updates', kind: 'setting', group: 'Settings', title: 'Sync: check for updates', sub: 'Another computer writes a newer sync file', words: ['sync'], icon: 'update',
      when: () => syOn() && sy.computers.some(c => c.newer), run: () => openSettings('updates') },
    ...[['all', 'Everything'], ['channels', 'Channels'], ['settings', 'Settings'], ['sounds', 'Sounds']].map(([v, t]) => ({ id: 'sync.history.' + v, kind: 'setting', group: 'Settings',
      title: `Sync history: ${v === 'all' ? 'everything' : t.toLowerCase()}`, sub: 'Settings › Sync › History', words: ['sync', 'history'], icon: 'clock',
      button: `#syncKinds [data-v="${v}"]`, run: () => { syHist.kind = v; openSettings('sync', { sub: 'history' }); syRenderHistory(); } }))
  ]);
  commands.provide('sync', () => !syOn() ? [] : sy.computers.filter(c => !c.me).map(c => ({ id: 'sync.forget.' + c.device, kind: 'setting', group: 'Settings',
    title: `Forget ${c.name}`, sub: 'Settings › Sync: its file goes from the sync folder', words: ['sync', 'computer'], icon: 'close', run: () => syForget(c) })));
  // History's From filter: one for each computer a sync came from
  commands.provide('syncFrom', () => {
    if (!syOn()) return [];
    const froms = [];
    for (const e of sy.history || []) if (e.device && !froms.some(f => f.device === e.device)) froms.push({ device: e.device, name: e.from || 'A computer' });
    return froms.length < 2 ? [] : [{ device: '', name: 'any computer' }, ...froms].map(f => ({ id: 'sync.history.from.' + (f.device || 'any'), kind: 'setting', group: 'Settings',
      title: `Sync history from ${f.name}`, sub: 'Settings › Sync › History', words: ['sync', 'history'], icon: 'clock',
      run: () => { syHist.device = f.device; openSettings('sync', { sub: 'history' }); syRenderHistory(); } }));
  });
  window.smvSync = { describe: syDescribe, ago: syAgo, when: syWhen, get status(){ return sy; },   // for the tests
    // synced keys History has no name for (the channel lists show as their channels)
    unnamed: () => [...settings.synced(), ...ALERT_KINDS.map(SOUND_KEY)].filter(k => !['saved', 'autoOpen', 'notifyOff', 'chNames'].includes(k) && !syLabel(k)),
    unheard: () => [...settings.synced(), ...ALERT_KINDS.map(SOUND_KEY)].filter(k => !settings.listening(k)) };
}

export { init, renderSyncPane };
