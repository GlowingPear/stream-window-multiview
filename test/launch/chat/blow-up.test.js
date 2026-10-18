// Blow up chat on click in the real app: with the switch on, clicking into a chat lifts it big with bigger text,
// and Esc pressed inside the chat page (where the keyboard is) puts it back at the normal text size. Chromium shares
// a page's zoom between every page of the same site, so only the blown-up chat's own view is scaled: another chat
// of the same site stays as it is.
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');

let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await openChannel(a.win, 'bravo');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  await viewLoaded(a.win, 'bravo', 'chat', /popout\/bravo\/chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// how big a chat page is drawn (its zoom times its view's scale), as the page itself sees it
const drawn = ch => inView(a.win, ch, 'chat', () => devicePixelRatio);
async function near(ch, want, what){
  for (let i = 0; i < 30 && Math.abs(await drawn(ch).catch(() => 0) - want) > 0.005; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal((await drawn(ch)).toFixed(2), want.toFixed(2), what);
}
const blown = () => a.win.evaluate(() => !!document.querySelector('#stage .win.chat.blown'));
// a real click into alpha's chat page (from Electron 44 on, a <webview> has no focus event: the app hears the press)
// (where it is once it has stopped moving: it slides back after being blown up)
const clickIntoChat = async () => {
  const at = () => a.win.evaluate(() => { const b = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent === 'alpha').querySelector('webview').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; });
  let p = await at();
  for (let i = 0; i < 30; i++) { await a.win.waitForTimeout(100); const q = await at(); if (q.x === p.x && q.y === p.y) break; p = q; }
  await a.win.mouse.click(p.x, p.y);
};

test('Blow up chat: clicking into a chat blows it up only with the switch on, and Esc in the chat puts it back', { timeout: 60000 }, async () => {
  await a.win.waitForFunction(() => document.querySelector('#stage .win.chat') && document.querySelector('#stage .win.chat webview'));
  await a.win.waitForTimeout(1200);              // (a click just after it opened is the app's own focus, not yours)
  await clickIntoChat();
  await a.win.waitForTimeout(200);
  assert.equal(await blown(), false, 'off: a click into a chat does nothing more');
  await near('alpha', 1, 'off: as it was');

  await a.win.evaluate(() => document.activeElement.blur());
  await a.win.keyboard.press('f');               // Focus view, for the switch control
  await a.win.click('#featSwitch .fs-blow');
  await clickIntoChat();
  await a.win.waitForFunction(() => !!document.querySelector('#stage .win.chat.blown'));
  await near('alpha', 1.75, 'bigger text');
  await near('bravo', 1, 'the other chat of the same site stays as it is');
  assert.equal(await a.win.textContent('#blowBar .bb-name'), 'alpha');

  // Esc inside the chat page: it tells the app, which puts the chat back
  for (let i = 0; i < 50 && !(await inView(a.win, 'alpha', 'chat', () => !!window.__kmvBlowEsc).catch(() => false)); i++) await new Promise(r => setTimeout(r, 100));
  await inView(a.win, 'alpha', 'chat', () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await a.win.waitForFunction(() => !document.querySelector('#stage .win.chat.blown'));
  await near('alpha', 1, 'back to the normal text size');
  assert.equal(await blown(), false);

  // and a click into it again blows it up again
  await clickIntoChat();
  await a.win.waitForFunction(() => !!document.querySelector('#stage .win.chat.blown'));
  await a.win.click('#blowBar .bb-back');
  assert.equal(await blown(), false);
});
