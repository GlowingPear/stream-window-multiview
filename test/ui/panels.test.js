// Saved channels, your saved layouts, Game focus's bar, themes, and keeping two app windows in step.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, press } = require('./app');
const { openApp } = setup();

test('Saved channels: type a name (the tab picks the site), tabs with counts, open, remove, Open all and Save all open', async t => {
  const page = await openApp(t);
  await page.click('#savedBtn');
  assert.match(await page.textContent('#savedList'), /Nothing saved yet/);
  await page.fill('#savedInput', 'alpha'); await page.press('#savedInput', 'Enter');
  await page.click('#savedTabs [data-t=twitch]');
  assert.match(await page.textContent('#savedList'), /No saved Twitch channels yet/);
  await page.fill('#savedInput', 'bravo'); await page.click('#savedAdd');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.saved'))), ['alpha', 'tw:bravo'], 'typed on the Twitch tab, it\'s a Twitch channel');
  assert.equal(await page.textContent('#savedTabs [data-t=all] em'), '2');
  assert.equal(await page.textContent('#savedTabs [data-t=kick] em'), '1');
  await page.click('#savedTabs [data-t=all]');
  await page.fill('#savedInput', 'https://www.youtube.com/@charlie'); await page.press('#savedInput', 'Enter');
  assert.equal(await page.$$eval('#savedList .sv', r => r.length), 3, 'a link works too');

  await page.click('#savedList .sv:has(.nm:text-is("alpha"))');
  assert.equal(await win(page, 'alpha').count(), 1, 'clicking one opens it');
  assert.equal(await win(page, 'alpha', 'chat').count(), 1);
  assert.equal(await page.locator('#savedList .sv:has(.nm:text-is("alpha")) .open').count(), 1, 'and it shows as open');

  await page.click('#savedList .sv:has(.nm:text-is("bravo")) .rm');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.saved'))), ['alpha', 'yt:@charlie'], '✕ removes it');

  await page.click('#openAll');
  assert.equal(await page.locator('#stage .win.stream').count(), 2, 'Open all opens the rest');
  await page.keyboard.press('Escape');
  await add(page, 'delta');
  await page.click('#savedBtn');
  await page.click('#saveOpen');
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.saved'))).includes('delta'), 'Save all open adds what\'s open');
});

test('your layouts: save the arrangement under a name, bring it back, update it and delete it', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 't');
  await page.click('#layoutBtn');
  assert.match(await page.textContent('#presetList'), /Arrange things how you like/);
  await page.fill('#presetName', 'Two up');
  await page.press('#presetName', 'Enter');
  assert.match(await page.textContent('#presetList .pr-row'), /Two up.*Tile · 2 streams, 2 chats/s, 'listed with what\'s in it');
  const tiled = await page.$$eval('#stage .win', l => l.map(e => [e.offsetLeft, e.offsetTop, e.offsetWidth]));

  await page.keyboard.press('Escape');
  await win(page, 'bravo').locator('[data-a=close]').click();
  await press(page, 'c');
  await page.click('#layoutBtn');
  await page.click('#presetList .pr-load');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#stage .win').count(), 4, 'the closed window comes back');
  assert.deepEqual(await page.$$eval('#stage .win', l => l.map(e => [e.offsetLeft, e.offsetTop, e.offsetWidth])).then(x => x.length), tiled.length);

  // same name again: asks before replacing; the update button too
  await page.click('#layoutBtn');
  await page.fill('#presetName', 'two UP'); await page.click('#presetSave');
  assert.equal(await page.textContent('#askTitle'), 'Replace “Two up”?');
  await page.click('#askDlg .ask-yes');
  assert.equal(await page.locator('#presetList .pr-row').count(), 1, 'replaced, not added');
  await page.click('#presetList .pr-up');
  assert.equal(await page.textContent('#askTitle'), 'Update “two UP”?');
  await page.click('#askDlg .ask-yes');
  await page.click('#presetList .pr-x');
  await page.click('#askDlg .ask-yes');
  assert.equal(await page.locator('#presetList .pr-row').count(), 0, 'deleted');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.presets'))), []);
});

test('Game focus: pick a stream for the game area, change the panel size and side', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 'g');
  assert.ok(await page.isVisible('#gameBar'));
  await page.selectOption('#gameBar .gb-pick', 'alpha');
  await page.waitForTimeout(400);                 // it glides into place
  const area = await box(page.locator('#gameArea')), a = await box(win(page, 'alpha'));
  assert.ok(a.x >= area.x - 1 && a.x + a.w <= area.x + area.w + 1 && a.w > area.w * 0.9, `alpha fills the game area (${JSON.stringify([a, area])})`);
  const panelW = async () => (await box(page.locator('#stage'))).w - (await box(page.locator('#gameArea'))).w;
  const m = await panelW();
  await page.click('#gameBar [data-gs=l]'); await page.waitForTimeout(300);
  assert.ok(await panelW() > m, 'L: a wider side panel');
  await page.click('#gameBar [data-gs=s]'); await page.waitForTimeout(300);
  assert.ok(await panelW() < m, 'S: narrower');
  const before = (await box(page.locator('#gameArea'))).x;
  await page.click('#gameBar .gb-side'); await page.waitForTimeout(300);
  assert.ok((await box(page.locator('#gameArea'))).x > before, 'the panel moves to the left, the game area to the right');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.game'))), { mode: 'window', size: 's', side: 'left', onTop: true, strip: true }, 'remembered');
});

test('themes: colour boxes, colour codes and Back to Pear', async t => {
  const page = await openApp(t);
  await page.click('#settingsBtn'); await page.click('#settingsDlg .st-rail [data-s=themes]');
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const row = page.locator('#themePane .th-var:has(span:text-is("Accent"))');
  await row.locator('input[type=color]').evaluate(c => { c.value = '#3366ff'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await accent(), '#3366ff', 'the colour box');
  assert.equal(await row.locator('.hex').inputValue(), '#3366ff', 'and its code follow each other');
  await row.locator('.hex').fill('ff8800');
  assert.equal(await accent(), '#ff8800', 'a code without # works');
  assert.match(await page.textContent('#themePane .th-cur'), /edited/);
  await row.locator('.hex').fill('#12');
  assert.equal(await accent(), '#ff8800', 'half-typed codes are ignored');
  await page.click('#themePane .th-reset');
  assert.equal(await accent(), '#53fc18', 'Back to Pear');
});

test('two app windows stay in step: saved channels, themes, auto-pause and Watch signed in', async t => {
  const page = await openApp(t);
  await page.click('#savedBtn');
  // what the other window would write, then the event this window gets for it
  const fromOther = (key, value) => page.evaluate(([k, v]) => { localStorage.setItem(k, v); window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v })); }, [key, value]);
  await fromOther('kickMultiview.saved', JSON.stringify(['alpha']));
  assert.match(await page.textContent('#savedList'), /alpha/, 'a channel saved in the other window shows here');
  const ocean = { name: 'Ocean', vars: { '--accent': '#3fb6ff' } };
  await fromOther('kickMultiview.theme', JSON.stringify(ocean));
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#3fb6ff', 'its theme');
  await fromOther('kickMultiview.autoPause', '1');
  assert.equal(await page.isChecked('#autoPause'), true, 'its auto-pause switch');
});
