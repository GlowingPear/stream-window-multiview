import '../in-site/volume.js';   // runs after it (see app.js)
import { wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { mountView } from '../windows/views.js';
import { renderSaved } from '../panels/channels/channels.js';
import { schedulePicks } from '../windows/channel-picker.js';
import { syncLike } from './youtube-options.js';

/* ---------- URL parsing ---------- */
/* ---------- platforms ----------
   Channel ids: Kick "name", Twitch "tw:name", YouTube "yt:@handle" | "yt:c:UC…" | "yt:v:VIDEOID" (a specific video). */
const PLAT_NAME = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };
// Small platform badge (K / T / Y in each platform's colour) shown next to channel names.
const platIcon = p => `<i class="pi pi-${p}" title="${PLAT_NAME[p]}" aria-label="${PLAT_NAME[p]}">${({ kick: 'K', twitch: 'T', youtube: 'Y' })[p] || '?'}</i>`;
const platOf = ch => !ch ? '' : /^tw:/i.test(ch) ? 'twitch' : /^yt:/i.test(ch) ? 'youtube' : 'kick';
// Display names learned from the sites (live checks, follows imports, profiles, YouTube pages), so channels show as
// "PixelBandit" rather than their id "pixelbandit". Kick and Twitch: only the same handle in other capitals (Twitch
// names in another script would hide which channel it is). YouTube: the name of a channel or video id ("@handles" stay).
const NAMES = 'kickMultiview.chNames';
const chNames = {};
try { Object.assign(chNames, JSON.parse(localStorage.getItem('kickMultiview.ytNames') || '{}'), JSON.parse(localStorage.getItem(NAMES) || '{}')); } catch {}
const handleKey = s => String(s).toLowerCase().replace(/[-_]/g, '');   // Kick turns "Retro_Rally" into retro-rally
function nameFits(ch, name){
  if (name === ch) return false;
  if (platOf(ch) === 'youtube') return /^yt:(v|c):/.test(ch);
  const id = platOf(ch) === 'twitch' ? ch.slice(3) : ch;
  return name !== id && handleKey(name) === handleKey(id);
}
// names: { channel: name }. Saves and redraws only when something changed.
function rememberNames(names){
  const changed = [];
  for (const [ch, n] of Object.entries(names || {})){
    const name = typeof n === 'string' ? n.trim().slice(0, 100) : '';
    if (!ch || !name || chNames[ch] === name || !nameFits(ch, name)) continue;
    chNames[ch] = name; changed.push(ch);
  }
  if (!changed.length) return;
  try { localStorage.setItem(NAMES, JSON.stringify(chNames)); } catch {}
  namesChanged(changed);
}
const rememberName = (ch, name) => rememberNames({ [ch]: name });
function namesChanged(chs){
  wins.forEach(w => { if (chs.includes(w.channel)) w.el.querySelector('.title').textContent = chLabel(w.channel); });
  schedulePicks();
  renderSaved();
}
window.addEventListener('storage', e => {          // learned in the other window
  if (e.key !== NAMES) return;
  let got = {}; try { got = JSON.parse(e.newValue || '{}') || {}; } catch {}
  const changed = Object.keys(got).filter(ch => typeof got[ch] === 'string' && chNames[ch] !== got[ch]);
  changed.forEach(ch => { chNames[ch] = got[ch]; });
  if (changed.length) namesChanged(changed);
});
const infoNames = snap => Object.fromEntries(Object.entries(snap || {}).filter(([, i]) => i && !i.missing).map(([ch, i]) => [ch, i.name]));
function chLabel(ch){
  if (!ch) return '';
  if (chNames[ch]) return chNames[ch];
  const p = platOf(ch);
  if (p === 'twitch') return ch.slice(3);
  if (p === 'youtube'){ const r = ch.slice(3); return /^(v|c):/.test(r) ? (r[0] === 'v' ? 'YouTube video' : 'YouTube channel') : r; }
  return ch;
}
const chLabelP = ch => chLabel(ch) + (platOf(ch) === 'kick' ? '' : ' · ' + PLAT_NAME[platOf(ch)]);
function normCh(c){ c = String(c || '').trim(); return /^yt:(v|c):/i.test(c) ? 'yt:' + c.slice(3, 5).toLowerCase() + c.slice(5) : c.toLowerCase(); }

