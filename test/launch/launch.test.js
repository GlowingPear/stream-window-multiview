// Starts the real desktop app (Electron) and checks it opens, works and closes without errors.
// On Linux it needs a screen: in CI it runs under xvfb-run. Uses a temporary data folder,
// so your own logins and saved channels are never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stubExists, openChannel } = require('./app');
const { ROOT, playwright } = require('../helpers');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// These tests move the home folder to a temporary one. On a Mac that hides the login keychain, and macOS
// asks to reset it ("Keychain Not Found") when the app encrypts saved logins: use a stand-in keychain instead.
const ARGS = ['--no-sandbox', '--use-mock-keychain', ROOT];
// The app's environment, with its data in the temporary home folder. A Mac finds the app's data folder
// without looking at HOME, so there the app is told where it is (as npm run dev does), or it would use
// (or, while it's open, hand over to) your own copy. Without ELECTRON_RUN_AS_NODE, which editors built on
// Electron set: it starts the app as plain Node.
function appEnv(vars) {
  const env = { ...process.env, ...vars };
  if (process.platform === 'darwin') env.SMV_DEV_DATA = vars.HOME;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

test('the desktop app starts, adds a stream and quits cleanly', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-launch-'));
  const app = await playwright()._electron.launch({
    executablePath: electronPath(),
    args: ARGS,
    env: appEnv({ HOME: data, XDG_CONFIG_HOME: data, APPDATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' }),
    timeout: 60000
  });
  await stubExists(app);
  const mainErrors = [];
  // (Electron logs a call into a web view whose page went away mid-call, as the page reloads or a player is replaced:
  // the page's side of it fails quietly, windows/view.js)
  app.process().stderr.on('data', d => { const s = String(d); if (/Uncaught|TypeError|ReferenceError|SyntaxError|Error: /.test(s) && !/(GPU|gpu|dbus|DBus|libva|viz|vaapi|ALSA|pulse|Render frame was disposed before the request completed)/.test(s)) mainErrors.push(s.trim()); });

  try {
    const win = await app.firstWindow();
    const pageErrors = [];
    win.on('pageerror', e => pageErrors.push(e.message));
    await win.waitForLoadState('domcontentloaded');
    await win.waitForSelector('#empty');

    assert.equal(await win.title(), 'Stream Multiview');
    assert.equal(await win.evaluate(() => !!(window.kmv && window.kmv.desktop)), true, 'the desktop bridge is there');
    assert.equal(await win.evaluate(() => window.kmv.appVersion()), pkg.version, 'the app reports the version in package.json');

    // Hide bar hides the traffic lights and shows them again; on a Mac they come back inside the toolbar
    await win.evaluate(() => { window.kmv.setLights(false); window.kmv.setLights(true); window.kmv.watchTop(true); });
    await win.waitForTimeout(250);   // a few looks at where the mouse is
    await win.evaluate(() => window.kmv.watchTop(false));
    if (process.platform === 'darwin') {
      assert.ok(await win.evaluate(() => document.documentElement.classList.contains('mac-bar')), 'the toolbar is the title bar');
      const at = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => /index\.html$/.test(w.webContents.getURL())).getWindowButtonPosition());
      assert.deepEqual(at, { x: 18, y: 19 }, 'the lights are back in the toolbar, not in the corner');
    }

    // the data folder is the temporary one, not the real one
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.ok(userData.startsWith(data), userData);

    // the app's help files are found
    const changelog = await win.evaluate(() => window.kmv.readHelp('CHANGELOG.md'));
    assert.ok(changelog && changelog.includes(`## ${pkg.version} (current)`), 'What\'s new is readable');
    assert.ok((await win.evaluate(() => window.kmv.readGuide())).length >= 25, 'the guide\'s pages are readable');
    assert.equal(await win.evaluate(() => window.kmv.readHelp('../package.json')), null, 'other files are refused');

    // adding a channel opens a stream and its chat, each in a web view
    await openChannel(win, 'https://kick.com/alpha');
    await win.waitForSelector('#stage .win.stream webview');
    assert.equal(await win.$$eval('#stage .win', e => e.length), 2);

    // "Watch signed in": off, the stream has its own logged-out storage; on, it uses the Kick login
    const partitions = () => win.$$eval('#stage .win webview', e => e.map(v => v.closest('.win').classList[1] + ' ' + v.getAttribute('partition')));
    assert.deepEqual(await partitions(), ['stream persist:kmv-stream-alpha', 'chat persist:kick']);
    await win.click('#loginBtn');
    await win.click('#accountMenu .am-more');      // Account settings…
    await win.check('#settingsDlg .am-watch input[data-w=kick]');
    assert.deepEqual(await partitions(), ['stream persist:kick', 'chat persist:kick'], 'the Kick stream now uses the Kick login');
    assert.equal(await win.$$eval('#stage .win.stream webview', e => e.length), 1, 'the old player was replaced, not added to');
    await win.uncheck('#settingsDlg .am-watch input[data-w=twitch]');
    await win.reload();
    await win.waitForSelector('#stage .win.stream webview');
    assert.deepEqual(await partitions(), ['stream persist:kick', 'chat persist:kick'], 'the choice is remembered');
    await win.evaluate(() => window.openSettings('accounts'));
    assert.equal(await win.isChecked('#settingsDlg .am-watch input[data-w=kick]'), true);
    await win.uncheck('#settingsDlg .am-watch input[data-w=kick]');
    assert.deepEqual(await partitions(), ['stream persist:kmv-stream-alpha', 'chat persist:kick'], 'and turning it off goes back');

    await win.waitForTimeout(1500);
    assert.deepEqual(pageErrors, [], 'the page had no errors');
  } finally {
    const exited = new Promise(resolve => app.process().once('exit', (code, signal) => resolve({ code, signal })));
    await app.close();
    const { code, signal } = await exited;
    assert.ok(code === 0 || code === null, `exit code ${code}`);
    assert.ok(!['SIGSEGV', 'SIGABRT', 'SIGBUS'].includes(signal), `crashed with ${signal}`);
  }
  assert.deepEqual(mainErrors, [], 'the main process logged no errors');

  // closing saved the window position
  assert.ok(fs.existsSync(path.join(data, 'Stream Multiview', 'window-state.json')), 'window position saved');
});

