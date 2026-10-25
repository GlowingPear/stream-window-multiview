// The search box (Ctrl/⌘+K, #184): opening and closing it, the empty box, the prefixes, its keys (arrows, Enter,
// ⇧Enter, Tab and back, Ctrl/⌘+1–9, Esc's three steps), a switch flipping where it is, nothing found, text from the
// sites staying text, narrow windows, and what it tells screen readers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, press } = require('../app');
const { openApp } = setup();

const K = 'ControlOrMeta+k';
const isOpen = page => page.evaluate(() => window.palette.isOpen());
const rows = page => page.evaluate(() => window.palette.rows());
const titles = async page => (await rows(page)).map(r => r.title);
const selected = page => page.$eval('#palList .pal-row.on', r => r.dataset.id).catch(() => null);
async function type(page, text){ await page.fill('#palQ', ''); await page.type('#palQ', text); await page.waitForTimeout(50); }

test('Ctrl/⌘+K opens it from anywhere and again closes it; the toolbar\'s button too; Esc gives the keyboard back', async t => {
  const page = await openApp(t);
  await page.keyboard.press(K);
  assert.equal(await isOpen(page), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'palQ', 'the words box has the keyboard');
  await page.keyboard.press(K);
  assert.equal(await isOpen(page), false);
  // while typing in another box, and with the keyboard shortcuts switched off
  await page.click('#savedBtn'); await page.focus('#savedInput');
  await page.evaluate(() => { document.querySelector('#keysSet').click(); });
  await page.keyboard.press(K);
  assert.equal(await isOpen(page), true, 'still opens with the shortcuts off: it\'s how you find them again');
  await page.keyboard.press('Escape');
  assert.equal(await isOpen(page), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'savedInput', 'Esc: back to where the keyboard was');
  await page.click('#palBtn');
  assert.equal(await isOpen(page), true);
  await page.mouse.click(10, 790);
  assert.equal(await isOpen(page), false, 'a click outside closes it');
  assert.match(await page.getAttribute('#palBtn', 'title'), /Search and actions \((Ctrl|⌘)\+K\)/);
});

test('the empty box: what you ran lately, the window you last clicked, and saved channels that are live', async t => {
  const page = await openApp(t, { init: () => { try { localStorage.setItem('kickMultiview.saved', JSON.stringify(['livelyone', 'quietone'])); } catch {} } });
  await page.evaluate(() => { window.smvNotes.setInfo('livelyone', { live: true, viewers: 1200, title: 'Hello', category: 'Chatting' }); window.smvNotes.setInfo('quietone', { live: false }); });
  await add(page, 'alpha');
  await page.dispatchEvent('#stage .win.chat', 'pointerdown');   // (clicked: the window you last clicked)
  await page.keyboard.press(K);
  const r = await rows(page);
  assert.ok(r.some(x => x.group === 'For this window'), JSON.stringify(r));
  assert.deepEqual(r.filter(x => x.group === 'Live now').map(x => x.title), ['livelyone']);
  assert.match(await page.textContent('#palList .pal-g'), /For this window\s*alpha · chat/, 'which window, by its group');
  // run something: it's first under Recent next time
  await type(page, 'tile'); await page.keyboard.press('Enter');
  assert.equal(await isOpen(page), false);
  await page.keyboard.press(K);
  assert.deepEqual((await rows(page)).filter(x => x.group === 'Recent').map(x => x.title), ['Tile']);
  assert.match(await page.inputValue('#palQ'), /^$/);
  assert.match(await page.getAttribute('#palQ', 'placeholder'), /Search channels, windows, actions and settings/);
});

test('prefixes: > actions, @ channels and windows, # Settings, ? help, as a chip; Backspace in the empty box takes it off', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await page.keyboard.press(K);
  for (const [p, name, kinds] of [['>', 'Actions', ['action', 'layout', 'theme', 'tab']], ['@', 'Channels', ['channel', 'window', 'profile']], ['#', 'Settings', ['setting', 'tab']], ['?', 'Help', ['help']]]){
    await type(page, p);
    assert.equal(await page.isVisible('#palBg .pal-scope'), true, p);
    assert.equal((await page.textContent('#palBg .pal-scope')).trim(), name);
    assert.equal(await page.inputValue('#palQ'), '', 'the prefix becomes the chip');
    assert.ok((await rows(page)).length > 0, `${p} on its own lists everything of its kind`);
    const ids = await page.$$eval('#palList .pal-row', rs => rs.map(r => r.dataset.id));
    assert.ok(ids.length, p);
    await page.keyboard.press('Backspace');
    assert.equal(await page.isVisible('#palBg .pal-scope'), false, 'Backspace in the empty box: everything again');
    void kinds;
  }
  await type(page, '#snap');
  assert.deepEqual(await titles(page), ['Snap windows']);
  await page.click('#palBg .pal-scope button');
  assert.equal(await page.isVisible('#palBg .pal-scope'), false, 'the chip\'s ×');
});

