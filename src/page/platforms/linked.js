import { wins } from '../core.js';
import { saved, sendWatch, svProf } from '../panels/channels/channels.js';
import { follows } from '../panels/channels/follow-suggestions.js';
import { PLATFORMS, chLabel, chNames, parseInput, platOf, platform } from './platforms.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';

/* ---- Linked channels: one streamer on several sites (Settings › Linked channels) ----
   A streamer is a name and its accounts, one per site: { id, name, main, accounts: ['quietkoala', 'tw:quietkoala'],
   streams?, autoOpen? } (saved as "streamers"). Nothing is linked by itself: the app suggests, and you choose.
   The switch ("linkedOn", off unless set) is the one gate: while it's off streamerOf() finds nobody and there are no
   suggestions, so everything that groups by streamer shows one row and one window per account, as it did before.
   Turning it off keeps the streamers, the answers and the options. */
const SITE_ORDER = ['kick', 'twitch', 'youtube'];
// The page's options and what they are until you change them (Settings › Linked channels)
const OPT_DEFAULTS = {
  streams: 'tabs',        // their streams: 'tabs' in one window, or 'separate' windows
  chats: 'tabs',          // their chats: 'tabs', 'side' (side by side in one window) or 'separate'
  chatFollows: true,      // the chat follows the stream's tab
  tabKey: true,           // Tab in an empty chat box switches site
  allTab: true,           // an ALL tab in their chat window: every site's chat as one list
  overlay: 'one',         // chat over the stream: 'one' (the site you're watching) or 'all' (every live site)
  quality: 'low',         // tabs you're not watching play at 'low' quality, or 'yours'
  jumpLive: true,         // jump to live when switching tab
  autoOpen: 'together',   // when they open by themselves (⚡): 'together' as tabs, or 'separate'
  alsoLive: 'add',        // another of their accounts goes live: 'add' its tab, 'switch' to it too, or 'none'
  ended: 'switch',        // the stream you're watching ends: 'switch' to a live one, or 'stay'
  raid: 'follow',         // they raid: 'follow' the one you were watching, or 'tell' (a note under the bell)
  suggest: true           // suggest accounts to link
};
let streamers = null;     // (read on first use)
const later = new Set();  // suggestions answered "Later": hidden until the app starts again
const linkedOn = () => settings.flag('linkedOn');
const pairKey = (a, b) => [a, b].sort().join('|');
function all(){
  if (!streamers){
    const raw = settings.json('streamers', []);
    streamers = (Array.isArray(raw) ? raw : []).filter(s => s && s.id && Array.isArray(s.accounts) && s.accounts.length > 1)
      .map(s => ({ ...s, accounts: s.accounts.filter(a => typeof a === 'string' && a) }));
  }
  return streamers;
}
const siteRank = ch => SITE_ORDER.indexOf(platOf(ch));
// A streamer's accounts: the main one first, then Kick, Twitch, YouTube
const ordered = s => [...s.accounts].sort((a, b) => (b === s.main) - (a === s.main) || siteRank(a) - siteRank(b));
const streamerOf = ch => linkedOn() && ch ? all().find(s => s.accounts.includes(ch)) || null : null;
const streamerById = id => linkedOn() ? all().find(s => s.id === id) || null : null;
const accountsOf = ch => { const s = streamerOf(ch); return s ? ordered(s) : ch ? [ch] : []; };
const mainOf = ch => { const s = streamerOf(ch); return s ? s.main : ch; };
const streamerName = s => s.name || chLabel(s.main);
// The name for a channel: its streamer's when it's linked
const nameOf = ch => { const s = streamerOf(ch); return s ? streamerName(s) : chLabel(ch); };
// The key that keeps a streamer's windows together (Columns pairs, the window list): the streamer, or the channel
const groupKey = ch => { const s = streamerOf(ch); return s ? 's:' + s.id : ch; };
const sameStreamer = (a, b) => a === b || (!!a && !!b && groupKey(a) === groupKey(b));
const listStreamers = () => linkedOn() ? all().map(s => ({ ...s, accounts: ordered(s) })) : [];
// A streamer's own chat bots (their card): names for one site each, { p: 'kick', name: 'quietkoala' }. Never a mention
// or spam in their chats on that site, on top of the app's list.
const botsOf = s => s && Array.isArray(s.bots) ? s.bots.filter(b => b && typeof b.name === 'string' && b.name && PLATFORMS[b.p]) : [];
const streamerBots = ch => botsOf(streamerOf(ch)).filter(b => b.p === platOf(ch)).map(b => b.name);
const optDefault = k => OPT_DEFAULTS[k];
function linkOpt(k){ const o = settings.json('linkedOpts', {}) || {}; return k in o ? o[k] : OPT_DEFAULTS[k]; }
// A streamer's own choice (their streams, opening by themselves), or the page's
const optFor = (ch, k) => { const s = streamerOf(ch); return s && s[k] ? s[k] : linkOpt(k); };
function setOpt(k, v){
  const o = settings.json('linkedOpts', {}) || {};
  if (v === OPT_DEFAULTS[k]) delete o[k]; else o[k] = v;
  settings.set('linkedOpts', o); store.changed('streamers');
}

