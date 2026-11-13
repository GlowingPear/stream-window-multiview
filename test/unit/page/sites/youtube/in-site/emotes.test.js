// YouTube's emoji for the emote card (src/page/sites/youtube/in-site/emotes.js): which pictures are its emoji, the
// bigger picture, and what to type for each.
const test = require('node:test');
const assert = require('node:assert/strict');

let youtubeEmote;
test.before(async () => { ({ youtubeEmote } = await import('../../../../../../src/page/sites/youtube/in-site/emotes.js')); });

// a picture in its chat (inChat: inside a message), with its alt and tooltip
const pic = ({ alt = '', tip = '', inChat = true } = {}) => ({ alt, getAttribute: n => (n === 'shared-tooltip-text' ? tip : null), closest: () => (inChat ? {} : null) });
const at = 'https://yt3.ggpht.com/abc=w24-h24-c-k-nd';

test('its emoji in a message: the bigger picture; a standard emoji is typed as itself, a custom one as its shortcode', () => {
  assert.deepEqual(youtubeEmote(pic({ alt: '😀' }), new URL('https://www.gstatic.com/youtube/img/emojis/emojis-svg-9.json'), '😀'), { big: 'https://www.gstatic.com/youtube/img/emojis/emojis-svg-9.json', text: '😀' });
  assert.deepEqual(youtubeEmote(pic({ alt: 'yt', tip: ':yt:' }), new URL(at), 'yt'), { big: 'https://yt3.ggpht.com/abc=w128-h128-c-k-nd', text: ':yt:' });
  assert.equal(youtubeEmote(pic({ alt: ':_wave:' }), new URL(at), '_wave').text, ':_wave:', 'its alt, as a shortcode');
  assert.equal(youtubeEmote(pic({ alt: 'wave' }), new URL(at), 'wave').text, ':wave:', 'else its name as one');
});

test('not its emoji: another host, or a picture outside a message (an avatar)', () => {
  assert.equal(youtubeEmote(pic(), new URL('https://files.kick.com/emotes/1/fullsize'), 'x'), null);
  assert.equal(youtubeEmote(pic({ inChat: false }), new URL(at), 'x'), null);
});
