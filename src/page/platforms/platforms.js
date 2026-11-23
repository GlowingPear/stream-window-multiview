import { wins } from '../core.js';
import { nameOf } from './linked.js';
import { kickAuto, kickOut, reportPlayers } from './pear-drops.js';
import { PEAR_SITE, effectiveSignedIn } from './players-link.js';
import { element, esc } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { PLATFORMS } from '../sites/sites.js';
import { syncLike } from '../windows/likes.js';
import { addCss, runIn } from '../windows/view.js';
import { mountView } from '../windows/views.js';

/* ---------- platforms ----------
   Channel ids: Kick "name", Twitch "tw:name", YouTube "yt:@handle" | "yt:c:UC…" | "yt:v:VIDEOID" (a specific video).
   The list of sites and their ids is src/shared/sites.js (window.SmvSites), which the main process shares. Each
   site's own details for the page (addresses, links, what it can do, its parts) are in its folder (sites/<id>/site.js),
   and sites/sites.js lists them (PLATFORMS): platform(ch) is a channel's. A new site: README.md, "Adding a site". */
let DEFAULT_SITE;              // a bare name is a channel of the site with no prefix (Kick), unless a Channels tab says otherwise
// the sites' ids, in the shared list's order
const siteIds = () => Object.keys(PLATFORMS);
const sites = () => Object.values(PLATFORMS);
// A slot's value on a site, by its path in sites/adapter.js ('spamAlerts', 'login.firefox', 'chat.hypeTrains')
const slotOf = (site, path) => String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), site);
// Whether a site has something: a slot's path, or a list slot's path and a kind in it ('support.finds:bits')
const siteHas = (site, path) => { const [slot, kind] = String(path).split(':'), v = slotOf(site, slot); return kind ? Array.isArray(v) && v.some(x => x && x.kind === kind) : !!v; };
// The sites that have something (siteHas; none: every site), in the shared list's order
const sitesWith = path => sites().filter(p => !path || siteHas(p, path));
// The one site that has something ('login.firefox': YouTube): its name
const siteWith = path => (sitesWith(path)[0] || {}).name || '';
// The sites that do shoutouts (their module's `shoutouts`: chat/shoutout.js)
const shoutSites = () => sitesWith('shoutouts').map(p => p.id);
const shoutSiteNames = () => siteNames('or', 'shoutouts');
// Who holds a site's held messages: "AutoMod" (its held.by), or '' for the site itself ("held for review"); and as said
// in a sentence ("AutoMod", "YouTube")
const heldByOf = site => ((PLATFORMS[site] || {}).held || {}).by || '';
// "Denied" (Twitch), "Hidden" (YouTube): a held message its moderators turned down
const deniedWord = site => { const d = ((PLATFORMS[site] || {}).held || {}).denied || 'denied'; return d[0].toUpperCase() + d.slice(1); };
const heldWho = site => heldByOf(site) || (PLAT_NAME || {})[site] || '';
// The sites' names in a sentence: "Kick, Twitch, YouTube or Rumble"; with a slot's path, the ones that have it
// (siteNames('and', 'spamAlerts'): "Kick, Twitch and Rumble"). Never write a site's name in the page: ask for it.
const siteNames = (and = 'or', path) => { const n = sitesWith(path).map(p => p.name); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ` ${and} ` + n[n.length - 1]; };
// The sites' names in the page's markup (index.html), filled in as it starts, so it never spells out a site:
//   {sites}, {sites or}, {sites and spamAlerts}  the names in a sentence (siteNames): all of them, or the ones with a slot
//   {site login.firefox}                          the one site with a slot
//   {name}                                        the site its nearest data-site="<id>" is for (a site's own Settings page)
//   {pear}                                        the site Pear Drops farms (players-link.js)
// in text and in attributes (title, placeholder, data-st-sub, …). A row for each site is a <template data-each-site>
// (data-each-site="<slot>": each site with it), copied for each with {id}, {name}, {letter} and {me} (what your name
// there looks like: "username", "@handle") filled in, and data-site="{id}" for its {name}s; an element with data-first
// in it only stays in the first site's copy.
const SITE_TOKEN = /\{(sites|site|name|pear)(?: ([^{}]*))?\}/g;
function siteToken(el, kind, arg = ''){
  const [join, path] = /^(and|or)\b/.test(arg) ? [arg.split(' ')[0], arg.split(' ')[1]] : ['and', arg || undefined];
  if (kind === 'sites') return siteNames(join, path);
  if (kind === 'site') return siteWith(arg);
  if (kind === 'pear') return PLAT_NAME[PEAR_SITE];
  const at = el && el.closest('[data-site]');
  return at ? PLAT_NAME[at.dataset.site] || '' : '';
}
function fillSiteNames(root = document){
  root.querySelectorAll('template[data-each-site]').forEach(t => {
    const html = t.innerHTML;
    sitesWith(t.dataset.eachSite).forEach((p, i) => {
      const me = p.me ? (p.me.at ? '@' : '') + p.me.word : '';
      const row = document.createElement('template');
      row.innerHTML = html.replace(/\{(id|name|letter|me)\}/g, (_, k) => esc(k === 'id' ? p.id : k === 'name' ? p.name : k === 'letter' ? p.letter : me));
      row.content.querySelectorAll('[data-first]').forEach(e => { if (i) e.remove(); else e.removeAttribute('data-first'); });
      [...row.content.children].forEach(e => { if (!e.dataset.site) e.dataset.site = p.id; });
      t.before(row.content);
    });
    t.remove();
  });
  const fill = (el, v) => v.replace(SITE_TOKEN, (_, kind, arg) => siteToken(el, kind, arg));
  const walk = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes('{')) n.nodeValue = fill(n.parentElement, n.nodeValue);
  (root.body || root).querySelectorAll('*').forEach(el => { for (const a of el.attributes) if (a.value.includes('{')) a.value = fill(el, a.value); });
  if (root.title && root.title.includes('{')) root.title = fill(null, root.title);
}
let PLAT_NAME;
// A site's letter, from the list of sites ("K", "R"): on its badge and its tabs
const siteLetter = p => (PLATFORMS[p] || {}).letter || '?';
// A site's badge: its letter in its colour, next to channel names. platIcon(p) as markup; siteBadge(p, props, ...more)
// as an element: props as element()'s, their class added to "pi pi-<site>", tag: 'button' for one you press; more after
// the letter (a channel's number: chBadge in linked.js). Every badge is built here, so a new site needs nothing else.
const platIcon = p => `<i class="pi pi-${p}" title="${PLAT_NAME[p]}" aria-label="${PLAT_NAME[p]}">${siteLetter(p)}</i>`;
const siteBadge = (p, { tag = 'i', class: cls, ...props } = {}, ...more) => element(tag, { ...props, class: `pi pi-${p}${cls ? ' ' + cls : ''}` }, siteLetter(p), ...more);
const platOf = ch => SmvSites.siteOf(ch);
const platform = ch => PLATFORMS[platOf(ch)];
// One video rather than a channel ("yt:v:…"): no profile, no channel settings, no linking
const isVideo = ch => SmvSites.isVideo(ch);
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
  wins.forEach(w => { if (chs.includes(w.channel)) w.el.querySelector('.title').textContent = nameOf(w.channel); });
  store.changed('names');
}
const infoNames = snap => Object.fromEntries(Object.entries(snap || {}).filter(([, i]) => i && !i.missing).map(([ch, i]) => [ch, i.name]));
function chLabel(ch){
  if (!ch) return '';
  if (chNames[ch]) return chNames[ch];
  return platform(ch).label(ch);
}
const chLabelP = ch => chLabel(ch) + (platform(ch) === DEFAULT_SITE ? '' : ' · ' + platform(ch).name);
const normCh = c => SmvSites.normCh(c);

