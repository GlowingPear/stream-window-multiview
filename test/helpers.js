// Shared bits for the UI and launch tests.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Playwright isn't one of the app's dependencies (users would download it for nothing), so the
// tests install it on their own: npm run test:setup
function playwright() {
  let pw;
  try { pw = require('playwright'); } catch {
    throw new Error('Playwright is not installed. Run "npm run test:setup" once, then run the tests again.');
  }
  notePlaywrightFolders();
  hideElectron(pw);
  quietElectron(pw);
  if (COVERAGE) recordElectron(pw);
  trackElectron(pw);
  return pw;
}

/* ---- Temporary folders: nothing a test makes is left in the system's temp folder ----
   tempDir('name', t) makes a fresh folder (smv-name-XXXXXX) and removes it when the test t ends; without t (a
   folder for a whole file, or one the desktop app is still using), when the test file's process exits. Whatever
   is still there at the exit goes then too, synchronously, so it also happens when --test-force-exit ends the
   run. A folder that can't be removed (Windows keeps files locked for a moment after a program closes) is
   tried a few times, then only warned about: cleaning up never fails a test. */
const leftovers = new Set();
const running = new Set();   // the desktop apps still open, stopped before their folders are removed
let exitHooked = false;
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: process.platform === 'win32' ? 10 : 3, retryDelay: 100 });
    leftovers.delete(dir);
  } catch (e) { console.warn(`# Couldn't remove the temporary folder ${dir}: ${e && e.message || e}`); }
}
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', () => {
    for (const proc of running) killApp(proc);
    for (const dir of [...leftovers]) removeDir(dir);
  });
}
function removeAtExit(dir) { leftovers.add(dir); hookExit(); }
function tempDir(name, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `smv-${name}-`));
  removeAtExit(dir);
  if (t && typeof t.after === 'function') t.after(() => removeDir(dir));
  return dir;
}

// Playwright removes its own temporary folders (playwright-artifacts-*, a browser's profile) once a browser or the
// app has closed, but it does it in the background, and --test-force-exit can end the process first. The ones
// this process's Playwright makes are noted as it makes them and removed at the exit; another process's (a test
// file running alongside, a script) are never touched.
function notePlaywrightFolders() {
  const fsp = fs.promises, mkdtemp = fsp.mkdtemp;
  if (mkdtemp.__smvNoted) return;
  const noted = async (prefix, ...rest) => {
    const dir = await mkdtemp.call(fsp, prefix, ...rest);
    if (/^playwright[-_]/.test(path.basename(String(prefix)))) removeAtExit(dir);
    return dir;
  };
  noted.__smvNoted = true;
  fsp.mkdtemp = noted;
}

// Every copy of the desktop app is stopped when the process exits (before its data folder is removed), whether
// or not the test that started it got to close it.
function trackElectron(pw) {
  if (pw._electron.__smvTracked) return;
  pw._electron.__smvTracked = true;
  const launch = pw._electron.launch.bind(pw._electron);
  pw._electron.launch = async (opts = {}) => {
    const app = await launch(opts);
    const proc = app.process();
    if (proc) {
      running.add(proc); hookExit();
      proc.once('exit', () => running.delete(proc));
    }
    return app;
  };
}

/* ---- npm run test:launch:hidden (or SMV_TEST_HIDDEN=1): the desktop app's windows are invisible and never
   take focus, so the launch tests can run while you work (see test/launch/hidden.js). A launch can also
   ask for it with { hidden: true }. */
const HIDDEN = process.env.SMV_TEST_HIDDEN === '1' || /:hidden$/.test(process.env.npm_lifecycle_event || '');
function hideElectron(pw) {
  if (pw._electron.__smvHidden) return;
  pw._electron.__smvHidden = true;
  const launch = pw._electron.launch.bind(pw._electron);
  pw._electron.launch = ({ hidden = HIDDEN, ...opts } = {}) =>
    launch(hidden ? { ...opts, args: ['-r', path.join(__dirname, 'launch', 'hidden.js'), ...(opts.args || [])] } : opts);
}

// Every test copy of the app makes no sound (see test/launch/quiet.js).
function quietElectron(pw) {
  if (pw._electron.__smvQuiet) return;
  pw._electron.__smvQuiet = true;
  const launch = pw._electron.launch.bind(pw._electron);
  pw._electron.launch = (opts = {}) => launch({ ...opts, args: ['-r', path.join(__dirname, 'launch', 'quiet.js'), ...(opts.args || [])] });
}

/* ---- npm run test:coverage: records which code the tests run (scripts/coverage.js reads it) ----
   Only when SMV_COVERAGE names a folder. The app's pages are recorded by Playwright, the desktop
   app's main process by Node's own coverage (NODE_V8_COVERAGE). */
const COVERAGE = process.env.SMV_COVERAGE || '';
async function startCoverage(page) {
  if (COVERAGE) await page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {});
}
async function saveCoverage(page) {
  if (!COVERAGE) return;
  let list = [];
  try { list = await page.coverage.stopJSCoverage(); } catch { return; }
  list = list.filter(c => /\/src\/(?:[^/?#]+\/)*[^/?#]+\.(html|js)(\?|#|$)/.test(c.url));
  if (!list.length) return;
  const dir = path.join(COVERAGE, 'page');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`), JSON.stringify(list));
}
// Every window of the desktop app is recorded from when it opens until the app closes.
function recordElectron(pw) {
  if (pw._electron.__smvCoverage) return;
  pw._electron.__smvCoverage = true;
  const launch = pw._electron.launch.bind(pw._electron);
  pw._electron.launch = async (opts = {}) => {
    const env = { ...(opts.env || process.env), NODE_V8_COVERAGE: path.join(COVERAGE, 'node') };
    const app = await launch({ ...opts, env });
    const pages = [];
    // A reload drops the page's scripts, and what they ran, before the end (Electron 42 on): what a page ran
    // so far is saved before a test reloads it, and recording starts again.
    const watch = p => {
      pages.push(p); startCoverage(p);
      const reload = p.reload.bind(p);
      p.reload = async (...a) => { await saveCoverage(p); await startCoverage(p); return reload(...a); };
    };
    app.windows().forEach(watch);
    app.on('window', watch);
    const close = app.close.bind(app);
    app.close = async () => { await Promise.all(pages.splice(0).map(saveCoverage)); return close(); };
    return app;
  };
}

// Stops the desktop app and its helper processes (GPU, network, pages). Playwright starts it as the leader of
// its own process group outside Windows, so kill the group: killing only the app leaves the helpers running,
// and they keep the test file from ever ending.
function killApp(proc) {
  try { if (process.platform === 'win32') proc.kill('SIGKILL'); else process.kill(-proc.pid, 'SIGKILL'); } catch {}
}

// Serves the app's folder on a random local port, like the page sees it outside the desktop app.
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/plain; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
}

module.exports = { ROOT, playwright, serve, startCoverage, saveCoverage, killApp, tempDir, removeDir };
