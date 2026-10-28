import { clearAlert } from '../alerts/alerts.js';
import { feedReady } from '../chat/all-chat.js';
import { blowOn, blowUp, blownWin } from '../chat/blow-up.js';
import { syncChatName } from '../chat/chat-name.js';
import { chatZoom } from '../chat/chat-zoom.js';
import { startStick } from '../chat/stick-bottom.js';
import { autoTrFor } from '../chat/translate.js';
import { resolveYt } from '../chat/view-menu.js';
import { ROLE, wins } from '../core.js';
import { MESSAGE_JS } from '../in-site/chat-message.js';
import { EMOTE_JS } from '../in-site/emote-preview.js';
import { KICK_CMD_JS } from '../in-site/kick-commands.js';
import { NEW_EMOTE_CSS, NEW_EMOTE_JS } from '../in-site/new-emotes.js';
import { TRANSLATE_JS } from '../in-site/translate.js';
import { focusWin } from '../layout/geometry.js';
import { injectMention } from '../panels/bell/all-notifications.js';
import { readChat } from '../panels/bell/bell.js';
import { infoFor } from '../panels/channels/channels.js';
import { extButton } from '../panels/extensions/extensions.js';
import { kickHold } from '../platforms/pear-drops.js';
import { chLabel, checkMod, extCount, platOf, platform, srcFor, streamSrc, trimPlayerPage, viewPartition, ytVidOf } from '../platforms/platforms.js';
import { applyChatView, syncLike } from '../platforms/youtube-options.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { fromApp, fromSite, siteMessage } from '../shared/incoming.js';
import { viewPressed } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { mountCapture, openCapturePicker } from './capture.js';
import { focusBoxNow, playQuality, tabKeyAgent, tabKeyJs } from './frames.js';
import { applyPlay } from './pause.js';
import { watchRaid } from './raids.js';
import { watchStuck } from './stuck.js';
import { addCss, loadView, reloadView, runIn, setMuted, setZoom, viewId } from './view.js';
import { liftAudioSoon, pushVol } from './windows.js';

