// Settings > Updates in the real desktop app: the release notes show formatted (GitHub's HTML), unsafe parts
// are removed, links open in the browser, and plain text is the fallback. The update status and opening
// links are replaced by stand-ins, so this needs no network. Uses a temporary data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, playwright, killApp, tempDir } = require('../../../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

const T = { timeout: 45000 };   // per test, so one stuck test can't hold up the run
let app, win, realStatus;
const pageErrors = [];

test.before(async () => {
  const data = tempDir('update');
  // no update check against GitHub during the test: automatic checks off, and the update address goes nowhere
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };   // a data folder of its own (see npm run dev)
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', '--use-mock-keychain', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => killApp(proc));   // never leave the app open if the tests die
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#settingsBtn');
  realStatus = await win.evaluate(() => window.kmv.updateStatus());   // before the stand-ins: what a fresh copy really has
  // stand-ins: the update status the test sets, and opening links (only recorded)
  await app.evaluate(({ ipcMain }) => {
    const s = globalThis.__test = { status: {}, opened: [], checks: 0 };
    ipcMain.removeHandler('update:status'); ipcMain.handle('update:status', () => s.status);
    ipcMain.removeHandler('update:check'); ipcMain.handle('update:check', () => { s.checks++; return s.status; });
    ipcMain.removeHandler('update:privacy-settings'); ipcMain.handle('update:privacy-settings', () => { s.opened.push('privacy'); return true; });
    ipcMain.removeHandler('update:use-dmg'); ipcMain.handle('update:use-dmg', () => { s.opened.push('dmg'); return s.status; });
    ipcMain.removeHandler('open-external');
    ipcMain.handle('open-external', (_e, url) => { s.opened.push(url); });
  });
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) killApp(app.process());
});

const STATUS = { current: '0.2.14', repo: 'o/r', auto: true, lastCheck: Date.now(), git: false, installed_app: true, platform: process.platform, state: 'available', latest: '0.2.15' };
async function showUpdates(extra) {
  await app.evaluate(({ BrowserWindow }, s) => {
    globalThis.__test.status = s;
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:status', s));
  }, { ...STATUS, ...extra });
  if (await win.isHidden('#settingsDlg')) await win.click('#settingsBtn');
  await win.click('#settingsDlg .st-rail [data-s=updates]');
  await win.waitForSelector('.upd-notes');
}

test('a fresh copy checks the project\'s GitHub page (package.json updateRepo)', T, async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.updateRepo, 'package.json names the GitHub page');
  assert.equal(realStatus.repo, pkg.updateRepo);
});

test('the release notes show as GitHub formats them', T, async () => {
  await showUpdates({
    notes: "## What's Changed\n* Fix by @GlowingPear in https://github.com/o/r/pull/10",
    notesHtml: '<h2>What\'s Changed</h2>\n<ul>\n<li>Fix by <a class="user-mention" href="https://github.com/GlowingPear">@GlowingPear</a> in '
      + '<a class="issue-link" data-hovercard-type="pull_request" href="https://github.com/o/r/pull/10">#10</a></li>\n</ul>\n'
      + '<p><strong>Full Changelog</strong>: <a href="https://github.com/o/r/compare/v0.2.13...v0.2.14"><tt>v0.2.13...v0.2.14</tt></a></p>'
  });
  const n = await win.$eval('.upd-notes', e => ({
    h: e.querySelector('h2')?.textContent, li: e.querySelector('li')?.textContent, links: [...e.querySelectorAll('a')].map(a => a.textContent),
    bold: e.querySelector('strong')?.textContent, raw: /##|\*\*/.test(e.textContent), attrs: [...e.querySelectorAll('[class],[data-hovercard-type]')].length
  }));
  assert.equal(n.h, "What's Changed");
  assert.equal(n.li, 'Fix by @GlowingPear in #10');
  assert.deepEqual(n.links, ['@GlowingPear', '#10', 'v0.2.13...v0.2.14']);
  assert.equal(n.bold, 'Full Changelog');
  assert.equal(n.raw, false, 'no Markdown symbols left');
  assert.equal(n.attrs, 0, 'GitHub\'s extra attributes are dropped');
});

test('a link opens in the browser, not in the app', T, async () => {
  await win.click('.upd-notes a:has-text("#10")');
  assert.deepEqual(await app.evaluate(() => globalThis.__test.opened), ['https://github.com/o/r/pull/10']);
  assert.match(win.url(), /index\.html$/, 'the app window stayed on the app');
});

