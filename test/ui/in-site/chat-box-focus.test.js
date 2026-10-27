// The keyboard goes to the chat box of a chat you switched to with Tab: the script inside a chat page
// (in-site/chat-box-focus.js) on a stand-in chat box in the app's own page (so its code counts for coverage).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// a chat box like Kick's (an editor you can type in), now or after ms
const addBox = (page, ms = 0) => page.evaluate(ms => setTimeout(() => {
  const b = document.createElement('div'); b.id = 'cbf-box'; b.contentEditable = 'true';
  Object.assign(b.style, { position: 'fixed', left: '0', top: '0', width: '200px', height: '30px', zIndex: 99999 });
  document.body.append(b);
}, ms), ms);
const focusBox = (page, ms) => page.evaluate(ms => window.focusBoxAgent('#cbf-box', ms), ms);
const inBox = page => page.evaluate(() => document.activeElement?.id === 'cbf-box');

test('a chat box that\'s there gets the keyboard at once', async t => {
  const page = await openApp(t);
  await addBox(page);
  await page.waitForSelector('#cbf-box');
  assert.equal(await focusBox(page), 'focused');
  assert.equal(await inBox(page), true);
});

test('a chat still loading: it waits for the site to draw its box', async t => {
  const page = await openApp(t);
  const done = focusBox(page, 4000);
  await addBox(page, 600);
  assert.equal(await done, 'focused');
  assert.equal(await inBox(page), true);
});

test('pressed or typed somewhere in the chat first, or no box in time: the focus stays where it is', async t => {
  const page = await openApp(t);
  const pressed = focusBox(page, 4000);
  await page.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
  await addBox(page, 300);
  assert.equal(await pressed, 'left');
  await page.waitForSelector('#cbf-box');
  assert.equal(await inBox(page), false);
  await page.evaluate(() => document.getElementById('cbf-box').remove());
  const typed = focusBox(page, 4000);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
  await addBox(page, 300);
  assert.equal(await typed, 'left');
  await page.waitForSelector('#cbf-box');
  await page.evaluate(() => document.getElementById('cbf-box').remove());
  assert.equal(await focusBox(page, 300), 'none', 'no box: it gives up');
});
