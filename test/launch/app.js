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
// opts.hidden: invisible windows that never take focus, or not, whatever the command (see test/helpers.js).
async function launchApp(opts = {}) {
  const data = opts.data || fs.mkdtempSync(path.join(os.tmpdir(), 'smv-test-'));
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try { app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', ROOT], env, timeout: 60000, hidden: opts.hidden }); }
  catch (e) { return retry(e); }
  const proc = app.process();
  process.once('exit', () => killApp(proc));   // never leave the app open if the tests die
  const output = [];                           // the app's last messages, to say why a start failed
  for (const s of [proc.stdout, proc.stderr]) s?.on('data', d => { output.push(String(d)); if (output.length > 40) output.shift(); });
  try {
    await app.evaluate(({ app: eapp, session }) => {
      const player = '<!doctype html><title>player</title><body style="margin:0;background:#000"><video id="v" muted playsinline style="width:100%;height:100%"></video></body>';
      // YouTube's watch page: its player keeps its own volume (0-100) and mute, and sets the <video> from them,
      // levelled down to half (YouTube's loudness levelling), so the video's volume never equals the player's.
      // Its hidden like button flips on a click (counted in __likes), and the page is signed in when the
      // session has YouTube's SAPISID cookie. The player says it's playing (state 1) unless a test sets p.state.
      const ytWatch = '<!doctype html><title>player</title><body style="margin:0;background:#000"><div id="movie_player"><video id="v" playsinline style="width:100%;height:100%"></video></div>'
        + '<ytd-watch-metadata hidden><like-button-view-model><button aria-pressed="false"></button></like-button-view-model></ytd-watch-metadata><script>'
        + 'const p = document.getElementById("movie_player"), v = document.getElementById("v"); let vol = 100, m = false;'
        + 'const show = () => { v.volume = vol / 200; v.muted = m; };'
        + 'p.setVolume = x => { vol = Math.max(0, Math.min(100, Math.round(x))); show(); }; p.getVolume = () => vol;'
        + 'p.mute = () => { m = true; show(); }; p.unMute = () => { m = false; show(); }; p.isMuted = () => m; show();'
        + 'p.getPlayerState = () => p.state ?? 1;'
        + 'const lb = document.querySelector("like-button-view-model button"); window.__likes = 0;'
        + 'lb.onclick = () => { window.__likes++; lb.setAttribute("aria-pressed", String(lb.getAttribute("aria-pressed") !== "true")); };'
        + 'window.ytcfg = { get: k => k === "LOGGED_IN" ? /(^|; )SAPISID=/.test(document.cookie) : undefined };'
        + '</script></body>';
      const chat = '<!doctype html><title>chat</title><body><div id="chat"><div class="row"><b>regular</b>: <span>evening all</span></div></div></body>';
      const page = html => new Response(html, { headers: { 'content-type': 'text/html' } });
      const fake = s => {
        try {
          s.protocol.handle('https', req => {
            const u = req.url;
            if (/player\.kick\.com|player\.twitch\.tv|youtube\.com\/embed/.test(u)) return page(player);
            if (/\/popout\/|live_chat|\/chat\?/.test(u)) return page(chat);
            if (/^https:\/\/www\.youtube\.com\/watch\?/.test(u)) return page(ytWatch);
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
        await appGone(proc);   // so starting it again with the same data folder doesn't find this copy still there
      }
    };
  } catch (e) {
    const exited = proc.exitCode !== null || proc.signalCode !== null;
    killApp(proc);             // a failed start must not leave the app running (the test file would never end)
    await appGone(proc);
    if (e && typeof e.message === 'string') e.message += `\n  (the app ${exited ? `had exited: code ${proc.exitCode}, signal ${proc.signalCode}` : 'was still running'})`
      + (output.length ? '\n  its last output:\n' + output.join('').split('\n').slice(-25).map(l => '    ' + l).join('\n') : '');
    return retry(e);
  }
  // A start can fail for reasons outside the app: on CI, Playwright's hold on the app's main process sometimes
  // breaks right after launch ("Execution context was destroyed"), and a copy closed just before can still be
  // exiting. Try once more; a second failure is real.
  async function retry(e) {
    if (opts.retried) throw e;
    console.log('# The app failed to start, trying once more: ' + String(e && e.message || e).split('\n').map(l => l.trim()).filter(Boolean).join('\n# '));
    await new Promise(r => setTimeout(r, 1000));
    return launchApp({ ...opts, data, retried: true });
  }
}

// Wait until the app and its helper processes have exited; whatever is left after 5 s is killed.
async function appGone(proc) {
  const alive = () => {
    if (process.platform === 'win32') return proc.exitCode === null && proc.signalCode === null;
    try { process.kill(-proc.pid, 0); return true; } catch { return false; }
  };
  for (let i = 0; i < 50 && alive(); i++) await new Promise(r => setTimeout(r, 100));
  if (alive()) killApp(proc);
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