test('anything unsafe in the notes is removed', T, async () => {
  await showUpdates({
    notes: 'x',
    notesHtml: '<p onclick="window.bad=1">Safe <b>text</b></p><script>window.bad=2</script><iframe src="https://evil.example"></iframe>'
      + '<a href="javascript:window.bad=3">js link</a><img src="x" onerror="window.bad=4"><style>body{display:none}</style><div><span>kept as text</span></div>'
  });
  const n = await win.$eval('.upd-notes', e => ({ html: e.innerHTML, text: e.textContent }));
  assert.ok(!/script|iframe|style|onclick|onerror|javascript:/i.test(n.html), n.html);
  assert.match(n.text, /Safe text/);
  assert.match(n.text, /kept as text/, 'unknown tags keep their text');
  await win.click('.upd-notes a');   // the javascript: link has no address any more
  assert.equal(await win.evaluate(() => window.bad), undefined, 'nothing ran');
  assert.ok(await win.isVisible('body'));
});

test('a video in the notes shows with controls, at its permanent address, without GitHub\'s file name, and can\'t autoplay or run code', T, async () => {
  const id = 'acd881d3-6bff-4125-a41a-7aed2363a94e';
  await showUpdates({
    notes: 'x',
    notesHtml: '<details open="" class="details-reset"><summary class="px-3"><svg><path d="M0 0"></path></svg><span class="m-1">demo.mp4</span></summary>'
      + `<video src="https://private-user-images.githubusercontent.com/1/2-${id}.mp4?jwt=abc&amp;X-Amz-Expires=300" controls="controls" muted="muted" `
      + 'autoplay onplay="window.bad=1" style="max-height:640px" class="d-block"></video></details>'
      + '<video src="https://example.com/other.mp4"></video><video src="javascript:window.bad=2" autoplay></video>'
  });
  const n = await win.$eval('.upd-notes', e => ({
    text: e.textContent.trim(), boxes: e.querySelectorAll('details,summary,svg').length,
    videos: [...e.querySelectorAll('video')].map(v => ({ src: v.getAttribute('src'), attrs: v.getAttributeNames().sort().join(' ') }))
  }));
  assert.equal(n.text, '', 'the file name is hidden');
  assert.equal(n.boxes, 0, 'no box to collapse: the video always shows');
  assert.deepEqual(n.videos, [
    { src: `https://github.com/user-attachments/assets/${id}`, attrs: 'controls muted preload src' },
    { src: 'https://example.com/other.mp4', attrs: 'controls muted preload src' },
    { src: null, attrs: 'controls muted preload' }
  ]);
  assert.equal(await win.evaluate(() => window.bad), undefined, 'nothing ran');
});

test('without HTML, the notes show as plain text like before', T, async () => {
  await showUpdates({ notes: '- New thing\n- Another', notesHtml: '' });
  const n = await win.$eval('.upd-notes', e => ({ text: e.textContent, html: e.classList.contains('html') }));
  assert.equal(n.text, '- New thing\n- Another');
  assert.equal(n.html, false);
  assert.deepEqual(pageErrors, [], 'the page had no errors');
});

test('a copy run from a git checkout can check (not install) and says which version is newest', T, async () => {
  await showUpdates({ git: true, latest: '0.2.15', state: 'available', notes: 'x', notesHtml: '' });
  assert.match(await win.textContent('.upd-state'), /git checkout.*The newest version is 0\.2\.15/s);
  assert.equal(await win.isEnabled('.upd-check'), true, 'Check now works');
  assert.equal(await win.locator('.upd-install').count(), 0, 'no Download / Install button');
  await win.click('.upd-check');
  assert.equal(await app.evaluate(() => globalThis.__test.checks), 1);
});

test('a downloaded Mac update says the app updates itself, or to drag it in when it has to use the disk image', T, async () => {
  const ready = { platform: 'darwin', state: 'ready', latest: '0.2.15', installed: '0.2.15', notes: 'x', notesHtml: '' };
  await showUpdates({ ...ready, swap: { appPath: '/Applications/Stream Multiview.app', newApp: '/tmp/x/app/Stream Multiview.app' } });
  assert.match(await win.textContent('.upd-state'), /Restart and install.*updates itself and opens again/s);
  assert.equal(await win.textContent('.upd-restart'), 'Restart and install');
  await showUpdates({ ...ready, swap: null });
  assert.match(await win.textContent('.upd-state'), /drag Stream Multiview into Applications/);
  assert.equal(await win.textContent('.upd-restart'), 'Install');
});

test('when macOS stops the app updating itself, it says where to allow it and offers the disk image', T, async () => {
  await showUpdates({ platform: 'darwin', state: 'ready', latest: '0.2.15', installed: '0.2.15', notes: 'x', notesHtml: '',
    swap: { appPath: '/Applications/Stream Multiview.app', newApp: '/tmp/x/app/Stream Multiview.app' }, blocked: true });
  assert.match(await win.textContent('.upd-state'), /macOS stopped.*App Management.*Restart and install/s);
  assert.equal(await win.textContent('.upd-restart'), 'Restart and install', 'it can be tried again');
  await app.evaluate(() => { globalThis.__test.opened.length = 0; });
  await win.click('.upd-privacy');
  await win.click('.upd-dmg');
  assert.deepEqual(await app.evaluate(() => globalThis.__test.opened), ['privacy', 'dmg']);
});
