import { alerts, clearAlert } from '../alerts/alerts.js';
import { SmvSpam } from '../alerts/spam.js';
import { SMILEY, addonEmotes, emoteCache, openEmotePicker, pickEmote, renderEmoteList, suggestEmote, withEmotes } from './all-emotes.js';
import { healthState, noteRaw, noteSend, reportHealth } from './all-health.js';
import { chatBoxName } from './chat-name.js';
import { chatZoom } from './chat-zoom.js';
import { sampleIn } from './event-samples.js';
import { feedParse } from './feed-parse.js';
import { autoTrFor } from './translate.js';
import { wins } from '../core.js';
import { feedAgent, modesAgent, pinAgent, profileAgent, replyAgent, seekAgent, twReplyAt, twReplyPress } from '../in-site/feed.js';
import { KICK_PAGE_CMDS, kickCmdHeard } from '../in-site/kick-commands.js';
import { modAgent } from '../in-site/mod.js';
import { sendAgent } from '../in-site/send.js';
import { addParsed } from '../layout/placement.js';
import { bellVars, mentMuted, mentOn, mentWords, myName, readChat, syncAtBtn } from '../panels/bell/bell.js';
import { infoFor } from '../panels/channels/channels.js';
import { devOn } from '../panels/developer/developer.js';
import { nameOf, optFor, streamerBots, streamerOf } from '../platforms/linked.js';
import { PLAT_NAME, chLabel, modIs, modUrl, openModView, platOf, platform } from '../platforms/platforms.js';
import { ask } from '../shared/ask.js';
import { element } from '../shared/element.js';
import { DESKTOP, keyName } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromSite } from '../shared/incoming.js';
import { closeOnOutside } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { soon } from '../shared/timers.js';
import { addTab, cycleTabs, frameOf, leaderOf, renderSiteTabs, showTab, syncFrameAlert, tabChannels } from '../windows/frames.js';
import { askIn, runIn, viewId, zoomOf } from '../windows/view.js';
import { freshEmotes, newEmotesOn } from '../windows/views.js';
import { syncModBtn } from '../windows/windows.js';

/* ---- ALL: a linked streamer's Kick, Twitch and YouTube chats as one list (issue #203) ----
   An ALL tab before the site tabs of a linked streamer's chat window. It covers the chat you watched with the app's
   own list; the site tabs stay as they are (loaded, playing their part), and clicking one shows that site's chat
   again. The messages come from each site's own connection, heard inside its chat page (in-site/feed.js, read by
   chat/feed-parse.js): only while ALL shows, and only from the tabs that are open (an offline site's isn't loaded).
   Each line has its site's icon and the sender's badges. Messages to you are marked (an @ green, a reply blue),
   bots on the app's chat bot list or the streamer's own are a line each with the text hidden (Show opens one),
   and a deleted message stays struck through with who or what deleted it (Kick's AI moderation and its rule). */
const MAX = 400;                       // lines kept for each streamer
const feeds = new Map();               // streamer id -> { msgs: [], byId: Map }
let botsShown = false;                 // "Bots: shown" (the chip; a saved setting)
let eventsMode = 'short';              // subs, gifts, raids, Super Chats: 'short' (one line), 'full' (the site's words) or 'hidden'

// Whether a window has an ALL tab: a chat window of a linked streamer with tabs for more than one site
function allTabFor(w){
  if (!w || w.kind !== 'chat' || !streamerOf(w.channel)) return false;
  const lead = leaderOf(w);
  return optFor(w.channel, 'allTab') !== false && !lead.split && !lead.sbs && tabChannels(w).length > 1;   // (Settings › Linked channels, or their own choice on their card)
}
const allOpen = () => { const l = settings.json('allOpen', []); return Array.isArray(l) ? l : []; };
// Whether ALL is what the window shows (remembered for each streamer)
const allOn = w => allTabFor(w) && allOpen().includes(streamerOf(w.channel).id);
function setAll(w, on){
  const s = streamerOf(w.channel); if (!s) return;
  const list = allOpen().filter(id => id !== s.id);
  settings.set('allOpen', on ? [...list, s.id] : list);
  syncAll();
  frameOf(w).forEach(renderSiteTabs);
  store.changed('tabs');
  if (on) leaderOf(w).el.querySelector('.all-list')?.focus({ preventScroll: true });
}
const feedOf = s => { let f = feeds.get(s.id); if (!f){ f = { msgs: [], byId: new Map(), pins: [] }; feeds.set(s.id, f); } return f; };

