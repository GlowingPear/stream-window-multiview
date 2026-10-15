// Saved channels, your saved layouts, Game focus's bar, themes, and keeping two app windows in step.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, press } = require('./app');
const { openApp } = setup();

test('Channels: one box searches your channels and opens (or opens and saves) a new one; tabs with counts, remove, Open all and Save all open', async t => {
  const page = await openApp(t);
  const savedList = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.saved')) || '[]');
  await page.click('#savedBtn');
  assert.equal(await page.getAttribute('#savedBtn', 'aria-expanded'), 'true', 'the toolbar marks Channels as open');
  assert.match(await page.textContent('#savedPanel .sp-title b'), /^Channels$/);
  assert.match(await page.textContent('#savedList'), /Nothing saved yet/);
  assert.equal(await page.isVisible('#spAddRow'), false, 'nothing to add before typing');
  assert.ok(await page.isVisible('#savedPanel #mode'), 'Stream + chat / Stream only / Chat only is in the box');

  // a name: "Add alpha from" Kick (on All), then Open & save
  await page.fill('#savedInput', 'alpha');
  assert.equal(await page.textContent('#spAddName'), 'alpha');
  assert.equal(await page.getAttribute('#spPlat [data-p=kick]', 'aria-checked'), 'true', 'Kick is picked on the All tab');
  await page.click('#spOpenSave');
  assert.deepEqual(await savedList(), ['alpha'], 'Open & save saves it');
  assert.equal(await win(page, 'alpha').count(), 1, '…and opens it');
  assert.equal(await win(page, 'alpha', 'chat').count(), 1, 'with its chat');
  assert.equal(await page.inputValue('#savedInput'), '', 'the box is cleared');
  assert.equal(await page.isVisible('#spAddRow'), false);

  // on the Twitch tab a name is a Twitch channel; another site can be picked
  await page.click('#savedTabs [data-t=twitch]');
  assert.match(await page.textContent('#savedList'), /No saved Twitch channels yet/);
  await page.fill('#savedInput', 'bravo');
  assert.equal(await page.getAttribute('#spPlat [data-p=twitch]', 'aria-checked'), 'true', 'the tab picks the site');
  await page.click('#spPlat [data-p=youtube]');
  assert.equal(await page.getAttribute('#spPlat [data-p=youtube]', 'aria-checked'), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getAttribute('#spPlat [data-p=twitch]', 'aria-checked'), 'true', 'the arrow keys move along the sites');
  await page.click('#spOpenSave');
  assert.deepEqual(await savedList(), ['alpha', 'tw:bravo'], 'picked Twitch, it\'s a Twitch channel');
  assert.equal(await page.textContent('#savedTabs [data-t=all] em'), '2');
  assert.equal(await page.textContent('#savedTabs [data-t=kick] em'), '1');

  // a link picks its own site; Enter opens it without saving
  await page.click('#savedTabs [data-t=all]');
  await page.fill('#savedInput', 'https://www.youtube.com/@charlie');
  assert.equal(await page.getAttribute('#spPlat [data-p=youtube]', 'aria-checked'), 'true', 'a link picks its site');
  assert.ok(await page.isDisabled('#spPlat [data-p=kick]'), 'and the others are off');
  await page.press('#savedInput', 'Enter');
  assert.equal(await page.locator('#stage .win.stream').count(), 3, 'Enter opens it');
  assert.equal((await savedList()).length, 2, '…without saving it');
  await page.fill('#savedInput', 'https://www.youtube.com/@charlie'); await page.click('#spOpenSave');
  assert.deepEqual(await savedList(), ['alpha', 'tw:bravo', 'yt:@charlie']);
  assert.equal(await page.locator('#stage .win.stream').count(), 3, 'an open channel is not opened twice');

  // typing searches the list too
  await page.fill('#savedInput', 'char');
  assert.deepEqual(await page.$$eval('#savedList .sv .nm', r => r.map(n => n.textContent)), ['@charlie'], 'typing searches the list');
  assert.ok(await page.isVisible('#spAddRow'), 'and offers to open the name');
  await page.fill('#savedInput', 'alpha');
  assert.equal(await page.isVisible('#spOpenSave'), false, 'no Open & save for a channel already saved');
  await page.fill('#savedInput', 'zulu');
  assert.match(await page.textContent('#savedList'), /No saved channel matches “zulu”/);
  await page.press('#savedInput', 'Escape');
  assert.equal(await page.inputValue('#savedInput'), '', 'Esc clears the search first');
  assert.equal(await page.$$eval('#savedList .sv', r => r.length), 3);
  assert.equal(await page.isVisible('#savedPanel'), true, '…and keeps the panel open');

  await page.click('#savedList .sv:has(.nm:text-is("bravo")) .rm');
  assert.deepEqual(await savedList(), ['alpha', 'yt:@charlie'], '✕ removes it');

  await page.click('#savedBtn');
  await win(page, 'alpha').locator('[data-a=close]').click();
  await page.click('#savedBtn');
  await page.click('#savedList .sv:has(.nm:text-is("alpha"))');
  assert.equal(await win(page, 'alpha').count(), 1, 'clicking one opens it');
  assert.equal(await page.locator('#savedList .sv:has(.nm:text-is("alpha")) .open').count(), 1, 'and it shows as open');
  await win(page, 'alpha').locator('[data-a=close]').click();
  await page.click('#savedBtn');
  await page.click('#openAll');
  assert.equal(await win(page, 'alpha').count(), 1, 'Open all opens the rest');
  await page.keyboard.press('Escape');
  await add(page, 'delta');
  await page.click('#savedBtn');
  assert.equal(await page.textContent('#openAll'), 'Open all 2');
  const fits = await page.evaluate(() => { const p = document.querySelector('#savedPanel').getBoundingClientRect();
    return [...document.querySelectorAll('.sp-foot > .btn, .sp-add select')].filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.left >= p.left && r.right <= p.right; }); });
  assert.ok(fits, 'the buttons fit in the panel');
  await page.click('#spMore');
  assert.match(await page.textContent('#saveOpen'), /2 not saved/);
  await page.click('#saveOpen');
  assert.equal(await page.isHidden('#spMenu'), true, 'the menu closes after picking');
  assert.ok((await savedList()).includes('delta'), 'Save all open adds what\'s open');
});

