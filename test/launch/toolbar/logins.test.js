// What happens to logins and links: "Forget my login" really wipes a site's login when the app closes (and
// only that site's), and links clicked inside a chat open in the app (Kick, sign-in pages) or in your browser.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, inView, viewLoaded, assert, openChannel } = require('../app');

const T = { timeout: 90000 };

test('"Forget my login": that site\'s login is wiped when the app closes, the others are kept', T, async () => {
  let a = await launchApp();
  const data = a.data;
  await a.app.evaluate(async ({ session }) => {
    await session.fromPartition('persist:twitch').cookies.set({ url: 'https://www.twitch.tv', name: 'login', value: 'someone', expirationDate: Date.now() / 1000 + 86400 });
    await session.fromPartition('persist:kick').cookies.set({ url: 'https://kick.com', name: 'session_token', value: 'abc', expirationDate: Date.now() / 1000 + 86400 });
    for (const p of ['persist:twitch', 'persist:kick']) await session.fromPartition(p).cookies.flushStore();
  });
  await a.win.evaluate(() => window.kmv.securitySetForget('twitch', true));
  assert.deepEqual(a.errors, []);
  await a.close();
  const secFile = path.join(data, 'Stream Multiview', 'security.json');
  assert.equal(JSON.parse(fs.readFileSync(secFile, 'utf8')).wiped, true, 'it noted the wipe, so the next start needn\'t wipe again');

  a = await launchApp({ data });
  try {
    const cookies = await a.app.evaluate(async ({ session }) => ({
      twitch: (await session.fromPartition('persist:twitch').cookies.get({})).map(c => c.name),
      kick: (await session.fromPartition('persist:kick').cookies.get({ name: 'session_token' })).map(c => c.value)
    }));
    assert.deepEqual(cookies.twitch, [], 'the Twitch login is gone');
    assert.deepEqual(cookies.kick, ['abc'], 'the Kick login is kept');
    assert.equal((await a.win.evaluate(() => window.kmv.securityGet())).forget.twitch, true, 'and the choice is remembered');
    assert.equal(JSON.parse(fs.readFileSync(secFile, 'utf8')).wiped, false, 'logins saved from now on are still to be wiped');
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});

test('links in a chat: Kick pages open in the app with the same login, anything else in your browser', T, async () => {
  const a = await launchApp();
  try {
    await a.app.evaluate(({ shell }) => { globalThis.__ext = []; shell.openExternal = url => { globalThis.__ext.push(url); return Promise.resolve(); }; });
    await openChannel(a.win, 'alpha', 'chat');
    await viewLoaded(a.win, 'alpha', 'chat', /chat/);
    await inView(a.win, 'alpha', 'chat', () => { window.open('https://kick.com/someone'); window.open('https://example.com/clip'); });
    let wins = [];
    for (let i = 0; i < 50 && !wins.length; i++) {
      wins = await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.webContents.getURL()).filter(u => /kick\.com\/someone/.test(u)));
      await new Promise(r => setTimeout(r, 100));
    }
    assert.deepEqual(wins, ['https://kick.com/someone'], 'a Kick link opens in an app window');
    assert.deepEqual(await a.app.evaluate(() => globalThis.__ext), ['https://example.com/clip'], 'other links open in the browser');
    await a.win.evaluate(() => window.kmv.openExternal('javascript:alert(1)'));
    assert.deepEqual(await a.app.evaluate(() => globalThis.__ext), ['https://example.com/clip'], 'only web links');
    assert.deepEqual(a.errors, []);
  } finally { await a.close(); }
});
