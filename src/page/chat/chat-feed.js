import { alerts } from '../alerts/alerts.js';
import { flaggedIn } from '../alerts/flagged.js';
import { botsFor, mentionAlert, spamFromFeed, supportFrom } from '../alerts/spam-alerts.js';
import { SmvSpam } from '../alerts/spam.js';
import { allLooking, feedRead, mentionOf } from './all-chat.js';
import { chatOverlay, overlayIsOn } from './chat-overlay.js';
import { countsAreOn, feedNew } from './new-messages.js';
import { wins } from '../core.js';
import { mentAny, mentMuted, mentNameFor, mentOn, mentWords } from '../panels/bell/bell.js';
import { devError } from '../panels/developer/developer.js';
import { PLAT_NAME, platOf, platform } from '../platforms/platforms.js';
import { runIn } from '../windows/view.js';

/* ---- The app's chat readers on the sites' own connections (#222) ----
   Mention and support alerts, chat over the stream, new-message counts and spam alerts read each chat's messages as
   the site's connection brings them (in-site/feed.js, read by chat/feed-parse.js), as ALL does: a chat's page doesn't
   draw new messages while it's out of sight behind ALL or scrolled up, and a busy chat scrolls lines past between two
   reads of its screen. ALL hands over what it reads (chat/all-chat.js: ingest); a chat without ALL hands over its
   messages while something here reads it (w.feedRead).
   For the sites whose module says feedReaders. A chat's page reads its screen (in-site/mentions.js) until its feed has
   brought a message; from then the screen reader sleeps (w.feedLive), and wakes again when the feed stops working
   (chat/all-health.js: its page drew new lines while the feed brought none), for a while. Each message is read once (by
   its id), and the same alert from both readers (as one takes over from the other) counts once. */
const LIVE_AGAIN_MS = 5 * 60000;   // after the feed broke: how long its screen reads it, before the feed may again
const SAME_MS = 5 * 60000;          // the same mention or support from the other reader within this: the same one
const seenIds = new WeakMap();      // chat window -> its messages' ids already read (site:id)
const said = new Map();             // channel \n kind \n who \n what -> { t, via }: alerts raised, by which reader
const groups = new Map();           // a community gift's id -> when (its subs given one by one are part of it)
const decided = new Map();          // site:id -> { v, kind?, t } (Why didn't this alert?)
let pending = new Map();            // chat window -> { over: [], n } (chat over the stream, new messages) until flushed
let flushT = 0;

const flat = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
const textOf = m => m.parts.map(p => p.text != null ? p.text : p.name || '').join('').replace(/\s+/g, ' ').trim();
// Its parts as the bell and chat over the stream keep them: [{ t } | { e, src }] (null: text only)
const partsOf = m => (m.parts.some(p => p.emote) ? m.parts.map(p => p.emote ? { e: p.name, src: p.emote } : { t: p.text || '' }) : null);
const reads = w => !!w && w.kind === 'chat' && !!platform(w.channel).feedReaders;
const decide = (m, v, extra) => { if (!m.id) return; decided.set(m.site + ':' + m.id, { v, t: Date.now(), ...extra }); if (decided.size > 2000) decided.delete(decided.keys().next().value); };

// The same alert raised by the other reader lately ('screen' or 'feed'): not again. Words told apart as the spam
// alerts' are (one of them may have the emotes' names, the other not).
function sameAs(ch, kind, who, what, via){
  const now = Date.now(), pre = `${ch}\n${kind}\n${flat(who)}\n`, w = flat(what);
  for (const [k, x] of said){
    if (now - x.t > SAME_MS){ said.delete(k); continue; }
    if (!k.startsWith(pre) || x.via === via) continue;
    const o = k.slice(pre.length);
    if (o === w || (w && o && (o.includes(w) || w.includes(o)))) return true;
  }
  said.set(pre + w, { t: now, via });
  if (said.size > 3000) said.delete(said.keys().next().value);
  return false;
}

// Whether a chat's feed is wanted for these readers: something here reads it
function wanted(w){
  if (w && w.kind === 'chat' && flaggedIn(w.channel)) return true;   // (Settings › Flagged: also YouTube's, read for this alone)
  if (!reads(w)) return false;
  const site = platform(w.channel);
  return (site.mentions && mentOn && mentAny() && !mentMuted.has(w.channel)) || (site.spamAlerts && !!alerts.spam.on)
    || (!!alerts.support.on && !!site.support) || overlayIsOn() || countsAreOn();
}
// Every chat's feed on or off as its readers want it (the alerts' poll, every 1.5 s)
function syncFeeds(){ wins.forEach(w => { if (w.kind === 'chat' && w.ready && w.view) feedRead(w, wanted(w)); }); }

// Its page reads its screen again (the feed didn't work), or stops (the feed works)
const SCREEN_JS = on => `window.__kmvMention && window.__kmvMention.setScreen && window.__kmvMention.setScreen(${!!on})`;
function goLive(w){
  if (w.feedLive || Date.now() - (w.feedBroke || 0) < LIVE_AGAIN_MS) return;
  w.feedLive = true;
  if (w.view) runIn(w.view, SCREEN_JS(false));   // (a hidden tab's chat may have no view yet: its helper starts asleep)
}
// The feed stopped working for this chat (chat/all-health.js): its page's screen read again
function feedFailed(w){
  if (!w || !w.feedLive) return;
  w.feedLive = false; w.feedBroke = Date.now();
  if (w.view) runIn(w.view, SCREEN_JS(true));
  devError('chat', `Chat alerts · ${PLAT_NAME[platOf(w.channel)]}`, 'Read nothing from the site while its chat had new messages: reading its chat page instead');
}
// A chat's page loaded (again): its screen is read until its feed brings a message
function feedLoaded(w){ w.feedLive = false; }
// Whether its screen reader should be on (in-site/mentions.js, as it's set up)
const screenOn = w => !w.feedLive;

