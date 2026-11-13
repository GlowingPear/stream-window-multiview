// YouTube's chat data as ALL's messages (src/page/sites/youtube/feed.js; what a message is: src/page/chat/feed-parse.js).
// The lines and frames are made up, in the shape YouTube sends them (recorded from its own connections for issue #203).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '../../../../..');
// its reader, with what ALL says about the kinds it reads (chat/feed-parse.js)
const load = async () => {
  globalThis.SmvSites = require(path.join(ROOT, 'src/shared/sites.js'));
  const { youtubeFeed: feed } = await import(path.join(ROOT, 'src/page/sites/youtube/feed.js'));
  const { feedParse } = await import(path.join(ROOT, 'src/page/chat/feed-parse.js'));
  return { ...feed, parseYouTube: feed.parse, KNOWN: feedParse.known(), ignoredWhy: feedParse.ignoredWhy, ignoredKinds: feedParse.ignoredKinds, leftOut: feedParse.leftOut, parseFeed: feedParse.parseFeed };
};
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
  // marked deleted ("Message deleted" where it was): the same as taken away
  const marked = parseYouTube({ clickTrackingParams: 'x', markChatItemAsDeletedAction: { deletedStateMessage: { runs: [{ text: 'Message deleted' }] }, targetItemId: 'y1' } });
  assert.deepEqual([marked.site, marked.kind, marked.target], ['youtube', 'delete', 'y1']);
  assert.equal(parseYouTube({ markChatItemAsDeletedAction: { deletedStateMessage: {} } }), null, 'without which message');
  for (const a of [YT('liveChatViewerEngagementMessageRenderer', { id: 'z' }), YT('liveChatTextMessageRenderer', {}), { addLiveChatTickerItemAction: {} }, null, 'x'])
    assert.equal(parseYouTube(a), null);
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

test('YouTube: a message held for review, to moderators (the whole message, YouTube\'s own line); shown, it takes the held one\'s place', async () => {
  const { parseYouTube, KNOWN, ignoredWhy } = await load();
  // (as a report had it, #221)
  const inner = { message: { runs: [{ text: 'word' }] }, authorName: { simpleText: 'user124' }, authorPhoto: { thumbnails: [] }, id: 'id391', timestampUsec: '1793486171039581', authorExternalChannelId: 'id392' };
  const held = (extra = {}) => YT('liveChatAutoModMessageRenderer', { id: 'id391', timestampUsec: '1793486171039581', autoModeratedItem: { liveChatTextMessageRenderer: inner },
    headerText: { runs: [{ text: 'Held for review. Only you and other moderators can see this' }] }, moderationButtons: [], ...extra });
  const h = parseYouTube(held());
  assert.deepEqual([h.kind, h.id, h.status, h.why, h.note, h.t], ['held', 'id391', 'PENDING', '', 'Held for review. Only you and other moderators can see this', 1793486171040]);
  assert.deepEqual([h.msg.kind, h.msg.id, h.msg.sender, h.msg.userId, h.msg.parts], ['message', 'id391', 'user124', 'id392', [{ text: 'word' }]]);
  assert.equal(parseYouTube(held({ autoModeratedItem: {} })), null, 'without its message');
  assert.equal(parseYouTube(held({ headerText: undefined })).note, '');
  const shown = parseYouTube({ replaceChatItemAction: { targetItemId: 'id391', replacementItem: { liveChatTextMessageRenderer: { ...inner, id: 'other' } } } });
  assert.deepEqual([shown.kind, shown.id], ['message', 'id391'], 'shown: as the held one\'s id');
  const k = 'addChatItemAction:liveChatAutoModMessageRenderer';
  assert.ok(KNOWN.youtube[k] && !ignoredWhy('youtube', k));
});

