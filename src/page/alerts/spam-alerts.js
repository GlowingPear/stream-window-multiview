import { alerts, clearAlert, raiseAlert, wantNotify } from './alerts.js';
import { SmvSpam } from './spam.js';
import { supportBanner } from './support-banner.js';
import { spamTag } from '../chat/all-chat.js';
import { screenSaid, supportKey, syncFeeds } from '../chat/chat-feed.js';
import { chatOverlay, overlayIsOn } from '../chat/chat-overlay.js';
import { GAP, colWidth, colsMode, msg, wins } from '../core.js';
import { buildCols } from '../layout/columns.js';
import { SW, focusWin } from '../layout/geometry.js';
import { colKey, featBase, featW, featuredCh, scrollX } from '../layout/layouts.js';
import { addParsed } from '../layout/placement.js';
import { smoothScrollTo } from '../layout/sideways-scroll.js';
import { injectMention } from '../panels/bell/all-notifications.js';
import { addNote, cleanParts, mentAny, mentOn, partsText, readChat, spamWhy } from '../panels/bell/bell.js';
import { streamerBots } from '../platforms/linked.js';
import { chLabel, chLabelP, modOk, platOf } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { askIn, runIn } from '../windows/view.js';

/* ---------- spam alerts: chats you moderate ---------- */
const spamRecent = [], spamFirst = new Map();   // messages from the last few minutes (every chat), when each sender first spoke
const FIRST_MAX = 20000;   // senders remembered: busy chats bring thousands an hour, so the ones seen first go
function firstSpoke(k, t){
  if (spamFirst.has(k)) return;
  spamFirst.set(k, t);
  if (spamFirst.size > FIRST_MAX) spamFirst.delete(spamFirst.keys().next().value);
}
// A chat with no window left: who spoke there isn't needed (opened again, it learns who's chatting again).
function forgetChat(ch){
  if (wins.some(w => w.kind === 'chat' && w.channel === ch)) return;
  const pre = ch + '\n';
  for (const k of spamFirst.keys()) if (k.startsWith(pre)) spamFirst.delete(k);
}
// Whether you moderate that chat's channel (the same answer as its mod view button).
async function modChat(w){
  if (!DESKTOP || !window.kmv.modCheck || !/^(kick|twitch)$/.test(platOf(w.channel))) return false;
  if (!modOk.has(w.channel)) modOk.set(w.channel, window.kmv.modCheck(w.channel).catch(() => null));
  return (await modOk.get(w.channel)) === true;
}
// The chat bots never counted as a mention ('mention') or flagged as spam ('spam') in a channel's chat: the app's list
// (Settings › Chat › Chat bots), Mentions' or spam alerts' own instead, or for spam alerts both; and the streamer's
// own bots on that chat's site (their card in Linked channels).
function botsFor(kind, ch){
  const a = alerts[kind], shared = alerts.mention.bots || SmvSpam.BOTS;
  const own = kind === 'spam' ? a.ignore || SmvSpam.BOTS : a.ownBots || SmvSpam.BOTS;
  const list = a.botsMode === 'own' ? own : a.botsMode === 'both' && kind === 'spam' ? [...shared, ...own] : shared;
  const theirs = ch ? streamerBots(ch) : [];
  return theirs.length ? [...list, ...theirs] : list;
}
const spamOpts = ch => ({ sensitivity: alerts.spam.sens, allowed: alerts.spam.allow || SmvSpam.ALLOWED, words: alerts.spam.words || SmvSpam.WORDS, openers: alerts.spam.openers || SmvSpam.OPENERS, ignore: botsFor('spam', ch),
  abuse: alerts.spam.abuse !== false, abuseWords: alerts.spam.abuseWords || SmvSpam.ABUSE, slurs: alerts.spam.slurs || SmvSpam.SLURS, swears: alerts.spam.swears || SmvSpam.SWEARS, sexual: alerts.spam.sexual || SmvSpam.SEXUAL,
  points: alerts.spam.points });