/* ---- what the chats hand over ---- */
// Your name on that site: messages to it are marked
const meOn = site => (site === 'kick' ? myName : site === 'twitch' ? bellVars.myTwitch : '').toLowerCase();
const appBots = ch => [...(alerts.mention.bots || SmvSpam.BOTS), ...streamerBots(ch)];
function ingest(w, json, quiet = false){
  const s = streamerOf(w.channel); if (!s) return;
  let batch; try { batch = JSON.parse(json); } catch { return; }
  const f = feedOf(s), view = viewFor(s);
  (Array.isArray(batch && batch.raw) ? batch.raw : []).forEach(raw => { const got = feedParse.parseFeed({ s: batch.s, raw: [raw] }); noteRaw(w.channel, typeof raw === 'string' ? raw : JSON.stringify(raw), got.length > 0); got.forEach(m => {
    if (devOn) m.raw = raw;   // (Developer tools: the line's Copy message data)
    if (m.kind === 'delete' || m.kind === 'clear' || m.kind === 'clearall') return removed(f, view, m, w.channel);
    if (m.kind === 'unban') return unbanned(f, view, m, w.channel);
    if (m.kind === 'modaction') return modAction(f, view, m, w.channel);
    if (m.kind === 'pin' || m.kind === 'unpin') return setPin(f, s, w.channel, m, quiet);
    if (m.kind === 'modes') return setModes(w.channel, { modes: m.modes });
    m.ch = w.channel;
    if (m.giftTo && giftTo(f, m)) return;   // (one of the gifted subs announced just before: its name goes on that line)
    if (m.gift) m.gift.me = m.gift.to.some(r => r.login && r.login === meOn(m.site));
    mentionOf(m, w.channel);
    if (m.kind === 'message' && SmvSpam.ignored(m.sender, appBots(w.channel))) m.bot = true;
    if (m.kind === 'message') mineSeen(f, m);
    f.msgs.push(m); if (m.id) f.byId.set(m.site + ':' + m.id, m);
    if (f.msgs.length > MAX){ const old = f.msgs.shift(); if (old.id) f.byId.delete(old.site + ':' + old.id); }
    if (view) addLine(view, m);
    if (m.kind === 'message' && !m.bot && autoTrFor(w.channel)) translateSoon(m);
  }); });
}
const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textOf = m => m.parts.map(p => p.text || p.name || '').join('');
// Messages to you, as the mention alerts read them (Settings › Mentions): a reply to you, your @name, or a word you
// watch for. Not with mentions off, or muted in that chat.
let wordList = null, wordReC = null;
const wordRe = () => {
  if (wordList !== mentWords){ wordList = mentWords; wordReC = mentWords.length ? new RegExp('(^|[^\\p{L}\\p{N}_])(' + [...mentWords].sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')(?![\\p{L}\\p{N}_])', 'iu') : null; }
  return wordReC;
};
function mentionOf(m, ch){
  if (!mentOn || mentMuted.has(ch)) return;
  const me = meOn(m.site), text = m.parts.map(p => p.text || '').join('');
  if (me && m.reply && m.reply.login === me) m.toMe = 'reply';
  else if (me && new RegExp(`(^|[^\\w])@${reEsc(me)}\\b`, 'i').test(text)) m.toMe = 'at';
  else if (m.kind === 'message' && !(me && m.login === me)){ const hit = wordRe() && text.match(wordRe()); if (hit){ m.toMe = 'word'; m.word = hit[2]; } }
}
// You're in ALL (pressed in it, or typing): its sites' chats are seen, as pressing into one of them is: their alerts
// stop (the window's and its tabs' glow) and their mentions are read under the bell
function allSeen(w){
  const chs = tabChannels(w);
  frameOf(w).forEach(o => { if (o.kind !== 'chat' || !chs.includes(o.channel)) return; if (o.alert){ clearAlert(o); syncFrameAlert(o); } readChat(o.channel); });
}
// Whether you're in the ALL that shows this chat's messages (alerts/alerts.js: then an alert only glows a moment)
function allLooking(w){
  const v = w && w.channel && streamerOf(w.channel) ? viewFor(streamerOf(w.channel)) : null;
  return !!v && document.hasFocus() && v.el.contains(document.activeElement);
}
// Twitch's line for each gifted sub: on the "gifted 5 subs" line it belongs to (the same gift id), not a line of its own
function giftTo(f, m){
  const g = m.giftTo; if (!g.group) return false;
  const line = [...f.msgs].reverse().find(x => x.gift && x.site === m.site && x.ch === m.ch && x.gift.id === g.group);
  if (!line) return false;
  if (!line.gift.to.some(r => r.login === g.login && r.name === g.name)) line.gift.to.push({ name: g.name, login: g.login });
  if (g.login && g.login === meOn(m.site)) line.gift.me = true;
  redrawLine(line);
  return true;
}
/* ---- the chats' modes: slow mode, followers only, subscribers only, … above the box, for the site it sends on ---- */
const modesOf = new Map();   // channel -> { modes: { slow, followers, subs, emotes, verified }, me: { … }, blocked, until (slow mode: when you can send again) }
function setModes(ch, r){
  const was = modesOf.get(ch) || {};
  modesOf.set(ch, { ...was, ...r, modes: { ...(was.modes || {}), ...(r.modes || {}) }, me: r.me || was.me });
  const v = viewFor(streamerOf(ch)); if (v) renderCmp(v, v.w);
}
const modeDur = s => { const d = +(s / 86400).toFixed(1); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${+(s / 3600).toFixed(1)} h` : `${d} day${d === 1 ? '' : 's'}`; };
// What a chat's modes mean for you there: its chips, why you can't send (followers only, subscribers only, a ban), and
// slow mode's wait after you sent. Moderators and the streamer (and Twitch's VIPs) aren't held to them.
function chatRules(ch){
  const st = modesOf.get(ch); if (!st) return { chips: [], block: '', wait: 0, free: false };
  if (st.blocked) return { chips: [], block: st.blocked, wait: 0, free: false };
  const m = st.modes || {}, me = st.me || {}, site = PLAT_NAME[platOf(ch)];
  const free = !!(me.mod || me.host || me.vip || youMod(ch));
  const chips = [
    m.slow > 0 && { k: 'slow', t: `Slow ${modeDur(m.slow)}`, tip: `Slow mode: one message every ${modeDur(m.slow)}` },
    m.followers != null && { k: 'followers', t: m.followers ? `Followers ${modeDur(m.followers * 60)}` : 'Followers only', tip: m.followers ? `Followers only: followed for at least ${modeDur(m.followers * 60)}` : 'Followers only' },
    m.subs && { k: 'subs', t: 'Subscribers only', tip: 'Subscribers only' },
    m.emotes && { k: 'emotes', t: 'Emotes only', tip: 'Emotes only: messages of emotes alone' },
    m.verified && { k: 'verified', t: 'Verified only', tip: `Verified accounts only (${site} asks for a phone or email)` }].filter(Boolean);
  let block = '';
  if (me.banned) block = `You’re banned from this ${site} chat`;
  else if (!free && me.signedIn){
    const left = m.followers && me.followedAt ? m.followers * 60000 - (Date.now() - me.followedAt) : 0;
    if (m.subs && !me.sub) block = `Subscribers only · subscribe on ${site} to chat`;
    else if (m.followers != null && !me.follower) block = `Followers only · follow on ${site}${m.followers ? ` for ${modeDur(m.followers * 60)}` : ''} to chat`;
    else if (left > 0) block = `Followers only · you can chat in ${modeDur(Math.ceil(left / 1000))}`;
  }
  const wait = !free && st.until ? Math.max(0, Math.ceil((st.until - Date.now()) / 1000)) : 0;
  return { chips, block, wait, free, slow: m.slow || 0, me };
}
// The bar above the box: the send site's modes (yours to ignore as a mod), slow mode's countdown, or why you can't chat
function renderModes(view, w){
  const ch = sendSite(w), r = ch ? chatRules(ch) : { chips: [] }, bar = view.modes, p = ch && platOf(ch);
  bar.hidden = !r.chips.length && !r.block && !r.wait;
  if (bar.hidden) return;
  const why = r.free && (r.me && r.me.host ? 'Your chat: they don’t apply to you' : r.me && r.me.vip && !r.me.mod ? 'You’re a VIP: they don’t apply to you' : 'You’re a moderator: they don’t apply to you');
  bar.className = 'all-modes all-modes-' + p + (r.block ? ' blocked' : r.wait ? ' waiting' : '') + (r.free ? ' free' : '');
  bar.replaceChildren(...[
    r.block ? element('span', 'all-mb', element('i', { html: icon.lock }), element('span', null, r.block))
      : r.wait ? element('span', { class: 'all-mw', style: { '--p': String(r.wait / Math.max(1, r.slow)) } }, element('i', { html: TIMER }), element('span', null, 'Slow mode · you can send in ', element('b', null, `${r.wait}s`)))
      : '',
    ...r.chips.filter(c => !(r.wait && c.k === 'slow')).map(c => element('span', { class: 'all-mc all-mc-' + c.k, title: c.tip }, c.t)),   // (counting down: that says it)
    why && element('span', { class: 'all-mfree', title: why }, element('i', { html: icon.check }), r.me && r.me.host ? 'yours' : 'exempt')].filter(Boolean));
  if (r.wait){ clearTimeout(view.modeT); view.modeT = setTimeout(() => { if (view.el.isConnected){ renderModes(view, w); syncSendB(view, w); } }, 250); }
}
// A message of yours went on a chat in slow mode: the wait starts
function slowStart(ch){
  const st = modesOf.get(ch), r = chatRules(ch);
  if (!st || !r.slow || r.free) return;
  st.until = Date.now() + r.slow * 1000;
  const v = viewFor(streamerOf(ch)); if (v){ renderModes(v, v.w); syncSendB(v, v.w); }
}

// A line drawn again after something about it changed (a tag, its translation)
function redrawLine(m){
  const view = viewFor(streamerOf(m.ch)), el = view && view.list.querySelector(`[data-key="${CSS.escape(m.site + ':' + m.id)}"]`);
  if (el){ const n = lineEl(m); if (n) el.replaceWith(n); else el.remove(); }
}
// Spam alerts › Tag the message in chat (where you moderate: alerts/spam-alerts.js): the same message here gets it too
function spamTag(ch, sender, body, why, abuse){
  const s = streamerOf(ch); if (!s) return;
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(), b = norm(body), who = norm(sender);
  const m = [...feedOf(s).msgs].reverse().find(x => x.kind === 'message' && x.ch === ch && norm(x.sender) === who && !!norm(textOf(x)) && (norm(textOf(x)) === b || b.includes(norm(textOf(x)))));
  if (!m) return;
  m.spam = { why: String(why || ''), abuse: !!abuse };
  redrawLine(m);
}
// Translating (chat/translate.js): new messages from a chat that translates them (Settings › Chat › Translate new
// messages in every chat, or that chat's Translate new messages too), or one from its menu. The badge shows the original.
const trQueue = [];
let trSoon;
function translateSoon(m){
  if (!window.kmv || !window.kmv.translate || !/\p{L}{3}/u.test(textOf(m)) || trQueue.includes(m)) return;
  trQueue.push(m); trSoon();
}
async function translateNow(){
  const ms = trQueue.splice(0, 25); if (!ms.length) return;
  const got = await window.kmv.translate(ms.map(textOf)).catch(() => null);
  ms.forEach((m, i) => { const g = Array.isArray(got) && got[i]; if (g && g.text && g.text.trim() !== textOf(m).trim()){ m.tr = { text: String(g.text), from: String(g.fromName || g.from || '') }; redrawLine(m); } });
  if (trQueue.length) trSoon();
}
// A deleted message, or all of one person's (a timeout or ban), or the whole chat cleared. Where you're a mod it stays,
// struck through, saying why, and a line says what was done (who did it where the site says); otherwise it goes, as
// the site doesn't show it to you either.
let logN = 0;
function removed(f, view, d, ch){
  const mod = youMod(ch), site = PLAT_NAME[d.site];
  const hit = d.kind === 'delete' ? [f.byId.get(d.site + ':' + d.target)].filter(Boolean)
    : f.msgs.filter(m => m.site === d.site && m.kind === 'message' && (d.kind === 'clearall' || (d.login ? m.login === d.login : m.userId === d.userId)));
  const lineOf = m => view && view.list.querySelector(`.al-m[data-key="${CSS.escape(m.site + ':' + m.id)}"]`);
  if (!mod) hit.forEach(m => { f.msgs.splice(f.msgs.indexOf(m), 1); f.byId.delete(m.site + ':' + m.id); lineOf(m)?.remove(); });
  else hit.forEach(m => {
    const secs = d.until ? Math.round((d.until - d.t) / 1000) : 0;
    m.deleted = d.ai ? { ai: true, rules: d.rules || [] } : { by: d.kind === 'clear' ? (d.until ? 'timeout' : 'ban') : d.kind === 'clearall' ? 'clear' : '', secs };
    lineOf(m)?.replaceWith(lineEl(m));
  });
  // what was done, as a line: for mods, and a cleared chat for everyone (who did it: Kick says; Twitch tells moderators
  // apart, as a moderation action, before or after: modAction)
  if (d.kind === 'delete'){ const by = d.site === 'twitch' && takeModBy('msg:' + d.target); if (by && hit[0] && hit[0].deleted){ hit[0].deleted.who = by; lineOf(hit[0])?.replaceWith(lineEl(hit[0])); } return; }
  if (!mod && d.kind !== 'clearall') return;
  const who = hit[0] ? hit[0].sender : d.login;
  if (!d.by && d.site === 'twitch') d.by = takeModBy(d.kind === 'clearall' ? 'clear' : 'user:' + d.login) || '';
  const m = { kind: 'modlog', site: d.site, ch, id: 'log' + (++logN), t: d.t, d, who, words: logWords(d, who, site) };
  f.msgs.push(m); if (view) addLine(view, m);
}
// A moderation line's words: who did it (where known), to whom, how long
function logWords(d, who, site){
  const secs = d.until ? Math.round((d.until - d.t) / 1000) : 0;
  return d.kind === 'clearall' ? [d.by ? element('b', null, d.by) : 'A moderator', ` cleared ${site}'s chat`]
    : d.until ? [...(d.by ? [element('b', null, d.by), ' timed out '] : []), element('b', null, who), d.by ? '' : ' was timed out', element('span', 'al-amt', ` · ${durText(secs)}`)]
    : [...(d.by ? [element('b', null, d.by), ' banned '] : []), element('b', null, who), d.by ? '' : ' was banned'];
}
// They raided another channel (windows/raids.js): a line in their ALL, with Open (unless it's open already)
function allRaid(from, to, opened){
  const s = streamerOf(from); if (!s) return;
  const f = feedOf(s), view = viewFor(s), m = { kind: 'raidout', site: platOf(from), ch: from, id: 'raid' + (++logN), t: Date.now(), to, opened };
  f.msgs.push(m); if (view) addLine(view, m);
}
/* Twitch's moderation actions (to moderators): who timed out, banned, deleted or cleared, and who changed a mode. Its chat
   says what happened without who: the two meet whichever comes first (kept a little while for the other). */
const modBy = new Map();   // "user:<login>" | "msg:<id>" | "clear" -> { by, t }
function takeModBy(key){ const x = modBy.get(key); modBy.delete(key); return x && Date.now() - x.t < 15000 ? x.by : ''; }
const MODE_SAID = { slow: ['turned on slow mode', 's'], slowoff: ['turned off slow mode'], followers: ['turned on followers-only', 'm'], followersoff: ['turned off followers-only'],
  subscribers: ['turned on subscribers-only'], subscribersoff: ['turned off subscribers-only'], emoteonly: ['turned on emotes-only'], emoteonlyoff: ['turned off emotes-only'],
  uniquechat: ['turned on unique chat'], uniquechatoff: ['turned off unique chat'] };
