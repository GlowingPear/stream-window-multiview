import { revealWin } from '../alerts/spam-alerts.js';
import { blowUp, blownWin, putBack } from '../chat/blow-up.js';
import { makeClip } from '../chat/kick-clip.js';
import { openPollForm } from '../chat/kick-poll.js';
import { openPredictionForm } from '../chat/kick-prediction.js';
import { translateChat } from '../chat/translate.js';
import { ROLE, colsMode, shownWins, wins } from '../core.js';
import { isRail, showRailChat } from '../layout/chat-rail.js';
import { isStage, putOnStage } from '../layout/chat-stage.js';
import { buildCols } from '../layout/columns.js';
import { colKey } from '../layout/layouts.js';
import { fsMute, removeChannel, renderSwitcher } from '../layout/switcher.js';
import { infoFor } from '../panels/channels/channels.js';
import { openLinkCard } from '../panels/linked/link-card.js';
import { save } from '../persistence.js';
import { linkedOn, nameOf, streamerOf } from '../platforms/linked.js';
import { PLAT_NAME, chLabel, platOf } from '../platforms/platforms.js';
import { commands } from '../shared/commands.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { tipName } from '../shared/tooltips.js';
import { makeBig } from '../shortcuts.js';
import { swapWindows } from './channel-picker.js';
import { addTab, closeTab, closedTabs, frameOf, joinTab, leaderOf, setSideBySide, showTab, splitTab, stepTab,
  switchTo, tabChannels, unlinkTab } from './frames.js';
import { isPaused, togglePause } from './pause.js';
import { pushVol, saveSoon } from './windows.js';

/* ---- The search box's (Ctrl/⌘+K) open windows: "charlie · stream", "charlie · chat", "discord · window" ----
   Enter goes to it (scrolled to, or on top), ⇧Enter makes a stream big, Tab lists everything for it: what its
   title bar's buttons do (each one runs that button, so the two can't differ), and the rest you'd do to it from
   the keyboard or its right-click. The window you last clicked comes first ("For this window" in the empty box). */
