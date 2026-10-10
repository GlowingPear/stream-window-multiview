// Help > Updates in the real desktop app: the release notes show formatted (GitHub's HTML), unsafe parts
// are removed, links open in the browser, and plain text is the fallback. The update status and opening
// links are replaced by stand-ins, so this needs no network. Uses a temporary data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, playwright } = require('../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

const T = { timeout: 45000 };   // per test, so one stuck test can't hold up the run
let app, win;
const pageErrors = [];

test.before(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-update-'));
  const env = { ...process.env, SMV_DEV_DATA: data, ELECTRON_ENABLE_LOGGING: '0' };   // a data folder of its own (see npm run dev)
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => { try { proc.kill(); } catch {} });   // never leave the app open if the tests die
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#helpBtn');
  // stand-ins: the update status the test sets, and opening links (only recorded)
  await app.evaluate(({ ipcMain }) => {
    const s = globalThis.__test = { status: {}, opened: [] };
    for (const ch of ['update:status', 'update:check']) { ipcMain.removeHandler(ch); ipcMain.handle(ch, () => s.status); }
    ipcMain.removeHandler('open-external');
    ipcMain.handle('open-external', (_e, url) => { s.opened.push(url); });
  });
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) app.process().kill('SIGKILL');
});

const STATUS = { current: '0.2.14', repo: 'o/r', auto: true, lastCheck: Date.now(), git: false, installed_app: true, platform: process.platform, state: 'uptodate', latest: '0.2.14' };
async function showUpdates(extra) {
  await app.evaluate(({ BrowserWindow }, s) => {
    globalThis.__test.status = s;
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:status', s));
  }, { ...STATUS, ...extra });
  if (await win.isHidden('#helpDlg')) await win.click('#helpBtn');
  await win.click('button[data-h="upd"]');
  await win.waitForSelector('.upd-notes');
}

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

test('without HTML, the notes show as plain text like before', T, async () => {
  await showUpdates({ notes: '- New thing\n- Another', notesHtml: '' });
  const n = await win.$eval('.upd-notes', e => ({ text: e.textContent, html: e.classList.contains('html') }));
  assert.equal(n.text, '- New thing\n- Another');
  assert.equal(n.html, false);
  assert.deepEqual(pageErrors, [], 'the page had no errors');
});
