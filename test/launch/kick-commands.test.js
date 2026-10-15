// Kick's /clip, /poll and /prediction in the real app: Kick chats get the helper that stops them (Twitch chats don't), the chat
// window says so, and Open channel page opens kick.com/<channel> with its sound off. kick.com and the chats are stand-ins (see app.js).
const test = require('node:test');
const { launchApp, inView, viewLoaded, winSel, assert } = require('./app');

const T = { timeout: 60000 };
let a;
test.before(async () => { a = await launchApp(); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const helper = (title) => a.win.waitForFunction(title => {
  const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent === title)?.querySelector('webview');
  return v && v.executeJavaScript('!!window.__kmvEmote');      // loaded with the other chat helpers
}, title);
// Type a message in the stand-in chat and press Enter; returns whether the chat page got the Enter.
const send = (title, text) => inView(a.win, title, 'chat', text => {
  let box = document.querySelector('[contenteditable="true"]');
  if (!box) { box = document.createElement('div'); box.contentEditable = 'true'; document.body.append(box); }
  box.innerText = text; box.focus();
  let got = false; const own = () => { got = true; };
  box.addEventListener('keydown', own);
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  box.removeEventListener('keydown', own);
  return got;
}, text);
// Channel pages open in their own windows (not the app's hidden kick.com/robots.txt helper)
const PAGE = /^https:\/\/kick\.com\/(?!robots\.txt)[^/]+$/;
const siteWindows = () => a.app.evaluate(({ BrowserWindow }, re) => BrowserWindow.getAllWindows()
  .filter(w => new RegExp(re).test(w.webContents.getURL())).map(w => ({ url: w.webContents.getURL(), muted: w.webContents.isAudioMuted() })), PAGE.source);

test('/clip and /poll in a Kick chat: the chat window asks, and Open channel page opens the channel muted; Cancel opens nothing', T, async () => {
  const w = a.win;
  await w.fill('#url', 'alpha'); await w.click('#add');
  await viewLoaded(w, 'alpha', 'chat', /popout\/alpha\/chat/);
  await helper('alpha');
  await w.waitForFunction(() => {
    const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent === 'alpha')?.querySelector('webview');
    return v.executeJavaScript('!!window.__kmvKickCmd');
  });

  assert.equal(await send('alpha', 'hello'), true, 'a normal message goes through');
  assert.equal(await send('alpha', '/clip 30 Big play'), false, '/clip is not sent');
  const card = `${winSel('alpha', 'chat')} .kcmd`;
  await w.waitForSelector(card);
  assert.equal(await w.textContent(`${card} h3`), '/clip doesn’t work in this chat');
  await w.click(`${card} .kcmd-no`);
  await w.waitForTimeout(500);
  assert.deepEqual(await siteWindows(), [], 'Cancel: nothing left open');

  assert.equal(await send('alpha', '/poll'), false, '/poll is not sent');
  await w.click(`${card} .kcmd-yes`);
  let wins = [];
  for (let i = 0; i < 50 && !wins.length; i++) { await w.waitForTimeout(100); wins = await siteWindows(); }
  assert.deepEqual(wins, [{ url: 'https://kick.com/alpha', muted: true }]);
  await a.app.evaluate(({ BrowserWindow }, re) => BrowserWindow.getAllWindows().filter(x => new RegExp(re).test(x.webContents.getURL())).forEach(x => x.close()), PAGE.source);
});

test('Twitch chats keep their own commands', T, async () => {
  const w = a.win;
  await w.fill('#url', 'https://www.twitch.tv/bravo'); await w.click('#add');
  await viewLoaded(w, 'bravo', 'chat', /popout\/bravo\/chat/);
  await helper('bravo');
  assert.equal(await inView(w, 'bravo', 'chat', () => !!window.__kmvKickCmd), false, 'no Kick helper');
  assert.equal(await send('bravo', '/clip'), true, 'sent as usual');
  await w.waitForTimeout(300);
  assert.equal(await w.locator('.kcmd').count(), 0, 'not asked');
});
