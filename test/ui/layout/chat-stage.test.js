// Chat Stage: one stream big with its chat beside it in big text, the other streams in a strip under it, the other
// chats out of sight. Clicking a picture in the strip, the stage chat's text size, the split, @ for a mention,
// opening and closing windows, and leaving for another layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, drag, press } = require('../app');
const { openApp } = setup();

async function stageOf(t, names = ['alpha', 'bravo', 'charlie', 'delta']) {
  const page = await openApp(t, { width: 1600, height: 900 });
  await add(page, ...names);
  await press(page, 'k');
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');   // the first-run tips card
  return page;
}
// What's where: the stream on the stage, its chat, the strip in order, and the chats out of sight
const look = page => page.evaluate(() => {
  const t = sel => [...document.querySelectorAll('#stage .win' + sel)].sort((a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft).map(e => e.querySelector('.title').textContent);
  return { on: t('.stg-on'), chat: t('.stg-chat'), strip: t('.stg-thumb'), off: t('.stg-off').sort() };
});

test('Chat Stage: the first stream big with its chat, the others in a strip under it, the other chats out of sight', async t => {
  const page = await stageOf(t);
  assert.deepEqual(await look(page), { on: ['alpha'], chat: ['alpha'], strip: ['bravo', 'charlie', 'delta'], off: ['bravo', 'charlie', 'delta'] });
  const big = await box(win(page, 'alpha')), chat = await box(win(page, 'alpha', 'chat')), thumb = await box(win(page, 'bravo'));
  assert.ok(big.w > 950 && chat.w > 520 && chat.w < 620, `the stream gets about 64%, the chat 36% (${big.w}, ${chat.w})`);
  assert.ok(chat.x > big.x + big.w && chat.h > 800, 'the chat on the right, the full height');
  assert.ok(Math.abs((big.h - 30) / big.w - 9 / 16) < 0.02, `the big one exactly 16:9 (${JSON.stringify(big)})`);
  assert.ok(thumb.y > big.y + big.h && thumb.w > 200, 'the strip under it');
  // the hidden chats are where the stage chat is, invisible and not in the way
  const off = await win(page, 'bravo', 'chat').evaluate(e => [getComputedStyle(e).visibility, e.offsetLeft, e.offsetWidth]);
  assert.deepEqual(off, ['hidden', chat.x, chat.w]);
  assert.equal(await page.isVisible('#stgSplit'), true);
  // the Layout menu says so, and it's there after a restart
  await page.click('#layoutBtn');
  assert.ok(await page.locator('#layoutMenu button[data-l=stage]').evaluate(b => b.classList.contains('on')));
  assert.match(await page.textContent('#lmHint'), /easy-to-read/);
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('#stage .win.stg-on');
  assert.deepEqual((await look(page)).on, ['alpha']);
});

test('Chat Stage: clicking a picture in the strip puts that stream and its chat on the stage, remembered', async t => {
  const page = await stageOf(t);
  await page.hover('#stage .win.stg-thumb:has(.title:text-is("charlie")) .stg-pick');
  assert.ok(await page.isVisible('#stage .win.stg-thumb:has(.title:text-is("charlie")) .stg-go'), 'Put on stage shows on the picture you point at');
  await page.click('#stage .win.stg-thumb:has(.title:text-is("charlie")) .stg-pick');
  assert.deepEqual(await look(page), { on: ['charlie'], chat: ['charlie'], strip: ['alpha', 'bravo', 'delta'], off: ['alpha', 'bravo', 'delta'] });
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.stageCh')), 'charlie');
  await page.reload(); await page.waitForSelector('#stage .win.stg-on');
  assert.deepEqual((await look(page)).on, ['charlie'], 'still on the stage after a restart');
  // the window bars of a managed layout don't drag the windows away
  const before = await box(win(page, 'charlie'));
  const bar = await box(page.locator('#stage .win.stg-on .bar .grab'));
  await drag(page, { x: bar.x + 5, y: bar.y + 10 }, { x: bar.x + 200, y: bar.y + 300 });
  assert.deepEqual(await box(win(page, 'charlie')), before);
});

test('Chat Stage: the stage chat has its own text size, and the line between them shares the width', async t => {
  const page = await stageOf(t, ['alpha', 'bravo']);
  const size = () => page.textContent('#stage .win.stg-chat .stg-size em');
  assert.equal(await size(), '130%');
  assert.equal(await page.locator('.stg-size').count(), 1, 'only on the stage chat');
  // only the stage chat's own view is scaled (a site's zoom is shared by all its chats)
  const scales = () => page.$$eval('#stage .win.chat', l => l.map(e => e.querySelector('.title').textContent + ':' + e.querySelector('.body > :first-child').style.zoom).sort());
  assert.deepEqual(await scales(), ['alpha:1.3', 'bravo:']);
  await page.click('.stg-size [data-s="1"]');
  assert.equal(await size(), '150%');
  for (let i = 0; i < 6; i++) await page.click('.stg-size [data-s="-1"]', { force: true });
  assert.equal(await size(), '100%');
  assert.ok(await page.isDisabled('.stg-size [data-s="-1"]'));
  assert.deepEqual(await scales(), ['alpha:', 'bravo:'], 'at 100% nothing is scaled');
  await page.click('.stg-size [data-s="1"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.stageZoom')), '1');
  assert.deepEqual(await scales(), ['alpha:1.15', 'bravo:']);
  // blowing up the stage chat (Blow up chat on click) and putting it back gives it its stage size again
  await page.evaluate(() => window.blowUpChat('alpha'));
  assert.deepEqual(await scales(), ['alpha:1.75', 'bravo:']);
  await page.click('#blowBar .bb-back');
  assert.deepEqual(await scales(), ['alpha:1.15', 'bravo:']);
  // drag the line: the chat gets wider, the stream narrower, and it stays that way
  const chat0 = await box(win(page, 'alpha', 'chat'));
  const sp = await box(page.locator('#stgSplit'));
  await drag(page, { x: sp.x + 4, y: sp.y + sp.h / 2 }, { x: sp.x - 296, y: sp.y + sp.h / 2 });
  const chat1 = await box(win(page, 'alpha', 'chat'));
  assert.ok(chat1.w > chat0.w + 250, `wider (${chat0.w} → ${chat1.w})`);
  assert.ok((await box(win(page, 'alpha'))).w < 760);
  const kept = +(await page.evaluate(() => localStorage.getItem('kickMultiview.stageSplit')));
  assert.ok(kept > 0.5 && kept <= 0.6, `remembered (${kept})`);
  // as far as it goes
  await drag(page, { x: sp.x - 292, y: sp.y + 10 }, { x: 40, y: sp.y + 10 });
  assert.equal(+(await page.evaluate(() => localStorage.getItem('kickMultiview.stageSplit'))), 0.6);
});

