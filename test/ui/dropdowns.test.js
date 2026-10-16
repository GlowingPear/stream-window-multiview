// In-app dropdowns (src/dropdown.js): every <select> opens the app's own list instead of the system menu,
// with the mouse and the keyboard, and the <select> keeps its value and 'change' event.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, mode, win } = require('./app');

const { openApp } = setup();
const list = '.dd-list';
// each row's words (a window's channel list also has the channel's picture in front)
const items = page => page.$$eval(`${list} button`, l => l.map(b => (b.classList.contains('on') ? '*' : '') + (b.classList.contains('hl') ? '>' : '')
  + (b.querySelector('.dd-t') || b).textContent));

test('a click opens the list instead of the system menu; picking sets the value and tells the page', async t => {
  const page = await openApp(t);
  await page.click('#savedBtn');                    // Stream + chat / Stream only / Chat only, in the Channels panel
  await page.evaluate(() => { window.__changes = 0; document.getElementById('mode').addEventListener('change', () => window.__changes++); });
  const prevented = await page.evaluate(() => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    document.getElementById('mode').dispatchEvent(e);
    return e.defaultPrevented;
  });
  assert.equal(prevented, true, 'the system menu is stopped');
  await page.keyboard.press('Escape');
  assert.equal(await page.$(list), null);

  await page.click('#mode');
  assert.deepEqual(await items(page), ['*>Stream + chat', 'Stream only', 'Chat only']);
  const [sel, box] = await Promise.all([page.locator('#mode').boundingBox(), page.locator(list).boundingBox()]);
  assert.ok(box.y >= sel.y + sel.height && box.width >= sel.width - 1, 'under the dropdown, at least as wide');
  assert.equal(await page.getAttribute('#mode', 'aria-expanded'), 'true');
  await page.hover(`${list} button:text-is("Stream only")`);
  assert.deepEqual(await items(page), ['*Stream + chat', '>Stream only', 'Chat only'], 'the highlight follows the mouse');
  await page.click(`${list} button:text-is("Chat only")`);
  assert.equal(await page.$(list), null, 'it closes');
  assert.equal(await page.inputValue('#mode'), 'chat');
  assert.equal(await page.evaluate(() => window.__changes), 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mode', 'the keyboard stays on the dropdown');

  // picking the one that's already chosen changes nothing; a second click on the dropdown closes it
  await page.click('#mode');
  await page.click(`${list} button:text-is("Chat only")`);
  assert.equal(await page.evaluate(() => window.__changes), 1);
  await page.click('#mode');
  await page.click('#mode');
  assert.equal(await page.$(list), null);

  // the stream it adds follows the choice
  await add(page, 'alpha');
  await page.waitForSelector('#stage .win.chat');
  assert.equal(await page.locator('#stage .win.stream').count(), 0);
});

test('the keyboard: open with arrows, Space or Enter; move, pick, Escape and Tab', async t => {
  const page = await openApp(t);
  await page.click('#savedBtn');
  await page.focus('#mode');
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await items(page), ['*>Stream + chat', 'Stream only', 'Chat only']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');           // stops at the end
  assert.deepEqual(await items(page), ['*Stream + chat', 'Stream only', '>Chat only']);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowUp');             // and at the start
  assert.deepEqual(await items(page), ['*>Stream + chat', 'Stream only', 'Chat only']);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#mode'), 'chat');
  assert.equal(await page.$(list), null);

  await page.keyboard.press(' ');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');               // closes without picking
  assert.equal(await page.$(list), null);
  assert.equal(await page.inputValue('#mode'), 'chat');

  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press(' ');                    // Space picks too
  assert.equal(await page.inputValue('#mode'), 'stream');

  await page.keyboard.press('F4');
  await page.keyboard.press('Tab');                  // moves on and closes
  assert.equal(await page.$(list), null);
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'mode');

  // shortcuts with Ctrl/Cmd are left alone
  await page.focus('#mode');
  await page.keyboard.press('Control+ArrowDown');
  assert.equal(await page.$(list), null);
});

