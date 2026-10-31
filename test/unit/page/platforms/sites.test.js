// Each site's module (src/page/platforms/kick.js, twitch.js, youtube.js): the same shape, their links,
// addresses and raids.
const test = require('node:test');
const assert = require('node:assert/strict');

let kick, twitch, youtube;
test.before(async () => {
  ({ kick } = await import('../../../../src/page/platforms/kick.js'));
  ({ twitch } = await import('../../../../src/page/platforms/twitch.js'));
  ({ youtube } = await import('../../../../src/page/platforms/youtube.js'));
});
// a link as platforms.js hands it over: host without www. or m., and the path's parts
const link = s => { const u = new URL(s); return [u.hostname.replace(/^(www|m)\./, ''), u.pathname.split('/').filter(Boolean), u]; };

test('all three have the same shape', () => {
  const keys = o => Object.keys(o).sort();
  assert.deepEqual(keys(twitch), keys(kick));
  assert.deepEqual(keys(youtube).filter(k => !['namedBySite', 'playerCss', 'playerFitJs'].includes(k)), keys(kick));
  assert.deepEqual([kick, twitch, youtube].map(p => [p.id, p.name, p.letter, p.partition]),
    [['kick', 'Kick', 'K', 'persist:kick'], ['twitch', 'Twitch', 'T', 'persist:twitch'], ['youtube', 'YouTube', 'Y', 'persist:youtube']]);
  assert.deepEqual([kick, twitch, youtube].map(p => [p.mentions, p.spamAlerts, p.emoteLists, p.pageCommands, p.likes]),
    [[true, true, true, true, false], [true, true, true, false, false], [false, false, false, false, true]]);
  assert.deepEqual([kick, twitch, youtube].map(p => p.deleteMods), [true, false, false], 'only Kick lets a mod delete another mod\'s message');
});

test('channel ids, names and labels', () => {
  assert.deepEqual([kick.idFor('owl'), twitch.idFor('owl'), youtube.idFor('owl')], ['owl', 'tw:owl', 'yt:@owl']);
  assert.deepEqual([kick.handle('owl'), twitch.handle('tw:owl'), youtube.handle('yt:@owl')], ['owl', 'owl', '@owl']);
  assert.deepEqual([kick.label('owl'), twitch.label('tw:owl'), youtube.label('yt:@owl')], ['owl', 'owl', '@owl']);
  assert.equal(youtube.label('yt:v:dQw4w9WgXcQ'), 'YouTube video');
  assert.equal(youtube.label('yt:c:UCabcdefghijklmnop'), 'YouTube channel');
  assert.equal(youtube.namedBySite('yt:c:UCabcdefghijklmnop'), true);
  assert.equal(youtube.namedBySite('yt:@owl'), false, 'a handle is already its name');
});

