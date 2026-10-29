const test = require('node:test');
const assert = require('node:assert/strict');
const { createSampleStore, exportSamples, anonymise, placeholders } = require('../../../src/main/event-samples');

test('the store: counts, first and last heard, the last 3 samples of each kind; other sites and bad input left out', () => {
  let t = 1000;
  const s = createSampleStore({ now: () => t });
  assert.equal(s.add('kick', { GiftedSubscriptionsEvent: { n: 1, x: 'a' } }), true);
  t = 2000; s.add('kick', { GiftedSubscriptionsEvent: { n: 2, x: 'b' }, PointsUpdated: { n: 5 } });
  t = 3000; s.add('kick', { GiftedSubscriptionsEvent: { n: 1, x: 'c' } }); s.add('kick', { GiftedSubscriptionsEvent: { n: 1, x: 'd' } });
  const e = s.list().kick.GiftedSubscriptionsEvent;
  assert.deepEqual([e.n, e.first, e.last, e.samples.map(x => x.x)], [5, 1000, 3000, ['b', 'c', 'd']]);
  assert.deepEqual(s.list().kick.PointsUpdated.samples, [], 'counted without a sample');
  assert.equal(s.add('myspace', { x: { n: 1 } }), false);
  assert.equal(s.add('kick', null), false);
  s.add('twitch', { ['k'.repeat(200)]: { n: 1 }, '': { n: 1 }, ok: 'not an object' });
  assert.deepEqual(s.list().twitch, {});
  s.clear(); assert.deepEqual(s.list(), { kick: {}, twitch: {}, youtube: {} });
});

test('the store keeps what was saved (tidied), and drops the least recently heard kinds past 300', () => {
  const s = createSampleStore({ saved: { kick: { A: { n: 2, first: 1, last: 2, samples: [{ t: 1, x: 'x' }, { t: 2 }, null] }, B: 'bad' }, nope: {} } });
  assert.deepEqual(s.toSave(), { kick: { A: { n: 2, first: 1, last: 2, samples: [{ t: 1, x: 'x' }] } }, twitch: {}, youtube: {} });
  assert.deepEqual(createSampleStore({ saved: 'junk' }).list(), { kick: {}, twitch: {}, youtube: {} });
  let t = 0; const big = createSampleStore({ now: () => ++t });
  for (let i = 0; i < 305; i++) big.add('youtube', { ['k' + i]: { n: 1 } });
  const keys = Object.keys(big.list().youtube);
  assert.equal(keys.length, 300); assert.ok(!keys.includes('k0') && !keys.includes('k4') && keys.includes('k5') && keys.includes('k304'));
});

test('anonymise: Kick\'s events (their data a JSON string inside): names, ids and words out, emotes and the shape kept; the same name, the same placeholder', () => {
  const ph = placeholders();
  const frame = JSON.stringify({ push: { channel: 'chatrooms.4086385.v2', pub: { data: { event: 'App\\Events\\GiftedSubscriptionsEvent',
    data: JSON.stringify({ chatroom_id: 4086385, gifted_usernames: ['mygapa05', 'Koala'], gifter_username: 'yajeli_cry', gifted_total: 2, sender: { id: 28445240, username: 'Koala', profile_picture: 'https://files.kick.com/x.webp' },
      message: { id: 'a9907f20', content: 'cry despierta [emote:2624352:CryKAPPA]' }, gift: { gift_id: 'hype', name: 'Hype' } }) } } } });
  const out = anonymise('kick', frame, ph);
  const d = JSON.parse(out.push.pub.data.data);
  assert.equal(out.push.pub.data.event, 'App\\Events\\GiftedSubscriptionsEvent');
  assert.deepEqual(d.gifted_usernames, ['user1', 'user2']);
  assert.equal(d.gifter_username, 'user3');
  assert.equal(d.sender.username, 'user2', 'Koala again: the same placeholder');
  assert.equal(d.sender.profile_picture, 'https://example.invalid/file1');
  assert.equal(d.message.content, 'word word [emote:2624352:CryKAPPA]');
  assert.equal(d.message.id, 'id1');
  assert.equal(typeof d.chatroom_id, 'number'); assert.notEqual(d.chatroom_id, 4086385);
  assert.equal(d.gifted_total, 2, 'amounts stay');
  assert.deepEqual(d.gift, { gift_id: 'hype', name: 'Hype' }, 'a gift\'s name is not a person');
});

