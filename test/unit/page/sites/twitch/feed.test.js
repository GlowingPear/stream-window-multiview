// Twitch's chat data as ALL's messages (src/page/sites/twitch/feed.js; what a message is: src/page/chat/feed-parse.js).
// The lines and frames are made up, in the shape Twitch sends them (recorded from its own connections for issue #203).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '../../../../..');
// its reader, with what ALL says about the kinds it reads (chat/feed-parse.js)
const load = async () => {
  globalThis.SmvSites = require(path.join(ROOT, 'src/shared/sites.js'));
  const { twitchFeed: feed } = await import(path.join(ROOT, 'src/page/sites/twitch/feed.js'));
  const { feedParse } = await import(path.join(ROOT, 'src/page/chat/feed-parse.js'));
  return { ...feed, parseTwitch: feed.parse, KNOWN: feedParse.known(), ignoredWhy: feedParse.ignoredWhy, ignoredKinds: feedParse.ignoredKinds, leftOut: feedParse.leftOut, parseFeed: feedParse.parseFeed };
};
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;

test('Twitch: a message with its id, badges, colour and emotes (by character, not UTF-16 unit)', async () => {
  const { parseTwitch } = await load();
  const m = parseTwitch(TW({ 'badge-info': 'subscriber/18', badges: 'subscriber/18,moderator/1,glhf-pledge/1', color: '#FF7F50', 'display-name': 'Tinroof', emotes: '25:5-9', 'first-msg': '1',
    id: 'a1', 'tmi-sent-ts': '1793161256615', 'user-id': '42' }, ':tinroof!tinroof@tinroof.tmi.twitch.tv PRIVMSG #quietkoala :hi 😀 Kappa gg'));
  assert.deepEqual(m, { site: 'twitch', kind: 'message', id: 'a1', t: 1793161256615, sender: 'Tinroof', login: 'tinroof', color: '#FF7F50', userId: '42',
    badges: ['sub', 'mod'], pics: [{ set: 'subscriber', v: '18', months: 18 }, { set: 'moderator', v: '1' }, { set: 'glhf-pledge', v: '1' }], parts: [{ text: 'hi 😀 ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }, { text: ' gg' }], first: true });
  // a lead moderator is a moderator (so ALL never offers to time them out)
  assert.deepEqual(parseTwitch(TW({ badges: 'lead_moderator/1,subscriber/2006', 'display-name': 'Leadfox', id: 'a2' }, ':leadfox!l@l PRIVMSG #quietkoala :hi')).badges, ['mod', 'sub']);
});

test('Twitch: a giant emote; a shared chat\'s message from another channel (its channel, its badges there, its id in every chat of the session)', async () => {
  const { parseTwitch, KNOWN } = await load();
  const g = parseTwitch(TW({ 'msg-id': 'gigantified-emote-message', emotes: '25:0-4', 'emote-only': '1', id: 'g1' }, ':a!a@a PRIVMSG #q :Kappa'));
  assert.equal(g.giant, true);
  assert.deepEqual(g.parts, [{ emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }]);
  assert.ok(KNOWN.twitch['PRIVMSG:gigantified-emote-message']);
  const other = parseTwitch(TW({ badges: '', 'room-id': '100', 'source-room-id': '200', 'source-id': 's1', id: 'm1', 'source-badges': 'subscriber/18,vip/1', 'source-badge-info': 'subscriber/21' }, ':a!a@a PRIVMSG #q :hi'));
  assert.deepEqual([other.from, other.sentIn, other.sourceId, other.badges, other.pics], ['200', '200', 's1', ['sub', 'vip'], [{ set: 'subscriber', v: '18', months: 21 }, { set: 'vip', v: '1' }]]);
  const own = parseTwitch(TW({ badges: 'moderator/1', 'room-id': '100', 'source-room-id': '100', 'source-id': 'm2', id: 'm2', 'source-badges': 'moderator/1' }, ':a!a@a PRIVMSG #q :hi'));
  assert.deepEqual([own.from, own.sentIn, own.sourceId, own.badges], [undefined, '100', 'm2', ['mod']], 'from this chat itself: no other channel, sent in this one');
  assert.equal(parseTwitch(TW({ 'room-id': '100', id: 'm3' }, ':a!a@a PRIVMSG #q :hi')).sentIn, undefined, 'no shared chat: nowhere said');
  assert.equal(parseTwitch(TW({ id: 'x' }, ':a!a@a PRIVMSG #q :hi')).sourceId, undefined, 'not a shared chat');
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

test('Twitch events in a few words, the amount picked out; an announcement is a message', async () => {
  const { parseTwitch } = await load();
  const ev = (id, prm, name = 'Brightwick') => parseTwitch(TW({ 'display-name': name, login: name.toLowerCase(), 'msg-id': id, id: 'e', 'system-msg': "the\\ssite's\\swords", ...prm }, ':tmi.twitch.tv USERNOTICE #q')).summary;
  const words = s => s.map(x => x.strong ? `[${x.strong}]` : x.text).join('');
  assert.equal(words(ev('sub', { 'msg-param-sub-plan': 'Prime', 'msg-param-cumulative-months': '1' })), '[Brightwick] subscribed with Prime');
  assert.equal(words(ev('resub', { 'msg-param-sub-plan': '1000', 'msg-param-cumulative-months': '38' })), '[Brightwick] subscribed at [Tier 1] · [38 months]');
  assert.equal(words(ev('resub', { 'msg-param-sub-plan': '3000', 'msg-param-cumulative-months': '2' })), '[Brightwick] subscribed at [Tier 3] · [2 months]');
  assert.equal(words(ev('resub', { 'msg-param-cumulative-months': '2' })), '[Brightwick] subscribed · [2 months]', 'without its tier');
  assert.equal(words(ev('subgift', { 'msg-param-recipient-display-name': 'Tinroof' })), '[Brightwick] gifted a sub to [Tinroof]');
  assert.equal(words(ev('subgift', {})), '[Brightwick] gifted a sub to [someone]');
  assert.equal(words(ev('submysterygift', { 'msg-param-mass-gift-count': '5' })), '[Brightwick] gifted [5 subs] to q’s community');
  assert.equal(words(ev('submysterygift', { 'msg-param-mass-gift-count': '1' })), '[Brightwick] gifted [1 sub] to q’s community');
  // their tier, whose community (the channel as Twitch's words name it, else its login), how many the gifter has given there
  const gifted = (prm, system) => words(ev('submysterygift', { 'msg-param-mass-gift-count': '5', 'msg-param-sub-plan': '1000', 'system-msg': system || "the\\ssite's\\swords", ...prm }));
  assert.equal(gifted({ 'msg-param-sender-count': '1475' }, "Brightwick\\sis\\sgifting\\s5\\sTier\\s1\\sSubs\\sto\\sQuietKoala's\\scommunity!"), '[Brightwick] gifted [5 Tier 1 subs] to QuietKoala’s community · [1,475] total in the channel');
  assert.equal(gifted({ 'msg-param-sender-count': '0' }), '[Brightwick] gifted [5 Tier 1 subs] to q’s community', 'an anonymous or hidden total: left out; the channel from its line');
  assert.equal(gifted({ 'msg-param-sub-plan': '2000' }), '[Brightwick] gifted [5 Tier 2 subs] to q’s community');
  assert.equal(gifted({ 'msg-param-sub-plan': '' }), '[Brightwick] gifted [5 subs] to q’s community', 'without its tier');
  assert.equal(words(ev('subgift', { 'msg-param-recipient-display-name': 'Tinroof', 'msg-param-sub-plan': '2000', 'msg-param-sender-count': '12' })), '[Brightwick] gifted [a Tier 2 sub] to [Tinroof] · [12] total in the channel');
  assert.equal(words(ev('raid', { 'msg-param-displayName': 'Novalynx', 'msg-param-viewerCount': '1200' })), '[Novalynx] raided with [1,200 viewers]');
  assert.equal(words(ev('viewermilestone', { 'msg-param-value': '7' })), '[Brightwick] watched [7 streams] in a row');
  assert.equal(words(ev('giftpaidupgrade', {})), '[Brightwick] kept their sub going');
  assert.equal(words(ev('bitsbadgetier', { 'msg-param-threshold': '1000' })), '[Brightwick] earned a [1,000 bits] badge');
  assert.equal(words(ev('modiversary', { 'msg-param-months': '102' })), '[Brightwick] celebrated [102 months] as a moderator');
  assert.equal(words(ev('modiversary', { 'msg-param-months': '1' })), '[Brightwick] celebrated [1 month] as a moderator');
  assert.equal(words(ev('modiversary', {})), "the site's words", 'without its months');
  assert.equal(words(ev('unraid', {})), '[Brightwick] called off the raid');
  const fwd = prm => ev('communitypayforward', { 'msg-param-prior-gifter-id': '7', 'msg-param-prior-gifter-user-name': 'tinroof', ...prm });
  assert.equal(words(fwd({ 'msg-param-prior-gifter-anonymous': 'false', 'msg-param-prior-gifter-display-name': 'Tinroof' })), '[Brightwick] paid forward the gift sub from [Tinroof]');
  assert.equal(words(fwd({ 'msg-param-prior-gifter-anonymous': 'false' })), '[Brightwick] paid forward the gift sub from [tinroof]', 'without a display name: the login');
  assert.equal(words(ev('communitypayforward', {})), '[Brightwick] paid forward the gift sub from [someone]');
  assert.equal(words(fwd({ 'msg-param-prior-gifter-anonymous': 'true', 'msg-param-prior-gifter-display-name': 'AnAnonymousGifter' })), '[Brightwick] paid forward an anonymous gift sub');
  assert.equal(words(ev('charitydonation', {})), "the site's words");
  assert.equal(words(ev('submysterygift', {})), "the site's words", 'without its number');
  // a gift towards the channel's sub goal: where it is now
  const goal = prm => parseTwitch(TW({ 'display-name': 'B', 'msg-id': 'submysterygift', id: 'e', 'msg-param-mass-gift-count': '5', ...prm }, ':tmi.twitch.tv USERNOTICE #q')).goal;
  assert.deepEqual(goal({ 'msg-param-goal-contribution-type': 'NEW_SUBS', 'msg-param-goal-current-contributions': '25', 'msg-param-goal-target-contributions': '10' }), { now: 25, of: 10, what: 'New sub' });
  assert.deepEqual(goal({ 'msg-param-goal-target-contributions': '10' }), { now: 0, of: 10, what: '' });
  assert.equal(goal({}), undefined, 'no goal');
  assert.equal(words(parseTwitch(TW({ 'display-name': 'X', 'msg-id': 'other', id: 'e' }, ':tmi.twitch.tv USERNOTICE #q')).summary), '[X]');
  const ann = parseTwitch(TW({ 'display-name': 'quietkoala', 'msg-id': 'announcement', 'msg-param-color': 'BLUE', id: 'a', 'system-msg': '' }, ':tmi.twitch.tv USERNOTICE #q :scrims at 8pm'));
  assert.equal(ann.kind, 'message'); assert.equal(ann.announce, 'blue'); assert.equal(ann.event, undefined); assert.deepEqual(ann.parts, [{ text: 'scrims at 8pm' }]);
  assert.equal(parseTwitch(TW({ 'msg-id': 'announcement', id: 'a' }, ':tmi.twitch.tv USERNOTICE #q :hi')).announce, 'primary');
});

test('Twitch: a channel points reward with text is a message marked as a redeem', async () => {
  const { parseTwitch } = await load();
  assert.deepEqual(parseTwitch(TW({ 'custom-reward-id': 'abc', id: 'r1', 'display-name': 'tinroof' }, ':tinroof!t@t PRIVMSG #q :play the new map')).redeem, { title: '', color: '' });
});

test('Twitch: a pin and its taking down, from its other connection (as Twitch sent them)', async () => {
  const { parseTwitch } = await load();
  const PIN = "{\"notification\":{\"subscription\":{\"id\":\"BPkHroKUNkrfvl-GDeMgx\"},\"type\":\"pubsub\",\"pubsub\":\"{\\\"type\\\":\\\"pin-message\\\",\\\"data\\\":{\\\"id\\\":\\\"e9ba29e9-5acb-43e6-beef-11ed92076d8e\\\",\\\"pinned_by\\\":{\\\"id\\\":\\\"111\\\",\\\"login\\\":\\\"quietkoala\\\",\\\"display_name\\\":\\\"QuietKoala\\\"},\\\"message\\\":{\\\"id\\\":\\\"7cc99aa0-cb9d-4902-83fb-919d24e57404\\\",\\\"sender\\\":{\\\"id\\\":\\\"111\\\",\\\"login\\\":\\\"quietkoala\\\",\\\"display_name\\\":\\\"QuietKoala\\\",\\\"badges\\\":[{\\\"id\\\":\\\"broadcaster\\\",\\\"version\\\":\\\"1\\\"},{\\\"id\\\":\\\"haunter\\\",\\\"version\\\":\\\"1\\\"}],\\\"chat_color\\\":\\\"#FF69B4\\\"},\\\"content\\\":{\\\"text\\\":\\\"scrims at 8pm\\\",\\\"fragments\\\":[{\\\"text\\\":\\\"scrims at 8pm\\\"}]},\\\"type\\\":\\\"MOD\\\",\\\"starts_at\\\":1793194900,\\\"updated_at\\\":1793194900,\\\"ends_at\\\":1793196100,\\\"sent_at\\\":1793194897}}}\"},\"id\":\"e3073da7-4393-57e6-a78e-5efcbe47292f-msg0-topic0BPkHroKUNkrfvl-GDeMgx\",\"type\":\"notification\",\"timestamp\":\"2026-10-28T13:41:40.686189434Z\"}";
  const UNPIN = "{\"notification\":{\"subscription\":{\"id\":\"KztRXgi8yqCtaIrJrCQDn\"},\"type\":\"pubsub\",\"pubsub\":\"{\\\"type\\\":\\\"unpin-message\\\",\\\"data\\\":{\\\"id\\\":\\\"e9ba29e9-5acb-43e6-beef-11ed92076d8e\\\",\\\"unpinned_by\\\":{\\\"id\\\":\\\"111\\\",\\\"display_name\\\":\\\"QuietKoala\\\"},\\\"reason\\\":\\\"UNPIN\\\"}}\"},\"id\":\"a768cfc8-7341-500d-9670-ac938deaf89a-msg0-topic0KztRXgi8yqCtaIrJrCQDn\",\"type\":\"notification\",\"timestamp\":\"2026-10-28T13:45:15.257694191Z\"}";
  const p = parseTwitch(PIN);
  assert.equal(p.kind, 'pin'); assert.equal(p.id, 'e9ba29e9-5acb-43e6-beef-11ed92076d8e'); assert.equal(p.by, 'QuietKoala');
  assert.equal(p.msg.sender, 'QuietKoala'); assert.equal(p.msg.login, 'quietkoala'); assert.equal(p.msg.color, '#FF69B4'); assert.deepEqual(p.msg.badges, ['host']);
  assert.deepEqual(p.msg.parts, [{ text: 'scrims at 8pm' }]);
  const u = parseTwitch(UNPIN);   // (parsed once: its time is when it was read)
  assert.deepEqual(u, { site: 'twitch', kind: 'unpin', id: 'e9ba29e9-5acb-43e6-beef-11ed92076d8e', t: u.t });
  const emote = JSON.stringify({ notification: { pubsub: JSON.stringify({ type: 'pin-message', data: { id: 'p2', message: { id: 'm2', sender: { login: 'a', display_name: 'A' }, content: { text: 'hi Kappa', fragments: [{ text: 'hi ' }, { text: 'Kappa', emoticon: { emoticonID: '25' } }] } } } }) } });
  assert.deepEqual(parseTwitch(emote).msg.parts, [{ text: 'hi ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }]);
  for (const f of ['{}', '{"notification":{"pubsub":"{\\"type\\":\\"viewcount\\",\\"data\\":{}}"}}', '{ not json']) assert.equal(parseTwitch(f), null, f);
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

test('Twitch: your own message held by AutoMod (its id and status: not a moderator\'s queue, with the whole message); Twitch\'s marks on a message', async () => {
  const { parseTwitch, KNOWN, ignoredWhy } = await load();
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  const a = parseTwitch(hermes('automod_caught_message', { message_id: 'm7', status: 'pending' }));
  assert.deepEqual([a.kind, a.msgId, a.status], ['automod', 'm7', 'PENDING']);
  assert.equal(parseTwitch(hermes('automod_caught_message', { message_id: 'm7' })), null, 'without a status');
  assert.equal(parseTwitch(hermes('automod_caught_message', { message: { id: 'm8', content: { text: 'hi' } }, status: 'PENDING' })).kind, 'held', 'with the whole message: a moderator\'s queue');
  const h = parseTwitch(hermes('chat-highlight', { msg_id: 'm9', highlights: [{ type: 'raider', seconds_since_event: 254 }, {}] }));
  assert.deepEqual([h.kind, h.msgId, h.marks], ['marks', 'm9', [{ type: 'raider', secs: 254 }]]);
  assert.equal(parseTwitch(hermes('chat-highlight', { msg_id: 'm9', highlights: [] })), null, 'no marks');
  for (const k of ['hermes:automod_caught_message', 'hermes:chat-highlight']) assert.ok(KNOWN.twitch[k] && !ignoredWhy('twitch', k), k);
});

test('Twitch: a message AutoMod held, to moderators (the whole message, why, then who let it through); a suspicious user\'s flags on a message', async () => {
  const { parseTwitch, KNOWN, ignoredWhy } = await load();
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  // (as a report had them, #221)
  const caught = (extra = {}) => ({ id: 'id269', content_classification: { category: 'smart-detection', level: 2 },
    message: { content: { text: 'word word', fragments: [{ text: 'word ' }, { text: 'Kappa', emoticon: { emoticonID: '25' } }] }, id: 'id269', channel_id: 'id89', channel_login: 'user46',
      sender: { user_id: 'id138', login: 'User104', display_name: 'User104', chat_color: '#8A2BE2', badges: [{ id: 'subscriber', version: '3' }] }, sent_at: '2026-11-01T22:17:50.999069824Z' },
    reason_code: 'AutoModCaughtMessageReason', resolver_id: '', resolver_login: '', status: 'PENDING', ...extra });
  const h = parseTwitch(hermes('automod_caught_message', caught()));
  assert.deepEqual([h.kind, h.id, h.status, h.why, h.by], ['held', 'id269', 'PENDING', 'Smart detection · level 2', '']);
  assert.deepEqual([h.msg.kind, h.msg.id, h.msg.sender, h.msg.login, h.msg.color, h.msg.userId, h.msg.badges, h.msg.t],
    ['message', 'id269', 'User104', 'user104', '#8A2BE2', 'id138', ['sub'], Date.parse('2026-11-01T22:17:50.999Z')]);
  assert.deepEqual(h.msg.parts, [{ text: 'word ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }]);
  const ok = parseTwitch(hermes('automod_caught_message', caught({ content_classification: { category: 'unknown', level: 0 }, reason_code: '', resolver_login: 'user117', status: 'ALLOWED' })));
  assert.deepEqual([ok.status, ok.by, ok.why], ['ALLOWED', 'user117', '']);
  assert.equal(parseTwitch(hermes('automod_caught_message', caught({ content_classification: { category: 'unknown', level: 0 }, reason_code: 'LinkCaughtMessageReason' }))).why, 'Link', 'not a category: why from its reason');
  assert.equal(parseTwitch(hermes('automod_caught_message', caught({ status: '' }))), null, 'without a status');
  assert.equal(parseTwitch(hermes('automod_caught_message', { message: { content: { text: 'hi' } }, status: 'PENDING' })), null, 'without the message\'s id');
  const lt = (u, extra = {}) => hermes('low_trust_user_new_message', { low_trust_user: { id: 'id138', sender: { login: 'user104' }, types: ['DETECTED_BAN_EVADER'], ...u },
    message_content: { text: 'word' }, message_id: 'id269', sent_at: '2026-11-01T22:17:50Z', ...extra });
  const f = parseTwitch(lt({ ban_evasion_evaluation: 'POSSIBLE_EVADER', treatment: 'ACTIVE_MONITORING' }));
  assert.deepEqual([f.kind, f.msgId, f.flags, f.sender, f.login, f.text], ['flags', 'id269', ['evader-possible', 'monitored'], 'user104', 'user104', 'word'], 'who and what, for Settings › Flagged');
  assert.equal(f.msg, undefined, 'not restricted: its message comes on the chat\'s connection');
  // restricted: only moderators see it, and only from this, so the whole message comes with it
  const r = parseTwitch(lt({ ban_evasion_evaluation: 'LIKELY_EVADER', treatment: 'RESTRICTED', sender: { user_id: 'id138', login: 'user104', display_name: 'User104' } },
    { message_content: { text: 'word Kappa', fragments: [{ text: 'word ' }, { text: 'Kappa', emoticon: { emoticonID: '25' } }] } }));
  assert.deepEqual(r.flags, ['evader-likely', 'restricted']);
  assert.deepEqual([r.msg.kind, r.msg.id, r.msg.sender, r.msg.login, r.msg.userId, r.msg.t], ['message', 'id269', 'User104', 'user104', 'id138', Date.parse('2026-11-01T22:17:50Z')]);
  assert.deepEqual(r.msg.parts, [{ text: 'word ' }, { emote: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', name: 'Kappa' }]);
  assert.equal(parseTwitch(lt({ ban_evasion_evaluation: 'UNLIKELY_EVADER', treatment: 'NO_TREATMENT' })), null, 'nothing to flag');
  assert.equal(parseTwitch(lt({ treatment: 'RESTRICTED' }, { message_id: '' })), null, 'without its message');
  for (const k of ['hermes:automod_caught_message', 'hermes:low_trust_user_new_message']) assert.ok(KNOWN.twitch[k] && !ignoredWhy('twitch', k), k);
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
  // the channel it was redeemed in (your own come to every Twitch chat page): the redemption's, or its reward's
  assert.deepEqual([r.room, parseTwitch(hermes('reward-redeemed', redemption({ channel_id: '111' }))).room,
    parseTwitch(hermes('reward-redeemed', redemption({ reward: { title: 'Hydrate!', channel_id: '222' } }))).room], ['', '111', '222']);
  const so = parseTwitch(hermes('create', { shoutoutID: 's9', sourceLogin: 'quietkoala', targetLogin: 'novalynx', targetUserDisplayName: 'Novalynx' }));
  assert.deepEqual([so.kind, so.event, so.text, so.shoutout], ['event', 'shoutout', 'quietkoala shouted out Novalynx', 'tw:novalynx']);
  assert.deepEqual([KNOWN.twitch['hermes:reward-redeemed'], KNOWN.twitch['hermes:create']], ['a reward redeemed (without text)', 'a shoutout']);
  assert.equal(KNOWN.twitch['USERNOTICE:communitypayforward'], 'a gift sub paid forward');
  for (const k of ['USERNOTICE:modiversary', 'USERNOTICE:unraid']) assert.ok(KNOWN.twitch[k] && !ignoredWhy('twitch', k), k);
  for (const k of ['hermes:drop-progress', 'hermes:commercial', 'hermes:watch-streak', 'hermes:mystery-gift-purchase', 'hermes:?', 'hermes:update-message',
    'hermes:ads-schedule-update', 'hermes:points-spent', 'hermes:channel-last-viewed-content-updated', 'hermes:global-last-viewed-content-updated', 'hermes:goal_created', 'hermes:goal_finished', 'hermes:collaboration-status-none', 'hermes:stream-down']) assert.ok(ignoredWhy('twitch', k), k);
  // the hype train: its start, progress, level ups and end are ALL's strip; the rest of its news (conductors, rewards) is Twitch's own panel's
  for (const k of ['hermes:hype-train-start', 'hermes:hype-train-end', 'hermes:hype-train-level-up', 'hermes:hype-train-progression']) assert.ok(KNOWN.twitch[k] && !ignoredWhy('twitch', k), k);
  for (const k of ['hermes:hype-train-conductor-update', 'hermes:hype-train-rewards', 'hermes:hype-train-reward-eligibility'])
    assert.equal(ignoredWhy('twitch', k), 'the hype train’s conductors and rewards (Twitch’s own panel)', k);
  assert.equal(ignoredWhy('kick', 'hermes:hype-train-start'), '', 'Twitch\'s only');
  assert.equal(ignoredWhy('twitch', 'hermes:automod_caught_message'), '', 'read (your own held message), not ignored');
  assert.ok(ignoredWhy('kick', 'KicksBalanceUpdated'), 'your own Kicks balance');
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

test('Shield Mode (to moderators) is left out on purpose: its limits come as the chat\'s modes (updated_room), which ALL shows', async () => {
  const { parseTwitch, ignoredKinds } = await load();
  const shield = { notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'UPDATE_CHANNEL_MODERATION_MODE', data: { is_shield_mode_active: true, shield_mode_last_activated_by: { login: 'user1' } } }) } };
  assert.equal(parseTwitch(JSON.stringify(shield)), null);
  assert.match(ignoredKinds({ twitch: { 'hermes:UPDATE_CHANNEL_MODERATION_MODE': {} } }).twitch['hermes:UPDATE_CHANNEL_MODERATION_MODE'], /^Shield Mode on or off/);
  // the modes it set, in the same moment: followers-only, slow mode and verified accounts only
  const room = { notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'updated_room', data: { room: { modes: { followers_only_duration_minutes: 0, slow_mode_duration_seconds: 3, verified_only_mode_enabled: true, subscribers_only_mode_enabled: false, emote_only_mode_enabled: false } } } }) } };
  assert.deepEqual(parseTwitch(JSON.stringify(room)).modes, { slow: 3, followers: 0, subs: false, emotes: false, verified: true });
});

test('Twitch\'s hype train (its other connection, and its GraphQL): started, moving along, a level up, ended; its conductors left out', async () => {
  const { parseTwitch, hypeTrain } = await load();
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  // as a real start came (its shape, the names and numbers made up)
  const start = parseTwitch(hermes('hype-train-start', { __typename: 'HypeTrainExecution', id: 'ht-9', startedAt: '2026-10-30T22:11:02.490Z', expiresAt: '2026-10-30T22:16:02.490Z', endedAt: null,
    isGoldenKappaTrain: false, progress: { __typename: 'HypeTrainProgress', id: 'ht-9', goal: 3000, progression: 2700, total: 10500, level: { value: 5, goal: 10800, rewards: [] } } }));
  assert.deepEqual({ ...start, t: 0 }, { site: 'twitch', kind: 'hype', state: 'start', id: 'ht-9', t: 0, level: 5, value: 2700, goal: 3000, expires: Date.parse('2026-10-30T22:16:02.490Z'), golden: false });
  // its other news, in either naming: the same train (a conductor's id has its source on the end)
  const lv = parseTwitch(hermes('hype-train-level-up', { id: 'ht-9', expiresAt: '2026-10-30T22:21:00Z', isGoldenKappaTrain: true, progress: { goal: 3500, progression: 120, level: { value: 6 } } }));
  assert.deepEqual([lv.state, lv.id, lv.level, lv.value, lv.goal, lv.golden], ['level-up', 'ht-9', 6, 120, 3500, true]);
  // a level up as it came (its shape, the ids and numbers made up): its numbers without an id, the train in hype_train
  const lv6 = parseTwitch(hermes('hype-train-level-up', { time_to_expire: 1794014430000, progress: { level: { value: 6, goal: 14500, rewards: [] }, value: 200, goal: 3700, total: 11000, remaining_seconds: 299 },
    hype_train: { __typename: 'HypeTrainExecution', id: 'ht-7', expiresAt: '2026-11-07T01:20:30.856Z', endedAt: null, isGoldenKappaTrain: false,
      progress: { __typename: 'HypeTrainProgress', id: 'ht-7', goal: 3700, progression: 200, total: 11000, level: { value: 6, goal: 14500, rewards: [] } } } }));
  assert.deepEqual({ ...lv6, t: 0 }, { site: 'twitch', kind: 'hype', state: 'level-up', id: 'ht-7', t: 0, level: 6, value: 200, goal: 3700, expires: Date.parse('2026-11-07T01:20:30.856Z'), golden: false });
  assert.equal(parseTwitch(hermes('hype-train-level-up', { progress: { level: { value: 6 }, goal: 3700 }, hype_train: null })), null, 'no id, no train');
  const before = Date.now(), old = parseTwitch(hermes('hype-train-progression', { execution_id: 'ht-9-SUBS', progress: { level: { value: 6 }, value: 900, goal: 3500, remaining_seconds: 200 } }));
  assert.deepEqual([old.state, old.id, old.level, old.value, old.goal], ['progression', 'ht-9', 6, 900, 3500]);
  assert.ok(old.expires >= before + 200000 && old.expires <= Date.now() + 200000, 'its time left, from now');
  assert.equal(parseTwitch(hermes('hype-train-progression', { id: 'ht-9', progress: { level: { value: 6 }, progression: 950 } })).expires, 0, 'no time said: kept as it was (ALL\'s)');
  assert.deepEqual({ ...parseTwitch(hermes('hype-train-end', { id: 'ht-9', ended_at: 1793398562000, ending_reason: 'COMPLETED' })), t: 0 }, { site: 'twitch', kind: 'hype', state: 'end', id: 'ht-9', t: 0 });
  assert.equal(parseTwitch(hermes('hype-train-conductor-update', { id: 'ht-9-SUBS', source: 'SUBS', user: { login: 'someone' } })), null);
  // nothing to show
  assert.equal(parseTwitch(hermes('hype-train-start', { progress: { goal: 1, level: { value: 1 } } })), null, 'no id');
  assert.equal(parseTwitch(hermes('hype-train-progression', { id: 'x', progress: {} })), null, 'no level or goal');
  assert.equal(hypeTrain('start', null), null);
  // GraphQL's running train (in-site/feed.js hypeAgent): read as a start; one that has ended, its end
  assert.equal(hypeTrain('start', { id: 'ht-2', expiresAt: '2026-10-30T22:16:02Z', progress: { goal: 2000, progression: 500, level: { value: 2 } } }).level, 2);
  assert.equal(hypeTrain('start', { id: 'ht-2', endedAt: '2026-10-30T22:16:02Z', progress: { goal: 2000, level: { value: 2 } } }).state, 'end');
});

test('Twitch: a poll\'s votes (each a share, and how many) and its time left; its results once completed or ended early; archived', async () => {
  const { parseTwitch, KNOWN, ignoredWhy } = await load();
  // (as Twitch's other connection sends them: POLL_CREATE, POLL_UPDATE, POLL_COMPLETE, POLL_ARCHIVE)
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  const choice = (title, total) => ({ choice_id: 'c-' + title, title, votes: { total, bits: 0, channel_points: 0, base: total, granted: 0 }, tokens: { bits: 0, channel_points: 0 }, total_voters: total });
  const poll = (type, status, votes, left) => parseTwitch(hermes(type, { poll: { poll_id: 'p1', title: ' Which game next? ', duration_seconds: 180, status, settings: { multi_choice: { is_enabled: true } },
    choices: [choice('Deadlock', votes[0]), choice('Balatro', votes[1]), choice(' ', 0)], votes: { total: votes[0] + votes[1] }, remaining_duration_milliseconds: left } }));
  const before = Date.now();
  let m = poll('POLL_CREATE', 'ACTIVE', [0, 0], 179983);
  assert.deepEqual([m.site, m.kind, m.state, m.id, m.question, m.meta], ['twitch', 'poll', 'update', 'p1', 'Which game next?', '0 votes']);
  assert.deepEqual(m.choices, [{ text: 'Deadlock', ratio: 0 }, { text: 'Balatro', ratio: 0 }], 'no votes yet; an empty one left out');
  assert.ok(m.ends >= before + 179983 && m.ends <= Date.now() + 179983);
  m = poll('POLL_UPDATE', 'ACTIVE', [3, 1], 116201);
  assert.deepEqual([m.meta, m.choices.map(c => c.ratio)], ['4 votes', [0.75, 0.25]]);
  assert.equal(poll('POLL_UPDATE', 'ACTIVE', [1, 0], 1000).meta, '1 vote');
  for (const type of ['POLL_COMPLETE', 'POLL_TERMINATE']){
    m = poll(type, 'COMPLETED', [6, 2], 0);
    assert.ok(m.ends <= Date.now(), `${type}: its time is up`);
    assert.deepEqual([m.state, m.meta, m.until - m.ends], ['update', '8 votes', 5 * 60000], `${type}: its results, until it's archived (or 5 minutes)`);
  }
  assert.deepEqual({ ...poll('POLL_ARCHIVE', 'ARCHIVED', [6, 2], 0), t: 0 }, { site: 'twitch', kind: 'poll', state: 'close', id: 'p1', t: 0 });
  assert.equal(parseTwitch(hermes('POLL_UPDATE', { poll: { poll_id: 'p1', choices: [] } })), null, 'no choices');
  assert.equal(parseTwitch(hermes('POLL_UPDATE', { poll: { choices: [choice('a', 1)] } })), null, 'no id');
  for (const k of ['POLL_CREATE', 'POLL_UPDATE', 'POLL_COMPLETE', 'POLL_TERMINATE', 'POLL_ARCHIVE']) assert.ok(KNOWN.twitch['hermes:' + k] && !ignoredWhy('twitch', 'hermes:' + k), k);
});
