const test = require('node:test');
const assert = require('node:assert/strict');
const { createSampleStore, exportSamples, anonymise, placeholders } = require('../../../src/main/event-samples');

test('the store: counts, first and last heard, the last 3 samples of each kind; other sites and bad input left out', () => {
  let t = 1000;
  const s = createSampleStore({ now: () => t });
  assert.equal(s.add('kick', { GiftedSubscriptionsEvent: { n: 1, xs: ['a'] } }), true);
  t = 2000; s.add('kick', { GiftedSubscriptionsEvent: { n: 2, xs: ['b'] }, PointsUpdated: { n: 5 } });
  t = 3000; s.add('kick', { GiftedSubscriptionsEvent: { n: 1, xs: ['c'] } }); s.add('kick', { GiftedSubscriptionsEvent: { n: 1, xs: ['d'] } });
  const e = s.list().kick.GiftedSubscriptionsEvent;
  assert.deepEqual([e.n, e.first, e.last, e.samples.map(x => x.x)], [5, 1000, 3000, ['b', 'c', 'd']]);
  assert.deepEqual(s.list().kick.PointsUpdated.samples, [], 'counted without a sample');
  assert.equal(s.add('myspace', { x: { n: 1 } }), false);
  assert.equal(s.add('kick', null), false);
  s.add('twitch', { ['k'.repeat(200)]: { n: 1 }, '': { n: 1 }, ok: 'not an object' });
  assert.deepEqual(s.list().twitch, {});
  s.clear(); assert.deepEqual(s.list(), { kick: {}, twitch: {}, youtube: {} });
});

test('the store: several samples at once (newest last, at most 3, text only); an old x alone is counted without a sample', () => {
  let t = 1000;
  const s = createSampleStore({ now: () => t });
  s.add('twitch', { A: { n: 5, xs: ['a', 'b', 7, '', 'c', 'd'] }, B: { n: 1, x: 'old' }, C: { n: 1, xs: 'nope' } });
  assert.deepEqual(s.list().twitch.A.samples, [{ t, x: 'a' }, { t, x: 'b' }, { t, x: 'c' }], 'the first 3 it sent; not a number or an empty one');
  assert.deepEqual([s.list().twitch.B.n, s.list().twitch.B.samples, s.list().twitch.C.samples], [1, [], []]);
  s.add('twitch', { A: { n: 1, xs: ['x'.repeat(9000)] } });
  assert.equal(s.list().twitch.A.samples[2].x.length, 8000, 'cut to its size');
});

