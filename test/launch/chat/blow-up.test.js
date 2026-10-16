// Blow up chat on click in the real app: with the switch on, clicking into a chat lifts it big with bigger text,
// and Esc pressed inside the chat page (where the keyboard is) puts it back at the normal text size.
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');

let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// the chat page's text size, as the app set it
const chatZoom = () => a.app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => /popout\/alpha\/chat/.test(w.getURL())).getZoomFactor());
const blown = () => a.win.evaluate(() => !!document.querySelector('#stage .win.chat.blown'));
const clickIntoChat = () => a.win.evaluate(() => { const v = document.querySelector('#stage .win.chat webview'); v.blur(); v.focus(); });

test('Blow up chat: clicking into a chat blows it up only with the switch on, and Esc in the chat puts it back', { timeout: 60000 }, async () => {
  await a.win.waitForFunction(() => document.querySelector('#stage .win.chat') && document.querySelector('#stage .win.chat webview'));
  await a.win.waitForTimeout(1200);              // (a click just after it opened is the app's own focus, not yours)
  await clickIntoChat();
  await a.win.waitForTimeout(200);
  assert.equal(await blown(), false, 'off: a click into a chat does nothing more');
  assert.equal(await chatZoom(), 1);

  await a.win.evaluate(() => document.activeElement.blur());
  await a.win.keyboard.press('f');               // Focus view, for the switch control
  await a.win.click('#featSwitch .fs-blow');
  await clickIntoChat();
  await a.win.waitForFunction(() => !!document.querySelector('#stage .win.chat.blown'));
  assert.equal((await chatZoom()).toFixed(2), '1.75', 'bigger text');
  assert.equal(await a.win.textContent('#blowBar .bb-name'), 'alpha');

  // Esc inside the chat page: it tells the app, which puts the chat back
  for (let i = 0; i < 50 && !(await inView(a.win, 'alpha', 'chat', () => !!window.__kmvBlowEsc).catch(() => false)); i++) await new Promise(r => setTimeout(r, 100));
  await inView(a.win, 'alpha', 'chat', () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await a.win.waitForFunction(() => !document.querySelector('#stage .win.chat.blown'));
  assert.equal(await chatZoom(), 1, 'back to the normal text size');
  assert.equal(await blown(), false);

  // and a click into it again blows it up again
  await clickIntoChat();
  await a.win.waitForFunction(() => !!document.querySelector('#stage .win.chat.blown'));
  await a.win.click('#blowBar .bb-back');
  assert.equal(await blown(), false);
});