test('anonymise: Twitch\'s chat lines (tags, who, the channel, the words) and its other connection\'s JSON; YouTube\'s actions', () => {
  const ph = placeholders();
  const irc = '@badges=subscriber/12;display-name=TinRoof;id=abc-123;msg-id=resub;room-id=39501193;system-msg=TinRoof\\ssubscribed\\sfor\\s12\\smonths!;user-id=777;msg-param-cumulative-months=12 :tmi.twitch.tv USERNOTICE #quietkoala :love this channel';
  assert.equal(anonymise('twitch', irc, ph),
    '@badges=subscriber/12;display-name=user1;id=id1;msg-id=resub;room-id=id2;system-msg=word\\sword\\sword\\sword\\sword;user-id=id3;msg-param-cumulative-months=12 :user2 USERNOTICE #channel1 :word word word');
  assert.equal(anonymise('twitch', ':tinroof!tinroof@tinroof.tmi.twitch.tv PRIVMSG #quietkoala :hi', ph), ':user1!user1@user1.tmi.twitch.tv PRIVMSG #channel1 :word', 'the same person and channel');
  assert.equal(anonymise('twitch', 'PING :tmi.twitch.tv', ph), 'PING :tmi.twitch.tv');
  const hermes = anonymise('twitch', JSON.stringify({ notification: { pubsub: JSON.stringify({ type: 'pin-message', data: { pinned_by: { display_name: 'NightOwl' }, message: { content: { text: 'giveaway at 500' }, sender: { login: 'quietkoala' } } } }) } }), ph);
  const p = JSON.parse(hermes.notification.pubsub);
  assert.deepEqual([p.type, p.data.pinned_by.display_name, p.data.message.content.text, p.data.message.sender.login], ['pin-message', 'user3', 'word word word', 'user4']);
  const yt = anonymise('youtube', JSON.stringify({ addChatItemAction: { item: { liveChatTextMessageRenderer: { id: 'Ch4x', authorName: { simpleText: '@MikaR' }, authorExternalChannelId: 'UC123', message: { runs: [{ text: 'clip of the ace' }, { emoji: { emojiId: 'e1' } }] } } } } }), ph);
  const r = yt.addChatItemAction.item.liveChatTextMessageRenderer;
  assert.deepEqual([r.id, r.authorName.simpleText, r.authorExternalChannelId, r.message.runs[0].text, r.message.runs[1].emoji.emojiId], ['id4', 'user5', 'id5', 'word word word word', 'e1']);
  assert.equal(anonymise('kick', 'not json at all', ph), 'word word word word');
});

test('the export: each kind with what ALL does with it (or unknown), the kinds ALL knows that haven\'t come, newest first, anonymised', () => {
  let t = Date.UTC(2026, 9, 29, 12);
  const s = createSampleStore({ now: () => t });
  s.add('kick', { ChatMessageEvent: { n: 10, x: JSON.stringify({ content: 'hello there', sender: { username: 'Koala' } }) } });
  t += 1000; s.add('kick', { NewActivityFeedEvent: { n: 1, x: JSON.stringify({ username: 'Koala' }) } });
  const out = exportSamples(s.list(), { kick: { ChatMessageEvent: 'a message', StreamHostEvent: 'a raid' } }, { now: () => t, version: '0.3.31' });
  assert.equal(out.version, '0.3.31'); assert.equal(out.made, '2026-10-29T12:00:01.000Z');
  assert.deepEqual(out.sites.kick.needed, ['StreamHostEvent']);
  assert.deepEqual(out.sites.kick.kinds.map(k => [k.kind, k.status, k.does, k.n]), [['NewActivityFeedEvent', 'unknown', '', 1], ['ChatMessageEvent', 'shown', 'a message', 10]]);
  assert.deepEqual(out.sites.kick.kinds.map(k => k.samples[0]), [{ username: 'user1' }, { content: 'word word', sender: { username: 'user1' } }]);
  assert.deepEqual(out.sites.twitch, { needed: [], kinds: [] });
  assert.deepEqual(exportSamples({}, null).sites.youtube, { needed: [], kinds: [] });
  // left out on purpose (the page says why): ignored, with why; not unknown
  s.add('twitch', { '001': { n: 1 }, 'hermes:mystery': { n: 1 } });
  assert.deepEqual(exportSamples(s.list(), {}, { ignored: { twitch: { '001': 'the connection’s own' }, kick: 'bad' } }).sites.twitch.kinds.map(k => [k.kind, k.status, k.does]).sort(), [['001', 'ignored', 'the connection’s own'], ['hermes:mystery', 'unknown', '']]);
});
