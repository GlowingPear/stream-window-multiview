/* ---- Shoutouts (issue #300): the message, who a row of Settings › Shoutouts › People is for, whether someone
   streams, and who a run of recent chatters shouts out. Nothing here touches the page (unit tested on its own).
   A person: { site: 'kick' | 'twitch', login (their channel address: Kick's slug, Twitch's login), name (as shown),
   streamer (a linked streamer's id, or '') }. */
const SHOUT_TPL = 'Go check out {name}! [Last seen playing {game} ]→ {link}';
const SHOUT_TOKENS = ['{name}', '{link}', '{links}', '{game}'];
const SHOUT_MAX = 450;       // a message, at most (Twitch takes 500 characters, Kick a little more)
const RUN_MAX = 20;          // a run of recent chatters, at most (Twitch: about 20 messages in 30 s for a viewer)
const SITE_URL = { kick: 'https://kick.com/', twitch: 'https://twitch.tv/' };

// A channel's address on its site, always a full https:// link (the sites' chats only make those clickable)
const shoutLink = (site, login) => (SITE_URL[site] && login ? SITE_URL[site] + String(login).toLowerCase() : '');

// Kick's address for a name: the name, then (only if Kick hasn't got that one) with - for _, as some Kick names with
// _ have - in their address and some keep the _. Never guessed: the caller asks Kick for each in turn.
function kickTries(name){
  const n = String(name || '').trim().replace(/^@/, '').toLowerCase();
  if (!n) return [];
  const dash = n.replace(/_/g, '-');
  return dash === n ? [n] : [n, dash];
}

// The message: {name}, {link}, {links} and {game} filled in. A part in [ ] is left out when something in it is empty
// (no game known); an empty one outside [ ] is left out with the space around it. Never "undefined", never two spaces.
function fillShout(tpl, v){
  const val = k => String((v && v[k]) || '').trim();
  const fill = s => s.replace(/\{(name|link|links|game)\}/g, (_, k) => val(k));
  const empty = s => [...s.matchAll(/\{(name|link|links|game)\}/g)].some(x => !val(x[1]));
  const t = String(tpl == null ? '' : tpl).trim() || SHOUT_TPL;
  return t.replace(/\[([^\[\]]*)\]/g, (_, inner) => (empty(inner) ? '' : fill(inner)))
    .replace(/\{(name|link|links|game)\}/g, (_, k) => val(k))
    .replace(/[ \t]+/g, ' ').replace(/ ([!?.,:;)])/g, '$1').replace(/^ | $/gm, '').trim().slice(0, SHOUT_MAX);
}

/* ---- Settings › Shoutouts › Channels: a card for each real channel ----
   A card: { ch (the channel: 'name' on Kick, 'tw:name' on Twitch; a linked streamer's main one), streamer (a linked
   streamer's id, or ''), name, msg (their message; '' for yours), perSite (a linked streamer: a message for each site),
   sites ({ kick, twitch } when perSite), also ([{ site ('' for any), login, name }]: chatters whose shoutout is this
   channel's, their other accounts), lost (it couldn't be found on its site) }. */
const siteOfCh = ch => (/^tw:/.test(ch || '') ? 'twitch' : /^yt:/.test(ch || '') ? 'youtube' : 'kick');
const loginOfCh = ch => String(ch || '').replace(/^tw:/, '').toLowerCase();
const chOfPerson = p => (p.site === 'twitch' ? 'tw:' : '') + String(p.login || '').toLowerCase();

// The card a person's shoutout comes from: their own (a linked streamer's covers all their sites), else the card that
// lists them among its chatters. -> { card, via: 'self' | 'also' }, or null
function cardFor(cards, p){
  const list = (Array.isArray(cards) ? cards : []).filter(c => c && c.ch);
  if (!p || !p.login) return null;
  const ch = chOfPerson(p), login = String(p.login).toLowerCase();
  const self = list.find(c => (p.streamer && c.streamer === p.streamer) || c.ch === ch);
  if (self) return { card: self, via: 'self' };
  const also = list.find(c => (c.also || []).some(a => a && String(a.login || '').toLowerCase() === login && (!a.site || a.site === p.site)));
  return also ? { card: also, via: 'also' } : null;
}
// A card's message for a site's chat: its own (that site's, when it has one per site), or '' (yours)
const cardMsg = (card, site) => (!card ? '' : card.perSite ? String((card.sites || {})[site] || '') : String(card.msg || ''));

