// Sending from ALL in the real app, on a chat you can't see: Twitch's as a hidden tab (ALL over Kick's chat), and
// Twitch's under ALL itself. Chromium draws the page of a view you can't see only about once a second (its
// requestAnimationFrame) once it's busy drawing, and Twitch's send waits on frames: the chat is drawn while ALL sends
// (windows/frames.js drawTab). The chats are stand-in pages (see app.js) given a Twitch-like box and an animation.
const test = require('node:test');
const { launchApp, assert } = require('../app');

const T = { timeout: 90000 };
let a;
test.before(async () => {
  a = await launchApp();
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true);
    window.linkedApi.link('quietkoala', 'tw:quietkoala');
    window.smvNotes.liveStatus({ quietkoala: { live: true, checked: Date.now() }, 'tw:quietkoala': { live: true, checked: Date.now() } });
    window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala']);
  });
  await a.win.waitForFunction(() => window.openWins().filter(w => w.kind === 'chat' && w.ready).length === 2, null, { timeout: 30000 });
  await a.win.evaluate(() => window.allChat.setAll(window.openWins().find(w => w.kind === 'chat' && !w.hiddenTab), true));
  await a.win.waitForSelector('.all-view');
  // send on Twitch
  await a.win.evaluate(() => localStorage.setItem('kickMultiview.allSend', JSON.stringify({ [window.linkedApi.listStreamers()[0].id]: 'tw:quietkoala' })));
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// In Twitch's chat page: something moving (the page keeps drawing, as Twitch's does), and a box with a send button
// whose press only sends after 6 frames (each press starts again), then empties the box.
const twitchPage = () => a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').view.executeJavaScript(`(() => {
  if (window.__sent) return;
  window.__sent = [];
  const d = document.createElement('div'); d.style.cssText = 'width:40px;height:40px;background:#9146ff';
  let i = 0; const spin = () => { d.style.transform = 'translateX(' + (i++ % 100) + 'px)'; requestAnimationFrame(spin); }; spin();
  const box = document.createElement('div'); box.contentEditable = 'true'; box.setAttribute('data-a-target', 'chat-input');
  const b = document.createElement('button'); b.setAttribute('data-a-target', 'chat-send-button');
  let press = 0;
  b.onclick = () => { const me = ++press; let n = 0; const f = () => { if (me !== press) return; if (++n < 6) return requestAnimationFrame(f); window.__sent.push(box.innerText.trim()); box.textContent = ''; }; requestAnimationFrame(f); };
  document.body.append(d, box, b);
})()`));
const framesIn = () => a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').view.executeJavaScript(
  'new Promise(r => { let n = 0; const f = () => { n++; requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(() => r(n), 1000); })'));
const sentIn = () => a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').view.executeJavaScript('window.__sent'));
const twitch = () => a.win.evaluate(() => { const w = window.openWins().find(x => x.channel === 'tw:quietkoala'); return { hiddenTab: !!w.hiddenTab, allOn: w.el.classList.contains('all-on'), drawn: w.el.classList.contains('tab-drawn') }; });

async function sendFromAll(text){
  await a.win.fill('.all-in', text);
  const start = Date.now();
  await a.win.press('.all-in', 'Enter');
  const mine = a.win.locator('.al-mine', { hasText: text });
  await mine.and(a.win.locator('.al-mine-sending')).waitFor();
  const during = await twitch();
  await mine.and(a.win.locator('.al-mine-sent, .al-mine-failed')).waitFor({ timeout: 15000 });
  const line = await mine.evaluate(e => e.className.replace(/.*al-mine-/, ''));
  return { line, ms: Date.now() - start, during, after: await twitch() };
}

test('a hidden tab (ALL over Kick\'s chat): Twitch\'s send that waits on frames goes, at once; the tab is drawn only while it sends', T, async () => {
  assert.deepEqual(await twitch(), { hiddenTab: true, allOn: false, drawn: false });
  await twitchPage();
  await a.win.waitForTimeout(3000);   // (Chromium slows a page it doesn't draw a moment after it starts drawing)
  console.log(`# frames in a second in the hidden tab, before: ${await framesIn()}`);
  const r = await sendFromAll('hello hidden tab'); console.log('# sent in ' + r.ms + ' ms');
  assert.equal(r.line, 'sent');
  assert.deepEqual(await sentIn(), ['hello hidden tab'], 'sent once');
  assert.ok(r.ms < 2500, `in ${r.ms} ms`);
  assert.equal(r.during.drawn, true, 'drawn while it sends');
  assert.equal(r.after.drawn, false, 'and not after');
  assert.equal(await a.win.evaluate(() => getComputedStyle(window.openWins().find(w => w.channel === 'tw:quietkoala').el).opacity), '0', 'unseen again');
  // drawn: its page gets its frames, as a shown one does
  await a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').el.classList.add('tab-drawn'));
  assert.equal(await a.win.evaluate(() => getComputedStyle(window.openWins().find(w => w.channel === 'tw:quietkoala').el).opacity), '0.01');
  const n = await framesIn();
  assert.ok(n >= 10, `${n} frames in a second`);
  await a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').el.classList.remove('tab-drawn'));
});

test('the chat under ALL (Twitch\'s tab shown, then ALL): its send goes too; drawn while it sends, under ALL', T, async () => {
  await a.win.evaluate(() => { const lead = window.openWins().find(w => w.kind === 'chat' && !w.hiddenTab); window.allChat.setAll(lead, false); window.frames_.showTab(window.openWins().find(w => w.channel === 'tw:quietkoala')); });
  await a.win.evaluate(() => window.allChat.setAll(window.openWins().find(w => w.channel === 'tw:quietkoala'), true));
  await a.win.waitForSelector('.all-view');
  assert.deepEqual(await twitch(), { hiddenTab: false, allOn: true, drawn: false });
  await a.win.waitForTimeout(3000);
  console.log(`# frames in a second under ALL, before: ${await framesIn()}`);
  const r = await sendFromAll('hello under all');
  assert.equal(r.line, 'sent');
  assert.deepEqual(await sentIn(), ['hello hidden tab', 'hello under all']);
  assert.ok(r.ms < 2500, `in ${r.ms} ms`);
  assert.equal(r.during.drawn, true);
  assert.equal(r.after.drawn, false);
  // while drawn, its view is see-through under ALL, which covers it
  await a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').el.classList.add('tab-drawn'));
  assert.deepEqual(await a.win.evaluate(() => { const w = window.openWins().find(x => x.channel === 'tw:quietkoala'), s = getComputedStyle(w.view); return [s.visibility, s.opacity, getComputedStyle(w.el.querySelector('.all-view')).backgroundColor]; }),
    ['visible', '0.01', 'rgb(10, 12, 13)']);
  const n = await framesIn();
  assert.ok(n >= 10, `${n} frames in a second`);
  await a.win.evaluate(() => window.openWins().find(w => w.channel === 'tw:quietkoala').el.classList.remove('tab-drawn'));
});
