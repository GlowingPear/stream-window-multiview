// The script inside each stream's player page (in-site/volume.js), on a stand-in <video> in the app's own page.
// Playing again (Play after a pause, or switching to a linked channel's tab) catches up to live within what the
// player has loaded: a live player's seekable end can be far past it (Twitch's is 2^30 s), and seeking there stalls it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// a stand-in live player at `at` seconds, with `buffered` seconds loaded and a seekable end far past them
async function playerOf(t, { at, buffered }) {
  const page = await openApp(t);
  const js = await page.evaluate(async () => (await import('./page/in-site/volume.js')).VOL_JS);
  await page.evaluate(([at, buffered]) => {
    const v = document.createElement('video'), range = end => ({ length: 1, start: () => 0, end: () => end });
    let now = at;
    Object.defineProperties(v, {
      buffered: { get: () => range(buffered) },
      seekable: { get: () => range(2 ** 30) },
      currentTime: { get: () => now, set: x => { now = x; } },
    });
    v.play = () => Promise.resolve();
    document.body.append(v);
  }, [at, buffered]);
  await page.evaluate(js);
  return page;
}
const timeAfterPlay = page => page.evaluate(() => { window.__kmv.play(); return document.querySelector('video').currentTime; });

test('playing a live stream that fell behind catches up to the newest part it has loaded, not past it', async t => {
  assert.equal(await timeAfterPlay(await playerOf(t, { at: 10, buffered: 30 })), 28);
});

test('playing a live stream that\'s close to the newest part it has loaded leaves it where it is', async t => {
  assert.equal(await timeAfterPlay(await playerOf(t, { at: 10, buffered: 15 })), 10);
});