test('YouTube: a gift is an event (its words, the gift picked out); a held message let through takes its stand-in\'s place; its stand-ins, the ticker and its own notice are ignored, with why', async () => {
  const { parseYouTube, parseFeed, KNOWN, ignoredWhy, leftOut } = await load();
  const gift = (text, extra = {}) => YT('giftMessageViewModel', { id: 'g1', text: { content: text }, authorName: { content: '@Mika ' }, authorAvatar: {}, ...extra });
  const g = parseYouTube(gift('sent Pepero yummy!'));
  assert.deepEqual([g.kind, g.event, g.id, g.sender, g.login, g.text, g.parts], ['event', 'gift', 'g1', '@Mika', 'mika', '@Mika sent Pepero yummy!', []]);
  assert.deepEqual(g.summary, [{ strong: '@Mika' }, { text: ' sent ' }, { strong: 'Pepero yummy!' }]);
  assert.ok(Math.abs(g.t - Date.now()) < 5000, 'no time of its own: now');
  assert.equal(parseYouTube(gift('sent x', { timestampUsec: '1793161469214882' })).t, 1793161469215);
  assert.deepEqual(parseYouTube(gift('gave a heart')).summary, [{ strong: '@Mika' }, { text: ' gave a heart' }], 'other words: as they are');
  assert.equal(parseYouTube(YT('giftMessageViewModel', { id: 'g2' })).text, 'Someone sent a gift', 'without its words or name');
  assert.equal(KNOWN.youtube['addChatItemAction:giftMessageViewModel'], 'a gift');
  // let through: as the stand-in's id (one already here isn't shown twice)
  const msg = { id: 'real', authorName: { simpleText: '@Mika' }, timestampUsec: '1', message: { runs: [{ text: 'held' }] } };
  const r = parseYouTube({ replaceChatItemAction: { targetItemId: 'stand', replacementItem: { liveChatTextMessageRenderer: msg } } });
  assert.deepEqual([r.kind, r.id, r.parts], ['message', 'stand', [{ text: 'held' }]]);
  assert.equal(parseYouTube({ replaceChatItemAction: { replacementItem: { liveChatTextMessageRenderer: msg } } }).id, 'real');
  assert.equal(parseYouTube({ replaceChatItemAction: { targetItemId: 'stand' } }), null);
  assert.ok(KNOWN.youtube['replaceChatItemAction:liveChatTextMessageRenderer']);
  // ignored: read by no reader, but not unreadable either
  const stand = YT('liveChatPlaceholderItemRenderer', { id: 'p1', timestampUsec: '1' }), ticker = { clickTrackingParams: 'x', addLiveChatTickerItemAction: { item: { liveChatTickerPaidMessageItemRenderer: { id: 't1' } } } };
  const notice = YT('liveChatViewerEngagementMessageRenderer', { id: 'n1', message: { runs: [{ text: 'Welcome to live chat!' }] } });
  for (const a of [stand, ticker, notice]){ assert.deepEqual(parseFeed({ s: 'youtube', raw: [a] }), []); assert.equal(leftOut('youtube', a), true); }
  for (const k of ['addChatItemAction:liveChatPlaceholderItemRenderer', 'addChatItemAction:liveChatViewerEngagementMessageRenderer', 'addLiveChatTickerItemAction:liveChatTickerPaidMessageItemRenderer',
    'addLiveChatTickerItemAction:liveChatTickerSponsorItemRenderer']) assert.ok(ignoredWhy('youtube', k), k);
  assert.equal(ignoredWhy('youtube', 'addChatItemAction:somethingNew'), '');
  for (const [s, k] of [['kick', 'ChatMessageSentEvent'], ['twitch', 'hermes:stream-up'], ['twitch', 'hermes:favorite-channel-update'],
    ['twitch', 'hermes:collaboration-status-refetch'], ['kick', 'ChatSettingsChanged'], ['kick', 'GoalCreatedEvent'], ['kick', 'GoalAchievedEvent'], ['twitch', 'hermes:automatic-reward-redeemed'], ['twitch', 'hermes:group-updated'], ['twitch', 'hermes:group-created'], ['twitch', 'hermes:call-started'], ['twitch', 'hermes:session-started'],
    ['twitch', 'hermes:slot-settings-changed'], ['twitch', 'hermes:call-ended']]) assert.ok(ignoredWhy(s, k), k);
  for (const [s, a] of [['youtube', YT('somethingNew', { id: 'x' })], ['youtube', gift('sent x')], ['youtube', 'x'], ['youtube', null], ['twitch', stand]]) assert.equal(leftOut(s, a), false);
  // YouTube's own housekeeping (that you're in the chat, its moderation state, parts of its page): ignored, and its key is its kind
  const own = [{ clickTrackingParams: 'x', liveChatReportPresenceCommand: { clientMessageId: 'c' } }, { liveChatReportModerationStateCommand: {} }, { clickTrackingParams: 'x', elementsCommand: { setEntityCommand: {} } }];
  for (const a of own){ assert.deepEqual(parseFeed({ s: 'youtube', raw: [a] }), []); assert.equal(leftOut('youtube', a), true, Object.keys(a).pop()); }
  for (const k of ['liveChatReportPresenceCommand', 'liveChatReportModerationStateCommand', 'elementsCommand']) assert.ok(ignoredWhy('youtube', k), k);
  assert.equal(KNOWN.youtube.markChatItemAsDeletedAction, 'a message deleted (marked)');
  assert.equal(leftOut('youtube', { markChatItemAsDeletedAction: { targetItemId: 'y1' } }), false, 'read, not left out');
});

