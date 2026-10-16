// Shows whether the app's page looks different from another commit: for changes that shouldn't change how
// anything looks (moving code between files, tidying CSS). Local only; works on Windows, Mac and Linux.
//   npm run visual-diff                          this checkout (with uncommitted changes) vs where it left origin/main
//   npm run visual-diff -- --base main           ... vs another branch or commit
//   npm run visual-diff -- --only settings       only the states whose name contains "settings"
// Both copies are captured one after the other on this computer, so fonts and screen scaling are the same. The
// page is opened the way the UI tests open it (served locally, Kick, Twitch and YouTube blocked), with a fixed
// clock, a fixed Math.random and no animations, then put through a list of states (panels, menus, dialogs,
// layouts), each with the toolbar on top, on the left with labels and on the left icons only, in a dark and a
// light theme, at a wide and a narrow size. For each one it compares the screenshots pixel by pixel and every
// visible element's box and computed styles. The report (report.md, with before / after / diff pictures) goes
// in a temporary folder; the exit code is 1 when anything differs.
// Needs Playwright: npm run test:setup.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { base: '', only: '', jobs: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i] || '';
    else if (a === '--only') o.only = argv[++i] || '';
    else if (a === '--jobs') o.jobs = Math.max(1, +argv[++i] || 1);
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`Unknown option "${a}".`);
  }
  return o;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

// Serves one copy of the app's folder on a random local port.
function serve(root) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/plain; charset=utf-8';
      res.writeHead(200, { 'Content-Type': type });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
}

/* ---- What gets captured ---- */
const SIZES = [{ name: 'wide', width: 1600, height: 900 }, { name: 'narrow', width: 960, height: 720 }];
const BARS = [{ name: 'top', pos: 'top', labels: true }, { name: 'left-labels', pos: 'left', labels: true }, { name: 'left-icons', pos: 'left', labels: false }];
const THEMES = [{ name: 'dark', theme: null }, { name: 'light', theme: 'Daylight' }];

