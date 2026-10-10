// Shared bits for the UI and launch tests.
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Playwright isn't one of the app's dependencies (users would download it for nothing), so the
// tests install it on their own: npm run test:setup
function playwright() {
  try { return require('playwright'); } catch {
    throw new Error('Playwright is not installed. Run "npm run test:setup" once, then run the tests again.');
  }
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

module.exports = { ROOT, playwright, serve };
