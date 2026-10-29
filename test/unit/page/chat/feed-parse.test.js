// Each site's chat data as one kind of message for the ALL tab (src/page/chat/feed-parse.js). The lines and frames are
// made up, in the shape each site sends them (recorded from their own connections for issue #203).
const test = require('node:test');
const assert = require('node:assert/strict');
const load = async () => (await import('../../../../src/page/chat/feed-parse.js')).feedParse;

const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;

test('Twitch: a message with its id, badges, colour and emotes (by character, not UTF-16 unit)', async () => {
  const { parseTwitch } = await load();
  const m = parseTwitch(TW({ 'badge-info': 'subscriber/18', badges: 'subscriber/18,moderator/1,glhf-pledge/1', color: '#FF7F50', 'display-name': 'Tinroof', emotes: '25:5-9', 'first-msg': '1',
    id: 'a1', 'tmi-sent-ts': '1793161256615', 'user-id': '42' }, ':tinroof!tinroof@tinroof.tmi.twitch.tv PRIVMSG #quietkoala :hi 😀 Kappa gg'));
  assert.deepEqual(m, { site: 'twitch', kind: 'message', id: 'a1', t: 1793161256615, sender: 'Tinroof', login: 'tinroof', color: '#FF7F50', userId: '42',
    badges: ['sub', 'mod'], pics: [{ set: 'subscriber', v: '18', months: 18 }, { set: 'moderator', v: '1' }, { set: 'glhf-pledge', v: '1' }], parts: [{ text: 'hi 😀 ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }, { text: ' gg' }], first: true });
});

test('Twitch: replies, /me, Highlight my message, cheers, escaped tags', async () => {
  const { parseTwitch } = await load();
  const r = parseTwitch(TW({ 'display-name': 'Quill', id: 'r1', 'reply-parent-msg-id': 'p1', 'reply-parent-display-name': 'You', 'reply-parent-user-login': 'you', 'reply-parent-msg-body': 'is\\sthat\\sthe\\sdefault?' },
    ':quill!quill@quill.tmi.twitch.tv PRIVMSG #quietkoala :@You yeah default'));
  assert.deepEqual(r.reply, { id: 'p1', sender: 'You', login: 'you', body: 'is that the default?' });
  assert.deepEqual(r.parts, [{ text: 'yeah default' }], 'without the "@You " Twitch puts first (its chat leaves it out)');
  const tags = { id: 'r2', 'reply-parent-msg-id': 'p1', 'reply-parent-display-name': '00Bluey', 'reply-parent-user-login': '00bluey' };
  assert.deepEqual(parseTwitch(TW({ ...tags, emotes: '25:9-13' }, ':a!a@a PRIVMSG #q :@00Bluey Kappa')).parts, [{ emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }], 'its emotes still where they are');
  assert.deepEqual(parseTwitch(TW(tags, ':a!a@a PRIVMSG #q :@Quill look')).parts, [{ text: '@Quill look' }], 'someone else\'s @: kept');
  assert.equal(parseTwitch(':a!a@a PRIVMSG #q :\u0001ACTION waves\u0001').action, true);
  assert.deepEqual(parseTwitch(':a!a@a PRIVMSG #q :\u0001ACTION waves\u0001').parts, [{ text: 'waves' }]);
  assert.equal(parseTwitch(TW({ 'msg-id': 'highlighted-message', id: 'h' }, ':a!a@a PRIVMSG #q :HAPPY BIRTHDAY')).highlight, true);
  assert.equal(parseTwitch(TW({ bits: '100', id: 'b' }, ':a!a@a PRIVMSG #q :Cheer100 nice')).bits, 100);
});

test('Twitch: subs and other events, deletions and timeouts; anything else is left out', async () => {
  const { parseTwitch } = await load();
  const e = parseTwitch(TW({ 'display-name': 'Jean', login: 'jean', 'msg-id': 'resub', id: 'e1', 'system-msg': 'Jean\\ssubscribed\\sat\\sTier\\s1.' }, ':tmi.twitch.tv USERNOTICE #quietkoala :38 months!'));
  assert.equal(e.kind, 'event'); assert.equal(e.event, 'resub'); assert.equal(e.text, 'Jean subscribed at Tier 1.'); assert.deepEqual(e.parts, [{ text: '38 months!' }]);
  assert.deepEqual(parseTwitch(TW({ 'target-msg-id': 'a1', 'tmi-sent-ts': '5' }, ':tmi.twitch.tv CLEARMSG #q :bad words')), { site: 'twitch', kind: 'delete', target: 'a1', t: 5 });
  assert.deepEqual(parseTwitch(TW({ 'ban-duration': '600', 'tmi-sent-ts': '1000' }, ':tmi.twitch.tv CLEARCHAT #q :Loudmouth99')), { site: 'twitch', kind: 'clear', login: 'loudmouth99', t: 1000, until: 601000 });
  assert.deepEqual(parseTwitch(TW({ 'tmi-sent-ts': '7' }, ':tmi.twitch.tv CLEARCHAT #q')), { site: 'twitch', kind: 'clearall', t: 7 }, 'the whole chat cleared');
  assert.deepEqual(parseTwitch(TW({ 'tmi-sent-ts': '1000' }, ':tmi.twitch.tv CLEARCHAT #q :Loudmouth99')).until, 0, 'banned');
  assert.equal(parseTwitch(TW({}, ':tmi.twitch.tv CLEARMSG #q :x')), null);
  assert.equal(parseTwitch('PING :tmi.twitch.tv'), null);
  assert.equal(parseTwitch(''), null);
});

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

const YT = (type, r) => ({ addChatItemAction: { item: { [type]: r } } });
test('YouTube: messages with emoji and badges, Super Chats, memberships, removals', async () => {
  const { parseYouTube } = await load();
  const author = { authorName: { simpleText: '@SoraHikari' }, authorExternalChannelId: 'UCx', timestampUsec: '1793161469214882',
    authorBadges: [{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'MODERATOR' } } }, { liveChatAuthorBadgeRenderer: { customThumbnail: { thumbnails: [{ url: 'https://yt3.ggpht.com/m=s16' }, { url: 'https://yt3.ggpht.com/m=s32' }] }, tooltip: 'Member (6 months)' } }] };
  const m = parseYouTube(YT('liveChatTextMessageRenderer', { id: 'y1', ...author, message: { runs: [{ text: 'hi ' }, { emoji: { emojiId: '👋', shortcuts: [':wave:'] } },
    { emoji: { emojiId: 'UCx/abc', isCustomEmoji: true, shortcuts: [':lofi:'], image: { thumbnails: [{ url: 'https://yt3.ggpht.com/e' }] } } }] } }));
  assert.deepEqual(m, { site: 'youtube', id: 'y1', t: 1793161469215, sender: '@SoraHikari', login: 'sorahikari', color: '', userId: 'UCx', badges: ['mod', 'sub'], pics: [{ set: 'moderator', v: '1' }, { url: 'https://yt3.ggpht.com/m=s32', title: 'Member (6 months)' }], kind: 'message',
    parts: [{ text: 'hi ' }, { text: '👋' }, { emote: 'https://yt3.ggpht.com/e', name: ':lofi:' }] });
  const sc = parseYouTube(YT('liveChatPaidMessageRenderer', { id: 'y2', ...author, purchaseAmountText: { simpleText: '£5.00' }, message: { runs: [{ text: 'love it' }] } }));
  assert.equal(sc.kind, 'event'); assert.equal(sc.text, '@SoraHikari sent a Super Chat · £5.00'); assert.deepEqual(sc.parts, [{ text: 'love it' }]);
  assert.equal(parseYouTube(YT('liveChatPaidStickerRenderer', { id: 'y3', ...author })).text, '@SoraHikari sent a Super Sticker');
  assert.equal(parseYouTube(YT('liveChatMembershipItemRenderer', { id: 'y4', ...author, headerSubtext: { runs: [{ text: 'Welcome to ' }, { text: 'Koala Club' }] } })).text, 'Welcome to Koala Club');
  assert.equal(parseYouTube(YT('liveChatMembershipItemRenderer', { id: 'y5', ...author })).text, '@SoraHikari became a member');
  assert.deepEqual(parseYouTube({ removeChatItemAction: { targetItemId: 'y1' } }).target, 'y1');
  assert.equal(parseYouTube({ markChatItemsByAuthorAsDeletedAction: { externalChannelId: 'UCx' } }).userId, 'UCx');
  for (const a of [YT('liveChatViewerEngagementMessageRenderer', { id: 'z' }), YT('liveChatTextMessageRenderer', {}), { addLiveChatTickerItemAction: {} }, null, 'x'])
    assert.equal(parseYouTube(a), null);
});

test('a batch from one chat: every message in order, unreadable ones and unknown sites left out', async () => {
  const { parseFeed } = await load();
  const out = parseFeed({ s: 'twitch', raw: [':a!a@a PRIVMSG #q :one', 'junk', ':b!b@b PRIVMSG #q :two'] });
  assert.deepEqual(out.map(m => m.parts[0].text), ['one', 'two']);
  assert.deepEqual(parseFeed({ s: 'kick', raw: ['{bad'] }), []);
  assert.deepEqual(parseFeed({ s: 'other', raw: ['x'] }), []);
  assert.deepEqual(parseFeed(null), []);
});

test('Twitch events in a few words, the amount picked out; an announcement is a message', async () => {
  const { parseTwitch } = await load();
  const ev = (id, prm, name = 'Brightwick') => parseTwitch(TW({ 'display-name': name, login: name.toLowerCase(), 'msg-id': id, id: 'e', 'system-msg': "the\\ssite's\\swords", ...prm }, ':tmi.twitch.tv USERNOTICE #q')).summary;
  const words = s => s.map(x => x.strong ? `[${x.strong}]` : x.text).join('');
  assert.equal(words(ev('sub', { 'msg-param-sub-plan': 'Prime', 'msg-param-cumulative-months': '1' })), '[Brightwick] subscribed with Prime');
  assert.equal(words(ev('resub', { 'msg-param-sub-plan': '1000', 'msg-param-cumulative-months': '38' })), '[Brightwick] subscribed · [38 months]');
  assert.equal(words(ev('subgift', { 'msg-param-recipient-display-name': 'Tinroof' })), '[Brightwick] gifted a sub to [Tinroof]');
  assert.equal(words(ev('subgift', {})), '[Brightwick] gifted a sub to [someone]');
  assert.equal(words(ev('submysterygift', { 'msg-param-mass-gift-count': '5' })), '[Brightwick] gifted [5 subs]');
  assert.equal(words(ev('submysterygift', { 'msg-param-mass-gift-count': '1' })), '[Brightwick] gifted [1 sub]');
  assert.equal(words(ev('raid', { 'msg-param-displayName': 'Novalynx', 'msg-param-viewerCount': '1200' })), '[Novalynx] raided with [1,200 viewers]');
  assert.equal(words(ev('viewermilestone', { 'msg-param-value': '7' })), '[Brightwick] watched [7 streams] in a row');
  assert.equal(words(ev('giftpaidupgrade', {})), '[Brightwick] kept their sub going');
  assert.equal(words(ev('bitsbadgetier', { 'msg-param-threshold': '1000' })), '[Brightwick] earned a [1,000 bits] badge');
  const fwd = prm => ev('communitypayforward', { 'msg-param-prior-gifter-id': '7', 'msg-param-prior-gifter-user-name': 'tinroof', ...prm });
  assert.equal(words(fwd({ 'msg-param-prior-gifter-anonymous': 'false', 'msg-param-prior-gifter-display-name': 'Tinroof' })), '[Brightwick] paid forward the gift sub from [Tinroof]');
  assert.equal(words(fwd({ 'msg-param-prior-gifter-anonymous': 'false' })), '[Brightwick] paid forward the gift sub from [tinroof]', 'without a display name: the login');
  assert.equal(words(ev('communitypayforward', {})), '[Brightwick] paid forward the gift sub from [someone]');
  assert.equal(words(fwd({ 'msg-param-prior-gifter-anonymous': 'true', 'msg-param-prior-gifter-display-name': 'AnAnonymousGifter' })), '[Brightwick] paid forward an anonymous gift sub');
  assert.equal(words(ev('charitydonation', {})), "the site's words");
  assert.equal(words(ev('submysterygift', {})), "the site's words", 'without its number');
  assert.equal(words(parseTwitch(TW({ 'display-name': 'X', 'msg-id': 'other', id: 'e' }, ':tmi.twitch.tv USERNOTICE #q')).summary), '[X]');
  const ann = parseTwitch(TW({ 'display-name': 'quietkoala', 'msg-id': 'announcement', 'msg-param-color': 'BLUE', id: 'a', 'system-msg': '' }, ':tmi.twitch.tv USERNOTICE #q :scrims at 8pm'));
  assert.equal(ann.kind, 'message'); assert.equal(ann.announce, 'blue'); assert.equal(ann.event, undefined); assert.deepEqual(ann.parts, [{ text: 'scrims at 8pm' }]);
  assert.equal(parseTwitch(TW({ 'msg-id': 'announcement', id: 'a' }, ':tmi.twitch.tv USERNOTICE #q :hi')).announce, 'primary');
});

test('YouTube events in a few words', async () => {
  const { parseYouTube } = await load();
  const author = { authorName: { simpleText: '@Mika' }, timestampUsec: '1' };
  const words = a => parseYouTube(a).summary.map(x => x.strong ? `[${x.strong}]` : x.text).join('');
  assert.equal(words(YT('liveChatPaidMessageRenderer', { id: 'p', ...author, purchaseAmountText: { simpleText: '£5.00' } })), '[@Mika] Super Chat [£5.00]');
  assert.equal(words(YT('liveChatPaidStickerRenderer', { id: 'p', ...author })), '[@Mika] Super Sticker');
  assert.equal(words(YT('liveChatMembershipItemRenderer', { id: 'm', ...author, headerSubtext: { runs: [{ text: 'Welcome to Koala Club!' }] } })), '[@Mika] became a member');
  assert.equal(words(YT('liveChatMembershipItemRenderer', { id: 'm', ...author, headerSubtext: { simpleText: 'Member for 6 months' } })), '[@Mika] Member for 6 months');
});

test('Kick: a reward redeemed (with text: a message with the reward; without: an event), Kicks sent, subs, gifted subs, a raid', async () => {
  const { parseKick } = await load();
  const KE = (event, data) => JSON.stringify({ push: { channel: 'chatroom_1', pub: { data: { event, data: JSON.stringify(data) } } } });
  const r = parseKick(KE('RewardRedeemedEvent', { reward_title: 'Shoutout', username: 'driftwood_7', user_id: 5, user_input: 'say hi to sam', reward_background_color: '#00F1FF' }));
  assert.equal(r.kind, 'message'); assert.deepEqual(r.parts, [{ text: 'say hi to sam' }]); assert.deepEqual(r.redeem, { title: 'Shoutout', color: '#00F1FF' }); assert.equal(r.login, 'driftwood_7');
  const r2 = parseKick(KE('RewardRedeemedEvent', { reward_title: 'Hydrate', username: 'oakmoss', user_input: '', reward_background_color: 'red' }));
  assert.equal(r2.kind, 'event'); assert.equal(r2.text, 'oakmoss redeemed Hydrate');
  const k = parseKick(KE('KicksGifted', { gift_transaction_id: 'g1', sender: { username: 'Jshoti' }, gift: { name: 'Full Send', amount: 1000 } }));
  assert.equal(k.id, 'g1'); assert.equal(k.text, 'Jshoti sent Full Send · 1,000 Kicks');
  assert.equal(parseKick(KF('GiftedSubscriptionsEvent', { gifter_username: 'brightwick', gifted_usernames: ['a', 'b', 'c'] })).text, 'brightwick gifted 3 subs');
  assert.equal(parseKick(KF('SubscriptionEvent', { username: 'jean', months: 38 })).text, 'jean subscribed · 38 months');
  assert.equal(parseKick(KF('SubscriptionEvent', { username: 'jean', months: 1 })).text, 'jean subscribed');
  const h = parseKick(KF('StreamHostEvent', { host_username: 'novalynx', number_viewers: 120, optional_message: 'go say hi' }));
  assert.equal(h.text, 'novalynx raided with 120 viewers'); assert.deepEqual(h.parts, [{ text: 'go say hi' }]);
});

test('Twitch: a channel points reward with text is a message marked as a redeem', async () => {
  const { parseTwitch } = await load();
  assert.deepEqual(parseTwitch(TW({ 'custom-reward-id': 'abc', id: 'r1', 'display-name': 'tinroof' }, ':tinroof!t@t PRIVMSG #q :play the new map')).redeem, { title: '', color: '' });
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

test('Kick: a ban or timeout lifted, and by whom', async () => {
  const { parseKick } = await load();
  const u = parseKick(KF('UserUnbannedEvent', { user: { username: 'SaifYones', slug: 'saifyones' }, unbanned_by: { username: 'NightOwl' }, permanent: false }));
  assert.equal(u.kind, 'unban'); assert.equal(u.login, 'saifyones'); assert.equal(u.who, 'SaifYones'); assert.equal(u.by, 'NightOwl');
  assert.equal(parseKick(KF('UserUnbannedEvent', {})), null);
});

test('Twitch: a pin and its taking down, from its other connection (as Twitch sent them)', async () => {
  const { parseTwitch } = await load();
  const PIN = "{\"notification\":{\"subscription\":{\"id\":\"BPkHroKUNkrfvl-GDeMgx\"},\"type\":\"pubsub\",\"pubsub\":\"{\\\"type\\\":\\\"pin-message\\\",\\\"data\\\":{\\\"id\\\":\\\"e9ba29e9-5acb-43e6-beef-11ed92076d8e\\\",\\\"pinned_by\\\":{\\\"id\\\":\\\"111\\\",\\\"login\\\":\\\"quietkoala\\\",\\\"display_name\\\":\\\"QuietKoala\\\"},\\\"message\\\":{\\\"id\\\":\\\"7cc99aa0-cb9d-4902-83fb-919d24e57404\\\",\\\"sender\\\":{\\\"id\\\":\\\"111\\\",\\\"login\\\":\\\"quietkoala\\\",\\\"display_name\\\":\\\"QuietKoala\\\",\\\"badges\\\":[{\\\"id\\\":\\\"broadcaster\\\",\\\"version\\\":\\\"1\\\"},{\\\"id\\\":\\\"haunter\\\",\\\"version\\\":\\\"1\\\"}],\\\"chat_color\\\":\\\"#FF69B4\\\"},\\\"content\\\":{\\\"text\\\":\\\"scrims at 8pm\\\",\\\"fragments\\\":[{\\\"text\\\":\\\"scrims at 8pm\\\"}]},\\\"type\\\":\\\"MOD\\\",\\\"starts_at\\\":1793194900,\\\"updated_at\\\":1793194900,\\\"ends_at\\\":1793196100,\\\"sent_at\\\":1793194897}}}\"},\"id\":\"e3073da7-4393-57e6-a78e-5efcbe47292f-msg0-topic0BPkHroKUNkrfvl-GDeMgx\",\"type\":\"notification\",\"timestamp\":\"2026-10-28T13:41:40.686189434Z\"}";
  const UNPIN = "{\"notification\":{\"subscription\":{\"id\":\"KztRXgi8yqCtaIrJrCQDn\"},\"type\":\"pubsub\",\"pubsub\":\"{\\\"type\\\":\\\"unpin-message\\\",\\\"data\\\":{\\\"id\\\":\\\"e9ba29e9-5acb-43e6-beef-11ed92076d8e\\\",\\\"unpinned_by\\\":{\\\"id\\\":\\\"111\\\",\\\"display_name\\\":\\\"QuietKoala\\\"},\\\"reason\\\":\\\"UNPIN\\\"}}\"},\"id\":\"a768cfc8-7341-500d-9670-ac938deaf89a-msg0-topic0KztRXgi8yqCtaIrJrCQDn\",\"type\":\"notification\",\"timestamp\":\"2026-10-28T13:45:15.257694191Z\"}";
  const p = parseTwitch(PIN);
  assert.equal(p.kind, 'pin'); assert.equal(p.id, 'e9ba29e9-5acb-43e6-beef-11ed92076d8e'); assert.equal(p.by, 'QuietKoala');
  assert.equal(p.msg.sender, 'QuietKoala'); assert.equal(p.msg.login, 'quietkoala'); assert.equal(p.msg.color, '#FF69B4'); assert.deepEqual(p.msg.badges, ['host']);
  assert.deepEqual(p.msg.parts, [{ text: 'scrims at 8pm' }]);
  assert.deepEqual(parseTwitch(UNPIN), { site: 'twitch', kind: 'unpin', id: 'e9ba29e9-5acb-43e6-beef-11ed92076d8e', t: parseTwitch(UNPIN).t });
  const emote = JSON.stringify({ notification: { pubsub: JSON.stringify({ type: 'pin-message', data: { id: 'p2', message: { id: 'm2', sender: { login: 'a', display_name: 'A' }, content: { text: 'hi Kappa', fragments: [{ text: 'hi ' }, { text: 'Kappa', emoticon: { emoticonID: '25' } }] } } } }) } });
  assert.deepEqual(parseTwitch(emote).msg.parts, [{ text: 'hi ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }]);
  for (const f of ['{}', '{"notification":{"pubsub":"{\\"type\\":\\"viewcount\\",\\"data\\":{}}"}}', '{ not json']) assert.equal(parseTwitch(f), null, f);
});

test('the chats\' modes as they change: Twitch\'s ROOMSTATE (what changed) and its other connection\'s room, Kick\'s ChatroomUpdatedEvent (all of them)', async () => {
  const { parseTwitch, parseKick } = await load();
  assert.deepEqual(parseTwitch(TW({ 'emote-only': '0', 'followers-only': '-1', r9k: '0', 'room-id': '1', slow: '0', 'subs-only': '0' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes,
    { slow: 0, followers: null, subs: false, emotes: false }, 'as you join: all of them, off');
  assert.deepEqual(parseTwitch(TW({ 'room-id': '1', slow: '30' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes, { slow: 30 }, 'then only what changed');
  assert.deepEqual(parseTwitch(TW({ 'followers-only': '10' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')).modes, { followers: 10 });
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

test('Twitch\'s moderation actions (to moderators): who did what to whom, how long; a mode with its length', async () => {
  const { parseTwitch } = await load();
  const act = (moderation_action, args, extra = {}) => parseTwitch(JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'moderation_action', data: { type: 'chat_channel_moderation', moderation_action, args, created_by: 'NightOwl', ...extra } }) } }));
  const pick = a => a && [a.kind, a.action, a.by, a.target, a.secs, a.msgId, a.arg];
  assert.deepEqual(pick(act('timeout', ['LowTide', '600', 'spam'])), ['modaction', 'timeout', 'NightOwl', 'lowtide', 600, '', 0]);
  assert.deepEqual(pick(act('ban', ['LowTide'], { target_user_login: 'lowtide' })), ['modaction', 'ban', 'NightOwl', 'lowtide', 0, '', 0]);
  assert.deepEqual(pick(act('delete', ['LowTide', 'bad words', 'm9'])), ['modaction', 'delete', 'NightOwl', 'lowtide', 0, 'm9', 0]);
  assert.deepEqual(pick(act('slow', ['5'])), ['modaction', 'slow', 'NightOwl', '', 0, '', 5]);
  assert.equal(act('', []), null);
  assert.equal(parseTwitch(JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'moderation_action', data: { moderation_action: 'ban', args: [] } }) } })), null, 'without who did it');
});

test('Twitch: a watch streak is their message, highlighted, with how many streams; a reward redeemed without text and a shoutout are events; Twitch\'s own news is ignored, with why', async () => {
  const { parseTwitch, ignoredWhy, KNOWN } = await load();
  const streak = text => parseTwitch(TW({ 'display-name': 'Brightwick', login: 'brightwick', id: 'w1', 'msg-id': 'viewermilestone', 'msg-param-category': 'watch-streak', 'msg-param-value': '5', 'system-msg': 'Brightwick\\swatched\\s5\\sconsecutive\\sstreams' }, ':tmi.twitch.tv USERNOTICE #quietkoala' + (text ? ' :' + text : '')));
  const w = streak('five in a row');
  assert.deepEqual([w.kind, w.streak, w.parts, w.event, w.text], ['message', 5, [{ text: 'five in a row' }], undefined, undefined]);
  assert.deepEqual([streak('').kind, streak('').parts], ['message', []], 'without words: still the line');
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  const redemption = (extra = {}) => ({ redemption: { id: 'r1', user: { id: '9', login: 'tide', display_name: 'Tide' }, redeemed_at: '2026-10-29T07:21:55Z', reward: { title: 'Hydrate!', background_color: '#1D7C9F' }, ...extra } });
  const r = parseTwitch(hermes('reward-redeemed', redemption()));
  assert.deepEqual([r.kind, r.event, r.id, r.sender, r.text, r.redeem], ['event', 'reward', 'rw-r1', 'Tide', 'Tide redeemed Hydrate!', { title: 'Hydrate!', color: '#1D7C9F' }]);
  assert.equal(parseTwitch(hermes('reward-redeemed', redemption({ user_input: 'hi' }))), null, 'with text: the chat\'s line (PRIVMSG) is it');
  const so = parseTwitch(hermes('create', { shoutoutID: 's9', sourceLogin: 'quietkoala', targetLogin: 'novalynx', targetUserDisplayName: 'Novalynx' }));
  assert.deepEqual([so.kind, so.event, so.text, so.shoutout], ['event', 'shoutout', 'quietkoala shouted out Novalynx', 'tw:novalynx']);
  assert.deepEqual([KNOWN.twitch['hermes:reward-redeemed'], KNOWN.twitch['hermes:create']], ['a reward redeemed (without text)', 'a shoutout']);
  assert.equal(KNOWN.twitch['USERNOTICE:communitypayforward'], 'a gift sub paid forward');
  for (const k of ['hermes:drop-progress', 'hermes:commercial', 'hermes:watch-streak', 'hermes:hype-train-start', 'hermes:mystery-gift-purchase', 'hermes:?']) assert.ok(ignoredWhy('twitch', k), k);
});


test('Twitch: a raid getting ready (its countdown), going and called off, from its other connection; a goal reached', async () => {
  const { parseTwitch, KNOWN } = await load();
  const pub = obj => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify(obj) } });
  const raid = (type, extra = {}) => pub({ type, raid: { id: 'r7', creator_id: '1', source_id: '1', source_display_name: 'Quietkoala', target_id: '2', target_login: 'PixelMoth',
    target_display_name: 'PixelMoth', target_viewer_count: '230', transition_jitter_seconds: 0, force_raid_now_seconds: 90, viewer_count: 27, raid_created_at: 1793277992, ...extra } });
  const up = parseTwitch(raid('raid_update_v2'));
  assert.deepEqual({ ...up, t: 0 }, { site: 'twitch', kind: 'raid', state: 'update', id: 'rd-r7', t: 0, to: 'tw:pixelmoth', viewers: 27, at: (1793277992 + 90) * 1000 });
  assert.equal(parseTwitch(raid('raid_go_v2')).state, 'go');
  assert.equal(parseTwitch(raid('raid_cancel_v2')).state, 'cancel');
  assert.deepEqual([parseTwitch(raid('raid_update_v2', { raid_created_at: 0, viewer_count: undefined })).at, parseTwitch(raid('raid_update_v2', { viewer_count: undefined })).viewers], [0, 0], 'without a start: no countdown');
  assert.equal(parseTwitch(raid('raid_update_v2', { target_login: '' })), null);
  assert.equal(parseTwitch(pub({ type: 'raid_update_v2' })), null);
  assert.equal(parseTwitch(raid('raid_other_v2')), null);
  const goal = g => parseTwitch(pub({ type: 'goal_achieved', data: { goal: { id: 'g1', state: 'ACTIVE', description: '', currentContributions: 230, targetContributions: 230, ...g } } }));
  const words = s => s.map(x => x.strong ? `[${x.strong}]` : x.text).join('');
  const f = goal({ contributionType: 'FOLLOWERS' });
  assert.deepEqual([f.kind, f.event, f.id, f.text, f.parts, words(f.summary)], ['event', 'goal', 'goal-g1-230', 'Follower goal reached · 230', [], '[Follower goal] reached · [230]']);
  assert.equal(words(goal({ contributionType: 'SUB_POINTS', currentContributions: 1500, targetContributions: 1500 }).summary), '[Sub point goal] reached · [1,500]');
  assert.equal(words(goal({ contributionType: 'SOMETHING_NEW', currentContributions: 0, targetContributions: 0 }).summary), '[Goal] reached');
  assert.deepEqual(goal({ contributionType: 'SUBS', description: ' Road to 100 subs ' }).parts, [{ text: 'Road to 100 subs' }], 'its description: its words');
  assert.equal(parseTwitch(pub({ type: 'goal_achieved', data: { goal: {} } })), null);
  for (const k of ['hermes:raid_update_v2', 'hermes:raid_go_v2', 'hermes:raid_cancel_v2', 'hermes:goal_achieved']) assert.ok(KNOWN.twitch[k], k);
});
