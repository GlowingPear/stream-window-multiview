// The right-click menu in chat and stream windows (src/context-menu.js): which items show for what was clicked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { menuFor, translateTarget, languageName, translateUrl } = require('../../../src/main/context-menu');

const labels = items => items.map(x => x.type === 'separator' ? '—' : x.label);
const find = (items, label) => items.find(x => x.label === label);

test('the language to translate into, and its name in that language', () => {
  assert.equal(translateTarget(['en-US', 'de']), 'en');
  assert.equal(translateTarget(['de-DE']), 'de');
  assert.equal(translateTarget(['pt_BR']), 'pt');
  assert.equal(translateTarget(['zh-Hans-CN']), 'zh-CN');
  assert.equal(translateTarget(['zh-TW']), 'zh-TW');
  assert.equal(translateTarget(['he-IL']), 'iw', 'Google Translate\'s code for Hebrew');
  assert.equal(translateTarget([]), 'en');
  assert.equal(translateTarget(['???']), 'en');
  assert.equal(translateTarget(null), 'en');
  assert.equal(languageName('en'), 'English');
  assert.equal(languageName('de'), 'Deutsch');
  assert.equal(languageName('ja'), '日本語');
  assert.equal(languageName('not a code at all'), 'not a code at all');
});

test('selected text: Copy, Translate to your language and Search, with the text in the address', () => {
  const m = menuFor({ selectionText: '  hola  amigos & co ', editFlags: { canCopy: true } }, { langs: ['de-DE'] });
  assert.deepEqual(labels(m), ['Copy', 'Translate “hola amigos & co” to Deutsch', 'Search Google for “hola amigos & co”']);
  assert.deepEqual(m[0].act, { do: 'copy' });
  assert.equal(m[1].act.do, 'external');
  assert.equal(m[1].act.url, 'https://translate.google.com/?sl=auto&tl=de&text=hola%20%20amigos%20%26%20co&op=translate');
  assert.equal(m[2].act.url, 'https://www.google.com/search?q=hola%20%20amigos%20%26%20co');
  const long = menuFor({ selectionText: 'a'.repeat(40) });
  assert.equal(long[1].label, `Translate “${'a'.repeat(23)}…” to English`, 'long selections are shortened in the menu');
  assert.equal(translateUrl('x'.repeat(6000), 'en').length < 5100, true, 'and in the address');
});

test('a link: open it in your browser or copy it; only web links', () => {
  const m = menuFor({ linkURL: 'https://example.com/a?b=1' });
  assert.deepEqual(labels(m), ['Open link in your browser', 'Copy link address']);
  assert.deepEqual(m[0].act, { do: 'external', url: 'https://example.com/a?b=1' });
  assert.deepEqual(m[1].act, { do: 'copyText', text: 'https://example.com/a?b=1' });
  assert.deepEqual(labels(menuFor({ linkURL: 'javascript:alert(1)' })), ['Reload'], 'not a web link: no link items');
});

test('an image or emote: open it in a new window, save it (named after the emote), copy it or its address', () => {
  const m = menuFor({ mediaType: 'image', srcURL: 'https://files.kick.com/emotes/1/fullsize', altText: 'pearHype', x: 10, y: 20 });
  assert.deepEqual(labels(m), ['Open image in new window', 'Save image as…', 'Copy image', 'Copy image address']);
  assert.deepEqual(m[0].act, { do: 'openImage', url: 'https://files.kick.com/emotes/1/fullsize' });
  assert.deepEqual(m[1].act, { do: 'saveImage', url: 'https://files.kick.com/emotes/1/fullsize', name: 'pearHype' });
  assert.deepEqual(m[2].act, { do: 'copyImage', x: 10, y: 20 });
  assert.equal(menuFor({ mediaType: 'image', srcURL: 'https://x/y.png', titleText: 'Kappa' })[1].act.name, 'Kappa');
  assert.deepEqual(labels(menuFor({ mediaType: 'image', srcURL: 'data:image/png;base64,AAA' })), ['Reload'], 'a picture without a web address: nothing to open or save');
  // an emote inside a link: both groups
  assert.deepEqual(labels(menuFor({ mediaType: 'image', srcURL: 'https://a/b.png', linkURL: 'https://c/' })),
    ['Open link in your browser', 'Copy link address', '—', 'Open image in new window', 'Save image as…', 'Copy image', 'Copy image address']);
});

