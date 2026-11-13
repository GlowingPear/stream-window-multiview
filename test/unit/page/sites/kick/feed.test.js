// Kick's chat data as ALL's messages (src/page/sites/kick/feed.js; what a message is: src/page/chat/feed-parse.js).
// The lines and frames are made up, in the shape Kick sends them (recorded from its own connections for issue #203).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');   // (import() of a Windows path needs a file:// URL)
const ROOT = path.join(__dirname, '../../../../..');
// its reader, with what ALL says about the kinds it reads (chat/feed-parse.js)
const load = async () => {
  globalThis.SmvSites = require(path.join(ROOT, 'src/shared/sites.js'));
  const { kickFeed: feed } = await import(pathToFileURL(path.join(ROOT, 'src/page/sites/kick/feed.js')).href);
  const { feedParse } = await import(pathToFileURL(path.join(ROOT, 'src/page/chat/feed-parse.js')).href);
  return { ...feed, parseKick: feed.parse, KNOWN: feedParse.known(), ignoredWhy: feedParse.ignoredWhy, ignoredKinds: feedParse.ignoredKinds, leftOut: feedParse.leftOut, parseFeed: feedParse.parseFeed };
};
const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });

test('Kick: badges in Kick\'s order (sort_order), named as Kick names them; a level picked to show, with its number', async () => {
  const { kickPics } = (await load());
  assert.deepEqual(kickPics({ badges: [{ type: 'founder', text: 'Founder', sort_order: 6 }, { type: 'subscriber', text: 'Subscriber', count: 2, sort_order: 9 }, { type: 'sub_gifter', text: 'Sub Gifter', count: 2, sort_order: 8 }],
    badges_v2: [{ name: 'level', image_url: 'https://ext.cdn.kick.com/chat/badges/24.png', metadata: { level: 24 }, selected: true, sort_order: 1 }] }),
  [{ url: 'https://ext.cdn.kick.com/chat/badges/24.png', title: 'Level 24', icon: 'Level24' }, { set: 'founder', v: '1', title: 'Founder' }, { set: 'sub_gifter', v: '2', title: 'Sub Gifter' }, { set: 'subscriber', v: '2' }]);
});

test('Kick: only the badges its chat shows: taken off ones left out, one without sort_order last, the first 4 only (a sub badge behind 4 others isn\'t worn)', async () => {
  const { kickPics } = (await load());
  const pic = (name, o, more = {}) => ({ name, badge_type: 'global', image_url: `https://ext.cdn.kick.com/chat/badges/${name}.png`, selected: true, sort_order: o, ...more });
  // (as Kick sends it: OG and an 11-month sub, a level and two picked badges)
  assert.deepEqual(kickPics({ badges: [{ type: 'og', text: 'OG', sort_order: 7 }, { type: 'subscriber', text: 'Subscriber', count: 11, sort_order: 9 }],
    badges_v2: [pic('Flyby', 4), pic('level', 1, { metadata: { level: 68 } }), pic('WoW', 4)] }),
  [{ url: 'https://ext.cdn.kick.com/chat/badges/level.png', title: 'Level 68', icon: 'Level68' }, { url: 'https://ext.cdn.kick.com/chat/badges/Flyby.png', title: 'Flyby' },
    { url: 'https://ext.cdn.kick.com/chat/badges/WoW.png', title: 'WoW' }, { set: 'og', v: '1', title: 'OG' }], 'Kick\'s 4: not the sub badge');
  assert.deepEqual(kickPics({ badges: [{ type: 'og', text: 'OG', active: false, sort_order: 7 }, { type: 'subscriber', count: 3, active: true, sort_order: 9 }, { type: 'vip', text: 'VIP' }],
    badges_v2: [pic('Ghost', 4, { selected: false }), pic('NoOrder', undefined), pic('Rare', 2, { image_url: 'http://not-https/x.png' })] }),
  [{ set: 'subscriber', v: '3' }, { set: 'vip', v: '1', title: 'VIP' }, { url: 'https://ext.cdn.kick.com/chat/badges/NoOrder.png', title: 'NoOrder' }],
    'taken off: left out; without sort_order: last, as they came; one without a usable picture counts towards the 4 but isn\'t drawn');
  assert.deepEqual(kickPics({}), []);
});

