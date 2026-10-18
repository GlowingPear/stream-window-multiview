// Chat Rail: every stream in a grid, one chat in big text in a rail on the right with tabs across its top, the other
// chats out of sight. The tabs and Show chat, the outline, the rail chat's text size, new messages and @ on the tabs,
// opening and closing windows, and leaving for another layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, drag, press, settled } = require('../app');
const { openApp } = setup();

async function railOf(t, names = ['alpha', 'bravo', 'charlie', 'delta'], size = { width: 1600, height: 900 }) {
  const page = await openApp(t, size);
  await add(page, ...names);
  await press(page, 'Shift+K');
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');   // the first-run tips card
  return page;
}
// What's where: the chat in the rail, the stream outlined, the chats out of sight, and the tabs (the one on in [])
const look = page => page.evaluate(() => {
  const t = sel => [...document.querySelectorAll('#stage .win' + sel)].map(e => e.querySelector('.title').textContent).sort();
  const tabs = [...document.querySelectorAll('#railTabs .rl-tab')].map(b => b.classList.contains('on') ? `[${b.textContent.replace(/[0-9+@]+$/, '')}]` : b.querySelector('.rl-nm').textContent);
  return { chat: t('.rl-chat'), shown: t('.rl-shown'), off: t('.rl-off'), tabs };
});
const tab = (page, name) => page.locator(`#railTabs .rl-tab[data-ch="${name}"]`);
const scales = page => page.$$eval('#stage .win.chat', l => l.map(e => e.querySelector('.title').textContent + ':' + e.querySelector('.body > :first-child').style.zoom).sort());

test('Chat Rail: the streams in a grid, the first chat in the rail with tabs on top, the other chats out of sight', async t => {
  const page = await railOf(t);
  assert.deepEqual(await look(page), { chat: ['alpha'], shown: ['alpha'], off: ['bravo', 'charlie', 'delta'], tabs: ['[alpha]', 'bravo', 'charlie', 'delta'] });
  const chat = await box(win(page, 'alpha', 'chat')), tabs = await box(page.locator('#railTabs'));
  const s = await Promise.all(['alpha', 'bravo', 'charlie', 'delta'].map(n => box(win(page, n))));
  assert.ok(chat.w > 420 && chat.w <= 440, `the rail is 440px wide (${chat.w})`);
  assert.ok(chat.x > Math.max(...s.map(b => b.x + b.w)), 'the rail on the right of every stream');
  assert.equal(tabs.x, chat.x); assert.equal(tabs.w, chat.w);
  assert.ok(Math.abs(tabs.y + tabs.h - chat.y) <= 1, 'the tabs sit on top of the chat');
  assert.ok(chat.y + chat.h > 800, 'the chat goes down to the bottom');
  // 2 × 2
  assert.equal(new Set(s.map(b => b.y)).size, 2); assert.equal(new Set(s.map(b => b.x)).size, 2);
  // the hidden chats are where the rail chat is, invisible and not in the way
  const off = await win(page, 'bravo', 'chat').evaluate(e => [getComputedStyle(e).visibility, e.offsetLeft, e.offsetWidth]);
  assert.equal(off[0], 'hidden'); assert.equal(off[2], chat.w);
  // the stream whose chat is shown: outlined, and says so; the others offer to show theirs
  assert.equal(await page.textContent('#stage .win.rl-shown .rl-show'), 'Chat shown');
  assert.equal(await page.textContent(`#stage .win.stream:has(.title:text-is("bravo")) .rl-show`), 'Show chat');
  // the Layout menu says so, and it's there after a restart
  await page.click('#layoutBtn');
  assert.ok(await page.locator('#layoutMenu button[data-l=rail]').evaluate(b => b.classList.contains('on')));
  await page.hover('#layoutMenu button[data-l=rail]');
  assert.match(await page.textContent('#lmHint'), /rail beside them/);
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('#stage .win.rl-chat');
  assert.deepEqual((await look(page)).chat, ['alpha']);
});

test('Chat Rail: a tab or Show chat puts that chat in the rail and outlines its stream, remembered', async t => {
  const page = await railOf(t);
  await tab(page, 'charlie').click();
  assert.deepEqual(await look(page), { chat: ['charlie'], shown: ['charlie'], off: ['alpha', 'bravo', 'delta'], tabs: ['alpha', 'bravo', '[charlie]', 'delta'] });
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.railCh')), 'charlie');
  await page.click(`#stage .win.stream:has(.title:text-is("delta")) .rl-show`);
  assert.deepEqual((await look(page)).shown, ['delta']);
  assert.ok(await page.isDisabled('#stage .win.rl-shown .rl-show'), 'Chat shown is only a label');
  await page.reload(); await page.waitForSelector('#stage .win.rl-chat');
  assert.deepEqual((await look(page)).chat, ['delta'], 'still in the rail after a restart');
  await page.evaluate(() => window.showRailChat('nobody'));   // not a chat that's open: nothing changes
  assert.deepEqual((await look(page)).chat, ['delta']);
  // the window bars of a managed layout don't drag the windows away
  const before = await box(win(page, 'bravo'));
  const bar = await box(win(page, 'bravo').locator('.bar .grab'));
  await drag(page, { x: bar.x + 5, y: bar.y + 10 }, { x: bar.x + 200, y: bar.y + 300 });
  assert.deepEqual(await box(win(page, 'bravo')), before);
});

