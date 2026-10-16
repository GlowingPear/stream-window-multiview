// Messages from outside the page (src/page/shared/incoming.js): from the desktop app, and from the scripts in the
// sites' chat pages.
const test = require('node:test');
const assert = require('node:assert/strict');

let I;
test.before(async () => {
  globalThis.window = { kmv: { onLiveStatus: fn => { window.__live = fn; }, desktop: true } };
  I = await import('../../../../src/page/shared/incoming.js');
});

test('fromApp: listens through the desktop app\'s bridge, and does nothing when it doesn\'t send that', () => {
  let got = null;
  I.fromApp('onLiveStatus', snap => { got = snap; });
  window.__live({ alpha: { live: true } });
  assert.deepEqual(got, { alpha: { live: true } });
  assert.doesNotThrow(() => I.fromApp('onSomethingNew', () => {}));
  const kmv = window.kmv; delete window.kmv;
  assert.doesNotThrow(() => I.fromApp('onLiveStatus', () => {}), 'outside the desktop app');
  window.kmv = kmv;
});

test('fromSite: a chat page\'s "__kmv:<kind> <data>" message goes to that kind\'s handler, with its window and view', () => {
  const seen = [];
  I.fromSite('emote-copy', (w, data, view) => seen.push(['copy', w.id, data, view]));
  I.fromSite('kick-cmd', (w, cmd) => seen.push(['cmd', cmd]), /^[a-z]+$/);
  const w = { id: 7 }, view = 'the view';
  I.siteMessage(w, view, '__kmv:emote-copy {"name":"pearHype"}');
  I.siteMessage(w, view, '__kmv:kick-cmd clip');
  I.siteMessage(w, view, '__kmv:kick-cmd Clip!');            // not what that kind sends
  I.siteMessage(w, view, '__kmv:emote-copy not json');
  I.siteMessage(w, view, '__kmv:nobody-listens {}');
  I.siteMessage(w, view, 'an ordinary console message');
  assert.deepEqual(seen, [['copy', 7, '{"name":"pearHype"}', 'the view'], ['cmd', 'clip']]);
});
