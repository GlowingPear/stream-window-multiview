// The empty stage in the real app (#53): Welcome's logins and Import follows, and the Launchpad's saved
// channels that are live now. Who's logged in and who's live are answered by the test.
const test = require('node:test');
const { launchApp, assert } = require('../../app');

const T = { timeout: 60000 };
let a;
test.before(async () => {
  a = await launchApp({ storage: { 'kickMultiview.intro': '{"tips":true}' } });
  await a.app.evaluate(({ ipcMain, BrowserWindow }) => {
    const s = globalThis.__t = { kick: '', twitch: 'tw_user', youtube: false, logins: [], imports: [] };
    ipcMain.removeHandler('me:detect'); ipcMain.handle('me:detect', () => s.kick || null);
    ipcMain.removeHandler('accounts:status'); ipcMain.handle('accounts:status', () => ({ kick: s.kick || null, twitch: s.twitch || null, youtube: s.youtube }));
    ipcMain.removeHandler('account:login'); ipcMain.handle('account:login', (_e, p) => { s.logins.push(p); });
    ipcMain.removeHandler('follows:import'); ipcMain.handle('follows:import', (_e, p) => { s.imports.push(p); return { login: true }; });
    const wc = BrowserWindow.getAllWindows().find(w => /index\.html/.test(w.webContents.getURL()) && !/role=streams/.test(w.webContents.getURL())).webContents;
    const send = wc.send.bind(wc);
    wc.send = (ch, ...args) => { if (ch !== 'live:status') send(ch, ...args); };
    globalThis.__sendLive = snap => send('live:status', snap);
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });
const st = () => a.app.evaluate(() => globalThis.__t);

test('Welcome: each site\'s login, Log in opens it, and Import follows starts the import', T, async () => {
  const w = a.win;
  await w.waitForSelector('#empty .es-first:not([hidden])');
  await w.click('#loginBtn'); await w.keyboard.press('Escape');                  // the app asks who's logged in
  await w.waitForFunction(() => /Logged in as tw_user/.test(document.querySelector('#empty .es-accts').textContent));
  assert.match(await w.textContent('#empty .es-acct:nth-child(1)'), /Kick\s*Not logged in\s*Log in/);
  assert.equal(await w.locator('#empty .es-acct:nth-child(2) [data-login]').count(), 0, 'no Log in when logged in');
  await w.click('#empty .es-acct [data-login=kick]');
  assert.deepEqual((await st()).logins, ['kick']);
  await w.click('#empty .es-imp [data-imp=twitch]');
  for (let i = 0; i < 50 && !(await st()).imports.length; i++) await w.waitForTimeout(100);
  assert.deepEqual((await st()).imports, ['twitch']);
  await w.keyboard.press('Escape');
  const cards = await w.$$eval('#empty .es-learn .es-card', e => e.map(c => c.dataset.id));
  assert.ok(['profiles', 'capture', 'extensions'].every(id => cards.includes(id)), 'the desktop-only features have cards: ' + cards);
});

test('the Launchpad: saved channels that are live now, opened one by one, all at once, or as a Focus view', T, async () => {
  const w = a.win;
  await w.evaluate(() => { localStorage.setItem('kickMultiview.saved', JSON.stringify(['alpha', 'bravo', 'tw:charlie'])); localStorage.setItem('kickMultiview.intro', '{"done":true,"tips":true}'); });
  await w.reload(); await w.waitForSelector('#empty .es-pad:not([hidden])');
  const live = (on) => a.app.evaluate((_, on) => globalThis.__sendLive({
    alpha: { live: on, title: 'Speedruns <b>tonight</b>', viewers: 4812, category: 'Hollow Run', name: 'alpha', checked: Date.now() },
    bravo: { live: false, title: '', viewers: null, category: '', name: 'bravo', checked: Date.now() },
    'tw:charlie': { live: on, title: 'Cozy farming', viewers: 120, category: 'Farm', name: 'charlie', checked: Date.now() }
  }), on);
  await live(true);
  await w.waitForSelector('#empty .es-lc');
  assert.match(await w.textContent('#empty .es-live-h'), /Live now · 2/);
  assert.deepEqual(await w.$$eval('#empty .es-lc', e => e.map(c => c.dataset.ch)), ['alpha', 'tw:charlie']);
  assert.match(await w.textContent('#empty .es-lc[data-ch=alpha]'), /Hollow Run · Speedruns <b>tonight<\/b>\s*4\.8K/, 'the title stays text');
  await w.click('#empty .es-lc[data-ch=alpha]');
  await w.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 1);
  await w.evaluate(() => document.querySelectorAll('#stage .win [data-a=close]').forEach(b => b.click()));
  await w.waitForSelector('#empty .es-pad:not([hidden])');
  await w.click('#empty .es-live [data-all=focus]');
  await w.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 2);
  await w.waitForFunction(() => document.body.classList.contains('cols'), null, { timeout: 5000 });
  await w.evaluate(() => document.querySelectorAll('#stage .win [data-a=close]').forEach(b => b.click()));
  await w.click('#empty .es-live [data-all=open]');
  await w.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 2);
  await w.evaluate(() => document.querySelectorAll('#stage .win [data-a=close]').forEach(b => b.click()));
  // nobody live: say so
  await live(false);
  await w.waitForFunction(() => /None of your saved channels are live/.test(document.querySelector('#empty .es-live').textContent));
});