test('keys: ↑ ↓ and Ctrl+N / P move, Enter runs, ⇧Enter the second choice, Ctrl/⌘+1–9 a row', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await page.keyboard.press(K);
  await type(page, 'chat');
  const first = await selected(page);
  await page.keyboard.press('ArrowDown');
  const second = await selected(page);
  assert.notEqual(first, second);
  assert.equal(await page.getAttribute('#palQ', 'aria-activedescendant'), await page.$eval('#palList .pal-row.on', r => r.id));
  await page.keyboard.press('ArrowUp');
  assert.equal(await selected(page), first);
  await page.keyboard.press('Control+n'); assert.equal(await selected(page), second);
  await page.keyboard.press('Control+p'); assert.equal(await selected(page), first);
  await page.keyboard.press('ArrowUp');
  assert.equal(await selected(page), (await rows(page)).at(-1).id, 'round the top to the last');
  // Enter: a layout
  await type(page, 'chat stage'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), 'stage');
  // ⇧Enter on an option with a switch: its page, the option lit
  await page.keyboard.press(K);
  await type(page, 'snap windows'); await page.keyboard.press('Shift+Enter');
  assert.equal(await isOpen(page), false);
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=general]'), true, 'Settings › General');
  assert.ok(await page.$('#settingsDlg .st-row.gd-lit'), 'the option lit');
  await page.keyboard.press('Escape');
  // Ctrl/⌘+2: the second row
  await page.keyboard.press(K);
  await type(page, '>toolbar:');
  const second2 = (await rows(page))[1];
  await page.keyboard.press('ControlOrMeta+2');
  assert.equal(await isOpen(page), false);
  assert.equal(second2.id.startsWith('toolbar.'), true);
});

test('Tab: everything for the row, its words searched; ⇧Tab and Esc go back; Esc then clears the words, then closes', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await page.keyboard.press(K);
  await type(page, 'alpha · stream');
  await page.keyboard.press('Tab');
  assert.equal(await page.isVisible('#palBg .pal-crumb'), true);
  assert.match(await page.textContent('#palBg .pal-crumb'), /alpha · stream/);
  const all = await titles(page);
  for (const want of ['Go to it', 'Make big', 'Pause', 'Reload', 'Close']) assert.ok(all.includes(want), `${want} in ${all}`);
  await type(page, 'relo');
  assert.deepEqual(await titles(page), ['Reload']);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.isVisible('#palBg .pal-crumb'), false);
  assert.equal(await page.inputValue('#palQ'), 'alpha · stream', 'the words from before');
  await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#palBg .pal-crumb'), false, 'Esc: out of Tab\'s list first');
  await page.keyboard.press('Escape');
  assert.equal(await page.inputValue('#palQ'), '', 'then the words');
  assert.equal(await isOpen(page), true);
  await page.keyboard.press('Escape');
  assert.equal(await isOpen(page), false, 'then the box');
  // a row's Tab list runs what it says
  await page.keyboard.press(K);
  await type(page, 'alpha · chat'); await page.keyboard.press('Tab');
  await type(page, 'close'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#stage .win.chat').count(), 0, 'the chat closed');
});

test('a switch flips where it is (the box stays open); a greyed one says why; Enter on a page of Settings opens it', async t => {
  const page = await openApp(t);
  await page.keyboard.press(K);
  await type(page, 'snap windows');
  const on = await page.isChecked('#snap');
  assert.equal(await page.getAttribute('#palList .pal-row.on .pal-sw', 'aria-checked'), String(on));
  await page.keyboard.press('Enter');
  assert.equal(await isOpen(page), true, 'still open');
  assert.equal(await page.isChecked('#snap'), !on, 'the setting changed');
  assert.equal(await page.getAttribute('#palList .pal-row.on .pal-sw', 'aria-checked'), String(!on));
  // greyed: nothing open to mute
  await type(page, 'mute every stream');
  assert.equal(await page.getAttribute('#palList .pal-row.on', 'aria-disabled'), 'true');
  await page.keyboard.press('Enter');
  assert.equal(await isOpen(page), true);
  assert.match(await page.textContent('#palBg .pal-foot'), /Open a stream first/);
  await type(page, 'settings › themes'); await page.keyboard.press('Enter');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=themes]'), true);
});

