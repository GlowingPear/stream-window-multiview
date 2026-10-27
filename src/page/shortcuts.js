import { blowOn, blowUpNow, blownWin, putBack, toggleBlowMode } from './chat/blow-up.js';
import { $, ROLE, colsMode, input, shownWins } from './core.js';
import { isRail, showRailChat } from './layout/chat-rail.js';
import { isStage, putOnStage } from './layout/chat-stage.js';
import { buildCols, columnsLayout } from './layout/columns.js';
import { syncSwitcher } from './layout/focus-only.js';
import { colKey, featuredCh, isVid, layoutVars, setFeatured, sortedChats, vidLabel } from './layout/layouts.js';
import { layoutLocked, setLayoutLocked } from './layout/lock.js';
import { scrollCols } from './layout/sideways-scroll.js';
import { fsMute, isFocusView } from './layout/switcher.js';
import { histRedo, histUndo } from './layout/undo.js';
import { closeNoteHistory } from './panels/bell/all-notifications.js';
import { extDlgDone } from './panels/extensions/extensions.js';
import { keysOn, showHelp } from './panels/help/help.js';
import { save } from './persistence.js';
import { sameStreamer } from './platforms/linked.js';
import { chLabel } from './platforms/platforms.js';
import { commands } from './shared/commands.js';
import { DESKTOP } from './shared/env.js';
import { flash } from './shared/flash.js';
import { settings } from './shared/settings.js';
import { setBarHidden } from './toolbar/header.js';
import { panel, savedBtn } from './toolbar/toolbar.js';
import { openCapturePicker } from './windows/capture.js';
import { isPaused, togglePause } from './windows/pause.js';
import { reloadWin } from './windows/views.js';
import { pushVol, saveSoon } from './windows/windows.js';