// Opens channels from the Channels box, as typing them there and pressing Open does.
async function add(page, ...links) {
  for (const l of links) {
    if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
    await page.fill('#savedInput', l); await page.click('#spOpen');
  }
  if (await page.isVisible('#savedPanel')) await page.click('#savedBtn');
}
async function addSaved(page, ...links) {
  for (const l of links) {
    if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
    await page.fill('#savedInput', l); await page.click('#spOpenSave');
  }
  if (await page.isVisible('#savedPanel')) await page.click('#savedBtn');
}
const three = page => add(page, 'https://kick.com/alpha', 'https://www.twitch.tv/bravo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
const settingsTab = s => async page => { await page.click('#settingsBtn'); await page.click(`#settingsDlg .st-rail [data-s=${s}]`); };
const clickIfShown = async (page, sel) => { const b = page.locator(sel).first(); if (await b.count() && await b.isVisible()) await b.click(); };
const layoutTab = t => async page => { await page.click('#layoutBtn'); const b = page.locator(`#layoutMenu .lm-tabs [data-t=${t}]`); if (await b.count()) await b.click(); };
async function someNotes(page) {
  await page.evaluate(() => {
    const n = window.smvNotes;
    n.flash('Saved layout', { subject: 'layouts', detail: 'Three streams' });
    n.flash('Logged out of Twitch', { subject: 'accounts', detail: 'Log in again to keep chat and follows working' });
    n.liveNote('alpha', { title: 'Speedrun practice', game: 'Celeste' });
  });
}

// Each state starts from a fresh page. intro: false shows the first-run welcome; otherwise it's marked done.
const STATES = [
  { name: 'welcome', intro: false, run: async () => {} },
  { name: 'launchpad', run: async () => {} },
  { name: 'windows-auto', run: three },
  { name: 'windows-tile', run: async page => { await three(page); await page.click('#tile'); } },
  { name: 'windows-chat-focus', run: async page => { await three(page); await page.click('#chatFocus'); } },
  { name: 'windows-columns', run: async page => { await three(page); await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=columns]'); await page.click('#layoutBtn'); } },
  { name: 'windows-many-tile', run: async page => { await add(page, 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'); await page.click('#tile'); } },
  { name: 'switch-control', run: async page => { await three(page); await page.click('#chatFocus'); if (await page.isVisible('#swBtn')) await page.click('#swBtn'); } },
  { name: 'channels-panel', run: async page => { await addSaved(page, 'alpha', 'bravo', 'https://www.twitch.tv/charlie'); await page.click('#savedBtn'); } },
  { name: 'channels-more-menu', run: async page => { await page.click('#savedBtn'); await page.click('#spMore'); } },
  { name: 'layout-menu', run: async page => { await three(page); await page.click('#layoutBtn'); } },
  { name: 'layout-menu-switch', run: async page => { await three(page); await layoutTab('switch')(page); } },
  { name: 'layout-menu-toolbar', run: layoutTab('toolbar') },
  { name: 'more-menu', run: async page => { if (await page.isVisible('#moreBtn')) await page.click('#moreBtn'); } },
  { name: 'bell', run: async page => { await someNotes(page); await page.click('#bellBtn'); } },
  { name: 'all-notifications', run: async page => { await someNotes(page); await page.click('#bellBtn'); await page.click('#bellAll'); } },
  { name: 'window-bar-menu', run: async page => { await three(page); const b = page.locator('#stage .win.stream [data-a=more]').first(); if (await b.count() && await b.isVisible()) await b.click(); } },
  { name: 'channel-dropdown', run: async page => { await three(page); const s = page.locator('#stage .win.stream .col-pick').first(); if (await s.count() && await s.isVisible()) await s.click(); } },
  { name: 'ask-dialog', run: async page => { await three(page); await page.click('#clear'); } },
  { name: 'profiles', run: async page => { await addSaved(page, 'alpha', 'bravo'); if (await page.isVisible('#profBtn')) await page.click('#profBtn'); } },
  { name: 'focus-mode', run: async page => { await three(page); await page.click('#focusBtn'); } },
  ...['general', 'notify', 'mentions', 'spam', 'youtube', 'layouts', 'themes', 'keys', 'updates', 'guide']   // (Accounts and Extensions are desktop only)
    .map(s => ({ name: 'settings-' + s, run: settingsTab(s) })),
];

// Runs before the app's own script: same settings, clock-independent randomness and no motion in both copies.
function initScript({ bar, intro }) {
  return `(() => {
    let seed = 42; Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    try {
      localStorage.setItem('kickMultiview.toolbar', JSON.stringify({ pos: ${JSON.stringify(bar.pos)}, labels: ${bar.labels} }));
      ${intro === false ? '' : `localStorage.setItem('kickMultiview.intro', JSON.stringify({ done: true, tips: true, tour: true }));`}
    } catch {}
    const still = () => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; (document.head || document.documentElement).appendChild(s); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', still); else still();
  })();`;
}

// Every visible element: its box and the computed styles that decide how it looks. Keyed by a path of tag, id
// and position, so the same element matches in both copies.
function readLayout() {
  const PROPS = ['display', 'visibility', 'opacity', 'position', 'z-index', 'color', 'background-color', 'background-image',
    'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'outline', 'box-shadow', 'text-shadow',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-align',
    'text-decoration-line', 'white-space', 'text-overflow', 'overflow-x', 'overflow-y', 'padding', 'margin', 'gap',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'grid-template-columns', 'grid-template-rows',
    'transform', 'filter', 'backdrop-filter', 'clip-path', 'cursor', 'fill', 'stroke', 'object-fit', 'content'];
  const key = el => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.id) { parts.unshift(e.localName + '#' + e.id); break; }
      const p = e.parentElement; let s = e.localName;
      if (p) { const same = [...p.children].filter(x => x.localName === e.localName); if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`; }
      parts.unshift(s);
    }
    return parts.join('>');
  };
  const out = {};
  const r1 = n => Math.round(n * 2) / 2;
  for (const el of document.querySelectorAll('body, body *')) {
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const cs = getComputedStyle(el);
    const o = { box: [r1(rect.x), r1(rect.y), r1(rect.width), r1(rect.height)], cls: typeof el.className === 'string' ? el.className : '', css: {} };
    for (const p of PROPS) o.css[p] = cs.getPropertyValue(p);
    for (const pe of ['::before', '::after']) {
      const ps = getComputedStyle(el, pe);
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal') for (const p of ['content', 'color', 'background-color', 'border-top', 'width', 'height']) o.css[pe + ' ' + p] = ps.getPropertyValue(p);
    }
    if (el.matches('input, select, textarea')) o.value = el.value;
    out[key(el)] = o;
  }
  return out;
}

async function settle(page) {
  await page.mouse.move(2, (page.viewportSize() || { height: 700 }).height - 2);   // off every button, so nothing is hovered
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.waitForTimeout(1500);   // the undo history records a change after a short pause (and enables Undo)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function capture(browser, url, job) {
  const { size, bar, theme, state } = job;
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(u => !u.href.startsWith(url), r => r.abort());
  await page.clock.setFixedTime(new Date('2026-03-14T15:09:26'));
  await page.addInitScript(initScript({ bar, intro: state.intro }));
  try {
    await page.goto(url + (job.page || '/src/index.html'));
    if (theme.theme) {
      await page.evaluate(name => {
        // Pick a built-in theme the way Settings > Themes does
        const dlg = document.querySelector('#settingsBtn'); if (dlg) dlg.click();
        const rail = document.querySelector('#settingsDlg .st-rail [data-s=themes]'); if (rail) rail.click();
        const item = [...document.querySelectorAll('#themePane .th-item')].find(b => (b.querySelector('b') || {}).textContent === name);
        if (item) item.click();
        const x = document.querySelector('#settingsDlg .help-x'); if (x) x.click();
      }, theme.theme);
    }
    await page.waitForTimeout(1000);   // the app starts its undo history 0.8 s after loading: act after that
    await state.run(page);
    await settle(page);
    const shot = await page.screenshot();
    const layout = await page.evaluate(readLayout);
    return { shot, layout, errors };
  } catch (e) {
    return { failed: String(e.message || e).split('\n')[0], errors };
  } finally {
    await context.close();
  }
}

// Pixel comparison in the browser (a canvas), so no image library is needed. Returns the number of pixels that
// differ, where, and a picture: unchanged pixels dimmed, changed ones red.
async function comparePixels(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const get = img => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = get(ia), db = get(ib);
    const out = new OffscreenCanvas(w, h), ox = out.getContext('2d'), od = ox.createImageData(w, h);
    let n = 0, maxD = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0; i < da.length; i += 4) {
      // up to 3/255 per colour is the browser's own drawing noise (the same page drawn twice can differ that much)
      const same = Math.abs(da[i] - db[i]) <= 3 && Math.abs(da[i + 1] - db[i + 1]) <= 3 && Math.abs(da[i + 2] - db[i + 2]) <= 3 && Math.abs(da[i + 3] - db[i + 3]) <= 3;
      if (!same) { n++; const p = i / 4, x = p % w, y = (p - x) / w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        maxD = Math.max(maxD, ...[0, 1, 2, 3].map(k => Math.abs(da[i + k] - db[i + k]))); }
      od.data[i] = same ? da[i] * 0.25 : 255; od.data[i + 1] = same ? da[i + 1] * 0.25 : 0; od.data[i + 2] = same ? da[i + 2] * 0.25 : 0; od.data[i + 3] = 255;
    }
    if (!n) return { n };
    const where = { x0, y0, x1, y1, maxD };
    ox.putImageData(od, 0, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { n, where, diff: btoa(s) };
  }, [a, b]);
}

function compareLayout(a, b) {
  const lines = [];
  for (const k of Object.keys(a)) if (!(k in b)) lines.push(`- gone: \`${k}\``);
  for (const k of Object.keys(b)) if (!(k in a)) lines.push(`- new: \`${k}\``);
  for (const k of Object.keys(a)) {
    if (!(k in b)) continue;
    const x = a[k], y = b[k];
    if (x.box.join() !== y.box.join()) lines.push(`- \`${k}\` box ${x.box.join(',')} → ${y.box.join(',')}`);
    if (x.cls !== y.cls) lines.push(`- \`${k}\` class "${x.cls}" → "${y.cls}"`);
    if (x.value !== y.value) lines.push(`- \`${k}\` value "${x.value}" → "${y.value}"`);
    for (const p of new Set([...Object.keys(x.css), ...Object.keys(y.css)])) if (x.css[p] !== y.css[p]) lines.push(`- \`${k}\` ${p}: ${x.css[p] ?? '(none)'} → ${y.css[p] ?? '(none)'}`);
  }
  return lines;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 14).map(l => l.slice(3)).join('\n')); return; }
  let pw;
  try { pw = require('playwright'); } catch { throw new Error('Playwright is not installed. Run "npm run test:setup" once, then try again.'); }

  const base = opt.base || git(['merge-base', 'HEAD', 'origin/main']);
  const baseSha = git(['rev-parse', '--short', base]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-visual-diff-'));
  const baseDir = path.join(tmp, 'base'), outDir = path.join(tmp, 'report');
  fs.mkdirSync(outDir);
  git(['worktree', 'add', '--detach', baseDir, base]);
  const servers = [];
  let browser;
  try {
    const [before, after] = await Promise.all([serve(fs.realpathSync(baseDir)), serve(ROOT)]);
    servers.push(before, after);
    browser = await pw.chromium.launch();

    const jobs = [];
    const states = STATES.filter(s => !opt.only || s.name.includes(opt.only));
    for (const state of states) for (const size of SIZES) for (const bar of BARS) for (const theme of THEMES)
      jobs.push({ state, size, bar, theme, id: `${state.name}.${size.name}.${bar.name}.${theme.name}` });
    if (!opt.only || 'switcher'.includes(opt.only)) for (const theme of THEMES)
      jobs.push({ state: { name: 'switcher', run: async () => {} }, size: { name: 'wide', width: 900, height: 600 }, bar: BARS[0], theme, page: '/src/switcher.html', id: `switcher.${theme.name}` });

    console.log(`Comparing ${jobs.length} captures: ${baseSha} (before) and this checkout (after)…`);
    const cmpPage = await (await browser.newContext()).newPage();
    const results = [];
    let done = 0;
    const work = async job => {
      const [a, b] = await Promise.all([capture(browser, before.url, job), capture(browser, after.url, job)]);
      const r = { id: job.id, lines: [], pixels: 0 };
      if (a.failed || b.failed) {
        if ((a.failed || '') !== (b.failed || '')) r.lines.push(`- the state couldn't be set up: before: ${a.failed || 'ok'}; after: ${b.failed || 'ok'}`);
      } else {
        const px = await comparePixels(cmpPage, 'data:image/png;base64,' + a.shot.toString('base64'), 'data:image/png;base64,' + b.shot.toString('base64'));
        r.pixels = px.n; r.where = px.where;
        r.lines.push(...compareLayout(a.layout, b.layout));
        if (px.n || r.lines.length) {
          fs.writeFileSync(path.join(outDir, `${job.id}.before.png`), a.shot);
          fs.writeFileSync(path.join(outDir, `${job.id}.after.png`), b.shot);
          if (px.diff) fs.writeFileSync(path.join(outDir, `${job.id}.diff.png`), Buffer.from(px.diff, 'base64'));
        }
      }
      if (a.errors.join() !== b.errors.join()) r.lines.push(`- page errors: before: ${a.errors.join('; ') || 'none'}; after: ${b.errors.join('; ') || 'none'}`);
      results.push(r);
      done++;
      if (done % 20 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
    };
    const queue = jobs.slice();
    await Promise.all(Array.from({ length: opt.jobs }, async () => { while (queue.length) await work(queue.shift()); }));

    // A few pixels with every element and style the same is the browser's drawing noise (edges of rounded corners)
    const NOISE = 10;
    const noise = results.filter(r => r.pixels && r.pixels <= NOISE && !r.lines.length).sort((a, b) => a.id.localeCompare(b.id));
    const changed = results.filter(r => (r.pixels > NOISE || r.lines.length)).sort((a, b) => a.id.localeCompare(b.id));
    const md = [`# Visual diff: ${baseSha} → this checkout`, '', `${jobs.length} captures, ${changed.length} with changes` +
      (noise.length ? `, ${noise.length} with only drawing noise (${NOISE} pixels or fewer, every element and style the same): ${noise.map(r => r.id).join(', ')}.` : '.'), ''];
    for (const r of changed) {
      md.push(`## ${r.id}`, '', `${r.pixels} pixels differ.`, '');
      if (fs.existsSync(path.join(outDir, `${r.id}.diff.png`))) md.push(`![before](${r.id}.before.png) ![after](${r.id}.after.png) ![diff](${r.id}.diff.png)`, '');
      md.push(...r.lines.slice(0, 60), r.lines.length > 60 ? `- … and ${r.lines.length - 60} more` : '', '');
    }
    fs.writeFileSync(path.join(outDir, 'report.md'), md.join('\n'));
    console.log(changed.length ? `\n${changed.length} of ${jobs.length} captures differ:` : `\nNo differences in ${jobs.length} captures.`);
    if (noise.length) console.log(`(${noise.length} more with only drawing noise: ${NOISE} pixels or fewer, every element and style the same.)`);
    for (const r of changed) console.log(`  ${r.id}: ${r.pixels} pixels${r.where ? ` in ${r.where.x0},${r.where.y0}–${r.where.x1},${r.where.y1} (up to ${r.where.maxD}/255)` : ''}, ${r.lines.length} element changes`);
    console.log(`Report: ${path.join(outDir, 'report.md')}`);
    process.exitCode = changed.length ? 1 : 0;
  } finally {
    if (browser) await browser.close();
    servers.forEach(s => s.close());
    try { git(['worktree', 'remove', '--force', baseDir]); } catch {}
  }
}

main().catch(e => { console.error(e.message || e); process.exitCode = 2; });