test('the chat box: the edit commands, on and off as the page allows', () => {
  const m = menuFor({ isEditable: true, editFlags: { canUndo: false, canRedo: false, canCut: false, canCopy: false, canPaste: true, canSelectAll: true } });
  assert.deepEqual(labels(m), ['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', 'Select all']);
  assert.deepEqual(m.filter(x => x.label).map(x => [x.label, x.enabled]), [['Undo', false], ['Redo', false], ['Cut', false], ['Copy', false], ['Paste', true], ['Select all', true]]);
  // with text selected in the box: no second Copy, but Translate and Search
  const s = menuFor({ isEditable: true, selectionText: 'gg', editFlags: { canCut: true, canCopy: true } });
  assert.deepEqual(labels(s), ['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', 'Select all', '—', 'Translate “gg” to English', 'Search Google for “gg”']);
  assert.equal(find(s, 'Cut').enabled, true);
});

test('a misspelled word: suggestions, then Add to dictionary', () => {
  const m = menuFor({ isEditable: true, misspelledWord: 'helo', dictionarySuggestions: ['hello', 'help', 'hero', 'halo', 'held', 'helm'], editFlags: {} });
  assert.deepEqual(labels(m).slice(0, 7), ['hello', 'help', 'hero', 'halo', 'held', 'Add to dictionary', '—']);
  assert.deepEqual(m[0].act, { do: 'replaceMisspelling', word: 'hello' });
  assert.deepEqual(find(m, 'Add to dictionary').act, { do: 'addWord', word: 'helo' });
  const none = menuFor({ isEditable: true, misspelledWord: 'qzx', dictionarySuggestions: [], editFlags: {} });
  assert.deepEqual([none[0].label, none[0].enabled], ['No spelling suggestions', false]);
});

test('anywhere else: Reload; Inspect only in a dev copy', () => {
  assert.deepEqual(labels(menuFor({})), ['Reload']);
  assert.deepEqual(labels(menuFor(null)), ['Reload']);
  assert.deepEqual(labels(menuFor({}, { dev: true })), ['Reload', '—', 'Inspect']);
  assert.deepEqual(menuFor({ x: 5, y: 6 }, { dev: true })[2].act, { do: 'inspect', x: 5, y: 6 });
  assert.deepEqual(labels(menuFor({ selectionText: 'hi' }, { dev: true })).slice(-1), ['Inspect']);
  assert.ok(!labels(menuFor({ selectionText: 'hi' })).includes('Inspect'));
});

test('an emote in a chat: Copy emote text first, then the image items with Save image as… named after it', () => {
  const p = { mediaType: 'image', srcURL: 'https://files.kick.com/emotes/1/fullsize', altText: 'alt', x: 3, y: 4 };
  const m = menuFor(p, { emote: { name: 'pearHype', text: 'pearHype' } });
  assert.deepEqual(labels(m), ['Copy emote text', '—', 'Open image in new window', 'Save image as…', 'Copy image', 'Copy image address']);
  assert.deepEqual(m[0].act, { do: 'copyText', text: 'pearHype' });
  assert.equal(find(m, 'Save image as…').act.name, 'pearHype');
  assert.deepEqual(find(m, 'Copy image').act, { do: 'copyImage', x: 3, y: 4 }, 'without its pictures\' addresses: as Chrome copies it');
  // with them: the app copies it (a moving one also as a file)
  const big = 'https://files.kick.com/emotes/1/fullsize';
  assert.deepEqual(find(menuFor(p, { emote: { name: 'pearHype', text: 'pearHype', big, small: 'https://files.kick.com/emotes/1/small' } }), 'Copy image').act,
    { do: 'copyEmote', url: big, small: 'https://files.kick.com/emotes/1/small', name: 'pearHype' });
  assert.deepEqual(find(menuFor(p, { emote: { text: 'x', big, small: 'data:image/png;base64,AA' } }), 'Copy image').act, { do: 'copyEmote', url: big, small: '', name: '' });
  assert.deepEqual(find(menuFor(p, { emote: { name: 'x', text: 'x', big: 'data:image/png;base64,AA' } }), 'Copy image').act, { do: 'copyImage', x: 3, y: 4 });
  // the text is whatever that chat needs (worked out where the emote is: see emoteAgent's textOf)
  for (const text of ['KEKW', 'pearHype', '😂', ':_pearWave:']) assert.deepEqual(menuFor(p, { emote: { name: 'x', text } })[0].act, { do: 'copyText', text });
  assert.deepEqual(labels(menuFor(p, { emote: { name: 'x', text: '' } })).slice(0, 1), ['Open image in new window'], 'no text: no Copy emote text');
  assert.deepEqual(labels(menuFor({}, { emote: { name: 'x', text: 'x' } })), ['Reload'], 'not on a picture: no emote items');
  // the drawn menu gets these same items (main.js sends exactly menuFor's list), with Inspect in a dev copy
  assert.deepEqual(labels(menuFor(p, { emote: { name: 'x', text: 'x' }, dev: true })).slice(-2), ['—', 'Inspect']);
});

