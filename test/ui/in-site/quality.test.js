// The script inside each stream's player page (in-site/quality.js), on stand-in players in the app's own page: Kick's
// and Twitch's Amazon IVS player (found through React from the <video>), and YouTube's.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// A page with a stand-in IVS player: in a ref of the <video>'s own fiber (Kick), or in the props of a parent's (Twitch)
async function ivsPage(t, where = 'ref') {
  const page = await openApp(t);
  await page.evaluate(async where => {
    window.agent = (await import('./page/in-site/quality.js')).qualityAgent;
    const qs = [[480, '480p'], [1080, '1080p60'], [160, '160p'], [720, '720p60'], [360, '360p']].map(([height, name]) => ({ name, height }));
    let cap = qs[3];
    const p = window.p = { getQualities: () => qs, getQuality: () => cap, setAutoMaxQuality: q => { cap = q; p.set.push(q.name); }, set: [],
      auto: false, isAutoQualityMode: () => p.auto, setAutoQualityMode: on => { p.auto = on; } };
    const box = document.createElement('div'), v = document.createElement('video');
    box.append(v); document.body.append(box);
    if (where === 'ref') v.__reactFiber$x = { memoizedState: { memoizedState: { current: p }, next: null }, return: null };
    else {
      v.__reactFiber$x = { memoizedState: { memoizedState: 'other', next: { memoizedState: null, next: null } }, return: { memoizedProps: { label: 'x' }, return: null } };
      box.__reactFiber$x = { memoizedState: null, memoizedProps: { mediaPlayerInstance: p }, return: null };
    }
  }, where);
  return page;
}
const run = (page, cap) => page.evaluate(cap => window.agent(cap), cap);

test('Kick\'s player: capped at the highest it has under the cap, in its own automatic choice; it says what it has and plays', async t => {
  const page = await ivsPage(t);
  const r = await run(page, 480);
  assert.deepEqual(r.all.map(q => q.h), [1080, 720, 480, 360, 160], 'highest first');
  assert.deepEqual(r.now, { h: 480, name: '480p' });
  assert.equal(await page.evaluate(() => window.p.auto), true, 'its automatic choice, under the cap');
  assert.equal((await run(page, 500)).now.h, 480, 'between two: the one under');
  assert.equal((await run(page, 100000)).now.h, 1080, 'best');
  assert.equal((await run(page, 0)).now.h, 160, 'lowest');
  assert.equal((await run(page, 100)).now.h, 160, 'under its lowest: its lowest');
  assert.equal((await run(page, null)).now.h, 1080, 'the site\'s own: no cap');
});

test('Kick\'s player: the same cap again isn\'t set again; a player loaded again (a new one) gets it', async t => {
  const page = await ivsPage(t);
  await run(page, 360); await run(page, 360); await run(page, 360);
  assert.deepEqual(await page.evaluate(() => window.p.set), ['360p']);
  await page.evaluate(() => { delete window.p.__kmvCap; });   // (as a new player has no mark)
  await run(page, 360);
  assert.deepEqual(await page.evaluate(() => window.p.set), ['360p', '360p']);
});

test('Twitch\'s player: found in a parent\'s props', async t => {
  const page = await ivsPage(t, 'props');
  assert.equal((await run(page, 360)).now.h, 360);
});

test('no player (yet), or one with no qualities yet: nothing', async t => {
  const page = await openApp(t);
  assert.equal(await page.evaluate(async () => (await import('./page/in-site/quality.js')).qualityAgent(720)), null);
  const ivs = await ivsPage(t);
  assert.equal(await ivs.evaluate(() => { window.p.getQualities = () => []; return window.agent(720); }), null);
});

test('YouTube\'s player: the one asked for (the highest under the cap), or its own automatic choice', async t => {
  const page = await openApp(t);
  await page.evaluate(async () => {
    window.agent = (await import('./page/in-site/quality.js')).qualityAgent;
    const p = window.yt = document.createElement('div'); p.id = 'movie_player';
    p.calls = []; p.q = 'auto';
    p.getAvailableQualityLevels = () => ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny', 'auto'];
    p.setPlaybackQualityRange = (a, b) => { p.calls.push(a + '/' + b); p.q = a; };
    p.getPlaybackQuality = () => p.q === 'auto' ? 'hd720' : p.q;
    const v = document.createElement('video'); p.append(v); document.body.append(p);
  });
  const r = await run(page, 480);
  assert.deepEqual(r.all.map(q => q.h), [1080, 720, 480, 360, 240, 144]);
  assert.deepEqual(r.now, { h: 480, name: '480p' });
  assert.equal((await run(page, 0)).now.h, 144);
  assert.equal((await run(page, 100000)).now.h, 1080);
  assert.equal((await run(page, null)).now.h, 720, 'its own choice (it plays 720p)');
  await run(page, null);
  assert.deepEqual(await page.evaluate(() => window.yt.calls), ['large/large', 'tiny/tiny', 'hd1080/hd1080', 'auto/auto'], 'asked once each');
  // what it plays, from the video when the player doesn't say
  assert.equal(await page.evaluate(() => { window.yt.getPlaybackQuality = () => 'unknown'; Object.defineProperty(document.querySelector('video'), 'videoHeight', { get: () => 400 }); return window.agent(null).now.h; }), 360);
  assert.equal(await page.evaluate(() => { window.yt.getAvailableQualityLevels = () => ['auto']; return window.agent(null); }), null, 'nothing to pick yet');
});
