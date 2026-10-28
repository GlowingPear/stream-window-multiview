/* ---- Each site's chat data (in-site/feed.js) as one kind of message, for the ALL tab (chat/all-chat.js) ----
   A message: { site, kind, id, t, sender, login, color, badges: ['moderator', …], parts: [{ text } | { emote, name }],
   reply?: { id, sender, login, body }, action?, highlight?, bits?, text? (an event's own words), userId? }.
   kind: 'message', 'event' (a sub, gift, raid, Super Chat…), 'delete' ({ target, ai?, rules? }) or 'clear' (all of
   one person's messages: { login } or { userId }). Anything it can't read is left out (null). */

// The badges ALL draws, by each site's own name for them
const BADGES = {
  broadcaster: 'host', owner: 'host', moderator: 'mod', vip: 'vip', subscriber: 'sub', founder: 'sub', member: 'sub',
  og: 'og', verified: 'verified', partner: 'verified', staff: 'staff', admin: 'staff', global_mod: 'staff', sub_gifter: 'gifter'
};
const badgeKinds = list => [...new Set(list.map(b => BADGES[String(b).toLowerCase()]).filter(Boolean))];

/* Twitch: one line of its chat connection (IRC with tags) */
const unescapeTag = v => v.replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' })[c] ?? c);
function ircLine(line){
  const m = /^(?:@(\S+) )?(?::(\S+) )?(\S+)(?: (#\S+))?(?: :([\s\S]*))?$/.exec(line);
  if (!m) return null;
  const tags = {};
  (m[1] || '').split(';').forEach(kv => { const i = kv.indexOf('='); if (i > 0) tags[kv.slice(0, i)] = unescapeTag(kv.slice(i + 1)); });
  return { tags, nick: (m[2] || '').split('!')[0], cmd: m[3], room: m[4] || '', text: m[5] || '' };
}
// "25:0-4,12-16/1902:6-10" -> the text split into its words and emotes (positions count characters, not UTF-16 units)
function twitchParts(text, emotes){
  const chars = Array.from(text), at = [];
  (emotes || '').split('/').forEach(e => {
    const [id, pos] = e.split(':'); if (!id || !pos) return;
    pos.split(',').forEach(p => { const [a, b] = p.split('-').map(Number); if (b >= a) at.push({ a, b, id }); });
  });
  at.sort((x, y) => x.a - y.a);
  const parts = []; let i = 0;
  const textPart = s => { if (s) parts.push({ text: s }); };
  at.forEach(({ a, b, id }) => {
    if (a < i) return;
    textPart(chars.slice(i, a).join(''));
    parts.push({ emote: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`, name: chars.slice(a, b + 1).join('') });
    i = b + 1;
  });
  textPart(chars.slice(i).join(''));
  return parts;
}
function parseTwitch(line){
  const l = ircLine(String(line || '')); if (!l) return null;
  const g = l.tags, t = +g['tmi-sent-ts'] || Date.now();
  if (l.cmd === 'CLEARMSG') return g['target-msg-id'] ? { site: 'twitch', kind: 'delete', target: g['target-msg-id'], t } : null;
  if (l.cmd === 'CLEARCHAT') return l.text ? { site: 'twitch', kind: 'clear', login: l.text.toLowerCase(), t, until: g['ban-duration'] ? t + g['ban-duration'] * 1000 : 0 } : null;
  if (l.cmd !== 'PRIVMSG' && l.cmd !== 'USERNOTICE') return null;
  let text = l.text, action = false;
  const me = /^\u0001ACTION ([\s\S]*)\u0001$/.exec(text); if (me){ text = me[1]; action = true; }
  const login = (g.login || l.nick || '').toLowerCase();
  const msg = {
    site: 'twitch', kind: l.cmd === 'USERNOTICE' ? 'event' : 'message', id: g.id || '', t,
    sender: g['display-name'] || login, login, color: g.color || '', userId: g['user-id'] || '',
    badges: badgeKinds((g.badges || '').split(',').map(b => b.split('/')[0]).filter(Boolean)),
    parts: twitchParts(text, g.emotes)
  };
  if (action) msg.action = true;
  if (g['msg-id'] === 'highlighted-message') msg.highlight = true;
  if (+g.bits) msg.bits = +g.bits;
  if (g['first-msg'] === '1') msg.first = true;
  if (g['reply-parent-msg-id']) msg.reply = { id: g['reply-parent-msg-id'], sender: g['reply-parent-display-name'] || g['reply-parent-user-login'] || '', login: (g['reply-parent-user-login'] || '').toLowerCase(), body: g['reply-parent-msg-body'] || '' };
  if (msg.kind === 'event'){ msg.event = g['msg-id'] || ''; msg.text = g['system-msg'] || ''; }
  return msg;
}

/* Kick: one frame of its live connection: {"push":{"channel":…,"pub":{"data":{"event":"App\\Events\\…","data":"<json>"}}}} */
function kickParts(content){
  const parts = [], re = /\[emote:(\d+):([^\]]*)\]/g; let i = 0, m;
  const s = String(content || '');
  while ((m = re.exec(s))){
    if (m.index > i) parts.push({ text: s.slice(i, m.index) });
    parts.push({ emote: `https://files.kick.com/emotes/${m[1]}/fullsize`, name: m[2] });
    i = m.index + m[0].length;
  }
  if (i < s.length) parts.push({ text: s.slice(i) });
  return parts;
}
function parseKick(frame){
  let p, d;
  try { p = JSON.parse(frame).push.pub.data; d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data; } catch { return null; }
  if (!p || !d) return null;
  const ev = String(p.event || '').split('\\').pop();
  if (ev === 'MessageDeletedEvent'){
    const target = d.message && d.message.id; if (!target) return null;
    const out = { site: 'kick', kind: 'delete', target, t: Date.now() };
    if (d.aiModerated){ out.ai = true; out.rules = Array.isArray(d.violatedRules) ? d.violatedRules.map(String) : []; }
    return out;
  }
  if (ev === 'UserBannedEvent'){ const u = d.user && (d.user.slug || d.user.username); return u ? { site: 'kick', kind: 'clear', login: String(u).toLowerCase(), t: Date.now() } : null; }
  if (ev !== 'ChatMessageEvent' || !d.id) return null;
  const s = d.sender || {}, idy = s.identity || {};
  const msg = {
    site: 'kick', kind: 'message', id: d.id, t: Date.parse(d.created_at) || Date.now(),
    sender: s.username || '', login: String(s.slug || s.username || '').toLowerCase(), color: idy.color || '', userId: s.id ? String(s.id) : '',
    badges: badgeKinds((idy.badges || []).map(b => b && b.type)), parts: kickParts(d.content)
  };
  const md = d.metadata || {};
  if (d.type === 'reply' && md.original_message) msg.reply = { id: md.original_message.id || d.thread_parent_id || '', sender: (md.original_sender && md.original_sender.username) || '',
    login: String((md.original_sender && md.original_sender.username) || '').toLowerCase(), body: kickParts(md.original_message.content).map(x => x.text || x.name).join('') };
  return msg;
}

/* YouTube: one action of a get_live_chat answer */
const ytText = runs => (runs || []).map(r => r.text || (r.emoji && (r.emoji.shortcuts || [])[0]) || '').join('');
function ytParts(runs){
  return (runs || []).map(r => {
    if (r.text) return { text: r.text };
    const e = r.emoji; if (!e) return null;
    const img = e.image && e.image.thumbnails && e.image.thumbnails[0];
    return e.isCustomEmoji && img ? { emote: img.url, name: (e.shortcuts || [])[0] || '' } : { text: (e.emojiId && !/^UC/.test(e.emojiId) ? e.emojiId : (e.shortcuts || [])[0]) || '' };
  }).filter(p => p && (p.text || p.emote));
}
function ytBadges(list){
  return badgeKinds((list || []).map(b => {
    const r = b.liveChatAuthorBadgeRenderer || {}, type = r.icon && r.icon.iconType;
    return type ? type.toLowerCase() : r.customThumbnail ? 'member' : '';
  }));
}
function parseYouTube(action){
  if (!action || typeof action !== 'object') return null;
  if (action.removeChatItemAction) return { site: 'youtube', kind: 'delete', target: action.removeChatItemAction.targetItemId, t: Date.now() };
  if (action.markChatItemsByAuthorAsDeletedAction) return { site: 'youtube', kind: 'clear', userId: action.markChatItemsByAuthorAsDeletedAction.externalChannelId, t: Date.now() };
  const item = action.addChatItemAction && action.addChatItemAction.item; if (!item) return null;
  const [type] = Object.keys(item), r = item[type] || {};
  if (!r.id) return null;
  const base = { site: 'youtube', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: (r.authorName && r.authorName.simpleText) || '',
    login: ((r.authorName && r.authorName.simpleText) || '').replace(/^@/, '').toLowerCase(), color: '', userId: r.authorExternalChannelId || '', badges: ytBadges(r.authorBadges) };
  if (type === 'liveChatTextMessageRenderer') return { ...base, kind: 'message', parts: ytParts(r.message && r.message.runs) };
  if (type === 'liveChatPaidMessageRenderer' || type === 'liveChatPaidStickerRenderer'){
    const amount = (r.purchaseAmountText && r.purchaseAmountText.simpleText) || '';
    return { ...base, kind: 'event', event: type === 'liveChatPaidMessageRenderer' ? 'superchat' : 'supersticker', amount, text: `${base.sender} sent a Super ${type === 'liveChatPaidMessageRenderer' ? 'Chat' : 'Sticker'}${amount ? ' · ' + amount : ''}`, parts: ytParts(r.message && r.message.runs) };
  }
  if (type === 'liveChatMembershipItemRenderer') return { ...base, kind: 'event', event: 'membership', text: ytText((r.headerSubtext || {}).runs) || (r.headerSubtext && r.headerSubtext.simpleText) || `${base.sender} became a member`, parts: ytParts(r.message && r.message.runs) };
  return null;
}

// Every message in a batch from one chat ("__kmv:feed"), in order: unreadable ones left out
function parseFeed(batch){
  const fn = { twitch: parseTwitch, kick: parseKick, youtube: parseYouTube }[batch && batch.s];
  return fn && Array.isArray(batch.raw) ? batch.raw.map(r => { try { return fn(r); } catch { return null; } }).filter(Boolean) : [];
}

// (one object, so the tests can reach each site's reader)
const feedParse = { parseFeed, parseTwitch, parseKick, parseYouTube, ircLine, twitchParts, kickParts, ytParts, badgeKinds };

export { feedParse };
