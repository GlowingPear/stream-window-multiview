// Starts the real desktop app (Electron) and checks it opens, works and closes without errors.
// On Linux it needs a screen: in CI it runs under xvfb-run. Uses a temporary data folder,
// so your own logins and saved channels are never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, playwright } = require('../helpers');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

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
    args: ['--no-sandbox', ROOT],
    env: { ...process.env, HOME: data, XDG_CONFIG_HOME: data, APPDATA: data, ELECTRON_ENABLE_LOGGING: '0' },
    timeout: 60000
  });
  const mainErrors = [];
  app.process().stderr.on('data', d => { const s = String(d); if (/Uncaught|TypeError|ReferenceError|SyntaxError|Error: /.test(s) && !/(GPU|gpu|dbus|DBus|libva|viz|vaapi|ALSA|pulse)/.test(s)) mainErrors.push(s.trim()); });

  try {
    const win = await app.firstWindow();
    const pageErrors = [];
    win.on('pageerror', e => pageErrors.push(e.message));
    await win.waitForLoadState('domcontentloaded');
    await win.waitForSelector('#empty');

    assert.equal(await win.title(), 'Stream Multiview');
    assert.equal(await win.evaluate(() => !!(window.kmv && window.kmv.desktop)), true, 'the desktop bridge is there');
    assert.equal(await win.evaluate(() => window.kmv.appVersion()), pkg.version, 'the app reports the version in package.json');

    // the data folder is the temporary one, not the real one
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.ok(userData.startsWith(data), userData);

    // the app's help files are found
    const changelog = await win.evaluate(() => window.kmv.readHelp('CHANGELOG.md'));
    assert.ok(changelog && changelog.includes(`## ${pkg.version} (current)`), 'What\'s new is readable');
    assert.ok(await win.evaluate(() => window.kmv.readHelp('INSTRUCTIONS.txt')), 'Instructions are readable');
    assert.equal(await win.evaluate(() => window.kmv.readHelp('../package.json')), null, 'other files are refused');

    // adding a channel opens a stream and its chat, each in a web view
    await win.fill('#url', 'https://kick.com/alpha');
    await win.click('#add');
    await win.waitForSelector('#stage .win.stream webview');
    assert.equal(await win.$$eval('#stage .win', e => e.length), 2);

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