// Turn whatever was typed or pasted into a channel. A site's own short form ("tw:name", "@handle"): its fromText().
// Plain names use `plat` (the default site unless a Saved tab says otherwise). A link: each site's fromUrl() says
// whether it's its own, and which channel; any other link opens as a web page.
function parseInput(raw, plat){
  raw = String(raw || '').trim(); if (!raw) return null;
  for (const p of Object.values(PLATFORMS)){ const r = p.fromText(raw); if (r !== undefined) return r; }
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

// Addresses for each platform's player and chat. A site whose stream is a video of its own (liveVideo) needs the live
// video's id: the one a video's channel id holds (its videoId), else looked up when needed (w.ytVid).
const ytVidOf = w => (isVideo(w.channel || '') && platform(w.channel).videoId(w.channel)) || w.ytVid || null;
const streamSrc = (ch, muted, vid) => (platform(ch) || DEFAULT_SITE).streamUrl(ch, muted, vid);
const chatSrc = (ch, vid) => (platform(ch) || DEFAULT_SITE).chatUrl(ch, vid);
// Each platform's moderator dashboard for a channel (YouTube has none for each channel).
const modUrl = ch => ch ? platform(ch).modUrl(ch) : null;
// The mod view button only shows where you can moderate (in the desktop app, which can ask the site
// with your login). Asked once per channel, and again on Reload or a new login. modOk holds the question,
// modIs the answer once it's in; the button follows it (windows.js syncModBtn, which also knows about ALL).
const modOk = new Map(), modIs = new Map();
function checkMod(w, fresh){
  const b = w.el.querySelector('[data-a=mod]');
  if (!b || !DESKTOP || !window.kmv.modCheck || !modUrl(w.channel)) return;
  if (fresh || !modOk.has(w.channel)) modOk.set(w.channel, window.kmv.modCheck(w.channel).catch(() => null));
  const ch = w.channel;
  modOk.get(ch).then(ok => { if (modIs.get(ch) !== (ok === true)){ modIs.set(ch, ok === true); store.changed('mod'); } });
}
// Whether you moderate it, as far as the app knows (in a browser, where it can't ask, the button is always there)
const isModOf = ch => !!modUrl(ch) && (DESKTOP ? modIs.get(ch) === true : true);
// Its mod view, in a window of its own
function openModView(ch){
  const u = modUrl(ch); if (!u) return;
  if (DESKTOP) window.kmv.openWindow(u, 1400, 900);
  else window.open(u, 'kmv_mod_' + ch, 'width=1400,height=900');
}
const srcFor = w => w.kind === 'stream' ? streamSrc(w.channel, w.muted, ytVidOf(w)) : w.kind === 'chat' ? chatSrc(w.channel, ytVidOf(w)) : w.url;
const externalFor = w => w.channel ? platform(w.channel).pageUrl(w.channel, w.kind, ytVidOf(w)) : w.url;
// A window's pop-up (its title bar's buttons): the channel page ('page'), or just its chat ('chat': a chat window's)
function popUp(w, what){
  const url = externalFor(what === 'chat' ? w : { ...w, kind: 'stream' }), chat = what === 'chat';
  if (DESKTOP) window.kmv.openWindow(url, chat ? 380 : 1100, chat ? 760 : 700);
  else window.open(url, 'kmv_' + (chat ? 'chat' : 'page') + '_' + (w.channel || w.id), chat ? 'width=380,height=760' : 'width=1100,height=680');
}
// Who you're logged in as, as the desktop app reads it: fromPages, your name on the site that reads it from its pages
// (its login.fromPages: window.kmv.detectMe), and st, the others' from their logins (window.kmv.accountsStatus:
// { [site]: your name there, or whether you're signed in }); null when it can't say.
async function readLogins(){
  const fromPages = window.kmv.detectMe && sites().some(p => p.login.fromPages) ? await window.kmv.detectMe().catch(() => null) : null;
  const st = window.kmv.accountsStatus ? await window.kmv.accountsStatus().catch(() => null) : null;
  return { fromPages, st };
}
const chatPartition = ch => (platform(ch) || DEFAULT_SITE).partition;
// "Watch signed in" (account menu, per site): that site's stream players use your login too,
// so you watch as your account. Off: each stream player gets its own logged-out storage. On unless switched off.
// Kick's players sign out while a linked Pear Drops is farming (Settings › Connected apps, pear-drops.js).
var watchSignedIn = {};
// Saved with v: 2 since it's on by default. A value from before that is switched on once for every site (init())
const WATCH_V = 2;
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
  settings.set('watchSignedIn', { ...watchSignedIn, v: WATCH_V });
  syncStreams(p);
  reportPlayers();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  DEFAULT_SITE = PLATFORMS[SmvSites.DEFAULT];
  PLAT_NAME = Object.fromEntries(Object.values(PLATFORMS).map(p => [p.id, p.name]));
  fillSiteNames();
  for (const p of siteIds()) watchSignedIn[p] = true;
  Object.assign(chNames, settings.json('ytNames', {}), settings.json(NAMES, {}));
  settings.onChange(NAMES, (_, v) => {          // learned in the other window
    let got = {}; try { got = JSON.parse(v || '{}') || {}; } catch {}
    const changed = Object.keys(got).filter(ch => typeof got[ch] === 'string' && chNames[ch] !== got[ch]);
    changed.forEach(ch => { chNames[ch] = got[ch]; });
    if (changed.length) namesChanged(changed);
  });
  window.watchSignedIn = watchSignedIn;   // for the tests
  { const ws = settings.json('watchSignedIn', {}) || {};
    if (ws.v === WATCH_V) for (const p in watchSignedIn) watchSignedIn[p] = ws[p] !== false;
    else {
      // From before it was on by default: on for every site. While Pear Drops' Auto sets Kick, your own Kick
      // choice waits in link.kickBefore (pear-drops.js): it's switched on too, so Auto still signs Kick players
      // out while it farms, and turning Auto off gives you signed-in Kick players.
      settings.set('watchSignedIn', { ...watchSignedIn, v: WATCH_V });
      if (settings.json('link.kickBefore', null) === false) settings.set('link.kickBefore', 'true');
    }
  }
  for (const p in watchSignedIn) mountedSignedIn[p] = streamSignedIn(p);
  settings.onChange('watchSignedIn', (_, v) => {          // changed in the other window
    let ws = {}; try { ws = JSON.parse(v || '{}') || {}; } catch {}
    for (const p in watchSignedIn) if (watchSignedIn[p] !== (ws[p] !== false)){ watchSignedIn[p] = ws[p] !== false; syncStreams(p); }
    reportPlayers();
  });
}

export { chatSrc, checkMod, chLabel, chLabelP, chNames, deniedWord, extCount, externalFor, heldByOf, heldWho,
  infoNames, init, isModOf, isVideo, modIs, modOk, modUrl, normCh, openModView, parseInput, PLAT_NAME, platform,
  platformVars, platIcon, platOf, popUp, readLogins, rememberName, rememberNames, setWatchSignedIn, shoutSiteNames,
  shoutSites, siteBadge, siteIds, siteLetter, siteNames, sites, siteWith, srcFor, streamSignedIn, streamSrc,
  syncStreams, trimPlayerPage, viewPartition, watchSignedIn, ytVidOf };
