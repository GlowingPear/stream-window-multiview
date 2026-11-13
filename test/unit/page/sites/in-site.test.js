// The scripts that run inside the sites' pages, built with each site's part (src/page/sites/in-site.js), and the
// parts' slots on every site (site.js's inSite and send).
const test = require('node:test');
const assert = require('node:assert/strict');

let m, PLATFORMS;
test.before(async () => {
  globalThis.SmvSites = require('../../../../src/shared/sites.js');   // (the page loads it before its modules)
  m = await import('../../../../src/page/sites/in-site.js');
  ({ PLATFORMS } = await import('../../../../src/page/sites/sites.js'));
});

test('a script\'s text: the shared part called with what it\'s given, a function as its own text, inside lists and objects too', () => {
  function agent(a, b, c){ return [a, b, c]; }
  const js = m.inSiteCall(agent, 'kick', { n: 1, f: x => x + 1, list: [null, 'a"b'] }, undefined);
  assert.match(js, /^\(function agent\(a, b, c\)\{ return \[a, b, c\]; \}\)\("kick", \{"n": 1, "f": x => x \+ 1, "list": \[null, "a\\"b"\]\}, undefined\)$/);
  const [site, part, none] = new Function('return ' + js)();
  assert.deepEqual([site, part.n, part.f(1), part.list, none], ['kick', 1, 2, [null, 'a"b'], undefined]);
  assert.equal(m.inSiteCall(agent), '(function agent(a, b, c){ return [a, b, c]; })()');
});

test('every site has the same slots for its parts; each part runs on its own as text (no outside names)', () => {
  const keys = Object.values(PLATFORMS).map(p => Object.keys(p.inSite).sort().join());
  assert.equal(new Set(keys).size, 1, keys.join(' | '));
  assert.deepEqual(new Set(Object.values(PLATFORMS).map(p => Object.keys(p.send).sort().join())).size, 1);
  for (const p of Object.values(PLATFORMS)) for (const [k, v] of Object.entries(p.inSite)){
    if (typeof v === 'function') assert.doesNotThrow(() => new Function('return ' + String(v))(), `${p.id}'s ${k}`);
    // a part that names something outside itself fails as text: check what each refers to is its own or the page's
    if (typeof v === 'function') assert.doesNotMatch(String(v), /\b(PLATFORMS|SmvSites|platform|platOf|settings|wins)\b/, `${p.id}'s ${k} is self-contained`);
  }
  assert.deepEqual(Object.values(PLATFORMS).map(p => [p.id, !!p.inSite.tap, !!p.inSite.pins, !!p.inSite.shown, !!p.inSite.badges, !!p.inSite.modes]),
    [['kick', true, true, true, true, true], ['twitch', true, true, true, true, true], ['youtube', true, true, true, false, true]], 'YouTube\'s badges come with their pictures');
  assert.deepEqual(Object.values(PLATFORMS).map(p => ['icons', 'look', 'room', 'hypeTrain', 'channels', 'commands', 'reply', 'replyAt', 'replyPress', 'heldCard', 'signedOut'].filter(k => p.inSite[k])),
    [['icons', 'reply'], ['room', 'hypeTrain', 'channels', 'commands', 'replyAt', 'replyPress', 'heldCard'], ['look', 'heldCard', 'signedOut']],
    'only YouTube\'s chat page shows you signed out (Kick\'s and Twitch\'s look the same: those sites are asked)');
});

test('a site\'s parts slot fits what it says it can do (chat flags, replies, held messages, its own commands)', () => {
  for (const p of Object.values(PLATFORMS)){
    assert.equal(!!p.inSite.icons, !!p.chat.ownIcons, p.id);
    assert.equal(!!p.inSite.look, !!p.chat.look, p.id);
    assert.equal(!!p.inSite.hypeTrain, !!p.chat.hypeTrains, p.id);
    assert.equal(!!p.inSite.channels, !!p.chat.shared, p.id);
    assert.equal(!!p.inSite.commands, !!p.liveCommands, p.id);
    assert.equal(!!p.inSite.reply, p.threadedReplies === true, p.id);
    assert.equal(!!(p.inSite.replyAt && p.inSite.replyPress), p.threadedReplies === 'pointer', p.id);
    assert.equal(!!p.inSite.heldCard, !!p.held, p.id);
  }
  assert.equal(m.inSiteOf('nowhere').tap, undefined, 'a site that isn\'t one: no parts');
});

test('how the send script types and sends on each site: its chat box, its button (Kick: Enter), YouTube\'s wrapper, wait and real press', () => {
  assert.deepEqual(m.sendSpec('kick'), { box: '[data-testid="chat-input"]', button: null, inner: null, waitEnabled: false, realPress: false });
  assert.deepEqual(m.sendSpec('twitch'), { box: '[data-a-target="chat-input"]', button: '[data-a-target="chat-send-button"]', inner: null, waitEnabled: false, realPress: false });
  assert.deepEqual(m.sendSpec('youtube'), { box: 'yt-live-chat-text-input-field-renderer #input', button: '#send-button', inner: ['button', 'yt-button-renderer'], waitEnabled: true, realPress: true });
  assert.deepEqual(m.sendSpec('nowhere'), { box: null });
});

test('shoutouts\' look for the script in a chat page: the site\'s page part with its id; none on YouTube', () => {
  const k = m.shoutPage('kick'), t = m.shoutPage('twitch');
  assert.deepEqual([k.site, k.line, k.bar, k.namesDiffer, typeof k.sender], ['kick', '[data-index]', 'div[class*="group-hover:flex"]', true, 'function']);
  assert.deepEqual([t.site, t.line, t.bar, t.namesDiffer, typeof t.sender], ['twitch', '.chat-line__message, .user-notice-line', '.chat-line__icons', false, 'function']);
  assert.equal(m.shoutPage('youtube'), null);
  assert.equal(m.modesJs('kick').startsWith('(async function modesAgent(site, modes, nameAs, wait = 8000){'), true);
  assert.match(m.modesJs('kick'), /\("kick", async function kickModes\(/);
  assert.match(m.modesJs('youtube'), /\("youtube", async function youtubeModes\(/);
});

test('the sites\' emotes: their pictures\' hosts for the mention and new-emote readers (YouTube\'s aren\'t read there), and the card\'s look and finder for each', () => {
  assert.deepEqual(m.emoteHosts(), [{ host: 'files\\.kick\\.com', path: '^/emotes/' }, { host: 'static-cdn\\.jtvnw\\.net', path: null }]);
  const sites = m.emoteSites();
  assert.deepEqual(sites.map(s => [s.name, s.look]), [['Kick', ['#53fc18', '#0a0c0d', 'Kick emote']], ['Twitch', ['#8a4fff', '#fff', 'Twitch emote']], ['YouTube', ['#ff3d3d', '#fff', 'YouTube emoji']]]);
  const img = { closest: () => null }, find = (i, url) => sites.map(s => s.find(img, new URL(url), 'pogg')).findIndex(Boolean) === i;
  const [kick, twitch] = sites;
  assert.deepEqual(kick.find(img, new URL('https://files.kick.com/emotes/123/fullsize'), 'x'), { big: 'https://files.kick.com/emotes/123/fullsize' });
  assert.deepEqual(kick.find(img, new URL('https://files.kick.com/emotes/37226/1x'), 'x'), { big: 'https://files.kick.com/emotes/37226/fullsize' });
  assert.equal(kick.find(img, new URL('https://files.kick.com/images/user/1/profile.webp'), 'x'), null, 'a picture there that isn\'t an emote');
  assert.deepEqual(twitch.find(img, new URL('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0'), 'x'), { big: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0' });
  assert.equal(twitch.find(img, new URL('https://static-cdn.jtvnw.net/jtv_user_pictures/a.png'), 'x'), null);
  assert.equal(find(0, 'https://files.kick.com/emotes/1/fullsize') && find(1, 'https://static-cdn.jtvnw.net/emoticons/v2/1/default/dark/1.0'), true);
  assert.equal(sites.some(s => s.find(img, new URL('https://cdn.7tv.app/emote/abc/1x.webp'), 'x')), false, 'the add-ons\' are the card\'s own');
});