// What to send for a person, shouted out in a site's chat: their card's message, or yours. A chatter on a card's list
// gets that card's channel shouted out: a linked streamer's account on the chat's site, else its main one.
// chsOf(card): a linked streamer's channels; gameOf(to): their last game ('' when not known); linksOf(to): their
// links on every site the app knows them on. -> { text, to (the person shouted out) }
function shoutFor({ tpl, cards, person, site, gameOf = () => '', linksOf = () => [], chsOf = () => [] }){
  const hit = cardFor(cards, person), card = hit && hit.card;
  let to = person;
  if (hit && hit.via === 'also'){
    const accs = card.streamer ? (chsOf(card) || []) : [];
    const ch = accs.find(a => siteOfCh(a) === site && site !== 'youtube') || card.ch;
    to = { site: siteOfCh(ch), login: loginOfCh(ch), name: card.name || loginOfCh(ch), streamer: card.streamer || '' };
  }
  const link = shoutLink(to.site, to.login);
  const links = [...new Set([link, ...(linksOf(to) || [])].filter(Boolean))].join(' ');
  return { to, card, text: fillShout(cardMsg(card, site) || tpl, { name: to.name || to.login, link, links, game: gameOf(to) }) };
}

/* #300's People rows as cards: a row with its own message is its channel's card (checked: a name added for every site
   is found on Kick or Twitch later, and the card follows); a row that shouted out another channel is a chatter on that
   channel's card, made if it isn't there (with your message). A message for one site keeps that: the card has one per
   site, the others its main message. -> cards */
function cardsFromRows(rows){
  const cards = [], byLogin = new Map();
  const cardOf = (site, login, name, extra = {}) => {
    const k = String(login).toLowerCase();
    if (byLogin.has(k)) return Object.assign(byLogin.get(k), extra);
    const c = { ch: (site === 'twitch' ? 'tw:' : '') + k, streamer: '', name: name || login, msg: '', perSite: false, sites: {}, also: [], ...extra };
    byLogin.set(k, c); cards.push(c);
    return c;
  };
  for (const r of (Array.isArray(rows) ? rows : []).filter(r => r && r.login && !(r.to && r.to.login))){
    const sites = r.sites && typeof r.sites === 'object' ? Object.fromEntries(Object.entries(r.sites).filter(([, v]) => v)) : {};
    const per = Object.keys(sites).length > 0;
    cardOf(r.site === 'twitch' ? 'twitch' : 'kick', r.login, r.name, { streamer: r.streamer || '', msg: per ? '' : String(r.msg || ''), perSite: per,
      sites: per ? { kick: sites.kick || String(r.msg || ''), twitch: sites.twitch || String(r.msg || '') } : {}, unchecked: !!r.every || !r.streamer });
  }
  for (const r of (Array.isArray(rows) ? rows : []).filter(r => r && r.login && r.to && r.to.login)){
    const c = cardOf(r.to.site || (r.site === 'twitch' ? 'twitch' : 'kick'), r.to.login, r.to.name, {});
    if (!('unchecked' in c)) c.unchecked = true;
    const login = String(r.login).toLowerCase();
    if (!c.also.some(a => a.login === login)) c.also.push({ site: r.every ? '' : r.site || '', login, name: r.name || r.login });
  }
  return cards;
}

/* ---- Who a bot's message is about (BotRix's "Thanks for the follow Pixelfox", "Thank you for redeeming headpat @Lumen"):
   a shoutout from a bot's line is for them, never the bot; a bot's line it can't read has no shout out button (as the SO
   Helper extension did). Only the bots' sentences about an event ({user}: who; anything else in { }: anything), not any
   @name: bots @ whoever used a command. As regular expressions too, for the scripts in the sites' chats (in-site/shoutout.js). ---- */
const BOT_SAYS = [
  'Thanks for the follow {user}', 'Thank you for the follow {user}', 'Thank you for following {user}', '{user} followed us!',
  '{user} just gifted {count} KICKs', 'Thanks {user} for the {count} KICKs', '{user} thank you for raiding me with {count} spectators',
  'Thanks to {user} for hosting with {count} viewers', '{user} just raided the channel with {count} viewers', '{user} is raiding with {count}',
  'Thank you for the raid {user}', 'Thanks for the raid {user}', 'Thank you for subscribing {user}', 'Thanks for subscribing {user}',
  '{user} just subscribed', '{user} has subscribed', 'Thank you {user} for the sub', 'Thank you for redeeming {reward} {user}', 'Thanks for redeeming {reward} {user}', '{user} redeemed {reward}'];