test('a chat: Translate this chat, Translate new messages too and (while translating) Stop translating', () => {
  const off = menuFor({}, { langs: ['en-US'], chat: { on: false, auto: false } });
  assert.deepEqual(labels(off), ['Translate this chat to English', 'Translate new messages too', '—', 'Reload']);
  assert.deepEqual(off[0].act, { do: 'translateChat', tl: 'en' });
  assert.equal(off[0].checked, false);
  assert.deepEqual(off[1].act, { do: 'translateAuto', tl: 'en', on: true });
  const on = menuFor({}, { langs: ['de'], chat: { on: true, auto: true } });
  assert.deepEqual(labels(on), ['Translate this chat to Deutsch', 'Translate new messages too', 'Stop translating', '—', 'Reload']);
  assert.equal(on[0].checked, true); assert.equal(on[1].checked, true);
  assert.deepEqual(on[1].act, { do: 'translateAuto', tl: 'de', on: false }, 'ticked: choosing it again turns it off');
  assert.deepEqual(on[2].act, { do: 'translateStop' });
  // with text selected the Translate "…" item stays, and the chat's items are there too
  assert.deepEqual(labels(menuFor({ selectionText: 'hola' }, { chat: { on: false, auto: false } })),
    ['Copy', 'Translate “hola” to English', 'Search Google for “hola”', '—', 'Translate this chat to English', 'Translate new messages too']);
  // on an emote too; not in the chat box, not on a link, and not in a stream window (no chat)
  assert.ok(labels(menuFor({ mediaType: 'image', srcURL: 'https://a/b.png' }, { emote: { name: 'x', text: 'x' }, chat: {} })).includes('Translate new messages too'));
  assert.ok(!labels(menuFor({ isEditable: true }, { chat: {} })).some(l => /Translate/.test(l)));
  assert.ok(!labels(menuFor({ linkURL: 'https://a/' }, { chat: {} })).some(l => /Translate/.test(l)));
  assert.deepEqual(labels(menuFor({})), ['Reload']);
});

test('a chat message: Copy message (without emotes) and Copy message with emotes', () => {
  const chat = { on: false, auto: false }, message = { text: 'hi there', withEmotes: 'hi pearHype there', html: '<div data-index="1">…</div>' };
  const m = menuFor({}, { chat, message });
  assert.deepEqual(labels(m), ['Copy message', 'Copy message with emotes', '—', 'Translate this chat to English', 'Translate new messages too', '—', 'Reload']);
  assert.deepEqual(m.slice(0, 2).map(x => [x.act, x.enabled]), [[{ do: 'copyText', text: 'hi there' }, true], [{ do: 'copyText', text: 'hi pearHype there' }, true]]);
  // only emotes: nothing to copy without them
  const em = menuFor({}, { chat, message: { text: '', withEmotes: 'pearHype', html: '<div></div>' } });
  assert.deepEqual(em.slice(0, 2).map(x => x.enabled !== false), [false, true]);
  // after the emote's and the selection's items; not in the chat box, and not without a message
  const p = { mediaType: 'image', srcURL: 'https://files.kick.com/emotes/1/fullsize', selectionText: 'hi' };
  assert.deepEqual(labels(menuFor(p, { chat, message, emote: { name: 'pearHype', text: 'pearHype' } })).slice(0, 13), ['Copy emote text', '—',
    'Open image in new window', 'Save image as…', 'Copy image', 'Copy image address', '—', 'Copy', 'Translate “hi” to English', 'Search Google for “hi”', '—',
    'Copy message', 'Copy message with emotes']);
  assert.ok(!labels(menuFor({ isEditable: true }, { chat, message })).includes('Copy message'));
  assert.ok(!labels(menuFor({}, { chat, message: { text: 'x', withEmotes: 'x', html: '' } })).includes('Copy message'), 'no message there');
});

