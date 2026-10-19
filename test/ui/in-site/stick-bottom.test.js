// Chats stay at their newest messages: the script inside a chat page (in-site/stick-bottom.js) on a stand-in chat in
// the app's own page (so its code counts for coverage). The site doesn't follow new messages here, as Kick and Twitch
// don't after their chat was out of sight; your own scrolling up to read is left alone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// A stand-in chat: a box of messages that scrolls, at its newest message; cfg is what the site module gives
async function chatOf(t, cfg = { list: '#sb-list' }, { reverse = false } = {}) {
  const page = await openApp(t);
  await page.evaluate(([cfg, reverse]) => {
    const box = document.createElement('div'); box.id = 'sb-list';
    Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '300px', height: '300px', overflowY: 'auto', zIndex: 99999, background: '#222' });
    if (reverse) Object.assign(box.style, { display: 'flex', flexDirection: 'column-reverse' });
    const say = n => { for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.textContent = 'message ' + box.children.length; d.style.height = '20px'; reverse ? box.prepend(d) : box.append(d); } };
    window.sbSay = say;
    say(60);
    document.body.append(box);
    box.scrollTop = reverse ? 0 : box.scrollHeight;
    window.stickAgent(cfg);
  }, [cfg, reverse]);
  return page;
}
// how far above its newest message the chat is
const gap = page => page.evaluate(() => { const b = document.getElementById('sb-list'); return Math.round(b.style.flexDirection ? Math.abs(b.scrollTop) : b.scrollHeight - b.clientHeight - b.scrollTop); });
const say = (page, n) => page.evaluate(n => window.sbSay(n), n);
// you scroll it yourself, with the wheel
const wheelBy = (page, dy) => page.evaluate(dy => { const b = document.getElementById('sb-list'); b.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: dy })); b.scrollTop += dy; }, dy);
const until = (page, fn) => page.waitForFunction(fn, null, { timeout: 4000 });

test('a chat at its newest messages follows new ones the site left below, within a second', async t => {
  const page = await chatOf(t);
  await say(page, 20);
  assert.ok(await gap(page) > 100, 'the site left it behind');
  await until(page, () => { const b = document.getElementById('sb-list'); return b.scrollHeight - b.clientHeight - b.scrollTop <= 2; });
  assert.deepEqual(await page.evaluate(() => window.__kmvStick.state()), { follow: true, atBottom: true });
  assert.equal(await page.evaluate(() => window.stickAgent({})), true, 'started once');
});

test('scrolling up to read is left alone; scrolling back down follows again; now() goes to the newest at once', async t => {
  const page = await chatOf(t);
  await wheelBy(page, -400);
  const at = await page.$eval('#sb-list', b => b.scrollTop);
  await say(page, 20);
  await page.waitForTimeout(1500);
  assert.equal(await page.$eval('#sb-list', b => b.scrollTop), at, 'where you left it');
  assert.equal((await page.evaluate(() => window.__kmvStick.state())).follow, false);
  // back down by yourself: it follows again
  await wheelBy(page, 5000);
  await say(page, 10);
  await until(page, () => { const b = document.getElementById('sb-list'); return b.scrollHeight - b.clientHeight - b.scrollTop <= 2; });
  // switched to it (Chat Stage, Chat Rail): the newest at once, even when you were reading further up
  await wheelBy(page, -400);
  await page.evaluate(() => window.__kmvStick.now());
  await until(page, () => { const b = document.getElementById('sb-list'); return b.scrollHeight - b.clientHeight - b.scrollTop <= 2; });
  assert.equal((await page.evaluate(() => window.__kmvStick.state())).follow, true);
});

test('with the pointer over the chat it waits (Twitch holds its chat still for reading); now() still works', async t => {
  const page = await chatOf(t);
  await page.mouse.move(150, 150);
  await say(page, 20);
  await page.waitForTimeout(1500);
  assert.ok(await gap(page) > 100, 'still, while you point at it');
  await page.evaluate(() => window.__kmvStick.now());
  await until(page, () => { const b = document.getElementById('sb-list'); return b.scrollHeight - b.clientHeight - b.scrollTop <= 2; });
});

test('the site\'s own "back to the newest" button is pressed; a list drawn bottom-up; no list given: the biggest box that scrolls', async t => {
  // the button
  let page = await chatOf(t, { list: '#sb-list', resume: '#sb-resume' });
  await page.evaluate(() => { const b = document.createElement('button'); b.id = 'sb-resume'; b.textContent = 'Chat paused'; b.onclick = () => { window.sbResumed = (window.sbResumed || 0) + 1; b.remove(); }; document.body.append(b); });
  await page.evaluate(() => window.__kmvStick.now());
  await until(page, () => window.sbResumed === 1);
  // bottom-up (column-reverse): the newest at 0
  page = await chatOf(t, { list: '#sb-list' }, { reverse: true });
  await page.$eval('#sb-list', b => { b.scrollTop = -300; });
  await page.evaluate(() => window.__kmvStick.now());
  await until(page, () => Math.abs(document.getElementById('sb-list').scrollTop) <= 2);
  // the site's list isn't there (a redesign): the biggest box that scrolls
  page = await chatOf(t, { list: '#not-there' });
  await say(page, 20);
  await page.evaluate(() => window.__kmvStick.now());
  await until(page, () => { const b = document.getElementById('sb-list'); return b.scrollHeight - b.clientHeight - b.scrollTop <= 2; });
});
