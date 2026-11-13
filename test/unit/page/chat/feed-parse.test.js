// Each site's chat data as one kind of message for the ALL tab (src/page/chat/feed-parse.js). The lines and frames are
// made up, in the shape each site sends them (recorded from their own connections for issue #203).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '../../../..');
// what's shared, with each site's reader (sites/<id>/feed.js) as before they moved, for the tests across sites
const load = async () => {
  globalThis.SmvSites = require(path.join(ROOT, 'src/shared/sites.js'));
  const { feedParse } = await import(path.join(ROOT, 'src/page/chat/feed-parse.js'));
  const { PLATFORMS: P } = await import(path.join(ROOT, 'src/page/sites/sites.js'));
  return { ...P.kick.feed, ...P.twitch.feed, ...P.youtube.feed, ...feedParse, KNOWN: feedParse.known(), IGNORED: feedParse.ignored(),
    parseKick: P.kick.feed.parse, parseTwitch: P.twitch.feed.parse, parseYouTube: P.youtube.feed.parse };
};
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;
const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
const YT = (type, r) => ({ addChatItemAction: { item: { [type]: r } } });

test('a batch from one chat: every message in order, unreadable ones and unknown sites left out', async () => {
  const { parseFeed } = await load();
  const out = parseFeed({ s: 'twitch', raw: [':a!a@a PRIVMSG #q :one', 'junk', ':b!b@b PRIVMSG #q :two'] });
  assert.deepEqual(out.map(m => m.parts[0].text), ['one', 'two']);
  assert.deepEqual(parseFeed({ s: 'kick', raw: ['{bad'] }), []);
  assert.deepEqual(parseFeed({ s: 'other', raw: ['x'] }), []);
  assert.deepEqual(parseFeed(null), []);
});

