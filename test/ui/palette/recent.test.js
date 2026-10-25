// The search box's Recent (#193): the empty box's Clear all (asking first, in its heading) and Manage, the × on the
// row you're on, Del and ⌘⌫ / Ctrl+⌫ (plain ⌫ never removes anything), the footer's key, and the Clear Recent command.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const K = 'ControlOrMeta+k';
const IDS = ['settings.general', 'settings.chat', 'settings.themes', 'settings.keys'];
// what the box remembers, before the page loads
const remember = ids => `try { localStorage.setItem('kickMultiview.palette', ${JSON.stringify(JSON.stringify({ recent: ids, used: Object.fromEntries(ids.map(id => [id, { n: 1, t: Date.now() }])) }))}) } catch {}`;
const recent = page => page.evaluate(() => window.palette.rows().filter(r => r.group === 'Recent').map(r => r.id));
const saved = page => page.evaluate(() => (JSON.parse(localStorage.getItem('kickMultiview.palette') || '{}').recent) || []);
const selected = page => page.$eval('#palList .pal-row.on', r => r.dataset.id).catch(() => null);

test('a Recent row: its × (on the row you\'re on or over), Del and ⌘⌫ / Ctrl+⌫ remove it, the next takes its place; plain ⌫ doesn\'t', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await page.keyboard.press(K);
  assert.deepEqual(await recent(page), IDS);
  assert.equal(await selected(page), IDS[0]);
  // the × shows on the row you're on, and the footer says how
  assert.equal(await page.isVisible('#palList .pal-row.on .pal-forget'), true);
  assert.equal(await page.locator('#palList .pal-forget:visible').count(), 1, 'only there');
  assert.match(await page.textContent('#palBg .pal-foot'), process.platform === 'darwin' ? /⌘⌫\s*remove from Recent/ : /Del\s*remove from Recent/);
  // plain ⌫: nothing
  await page.keyboard.press('Backspace');
  assert.deepEqual(await recent(page), IDS);
  // Del
  await page.keyboard.press('Delete');
  assert.deepEqual(await recent(page), IDS.slice(1));
  assert.equal(await selected(page), IDS[1], 'the next takes its place');
  assert.deepEqual(await saved(page), IDS.slice(1), 'and it\'s saved');
  // ⌘⌫ / Ctrl+⌫
  await page.keyboard.press('ControlOrMeta+Backspace');
  assert.deepEqual(await recent(page), IDS.slice(2));
  // the ×, over another row
  await page.hover(`#palList .pal-row[data-id="${IDS[3]}"]`);
  await page.click(`#palList .pal-row[data-id="${IDS[3]}"] .pal-forget`);
  assert.deepEqual(await recent(page), [IDS[2]]);
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true, 'the box stays open');
  // a row that isn't a Recent one (words typed): Del and ⌘⌫ / Ctrl+⌫ are the words box's own, and there's no ×
  await page.fill('#palQ', 'snap windows'); await page.waitForTimeout(50);
  assert.equal(await page.locator('#palList .pal-forget').count(), 0);
  await page.keyboard.press('Home'); await page.keyboard.press('Delete');
  assert.equal(await page.inputValue('#palQ'), 'nap windows', 'Del deletes a letter');
  await page.fill('#palQ', '');
  assert.deepEqual(await recent(page), [IDS[2]], 'nothing else removed');
});

test('Recent\'s heading: Clear all asks first, in its place (Keep, Esc keep them; Clear all, Enter clear); Manage opens Settings › Search box', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await page.keyboard.press(K);
  const heading = () => page.textContent('#palList .pal-g:has(.pal-gacts)');
  assert.match(await heading(), /Recent\s*Clear all\s*Manage/);
  await page.click('#palList .pal-gbtn:text-is("Clear all")');
  assert.match(await heading(), /Forget all 4\?\s*Keep\s*Clear all/);
  assert.match(await page.textContent('#palBg .pal-foot'), /↵\s*clear all\s*·\s*Esc\s*keep them/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'palQ', 'the keyboard stays in the box');
  await page.keyboard.press('Escape');
  assert.deepEqual(await recent(page), IDS, 'Esc keeps them');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true, 'and the box stays open');
  await page.click('#palList .pal-gbtn:text-is("Clear all")');
  await page.click('#palList .pal-gbtn:text-is("Keep")');
  assert.deepEqual(await recent(page), IDS, 'Keep keeps them');
  await page.click('#palList .pal-gbtn:text-is("Clear all")');
  await page.click('#palList .pal-gbtn.danger');
  assert.deepEqual(await recent(page), [], 'Clear all clears them');
  assert.deepEqual(await saved(page), []);
  // asking again, then Enter
  await page.evaluate(ids => { localStorage.setItem('kickMultiview.palette', JSON.stringify({ recent: ids, used: {} })); }, IDS);
  await page.keyboard.press('Escape');
  await page.keyboard.press(K);
  await page.click('#palList .pal-gbtn:text-is("Clear all")');
  await page.keyboard.press('Enter');
  assert.deepEqual(await recent(page), []);
  // typing gives up asking
  await page.evaluate(ids => { localStorage.setItem('kickMultiview.palette', JSON.stringify({ recent: ids, used: {} })); }, IDS);
  await page.keyboard.press('Escape');
  await page.keyboard.press(K);
  await page.click('#palList .pal-gbtn:text-is("Clear all")');
  await page.keyboard.type('x'); await page.keyboard.press('Backspace');
  assert.match(await heading(), /Clear all\s*Manage/);
  // Manage
  await page.click('#palList .pal-gbtn:text-is("Manage")');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), false);
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=search]'), true);
});

test('Clear Recent, found by typing: asks in the empty box and isn\'t remembered itself; greyed with nothing to clear', async t => {
  const page = await openApp(t, { init: remember(IDS) });
  await page.keyboard.press(K);
  await page.fill('#palQ', 'search history');
  await page.waitForTimeout(50);
  assert.equal((await page.evaluate(() => window.palette.rows()))[0].id, 'palette.clearRecent');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true, 'the box stays open, asking');
  assert.equal(await page.inputValue('#palQ'), '');
  assert.match(await page.textContent('#palList .pal-g:has(.pal-gacts)'), /Forget all 4\?/);
  await page.keyboard.press('Enter');
  assert.deepEqual(await saved(page), [], 'cleared, and Clear Recent isn\'t in Recent');
  await page.fill('#palQ', 'clear recent');
  await page.waitForTimeout(50);
  assert.equal(await page.getAttribute('#palList .pal-row[data-id="palette.clearRecent"]', 'aria-disabled'), 'true', 'nothing to clear');
});
