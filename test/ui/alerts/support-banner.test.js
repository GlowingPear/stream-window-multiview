// Support and raids on the stream's picture (Settings › Mentions › Support › Show it on the stream's picture): who and
// what along the bottom of that channel's stream window for about 10 s, in any layout, one after another.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, press } = require('../app');
const { openApp } = setup();

// the app with support alerts on (and their sound off), a few streams, and the first-run tips card gone
async function appWith(t, names) {
  // (the start-up script also runs in the streams' frames, which have no storage)
  const page = await openApp(t, { init: () => { try { localStorage.setItem('kickMultiview.alerts', JSON.stringify({ support: { on: true, sound: 'none' } })); } catch {} } });
  await add(page, ...names);
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');
  return page;
}
const bannerOf = async (page, name) => { const b = win(page, name).locator('.sup-banner'); return await b.count() ? b.textContent() : ''; };
const support = (page, ch, list) => page.evaluate(([ch, list]) => window.supportFrom(ch, list), [ch, list]);

test('a support alert shows on its stream\'s picture, one after another, in the Support colour, and goes after about 10 s', async t => {
  const page = await appWith(t, ['alpha', 'bravo']);
  await press(page, 't');
  await support(page, 'alpha', [{ kind: 'gifts', who: 'giftfox88', n: 5 }, { kind: 'raid', who: 'pixelpear', n: 120 }]);
  assert.equal(await bannerOf(page, 'alpha'), 'giftfox88 gifted 5 subs');
  assert.equal(await bannerOf(page, 'bravo'), '', 'only that channel\'s stream');
  assert.equal(await win(page, 'alpha').locator('.sup-banner').count(), 1, 'one at a time');
  assert.equal(await win(page, 'alpha').locator('.sup-banner').evaluate(b => getComputedStyle(b).backgroundColor), 'rgb(83, 252, 24)');
  // the next one when it goes
  await page.waitForFunction(() => /raided/.test(document.querySelector('.sup-banner')?.textContent || ''), null, { timeout: 12000 });
  assert.equal(await bannerOf(page, 'alpha'), 'pixelpear raided with 120 viewers');
  assert.ok(await win(page, 'alpha').locator('.sup-banner .sup-ico svg').count(), 'with its icon');
});

test('on Chat Stage\'s strip too, over the picture; switched off in Settings › Mentions › Support, nothing on the picture', async t => {
  const page = await appWith(t, ['alpha', 'bravo', 'charlie']);
  await press(page, 'k');
  await support(page, 'bravo', [{ kind: 'kicks', who: 'zestyplum', n: 500 }]);
  const strip = page.locator('#stage .win.stg-thumb:has(.title:text-is("bravo")) .sup-banner');
  assert.equal(await strip.textContent(), 'zestyplum sent 500 KICKs');
  assert.equal(await strip.evaluate(b => getComputedStyle(b).pointerEvents), 'none', 'clicks go through to the picture');
  // off
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=mentions]').hidden = false; window.openSettings('mentions'); });   // (the desktop app's pages)
  await page.click('#mentTabs [data-t=support]');
  assert.equal(await page.isChecked('[data-al="support.banner"]'), true, 'on at first');
  await page.uncheck('[data-al="support.banner"]');
  await page.keyboard.press('Escape');
  await support(page, 'charlie', [{ kind: 'kicks', who: 'quietkoala', n: 500 }]);
  assert.equal(await page.locator('#stage .win.stg-thumb:has(.title:text-is("charlie")) .sup-banner').count(), 0);
});
