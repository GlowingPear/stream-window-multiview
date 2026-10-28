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
  if (String(line || '').startsWith('{')) return twitchPin(line);
  const l = ircLine(String(line || '')); if (!l) return null;
  const g = l.tags, t = +g['tmi-sent-ts'] || Date.now();
  // (Twitch's chat says who and how long, not which moderator)
  if (l.cmd === 'CLEARMSG') return g['target-msg-id'] ? { site: 'twitch', kind: 'delete', target: g['target-msg-id'], t } : null;
  if (l.cmd === 'CLEARCHAT') return l.text ? { site: 'twitch', kind: 'clear', login: l.text.toLowerCase(), t, until: g['ban-duration'] ? t + g['ban-duration'] * 1000 : 0 } : { site: 'twitch', kind: 'clearall', t };
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
  if (g['custom-reward-id']) msg.redeem = { title: '', color: '' };   // (a channel points reward with text: Twitch's chat doesn't say which)
  if (g['first-msg'] === '1') msg.first = true;
  if (g['reply-parent-msg-id']) msg.reply = { id: g['reply-parent-msg-id'], sender: g['reply-parent-display-name'] || g['reply-parent-user-login'] || '', login: (g['reply-parent-user-login'] || '').toLowerCase(), body: g['reply-parent-msg-body'] || '' };
  if (msg.kind === 'event'){
    msg.event = g['msg-id'] || ''; msg.text = g['system-msg'] || '';
    const prm = {}; Object.keys(g).forEach(k => { if (k.startsWith('msg-param-')) prm[k.slice(10)] = g[k]; });
    // an announcement is a message the streamer or a mod highlighted, not an event
    if (msg.event === 'announcement'){ msg.kind = 'message'; msg.announce = (prm.color || 'PRIMARY').toLowerCase(); delete msg.event; delete msg.text; }
    else msg.summary = twitchSummary(msg.event, msg.sender, prm, msg.text);
  }
  return msg;
}

