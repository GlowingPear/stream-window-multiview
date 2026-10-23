// Kick's /clip, /poll and /prediction in the real app: Kick chats get the helper that stops them (Twitch chats don't). For /clip
// and /prediction the chat window says so, and Open channel page opens kick.com/<channel> with its sound off; /poll opens a copy
// of Kick's poll form, which starts the poll with the chat's login. kick.com and the chats are stand-ins (see app.js).
const test = require('node:test');
const { launchApp, stubExists, inView, viewLoaded, winSel, assert, openChannel } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => { a = await launchApp(); await stubExists(a.app); });
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

test('/clip and /prediction in a Kick chat: the chat window asks, and Open channel page opens the channel muted; Cancel opens nothing', T, async () => {
  const w = a.win;
  await openChannel(w, 'alpha');
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

  assert.equal(await send('alpha', '/prediction'), false, '/prediction is not sent');
  await w.click(`${card} .kcmd-yes`);
  let wins = [];
  for (let i = 0; i < 50 && !wins.length; i++) { await w.waitForTimeout(100); wins = await siteWindows(); }
  assert.deepEqual(wins, [{ url: 'https://kick.com/alpha', muted: true }]);
  await a.app.evaluate(({ BrowserWindow }, re) => BrowserWindow.getAllWindows().filter(x => new RegExp(re).test(x.webContents.getURL())).forEach(x => x.close()), PAGE.source);
});

test('/poll in a Kick chat: Kick’s poll form in the chat window, the chat’s width; Create starts the poll with the chat’s login', T, async () => {
  const w = a.win, form = `${winSel('alpha', 'chat')} .kpoll`;
  await a.app.evaluate(({ session }) => { globalThis.__polls = []; globalThis.__pollAnswer = null;
    return session.fromPartition('persist:kick').cookies.set({ url: 'https://kick.com', name: 'session_token', value: encodeURIComponent('42|tok') }); });
  await w.waitForFunction(() => {
    const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent === 'alpha')?.querySelector('webview');
    return v && v.executeJavaScript('!!window.__kmvKickCmd');
  });
  assert.equal(await send('alpha', '/poll Pizza or tacos?'), false, '/poll is not sent');
  await w.waitForSelector(form);
  assert.equal(await w.inputValue(`${form} [name="subject"]`), 'Pizza or tacos?');
  assert.equal(await w.locator(form).evaluate(e => Math.abs(e.getBoundingClientRect().width - e.closest('.body').getBoundingClientRect().width) < 1), true, 'the chat’s full width');
  await w.fill(`${form} .kp-o input >> nth=0`, 'Pizza');
  await w.fill(`${form} .kp-o input >> nth=1`, 'Tacos');
  await w.click(`${form} .kp-create`);
  await w.waitForSelector(form, { state: 'detached' });
  const sent = await a.app.evaluate(() => globalThis.__polls);
  assert.deepEqual(sent.map(p => ({ ...p, body: JSON.parse(p.body) })), [{
    url: 'https://kick.com/api/v2/channels/alpha/polls', method: 'POST', auth: 'Bearer 42|tok', type: 'application/json',
    body: { duration: 30, result_display_duration: 15, options: ['Pizza', 'Tacos'], title: 'Pizza or tacos?' }
  }]);

  // Kick says no: the form stays, and says why
  await a.app.evaluate(() => { globalThis.__pollAnswer = { status: 403, body: { message: 'Forbidden' } }; });
  assert.equal(await send('alpha', '/poll'), false);
  await w.waitForSelector(form);
  await w.fill(`${form} [name="subject"]`, 'Again?');
  await w.fill(`${form} .kp-o input >> nth=0`, 'Yes');
  await w.fill(`${form} .kp-o input >> nth=1`, 'No');
  await w.click(`${form} .kp-create`);
  await w.waitForSelector(`${form} .kp-fail:not([hidden])`);
  assert.equal(await w.textContent(`${form} .kp-fail span`), 'Only the streamer and the channel’s moderators can start polls.');
  await w.click(`${form} .kp-cancel`);
  await a.app.evaluate(({ session }) => session.fromPartition('persist:kick').cookies.remove('https://kick.com', 'session_token'));
});

test('Twitch chats keep their own commands', T, async () => {
  const w = a.win;
  await openChannel(w, 'tw:bravo');
  await viewLoaded(w, 'bravo', 'chat', /popout\/bravo\/chat/);
  await helper('bravo');
  assert.equal(await inView(w, 'bravo', 'chat', () => !!window.__kmvKickCmd), false, 'no Kick helper');
  assert.equal(await send('bravo', '/clip'), true, 'sent as usual');
  await w.waitForTimeout(300);
  assert.equal(await w.locator('.kcmd').count(), 0, 'not asked');
});