function saveStreamers(){ settings.set('streamers', streamers); store.changed('streamers'); sendWatch(); }   // (the main process: one went-live notification each)
const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Can b join a's streamer? One account per site, and a channel is in one streamer at most. A video isn't a channel.
function canLink(a, b){
  if (!a || !b || a === b || /^yt:v:/.test(a) || /^yt:v:/.test(b)) return false;
  const s = all().find(x => x.accounts.includes(a)), t = all().find(x => x.accounts.includes(b));
  if (s && s === t) return false;
  const sites = [...(s ? s.accounts : [a]), ...(t ? t.accounts : [b])].map(platOf);
  return new Set(sites).size === sites.length;
}
// Link b to a's streamer (or make one of the two). b's own streamer joins too. Returns the streamer, or null.
function link(a, b){
  if (!canLink(a, b)) return null;
  const list = all();
  let s = list.find(x => x.accounts.includes(a));
  const t = list.find(x => x.accounts.includes(b));
  if (!s && t){ t.accounts.push(a); s = t; }
  else if (!s){ s = { id: newId(), name: '', main: a, accounts: [a, b] }; list.push(s); }
  else if (t){ s.accounts.push(...t.accounts); list.splice(list.indexOf(t), 1); }
  else s.accounts.push(b);
  forgetNot(a, b);
  saveStreamers();
  return s;
}
// Take one account out of its streamer. A streamer left with one account isn't one any more.
function unlink(ch){
  const list = all(), s = list.find(x => x.accounts.includes(ch)); if (!s) return;
  s.accounts = s.accounts.filter(a => a !== ch);
  if (s.main === ch) s.main = ordered(s)[0];
  if (s.accounts.length < 2) list.splice(list.indexOf(s), 1);
  saveStreamers();
}
function unlinkAll(id){
  const list = all(), i = list.findIndex(s => s.id === id); if (i < 0) return;
  list.splice(i, 1); saveStreamers();
}
// Put streamers back as they were (undo)
function setStreamers(list){ streamers = JSON.parse(JSON.stringify(list || [])); saveStreamers(); }
const copyStreamers = () => JSON.parse(JSON.stringify(all()));
function setMain(ch){ const s = all().find(x => x.accounts.includes(ch)); if (s && s.main !== ch){ s.main = ch; saveStreamers(); } }
function setStreamerOpt(id, k, v){
  const s = all().find(x => x.id === id); if (!s) return;
  if (v === null || v === undefined || v === '') delete s[k]; else s[k] = v;
  saveStreamers();
}
function setOn(on){ settings.set('linkedOn', !!on); store.changed('streamers'); sendWatch(); }