test('a window\'s channel dropdown swaps it with another window', async t => {
  const page = await openApp(t);
  await mode(page, 'stream');
  await add(page, 'alpha', 'bravo');
  const pick = win(page, 'alpha').locator('.col-pick');
  await page.waitForFunction(() => [...document.querySelectorAll('#stage .win.stream .col-pick')].every(s => s.options.length === 2));
  const where = () => page.$$eval('#stage .win.stream', l => Object.fromEntries(l.map(e => [e.querySelector('.title').textContent, e.offsetLeft])));
  const before = await where();
  await pick.click();
  assert.deepEqual(await items(page), ['*>alpha', 'bravo']);
  assert.equal(await page.locator(`${list} button .ch-av`).count(), 2, 'with their pictures');
  const offCentre = await page.$$eval(`${list} button.ic`, l => l.map(b => {
    const mid = e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
    return Math.abs(mid(b.querySelector('.ch-av')) - mid(b.querySelector('.dd-t')));
  }));
  assert.ok(offCentre.every(d => d <= 1), `each picture is centred on its name (${offCentre})`);
  await page.click(`${list} button:has-text("bravo")`);
  await page.waitForFunction(b => document.querySelector('#stage .win.stream').offsetLeft !== b, before.alpha).catch(() => {});
  await page.waitForTimeout(400);                    // windows animate to their new places
  const after = await where();
  assert.deepEqual([after.alpha, after.bravo], [before.bravo, before.alpha], 'they swapped places');
});

test('the list: above when there\'s no room below, disabled options skipped, and it closes on a click outside, scrolling or resizing', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    const s = document.createElement('select');
    s.id = 'dd'; s.style.cssText = 'position:fixed;left:20px;bottom:10px';
    s.innerHTML = '<option>one</option><option disabled>two</option><option>three</option>';
    const m = document.createElement('select'); m.id = 'ddMulti'; m.multiple = true; m.innerHTML = '<option>a</option>';
    m.style.cssText = 'position:fixed;left:200px;top:200px';
    document.body.append(s, m);
  });
  await page.click('#dd');
  const [sel, box] = await Promise.all([page.locator('#dd').boundingBox(), page.locator(list).boundingBox()]);
  assert.ok(box.y + box.height <= sel.y, 'above the dropdown');
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await items(page), ['*one', 'two', '>three'], 'skips the disabled one');
  await page.hover(`${list} button:text-is("two")`, { force: true });
  assert.deepEqual(await items(page), ['*one', 'two', '>three'], 'and the mouse over it doesn\'t highlight it');
  assert.equal(await page.isDisabled(`${list} button:text-is("two")`), true);
  await page.mouse.click(800, 400);
  assert.equal(await page.$(list), null, 'a click outside closes it');

  await page.click('#dd');
  await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
  assert.equal(await page.$(list), null, 'scrolling the page closes it');
  await page.click('#dd');
  await page.evaluate(() => document.querySelector('.dd-list').dispatchEvent(new Event('scroll')));
  assert.notEqual(await page.$(list), null, 'scrolling the list itself doesn\'t');
  await page.setViewportSize({ width: 1500, height: 880 });
  await page.waitForFunction(() => !document.querySelector('.dd-list'));

  await page.click('#dd');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.$(list), null, 'leaving the window closes it');
  await page.click('#dd');
  await page.evaluate(() => document.getElementById('dd').blur());
  await page.waitForFunction(() => !document.querySelector('.dd-list'));

  await page.click('#ddMulti');                      // a list box isn't a dropdown
  assert.equal(await page.$(list), null);

  // in a dialog (Settings), the list is above the dialog and can be clicked
  await page.evaluate(() => { openSettings('general'); document.querySelector('#settingsDlg .st-pane:not([hidden])').appendChild(document.getElementById('dd')); document.getElementById('dd').style.cssText = ''; });
  await page.click('#dd');
  assert.equal(await page.$eval(list, l => { const r = l.getBoundingClientRect(); return l.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), true, 'nothing covers it');
  await page.click(`${list} button:text-is("three")`);
  assert.equal(await page.inputValue('#dd'), 'three');
  assert.equal(await page.isVisible('#settingsDlg'), true, 'picking doesn\'t close the dialog');
  await page.click('#dd');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#settingsDlg'), true, 'Escape closes only the list');
});
