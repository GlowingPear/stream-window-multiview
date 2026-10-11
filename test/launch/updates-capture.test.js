// Updates (Settings > Updates and the banner) and showing another app's window, in the real desktop app.
// The update status and the list of other windows are stand-ins; nothing is downloaded or captured.
const test = require('node:test');
const { launchApp, winSel, assert } = require('./app');

const T = { timeout: 60000 };
let a;
test.before(async () => {
  a = await launchApp();
  await a.app.evaluate(({ ipcMain }) => {
    const s = globalThis.__u = { status: { current: '0.2.17', repo: 'o/r', auto: true, lastCheck: Date.now(), state: 'uptodate', latest: '0.2.17', platform: process.platform }, settings: [], restarts: 0 };
    ipcMain.removeHandler('update:status'); ipcMain.handle('update:status', () => s.status);
    ipcMain.removeHandler('update:settings'); ipcMain.handle('update:settings', (_e, d) => { s.settings.push(d); Object.assign(s.status, d); return s.status; });
    ipcMain.removeHandler('update:restart'); ipcMain.handle('update:restart', () => { s.restarts++; return { needsInstall: true }; });
    ipcMain.removeHandler('update:check'); ipcMain.handle('update:check', () => s.status);
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });
const status = extra => a.app.evaluate(({ BrowserWindow }, extra) => { Object.assign(globalThis.__u.status, extra); BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:status', globalThis.__u.status)); }, extra);

test('Settings > Updates: change the GitHub page, switch automatic updates off, and restart for a downloaded update', T, async () => {
  await status({});
  await a.win.evaluate(() => window.openSettings('updates'));
  await a.win.waitForSelector('.upd-repo input');
  assert.equal(await a.win.inputValue('.upd-repo input'), 'o/r');
  await a.win.fill('.upd-repo input', 'someone/fork');
  await a.win.press('.upd-repo input', 'Enter');
  await a.win.uncheck('.upd-auto');
  const s = await a.app.evaluate(() => globalThis.__u.settings);
  assert.deepEqual(s, [{ repo: 'someone/fork' }, { auto: false }]);
  await status({ state: 'ready', installed: '0.2.18', latest: '0.2.18', installed_app: false });
  await a.win.click('.upd-restart');
  assert.equal(await a.app.evaluate(() => globalThis.__u.restarts), 1);
  assert.match(await a.win.textContent('#msg'), /start it again with your shortcut/, 'says what to do next');
  await a.win.keyboard.press('Escape');
});

test('the banner: a downloaded update offers Restart, and Later hides it for this session', T, async () => {
  await a.win.evaluate(() => sessionStorage.clear());
  await status({ state: 'ready', installed: '0.2.19', installed_app: false, needsInstall: false });
  await a.win.waitForSelector('#updBanner:not([hidden])');
  assert.match(await a.win.textContent('#updBanner .ub-txt'), /0\.2\.19 is ready\. Restart to use it/);
  await a.win.click('#updBanner .ub-go');
  assert.equal(await a.app.evaluate(() => globalThis.__u.restarts), 2);
  await a.win.click('#updBanner .ub-later');
  assert.ok(await a.win.isHidden('#updBanner'));
  await status({ state: 'ready', installed: '0.2.19' });
  await a.win.waitForTimeout(200);
  assert.ok(await a.win.isHidden('#updBanner'), 'not again for the same version');
});

test('the first start after an update shows What\'s new', T, async () => {
  await a.win.evaluate(() => localStorage.setItem('kickMultiview.seenVersion', '0.0.1'));
  await a.win.reload();
  await a.win.waitForSelector('#settingsDlg:not([hidden])', { timeout: 6000 });
  assert.equal(await a.win.$eval('#settingsDlg .st-rail .on', e => e.dataset.s), 'updates');
  assert.match(await a.win.textContent('#msg'), /Updated to version/);
  await a.win.keyboard.press('Escape');
});

test('show another app\'s window: pick it, it plays as a live picture, pause it, pick another, close it', T, async () => {
  await a.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('capture:sources');
    ipcMain.handle('capture:sources', () => [
      { id: 'screen:1', name: 'Screen 1', screen: true, thumb: '', icon: '' },
      { id: 'window:2', name: 'Some app', screen: false, thumb: '', icon: '' },
      { id: 'window:3', name: 'Discord call', screen: false, thumb: '', icon: '' }
    ]);
  });
  // a picture to show, instead of a real window
  await a.win.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random() * 1e6).toString().padStart(6, '0'); g.fillRect(0, 0, 320, 180); }, 100); return c.captureStream(10); };
  });
  await a.win.keyboard.press('w');
  await a.win.waitForSelector('#capDlg:not([hidden]) .cap-item');
  assert.deepEqual(await a.win.$$eval('#capDlg .cap-item .nm span', l => l.map(x => x.textContent)), ['Discord call', 'Some app', 'Whole screen: Screen 1'], 'Discord first, whole screens last');
  await a.win.click('#capDlg .cap-item:has-text("Discord call")');
  await a.win.waitForSelector(`${winSel('Discord call', 'capture')} video.cap`);
  await a.win.waitForFunction(() => document.querySelector('#stage .win.capture video').readyState >= 2);
  assert.ok(await a.win.isHidden(`${winSel('Discord call', 'capture')} .waitmsg`), 'playing');

  await a.win.fill('#url', 'alpha'); await a.win.click('#add');   // the switch control shows when there's a stream
  await a.win.keyboard.press('s');                     // the switch control lists it
  await a.win.click('#featSwitch .fs-item.cap .fs-play');
  assert.equal(await a.win.$eval('#stage .win.capture video', v => v.srcObject.getVideoTracks()[0].enabled), false, 'paused: the picture freezes');
  await a.win.click('#featSwitch .fs-item.cap .fs-play');
  await a.win.click('#featSwitch .fs-item.cap .fs-rl');
  await a.win.waitForFunction(() => document.querySelector('#stage .win.capture video').readyState >= 2);
  await a.win.click('#featSwitch .fs-item.cap .fs-name');
  assert.ok(await a.win.locator('#stage .win.capture.featured').count(), 'it can be the big one');
  await a.win.keyboard.press('s');

  // the window's own reload button picks a different window
  await a.win.click(`${winSel('Discord call', 'capture')} [data-a=reload]`);
  await a.win.click('#capDlg .cap-item:has-text("Some app")');
  await a.win.waitForSelector(winSel('Some app', 'capture'));
  // the window it shows was closed
  await a.win.evaluate(() => document.querySelector('#stage .win.capture video').srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  assert.match(await a.win.textContent('#stage .win.capture .waitmsg'), /was closed/);
  await a.win.click('#stage .win.capture [data-a=close]');
  assert.equal(await a.win.locator('#stage .win.capture').count(), 0);
  await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes');
});