/* ---- Suggestions: the same name on another site, or a link on the channel's own page ---- */
const nots = () => { const n = settings.json('linkedNot', []); return Array.isArray(n) ? n.filter(x => x && x.a && x.b) : []; };
const isNot = (a, b) => nots().some(n => pairKey(n.a, n.b) === pairKey(a, b));
function notSame(a, b){
  if (isNot(a, b)) return;
  settings.set('linkedNot', [...nots(), { a, b, at: Date.now() }]); store.changed('streamers');
}
function forgetNot(a, b){
  const n = nots(), left = n.filter(x => pairKey(x.a, x.b) !== pairKey(a, b));
  if (left.length !== n.length){ settings.set('linkedNot', left); store.changed('streamers'); }
}
const dismissed = () => nots().sort((x, y) => (y.at || 0) - (x.at || 0));
function laterPair(a, b){ later.add(pairKey(a, b)); store.changed('streamers'); }
// What the app knows about: saved, open, followed and named channels (not videos)
function known(){
  const set = new Set([...saved, ...wins.map(w => w.channel), ...((follows && follows.items) || []).map(f => f.ch), ...Object.keys(chNames)]);
  return [...set].filter(ch => ch && !/^yt:v:/.test(ch) && PLATFORMS[platOf(ch)]);
}
const handleKey = ch => String(platform(ch).handle(ch)).toLowerCase().replace(/^@/, '').replace(/[-_.]/g, '');
// The other sites' channels a channel's page links to (Kick's socials, Twitch's social links)
function pageLinks(ch){
  const p = svProf[ch], socials = (p && p.info && Array.isArray(p.info.socials)) ? p.info.socials : [];
  return socials.map(s => s && s.url && parseInput(s.url)).filter(r => r && r.channel && platOf(r.channel) !== platOf(ch)).map(r => r.channel);
}
// [{ a, b, why }]: pairs worth linking, saved ones first. Not ones already linked, answered, or hidden for now.
function suggestions({ all: every } = {}){
  if (!linkedOn() || (!every && !linkOpt('suggest'))) return [];
  const chs = known(), savedSet = new Set(saved), out = [], seen = new Set();
  const add = (a, b, why) => {
    const k = pairKey(a, b);
    if (seen.has(k) || isNot(a, b) || later.has(k) || !canLink(a, b)) return;
    seen.add(k); out.push({ a, b, why });
  };
  const byName = new Map();
  for (const ch of chs){ const k = handleKey(ch); if (k.length < 3) continue; (byName.get(k) || byName.set(k, []).get(k)).push(ch); }
  for (const ch of chs) for (const to of pageLinks(ch)){
    const same = handleKey(to) === handleKey(ch);
    add(ch, to, (same ? 'Same name · ' : '') + `their ${platform(ch).name} page links to ${platform(to).name}`);
  }
  for (const group of byName.values()){
    if (group.length < 2) continue;
    group.sort((x, y) => savedSet.has(y) - savedSet.has(x) || siteRank(x) - siteRank(y));
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++)
      if (platOf(group[i]) !== platOf(group[j]) && (savedSet.has(group[i]) || savedSet.has(group[j]))) add(group[i], group[j], 'Same name');
  }
  // saved ones first, then the main site first in each pair
  return out.map(x => siteRank(x.a) <= siteRank(x.b) ? x : { a: x.b, b: x.a, why: x.why })
    .sort((x, y) => (savedSet.has(y.a) && savedSet.has(y.b)) - (savedSet.has(x.a) && savedSet.has(x.b)));
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  // changed in the other window
  settings.onChange(['streamers', 'linkedOn', 'linkedNot', 'linkedOpts'], name => { if (name === 'streamers') streamers = null; store.changed('streamers'); });
  window.linkedApi = { link, unlink, unlinkAll, setOn, setMain, notSame, suggestions, listStreamers, streamerOf, setStreamerOpt, streamerBots };   // for the tests
}

export { accountsOf, botsOf, canLink, dismissed, forgetNot, groupKey, init, laterPair, link, linkedOn, linkOpt,
  listStreamers, nameOf, notSame, optFor, ordered, sameStreamer, setMain, setOn, setOpt, setStreamerOpt,
  streamerBots, streamerName, streamerOf, suggestions, unlink, unlinkAll };