test('the store keeps each variant past 3 samples: the oldest one whose status a newer one has goes first', () => {
  const held = st => JSON.stringify({ type: 'automod_caught_message', data: JSON.stringify({ status: st, message: { id: 'm' } }) });
  const s = createSampleStore();
  const kinds = () => s.list().twitch['hermes:automod_caught_message'].samples.map(x => /PENDING|ALLOWED|DENIED/.exec(x.x)[0]);
  s.add('twitch', { 'hermes:automod_caught_message': { n: 1, xs: [held('PENDING')] } });
  for (let i = 0; i < 5; i++) s.add('twitch', { 'hermes:automod_caught_message': { n: 1, xs: [held('ALLOWED')] } });
  assert.deepEqual(kinds(), ['PENDING', 'ALLOWED', 'ALLOWED'], 'a PENDING outlasts many ALLOWEDs (in escaped JSON)');
  s.add('twitch', { 'hermes:automod_caught_message': { n: 2, xs: [held('DENIED'), held('ALLOWED')] } });
  assert.deepEqual(kinds(), ['PENDING', 'DENIED', 'ALLOWED']);
  s.add('twitch', { 'hermes:automod_caught_message': { n: 1, xs: [held('PENDING')] } });
  assert.deepEqual(kinds(), ['DENIED', 'ALLOWED', 'PENDING'], 'the older PENDING goes for the newer one');
  s.add('twitch', { 'hermes:automod_caught_message': { n: 1, xs: [JSON.stringify({ moderation_action: 'ban' })] } });
  assert.deepEqual(s.list().twitch['hermes:automod_caught_message'].samples.length, 3);
  assert.match(s.list().twitch['hermes:automod_caught_message'].samples[2].x, /ban/, 'every one differs: the oldest goes');
  assert.doesNotMatch(s.list().twitch['hermes:automod_caught_message'].samples.map(x => x.x).join(), /DENIED/);
  // samples without a status count as one variant: the oldest of them goes first, a status kept
  const p = createSampleStore();
  p.add('kick', { E: { n: 4, xs: ['{"status":"live"}', 'a', 'b'] } }); p.add('kick', { E: { n: 1, xs: ['c'] } });
  assert.deepEqual(p.list().kick.E.samples.map(x => x.x), ['{"status":"live"}', 'b', 'c']);
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
  s.add('kick', { ChatMessageEvent: { n: 10, xs: [JSON.stringify({ content: 'hello there', sender: { username: 'Koala' } })] } });
  t += 1000; s.add('kick', { NewActivityFeedEvent: { n: 1, xs: [JSON.stringify({ username: 'Koala' })] } });
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

test('ALL\'s report for a fix: each site\'s state, its last raw messages anonymised (one set of placeholders), its line\'s HTML, and its chat events', () => {
  const { healthReport } = require('../../../src/main/event-samples');
  const s = createSampleStore({ now: () => 1000 });
  s.add('kick', { ChatMessageEvent: { n: 3, xs: [JSON.stringify({ content: 'hi there', sender: { username: 'Koala' } })] }, PointsUpdated: { n: 9 } });
  const out = healthReport({ known: { kick: { ChatMessageEvent: 'a message' } }, ignored: { kick: { PointsUpdated: 'your channel points' } }, sites: [
    { site: 'kick', state: 'broken', what: 'read', why: "ALL isn't reading Kick's messages: its chat has new ones", since: '2026-10-29T03:00:00.000Z', sends: ['no-box'], lines: 50,
      raws: [JSON.stringify({ push: { pub: { data: { event: 'App\\Events\\NewThing', data: JSON.stringify({ username: 'Koala', text: 'secret words' }) } } } })], badRaws: ['not json at all'], lineHtml: '<div class="x">word</div>' },
    { site: 'myspace' }, null] }, s.list(), { now: () => 2000, version: '0.3.31' });
  assert.equal(out.sites.length, 1);
  const k = out.sites[0];
  assert.deepEqual([k.state, k.what, k.lines, k.sends, k.lineHtml], ['broken', 'read', 50, ['no-box'], '<div class="x">word</div>']);
  assert.deepEqual(JSON.parse(k.raws[0].push.pub.data.data), { username: 'user1', text: 'word word' });
  assert.deepEqual(k.badRaws, ['word word word word']);
  assert.deepEqual(k.events.kinds.filter(x => x.samples.length).map(x => [x.kind, x.status, x.samples[0].sender.username]), [['ChatMessageEvent', 'shown', 'user1']], 'Koala: the same placeholder in the events');
  assert.deepEqual(k.events.kinds.map(x => [x.kind, x.status, x.does]).sort(), [['ChatMessageEvent', 'shown', 'a message'], ['PointsUpdated', 'ignored', 'your channel points']], 'left out on purpose: ignored, with why, as in the export');
  assert.ok(!/Koala|secret|hi there/.test(JSON.stringify(out)));
  assert.deepEqual(healthReport(null, {}).sites, []);
});

test('anonymise: names go by what a field is called, wherever it is (raids, clips, shoutouts, the stream\'s title); titles\' words out; a reward\'s title and categories kept', () => {
  const ph = placeholders();
  const hermes = pubsub => JSON.parse(anonymise('twitch', JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify(pubsub) } }), ph).notification.pubsub);
  const raid = hermes({ type: 'raid_update_v2', raid: { id: 'r-77', source_id: '4411', source_display_name: 'MapleFern', source_profile_image: 'https://cdn.example/maple.png', source_stream_category: 'music',
    target_id: '5522', target_login: 'driftwoodjay', target_display_name: 'DriftwoodJay', target_profile_image: 'https://cdn.example/jay.png', target_stream_name: 'cozy night with @MapleFern',
    target_stream_category: 'just chatting', target_stream_thumbnail: 'https://cdn.example/jay-{width}x{height}.jpg', target_viewer_count: '120', force_raid_now_seconds: 90 } }).raid;
  assert.deepEqual([raid.source_display_name, raid.target_login, raid.target_display_name, raid.target_stream_name], ['user1', 'user2', 'user2', 'word word word word'], 'DriftwoodJay: the same placeholder as driftwoodjay');
  assert.deepEqual([raid.source_profile_image, raid.target_stream_thumbnail].map(u => u.startsWith('https://example.invalid/file')), [true, true]);
  assert.deepEqual([raid.source_stream_category, raid.target_stream_category, raid.target_viewer_count, raid.force_raid_now_seconds], ['music', 'just chatting', '120', 90], 'categories and amounts stay');
  const go = hermes({ type: 'raid_go_v2', raid: { source_display_name: 'MapleFern', target_login: 'driftwoodjay' } }).raid;
  assert.deepEqual([go.source_display_name, go.target_login], ['user1', 'user2'], 'the same people, the same placeholders');
  const embed = hermes({ type: 'chat_rich_embed', data: { message_id: 'm-1', request_url: 'https://clips.example/BraveOtter', author_name: 'PebbleQuill', thumbnail_url: 'https://cdn.example/clip.jpg', title: 'the big save',
    twitch_metadata: { clip_metadata: { game: 'Racing', channel_display_name: 'DriftwoodJay', slug: 'BraveOtterDancingKoala-xyz', broadcaster_id: '5522' } } } }).data;
  assert.deepEqual([embed.author_name, embed.title, embed.twitch_metadata.clip_metadata.channel_display_name, embed.twitch_metadata.clip_metadata.game], ['user3', 'word word word', 'user2', 'Racing']);
  assert.ok(embed.request_url.startsWith('https://example.invalid/') && embed.thumbnail_url.startsWith('https://example.invalid/') && /^user\d+$/.test(embed.twitch_metadata.clip_metadata.slug));
  const board = hermes({ type: 'clips-leaderboard-update', new_leaderboard: [{ clip_slug: 'QuietOwl-abc', clip_title: 'that jump', curator_display_name: 'PebbleQuill', curator_login: 'pebblequill' }] }).new_leaderboard[0];
  assert.deepEqual([board.clip_title, board.curator_display_name, board.curator_login], ['word word', 'user3', 'user3']);
  const so = hermes({ type: 'create', data: { sourceLogin: 'mapleFern', targetLogin: 'driftwoodjay', targetUserDisplayName: 'DriftwoodJay', targetUserPrimaryColorHex: 'FF5451' } }).data;
  assert.deepEqual([so.sourceLogin, so.targetLogin, so.targetUserDisplayName, so.targetUserPrimaryColorHex], ['user1', 'user2', 'user2', 'FF5451']);
  // the stream's title (and its old one), the channel; a status elsewhere is a state, kept
  const bs = hermes({ type: 'broadcast_settings_update', channel_id: '5522', channel: 'driftwoodjay', old_status: 'day one', status: 'day two of the run', old_game: 'Racing', game: 'Puzzles' });
  assert.deepEqual([bs.channel, bs.old_status, bs.status, bs.game], ['channel1', 'word word', 'word word word word word', 'Puzzles']);
  // a channel's reward: its title and prompt stay (not a person); who redeemed it doesn't
  const rw = hermes({ type: 'reward-redeemed', data: { redemption: { status: 'UNFULFILLED', user: { login: 'pebblequill' }, reward: { title: 'Hydrate!', prompt: 'take a sip', default_image: { url_1x: 'https://cdn.example/r/5522/1.png' } } } } }).data.redemption;
  assert.deepEqual([rw.status, rw.user.login, rw.reward.title, rw.reward.prompt], ['UNFULFILLED', 'user3', 'Hydrate!', 'take a sip']);
  assert.ok(rw.reward.default_image.url_1x.startsWith('https://example.invalid/'), 'an image can name the channel (its id)');
  // Kick: the stream's title, a channel's reward title kept, the connection's name without its id
  const kick = (channel, data) => { const o = anonymise('kick', JSON.stringify({ push: { channel, pub: { data: { event: 'X', data: JSON.stringify(data) } } } }), ph); return [o.push.channel, JSON.parse(o.push.pub.data.data)]; };
  const [c1, live] = kick('channel.7712345', { livestream: { id: 99001, channel_id: 7712345, session_title: 'speedruns with MapleFern', created_at: '2026-10-29T08:00:00Z' } });
  assert.deepEqual([live.livestream.session_title, live.livestream.created_at], ['word word word', '2026-10-29T08:00:00Z']);
  assert.match(c1, /^channel\.\d+$/); assert.notEqual(c1, 'channel.7712345');
  assert.equal(String(live.livestream.channel_id), c1.split('.')[1], 'the id in the connection\'s name is the same placeholder as the channel\'s id');
  const [c2, reward] = kick('chatroom_8812345', { reward_title: '+500 cheers for the stream', username: 'PebbleQuill', status: 'active' });
  assert.deepEqual([reward.reward_title, reward.username, reward.status], ['+500 cheers for the stream', 'user3', 'active']);
  assert.match(c2, /^chatroom_\d+$/);
  assert.deepEqual(['chatrooms.8812345.v2', 'private-channelpoints-6612345', 'private-6612345'].map(c => kick(c, {})[0].replace(/\d+/, 'N')), ['chatrooms.N.v2', 'private-channelpoints-N', 'private-N']);
  assert.ok(!/maple|driftwood|pebble|otter|7712345|8812345|6612345|cozy|speedruns|big save|that jump|day one/i.test(JSON.stringify([raid, go, embed, board, so, bs, rw, live, reward, c1, c2])));
});