test('Channels: with a long list, only the list gets shorter (it scrolls); the search box keeps its height (#92)', async t => {
  const names = Array.from({ length: 60 }, (_, i) => 'chan' + i);
  const page = await openApp(t, { init: `localStorage.setItem('kickMultiview.saved', '${JSON.stringify(names)}')` });
  await page.click('#savedBtn');
  const sizes = () => page.evaluate(() => {
    const h = s => document.querySelector(s).getBoundingClientRect().height;
    const l = document.querySelector('#savedList');
    return { box: h('.sp-add'), tabs: h('#savedTabs'), foot: h('.sp-foot'), scrolls: l.scrollHeight > l.clientHeight };
  });
  const long = await sizes();
  assert.ok(long.scrolls, 'the list is long enough to scroll');
  assert.equal(long.box, 46, 'the search box is its full height');
  await page.fill('#savedInput', 'chan1');   // a short list: nothing needs to give way
  const short = await sizes();
  assert.equal(short.scrolls, false);
  assert.deepEqual([long.box, long.tabs, long.foot], [short.box, short.tabs, short.foot], 'the box, the filters and the buttons are the same size either way');
});

test('Channels: the open/save row fits on one line, and a channel the site says doesn\'t exist is not opened', async t => {
  const page = await openApp(t, { init: () => {
    window.asked = [];
    window.kmv = { channelExists: ch => { window.asked.push(ch); return new Promise(r => setTimeout(() => r(ch === 'ghost' ? 'missing' : ch === 'tw:slow' ? 'unknown' : 'yes'), 800)); } };
  } });
  await page.click('#savedBtn');
  await page.fill('#savedInput', 'ghost');
  const row = await page.$$eval('#spAddRow > *:not([hidden])', els => new Set(els.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))).size);
  assert.equal(row, 1, 'Add “ghost” from, the sites, Open and Open & save sit on one line');
  await page.click('#spOpen');
  assert.ok(await page.$eval('#spOpen', b => b.classList.contains('busy')), 'Open shows it\'s checking');
  await page.waitForSelector('#spErr:not([hidden])');
  assert.match(await page.textContent('#spErr'), /no Kick channel called “ghost”/);
  assert.ok(await page.$eval('#spPlat [data-p=kick]', b => b.classList.contains('bad')), 'the site is outlined in red');
  assert.equal(await page.locator('#stage .win').count(), 0, 'nothing opens');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.saved')), null, 'or gets saved');
  await page.click('#spPlat [data-p=twitch]');
  assert.equal(await page.isVisible('#spErr'), false, 'picking another site clears it');
  assert.equal(await page.$eval('#spPlat [data-p=kick]', b => b.classList.contains('bad')), false);
  // a site that couldn't be asked doesn't block it
  await page.fill('#savedInput', 'slow');
  await page.press('#savedInput', 'Enter');
  await page.waitForSelector('#stage .win.stream');
  assert.deepEqual(await page.evaluate(() => window.asked), ['ghost', 'tw:slow']);
  // a YouTube video link isn't asked about (the panel stays open for the next one)
  await page.fill('#savedInput', 'https://youtu.be/abcdefghijk');
  await page.press('#savedInput', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 2);
  assert.equal((await page.evaluate(() => window.asked)).length, 2);
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

  // Settings > Layouts (the menu's gear) lists them under the built-in ones: save, rename, update, use and delete
  await page.click('#layoutSet');
  assert.equal(await page.isVisible('#layoutMenu'), false, 'the menu closes');
  assert.equal(await page.$eval('#settingsDlg .st-rail .on', e => e.dataset.s), 'layouts');
  const shown = () => page.$eval('#lyDetail .ly-panel:not([hidden])', e => e.dataset.k);
  const panel = n => page.locator(`#lyDetail [data-k="p:${n}"]`), item = n => page.locator(`#lyPresetList [data-k="p:${n}"]`);
  assert.equal(await shown(), 'p:two UP', 'the saved layout in use is picked');
  assert.deepEqual(await page.$$eval('#lyPresetList .ly-item', l => l.map(e => e.dataset.k)), ['p:two UP'], 'listed under the built-in ones');
  assert.ok(await item('two UP').locator('.lm-pic').count(), 'with the picture of the layout it was made from');
  assert.match(await panel('two UP').textContent(), /Tile · 2 streams, 2 chats · Made from Tile.*No options/s);
  await page.click('#lyPresetList .ly-add');
  assert.equal(await shown(), '+new', '+ Save on the heading');
  assert.ok(await page.evaluate(() => document.activeElement.id === 'lyPresetName'), 'ready to type the name');
  await page.fill('#lyPresetName', 'Solo'); await page.press('#lyPresetName', 'Enter');
  assert.equal(await shown(), 'p:Solo', 'a new one is picked once saved');
  const rename = async (to, how) => { await panel(await shown().then(k => k.slice(2))).locator('.pr-ren').click(); await page.fill('#lyDetail input[aria-label="New name"]', to); await how(); };
  await rename('TWO up', () => page.press('#lyDetail input[aria-label="New name"]', 'Enter'));
  assert.match(await page.textContent('#msg'), /already a layout called “TWO up”/);
  assert.equal(await shown(), 'p:Solo', 'not renamed to a name in use');
  await rename('nope', () => page.press('#lyDetail input[aria-label="New name"]', 'Escape'));
  assert.equal(await shown(), 'p:Solo', 'Esc keeps the old name');
  assert.equal(await page.isVisible('#settingsDlg'), true, 'and leaves Settings open');
  await rename('Pair', () => page.locator('#lyDetail [data-k="p:Solo"] .ly-desc').click());
  assert.equal(await shown(), 'p:Pair', 'clicking away keeps the new name');
  assert.match(await page.textContent('#presetList'), /two UP.*Pair/s, 'the menu has it too');
  await item('two UP').click();
  await panel('two UP').locator('.pr-up').click();
  assert.equal(await page.textContent('#askTitle'), 'Update “two UP”?');
  await page.click('#askDlg .ask-yes');
  await item('Pair').click();
  await panel('Pair').locator('.ly-use').click();
  assert.equal(await page.isVisible('#settingsDlg'), false, 'Use closes Settings');
  await page.evaluate(() => openSettings('layouts'));
  assert.equal(await shown(), 'p:Pair', 'the one in use is picked');
  assert.equal(await item('Pair').locator('em').textContent(), 'In use');
  for (const n of ['Pair', 'two UP']){ await item(n).click(); await panel(n).locator('.pr-x').click(); await page.click('#askDlg .ask-yes'); }
  assert.equal(await page.locator('#lyPresetList .ly-item').count(), 0);
  assert.match(await page.textContent('#lyPresetList'), /save them here/);
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.presets'))), []);
});