/* The player / chat inside a window. YouTube channels first need their current live video looked up. */
// You clicked into a window's view: it's the active window, its alert and new messages are seen, and a chat blows
// up (Blow up chat, switch control), and open menus close. Heard from its focus event, from the app (a press in it: from Electron 44 on, a
// <webview> has no focus event), and from a press on the view that reaches this page instead of the chat's. One
// click can be heard twice: all of it is the same the second time.
function viewTouched(w, frame){
  if (!wins.includes(w) || w.view !== frame) return;
  if (Date.now() - (frame.skipAt || 0) < 1000) return;                         // Skip YouTube ads did
  focusWin(w); clearAlert(w); readChat(w.channel); viewPressed();
  if (w.kind === 'chat' && blowOn) blowUp(w);
}
const ytCache = {};
function reloadWin(w){
  if (w.kind === 'capture'){ openCapturePicker(w); return; }
  checkMod(w, true);
  if (w.view && ytChannelWin(w) && DESKTOP && window.kmv.ytResolve){ reloadYt(w); return; }
  if (!w.view) resolveYt(w); else if (DESKTOP && w.ready) reloadPage(w); else w.view.src = srcFor(w);
  if (w.mini && w.mini.wv) loadView(w.mini.wv, streamSrc(w.channel, true, ytVidOf(w)));
}
// A YouTube channel's live stream is a video of its own, so when the channel goes live again (a new stream) its
// windows still have the old one. The live check says which video is live now (they follow it), and Reload asks
// YouTube again.
const ytChannelWin = w => (w.kind === 'stream' || w.kind === 'chat') && !!w.channel && platOf(w.channel) === 'youtube' && !/^yt:v:/.test(w.channel);
function ytFollow(ch, vid){
  delete ytCache[ch];
  wins.filter(o => ytChannelWin(o) && o.channel === ch && o.ytVid !== vid).forEach(o => {
    o.ytVid = vid;
    if (o.view) loadView(o.view, srcFor(o)); else mountView(o);
    if (o.mini && o.mini.wv) loadView(o.mini.wv, streamSrc(o.channel, true, vid));
  });
}
async function reloadYt(w){
  let r = null;
  try { r = await window.kmv.ytResolve(w.channel); } catch {}
  ytCache[w.channel] = { r, t: Date.now() };
  if (!wins.includes(w) || !w.view) return;
  if (r && r.live && r.videoId && r.videoId !== w.ytVid){ ytFollow(w.channel, r.videoId); return; }
  if (w.ready) reloadPage(w); else w.view.src = srcFor(w);
  if (w.mini && w.mini.wv) loadView(w.mini.wv, streamSrc(w.channel, true, ytVidOf(w)));
}
function followYtStreams(){
  wins.forEach(w => {
    if (!ytChannelWin(w) || !w.ytVid) return;
    const i = infoFor(w.channel);
    if (i && i.live && i.videoId && i.videoId !== w.ytVid) ytFollow(w.channel, i.videoId);
  });
}
// A loaded window's page again. A stream loads its channel's address: its player may have moved to a page that
// can't be loaded again (Kick's /<name>/offline shows its error page then, see stuck.js).
function reloadPage(w){
  if (w.kind === 'stream') loadView(w.view, srcFor(w)); else reloadView(w.view);
}
function mountView(w){
  if (w.kind === 'capture'){ mountCapture(w); return; }
  // At start-up a Kick player waits (up to 2 s) for whether a linked Pear Drops is farming (platforms/pear-drops.js)
  if (kickHold && w.kind === 'stream' && !w.view && platOf(w.channel) === 'kick'){ kickHold.then(() => { if (!w.view && wins.includes(w)) mountView(w); }); return; }
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
    frame.addEventListener('focus', () => viewTouched(w, frame));
    frame.addEventListener('pointerdown', () => viewTouched(w, frame));          // a press this page gets for the view (Linux, after it was scaled)
    // a raid moves the chat (or player) to another channel: follow it with every window of this channel
    const nav = e => { if (e.isMainFrame !== false && w.view === frame){ watchRaid(w, e.url); watchStuck(w); } };
    frame.addEventListener('did-navigate', nav);
    frame.addEventListener('did-navigate-in-page', nav);
    // Every web view starts with its sound off (main.js); a stream's stays off, also while it loads again,
    // until its volume / mute is on the player, so one that should be muted never plays a moment of sound.
    if (hasVol) frame.addEventListener('did-start-navigation', e => {
      if (e.isMainFrame && !e.isInPlace && w.view === frame && w.ready){ w.audioHeld = w.audioLoading = true; setMuted(frame, true); }
    });
    // a new page (another video, or loaded again): its like state is read again (see readLike)
    if (w.kind === 'stream' && platOf(w.channel) === 'youtube') frame.addEventListener('did-start-navigation', e => {
      if (e.isMainFrame && !e.isInPlace && w.view === frame){ w.like = null; syncLike(w); }
    });
    // Download from an emote card (see emoteAgent): the chat page asks through a console message
    if (w.kind === 'chat') frame.addEventListener('console-message', e => siteMessage(w, frame, e.message));   // (see fromSite)
    frame.addEventListener('dom-ready', () => {
      w.ready = true;
      if (w.kind === 'stream') trimPlayerPage(frame, w.channel);
      if (hasVol){ w.enforceUntil = Date.now() + 8000; pushVol(w); w.audioHeld = true; w.audioLoading = false; liftAudioSoon(w); }
      else setMuted(frame, false);
      if (w.kind === 'stream'){ w.sentPause = false; applyPlay(w); watchStuck(w); }
      if (w.kind === 'chat') setZoom(frame, chatZoom());
      if (w.kind === 'stream' && w.hiddenTab) setTimeout(() => playQuality(w), 4000);   // a tab you're not watching (windows/frames.js)
      if (w.kind === 'chat' && w === blownWin()) blowUp(w, true);
      if (w.kind === 'chat') { const css = platform(w.channel).chatCss; if (css) addCss(frame, css); }
      if (w.kind === 'chat' && ROLE === 'main') injectMention(w);
      if (w.kind === 'chat') runIn(frame, `${EMOTE_JS};window.__kmvEmote.on(${emoteOn})`);
      if (w.kind === 'chat' && newEmotesOn) markNewEmotes(w);
      if (w.kind === 'chat') runIn(frame, MESSAGE_JS);       // the message you right-click (Copy message)
      if (w.kind === 'chat') feedReady(w, frame);            // its messages for the ALL tab, while it shows (chat/all-chat.js)
      if (w.kind === 'chat') runIn(frame, `(${tabKeyAgent})();${tabKeyJs(w)}`);   // Tab in an empty chat box: the next site's tab (windows/frames.js)
      if (w.kind === 'chat') runIn(frame, `${TRANSLATE_JS};${autoTrFor(w.channel) ? 'window.__kmvTr.start(true)' : ''}`);
      if (w.kind === 'chat' && platform(w.channel).pageCommands) runIn(frame, KICK_CMD_JS);
      if (w.kind === 'chat') syncChatName(w);                // Channel name in chat boxes (chat/chat-name.js)
      if (w.kind === 'chat') startStick(w);                  // stays at its newest messages (chat/stick-bottom.js)
      if (w.kind === 'chat') focusBoxNow(w);                 // Tab switched to it while it loaded (windows/frames.js)
      applyChatView(w);
    });
  }
}
// New emotes (Settings > Chat, off unless switched on): ask the app which are new for this channel, mark them,
// and say so once when there are newly added ones.
var newEmotesOn = false;
async function markNewEmotes(w){
  if (!DESKTOP || !window.kmv.emotesOpen || !w.channel || !platform(w.channel).emoteLists) return;
  const frame = w.view;
  const r = await window.kmv.emotesOpen(w.channel).catch(() => null);
  if (!r || w.view !== frame || !newEmotesOn) return;
  await addCss(frame, NEW_EMOTE_CSS());
  runIn(frame, `${NEW_EMOTE_JS};window.__kmvNew.set(${JSON.stringify(r.fresh || [])})`);
  const a = r.added || [];
  if (a.length) flash(`${chLabel(w.channel)} has ${a.length === 1 ? 'a new emote' : a.length + ' new emotes'}: ${a.slice(0, 5).join(', ')}${a.length > 5 ? ` and ${a.length - 5} more` : ''}`);
}
function newEmoteSeen(w, json){
  let d; try { d = JSON.parse(json); } catch { return; }
  if (!d || typeof d.name !== 'string' || !window.kmv.emotesSeen) return;
  window.kmv.emotesSeen(w.channel, d.name).catch(() => {});
  // the same channel's other chat windows: not new there either
  wins.forEach(o => { if (o !== w && o.kind === 'chat' && o.channel === w.channel && o.ready) runIn(o.view, `window.__kmvNew && window.__kmvNew.set(window.__kmvNew.list().filter(n => n !== ${JSON.stringify(d.name)}))`); });
}
// The hover card is off unless switched on (the same preview is always in the right-click menu on an emote)
var emoteOn = false;
// Other files change these through viewVars: a variable imported from another file can't be assigned to.
const viewVars = {
  get newEmotesOn(){ return newEmotesOn; }, set newEmotesOn(v){ newEmotesOn = v; },
  get emoteOn(){ return emoteOn; }, set emoteOn(v){ emoteOn = v; },
};
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

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  newEmotesOn = settings.flag('newEmotes');
  fromSite('emote-seen', (w, json, view) => { if (w.view === view) newEmoteSeen(w, json); });
  emoteOn = settings.flag('emotePreview');
  // "Copy image" on an emote card: the app fetches the picture (only from the emote sites) and copies a still of it
  fromSite('emote-copy', (w, json) => copyEmote(json));
  if (DESKTOP) fromApp('onViewPressed', id => { const w = wins.find(x => x.view && viewId(x.view) === id); if (w) viewTouched(w, w.view); });
  store.watch('live', () => followYtStreams());
  window.ytFollow_ = { reloadWin, followYtStreams };   // for the tests
}

export { emoteOn, init, markNewEmotes, mountView, newEmotesOn, pngOf, reloadPage, reloadWin, viewVars, ytCache };