test('Support, for support alerts: who, how much, and a gift\'s group, as fields (not only in the words)', async () => {
  const { parseTwitch, parseKick, parseFeed } = await load();
  const tw = (id, prm, name = 'Brightwick') => parseTwitch(TW({ 'display-name': name, login: name.toLowerCase(), 'msg-id': id, id: 'e', ...prm }, ':tmi.twitch.tv USERNOTICE #q')).support;
  assert.deepEqual(parseTwitch(TW({ 'display-name': 'Quill', bits: '200', id: 'b' }, ':quill!q@q PRIVMSG #q :Cheer200 nice')).support, { kind: 'bits', who: 'Quill', n: 200 });
  assert.equal(parseTwitch(TW({ id: 'm' }, ':a!a@a PRIVMSG #q :hi')).support, undefined, 'a plain message: none');
  assert.deepEqual(tw('sub', { 'msg-param-cumulative-months': '1' }), { kind: 'sub', who: 'Brightwick', n: 1 });
  assert.deepEqual(tw('resub', { 'msg-param-cumulative-months': '38' }), { kind: 'sub', who: 'Brightwick', n: 38 });
  assert.deepEqual(tw('subgift', { 'msg-param-recipient-display-name': 'Tinroof', 'msg-param-community-gift-id': 'g7' }), { kind: 'gift', who: 'Brightwick', n: 1, to: 'Tinroof', group: 'g7' });
  assert.deepEqual(tw('subgift', {}), { kind: 'gift', who: 'Brightwick', n: 1, to: '', group: '' }, 'a gift on its own: no group');
  assert.deepEqual(tw('submysterygift', { 'msg-param-mass-gift-count': '5', 'msg-param-community-gift-id': 'g7' }), { kind: 'gifts', who: 'Brightwick', n: 5, group: 'g7' });
  assert.equal(tw('submysterygift', {}), undefined, 'without how many: none');
  assert.deepEqual(tw('raid', { 'msg-param-displayName': 'Novalynx', 'msg-param-viewerCount': '11' }), { kind: 'raid', who: 'Novalynx', n: 11 });
  assert.equal(tw('raid', {}), undefined);
  assert.equal(tw('viewermilestone', { 'msg-param-category': 'watch-streak', 'msg-param-value': '7' }), undefined, 'a watch streak isn\'t support');
  // Kick, in the shapes its connection sends (recorded from busy chats)
  const KE = (event, data) => JSON.stringify({ push: { channel: 'channel_1', pub: { data: { event, data: JSON.stringify(data) } } } });
  assert.deepEqual(parseKick(KE('KicksGifted', { gift_transaction_id: 'g1', sender: { username: 'Jshoti' }, gift: { name: 'Skull Emoji', amount: 50 } })).support, { kind: 'kicks', who: 'Jshoti', n: 50 });
  assert.deepEqual(parseKick(KE('GiftedSubscriptionsEvent', { correlation_id: 'pi_1', gifter_username: 'Kevino', gifted_usernames: ['a', 'b', 'c', 'd', 'e'], gifted_total: 5 })).support, { kind: 'gifts', who: 'Kevino', n: 5, group: 'pi_1' });
  assert.deepEqual(parseKick(KE('GiftedSubscriptionsEvent', { correlation_id: 'pi_2', gifter_username: 'Kevino', gifted_usernames: ['tinroof'] })).support, { kind: 'gift', who: 'Kevino', n: 1, to: 'tinroof', group: 'pi_2' }, 'one sub: to someone');
  assert.deepEqual(parseKick(KE('SubscriptionEvent', { username: 'jean', months: 38 })).support, { kind: 'sub', who: 'jean', n: 38 });
  assert.deepEqual(parseKick(KE('ChannelSubscriptionEvent', { username: 'jean' })).support, { kind: 'sub', who: 'jean', n: 1 });
  assert.deepEqual(parseKick(KE('StreamHostEvent', { host_username: 'MommaOcco', number_viewers: 57, optional_message: null })).support, { kind: 'raid', who: 'MommaOcco', n: 57 });
  assert.deepEqual(parseKick(KE('App\\Events\\StreamHostedEvent', { message: { id: 'd0', numberOfViewers: 57, optionalMessage: null }, user: { username: 'MommaOcco' } })).support, { kind: 'raid', who: 'MommaOcco', n: 57 });
  const cel = parseKick(KE('App\\Events\\ChatMessageEvent', { id: 'c1', type: 'celebration', content: 'still here', sender: { username: 'Oakmoss', identity: { badges: [] } }, metadata: { celebration: { type: 'subscription_renewed', total_months: 16 } } }));
  assert.deepEqual(cel.support, { kind: 'sub', who: 'Oakmoss', n: 16 }, 'a resub shared with a message');
  assert.deepEqual(parseFeed({ s: 'kick', raw: [KE('KicksGifted', { sender: { username: 'a' }, gift: {} })] })[0].support, { kind: 'kicks', who: 'a', n: 1 }, 'without an amount: one');
});

test('pins: Kick\'s (the whole message comes with it) and YouTube\'s banner; each taken down', async () => {
  const { parseKick, parseYouTube } = await load();
  const k = parseKick(KF('PinnedMessageCreatedEvent', { message: { id: 'k5', content: 'scrims at 8pm', type: 'message', sender: { username: 'quietkoala', slug: 'quietkoala', identity: { badges: [{ type: 'broadcaster' }] } } }, duration: 1200 }));
  assert.equal(k.kind, 'pin'); assert.equal(k.id, 'k5'); assert.equal(k.msg.sender, 'quietkoala'); assert.deepEqual(k.msg.parts, [{ text: 'scrims at 8pm' }]); assert.deepEqual(k.msg.badges, ['host']);
  assert.equal(parseKick(KF('PinnedMessageDeletedEvent', {})).kind, 'unpin');
  assert.equal(parseKick(KF('PinnedMessageCreatedEvent', {})), null);
  const y = parseYouTube({ addBannerToLiveChatCommand: { bannerRenderer: { liveChatBannerRenderer: { actionId: 'b1', contents: { liveChatTextMessageRenderer: { id: 'y9', authorName: { simpleText: 'Mika R.' }, message: { runs: [{ text: 'clip of the ace' }] } } } } } } });
  assert.equal(y.kind, 'pin'); assert.equal(y.id, 'b1'); assert.equal(y.msg.sender, 'Mika R.');
  assert.deepEqual(parseYouTube({ removeBannerForLiveChatCommand: { targetActionId: 'b1' } }).id, 'b1');
  assert.equal(parseYouTube({ addBannerToLiveChatCommand: { bannerRenderer: { liveChatBannerRenderer: { actionId: 'b2', contents: { pollRenderer: {} } } } } }), null, 'a poll banner: not a pin');
});