test('your layouts keep their own options (Linked, stream columns, fitting in), apart from the built-in layouts\' ones', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  const presets = () => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.presets')));
  const save = async n => { await page.click('#layoutBtn'); await page.fill('#presetName', n); await page.click('#presetSave'); };
  const linkedNow = () => page.evaluate(() => document.body.classList.contains('linked'));

  // made from Columns: its own Linked
  await press(page, 'c');
  await save('Cols');
  await page.uncheck('#lmLinked');
  assert.equal((await presets())[0].linked, false, 'the menu changes the saved layout in use');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.linked')), null, 'not the built-in Columns');
  assert.equal(await linkedNow(), false);
  await page.click('#layoutMenu [data-l=columns]');
  assert.equal(await linkedNow(), true, 'picking Columns brings its own back');
  await page.evaluate(() => openSettings('layouts'));
  await page.click('#lyPresetList [data-k="p:Cols"]');
  const colsSw = page.locator('#lyDetail [data-k="p:Cols"] [data-opt=linked]');
  assert.equal(await colsSw.isChecked(), false);
  await colsSw.check();
  assert.equal((await presets())[0].linked, true, 'and Settings changes it');
  await page.keyboard.press('Escape');

  // made from Chat focus: its stream columns, used straight away while it's in use
  await press(page, 'Shift+C');
  await save('Chats');
  await page.click('#layoutBtn');
  await page.evaluate(() => openSettings('layouts'));
  await page.click('#lyDetail [data-k="p:Chats"] .pr-cols [data-n="2"]');
  assert.equal((await presets())[1].streamCols, 2);
  await page.keyboard.press('Escape');
  await page.click('#layoutBtn');
  assert.ok(await page.locator('#lmCols [data-n="2"]').evaluate(e => e.classList.contains('on')), 'in use, so the streams went into 2 columns');
  await page.click('#layoutBtn');

  // made from Auto layout: its own fitting in
  await press(page, 'a');
  await save('Grid');
  assert.equal(await page.isChecked('#lmAutoFit'), false);
  await page.check('#lmAutoFit');
  assert.equal((await presets())[2].autoFit, true);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.autoFit')), null, 'not the built-in Auto layout');
  await page.click('#layoutMenu [data-l=auto]');
  await page.click('#layoutBtn');
  assert.equal(await page.isChecked('#lmAutoFit'), false, 'Auto layout has its own');
});

