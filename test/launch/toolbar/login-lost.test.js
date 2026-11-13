// A login a site has taken back (src/page/toolbar/login-lost.js), in the real desktop app: the app has the cookies, so
// it thinks you're logged in, but the site says no. Who's logged in and what the sites say are answered by the test
// (accounts:status, accounts:check); the chats are the tests' stand-in pages, given YouTube's "Sign in to chat".
const test = require('node:test');
const { launchApp, assert, openChannel } = require('../app');

const T = { timeout: 90000 };
let a;
test.before(async () => {
  a = await launchApp();
  // the real question first: no logins here, so there's nothing to ask (and a site that isn't one has no answer)
  assert.deepEqual(await a.win.evaluate(() => window.kmv.accountsCheck()), {});
  assert.deepEqual(await a.win.evaluate(() => window.kmv.accountsCheck('myspace')), {});
  await a.app.evaluate(({ ipcMain }) => {
    const s = globalThis.__t = { status: { kick: null, twitch: 'tw_user', youtube: true }, check: { twitch: true, youtube: true }, asked: [], logins: [] };
    ipcMain.removeHandler('accounts:status'); ipcMain.handle('accounts:status', () => s.status);
    ipcMain.removeHandler('accounts:check'); ipcMain.handle('accounts:check', (_e, p) => { s.asked.push(p || 'all');
      return Object.fromEntries(Object.entries(s.check).filter(([k]) => (!p || k === p) && s.status[k])); });
    ipcMain.removeHandler('account:login'); ipcMain.handle('account:login', (_e, p) => { s.logins.push(p); });
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const st = () => a.app.evaluate(() => globalThis.__t);
const set = (k, v) => a.app.evaluate((_electron, [k, v]) => { globalThis.__t[k] = v; }, [k, v]);
const row = p => `#accountMenu .am-row[data-p=${p}]`;
const bar = p => `#stage .win.chat.plat-${p} .login-lost`;
const lost = () => a.win.evaluate(() => window.loginLostTest.lostSites());
// the main process telling the page a login window closed (a new login) or a login was wiped
const accountChanged = info => a.app.evaluate(({ BrowserWindow }, info) => {
  BrowserWindow.getAllWindows().find(w => /index\.html/.test(w.webContents.getURL()) && !/role=streams/.test(w.webContents.getURL())).webContents.send('account:changed', info);
}, info);

test('a site that signed the app out: Logins says so with Sign in again and a dot, one notice, a bar in its chats; a new login clears it', T, async () => {
  await openChannel(a.win, 'tw:charlie', 'chat');
  await a.win.waitForSelector('#stage .win.chat.plat-twitch webview');
  await a.win.click('#loginBtn');
  await a.win.waitForFunction(() => /tw_user/.test(document.querySelector('#accountMenu .am-row[data-p=twitch] .am-st').textContent));
  await a.win.waitForFunction(() => window.loginLostTest && true);
  assert.deepEqual(await lost(), [], 'the sites take their logins: nothing to say');
  assert.ok(!(await a.win.$eval('#loginBtn', b => b.classList.contains('acct-lost'))));
  await a.win.keyboard.press('Escape');

  await set('check', { twitch: false, youtube: true });
  await a.win.evaluate(() => window.loginLostTest.checkLogins(null, { force: true }));
  assert.deepEqual(await lost(), ['twitch']);
  await a.win.click('#loginBtn');
  assert.equal(await a.win.textContent(row('twitch') + ' .am-st'), 'Signed out by Twitch');
  assert.equal(await a.win.textContent(row('twitch') + ' .am-in'), 'Sign in again');
  assert.ok(await a.win.isHidden(row('twitch') + ' .am-imp'), 'no Import follows: it can\'t read them now');
  assert.ok(await a.win.isHidden(row('twitch') + ' .am-sw'));
  assert.ok(await a.win.isVisible(row('twitch') + ' .am-out'), 'Log out is still there');
  assert.equal(await a.win.textContent(row('youtube') + ' .am-st'), 'Logged in', 'the other sites as they were');
  assert.ok(await a.win.$eval('#loginBtn', b => b.classList.contains('acct-lost')), 'the Logins button has its dot');
  assert.match(await a.win.$eval('#loginBtn', b => b.title || b.dataset.tipTitle), /Twitch has signed this app out/);
  await a.win.click(row('twitch') + ' .am-in');
  assert.deepEqual((await st()).logins, ['twitch'], 'Sign in again opens its login');

  // the bar in its chat window: Sign in again, ✕ hides it
  await a.win.waitForSelector(bar('twitch'));
  assert.equal(await a.win.textContent(bar('twitch') + ' .ll-t'), 'Signed out by Twitch');
  const top = await a.win.$eval('#stage .win.chat.plat-twitch', w => w.querySelector('webview').getBoundingClientRect().top - w.querySelector('.login-lost').getBoundingClientRect().bottom);
  assert.ok(Math.abs(top) < 2, 'the chat starts below it: nothing of it is hidden');
  await a.win.click(bar('twitch') + ' .ll-go');
  assert.deepEqual((await st()).logins, ['twitch', 'twitch']);

  // one notice under the bell (App), with Sign in again; asked again, it isn't said twice
  await a.win.evaluate(() => window.loginLostTest.checkLogins(null, { force: true }));
  await a.win.click('#bellBtn');
  await a.win.click('#bellPanel .nc-tabs [data-tab=app]');
  assert.equal(await a.win.locator('#bellList .nc-row:has-text("Twitch has signed this app out")').count(), 1);
  await a.win.click('#bellList .nc-row:has-text("Twitch has signed this app out") button:text-is("Sign in again")');
  assert.deepEqual((await st()).logins, ['twitch', 'twitch', 'twitch']);

  await a.win.click(bar('twitch') + ' .ll-x');
  assert.equal(await a.win.locator(bar('twitch')).count(), 0, '✕ hides it');
  assert.deepEqual(await lost(), ['twitch'], '... but the login is still lost: Logins still says so');

  // a new login (its login window closed): gone everywhere, the notice too
  await set('check', { twitch: true, youtube: true });
  await accountChanged({ platform: 'twitch', loggedOut: false });
  await a.win.waitForFunction(() => !window.loginLostTest.lostSites().length);
  await a.win.click('#loginBtn');
  await a.win.waitForFunction(() => /Logged in as tw_user/.test(document.querySelector('#accountMenu .am-row[data-p=twitch] .am-st').textContent));
  assert.ok(await a.win.isVisible(row('twitch') + ' .am-imp'));
  assert.ok(!(await a.win.$eval('#loginBtn', b => b.classList.contains('acct-lost'))));
  await a.win.keyboard.press('Escape');
  await a.win.click('#bellBtn');
  await a.win.click('#bellPanel .nc-tabs [data-tab=app]');
  assert.equal(await a.win.locator('#bellList .nc-row:has-text("Twitch has signed this app out")').count(), 0, 'its notice went with it');
  await a.win.click('#bellBtn');
});

test('a chat whose page shows you signed out (YouTube\'s "Sign in to chat"): the site is asked; it says the login works, so the chat loads once more; still signed out, it\'s lost', T, async () => {
  const signIn = () => a.win.evaluate(() => document.querySelector('#stage .win.chat.plat-youtube webview').executeJavaScript(
    `document.body.insertAdjacentHTML('beforeend', '<yt-live-chat-message-renderer><a href="https://accounts.google.com/ServiceLogin">Sign in to chat</a></yt-live-chat-message-renderer>'); true`));
  const loads = () => a.win.evaluate(() => document.querySelector('#stage .win.chat.plat-youtube webview').executeJavaScript('performance.timeOrigin'));
  const check = () => a.win.evaluate(async () => { const { wins } = await import('./page/core.js'); window.loginLostTest.chatLoginCheck(wins.find(w => w.kind === 'chat' && w.channel.startsWith('yt:'))); });
  await set('asked', []);
  await openChannel(a.win, 'https://www.youtube.com/live_chat?v=abcdefghijk', 'chat');
  await a.win.waitForSelector('#stage .win.chat.plat-youtube webview');
  await a.win.waitForFunction(() => { const v = document.querySelector('#stage .win.chat.plat-youtube webview'); try { return /live_chat/.test(v.getURL()) && !v.isLoading(); } catch { return false; } });
  await new Promise(r => setTimeout(r, 4500));   // (its page says neither: nothing asked)
  assert.deepEqual((await st()).asked, [], 'a page that can\'t say yet: the site isn\'t asked');

  await signIn();
  const first = await loads();
  await check();
  for (let i = 0; i < 100 && !(await st()).asked.length; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual((await st()).asked, ['youtube'], 'the site was asked');
  let again = first;
  for (let i = 0; i < 100 && again === first; i++){ await new Promise(r => setTimeout(r, 100)); again = await loads().catch(() => first); }
  assert.notEqual(again, first, 'its chat loaded again');
  assert.deepEqual(await lost(), [], 'it said the login works: the chat loaded again instead');

  // loaded again, it still shows you signed out: now it's lost (whatever the site says)
  await a.win.waitForFunction(() => { const v = document.querySelector('#stage .win.chat.plat-youtube webview'); try { return !v.isLoading(); } catch { return false; } });
  await signIn();
  await a.win.waitForFunction(() => window.loginLostTest.lostSites().includes('youtube'), null, { timeout: 15000 });
  assert.equal(await a.win.textContent(bar('youtube') + ' .ll-t'), 'Signed out by YouTube');

  // its chat box there again (signed in, after all): fine again
  await a.win.evaluate(() => document.querySelector('#stage .win.chat.plat-youtube webview').executeJavaScript(
    `document.querySelector('yt-live-chat-message-renderer').remove(); document.body.insertAdjacentHTML('beforeend', '<yt-live-chat-text-input-field-renderer><div id="input"></div></yt-live-chat-text-input-field-renderer>'); true`));
  await check();
  await a.win.waitForFunction(() => !window.loginLostTest.lostSites().length, null, { timeout: 15000 });
  assert.equal(await a.win.locator(bar('youtube')).count(), 0);
});

test('the site saying no while you send from ALL (no chat box), or Import follows told to log in: the same', T, async () => {
  await set('check', { twitch: true, youtube: false });
  await a.win.evaluate(() => window.loginLostTest.sendFoundNoBox('youtube'));
  await a.win.waitForFunction(() => window.loginLostTest.lostSites().includes('youtube'));
  await accountChanged({ platform: 'youtube', loggedOut: true });   // (logged out: not the login it took back)
  await a.win.waitForFunction(() => !window.loginLostTest.lostSites().length);
  await set('status', { kick: null, twitch: 'tw_user', youtube: true });
  await a.app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('follows:import'); ipcMain.handle('follows:import', () => ({ error: 'login' })); });
  await a.win.evaluate(() => window.importFollows('twitch'));
  await a.win.waitForFunction(() => window.loginLostTest.lostSites().includes('twitch'));
  assert.match(await a.win.textContent('#importDlg .dlg-sub'), /logged in to Twitch|signed this app out/);
});