// Twitch's other connection (hermes): a message pinned (the whole message with it) or taken down
function twitchPin(frame){
  let p;
  try { p = JSON.parse(JSON.parse(frame).notification.pubsub); } catch { return null; }
  const d = p && p.data; if (!d || !d.id) return null;
  if (p.type === 'unpin-message') return { site: 'twitch', kind: 'unpin', id: String(d.id), t: Date.now() };
  if (p.type !== 'pin-message' || !d.message || !d.message.id) return null;
  const m = d.message, s = m.sender || {}, c = m.content || {};
  const parts = Array.isArray(c.fragments) && c.fragments.length
    ? c.fragments.map(f => f && f.emoticon && f.emoticon.emoticonID ? { emote: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(f.emoticon.emoticonID)}/default/dark/1.0`, name: f.text || '' } : { text: String((f && f.text) || '') })
    : [{ text: String(c.text || '') }];
  const msg = { site: 'twitch', kind: 'message', id: String(m.id), t: (+m.sent_at || 0) * 1000 || Date.now(), sender: s.display_name || s.login || '', login: String(s.login || '').toLowerCase(),
    color: s.chat_color || '', userId: s.id ? String(s.id) : '', badges: badgeKinds((s.badges || []).map(b => b && b.id)), parts };
  return { site: 'twitch', kind: 'pin', id: String(d.id), msg, t: Date.now(), by: (d.pinned_by && d.pinned_by.display_name) || '' };
}

// A Twitch event in a few words, the amount picked out: [{ text }, { strong }]
function twitchSummary(ev, name, p, system){
  const n = v => Number(v || 0).toLocaleString('en-US'), plural = (v, one, many) => `${n(v)} ${+v === 1 ? one : many}`;
  const months = +p['cumulative-months'] > 1 ? [{ text: ' · ' }, { strong: plural(p['cumulative-months'], 'month', 'months') }] : [];
  const prime = p['sub-plan'] === 'Prime' ? [{ text: ' with Prime' }] : [];
  const need = { submysterygift: 'mass-gift-count', raid: 'viewerCount', viewermilestone: 'value', bitsbadgetier: 'threshold' }[ev];
  if (need && !(+p[need] > 0)) return system ? [{ text: system }] : [{ strong: name }];   // (without its number: the site's own words)
  switch (ev){
    case 'sub': case 'resub': return [{ strong: name }, { text: ' subscribed' }, ...prime, ...months];
    case 'subgift': return [{ strong: name }, { text: ' gifted a sub to ' }, { strong: p['recipient-display-name'] || p['recipient-user-name'] || 'someone' }];
    case 'submysterygift': return [{ strong: name }, { text: ' gifted ' }, { strong: plural(p['mass-gift-count'], 'sub', 'subs') }];
    case 'raid': return [{ strong: p.displayName || name }, { text: ' raided with ' }, { strong: plural(p.viewerCount, 'viewer', 'viewers') }];
    case 'viewermilestone': return [{ strong: name }, { text: ' watched ' }, { strong: plural(p.value, 'stream', 'streams') }, { text: ' in a row' }];
    case 'giftpaidupgrade': case 'anongiftpaidupgrade': case 'primepaidupgrade': return [{ strong: name }, { text: ' kept their sub going' }];
    case 'bitsbadgetier': return [{ strong: name }, { text: ' earned a ' }, { strong: plural(p.threshold, 'bit', 'bits') }, { text: ' badge' }];
    default: return system ? [{ text: system }] : [{ strong: name }];
  }
}

// Kick's other news in chat: a reward redeemed (with its text: a message with the reward's name), Kicks sent, subs and
// gifted subs, a raid (host). Heard on busy chats: RewardRedeemedEvent, KicksGifted; the others by Kick's long-used names.
function kickEvents(ev, d){
  const t = Date.now(), n = v => Number(v || 0).toLocaleString('en-US'), plural = (v, one, many) => `${n(v)} ${+v === 1 ? one : many}`;
  const event = (id, who, summary, parts = []) => ({ site: 'kick', kind: 'event', event: ev, id: String(id), t, sender: who, login: who.toLowerCase(), color: '', userId: '', badges: [], parts,
    summary, text: summary.map(x => x.text || x.strong).join('') });
  if (ev === 'RewardRedeemedEvent'){
    const who = String(d.username || 'Someone'), title = String(d.reward_title || 'a reward'), id = 'rw-' + (d.id || `${t}-${who}`);
    if (String(d.user_input || '').trim()) return { site: 'kick', kind: 'message', id, t, sender: who, login: who.toLowerCase(), color: '', userId: d.user_id ? String(d.user_id) : '', badges: [],
      parts: [{ text: String(d.user_input) }], redeem: { title, color: /^#[0-9a-f]{6}$/i.test(d.reward_background_color || '') ? d.reward_background_color : '' } };
    return event(id, who, [{ strong: who }, { text: ' redeemed ' }, { strong: title }]);
  }
  if (ev === 'KicksGifted'){
    const who = String((d.sender && d.sender.username) || 'Someone'), g = d.gift || {};
    return event(d.gift_transaction_id || 'kg-' + t, who, [{ strong: who }, { text: ' sent ' }, { strong: String(g.name || 'a gift') }, { text: ' · ' }, { strong: `${n(g.amount)} Kicks` }], d.message ? [{ text: String(d.message) }] : []);
  }
  if (ev === 'GiftedSubscriptionsEvent' || ev === 'LuckyUsersWhoGotGiftSubscriptionsEvent'){
    const who = String(d.gifter_username || 'Someone'), got = d.gifted_usernames || d.usernames || [];
    return event('gs-' + t + '-' + who, who, [{ strong: who }, { text: ' gifted ' }, { strong: plural(got.length || 1, 'sub', 'subs') }]);
  }
  if (ev === 'SubscriptionEvent' || ev === 'ChannelSubscriptionEvent'){
    const who = String(d.username || 'Someone');
    return event('sub-' + t + '-' + who, who, [{ strong: who }, { text: ' subscribed' }, ...(+d.months > 1 ? [{ text: ' · ' }, { strong: plural(d.months, 'month', 'months') }] : [])]);
  }
  if (ev === 'StreamHostEvent'){
    const who = String(d.host_username || 'Someone');
    return event('host-' + t + '-' + who, who, [{ strong: who }, { text: ' raided with ' }, { strong: plural(d.number_viewers, 'viewer', 'viewers') }], d.optional_message ? [{ text: String(d.optional_message) }] : []);
  }
  return null;
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
  // a ban, or a timeout (not permanent: its minutes), with the moderator who did it
  if (ev === 'UserBannedEvent'){
    const u = d.user && (d.user.slug || d.user.username); if (!u) return null;
    const t = Date.now(), mins = +d.duration || 0, by = d.banned_by && (d.banned_by.username || d.banned_by.slug);
    return { site: 'kick', kind: 'clear', login: String(u).toLowerCase(), t, until: d.permanent === false || mins ? t + mins * 60000 : 0, ...(by ? { by: String(by) } : {}) };
  }
  if (ev === 'UserUnbannedEvent'){
    const u = d.user && (d.user.slug || d.user.username), by = d.unbanned_by && (d.unbanned_by.username || d.unbanned_by.slug);
    return u ? { site: 'kick', kind: 'unban', login: String(u).toLowerCase(), who: String(d.user.username || u), t: Date.now(), ...(by ? { by: String(by) } : {}) } : null;
  }
  if (ev === 'ChatroomClearEvent') return { site: 'kick', kind: 'clearall', t: Date.now() };
  const kickEvent = kickEvents(ev, d);
  if (kickEvent) return kickEvent;
  // a message pinned (the whole message comes with it), or the pin taken down
  if (ev === 'PinnedMessageCreatedEvent'){ const m = d.message && kickMsg(d.message); return m ? { site: 'kick', kind: 'pin', id: m.id, msg: m, t: Date.now() } : null; }
  if (ev === 'PinnedMessageDeletedEvent') return { site: 'kick', kind: 'unpin', t: Date.now() };
  if (ev !== 'ChatMessageEvent') return null;
  return kickMsg(d);
}
// A Kick chat message (ChatMessageEvent's, or the one in a pin)
function kickMsg(d){
  if (!d || !d.id) return null;
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
  // a message pinned at the top of the chat (a banner), or taken down
  const banner = action.addBannerToLiveChatCommand && ((action.addBannerToLiveChatCommand.bannerRenderer || {}).liveChatBannerRenderer || {});
  if (banner){
    const r = banner.contents && banner.contents.liveChatTextMessageRenderer; if (!r || !banner.actionId) return null;
    const m = parseYouTube({ addChatItemAction: { item: { liveChatTextMessageRenderer: r } } });
    return m ? { site: 'youtube', kind: 'pin', id: banner.actionId, msg: m, t: Date.now() } : null;
  }
  if (action.removeBannerForLiveChatCommand) return { site: 'youtube', kind: 'unpin', id: action.removeBannerForLiveChatCommand.targetActionId || '', t: Date.now() };
  if (action.markChatItemsByAuthorAsDeletedAction) return { site: 'youtube', kind: 'clear', userId: action.markChatItemsByAuthorAsDeletedAction.externalChannelId, t: Date.now() };
  const item = action.addChatItemAction && action.addChatItemAction.item; if (!item) return null;
  const [type] = Object.keys(item), r = item[type] || {};
  if (!r.id) return null;
  const base = { site: 'youtube', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: (r.authorName && r.authorName.simpleText) || '',
    login: ((r.authorName && r.authorName.simpleText) || '').replace(/^@/, '').toLowerCase(), color: '', userId: r.authorExternalChannelId || '', badges: ytBadges(r.authorBadges) };
  if (type === 'liveChatTextMessageRenderer') return { ...base, kind: 'message', parts: ytParts(r.message && r.message.runs) };
  if (type === 'liveChatPaidMessageRenderer' || type === 'liveChatPaidStickerRenderer'){
    const amount = (r.purchaseAmountText && r.purchaseAmountText.simpleText) || '';
    const what = type === 'liveChatPaidMessageRenderer' ? 'Chat' : 'Sticker';
    return { ...base, kind: 'event', event: type === 'liveChatPaidMessageRenderer' ? 'superchat' : 'supersticker', amount, text: `${base.sender} sent a Super ${what}${amount ? ' · ' + amount : ''}`,
      summary: [{ strong: base.sender }, { text: ` Super ${what}` }, ...(amount ? [{ text: ' ' }, { strong: amount }] : [])], parts: ytParts(r.message && r.message.runs) };
  }
  if (type === 'liveChatMembershipItemRenderer'){
    const text = ytText((r.headerSubtext || {}).runs) || (r.headerSubtext && r.headerSubtext.simpleText) || `${base.sender} became a member`;
    return { ...base, kind: 'event', event: 'membership', text, summary: [{ strong: base.sender }, { text: ' ' + (/^welcome/i.test(text) ? 'became a member' : text.replace(base.sender, '').trim() || 'became a member') }], parts: ytParts(r.message && r.message.runs) };
  }
  return null;
}

// Every message in a batch from one chat ("__kmv:feed"), in order: unreadable ones left out
function parseFeed(batch){
  const fn = { twitch: parseTwitch, kick: parseKick, youtube: parseYouTube }[batch && batch.s];
  return fn && Array.isArray(batch.raw) ? batch.raw.map(r => { try { return fn(r); } catch { return null; } }).filter(Boolean) : [];
}

// (one object, so the tests can reach each site's reader)
const feedParse = { parseFeed, parseTwitch, twitchPin, twitchSummary, parseKick, kickEvents, parseYouTube, ircLine, twitchParts, kickParts, ytParts, badgeKinds };

export { feedParse };