const BOT_SAYS_RE = BOT_SAYS.map(t => t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(?!user\})[^}]*\}/g, '.*?').replace(/\s+/g, '\\s+').replace(/\{user\}/g, '@?([\\w-]{2,40})'));
// The names a bot's message is about, in order of its sentences. skip: names left out (you, the bot, the channel).
// -> [name] (as written, without @); [] when it isn't one of those sentences
function botTargets(text, skip = []){
  const t = String(text || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(), out = [], no = new Set(skip.map(x => String(x || '').toLowerCase()));
  const add = n => { const k = String(n || '').replace(/^@/, ''); if (/^[\w-]{2,40}$/.test(k) && !no.has(k.toLowerCase()) && !out.some(x => x.toLowerCase() === k.toLowerCase())) out.push(k); };
  for (const re of BOT_SAYS_RE){ const m = new RegExp(re, 'i').exec(t); if (m) add(m[1]); }
  return out;
}

/* Whether someone streams, from what Kick and Twitch say about their channel. Saved streams (VODs) expire or get deleted,
   and some channels never keep them, so none of them isn't proof: any one sign is enough. -> true, or false (no sign
   found). info: { live, lastBroadcast, recent (Kick's recent categories), vods, partner, affiliate, verified, known } */
function streams(info){
  if (!info) return false;
  return !!(info.known || info.live || (info.lastBroadcast && info.lastBroadcast.start) || (Array.isArray(info.recent) && info.recent.length)
    || info.vods > 0 || info.partner || info.affiliate || info.verified);
}

/* Who a run of recent chatters shouts out: the last n different people, newest first. lines: ALL's or a chat's messages
   ({ site, login, name, streamer, t, bot }), oldest first. Someone on several sites (a linked streamer, or the same
   address on Kick and Twitch) counts once, at their newest message. Left out: you, the channel's own accounts, bots,
   and (onlyStreamers) people with no streams found. Someone shouted out within againMs is listed, not ticked.
   -> { list: [{ ...person, at, on, why }], left: { you, host, bots, viewers: [person] } } */
function pickRun(lines, { n = 5, me = [], host = [], streamsOf = () => true, onlyStreamers = true, sentAt = () => 0, againMs = 0, now = Date.now() } = {}){
  const key = p => (p.streamer ? 's:' + p.streamer : String(p.login || '').toLowerCase());
  const mine = new Set(me.map(x => String(x).toLowerCase())), owner = new Set(host.map(x => String(x).toLowerCase()));
  const seen = new Set(), list = [], left = { you: false, host: false, bots: new Set(), viewers: [] };
  const cap = Math.max(1, Math.min(RUN_MAX, +n || 5));
  for (let i = (lines || []).length - 1; i >= 0 && list.length < cap; i--){
    const m = lines[i];
    if (!m || !m.login || (m.site !== 'kick' && m.site !== 'twitch')) continue;
    const k = key(m), login = String(m.login).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (mine.has(login) || mine.has(m.site + ':' + login)){ left.you = true; continue; }
    if (owner.has(login) || owner.has(m.site + ':' + login)){ left.host = true; continue; }
    if (m.bot){ left.bots.add(login); continue; }
    const p = { site: m.site, login, name: m.name || m.login, streamer: m.streamer || '', at: m.t || 0, ch: m.ch || '', named: !!m.named, raid: !!m.raid };
    if (onlyStreamers && !streamsOf(p)){ left.viewers.push(p); continue; }
    const last = sentAt(p), recent = againMs > 0 && last && now - last < againMs;
    list.push({ ...p, on: !recent, why: recent ? 'recent' : '' });
  }
  return { list, left: { ...left, bots: left.bots.size } };
}

export { BOT_SAYS_RE, botTargets, cardFor, cardsFromRows, fillShout, kickTries, loginOfCh, pickRun, RUN_MAX,
  SHOUT_MAX, SHOUT_TOKENS, SHOUT_TPL, shoutFor, shoutLink, siteOfCh, streams };
