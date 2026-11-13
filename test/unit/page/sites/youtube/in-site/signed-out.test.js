// Whether YouTube's chat page shows you signed out (src/page/sites/youtube/in-site/signed-out.js), with its page faked
// as it is signed in (its chat box) and signed out ("Sign in to chat", a link to Google's sign-in, as its page has it).
const test = require('node:test');
const assert = require('node:assert/strict');

let youtubeSignedOut;
test.before(async () => { ({ youtubeSignedOut } = await import('../../../../../../src/page/sites/youtube/in-site/signed-out.js')); });
test.after(() => { delete globalThis.document; delete globalThis.window; });

// its page: the selectors it has, and what its ytcfg says (LOGGED_IN: undefined when it has no ytcfg yet)
function page(has, loggedIn){
  globalThis.document = { querySelector: sel => (sel.split(',').map(s => s.trim()).some(s => has.includes(s)) ? {} : null) };
  globalThis.window = loggedIn === undefined ? {} : { ytcfg: { get: k => (k === 'LOGGED_IN' ? loggedIn : undefined) } };
}

test('its chat box: signed in, whatever its page says', () => {
  page(['yt-live-chat-text-input-field-renderer #input'], false);
  assert.equal(youtubeSignedOut(), false);
});

test('"Sign in to chat" where the box would be, or its page saying nobody is signed in: signed out', () => {
  page(['yt-live-chat-message-renderer a[href*="ServiceLogin"]'], true);
  assert.equal(youtubeSignedOut(), true, 'its sign-in in the chat');
  page(['yt-live-chat-restricted-participation-renderer a[href*="ServiceLogin"]']);
  assert.equal(youtubeSignedOut(), true);
  page([], false);
  assert.equal(youtubeSignedOut(), true, 'ytcfg: nobody');
});

test('neither yet (loading, or a chat with no box for you, like members only): can\'t tell', () => {
  page([], true);
  assert.equal(youtubeSignedOut(), null, 'signed in, but no box: members only');
  page([]);
  assert.equal(youtubeSignedOut(), null, 'no ytcfg yet');
});
