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

test('YouTube trims its watch page to the player; Kick and Twitch keep their user cards inside the chat', () => {
  assert.match(youtube.playerCss, /#movie_player/);
  assert.match(youtube.playerFitJs, /dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(kick.chatCss, /#user-identity/);
  assert.match(twitch.chatCss, /viewer-card/);
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
