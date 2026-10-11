// Shared bits for the UI and launch tests.
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Playwright isn't one of the app's dependencies (users would download it for nothing), so the
// tests install it on their own: npm run test:setup
function playwright() {
  let pw;
  try { pw = require('playwright'); } catch {
    throw new Error('Playwright is not installed. Run "npm run test:setup" once, then run the tests again.');
  }
  if (COVERAGE) recordElectron(pw);
  return pw;
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
  list = list.filter(c => /\/src\/[^/?#]+\.(html|js)(\?|#|$)/.test(c.url));
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
    const watch = p => { pages.push(p); startCoverage(p); };
    app.windows().forEach(watch);
    app.on('window', watch);
    const close = app.close.bind(app);
    app.close = async () => { await Promise.all(pages.splice(0).map(saveCoverage)); return close(); };
    return app;
  };
}

// Serves the app's folder on a random local port, like the page sees it outside the desktop app.
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/plain; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
}

module.exports = { ROOT, playwright, serve, startCoverage, saveCoverage };