function modAction(f, view, a, ch){
  const site = PLAT_NAME[a.site], recent = x => x.kind === 'modlog' && x.site === a.site && x.ch === ch && !x.d.by && a.t - x.t < 15000;
  if (/^(timeout|ban|clear)$/.test(a.action)){
    const line = [...f.msgs].reverse().find(x => recent(x) && (a.action === 'clear' ? x.d.kind === 'clearall' : x.d.login === a.target));
    if (!line){ modBy.set(a.action === 'clear' ? 'clear' : 'user:' + a.target, { by: a.by, t: a.t }); return; }
    line.d.by = a.by; line.words = logWords(line.d, line.who, site); redrawLine(line);
    return;
  }
  if (a.action === 'delete'){
    const m = a.msgId && f.byId.get(a.site + ':' + a.msgId);
    if (m && m.deleted){ m.deleted.who = a.by; redrawLine(m); } else if (a.msgId) modBy.set('msg:' + a.msgId, { by: a.by, t: a.t });
    return;
  }
  const said = MODE_SAID[a.action]; if (!said) return;
  const words = [element('b', null, a.by), ' ' + said[0], said[1] && a.arg ? element('span', 'al-amt', ` · ${said[1] === 's' ? modeDur(a.arg) : a.arg ? modeDur(a.arg * 60) : ''}`) : ''];
  const m = { kind: 'modlog', site: a.site, ch, id: 'log' + (++logN), t: a.t, d: { by: a.by }, who: '', words };
  f.msgs.push(m); if (view) addLine(view, m);
}
// A ban or timeout lifted (Kick says so): for mods, a line says who lifted it; their struck lines stay as they were
function unbanned(f, view, d, ch){
  if (!youMod(ch)) return;
  const words = [...(d.by ? [element('b', null, d.by), ' lifted the ban on '] : []), element('b', null, d.who), d.by ? '' : '\'s ban was lifted'];
  const m = { kind: 'modlog', site: d.site, ch, id: 'log' + (++logN), t: d.t, words };
  f.msgs.push(m); if (view) addLine(view, m);
}

/* ---- pins: the pill (📌 and how many) shows and hides one compact strip, however many sites have one ---- */
// A site's pin (each site has one at a time), or its pin taken down. A new one makes the pill ping; one already up when
// the chat opens (quiet: read by pinAgent) goes in without.
function setPin(f, s, ch, d, quiet = false){
  if (d.kind === 'unpin' && d.id && !f.pins.some(p => p.site === d.site && p.id === d.id)) return;   // (another pin's)
  if (d.kind === 'pin' && quiet && f.pins.some(p => p.site === d.site && p.id === d.id)) return;   // (heard already)
  f.pins = f.pins.filter(p => p.site !== d.site);
  if (d.kind === 'pin'){ d.msg.ch = ch; f.pins.unshift({ site: d.site, ch, id: d.id, msg: d.msg, t: d.t, by: d.by || '' }); }
  const view = viewFor(s); if (!view) return;
  if (d.kind === 'pin') view.pinAt = d.site;
  renderPins(view);
  if (d.kind === 'pin' && !quiet) pingPill(view, d.site);
}
// The pill's ping: it bounces and glows in the site's colour for a few seconds (a new pin, yours or a moderator's)
function pingPill(view, site){
  const c = view.pinChip;
  c.classList.remove('ping', 'ping-kick', 'ping-twitch', 'ping-youtube'); void c.offsetWidth;   // (again from the start)
  c.classList.add('ping', 'ping-' + site);
  clearTimeout(c.pingT); c.pingT = setTimeout(() => c.classList.remove('ping', 'ping-' + site), 3200);
}
const pinAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
function renderPins(view){
  const f = feedOf(view.s), n = f.pins.length;
  view.pinChip.hidden = !n;
  view.pinChip.replaceChildren(element('i', { html: icon.pin }), String(n));
  view.pinChip.setAttribute('aria-pressed', String(!!view.pinsShown && !!n));
  view.pinChip.title = view.pinsShown ? 'Hide the pinned messages' : `Show the pinned message${n > 1 ? 's' : ''}`;
  view.pins.hidden = !n || !view.pinsShown;
  if (n < 2) view.pinsOpen = false;
  if (view.pins.hidden) return;
  // one line each: site, name, the message (the rest in its tooltip), and when (or 1 of 2)
  const row = (p, sub, ...end) => {
    const text = p.msg.parts.map(x => x.text || x.name).join('');
    return element('div', { class: 'all-pin-row', title: `${p.msg.sender}: ${text}${p.by ? `\nPinned by ${p.by}` : ''}` }, element('i', { class: 'pi pi-' + p.site }, PLAT_NAME[p.site][0]),
      element('div', 'all-pin-t', element('b', { style: { color: nameColor(p.msg) } }, p.msg.sender), ' ', ...partsEl(p.msg.parts, p.ch)), element('small', 'all-pin-s', sub), ...end);
  };
  if (view.pinsOpen){
    view.pins.replaceChildren(...f.pins.map((p, i) => row(p, pinAgo(p.t), !i && element('button', { type: 'button', class: 'all-pin-open', title: 'Only the newest', 'aria-label': 'Only the newest', 'aria-expanded': 'true', html: CHEVRON, dataset: { cmd: 'all.pinsOpen' }, onclick: () => { view.pinsOpen = false; renderPins(view); } }))));
    return;
  }
  const cur = f.pins.find(p => p.site === view.pinAt) || f.pins[0];
  view.pins.replaceChildren(row(cur, pinAgo(cur.t),
    n > 1 && element('span', 'all-pin-sw', ...f.pins.map(p => element('button', { type: 'button', class: 'pi pi-' + p.site + (p === cur ? ' on' : ''), title: `${PLAT_NAME[p.site]}'s pin`, 'aria-pressed': String(p === cur), dataset: { cmd: 'all.pinSite' },
      onclick: () => { view.pinAt = p.site; renderPins(view); } }, PLAT_NAME[p.site][0]))),
    n > 1 && element('button', { type: 'button', class: 'all-pin-open', title: `All ${n}`, 'aria-label': `All ${n} pins`, 'aria-expanded': 'false', html: CHEVRON, dataset: { cmd: 'all.pinsOpen' }, onclick: () => { view.pinsOpen = true; renderPins(view); } })));
}

