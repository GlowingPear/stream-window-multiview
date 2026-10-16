import './windows.js';   // runs after it (see app.js)
import { settings } from '../shared/settings.js';
import { ROLE, msg, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { EMOTE_JS } from '../in-site/emote-preview.js';
import { NEW_EMOTE_CSS, NEW_EMOTE_JS } from '../in-site/new-emotes.js';
import { TRANSLATE_JS } from '../in-site/translate.js';
import { KICK_CMD_JS, kickPageCmd } from '../in-site/kick-commands.js';
import { chLabel, checkMod, extCount, platOf, platform, srcFor, trimPlayerPage, viewPartition } from '../platforms/platforms.js';
import { focusWin } from '../layout/geometry.js';
import { liftAudioSoon, pushVol } from './windows.js';
import { autoTrFor, translateFor } from '../chat/translate.js';
import { closeViewMenu, resolveYt, saveEmote, viewMenu } from '../chat/view-menu.js';
import { watchRaid } from './raids.js';
import { readChat } from '../panels/bell/bell.js';
import { injectMention } from '../panels/bell/all-notifications.js';
import { clearAlert } from '../alerts/alerts.js';
import { flash } from '../shared/flash.js';
import { applyPlay } from './pause.js';
import { applyChatView, syncLike } from '../platforms/youtube-options.js';
import { chatZoom } from '../chat/chat-zoom.js';
import { mountCapture, openCapturePicker } from './capture.js';
import { extButton } from '../panels/extensions/extensions.js';

/* The player / chat inside a window. YouTube channels first need their current live video looked up. */
const ytCache = {};
function reloadWin(w){
  if (w.kind === 'capture'){ openCapturePicker(w); return; }
  checkMod(w, true);
  if (!w.view) resolveYt(w); else if (DESKTOP && w.ready) w.view.reload(); else w.view.src = srcFor(w);
  if (w.mini && w.mini.wv){ try { w.mini.wv.reload(); } catch {} }
}
function mountView(w){
  if (w.kind === 'capture'){ mountCapture(w); return; }
  const src = srcFor(w);
  const wait = w.el.querySelector('.waitmsg');
  if (!src){ if (w.channel && platOf(w.channel) === 'youtube') resolveYt(w); return; }
  wait.hidden = true;
  if (w.view){ w.view.src = src; return; }
  let frame;
  if (DESKTOP){
    frame = document.createElement('webview');
    // Chats use their platform's saved login. Each stream player gets its own private storage,
    // so players can't copy volume/mute settings between streams, unless "Watch signed in" is on
    // for that site (then VOL_JS keeps each stream's volume its own).
    frame.setAttribute('partition', viewPartition(w));
    frame.setAttribute('allowpopups', '');
  } else {
    frame = document.createElement('iframe');
    frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'origin');
  }
  w.view = frame;
  w.el.querySelector('.body').prepend(frame);
  // Its session is set up for Chrome extensions first (the main process learns which window type it's for),
  // and when some are installed the page waits for that, so they're there from its start.
  const prep = DESKTOP && (w.kind === 'stream' || w.kind === 'chat') && window.kmv.extPrepare(viewPartition(w), platOf(w.channel), w.kind).catch(() => {});
  if (prep && extCount !== 0)
    Promise.race([prep, new Promise(r => setTimeout(r, 4000))]).then(() => { if (w.view === frame && !frame.getAttribute('src')) frame.src = src; extButton(w); });
  else frame.src = src;
  if (DESKTOP){
    const hasVol = w.kind === 'stream';
    frame.addEventListener('focus', () => {                                     // you clicked into it
      if (Date.now() - (frame.skipAt || 0) < 1000) return;                       // Skip YouTube ads did
      focusWin(w); clearAlert(w); readChat(w.channel);
    });
    // a raid moves the chat (or player) to another channel: follow it with every window of this channel
    const nav = e => { if (e.isMainFrame !== false && w.view === frame) watchRaid(w, e.url); };
    frame.addEventListener('did-navigate', nav);
    frame.addEventListener('did-navigate-in-page', nav);
    // Every web view starts with its sound off (main.js); a stream's stays off, also while it loads again,
    // until its volume / mute is on the player, so one that should be muted never plays a moment of sound.
    if (hasVol) frame.addEventListener('did-start-navigation', e => {
      if (e.isMainFrame && !e.isInPlace && w.view === frame && w.ready){ w.audioHeld = w.audioLoading = true; try { frame.setAudioMuted(true); } catch {} }
    });
    // a new page (another video, or loaded again): its like state is read again (see readLike)
    if (w.kind === 'stream' && platOf(w.channel) === 'youtube') frame.addEventListener('did-start-navigation', e => {
      if (e.isMainFrame && !e.isInPlace && w.view === frame){ w.like = null; syncLike(w); }
    });
    // Download from an emote card (see emoteAgent): the chat page asks through a console message
    if (w.kind === 'chat') frame.addEventListener('console-message', e => {
      const msg = String(e.message || '');
      const m = /^__kmv:emote-dl (\{.*\})$/.exec(msg);
      if (m) saveEmote(m[1]);
      const sn = /^__kmv:emote-seen (\{.*\})$/.exec(msg);
      if (sn && w.view === frame) newEmoteSeen(w, sn[1]);
      const cp = /^__kmv:emote-copy (\{.*\})$/.exec(msg);
      if (cp) copyEmote(cp[1]);
      if (msg === '__kmv:emote-menu-close {}' && viewMenu && viewMenu.view === frame) closeViewMenu();
      const tr = /^__kmv:tr (\{.*\})$/.exec(msg);
      if (tr && w.view === frame) translateFor(frame, tr[1]);
      const c = /^__kmv:kick-cmd ([a-z]+)$/.exec(String(e.message || ''));   // see kickCmdAgent
      if (c && w.view === frame) kickPageCmd(w, c[1]);
    });
    frame.addEventListener('dom-ready', () => {
      w.ready = true;
      if (w.kind === 'stream') trimPlayerPage(frame, w.channel);
      if (hasVol){ w.enforceUntil = Date.now() + 8000; pushVol(w); w.audioHeld = true; w.audioLoading = false; liftAudioSoon(w); }
      else try { frame.setAudioMuted(false); } catch {}
      if (w.kind === 'stream'){ w.sentPause = false; applyPlay(w); }
      if (w.kind === 'chat') try { frame.setZoomFactor(chatZoom()); } catch {}
      if (w.kind === 'chat') { const css = platform(w.channel).chatCss; if (css) try { frame.insertCSS(css); } catch {} }
      if (w.kind === 'chat' && ROLE === 'main') injectMention(w);
      if (w.kind === 'chat') frame.executeJavaScript(`${EMOTE_JS};window.__kmvEmote.on(${emoteOn})`).catch(() => {});
      if (w.kind === 'chat' && newEmotesOn) markNewEmotes(w);
      if (w.kind === 'chat') frame.executeJavaScript(`${TRANSLATE_JS};${autoTrFor(w.channel) ? 'window.__kmvTr.start(true)' : ''}`).catch(() => {});
      if (w.kind === 'chat' && platform(w.channel).pageCommands) frame.executeJavaScript(KICK_CMD_JS).catch(() => {});
      applyChatView(w);
    });
  }
}
// New emotes (Settings > General, off unless switched on): ask the app which are new for this channel, mark them,
// and say so once when there are newly added ones.
var newEmotesOn = false;
newEmotesOn = settings.flag('newEmotes');
async function markNewEmotes(w){
  if (!DESKTOP || !window.kmv.emotesOpen || !w.channel || !platform(w.channel).emoteLists) return;
  const frame = w.view;
  const r = await window.kmv.emotesOpen(w.channel).catch(() => null);
  if (!r || w.view !== frame || !newEmotesOn) return;
  try { await frame.insertCSS(NEW_EMOTE_CSS()); } catch {}
  frame.executeJavaScript(`${NEW_EMOTE_JS};window.__kmvNew.set(${JSON.stringify(r.fresh || [])})`).catch(() => {});
  const a = r.added || [];
  if (a.length) flash(`${chLabel(w.channel)} has ${a.length === 1 ? 'a new emote' : a.length + ' new emotes'}: ${a.slice(0, 5).join(', ')}${a.length > 5 ? ` and ${a.length - 5} more` : ''}`);
}
function newEmoteSeen(w, json){
  let d; try { d = JSON.parse(json); } catch { return; }
  if (!d || typeof d.name !== 'string' || !window.kmv.emotesSeen) return;
  window.kmv.emotesSeen(w.channel, d.name).catch(() => {});
  // the same channel's other chat windows: not new there either
  wins.forEach(o => { if (o !== w && o.kind === 'chat' && o.channel === w.channel && o.ready) o.view.executeJavaScript(`window.__kmvNew && window.__kmvNew.set(window.__kmvNew.list().filter(n => n !== ${JSON.stringify(d.name)}))`).catch(() => {}); });
}
// The hover card is off unless switched on (the same preview is always in the right-click menu on an emote)
var emoteOn = false;
// Other files change these through viewVars: a variable imported from another file can't be assigned to.
const viewVars = {
  get newEmotesOn(){ return newEmotesOn; }, set newEmotesOn(v){ newEmotesOn = v; },
  get emoteOn(){ return emoteOn; }, set emoteOn(v){ emoteOn = v; },
};
emoteOn = settings.flag('emotePreview');
// "Copy image" on an emote card: the app fetches the picture (only from the emote sites) and copies a still of it
async function copyEmote(json){
  let d; try { d = JSON.parse(json); } catch { return; }
  if (!d || typeof d.url !== 'string' || !window.kmv || !window.kmv.emoteFetch) return;
  const name = typeof d.name === 'string' ? d.name.slice(0, 60) : 'emote';
  const r = await window.kmv.emoteFetch(d.url, typeof d.small === 'string' ? d.small : '').catch(() => null);
  const png = r && r.data ? await pngOf(`data:${r.type};base64,${r.data}`) : null;
  if (!png || !(await window.kmv.clipboardPng(png).catch(() => false))) flash(`Couldn’t copy ${name}`, { subject: 'downloads' });
}
// A picture as a still PNG (an animated one: its first frame)
async function pngOf(src){
  try {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth || 112; c.height = im.naturalHeight || 112;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/png');
  } catch { return null; }
}

export { emoteOn, markNewEmotes, mountView, newEmotesOn, pngOf, reloadWin, viewVars, ytCache };
