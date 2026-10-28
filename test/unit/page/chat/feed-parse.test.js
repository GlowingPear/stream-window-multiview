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
    badges: ['sub', 'mod'], parts: [{ text: 'hi 😀 ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }, { text: ' gg' }], first: true });
});

test('Twitch: replies, /me, Highlight my message, cheers, escaped tags', async () => {
  const { parseTwitch } = await load();
  const r = parseTwitch(TW({ 'display-name': 'Quill', id: 'r1', 'reply-parent-msg-id': 'p1', 'reply-parent-display-name': 'You', 'reply-parent-user-login': 'you', 'reply-parent-msg-body': 'is\\sthat\\sthe\\sdefault?' },
    ':quill!quill@quill.tmi.twitch.tv PRIVMSG #quietkoala :@You yeah default'));
  assert.deepEqual(r.reply, { id: 'p1', sender: 'You', login: 'you', body: 'is that the default?' });
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
  assert.equal(parseTwitch(':tmi.twitch.tv CLEARCHAT #q'), null, 'the whole chat cleared: not shown');
  assert.equal(parseTwitch(TW({}, ':tmi.twitch.tv CLEARMSG #q :x')), null);
  assert.equal(parseTwitch('PING :tmi.twitch.tv'), null);
  assert.equal(parseTwitch(''), null);
});

const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
test('Kick: messages and replies from its live connection, emotes and badges', async () => {
  const { parseKick } = await load();
  const sender = { id: 7, username: 'Lowtide', slug: 'lowtide', identity: { color: '#7FD2FF', badges: [{ type: 'moderator' }, { type: 'og' }, { type: 'unknown' }] } };
  const m = parseKick(KF('ChatMessageEvent', { id: 'k1', content: 'nice [emote:37226:KEKW]!', type: 'message', created_at: '2026-10-28T04:27:10+00:00', sender, metadata: { message_ref: '1' } }));
  assert.deepEqual(m, { site: 'kick', kind: 'message', id: 'k1', t: Date.parse('2026-10-28T04:27:10+00:00'), sender: 'Lowtide', login: 'lowtide', color: '#7FD2FF', userId: '7',
    badges: ['mod', 'og'], parts: [{ text: 'nice ' }, { emote: 'https://files.kick.com/emotes/37226/fullsize', name: 'KEKW' }, { text: '!' }] });
  const r = parseKick(KF('ChatMessageEvent', { id: 'k2', content: 'yes', type: 'reply', sender, thread_parent_id: 'k0',
    metadata: { original_sender: { id: 1, username: 'You' }, original_message: { id: 'k0', content: 'gg [emote:1:Pog]' } } }));
  assert.deepEqual(r.reply, { id: 'k0', sender: 'You', login: 'you', body: 'gg Pog' });
});

test('Kick: deletions (with its AI moderation and the rule), bans; other frames are left out', async () => {
  const { parseKick } = await load();
  const d = parseKick(KF('MessageDeletedEvent', { id: 'x', message: { id: 'k1' }, aiModerated: true, violatedRules: ['bullying'] }));
  assert.equal(d.kind, 'delete'); assert.equal(d.target, 'k1'); assert.equal(d.ai, true); assert.deepEqual(d.rules, ['bullying']);
  assert.equal(parseKick(KF('MessageDeletedEvent', { id: 'x', message: { id: 'k1' } })).ai, undefined);
  assert.equal(parseKick(KF('UserBannedEvent', { user: { slug: 'Spammer', username: 'Spammer' } })).login, 'spammer');
  for (const f of [KF('PinnedMessageCreatedEvent', {}), KF('MessageDeletedEvent', {}), KF('UserBannedEvent', {}), KF('ChatMessageEvent', { content: 'no id' }), '{}', 'not json'])
    assert.equal(parseKick(f), null, f.slice(0, 40));
});

const YT = (type, r) => ({ addChatItemAction: { item: { [type]: r } } });
test('YouTube: messages with emoji and badges, Super Chats, memberships, removals', async () => {
  const { parseYouTube } = await load();
  const author = { authorName: { simpleText: '@SoraHikari' }, authorExternalChannelId: 'UCx', timestampUsec: '1793161469214882',
    authorBadges: [{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'MODERATOR' } } }, { liveChatAuthorBadgeRenderer: { customThumbnail: {}, tooltip: 'Member (6 months)' } }] };
  const m = parseYouTube(YT('liveChatTextMessageRenderer', { id: 'y1', ...author, message: { runs: [{ text: 'hi ' }, { emoji: { emojiId: '👋', shortcuts: [':wave:'] } },
    { emoji: { emojiId: 'UCx/abc', isCustomEmoji: true, shortcuts: [':lofi:'], image: { thumbnails: [{ url: 'https://yt3.ggpht.com/e' }] } } }] } }));
  assert.deepEqual(m, { site: 'youtube', id: 'y1', t: 1793161469215, sender: '@SoraHikari', login: 'sorahikari', color: '', userId: 'UCx', badges: ['mod', 'sub'], kind: 'message',
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