/* ---- the view ---- */
const viewFor = s => {
  const lead = wins.find(o => o.kind === 'chat' && !o.hiddenTab && streamerOf(o.channel) === s && allOn(o));
  return lead && lead.allView || null;
};
const SITE_CLASS = { kick: 'k', twitch: 't', youtube: 'y' };
const BADGE_TIP = { host: 'Streamer', mod: 'Moderator', vip: 'VIP', sub: 'Subscriber', og: 'OG', verified: 'Verified', staff: 'Staff', gifter: 'Sub gifter' };
// a readable colour for a name: the site's, or one from the name
function nameColor(m){
  if (/^#[0-9a-f]{6}$/i.test(m.color)) return m.color;
  let h = 0; for (const c of m.login || m.sender) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 68%)`;
}
// A message's text and emotes; with its channel (ch), the 7TV, BetterTTV and FrankerFaceZ emotes in its words too (as the
// site's chat shows them with those add-ons), and the emotes new since you last opened the chat glowing (Settings ›
// Chat › Highlight new emotes) until you point at one
function partsEl(parts, ch){
  const add = ch ? addonEmotes(ch, redrawAll) : null, fresh = ch && newEmotesOn ? freshEmotes.get(ch) : null, out = [];
  parts.forEach(p => {
    if (p.emote) return out.push(emoteEl(p.emote, p.name, '', ch, fresh));
    if (!add || !add.size) return out.push(p.text);
    String(p.text).split(/(\s+)/).forEach(t => { const e = t && add.get(t); if (e) out.push(emoteEl(e.url, t, e.src, ch, fresh)); else if (t) out.push(t); });
  });
  return out;
}
function emoteEl(src, name, from, ch, fresh){
  const isNew = !!(fresh && fresh.has(name));
  const img = element('img', { class: 'al-e' + (isNew ? ' al-new' : ''), src, alt: name, title: isNew ? `${name} · new` : from ? `${name} · ${from}` : name, loading: 'lazy', referrerPolicy: 'no-referrer' });
  img.onerror = () => img.replaceWith(document.createTextNode(name));
  if (isNew) img.onpointerenter = () => emoteSeen(ch, name);
  return img;
}
// A new emote pointed at: not new any more, here and in that channel's chats (as pointing at it there does)
function emoteSeen(ch, name){
  const fresh = freshEmotes.get(ch); if (!fresh || !fresh.delete(name)) return;
  if (window.kmv && window.kmv.emotesSeen) window.kmv.emotesSeen(ch, name).catch(() => {});
  wins.forEach(o => { if (o.kind === 'chat' && o.channel === ch && o.ready) runIn(o.view, `window.__kmvNew && window.__kmvNew.set(window.__kmvNew.list().filter(n => n !== ${JSON.stringify(name)}))`); });
  const view = viewFor(streamerOf(ch));
  if (view) view.el.querySelectorAll('img.al-new').forEach(i => { if (i.alt === name){ i.classList.remove('al-new'); i.title = name; } });
}
function lineEl(m){
  if (m.kind === 'mine') return m.state === 'seen' || m.state === 'dropped' ? null : mineEl(m);
  if (m.kind === 'raidout') return element('div', { class: `al-ev al-raidout al-${SITE_CLASS[m.site]}`, dataset: { key: m.site + ':' + m.id } },
    element('i', { class: 'pi pi-' + m.site }, (PLAT_NAME[m.site] || m.site)[0]), element('span', { class: 'al-evt', html: icon.raid }),
    element('span', 'al-evw', element('b', null, nameOf(m.ch)), ' raided ', element('b', null, chLabel(m.to)), element('span', 'al-amt', ` on ${PLAT_NAME[m.site]}`)),
    m.opened ? element('span', 'al-tag al-tag-raid', 'Opened') : element('button', { type: 'button', class: 'al-go', dataset: { cmd: 'all.raidOpen' }, title: `Open ${chLabel(m.to)} in a window of its own`,
      onclick: () => { addParsed({ channel: m.to, only: null }); m.opened = true; redrawLine(m); } }, 'Open ›'));
  if (m.kind === 'modlog') return element('div', { class: `al-ev al-log al-${SITE_CLASS[m.site]}`, dataset: { key: m.site + ':' + m.id } },
    element('i', { class: 'pi pi-' + m.site }, (PLAT_NAME[m.site] || m.site)[0]), element('span', { class: 'al-evt', html: SHIELD }), element('span', 'al-evw', ...m.words.map(x => x instanceof Node ? x.cloneNode(true) : x)));
  const site = PLAT_NAME[m.site] || m.site;
  const who = element('span', 'al-who', element('i', { class: 'pi pi-' + m.site, title: site }, site[0]),
    ...m.badges.map(b => element('i', { class: 'al-b al-b-' + b, title: BADGE_TIP[b] || b, html: BADGE_SVG[b] || '' })));
  const can = m.kind === 'message' && canModerate(m);
  const name = element('b', { class: 'al-n' + (can ? ' can' : ''), style: { color: nameColor(m) }, role: 'button', tabindex: '-1', dataset: { cmd: 'all.profile' },
    title: `${m.sender}'s card on ${site}` + (can ? `\n${kShift()}-click: delete · ${kCtrl()}-click: time out (${durText(lastTimeout())}) · ${kCtrl()}+${kShift()}-click: ban` : ''),
    onclick: e => nameClick(m, e) }, m.sender);
  if (m.kind === 'event'){
    if (eventsMode === 'hidden') return null;
    const full = eventsMode === 'full' || !m.summary;
    const words = full ? [m.text || m.sender] : m.summary.map((x, i) => x.strong ? element('b', i ? 'al-amt' : null, x.strong) : x.text);
    const to = m.gift ? m.gift.to : [], me = meOn(m.site);
    return element('div', { class: `al-ev al-${SITE_CLASS[m.site]}${full ? ' al-full' : ''}${to.length ? ' al-gift' : ''}${m.gift && m.gift.me ? ' al-gift-me' : ''}`, dataset: { key: m.site + ':' + m.id } }, element('i', { class: 'pi pi-' + m.site }, site[0]),
      element('span', 'al-evt', element('span', 'al-evw', ...words), m.parts.length ? element('span', 'al-evm', ...partsEl(m.parts, m.ch)) : ''),
      element('button', { type: 'button', class: 'al-go', dataset: { cmd: 'all.seeIt' }, title: `Show it in ${site}'s own chat`, onclick: () => seeIt(m) }, `See it on ${site} ›`),
      // (who got them: a row under it, its button first, their names after it while open)
      to.length > 0 && element('div', 'al-gl',
        element('button', { type: 'button', class: 'al-gto', 'aria-expanded': String(!!m.giftOpen), dataset: { cmd: 'all.giftTo' }, title: m.giftOpen ? 'Hide who got them' : 'Who got them',
          onclick: () => { m.giftOpen = !m.giftOpen; redrawLine(m); } }, `${to.length} ${to.length === 1 ? 'recipient' : 'recipients'}`, element('i', { html: CHEVRON })),
        m.gift.me && element('span', { class: 'al-tag al-tag-at', title: 'You got one of them' }, 'To you'),
        ...(m.giftOpen ? to.map(r => element('span', { class: 'al-gc' + (me && r.login === me ? ' me' : '') }, r.name)) : [])));
  }
  const cls = ['al-m', m.toMe === 'reply' ? 'al-rep' : m.toMe === 'at' || m.toMe === 'word' ? 'al-me' : '', m.spam ? 'al-spam' : '', m.bot ? 'al-bot' : '', m.deleted ? 'al-del' : '', m.highlight ? 'al-hl' : '',
    m.announce ? 'al-ann al-ann-' + m.announce : '', m.redeem ? 'al-rw' : ''].filter(Boolean).join(' ');
  const hideBot = m.bot && !botsShown && !m.open;
  const body = hideBot ? element('span', 'al-hid', 'bot message hidden') : m.tr && !m.trOrig ? element('span', 'al-txt', m.tr.text) : element('span', 'al-txt', ...partsEl(m.parts, m.ch));
  const tags = [
    m.toMe === 'at' && element('span', 'al-tag al-tag-at', '@YOU'),
    m.toMe === 'word' && element('span', { class: 'al-tag al-tag-at', title: 'A word you watch for (Settings › Mentions)' }, m.word),
    m.spam && element('span', { class: 'al-tag al-tag-spam' + (m.spam.abuse ? ' abuse' : ''), title: m.spam.why }, m.spam.abuse ? 'Abuse?' : 'Spam?'),
    m.tr && !hideBot && element('button', { type: 'button', class: 'al-tag al-tag-tr', title: m.trOrig ? 'Show the translation' : 'Show the original', dataset: { cmd: 'all.translation' },
      onclick: () => { m.trOrig = !m.trOrig; redrawLine(m); } }, `${m.trOrig ? 'Original' : 'Translated'}${m.tr.from ? ' · ' + m.tr.from.toUpperCase() : ''}`),
    m.toMe === 'reply' && element('span', { class: 'al-tag al-tag-rp' + (m.bot ? ' soft' : '') }, m.bot ? 'TO YOU' : 'REPLY'),
    m.toMe === 'at' && m.bot && element('span', 'al-tag al-tag-rp soft', 'TO YOU'),
    m.highlight && element('span', 'al-tag al-tag-hl', 'Highlighted'),
    m.announce && element('span', 'al-tag al-tag-ann', 'Announcement'),
    m.bits && element('span', 'al-tag al-tag-bits', `${m.bits} bits`),
    m.redeem && element('span', { class: 'al-tag al-tag-rw', title: 'A reward redeemed with channel points', style: m.redeem.color ? { '--rw': m.redeem.color } : {} }, m.redeem.title || 'Channel points'),
    m.deleted && element('span', { class: 'al-tag al-tag-del' + (m.deleted.ai ? ' ai' : '') },
      m.deleted.ai ? ['Deleted', 'AI moderation', ...m.deleted.rules].join(' · ') : m.deleted.by === 'ban' ? 'Banned' : m.deleted.by === 'timeout' ? 'Timed out' + (m.deleted.secs ? ` · ${durText(m.deleted.secs)}` : '') : m.deleted.by === 'clear' ? 'Chat cleared' : 'Deleted' + (m.deleted.who ? ` by ${m.deleted.who}` : '')),
    m.bot && !botsShown && element('button', { type: 'button', class: 'al-show linkish', dataset: { cmd: 'all.showBot' }, onclick: e => { m.open = !m.open; e.target.closest('.al-m').replaceWith(lineEl(m)); } }, m.open ? 'Hide' : 'Show')
  ].filter(Boolean);
  if (m.toMe === 'at' && m.bot) tags.splice(0, 1);   // (a bot's @: marked as to you, softly)
  const hover = !m.deleted && element('span', 'al-hb',
    element('button', { type: 'button', title: `Reply on ${site}`, 'aria-label': `Reply to ${m.sender} on ${site}`, html: icon.reply, dataset: { cmd: 'all.reply' }, onclick: () => startReply(m) }),
    can && element('button', { type: 'button', title: `Delete on ${site} (${kShift()}-click the name)`, 'aria-label': `Delete ${m.sender}'s message on ${site}`, html: icon.bin, dataset: { cmd: 'all.delete' }, onclick: () => modAct(m, 'delete') }),
    element('span', 'al-hb-div'),
    element('button', { type: 'button', title: 'More', 'aria-label': 'More', html: DOTS, dataset: { cmd: 'all.more' }, onclick: e => openLineMenu(m, e.currentTarget) }));
  return element('div', { class: cls, dataset: { key: m.site + ':' + m.id }, oncontextmenu: e => { e.preventDefault(); openLineMenu(m, e); } }, hover,
    m.reply && element('span', 'al-q', '↩ replying to ', element('b', null, m.reply.login && m.reply.login === meOn(m.site) ? 'you' : m.reply.sender), m.reply.body ? ': ' + m.reply.body : ''),
    element('div', 'al-line', who, name, m.action ? ' ' : ': ', body, ...tags));
}
function addLine(view, m){
  const list = view.list, stick = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const el = lineEl(m); if (!el) return;
  view.empty.hidden = true;
  list.append(el);
  while (list.children.length > MAX) list.firstChild.remove();
  if (stick) list.scrollTop = list.scrollHeight; else view.more.hidden = false;
}
function buildView(w){
  const s = streamerOf(w.channel), f = feedOf(s);
  const list = element('div', { class: 'all-list', tabindex: '-1', role: 'log', 'aria-label': `${nameOf(w.channel)}'s chats together`, 'aria-live': 'off' });
  const empty = element('div', 'all-empty');
  const more = element('button', { type: 'button', class: 'all-more', hidden: true, dataset: { cmd: 'all.latest' }, onclick: () => { list.scrollTop = list.scrollHeight; more.hidden = true; } }, 'New messages ↓');
  list.addEventListener('scroll', () => { if (list.scrollHeight - list.scrollTop - list.clientHeight < 60) more.hidden = true; });
  const filt = element('button', { type: 'button', class: 'all-filt', 'aria-label': 'What ALL shows', 'aria-haspopup': 'menu', html: FILTER, dataset: { cmd: 'all.filters' } });
  const fm = element('div', { class: 'pop all-lm all-fm', role: 'menu', 'aria-label': 'What ALL shows', hidden: true });
  const modes = element('div', { class: 'all-modes', hidden: true, role: 'status', 'aria-live': 'polite' });
  const health = element('div', { class: 'all-health', hidden: true, role: 'alert' });
  const pick = element('button', { type: 'button', class: 'all-pick', dataset: { cmd: 'all.sendSite' }, 'aria-haspopup': 'menu' });
  const input = element('input', { type: 'text', class: 'all-in', autocomplete: 'off', spellcheck: true, maxlength: 500, dataset: { cmd: 'all.message' } });
  const menu = element('div', { class: 'pop all-menu', role: 'menu', hidden: true });
  const bar = element('div', { class: 'all-rb', hidden: true });
  const at = element('div', { class: 'pop all-at', role: 'listbox', hidden: true });
  const lm = element('div', { class: 'pop all-lm', role: 'menu', hidden: true });
  const sendB = element('button', { type: 'button', class: 'all-send-b', 'aria-label': 'Send', html: SEND, disabled: true, dataset: { cmd: 'all.send' } });
  const emo = element('button', { type: 'button', class: 'all-emo-b', title: 'Emotes', 'aria-label': 'Emotes', 'aria-haspopup': 'dialog', html: SMILEY, dataset: { cmd: 'all.emotes' } });
  const ep = element('div', { class: 'pop all-ep', role: 'dialog', 'aria-label': 'Emotes', hidden: true });
  const pins = element('div', { class: 'all-pins', hidden: true, role: 'region', 'aria-label': 'Pinned messages' });
  const pinChip = element('button', { type: 'button', class: 'all-pinchip', hidden: true, dataset: { cmd: 'all.pins' },
    onclick: () => { view.pinsShown = !view.pinsShown; renderPins(view); } });
  const mv = element('div', { class: 'pop all-lm all-mv', role: 'menu', 'aria-label': 'Mod views', hidden: true });
  const el = element('div', { class: 'all-view' }, element('div', 'all-top', element('span', 'all-sites'), pinChip, filt), health, pins, list, more, empty,
    element('div', 'all-cmp', bar, modes, element('div', 'all-box', pick, input, emo, sendB)), menu, at, lm, mv, ep, fm);
  const view = { el, list, empty, more, filt, fm, modes, health, pins, pinChip, pinsShown: false, pinsOpen: false, pinAt: '', s, pick, input, menu, bar, at, lm, mv, ep, emo, sendB, w, lock: null, atList: [], atSel: 0, atMode: '' };
  closeOnOutside(lm);
  closeOnOutside(fm, { button: filt });
  el.addEventListener('pointerdown', () => allSeen(w));
  el.addEventListener('focusin', () => allSeen(w));
  filt.onclick = () => { if (fm.hidden) openFilters(view); else fm.hidden = true; };
  closeOnOutside(ep, { button: emo });
  emo.onclick = () => openEmotePicker(view, w);
  sendB.onclick = () => { sendNow(view, w); input.focus(); };
  closeOnOutside(mv, { button: w.el.querySelector('[data-a=mod]') });
  closeOnOutside(menu, { button: pick });
  pick.onclick = () => { if (view.lock) return flash('Locked to this site · Esc or ✕ unlocks'); if (menu.hidden) openPickMenu(view, w); else menu.hidden = true; };
  input.addEventListener('keydown', e => {
    if (!at.hidden && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)){
      e.preventDefault();
      if (e.key === 'Escape') at.hidden = true;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ view.atSel = (view.atSel + (e.key === 'ArrowDown' ? 1 : -1) + view.atList.length) % view.atList.length; (view.atMode === 'emote' ? renderEmoteList : renderAt)(view); }
      else (view.atMode === 'emote' ? pickEmote : pickAt)(view, w, view.atList[view.atSel]);
      return;
    }
    if (e.key === 'Escape' && view.lock){ e.preventDefault(); setLock(view, w, null); }
    else if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); sendNow(view, w); }
    else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey){
      e.preventDefault();
      if (view.lock) flash(`Locked to ${PLAT_NAME[platOf(view.lock.ch)]} while ${LOCK_WHY[view.lock.kind]} · Esc unlocks`);
      else if (e.shiftKey) cycleTabs(w); else stepSend(view, w, 1);
    }
  });
  input.addEventListener('input', () => { syncSendB(view, w); suggestAt(view, w); if (view.at.hidden || view.atMode === 'emote') suggestEmote(view, w); if (!input.value.trim() && view.lock && (view.lock.kind === 'at' || view.lock.kind === 'emote')) setLock(view, w, null); });
  list.append(...f.msgs.map(lineEl).filter(Boolean));
  // the chat's text size: Chat text size, times this chat's own (Chat Stage, Chat Rail and Blow up make one bigger, on its view)
  view.sizeObs = new MutationObserver(() => fitSize(view));
  view.sizeObs.observe(w.el, { attributes: true, attributeFilter: ['style'], subtree: true });
  fitSize(view);
  return view;
}
// ALL's text the size of the chat's: Chat text size, times the bigger size Chat Stage, Chat Rail or Blow up give this chat
function fitSize(view){
  const own = view.w.view && view.w.view.style ? parseFloat(view.w.view.style.zoom) || 1 : 1;
  const z = Math.round(chatZoom() * own * 100) / 100, was = view.el.style.zoom;
  if (String(z === 1 ? '' : z) !== was) view.el.style.zoom = z === 1 ? '' : String(z);
}
// A site's part of ALL that stopped working (chat/all-health.js): one line above the list, what isn't working, with See
// it on … (its own chat, where nothing is lost) and Report for a fix; ✕ hides it until it changes
function renderHealth(view, w, chs){
  const bad = chs.map(ch => [ch, healthState(ch)]).filter(([, h]) => h && !h.hidden);
  view.health.hidden = !bad.length;
  view.health.replaceChildren(...bad.map(([ch, h]) => element('div', 'all-hl',
    element('i', { class: 'all-hl-ic', html: icon.alert }), element('i', { class: 'pi pi-' + platOf(ch) }, PLAT_NAME[platOf(ch)][0]),
    element('span', 'all-hl-t', h.why),
    element('button', { type: 'button', class: 'all-hl-x', 'aria-label': 'Hide', title: 'Hide (it comes back if it changes)', html: icon.close, dataset: { cmd: 'all.healthHide' }, onclick: () => { h.hidden = true; renderHealth(view, w, chs); } }),
    element('div', 'all-hl-acts',
      element('button', { type: 'button', class: 'all-hl-rep', dataset: { cmd: 'all.healthReport' }, title: 'Saves what\'s needed to fix it, without names, ids or words', onclick: () => reportHealth([ch]) }, 'Report for a fix'),
      element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'all.healthSee' }, onclick: () => seeIt({ ch }) }, `See it on ${PLAT_NAME[platOf(ch)]} ›`)))));
}
// The sites it hears, the filter pill, and what it says while it has nothing yet
function renderTop(view, w){
  const chs = tabChannels(w), heard = chs.filter(ch => frameOf(w).some(o => o.channel === ch && o.kind === 'chat'));
  view.el.querySelector('.all-sites').replaceChildren(...chs.map(ch => { const bad = healthState(ch);
    return element('i', { class: 'pi pi-' + platOf(ch) + (heard.includes(ch) ? '' : ' dim') + (bad ? ' warn' : ''), title: bad ? bad.why : `${PLAT_NAME[platOf(ch)]}${heard.includes(ch) ? '' : ': offline'}` }, PLAT_NAME[platOf(ch)][0]); }));
  renderHealth(view, w, chs);
  view.filt.title = `What ALL shows · bots ${botsShown ? 'shown' : 'hidden'}, events ${eventsMode}`;
  view.filt.classList.toggle('set', botsShown || eventsMode !== 'short');   // (a dot: not as it starts)
  if (!view.fm.hidden) openFilters(view);
  const names = heard.map(ch => PLAT_NAME[platOf(ch)]), off = chs.filter(ch => !heard.includes(ch)).map(ch => PLAT_NAME[platOf(ch)]);
  renderCmp(view, w);
  view.empty.replaceChildren(element('b', null, names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.slice(-1)} chats together` : `${names[0] || 'Their'} chat`),
    off.length ? element('span', null, `${off.join(' and ')} ${off.length > 1 ? 'are' : 'is'} offline`) : '', element('small', null, 'New messages show here as they arrive.'));
  view.empty.hidden = !!view.list.children.length;
  renderPins(view);
}

/* ---- sending: Send on [K ▾] (in-site/send.js types it into that site's own chat box) ---- */
// The sites you can send on: their chat is open in this window and loaded; YouTube only once its live chat is found
function sendSites(w){
  return tabChannels(w).filter(ch => {
    const m = frameOf(w).find(o => o.kind === 'chat' && o.channel === ch);
    return !!m && !!m.ready && (platOf(ch) !== 'youtube' || !!infoFor(ch)?.live);
  });
}
const sendSaved = () => { const o = settings.json('allSend', {}); return o && typeof o === 'object' ? o : {}; };
// The site it sends on: the last one used for this streamer, else their main channel, else the first that can
function sendSite(w){
  const lock = w.allView && w.allView.lock; if (lock) return lock.ch;
  const s = streamerOf(w.channel), ok = sendSites(w), was = sendSaved()[s.id];
  return ok.includes(was) ? was : ok.includes(s.main) ? s.main : ok[0] || null;
}
function setSendSite(view, w, ch){
  settings.set('allSend', { ...sendSaved(), [streamerOf(w.channel).id]: ch });
  renderCmp(view, w);
}
function stepSend(view, w, d){
  const ok = sendSites(w), cur = sendSite(w);
  if (ok.length < 2) return flash(ok.length ? `Only ${PLAT_NAME[platOf(ok[0])]} can be sent on right now` : 'No chat to send on right now');
  setSendSite(view, w, ok[(ok.indexOf(cur) + d + ok.length) % ok.length]);
}
// The send button: in the send site's colour, there to press once there's something to send (a spinner while sending)
function syncSendB(view, w){
  const b = view.sendB, ch = sendSite(w), p = ch && PLAT_NAME[platOf(ch)];
  const r = ch ? chatRules(ch) : {};
  b.disabled = !p || !view.input.value.trim() || !!view.sending || !!r.wait || !!r.block;
  b.classList.toggle('busy', !!view.sending);
  b.classList.toggle('wait', !!r.wait); b.dataset.wait = r.wait ? String(r.wait) : '';
  b.title = view.sending ? 'Sending…' : r.wait ? `Slow mode: ${r.wait}s` : p ? `Send on ${p} (Enter)` : 'No chat to send on right now';
}
function renderCmp(view, w){
  const ch = sendSite(w), p = ch && platOf(ch);
  view.pick.replaceChildren(p ? element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]) : element('i', { class: 'pi dim' }, '–'),
    view.lock ? element('i', { class: 'all-lock', html: icon.lock, title: 'Locked to this site' }) : element('span', 'all-caret', '▾'));
  view.pick.classList.toggle('locked', !!view.lock);
  renderLock(view, w);
  view.pick.title = view.lock ? `Locked to ${PLAT_NAME[p]} while ${LOCK_WHY[view.lock.kind]} (Esc unlocks)` : p ? `Sending on ${PLAT_NAME[p]} (Tab: the next site)` : 'No chat to send on right now';
  // Settings › Chat › Channel name in chat boxes: its text, as the sites' boxes say it (the picker beside it shows the site)
  // (its modes say why you can't chat there: that, instead of the name)
  const rules = ch ? chatRules(ch) : null;
  view.input.placeholder = !p ? 'No chat to send on right now' : rules.block || chatBoxName(ch) || `Send a message on ${PLAT_NAME[p]}`;
  view.input.disabled = !p || !!rules.block;
  view.el.classList.toggle('all-blocked', !!(rules && rules.block));
  renderModes(view, w);
  view.input.maxLength = p === 'youtube' ? 200 : 500;
  view.el.dataset.send = p || '';
  syncSendB(view, w);
}
// The picker's menu: each of their sites, the ones you can't send on with why
function openPickMenu(view, w){
  const ok = sendSites(w), cur = sendSite(w), main = streamerOf(w.channel).main;
  const why = ch => { const i = infoFor(ch); return platOf(ch) === 'youtube' && !(i && i.live) ? 'no live chat found' : i && !i.live ? 'offline' : 'not open'; };
  view.menu.replaceChildren(
    ...tabChannels(w).map(ch => { const p = platOf(ch), can = ok.includes(ch);
      return element('button', { type: 'button', role: 'menuitemradio', class: 'all-mi' + (ch === cur ? ' on' : ''), disabled: !can, 'aria-checked': String(ch === cur), dataset: { cmd: 'all.sendOn' },
        onclick: () => { setSendSite(view, w, ch); view.menu.hidden = true; view.input.focus(); } },
        element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]), element('span', null, PLAT_NAME[p] + (can ? '' : ' · ' + why(ch))), ch === main ? element('small', null, 'Main') : ''); }),
    element('div', 'all-mh', element('kbd', null, 'Tab'), ' next site · ', element('kbd', null, '⇧Tab'), ' its own tab'));
  view.menu.hidden = false;
}
const SEND = '<svg viewBox="0 0 24 24"><path d="M4.5 12 3.2 5.1a1 1 0 0 1 1.4-1.1l15.6 7.1a1 1 0 0 1 0 1.8L4.6 20a1 1 0 0 1-1.4-1.1z"/><path d="M4.5 12h7"/></svg>';
const SEND_FAIL = {
  'no-box': p => `Can't chat on ${p} from here: you may need to sign in to ${p} (Settings › Accounts)`,
  disabled: p => `${p} isn't letting you chat right now (followers-only, slow mode or similar)`,
  'not-filled': p => `Couldn't type into ${p}'s chat box`,
  'not-sent': p => `${p} didn't send it: it's still in its chat box`
};
const sender = {
  mod: (m, action, id) => askIn(m.view, `(${modAgent})(${JSON.stringify(action)}, ${JSON.stringify(id)})`),
  send: (m, text) => askIn(m.view, `(${sendAgent})(${JSON.stringify(platOf(m.channel))}, ${JSON.stringify(text)})`),
  reply: (m, id, text, who) => platform(m.channel).threadedReplies === 'pointer' ? pointerReply(m, id, text, who)
    : askIn(m.view, `(async () => (await (${replyAgent})(${JSON.stringify(id)})) ? (${sendAgent})(${JSON.stringify(platOf(m.channel))}, ${JSON.stringify(text)}) : 'no-reply')()`)
};
// Where the site's Reply only shows under a real pointer (Twitch): the line found and scrolled to, the pointer moved over
// it in that (hidden) chat, its Reply pressed, then the text sent as the reply. No Reply on it (your own message): as an @.
async function pointerReply(m, id, text, who){
  const send = t => askIn(m.view, `(${sendAgent})(${JSON.stringify(platOf(m.channel))}, ${JSON.stringify(t)})`);
  const at = await askIn(m.view, `(${twReplyAt})(${JSON.stringify(id)})`);
  if (!at) return 'no-reply';
  const z = zoomOf(m.view);
  if (!await window.kmv.viewHover(viewId(m.view), at.x * z, at.y * z)) return 'no-reply';
  const r = await askIn(m.view, `(${twReplyPress})(${JSON.stringify(id)})`);
  return r === 'ok' ? send(text) : r === 'cant' ? 'disabled' : who ? send(`@${who.replace(/^@/, '')} ${text}`) : 'no-reply';
}
// Whether a reply on that site threads (its own Reply), or is an @ of them
const threads = ch => { const t = platform(ch).threadedReplies; return t === true || (t === 'pointer' && DESKTOP && !!window.kmv?.viewHover); };

/* ---- replies, @ and names: the box locks to one site until it's sent or cancelled ---- */
function startReply(m){
  const view = viewFor(streamerOf(m.ch)); if (!view) return;
  if (!sendSites(view.w).includes(m.ch)) return flash(`Can't send on ${PLAT_NAME[m.site]} right now`);
  setLock(view, view.w, { kind: 'reply', ch: m.ch, msg: m });
  view.input.focus();
}
const LOCK_WHY = { reply: 'replying', at: 'mentioning', emote: 'using its emotes' };
function setLock(view, w, lock){
  view.lock = lock;
  if (!lock) view.emoteSends = null;   // (emotes picked: words again)
  view.at.hidden = true;
  renderCmp(view, w);
}
// The bar over the box: what it's locked to, and ✕
function renderLock(view, w){
  const l = view.lock, bar = view.bar;
  bar.hidden = !l; if (!l) return bar.replaceChildren();
  const p = PLAT_NAME[platOf(l.ch)];
  const words = l.kind === 'reply'
    ? [element('span', 'all-rb-t', 'Replying to ', element('b', null, l.msg.sender), ' on ', element('b', { class: 'all-rb-site' }, p), threads(l.ch) ? '' : ', as an @mention'),
       element('span', 'all-rb-q', '· ' + l.msg.parts.map(x => x.text || x.name).join(''))]
    : l.kind === 'emote' ? [element('span', 'all-rb-t', 'Emotes from ', element('b', { class: 'all-rb-site' }, p), ` · sends on ${p} only`)]
    : [element('span', 'all-rb-t', 'Mentioning on ', element('b', { class: 'all-rb-site' }, p), ` · ${p} names only`)];
  bar.replaceChildren(element('i', { class: 'all-rb-i', html: l.kind === 'reply' ? icon.reply : l.kind === 'emote' ? SMILEY : icon.at }), ...words,
    element('button', { type: 'button', class: 'all-rb-x', title: 'Cancel (Esc)', 'aria-label': 'Cancel', html: icon.close, dataset: { cmd: 'all.unlock' }, onclick: () => { setLock(view, w, null); view.input.focus(); } }));
}
// @ in the box: names seen in their chats, newest first (only the locked site's while locked)
function suggestAt(view, w){
  const v = view.input, upto = v.value.slice(0, v.selectionStart ?? v.value.length), mm = /(^|\s)@([\w.]*)$/.exec(upto);
  if (!mm){ view.at.hidden = true; return; }
  const q = mm[2].toLowerCase(), lockSite = view.lock && platOf(view.lock.ch), seen = new Set(), list = [];
  for (const m of [...feedOf(view.s).msgs].reverse()){
    if (m.kind !== 'message' || m.bot || !m.sender) continue;
    const key = m.site + ':' + m.login;
    if (seen.has(key) || (lockSite && m.site !== lockSite) || !m.sender.toLowerCase().replace(/^@/, '').startsWith(q)) continue;
    if (!sendSites(w).includes(m.ch)) continue;
    seen.add(key); list.push(m);
    if (list.length >= 6) break;
  }
  view.atList = list; view.atSel = 0; view.atQ = mm[2]; view.atMode = 'at';
  if (!list.length){ view.at.hidden = true; return; }
  renderAt(view);
  view.at.hidden = false;
}
function renderAt(view){
  view.at.replaceChildren(element('div', 'all-at-h', view.lock ? `${PLAT_NAME[platOf(view.lock.ch)]} names` : 'Names in chat'),
    ...view.atList.map((m, i) => element('button', { type: 'button', role: 'option', class: 'all-ati' + (i === view.atSel ? ' on' : ''), 'aria-selected': String(i === view.atSel), dataset: { cmd: 'all.atPick' },
      onmousedown: e => e.preventDefault(), onclick: () => pickAt(view, view.w, m) },
      element('i', { class: 'pi pi-' + m.site }, PLAT_NAME[m.site][0]), element('span', null, element('b', null, m.sender.slice(0, view.atQ.length + (m.sender.startsWith('@') ? 1 : 0))), m.sender.slice(view.atQ.length + (m.sender.startsWith('@') ? 1 : 0))),
      element('small', null, PLAT_NAME[m.site]))),
    element('div', 'all-mh', element('kbd', null, '↑'), element('kbd', null, '↓'), ' pick · ', element('kbd', null, 'Tab'), ' or ', element('kbd', null, 'Enter'), ' adds it and locks to its site'));
}
function pickAt(view, w, m){
  if (!m) return;
  const v = view.input, at = v.selectionStart ?? v.value.length, before = v.value.slice(0, at).replace(/@[\w.]*$/, ''), after = v.value.slice(at);
  const name = '@' + m.sender.replace(/^@/, '') + ' ';
  v.value = before + name + after.replace(/^\s+/, '');
  v.selectionStart = v.selectionEnd = (before + name).length;
  view.at.hidden = true;
  if (!view.lock) setLock(view, w, { kind: 'at', ch: m.ch });
  v.focus();
}
/* ---- mod actions: the hover's Delete, ⋯ and the right-click menu, and a click on a name with keys held ---- */
// the keys' names, as this computer shows them (⌘ and ⇧ on a Mac)
const kCtrl = () => keyName('Ctrl+').slice(0, -1);
const kShift = () => kCtrl() === 'Ctrl' ? 'Shift' : '⇧';
const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const modKnown = new Map();   // channel -> whether you moderate it, set by the tests (else the sites' answer, platforms.js modIs)
const youMod = ch => modKnown.has(ch) ? modKnown.get(ch) : modIs.get(ch) === true;
// The sites of this window's streamer whose mod view you can open
const modViewChs = w => tabChannels(w).filter(ch => modUrl(ch) && youMod(ch));
// Why you can't moderate them here (nothing: you can)
function whyNot(m){
  const site = PLAT_NAME[m.site];
  if (!platform(m.ch).timeoutCmd) return `From ${site}'s own tab`;
  if (!youMod(m.ch)) return `You're not a mod on ${site}`;
  if (m.login && m.login === meOn(m.site)) return 'That\'s you';
  if (m.badges.includes('host')) return `${m.sender} is the streamer`;
  if (m.badges.includes('mod') || m.badges.includes('staff')) return `${m.sender} is a mod on ${site}`;
  return '';
}
const canModerate = m => !whyNot(m);
const TIMEOUTS = [60, 600, 3600, 86400];
const durText = secs => secs >= 86400 ? `${secs / 86400}d` : secs >= 3600 ? `${secs / 3600}h` : `${Math.round(secs / 60)}m`;
const lastTimeout = () => TIMEOUTS.includes(settings.num('allTimeout')) ? settings.num('allTimeout') : 600;
const chatFor = m => wins.find(o => o.kind === 'chat' && o.channel === m.ch);
async function modAct(m, action, secs){
  const c = chatFor(m), site = PLAT_NAME[m.site], who = m.sender; if (!c) return;
  const why = action === 'pin' ? (youMod(m.ch) && platform(m.ch).timeoutCmd ? '' : whyNot(m) || `You're not a mod on ${site}`) : whyNot(m);
  if (why) return flash(why);
  if (action === 'ban' && !await ask(`Ban ${who} on ${site}?`, `They can't chat on ${site} until they're unbanned. Done with ${site}'s own /ban.`, { ok: 'Ban', danger: true })) return;
  if (action === 'timeout') settings.set('allTimeout', secs);
  let r;
  try {
    if (action === 'delete' || action === 'pin') r = await sender.mod(c, action, m.id);
    else r = (await sender.send(c, action === 'ban' ? platform(m.ch).banCmd(m.login) : platform(m.ch).timeoutCmd(m.login, secs))) === 'sent' ? 'done' : 'failed';
  } catch { r = 'failed'; }
  flash(r === 'done' ? { delete: `Deleted ${who}'s message on ${site}`, pin: `Pinned ${who}'s message on ${site}`, timeout: `Timed out ${who} on ${site} for ${durText(secs)}`, ban: `Banned ${who} on ${site}` }[action]
    : r === 'no-line' ? `That message has gone from ${site}'s chat` : r === 'no-button' ? `${site} doesn't offer that there: try from its own tab` : `${site} didn't take it: try from its own tab`);
}
// A click on a name: their card; with Shift delete, Ctrl / ⌘ time out (the last length), both ban (as Kick's own chat does)
function nameClick(m, e){
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl && !e.shiftKey) return openSiteCard(m);
  e.preventDefault();
  if (ctrl && e.shiftKey) modAct(m, 'ban'); else if (ctrl) modAct(m, 'timeout', lastTimeout()); else modAct(m, 'delete');
}
// A menu of ALL's, under (or beside) what opened it, inside ALL (its size: ALL follows the chat's text size)
function placeAt(view, pop, at, top = null){
  const z = parseFloat(view.el.style.zoom) || 1, vr = view.el.getBoundingClientRect();
  const r = at.getBoundingClientRect ? at.getBoundingClientRect() : { left: at.clientX, right: at.clientX, top: at.clientY, bottom: at.clientY };
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(6, Math.min(vr.width / z - w - 6, (r.right - vr.left) / z - w)) + 'px';
  pop.style.top = (top !== null ? top : Math.max(6, Math.min(vr.height / z - h - 6, (r.bottom - vr.top) / z + 4))) + 'px';
}
// The filter pill's menu: bots' messages hidden or shown; events (subs, gifts, raids, Super Chats) short, full or hidden
function openFilters(view){
  const seg = (label, sub, opts, cur, set, cmd) => element('div', 'all-fmr', element('div', 'all-fml', element('b', null, label), element('small', null, sub)),
    element('div', { class: 'all-durs all-seg', role: 'group', 'aria-label': label }, ...opts.map(([v, t]) => element('button', { type: 'button', class: v === cur ? 'on' : '', 'aria-pressed': String(v === cur), dataset: { cmd }, onclick: () => set(v) }, t))));
  view.fm.replaceChildren(element('div', 'all-mvh', 'Show in ALL'),
    seg('Bots', 'Their messages, or one line to open', [[false, 'Hidden'], [true, 'Shown']], botsShown, setBotsShown, 'all.bots'),
    seg('Events', 'Subs, gifts, raids and Super Chats', [['short', 'Short'], ['full', 'Full'], ['hidden', 'Hidden']], eventsMode, setEventsMode, 'all.events'));
  view.fm.hidden = false;
  placeAt(view, view.fm, view.filt);
}
// Developer tools: what ALL made of the message, and what the site sent (while they're on)
function copyData(m){
  const data = JSON.stringify(m, (k, v) => (v instanceof Node || typeof v === 'function' ? undefined : k === 'raw' && typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v), 2);
  navigator.clipboard?.writeText(data).then(() => flash('Copied the message\'s data'), () => flash('Couldn\'t copy it'));
}
// ⋯ and the right-click: the line's menu (the mod part only where you're a mod)
function openLineMenu(m, at){
  const view = viewFor(streamerOf(m.ch)); if (!view) return;
  const site = PLAT_NAME[m.site], why = whyNot(m), mod = youMod(m.ch) && !!platform(m.ch).timeoutCmd, lm = view.lm;
  const item = (label, ic, run, more = {}) => element('button', { type: 'button', role: 'menuitem', class: 'all-li' + (more.red ? ' red' : ''), disabled: !!more.off, title: more.off || '', dataset: { cmd: more.cmd },
    onclick: () => { lm.hidden = true; run(); } }, element('i', { html: ic }), element('span', null, label), more.kb ? element('small', null, more.kb) : '');
  const text = m.parts.map(x => x.text || x.name).join('');
  lm.replaceChildren(element('div', 'all-lh', element('i', { class: 'pi pi-' + m.site }, site[0]), element('b', null, m.sender), element('small', null, site)),
    sendSites(view.w).includes(m.ch) && item('Reply', icon.reply, () => startReply(m), { cmd: 'all.menuReply' }),
    mod && item('Pin message', icon.pin, () => modAct(m, 'pin'), { cmd: 'all.menuPin' }),
    item(`Open profile on ${site}`, icon.user, () => openSiteCard(m), { cmd: 'all.menuProfile' }),
    mod && element('hr'),
    mod && item('Delete message', icon.bin, () => modAct(m, 'delete'), { kb: `${kShift()}-click name`, off: why, cmd: 'all.menuDelete' }),
    mod && item('Timeout', TIMER, () => modAct(m, 'timeout', lastTimeout()), { kb: `${kCtrl()}-click name`, off: why, cmd: 'all.menuTimeout' }),
    mod && !why && element('div', 'all-durs', ...TIMEOUTS.map(sec => element('button', { type: 'button', class: sec === lastTimeout() ? 'on' : '', dataset: { cmd: 'all.timeoutFor' }, onclick: () => { lm.hidden = true; modAct(m, 'timeout', sec); } }, durText(sec)))),
    mod && item('Ban', BAN, () => modAct(m, 'ban'), { kb: `${kCtrl()}+${kShift()}-click name`, off: why, red: true, cmd: 'all.menuBan' }),
    element('hr'),
    item('Copy message', icon.copy, () => { navigator.clipboard?.writeText(text).then(() => flash('Copied'), () => flash('Couldn\'t copy it')); }, { cmd: 'all.menuCopy' }),
    window.kmv && window.kmv.translate && !m.tr && item('Translate', TRANSLATE, () => translateSoon(m), { cmd: 'all.menuTranslate' }),
    devOn && element('hr'),
    devOn && item('Copy message data', icon.code, () => copyData(m), { cmd: 'all.menuData' }),
    mod && modUrl(m.ch) && item(`Open ${site} mod view`, icon.mod, () => openModView(m.ch), { cmd: 'all.menuModView' }));
  lm.hidden = false;
  placeAt(view, lm, at);
}
// The title bar's mod button in ALL: each site's mod view (where you're a mod), or all of them at once
function openModViews(w, at){
  const view = w.allView; if (!view) return;
  const mv = view.mv;
  if (!mv.hidden){ mv.hidden = true; return; }
  const chs = modViewChs(w);
  const row = ch => {
    const p = platOf(ch), site = PLAT_NAME[p], off = !modUrl(ch) ? `${site} · no mod view` : !youMod(ch) ? `${site} · you're not a mod` : '';
    return element('button', { type: 'button', role: 'menuitem', class: 'all-li all-mvi', disabled: !!off, title: off ? (modUrl(ch) ? `You don't moderate their ${site} channel` : `${site} has no mod view for each channel`) : `Opens in a window of its own`, dataset: { cmd: 'all.modView' },
      onclick: () => { mv.hidden = true; openModView(ch); } }, element('i', { class: 'pi pi-' + p }, site[0]), element('span', null, off || `${site} mod view`), off ? '' : element('i', { class: 'all-mvx', html: icon.pop }));
  };
  mv.replaceChildren(element('div', 'all-mvh', 'Mod views'), ...tabChannels(w).map(row),
    chs.length > 1 && element('hr'),
    chs.length > 1 && element('button', { type: 'button', role: 'menuitem', class: 'all-li', dataset: { cmd: 'all.modViewsAll' }, onclick: () => { mv.hidden = true; chs.forEach(openModView); } },
      element('i', { html: icon.mod }), element('span', null, 'Open all'), element('small', null, `${chs.length} windows`)));
  mv.hidden = false;
  placeAt(view, mv, at, 6);
}
const SHIELD = '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/></svg>';
const TIMER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>';
const BAN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';