test('Kick: messages and replies from its live connection, emotes and badges', async () => {
  const { parseKick } = await load();
  const sender = { id: 7, username: 'Lowtide', slug: 'lowtide', identity: { color: '#7FD2FF', badges: [{ type: 'subscriber', count: 41 }, { type: 'moderator' }, { type: 'og' }, { type: 'unknown' }],
    badges_v2: [{ name: 'kick_founder22', image_url: 'https://ext.cdn.kick.com/chat/badges/founder.png', selected: true }, { name: 'level', image_url: 'https://ext.cdn.kick.com/chat/badges/46.png', selected: true },
      { name: 'Ghost', image_url: 'https://ext.cdn.kick.com/chat/badges/ghost.png', selected: false }] } };
  const m = parseKick(KF('ChatMessageEvent', { id: 'k1', content: 'nice [emote:37226:KEKW]!', type: 'message', created_at: '2026-10-28T04:27:10+00:00', sender, metadata: { message_ref: '1' } }));
  assert.deepEqual(m, { site: 'kick', kind: 'message', id: 'k1', t: Date.parse('2026-10-28T04:27:10+00:00'), sender: 'Lowtide', login: 'lowtide', color: '#7FD2FF', userId: '7',
    badges: ['sub', 'mod', 'og'], pics: [{ set: 'subscriber', v: '41' }, { set: 'moderator', v: '1' }, { set: 'og', v: '1' }, { set: 'unknown', v: '1' }],   // (Kick's first 4)
    parts: [{ text: 'nice ' }, { emote: 'https://files.kick.com/emotes/37226/fullsize', name: 'KEKW' }, { text: '!' }] });
  const r = parseKick(KF('ChatMessageEvent', { id: 'k2', content: 'yes', type: 'reply', sender, thread_parent_id: 'k0',
    metadata: { original_sender: { id: 1, username: 'You' }, original_message: { id: 'k0', content: 'gg [emote:1:Pog]' } } }));
  assert.deepEqual(r.reply, { id: 'k0', sender: 'You', login: 'you', body: 'gg Pog' });
});

test('Kick: deletions (with its AI moderation and the rule), bans; other frames are left out', async () => {
  const { parseKick } = await load();
  const d = parseKick(KF('MessageDeletedEvent', { id: 'x', message: { id: 'k1' }, aiModerated: true, violatedRules: ['bullying'] }));
  assert.equal(d.kind, 'delete'); assert.equal(d.target, 'k1'); assert.equal(d.ai, true); assert.deepEqual(d.rules, ['bullying']);
  assert.equal(parseKick(KF('MessageDeletedEvent', { id: 'x', message: { id: 'k1' } })).ai, undefined);
  const ban = parseKick(KF('UserBannedEvent', { user: { slug: 'Spammer', username: 'Spammer' }, banned_by: { username: 'NightOwl' }, permanent: true }));
  assert.equal(ban.login, 'spammer'); assert.equal(ban.until, 0); assert.equal(ban.by, 'NightOwl');
  const to = parseKick(KF('UserBannedEvent', { user: { slug: 'spammer' }, banned_by: { slug: 'nightowl' }, permanent: false, duration: 10 }));
  assert.equal(to.until - to.t, 600000, 'a timeout: its minutes'); assert.equal(to.by, 'nightowl');
  assert.equal(parseKick(KF('UserBannedEvent', { user: { slug: 'x' } })).by, undefined, 'who did it: not always said');
  assert.equal(parseKick(KF('ChatroomClearEvent', {})).kind, 'clearall');
  for (const f of [KF('PinnedMessageCreatedEvent', {}), KF('MessageDeletedEvent', {}), KF('UserBannedEvent', {}), KF('ChatMessageEvent', { content: 'no id' }), '{}', 'not json'])
    assert.equal(parseKick(f), null, f.slice(0, 40));
});