// Turn whatever was typed or pasted into a channel. Plain names use `plat` (Kick unless a Saved tab says otherwise).
function parseInput(raw, plat = 'kick'){
  raw = String(raw || '').trim(); if (!raw) return null;
  let m;
  if ((m = raw.match(/^(?:tw|twitch)\s*:\s*([A-Za-z0-9_]{1,25})$/i))) return { channel: 'tw:' + m[1].toLowerCase(), only: null };
  if ((m = raw.match(/^(?:yt|youtube)\s*:\s*@?([\w.\-]{2,100})$/i))) return { channel: 'yt:@' + m[1].toLowerCase(), only: null };
  if ((m = raw.match(/^@([\w.\-]{2,100})$/))) return { channel: 'yt:@' + m[1].toLowerCase(), only: null };
  if (/^[A-Za-z0-9_-]+$/.test(raw)){
    const n = raw.toLowerCase();
    return { channel: plat === 'twitch' ? 'tw:' + n : plat === 'youtube' ? 'yt:@' + n : n, only: null };
  }
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'kick.com' || host.endsWith('.kick.com')) {
    if (parts[0] === 'popout' && parts[1]) return { channel: parts[1].toLowerCase(), only: 'chat' };
    if (parts[0] && parts[1] === 'chatroom') return { channel: parts[0].toLowerCase(), only: 'chat' };
    if (parts[0]) return { channel: parts[0].toLowerCase(), only: null };
    return null;
  }
  if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
    const q = u.searchParams.get('channel');
    if (host.startsWith('player.') && q) return { channel: 'tw:' + q.toLowerCase(), only: null };
    if ((parts[0] === 'popout' || parts[0] === 'embed') && parts[1]) return { channel: 'tw:' + parts[1].toLowerCase(), only: parts[2] === 'chat' ? 'chat' : null };
    if (parts[0] && /^[A-Za-z0-9_]{1,25}$/.test(parts[0]) && !['directory', 'videos', 'settings', 'search', 'downloads', 'p', 'subscriptions', 'inventory', 'wallet', 'drops'].includes(parts[0].toLowerCase()))
      return { channel: 'tw:' + parts[0].toLowerCase(), only: parts[1] === 'chat' ? 'chat' : null };
    return null;
  }
  if (host === 'youtu.be' && /^[\w-]{11}$/.test(parts[0] || '')) return { channel: 'yt:v:' + parts[0], only: null };
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const v = u.searchParams.get('v');
    if (parts[0] === 'live_chat' && v) return { channel: 'yt:v:' + v, only: 'chat' };
    if (parts[0] === 'watch' && /^[\w-]{11}$/.test(v || '')) return { channel: 'yt:v:' + v, only: null };
    if (['live', 'shorts', 'embed', 'v'].includes(parts[0]) && /^[\w-]{11}$/.test(parts[1] || '')) return { channel: 'yt:v:' + parts[1], only: null };
    if (parts[0] && parts[0].startsWith('@')) return { channel: 'yt:' + parts[0].toLowerCase(), only: null };
    if (parts[0] === 'channel' && /^UC[\w-]{10,40}$/.test(parts[1] || '')) return { channel: 'yt:c:' + parts[1], only: null };
    return null;
  }
  return { url: u.href, only: 'web' };
}

