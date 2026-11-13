// The switch control (src/page/layout/switcher.js): a channel's name from its site is only ever text in it,
// also in its buttons' tooltips.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, press, windows, settled } = require('../app');
const { openApp } = setup();

test('a name with markup in it stays text in the switch control, tooltips too', async t => {
  const name = 'a" onmouseover="window.__xss=1" x="<img src=x onerror="window.__xss=2">';
  const page = await openApp(t, { init: `try { localStorage.setItem('kickMultiview.chNames', ${JSON.stringify(JSON.stringify({ 'yt:v:abcdefghijk': name }))}); } catch {}` });
  await add(page, 'https://youtu.be/abcdefghijk', 'alpha');
  await press(page, 'f');                                     // Focus view: the switch control under the big stream
  const item = '#featSwitch .fs-item[data-ch="yt:v:abcdefghijk"]';
  await page.waitForSelector(item);
  assert.equal(await page.textContent(item + ' .fs-name span'), name);
  assert.equal(await page.getAttribute(item + ' .fs-rl', 'title'), `Refresh ${name}`);
  assert.equal(await page.getAttribute(item + ' .fs-x', 'title'), `Remove ${name} (stream and chat)`);
  assert.equal(await page.locator('#featSwitch [onmouseover], #featSwitch img[onerror]').count(), 0, 'no attributes or elements from it');
  await page.hover(item + ' .fs-rl');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
});

test('Remove (the switch control, its ✕, the search box) with the layout locked: Auto layout fits around what is left, as the window\'s ✕ does; Undo puts it back in its place', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=auto]');
  await settled(page);
  await page.keyboard.press('Shift+L');
  const streams = async () => (await windows(page)).filter(w => w.kind === 'stream').sort((p, q) => p.y - q.y || p.x - q.x);
  const before = await streams();
  await page.evaluate(() => window.smvNotes.removeChannel('bravo'));
  await settled(page);
  const after = await streams();
  assert.deepEqual(after.map(w => w.title), ['alpha', 'charlie']);
  assert.ok(after[1].y < before[2].y && after[1].h > before[0].h, 'charlie moved up into the room, bigger');
  await page.click('#toast button');
  await settled(page);
  assert.deepEqual(await streams(), before, 'Undo: bravo back where it was');
});