// A name: their card on their own site (that site's tab, the site opens its card for them)
function openSiteCard(m){
  const c = wins.find(o => o.kind === 'chat' && o.channel === m.ch); if (!c) return;
  setAll(c, false);
  showTab(c);
  if (c.view && m.id) runIn(c.view, `(${profileAgent})(${JSON.stringify(m.id)})`);
}
/* ---- what you send: a line of yours straight away (sending…), replaced by the real one when the site's chat brings it
   back; if it fails, it stays, red, with why, Retry and Edit. One message at a time, so Enter can't send it twice. ---- */
let mineN = 0;
const sameText = (a, b) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
async function sendNow(view, w){
  let text = view.input.value.trim(); const ch = sendSite(w); if (!text || !ch) return;
  if (view.sending) return flash('Still sending the last one');
  // Kick's commands that open a panel (/poll, /prediction, /clip: chat/kick-commands.js): its own chat opens it, so it shows
  const kcmd = platOf(ch) === 'kick' && new RegExp(`^\\s*/(${KICK_PAGE_CMDS.join('|')})(?:\\s|$)`, 'i').exec(text);
  if (kcmd){
    const k = frameOf(w).find(o => o.kind === 'chat' && o.channel === ch); if (!k) return;
    view.input.value = ''; syncSendB(view, w);
    setAll(k, false); showTab(k);
    kickCmdHeard(k, JSON.stringify({ cmd: kcmd[1].toLowerCase(), text: text.slice(kcmd[0].length).trim() }), k.view);
    return;
  }
  const rules = chatRules(ch);
  if (rules.block) return flash(rules.block);
  if (rules.wait) return flash(`Slow mode on ${PLAT_NAME[platOf(ch)]}: you can send in ${rules.wait}s`);
  const lock = view.lock, threaded = !!(lock && lock.kind === 'reply' && threads(ch));
  // a reply where the site has none from here: an @ of them, in front
  if (lock && lock.kind === 'reply' && !threaded && !new RegExp(`^@${lock.msg.login}\\b`, 'i').test(text)) text = `@${lock.msg.sender.replace(/^@/, '')} ${text}`;
  const site = platOf(ch), f = feedOf(view.s);
  const p = { kind: 'mine', site, ch, id: 'mine' + (++mineN), t: Date.now(), text, send: withEmotes(view, text), emotes: view.emoteSends && new Map(view.emoteSends), parts: [{ text }], ...youOn(f, site, ch), lock, threaded, state: 'sending' };
  view.input.value = ''; if (lock) setLock(view, w, null);
  f.msgs.push(p); addLine(view, p);
  await deliver(view, w, p);
}
async function deliver(view, w, p){
  const m = frameOf(w).find(o => o.kind === 'chat' && o.channel === p.ch), site = PLAT_NAME[p.site];
  view.sending = true; setMine(p, 'sending'); syncSendB(view, w);
  let r;
  if (!m) r = 'gone';
  else try { r = p.threaded ? await sender.reply(m, p.lock.msg.id, p.send || p.text, p.lock.msg.sender) : await sender.send(m, p.send || p.text); } catch { r = 'error'; }
  view.sending = false; syncSendB(view, w);
  if (p.state === 'seen') return;   // (its chat brought it back already)
  noteSend(p.ch, r, r === 'sent' ? '' : SEND_FAIL[r] ? SEND_FAIL[r](site) : '');   // (two failures in a row: ALL's health says so)
  if (r === 'sent'){ slowStart(p.ch); setMine(p, 'sent'); setTimeout(() => { if (p.state === 'sent') setMine(p, 'unseen'); }, 15000); return; }
  p.why = r === 'no-reply' ? `Couldn't start a reply on ${site}: the message may have scrolled out of its chat` : r === 'gone' ? `${site}'s chat isn't open`
    : (SEND_FAIL[r] || (x => `${x}'s chat didn't answer`))(site);
  setMine(p, 'failed');
  flash(`Not sent: ${p.why}`);
  if (r === 'disabled' && m && m.view) askIn(m.view, `(${modesAgent})()`).then(x => { if (x) setModes(p.ch, x); }).catch(() => {});   // (why: its modes again)
}
// How you look in that chat: as in your last message there (name, colour, badges), else your name, the streamer's
// badge in your own channel
function youOn(f, site, ch){
  const me = meOn(site), last = me && [...f.msgs].reverse().find(x => x.kind === 'message' && x.site === site && (x.login === me || x.sender.toLowerCase() === me));
  if (last) return { sender: last.sender, login: last.login, color: last.color, badges: last.badges };
  const name = site === 'kick' ? myName : site === 'twitch' ? bellVars.myTwitch : '';
  return { sender: name || 'You', login: me, color: '', badges: me && ch.replace(/^tw:/, '').toLowerCase() === me ? ['host'] : [] };
}
// A line of yours changes state: drawn again where it is
function setMine(p, state){
  p.state = state;
  document.querySelectorAll(`.all-list [data-key="${CSS.escape(p.site + ':' + p.id)}"]`).forEach(el => el.replaceWith(lineEl(p)));
}
// Your message came back from its chat: the real line takes the place of yours
function mineSeen(f, m){
  const me = meOn(m.site);
  if (me && m.login !== me && m.sender.toLowerCase() !== me) return;
  const p = f.msgs.find(x => x.kind === 'mine' && x.site === m.site && x.state !== 'failed' && x.state !== 'seen' && sameText(x.text, m.parts.map(y => y.text || y.name).join('')));
  if (!p) return;
  p.state = 'seen';
  f.msgs.splice(f.msgs.indexOf(p), 1);
  document.querySelectorAll(`.all-list [data-key="${CSS.escape(p.site + ':' + p.id)}"]`).forEach(el => el.remove());
}
function mineEl(p){
  const site = PLAT_NAME[p.site], view = viewFor(streamerOf(p.ch));
  const drop = () => { const f = feedOf(streamerOf(p.ch)); const i = f.msgs.indexOf(p); if (i >= 0) f.msgs.splice(i, 1); setMine(p, 'dropped'); document.querySelectorAll(`.all-list [data-key="${CSS.escape(p.site + ':' + p.id)}"]`).forEach(el => el.remove()); };
  const state = {
    sending: element('span', 'al-tag al-tag-mine', element('i', 'al-spin'), 'Sending'),
    sent: element('span', 'al-tag al-tag-mine', 'Sent'),
    unseen: element('span', { class: 'al-tag al-tag-mine', title: `${site} took it, but it hasn't shown in its chat yet` }, `Sent · not seen in ${site}'s chat yet`),
    failed: element('div', 'al-mine-fail', element('span', 'al-tag al-tag-fail', 'Not sent'), element('span', 'al-why', p.why || ''),
      element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'all.retry' }, onclick: () => { if (view && !view.sending) deliver(view, view.w, p); else flash('Still sending the last one'); } }, 'Retry'),
      element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'all.edit' }, onclick: () => { if (!view) return; drop(); view.input.value = p.lock && p.lock.kind === 'reply' && !p.threaded ? p.text.replace(/^@\S+\s/, '') : p.text; if (p.lock) setLock(view, view.w, p.lock); if (p.emotes) view.emoteSends = new Map(p.emotes); view.input.focus(); } }, 'Edit'),
      element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'all.dismiss' }, title: 'Remove this line', onclick: drop }, '✕'))
  }[p.state];
  return element('div', { class: 'al-m al-mine al-mine-' + p.state, dataset: { key: p.site + ':' + p.id } },
    p.threaded && element('span', 'al-q', '↩ replying to ', element('b', null, p.lock.msg.sender)),
    element('div', 'al-line', element('span', 'al-who', element('i', { class: 'pi pi-' + p.site, title: site }, site[0]),
      ...p.badges.map(b => element('i', { class: 'al-b al-b-' + b, title: BADGE_TIP[b] || b, html: BADGE_SVG[b] || '' }))), element('b', { class: 'al-n', style: { color: nameColor(p) } }, p.sender), ': ', element('span', 'al-txt', p.text), p.state === 'failed' ? '' : state || ''),
    p.state === 'failed' && state);
}
function setBotsShown(on){ botsShown = !!on; settings.set('allBots', botsShown ? 'shown' : 'hidden'); redrawAll(); }
function setEventsMode(mode){ eventsMode = mode; settings.set('allEvents', mode); redrawAll(); }
const redrawAll = () => wins.forEach(w => { if (w.allView){ const v = w.allView; v.list.replaceChildren(...feedOf(v.s).msgs.map(lineEl).filter(Boolean)); renderTop(v, w); v.list.scrollTop = v.list.scrollHeight; } });
// "See it on …": that site's chat, scrolled to it (and flashed), where it has its full look and controls
function seeIt(m){
  const c = wins.find(o => o.kind === 'chat' && o.channel === m.ch); if (!c) return;
  setAll(c, false);
  showTab(c);
  if (c.view && m.id) runIn(c.view, `(${seekAgent})(${JSON.stringify(m.id)})`);
}

