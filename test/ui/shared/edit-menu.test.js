// The right-click menu in the app's own text boxes (shared/edit-menu.js): the desktop app says what's under the pointer
// (a misspelled word, its suggestions, what can be done) and does what's chosen; here a stand-in does both.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

test('a text box\'s right-click menu: a misspelled word\'s suggestions and Add to dictionary, then Undo … Select all as the box allows; Esc and a press outside close it', async t => {
  const page = await openApp(t);
  await page.evaluate(() => { window.__done = []; window.kmv = { ...(window.kmv || {}), editDo: a => window.__done.push(a) }; });
  const items = () => page.$$eval('.edit-menu > *', l => l.map(e => (e.tagName === 'HR' ? '—' : e.textContent + (e.disabled ? ' (off)' : ''))));
  await page.evaluate(() => window.openEditMenu({ x: 200, y: 150, word: 'helo', sugs: ['hello', 'help', 'halo'], can: { undo: true, redo: false, cut: true, copy: true, paste: true, selectAll: true } }));
  assert.deepEqual(await items(), ['hello', 'help', 'halo', 'Add to dictionary', '—', 'Undo', 'Redo (off)', '—', 'Cut', 'Copy', 'Paste', 'Select all']);
  await page.click('.edit-menu >> text=help');
  assert.deepEqual(await page.evaluate(() => window.__done), [{ do: 'replaceMisspelling', word: 'help' }]);
  assert.equal(await page.isVisible('.edit-menu'), false, 'chosen: it closes');
  // no suggestions; no misspelled word: only editing
  await page.evaluate(() => window.openEditMenu({ x: 10, y: 10, word: 'qzxv', sugs: [], can: {} }));
  assert.deepEqual((await items()).slice(0, 2), ['No spelling suggestions', 'Add to dictionary']);
  await page.click('.edit-menu >> text=Add to dictionary');
  assert.deepEqual((await page.evaluate(() => window.__done)).pop(), { do: 'addWord', word: 'qzxv' });
  await page.evaluate(() => window.openEditMenu({ x: 5000, y: 5000, word: '', sugs: [], can: { paste: true } }));
  assert.deepEqual(await items(), ['Undo (off)', 'Redo (off)', '—', 'Cut (off)', 'Copy (off)', 'Paste', 'Select all']);
  const box = await page.$eval('.edit-menu', e => { const r = e.getBoundingClientRect(); return [r.right <= innerWidth, r.bottom <= innerHeight]; });
  assert.deepEqual(box, [true, true], 'inside the window');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.edit-menu'), false);
  await page.evaluate(() => window.openEditMenu({ x: 10, y: 10, can: { paste: true } }));
  await page.mouse.click(800, 600);
  assert.equal(await page.isVisible('.edit-menu'), false, 'a press outside');
});
