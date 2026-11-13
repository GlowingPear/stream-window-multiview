import { badgeKinds } from '../../chat/feed-badges.js';

/* ---- Kick's chat data (its in-site/feed tap) as ALL's messages (chat/feed-parse.js says what a message is) ----
   The events of its live connection (Pusher). Nothing here touches the page (the unit tests load it on its own). */
// Kick's other news in chat: a reward redeemed (with its text: a message with the reward's name), Kicks sent, subs and
// gifted subs, a raid (host). The text a viewer adds has its emotes, as a message's does. Heard on busy chats: RewardRedeemedEvent, KicksGifted; the others by Kick's long-used names.
function kickEvents(ev, d){
  const t = Date.now(), n = v => Number(v || 0).toLocaleString('en-US'), plural = (v, one, many) => `${n(v)} ${+v === 1 ? one : many}`;
  // (login: from the name, which isn't always the channel's address on Kick: named says so, for a shoutout's link)
  const event = (id, who, summary, parts = []) => ({ site: 'kick', kind: 'event', event: ev, id: String(id), t, sender: who, login: who.toLowerCase(), named: true, color: '', userId: '', badges: [], parts,
    summary, text: summary.map(x => x.text || x.strong).join('') });
  if (ev === 'RewardRedeemedEvent'){
    const who = String(d.username || 'Someone'), title = String(d.reward_title || 'a reward'), id = 'rw-' + (d.id || `${t}-${who}`);
    if (String(d.user_input || '').trim()) return { site: 'kick', kind: 'message', id, t, sender: who, login: who.toLowerCase(), named: true, color: '', userId: d.user_id ? String(d.user_id) : '', badges: [],
      parts: kickParts(d.user_input), redeem: { title, color: /^#[0-9a-f]{6}$/i.test(d.reward_background_color || '') ? d.reward_background_color : '' } };
    return event(id, who, [{ strong: who }, { text: ' redeemed ' }, { strong: title }]);
  }
  if (ev === 'KicksGifted'){
    const who = String((d.sender && d.sender.username) || 'Someone'), g = d.gift || {};
    return { ...event(d.gift_transaction_id || 'kg-' + t, who, [{ strong: who }, { text: ' sent ' }, { strong: String(g.name || 'a gift') }, { text: ' · ' }, { strong: `${n(g.amount)} Kicks` }], d.message ? kickParts(d.message) : []),
      support: { kind: 'kicks', who, n: Math.max(1, +g.amount || 1) } };
  }
  if (ev === 'GiftedSubscriptionsEvent' || ev === 'LuckyUsersWhoGotGiftSubscriptionsEvent'){
    const who = String(d.gifter_username || 'Someone'), got = (Array.isArray(d.gifted_usernames) ? d.gifted_usernames : Array.isArray(d.usernames) ? d.usernames : []).map(String);
    // (and how many the gifter has given in the channel, as Kick's chat says it)
    const total = +d.gifter_total > 0 ? [{ text: ' · ' }, { strong: n(d.gifter_total) }, { text: ' total in the channel' }] : [];
    return { ...event('gs-' + t + '-' + who, who, [{ strong: who }, { text: ' gifted ' }, { strong: plural(got.length || 1, 'sub', 'subs') }, ...total]),
      gift: { id: String(d.correlation_id || ''), count: got.length, to: got.map(u => ({ name: u, login: u.toLowerCase() })) },
      support: got.length === 1 ? { kind: 'gift', who, n: 1, to: got[0], group: String(d.correlation_id || '') } : { kind: 'gifts', who, n: got.length || +d.gifted_total || 1, group: String(d.correlation_id || '') } };
  }
  // Kick sends one sub as both (on the chat's subscription and the channel's), within a moment: one line, by who (within
  // 5 minutes), whichever comes first
  if (ev === 'SubscriptionEvent' || ev === 'ChannelSubscriptionEvent'){
    const who = String(d.username || 'Someone');
    return { ...event('sub-' + who.toLowerCase() + '-' + Math.floor(t / 300000), who, [{ strong: who }, { text: ' subscribed' }, ...(+d.months > 1 ? [{ text: ' · ' }, { strong: plural(d.months, 'month', 'months') }] : [])]),
      support: { kind: 'sub', who, n: Math.max(1, +d.months || 1) } };
  }
  // a raid coming in: StreamHostedEvent on the raided channel's chat, StreamHostEvent on its other subscription (both come,
  // in their own shapes): one line for the raid, by who raided (within 10 minutes), whichever comes first
  if (ev === 'StreamHostedEvent' || ev === 'StreamHostEvent'){
    const m = d.message || {}, who = String((d.user && d.user.username) || d.host_username || 'Someone'), said = m.optionalMessage || d.optional_message;
    const viewers = +(m.numberOfViewers ?? d.number_viewers) || 0;
    return { ...event('host-' + who.toLowerCase() + '-' + Math.floor(t / 600000), who, [{ strong: who }, { text: ' raided with ' }, { strong: plural(viewers, 'viewer', 'viewers') }], said ? kickParts(said) : []),
      support: { kind: 'raid', who, n: Math.max(1, viewers) },
      ...(d.user && d.user.slug ? { login: String(d.user.slug).toLowerCase(), named: false } : {}) };   // (the raider's address, when Kick sends it)
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
  return { ...m, kind: 'event', event: 'resub', summary, text: summary.map(x => x.text || x.strong).join(''), support: { kind: 'sub', who: m.sender || 'Someone', n: Math.max(1, months) } };
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

// What chat/feed-parse.js asks a site's reader (sites/twitch/feed.js says what each is)
const kickFeed = {
  parse: parseKick,
  known: { ChatMessageEvent: 'a message', 'ChatMessageEvent:reply': 'a reply', MessageDeletedEvent: 'a message deleted', UserBannedEvent: 'a ban or timeout',
    UserUnbannedEvent: 'a ban lifted', ChatroomClearEvent: 'the chat cleared', RewardRedeemedEvent: 'a reward redeemed', KicksGifted: 'Kicks sent',
    GiftedSubscriptionsEvent: 'gifted subs', LuckyUsersWhoGotGiftSubscriptionsEvent: 'gifted subs', SubscriptionEvent: 'a sub', ChannelSubscriptionEvent: 'a sub',
    StreamHostedEvent: 'a raid coming in', StreamHostEvent: 'a raid coming in (on its other subscription)', ChatMoveToSupportedChannelEvent: 'a raid going out (its line: Open)', 'ChatMessageEvent:celebration': 'a resub shared with a message',
    PinnedMessageCreatedEvent: 'a pin', PinnedMessageDeletedEvent: 'a pin taken down', ChatroomUpdatedEvent: 'the chat’s modes (above the box)',
    PollUpdateEvent: 'a poll and its votes (its card over ALL)', PollDeleteEvent: 'a poll deleted (its card goes)' },
  ignored: { PointsUpdated: 'your channel points', GoalProgressUpdateEvent: 'the channel’s goal bar', GoalCreatedEvent: 'the channel’s goal bar (a new goal)', GoalAchievedEvent: 'the channel’s goal bar (a goal reached)', GiftsLeaderboardUpdated: 'the gift leaderboard',
    KicksLeaderboardUpdated: 'the Kicks leaderboard', NewSubscriberUpdatedEvent: 'the sub count (ChannelSubscriptionEvent is the sub)',
    NewActivityFeedEvent: 'the activity feed (the same subs and follows)', StopStreamBroadcast: 'the stream ending', StreamerIsLive: 'the stream starting',
    GamificationWatchTimeGoalReached: 'your watch-time goal', GamificationLevelUp: 'your Kick level going up', PredictionUpdated: 'a prediction (Kick’s own panel)', PredictionCreated: 'a prediction (Kick’s own panel)',
    KicksBalanceUpdated: 'your own Kicks balance (on your private channel)', ChatMessageSentEvent: 'a sub as a line in Kick’s chat (the same sub: SubscriptionEvent)',
    ChatSettingsChanged: 'the chat’s modes again (the same change comes as ChatroomUpdatedEvent, shown above the box)' },
  ignoredMore: kind => /^pusher(_internal)?:/.test(kind) ? 'the connection’s own' : '',
  kindOf: null,
  kickEvents, kickRaid, kickCelebration, kickParts, kickPics
};

export { kickFeed };
