// Kick's /clip, /poll and /prediction in the real app: Kick chats get the helper that stops them (Twitch chats don't), and the
// chat window shows its copy of what Kick shows for them on the channel page: /poll its poll form, /prediction its prediction
// window, /clip makes the clip and shows Share Clip, each with the chat's login. Open channel page opens kick.com/<channel> with
// its sound off. kick.com and the chats are stand-ins (see app.js).
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

const signIn = () => a.app.evaluate(({ session }) => session.fromPartition('persist:kick').cookies.set({ url: 'https://kick.com', name: 'session_token', value: encodeURIComponent('42|tok') }));
const signOut = () => a.app.evaluate(({ session }) => session.fromPartition('persist:kick').cookies.remove('https://kick.com', 'session_token'));
const kickApi = answers => a.app.evaluate((_, answers) => { globalThis.__kickApi = answers; globalThis.__kickCalls = []; }, answers);
const kickCalls = () => a.app.evaluate(() => globalThis.__kickCalls.map(c => ({ ...c })));
const closeSiteWindows = re => a.app.evaluate(({ BrowserWindow }, re) => BrowserWindow.getAllWindows().filter(x => new RegExp(re).test(x.webContents.getURL())).forEach(x => x.close()), re);

test('/prediction in a Kick chat: Kick’s prediction window in the chat window; Start prediction starts it with the chat’s login', T, async () => {
  const w = a.win, P = `${winSel('alpha', 'chat')} .kpred`, API = 'https://kick.com/api/v2/channels/alpha';
  await openChannel(w, 'alpha');
  await viewLoaded(w, 'alpha', 'chat', /popout\/alpha\/chat/);
  await helper('alpha');
  await w.waitForFunction(() => {
    const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent === 'alpha')?.querySelector('webview');
    return v.executeJavaScript('!!window.__kmvKickCmd');
  });
  await signIn();
  const OK = data => ({ status: 200, body: { data, message: 'Success' } });
  await kickApi({ [`GET ${API}/channel-points/channel-settings`]: OK({ channel_points_enabled: true }), [`GET ${API}/predictions/latest`]: OK(null),
    [`GET ${API}/predictions/recent`]: OK({ predictions: [] }), [`GET ${API}/me`]: { status: 200, body: { is_moderator: true } },
    [`POST ${API}/predictions`]: OK({}) });

  assert.equal(await send('alpha', 'hello'), true, 'a normal message goes through');
  assert.equal(await send('alpha', '/prediction Will we win?'), false, '/prediction is not sent');
  await w.waitForSelector(`${P} [name="title"]`);
  assert.equal(await w.inputValue(`${P} [name="title"]`), 'Will we win?');
  assert.equal(await w.locator(P).evaluate(e => Math.abs(e.getBoundingClientRect().width - e.closest('.body').getBoundingClientRect().width) < 1), true, 'the chat’s full width');
  await w.fill(`${P} [name="option1"]`, 'Yes');
  await w.fill(`${P} [name="option2"]`, 'No');
  await w.click(`${P} .kpr-foot button:text-is("Start prediction")`);
  await w.waitForSelector(`${P} h3:text-is("Confirm prediction")`);
  await w.click(`${P} .kpr-foot button:text-is("Start prediction")`);
  await w.waitForSelector(P, { state: 'detached' });
  const sent = (await kickCalls()).filter(c => c.key.startsWith('POST'));
  assert.deepEqual(sent, [{ key: `POST ${API}/predictions`, auth: 'Bearer 42|tok', xsrf: null, body: { title: 'Will we win?', outcomes: ['Yes', 'No'], duration: 60 } }]);

  // Kick says no: the window says why, and Open channel page opens the channel muted
  await kickApi({ [`GET ${API}/channel-points/channel-settings`]: OK({ channel_points_enabled: true }), [`GET ${API}/predictions/latest`]: OK(null),
    [`POST ${API}/predictions`]: { status: 403, body: { message: 'Forbidden' } } });
  assert.equal(await send('alpha', '/prediction'), false);
  await w.waitForSelector(`${P} [name="title"]`);
  await w.fill(`${P} [name="title"]`, 'Again?');
  await w.fill(`${P} [name="option1"]`, 'Yes');
  await w.fill(`${P} [name="option2"]`, 'No');
  await w.click(`${P} .kpr-foot button:text-is("Start prediction")`);
  await w.click(`${P} .kpr-foot button:text-is("Start prediction")`);
  await w.waitForSelector(`${P} .kpr-fail:not([hidden])`);
  assert.equal(await w.textContent(`${P} .kpr-fail span`), 'Only the streamer and the channel’s moderators can start predictions.');
  assert.deepEqual(await siteWindows(), [], 'nothing opened yet');
  await w.click(`${P} .kpr-page`);
  let wins = [];
  for (let i = 0; i < 50 && !wins.length; i++) { await w.waitForTimeout(100); wins = await siteWindows(); }
  assert.deepEqual(wins, [{ url: 'https://kick.com/alpha', muted: true }]);
  await closeSiteWindows(PAGE.source);
  await signOut();
});

test('/clip in a Kick chat: the clip is made with the chat’s login (kick.com, then web.kick.com), then Share Clip', T, async () => {
  const w = a.win, C = `${winSel('alpha', 'chat')} .kclip`, WEB = 'https://web.kick.com/api/v1/clips';
  await signIn();
  await kickApi({ 'GET https://kick.com/api/v2/channels/alpha/info': { status: 200, body: { livestream: { vod_id: 'vod-1', session_title: 'Stream' } } },
    [`POST ${WEB}`]: { status: 200, body: { data: { id: 'clip_9', source_duration: 300 } } },
    [`POST ${WEB}/clip_9/finalize`]: { status: 200, body: { data: { id: 'clip_9', title: 'Great play', thumbnail_url: '' } } } });
  assert.equal(await send('alpha', '/clip 45 Great play'), false, '/clip is not sent');
  await w.waitForSelector(`${C} h3:text-is("Share Clip")`);
  assert.equal(await w.inputValue(`${C} .kcl-url input`), 'https://kick.com/alpha/clips/clip_9');
  assert.deepEqual(await kickCalls(), [
    { key: 'GET https://kick.com/api/v2/channels/alpha/info', auth: 'Bearer 42|tok', xsrf: null, body: null },
    { key: `POST ${WEB}`, auth: 'Bearer 42|tok', xsrf: null, body: { video_id: 'vod-1' } },
    { key: `POST ${WEB}/clip_9/finalize`, auth: 'Bearer 42|tok', xsrf: null, body: { title: 'Great play', trim_duration: 45, trim_start: 255 } }]);
  await w.click(`${C} .kcl-t:has-text("Download")`);
  const CLIP = /^https:\/\/kick\.com\/alpha\/clips\//;
  let wins = [];
  for (let i = 0; i < 50 && !wins.length; i++) {
    await w.waitForTimeout(100);
    wins = await a.app.evaluate(({ BrowserWindow }, re) => BrowserWindow.getAllWindows().filter(x => new RegExp(re).test(x.webContents.getURL()))
      .map(x => ({ url: x.webContents.getURL(), muted: x.webContents.isAudioMuted() })), CLIP.source);
  }
  assert.deepEqual(wins, [{ url: 'https://kick.com/alpha/clips/clip_9', muted: true }], 'Download: the clip’s page, muted');
  await closeSiteWindows(CLIP.source);
  await signOut();
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