test('Support on YouTube: Super Chats and Stickers (the amount with its currency), new members (not a member for a while), memberships gifted to the chat (not each one given)', async () => {
  const { parseYouTube, parseFeed, leftOut, KNOWN } = await load();
  const who = { authorName: { simpleText: '@Pixelfox' }, authorExternalChannelId: 'UCp', timestampUsec: '1793161469214882' };
  const yt = (type, r) => parseYouTube(YT(type, { id: 'y', ...who, ...r }));
  assert.deepEqual(yt('liveChatPaidMessageRenderer', { purchaseAmountText: { simpleText: '$1,234.50' } }).support, { kind: 'superchat', who: '@Pixelfox', n: 1234.5, amt: '$1,234.50' });
  assert.deepEqual(yt('liveChatPaidMessageRenderer', { purchaseAmountText: { simpleText: '1.234,50 €' } }).support.n, 1234.5, 'a comma for cents');
  assert.deepEqual(yt('liveChatPaidStickerRenderer', { purchaseAmountText: { simpleText: '¥500' } }).support, { kind: 'superchat', who: '@Pixelfox', n: 500, amt: '¥500' }, 'a Super Sticker: as its chat counts it');
  assert.deepEqual(yt('liveChatPaidMessageRenderer', {}).support, { kind: 'superchat', who: '@Pixelfox', n: 1 }, 'no amount: one, no text');
  assert.deepEqual(yt('liveChatMembershipItemRenderer', { headerSubtext: { runs: [{ text: 'Welcome to Koala Club!' }] } }).support, { kind: 'member', who: '@Pixelfox', n: 1 });
  assert.equal(yt('liveChatMembershipItemRenderer', { headerPrimaryText: { runs: [{ text: 'Member for ' }, { text: '6' }, { text: ' months' }] }, headerSubtext: { simpleText: 'Koala Club' } }).support, undefined, 'a member for a while: not support');
  // memberships gifted: the gifter in its header, how many in its words; its shape as YouTube's chat sends it (open-source readers of it)
  const gift = (text, header = {}) => YT('liveChatSponsorshipsGiftPurchaseAnnouncementRenderer', { id: 'g1', timestampUsec: '1793161469214882', authorExternalChannelId: 'UCg',
    header: { liveChatSponsorshipsHeaderRenderer: { authorName: { simpleText: '@Giftowl' }, primaryText: { runs: text }, authorBadges: [{ liveChatAuthorBadgeRenderer: { icon: { iconType: 'MODERATOR' } } }], ...header } } });
  const g = parseYouTube(gift([{ text: 'Sent ' }, { text: '20', bold: true }, { text: ' ' }, { text: 'Koala Club' }, { text: ' gift memberships' }]));
  assert.deepEqual([g.kind, g.event, g.sender, g.login, g.userId, g.badges, g.text, g.t], ['event', 'giftmemberships', '@Giftowl', 'giftowl', 'UCg', ['mod'], '@Giftowl gifted 20 memberships', 1793161469215]);
  assert.deepEqual(g.summary, [{ strong: '@Giftowl' }, { text: ' gifted ' }, { strong: '20 memberships' }]);
  assert.deepEqual(g.support, { kind: 'gifts', unit: 'memberships', who: '@Giftowl', n: 20 });
  assert.deepEqual(parseYouTube(gift([{ text: 'Gifted 1,000 memberships' }])).support.n, 1000, 'its other words, a big one');
  assert.deepEqual(parseYouTube(gift([{ text: 'Sent a gift membership' }])).summary[2], { strong: '1 membership' }, 'no number: one');
  assert.deepEqual([parseYouTube(gift([], { authorName: null })).sender], ['Someone']);
  assert.equal(KNOWN.youtube['addChatItemAction:liveChatSponsorshipsGiftPurchaseAnnouncementRenderer'], 'memberships gifted to the chat');
  // YouTube's note of a moderator's step: a line in its words, bold where it's bold (its shape as a chat sent it)
  const note = runs => parseYouTube(YT('liveChatModerationMessageRenderer', { id: 'n1', timestampUsec: '1794191929058361', message: { runs } }));
  const n = note([{ text: '@Pixelfox', bold: true, italics: true }, { text: ' was hidden by ', italics: true }, { text: '@Koalamod', bold: true, italics: true }, { text: '' }]);
  assert.deepEqual([n.kind, n.event, n.id, n.sender, n.text, n.t], ['event', 'modnote', 'n1', '', '@Pixelfox was hidden by @Koalamod', 1794191929058]);
  assert.deepEqual(n.summary, [{ strong: '@Pixelfox' }, { text: ' was hidden by ' }, { strong: '@Koalamod' }]);
  assert.equal(note([]), null, 'no words');
  assert.ok(KNOWN.youtube['addChatItemAction:liveChatModerationMessageRenderer']);
  // each one given: left out on purpose (the gift is its own line)
  const got = YT('liveChatSponsorshipsGiftRedemptionAnnouncementRenderer', { id: 'g2', ...who, message: { runs: [{ text: 'received a gift membership by ' }, { text: '@Giftowl', bold: true }] } });
  assert.deepEqual(parseFeed({ s: 'youtube', raw: [got] }), []);
  assert.equal(leftOut('youtube', got), true);
});