test('Chat Stage: @ on a picture when its chat mentions you, until you read it', async t => {
  const page = await stageOf(t, ['alpha', 'bravo', 'charlie']);
  const at = name => page.locator(`#stage .win.stg-thumb:has(.title:text-is("${name}")) .stg-pick`).evaluate(p => p.classList.contains('at'));
  assert.equal(await at('bravo'), false);
  await page.evaluate(() => window.raiseAlert('bravo', 'mention'));
  await page.waitForFunction(() => document.querySelector('#stage .win.stg-thumb .stg-pick.at'));
  assert.equal(await at('bravo'), true);
  assert.equal(await at('charlie'), false);
  // put it on the stage, read it (its chat is right there), and it's gone from the strip's picture next time
  await page.click('#stage .win.stg-thumb:has(.title:text-is("bravo")) .stg-pick');
  assert.equal(await page.locator('#stage .win.stg-thumb .stg-pick.at').count(), 0);
});

test('Chat Stage: opening and closing windows arranges it again, and other layouts take everything back', async t => {
  const page = await stageOf(t, ['alpha', 'bravo']);
  await add(page, 'charlie'); await page.waitForTimeout(400);   // (the windows glide into place)
  assert.deepEqual(await look(page), { on: ['alpha'], chat: ['alpha'], strip: ['bravo', 'charlie'], off: ['bravo', 'charlie'] });
  // closing the stream on the stage: the next one takes its place
  await page.click('#stage .win.stg-on .bar [data-a=close]');
  const l = await look(page);
  assert.equal(l.on.length, 1); assert.notEqual(l.on[0], 'alpha');
  // Tile: every window back in sight, no strip buttons, no text size, no split
  await page.click('#layoutBtn'); await page.click('#layoutMenu button[data-l=tile]');
  assert.deepEqual(await look(page), { on: [], chat: [], strip: [], off: [] });
  assert.equal(await page.locator('.stg-pick, .stg-size').count(), 0);
  assert.equal(await page.$$eval('#stage .win.chat .body > :first-child', l => l.filter(v => v.style.zoom).length), 0, 'no chat scaled');
  assert.equal(await page.isVisible('#stgSplit'), false);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#stage .win')].every(e => getComputedStyle(e).visibility === 'visible')));
  // and back, with the K key
  await press(page, 'k');
  assert.equal((await look(page)).on.length, 1);
  // a saved layout keeps it
  await page.click('#layoutBtn'); await page.fill('#presetName', 'Reading'); await page.click('#presetSave'); await page.keyboard.press('Escape');
  await press(page, 'c');
  assert.deepEqual((await look(page)).on, []);
  await page.click('#layoutBtn'); await page.click('#presetList .pr-load:has-text("Reading")'); await page.waitForTimeout(400);
  assert.equal((await look(page)).on.length, 1, 'the saved layout is a Chat Stage');
});

test('Chat Stage: without chats it tiles the streams instead', async t => {
  const page = await openApp(t, { width: 1400, height: 800 });
  await page.click('#savedBtn'); await page.selectOption('#mode', 'stream'); await page.click('#savedBtn');
  await add(page, 'alpha', 'bravo');
  await press(page, 'k');
  assert.deepEqual(await look(page), { on: [], chat: [], strip: [], off: [] });
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), 'tile');
});
