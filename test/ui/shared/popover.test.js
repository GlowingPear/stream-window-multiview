// Menus and panels that close on a press outside them (src/page/shared/popover.js): also on a press in a stream or
// chat, which the app's page never sees (windows/views.js says so: viewPressed(); a real press is in
// test/launch/toolbar/outside-press.test.js), and on the window losing the focus to another window, but not to one
// of its own views (the app's own clicks there: YouTube's Skip). With the toolbar on top, and on the left with and
// without its labels.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add } = require('../app');

const { openApp } = setup();
const BARS = [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }];
const bar = b => `try { localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(b))}) } catch {}`;
// what windows/views.js does when you press in a view
const pressView = page => page.evaluate(async () => (await import('/src/page/shared/popover.js')).viewPressed());
const blur = page => page.evaluate(() => window.dispatchEvent(new Event('blur')));

for (const b of BARS) {
  const name = b.pos + (b.pos === 'left' ? (b.labels ? ', with labels' : ', icons only') : '');
  test(`the Channels panel closes on a press in a stream, not on one inside it, and its dropdown's list goes too (toolbar ${name})`, async t => {
    const page = await openApp(t, { init: bar(b) });
    await page.click('#savedBtn');
    await page.click('#savedInput');
    assert.equal(await page.isVisible('#savedPanel'), true, 'a press inside it: open');
    await pressView(page);
    assert.equal(await page.isVisible('#savedPanel'), false, 'a press in a stream: closed');
    await page.click('#savedBtn');
    await page.click('#mode');
    assert.equal(await page.isVisible('.dd-list'), true);
    await pressView(page);
    assert.equal(await page.isVisible('#savedPanel'), false);
    assert.equal(await page.$('.dd-list'), null, 'its list too');
  });

  test(`the Channels panel and the Layout menu close when the window loses the focus to another window (toolbar ${name})`, async t => {
    const page = await openApp(t, { init: bar(b) });
    await page.click('#savedBtn');
    await page.click('#mode');
    await blur(page);
    assert.equal(await page.isVisible('#savedPanel'), false, 'Channels');
    assert.equal(await page.$('.dd-list'), null, 'its dropdown\'s list');
    await page.click('#layoutBtn');
    assert.equal(await page.isVisible('#layoutMenu'), true);
    await blur(page);
    assert.equal(await page.isVisible('#layoutMenu'), false, 'Layout');
  });
}

test('the window losing the focus to one of its own views (the app clicking Skip there) leaves the panel open', async t => {
  const page = await openApp(t);
  await add(page, 'charlie');
  await page.click('#savedBtn');
  await page.evaluate(() => { document.querySelector('#stage .win.stream .body iframe').focus(); window.dispatchEvent(new Event('blur')); });
  assert.equal(await page.isVisible('#savedPanel'), true);
});

test('the Layout menu closes on a press in a stream, and its button still opens and closes it', async t => {
  const page = await openApp(t);
  await page.click('#layoutBtn');
  assert.equal(await page.isVisible('#layoutMenu'), true);
  await pressView(page);
  assert.equal(await page.isVisible('#layoutMenu'), false);
  await page.click('#layoutBtn');
  assert.equal(await page.isVisible('#layoutMenu'), true, 'the button opens it');
  await page.click('#layoutBtn');
  assert.equal(await page.isVisible('#layoutMenu'), false, 'and closes it');
});