// One message from a chat's feed (ALL's, or one read for these alone): every reader that wants it
function fromFeed(w, m){
  if (!reads(w) || !m || !m.site) return;
  if (m.id){
    let ids = seenIds.get(w); if (!ids){ ids = new Set(); seenIds.set(w, ids); }
    const k = m.site + ':' + m.id; if (ids.has(k)) return;   // (YouTube's sends its recent ones again; Twitch's two connections)
    ids.add(k); if (ids.size > 3000) ids.delete(ids.values().next().value);
  }
  if (m.kind === 'message' || m.kind === 'event') goLive(w);   // (first: its screen reader stops before this is read)
  if (m.kind === 'message') message(w, m);
  if (m.support) support(w, m);   // (an event, or a message with a cheer in it)
}
function message(w, m){
  const ch = w.channel, site = platform(ch), me = flat(mentNameFor(ch)), body = textOf(m), parts = partsOf(m);
  const own = !!me && m.login === me;
  if (overlayIsOn() || countsAreOn()){
    const p = pending.get(w) || { over: [], n: 0 }; pending.set(w, p);
    if (overlayIsOn() && p.over.length < 40) p.over.push(parts ? { sender: m.sender, body, parts } : { sender: m.sender, body });
    if (!own) p.n++;
    if (!flushT) flushT = setTimeout(flush, 300);
  }
  if (own){ decide(m, 'own'); return; }
  if (site.spamAlerts && !SmvSpam.ignored(m.sender, botsFor('spam', ch))) spamFromFeed(w, m.sender, parts ? parts.filter(x => !x.e).map(x => x.t).join('') : body, m.t, m.id);
  if (!site.mentions || !mentOn || mentMuted.has(ch)) return;
  if (!me && !mentWords.length){ decide(m, 'off'); return; }
  mentionOf(m, ch);
  if (!m.toMe){ decide(m, 'nomatch'); return; }
  if (SmvSpam.ignored(m.sender, botsFor('mention', ch))){ decide(m, 'nomatch'); return; }
  const kind = m.toMe === 'reply' ? 'reply' : m.toMe === 'at' ? 'mention' : 'word';
  decide(m, 'alerted', { kind });
  if (sameAs(ch, 'mention', m.sender, body, 'feed')) return;
  const item = { sender: m.sender, body, kind, quoted: kind === 'reply' && m.reply ? m.reply.body : '', t: m.t || Date.now() };
  if (kind === 'word') item.word = m.word;
  if (parts) item.parts = parts;
  mentionAlert(w, item, (document.hasFocus() && document.activeElement === w.view) || allLooking(w));
}
// Someone supporting the stream: once (a community gift's subs given one by one are part of it, by the gift's id), never
// your own
function support(w, m){
  const s = m.support, ch = w.channel;
  if (!alerts.support.on || !platform(ch).support || !s.who) return;
  if (flat(s.who) === flat(mentNameFor(ch))) return;
  if (s.group){
    for (const [g, t] of groups) if (Date.now() - t > SAME_MS) groups.delete(g);
    if (groups.has(s.group)) return;   // (one of its subs, or the same gift again: Kick names it two ways)
    groups.set(s.group, Date.now());
  }
  if (sameAs(ch, 'support', s.who, supportKey(s), 'feed')) return;
  supportFrom(w, [{ kind: s.kind, who: s.who, n: s.n, unit: s.unit || '', t: m.t || Date.now(), ...(s.to ? { to: s.to } : {}), ...(s.amt ? { amt: s.amt } : {}) }]);
}
// Chat over the stream and the new-message counts, a few at a time
function flush(){
  flushT = 0;
  const all = pending; pending = new Map();
  all.forEach((p, w) => {
    if (!wins.includes(w)) return;
    if (p.over.length) chatOverlay(w, p.over);
    if (p.n) feedNew(w, p.n);
  });
}
// One support alert told apart from another: its kind and amount (a raid by who raided: the viewers it counts change)
const supportKey = s => (s.kind === 'raid' ? 'raid' : s.kind + ' ' + s.n);
// What the screen reader found, checked against the feed's (alerts/spam-alerts.js): already raised by the feed
const screenSaid = (ch, kind, who, what) => sameAs(ch, kind, who, what, 'screen');
// What was decided about a message the feed read, by its id (Why didn't this alert?), or null
const feedDecided = (ch, id) => (id && decided.get(platOf(ch) + ':' + id)) || null;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.chatFeed = { fromFeed: (ch, m) => fromFeed(wins.find(w => w.kind === 'chat' && w.channel === ch), m), live: ch => !!(wins.find(w => w.kind === 'chat' && w.channel === ch) || {}).feedLive,
    failed: ch => feedFailed(wins.find(w => w.kind === 'chat' && w.channel === ch)), decided: feedDecided, flush };   // for the tests
}

export { feedDecided, feedFailed, feedLoaded, fromFeed, init, screenOn, screenSaid, supportKey, syncFeeds };