test('the chats\' modes as they change: Twitch\'s ROOMSTATE (what changed) and its other connection\'s room, Kick\'s ChatroomUpdatedEvent (all of them)', async () => {
  const { parseTwitch, parseKick } = await load();
  assert.deepEqual(parseTwitch(TW({ 'emote-only': '0', 'followers-only': '-1', r9k: '0', 'room-id': '1', slow: '0', 'subs-only': '0' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes,
    { slow: 0, followers: null, subs: false, emotes: false }, 'as you join: all of them, off');
  assert.deepEqual(parseTwitch(TW({ 'room-id': '1', slow: '30' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes, { slow: 30 }, 'then only what changed');
  assert.deepEqual(parseTwitch(TW({ 'followers-only': '10' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes, { followers: 10 });
  assert.deepEqual([parseTwitch(TW({ 'room-id': '1', slow: '30' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).room, 'room' in parseTwitch(TW({ 'followers-only': '10' }, ':tmi.twitch.tv ROOMSTATE #quietkoala'))],
    ['1', false], 'the channel\'s id, when it says it (ALL keeps each reward redeemed in its own channel)');
  assert.deepEqual(parseTwitch(TW({ 'followers-only': '0', 'subs-only': '1', 'emote-only': '1' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes, { followers: 0, subs: true, emotes: true });
  assert.equal(parseTwitch(TW({ 'room-id': '1' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')), null);
  const room = modes => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'updated_room', data: { room: { channel_id: '1', modes } } }) } });
  const r = parseTwitch(room({ followers_only_duration_minutes: null, emote_only_mode_enabled: false, subscribers_only_mode_enabled: true, verified_only_mode_enabled: true, slow_mode_duration_seconds: 5 }));
  assert.deepEqual([r.site, r.kind, typeof r.t, r.modes], ['twitch', 'modes', 'number', { slow: 5, followers: null, subs: true, emotes: false, verified: true }]);
  assert.equal(parseTwitch(JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'updated_room', data: {} }) } })), null);
  const k = parseKick(JSON.stringify({ push: { channel: 'chatrooms.67706967.v2', pub: { data: { event: 'App\\Events\\ChatroomUpdatedEvent', data: JSON.stringify({ id: 67706967,
    slow_mode: { enabled: true, message_interval: 5 }, subscribers_mode: { enabled: false }, followers_mode: { enabled: true, min_duration: 10 }, emotes_mode: { enabled: false },
    advanced_bot_protection: { enabled: false, remaining_time: 0 }, account_age: { enabled: false, min_duration: 0 } }) } } } }));
  assert.deepEqual([k.site, k.kind, k.modes], ['kick', 'modes', { slow: 5, followers: 10, subs: false, emotes: false, verified: false }]);
});

test('ignoredKinds: of the kinds heard, those ALL leaves out on purpose, with why, for each site (for the export and ALL\'s report)', async () => {
  const { ignoredKinds } = await load();
  assert.deepEqual(ignoredKinds({ kick: { PointsUpdated: {}, ChatMessageEvent: {}, MysteryEvent: {}, 'pusher:pong': {} }, twitch: { '001': {}, 'hermes:update-message': {}, PRIVMSG: {} } }), {
    kick: { PointsUpdated: 'your channel points', 'pusher:pong': 'the connection’s own' },
    twitch: { '001': 'the connection’s own', 'hermes:update-message': 'a message edited (it carries only the message’s id, not its new words)' }, youtube: {} });
  assert.deepEqual(ignoredKinds(null), { kick: {}, twitch: {}, youtube: {} });
  assert.deepEqual(ignoredKinds({ kick: { GamificationLevelUp: {} } }).kick, { GamificationLevelUp: 'your Kick level going up' }, 'on your own channel (private-<you>), like your points');
});

test('YouTube: a poll opened, its votes, closed; all of someone\'s messages taken away; what ALL leaves out of YouTube\'s and Twitch\'s, and why', async () => {
  const { parseYouTube, KNOWN, ignoredWhy } = await load();
  const runs = t => ({ runs: [{ text: t }] });
  const poll = ratios => ({ liveChatPollId: 'p1', header: { pollHeaderRenderer: { pollQuestion: runs('Which game next?'), metadataText: { runs: [{ text: 'quietkoala' }, { text: '  •  128 votes ' }] } } },
    choices: ['Deadlock', 'Hollow Knight', ''].map((t, i) => ({ text: runs(t), ...(ratios ? { voteRatio: ratios[i], votePercentage: { simpleText: Math.round(ratios[i] * 100) + '%' } } : {}) })) });
  const open = parseYouTube({ showLiveChatActionPanelAction: { panelToShow: { liveChatActionPanelRenderer: { id: 'p1', contents: { pollRenderer: poll() } } } } });
  assert.deepEqual({ ...open, t: 0 }, { site: 'youtube', kind: 'poll', state: 'open', id: 'p1', t: 0, question: 'Which game next?', meta: 'quietkoala • 128 votes',
    choices: [{ text: 'Deadlock', ratio: 0 }, { text: 'Hollow Knight', ratio: 0 }] }, 'an empty choice left out; no votes yet');
  const up = parseYouTube({ updateLiveChatPollAction: { pollToUpdate: { pollRenderer: poll([0.6, 1.4, 0]) } } });
  assert.deepEqual([up.state, up.choices.map(c => c.ratio)], ['update', [0.6, 1]], 'a share is 0 to 1');
  assert.deepEqual({ ...parseYouTube({ closeLiveChatActionPanelAction: { targetPanelId: 'p1', skipOnDismissCommand: true } }), t: 0 }, { site: 'youtube', kind: 'poll', state: 'close', id: 'p1', t: 0 });
  assert.equal(parseYouTube({ closeLiveChatActionPanelAction: {} }), null);
  assert.equal(parseYouTube({ updateLiveChatPollAction: { pollToUpdate: { pollRenderer: { choices: [{ text: runs('a') }] } } } }), null, 'no id');
  assert.equal(parseYouTube({ showLiveChatActionPanelAction: { panelToShow: { liveChatActionPanelRenderer: { contents: { pollRenderer: { liveChatPollId: 'p2', choices: [] } } } } } }), null, 'no choices');
  // all of someone's messages taken away: as a ban (ALL takes them away, or marks them for mods)
  assert.deepEqual({ ...parseYouTube({ removeChatItemByAuthorAction: { externalChannelId: 'UCbad' } }), t: 0 }, { site: 'youtube', kind: 'clear', userId: 'UCbad', t: 0 });
  assert.equal(parseYouTube({ removeChatItemByAuthorAction: {} }), null);
  for (const k of ['removeChatItemByAuthorAction', 'showLiveChatActionPanelAction', 'updateLiveChatPollAction', 'closeLiveChatActionPanelAction']) assert.ok(KNOWN.youtube[k], k);
  for (const k of ['addInteractivityWidgetAction', 'updateOrAddInteractivityWidgetAction', 'replaceChatItemAction:liveChatPlaceholderItemRenderer']) assert.ok(ignoredWhy('youtube', k), k);
  for (const k of ['hermes:extension_message', 'hermes:chat_rich_embed']) assert.ok(ignoredWhy('twitch', k), k);
  assert.match(KNOWN.twitch['USERNOTICE:sharedchatnotice'], /shared chat/, 'shown, as Twitch words it');
});

