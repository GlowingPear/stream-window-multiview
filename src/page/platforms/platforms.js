import { wins } from '../core.js';
import { kick } from './kick.js';
import { kickAuto, kickOut, reportPlayers } from './pear-drops.js';
import { effectiveSignedIn } from './players-link.js';
import { twitch } from './twitch.js';
import { syncLike } from './youtube-options.js';
import { youtube } from './youtube.js';
import { DESKTOP } from '../shared/env.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { addCss, runIn } from '../windows/view.js';
import { mountView } from '../windows/views.js';

/* ---------- URL parsing ---------- */
/* ---------- platforms ----------
   Channel ids: Kick "name", Twitch "tw:name", YouTube "yt:@handle" | "yt:c:UC…" | "yt:v:VIDEOID" (a specific video).
   Each site's own details (addresses, links, what it can do) are in kick.js, twitch.js and youtube.js:
   platform(ch) is a channel's. */
const PLATFORMS = { kick, twitch, youtube };
const DEFAULT_SITE = kick;     // a bare name is a Kick channel (unless a Channels tab says otherwise)
let PLAT_NAME;
// Small platform badge (K / T / Y in each platform's colour) shown next to channel names.
const platIcon = p => `<i class="pi pi-${p}" title="${PLAT_NAME[p]}" aria-label="${PLAT_NAME[p]}">${(PLATFORMS[p] || {}).letter || '?'}</i>`;
const platOf = ch => !ch ? '' : /^tw:/i.test(ch) ? 'twitch' : /^yt:/i.test(ch) ? 'youtube' : 'kick';
const platform = ch => PLATFORMS[platOf(ch)];
// Display names learned from the sites (live checks, follows imports, profiles, YouTube pages), so channels show as
// "PixelBandit" rather than their id "pixelbandit". Kick and Twitch: only the same handle in other capitals (Twitch
// names in another script would hide which channel it is). YouTube: the name of a channel or video id ("@handles" stay).
const NAMES = 'chNames';   // (a saved setting: shared/settings.js)
const chNames = {};
const handleKey = s => String(s).toLowerCase().replace(/[-_]/g, '');   // Kick turns "Retro_Rally" into retro-rally
function nameFits(ch, name){
  if (name === ch) return false;
  const p = platform(ch);
  if (p.namedBySite) return p.namedBySite(ch);
  const id = p.handle(ch);
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
  settings.set(NAMES, chNames);
  namesChanged(changed);
}
const rememberName = (ch, name) => rememberNames({ [ch]: name });
function namesChanged(chs){
  wins.forEach(w => { if (chs.includes(w.channel)) w.el.querySelector('.title').textContent = chLabel(w.channel); });
  store.changed('names');
}
const infoNames = snap => Object.fromEntries(Object.entries(snap || {}).filter(([, i]) => i && !i.missing).map(([ch, i]) => [ch, i.name]));
function chLabel(ch){
  if (!ch) return '';
  if (chNames[ch]) return chNames[ch];
  return platform(ch).label(ch);
}
const chLabelP = ch => chLabel(ch) + (platform(ch) === DEFAULT_SITE ? '' : ' · ' + platform(ch).name);
function normCh(c){ c = String(c || '').trim(); return /^yt:(v|c):/i.test(c) ? 'yt:' + c.slice(3, 5).toLowerCase() + c.slice(5) : c.toLowerCase(); }

// Turn whatever was typed or pasted into a channel. Plain names use `plat` (Kick unless a Saved tab says otherwise).
// A link: each site's fromUrl() says whether it's its own, and which channel; any other link opens as a web page.
function parseInput(raw, plat = 'kick'){
  raw = String(raw || '').trim(); if (!raw) return null;
  let m;
  if ((m = raw.match(/^(?:tw|twitch)\s*:\s*([A-Za-z0-9_]{1,25})$/i))) return { channel: 'tw:' + m[1].toLowerCase(), only: null };
  if ((m = raw.match(/^(?:yt|youtube)\s*:\s*@?([\w.\-]{2,100})$/i))) return { channel: 'yt:@' + m[1].toLowerCase(), only: null };
  if ((m = raw.match(/^@([\w.\-]{2,100})$/))) return { channel: 'yt:@' + m[1].toLowerCase(), only: null };
  if (/^[A-Za-z0-9_-]+$/.test(raw)){
    const n = raw.toLowerCase();
    return { channel: (PLATFORMS[plat] || DEFAULT_SITE).idFor(n), only: null };
  }
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  for (const p of Object.values(PLATFORMS)){ const r = p.fromUrl(host, parts, u); if (r !== undefined) return r; }
  return { url: u.href, only: 'web' };
}

