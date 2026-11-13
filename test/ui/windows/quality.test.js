// Stream quality's settings (windows/quality.js): Settings › General (the choice for every stream, Fits the window's
// range, hidden streams), a channel's and a linked streamer's own (Channel settings › Streams), and its row in
// Settings › Windows. The quality button and its menu are the desktop app's (test/launch/windows/quality.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const stored = (page, k) => page.evaluate(k => localStorage.getItem('kickMultiview.' + k), k);
// what the other window (or another computer, Settings › Sync) would write, and the event this window gets for it
const fromOther = (page, key, value) => page.evaluate(([k, v]) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v })); }, ['kickMultiview.' + key, value]);

test('Settings › General: the site\'s own until changed; Fits the window shows its range; hidden streams at their lowest', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('general'));
  assert.equal(await page.inputValue('#qualitySet'), 'site');
  assert.equal(await page.isVisible('#qualityFitRow'), false, 'its range only with Fits the window');
  assert.equal(await page.inputValue('#qualityHidden'), 'low');
  await page.selectOption('#qualitySet', 'fit');
  assert.equal(await stored(page, 'quality'), 'fit');
  assert.equal(await page.isVisible('#qualityFitRow'), true);
  assert.deepEqual([await page.inputValue('#qualityMin'), await page.inputValue('#qualityMax')], ['160', 'site'], 'from 160p up to the site\'s own');
  await page.selectOption('#qualityMin', '360');
  await page.selectOption('#qualityMax', '1080');
  assert.deepEqual(JSON.parse(await stored(page, 'qualityFit')), { min: 360, max: 1080 });
  await page.selectOption('#qualityMax', 'site');
  assert.deepEqual(JSON.parse(await stored(page, 'qualityFit')), { min: 360, max: 'site' });
  await page.selectOption('#qualityHidden', 'same');
  assert.equal(await stored(page, 'qualityHidden'), 'same');
  await page.selectOption('#qualityHidden', 'low');
  assert.equal(await stored(page, 'qualityHidden'), null, 'the default isn\'t stored');
  await page.selectOption('#qualitySet', 'site');
  assert.equal(await stored(page, 'quality'), null);
  assert.equal(await page.isVisible('#qualityFitRow'), false);
});

test('Settings › General follows a change from the other window or another computer', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('general'));
  await fromOther(page, 'quality', 'fit');
  assert.equal(await page.inputValue('#qualitySet'), 'fit');
  assert.equal(await page.isVisible('#qualityFitRow'), true);
  await fromOther(page, 'qualityFit', JSON.stringify({ min: 480, max: 720 }));
  assert.deepEqual([await page.inputValue('#qualityMin'), await page.inputValue('#qualityMax')], ['480', '720']);
  await fromOther(page, 'qualityHidden', 'same');
  assert.equal(await page.inputValue('#qualityHidden'), 'same');
  await fromOther(page, 'quality', 'nonsense');
  assert.equal(await page.inputValue('#qualitySet'), 'site', 'something it doesn\'t know: the site\'s own');
});

test('Channel settings › Streams: a channel\'s own quality, saying what Settings says; a linked streamer\'s is for all their sites', async t => {
  const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala'] };
  const page = await openApp(t, { init: `if (!sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); localStorage.setItem('kickMultiview.streamers', ${JSON.stringify(JSON.stringify([STREAMER]))}); localStorage.setItem('kickMultiview.linkedOn', '1'); localStorage.setItem('kickMultiview.quality', 'fit'); }` });
  const row = '#linkDlg .lc-opt:has(select[data-cmd="link.quality"])';
  await page.evaluate(() => window.openLinkCard('novalynx', { tab: 'streams' }));
  assert.match(await page.textContent(row), /QualitySettings › General says: Fits the window/);
  assert.equal(await page.inputValue(row + ' select'), '');
  await page.selectOption(row + ' select', 'best');
  assert.deepEqual(JSON.parse(await stored(page, 'chanOpts')), { novalynx: { quality: 'best' } });
  await page.selectOption(row + ' select', '');
  assert.equal(await stored(page, 'chanOpts'), '{}', 'As in Settings: nothing of its own');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.openLinkCard('quietkoala', { tab: 'streams' }));
  assert.match(await page.textContent(row), /on every site of theirs/);
  await page.selectOption(row + ' select', '480');
  assert.equal(JSON.parse(await stored(page, 'streamers'))[0].playQuality, '480');
  await page.selectOption(row + ' select', '');
  assert.equal(JSON.parse(await stored(page, 'streamers'))[0].playQuality, undefined);
});

test('Settings › Windows: Quality is a button like the others, shown as what it plays on the preview, before Reload', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('windows', { sub: 'buttons' }));
  const rows = await page.$$eval('#wbList [data-k]', l => l.map(r => r.dataset.k));
  assert.equal(rows[rows.indexOf('quality') + 1], 'reload');
  assert.match(await page.textContent('#wbList [data-k=quality]'), /QualityStream windows: what it plays/);
  assert.equal(await page.textContent('#wbPreview [data-k=quality]'), '720p');
});