test('anonymise: Twitch\'s tags go by their names (any name, login or display name; ids; URLs; a sub plan\'s name), and what kind of line it is stays', () => {
  const ph = placeholders();
  const irc = '@display-name=MapleFern;login=maplefern;msg-id=sharedchatnotice;source-msg-id=sub;source-id=5f2c-11;source-room-id=4411;msg-param-sub-plan-name=Subscription\\s(driftwoodjay);msg-param-profileImageURL=https://cdn.example/jay-%s.png'
    + ';msg-param-mass-gift-sender-display-name=PebbleQuill;msg-param-someone-new-user-name=quietotter;msg-param-sub-plan=1000;msg-param-goal-description=road\\sto\\s100 :tmi.twitch.tv USERNOTICE #driftwoodjay';
  const tags = Object.fromEntries(anonymise('twitch', irc, ph).split(' ')[0].slice(1).split(';').map(kv => kv.split('=')));
  assert.deepEqual(tags, { 'display-name': 'user1', login: 'user1', 'msg-id': 'sharedchatnotice', 'source-msg-id': 'sub', 'source-id': 'id1', 'source-room-id': 'id2', 'msg-param-sub-plan-name': 'word\\sword',
    'msg-param-profileImageURL': 'https://example.invalid/file1', 'msg-param-mass-gift-sender-display-name': 'user2', 'msg-param-someone-new-user-name': 'user3', 'msg-param-sub-plan': '1000', 'msg-param-goal-description': 'word\\sword\\sword' });
});