test('Chat Rail: the rail chat has its own text size, only its own view is scaled, and it follows the tabs', async t => {
  const page = await railOf(t, ['alpha', 'bravo']);
  const size = () => page.textContent('#railTabs .rl-pct');
  assert.equal(await size(), '130%');
  assert.deepEqual(await scales(page), ['alpha:1.3', 'bravo:']);
  await page.click('#railTabs [data-s="1"]');
  assert.equal(await size(), '150%');
  for (let i = 0; i < 6; i++) await page.click('#railTabs [data-s="-1"]', { force: true });
  assert.equal(await size(), '100%');
  assert.ok(await page.isDisabled('#railTabs [data-s="-1"]'));
  assert.deepEqual(await scales(page), ['alpha:', 'bravo:'], 'at 100% nothing is scaled');
  await page.click('#railTabs [data-s="1"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.railZoom')), '1');
  await tab(page, 'bravo').click();
  assert.deepEqual(await scales(page), ['alpha:', 'bravo:1.15'], 'the size goes with the chat that is shown');
  // blowing up the rail chat (Blow up chat on click) and putting it back gives it its rail size again
  await page.evaluate(() => window.blowUpChat('bravo'));
  await page.click('#blowBar .bb-back');
  assert.deepEqual(await scales(page), ['alpha:', 'bravo:1.15']);
  // Chat Stage and back: each gives the same chat its own size
  await press(page, 'k');
  assert.deepEqual(await scales(page), ['alpha:1.3', 'bravo:'], 'Chat Stage: alpha on the stage at its 130%');
  await press(page, 'Shift+K');
  assert.deepEqual(await scales(page), ['alpha:', 'bravo:1.15']);
  // the same chat in both layouts: each layout gives it its own size
  await press(page, 'k'); await page.evaluate(() => window.putOnStage('bravo'));
  assert.deepEqual(await scales(page), ['alpha:', 'bravo:1.3']);
  await press(page, 'Shift+K');
  assert.deepEqual(await scales(page), ['alpha:', 'bravo:1.15']);
});