test('Settings > Layouts: each layout with its options, Use, Linked, the switch control and fitting in auto-opened channels', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 'a');
  await page.evaluate(() => openSettings('layouts'));
  assert.deepEqual(await page.$$eval('#lyList > .ly-item', l => l.map(e => e.dataset.l)), ['focus', 'game', 'columns', 'chatfocus', 'auto', 'tile'], 'the layouts on the left');
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

test('Channels: suggestions from the channels you follow while typing, the live ones with an empty box, open, save and switch off', async t => {
  const page = await openApp(t, { init: () => {
    const items = [{ ch: 'nightjar', name: 'Nightjar', site: 'kick' }, { ch: 'nightowl', name: 'nightowl', site: 'kick' },
      { ch: 'tw:nightfall_tv', name: 'Nightfall_TV', site: 'twitch' }, { ch: 'tw:pinata', name: 'Pinata', site: 'twitch' },
      { ch: 'yt:@nightskylofi', name: 'Night Sky Lofi', site: 'youtube' }];
    window.followsState = { on: true, items, live: { 'tw:nightfall_tv': { live: true, viewers: 1240, category: 'Art', title: 'cozy' }, 'tw:pinata': { live: true, viewers: 9 } } };
    window.kmv = {
      followsGet: () => Promise.resolve(window.followsState.on ? window.followsState : { on: false, items: [], live: {} }),
      followsSetOn: on => { window.followsState.on = on; return Promise.resolve(on); },
      onFollowsChanged: cb => { window.followsChanged = cb; }
    };
    try { localStorage.setItem('kickMultiview.saved', JSON.stringify(['nightowl'])); } catch {}   // (not on the blank page before the app's)
  } });
  const sugs = () => page.$$eval('#savedList .fsug', r => r.map(x => x.dataset.ch));
  const sec = () => page.$$eval('#savedList .fs-sec', r => r.map(x => x.textContent));
  await page.click('#savedBtn');
  // an empty box: the live ones you follow, most viewers first
  await page.waitForSelector('#savedList .fsug');
  assert.deepEqual(await sec(), ['Live now from your follows']);
  assert.deepEqual(await sugs(), ['tw:nightfall_tv', 'tw:pinata']);
  assert.match(await page.textContent('#savedList .fsug[data-ch="tw:nightfall_tv"]'), /Nightfall_TV.*Art · cozy.*1\.2K/s, 'name, game and title, viewers');
  assert.equal(await page.locator('#savedList .fsug[data-ch="tw:nightfall_tv"] .pi').count(), 1, 'with its site badge');

  // typing: matches you haven't saved, under the saved ones; live first
  await page.fill('#savedInput', 'night');
  assert.deepEqual(await sec(), ['From your follows']);
  assert.deepEqual(await sugs(), ['tw:nightfall_tv', 'nightjar', 'yt:@nightskylofi'], 'nightowl is saved, so it isn\'t suggested');
  assert.ok(await page.$eval('#savedList', l => l.querySelector('.sv:not(.fsug)').compareDocumentPosition(l.querySelector('.fsug')) & Node.DOCUMENT_POSITION_FOLLOWING), 'saved matches first');
  await page.click('#savedTabs [data-t=kick]');
  assert.deepEqual(await sugs(), ['nightjar'], 'the tab\'s site only');
  await page.click('#savedTabs [data-t=all]');
  await page.fill('#savedInput', 'https://kick.com/night');
  assert.deepEqual(await sugs(), [], 'nothing for a link');

  // click opens it (as set in the dropdown); Enter on a row too; ☆ saves it
  await page.fill('#savedInput', 'night');
  await page.click('#savedList .fsug[data-ch=nightjar]');
  assert.equal(await page.locator('#stage .win.stream:has(.title:text-is("nightjar"))').count(), 1, 'opened');
  await page.focus('#savedList .fsug[data-ch="yt:@nightskylofi"]');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#stage .win.stream').count(), 2, 'Enter on a row opens it');
  await page.hover('#savedList .fsug[data-ch="tw:nightfall_tv"]');
  await page.click('#savedList .fsug[data-ch="tw:nightfall_tv"] .fsave');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.saved'))), ['nightowl', 'tw:nightfall_tv'], '☆ saves it');
  assert.ok(!(await sugs()).includes('tw:nightfall_tv'), 'and it\'s no longer a suggestion');

  // the switch in ⋯: off forgets them
  await page.click('#spMore');
  assert.match(await page.textContent('#followsOn'), /Suggest channels you follow.*On/);
  await page.click('#followsOn');
  await page.waitForFunction(() => !document.querySelector('#savedList .fsug'));
  await page.click('#spMore');
  assert.match(await page.textContent('#followsOn'), /Off/);
  assert.equal(await page.getAttribute('#followsOn', 'aria-checked'), 'false');
  await page.click('#followsOn');
  await page.waitForSelector('#savedList .fsug');
  // a list that changes while the panel is open shows straight away
  await page.evaluate(() => { window.followsState.items = []; window.followsChanged(); });
  await page.waitForFunction(() => !document.querySelector('#savedList .fsug'));
});

test('Channels: with nothing saved, suggestions still show', async t => {
  const page = await openApp(t, { init: () => {
    window.kmv = { followsGet: () => Promise.resolve({ on: true, items: [{ ch: 'alpha', name: 'Alpha', site: 'kick' }], live: { alpha: { live: true, viewers: 3 } } }) };
  } });
  await page.click('#savedBtn');
  await page.waitForSelector('#savedList .fsug[data-ch=alpha]');
  assert.match(await page.textContent('#savedList'), /Nothing saved yet.*Live now from your follows.*Alpha/s);
  assert.equal(await page.isHidden('#followsOn'), true, 'no switch without the desktop app\'s');
  await page.fill('#savedInput', 'zzz');
  assert.match(await page.textContent('#savedList'), /Nothing saved yet/);
  assert.equal(await page.locator('#savedList .fsug').count(), 0);
});
