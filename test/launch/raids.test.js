// Raids in the real app: Kick's pop-out chat moves to the raided channel's page (a whole page load, or
// in-page like Kick's site does), and the stream and chat follow, in this window and in the Streams window.
// The chats and players are stand-in pages (see app.js).
const test = require('node:test');
const { launchApp, inView, viewLoaded, winSel, assert, openChannel } = require('./app');

const T = { timeout: 90000 };
let a;
test.before(async () => { a = await launchApp(); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const add = async (...links) => { for (const l of links) await openChannel(a.win, l); };
const titles = (page, kind) => page.$$eval(`#stage .win.${kind}`, l => l.map(e => e.querySelector('.title').textContent).sort());
const src = (page, title, kind) => page.$eval(`${winSel(title, kind)} webview`, v => v.getAttribute('src'));

test('a raid in the chat moves the stream and chat to the raided channel; its own page goes back to the chat', T, async () => {
  const w = a.win;
  await add('alpha', 'zulu');
  await viewLoaded(w, 'alpha', 'chat', /popout\/alpha\/chat/);
  // Kick loads the raided channel's page in the chat
  await inView(w, 'alpha', 'chat', () => { location.href = 'https://kick.com/bravo'; });
  await w.waitForSelector(`${winSel('bravo', 'chat')} webview`);
  await w.waitForSelector(`${winSel('bravo', 'stream')} webview`);
  assert.deepEqual(await titles(w, 'stream'), ['bravo', 'zulu']);
  assert.deepEqual(await titles(w, 'chat'), ['bravo', 'zulu']);
  assert.match(await src(w, 'bravo', 'chat'), /^https:\/\/kick\.com\/popout\/bravo\/chat$/, 'the pop-out chat, not the page');
  assert.match(await src(w, 'bravo', 'stream'), /^https:\/\/player\.kick\.com\/bravo\?/);
  assert.match(await w.textContent('#msg'), /alpha raided bravo/);

  // in-page, as Kick's site moves between pages
  await viewLoaded(w, 'bravo', 'chat', /popout\/bravo\/chat/);
  await inView(w, 'bravo', 'chat', () => { history.pushState({}, '', '/charlie'); });
  await w.waitForSelector(`${winSel('charlie', 'stream')} webview`);
  assert.deepEqual(await titles(w, 'chat'), ['charlie', 'zulu']);

  // its own channel's page: back to the pop-out chat; a page that isn't a channel: left alone
  await viewLoaded(w, 'charlie', 'chat', /popout\/charlie\/chat/);
  await inView(w, 'charlie', 'chat', () => { location.href = 'https://kick.com/charlie'; });
  await viewLoaded(w, 'charlie', 'chat', /^https:\/\/kick\.com\/popout\/charlie\/chat$/);
  await inView(w, 'charlie', 'chat', () => { location.href = 'https://kick.com/login'; });
  await viewLoaded(w, 'charlie', 'chat', /kick\.com\/login/);
  await w.waitForTimeout(500);
  assert.deepEqual(await titles(w, 'stream'), ['charlie', 'zulu']);
});

test('with the streams popped out, the Streams window follows the raid too', T, async () => {
  const w = a.win;
  await add('delta');
  await w.click('#popBtn');
  let sw = null;
  for (let i = 0; i < 100 && !sw; i++) { sw = a.app.windows().find(p => /role=streams/.test(p.url())); if (!sw) await w.waitForTimeout(100); }
  await sw.waitForFunction(() => [...document.querySelectorAll('#stage .win.stream .title')].some(t => t.textContent === 'delta'));
  await viewLoaded(w, 'delta', 'chat', /popout\/delta\/chat/);
  await inView(w, 'delta', 'chat', () => { location.href = 'https://kick.com/echo'; });
  await w.waitForSelector(`${winSel('echo', 'chat')} webview`);
  await sw.waitForFunction(() => [...document.querySelectorAll('#stage .win.stream .title')].some(t => t.textContent === 'echo'));
  assert.ok(!(await titles(sw, 'stream')).includes('delta'));
  await w.evaluate(() => window.kmv.closeStreams());
});
