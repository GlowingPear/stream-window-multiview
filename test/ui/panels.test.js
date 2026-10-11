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
  assert.equal(await page.isHidden('#savedAdd'), true, 'Save only shows while typing');

  await page.fill('#savedInput', 'char');
  assert.equal(await page.isVisible('#savedAdd'), true);
  assert.deepEqual(await page.$$eval('#savedList .sv .nm', r => r.map(n => n.textContent)), ['@charlie'], 'typing searches the list');
  await page.fill('#savedInput', 'zulu');
  assert.match(await page.textContent('#savedList'), /No saved channel matches “zulu”/);
  await page.press('#savedInput', 'Escape');
  assert.equal(await page.inputValue('#savedInput'), '', 'Esc clears the search first');
  assert.equal(await page.$$eval('#savedList .sv', r => r.length), 3);
  assert.equal(await page.isVisible('#savedPanel'), true, '…and keeps the panel open');

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
  assert.equal(await page.textContent('#openAll'), 'Open all 2');
  const fits = await page.evaluate(() => { const p = document.querySelector('#savedPanel').getBoundingClientRect();
    return [...document.querySelectorAll('.sp-foot > .btn')].filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.left >= p.left && r.right <= p.right; }); });
  assert.ok(fits, 'the buttons at the bottom fit in the panel');
  await page.click('#spMore');
  assert.match(await page.textContent('#saveOpen'), /1 not saved/);
  await page.click('#saveOpen');
  assert.equal(await page.isHidden('#spMenu'), true, 'the menu closes after picking');
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

  // same name again: asks before replacing
  await page.click('#layoutBtn');
  await page.fill('#presetName', 'two UP'); await page.click('#presetSave');
  assert.equal(await page.textContent('#askTitle'), 'Replace “Two up”?');
  await page.click('#askDlg .ask-yes');
  assert.equal(await page.locator('#presetList .pr-row').count(), 1, 'replaced, not added');
  assert.equal(await page.locator('#presetList .pr-row button').count(), 1, 'the menu only loads them');

  // Settings > Layouts (the menu's gear) manages them: save, rename, update, use and delete
  await page.click('#layoutSet');
  assert.equal(await page.isVisible('#layoutMenu'), false, 'the menu closes');
  assert.equal(await page.$eval('#settingsDlg .st-rail .on', e => e.dataset.s), 'layouts');
  await page.click('#lyTabs [data-t=saved]');
  assert.ok(await page.isVisible('#lyPresets .pr-srow .lm-pic'), 'with the picture of its layout');
  assert.match(await page.textContent('#lyPresets'), /two UP.*Tile · 2 streams, 2 chats/s);
  await page.fill('#lyPresetName', 'Solo'); await page.press('#lyPresetName', 'Enter');
  assert.deepEqual(await page.$$eval('#lyPresets .pr-srow .st-t > span', l => l.map(e => e.textContent)), ['two UP', 'Solo']);
  const row = n => page.locator(`#lyPresets .pr-srow:nth-child(${n})`);
  await row(2).locator('.pr-ren').click();
  await page.fill('#lyPresets input', 'TWO up'); await page.press('#lyPresets input', 'Enter');
  assert.match(await page.textContent('#msg'), /already a layout called “TWO up”/);
  assert.equal(await row(2).locator('.st-t > span').textContent(), 'Solo', 'not renamed to a name in use');
  await row(2).locator('.pr-ren').click();
  await page.fill('#lyPresets input', 'nope'); await page.press('#lyPresets input', 'Escape');
  assert.equal(await row(2).locator('.st-t > span').textContent(), 'Solo', 'Esc keeps the old name');
  assert.equal(await page.isVisible('#settingsDlg'), true, 'and leaves Settings open');
  await row(2).locator('.pr-ren').click();
  await page.fill('#lyPresets input', 'Pair'); await page.locator('#lyPresetName').click();
  assert.equal(await row(2).locator('.st-t > span').textContent(), 'Pair', 'clicking away keeps the new name');
  assert.match(await page.textContent('#presetList'), /two UP.*Pair/s, 'the menu has it too');
  await row(1).locator('.pr-up').click();
  assert.equal(await page.textContent('#askTitle'), 'Update “two UP”?');
  await page.click('#askDlg .ask-yes');
  await row(2).locator('.pr-use').click();
  assert.equal(await page.isVisible('#settingsDlg'), false, 'Use closes Settings');
  await page.evaluate(() => openSettings('layouts'));
  assert.ok(await row(2).evaluate(e => e.classList.contains('on')), 'the one in use is marked');
  for (const n of [2, 1]){ await row(n).locator('.pr-x').click(); await page.click('#askDlg .ask-yes'); }
  assert.match(await page.textContent('#lyPresets'), /None yet/);
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.presets'))), []);
});