test('Chat Rail: tabs count new messages since a chat was shown, and show @ when it mentions you', async t => {
  const page = await railOf(t, ['alpha', 'bravo', 'charlie']);
  await page.evaluate(() => { const s = document.getElementById('chatCountsSet'); s.checked = true; s.dispatchEvent(new Event('change')); });   // Settings › Chat
  const badge = async name => tab(page, name).evaluate(b => [b.classList.contains('new') ? b.querySelector('.rl-n').textContent : '', b.classList.contains('at') ? '@' : ''].join(''));
  assert.equal(await badge('bravo'), '');
  await page.evaluate(() => { window.chatNew('bravo', 3); window.chatNew('bravo', 5); window.chatNew('charlie', 0); window.chatNew('alpha', 4); });
  assert.equal(await badge('bravo'), '8');
  assert.equal(await badge('charlie'), '', 'nothing new: no number');
  assert.equal(await badge('alpha'), '', 'the chat in the rail: you can see those');
  assert.match(await tab(page, 'bravo').getAttribute('title'), /^Show bravo's chat · 8 new messages$/);
  await page.evaluate(() => window.chatNew('charlie', 250));
  assert.equal(await badge('charlie'), '99+');
  await page.evaluate(() => window.raiseAlert('charlie', 'mention'));
  await page.waitForFunction(() => document.querySelector('#railTabs .rl-tab.at'));
  assert.equal(await badge('charlie'), '99+@');
  assert.match(await tab(page, 'charlie').getAttribute('title'), /something for you$/);
  // shown: read; the one that left starts from nothing
  await tab(page, 'bravo').click();
  assert.equal(await badge('bravo'), '');
  assert.equal(await badge('alpha'), '');
  // another layout keeps the counts until you can see the chat
  await press(page, 't');
  await settled(page);
  await page.evaluate(() => { window.chatNew('charlie', 0); window.chatNew('alpha', 2); });   // in Tile every chat is in sight
  await press(page, 'Shift+K');
  assert.equal((await badge('charlie')).replace('@', ''), '', 'charlie\'s 99+ was seen in Tile (its @ is the alert\'s, not ours)');
  assert.equal(await badge('alpha'), '');
});

test('Chat Rail: more tabs than fit scroll sideways, and the rail is never more than 40% of a narrow window', async t => {
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
  const page = await railOf(t, names, { width: 1000, height: 700 });
  const chat = await box(win(page, 'alpha', 'chat'));
  assert.ok(chat.w <= 400, `40% of the window at most (${chat.w})`);
  const list = await page.$eval('#railTabs .rl-list', l => [l.scrollWidth, l.clientWidth]);
  assert.ok(list[0] > list[1], 'the tabs are wider than the rail');
  assert.equal(await page.locator('#railTabs .rl-tab').count(), 8);
  // the tab of the chat shown is scrolled into sight
  await page.evaluate(() => window.showRailChat('hotel'));
  const inView = await page.$eval('#railTabs .rl-list', l => { const b = l.querySelector('.rl-tab.on'); return b.offsetLeft >= l.scrollLeft && b.offsetLeft + b.offsetWidth <= l.scrollLeft + l.clientWidth + 1; });
  assert.ok(inView);
  // the mouse wheel scrolls them
  await page.evaluate(() => { document.querySelector('#railTabs .rl-list').scrollLeft = 0; });
  await page.hover('#railTabs .rl-list');
  await page.mouse.wheel(0, 120);
  assert.ok(await page.$eval('#railTabs .rl-list', l => l.scrollLeft) > 0);
});

test('Chat Rail: opening and closing windows arranges it again, and other layouts take everything back', async t => {
  const page = await railOf(t, ['alpha', 'bravo']);
  await add(page, 'charlie'); await page.waitForTimeout(400);   // (the windows glide into place)
  assert.deepEqual(await look(page), { chat: ['alpha'], shown: ['alpha'], off: ['bravo', 'charlie'], tabs: ['[alpha]', 'bravo', 'charlie'] });
  // closing the chat in the rail: another one takes its place
  await page.click('#stage .win.rl-chat .bar [data-a=close]');
  const l = await look(page);
  assert.equal(l.chat.length, 1); assert.notEqual(l.chat[0], 'alpha');
  assert.equal(await page.locator('#stage .win.stream:has(.title:text-is("alpha")) .rl-show').count(), 0, 'no Show chat on a stream without a chat');
  // Tile: every window back in sight, no tabs, no outline, nothing scaled
  await press(page, 't');
  assert.deepEqual(await look(page), { chat: [], shown: [], off: [], tabs: (await look(page)).tabs });
  assert.equal(await page.isVisible('#railTabs'), false);
  assert.equal(await page.locator('.rl-show').count(), 0);
  assert.equal(await page.$$eval('#stage .win.chat .body > :first-child', l => l.filter(v => v.style.zoom).length), 0, 'no chat scaled');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#stage .win')].every(e => getComputedStyle(e).visibility === 'visible')));
  // and back, with Shift+K
  await press(page, 'Shift+K');
  assert.equal((await look(page)).chat.length, 1);
  // a saved layout keeps it
  await page.click('#layoutBtn'); await page.fill('#presetName', 'Rail'); await page.click('#presetSave'); await page.keyboard.press('Escape');
  await press(page, 'c');
  assert.deepEqual((await look(page)).chat, []);
  await page.click('#layoutBtn'); await page.click('#presetList .pr-load:has-text("Rail")'); await page.waitForTimeout(400);
  assert.equal((await look(page)).chat.length, 1, 'the saved layout is a Chat Rail');
});

test('Chat Rail: with the layout locked, closing a stream arranges the rail again', async t => {
  const page = await railOf(t, ['alpha', 'bravo', 'charlie']);
  await press(page, 'Shift+L');
  assert.ok(await page.evaluate(() => document.body.classList.contains('layout-locked')));
  const before = await box(win(page, 'charlie'));
  await page.click('#stage .win.stream:has(.title:text-is("bravo")) .bar [data-a=close]');
  await page.waitForTimeout(400);                                // (the windows glide into place)
  const after = await box(win(page, 'charlie')), chat = await box(win(page, 'alpha', 'chat'));
  assert.ok(after.w * after.h > before.w * before.h, `charlie takes bravo's room (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
  assert.ok(after.x + after.w < chat.x, 'still left of the rail');
  assert.deepEqual((await look(page)).chat, ['alpha']);
});

test('Chat Rail: without chats it tiles the streams instead', async t => {
  const page = await openApp(t, { width: 1400, height: 800 });
  await page.click('#savedBtn'); await page.selectOption('#mode', 'stream'); await page.click('#savedBtn');
  await add(page, 'alpha', 'bravo');
  await press(page, 'Shift+K');
  assert.deepEqual((await look(page)).chat, []);
  assert.equal(await page.isVisible('#railTabs'), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), 'tile');
});
