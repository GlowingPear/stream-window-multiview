// Rumble's module (src/page/sites/rumble/site.js): its channel ids, reading its links, its player's and chat's
// addresses from a live stream's two ids, and how its chat is read and sent in. Made-up channels.
const test = require('node:test');
const assert = require('node:assert/strict');

let rumble, kick, youtube;
test.before(async () => {
  globalThis.SmvSites = require('../../../../../src/shared/sites.js');   // (the page loads it before its modules)
  ({ rumble } = await import('../../../../../src/page/sites/rumble/site.js'));
  ({ kick } = await import('../../../../../src/page/sites/kick/site.js'));
  ({ youtube } = await import('../../../../../src/page/sites/youtube/site.js'));
});
// a link as platforms.js hands it over: host without www. or m., and the path's parts
const link = s => { const u = new URL(s); return [u.hostname.replace(/^(www|m)\./, ''), u.pathname.split('/').filter(Boolean), u]; };
const from = s => rumble.fromUrl(...link(s));

test('its entry in the list both sides share: its name, letter, prefix and storage', () => {
  assert.deepEqual([rumble.name, rumble.letter, rumble.prefix, rumble.partition], ['Rumble', 'R', 'ru:', 'persist:rumble']);
});

test('channel ids, names and labels: a channel, a user\'s channel, one video', () => {
  assert.equal(rumble.idFor('NightOwl'), 'ru:nightowl');
  assert.equal(rumble.idFor('@nightowl'), 'ru:nightowl');
  assert.deepEqual(['ru:nightowl', 'ru:u:pip', 'ru:v:v35waq4'].map(rumble.handle), ['nightowl', 'pip', 'v35waq4']);
  assert.deepEqual(['ru:nightowl', 'ru:u:pip', 'ru:v:v35waq4'].map(rumble.label), ['nightowl', 'pip', 'Rumble video']);
  assert.deepEqual(['ru:nightowl', 'ru:v:v35waq4'].map(rumble.namedBySite), [false, true], 'a video takes the name Rumble gives it');
  assert.deepEqual(rumble.fromText('ru:NightOwl'), { channel: 'ru:nightowl', only: null });
  assert.deepEqual(rumble.fromText('rumble: @nightowl'), { channel: 'ru:nightowl', only: null });
  assert.equal(rumble.fromText('nightowl'), undefined, 'a bare name is Kick\'s');
  assert.equal(rumble.videoId('ru:v:v35waq4'), null, 'a video\'s player and chat ids are looked up');
  assert.deepEqual(['ru:u:pip', 'ru:c-7777674', 'ru:v:v35waq4'].map(rumble.idText), ['User · pip', 'Channel · c-7777674', 'Video · v35waq4'], 'a user\'s page and a channel told apart');
  assert.deepEqual([kick.idText('owl'), youtube.idText('yt:@owl')], ['owl', '@owl'], 'the default: its name there');
  assert.equal(youtube.videoId('yt:v:dQw4w9WgXcQ'), 'dQw4w9WgXcQ', 'YouTube\'s video id is in its channel id');
  assert.equal(kick.videoId('owl'), null, 'the default: none');
});

test('reading a channel from a link: its channels, its users, its videos; anything else on rumble.com is no channel', () => {
  assert.deepEqual(from('https://rumble.com/c/NightOwl'), { channel: 'ru:nightowl', only: null });
  assert.deepEqual(from('https://rumble.com/c/NightOwl/livestreams?e9s=x'), { channel: 'ru:nightowl', only: null });
  assert.deepEqual(from('https://www.rumble.com/user/Pip_X'), { channel: 'ru:u:pip_x', only: null });
  assert.deepEqual(from('https://rumble.com/v35waq4-night-owl-live-247.html?e9s=src_v1_blp'), { channel: 'ru:v:v35waq4', only: null });
  assert.deepEqual(from('https://rumble.com/v35waq4.html'), { channel: 'ru:v:v35waq4', only: null });
  for (const s of ['https://rumble.com/', 'https://rumble.com/browse/live', 'https://rumble.com/chat/popup/186945454', 'https://rumble.com/embed/v33aw1a/',
    'https://rumble.com/c/', 'https://rumble.com/c/a%20b', 'https://rumble.com/v35waq4-x.html/more']) assert.equal(from(s), null, s);
  assert.equal(from('https://kick.com/nightowl'), undefined, 'another site\'s');
  assert.equal(from('https://notrumble.com/c/nightowl'), undefined);
});

