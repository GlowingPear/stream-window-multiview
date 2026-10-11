// Helpers for driving a dev copy of the app with Playwright (see SKILL.md). Works on Windows, Mac and Linux.
// Needs "npm run test:setup" once (Playwright, its browser and its ffmpeg for video).
//   const drive = require('<repo>/.claude/skills/drive-app/drive');
//   const { main, close } = await drive.connect(9333);                 // a copy started with npm run dev -- --debug 9333
//   const run = await drive.launch({ profile: 'work', video: true });  // starts its own copy; records the main window
//   ... await run.close()  ->  { video: '<path>.webm' }
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { playwright } = require(path.join(ROOT, 'test', 'helpers'));
const { prepare } = require(path.join(ROOT, 'scripts', 'dev'));

const isMain = p => /\/src\/index\.html$/.test(p.url());
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A folder outside the project for screenshots and videos (they are never committed).
function outDir(name = 'captures') {
  const dir = path.join(os.tmpdir(), 'stream-multiview-pr', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Attach to a running dev copy. `pages()` lists every window and web view (streams, chats, hidden checkers).
async function connect(port) {
  const browser = await playwright().chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  // Playwright tells the pages it's attached to that the system is in light mode, which turns sites
  // that follow it (Twitch, YouTube) light while connected. Keep the real setting.
  const real = pg => pg.emulateMedia({ colorScheme: null }).catch(() => {});
  browser.contexts().forEach(c => { c.pages().forEach(real); c.on('page', real); });
  const pages = () => browser.contexts().flatMap(c => c.pages());
  const main = pages().find(isMain);
  if (!main) throw new Error('No Stream Multiview window on that port.');
  main.setDefaultTimeout(15000);
  return { browser, main, pages, close: () => browser.close() };   // close() only disconnects; the app keeps running
}

// Start a dev copy under Playwright. `dir` is the checkout to run (default: this one), `profile` as in
// npm run dev --profile (a running copy using the same profile must be closed first), `video: true` records
// the main window as WebM, `seed(data)` can write files into the app's data folder before it starts.
// Only one copy per profile can run at a time.
async function launch({ dir = ROOT, profile = '', video = false, size = { width: 1280, height: 800 }, seed } = {}) {
  const p = prepare({ dir, profile });
  if (seed) await seed(p.data);
  const videoDir = video ? fs.mkdtempSync(path.join(outDir('video'), 'run-')) : '';
  const app = await playwright()._electron.launch({
    executablePath: p.electron, args: [p.dir], env: p.env, timeout: 60000,
    colorScheme: 'no-override',   // keep the system's light/dark setting (see connect)
    ...(video ? { recordVideo: { dir: videoDir, size } } : {})
  });
  let main = null;
  for (let i = 0; i < 100 && !main; i++) { main = app.windows().find(isMain); if (!main) await sleep(200); }
  if (!main) { await app.close(); p.cleanup(); throw new Error('The app did not open its main window (is another copy using this profile?).'); }
  main.setDefaultTimeout(15000);   // a step that can't happen fails instead of waiting forever
  await main.waitForLoadState('domcontentloaded');
  // the same size as the video, so nothing is squashed
  await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows().find(x => /index\.html$/.test(x.webContents.getURL())); w?.unmaximize(); w?.setContentSize(s.width, s.height); }, size);
  return {
    app, main, data: p.data,
    async close() {
      const v = video && main.video();
      // force-quit if the app doesn't close within 10 s, so nothing is left running
      const closed = app.close().then(() => true, () => false);
      if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) app.process().kill('SIGKILL');
      p.cleanup();
      return { video: v ? await v.path() : '' };
    }
  };
}

// What can be captured here: { playwright, video, screen, missing: [what to do] }.
function tools() {
  const { spawnSync } = require('child_process');
  const out = { playwright: false, video: false, screen: process.platform !== 'linux' || !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY), missing: [] };
  try { require.resolve('playwright', { paths: [ROOT] }); out.playwright = true; } catch {}
  if (out.playwright) {
    const cli = path.join(path.dirname(require.resolve('playwright/package.json', { paths: [ROOT] })), 'cli.js');
    const r = spawnSync(process.execPath, [cli, 'install', '--dry-run', 'ffmpeg'], { cwd: ROOT, encoding: 'utf8' });
    const m = /Install location:\s*(.+)/.exec(r.stdout || '');
    out.video = !!(m && fs.existsSync(m[1].trim()));
  }
  if (!out.playwright) out.missing.push('Playwright: run "npm run test:setup" once');
  else if (!out.video) out.missing.push('video (Playwright\'s ffmpeg): run "npx playwright install ffmpeg"');
  if (!out.screen) out.missing.push('a screen: run the script with "xvfb-run -a"');
  return out;
}

// Stills from a recorded video, to check it before using it. `times` in seconds; negative = from the end.
async function frames(video, times = [1, -0.3]) {
  const browser = await playwright().chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(require('url').pathToFileURL(video).href);
    const dur = await page.evaluate(() => new Promise(r => { const v = document.querySelector('video'); v.pause(); v.readyState >= 1 ? r(v.duration) : (v.onloadedmetadata = () => r(v.duration)); }));
    const out = [];
    for (const t0 of times) {
      const t = Math.max(0, Math.min(dur - 0.05, t0 < 0 ? dur + t0 : t0));
      await page.evaluate(t => new Promise(r => { const v = document.querySelector('video'); v.onseeked = r; v.currentTime = t; }), t);
      const file = video.replace(/\.\w+$/, '') + `-frame-${t.toFixed(1)}s.png`;
      await page.screenshot({ path: file });
      out.push(file);
    }
    return { duration: dur, files: out };
  } finally { await browser.close(); }
}

// Blur private details (names, chats, avatars) before a screenshot or recording.
const blur = (page, selectors) => page.addStyleTag({ content: `${selectors.join(',')}{filter:blur(6px)!important}` });

module.exports = { connect, launch, blur, frames, outDir, tools, isMain };