test('Settings > Layouts: each layout with its options, Use, Linked, the switch control and fitting in auto-opened channels', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 'a');
  await page.evaluate(() => openSettings('layouts'));
  assert.deepEqual(await page.$$eval('#lyList .ly-item', l => l.map(e => e.dataset.l)), ['focus', 'game', 'columns', 'chatfocus', 'auto', 'tile'], 'the layouts on the left');
  const shown = () => page.$eval('#lyDetail .ly-panel:not([hidden])', e => e.dataset.l);
  assert.equal(await page.$eval('#lyList .sel', e => e.dataset.l), 'auto', 'the one in use is picked');
  assert.equal(await shown(), 'auto', 'and shown on the right');
  assert.equal(await page.textContent('#lyList [data-l=auto] em'), 'In use');
  assert.equal(await page.textContent('#lyDetail [data-l=auto] .ly-use'), 'In use');
  assert.ok(await page.isDisabled('#lyDetail [data-l=auto] .ly-use'));
  assert.equal(await page.isChecked('#autoFit'), false, 'fitting in auto-opened channels is off at first');
  await page.check('#autoFit');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.autoFit')), '1');
  await page.hover('#lyList [data-l=tile]');
  assert.equal(await shown(), 'auto', 'pointing at another doesn\'t change it');
  await page.click('#lyList [data-l=columns]');
  assert.equal(await shown(), 'columns', 'clicking does');
  assert.equal(await page.isVisible('#autoFit'), false, 'with only its own options');
  await page.keyboard.press('ArrowDown');
  assert.equal(await shown(), 'chatfocus', 'so do the arrow keys');
  assert.match(await page.textContent('#lyDetail [data-l=chatfocus]'), /No options/);
  await page.keyboard.press('ArrowUp');
  await page.uncheck('#lyLinked');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.linked')), '0');
  await page.click('#lyTabs [data-t=switch]');
  assert.equal(await page.isVisible('#lyList'), false, 'one sub-tab at a time');
  await page.click('#lySw [data-sw=float]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.switchMode')), 'float');
  assert.equal(await page.$eval('#lySw .on', e => e.dataset.sw), 'float');
  assert.equal(await page.locator('#lySw [data-sw=window]').count(), 0, 'no own window in a browser');

  await page.click('#lyTabs [data-t=layouts]');
  await page.click('#lyDetail [data-l=columns] .ly-use');
  assert.equal(await page.isVisible('#settingsDlg'), false, 'Use closes Settings');
  assert.ok(await page.evaluate(() => document.body.classList.contains('cols')), 'and switches');
  await page.click('#layoutBtn');
  assert.equal(await page.isChecked('#lmLinked'), false, 'the menu\'s switch follows');
  assert.equal(await page.isChecked('#lmAutoFit'), true);
  await page.check('#lmLinked');
  assert.ok(await page.isVisible('#layoutMenu'), 'the menu stays open for its options');
  await page.click('#layoutBtn');
  await page.evaluate(() => openSettings('layouts'));
  assert.equal(await page.isChecked('#lyLinked'), true, 'and Settings follows the menu');
  assert.equal(await shown(), 'columns', 'reopening shows the one in use');
  assert.equal(await page.textContent('#lyDetail [data-l=columns] .ly-use'), 'In use');
  await page.keyboard.press('Escape');
  await page.click('#swBtn');
  assert.equal(await page.$eval('#lySw .on', e => e.dataset.sw), 'dock', 'the switch control button changes it too');
});

test('Layout menu: pictures with a hint line, and the current layout\'s options (Chat focus stream columns)', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 'Shift+C');
  await page.click('#layoutBtn');
  assert.equal(await page.textContent('#lmHint'), 'Streams down the side at exact video size, chats get the rest.', 'describes the current layout');
  await page.hover('#layoutMenu [data-l=tile]');
  assert.equal(await page.textContent('#lmHint'), 'Every window gets equal space.', 'and the one you point at');
  await page.hover('#layoutMenu .lm-head');
  assert.match(await page.textContent('#lmHint'), /^Streams down the side/, 'back when you move away');
  assert.deepEqual(await page.$$eval('#lmOpts .lm-opt', l => l.filter(o => !o.hidden).map(o => o.dataset.for)), ['chatfocus']);
  assert.ok(await page.isDisabled('#lmCols [data-n="3"]'), 'no more columns than streams');
  const x0 = (await box(win(page, 'bravo'))).x;
  await page.click('#lmCols [data-n="2"]');
  await page.waitForTimeout(350);
  assert.ok(await page.locator('#lmCols [data-n="2"]').evaluate(e => e.classList.contains('on')));
  assert.notEqual((await box(win(page, 'bravo'))).x, x0, 'the streams went side by side');
  await page.click('#layoutMenu [data-l=tile]');
  assert.equal(await page.isVisible('#layoutMenu'), false, 'picking a layout closes the menu');
  await page.click('#layoutBtn');
  assert.equal(await page.isVisible('#lmOpts'), false, 'Tile has no options');
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