test('its player and chat need the live stream\'s two ids ("<embed id>.<chat id>"); without them, none', () => {
  const vid = 'v33aw1a.186945454';
  assert.equal(rumble.streamUrl('ru:nightowl', false, vid), 'https://rumble.com/embed/v33aw1a/?pub=4&autoplay=2');
  assert.equal(rumble.chatUrl('ru:nightowl', vid), 'https://rumble.com/chat/popup/186945454');
  assert.equal(rumble.streamUrl('ru:nightowl', false, null), null);
  assert.equal(rumble.chatUrl('ru:nightowl', 'v33aw1a'), null, 'only both ids');
  assert.equal(rumble.pageUrl('ru:nightowl', 'chat', vid), 'https://rumble.com/chat/popup/186945454');
  assert.equal(rumble.pageUrl('ru:nightowl', 'stream', vid), 'https://rumble.com/c/nightowl/livestreams');
  assert.equal(rumble.pageUrl('ru:u:pip', 'chat', null), 'https://rumble.com/user/pip/livestreams');
  assert.equal(rumble.pageUrl('ru:v:v35waq4', 'stream', vid), 'https://rumble.com/v35waq4.html');
  assert.deepEqual(['ru:nightowl', 'ru:u:pip'].map(rumble.profileUrl), ['https://rumble.com/c/nightowl', 'https://rumble.com/user/pip']);
  assert.equal(rumble.modUrl('ru:nightowl'), null);
});

test('its chat: the streamer by their name, names in their own colour, its box and send button, its cookie question', () => {
  assert.equal(rumble.isHost('ru:nightowl', 'NightOwl'), true);
  assert.equal(rumble.isHost('ru:u:pip', 'pip'), true);
  assert.equal(rumble.isHost('ru:nightowl', 'pip'), false);
  assert.equal(rumble.isHost('ru:v:v35waq4', 'v35waq4'), false, 'a video\'s id isn\'t a name');
  assert.deepEqual(rumble.nameStyle({ color: '#e80808' }), { color: '#e80808' });
  assert.equal(rumble.nameStyle({ color: 'red' }), null);
  assert.match('Your message here!', new RegExp(rumble.chatBox.says, 'i'));
  assert.deepEqual([rumble.chatBox.box, rumble.send.button, rumble.send.waitEnabled], ['#chat-message-text-input', '#chat-message-form .chat--send', true]);
  assert.match(rumble.cookieJs, /^\(function rumbleConsent\(\)\{/);
  assert.equal(kick.cookieJs, null, 'the default: no question to answer');
  assert.ok(rumble.me.valid.test('Night_Owl') && !rumble.me.valid.test('a'));
  assert.equal(rumble.inSite.modAction.name, 'rumbleModAction', 'ALL\'s mod actions: its chat page\'s own requests');
  assert.deepEqual(rumble.quality, { siteMax: null });
  assert.equal(kick.startJs, null, 'the default: its player starts by itself');
});

test('its player waits for a real press to start: where, until it has started', () => {
  const run = video => new Function('document', 'innerWidth', 'innerHeight', 'return ' + rumble.startJs)({ querySelector: () => video }, 800, 450);
  assert.deepEqual(run({ paused: true, readyState: 0, currentTime: 0 }), { x: 400, y: 225 });
  assert.equal(run({ paused: false, readyState: 0, currentTime: 0 }), null, 'started (loading)');
  assert.equal(run({ paused: true, readyState: 4, currentTime: 12 }), null, 'paused after playing: yours to start');
  assert.equal(run(null), null, 'no player yet');
});

test('a raid: its chat sends you to the raided live stream\'s page, a video of its own; nothing else is one', () => {
  const at = s => rumble.raidTarget('chat', new URL(s));
  assert.equal(at('https://rumble.com/v6abcde-late-show.html'), 'ru:v:v6abcde');
  assert.equal(at('https://www.rumble.com/v6ABCDE.html'), 'ru:v:v6abcde');
  assert.equal(at('https://rumble.com/c/nightowl'), null);
  assert.equal(at('https://example.com/v6abcde.html'), null);
});
