/* ---- Each site's chat data (in-site/feed.js) as one kind of message, for the ALL tab (chat/all-chat.js) ----
   A message: { site, kind, id, t, sender, login, color, badges: ['moderator', …], parts: [{ text } | { emote, name }],
   reply?: { id, sender, login, body }, action?, highlight?, bits?, text? (an event's own words), userId?, pics? }.
   pics: its badges as the site shows them, in its order, for their pictures: [{ set, v } (the site's badge and version,
   its picture asked for once: in-site/feed.js badgesAgent) | { url, title } (the picture came with it)].
   kind: 'message', 'event' (a sub, gift, raid, Super Chat…), 'delete' ({ target, ai?, rules? }) or 'clear' (all of
   one person's messages: { login } or { userId }). Anything it can't read is left out (null). */

// The badges ALL draws, by each site's own name for them
const BADGES = {
  broadcaster: 'host', owner: 'host', moderator: 'mod', lead_moderator: 'mod', vip: 'vip', subscriber: 'sub', founder: 'sub', member: 'sub',
  og: 'og', verified: 'verified', partner: 'verified', staff: 'staff', admin: 'staff', global_mod: 'staff', sub_gifter: 'gifter'
};
const badgeKinds = list => [...new Set(list.map(b => BADGES[String(b).toLowerCase()]).filter(Boolean))];
// Twitch's badges as set/version (its chat's badges tag, or its other connection's); a sub's months (badge-info), for
// its tooltip as Twitch's says it
const twitchPics = (list, info = '') => list.map(([set, v]) => {
  if (!set) return null;
  const months = +((new RegExp('(?:^|,)' + set + '/(\\d+)').exec(info) || [])[1]) || 0;
  return { set: String(set), v: String(v || '1'), ...(months ? { months } : {}) };
}).filter(Boolean);

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
  // the chat's modes: all of them as you join, then each one that changes (-1: off; followers-only in minutes, 0 any follower)
  if (l.cmd === 'ROOMSTATE'){
    const modes = {};
    if ('slow' in g) modes.slow = +g.slow || 0;
    if ('followers-only' in g) modes.followers = +g['followers-only'] < 0 ? null : +g['followers-only'] || 0;
    if ('subs-only' in g) modes.subs = g['subs-only'] === '1';
    if ('emote-only' in g) modes.emotes = g['emote-only'] === '1';
    return Object.keys(modes).length ? { site: 'twitch', kind: 'modes', modes, t } : null;
  }
  if (l.cmd !== 'PRIVMSG' && l.cmd !== 'USERNOTICE') return null;
  let text = l.text, action = false;
  const me = /^\u0001ACTION ([\s\S]*)\u0001$/.exec(text); if (me){ text = me[1]; action = true; }
  const login = (g.login || l.nick || '').toLowerCase();
  const msg = {
    site: 'twitch', kind: l.cmd === 'USERNOTICE' ? 'event' : 'message', id: g.id || '', t,
    sender: g['display-name'] || login, login, color: g.color || '', userId: g['user-id'] || '',
    badges: badgeKinds((g.badges || '').split(',').map(b => b.split('/')[0]).filter(Boolean)),
    pics: twitchPics((g.badges || '').split(',').filter(Boolean).map(b => b.split('/')), g['badge-info'] || ''),
    parts: twitchParts(text, g.emotes)
  };
  if (action) msg.action = true;
  if (g['msg-id'] === 'highlighted-message') msg.highlight = true;
  if (+g.bits) msg.bits = +g.bits;
  if (g['custom-reward-id']) msg.redeem = { title: '', color: '' };   // (a channel points reward with text: Twitch's chat doesn't say which)
  if (g['first-msg'] === '1') msg.first = true;
  if (g['reply-parent-msg-id']) msg.reply = { id: g['reply-parent-msg-id'], sender: g['reply-parent-display-name'] || g['reply-parent-user-login'] || '', login: (g['reply-parent-user-login'] || '').toLowerCase(), body: g['reply-parent-msg-body'] || '' };
  // (a reply's text starts with "@<who it replies to> ": Twitch's chat leaves it out, the "replying to" line says it)
  if (msg.reply && msg.parts[0] && msg.parts[0].text){
    const at = /^@(\S+)\s*/.exec(msg.parts[0].text);
    if (at && [msg.reply.login, msg.reply.sender.toLowerCase()].includes(at[1].toLowerCase())){ msg.parts[0] = { text: msg.parts[0].text.slice(at[0].length) }; if (!msg.parts[0].text) msg.parts.shift(); }
  }
  if (msg.kind === 'event'){
    msg.event = g['msg-id'] || ''; msg.text = g['system-msg'] || '';
    const prm = {}; Object.keys(g).forEach(k => { if (k.startsWith('msg-param-')) prm[k.slice(10)] = g[k]; });
    // an announcement is a message the streamer or a mod highlighted, not an event
    if (msg.event === 'announcement'){ msg.kind = 'message'; msg.announce = (prm.color || 'PRIMARY').toLowerCase(); delete msg.event; delete msg.text; }
    // a watch streak: their message, highlighted, with how many streams (as Twitch's chat shows it)
    else if (msg.event === 'viewermilestone' && prm.category === 'watch-streak' && +prm.value > 0){ msg.kind = 'message'; msg.streak = +prm.value; delete msg.event; delete msg.text; }
    else msg.summary = twitchSummary(msg.event, msg.sender, prm, msg.text);
    // gifted subs: who got them. Twitch sends the "gifted 5 subs" line, then one line for each sub, with the same gift id
    if (msg.event === 'submysterygift') msg.gift = { id: prm['community-gift-id'] || '', count: +prm['mass-gift-count'] || 0, to: [] };
    if (msg.event === 'subgift') msg.giftTo = { name: prm['recipient-display-name'] || prm['recipient-user-name'] || '', login: (prm['recipient-user-name'] || '').toLowerCase(), group: prm['community-gift-id'] || '' };
  }
  return msg;
}

