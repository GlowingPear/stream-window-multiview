import { alerts } from '../../alerts/alerts.js';
import { allOn } from '../../chat/all-chat.js';
import { renderEvents } from '../../chat/event-samples.js';
import { trAll } from '../../chat/translate.js';
import { $, ROLE, colsMode, lastLayout, wins } from '../../core.js';
import { featBase, featuredCh } from '../../layout/layouts.js';
import { mentMuted, mentOn } from '../bell/bell.js';
import { infoFor } from '../channels/channels.js';
import { openSettings } from '../settings/settings.js';
import { kickAuto, kickOut, linkConnected } from '../../platforms/pear-drops.js';
import { PLAT_NAME, chLabel, platOf, streamSignedIn } from '../../platforms/platforms.js';
import { ask } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { fromApp, fromSite } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { tabChannels } from '../../windows/frames.js';
import { pauseWhy } from '../../windows/pause-state.js';
import { askIn, viewId, zoomOf } from '../../windows/view.js';

/* ---- Settings › Developer: the Developer tools switch, Copy diagnostics, the error log and the sites' last answers
   (src/main/devlog.js keeps them), and each window's Copy window state and Inspect. With the switch on, the chats'
   right-click menu gets a Developer group (src/main/context-menu.js) and the windows' ⋯ menu gets its own items.
   Errors on this page and in the app's scripts inside the chats go to the error log whether the switch is on or not. */
var devOn = false;
const dev = { tab: 'errors', data: null, problems: false };   // problems: Requests shows only the ones that went wrong
const devTab = () => dev.tab;                  // (Chat events draws its own tab: chat/event-samples.js)
// a site's answer that went wrong: no answer, or not a 2xx
const badAnswer = r => !(r.status >= 200 && r.status < 300);
const DV_WHEN = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const DV_SITE = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };
const tick = on => (on ? '✓' : '–');
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

function setDev(on){
  devOn = !!on;
  settings.set('dev', devOn);
  if (window.kmv && window.kmv.devSet) window.kmv.devSet(devOn);
  const sw = $('#devOn'); if (sw) sw.checked = devOn;
  store.changed('dev');
}
// Turning it on the first time says what Inspect can see.
async function toggleDev(on){
  if (on && !settings.flag('devWarned')){
    const ok = await ask('Turn on Developer tools?', 'Inspect opens Chrome\'s developer tools for a stream or chat. Anyone using them can read that page\'s data, including your login to that site. Use them yourself, and don\'t share what they show.', { ok: 'Turn on' });
    if (!ok){ $('#devOn').checked = false; return; }
    settings.set('devWarned', true);
  }
  setDev(on);
  flash(devOn ? 'Developer tools on' : 'Developer tools off');
}

