import { SmvSpam } from '../alerts/spam.js';
import { allOn, appBots, chatRules, feeds, fillAll, ownerOf, sendInChat, sendSite, setModes, youMod } from './all-chat.js';
import { BOT_SAYS_RE, RUN_MAX, cardFor, cardsFromRows, kickTries, loginOfCh, pickRun, shoutFor, shoutLink, siteOfCh,
  streams } from './shoutout-text.js';
import { winOfView } from './translate.js';
import { wins } from '../core.js';
import { modesAgent } from '../in-site/feed.js';
import { draftAgent, sendAgent } from '../in-site/send.js';
import { shoutAgent } from '../in-site/shoutout.js';
import { bellVars, myName } from '../panels/bell/bell.js';
import { isSaved } from '../panels/channels/channels.js';
import { listStreamers, nameOf, streamerOf } from '../platforms/linked.js';
import { PLAT_NAME, chLabel, platOf, platform } from '../platforms/platforms.js';
import { ask } from '../shared/ask.js';
import { commands } from '../shared/commands.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromApp, fromSite } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { soon, stopWinTimer, winTimer } from '../shared/timers.js';
import { askIn, runIn } from '../windows/view.js';
import { activeWin } from '../windows/window-commands.js';

/* ---- Shoutouts (Settings › Shoutouts, off unless switched on; issue #300) ----
   One click shouts someone out in a chat: from ALL's lines (chat/all-chat.js: the hover bar, the line's menu, a raid's
   line), from the Kick and Twitch chats' own pages (in-site/shoutout.js: a button on each message, a pill on a raid;
   their right-click menu) and from the search box. The message is yours (Settings), or the one on their People row,
   built by chat/shoutout-text.js, and goes through the same path as ALL's send box. A run shouts out the last few
   different streamers who chatted, one a second, with a strip saying how it's going (and waiting out slow mode).
   Each person's channel address (on Kick a name with _ can have - in its address), last game and whether they stream
   come from the sites (the profile lookup, kmv.profileGet) and are remembered (shoutKnown); when you shouted someone
   out is too (shoutSent), for the ✓ SO tags and asking before shouting them out again soon. */
const SO_DAY = 86400000;
const KNOWN_MAX = 400;            // people remembered (their address, last game, whether they stream)
const GAME_WAIT = 1500;           // a click waits this long for someone's last game at most, then sends without it
const FIND_WAIT = 8000;           // ...and this long for a Kick address it has to look up (it can't send without one)
// a run: one message a second; looking up who streams for at most 6 s before the list shows; a message held back tried
// again after 10 s (or the chat's slow mode). Changed by the tests only.
const SO_TIMING = { gap: 1000, look: 6000, retry: 10 };
const AGAIN = [5, 15, 60, 0];     // Settings: ask before shouting the same person out again within (minutes; 0: never ask)
const SHOUT_SITES = ['kick', 'twitch'];
let soKnown = {};                   // 'site:login' -> { login (their address), game, streams, missing, t }
let soSent = {};                    // 'site:login' -> when you last shouted them out
let soRun = null;                   // the run going on: { w, list, i, stop, wait, why, strip }
let soSaveKnown = null;

const shoutOn = () => settings.flag('shoutOn');
// Shoutouts in a chat: on, and (Only in chats where I'm a mod: on unless switched off) where you're a mod, or your own channel
function shoutHere(ch){
  if (!shoutOn() || !ch) return false;
  if (!settings.flag('shoutModOnly', true)) return true;
  const site = platOf(ch), me = (site === 'kick' ? myName : site === 'twitch' ? bellVars.myTwitch : '').toLowerCase();
  return youMod(ch) || (!!me && platform(ch).handle(ch).toLowerCase() === me);
}
const SO_NOT_MOD = 'Shoutouts show in chats where you\'re a mod (Settings › Shoutouts)';
const soKey = p => p.site + ':' + String(p.login || '').toLowerCase();
const soCh = p => (p.site === 'twitch' ? 'tw:' : '') + String(p.login || '').toLowerCase();
const soAgainMs = () => { const m = settings.text('shoutAgain') === '' ? 15 : settings.num('shoutAgain'); return (AGAIN.includes(m) ? m : 15) * 60000; };
const soRunN = () => Math.max(1, Math.min(RUN_MAX, settings.num('shoutRunN') || 5));
// Settings › Shoutouts › Channels: a card for each channel with a shoutout of its own (chat/shoutout-text.js). #300's
// People rows become cards the first time (shoutPeople, then gone), each checked on Kick and Twitch (soCheckCards).
function soCards(){
  const l = settings.json('shoutChannels', null);
  if (Array.isArray(l)) return l;
  const old = settings.json('shoutPeople', null);
  if (!Array.isArray(old) || !old.length) return [];
  const cards = cardsFromRows(old);
  settings.set('shoutChannels', cards); settings.remove('shoutPeople');
  return cards;
}
// A channel's card, saved where it is (or added); and taken away. key: a linked streamer's id, else the channel
const soCardKey = c => c.streamer || c.ch;
function soPutCard(card){ const cards = soCards(), i = cards.findIndex(c => soCardKey(c) === soCardKey(card)); if (i >= 0) cards[i] = card; else cards.push(card); soSaveCards(cards); }
const soDropCard = key => soSaveCards(soCards().filter(c => soCardKey(c) !== key));
const soSaveCards = cards => { if (!Array.isArray(cards)) return; settings.set('shoutChannels', cards); store.changed('shoutouts'); };
// A linked streamer's channels (a card's)
const soAccountsOf = card => { const s = card && card.streamer && listStreamers().find(x => x.id === card.streamer); return s ? s.accounts : []; };
/* Cards not checked yet (moved from #300's rows, or added without a lookup): found on Kick, else Twitch, and a linked
   streamer's own card when it's one of theirs; lost when neither has it (it still works, by its name). Needs the sites'
   answers (the desktop app). */