test('reading a channel from a link: its own site\'s only; a page that isn\'t a channel is null', () => {
  const from = (p, s) => p.fromUrl(...link(s));
  assert.deepEqual(from(kick, 'https://kick.com/NightOwl'), { channel: 'nightowl', only: null });
  assert.deepEqual(from(kick, 'https://kick.com/popout/nightowl/chat'), { channel: 'nightowl', only: 'chat' });
  assert.deepEqual(from(kick, 'https://kick.com/nightowl/chatroom'), { channel: 'nightowl', only: 'chat' });
  assert.equal(from(kick, 'https://kick.com/'), null);
  assert.equal(from(kick, 'https://www.twitch.tv/owl'), undefined, 'another site');
  assert.deepEqual(from(twitch, 'https://www.twitch.tv/Owl'), { channel: 'tw:owl', only: null });
  assert.deepEqual(from(twitch, 'https://www.twitch.tv/popout/owl/chat?popout='), { channel: 'tw:owl', only: 'chat' });
  assert.deepEqual(from(twitch, 'https://player.twitch.tv/?channel=Owl&parent=x'), { channel: 'tw:owl', only: null });
  assert.equal(from(twitch, 'https://www.twitch.tv/directory'), null);
  assert.deepEqual(from(youtube, 'https://youtu.be/dQw4w9WgXcQ'), { channel: 'yt:v:dQw4w9WgXcQ', only: null });
  assert.deepEqual(from(youtube, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { channel: 'yt:v:dQw4w9WgXcQ', only: null });
  assert.deepEqual(from(youtube, 'https://www.youtube.com/live_chat?v=dQw4w9WgXcQ'), { channel: 'yt:v:dQw4w9WgXcQ', only: 'chat' });
  assert.deepEqual(from(youtube, 'https://m.youtube.com/@Owl'), { channel: 'yt:@owl', only: null });
  assert.deepEqual(from(youtube, 'https://www.youtube.com/channel/UCabcdefghijklmnop'), { channel: 'yt:c:UCabcdefghijklmnop', only: null });
  assert.equal(from(youtube, 'https://www.youtube.com/feed/subscriptions'), null);
});

test('a link with something in it that isn\'t a name the site allows gives no channel (it would end up in the page)', () => {
  const from = (p, s) => p.fromUrl(...link(s));
  const bad = '%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E';
  assert.equal(from(twitch, `https://player.twitch.tv/?channel=${bad}&parent=x`), null);
  assert.equal(from(twitch, 'https://player.twitch.tv/?channel=a%20b'), null);
  assert.equal(from(twitch, `https://www.twitch.tv/popout/${bad}/chat`), null);
  assert.equal(from(twitch, `https://www.twitch.tv/embed/${'x'.repeat(26)}/chat`), null, 'too long for Twitch');
  assert.equal(from(kick, `https://kick.com/${bad}`), null);
  assert.equal(from(kick, `https://kick.com/popout/${bad}/chat`), null);
  assert.equal(from(kick, `https://kick.com/${bad}/chatroom`), null);
  assert.equal(from(youtube, `https://www.youtube.com/live_chat?v=${bad}`), null);
  assert.equal(from(youtube, 'https://www.youtube.com/live_chat?v=short'), null);
  assert.equal(from(youtube, `https://www.youtube.com/@${bad}`), null);
  assert.equal(from(youtube, 'https://www.youtube.com/@'), null);
});

test('player, chat, page, profile and mod view addresses', () => {
  assert.equal(kick.streamUrl('owl', true), 'https://player.kick.com/owl?autoplay=true&muted=true');
  assert.equal(kick.chatUrl('owl'), 'https://kick.com/popout/owl/chat');
  assert.equal(kick.pageUrl('owl', 'stream'), 'https://kick.com/owl');
  assert.equal(kick.pageUrl('owl', 'chat'), kick.chatUrl('owl'));
  assert.equal(kick.modUrl('owl'), 'https://dashboard.kick.com/moderator/owl');
  assert.equal(twitch.streamUrl('tw:owl', false), 'https://player.twitch.tv/?channel=owl&parent=localhost&autoplay=true&muted=false');
  assert.equal(twitch.chatUrl('tw:owl'), 'https://www.twitch.tv/popout/owl/chat?popout=');
  assert.equal(twitch.pageUrl('tw:owl', 'stream'), 'https://www.twitch.tv/owl');
  assert.equal(twitch.profileUrl('tw:owl'), 'https://twitch.tv/owl');
  assert.equal(twitch.modUrl('tw:owl'), 'https://www.twitch.tv/moderator/owl');
  // YouTube needs the live video's id; without it there's nothing to load yet
  assert.equal(youtube.streamUrl('yt:@owl', false, null), null);
  assert.equal(youtube.streamUrl('yt:@owl', false, 'dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(youtube.chatUrl('yt:@owl', 'dQw4w9WgXcQ'), 'https://www.youtube.com/live_chat?is_popout=1&v=dQw4w9WgXcQ');
  assert.equal(youtube.pageUrl('yt:@owl', 'stream', null), 'https://www.youtube.com/@owl/live');
  assert.equal(youtube.pageUrl('yt:c:UCabc', 'chat', null), 'https://www.youtube.com/channel/UCabc/live');
  assert.equal(youtube.pageUrl('yt:@owl', 'chat', 'dQw4w9WgXcQ'), youtube.chatUrl('yt:@owl', 'dQw4w9WgXcQ'));
  assert.equal(youtube.profileUrl('yt:@owl'), 'https://www.youtube.com/@owl');
  assert.equal(youtube.modUrl('yt:@owl'), null);
});

test('raids: the channel a window\'s new address is for, only for its own kind of page', () => {
  const to = (p, kind, s) => p.raidTarget(kind, new URL(s));
  assert.equal(to(kick, 'stream', 'https://player.kick.com/raided'), 'raided');
  assert.equal(to(kick, 'chat', 'https://kick.com/popout/raided/chat'), 'raided');
  assert.equal(to(kick, 'chat', 'https://kick.com/raided'), 'raided');
  assert.equal(to(kick, 'chat', 'https://kick.com/categories'), null, 'not a channel');
  assert.equal(to(kick, 'stream', 'https://kick.com/raided'), null, 'a stream only follows its player');
  assert.equal(to(twitch, 'stream', 'https://player.twitch.tv/?channel=raided'), 'tw:raided');
  assert.equal(to(twitch, 'chat', 'https://www.twitch.tv/popout/raided/chat'), 'tw:raided');
  assert.equal(to(twitch, 'chat', 'https://player.twitch.tv/?channel=raided'), null, 'a chat doesn\'t follow a player');
  assert.equal(to(twitch, 'chat', 'https://kick.com/raided'), null, 'another site');
  assert.equal(to(youtube, 'chat', 'https://www.youtube.com/@raided'), null, 'YouTube has no raids');
});

test('YouTube trims its watch page to the player; Kick and Twitch keep their user cards (and Twitch its rewards and emote picker) inside the chat', () => {
  assert.match(youtube.playerCss, /#movie_player/);
  assert.match(youtube.playerFitJs, /dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(kick.chatCss, /#user-identity/);
  assert.match(twitch.chatCss, /viewer-card/);
  assert.match(twitch.chatCss, /\.reward-center__content \{ width: min\(32\.4rem, 100vw - 1\.6rem\)/, 'its rewards pop-up fits the chat');
  assert.match(twitch.chatCss, /\.emote-picker \{ width: min\(32rem, 100vw - 1\.6rem\)/, 'and its emote picker');
  assert.match(twitch.chatCss, /\[role="dialog"\]:has\(\.reward-center__content, \.emote-picker\)[^{]*\{ max-width: none/, 'their frame lets them use the whole width');
  assert.equal(youtube.chatCss, null);
});

test('a stuck player (#120): Kick\'s error page and offline screen; Twitch and YouTube come back by themselves', () => {
  const run = (text, path) => new Function('document', 'location', `return ${kick.stuckJs}`)({ body: { innerText: text } }, { pathname: path });
  assert.equal(run('Kick\nThis embed seems to be misconfigured', '/owl/offline'), 'error');
  assert.equal(run('This embed seems to be misconfigured', '/owl'), 'error', 'also at the player\'s own address');
  assert.equal(run('owl is offline\nowl\'s latest stream', '/owl/offline'), 'offline');
  assert.equal(run('', '/owl'), 'ok');
  assert.equal(run('', '/owl/videos'), 'ok');
  assert.equal(new Function('document', 'location', `return ${kick.stuckJs}`)({ body: null }, { pathname: '/owl/offline/' }), 'offline', 'no page yet');
  assert.deepEqual([twitch.stuckJs, youtube.stuckJs], [null, null]);
});

test('each site says where its chat box\'s empty text is, and only its usual text gets the channel\'s name', () => {
  for (const p of [kick, twitch, youtube]) {
    assert.deepEqual(Object.keys(p.chatBox).sort(), ['attrs', 'box', 'hint', 'says'], p.id);
    assert.ok(typeof p.chatBox.box === 'string' && typeof p.chatBox.hint === 'string' && Array.isArray(p.chatBox.attrs), p.id);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(p.chatBox)), 'it goes into the site\'s page as text');
  }
  const says = p => new RegExp(p.chatBox.says, 'i');
  assert.ok(says(kick).test('Send a message') && says(twitch).test('Send a message'));
  assert.ok(says(youtube).test('Chat…') && says(youtube).test('Chat...') && says(youtube).test('Say something...'));
  // a box that says why you can't chat keeps it
  for (const t of ['Followers-only mode', 'Subscribers-only chat', 'Slow mode: 30s', 'Sign in to chat', 'You are banned', 'Send a message (slow mode)'])
    assert.ok(![kick, twitch, youtube].some(p => says(p).test(t)), t);
  assert.ok(!says(youtube).test('Chatxyz'), 'the dots are dots');
  assert.deepEqual(twitch.chatBox.attrs, ['aria-label', 'data-placeholder'], 'Twitch also says it to screen readers');
});

test("each site says where its chat's messages scroll, and which of its buttons goes back to the newest (if it needs one)", () => {
  for (const p of [kick, twitch, youtube]) {
    assert.deepEqual(Object.keys(p.chatScroll).sort(), ['list', 'resume'], p.id);
    assert.ok(typeof p.chatScroll.list === 'string' && (p.chatScroll.resume === null || typeof p.chatScroll.resume === 'string'), p.id);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(p.chatScroll)), "it goes into the site's page as text");
  }
  assert.equal(kick.chatScroll.resume, null, 'Kick follows again once scrolled down');
});

test("each site says how its chat shows someone supporting the stream, in words that read Kick's real notices", () => {
  const KINDS = ['kicks', 'bits', 'gifts', 'gift', 'sub', 'superchat', 'member', 'raid'];
  for (const p of [kick, twitch, youtube]) {
    assert.ok(Array.isArray(p.support.finds) && p.support.finds.length, p.id);
    for (const f of p.support.finds) {
      assert.ok(KINDS.includes(f.kind), `${p.id}: ${f.kind}`);
      assert.ok(f.row ? typeof f.row === 'string' : typeof f.re === 'string', `${p.id}: a row or words`);
      if (f.re) assert.doesNotThrow(() => new RegExp(f.re, 'i'), `${p.id}: ${f.re}`);
    }
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(p.support)), "it goes into the site's page as text");
  }
  // the first wording a notice matches, with what it read
  const read = (p, text) => {
    for (const f of p.support.finds) {
      if (f.row || f.msg) continue;
      const m = text.match(new RegExp(f.re, 'i'));
      if (m) return [f.kind, { ...m.groups }];
    }
    return null;
  };
  // Kick's notices as its chat shows them (from screenshots of a real chat), each read as one line
  assert.deepEqual(read(kick, "giftfox88 Gifted 1 subscription to the community! They've gifted 1 subscription in the channel. 7 / 10"),
    ['gifts', { who: 'giftfox88', n: '1' }]);
  assert.deepEqual(read(kick, 'giftfox88 gifted a sub to mossy_rock'), ['gift', { who: 'giftfox88', n: undefined, to: 'mossy_rock' }]);
  assert.deepEqual(read(kick, 'GlowingPear sent 100 688 / 10K'), ['kicks', { who: 'GlowingPear', n: '100' }]);
  assert.equal(read(kick, 'BotRix: Thanks @GlowingPear for the 100 KICKs!'), null, "a bot's thanks isn't a notice");
  assert.deepEqual(read(kick, '07:55 PM zestyplum sent KICK 100 688 / 10K'), ['kicks', { who: 'zestyplum', n: '100' }], 'with the time, and the icon\'s words before the number');
  // a sub celebrated (its box also holds the person's message): read at the row's start only
  const party = kick.support.finds.find(f => f.anyRow);
  assert.deepEqual({ ...'mossy_rock celebrates their subscription for 7 months! mossy_rock : Scrib doooooon'.match(new RegExp(party.re, 'i')).groups }, { who: 'mossy_rock', n: '7' });
  assert.equal('chatter : mossy_rock celebrates their subscription for 7 months!'.match(new RegExp(party.re, 'i')), null, 'typed in a message: not a sub');
  // KickBot's message for each KICKs gift (as in a real Kick chat), only from KickBot
  const bot = kick.support.finds.find(f => f.msg && f.from);
  assert.deepEqual({ ...'@TrongatesLegacy just gifted 100 KICKs!'.match(new RegExp(bot.re, 'i')).groups }, { who: 'TrongatesLegacy', n: '100' });
  assert.ok(new RegExp(`^(?:${bot.from})$`, 'i').test('KickBot') && !new RegExp(`^(?:${bot.from})$`, 'i').test('BotRix'));
  assert.equal(read(kick, 'someone sent me a clip'), null);
  assert.deepEqual(read(twitch, "giftfox88 is gifting 5 Tier 1 Subs to pear's community! They've gifted a total of 20 in the channel!"),
    ['gifts', { who: 'giftfox88', n: '5' }]);
  assert.deepEqual(read(twitch, 'bob subscribed with Prime.'), ['sub', { who: 'bob', n: undefined }]);
  // raids: Kick's banner over the chat (it says hosting), Twitch's line in its chat; YouTube has none
  const raid = (p, text) => { const f = p.support.finds.find(x => x.kind === 'raid'); const m = f && text.match(new RegExp(f.re, 'i')); return m ? { ...m.groups } : null; };
  assert.deepEqual(raid(kick, 'pixelpear is hosting your channel with 120 viewers'), { who: 'pixelpear', n: '120' });
  assert.deepEqual(raid(kick, 'pixelpear is raiding with 1,250 viewers'), { who: 'pixelpear', n: '1,250' });
  assert.ok(kick.support.finds.find(x => x.kind === 'raid').page, 'read from the page: a banner, not a row');
  assert.deepEqual(raid(twitch, '25 raiders from nightowl have joined!'), { n: '25', who: 'nightowl' });
  assert.equal(raid(youtube, 'anything'), null);
  const cheers = new RegExp(twitch.support.finds.find(f => f.msg).re, 'gi');
  assert.deepEqual([...'Cheer100 great run cheer50 cheering'.matchAll(cheers)].map(x => x.groups.n), ['100', '50']);
});

test('a name in ALL as each site\'s own chat shows it (nameStyle), on a dark theme or a light one', () => {
  // Kick: their colour, as it is (none: ALL picks one)
  assert.deepEqual(kick.nameStyle({ color: '#7CFF4F' }), { color: '#7CFF4F' });
  assert.equal(kick.nameStyle({ color: '' }), null);
  // Twitch: "Readable Colors", as its chat works them out (these are what its own code gives)
  const tw = (color, light) => twitch.nameStyle({ login: 'someone', color }, { light }).color;
  assert.equal(tw('#FF7F50'), '#FF7F50', 'readable already: as it is');
  assert.equal(tw('#0000FF'), '#8B58FF', 'too dark on its dark background: lighter');
  assert.equal(tw('#123456'), '#6A84AC');
  assert.equal(tw('#000000'), '#7A7A7A', 'nearly black: grey');
  assert.equal(tw('#FFFF00', true), '#6A7500', 'too light on its light background: darker');
  assert.equal(tw('#00FF7F', true), '#007B00');
  assert.equal(tw('#000000', true), '#000000');
  // someone who never picked one: one of Twitch's 15, the same each time for the same name
  const none = login => twitch.nameStyle({ login, color: '' }).color;
  assert.equal(none('paperwren'), none('paperwren'));
  assert.equal(twitch.nameStyle({ login: 'paperwren', color: 'not a colour' }).color, none('paperwren'));
  const seen = new Set(Array.from({ length: 300 }, (_, i) => none('viewer' + i)));
  assert.ok(seen.size > 10 && [...seen].every(c => ['#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50', '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E', '#5F9EA0',
    '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'].map(x => tw(x)).includes(c)), 'Twitch\'s own colours, made readable');
  // YouTube: by who they are, the streamer on a pill; its first role badge counts (verified isn't one)
  const yt = (badges, o) => youtube.nameStyle({ login: 'x', color: '', badges }, o);
  assert.deepEqual(yt([]), { color: 'rgba(255,255,255,0.7)' });
  assert.deepEqual(yt(['verified', 'mod']), { color: '#3ea6ff' });
  assert.deepEqual(yt(['sub']), { color: '#2ba640' });
  assert.deepEqual(yt(['host', 'mod']), { color: '#111111', bg: '#ffd600' });
  assert.deepEqual([yt([], { light: true }), yt(['mod'], { light: true }), yt(['sub'], { light: true }), yt(['host'], { light: true })],
    [{ color: '#606060' }, { color: '#065fd4' }, { color: '#107516' }, { color: '#000000', bg: '#fbc02d' }]);
  // as its chat page draws them, when it's as light or dark as the app (a moderator's older blue, a member's own)
  const look = { dark: true, names: { mod: 'rgb(94, 132, 241)', member: 'rgb(15, 157, 88)' } };
  assert.deepEqual([yt(['mod'], { look }), yt(['sub'], { look }), yt([], { look })], [{ color: 'rgb(94, 132, 241)' }, { color: 'rgb(15, 157, 88)' }, { color: 'rgba(255,255,255,0.7)' }]);
  assert.deepEqual(yt(['mod'], { look, light: true }), { color: '#065fd4' }, 'a dark page\'s colours aren\'t used on a light theme');
});

test('each site\'s chat commands for ALL\'s / list: a name, what goes after it, what it does, who can use it; none that only open a panel out of sight', () => {
  const ok = c => /^[a-z]+$/.test(c.name) && typeof c.args === 'string' && typeof c.does === 'string' && c.does.length > 5 && ['all', 'mod', 'host'].includes(c.who);
  for (const p of [kick, twitch]) {
    assert.ok(p.chatCommands.length > 10, p.id);
    assert.deepEqual(p.chatCommands.filter(c => !ok(c)), [], p.id);
    assert.equal(new Set(p.chatCommands.map(c => c.name)).size, p.chatCommands.length, p.id + ': each once');
    assert.deepEqual(['all', 'mod', 'host'].map(w => p.chatCommands.filter(c => c.who === w).length > 0), [true, true, true], p.id + ': for everyone, mods and the streamer');
  }
  assert.deepEqual(youtube.chatCommands, [], 'YouTube\'s chat has none');
  const names = p => p.chatCommands.map(c => c.name);
  for (const panel of ['poll', 'prediction', 'goal', 'user', 'vote', 'gift', 'requests', 'sharedchat']) assert.ok(!names(twitch).includes(panel), 'Twitch: ' + panel);
  for (const panel of ['user', 'category']) assert.ok(!names(kick).includes(panel), 'Kick: ' + panel);
  assert.ok(['clip', 'poll', 'prediction'].every(n => names(kick).includes(n)), 'Kick\'s own panels open from ALL too');
  assert.deepEqual(['timeout', 'ban', 'slow'].map(n => twitch.chatCommands.find(c => c.name === n).who), ['mod', 'mod', 'mod']);
  assert.equal(twitch.chatCommands.find(c => c.name === 'vip').who, 'host');
});