// A Twitch hype train as ALL's strip shows it: { kind: 'hype', state ('start', 'progression', 'level-up', 'end'), id, level,
// value and goal (towards the next level), expires (when it runs out, ms), golden (a Golden Kappa train) }. Its start
// (and Twitch's GraphQL hypeTrain.execution, the train already running: in-site/feed.js hypeAgent) say it as
// { progress: { progression, goal, level: { value } }, expiresAt }; its other news is read the same way, or as Twitch's
// older names (progress.value, remaining_seconds), as they come. null: nothing to show.
function hypeTrain(state, d){
  if (!d || typeof d !== 'object') return null;
  const id = String(d.id || d.execution_id || (d.progress && d.progress.id) || '').replace(/-(SUBS|BITS|[A-Z_]+)$/, '');
  if (!id) return null;
  if (state === 'end' || d.endedAt) return { site: 'twitch', kind: 'hype', state: 'end', id, t: Date.now() };
  const pr = d.progress || d, lv = pr.level || d.level || {}, level = +(typeof lv === 'object' ? lv.value : lv) || 0;
  const value = +(pr.progression ?? pr.value) || 0, goal = +pr.goal || 0;
  const secs = +(pr.remaining_seconds ?? d.remaining_seconds) || 0;
  const expires = Date.parse(d.expiresAt || d.expires_at || pr.expiresAt || '') || (secs ? Date.now() + secs * 1000 : 0);
  if (!level && !goal) return null;
  return { site: 'twitch', kind: 'hype', state, id, t: Date.now(), level: Math.max(1, level), value: Math.max(0, value), goal, expires, golden: !!(d.isGoldenKappaTrain || d.is_golden_kappa_train) };
}

