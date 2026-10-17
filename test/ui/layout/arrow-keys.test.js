// ← / → between streams in every layout: big in Focus view, on the stage in Chat Stage, its chat in Chat Rail, picked
// (with an outline) in the others; the keys that act on a stream (M, Space, R, ↑ / ↓) act on that one; and Settings >
// Layouts > Sound follows the arrow keys.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, press } = require('../app');
const { openApp } = setup();

async function appWith(t, layoutKey, names = ['alpha', 'bravo', 'charlie']) {
  const page = await openApp(t, { width: 1600, height: 900 });
  await add(page, ...names);
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');   // the first-run tips card
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await press(page, layoutKey);
  return page;
}
const key = async (page, k) => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await press(page, k); };
const target = page => page.evaluate(() => window.bigStream());
const onStage = page => page.$eval('#stage .win.stg-on .title', e => e.textContent);
const inRail = page => page.$eval('#stage .win.rl-chat .title', e => e.textContent);
const picked = page => page.$$eval('#stage .win.kb-sel .title', l => l.map(e => e.textContent));

test('← / → in Chat Stage put the next or previous stream on the stage, round the ends, and the keys act on it', async t => {
  const page = await appWith(t, 'k');
  assert.equal(await onStage(page), 'alpha');
  await key(page, 'ArrowRight');
  assert.equal(await onStage(page), 'bravo');
  assert.equal(await target(page), 'bravo', 'M, Space, R and ↑ / ↓ act on the stream on the stage');
  await key(page, 'ArrowRight'); await key(page, 'ArrowRight');
  assert.equal(await onStage(page), 'alpha', 'after the last, the first again');
  await key(page, 'ArrowLeft');
  assert.equal(await onStage(page), 'charlie', 'and backwards');
  assert.match(await page.textContent('#msg'), /charlie/, 'it says which');
});

test('← / → in Chat Rail show the next or previous chat in the rail, and the keys act on its stream', async t => {
  const page = await appWith(t, 'Shift+K');
  assert.equal(await inRail(page), 'alpha');
  await key(page, 'ArrowRight');
  assert.equal(await inRail(page), 'bravo');
  assert.equal(await page.$eval('#railTabs .rl-tab.on', b => b.dataset.ch), 'bravo', 'its tab');
  assert.equal(await page.$eval('#stage .win.rl-shown .title', e => e.textContent), 'bravo', 'its stream outlined');
  assert.equal(await target(page), 'bravo');
  await key(page, 'ArrowLeft'); await key(page, 'ArrowLeft');
  assert.equal(await inRail(page), 'charlie', 'round the ends');
  assert.match(await page.textContent('#msg'), /charlie's chat/);
});

test('← / → in Tile pick a stream with an outline that fades, and the keys act on it', async t => {
  const page = await appWith(t, 't');
  assert.equal(await target(page), 'alpha', 'nothing picked: the first, as before');
  await key(page, 'ArrowRight');
  assert.deepEqual(await picked(page), ['alpha'], 'the first time: the first stream');
  await key(page, 'ArrowRight');
  assert.deepEqual(await picked(page), ['bravo']);
  assert.equal(await target(page), 'bravo');
  assert.ok(await page.$eval('#stage .win.kb-sel', e => getComputedStyle(e).animationName === 'kb-sel'), 'the outline fades');
  await key(page, 'ArrowLeft'); await key(page, 'ArrowLeft');
  assert.deepEqual(await picked(page), ['charlie'], 'round the ends');
  // the same in Auto layout; a closed stream isn't the target any more
  await key(page, 'a');
  assert.equal(await target(page), 'charlie');
  await page.click('#stage .win.stream:has(.title:text-is("charlie")) .bar [data-a=close]');
  assert.equal(await target(page), 'alpha');
});

test('← / → in Focus view still make the next or previous stream big, and Columns still scroll', async t => {
  const page = await appWith(t, 'f');
  const big = () => page.$eval('#stage .win.stream.featured .title', e => e.textContent).catch(() => null);
  const first = await big();
  await key(page, 'ArrowRight');
  assert.notEqual(await big(), first);
  assert.equal(await target(page), await big());
  await key(page, 'ArrowLeft');
  assert.equal(await big(), first);
  assert.equal(await page.evaluate(() => window.stepStream(1)), true);
});

test('Sound follows the arrow keys: off at first; on, the stream you move to is the one you hear', async t => {
  const page = await appWith(t, 'k');
  await page.evaluate(() => window.openSettings('layouts'));
  assert.equal(await page.isChecked('#arrowSound'), false, 'off at first');
  const before = await page.evaluate(() => window.mutedStreams());
  await page.keyboard.press('Escape');
  await key(page, 'ArrowRight');
  assert.deepEqual(await page.evaluate(() => window.mutedStreams()), before, 'off: the sound stays as it was');
  await page.evaluate(() => window.openSettings('layouts'));
  await page.check('#arrowSound');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.arrowSound')), '1');
  await page.keyboard.press('Escape');
  await key(page, 'ArrowRight');                                // charlie on the stage
  assert.deepEqual(await page.evaluate(() => window.mutedStreams()), ['alpha', 'bravo'], 'only charlie heard');
  assert.match(await page.textContent('#msg'), /charlie · sound on/);
  await key(page, 't'); await key(page, 'ArrowRight');           // Tile: alpha picked
  assert.deepEqual(await page.evaluate(() => window.mutedStreams()), ['bravo', 'charlie']);
  // changed in the other window: shown here
  await page.evaluate(() => { localStorage.setItem('kickMultiview.arrowSound', '0'); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.arrowSound', newValue: '0' })); });
  await page.waitForFunction(() => !document.getElementById('arrowSound').checked);
});

test('with no streams, ← / → are left alone', async t => {
  const page = await openApp(t);
  assert.equal(await page.evaluate(() => window.stepStream(1)), false);
});