// Turns a YouTube watch page into a bare player that fills the window.
const YT_PLAYERS = '#movie_player, ytd-reel-video-renderer[is-active] #shorts-player';
const YT_CSS = `
html, body { overflow: hidden !important; background: #000 !important; }
ytd-app { visibility: hidden !important; }
ytd-app, ytd-page-manager, ytd-watch-flexy, ytd-shorts, #columns, #primary, #primary-inner, #player,
#player-container-outer, #player-container-inner, #player-container, #ytd-player, #container.ytd-player,
#full-bleed-container, #player-full-bleed-container, #player-theater-container, ytd-reel-video-renderer,
#shorts-container, #shorts-inner-container, ytd-player, #player-wide-container {
  contain: none !important; transform: none !important; filter: none !important; will-change: auto !important; }
${YT_PLAYERS} {
  visibility: visible !important; position: fixed !important; inset: 0 !important;
  width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important;
  margin: 0 !important; border-radius: 0 !important; z-index: 2147483646 !important; background: #000 !important; }
${YT_PLAYERS.split(', ').map(x => x + ' .html5-video-container').join(', ')} { width: 100% !important; height: 100% !important; }
${YT_PLAYERS.split(', ').map(x => x + ' video.html5-main-video').join(', ')} {
  width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; object-fit: contain !important; }
.ytp-chrome-bottom { left: 12px !important; right: 12px !important; width: auto !important; }
.ytp-miniplayer-button, .ytp-size-button, .ytp-fullscreen-button { display: none !important; }
/* Two of YouTube's questions keep the video paused until answered (the cookie question, "Continue watching?"):
   show those over the player. Its other pop-ups (offers, promos) stay hidden. */
ytd-consent-bump-v2-lightbox, ytd-popup-container tp-yt-paper-dialog:has(yt-confirm-dialog-renderer) { visibility: visible !important; }
ytd-popup-container, ytd-consent-bump-v2-lightbox { position: relative !important; z-index: 2147483647 !important; }
`;
// Nudges YouTube's player to re-measure itself after the CSS above resizes it.
const YT_FIT_JS = `(function(){
  const kick = () => window.dispatchEvent(new Event('resize'));
  if (!window.__kmvYt){
    window.__kmvYt = true;
    window.addEventListener('yt-navigate-finish', () => [100, 600, 1500].forEach(t => setTimeout(kick, t)));
  }
  [0, 300, 1000, 2500, 5000].forEach(t => setTimeout(kick, t));
})()`;
// Kick's popout chat places a user's card (click a name) to the left of the chat, as on kick.com,
// which is off the window's left edge here. Keep it inside the window.
const KICK_CHAT_CSS = `#user-identity { left: 0 !important; right: auto !important; width: min(356px, 100vw) !important;
  max-height: 100vh !important; overflow-y: auto !important; }`;
// Twitch's user card is 340px wide, so in a narrower chat its right side (with the close button) is cut off.
const TWITCH_CHAT_CSS = `.viewer-card-layer__draggable { max-width: 100vw !important; left: 0 !important; }
.viewer-card-layer__draggable .viewer-card { width: auto !important; max-width: 100vw !important; min-width: 0 !important; }`;
function trimYouTube(view, ch){
  if (!ch || platOf(ch) !== 'youtube') return;
  try { view.insertCSS(YT_CSS); } catch {}
  view.executeJavaScript(YT_FIT_JS).catch(() => {});
}

