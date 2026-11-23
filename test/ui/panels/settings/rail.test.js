// Settings' list of pages: each has its icon (ST_ICONS in panels/settings/settings.js), also those only the desktop app shows.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

test('every page in the list has an icon', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('general'));
  const missing = await page.$$eval('#settingsDlg .st-rail button[data-s]', bs => bs.filter(b => !b.querySelector(':scope > svg')).map(b => b.dataset.s));
  assert.deepEqual(missing, [], 'pages without an icon');
});

test('the list fits without scrolling on common screens (every page shown, the desktop app\'s too): its buttons give up a little height first', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('general'));
  await page.evaluate(() => document.querySelectorAll('#settingsDlg .st-rail button[data-s], #settingsDlg .st-rail-sec').forEach(b => { b.hidden = false; }));
  for (const [width, height] of [[1920, 1080], [1536, 864], [1440, 900], [1280, 800], [1366, 768], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    const r = await page.$eval('#settingsDlg .st-rail', el => ({ over: el.scrollHeight - el.clientHeight, h: Math.min(...[...el.querySelectorAll('button[data-s]')].map(b => b.getBoundingClientRect().height)) }));
    assert.equal(r.over, 0, `${width}×${height}: scrolls by ${r.over}px`);
    assert.ok(r.h >= 19, `${width}×${height}: its buttons stay at least 19px tall (${r.h})`);
  }
});