let soChecking = null;
function soCheckCards(){
  if (soChecking || !window.kmv || !window.kmv.profileGet) return soChecking;
  soChecking = (async () => {
    for (const c of soCards().filter(x => x.unchecked)){
      const login = loginOfCh(c.ch), first = siteOfCh(c.ch);
      let found = null;
      for (const site of [first, first === 'kick' ? 'twitch' : 'kick']){
        const info = await soLookUp({ site, login, named: site === 'kick' });
        if (!info) { found = 'unknown'; break; }   // (no answer: tried again another time)
        if (info.login){ found = { site, login: info.login }; break; }
      }
      if (found === 'unknown') continue;
      const cards = soCards(), card = cards.find(x => x.ch === c.ch); if (!card) continue;
      delete card.unchecked;
      if (!found) card.lost = true;
      else {
        card.lost = false; card.ch = soCh(found);
        const st = streamerOf(card.ch); if (st){ card.streamer = st.id; card.name = nameOf(card.ch) || card.name; }
      }
      soSaveCards(cards);
    }
    soChecking = null;
  })();
  return soChecking;
}
// Cards without a picture (rows moved over from #300, ones added without lookups): theirs from their site, asked for
// once a session (a channel without one keeps its initials)
const soAvatarAsked = {};
async function soCardAvatars(){
  if (!window.kmv || !window.kmv.profileGet) return;
  for (const c of soCards().filter(x => !x.avatar && !x.lost && !x.unchecked && !soAvatarAsked[x.ch])){
    soAvatarAsked[c.ch] = true;
    let r = null;
    try { r = await window.kmv.profileGet(c.ch); } catch {}
    const av = r && ((r.site && r.site.avatar) || (r.info && r.info.avatar));
    if (!av || !/^https:\/\//.test(av)) continue;
    const cards = soCards(), card = cards.find(x => x.ch === c.ch); if (!card) continue;
    card.avatar = av; soSaveCards(cards);
  }
}
const soSentAt = p => (p ? soSent[soKey(p)] || 0 : 0);
const soAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
// Who's on a chat line: their site and address, their name, and the linked streamer they are (their row covers every site)
function soPersonOf(m){
  if (!m || !SHOUT_SITES.includes(m.site) || !m.login) return null;
  const login = String(m.login).toLowerCase(), s = streamerOf(soCh({ site: m.site, login }));
  return { site: m.site, login, name: m.sender || m.name || m.login, streamer: s ? s.id : '', named: !!m.named, ch: m.ch || '' };
}
// Someone the app knows streams: a saved or linked channel, or a People row
const soKnownStreamer = p => isSaved(soCh(p)) || !!p.streamer || !!cardFor(soCards(), p);
// Their links on every site the app knows them on (a linked streamer's Kick and Twitch accounts)
function soLinksOf(p){
  const s = p.streamer && listStreamers().find(x => x.id === p.streamer);
  return s ? s.accounts.filter(a => SHOUT_SITES.includes(platOf(a))).map(a => shoutLink(platOf(a), platform(a).handle(a))) : [];
}
function soRemember(k, info){
  soKnown[k] = { ...info, t: Date.now() };
  const keys = Object.keys(soKnown);
  if (keys.length > KNOWN_MAX) keys.sort((a, b) => soKnown[a].t - soKnown[b].t).slice(0, keys.length - KNOWN_MAX).forEach(x => delete soKnown[x]);
  soSaveKnown();
}
/* Someone's channel on their site, as the site says: { login (their address), game, streams } or { missing: true }
   (no such channel), or null (no answer: nothing is concluded). A Kick name is tried as it is, then with - for _. */
async function soLookUp(p){
  const k = soKey(p), have = soKnown[k];
  if (have && Date.now() - have.t < SO_DAY) return have;
  if (!window.kmv || !window.kmv.profileGet) return have || null;
  for (const login of p.site === 'kick' && p.named ? kickTries(p.login) : [String(p.login).toLowerCase()]){
    let r = null;
    try { r = await window.kmv.profileGet(soCh({ site: p.site, login })); } catch {}
    if (!r || r.error || r.failed) return have || null;
    if (r.missing) continue;
    const s = r.site || {};
    const info = { login, game: (s.live && s.live.category) || (s.lastBroadcast && s.lastBroadcast.category) || (s.recent && s.recent[0]) || '',
      streams: streams({ live: !!s.live, lastBroadcast: s.lastBroadcast, recent: s.recent, vods: s.vodCount, partner: s.partner, affiliate: s.affiliate, verified: s.verified }) };
    soRemember(k, info);
    return soKnown[k];
  }
  soRemember(k, { missing: true });
  return soKnown[k];
}
const soWithin = (work, ms) => Promise.race([work, new Promise(r => setTimeout(() => r(null), ms))]);

const soChatWin = ch => wins.find(o => o.kind === 'chat' && o.channel === ch);
const SHOUT_FAIL = { gone: s => `${s}'s chat isn't open`, 'no-box': s => `Sign in to ${s} to chat there`, disabled: s => `${s} isn't letting you chat right now`,
  'not-filled': s => `Couldn't type into ${s}'s chat box`, 'not-sent': s => `${s} kept it in its chat box`, 'no-answer': s => `${s}'s chat didn't answer` };

/* Shouts someone out in one chat, or several (a linked streamer's every site). again: ask first when they were shouted
   out lately (a run has asked already). quiet: no "Shouted out" message (a run says how it's going). -> 'sent', or
   why not ('off', 'cancelled', 'missing', or the send's answer) */
async function shoutOut(p, { chs, again = true, quiet = false } = {}){
  if (!shoutOn() || !p || !p.login) return 'off';
  const targets = (chs || [p.ch]).filter(Boolean);
  if (!targets.length) return 'gone';
  const name = p.name || p.login, last = soSentAt(p);
  if (again && soAgainMs() && last && Date.now() - last < soAgainMs()
    && !await ask(`Shout out ${name} again?`, `You shouted them out ${soAgo(last)}. Send another shoutout now?`, { ok: 'Shout out again' })) return 'cancelled';
  // their address (a Kick name has to be looked up), and their last game when it comes quickly
  let info = soKnown[soKey(p)] || null;
  if (p.site === 'kick' && p.named && !(info && info.login)){
    info = await soWithin(soLookUp(p), FIND_WAIT);
    if (!info || !info.login){ if (!quiet) flash(`Couldn't find ${name}'s Kick channel`); return 'missing'; }
  } else if (!info || Date.now() - info.t > SO_DAY) info = await soWithin(soLookUp(p), GAME_WAIT) || info;
  const who = { ...p, login: (info && info.login) || p.login };
  let r = 'gone';
  for (const ch of targets){
    const site = platOf(ch), c = soChatWin(ch);
    const { to, text } = shoutFor({ tpl: settings.text('shoutText'), cards: soCards(), person: who, site, linksOf: soLinksOf, chsOf: soAccountsOf,
      gameOf: x => (x === who ? info && info.game : soKnown[soKey(x)] && soKnown[soKey(x)].game) || '' });
    // Send straight away off (Settings): it goes in the chat box for you to send (ALL's, else the site's own); a run sends
    if (!quiet && !settings.flag('shoutSend', true)){
      const allBox = targets.length === 1 && fillAll(ch, text);
      r = allBox ? 'filled' : c && c.view ? await askIn(c.view, `(${sendAgent})(${JSON.stringify(site)}, ${JSON.stringify(text)}, null, true)`).catch(() => 'no-answer') : 'gone';
      if (r !== 'filled'){ flash(`Couldn't put it in the chat box: ${(SHOUT_FAIL[r] || SHOUT_FAIL['no-answer'])(PLAT_NAME[site])}`); continue; }
      soSent[soKey(to)] = soSent[soKey(who)] = Date.now();
      flash(`Shoutout for ${to.name || to.login} is in ${allBox ? 'the' : PLAT_NAME[site] + '\'s'} chat box: press Enter to send it`);
      continue;
    }
    r = await sendInChat(c, text);
    if (r !== 'sent'){ if (!quiet) flash(`Not sent: ${(SHOUT_FAIL[r] || SHOUT_FAIL['no-answer'])(PLAT_NAME[site])}`); continue; }
    soSent[soKey(to)] = soSent[soKey(who)] = Date.now();
    // Twitch's own shoutout too (Settings, off unless on): where you're a mod, for someone with a Twitch channel
    const tw = to.site === 'twitch' ? to.login : (soLinksOf(to).find(l => /twitch\.tv\//.test(l)) || '').split('/').pop();
    if (site === 'twitch' && tw && settings.flag('shoutTwitch') && youMod(ch) && !quiet)
      setTimeout(() => { sendInChat(soChatWin(ch), `/shoutout ${tw}`); }, 1200);   // (Twitch saying no, as it allows one every 2 minutes: the message went)
    if (!quiet) flash(`Shouted out ${to.name || to.login} in ${PLAT_NAME[site]} chat`);
  }
  soSaveSent();
  store.changed('shoutouts');
  return r === 'filled' ? 'sent' : r;
}
function soSaveSent(){
  const cut = Date.now() - SO_DAY;
  Object.keys(soSent).forEach(k => { if (soSent[k] < cut) delete soSent[k]; });
  settings.set('shoutSent', soSent);
}
// A line's ✓ SO tag: they were shouted out lately (its title says when)
function shoutTag(m){
  const p = shoutOn() && soPersonOf(m), t = p && soSentAt(p);
  if (!t || Date.now() - t > 12 * 3600000) return null;
  return element('span', { class: 'al-tag al-tag-so', title: `You shouted them out ${soAgo(t)}` }, element('i', { html: icon.check }), 'SO');
}

/* ---- a run: the last few different streamers who chatted, one a second ---- */
// The chat lines a window can pick from: ALL's (every site of theirs), or what a site's chat page shows
// The chat a run sends in: a site's chat window's own; in ALL, the site its send box is on
const soRunCh = w => (allOn(w) ? sendSite(w) : w.channel);
async function soRunLines(w){
  // ALL: the site its send box is on (its K / T picker): that chat's people, shouted out there
  if (allOn(w)){
    const s = ownerOf(w.channel), f = feeds.get(s.id), ch = soRunCh(w);
    return (f ? f.msgs : []).filter(m => m.ch === ch && (m.kind === 'message' || (m.kind === 'event' && m.support && m.support.kind === 'raid')) && SHOUT_SITES.includes(m.site) && m.login)
      .map(m => ({ ...soPersonOf(m), name: m.sender, t: m.t, bot: !!m.bot, ch, raid: m.kind === 'event' }));
  }
  if (!w.view) return [];
  const got = await askIn(w.view, 'window.__kmvShout && window.__kmvShout.chatters ? window.__kmvShout.chatters() : []').catch(() => []);
  const bots = SmvSpam.ignored ? n => SmvSpam.ignored(n, appBots(w.channel)) : () => false;
  return (Array.isArray(got) ? got : []).filter(x => x && SHOUT_SITES.includes(x.site) && /^[\w-]{1,40}$/.test(String(x.login || '')))
    .map(x => ({ ...soPersonOf({ site: x.site, login: x.login, sender: String(x.name || x.login).slice(0, 40), named: !!x.named }), t: +x.t || 0, bot: bots(String(x.name || x.login)), ch: w.channel, raid: !!x.raid }));
}
// Who's left out as yours, or the channel's own
function soRunWho(w){
  const me = [myName && 'kick:' + myName, bellVars.myTwitch && 'twitch:' + bellVars.myTwitch].filter(Boolean);
  const s = ownerOf(w.channel), accounts = s ? s.accounts : [w.channel];
  return { me, host: accounts.filter(a => SHOUT_SITES.includes(platOf(a))).map(a => platOf(a) + ':' + platform(a).handle(a).toLowerCase()) };
}
async function soPickFor(w, lines, n){
  const { me, host } = soRunWho(w);
  const only = settings.flag('shoutStreamers', true);
  // look up who streams (the newest few dozen people), as far as it can in a few seconds
  if (only){
    const seen = new Set(), todo = [];
    for (let i = lines.length - 1; i >= 0 && todo.length < RUN_MAX * 3; i--){ const k = soKey(lines[i]); if (!seen.has(k)){ seen.add(k); if (!soKnownStreamer(lines[i])) todo.push(lines[i]); } }
    let at = 0;
    const next = async () => { while (at < todo.length){ const p = todo[at++]; await soLookUp(p); } };
    await soWithin(Promise.all([next(), next(), next(), next()]), SO_TIMING.look);
  }
  return pickRun(lines, { n, me, host, onlyStreamers: only, streamsOf: p => soKnownStreamer(p) || !!(soKnown[soKey(p)] && soKnown[soKey(p)].streams), sentAt: soSentAt, againMs: soAgainMs() });
}
// The ⋯ menu's Shout out recent chatters (and the search box's): the list first, or straight away (Settings, or ⇧ for the other)
async function openRun(w, { flip = false } = {}){
  if (!w || !shoutOn()) return;
  if (soRun && !soRun.stop) return flash('Already shouting out: Stop it first');
  const ch = soRunCh(w);
  if (!ch || !SHOUT_SITES.includes(platOf(ch))) return flash(ch ? `Shoutouts are for Kick and Twitch: pick one of them to send on` : 'No chat to send on right now');
  if (!shoutHere(ch)) return flash(SO_NOT_MOD);
  const lines = await soRunLines(w);
  if (!lines.length) return flash('No one has chatted here yet');
  const first = settings.flag('shoutListFirst', true) !== flip;
  if (!first){
    const r = await soPickFor(w, lines, soRunN());
    const go = r.list.filter(p => p.on);
    return go.length ? startRun(w, go) : flash('No streamers to shout out among the last people who chatted');
  }
  runDialog(w, lines);
}
let soDlg = null;
function closeRunDialog(){ if (soDlg){ soDlg.remove(); soDlg = null; } }
async function runDialog(w, lines){
  closeRunDialog();
  const state = { n: soRunN(), res: null, showAll: false, ticks: new Map() };
  const list = element('div', { class: 'so-list', role: 'group', 'aria-label': 'Who to shout out' });
  // a long list: how many more are below (it scrolls), and ticking them all or none at once
  const more = element('button', { type: 'button', class: 'so-more', hidden: true, dataset: { cmd: 'shout.runMoreBelow' }, onclick: () => list.scrollBy({ top: list.clientHeight - 40, behavior: 'smooth' }) });
  const below = () => { const end = list.scrollTop + list.clientHeight, n = [...list.children].filter(r => r.offsetTop + r.offsetHeight / 2 > end).length;
    more.hidden = !n; more.textContent = `${n} more ↓`; list.classList.toggle('so-cut', n > 0); };
  list.addEventListener('scroll', below);
  const tickAll = on => { if (!state.res) return; [...state.res.list, ...(state.showAll ? state.res.left.viewers : [])].forEach(p => state.ticks.set(soKey(p), on)); draw(); };
  const ticks = element('span', 'so-ticks', element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'shout.runTickAll' }, onclick: () => tickAll(true) }, 'Tick all'), ' · ',
    element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'shout.runTickNone' }, onclick: () => tickAll(false) }, 'none'));
  const count = element('span', 'zoomPct', String(state.n));
  const skip = element('div', 'so-skip');
  const go = element('button', { type: 'button', class: 'btn primary', dataset: { cmd: 'shout.runSend' } }, 'Send');
  const pace = element('span', 'so-pace');
  const nolist = element('input', { type: 'checkbox', dataset: { cmd: 'shout.runNoList' } });
  const box = element('div', { class: 'dlg so-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'soDlgT' },
    element('h3', { id: 'soDlgT' }, element('span', { class: 'so-hic', html: icon.megaphone }), 'Shout out recent chatters'),
    element('div', 'dlg-sub', settings.flag('shoutStreamers', true) ? 'The last streamers who chatted in ' : 'The last people who chatted in ', element('b', null, nameOf(w.channel) || chLabel(w.channel)),
      `'s ${allOn(w) ? PLAT_NAME[platOf(soRunCh(w))] + ' ' : ''}chat, newest first. Each gets your shoutout there.`),
    element('div', 'so-count', element('span', null, settings.flag('shoutStreamers', true) ? 'Streamers who chatted last' : 'People who chatted last'), ticks,
      element('div', 'zoom', element('button', { type: 'button', 'aria-label': 'Fewer', dataset: { cmd: 'shout.runFewer' }, onclick: () => setN(state.n - 1) }, '−'), count,
        element('button', { type: 'button', 'aria-label': 'More', dataset: { cmd: 'shout.runMore' }, onclick: () => setN(state.n + 1) }, '+'))),
    element('div', 'so-lw', list, more), skip, element('label', 'so-nolist', nolist, 'Start straight away next time'),
    element('div', 'dlg-foot', pace, element('button', { type: 'button', class: 'btn', dataset: { cmd: 'shout.runCancel' }, onclick: closeRunDialog }, 'Cancel'), go));
  soDlg = element('div', { class: 'dlg-bg so-bg', onclick: e => { if (e.target === soDlg) closeRunDialog(); } }, box);
  soDlg.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); closeRunDialog(); } else if (e.key === 'Enter' && !e.target.closest('button')){ e.preventDefault(); go.click(); } });
  document.body.appendChild(soDlg);
  list.replaceChildren(element('div', 'so-wait', 'Looking up who streams…'));
  const ticked = () => state.res ? [...state.res.list, ...(state.showAll ? state.res.left.viewers : [])].filter(p => state.ticks.get(soKey(p))) : [];
  const sync = () => {
    const n = ticked().length;
    go.textContent = n ? `Send ${n}` : 'Send'; go.disabled = !n;
    pace.replaceChildren(element('i', { html: icon.clock }), n ? `One a second · about ${n} s` : 'One a second');
  };
  const row = (p, why) => {
    const on = state.ticks.get(soKey(p));
    const g = soKnown[soKey(p)] && soKnown[soKey(p)].game;
    const sub = [p.raid ? 'Raided' : '', g ? `Streams ${g}` : PLAT_NAME[p.site]].filter(Boolean).join(' · ');
    const tick = element('input', { type: 'checkbox', checked: !!on, 'aria-label': `Shout out ${p.name}`, onchange: e => { state.ticks.set(soKey(p), e.target.checked); sync(); } });
    return element('label', { class: 'so-row' + (why ? ' off' : '') }, tick, element('i', { class: 'pi pi-' + p.site }, PLAT_NAME[p.site][0]),
      element('span', 'nm', element('b', null, p.name), element('small', null, sub)), element('span', 'ago', why || (p.at ? soAgo(p.at).replace(' ago', '') : '')));
  };
  const draw = () => {
    const r = state.res;
    list.replaceChildren(...r.list.map(p => row(p, p.why === 'recent' ? `Shouted out ${soAgo(soSentAt(p))}` : '')), ...(state.showAll ? r.left.viewers.map(p => row(p, 'No streams found')) : []));
    if (!list.children.length) list.replaceChildren(element('div', 'so-wait', 'No one to shout out yet'));
    ticks.hidden = list.querySelectorAll('.so-row').length < 4;
    requestAnimationFrame(below);
    const left = [r.left.you && 'you', r.left.host && (nameOf(w.channel) || chLabel(w.channel)), r.left.bots && `${r.left.bots} chat ${r.left.bots === 1 ? 'bot' : 'bots'}`,
      r.left.viewers.length && `${r.left.viewers.length} ${r.left.viewers.length === 1 ? 'person' : 'people'} with no streams found`].filter(Boolean);
    skip.replaceChildren(...(left.length ? [`Left out: ${left.length > 1 ? left.slice(0, -1).join(', ') + ' and ' + left[left.length - 1] : left[0]}.`] : []),
      ...(r.left.viewers.length && !state.showAll ? [' ', element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'shout.runShowAll' }, onclick: () => { state.showAll = true; draw(); } }, 'Show them')] : []));
    sync();
  };
  const setN = async n => {
    state.n = Math.max(1, Math.min(RUN_MAX, n)); count.textContent = String(state.n); settings.set('shoutRunN', state.n);
    state.res = await soPickFor(w, lines, state.n);
    state.res.list.forEach(p => { if (!state.ticks.has(soKey(p))) state.ticks.set(soKey(p), p.on); });
    state.res.left.viewers.forEach(p => { if (!state.ticks.has(soKey(p))) state.ticks.set(soKey(p), false); });
    if (soDlg) draw();
  };
  go.onclick = () => {
    const picked = ticked(); if (!picked.length) return;
    if (nolist.checked) settings.set('shoutListFirst', '0');
    closeRunDialog();
    startRun(w, picked);
  };
  await setN(state.n);
  go.focus();
}
const RUN_HELD = { disabled: 'The chat isn\'t letting you send right now', 'not-sent': 'The chat held the message back', 'no-answer': 'The chat didn\'t answer' };
// The strip above the send box (in ALL) or over the top of the chat: how the run is going, and Stop
function soDrawStrip(){
  const r = soRun; if (!r) return;
  const at = r.at ?? r.i, w = r.w, p = r.list[Math.min(at, r.list.length - 1)];   // (at: who's next, in the gap after a send)
  if (!r.strip){
    r.strip = element('div', { class: 'so-strip', role: 'status', 'aria-live': 'polite' });
    const view = allOn(w) && w.allView, cmp = view && view.el.querySelector('.all-cmp');
    if (cmp) cmp.before(r.strip); else { r.strip.classList.add('so-float'); (w.el.querySelector('.body') || w.el).appendChild(r.strip); }
  }
  const dots = element('span', 'so-dots', ...r.list.map((_, i) => element('i', i < at ? 'd' : i === at ? 'n' : '')));
  r.strip.classList.toggle('paused', !!r.wait);
  r.strip.replaceChildren(element('span', { class: 'ic', html: r.wait ? icon.clock : icon.megaphone }),
    element('span', 'tx', r.wait ? element('b', null, typeof r.wait === 'number' ? `${r.why} · ${r.wait} s` : r.why) : element('b', null, `Shouting out ${at + 1} of ${r.list.length} · ${p.name}`),
      r.wait ? element('small', null, r.whySub || 'It tries again then') : dots),
    element('button', { type: 'button', class: 'btn', dataset: { cmd: 'shout.stop' }, onclick: () => stopRun() }, 'Stop'),
    element('span', { class: 'bar', style: `width:${Math.round((at / r.list.length) * 100)}%` }));
}
function stopRun(said){
  const r = soRun; if (!r) return;
  r.stop = true; soRun = null;
  if (r.strip) r.strip.remove();
  stopWinTimer(r.w, 'shout');
  if (said) flash(said);
}
const soPause = (r, ms) => new Promise(done => winTimer(r.w, 'shout', done, ms));
async function startRun(w, list){
  soRun = { w, list, i: 0, stop: false, wait: 0, why: '' };
  const r = soRun;
  let done = 0;
  for (; r.i < list.length && !r.stop; r.i++){
    const p = list[r.i];
    if (!wins.includes(w)) return stopRun();
    soDrawStrip();
    for (let tries = 0; !r.stop; tries++){
      const rules = chatRules(p.ch);
      if (rules.wait){ await soCountDown(r, rules.wait, 'Waiting for slow mode', `${PLAT_NAME[platOf(p.ch)]}'s chat here: a message every ${rules.slow || rules.wait} s`); continue; }
      // your draft in the site's own chat box goes first: it waits (it'd type over it)
      const cw = soChatWin(p.ch), draft = cw && cw.view ? await askIn(cw.view, `(${draftAgent})(${JSON.stringify(platOf(p.ch))})`).catch(() => '') : '';
      if (draft && !r.stop){ await soWaitDraft(r, cw, platOf(p.ch)); continue; }
      const res = await shoutOut(p, { chs: [p.ch], again: false, quiet: true });
      if (r.stop) return;
      if (res === 'sent'){ done++; break; }
      if (res === 'missing' || res === 'gone' || res === 'no-box' || tries >= 2){ flash(`Skipped ${p.name}: ${res === 'missing' ? 'couldn\'t find their Kick channel' : (SHOUT_FAIL[res] || SHOUT_FAIL['no-answer'])(PLAT_NAME[platOf(p.ch)])}`); break; }
      // held back (slow mode, the site's limit, a filter): its modes again, then wait and try again
      const c = soChatWin(p.ch);
      if (c && c.view){ const x = await askIn(c.view, `(${modesAgent})()`).catch(() => null); if (x) setModes(p.ch, x); }
      await soCountDown(r, chatRules(p.ch).wait || SO_TIMING.retry, RUN_HELD[res] || 'Waiting', 'It tries again then');
    }
    if (r.stop) return;
    if (r.i < list.length - 1){ r.at = r.i + 1; soDrawStrip(); await soPause(r, SO_TIMING.gap); r.at = null; }
  }
  if (soRun === r) stopRun(done ? `Shouted out ${done} ${done === 1 ? 'person' : 'people'}` : '');
}
// Waits while you have something typed in that site's chat box (sent or cleared: it goes on)
async function soWaitDraft(r, c, site){
  r.why = 'Waiting while you type'; r.whySub = `Your message in ${PLAT_NAME[site]}'s chat box goes first`; r.wait = '…';
  soDrawStrip();
  while (!r.stop && wins.includes(r.w)){
    await soPause(r, 1000);
    const d = c.view ? await askIn(c.view, `(${draftAgent})(${JSON.stringify(site)})`).catch(() => '') : '';
    if (!d) break;
  }
  r.wait = 0; if (!r.stop) soDrawStrip();
}
async function soCountDown(r, secs, why, sub){
  r.why = why; r.whySub = sub;
  for (let s = Math.ceil(secs); s > 0 && !r.stop; s--){ r.wait = s; soDrawStrip(); await soPause(r, 1000); }
  r.wait = 0; if (!r.stop) soDrawStrip();
}