const winName = w => w.channel ? nameOf(w.channel).replace(/^@/, '') : w.kind === 'capture' ? (w.capName || 'Window') : (() => { try { return new URL(w.url).hostname; } catch { return 'Page'; } })();
const winKind = w => w.kind === 'capture' ? 'window' : w.kind === 'web' ? 'page' : w.kind;
const activeWin = () => shownWins().find(w => w.el.classList.contains('active')) || null;
const isKickMod = w => DESKTOP && platOf(w.channel) === 'kick' && wins.some(o => o.channel === w.channel && o.el.querySelector('[data-a=mod]:not([hidden])'));
// where it is and how it is: "Column 3 · muted · 100% volume"
function winState(w){
  const col = colsMode ? buildCols().findIndex(c => c.key === colKey(w)) + 1 : 0, where = col > 0 ? 'Column ' + col : '';
  if (w.kind !== 'stream') return [where, w.el.classList.contains('blown') ? 'blown up' : '', w.kind === 'web' ? w.url : ''];
  return [where, w.el.classList.contains('featured') ? 'big' : '', isPaused(w) ? 'paused' : '', w.muted ? 'muted' : '', `${Math.round(w.vol * 100)}% volume`];
}
const WIN_ICON = { stream: 'ytPlay', chat: 'chat', capture: 'capture', web: 'pop' };
function goToWin(w){
  if (isStage() && w.kind === 'stream') putOnStage(colKey(w));
  else if (isRail() && w.kind === 'chat') showRailChat(w.channel);
  revealWin(w);
}
const volBy = (w, d) => {
  w.vol = Math.min(1, Math.max(0, Math.round((w.vol + d) * 100) / 100)); w.muted = w.vol === 0;
  pushVol(w); saveSoon(); flash(`${chLabel(w.channel)} volume ${Math.round(w.vol * 100)}%`);
};
// Everything for a window (Tab), and its buttons for a channel's big row (channel-commands.js)
function winActions(w){
  const name = winName(w), id = a => `win:${w.id}:${a}`, out = [];
  const add = (a, title, run, more = {}) => out.push({ id: id(a), group: `${name} · ${winKind(w)}`, title, run, icon: more.icon || 'point', ...more });
  add('go', 'Go to it', () => goToWin(w), { icon: 'arrowR', sub: 'Scrolled to, or brought to the front' });
  // a window with several sites: its tabs (windows/frames.js)
  const lead = leaderOf(w), chs = w.channel ? tabChannels(w) : [], members = frameOf(w);
  if (chs.length > 1){
    chs.forEach((ch, i) => { if (ch !== lead.channel) add('tab:' + ch, `Switch to ${PLAT_NAME[platOf(ch)]}`, () => switchTo(w, i + 1), { icon: 'arrowR', keys: 'Alt+' + (i + 1), sub: infoFor(ch)?.live ? 'live' : 'offline', words: ['tab', 'site'] }); });
    add('nextTab', 'Next site', () => stepTab(w, 1), { icon: 'arrowR', keys: 'Alt+ArrowRight', words: ['tab'] });
    add('prevTab', 'Previous site', () => stepTab(w, -1), { icon: 'arrowL', keys: 'Alt+ArrowLeft', words: ['tab'] });
  }
  if (members.length > 1){
    add('closeTab', 'Close this tab', () => closeTab(lead), { icon: 'close', sub: `${PLAT_NAME[platOf(lead.channel)]}: the other tabs stay` });
    add('splitTab', 'Open this tab in its own window', () => splitTab(lead), { icon: 'pop', sub: 'Next to this one; Join puts it back', words: ['split'] });
    if (w.kind === 'chat') add('sbs', lead.sbs ? 'Back to tabs' : 'Chats side by side', () => setSideBySide(lead, !lead.sbs), { icon: 'columns', sub: 'A column each, in this window' });
    const at = members.find(o => o !== lead && o.alert);
    if (at) add('alertTab', 'Go to the tab with a mention', () => showTab(at), { icon: 'at', sub: PLAT_NAME[platOf(at.channel)] });
  }
  const closed = w.frame ? (closedTabs[w.frame] || []).filter(ch => !members.some(o => o.channel === ch)) : [];
  closed.forEach(ch => add('reopen:' + ch, `Reopen ${PLAT_NAME[platOf(ch)]}`, () => addTab(lead, ch, true), { icon: 'plus', sub: 'A tab you closed', words: ['reopen', 'closed tab'] }));
  if (w.split && streamerOf(w.channel)) add('join', 'Join back', () => joinTab(w), { icon: 'link', sub: `Back as a tab in ${nameOf(w.channel)}'s window` });
  if (w.channel && linkedOn() && !/^yt:v:/.test(w.channel)){
    add('link', streamerOf(w.channel) ? 'Linked channels…' : 'Link this window\'s channel with…', () => openLinkCard(w.channel, { add: !streamerOf(w.channel) }), { icon: 'layers', sub: 'The same streamer on other sites' });
    if (streamerOf(w.channel)) add('unlink', `Unlink ${PLAT_NAME[platOf(lead.channel)]} from ${nameOf(lead.channel)}`, () => unlinkTab(lead.channel), { icon: 'unlink', sub: 'It becomes its own channel again' });
  }
  if (w.kind === 'stream'){
    if (ROLE === 'main') add('big', 'Make big', () => makeBig(w), { icon: 'feat', sub: 'Focus view, with this stream big' });
    add('mute', w.muted ? 'Unmute' : 'Mute', () => { fsMute(w, false); flash(`${chLabel(w.channel)} ${w.muted ? 'muted' : 'unmuted'}`); }, { icon: w.muted ? 'volOn' : 'volOff', words: ['sound', 'volume'] });
    add('solo', 'Hear only this one', () => fsMute(w, true), { icon: 'volOn', sub: 'Every other stream muted', words: ['solo', 'sound'] });
    add('volUp', 'Volume up', () => volBy(w, 0.1), { icon: 'volOn' });
    add('volDown', 'Volume down', () => volBy(w, -0.1), { icon: 'volOff' });
    add('pause', isPaused(w) ? 'Play' : 'Pause', () => { togglePause(w); flash(`${chLabel(w.channel)} ${isPaused(w) ? 'paused' : 'playing'}`); }, { icon: isPaused(w) ? 'play' : 'pause' });
    if (DESKTOP && ROLE === 'main') add('preview', w.preview ? 'Hide its preview' : 'Show its preview', () => { w.preview = !w.preview; save(); renderSwitcher(); }, { icon: w.preview ? 'chevUp' : 'chevDown', sub: 'A small live picture in the switch control' });
  }
  if (w.kind === 'stream' || w.kind === 'capture') add('remove', 'Remove', () => removeChannel(colKey(w)), { icon: 'close', sub: w.kind === 'stream' ? 'The stream and its chat' : 'This window' });
  if (w.kind === 'chat'){
    if (ROLE === 'main') add('blow', w === blownWin() ? 'Put it back' : 'Blow it up', () => { if (w === blownWin()) putBack(); else blowUp(w); }, { icon: 'zoomin', sub: 'Big in the middle of the screen, with bigger text' });
    add('translate', 'Translate this chat', () => translateChat(w, { do: 'translate' }), { icon: 'chat', sub: 'New messages in your language', words: ['language'] });
    if (isKickMod(w)){
      add('clip', 'Make a clip', () => makeClip(w), { icon: 'capture', sub: 'Kick: the last moments of the stream, as /clip does', words: ['/clip'] });
      add('poll', 'Start a poll', () => openPollForm(w), { icon: 'chatview', sub: 'Kick: as /poll does', words: ['/poll', 'vote'] });
      add('prediction', 'Start a prediction', () => openPredictionForm(w), { icon: 'sparkle', sub: 'Kick: as /prediction does', words: ['/prediction', 'bet'] });
    }
  }
  // its title bar's buttons, each as its button says (with the ⋯ menu's)
  for (const b of w.el.querySelectorAll('.bar .btns [data-a]')){
    const a = b.dataset.a;
    if (a === 'more' || b.hidden) continue;
    const t = a === 'chat' ? '+ Chat' : a === 'close' ? 'Close' : tipName(b) || b.title || b.getAttribute('aria-label') || a;
    add('bar.' + a, t, () => { if (b.isConnected) b.click(); }, { icon: { reload: 'reload', pop: 'pop', max: 'max', close: 'close', star: 'star', profile: 'user', mod: 'mod', feat: 'feat', at: 'at', like: 'like', ext: 'ext', state: 'copy', inspect: 'code', overlay: 'chat', chat: 'chat' }[a] || 'point', sub: b.title && b.title !== t ? b.title : '' });
  }
  // swap places with another window (its title's dropdown)
  const pick = w.el.querySelector('.col-pick');
  if (pick) for (const o of pick.options) if (o.value && !o.selected) add('swap:' + o.value, `Swap with ${o.textContent}`, () => swapWindows(w, o.value), { icon: 'arrowR', words: ['move', 'switch places'] });
  return out;
}
function winItem(w, active){
  const name = winName(w), kind = winKind(w);
  return { id: 'win:' + w.id, kind: 'window', group: 'Windows',
    title: `${name} · ${kind}`, sub: () => winState(w), words: [name], icon: WIN_ICON[w.kind] || 'pop', chip: { text: 'open', accent: true }, verb: 'Go to it',
    boost: active ? 15 : 0, run: () => goToWin(w), alt: w.kind === 'stream' && ROLE === 'main' ? () => makeBig(w) : null, altLabel: 'make big',
    more: () => winActions(w) };
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  commands.provide('windows', q => {
    const act = activeWin();
    const out = shownWins().map(w => winItem(w, w === act));
    // the empty box: the window you last clicked, and its first few actions
    if (!q && act){
      const of = `${winName(act)} · ${winKind(act)}`;
      out.push(...winActions(act).filter(x => !/:(go|bar\.close)$/.test(x.id)).slice(0, 4).map(x => ({ ...x, sub: of, group: 'For this window', groupNote: of, keep: true })));
    }
    return out;
  });
  window.winActions = w => winActions(w).map(x => x.title);   // for the tests
}

export { goToWin, init, winActions };