// Messages already checked, from either side (the chat's page, or ALL hearing them from the site while the page is out
// of sight and doesn't draw them): channel + sender -> [{ b: its words, t, flag: what was found, if it was flagged }].
// The same message coming from the other side isn't checked or counted again; flagged, it only gets its tag there too.
const checked = new Map();
const flatBody = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
function checkedBefore(ch, sender, body, now){
  const k = ch + '\n' + String(sender).toLowerCase(), b = flatBody(body), list = (checked.get(k) || []).filter(x => now - x.t < 5 * 60000);
  if (list.length) checked.set(k, list); else checked.delete(k);
  return b ? list.find(x => x.b === b || x.b.includes(b) || b.includes(x.b)) : null;   // (an emote-only message: words to tell it by)
}
function noteChecked(ch, sender, body, now, flag){
  const k = ch + '\n' + String(sender).toLowerCase(), b = flatBody(body); if (!b) return;
  checked.set(k, [...(checked.get(k) || []), { b, t: now, flag }].slice(-20));
  if (checked.size > FIRST_MAX) checked.delete(checked.keys().next().value);
}
// seenAt: when you last clicked or typed in that chat; messages from before then don't need a lasting alert.
// A line from ALL has no line in the chat's page (line: null) to tag yet.
async function spamCheck(w, lines, seenAt){
  const mod = await modChat(w);
  const now = Date.now(), opts = spamOpts(w.channel);
  while (spamRecent.length && now - spamRecent[0].t > 5 * 60000) spamRecent.shift();
  lines.forEach(l => {
    if (l.mod) return;                                         // a moderator removed it: not a new message
    if (SmvSpam.ignored(l.sender, opts.ignore)) return;        // chat bots: not checked, and their repeats don't count against anyone
    const before = checkedBefore(w.channel, l.sender, l.body, now);
    if (before){ if (before.flag && l.line && alerts.spam.tag) markLine(w, l.line, before.flag); return; }   // (heard by ALL first: its tag in the chat too)
    const msg = { sender: l.sender, body: l.body, chat: w.channel, t: l.t || now };
    const k = w.channel + '\n' + String(l.sender).toLowerCase();
    firstSpoke(k, msg.t);
    let flag = null;
    if (mod){
      const r = SmvSpam.score(msg, { recent: spamRecent, firstSeen: spamFirst }, opts);
      if (r.spam){ flag = { why: spamWhy(r), abuse: r.abuse }; flagSpam(w, l, r, !!seenAt && (l.t || now) <= seenAt); }
    }
    noteChecked(w.channel, l.sender, l.body, now, flag);
    spamRecent.push(msg);
  });
  if (spamRecent.length > 3000) spamRecent.splice(0, spamRecent.length - 3000);
}
function flagSpam(w, l, r, seen){
  const a = alerts.spam;
  if (a.tag){
    const why = spamWhy(r);
    if (l.line || l.id) markLine(w, l.line || `${l.sender}: ${l.body}`, { why, abuse: r.abuse }, l.id);   // (one from the feed: by its id, once its page draws it)
    spamTag(w.channel, l.sender, l.body, why, r.abuse);   // (and in ALL)
  }
  raiseAlert(w, 'spam', seen);
  addNote({ kind: 'spam', channel: w.channel, label: chLabelP(w.channel), sender: l.sender, body: l.body, score: r.score, need: r.need, signs: r.signs,
            abuse: r.abuse, unread: !seen }, `${r.abuse ? 'Abusive message' : 'Likely spam'} in ${chLabel(w.channel)}'s chat`);
  if (wantNotify('spam')) window.kmv.notifyMention({ kind: 'spam', abuse: r.abuse, channel: w.channel, label: chLabelP(w.channel), sender: l.sender, body: l.body });
}
// Spam alerts › Tag the message in chat: its line in the chat's page (found by the site's id for it, when it has one)
const markLine = (w, line, flag, id = '') => runIn(w.view, `window.__kmvMention && window.__kmvMention.mark(${JSON.stringify(line)}, ${JSON.stringify(flag.why)}, ${JSON.stringify(alerts.spam.color)}, ${JSON.stringify(flag.abuse ? 'abuse' : 'spam')}, ${JSON.stringify(id)})`);
// A message the chat's connection to the site brought (chat/chat-feed.js: ALL's, or one read for the alerts alone):
// checked as it comes, as the chat's page may not draw it until it's in view (Kick's doesn't while ALL is in front of
// it, or while it's scrolled up). The page's line for it, when it's drawn, isn't checked again.
function spamFromFeed(w, sender, body, t, id = ''){
  if (!alerts.spam.on || !w || !String(body || '').trim()) return;
  spamCheck(w, [{ sender, body, t, line: null, id }]);
}
// Bring a chat into view (and flash it).
function revealChat(ch){
  let c = wins.find(w => w.kind === 'chat' && w.channel === ch);
  if (!c){ addParsed({ channel: ch, only: 'chat' }); c = wins.find(w => w.kind === 'chat' && w.channel === ch); if (!c) return; }
  revealWin(c);
}
// Bring a window into view (and flash it): scrolled to in Columns, else on top.
function revealWin(c){
  if (!c || !wins.includes(c)) return;
  if (colsMode && !c.el.classList.contains('featured')){
    const keys = buildCols().filter(k => !(featBase.length && k.key === featuredCh)).map(k => k.key);
    const i = keys.indexOf(colKey(c));
    if (i >= 0){
      const shown = Math.max(1, Math.round((SW() - GAP - featW) / colWidth));
      const first = Math.round(scrollX / colWidth);
      if (i < first || i >= first + shown) smoothScrollTo(i * colWidth);
    }
  } else focusWin(c);
  c.el.classList.remove('ping'); void c.el.offsetWidth; c.el.classList.add('ping');
  setTimeout(() => c.el.classList.remove('ping'), 2600);
}
let polling = false;
async function pollMentions(){
  const ment = mentOn && mentAny(), spam = !!alerts.spam.on, sup = !!alerts.support.on, feed = overlayIsOn();
  syncFeeds();                                                  // (each chat hands over its messages while something reads them)
  if ((!ment && !spam && !sup && !feed) || polling) return;
  polling = true;
  try { await pollChats(ment, spam); } finally { polling = false; }
}
// Support (Settings > Support): whether it's at least the smallest that alerts, and what it says
function supportText(s){
  const a = alerts.support, n = Math.max(1, +s.n || 1), many = (one, more) => `${n.toLocaleString()} ${n === 1 ? one : more}`;
  switch (s.kind){
    case 'kicks': return n >= a.minKicks ? `sent ${many('KICK', 'KICKs')}` : '';
    case 'bits': return n >= a.minBits ? `cheered ${many('bit', 'bits')}` : '';
    case 'gifts': return n >= a.minGifts ? `gifted ${s.unit === 'memberships' ? many('membership', 'memberships') : many('sub', 'subs')}` : '';
    case 'gift': return n >= a.minGifts ? `gifted ${n === 1 ? 'a sub' : many('sub', 'subs')}${s.to ? ' to ' + s.to : ''}` : '';
    case 'superchat': return n >= a.minMoney ? `sent a Super Chat${s.amt ? ': ' + s.amt : ''}` : '';
    case 'sub': return a.subs ? (n > 1 ? `subscribed for ${n} months` : 'subscribed') : '';
    case 'member': return a.subs ? 'became a member' : '';
    case 'raid': return n >= (a.minRaid || 1) ? `raided with ${many('viewer', 'viewers')}` : '';
    default: return '';
  }
}
function supportFrom(w, list, screen = false){
  for (const s of list || []){
    if (screen && s.who && screenSaid(w.channel, 'support', s.who, supportKey(s))) continue;   // (the site's connection said it first)
    const what = supportText(s);
    if (!what || !s.who) continue;
    const item = { channel: w.channel, label: chLabelP(w.channel), sender: String(s.who).slice(0, 40), body: what, kind: 'support', quoted: '', t: s.t || Date.now(), unread: true };
    if (s.kind === 'raid') item.raid = true;                   // (the desktop notification says "raided")
    if (DESKTOP && wantNotify('support')) window.kmv.notifyMention(item);
    addNote(item, `${item.sender} ${what} in ${chLabel(w.channel)}`);
    raiseAlert(w, 'support', false);
    supportBanner(w.channel, item.sender, what, s.kind);          // on its stream's picture too
  }
}
async function pollChats(ment, spam){
  for (const w of wins){
    if (w.kind !== 'chat' || !w.ready || !w.view) continue;
    let q;
    try { q = await askIn(w.view, 'window.__kmvMention && window.__kmvMention.setWatch ? window.__kmvMention.take() : null'); } catch { continue; }
    if (q === null){ injectMention(w); continue; }          // chat reloaded: set it up again
    if (!q) continue;
    (q.k || []).forEach(n => firstSpoke(w.channel + '\n' + n, 0));
    if (spam && q.l && q.l.length) await spamCheck(w, q.l, q.c);
    if (alerts.support.on && q.s && q.s.length) supportFrom(w, q.s, true);
    if (q.f && q.f.length) chatOverlay(w, q.f);                // chat over the stream (chat/chat-overlay.js)
    if (q.c){                                                 // you clicked or typed in the chat: what came before is seen
      if (w.alert && w.alert.since <= q.c) clearAlert(w);
      readChat(w.channel);
    }
    const bots = botsFor('mention', w.channel);
    (q.m || []).filter(m => !SmvSpam.ignored(m.sender, bots)).forEach(m => {
      if (screenSaid(w.channel, 'mention', m.sender, m.parts ? partsText(cleanParts(m.parts) || []) || m.body : m.body)) return;   // (the site's connection said it first)
      mentionAlert(w, m, (document.hasFocus() && document.activeElement === w.view) || (q.c && (m.t || 0) <= q.c));   // (looking: you're in that chat right now)
    });
  }
}
// A message to you (m: { sender, body, kind: 'reply' | 'mention' | 'word', word?, quoted, t, parts?, qparts? }), from the
// chat's screen or its feed (chat/chat-feed.js): under the bell, a desktop notification, and its window lit
function mentionAlert(w, m, looking){
  const item = { channel: w.channel, label: chLabelP(w.channel), sender: m.sender, body: m.body, kind: m.kind, quoted: m.quoted || '', t: m.t || Date.now(),
                 unread: !looking };
  if (m.kind === 'word') item.word = m.word;
  // emotes in the message (and the message it replies to): kept with it, their names in its text
  const parts = cleanParts(m.parts), qparts = cleanParts(m.qparts);
  if (parts){ item.parts = parts; item.body = partsText(parts); }
  if (qparts){ item.qparts = qparts; item.quoted = partsText(qparts); }
  if (DESKTOP && wantNotify('mention')) window.kmv.notifyMention(item);   // (the feed reads chats in the UI tests' plain browser too)
  addNote(item, `${item.sender} ${item.kind === 'reply' ? 'replied to you' : item.kind === 'word' ? `said “${item.word}”` : 'mentioned you'} in ${chLabel(item.channel)}`);
  raiseAlert(w, 'mention', !!looking);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.spamFirst = spamFirst; window.firstSpoke = firstSpoke; window.botsFor = botsFor;   // for the tests
  window.spamCheck = (ch, lines) => spamCheck(wins.find(w => w.kind === 'chat' && w.channel === ch), lines);   // for the tests
  window.spamFromFeed = (ch, sender, body) => spamFromFeed(wins.find(w => w.kind === 'chat' && w.channel === ch), sender, body, Date.now());   // for the tests
  window.openWins = () => wins;   // for the tests
  window.supportFrom = (ch, list) => supportFrom(wins.find(w => w.kind === 'chat' && w.channel === ch), list);   // for the tests
}

export { botsFor, forgetChat, init, mentionAlert, pollMentions, revealChat, revealWin, spamFirst, spamFromFeed,
  spamOpts, supportFrom };
