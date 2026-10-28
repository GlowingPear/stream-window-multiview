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
const focusBox = (page, ms, hold = 400) => page.evaluate(([ms, hold]) => window.focusBoxAgent('#cbf-box', ms, hold), [ms, hold]);
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

test('a box drawn before it can take the keyboard (the site makes it editable later): it keeps trying', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    const b = document.createElement('div'); b.id = 'cbf-box';
    Object.assign(b.style, { position: 'fixed', left: '0', top: '0', width: '200px', height: '30px', zIndex: 99999 });
    document.body.append(b);
    setTimeout(() => { b.contentEditable = 'true'; }, 600);
  });
  assert.equal(await focusBox(page, 4000), 'focused');
  assert.equal(await inBox(page), true);
});

test('the site draws its box again as it finishes loading: the new one gets the keyboard; something else in the page keeps it', async t => {
  const page = await openApp(t);
  await addBox(page);
  await page.waitForSelector('#cbf-box');
  const done = focusBox(page, 4000, 1200);
  await page.waitForFunction(() => document.activeElement?.id === 'cbf-box');
  await page.evaluate(() => { const b = document.getElementById('cbf-box'), c = b.cloneNode(); b.replaceWith(c); });
  assert.equal(await done, 'focused');
  assert.equal(await inBox(page), true, 'back in the box drawn again');
  // the page's own button took it (not dropped): it stays there
  const again = focusBox(page, 4000, 1200);
  await page.waitForFunction(() => document.activeElement?.id === 'cbf-box');
  await page.evaluate(() => { const x = document.createElement('button'); x.id = 'cbf-btn'; document.body.append(x); x.focus(); });
  assert.equal(await again, 'focused');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cbf-btn');
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