test('Kick: a reward redeemed (with text: a message with the reward; without: an event), Kicks sent, subs, gifted subs, a raid', async () => {
  const { parseKick, KNOWN } = await load();
  const KE = (event, data) => JSON.stringify({ push: { channel: 'chatroom_1', pub: { data: { event, data: JSON.stringify(data) } } } });
  const r = parseKick(KE('RewardRedeemedEvent', { reward_title: 'Shoutout', username: 'driftwood_7', user_id: 5, user_input: 'say hi to sam', reward_background_color: '#00F1FF' }));
  assert.equal(r.kind, 'message'); assert.deepEqual(r.parts, [{ text: 'say hi to sam' }]); assert.deepEqual(r.redeem, { title: 'Shoutout', color: '#00F1FF' }); assert.equal(r.login, 'driftwood_7');
  const r2 = parseKick(KE('RewardRedeemedEvent', { reward_title: 'Hydrate', username: 'oakmoss', user_input: '', reward_background_color: 'red' }));
  assert.equal(r2.kind, 'event'); assert.equal(r2.text, 'oakmoss redeemed Hydrate');
  // its text's emotes, as a message's
  assert.deepEqual(parseKick(KE('RewardRedeemedEvent', { reward_title: 'Lurk', username: 'oakmoss', user_input: 'brb [emote:6193915:koalaLurk]' })).parts,
    [{ text: 'brb ' }, { emote: 'https://files.kick.com/emotes/6193915/fullsize', name: 'koalaLurk' }]);
  assert.deepEqual(parseKick(KE('KicksGifted', { gift_transaction_id: 'g2', sender: { username: 'Jshoti' }, gift: { name: 'Full Send', amount: 100 }, message: '[emote:7:hype]' })).parts,
    [{ emote: 'https://files.kick.com/emotes/7/fullsize', name: 'hype' }]);
  const k = parseKick(KE('KicksGifted', { gift_transaction_id: 'g1', sender: { username: 'Jshoti' }, gift: { name: 'Full Send', amount: 1000 } }));
  assert.equal(k.id, 'g1'); assert.equal(k.text, 'Jshoti sent Full Send · 1,000 Kicks');
  assert.equal(parseKick(KF('GiftedSubscriptionsEvent', { gifter_username: 'brightwick', gifted_usernames: ['a', 'b', 'c'] })).text, 'brightwick gifted 3 subs');
  assert.equal(parseKick(KF('GiftedSubscriptionsEvent', { gifter_username: 'brightwick', gifted_usernames: ['a', 'b', 'c'], gifter_total: 1058 })).text, 'brightwick gifted 3 subs · 1,058 total in the channel', 'how many the gifter has given there');
  assert.equal(parseKick(KF('SubscriptionEvent', { username: 'jean', months: 38 })).text, 'jean subscribed · 38 months');
  assert.equal(parseKick(KF('SubscriptionEvent', { username: 'jean', months: 1 })).text, 'jean subscribed');
  // the same sub on the channel's subscription too: one id, so ALL keeps one line
  assert.equal(parseKick(KF('ChannelSubscriptionEvent', { username: 'Jean', user_ids: [3] })).id, parseKick(KF('SubscriptionEvent', { username: 'jean', months: 9 })).id);
  const h = parseKick(KF('StreamHostEvent', { host_username: 'novalynx', number_viewers: 120, optional_message: 'go say hi' }));
  assert.equal(h.text, 'novalynx raided with 120 viewers'); assert.deepEqual(h.parts, [{ text: 'go say hi' }]);
  assert.deepEqual(parseKick(KF('StreamHostEvent', { host_username: 'novalynx', number_viewers: 2, optional_message: 'hi [emote:7:hype]' })).parts,
    [{ text: 'hi ' }, { emote: 'https://files.kick.com/emotes/7/fullsize', name: 'hype' }]);
  // Kick sends the same raid as StreamHostedEvent too: the same id, so ALL keeps one line
  const both = parseKick(JSON.stringify({ push: { channel: 'chatrooms.1', pub: { data: { event: 'App\\Events\\StreamHostedEvent', data: JSON.stringify({ message: { id: 'h9', numberOfViewers: 120 }, user: { username: 'Novalynx' } }) } } } }));
  assert.equal(both.id, h.id, 'one raid, one id, whichever name');
  assert.ok(KNOWN.kick.StreamHostEvent, 'known: it does come');
});

