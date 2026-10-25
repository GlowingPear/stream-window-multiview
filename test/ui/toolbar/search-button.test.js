// The toolbar's Search button (#184): a magnifier with its keys (⌘K, or Ctrl K) after Channels, with the toolbar at
// the top, on the left with names ("Search" and the keys) and on the left with icons only (the icon alone); in a
// narrow window it moves into ⋯ like the others, and opens the search box from there.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const initBar = bar => `try { localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(bar))}) } catch {}`;
const BARS = [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }];
const nameOf = bar => bar.pos === 'top' ? 'at the top' : bar.labels ? 'on the left' : 'on the left, icons only';
const shown = (page, sel) => page.$eval(sel, e => e.checkVisibility());

for (const bar of BARS){
  test(`toolbar ${nameOf(bar)}: the Search button, its keys where there's room, and it opens the box`, async t => {
    const page = await openApp(t, { init: initBar(bar) });
    assert.equal(await shown(page, '#palBtn'), true);
    assert.equal(await shown(page, '#palBtn svg'), true, 'the magnifier');
    assert.match(await page.textContent('#palBtn .pal-kk'), /^(⌘K|Ctrl K)$/);
    assert.equal(await shown(page, '#palBtn .pal-kk'), !(bar.pos === 'left' && !bar.labels), 'the keys, except icons only');
    assert.equal(await shown(page, '#palBtn .tb-l'), bar.pos === 'left' && bar.labels, 'its name only in the column of names');
    assert.equal(await page.getAttribute('#palBtn', 'aria-label'), 'Search and actions');
    // after Channels
    const order = await page.$$eval('header > .btn', els => els.filter(e => e.checkVisibility()).map(e => e.id));
    assert.equal(order.indexOf('palBtn'), order.indexOf('savedBtn') + 1);
    if (bar.pos === 'top'){
      const w = await page.$eval('#palBtn', e => e.offsetWidth);
      assert.ok(w >= 50 && w <= 100, `about 64 px wide (more for Ctrl K): ${w}`);
    }
    await page.click('#palBtn');
    assert.equal(await page.evaluate(() => window.palette.isOpen()), true);
    await page.click('#palBtn', { force: true }).catch(() => {});
  });
}

test('a narrow window: the Search button goes into ⋯ (after the least-used ones) and works from there', async t => {
  const page = await openApp(t, { width: 360, height: 700 });
  await page.waitForTimeout(200);
  assert.equal(await page.$eval('#palBtn', e => e.parentElement.id), 'moreMenu');
  await page.click('#moreBtn');
  assert.equal(await shown(page, '#moreMenu #palBtn .tb-l'), true, 'with its name in the menu');
  await page.click('#moreMenu #palBtn');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true);
  assert.equal(await page.isVisible('#moreMenu'), false, 'the menu closed');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(200);
  assert.equal(await page.$eval('#palBtn', e => e.parentElement.tagName), 'HEADER', 'back in the toolbar');
});

test('on Windows and Linux: Ctrl K on the button, and its tooltip still names it (the keys aren\'t words it shows)', async t => {
  const page = await openApp(t, { init: () => Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64' }) });
  assert.equal(await page.textContent('#palBtn .pal-kk'), 'Ctrl K');
  assert.equal(await page.getAttribute('#palBtn', 'data-keys'), 'Ctrl K');
  assert.equal(await page.evaluate(() => window.tipFor(document.querySelector('#palBtn'))), 'Search');
  const w = await page.$eval('#palBtn', e => e.offsetWidth);
  assert.ok(w >= 50 && w <= 100, `${w}`);
  await page.keyboard.press('Control+k');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true);
  assert.deepEqual(await page.$$eval('#palBg .pal-k kbd', ks => ks.map(k => k.textContent)), ['Ctrl', 'K']);
});