// A site whose player is its whole watch page (YouTube): trimmed to just the player.
function trimPlayerPage(view, ch){
  const p = ch && platform(ch);
  if (!p || !p.playerCss) return;
  addCss(view, p.playerCss);
  runIn(view, p.playerFitJs);
}

// Addresses for each platform's player and chat. YouTube needs the live video's id (looked up when needed).
const ytVidOf = w => /^yt:v:/.test(w.channel || '') ? w.channel.slice(5) : (w.ytVid || null);
const streamSrc = (ch, muted, vid) => (platform(ch) || DEFAULT_SITE).streamUrl(ch, muted, vid);
const chatSrc = (ch, vid) => (platform(ch) || DEFAULT_SITE).chatUrl(ch, vid);
// Each platform's moderator dashboard for a channel (YouTube has none for each channel).
const modUrl = ch => ch ? platform(ch).modUrl(ch) : null;
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
const externalFor = w => w.channel ? platform(w.channel).pageUrl(w.channel, w.kind, ytVidOf(w)) : w.url;
const chatPartition = ch => (platform(ch) || DEFAULT_SITE).partition;
// "Watch signed in" (account menu, per site): that site's stream players use your login too,
// so you watch as your account. Off: each stream player gets its own logged-out storage.
// Kick's players sign out while a linked Pear Drops is farming (Settings › Connected apps, pear-drops.js).
var watchSignedIn = { kick: false, twitch: false, youtube: false };
const streamSignedIn = p => effectiveSignedIn(p, { auto: kickAuto(), out: kickOut, watch: watchSignedIn });
const streamPartition = ch => streamSignedIn(platOf(ch)) ? chatPartition(ch) : 'persist:kmv-stream-' + String(ch).replace(/[^a-z0-9_-]/gi, '_');
const mountedSignedIn = {};             // whether each site's open players were made signed in
let extCount = null;                    // Chrome extensions installed (null: not known yet)
// Other files change these through platformVars: a variable imported from another file can't be assigned to.
const platformVars = {
  get extCount(){ return extCount; }, set extCount(v){ extCount = v; },
};
// a web page that isn't a stream or a chat gets storage of its own, without your logins
const viewPartition = w => w.kind === 'stream' ? streamPartition(w.channel) : w.kind === 'chat' ? chatPartition(w.channel) : 'persist:kmv-web';
// A player can't move to other storage, so that site's open streams start again in a new player.
function remountStreams(p){
  if (!DESKTOP) return;
  wins.forEach(w => {
    if (w.kind !== 'stream' || !w.view || platOf(w.channel) !== p) return;
    w.view.remove(); w.view = null; w.ready = false; w.sentPause = false; w.like = null; syncLike(w);
    mountView(w);
  });
}
// A site's players start again in other storage when whether they're signed in changed.
function syncStreams(p){
  const now = streamSignedIn(p);
  if (mountedSignedIn[p] === now) return;
  mountedSignedIn[p] = now;
  remountStreams(p);
}
function setWatchSignedIn(p, on){
  if (!(p in watchSignedIn) || watchSignedIn[p] === !!on) return;
  watchSignedIn[p] = !!on;
  settings.set('watchSignedIn', watchSignedIn);
  syncStreams(p);
  reportPlayers();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  PLAT_NAME = Object.fromEntries(Object.values(PLATFORMS).map(p => [p.id, p.name]));
  Object.assign(chNames, settings.json('ytNames', {}), settings.json(NAMES, {}));
  settings.onChange(NAMES, (_, v) => {          // learned in the other window
    let got = {}; try { got = JSON.parse(v || '{}') || {}; } catch {}
    const changed = Object.keys(got).filter(ch => typeof got[ch] === 'string' && chNames[ch] !== got[ch]);
    changed.forEach(ch => { chNames[ch] = got[ch]; });
    if (changed.length) namesChanged(changed);
  });
  { const ws = settings.json('watchSignedIn', {}); for (const p in watchSignedIn) watchSignedIn[p] = ws[p] === true; }
  for (const p in watchSignedIn) mountedSignedIn[p] = streamSignedIn(p);
  settings.onChange('watchSignedIn', (_, v) => {          // changed in the other window
    let ws = {}; try { ws = JSON.parse(v || '{}') || {}; } catch {}
    for (const p in watchSignedIn) if (watchSignedIn[p] !== (ws[p] === true)){ watchSignedIn[p] = ws[p] === true; syncStreams(p); }
    reportPlayers();
  });
}

export { chatSrc, checkMod, chLabel, chLabelP, extCount, externalFor, infoNames, init, modOk, modUrl, normCh,
  parseInput, PLAT_NAME, platform, platformVars, platIcon, platOf, rememberName, rememberNames, setWatchSignedIn,
  srcFor, streamSignedIn, streamSrc, syncStreams, trimPlayerPage, viewPartition, watchSignedIn, ytVidOf };
