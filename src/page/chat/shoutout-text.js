/* ---- Shoutouts (issue #300): the message, who a row of Settings › Chat › Shoutouts › People is for, whether someone
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

// The People row for a person: a linked streamer's row covers all their sites; anyone else's matches their address on
// the site it was added from, or on every site when the row says so (the same name elsewhere can be someone else).
function shoutRow(people, p){
  const rows = Array.isArray(people) ? people : [];
  if (!p) return null;
  const login = String(p.login || '').toLowerCase();
  return (p.streamer && rows.find(r => r && r.streamer && r.streamer === p.streamer))
    || rows.find(r => r && !r.streamer && String(r.login || '').toLowerCase() === login && (r.every || r.site === p.site)) || null;
}

// What to send for a person, shouted out in a site's chat: their row's message for that site, else its own message,
// else yours; its other channel instead of them, when it has one. gameOf(to): their last game ('' when not known);
// linksOf(to): their links on every site the app knows them on. -> { text, to (the person shouted out) }
function shoutFor({ tpl, people, person, site, gameOf = () => '', linksOf = () => [] }){
  const row = shoutRow(people, person);
  const other = row && row.to && row.to.login;
  const to = other ? { site: row.to.site || person.site, login: String(row.to.login).toLowerCase(), name: row.to.name || row.to.login, streamer: row.to.streamer || '' } : person;
  const own = other ? shoutRow(people, to) : row;   // (the other channel's own row, if it has one)
  const msg = (own && own.sites && own.sites[site]) || (own && own.msg) || '';
  const link = shoutLink(to.site, to.login);
  const links = [...new Set([link, ...(linksOf(to) || [])].filter(Boolean))].join(' ');
  return { to, text: fillShout(msg || tpl, { name: to.name || to.login, link, links, game: gameOf(to) }) };
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
    const p = { site: m.site, login, name: m.name || m.login, streamer: m.streamer || '', at: m.t || 0 };
    if (onlyStreamers && !streamsOf(p)){ left.viewers.push(p); continue; }
    const last = sentAt(p), recent = againMs > 0 && last && now - last < againMs;
    list.push({ ...p, on: !recent, why: recent ? 'recent' : '' });
  }
  return { list, left: { ...left, bots: left.bots.size } };
}

export { RUN_MAX, SHOUT_MAX, SHOUT_TOKENS, SHOUT_TPL, fillShout, kickTries, pickRun, shoutFor, shoutLink, shoutRow, streams };
