import { alerts, clearAlert, raiseAlert, wantNotify } from './alerts.js';
import { allLooking, heldWait, pressHeld, youMod } from '../chat/all-chat.js';
import { wins } from '../core.js';
import { addNote, updateNotes } from '../panels/bell/bell.js';
import { infoFor } from '../panels/channels/channels.js';
import { chLabel, chLabelP, platform } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { store } from '../shared/store.js';

/* ---------- Flagged (Settings › Flagged): what Twitch and YouTube flag for moderators, in chats you moderate ----------
   A message held for a moderator (Twitch's AutoMod, YouTube's held for review) and a suspicious user's message (Twitch:
   a possible or likely ban evader, monitored, restricted) alert as mentions do: the chat window lights up, a pop-up,
   a sound, a desktop notification, and a note under the bell with Allow, Deny and Show me while it waits. Heard by
   ALL (chat/all-chat.js) and by a chat without ALL (its feed, on for this: chat/chat-feed.js wanted), each once.
   A hold alerts once; it's handled once it's let through (its message comes), denied or hidden (taken away), or on
   Twitch when AutoMod lets it go (it says nothing: heldWait). A flagged person alerts once a stream, or every message. */
const waiting = new Map();   // site:id -> { ch, timer }: holds still waiting for a moderator
const people = new Map();    // channel \n login -> when they last alerted (Once a stream: until the channel goes offline)
const EVADER = { 'evader-possible': 'Possible ban evader', 'evader-likely': 'Likely ban evader' };
const TREATMENT = { monitored: 'Monitored', restricted: 'Restricted' };
const flagWords = flags => (flags || []).map(f => EVADER[f] || TREATMENT[f]).filter(Boolean).join(' · ');
const textOf = m => (m.parts || []).map(p => p.text != null ? p.text : p.name || '').join('').replace(/\s+/g, ' ').trim();
// Whether this chat's flags alert: Flagged on, a site that flags, a chat you moderate
const flaggedIn = ch => !!alerts.flagged.on && !!platform(ch).flagged && youMod(ch);

// What a chat's feed brought (ALL's, or one read for this): a hold, a person's flags, or the message or removal that
// ends a hold
function flaggedFrom(w, m){
  if (!w || !m) return;
  if (m.kind === 'message' || m.kind === 'delete'){
    const k = m.site + ':' + (m.kind === 'delete' ? m.target : m.id);
    if (waiting.has(k)) heldHandled(k, m.kind === 'message' ? 'allowed' : 'denied');
    return;
  }
  if (m.kind === 'held') return m.status === 'PENDING' ? heldAlert(w, m) : heldHandled(m.site + ':' + m.id, m.status === 'ALLOWED' ? 'allowed' : m.status === 'EXPIRED' ? 'expired' : 'denied', m.by);
  if (m.kind === 'flags') flagsAlert(w, m);
}
function heldAlert(w, m){
  const k = m.site + ':' + m.id, a = alerts.flagged;
  if (waiting.has(k) || !flaggedIn(w.channel) || !a[m.site + 'Held']) return;
  waiting.set(k, { ch: w.channel, timer: m.site === 'twitch' ? setTimeout(() => heldHandled(k, 'expired'), heldWait.ms) : 0 });
  raise(w, { what: 'held', site: m.site, hid: m.id, sender: m.msg.sender, body: textOf(m.msg), why: m.why || '' },
    m.site === 'youtube' ? `Held for review in ${chLabel(w.channel)}'s chat: ${m.msg.sender}` : `AutoMod held ${m.msg.sender}'s message in ${chLabel(w.channel)}'s chat`);
}
function flagsAlert(w, m){
  const a = alerts.flagged, f = m.flags || [];
  if (!flaggedIn(w.channel) || waiting.has(m.site + ':' + m.msgId)) return;   // (a held message's flags: its hold alerts)
  const evader = f.includes('evader-likely') || (a.evader === 'any' && f.includes('evader-possible'));
  if (!(evader || (a.monitored && f.includes('monitored')) || (a.restricted && f.includes('restricted')))) return;
  const pk = w.channel + '\n' + String(m.login || m.sender || '').toLowerCase();
  if (a.once === 'stream' && people.has(pk)) return;
  people.set(pk, Date.now());
  if (people.size > 2000) people.delete(people.keys().next().value);
  const words = flagWords(f);
  raise(w, { what: 'flags', site: m.site, hid: m.msgId, sender: m.sender || m.login || 'Someone', body: m.text || '', why: words, flags: f },
    `${words}: ${m.sender || m.login || 'someone'} in ${chLabel(w.channel)}'s chat`);
}
// The alert: the chat window, a note under the bell (and its pop-up), the desktop notification
function raise(w, n, text){
  const looking = allLooking(w) || (document.hasFocus() && document.activeElement === w.view);
  addNote({ kind: 'flagged', channel: w.channel, label: chLabelP(w.channel), ...n }, text);
  if (DESKTOP && wantNotify('flagged')) window.kmv.notifyMention({ kind: 'flagged', channel: w.channel, label: chLabelP(w.channel), sender: n.sender, body: n.body, what: n.what, site: n.site, why: n.why });
  raiseAlert(w, 'flagged', looking);
}
// A hold handled (here, in its tab, by another moderator) or gone: its note says so, and its chat stops calling for you
// once nothing else waits there
function heldHandled(k, how, by = ''){
  const x = waiting.get(k); if (!x) return;
  clearTimeout(x.timer); waiting.delete(k);
  const [site, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
  updateNotes(n => n.kind === 'flagged' && n.what === 'held' && n.site === site && n.hid === id, n => { n.done = how; if (by) n.by = by; });
  const w = wins.find(o => o.kind === 'chat' && o.channel === x.ch);
  if (w && w.alert && w.alert.kind === 'flagged' && ![...waiting.values()].some(o => o.ch === x.ch)) clearAlert(w);
}
// Whether a note's hold still waits (its Allow and Deny)
const flaggedWaiting = n => !!n && n.what === 'held' && waiting.has(n.site + ':' + n.hid);
// Allow or Deny from its note: as ALL's card does
async function flaggedAct(n, allow){
  const r = await pressHeld(n.channel, n.hid, allow);
  if (r === 'done') heldHandled(n.site + ':' + n.hid, allow ? 'allowed' : 'denied', 'you');
}
// Once a stream: a channel gone offline forgets who alerted in it
function forgetOffline(){
  for (const k of people.keys()){ const info = infoFor(k.slice(0, k.indexOf('\n'))); if (info && info.live === false) people.delete(k); }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  store.watch(['live'], () => forgetOffline());
  window.flagged = { from: (ch, m) => flaggedFrom(wins.find(w => w.kind === 'chat' && w.channel === ch), m), waiting, people };   // for the tests
}

export { flaggedAct, flaggedFrom, flaggedIn, flaggedWaiting, heldHandled, init };