// An error on this page (or in a chat's helpers) for the error log.
function devError(src, where, msg){
  if (DESKTOP && window.kmv.devLog) try { window.kmv.devLog(src, where, msg); } catch {}
}
const fileOf = f => String(f || '').split(/[?#]/)[0].split('/').slice(-2).join('/');

/* ---- the pane ---- */
async function renderDev(){
  const pane = $('#settingsDlg .st-pane[data-s="developer"]');
  if (!pane || pane.hidden || !DESKTOP || !window.kmv.devInfo) return;
  const d = dev.data = await window.kmv.devInfo().catch(() => null) || { errors: [], responses: [] };
  const tabs = pane.querySelectorAll('#devTabs button');
  tabs.forEach(b => {
    const on = b.dataset.t === dev.tab;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    if (b.dataset.t === 'events') return;
    const n = (b.dataset.t === 'errors' ? d.errors : d.responses).length;
    b.querySelector('.dv-n').textContent = n ? `(${n})` : '';
  });
  const list = $('#devList');
  pane.querySelector('.dv-keep').hidden = dev.tab === 'events';   // (Chat events has its own Clear)
  list.classList.toggle('dv-events', dev.tab === 'events');
  if (dev.tab === 'events') return renderEvents();
  list.replaceChildren();
  if (dev.tab === 'errors'){
    if (!d.errors.length) list.append(element('div', 'dv-empty', 'No errors. They show here as they happen.'));
    for (const e of d.errors.slice(0, 100)) list.append(element('div', { class: 'dv-row' + (e.before ? ' dv-before' : ''), title: e.before ? 'From the last time the app ran' : '' },
      element('span', 'dv-t', DV_WHEN(e.t)), element('span', 'dv-src dv-' + e.src, e.src.toUpperCase()),
      element('span', 'dv-msg', (e.where ? e.where + ': ' : '') + e.msg), element('span', 'dv-cnt', e.n > 1 ? '×' + e.n : '')));
  } else {
    const bad = d.responses.filter(badAnswer), shown = dev.problems ? bad : d.responses;
    const pick = (only, label) => element('button', { type: 'button', class: 'dv-f' + (dev.problems === only ? ' on' : ''), 'aria-pressed': String(dev.problems === only), dataset: { cmd: only ? 'dev.problems' : 'dev.requests' },
      onclick: () => { dev.problems = only; renderDev(); } }, label);
    list.append(element('div', 'dv-filter', pick(false, `All (${d.responses.length})`), pick(true, `Errors only (${bad.length})`)));
    if (!d.responses.length) list.append(element('div', 'dv-empty', 'Nothing asked yet. Live checks, follows and profiles show here.'));
    else if (!shown.length) list.append(element('div', 'dv-empty', 'No errors: every answer was OK.'));
    for (const r of shown) list.append(element('button', { class: 'dv-row dv-resp', type: 'button', title: 'Click to copy the request and the answer', onclick: () => copyText(exchangeText(r), 'Copied the request and the answer') },
      element('span', 'dv-t', DV_WHEN(r.t)), element('span', 'dv-site dv-' + r.site, DV_SITE[r.site] || r.site),
      element('span', 'dv-msg', `${r.what} · ${r.method} ${r.url}`),
      element('span', 'dv-st ' + (badAnswer(r) ? 'bad' : 'ok'), r.status ? String(r.status) : r.error ? 'failed' : 'no answer'),
      element('span', 'dv-cnt', r.ms + ' ms')));
  }
}
// One request as text: what was asked and what came back (JSON laid out to read; long answers are cut off).
const tidyJson = t => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } };
const exchangeText = r => [
  `${r.method} ${r.url}`,
  `→ ${r.status || (r.error ? 'failed: ' + r.error : 'no answer')} · ${r.ms} ms · ${new Date(r.t).toLocaleString()} · ${DV_SITE[r.site] || r.site} ${r.what}`,
  r.request ? '\nRequest:\n' + tidyJson(r.request) : '',
  r.body != null ? '\nResponse:\n' + tidyJson(r.body) : devOn ? '' : '\n(The answer\'s text is only kept while Developer tools are on.)'
].filter(Boolean).join('\n');
async function copyText(text, said){
  try { await navigator.clipboard.writeText(text); flash(said); } catch { flash('Couldn’t copy it'); }
}

/* ---- Copy diagnostics: the page's part of the report (the main process adds the app, the system and the logs) ---- */
const layoutName = () => (colsMode ? (featBase.length && featuredCh ? 'focus' : 'columns') : lastLayout) || 'free';
function winLine(w){
  const info = w.channel ? infoFor(w.channel) : null;
  const live = !info ? '' : info.live ? 'live' : info.missing ? 'not found' : 'not live';
  const why = w.kind === 'stream' ? pauseWhy(w.pause || {}) : '';
  return '  ' + [w.channel ? (PLAT_NAME[platOf(w.channel)] || platOf(w.channel)).padEnd(8) : w.kind.padEnd(8), (w.channel ? chLabel(w.channel) : w.capName || w.url || '').padEnd(18), w.kind.padEnd(7),
    w.ready ? 'loaded' : w.view ? 'loading' : 'waiting', live, why && 'paused (' + why + ')', w.kind === 'stream' && (w.muted ? 'muted' : Math.round(w.vol * 100) + '%')].filter(Boolean).join('  ');
}
async function pageLines(){
  const n = k => wins.filter(w => w.kind === k).length;
  const acc = DESKTOP && window.kmv.accountsStatus ? await window.kmv.accountsStatus().catch(() => null) : null;
  return [
    'windows   ' + [ROLE === 'main' ? 'main window' : 'streams window', 'layout ' + layoutName(), [plural(n('stream'), 'stream'), plural(n('chat'), 'chat')].join(', ') + (n('capture') ? `, ${n('capture')} captured` : '')].join(' · '),
    ...wins.map(winLine),
    acc ? 'signed in ' + `Kick ${tick(acc.kick)}  Twitch ${tick(acc.twitch)}  YouTube ${tick(acc.youtube)}` : '',
    // the players can be signed out while you're signed in ("Watch signed in" off, or Pear Drops farming): their own storage then
    'players   ' + ['kick', 'twitch', 'youtube'].map(p => `${PLAT_NAME[p]} ${streamSignedIn(p) ? 'signed in' : 'signed out'}${p === 'kick' && kickAuto() && kickOut ? ' (while Pear Drops farms)' : ''}`).join('  '),
    'settings  ' + [`start muted ${tick($('#muted') && $('#muted').checked)}`, `auto-pause ${tick(settings.flag('autoPause'))}`,
      `translate: ${trAll ? 'every chat' : [].concat(settings.json('autoTranslate', [])).length + ' chats'}`,
      `mentions ${mentOn ? 'on' : 'off'}${mentMuted.size ? ` (off in ${mentMuted.size})` : ''}`, `spam alerts ${tick(alerts.spam.on)}`, `support ${tick(alerts.support.on)}`, `keys ${tick(settings.flag('keys', true))}`].join(' · '),
    'pear drops ' + (linkConnected() ? 'connected' : 'not connected'),
    'developer tools ' + (devOn ? 'on' : 'off')
  ].filter(Boolean);
}
async function diagnosticsText(){
  if (!DESKTOP || !window.kmv.devReport) return '';
  return window.kmv.devReport(await pageLines()).catch(() => '');
}
async function copyDiagnostics(){
  const text = await diagnosticsText();
  if (text) copyText(text, 'Copied diagnostics. Paste them in your report');
}
async function saveDiagnostics(){
  const text = await diagnosticsText(); if (!text) return;
  const r = await window.kmv.devSave(text).catch(() => null);
  if (r && r.saved) flash('Saved diagnostics' + (r.file ? ': ' + fileOf(r.file) : ''));
  else if (r && r.error) flash('Couldn’t save them');
}