// Twitch's other connection (hermes): a message pinned (the whole message with it) or taken down
function twitchPin(frame){
  let p;
  try { p = JSON.parse(JSON.parse(frame).notification.pubsub); } catch { return null; }
  // what a moderator did, and who (Twitch sends it to moderators only): a timeout, ban, deleted message, cleared chat, a mode
  if (p && p.type === 'moderation_action'){
    const d = p.data || {}, a = String(d.moderation_action || ''), args = Array.isArray(d.args) ? d.args.map(String) : [];
    if (!a || !d.created_by) return null;
    const target = String(d.target_user_login || (/^(timeout|ban|delete|untimeout|unban)$/.test(a) ? args[0] || '' : '')).toLowerCase();
    return { site: 'twitch', kind: 'modaction', action: a, by: String(d.created_by), target, t: Date.now(),
      secs: a === 'timeout' ? +args[1] || 0 : 0, msgId: a === 'delete' ? String(d.msg_id || args[2] || '') : '', arg: /^(slow|followers)$/.test(a) ? +args[0] || 0 : 0 };
  }
  // a channel points reward redeemed without text (one with text is a chat message, with its reward: PRIVMSG)
  if (p && p.type === 'reward-redeemed'){
    const r = (p.data && p.data.redemption) || {}, u = r.user || {}, rw = r.reward || {};
    if (!r.id || r.user_input || !rw.title) return null;
    const who = String(u.display_name || u.login || 'Someone');
    return { site: 'twitch', kind: 'event', event: 'reward', id: 'rw-' + r.id, t: Date.parse(r.redeemed_at) || Date.now(), sender: who, login: String(u.login || '').toLowerCase(), color: '', userId: u.id ? String(u.id) : '',
      badges: [], parts: [], summary: [{ strong: who }, { text: ' redeemed ' }, { strong: String(rw.title) }], text: `${who} redeemed ${rw.title}`,
      redeem: { title: String(rw.title), color: /^#[0-9a-f]{6}$/i.test(rw.background_color || '') ? rw.background_color : '' } };
  }
  // a shoutout: the streamer or a moderator points the chat to another channel
  if (p && p.type === 'create' && p.data && p.data.shoutoutID && p.data.targetLogin){
    const d = p.data, to = String(d.targetUserDisplayName || d.targetLogin), by = String(d.sourceLogin || '');
    return { site: 'twitch', kind: 'event', event: 'shoutout', id: 'so-' + d.shoutoutID, t: Date.now(), sender: by, login: by.toLowerCase(), color: '', userId: '', badges: [], parts: [],
      summary: [{ strong: by || 'They' }, { text: ' shouted out ' }, { strong: to }], text: `${by || 'They'} shouted out ${to}`, shoutout: 'tw:' + String(d.targetLogin).toLowerCase() };
  }
  // a raid the channel is getting ready: Twitch's countdown, sent again as viewers join it (raid_update_v2), then the raid
  // going (raid_go_v2: now, or Twitch sends it on its own at raid_created_at + force_raid_now_seconds) or called off
  // (raid_cancel_v2: not heard yet, taken to carry the same raid). One raid id for all of them: ALL's one line for it.
  const rs = p && /^raid_(update|go|cancel)_v2$/.exec(p.type || '');
  if (rs){
    const r = p.raid || {}, at = +r.raid_created_at > 0 ? (+r.raid_created_at + (+r.force_raid_now_seconds || 0)) * 1000 : 0;
    if (!r.id || !r.target_login) return null;
    return { site: 'twitch', kind: 'raid', state: rs[1], id: 'rd-' + r.id, t: Date.now(), to: 'tw:' + String(r.target_login).toLowerCase(), viewers: +r.viewer_count || 0, at };
  }
  // a goal of the channel's reached (followers, subs…: its progress is the goal bar's, left out)
  if (p && p.type === 'goal_achieved' && p.data && p.data.goal && p.data.goal.id){
    const g = p.data.goal, what = GOAL_KINDS[String(g.contributionType || '').toUpperCase()] || '', n = Number(g.currentContributions || g.targetContributions || 0);
    const summary = [{ strong: what ? `${what} goal` : 'Goal' }, { text: ' reached' }, ...(n > 0 ? [{ text: ' · ' }, { strong: n.toLocaleString('en-US') }] : [])];
    return { site: 'twitch', kind: 'event', event: 'goal', id: `goal-${g.id}-${+g.targetContributions || 0}`, t: Date.now(), sender: '', login: '', color: '', userId: '', badges: [],
      parts: String(g.description || '').trim() ? [{ text: String(g.description).trim() }] : [], summary, text: summary.map(x => x.text || x.strong).join('') };
  }
  // the hype train: started, moving along, a level up, ended (its conductors and rewards: left out)
  const ht = p && /^hype-train-(start|progression|level-up|end)$/.exec(p.type || '');
  if (ht) return hypeTrain(ht[1], p.data);
  // (and the chat's modes, all of them, as a moderator changes one)
  if (p && p.type === 'updated_room'){
    const r = (p.data && p.data.room && p.data.room.modes) || null; if (!r) return null;
    return { site: 'twitch', kind: 'modes', t: Date.now(), modes: { slow: +r.slow_mode_duration_seconds || 0, followers: r.followers_only_duration_minutes == null ? null : +r.followers_only_duration_minutes,
      subs: !!r.subscribers_only_mode_enabled, emotes: !!r.emote_only_mode_enabled, verified: !!r.verified_only_mode_enabled } };
  }
  // your own message held by AutoMod (Twitch tells only you, by its id): waiting for a moderator, then ALLOWED or DENIED.
  // (Moderators get the same kind with the whole message in it, for their queue: not read yet, #221.)
  if (p && p.type === 'automod_caught_message'){
    const a = p.data || {}; if (!a.message_id || !a.status || a.message) return null;
    return { site: 'twitch', kind: 'automod', msgId: String(a.message_id), status: String(a.status).toUpperCase(), t: Date.now() };
  }
  // Twitch's marks on a message, to moderators (chat highlights): a raider's (how long since the raid), and the like
  if (p && p.type === 'chat-highlight'){
    const h = p.data || {}, marks = (Array.isArray(h.highlights) ? h.highlights : []).filter(x => x && x.type).map(x => ({ type: String(x.type), secs: +x.seconds_since_event || 0 }));
    if (!h.msg_id || !marks.length) return null;
    return { site: 'twitch', kind: 'marks', msgId: String(h.msg_id), marks, t: Date.now() };
  }
  const d = p && p.data; if (!d || !d.id) return null;
  if (p.type === 'unpin-message') return { site: 'twitch', kind: 'unpin', id: String(d.id), t: Date.now() };
  if (p.type !== 'pin-message' || !d.message || !d.message.id) return null;
  const m = d.message, s = m.sender || {}, c = m.content || {};
  const parts = Array.isArray(c.fragments) && c.fragments.length
    ? c.fragments.map(f => f && f.emoticon && f.emoticon.emoticonID ? { emote: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(f.emoticon.emoticonID)}/default/dark/1.0`, name: f.text || '' } : { text: String((f && f.text) || '') })
    : [{ text: String(c.text || '') }];
  const msg = { site: 'twitch', kind: 'message', id: String(m.id), t: (+m.sent_at || 0) * 1000 || Date.now(), sender: s.display_name || s.login || '', login: String(s.login || '').toLowerCase(),
    color: s.chat_color || '', userId: s.id ? String(s.id) : '', badges: badgeKinds((s.badges || []).map(b => b && b.id)), pics: twitchPics((s.badges || []).map(b => [b && b.id, b && b.version])), parts };
  return { site: 'twitch', kind: 'pin', id: String(d.id), msg, t: Date.now(), by: (d.pinned_by && d.pinned_by.display_name) || '' };
}

// A goal's kind (contributionType), as Twitch's goal bar names it
const GOAL_KINDS = { FOLLOWERS: 'Follower', NEW_FOLLOWERS: 'Follower', SUBS: 'Sub', NEW_SUBS: 'New sub', SUB_POINTS: 'Sub point', NEW_SUB_POINTS: 'New sub point', BITS: 'Bits' };

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
    // (they got a gift sub from the community and gave one on: who gave them theirs)
    case 'communitypayforward': return p['prior-gifter-anonymous'] === 'true' ? [{ strong: name }, { text: ' paid forward an anonymous gift sub' }]
      : [{ strong: name }, { text: ' paid forward the gift sub from ' }, { strong: p['prior-gifter-display-name'] || p['prior-gifter-user-name'] || 'someone' }];
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
    const who = String(d.gifter_username || 'Someone'), got = (Array.isArray(d.gifted_usernames) ? d.gifted_usernames : Array.isArray(d.usernames) ? d.usernames : []).map(String);
    return { ...event('gs-' + t + '-' + who, who, [{ strong: who }, { text: ' gifted ' }, { strong: plural(got.length || 1, 'sub', 'subs') }]),
      gift: { id: String(d.correlation_id || ''), count: got.length, to: got.map(u => ({ name: u, login: u.toLowerCase() })) } };
  }
  // Kick sends one sub as both (on the chat's subscription and the channel's), within a moment: one line, by who (within
  // 5 minutes), whichever comes first
  if (ev === 'SubscriptionEvent' || ev === 'ChannelSubscriptionEvent'){
    const who = String(d.username || 'Someone');
    return event('sub-' + who.toLowerCase() + '-' + Math.floor(t / 300000), who, [{ strong: who }, { text: ' subscribed' }, ...(+d.months > 1 ? [{ text: ' · ' }, { strong: plural(d.months, 'month', 'months') }] : [])]);
  }
  // a raid coming in: StreamHostedEvent on the raided channel's chat, StreamHostEvent on its other subscription (both come,
  // in their own shapes): one line for the raid, by who raided (within 10 minutes), whichever comes first
  if (ev === 'StreamHostedEvent' || ev === 'StreamHostEvent'){
    const m = d.message || {}, who = String((d.user && d.user.username) || d.host_username || 'Someone'), said = m.optionalMessage || d.optional_message;
    return event('host-' + who.toLowerCase() + '-' + Math.floor(t / 600000), who, [{ strong: who }, { text: ' raided with ' }, { strong: plural(m.numberOfViewers ?? d.number_viewers, 'viewer', 'viewers') }], said ? [{ text: String(said) }] : []);
  }
  return null;
}
// A raid going out: Kick moves the raiding channel's chat to the one it raids (ChatMoveToSupportedChannelEvent, on its
// channel.<id> subscription), with the viewers it took. As Twitch's raid going (raid_go_v2): ALL's one line for it.
function kickRaid(d){
  const to = d.hosted && (d.hosted.slug || d.hosted.username); if (!to) return null;
  const t = Date.now(), ls = (d.channel && d.channel.current_livestream) || {};
  return { site: 'kick', kind: 'raid', state: 'go', id: `rd-${String(to).toLowerCase()}-${t}`, t, to: String(to).toLowerCase(), viewers: +ls.viewer_count || 0, at: 0 };
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
  // the chat's modes, all of them, as a moderator changes one
  if (ev === 'ChatroomUpdatedEvent'){
    const on = x => !!(x && x.enabled);
    return { site: 'kick', kind: 'modes', t: Date.now(), modes: { slow: on(d.slow_mode) ? +d.slow_mode.message_interval || 0 : 0, followers: on(d.followers_mode) ? +d.followers_mode.min_duration || 0 : null,
      subs: on(d.subscribers_mode), emotes: on(d.emotes_mode), verified: false } };
  }
  // a poll: its votes as they come (each as a share, and how many), the time left, then its results for as long as Kick
  // shows them; deleted. (One at a time in a chat: its id is Kick's own.)
  if (ev === 'PollUpdateEvent'){
    const pl = d.poll || {}, opts = Array.isArray(pl.options) ? pl.options : [], total = opts.reduce((n, o) => n + (+(o && o.votes) || 0), 0);
    const choices = opts.map(o => ({ text: String((o && o.label) || '').trim(), ratio: total ? (+o.votes || 0) / total : 0 })).filter(c => c.text);
    if (!choices.length) return null;
    const left = Math.max(0, +pl.remaining || 0), now = Date.now();
    return { site: 'kick', kind: 'poll', state: 'update', id: 'kick', t: now, question: String(pl.title || '').trim(), meta: `${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`, choices,
      ends: now + left * 1000, until: now + (left + Math.max(0, +pl.result_display_duration || 0)) * 1000 };
  }
  if (ev === 'PollDeleteEvent') return { site: 'kick', kind: 'poll', state: 'close', id: 'kick', t: Date.now() };
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
  if (ev === 'PinnedMessageCreatedEvent'){ const m = d.message && kickMsg(d.message); return m ? { site: 'kick', kind: 'pin', id: m.id, msg: m, t: Date.now(), by: (d.pinned_by && d.pinned_by.username) || '' } : null; }
  if (ev === 'PinnedMessageDeletedEvent') return { site: 'kick', kind: 'unpin', t: Date.now() };
  if (ev === 'ChatMoveToSupportedChannelEvent') return kickRaid(d);
  if (ev !== 'ChatMessageEvent') return null;
  return d.type === 'celebration' ? kickCelebration(d) : kickMsg(d);
}
// A celebration shared with a message (a resub: "subscribed · 16 months"): an event with the message, as Twitch's resub
// with a message is. One of a kind ALL doesn't know: the message as usual.
function kickCelebration(d){
  const m = kickMsg(d), c = (d.metadata && d.metadata.celebration) || {};
  if (!m || c.type !== 'subscription_renewed') return m;
  const months = +c.total_months || 0, n = months > 1 ? [{ text: ' · ' }, { strong: `${months.toLocaleString('en-US')} months` }] : [];
  const summary = [{ strong: m.sender || 'Someone' }, { text: ' subscribed' }, ...n];
  return { ...m, kind: 'event', event: 'resub', summary, text: summary.map(x => x.text || x.strong).join('') };
}
// Kick's badges as its chat shows them, picked as its chat picks them: its own (a role, OG, founder, sub gifter, the
// channel's sub badge by months: its icons, named as Kick names them) and badges_v2's (a level, a game's: their
// pictures), less any taken off (active or selected false), in its order (sort_order; one without it last), and only the
// first KICK_BADGE_MAX of them: a badge after those isn't shown in Kick's chat (a sub badge behind 4 others)
const KICK_BADGE_MAX = 4;
function kickPics(idy){
  const order = b => (b.sort_order == null || !Number.isFinite(+b.sort_order) ? Infinity : +b.sort_order);
  const own = (idy.badges || []).filter(b => b && b.type && b.active !== false).map(b => ({ o: order(b),
    p: { set: String(b.type), v: String(+b.count || 1), ...(b.type !== 'subscriber' && b.text ? { title: String(b.text) } : {}) } }));
  const picked = (idy.badges_v2 || []).filter(b => b && b.selected !== false).map(b => ({ o: order(b),
    p: /^https:\/\//.test(b.image_url || '') ? { url: b.image_url, ...(b.name === 'level' && b.metadata && b.metadata.level ? { title: `Level ${b.metadata.level}`, icon: `Level${b.metadata.level}` } : { title: String(b.name) }) } : null }));   // (icon: Kick's own for it, if ALL has it)
  return [...own, ...picked].sort((a, b) => (a.o === b.o ? 0 : a.o - b.o)).slice(0, KICK_BADGE_MAX).map(x => x.p).filter(Boolean);
}
// A Kick chat message (ChatMessageEvent's, or the one in a pin)
function kickMsg(d){
  if (!d || !d.id) return null;
  const s = d.sender || {}, idy = s.identity || {};
  const msg = {
    site: 'kick', kind: 'message', id: d.id, t: Date.parse(d.created_at) || Date.now(),
    sender: s.username || '', login: String(s.slug || s.username || '').toLowerCase(), color: idy.color || '', userId: s.id ? String(s.id) : '',
    badges: badgeKinds((idy.badges || []).map(b => b && b.type)), pics: kickPics(idy), parts: kickParts(d.content)
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
// YouTube's: a member's badge is the channel's own picture; its others (owner, moderator, verified) are its icons
function ytPics(list){
  return (list || []).map(b => {
    const r = b.liveChatAuthorBadgeRenderer || {}, type = r.icon && r.icon.iconType, th = r.customThumbnail && r.customThumbnail.thumbnails;
    if (type) return { set: type.toLowerCase(), v: '1' };
    const url = th && th.length && th[th.length - 1].url;
    return url ? { url, title: (r.tooltip || r.accessibility && r.accessibility.accessibilityData && r.accessibility.accessibilityData.label || 'Member') } : null;
  }).filter(Boolean);
}
// A YouTube poll: { kind: 'poll', state ('open', 'update'), id, question, meta (its "who · how many votes" line),
// choices: [{ text, ratio (0 to 1: of the votes, 0 before any) }] }
const ytWords = t => (t && (t.simpleText || ytText(Array.isArray(t.runs) ? t.runs : []))) || '';   // (a text YouTube gives as simpleText or runs)
function ytPoll(p, state){
  const h = (p.header && p.header.pollHeaderRenderer) || {}, id = String(p.liveChatPollId || '');
  const choices = (Array.isArray(p.choices) ? p.choices : []).map(c => ({ text: ytWords(c && c.text).trim(), ratio: Math.min(1, Math.max(0, +(c && c.voteRatio) || 0)) })).filter(c => c.text);
  if (!id || !choices.length) return null;
  return { site: 'youtube', kind: 'poll', state, id, t: Date.now(), question: ytWords(h.pollQuestion).trim(), meta: ytWords(h.metadataText).replace(/\s+/g, ' ').trim(), choices };
}
function parseYouTube(action){
  if (!action || typeof action !== 'object') return null;
  // a message deleted: taken away, or marked deleted ("Message deleted" where it was)
  const del = action.removeChatItemAction || action.markChatItemAsDeletedAction;
  if (del) return del.targetItemId ? { site: 'youtube', kind: 'delete', target: del.targetItemId, t: Date.now() } : null;
  // a message pinned at the top of the chat (a banner), or taken down
  const banner = action.addBannerToLiveChatCommand && ((action.addBannerToLiveChatCommand.bannerRenderer || {}).liveChatBannerRenderer || {});
  if (banner){
    const r = banner.contents && banner.contents.liveChatTextMessageRenderer; if (!r || !banner.actionId) return null;
    const m = parseYouTube({ addChatItemAction: { item: { liveChatTextMessageRenderer: r } } });
    return m ? { site: 'youtube', kind: 'pin', id: banner.actionId, msg: m, t: Date.now() } : null;
  }
  if (action.removeBannerForLiveChatCommand) return { site: 'youtube', kind: 'unpin', id: action.removeBannerForLiveChatCommand.targetActionId || '', t: Date.now() };
  if (action.markChatItemsByAuthorAsDeletedAction) return { site: 'youtube', kind: 'clear', userId: action.markChatItemsByAuthorAsDeletedAction.externalChannelId, t: Date.now() };
  // all of someone's messages taken away (YouTube hides them, or a moderator removed them): as a ban here
  if (action.removeChatItemByAuthorAction) return action.removeChatItemByAuthorAction.externalChannelId ? { site: 'youtube', kind: 'clear', userId: String(action.removeChatItemByAuthorAction.externalChannelId), t: Date.now() } : null;
  // a poll: opened over the chat, its votes as they come, closed
  const poll = (action.showLiveChatActionPanelAction && (((action.showLiveChatActionPanelAction.panelToShow || {}).liveChatActionPanelRenderer || {}).contents || {}).pollRenderer)
    || (action.updateLiveChatPollAction && (action.updateLiveChatPollAction.pollToUpdate || {}).pollRenderer);
  if (poll) return ytPoll(poll, action.showLiveChatActionPanelAction ? 'open' : 'update');
  if (action.closeLiveChatActionPanelAction) return action.closeLiveChatActionPanelAction.targetPanelId ? { site: 'youtube', kind: 'poll', state: 'close', id: String(action.closeLiveChatActionPanelAction.targetPanelId), t: Date.now() } : null;
  // (a message YouTube held back, let through: it takes the place of its stand-in, which ALL leaves out; as the
  // stand-in's id, so one already here isn't shown twice)
  const put = action.replaceChatItemAction, item = (action.addChatItemAction && action.addChatItemAction.item) || (put && put.replacementItem); if (!item) return null;
  const [type] = Object.keys(item), r = put && put.targetItemId ? { ...item[type], id: put.targetItemId } : item[type] || {};
  if (!r.id) return null;
  // a gift (YouTube's Jewels gifts): its own words ("sent …"), the gift picked out
  if (type === 'giftMessageViewModel'){
    const who = String((r.authorName && r.authorName.content) || '').trim() || 'Someone', said = String((r.text && r.text.content) || '').trim() || 'sent a gift', what = /^sent (.+)$/i.exec(said);
    return { site: 'youtube', kind: 'event', event: 'gift', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: who, login: who.replace(/^@/, '').toLowerCase(), color: '', userId: '',
      badges: [], pics: [], text: `${who} ${said}`, summary: [{ strong: who }, ...(what ? [{ text: ' sent ' }, { strong: what[1] }] : [{ text: ' ' + said }])], parts: [] };
  }
  const base = { site: 'youtube', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: (r.authorName && r.authorName.simpleText) || '',
    login: ((r.authorName && r.authorName.simpleText) || '').replace(/^@/, '').toLowerCase(), color: '', userId: r.authorExternalChannelId || '', badges: ytBadges(r.authorBadges), pics: ytPics(r.authorBadges) };
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

// What ALL does with each kind of event, named as the chats' readers count them (in-site/feed.js), for Settings ›
// Developer › Chat events: a kind here that hasn't come yet is one ALL still needs; one that came and isn't here, ALL
// doesn't know. A new kind ALL reads goes here too.
const KNOWN = {
  kick: { ChatMessageEvent: 'a message', 'ChatMessageEvent:reply': 'a reply', MessageDeletedEvent: 'a message deleted', UserBannedEvent: 'a ban or timeout',
    UserUnbannedEvent: 'a ban lifted', ChatroomClearEvent: 'the chat cleared', RewardRedeemedEvent: 'a reward redeemed', KicksGifted: 'Kicks sent',
    GiftedSubscriptionsEvent: 'gifted subs', LuckyUsersWhoGotGiftSubscriptionsEvent: 'gifted subs', SubscriptionEvent: 'a sub', ChannelSubscriptionEvent: 'a sub',
    StreamHostedEvent: 'a raid coming in', StreamHostEvent: 'a raid coming in (on its other subscription)', ChatMoveToSupportedChannelEvent: 'a raid going out (its line: Open)', 'ChatMessageEvent:celebration': 'a resub shared with a message',
    PinnedMessageCreatedEvent: 'a pin', PinnedMessageDeletedEvent: 'a pin taken down', ChatroomUpdatedEvent: 'the chat’s modes (above the box)',
    PollUpdateEvent: 'a poll and its votes (its card over ALL)', PollDeleteEvent: 'a poll deleted (its card goes)' },
  twitch: { PRIVMSG: 'a message', 'PRIVMSG:reply': 'a reply', 'PRIVMSG:bits': 'a cheer', 'PRIVMSG:reward': 'a reward redeemed', 'PRIVMSG:highlighted-message': 'a highlighted message',
    'USERNOTICE:sub': 'a sub', 'USERNOTICE:resub': 'a resub', 'USERNOTICE:subgift': 'a gifted sub', 'USERNOTICE:submysterygift': 'gifted subs', 'USERNOTICE:raid': 'a raid',
    'USERNOTICE:announcement': 'an announcement', 'USERNOTICE:viewermilestone': 'a watch streak', 'USERNOTICE:giftpaidupgrade': 'a gifted sub kept going',
    'USERNOTICE:primepaidupgrade': 'a Prime sub kept going', 'USERNOTICE:bitsbadgetier': 'a bits badge', 'USERNOTICE:communitypayforward': 'a gift sub paid forward', 'USERNOTICE:sharedchatnotice': 'another channel’s sub, gift or raid in a shared chat (as Twitch words it)', CLEARMSG: 'a message deleted', 'CLEARCHAT:timeout': 'a timeout',
    'CLEARCHAT:ban': 'a ban', 'CLEARCHAT:all': 'the chat cleared', 'hermes:pin-message': 'a pin', 'hermes:unpin-message': 'a pin taken down', ROOMSTATE: 'the chat’s modes (above the box)', 'hermes:updated_room': 'the chat’s modes (above the box)', 'hermes:moderation_action': 'who a moderator was (to moderators)',
    'hermes:reward-redeemed': 'a reward redeemed (without text)', 'hermes:create': 'a shoutout',
    'hermes:raid_update_v2': 'a raid getting ready (one line, counting down)', 'hermes:raid_go_v2': 'a raid going (its line: Open)', 'hermes:raid_cancel_v2': 'a raid called off (its line says so)',
    'hermes:goal_achieved': 'a goal reached (its progress: hermes:goal_updated)', 'hermes:hype-train-start': 'a hype train (its strip over ALL)',
    'hermes:hype-train-progression': 'a hype train moving along (its strip)', 'hermes:hype-train-level-up': 'a hype train’s new level (its strip)', 'hermes:hype-train-end': 'a hype train ending (its strip)',
    'hermes:automod_caught_message': 'your message held by AutoMod (your line says so, then sent or not; a moderator’s queue of held messages: not yet)', 'hermes:chat-highlight': 'Twitch’s marks on a message, to moderators (a raider’s: a tag on its line)' },
  youtube: { 'addChatItemAction:liveChatTextMessageRenderer': 'a message', 'addChatItemAction:liveChatPaidMessageRenderer': 'a Super Chat',
    'addChatItemAction:liveChatPaidStickerRenderer': 'a Super Sticker', 'addChatItemAction:liveChatMembershipItemRenderer': 'a membership',
    'addChatItemAction:giftMessageViewModel': 'a gift', 'replaceChatItemAction:liveChatTextMessageRenderer': 'a held message let through',
    removeChatItemAction: 'a message deleted', markChatItemAsDeletedAction: 'a message deleted (marked)', markChatItemsByAuthorAsDeletedAction: 'a ban or timeout',
    removeChatItemByAuthorAction: 'all of someone’s messages taken away (as a ban)', 'showLiveChatActionPanelAction': 'a poll opened (its card over ALL)', updateLiveChatPollAction: 'a poll’s votes (its card)',
    closeLiveChatActionPanelAction: 'a poll closed (its card goes)',
    'addBannerToLiveChatCommand:liveChatBannerRenderer': 'a pin', removeBannerForLiveChatCommand: 'a pin taken down' }
};

// Kinds ALL hears and leaves out on purpose, and why (Settings › Developer › Chat events lists them as Ignored, not
// unknown): the connections' own housekeeping, news only for you (your points), and the sites' panels (goals,
// leaderboards). One the sites start sending that ALL has no use for goes here.
const IGNORED = {
  kick: { PointsUpdated: 'your channel points', GoalProgressUpdateEvent: 'the channel’s goal bar', GiftsLeaderboardUpdated: 'the gift leaderboard',
    KicksLeaderboardUpdated: 'the Kicks leaderboard', NewSubscriberUpdatedEvent: 'the sub count (ChannelSubscriptionEvent is the sub)',
    NewActivityFeedEvent: 'the activity feed (the same subs and follows)', StopStreamBroadcast: 'the stream ending', StreamerIsLive: 'the stream starting',
    GamificationWatchTimeGoalReached: 'your watch-time goal', PredictionUpdated: 'a prediction (Kick’s own panel)', PredictionCreated: 'a prediction (Kick’s own panel)',
    KicksBalanceUpdated: 'your own Kicks balance (on your private channel)', ChatMessageSentEvent: 'a sub as a line in Kick’s chat (the same sub: SubscriptionEvent)' },
  twitch: { CAP: 'the connection’s own', JOIN: 'the connection’s own', PART: 'the connection’s own', GLOBALUSERSTATE: 'the connection’s own (you)', USERSTATE: 'the connection’s own (you)',
    RECONNECT: 'the connection’s own', 'hermes:welcome': 'the connection’s own', 'hermes:authenticateResponse': 'the connection’s own',
    'hermes:subscribeResponse': 'the connection’s own', 'hermes:unsubscribeResponse': 'the connection’s own', 'hermes:reconnect': 'the connection’s own',
    'hermes:points-earned': 'your channel points', 'hermes:claim-available': 'your bonus points', 'hermes:clips-leaderboard-update': 'the clips leaderboard',
    'hermes:viewcount': 'the viewer count',
    'hermes:drop-progress': 'your drops’ progress', 'hermes:claim-claimed': 'your bonus points, claimed', 'hermes:commercial': 'an ad break (Twitch’s own)',
    'hermes:viewer-milestones-update': 'your own watch streak (others’: USERNOTICE:viewermilestone)', 'hermes:watch-streak': 'your own watch streak', 'hermes:streak-recovered': 'your own watch streak',
    'hermes:send-private-callout': 'a note only for you (to share your streak)', 'hermes:goal_updated': 'the channel’s goal bar', 'hermes:goal_created': 'the channel’s goal bar (a new goal)', 'hermes:goal_finished': 'the channel’s goal bar (a goal ended; reached: hermes:goal_achieved)',
    'hermes:collaboration-status-none': 'streaming together (Twitch’s own panel)', 'hermes:stream-down': 'the stream ending (the live check says so)', 'hermes:custom-reward-updated': 'the channel’s rewards list',
    'hermes:active-multipliers-updated': 'your points multipliers', 'hermes:broadcast_settings_update': 'the stream’s title and category (on its window)',
    'hermes:ads-schedule-update': 'ad breaks (Twitch’s own)', 'hermes:points-spent': 'your channel points',
    'hermes:channel-last-viewed-content-updated': 'what you last watched', 'hermes:global-last-viewed-content-updated': 'what you last watched',
    'hermes:mystery-gift-purchase': 'gifted subs being bought (the gift is USERNOTICE:submysterygift)',
    'hermes:update-message': 'a message edited (it carries only the message’s id, not its new words)', 'hermes:?': 'the connection’s own (no type)',
    'hermes:extension_message': 'an extension’s own message (its panel in Twitch’s chat)',
    'hermes:stream-up': 'the stream starting (the live check says so)', 'hermes:favorite-channel-update': 'streaming together (Twitch’s own panel)', 'hermes:collaboration-status-refetch': 'streaming together (Twitch’s own panel)',
 'hermes:chat_rich_embed': 'a link’s preview card (the link is in its message)',
    ...Object.fromEntries(['slow_on', 'slow_off', 'followers_on', 'followers_on_zero', 'followers_off', 'subs_on', 'subs_off', 'emote_only_on', 'emote_only_off', 'r9k_on', 'r9k_off']
      .map(n => ['NOTICE:' + n, 'the chat’s modes (shown above the box)'])) },
  youtube: { 'addChatItemAction:liveChatPlaceholderItemRenderer': 'an empty stand-in for a message YouTube holds back (for review; let through, replaceChatItemAction brings it)',
    'addChatItemAction:liveChatViewerEngagementMessageRenderer': 'YouTube’s own notice (welcome, guard your privacy)',
    liveChatReportPresenceCommand: 'YouTube’s own (that you’re in the chat)', liveChatReportModerationStateCommand: 'YouTube’s own (moderation state)', elementsCommand: 'YouTube’s own (parts of its page)',
    addInteractivityWidgetAction: 'YouTube’s floating note of who sent a gift (the gift is its own line)', updateOrAddInteractivityWidgetAction: 'YouTube’s floating note of who sent a gift (the gift is its own line)',
    'replaceChatItemAction:liveChatPlaceholderItemRenderer': 'a stand-in for a held message, replaced by another (the message, let through, comes on its own)' }
};
// Why ALL leaves a kind out, or '' (Twitch's numbered replies are the connection's own too, and its hype train's other news)
const ignoredWhy = (site, kind) => (IGNORED[site] && IGNORED[site][kind]) || (site === 'twitch' && /^\d{3}$/.test(kind) ? 'the connection’s own'
  : site === 'twitch' && /^hermes:hype-train-/.test(kind) && !KNOWN.twitch[kind] ? 'the hype train’s conductors and rewards (Twitch’s own panel)' : site === 'kick' && /^pusher(_internal)?:/.test(kind) ? 'the connection’s own' : site === 'youtube' && /^addLiveChatTickerItemAction:/.test(kind) ? 'the ticker at the top (its Super Chat or membership is its own line)' : '');
// A YouTube action's kind, as its reader counts it (in-site/feed.js's ytKind)
const ytKind = a => { const k = Object.keys(a || {}).find(x => x !== 'clickTrackingParams') || ''; const v = a && a[k] || {}, it = v.item || v.replacementItem || v.bannerRenderer;
  return k + (it ? ':' + (Object.keys(it)[0] || '') : ''); };
// Whether ALL leaves out something a chat handed over on purpose (not one it couldn't read): YouTube's reader passes on
// every action, the ones ALL ignores too (the others' leave those out)
const leftOut = (site, raw) => site === 'youtube' && !!raw && typeof raw === 'object' && !!ignoredWhy(site, ytKind(raw));
// The kinds heard (samples: { site: { kind: … } }) that ALL leaves out on purpose: { site: { kind: why } }, for the
// chat events' export and ALL's report
const ignoredKinds = samples => Object.fromEntries(Object.keys(KNOWN).map(s => [s, Object.fromEntries(Object.keys((samples && samples[s]) || {})
  .filter(k => !KNOWN[s][k] && ignoredWhy(s, k)).map(k => [k, ignoredWhy(s, k)]))]));

// (one object, so the tests can reach each site's reader)
const feedParse = { KNOWN, IGNORED, ignoredWhy, ignoredKinds, leftOut, parseFeed, parseTwitch, twitchPin, hypeTrain, twitchSummary, parseKick, kickEvents, kickRaid, kickCelebration, parseYouTube, ircLine, twitchParts, kickParts, ytParts, badgeKinds, kickPics, ytPics, BADGES };

export { feedParse };
