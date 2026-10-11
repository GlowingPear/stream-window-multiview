// Shared by the launch tests: starts the real desktop app with its own temporary data folder, and with
// Kick, Twitch and YouTube replaced by small stand-in pages (a player with a <video>, a chat with a few
// messages), so the tests need no network or logins.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, playwright, killApp } = require('../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

// opts.storage: localStorage values to start with (the page is reloaded once with them).
// opts.data: the data folder of an earlier launch, to start the app again with what it saved.
async function launchApp(opts = {}) {
  const data = opts.data || fs.mkdtempSync(path.join(os.tmpdir(), 'smv-test-'));
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => killApp(proc));   // never leave the app open if the tests die
  try {
    await app.evaluate(({ app: eapp, session }) => {
      const player = '<!doctype html><title>player</title><body style="margin:0;background:#000"><video id="v" muted playsinline style="width:100%;height:100%"></video></body>';
      const chat = '<!doctype html><title>chat</title><body><div id="chat"><div class="row"><b>regular</b>: <span>evening all</span></div></div></body>';
      const page = html => new Response(html, { headers: { 'content-type': 'text/html' } });
      const fake = s => {
        try {
          s.protocol.handle('https', req => {
            const u = req.url;
            if (/player\.kick\.com|player\.twitch\.tv|youtube\.com\/embed/.test(u)) return page(player);
            if (/\/popout\/|live_chat|\/chat\?/.test(u)) return page(chat);
            if (/^https:\/\/(www\.)?(kick\.com|twitch\.tv|youtube\.com)\//.test(u)) return page('<!doctype html><title>site</title>');
            return new Response('', { status: 404 });
          });
        } catch {}
      };
      ['persist:kick', 'persist:twitch', 'persist:youtube'].forEach(p => fake(session.fromPartition(p)));
      eapp.on('session-created', fake);
      globalThis.__fake = fake;
    });
    const win = await mainWindow(app);
    const errors = [];
    win.on('pageerror', e => errors.push(e.message));
    win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
    await win.waitForSelector('#loginBtn:not([hidden])');
    if (opts.storage) {
      await win.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, opts.storage);
      await win.reload();
      await win.waitForSelector('#loginBtn:not([hidden])');
    }
    return {
      app, win, data, errors,
      async close() {
        const closed = app.close().then(() => true, () => false);
        if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) killApp(proc);
      }
    };
  } catch (e) { killApp(proc); throw e; }   // a failed start must not leave the app running (the test file would never end)
}


// The app's main window (the app also has hidden helper windows).
async function mainWindow(app) {
  await app.firstWindow();
  for (let i = 0; i < 100; i++) {
    const w = app.windows().find(p => /index\.html(?!.*role=streams)/.test(p.url()));
    if (w) return w;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('The main window did not open');
}

// Run a function inside a window's web view (its stream player or chat page). The window is found by its title.
function inView(win, title, kind, fn, arg) {
  return win.evaluate(([title, kind, src, arg]) => {
    const w = [...document.querySelectorAll('#stage .win.' + kind)].find(e => e.querySelector('.title').textContent === title);
    return w.querySelector('webview').executeJavaScript(`(${src})(${JSON.stringify(arg)})`);
  }, [title, kind, fn.toString(), arg]);
}
// Wait until a window's web view has loaded a page whose address matches.
function viewLoaded(win, title, kind, re) {
  return win.waitForFunction(([title, kind, re]) => {
    const w = [...document.querySelectorAll('#stage .win.' + kind)].find(e => e.querySelector('.title').textContent === title);
    const v = w && w.querySelector('webview');
    try { return !!v && new RegExp(re).test(v.getURL()); } catch { return false; }
  }, [title, kind, re.source]);
}
// A Playwright selector for a window by its title.
const winSel = (title, kind = 'stream') => `#stage .win.${kind}:has(.title:text-is("${title}"))`;

module.exports = { launchApp, mainWindow, inView, viewLoaded, winSel, assert };