// The chat a command from the search box is for: the window you're in, else the last Kick or Twitch chat opened
const soLastChat = () => { const a = activeWin(); return a && a.kind === 'chat' ? a : [...wins].reverse().find(w => w.kind === 'chat' && SHOUT_SITES.includes(platOf(w.channel))) || null; };
// Each chat window's ⋯ Shout out recent chatters, there while shoutouts are on (Kick and Twitch chats, and ALL)
function syncShoutButtons(){
  const on = shoutOn();
  wins.forEach(w => { const b = w.el && w.el.querySelector('.btns [data-a=shout]'); if (b) b.hidden = !on || !shoutHere(soRunCh(w) || w.channel); });
}
// The script in each Kick and Twitch chat page: on, or taken away
function shoutInSite(w, view = w && w.ready && w.view){
  if (!w || w.kind !== 'chat' || !SHOUT_SITES.includes(platOf(w.channel)) || !view) return;
  runIn(view, `(${shoutAgent})(${shoutHere(w.channel)}, null, ${JSON.stringify({ names: appBots(w.channel), says: BOT_SAYS_RE })})`);   // (its bots: a bot's line is for who it's about)
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  soKnown = settings.json('shoutKnown', {}) || {};
  soSent = settings.json('shoutSent', {}) || {};
  if (typeof soKnown !== 'object' || Array.isArray(soKnown)) soKnown = {};
  if (typeof soSent !== 'object' || Array.isArray(soSent)) soSent = {};
  soSaveKnown = soon(() => settings.set('shoutKnown', soKnown), 1500);
  store.watch(['shoutouts', 'wins', 'mod'], () => syncShoutButtons());
  store.watch(['shoutouts', 'mod'], () => { if (!shoutOn()){ stopRun(); closeRunDialog(); } wins.forEach(w => shoutInSite(w)); });   // (mod: where you're a mod, as the sites answered)
  settings.onChange(['shoutOn', 'shoutSend', 'shoutText', 'shoutChannels', 'shoutModOnly', 'shoutTwitch', 'shoutAgain', 'shoutRunN', 'shoutStreamers', 'shoutListFirst'], () => store.changed('shoutouts'));
  settings.onChange(['shoutSent'], () => { soSent = settings.json('shoutSent', {}) || {}; store.changed('shoutouts'); });
  // a press in a Kick or Twitch chat page, and its right-click menu's Shout out: in that chat
  fromSite('shoutout', (w, d) => { const p = soPersonOf({ site: d.site, login: d.login, sender: d.name, named: d.named }); if (p) shoutOut({ ...p, ch: w.channel }); });
  if (DESKTOP) fromApp('onViewShoutout', (id, d) => {
    const w = winOfView(id), p = w && d && soPersonOf({ site: d.site, login: d.login, sender: d.name });
    if (p) shoutOut({ ...p, ch: w.channel });
  });
  commands.add({ id: 'shout.recent', group: 'Shoutouts', title: 'Shout out recent chatters', sub: 'One a second, in the chat they wrote in', icon: 'megaphone', words: ['shoutout', 'so', 'raid'],
    when: () => shoutOn() && wins.some(w => w.kind === 'chat' && SHOUT_SITES.includes(platOf(w.channel)) && shoutHere(soRunCh(w) || w.channel)),
    run: () => openRun(soLastChat()), alt: () => openRun(soLastChat(), { flip: true }), altLabel: () => (settings.flag('shoutListFirst', true) ? 'Start straight away' : 'Show who first') });
  commands.add({ id: 'shout.stop', group: 'Shoutouts', title: 'Stop shouting out', icon: 'megaphone', when: () => !!soRun, run: () => stopRun('Stopped') });
  commands.provide('shoutouts', () => {
    if (!shoutOn()) return [];
    const out = [], seen = new Set();
    for (const w of wins.filter(o => o.kind === 'chat' && allOn(o))){
      const f = feeds.get(ownerOf(w.channel).id); if (!f) continue;
      for (let i = f.msgs.length - 1; i >= 0 && out.length < 12; i--){
        const m = f.msgs[i], p = (m.kind === 'message' || (m.support && m.support.kind === 'raid')) && !m.bot && shoutHere(m.ch) && soPersonOf(m);
        if (!p || seen.has(soKey(p)) || soRunWho(w).me.includes(soKey(p)) || soRunWho(w).host.includes(soKey(p))) continue;
        seen.add(soKey(p));
        out.push({ id: 'shout.p.' + soKey(p), group: 'Shoutouts', title: `Shout out ${p.name}`, icon: 'megaphone', noRecent: true,
          sub: `${m.support && m.support.kind === 'raid' ? 'Raided' : 'Chatted ' + soAgo(m.t)} · in ${PLAT_NAME[platOf(m.ch)]} chat`, run: () => shoutOut(p) });
      }
    }
    return out;
  });
  window.shoutAgent = shoutAgent;   // for the tests
  window.shoutouts = { timing: SO_TIMING, shoutOut, openRun, stopRun, lookUp: soLookUp, known: () => soKnown, sent: () => soSent, state: () => soRun && { i: soRun.i, n: soRun.list.length, wait: soRun.wait } };   // for the tests
}

export { init, openRun, shoutHere, shoutInSite, shoutOn, shoutOut, shoutTag, soCardAvatars, soCards, soCheckCards,
  soDropCard, soPersonOf, soPutCard, soSaveCards, soSentAt };
