// Settings › Search box (#193): the search box on or off (no Search button, Ctrl/⌘+K only says where to turn it on;
// with the toolbar on top, and on the left with and without its labels), Recent on or off, and the list of what it
// remembers: drawn as the box draws it, each with a × and Clear all asking first, in step with the box and the other window.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

const K = 'ControlOrMeta+k';
const IDS = ['settings.general', 'settings.chat', 'settings.themes'];
const remember = (ids, more = '') => `try { localStorage.setItem('kickMultiview.palette', ${JSON.stringify(JSON.stringify({ recent: ids, used: {} }))}); ${more} } catch {}`;
const open = page => page.evaluate(() => window.openSettings('search'));
const listed = page => page.$$eval('#sbList .sb-row', rs => rs.map(r => r.dataset.id));
const inBox = page => page.evaluate(() => window.palette.rows().filter(r => r.group === 'Recent').map(r => r.id));
const isOpen = page => page.evaluate(() => window.palette.isOpen());
const BARS = [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }];

test('the page: after Themes, its two switches on, and what\'s remembered, newest first, as the box draws it', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await open(page);
  const rail = await page.$$eval('#settingsDlg .st-rail button[data-s]', bs => bs.filter(b => !b.hidden).map(b => b.dataset.s));
  assert.equal(rail[rail.indexOf('themes') + 1], 'search', 'after Themes');
  assert.equal(await page.isChecked('#palOnSet'), true);
  assert.equal(await page.isChecked('#palRecentSet'), true);
  assert.deepEqual(await listed(page), IDS);
  assert.equal(await page.textContent('#sbCount'), '3 remembered · the box shows up to 5');
  assert.equal(await page.textContent('#sbList .sb-row[data-id="settings.chat"] .pal-t'), 'Settings › Chat');
  assert.equal(await page.locator('#sbList .sb-row .pal-ico').count(), 3, 'with their icons');
  assert.match(await page.textContent('#settingsDlg .sb-tip'), process.platform === 'darwin' ? /⌘⌫ or Del removes/ : /Del removes/);
  assert.ok(await page.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1), 'the page doesn\'t scroll');
});

test('a × removes it here and from the box\'s Recent; Clear all asks first (Keep keeps them); nothing left: "Nothing yet"', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await open(page);
  await page.hover('#sbList .sb-row[data-id="settings.chat"]');
  await page.click('#sbList .sb-row[data-id="settings.chat"] .sb-x');
  assert.deepEqual(await listed(page), ['settings.general', 'settings.themes']);
  await page.keyboard.press('Escape');
  await page.keyboard.press(K);
  assert.deepEqual(await inBox(page), ['settings.general', 'settings.themes'], 'gone from the box too');
  // and one removed in the box goes from here
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await open(page);
  assert.deepEqual(await listed(page), ['settings.themes']);
  // Clear all: asks, Keep keeps them
  await page.click('#sbActs .sb-clear');
  assert.match(await page.textContent('#sbActs'), /Forget all 1, and how often you use each\?\s*Keep\s*Clear all/);
  assert.equal(await page.textContent('#sbCount'), '');
  await page.click('#sbActs .sb-keep');
  assert.deepEqual(await listed(page), ['settings.themes']);
  await page.click('#sbActs .sb-clear');
  await page.click('#sbActs .sb-clear');
  assert.deepEqual(await listed(page), []);
  assert.equal(await page.textContent('#sbList'), 'Nothing yet');
  assert.equal(await page.locator('#sbActs .sb-clear').count(), 0, 'nothing to clear');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.palette')), null);
});

test('Recent off: no Recent in the box and nothing new remembered; the list is kept (greyed) and comes back when it\'s on', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await open(page);
  await page.click('#settingsDlg .st-pane[data-s=search] .st-row:has(#palRecentSet)');
  assert.equal(await page.isChecked('#palRecentSet'), false);
  assert.equal(await page.$eval('#settingsDlg .st-pane[data-s=search]', p => p.classList.contains('sb-norecent')), true, 'the list greys out');
  assert.deepEqual(await listed(page), IDS, 'and is kept');
  await page.keyboard.press('Escape');
  await page.keyboard.press(K);
  assert.deepEqual(await inBox(page), [], 'no Recent in the box');
  await page.fill('#palQ', 'snap windows'); await page.waitForTimeout(50); await page.keyboard.press('Enter');
  await page.evaluate(() => window.palette.close());   // (a switch flips with the box still open)
  await open(page);
  assert.deepEqual(await listed(page), IDS, 'nothing new remembered');
  await page.click('#settingsDlg .st-pane[data-s=search] .st-row:has(#palRecentSet)');
  await page.keyboard.press('Escape');
  await page.keyboard.press(K);
  assert.deepEqual(await inBox(page), IDS, 'back');
});

for (const b of BARS) {
  const name = b.pos + (b.pos === 'left' ? (b.labels ? ', with labels' : ', icons only') : '');
  test(`the search box off: no Search button, Ctrl/⌘+K says where to turn it on, the page greys out; on again it's back (toolbar ${name})`, async t => {
    const page = await openApp(t, { init: remember(IDS, `localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(b))});`) });
    assert.equal(await page.isVisible('#palBtn'), true);
    await open(page);
    await page.click('#settingsDlg .st-pane[data-s=search] .st-lead');
    assert.equal(await page.isChecked('#palOnSet'), false);
    assert.equal(await page.$eval('#settingsDlg .st-pane[data-s=search]', p => p.classList.contains('sb-off')), true, 'the rest greys out');
    assert.equal(await page.$eval('#settingsDlg .sb-rest', e => getComputedStyle(e).pointerEvents), 'none');
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#palBtn'), false, 'no Search button');
    assert.equal(await page.$('#moreMenu #palBtn'), null, 'nor in ⋯ More');
    await page.waitForTimeout(100);
    assert.ok(await page.$eval('header', h => document.body.classList.contains('bar-left') ? h.scrollHeight <= h.clientHeight + 1 : h.scrollWidth <= h.clientWidth + 1), 'the toolbar still fits');
    await page.keyboard.press(K);
    assert.equal(await isOpen(page), false, 'Ctrl/⌘+K doesn\'t open it');
    assert.equal(await page.textContent('#msg'), 'The search box is off. Turn it on in Settings › Search box');
    await page.evaluate(() => window.palette.toggle());   // (the app menu's Search and actions…, and the main process's Ctrl/⌘+K from a view)
    assert.equal(await isOpen(page), false);
    // on again
    await open(page);
    await page.click('#settingsDlg .st-pane[data-s=search] .st-lead');
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#palBtn'), true);
    await page.keyboard.press(K);
    assert.equal(await isOpen(page), true);
  });
}

test('switched off in the other window: this one follows (its Search button, an open box, the page)', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await page.keyboard.press(K);
  assert.equal(await isOpen(page), true);
  await page.evaluate(() => {
    localStorage.setItem('kickMultiview.paletteOn', '0');
    window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.paletteOn', newValue: '0' }));
  });
  assert.equal(await isOpen(page), false, 'the open box closes');
  assert.equal(await page.isVisible('#palBtn'), false);
  await open(page);
  assert.equal(await page.isChecked('#palOnSet'), false);
  // and what the other window forgot goes from the list
  await page.evaluate(() => {
    localStorage.setItem('kickMultiview.palette', JSON.stringify({ recent: ['settings.themes'], used: {} }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.palette' }));
  });
  assert.deepEqual(await listed(page), ['settings.themes']);
});
