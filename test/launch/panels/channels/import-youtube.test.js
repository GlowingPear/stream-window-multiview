// Import follows › YouTube in the real desktop app, reading a stand-in youtube.com/feed/channels: the channels
// you follow, and a page YouTube has signed out (its ytcfg says so), which asks you to sign in again rather
// than saying you follow no one.
const test = require('node:test');
const { launchApp, assert } = require('../../app');

let a;
test.before(async () => { a = await launchApp(); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// youtube.com/feed/channels as YouTube serves it, signed in (with one channel) or signed out
const feed = signedIn => a.app.evaluate(({ session }, signedIn) => {
  const s = session.fromPartition('persist:youtube');
  try { s.protocol.unhandle('https'); } catch {}
  const page = `<!doctype html><title>All subscriptions - YouTube</title><script>window.ytcfg = { get: k => k === 'LOGGED_IN' ? ${signedIn} : undefined };</script>
    <ytd-browse page-subtype="subscriptions-channels">${signedIn ? '<ytd-channel-renderer><a href="/@pixelpear"><span id="channel-title"><span id="text">PixelPear</span></span></a></ytd-channel-renderer>' : ''}</ytd-browse>`;
  s.protocol.handle('https', () => new Response(page, { headers: { 'content-type': 'text/html' } }));
}, signedIn);

test('YouTube: the channels you follow are read from your subscriptions page', { timeout: 60000 }, async () => {
  await feed(true);
  const r = await a.win.evaluate(() => window.kmv.importFollows('youtube'));
  assert.deepEqual(r.items, [{ ch: 'yt:@pixelpear', name: 'PixelPear' }]);
});

test('YouTube signed out (its page says so): asks you to sign in, not "no channels"', { timeout: 60000 }, async () => {
  await feed(false);
  assert.deepEqual(await a.win.evaluate(() => window.kmv.importFollows('youtube')), { error: 'login' });
});
