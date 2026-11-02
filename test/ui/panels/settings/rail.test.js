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
