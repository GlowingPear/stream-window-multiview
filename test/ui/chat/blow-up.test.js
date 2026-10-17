// Blow up chat on click (chat/blow-up.js): the switch in the switch control, a chat lifted big into the middle
// over a dimmed layout, its text size, and putting it back (Esc, Put back, the dimmed part, closing the window).
// Clicking into a chat itself is in the launch test (the browser here has no chat pages to click into).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, press } = require('../app');
const { openApp } = setup();

async function focusView(t, opts) {
  const page = await openApp(t, opts);
  await add(page, 'alpha', 'bravo', 'charlie');
  await press(page, 'f');                         // Focus view: the switch control is under the big stream
  return page;
}
const blown = page => page.evaluate(() => window.blownWin() ? document.querySelector('.win.blown .title').textContent : null);

test('Blow up chat: the switch control has the switch, off at first, and it stays as you left it', async t => {
  const page = await focusView(t);
  const btn = page.locator('#featSwitch .fs-blow');
  assert.ok(await btn.isVisible());
  assert.match(await btn.textContent(), /Blow up chat on click/);
  assert.equal(await btn.getAttribute('aria-pressed'), 'false');
  await btn.click();
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  assert.ok(await btn.evaluate(b => b.classList.contains('on')));
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.chatBlowup')), '1');
  await page.reload(); await page.waitForSelector('#featSwitch .fs-blow');   // back in Focus view
  assert.equal(await page.locator('#featSwitch .fs-blow').getAttribute('aria-pressed'), 'true', 'still on after a restart');
  await page.click('#featSwitch .fs-blow');
  assert.equal(await page.locator('#featSwitch .fs-blow').getAttribute('aria-pressed'), 'false');
});

test('Blow up chat: the chat goes big in the middle over a dimmed layout, with its own text size, and Esc puts it back', async t => {
  const page = await focusView(t, { width: 1600, height: 900 });
  const chat = win(page, 'bravo', 'chat');
  const before = await box(chat);
  await page.evaluate(() => window.blowUpChat('nobody'));   // not a chat window: nothing happens
  assert.equal(await blown(page), null);
  await page.evaluate(() => window.blowUpChat('bravo'));
  assert.equal(await blown(page), 'bravo');
  const big = await box(chat);
  assert.equal(big.w, 820, 'as wide as the blown-up size');
  assert.equal(big.x, (1600 - 820) / 2, 'in the middle');
  assert.ok(big.h > 700, `nearly the full height (${big.h})`);
  assert.ok(await page.isVisible('#blowBg'), 'the layout is dimmed');
  assert.ok(await page.isVisible('#blowBar'));
  assert.equal(await page.textContent('#blowBar .bb-name'), 'bravo');
  assert.equal(await page.textContent('#blowBar .bb-pct'), '175%');
  // only this chat's own view is scaled (a site's zoom is shared by all its chats)
  const scales = () => page.$$eval('#stage .win.chat', l => l.map(e => e.querySelector('.title').textContent + ':' + e.querySelector('.body > :first-child').style.zoom).sort());
  assert.deepEqual(await scales(), ['alpha:', 'bravo:1.75', 'charlie:']);
  // text size: − and +, kept for next time, and the ends can't go further
  await page.click('#blowBar [data-b="1"]');
  assert.equal(await page.textContent('#blowBar .bb-pct'), '200%');
  for (let i = 0; i < 6; i++) await page.click('#blowBar [data-b="-1"]', { force: true });
  assert.equal(await page.textContent('#blowBar .bb-pct'), '125%');
  assert.ok(await page.isDisabled('#blowBar [data-b="-1"]'));
  await page.click('#blowBar [data-b="1"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.chatBlowSize')), '1');
  // Esc puts it back where it was
  await press(page, 'Escape');
  assert.equal(await blown(page), null);
  assert.deepEqual(await box(chat), before, 'back where it was');
  assert.deepEqual(await scales(), ['alpha:', 'bravo:', 'charlie:'], 'and its normal size');
  assert.ok(!(await page.isVisible('#blowBg')) && !(await page.isVisible('#blowBar')));
});

test('Blow up chat: Put back, a click on the dimmed part, switching it off and closing the chat all put it back', async t => {
  const page = await focusView(t);
  await page.click('#featSwitch .fs-blow');
  const up = name => page.evaluate(n => window.blowUpChat(n), name);
  await up('alpha');
  await page.click('#blowBar .bb-back');
  assert.equal(await blown(page), null, 'Put back');
  await up('alpha');
  await page.mouse.click(30, 450);
  assert.equal(await blown(page), null, 'a click on the dimmed part');
  await up('alpha'); await up('charlie');
  assert.equal(await blown(page), 'charlie', 'one at a time: the next one takes its place');
  assert.equal(await page.locator('.win.blown').count(), 1);
  await page.locator('#featSwitch .fs-blow').dispatchEvent('click');   // it's under the dimmed part: as from the switch control's own window
  assert.equal(await blown(page), null, 'switching the mode off');
  await page.click('#featSwitch .fs-blow');
  await up('bravo');
  await page.click('.win.blown .bar [data-a=close]');
  assert.equal(await blown(page), null, 'closing the chat');
  assert.ok(!(await page.isVisible('#blowBg')));
});

test('Blow up chat: Z switches the mode, Shift+Z blows up the chat you last clicked now and puts it back', async t => {
  const page = await focusView(t);
  const btnOn = () => page.locator('#featSwitch .fs-blow').getAttribute('aria-pressed');
  await press(page, 'z');
  assert.equal(await btnOn(), 'true', 'Z: on');
  assert.match(await page.textContent('#flash, .flash, body'), /Blow up chat is on/);
  await press(page, 'z');
  assert.equal(await btnOn(), 'false', 'Z again: off');
  // Shift+Z with the mode off: the chat you last clicked (its title bar), else the big stream's
  await page.click('#stage .win.chat:has(.title:text-is("bravo")) .bar .grab');
  await press(page, 'Shift+Z');
  assert.equal(await blown(page), 'bravo', 'the one you clicked');
  await press(page, 'Shift+Z');
  assert.equal(await blown(page), null, 'again: put back');
  await page.evaluate(() => document.querySelectorAll('#stage .win.active').forEach(e => e.classList.remove('active')));
  await press(page, 'Shift+Z');
  assert.equal(await blown(page), 'alpha', "no chat clicked: the big stream's chat");
  await press(page, 'Escape');
  assert.equal(await blown(page), null);
  assert.equal(await btnOn(), 'false', 'the mode stayed off');
  // no chats: says so
  await page.evaluate(() => document.querySelectorAll('#stage .win.chat .bar [data-a=close]').forEach(b => b.click()));
  await press(page, 'Shift+Z');
  assert.equal(await blown(page), null);
  assert.match(await page.textContent('body'), /Open a chat first/);
});