test('nothing found still offers next steps: open the words as a channel, search the guide', async t => {
  const page = await openApp(t);
  await page.keyboard.press(K);
  await type(page, 'qzxv qzxv');
  assert.match(await page.textContent('#palList'), /Nothing found for “qzxv qzxv”/);
  assert.deepEqual((await titles(page)).sort(), ['Save layout as “qzxv qzxv”', 'Save theme as “qzxv qzxv”', 'Search the guide for “qzxv qzxv”']);
  await type(page, '!!!');
  assert.ok(!(await titles(page)).some(x => /^Open/.test(x)), 'not a channel, not an address: nothing to open');
  await type(page, 'example.com/page');
  assert.ok((await titles(page)).includes('Open example.com/page'), 'an address: as a web page');
  await type(page, 'zebrafinchsong');
  assert.ok((await titles(page)).includes('zebrafinchsong'), 'a name: open it as a channel');
  await type(page, 'qzxv qzxv');
  await page.click('#palList .pal-row:has-text("Search the guide")');
  await page.waitForSelector('#settingsDlg .st-pane[data-s=guide]:not([hidden])');
  assert.equal(await page.inputValue('#gdSearch'), 'qzxv qzxv');
});

test('text from the sites stays text: a notification\'s name with markup in it', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.smvNotes.liveNote('evil', { name: '<img src=x id=pwn>', title: '<b>bold</b>' }));
  await page.keyboard.press(K);
  await type(page, 'img');
  assert.equal(await page.$('#palList #pwn'), null, 'no element made from it');
  assert.equal(await page.$('#palList b:has-text("bold")'), null);
  assert.match(await page.textContent('#palList'), /<img src=x id=pwn> went live/);
});

test('narrow windows: the box is the window\'s width minus 24; under 520 the second lines and the prefixes go', async t => {
  const page = await openApp(t, { width: 700, height: 700 });
  await page.keyboard.press(K);
  await type(page, 'tile');
  const width = () => page.$eval('#palette', e => e.offsetWidth);   // (not its box while it fades in, a little smaller)
  assert.equal(await width(), 700 - 24);
  await page.setViewportSize({ width: 480, height: 700 });
  assert.equal(await width(), 480 - 24);
  assert.equal(await page.isVisible('#palList .pal-sub'), false);
  assert.equal(await page.isVisible('#palBg .pal-pre'), false);
  await page.setViewportSize({ width: 1600, height: 900 });
  assert.equal(await width(), 660);
});

test('for screen readers: a dialog, a combobox over a listbox of options, the selected one, and how many results', async t => {
  const page = await openApp(t);
  await page.keyboard.press(K);
  assert.equal(await page.getAttribute('#palette', 'role'), 'dialog');
  assert.equal(await page.getAttribute('#palette', 'aria-modal'), 'true');
  assert.equal(await page.getAttribute('#palQ', 'role'), 'combobox');
  assert.equal(await page.getAttribute('#palQ', 'aria-controls'), 'palList');
  assert.equal(await page.getAttribute('#palList', 'role'), 'listbox');
  await type(page, 'tile');
  assert.equal(await page.getAttribute('#palQ', 'aria-expanded'), 'true');
  assert.equal(await page.getAttribute('#palList .pal-row.on', 'role'), 'option');
  assert.equal(await page.getAttribute('#palList .pal-row.on', 'aria-selected'), 'true');
  assert.match(await page.textContent('#palBg [aria-live]'), /^\d+ results?$/);
  // the keyboard stays in the box
  await page.click('#palList .pal-g >> nth=0').catch(() => {});
  await page.keyboard.press('Tab');
  assert.equal(await isOpen(page), true);
  assert.ok(await page.evaluate(() => document.getElementById('palette').contains(document.activeElement)));
  await press(page, 'Escape');
});
