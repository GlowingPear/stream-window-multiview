// The switch control (src/page/layout/switcher.js): a channel's name from its site is only ever text in it,
// also in its buttons' tooltips.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, press } = require('../app');
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
