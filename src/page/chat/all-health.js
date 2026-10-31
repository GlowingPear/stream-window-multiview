import { feedFailed } from './chat-feed.js';
import { feedParse } from './feed-parse.js';
import { wins } from '../core.js';
import { lineProbe } from '../in-site/feed.js';
import { devError } from '../panels/developer/developer.js';
import { PLAT_NAME, chLabel, platOf } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { store } from '../shared/store.js';
import { askIn, reloadView } from '../windows/view.js';

/* ---- ALL's health: when a site's part of ALL stops working, it says so where you'll see it, and keeps what's needed
   to fix it ----
   The sites change their chats without warning (an event renamed, a chat box rebuilt), and ALL would just go quiet
   for that site. So for each chat ALL reads it counts what it read, what it couldn't make sense of (what the reader
   passed on that no reader in chat/feed-parse.js understood), and sends that failed. Every 45 seconds it asks the chat's
   own page how many lines it shows: new ones there while ALL read none from it means the reader broke. It tries once
   more (that chat loaded again), then the site's badge in ALL turns amber and a line above its list says what isn't
   working, with See it on … and Report for a fix; it's in Settings › Developer › Errors too. It clears itself once the
   site's part works again.
   The app's other readers (chat/chat-feed.js) read a chat's connection too, also without ALL: the same check, for each
   chat they read, makes its page read its screen again instead (no reload, nothing amber: the alerts still work). */
const CHECK_MS = 45000;
const healthOf = new Map();   // channel -> { read, bad, raws, badRaws, sends, last, odd, sentAt, state: '' | 'retrying' | 'broken', what, why, since, hidden }
const hOf = ch => {
  let h = healthOf.get(ch);
  if (!h){ h = { read: 0, bad: 0, raws: [], badRaws: [], sends: [], last: null, odd: 0, sentAt: 0, state: '', what: '', why: '', since: 0, hidden: false }; healthOf.set(ch, h); }
  return h;
};
const keep = (list, x, n) => { list.push(String(x).slice(0, 4000)); if (list.length > n) list.shift(); };
// What the chat's reader handed over: read (ok), or something no reader understood
function noteRaw(ch, raw, ok){
  const h = hOf(ch);
  keep(h.raws, raw, 20);
  if (ok) h.read++; else { h.bad++; keep(h.badRaws, raw, 10); }
}
// A send's result: two failures in a row for the same reason (not the chat's own modes: chat/all-chat.js says those)
function noteSend(ch, r, why){
  const h = hOf(ch);
  h.sentAt = Date.now();
  if (r === 'sent'){ h.sends = []; if (h.what === 'send') healed(ch); return; }
  if (!/^(no-box|not-filled|not-sent|error)$/.test(r)) return;
  h.sends.push(r); if (h.sends.length > 5) h.sends.shift();
  const [a, b] = h.sends.slice(-2);
  if (a && a === b) broke(ch, 'send', `Sending on ${PLAT_NAME[platOf(ch)]} isn't working: ${why || r}`);
}
function broke(ch, what, why){
  const h = hOf(ch);
  if (h.state === 'broken' && h.what === what) return;
  Object.assign(h, { state: 'broken', what, why, since: Date.now(), hidden: false });
  devError('chat', `ALL · ${PLAT_NAME[platOf(ch)]} · ${chLabel(ch)}`, why);
  store.changed('allHealth');
}
function healed(ch){
  const h = hOf(ch); if (!h.state) return;
  Object.assign(h, { state: '', what: '', why: '', since: 0 });
  store.changed('allHealth');
}
// A chat page loaded (again): what it shows first is its history, which doesn't come over its connection: the next
// check starts from there
function chatLoaded(ch){ const h = hOf(ch); h.last = null; h.odd = 0; }
// Every 45 seconds: each chat ALL reads, against its own page
async function checkAll(){
  for (const w of wins.filter(o => o.kind === 'chat' && o.view && o.ready && (o.feedOn || (o.feedRead && o.feedLive)))){
    const h = hOf(w.channel), site = PLAT_NAME[platOf(w.channel)];
    let p; try { p = await askIn(w.view, `(${lineProbe})()`); } catch { continue; }
    const moved = h.last !== null && !!p && !!p.last && p.last !== h.last, quiet = moved && !h.read && !h.bad;   // (quiet: its chat moved, ALL read nothing)
    h.odd = quiet ? h.odd + 1 : 0;
    if (quiet && h.odd >= 2) feedFailed(w);                   // (the alerts: its screen read again)
    if (!w.feedOn){ if (h.odd >= 2) h.odd = 0; h.last = p ? p.last : h.last; h.read = 0; h.bad = 0; continue; }   // (no ALL: nothing else to do)
    if (quiet){
      // not for one check alone (a site's own line in its chat, a message drawn again, is no reason to load it again),
      // nor while you've just sent there (loading it again would hold your message up)
      if (h.odd >= 2 && Date.now() - h.sentAt > 60000){
        h.odd = 0;
        if (h.state === ''){ h.state = 'retrying'; devError('chat', `ALL · ${site} · ${chLabel(w.channel)}`, `Read nothing while its chat had new messages: loading that chat again`); reloadView(w.view); }
        else broke(w.channel, 'read', `ALL isn't reading ${site}'s messages: its chat has new ones`);
      }
    }
    else if (moved && h.bad >= 5 && h.bad > h.read) broke(w.channel, 'parse', `ALL can't make sense of ${site}'s messages (${h.bad} of the last ${h.bad + h.read})`);
    else if (h.read && h.what !== 'send') healed(w.channel);
    else if (h.read && h.state === 'retrying') h.state = '';
    h.last = p ? p.last : h.last; h.read = 0; h.bad = 0;
  }
}
// Whether a site's part of ALL isn't working: { what, why, since } or null (shown: its badge, the line above the list)
const healthState = ch => { const h = healthOf.get(ch); return h && h.state === 'broken' ? h : null; };

// Report for a fix: everything about each of these chats' part of ALL, the people taken out (in the desktop app, which
// replaces names, ids and words, as Chat events' Export does), saved where you choose
async function reportHealth(chs){
  if (!DESKTOP || !window.kmv.healthReport) return;
  const sites = [];
  for (const ch of chs){
    const h = hOf(ch), w = wins.find(o => o.kind === 'chat' && o.channel === ch);
    let probe = null; try { probe = w && w.view ? await askIn(w.view, `(${lineProbe})(true)`) : null; } catch {}
    sites.push({ site: platOf(ch), state: h.state || 'ok', what: h.what, why: h.why, since: h.since ? new Date(h.since).toISOString() : '', sends: h.sends,
      raws: h.raws, badRaws: h.badRaws, lines: probe ? probe.n : null, lineHtml: probe ? probe.html || '' : '' });
  }
  const heard = (window.kmv.samplesInfo ? await window.kmv.samplesInfo().catch(() => null) : null) || {};
  const r = await window.kmv.healthReport({ sites, known: feedParse.KNOWN, ignored: feedParse.ignoredKinds(heard) }).catch(() => null);
  if (r && r.saved) flash('Saved the report, without names, ids or words: send it for a fix', { subject: 'downloads' });
  else if (r && r.error) flash('Couldn’t save the report');
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  setInterval(() => { checkAll().catch(() => {}); }, CHECK_MS);
  window.allHealth = { healthOf, noteRaw, noteSend, checkAll, broke, healed, reportHealth, chatLoaded };   // for the tests
}

export { chatLoaded, healthState, init, noteRaw, noteSend, reportHealth };