// Addresses for each platform's player and chat. YouTube needs the live video's id (looked up when needed).
const ytVidOf = w => /^yt:v:/.test(w.channel || '') ? w.channel.slice(5) : (w.ytVid || null);
function streamSrc(ch, muted, vid){
  const p = platOf(ch);
  if (p === 'twitch') return `https://player.twitch.tv/?channel=${encodeURIComponent(ch.slice(3))}&parent=localhost&autoplay=true&muted=${muted ? 'true' : 'false'}`;
  // YouTube blocks its embedded player inside apps (error 152-4), so streams load the normal
  // watch page and YT_CSS trims it down to just the player.
  if (p === 'youtube') return vid ? `https://www.youtube.com/watch?v=${vid}` : null;
  return `https://player.kick.com/${encodeURIComponent(ch)}?autoplay=true&muted=${muted ? 'true' : 'false'}`;
}
function chatSrc(ch, vid){
  const p = platOf(ch);
  if (p === 'twitch') return `https://www.twitch.tv/popout/${encodeURIComponent(ch.slice(3))}/chat?popout=`;
  if (p === 'youtube') return vid ? `https://www.youtube.com/live_chat?is_popout=1&v=${vid}` : null;
  return `https://kick.com/popout/${encodeURIComponent(ch)}/chat`;
}
// Each platform's moderator dashboard for a channel (YouTube has none for each channel).
function modUrl(ch){
  const p = platOf(ch);
  if (!ch || /^yt:/i.test(ch)) return null;
  if (p === 'twitch') return `https://www.twitch.tv/moderator/${encodeURIComponent(ch.slice(3))}`;
  return `https://dashboard.kick.com/moderator/${encodeURIComponent(ch)}`;
}
// The mod view button only shows where you can moderate (in the desktop app, which can ask the site
// with your login). Asked once per channel, and again on Reload or a new login.
const modOk = new Map();
function checkMod(w, fresh){
  const b = w.el.querySelector('[data-a=mod]');
  if (!b || !DESKTOP || !window.kmv.modCheck) return;
  if (fresh || !modOk.has(w.channel)) modOk.set(w.channel, window.kmv.modCheck(w.channel).catch(() => null));
  modOk.get(w.channel).then(ok => { b.hidden = ok !== true; });
}
const srcFor = w => w.kind === 'stream' ? streamSrc(w.channel, w.muted, ytVidOf(w)) : w.kind === 'chat' ? chatSrc(w.channel, ytVidOf(w)) : w.url;
function externalFor(w){
  const ch = w.channel, p = platOf(ch), vid = ch ? ytVidOf(w) : null;
  if (!ch) return w.url;
  if (p === 'twitch') return w.kind === 'chat' ? chatSrc(ch) : `https://www.twitch.tv/${ch.slice(3)}`;
  if (p === 'youtube'){
    if (w.kind === 'chat' && vid) return chatSrc(ch, vid);
    if (vid) return `https://www.youtube.com/watch?v=${vid}`;
    return ch.startsWith('yt:c:') ? `https://www.youtube.com/channel/${ch.slice(5)}/live` : `https://www.youtube.com/${ch.slice(3)}/live`;
  }
  return w.kind === 'chat' ? chatSrc(ch) : `https://kick.com/${encodeURIComponent(ch)}`;
}
const chatPartition = ch => ({ twitch: 'persist:twitch', youtube: 'persist:youtube' })[platOf(ch)] || 'persist:kick';
// "Watch signed in" (account menu, per site): that site's stream players use your login too,
// so you watch as your account. Off: each stream player gets its own logged-out storage.
var watchSignedIn = { kick: false, twitch: false, youtube: false };
try { const ws = JSON.parse(localStorage.getItem('kickMultiview.watchSignedIn') || '{}'); for (const p in watchSignedIn) watchSignedIn[p] = ws[p] === true; } catch {}
const streamPartition = ch => watchSignedIn[platOf(ch)] ? chatPartition(ch) : 'persist:kmv-stream-' + String(ch).replace(/[^a-z0-9_-]/gi, '_');
let extCount = null;                    // Chrome extensions installed (null: not known yet)
// Other files change these through platformVars: a variable imported from another file can't be assigned to.
const platformVars = {
  get extCount(){ return extCount; }, set extCount(v){ extCount = v; },
};
const viewPartition = w => w.kind === 'stream' ? streamPartition(w.channel) : w.kind === 'chat' ? chatPartition(w.channel) : 'persist:kick';
// A player can't move to other storage, so that site's open streams start again in a new player.
function remountStreams(p){
  if (!DESKTOP) return;
  wins.forEach(w => {
    if (w.kind !== 'stream' || !w.view || platOf(w.channel) !== p) return;
    w.view.remove(); w.view = null; w.ready = false; w.sentPause = false; w.like = null; syncLike(w);
    mountView(w);
  });
}
function setWatchSignedIn(p, on){
  if (!(p in watchSignedIn) || watchSignedIn[p] === !!on) return;
  watchSignedIn[p] = !!on;
  try { localStorage.setItem('kickMultiview.watchSignedIn', JSON.stringify(watchSignedIn)); } catch {}
  remountStreams(p);
}
window.addEventListener('storage', e => {          // changed in the other window
  if (e.key !== 'kickMultiview.watchSignedIn') return;
  let ws = {}; try { ws = JSON.parse(e.newValue || '{}') || {}; } catch {}
  for (const p in watchSignedIn) if (watchSignedIn[p] !== (ws[p] === true)){ watchSignedIn[p] = ws[p] === true; remountStreams(p); }
});

export { chatSrc, checkMod, chLabel, chLabelP, extCount, externalFor, infoNames, KICK_CHAT_CSS, modOk, modUrl,
  normCh, parseInput, PLAT_NAME, platformVars, platIcon, platOf, rememberName, rememberNames, setWatchSignedIn,
  srcFor, streamSrc, trimYouTube, TWITCH_CHAT_CSS, viewPartition, watchSignedIn, YT_CSS, YT_FIT_JS, ytVidOf };