test('a chat message with shoutouts on: Shout out who sent it, first; nothing for a sender that isn\'t Kick or Twitch, or a strange address', () => {
  const chat = { on: false, auto: false }, message = { text: 'hi', withEmotes: 'hi', html: '<div></div>', shout: { site: 'kick', login: 'Pixel_Fox', name: 'Pixel_Fox' } };
  const m = menuFor({}, { chat, message });
  assert.deepEqual(labels(m).slice(0, 4), ['Shout out Pixel_Fox', '—', 'Copy message', 'Copy message with emotes']);
  assert.deepEqual(m[0].act, { do: 'shoutout', who: { site: 'kick', login: 'pixel_fox', name: 'Pixel_Fox' } });
  assert.equal(menuFor({}, { chat, message: { ...message, shout: { site: 'kick', login: 'nova-lynx' } } })[0].label, 'Shout out nova-lynx', 'no name: the address');
  for (const shout of [{ site: 'youtube', login: 'x' }, { site: 'kick', login: 'a b' }, { site: 'twitch', login: '' }, 'kick', null])
    assert.ok(!labels(menuFor({}, { chat, message: { ...message, shout } })).some(l => /Shout out/.test(l)), JSON.stringify(shout));
  assert.ok(!labels(menuFor({ isEditable: true }, { chat, message })).some(l => /Shout out/.test(l)), 'not in the chat box');
});

test('Developer tools on: a Developer group last, with the message\'s and the chat\'s HTML, Why didn\'t this alert? and Inspect', () => {
  const chat = { on: false, auto: false }, message = { text: 'hi', withEmotes: 'hi', html: '<div data-index="1">hi</div>' };
  const m = menuFor({ x: 4, y: 5 }, { chat, message, devTools: true });
  assert.deepEqual(labels(m).slice(-6), ['—', 'Developer', 'Copy message HTML', 'Copy chat HTML', 'Why didn\'t this alert?', 'Inspect']);
  assert.equal(find(m, 'Developer').head, true, 'a heading, not an item');
  assert.deepEqual(find(m, 'Copy message HTML').act, { do: 'copyText', text: '<div data-index="1">hi</div>' });
  assert.deepEqual(find(m, 'Copy chat HTML').act, { do: 'copyChatHtml' });
  assert.deepEqual(find(m, 'Why didn\'t this alert?').act, { do: 'whyAlert' });
  assert.deepEqual(find(m, 'Inspect').act, { do: 'inspect', x: 4, y: 5 });
  // a chat but not on a message: the chat's HTML only; a stream: Inspect only; the chat box: no chat items
  assert.deepEqual(labels(menuFor({}, { chat, devTools: true })).slice(-3), ['Developer', 'Copy chat HTML', 'Inspect']);
  assert.deepEqual(labels(menuFor({}, { devTools: true })), ['Reload', '—', 'Developer', 'Inspect']);
  assert.deepEqual(labels(menuFor({ isEditable: true }, { chat, message, devTools: true })).slice(-2), ['Developer', 'Inspect']);
  // off: none of it (a developer copy still has Inspect, on its own)
  assert.ok(!labels(menuFor({}, { chat, message })).some(l => /HTML|Developer|alert|Inspect/.test(l)));
  assert.deepEqual(labels(menuFor({}, { chat, message, dev: true })).slice(-2), ['—', 'Inspect']);
  assert.equal(labels(menuFor({}, { dev: true, devTools: true })).filter(l => l === 'Inspect').length, 1, 'Inspect once');
});