test('YouTube sign-in copies the login from Firefox', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const { firefoxRoots } = require('../../src/main/firefox-login');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-launch-'));
  const env = appEnv({ HOME: data, XDG_CONFIG_HOME: data, APPDATA: data, LOCALAPPDATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' });

  // a Firefox profile signed in to YouTube (plus another site's login, which must not be copied)
  const prof = path.join(firefoxRoots(process.platform, env, data)[0], 'Profiles', 'test.default-release');
  fs.mkdirSync(prof, { recursive: true });
  const db = new DatabaseSync(path.join(prof, 'cookies.sqlite'));
  db.exec(`CREATE TABLE moz_cookies (id INTEGER PRIMARY KEY, originAttributes TEXT NOT NULL DEFAULT '', name TEXT, value TEXT, host TEXT,
    path TEXT, expiry INTEGER, lastAccessed INTEGER, creationTime INTEGER, isSecure INTEGER, isHttpOnly INTEGER, inBrowserElement INTEGER DEFAULT 0,
    sameSite INTEGER DEFAULT 0, rawSameSite INTEGER DEFAULT 0, schemeMap INTEGER DEFAULT 0)`);
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
  const ins = db.prepare("INSERT INTO moz_cookies (name, value, host, path, expiry, isSecure, isHttpOnly) VALUES (?, ?, ?, '/', ?, 1, 1)");
  ins.run('LOGIN_INFO', 'yt-login', '.youtube.com', exp);
  ins.run('SAPISID', 'sapisid', '.google.com', exp);
  ins.run('user_session', 'github-secret', '.github.com', exp);
  ins.run('NID', 'search-secret', '.google.com', exp);
  db.close();

  const app = await playwright()._electron.launch({ executablePath: electronPath(), args: ARGS, env, timeout: 60000 });
  try {
    const win = await app.firstWindow();
    const pageErrors = [];
    win.on('pageerror', e => pageErrors.push(e.message));
    await win.waitForSelector('#empty');

    // YouTube's "Log in" opens the Firefox sign-in steps (Google blocks signing in inside the app)
    assert.match(await win.textContent('#settingsDlg .am-alt'), /only works through Firefox/);
    await win.click('#loginBtn');
    await win.click('#accountMenu .am-row[data-p=youtube] .am-in');
    await win.waitForSelector('#ffDlg:not([hidden])');
    assert.match(await win.textContent('#ffDlg .dlg-sub'), /only works through the Firefox browser/);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => /google/.test(w.webContents.getURL())).length), 0, 'no Google sign-in window opened');

    await win.click('#ffDlg .ff-copy');
    await win.waitForSelector('#ffDlg[hidden]', { state: 'attached' });
    const cookies = await app.evaluate(({ session }) => session.fromPartition('persist:youtube').cookies.get({}).then(l => l.map(c => `${c.domain} ${c.name}=${c.value}`)));
    assert.ok(cookies.includes('.youtube.com LOGIN_INFO=yt-login'), cookies.join(', '));
    assert.ok(cookies.includes('.google.com SAPISID=sapisid'));
    assert.ok(!cookies.some(c => /github|search-secret/.test(c)), 'only the YouTube login was copied, not another site\'s or Google\'s other cookies');
    await win.click('#loginBtn');
    await win.waitForFunction(() => /Logged in/.test(document.querySelector('#accountMenu .am-row[data-p=youtube] .am-st').textContent));
    assert.deepEqual(fs.readdirSync(prof), ['cookies.sqlite'], 'Firefox\'s profile is untouched');
    assert.deepEqual(pageErrors, []);
  } finally {
    await app.close();
  }
});