// ALL shows over the chat of each window that has it on; each chat hands over its messages only while it does
function syncAll(){
  // ALL reads (and sends on) their Kick and Twitch chats also while offline: each gets its hidden tab
  wins.filter(w => w.kind === 'chat' && !w.hiddenTab && allOn(w)).forEach(w => {
    tabChannels(w).forEach(ch => { if (platOf(ch) !== 'youtube' && !infoFor(ch)?.missing && !frameOf(w).some(o => o.channel === ch) && !wins.some(o => o.kind === 'chat' && o.channel === ch)) addTab(w, ch, false); });
  });
  wins.forEach(w => {
    if (w.kind !== 'chat') return;
    const show = !w.hiddenTab && allOn(w);
    if (show && !w.allView){ w.allView = buildView(w); w.el.querySelector('.body').append(w.allView.el); w.allView.list.scrollTop = w.allView.list.scrollHeight; }
    if (!show && w.allView){ w.allView.sizeObs.disconnect(); w.allView.el.remove(); w.allView = null; }
    w.el.classList.toggle('all-on', show);
    syncModBtn(w); syncAtBtn(w);
    if (show) renderTop(w.allView, w);
    feedOn(w, allOn(w));
  });
}
const FEED_ON = on => `window.__kmvFeed && (window.__kmvFeed.on = ${!!on})`;
function feedOn(w, on){
  if (!w.view || !w.ready || w.feedOn === on) return;
  w.feedOn = on; runIn(w.view, FEED_ON(on));
  if (on) pinsNow(w, w.view);
}
// A chat page loaded (again): its helper, on if ALL shows
function feedReady(w, view){ runIn(view, `(${feedAgent})();${FEED_ON(allOn(w))}`); sampleIn(view); w.feedOn = allOn(w); if (w.feedOn) pinsNow(w, view); }
// A pin already up when ALL starts reading a chat: the sites send pins only as they're made, so it's asked for (quietly)
function pinsNow(w, view){
  askIn(view, `(${modesAgent})()`).then(r => { if (r && allOn(w)) setModes(w.channel, r); }).catch(() => {});
  askIn(view, `(${pinAgent})()`).then(batch => { if (batch && allOn(w)) ingest(w, JSON.stringify(batch), true); }).catch(() => {});
}

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const TRANSLATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h9M8.5 3v2M6 5c.6 3.2 2.6 5.8 5.5 7.2M11 5c-.8 3.6-3.4 6.4-7 7.6M13 21l4-9 4 9M14.4 18h5.2"/></svg>';
const FILTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';
const BADGE_SVG = {
  host: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-4v10l-6-4z"/></svg>',
  mod: '<svg viewBox="0 0 24 24"><path d="M19 5L9 15M5 15l4 4M7 13l4 4M4 20l2-2" fill="none" stroke-width="2.6" stroke-linecap="round"/></svg>',
  vip: '<svg viewBox="0 0 24 24"><path d="M6 4h12l4 5-10 12L2 9z"/></svg>',
  sub: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.2 6.6 19.2l1.3-6-4.5-4 6-.6z"/></svg>',
  og: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.2 6.6 19.2l1.3-6-4.5-4 6-.6z"/></svg>',
  verified: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  staff: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/></svg>',
  gifter: '<svg viewBox="0 0 24 24"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/></svg>'
};

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  trSoon = soon(() => translateNow(), 300);
  botsShown = settings.text('allBots') === 'shown';
  eventsMode = ['short', 'full', 'hidden'].includes(settings.text('allEvents')) ? settings.text('allEvents') : 'short';
  fromSite('feed', (w, json) => { if (allOn(w)) ingest(w, json); });
  // Esc closes ALL's menus (the line's, Send on's)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    wins.forEach(w => { const v = w.allView; if (!v) return; [v.lm, v.menu, v.mv, v.ep, v.fm].forEach(m => { if (!m.hidden){ m.hidden = true; e.preventDefault(); } }); });
  });
  store.watch(['streamers', 'tabs', 'wins', 'live'], () => syncAll());
  store.watch(['chatName', 'names'], () => wins.forEach(w => { if (w.allView) renderCmp(w.allView, w); }));
  store.watch(['mod'], () => { redrawAll(); wins.forEach(syncModBtn); });
  store.watch(['chatZoom'], () => wins.forEach(w => { if (w.allView) fitSize(w.allView); }));
  store.watch(['allHealth'], () => wins.forEach(w => { if (w.allView) renderTop(w.allView, w); }));
  settings.onChange(['allOpen'], () => { syncAll(); wins.forEach(renderSiteTabs); store.changed('tabs'); });
  window.feedAgent = feedAgent; window.pinAgent = pinAgent; window.modesAgent = modesAgent; window.twReplyAt = twReplyAt; window.twReplyPress = twReplyPress; window.sendAgent = sendAgent; window.modAgent = modAgent; window.replyAgent = replyAgent; window.seekAgent = seekAgent; window.profileAgent = profileAgent;   // for the tests
  window.allEmotes = { emoteCache, withEmotes };   // for the tests
  window.allChat = { sender, modKnown, allRaid, spamTag, modesOf, setModes, openModViews, syncMod: () => store.changed('mod'), ingest: (ch, batch, quiet) => { const w = wins.find(o => o.kind === 'chat' && o.channel === ch); if (w) ingest(w, JSON.stringify(batch), quiet); }, feeds, setAll, allOn: ch => allOn(wins.find(w => w.kind === 'chat' && w.channel === ch)) };   // for the tests
}

export { allLooking, allOn, allRaid, allTabFor, feedReady, init, modViewChs, openModViews, sendSite, setAll, setLock,
  spamTag };