test('Kick: a raid coming in (StreamHostedEvent), with its message or without; a raid going out (its chat moved to the raided channel)', async () => {
  const { parseKick, KNOWN } = await load();
  const KC = (event, data, channel) => JSON.stringify({ push: { channel, pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
  const hosted = (extra = {}) => parseKick(KC('StreamHostedEvent', { message: { id: 'h1', numberOfViewers: 264, optionalMessage: null, createdAt: '2026-10-29T22:55:42.988282Z', ...extra },
    user: { id: 23, username: 'Novalynx', isSuperAdmin: false, verified: { id: 24 } } }, 'chatrooms.1'));
  const h = hosted();
  assert.deepEqual([h.site, h.kind, h.id, h.sender, h.login, h.text, h.parts], ['kick', 'event', h.id, 'Novalynx', 'novalynx', 'Novalynx raided with 264 viewers', []]);
  assert.deepEqual(h.summary, [{ strong: 'Novalynx' }, { text: ' raided with ' }, { strong: '264 viewers' }]);
  assert.equal(h.named, true, 'its login is from the name (a shoutout looks its Kick address up)');
  const withSlug = parseKick(KC('StreamHostedEvent', { message: { numberOfViewers: 3 }, user: { username: 'Nova_Lynx', slug: 'nova-lynx' } }, 'chatrooms.1'));
  assert.deepEqual([withSlug.sender, withSlug.login, withSlug.named], ['Nova_Lynx', 'nova-lynx', false], 'Kick sent the address: that, as it is');
  assert.deepEqual(hosted({ optionalMessage: 'bringing the squad, be nice', numberOfViewers: 1 }).parts, [{ text: 'bringing the squad, be nice' }]);
  assert.equal(hosted({ numberOfViewers: 1 }).text, 'Novalynx raided with 1 viewer');
  assert.match(parseKick(KC('StreamHostedEvent', { message: {} }, 'chatrooms.1')).text, /^Someone raided with 0 viewers$/, 'without who or how many');
  const move = (hostedTo, live = { viewer_count: 412 }) => parseKick(KC('ChatMoveToSupportedChannelEvent', { channel: { id: 1, slug: 'quietkoala', current_livestream: live }, slug: 'emberfall',
    hosted: hostedTo }, 'channel.1'));
  const r = move({ id: 2, username: 'Emberfall', slug: 'EmberFall', viewers_count: 300, is_live: true });
  assert.deepEqual({ ...r, t: 0, id: r.id.replace(/\d+$/, 'N') }, { site: 'kick', kind: 'raid', state: 'go', id: 'rd-emberfall-N', t: 0, to: 'emberfall', viewers: 412, at: 0 }, 'its viewers: the raiding stream\'s');
  assert.deepEqual([move({ username: 'Emberfall' }, null).to, move({ username: 'Emberfall' }, null).viewers], ['emberfall', 0], 'by its name; without the stream: no count');
  assert.equal(move(null), null);
  assert.equal(move({}), null);
  for (const k of ['StreamHostedEvent', 'ChatMoveToSupportedChannelEvent', 'ChatMessageEvent:celebration']) assert.ok(KNOWN.kick[k], k);
});

test('Kick: a resub shared with a message (a celebration) is an event with the message and its months; one of a kind ALL doesn\'t know is the message', async () => {
  const { parseKick } = await load();
  const cel = (celebration, content = 'sixteen months, still here') => parseKick(KF('ChatMessageEvent', { id: 'c1', chatroom_id: 3, content, type: 'celebration', created_at: '2026-10-30T00:17:38+00:00',
    sender: { id: 7, username: 'Oakmoss', slug: 'oakmoss', identity: { color: '#31D6C2', badges: [{ type: 'subscriber', text: 'Subscriber', count: 16, sort_order: 9 }] } }, metadata: { celebration } }));
  const c = cel({ id: 'cb1', type: 'subscription_renewed', total_months: 16, created_at: '2026-10-28T06:58:38.910687Z' });
  assert.deepEqual([c.kind, c.event, c.id, c.sender, c.login, c.color, c.badges, c.text, c.parts], ['event', 'resub', 'c1', 'Oakmoss', 'oakmoss', '#31D6C2', ['sub'], 'Oakmoss subscribed · 16 months', [{ text: 'sixteen months, still here' }]]);
  assert.deepEqual(c.summary, [{ strong: 'Oakmoss' }, { text: ' subscribed' }, { text: ' · ' }, { strong: '16 months' }]);
  assert.equal(c.t, Date.parse('2026-10-30T00:17:38+00:00'));
  assert.equal(cel({ type: 'subscription_renewed' }).text, 'Oakmoss subscribed', 'without its months');
  const other = cel({ id: 'cb2', type: 'something_new', total_months: 3 });
  assert.deepEqual([other.kind, other.event, other.summary, other.parts], ['message', undefined, undefined, [{ text: 'sixteen months, still here' }]]);
  assert.equal(cel(undefined).kind, 'message', 'no celebration with it');
});

test('Kick: a ban or timeout lifted, and by whom', async () => {
  const { parseKick } = await load();
  const u = parseKick(KF('UserUnbannedEvent', { user: { username: 'SaifYones', slug: 'saifyones' }, unbanned_by: { username: 'NightOwl' }, permanent: false }));
  assert.equal(u.kind, 'unban'); assert.equal(u.login, 'saifyones'); assert.equal(u.who, 'SaifYones'); assert.equal(u.by, 'NightOwl');
  assert.equal(parseKick(KF('UserUnbannedEvent', {})), null);
});

test('Kick: a poll\'s votes (each a share, and how many), its time left and how long its results show; deleted', async () => {
  const { parseKick, KNOWN, ignoredWhy } = await load();
  const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
  const before = Date.now();
  const m = parseKick(KF('PollUpdateEvent', { poll: { title: ' Best set? ', options: [{ id: 0, label: 'Beyond the Brave', votes: 14 }, { id: 1, label: 'Battle Styles', votes: 6 }, { id: 2, label: '', votes: 0 }], duration: 300, remaining: 88, result_display_duration: 300 } }));
  assert.deepEqual([m.kind, m.state, m.id, m.question, m.meta], ['poll', 'update', 'kick', 'Best set?', '20 votes']);
  assert.deepEqual(m.choices, [{ text: 'Beyond the Brave', ratio: 0.7 }, { text: 'Battle Styles', ratio: 0.3 }], 'an empty one left out');
  assert.ok(m.ends >= before + 88000 && m.ends <= Date.now() + 88000);
  assert.equal(m.until - m.ends, 300000, 'its results for 5 minutes after');
  assert.equal(parseKick(KF('PollUpdateEvent', { poll: { title: 'x', options: [{ label: 'a', votes: 0 }], remaining: 0 } })).choices[0].ratio, 0, 'no votes yet');
  assert.equal(parseKick(KF('PollUpdateEvent', { poll: { title: 'x', options: [] } })), null);
  assert.deepEqual({ ...parseKick(KF('PollDeleteEvent', [])), t: 0 }, { site: 'kick', kind: 'poll', state: 'close', id: 'kick', t: 0 });
  assert.ok(KNOWN.kick.PollUpdateEvent && KNOWN.kick.PollDeleteEvent && !ignoredWhy('kick', 'PollUpdateEvent'));
});

