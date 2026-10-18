// New-message counts (Settings › Chat › Count new messages in chats you can't see, off at first): a chat out of sight
// in any layout counts the messages written since you last saw it, on its stream's title bar and its row in the switch
// control, until you can see it again. Chat Stage's strip and Chat Rail's tabs are in their own tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, press, settled } = require('../app');
const { openApp } = setup();

// the number on a stream's title bar, and on its row in the switch control ('' when there's none)
const bar = (page, name) => win(page, name).locator('.bar-n').evaluate(b => b.hidden ? '' : b.textContent);
const row = (page, name) => page.locator(`#featSwitch .fs-item[data-ch=${name}] .fs-n`).evaluate(b => b.hidden ? '' : b.textContent);
const countsOn = page => page.evaluate(() => { const s = document.getElementById('chatCountsSet'); s.checked = true; s.dispatchEvent(new Event('change')); });
async function three(t){
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');   // the first-run tips card
  await press(page, 't');                                                     // Tile: every window in sight
  return page;
}
// alpha's stream maximized, over every other window
const coverAll = async page => { await win(page, 'alpha').locator('[data-a=max]').click(); await page.waitForTimeout(400); };   // it grows over 0.3 s

test('new-message counts are off at first, and switching them on is saved, also from the other window', async t => {
  const page = await three(t);
  await coverAll(page);
  assert.equal(await page.isChecked('#chatCountsSet'), false);
  await page.evaluate(() => window.chatNew('bravo', 3));
  assert.equal(await bar(page, 'bravo'), '', 'off: nothing counted');
  await countsOn(page);                                       // (Settings › Chat only shows it in the desktop app: the launch test clicks it)
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.chatCounts')), '1');
  await page.evaluate(() => window.chatNew('bravo', 3));
  assert.equal(await bar(page, 'bravo'), '3');
  assert.equal(await bar(page, 'alpha'), '', 'a stream with nothing new has no number');
  // switched off in the other window: the counts go
  await page.evaluate(() => { localStorage.setItem('kickMultiview.chatCounts', '0'); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.chatCounts', newValue: '0' })); });
  await page.waitForFunction(() => !document.getElementById('chatCountsSet').checked);
  assert.equal(await bar(page, 'bravo'), '');
});

test('a covered chat counts on its stream\'s title bar until you can see it, and a chat you can see never counts', async t => {
  const page = await three(t);
  await countsOn(page);
  await page.evaluate(() => window.chatNew('bravo', 2));
  assert.equal(await bar(page, 'bravo'), '', 'in sight: read as it comes');
  await coverAll(page);
  await page.evaluate(() => { window.chatNew('bravo', 2); window.chatNew('bravo', 5); window.chatNew('charlie', 140); });
  assert.equal(await bar(page, 'bravo'), '7');
  assert.equal(await bar(page, 'charlie'), '99+');
  assert.match(await win(page, 'bravo').locator('.bar-n').getAttribute('title'), /^7 new messages in bravo's chat$/);
  // a Settings dialog over the chats counts as out of sight too
  await coverAll(page);                                       // alpha back to its place
  await page.evaluate(() => window.openSettings());
  await page.evaluate(() => window.chatNew('alpha', 1));
  assert.equal(await bar(page, 'alpha'), '1');
  await page.keyboard.press('Escape');
  // in sight again: read the next time it's asked (every 3 s, with whatever is new)
  await page.evaluate(() => ['alpha', 'bravo', 'charlie'].forEach(c => window.chatNew(c, 0)));
  assert.deepEqual([await bar(page, 'alpha'), await bar(page, 'bravo'), await bar(page, 'charlie')], ['', '', '']);
});

test('the switch control shows each stream\'s count next to its name', async t => {
  const page = await three(t);
  await countsOn(page);
  await press(page, 'f');
  await page.evaluate(() => window.openSettings());          // over every chat
  await page.evaluate(() => { window.chatNew('bravo', 4); window.chatNew('charlie', 1); });
  await page.keyboard.press('Escape');
  assert.equal(await row(page, 'bravo'), '4');
  assert.equal(await row(page, 'charlie'), '1');
  assert.equal(await row(page, 'alpha'), '');
  assert.match(await page.locator('#featSwitch .fs-item[data-ch=charlie] .fs-n').getAttribute('title'), /^1 new message in charlie's chat$/);
  // a redraw of the switch control keeps them
  await page.click('#featSwitch .fs-item[data-ch=charlie] .fs-name');
  assert.equal(await row(page, 'bravo'), '4');
  // bravo in the big spot: its chat is in sight once the windows have stopped moving, and read the next time it's asked
  await page.click('#featSwitch .fs-item[data-ch=bravo] .fs-name');
  await settled(page);
  assert.equal(await row(page, 'bravo'), '4', 'until it\'s asked');
  await page.evaluate(() => window.chatNew('bravo', 0));
  assert.equal(await row(page, 'bravo'), '', 'seen');
});