/* ---- a window's ⋯ menu: Copy window state, Inspect ---- */
async function winState(w){
  const info = w.channel ? infoFor(w.channel) : null, url = w.view && w.view.getURL ? (() => { try { return w.view.getURL(); } catch { return ''; } })() : w.url || '';
  let helpers = '';
  if (w.view && w.ready) try {
    const h = await askIn(w.view, '({ emote: !!window.__kmvEmote, translate: !!window.__kmvTr, message: !!window.__kmvMsg, mentions: !!window.__kmvMention, stick: !!window.__kmvStick, volume: !!window.__kmvVol })');
    helpers = Object.entries(h || {}).map(([k, v]) => `${k} ${tick(v)}`).join('  ');
  } catch { helpers = 'couldn’t ask the page'; }
  const why = { you: 'you paused it', focus: 'Pause all except focus', auto: 'hidden (auto-pause)' }[pauseWhy(w.pause || {})];
  const lines = [
    `${w.channel ? chLabel(w.channel) + ' · ' + (PLAT_NAME[platOf(w.channel)] || '') : w.capName || 'window'} · ${w.kind}`,
    'address   ' + String(url).replace(/([?&#](?:token|key|auth|access_token|code)=)[^&#]*/gi, '$1…'),
    'loaded    ' + (w.ready ? 'yes' : w.view ? 'loading' : 'not yet (waiting)'),
    info ? 'live      ' + (info.live ? 'live' : info.missing ? 'not found' : 'not live') + (info.checked ? ', checked ' + new Date(info.checked).toLocaleTimeString() : '') + (info.viewers != null ? ` · ${info.viewers} watching` : '') : '',
    w.kind === 'stream' ? 'playing   ' + (why ? 'paused · why: ' + why : 'playing') : '',
    w.kind === 'stream' ? 'sound     ' + (w.muted ? 'muted' : 'on') + ` · volume ${Math.round((w.vol || 0) * 100)}%` : '',
    'size      ' + `${Math.round(w.w || 0)}×${Math.round(w.h || 0)} at ${Math.round(w.x || 0)},${Math.round(w.y || 0)}` + (w.view ? ` · zoom ${Math.round(zoomOf(w.view) * 100)}%` : '') + ` · layout ${layoutName()}`,
    helpers ? 'helpers   ' + helpers : '',
    'timers    ' + (Object.keys(w.timers || {}).join(', ') || 'none')
  ];
  return lines.filter(Boolean).join('\n');
}
async function copyWinState(w){
  // ALL: each of its sites' chats, one after another
  const ws = allOn(w) ? tabChannels(w).map(ch => wins.find(o => o.kind === 'chat' && o.channel === ch)).filter(Boolean) : [w];
  copyText((await Promise.all(ws.map(winState))).join('\n\n'), ws.length > 1 ? `Copied the state of ${ws.length} chats` : `Copied ${w.channel ? chLabel(w.channel) + '’s' : 'the window’s'} state`);
}
async function inspectWin(w){
  const id = w.view && viewId(w.view);
  if (!id || !window.kmv.devInspect || !(await window.kmv.devInspect(id).catch(() => false))) flash('Couldn’t open the developer tools for it');
}
// The ⋯ menu's Developer items show while the switch is on.
function syncDevButtons(){
  wins.forEach(w => w.el && w.el.querySelectorAll('.btns .dev-b').forEach(b => { b.hidden = !devOn; }));
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  devOn = DESKTOP && settings.flag('dev');
  if (DESKTOP && window.kmv.devSet) window.kmv.devSet(devOn);
  // errors on this page, for the error log. Not Chromium's "ResizeObserver loop completed with undelivered notifications":
  // an observer that fits what it watches (the toolbar, title bars, ALL) hands the rest to the next frame, and nothing is lost
  addEventListener('error', e => {
    if (/^ResizeObserver loop /.test(e.message || '')) return;
    devError('page', e.filename ? fileOf(e.filename) + ':' + e.lineno : '', e.message || String(e.error || 'error'));
  });
  addEventListener('unhandledrejection', e => devError('page', 'promise', e.reason && (e.reason.stack || e.reason.message) ? String(e.reason.message || e.reason.stack) : String(e.reason)));
  // and in the app's scripts inside a chat (in-site/chat-message.js)
  fromSite('dev-err', (w, json) => {
    let d; try { d = JSON.parse(json); } catch { return; }
    if (d && d.msg) devError(w.kind === 'stream' ? 'stream' : 'chat', (w.channel ? chLabel(w.channel) : '') + (d.at ? ' ' + d.at : ''), d.msg);
  });
  store.watch(['dev', 'wins'], syncDevButtons);
  const sw = $('#devOn');
  if (sw){
    sw.checked = devOn;
    sw.onchange = () => toggleDev(sw.checked);
    // the search box's (Ctrl/⌘+K): Developer tools on or off is its Settings row (settings-commands.js); these are its buttons
    commands.add([
      { id: 'dev.copy', group: 'Developer', title: 'Copy diagnostics', sub: 'For a problem report: the version, your system, windows, settings, errors', words: ['report a problem', 'debug', 'bug'], icon: 'copy', button: '#devCopy', when: () => DESKTOP },
      { id: 'dev.save', group: 'Developer', title: 'Save diagnostics as a file', words: ['report a problem', 'debug'], icon: 'download', button: '#devSave', when: () => DESKTOP },
      ...[[false, 'dev.requests', 'Requests: all'], [true, 'dev.problems', 'Requests: errors only']].map(([only, id, title]) => ({ id, kind: 'tab', group: 'Developer', title,
        sub: 'Settings › Developer › Requests', words: ['developer', 'responses'], icon: 'code', when: () => DESKTOP,
        run: async () => { dev.problems = only; await openSettings('developer', { sub: 'responses' }); renderDev(); } })),
      { id: 'dev.clear', group: 'Developer', title: 'Clear the errors and requests kept', icon: 'bin', button: '#devClear', when: () => DESKTOP }
    ]);
    $('#devCopy').onclick = copyDiagnostics;
    $('#devSave').onclick = saveDiagnostics;
    $('#devClear').onclick = async () => { if (window.kmv.devClear) await window.kmv.devClear().catch(() => {}); renderDev(); flash('Cleared'); };
    $('#devTabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b){ dev.tab = b.dataset.t; renderDev(); } });
  }
  settings.onChange('dev', (_n, v) => { devOn = v === '1'; if (sw) sw.checked = devOn; store.changed('dev'); });
  if (DESKTOP){
    fromApp('onDevChanged', () => renderDev());
    fromApp('onDevCopied', d => flash(d.failed ? 'Couldn’t find the chat’s messages' : `Copied the chat’s HTML (${d.n} message${d.n === 1 ? '' : 's'}, ${Math.max(1, Math.round(d.bytes / 1024))} KB)`));
  }
  window.devTools = { setDev, pageLines, winState, renderDev, exchangeText };   // for the tests
}

export { copyText, copyWinState, devError, devOn, devTab, init, inspectWin, renderDev };