/* ---- Keyboard shortcuts ---- */
// The stream picked with ← / → in the layouts that don't make one big (Tile, Auto, Chat focus, Game focus, free)
let selKey = null;
const stageOn = () => shownWins().find(w => w.el.classList.contains('stg-on')) || null;
const railStream = () => { const c = shownWins().find(w => w.kind === 'chat' && w.el.classList.contains('rl-chat')); return c && shownWins().find(w => w.kind === 'stream' && sameStreamer(w.channel, c.channel)) || null; };
// The stream the keys act on (M, Space, R, ↑ / ↓, Shift+Z): the big one, the one on the stage, the one whose chat is
// in the rail, or the one picked with ← / →
function bigStream(){
  const vids = buildCols().filter(c => isVid(c.top)).map(c => c.top);
  if (isStage() && stageOn()) return stageOn();
  if (isRail() && railStream()) return railStream();
  if (!isFocusView() && !colsMode && selKey){ const s = vids.find(v => colKey(v) === selKey); if (s) return s; }
  return (isFocusView() && vids.find(s => colKey(s) === featuredCh)) || vids.find(s => s.kind === 'stream') || null;
}
// ← / →: the previous or next stream, round the ends. What that does depends on the layout; with Settings > Layouts >
// Sound follows the arrow keys on, the stream you move to is the one you hear.
function stepStream(d){
  const l = buildCols().filter(c => isVid(c.top)).map(c => c.top);
  if (!l.length) return false;
  const next = i => l[(i + d + l.length) % l.length];
  let to;
  if (isFocusView()){ to = next(l.findIndex(s => colKey(s) === featuredCh)); makeBig(to); }
  else if (colsMode){ scrollCols(d); return true; }
  else if (isStage()){ to = next(l.indexOf(stageOn())); putOnStage(colKey(to)); }
  else if (isRail()){
    // the rail's tabs are its chats: the next chat, in their order
    const chats = sortedChats(), cur = chats.findIndex(c => c.el.classList.contains('rl-chat'));
    if (!chats.length) return false;
    const c = chats[(cur + d + chats.length) % chats.length];
    showRailChat(c.channel);
    to = l.find(s => sameStreamer(s.channel, c.channel)) || null;
    flash(`${chLabel(c.channel)}'s chat`);
  } else {
    to = next(l.findIndex(s => colKey(s) === selKey));
    selKey = colKey(to);
    shownWins().forEach(w => w.el.classList.toggle('kb-sel', w === to));
    void to.el.offsetWidth; to.el.classList.remove('kb-sel'); void to.el.offsetWidth; to.el.classList.add('kb-sel');   // (the outline shows again)
  }
  if (to && to.kind === 'stream' && soundFollows()) fsMute(to, true);
  if (to && !isRail()) flash(vidLabel(to) + (to.kind === 'stream' && soundFollows() ? ' · sound on' : ''));
  return true;
}
const soundFollows = () => settings.flag('arrowSound', false);
function makeBig(s){ if (!s) return; setFeatured(colKey(s)); layoutVars.scrollX = 0; columnsLayout(); }
function closeOverlays(){
  let any = false;
  // dialogs one at a time, the top one first (Import follows can sit over Settings); menus all at once
  const top = ['#updNewsDlg', '#extDlg', '#importDlg', '#ffDlg', '#capDlg', '#settingsDlg', '#profDlg', '#noteDlg'].map(sel => $(sel)).find(e => e && !e.hidden);
  if (top){ if (top.id === 'extDlg') extDlgDone(false); else if (top.id === 'noteDlg') closeNoteHistory(); else top.hidden = true; any = true; }
  else ['#layoutMenu', '#accountMenu', '#savedPanel', '#bellPanel', '#moreMenu', '#extMenu', '#barMenu'].forEach(sel => {
    const e = $(sel); if (e && !e.hidden){ e.hidden = true; any = true; }
  });
  if (!any && blownWin()){ putBack(); any = true; }   // a blown-up chat goes back after everything over it
  const ae = document.activeElement;     // don't leave the keyboard in a box that just closed
  if (any && ae && ae !== document.body && ae.closest('.dlg-bg, .menu, #savedPanel, #bellPanel')) ae.blur();
  return any;
}
const layoutPick = l => { const b = document.querySelector(`#layoutMenu [data-l=${l}]`); if (b) b.click(); };
const streamWins = () => shownWins().filter(o => o.kind === 'stream');
// Shift+M, and the search box's Mute every stream / Unmute every stream
function muteAll(on){
  streamWins().forEach(o => { o.muted = on; pushVol(o); }); save(); syncSwitcher();
  flash(on ? 'All streams muted' : 'All streams unmuted');
}
// Shift+R
function refreshAll(){ streamWins().forEach(reloadWin); flash('Refreshing every stream…'); }
const noStreams = () => !streamWins().length && 'Open a stream first';
// The search box's (Ctrl/⌘+K) actions for the whole app, with their keys
function addShortcutCommands(){
  const main = () => ROLE === 'main';
  commands.add([
    { id: 'streams.muteAll', title: 'Mute every stream', sub: 'Every stream, here and popped out', words: ['silence', 'sound off', 'volume'], icon: 'volOff', keys: 'Shift+M',
      when: main, disabled: noStreams, run: () => muteAll(true) },
    { id: 'streams.unmuteAll', title: 'Unmute every stream', sub: 'Every stream at its own volume', words: ['sound on', 'volume'], icon: 'volOn', when: main, disabled: noStreams, run: () => muteAll(false) },
    { id: 'streams.refreshAll', title: 'Refresh every stream', sub: 'Reload each stream\'s player', words: ['reload', 'fix'], icon: 'reload', keys: 'Shift+R', when: main, disabled: noStreams, run: refreshAll },
    { id: 'layout.lock', kind: 'layout', group: 'More', title: 'Lock layout', sub: 'Windows keep their places: new ones fit in, nothing moves by itself', words: ['unlock', 'freeze', 'pin'], icon: 'lock', keys: 'Shift+L',
      when: main, toggle: { get: () => layoutLocked, set: on => setLayoutLocked(on) } },
    { id: 'chat.blowMode', title: 'Blow up chat on click', sub: 'Click a chat to show it big in the middle', words: ['zoom chat', 'enlarge'], icon: 'zoomin', keys: 'Z',
      when: main, toggle: { get: () => blowOn, set: on => { if (on !== blowOn) toggleBlowMode(); } } },
    { id: 'chat.blowNow', title: 'Blow up the chat now', sub: 'The chat you last clicked, big in the middle (again, or Esc, puts it back)', words: ['zoom chat'], icon: 'zoomin', keys: 'Shift+Z',
      when: main, disabled: () => !shownWins().some(w => w.kind === 'chat') && 'Open a chat first', run: () => blowUpNow(bigStream()) },
    { id: 'chat.putBack', title: 'Put the chat back', sub: 'The blown-up chat goes back to its place', icon: 'close', when: () => main() && !!blownWin(), run: putBack },
    { id: 'toolbar.hide', title: 'Hide the toolbar', sub: 'Move the mouse to the edge, or press Esc, to bring it back', words: ['focus', 'more room'], icon: 'hidebar', keys: 'H',
      when: () => main() && !document.body.classList.contains('focus'), run: () => setBarHidden(true) },
    { id: 'toolbar.show', title: 'Show the toolbar', icon: 'showbar', keys: 'H', when: () => main() && document.body.classList.contains('focus'), run: () => setBarHidden(false) },
    { id: 'app.fullscreen', title: 'Full screen', sub: 'The whole screen for the app (again to leave it)', words: ['fullscreen', 'maximise', 'maximize'], icon: 'feat', keys: 'F11',
      when: () => DESKTOP && !!window.kmv.toggleFullscreen, run: () => window.kmv.toggleFullscreen() },
    { id: 'capture.pick', title: 'Show another app\'s window', sub: 'e.g. a Discord pop-out, inside Stream Multiview', words: ['capture', 'discord', 'app window', 'screen'], icon: 'capture', keys: 'W',
      when: () => main() && DESKTOP, run: () => openCapturePicker(null) },
    { id: 'streams.next', title: 'Next stream', sub: 'Big in Focus view, on the stage in Chat Stage, its chat in Chat Rail (Columns: scroll)', words: ['previous', 'step'], icon: 'arrowR', keys: '→',
      when: main, disabled: noStreams, run: () => stepStream(1) },
    { id: 'streams.prev', title: 'Previous stream', sub: 'Big in Focus view, on the stage in Chat Stage, its chat in Chat Rail (Columns: scroll)', words: ['back', 'step'], icon: 'arrowL', keys: '←',
      when: main, disabled: noStreams, run: () => stepStream(-1) },
    { id: 'help.keys', group: 'Help', kind: 'help', title: 'Keyboard shortcuts', sub: 'Every key, by what it does', words: ['keys', 'hotkeys'], icon: 'keys', keys: 'F1', run: () => showHelp('keys') },
    { id: 'channels.open', title: 'Channels', sub: 'Your channels: open one, add a new one, see who\'s live', words: ['saved', 'favourites', 'favorites', 'follows'], icon: 'star', keys: 'B',
      when: main, run: () => { if (panel.hidden) savedBtn.click(); input.focus(); } }
  ]);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  // Settings > Layouts > Sound follows the arrow keys (off unless switched on)
  const snd = $('#arrowSound');
  if (snd){
    snd.checked = soundFollows();
    snd.addEventListener('change', () => settings.set('arrowSound', snd.checked));
    settings.onChange(['arrowSound'], () => { snd.checked = soundFollows(); });
  }
  addShortcutCommands();
  $('#savedBtn').dataset.cmd = 'channels.open'; $('#layoutLock').dataset.cmd = 'layout.lock'; $('#capBtn').dataset.cmd = 'capture.pick';
  document.querySelectorAll('#colNav [data-d]').forEach(b => { b.dataset.cmd = +b.dataset.d > 0 ? 'streams.next' : 'streams.prev'; });
  window.stepStream = stepStream; window.bigStream = () => { const s = bigStream(); return s && s.channel; };   // for the tests
  window.mutedStreams = () => shownWins().filter(w => w.kind === 'stream' && w.muted).map(w => w.channel).sort();   // for the tests
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === 'Escape'){ if (closeOverlays()) e.preventDefault(); return; }
    if (!keysOn) return;                                   // keyboard shortcuts switched off (Settings > General)
    if (k === 'F1'){ e.preventDefault(); showHelp('keys'); return; }
    if (typing || e.altKey) return;
    if (ctrl){
      if (ROLE !== 'main') return;
      const kk = k.toLowerCase();
      if (kk === 'z' && !e.shiftKey){ e.preventDefault(); histUndo(); }
      else if (kk === 'y' || (kk === 'z' && e.shiftKey)){ e.preventDefault(); histRedo(); }
      return;
    }
    if (k === '?'){ e.preventDefault(); showHelp('keys'); return; }
    if (ROLE !== 'main') return;
    const streams = () => buildCols().filter(c => isVid(c.top)).map(c => c.top);
    const big = bigStream();
    const digit = /^Digit([1-9])$/.exec(e.code);
    let handled = true;
    if (digit) makeBig(streams()[+digit[1] - 1]);
    else switch (k.length === 1 ? k.toLowerCase() : k){
      case 'n': case '/': if (panel.hidden) savedBtn.click(); input.focus(); input.select(); break;
      case 'b': $('#savedBtn').click(); break;
      case 'w': openCapturePicker(null); break;
      case 'h': setBarHidden(!document.body.classList.contains('focus')); break;
      case 'f': if (isFocusView()) layoutPick('columns'); else layoutPick('focus'); break;
      case 'c': layoutPick(e.shiftKey ? 'chatfocus' : 'columns'); break;
      case 'g': layoutPick('game'); break;
      case 'k': layoutPick(e.shiftKey ? 'rail' : 'stage'); break;
      case 't': layoutPick('tile'); break;
      case 'a': layoutPick('auto'); break;
      case 'l': if (e.shiftKey) setLayoutLocked(!layoutLocked); else $('#layoutBtn').click(); break;
      case 's': $('#swBtn').click(); break;
      case 'z': if (e.shiftKey) blowUpNow(big); else toggleBlowMode(); break;   // Blow up chat
      case 'm':
        if (e.shiftKey) muteAll(true);
        else if (big && big.kind === 'stream'){ fsMute(big, false); flash(`${chLabel(big.channel)} ${big.muted ? 'muted' : 'unmuted'}`); }
        break;
      case ' ': case 'p': if (big && big.kind === 'stream'){ togglePause(big); flash(`${chLabel(big.channel)} ${isPaused(big) ? 'paused' : 'playing'}`); } break;
      case 'r':
        if (e.shiftKey) refreshAll();
        else if (big && big.kind === 'stream'){ reloadWin(big); flash(`Refreshing ${chLabel(big.channel)}…`); }
        break;
      case 'ArrowUp': case 'ArrowDown':
        if (big && big.kind === 'stream'){
          big.vol = Math.min(1, Math.max(0, Math.round((big.vol + (k === 'ArrowUp' ? 0.05 : -0.05)) * 100) / 100));
          big.muted = big.vol === 0; pushVol(big); saveSoon(); syncSwitcher();
          flash(`${chLabel(big.channel)} volume ${Math.round(big.vol * 100)}%`);
        }
        break;
      case 'ArrowLeft': case 'ArrowRight': {
        if (!stepStream(k === 'ArrowRight' ? 1 : -1)) handled = false;
        break;
      }
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });
}

export { closeOverlays, init, layoutPick, makeBig };