test('anonymise: JSON cut short (past a sample\'s size) still loses its names, ids and words, at any depth of quoting; a value the cut leaves open goes', () => {
  const ph = placeholders();
  const whole = JSON.stringify({ notification: { pubsub: JSON.stringify({ type: 'hype-train-start', data: { id: 'ht-1', conductor: { user: { id: '4411', login: 'maplefern', display_name: 'MapleFern' } }, level: 3,
    message: 'go go go', rewards: [{ __typename: 'Emote', token: 'RawkOut' }], channel_id: 5522000, title: 'cozy night with PebbleQuill' } }) } });
  const cut = whole.slice(0, whole.indexOf('cozy') + 8);
  const out = anonymise('twitch', cut, ph);
  assert.equal(typeof out, 'string');
  assert.ok(!/maple|4411|ht-1|go go|5522000|cozy|pebble/i.test(out), out);
  assert.match(out, /\\"login\\":\\"user1\\",\\"display_name\\":\\"user1\\"/);
  assert.match(out, /\\"message\\":\\"word word word\\"/);
  assert.match(out, /\\"token\\":\\"RawkOut\\"/, 'what isn\'t a person stays');
  assert.match(out, /\\"level\\":3/);
  assert.ok(out.endsWith('\\"title\\":\\"…'), out.slice(-40));
  assert.equal(anonymise('kick', '{"username":"MapleFern","content":"hello the', ph), '{"username":"user1","content":"…', 'and at the top');
});
