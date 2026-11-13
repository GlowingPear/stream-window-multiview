// Stream Multiview — desktop app (Electron main process)
const { app, BrowserWindow, session, shell, ipcMain, Menu, screen, Notification, dialog, desktopCapturer, net, safeStorage, powerMonitor, clipboard, ClipboardItem, nativeImage, webContents } = require('electron');
const { createLiveWatcher, platformOf, validCh, normCh, withTimeout, keepLatest } = require('./live');
const { createHistory, profileSummary } = require('./profiles');
const { parse7tv, parseBttv, parseFfz, createEmoteStore } = require('./emote-lists');
const { stvGroup, bttvGroup, ffzGroup } = require('./emote-picker');
const { menuFor, drawnItems, translateTarget } = require('./context-menu');
const emoteClip = require('./emote-clip');
const { makeTranslator } = require('./translate');
const { createProfileQueue } = require('./profile-queue');
const { centre, describe, fill, placeParts } = require('./monitors');
const SmvFollows = require('../shared/follows');
const SmvSites = require('../shared/sites');
const { createSites } = require('./sites');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const extensions = require('./extensions');
const guard = require('./guard');
const { pageOptions } = require('./activity');
const { createErrorLog, createSiteLog, describeRequest, diagnostics, goneText, pageWhere } = require('./devlog');
const { createSampleStore, exportSamples, healthReport } = require('./event-samples');
const { createPartitionCare, HTTP_CACHE_MAX, CODE_CACHE_MAX, DAY } = require('./partitions');
const { openDb } = require('./db');

// Each site's chats + login window share one saved session per site (its partition in src/shared/sites.js), so you
// log in once. What differs by site is in its own module (sites/<id>/site.js): main.js asks the channel's site (sites.of).
const WEB_PARTITION = 'persist:kmv-web';      // other web pages: storage of their own, none of your logins
const partitionOf = id => SmvSites.byId[id].partition;
// A site's id from the page (an unknown one: the site with no prefix, as before)
const siteId = id => (SmvSites.IDS.includes(id) ? id : SmvSites.DEFAULT);

// The app used to be called "Kick Multiview": keep using that data folder (your logins, saved channels, layouts).
app.setName('Stream Multiview');
// npm run dev (scripts/dev.js): a developer copy with its own data folder, and its branch in the window titles.
// Addresses the tests (and developer copies) point at stand-ins: an installed copy only uses the real ones.
const devEnv = k => app.isPackaged ? '' : process.env[k] || '';
const DEV = !app.isPackaged && process.env.SMV_DEV_DATA ? { data: process.env.SMV_DEV_DATA, label: process.env.SMV_DEV_LABEL || 'dev' } : null;
if (DEV) {
  app.setPath('appData', DEV.data);
  app.on('browser-window-created', (_e, w) => w.on('page-title-updated', (e, t) => { e.preventDefault(); w.setTitle(`${t} [${DEV.label}]`); }));
}
{
  const oldData = path.join(app.getPath('appData'), 'Kick Multiview');
  const newData = path.join(app.getPath('appData'), 'Stream Multiview');
  app.setPath('userData', fs.existsSync(oldData) && !fs.existsSync(newData) ? oldData : newData);
}
// The app's code lives in src/; the project folder (package.json, help files) is one level up.
const SRC = path.join(__dirname, '..');            // src/: the page, the preloads and the icons
const APP_ROOT = path.join(SRC, '..');
const ICON = path.join(SRC, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Let streams start with sound when you want them to (the app has its own mute buttons).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Each saved storage's cache of the sites' files stays under a size (without it, each stream's grows past a gigabyte: partitions.js).
app.commandLine.appendSwitch('disk-cache-size', String(HTTP_CACHE_MAX));
// Windows: Chromium stops drawing a window it thinks is covered, and gets that wrong with several monitors, a
// fullscreen game or a screen capture: the streams' pictures stop while their sound goes on. Always draw them.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

if (!app.requestSingleInstanceLock()) { app.quit(); }

// Present as a normal Chrome browser so Kick's login / bot protection treats it like one.
const chromeUA = () => {
  const os = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
           : process.platform === 'win32'  ? 'Windows NT 10.0; Win64; x64'
           : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
};
const BROWSER_HEADERS = () => ({ 'User-Agent': chromeUA(), 'Accept-Language': 'en-US,en;q=0.9' });

// What any page may ask for (camera, microphone, notifications, opening other apps, devices…): only what the app
// needs, on every session as it's made (guard.js). The app's own pages are known by their window.
app.on('session-created', ses => guard.lockSession(ses, wc => appContents(wc)));
// An installed copy doesn't take the switches that let another program look inside it (and read its logins).
if (app.isPackaged && ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk', 'inspect-port', 'js-flags'].some(k => app.commandLine.hasSwitch(k))) app.exit(1);

/* ---------- main window position memory ---------- */
const stateFile = (name = 'window-state') => path.join(app.getPath('userData'), name + '.json');
function loadState(name) {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(name), 'utf8'));
    const onScreen = screen.getAllDisplays().some(d =>
      s.x >= d.bounds.x - 50 && s.y >= d.bounds.y - 50 &&
      s.x < d.bounds.x + d.bounds.width - 100 && s.y < d.bounds.y + d.bounds.height - 100);
    return onScreen ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch { return null; }
}
function saveState(win, name) {
  try { fs.writeFileSync(stateFile(name), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized(), fullscreen: win.isFullScreen() })); } catch {}
}

/* ---------- windows ---------- */
let mainWin = null;
let streamsWin = null;          // the popped-out streams window
let streamsReady = false;
let pendingStreams = [];        // streams waiting for the streams window to finish loading
let lastStreams = [];           // latest list of streams in the streams window (for bringing them back)
let quitting = false;

// Messages from the app's pages: each handler answers only the windows it's for (guard.js), so a web view, a
// pop-up or an extension's page can't reach them. appIpc: the main and streams windows; mainIpc: the main window
// only (updates, logins, extensions, settings that change what the app trusts); switcherIpc: the switch control.
const roleOf = guard.senderRole({
  files: { main: path.join(SRC, 'index.html'), streams: path.join(SRC, 'index.html'), switcher: path.join(SRC, 'switcher.html') },
  windows: () => ({ main: mainWin, streams: streamsWin, switcher: switcherWin })
});
const refused = (ch, e) => console.warn(`Refused "${ch}" from ${(e && e.senderFrame && e.senderFrame.url) || 'a page that has gone'}`);
const appIpc = guard.guardedIpc(ipcMain, roleOf, ['main', 'streams'], refused);
const mainIpc = guard.guardedIpc(ipcMain, roleOf, ['main'], refused);
const switcherIpc = guard.guardedIpc(ipcMain, roleOf, ['switcher'], refused);

/* ---------- Settings › Developer: the error log and the sites' last answers (devlog.js) ----------
   This side's warnings and errors, the page's and the chat helpers' go in the error log, kept for the next run too.
   Every request to the sites about channels goes in Requests, with its answer's text while
   Developer tools are on. Copy diagnostics puts them in a report with the app's version and the system. */
let devOn = false;                     // Settings › Developer › Developer tools (the page says)
const errorLog = createErrorLog({ saved: (() => { try { return JSON.parse(fs.readFileSync(stateFile('error-log'), 'utf8')); } catch { return []; } })() });
const siteLog = createSiteLog();
let errorSaveT = null;
const saveErrors = () => { clearTimeout(errorSaveT); errorSaveT = null; try { fs.writeFileSync(stateFile('error-log'), JSON.stringify(errorLog.toSave())); } catch {} };
function devError(src, where, msg) {
  if (!errorLog.add(src, where, msg)) return;
  if (!errorSaveT) errorSaveT = setTimeout(saveErrors, 5000);
  for (const w of [mainWin, streamsWin]) if (w && !w.isDestroyed()) w.webContents.send('dev:changed');
}
const errText = x => x instanceof Error ? String(x.stack || x.message).split('\n').slice(0, 3).join(' ') : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })();
for (const level of ['warn', 'error']) {
  const was = console[level].bind(console);
  console[level] = (...args) => { was(...args); try { devError('main', '', args.map(errText).join(' ')); } catch {} };
}
process.on('uncaughtExceptionMonitor', e => devError('main', 'crash', errText(e)));
// A page that stops answering or crashes, and a helper process that dies (the GPU's: every stream's picture stops),
// for finding out why streams froze.
const pageName = wc => {
  if (mainWin && !mainWin.isDestroyed() && mainWin.webContents === wc) return 'main window';
  if (streamsWin && !streamsWin.isDestroyed() && streamsWin.webContents === wc) return 'streams window';
  return pageWhere(wc.getURL());
};
app.on('web-contents-created', (_e, wc) => {
  wc.on('unresponsive', () => devError('main', pageName(wc), 'stopped responding'));
  wc.on('responsive', () => devError('main', pageName(wc), 'responding again'));
  wc.on('render-process-gone', (_ev, d) => { const m = goneText(d); if (m) devError('main', pageName(wc), 'page ' + m); });
});
app.on('child-process-gone', (_e, d) => { const m = goneText(d); if (m) devError('main', d.name || d.type + ' process', m); });
app.on('will-quit', saveErrors);
// Requests to the sites (Node's fetch: live checks, follows, profiles), each noted as it's answered.
const nodeFetch = globalThis.fetch;
const loggedFetch = via => async (url, opts = {}) => {
  const href = typeof url === 'string' ? url : url && (url.href || url.url), d = describeRequest(href, opts && opts.body);
  if (!d) return via(url, opts);
  const t0 = Date.now(), method = (opts && opts.method) || 'GET';
  try {
    const r = await via(url, opts);
    siteLog.record({ ...d, method, url: href, status: r.status, ms: Date.now() - t0, request: devOn && typeof opts.body === 'string' ? opts.body : undefined,
      body: devOn ? await r.clone().text().catch(() => null) : undefined });
    return r;
  } catch (e) { siteLog.record({ ...d, method, url: href, status: 0, ms: Date.now() - t0, request: devOn && typeof opts.body === 'string' ? opts.body : undefined, error: e && e.message }); throw e; }
};
globalThis.fetch = loggedFetch(nodeFetch);
// YouTube's pages, through Chromium's own network (as the app's windows load them): their answers' headers outgrew
// what Node's fetch takes (16 KB; it fails with "fetch failed", UND_ERR_HEADERS_OVERFLOW), so every live page check failed.
// Without the app's cookies: each request says what it needs (YouTube's consent, in its Cookie header). With them, the
// consent cookie YouTube stores when it sends one request to its "Before you continue" page (UK and EU) wins over the
// header, and every check after it gets that page too: no live stream, so live channels read as offline.
const pageFetch = loggedFetch((url, opts) => net.fetch(url, { ...opts, credentials: 'omit' }));
// a request made from inside a site's page (Kick's, with your login): what it got
const notePageRequest = (url, t0, r) => { const d = describeRequest(url); if (d) siteLog.record({ ...d, url, status: r ? r.status : 0, ms: Date.now() - t0, body: devOn && r && typeof r.body === 'string' ? r.body : undefined }); };
appIpc.on('dev:set', (_e, on) => { devOn = !!on; });
appIpc.on('dev:log', (_e, src, where, msg) => { if (['page', 'chat', 'stream'].includes(src)) devError(src, String(where || ''), String(msg || '')); });
appIpc.handle('dev:info', () => ({ errors: errorLog.list(), responses: siteLog.list() }));
appIpc.handle('dev:clear', () => { errorLog.clear(); siteLog.clear(); saveErrors(); return true; });
// The report: the page's part (its windows and settings, as lines) with this side's.
appIpc.handle('dev:report', async (_e, pageLines) => {
  const ds = screen.getAllDisplays(), prim = screen.getPrimaryDisplay();
  const gpuInfo = await Promise.race([app.getGPUInfo('basic').catch(() => null), new Promise(r => setTimeout(r, 2000, null))]);
  return diagnostics({
    app: { version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, chrome: process.versions.chrome },
    sys: { os: { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform] || process.platform, release: process.getSystemVersion ? process.getSystemVersion() : '',
      arch: process.arch, displays: ds.length, scale: prim && prim.scaleFactor, locale: app.getLocale(),
      gpuStatus: app.getGPUFeatureStatus(), gpuInfo, metrics: app.getAppMetrics(), uptime: process.uptime() },
    page: Array.isArray(pageLines) ? pageLines.map(l => String(l).slice(0, 300)).slice(0, 80) : [],
    errors: errorLog.list(), responses: siteLog.list()
  });
});
appIpc.handle('dev:save', async (e, text) => {
  const d = new Date(), two = n => String(n).padStart(2, '0');
  const name = `stream-multiview-diagnostics-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.txt`;
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { title: 'Save diagnostics', defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'Text', extensions: ['txt'] }] }).catch(() => null);
  if (!r || r.canceled || !r.filePath) return { saved: false };
  try { fs.writeFileSync(r.filePath, String(text || '')); return { saved: true, file: r.filePath }; } catch { return { saved: false, error: true }; }
});
/* ---------- the app's own data (db.js): streamer profiles, chat events, follow lists ----------
   One SQLite file in the data folder. What older versions kept in profiles.json, event-samples.json and follows.json
   is copied in the first time (the files stay, for going back to an older version). Closed last, as the app quits. */
const db = openDb(app.getPath('userData'), { log: m => console.warn(m) });
try { db.importFiles(app.getPath('userData')); } catch {}
app.on('quit', () => { try { db.close(); } catch {} });

/* ---------- Settings › Developer › Chat events (event-samples.js, #233) ----------
   Every kind of event the chats' connections bring, counted, with its last few samples (the chats' helpers send them,
   the page passes them on). Kept in a file for the next run; Export saves them without names, ids or words. */
const sampleStore = createSampleStore({ saved: db.get('eventSamples') });
let samplesSaveT = null;
const saveSamples = () => { clearTimeout(samplesSaveT); samplesSaveT = null; try { db.set('eventSamples', sampleStore.toSave()); } catch {} };
app.on('will-quit', saveSamples);
appIpc.on('samples:add', (_e, site, kinds) => { if (sampleStore.add(String(site), kinds) && !samplesSaveT) samplesSaveT = setTimeout(saveSamples, 30000); });
appIpc.handle('samples:info', () => sampleStore.list());
appIpc.handle('samples:clear', () => { sampleStore.clear(); saveSamples(); return true; });
appIpc.handle('samples:export', async (e, known, ignored) => {
  const d = new Date(), two = n => String(n).padStart(2, '0');
  const name = `stream-multiview-chat-events-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.json`;
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { title: 'Export chat events', defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'JSON', extensions: ['json'] }] }).catch(() => null);
  if (!r || r.canceled || !r.filePath) return { saved: false };
  try { fs.writeFileSync(r.filePath, JSON.stringify(exportSamples(sampleStore.list(), known, { version: app.getVersion(), ignored }), null, 2)); return { saved: true, file: r.filePath }; } catch { return { saved: false, error: true }; }
});
appIpc.handle('samples:report', async (e, report) => {
  const d = new Date(), two = n => String(n).padStart(2, '0');
  const name = `stream-multiview-all-report-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.json`;
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { title: 'Save the report', defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'JSON', extensions: ['json'] }] }).catch(() => null);
  if (!r || r.canceled || !r.filePath) return { saved: false };
  try { fs.writeFileSync(r.filePath, JSON.stringify(healthReport(report, sampleStore.list(), { version: app.getVersion() }), null, 2)); return { saved: true, file: r.filePath }; } catch { return { saved: false, error: true }; }
});

/* ---------- streams' own storage (partitions.js) ----------
   When each stream's storage was last used, and how big each storage was, is kept in partitions.json. At start-up,
   ones unused for a month, oversized Code Caches and the oldest streams past the total go; their files are deleted in
   the background. Every hour the sizes are measured again, caches past their size are cleared, and the oldest streams
   past the total go then too (the ones not opened since the app started; the others' caches are cleared). */
const partitionCare = createPartitionCare({ dir: path.join(app.getPath('userData'), 'Partitions'),
  saved: (() => { try { return JSON.parse(fs.readFileSync(stateFile('partitions'), 'utf8')); } catch { return null; } })() });
let partitionsSaveT = null;
const savePartitions = () => {
  clearTimeout(partitionsSaveT); partitionsSaveT = null;
  if (partitionCare.takeChanged()) try { fs.writeFileSync(stateFile('partitions'), JSON.stringify(partitionCare.toSave())); } catch {}
};
const savePartitionsSoon = () => { if (!partitionsSaveT) partitionsSaveT = setTimeout(savePartitions, 60000); };
// the storage Chromium has opened since the app started (it keeps their files open until it quits)
const openedParts = new Set();
app.on('session-created', ses => { try { if (ses.storagePath) openedParts.add(path.basename(ses.storagePath)); } catch {} });
const shownParts = () => new Set(webContents.getAllWebContents().map(wc => { try { return wc.getType() === 'webview' && wc.session.storagePath ? path.basename(wc.session.storagePath) : null; } catch { return null; } }).filter(Boolean));
// the streams still open as the app closes were in use today, however long ago they opened
app.on('will-quit', () => {
  for (const wc of webContents.getAllWebContents()) try { if (wc.getType() === 'webview' && wc.session.storagePath) partitionCare.use('persist:' + path.basename(wc.session.storagePath)); } catch {}
  savePartitions();
});
// A clear that doesn't finish (or fails) is noted in the error log, and doesn't hold up the next one
const clearing = (what, p, job) => Promise.race([job.then(() => true), new Promise(r => setTimeout(r, 60000, false))])
  .catch(() => false).then(ok => { if (!ok) console.warn(`Couldn't clear ${p}'s ${what}`); });
async function tidyPartitions() {
  await partitionCare.measure();
  const shown = shownParts();
  const { clear } = partitionCare.trim({ opened: name => openedParts.has(name), shown: name => shown.has(name) });
  savePartitions();
  await partitionCare.emptyTrash();
  for (const p of clear) {
    const ses = session.fromPartition(p);
    await clearing('Cache', p, ses.clearCache());
    await clearing('Code Cache', p, ses.clearCodeCaches({}));
  }
  for (const p of partitionCare.oversized('code', CODE_CACHE_MAX)) await clearing('Code Cache', p, session.fromPartition(p).clearCodeCaches({}));
  for (const p of partitionCare.oversized('http', 2 * HTTP_CACHE_MAX)) await clearing('Cache', p, session.fromPartition(p).clearCache());
}
app.whenReady().then(() => {
  setTimeout(tidyPartitions, 30000);
  setInterval(tidyPartitions, DAY / 24);
});
// Inspect: Chrome's developer tools for a stream's or chat's page in this window (they can read its logins, so only
// with Developer tools on, or in a developer copy).
const inspectView = (sender, id) => {
  const wc = webContents.fromId(+id);
  if (!wc || wc.isDestroyed() || wc.hostWebContents !== sender || (!devOn && !DEV)) return false;
  wc.openDevTools({ mode: 'detach' });
  return true;
};
appIpc.handle('dev:inspect', (e, id) => inspectView(e.sender, id));

const appWebPrefs = () => ({
  preload: path.join(SRC, 'preload', 'preload.js'),
  contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
  backgroundThrottling: false   // a window behind others still plays its streams at full speed
});
// macOS: the toolbar is the title bar. The traffic lights sit inside it (centred in its 52px) and the page makes
// the toolbar's empty space draggable. Other systems keep their normal frame.
const LIGHTS_AT = { x: 18, y: 19 };
const macBar = () => process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: LIGHTS_AT } : {};
// Tells the page when the window goes fullscreen (macOS hides the lights there, so the toolbar needs no room for them).
function trackFullscreen(win) {
  const send = () => { if (!win.isDestroyed()) win.webContents.send('win:fullscreen', win.isFullScreen()); };
  win.on('enter-full-screen', send);
  win.on('leave-full-screen', send);
  win.webContents.on('did-finish-load', send);
}
// Hide bar: the lights go away with the toolbar and come back when it peeks out.
// Full screen from the page (the search box's Full screen: the same as View › Toggle Full Screen)
appIpc.handle('win:toggleFullscreen', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
});
appIpc.on('win:lights', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || process.platform !== 'darwin') return;
  win.setWindowButtonVisibility(!!on);
  if (on) win.setWindowButtonPosition(LIGHTS_AT);   // macOS puts them back in the corner otherwise
});
// Hide bar on macOS: the window's top edge is its resize edge, and in fullscreen the menu bar's, so the page never
// hears the mouse arrive there. While the bar is hidden, the mouse is watched from here and the page told when it's up
// there. With the toolbar on the left it's the left edge (also a resize edge).
const topWatch = new Map();   // window id -> timer
appIpc.on('win:watchTop', (e, on, edge) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  clearInterval(topWatch.get(win.id));
  topWatch.delete(win.id);
  if (!on) return;
  const id = win.id;
  topWatch.set(id, setInterval(() => {
    if (win.isDestroyed()) { clearInterval(topWatch.get(id)); topWatch.delete(id); return; }
    if (!win.isVisible() || win.isMinimized()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside && (edge === 'left' ? p.x < b.x + 12 : p.y < b.y + 12)) win.webContents.send('win:top');
  }, 100));
});

function openStreamsWindow(specs = []) {
  pendingStreams.push(...specs);
  if (streamsWin) {
    if (streamsReady) flushStreams();
    streamsWin.show(); streamsWin.focus();
    return;
  }
  // The monitor the layout puts the streams on (Settings > Layouts > Monitors) comes first, then where you left it.
  const target = monitorById(monitorTargets.streams);
  const st = target ? null : loadState('streams-window-state');
  // Default: put it on a second monitor if there is one.
  let def = { width: 1280, height: 760 };
  const others = screen.getAllDisplays().filter(d => mainWin && d.id !== screen.getDisplayMatching(mainWin.getBounds()).id);
  if (target) def = fill(target, 40);
  else if (!st && others[0]) { const b = others[0].workArea; def = { x: b.x + 40, y: b.y + 40, width: b.width - 80, height: b.height - 80 }; }
  streamsReady = false;
  streamsWin = new BrowserWindow({
    ...(st ? { width: st.width || 1280, height: st.height || 760, x: st.x, y: st.y } : def),
    minWidth: 480, minHeight: 300, backgroundColor: '#0a0c0d', title: 'Stream Multiview – Streams', autoHideMenuBar: true, icon: ICON,
    ...macBar(), webPreferences: appWebPrefs()
  });
  trackFullscreen(streamsWin);
  if (target || st?.maximized || (!st && others[0])) streamsWin.maximize();
  if (st?.fullscreen) streamsWin.setFullScreen(true);
  streamsWin.loadFile(path.join(SRC, 'index.html'), { query: { role: 'streams' } });
  editMenuFor(streamsWin);
  streamsWin.webContents.on('will-navigate', e => e.preventDefault());
  streamsWin.webContents.on('did-finish-load', () => { streamsReady = true; flushStreams(); });
  streamsWin.on('close', () => saveState(streamsWin, 'streams-window-state'));
  streamsWin.on('closed', () => {
    streamsWin = null; streamsReady = false;
    // Closing the streams window on its own sends its streams back to the main window.
    if (!quitting && mainWin) { mainWin.webContents.send('streams:returned', lastStreams); }
    lastStreams = [];
    pearLink?.then(l => l?.streamsClosed());   // its players are gone (Connected apps)
    if (!quitting) mainWin?.webContents.send('streams:state', false);
  });
  mainWin?.webContents.send('streams:state', true);
}
function flushStreams() {
  if (!streamsWin || !pendingStreams.length) return;
  streamsWin.webContents.send('streams:add', pendingStreams);
  pendingStreams = [];
}

/* ---------- switch control in its own window ---------- */
let switcherWin = null, switcherReady = false, switcherLast = null, switcherQuiet = false;
function switcherPrefs() { try { return JSON.parse(fs.readFileSync(stateFile('switcher-window-state'), 'utf8')); } catch { return {}; } }
function openSwitcherWindow() {
  if (switcherWin) { switcherWin.show(); switcherWin.focus(); return; }
  const st = loadState('switcher-window-state'), pref = switcherPrefs();
  const target = monitorById(monitorTargets.switch);       // the monitor the layout puts it on, at the size you left it
  switcherReady = false;
  switcherWin = new BrowserWindow({
    ...(target ? centre(target, st?.width || 620, st?.height || 520)
      : st && st.width ? { width: st.width, height: st.height, x: st.x, y: st.y } : { width: 620, height: 520 }),
    minWidth: 320, minHeight: 160, backgroundColor: '#0a0c0d', title: 'Stream Multiview – Switch control', autoHideMenuBar: true, icon: ICON,
    alwaysOnTop: pref.onTop !== false,
    webPreferences: appWebPrefs()
  });
  switcherWin.loadFile(path.join(SRC, 'switcher.html'));
  switcherWin.webContents.on('will-navigate', e => e.preventDefault());
  switcherWin.webContents.on('did-finish-load', () => {
    switcherReady = true;
    switcherWin.webContents.send('switcher:pinned', switcherWin.isAlwaysOnTop());
    if (switcherLast) switcherWin.webContents.send('switcher:state', switcherLast);
  });
  switcherWin.on('close', () => {
    try { fs.writeFileSync(stateFile('switcher-window-state'), JSON.stringify({ ...switcherWin.getNormalBounds(), onTop: switcherWin.isAlwaysOnTop() })); } catch {}
  });
  switcherWin.on('closed', () => {
    switcherWin = null; switcherReady = false;
    // Closing it yourself puts the switch control back in the main window.
    if (!quitting && !switcherQuiet) mainWin?.webContents.send('switcher:closed');
    switcherQuiet = false;
  });
}
mainIpc.handle('switcher:open', () => openSwitcherWindow());
mainIpc.handle('switcher:close', () => { if (switcherWin) { switcherQuiet = true; switcherWin.close(); } });
mainIpc.on('switcher:state', (_e, st) => {
  switcherLast = st;
  if (switcherWin && switcherReady) switcherWin.webContents.send('switcher:state', st);
});
switcherIpc.on('switcher:cmd', (_e, cmd) => { if (cmd && typeof cmd.type === 'string') mainWin?.webContents.send('switcher:cmd', cmd); });
switcherIpc.handle('switcher:pin', (_e, on) => {
  if (!switcherWin) return false;
  switcherWin.setAlwaysOnTop(!!on);
  return switcherWin.isAlwaysOnTop();
});

/* ---------- monitors: each part of a layout on a monitor of its own (Settings > Layouts > Monitors) ----------
   The chats stay in the main window, which goes on the chats' monitor. Streams on another monitor go in the Streams
   window there, and the switch control in its own window (the page opens and closes those, as it does for Pop out). */
let monitorsTogether = true;                              // put everything back on one monitor when one is unplugged
const monitorTargets = { streams: null, switch: null };   // the monitor the Streams window / switch control window go on
const allMonitors = () => describe(screen.getAllDisplays(), screen.getPrimaryDisplay().id);
const monitorById = id => (id == null ? null : allMonitors().find(m => m.id === id) || null);
const monitorOf = win => (win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()).id : screen.getPrimaryDisplay().id);
// Puts a window on a monitor at the size it has, in the middle, maximized or fullscreen again if it was
function moveWin(win, m, { maximize } = {}) {
  if (!win || win.isDestroyed() || !m || monitorOf(win) === m.id) return;
  const full = win.isFullScreen(), max = maximize ?? win.isMaximized();
  const go = () => {
    if (win.isDestroyed()) return;
    if (win.isMaximized()) win.unmaximize();
    const b = win.getNormalBounds();
    win.setBounds(centre(m, b.width, b.height));
    if (max) win.maximize();
    if (full) win.setFullScreen(true);
  };
  if (full) { win.once('leave-full-screen', go); win.setFullScreen(false); } else go();
}
appIpc.handle('monitors:list', () => ({ monitors: allMonitors(), main: monitorOf(mainWin) }));
// The layout's parts ({ chats, streams, switch }: saved monitors or empty): moves the main window and any Streams or
// switch control window that's open, and says where each part goes so the page can pop the streams out or back.
mainIpc.handle('monitors:apply', (_e, parts, together) => {
  monitorsTogether = together !== false;
  const p = placeParts(parts, allMonitors(), monitorOf(mainWin));
  moveWin(mainWin, monitorById(p.chats));
  monitorTargets.streams = p.streams !== p.chats ? p.streams : null;
  monitorTargets.switch = p.switch !== p.chats ? p.switch : null;
  if (monitorTargets.streams != null) moveWin(streamsWin, monitorById(monitorTargets.streams), { maximize: true });
  if (monitorTargets.switch != null) moveWin(switcherWin, monitorById(monitorTargets.switch), { maximize: false });
  return p;
});
// Identify monitors: a big number in the middle of each one for a moment (it can't be clicked or take the focus)
mainIpc.handle('monitors:identify', () => {
  for (const m of allMonitors()) {
    const side = Math.max(160, Math.min(360, Math.round(Math.min(m.work.width, m.work.height) * 0.45)));
    const win = new BrowserWindow({
      ...centre(m, side, side), frame: false, transparent: true, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    win.setIgnoreMouseEvents(true);
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:rgba(10,12,13,.88);border:4px solid #53fc18;border-radius:28px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff;user-select:none">
      <div style="font-size:${Math.round(side * 0.55)}px;font-weight:800;line-height:1;color:#53fc18">${m.n}</div>
      <div style="margin-top:8px;font-size:${Math.round(side * 0.075)}px;opacity:.85">${m.w} × ${m.h}${m.primary ? ' · main' : ''}</div></body>`;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.showInactive(); });
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 2500);
  }
});
// A monitor was plugged in, unplugged or changed (moved, resized, turned) in the system's settings
function monitorsChanged(kind) {
  if (kind === 'removed' && monitorsTogether) {
    monitorTargets.streams = monitorTargets.switch = null;
    streamsWin?.close();                                   // its streams come back to the main window
    switcherWin?.close();                                  // the switch control goes back into the main window
  }
  // the main window on a monitor that's there (Windows moves it by itself; macOS may leave it off screen)
  if (mainWin && !mainWin.isDestroyed()) {
    const b = mainWin.getBounds();
    const seen = screen.getAllDisplays().some(d => b.x < d.bounds.x + d.bounds.width - 100 && b.x + b.width > d.bounds.x + 100 &&
      b.y < d.bounds.y + d.bounds.height - 50 && b.y + 40 > d.bounds.y);
    if (!seen) moveWin(mainWin, monitorById(screen.getPrimaryDisplay().id));
    mainWin.webContents.send('monitors:changed', { kind, monitors: allMonitors(), main: monitorOf(mainWin) });
  }
}
app.whenReady().then(() => {
  screen.on('display-removed', () => monitorsChanged('removed'));
  screen.on('display-added', () => monitorsChanged('added'));
  screen.on('display-metrics-changed', () => monitorsChanged('changed'));
});

// A site's own pages use its login; any other page gets storage of its own, without your logins.
function partitionFor(url) {
  try { const s = SmvSites.siteOfHost(new URL(url).hostname); if (s) return s.partition; } catch {}
  return WEB_PARTITION;
}
function openSiteWindow(url, width = 1100, height = 780, partition) {
  if (!/^https:\/\//.test(url)) return;
  const part = partition || partitionFor(url);
  const clamp = (n, d) => Math.round(Math.min(4000, Math.max(200, Number(n) || d)));
  const win = new BrowserWindow({
    width: clamp(width, 1100), height: clamp(height, 780), backgroundColor: '#0a0c0d', autoHideMenuBar: true, title: 'Stream Multiview', icon: ICON,
    webPreferences: { partition: part, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (part !== WEB_PARTITION) keepOnSites(win.webContents);   // a window with a login stays on the sites
  win.loadURL(url);
  return win;
}
// A window that has your login: it stays on the sites and their sign-in pages; any other page opens in your browser.
function keepOnSites(wc) {
  const keep = (e, url, isMain = true) => {
    const main = e && 'isMainFrame' in e ? e.isMainFrame : isMain;
    if (!main || guard.mayNavigate(url)) return;
    e.preventDefault();
    openExternal(url);
  };
  wc.on('will-navigate', keep);
  wc.on('will-redirect', (e, url, _inPlace, isMain) => keep(e, url, isMain));
}
// Opens an address in your browser: http and https only.
const openExternal = url => { const u = guard.webUrl(url); if (u) shell.openExternal(u).catch(() => {}); };

// A text box in the app's own page (ALL's box, the Channels box, Settings' boxes): its right-click menu is the page's
// own (page/shared/edit-menu.js). This says what's under the pointer (a misspelled word and Chromium's suggestions,
// what can be done) and does what's chosen there.
function editMenuFor(win) {
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable) return;
    const f = p.editFlags || {};
    win.webContents.send('page:edit-menu', { x: p.x, y: p.y, word: p.misspelledWord || '', sugs: (p.dictionarySuggestions || []).slice(0, 5),
      can: { undo: !!f.canUndo, redo: !!f.canRedo, cut: !!f.canCut, copy: !!f.canCopy, paste: !!f.canPaste, selectAll: f.canSelectAll !== false } });
  });
}
appIpc.on('page:edit', (e, a) => {
  const wc = e.sender; if (!a || typeof a.do !== 'string') return;
  if (a.do === 'replaceMisspelling' && typeof a.word === 'string') wc.replaceMisspelling(a.word);
  else if (a.do === 'addWord' && typeof a.word === 'string') wc.session.addWordToSpellCheckerDictionary(a.word);
  else if (['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].includes(a.do)) wc[a.do]();
});
function createMain() {
  const st = loadState();
  mainWin = new BrowserWindow({
    width: st?.width || 1600, height: st?.height || 900, x: st?.x, y: st?.y,
    minWidth: 800, minHeight: 500, backgroundColor: '#0a0c0d', title: 'Stream Multiview', autoHideMenuBar: true, icon: ICON,
    ...macBar(), webPreferences: appWebPrefs()
  });
  trackFullscreen(mainWin);
  if (st?.maximized) mainWin.maximize();
  mainWin.loadFile(path.join(SRC, 'index.html'));
  mainWin.webContents.on('will-navigate', e => e.preventDefault());
  editMenuFor(mainWin);
  mainWin.on('close', () => {
    saveState(mainWin);
    // Closing the main window quits the app; leave the streams popped out for next launch.
    quitting = true;
    streamsWin?.close();
    switcherWin?.close();
    watcher.stop();
    sites.list.forEach(a => a.close && a.close());   // (a site's hidden windows must not keep the app running)
  });
  mainWin.on('closed', () => { mainWin = null; });
  mainWin.on('resize', () => { if (shapeState !== 'none') applyGameShape(); placeGameSoon(); });
  mainWin.on('move', placeGameSoon);
}

/* ---------- link / popup handling for every web view ---------- */
/* ---------- right-click menu in chat and stream windows (context-menu.js) ---------- */
const savingAs = new Map(), hookedSessions = new WeakSet();   // "Save image as…": the picture's address -> the name to suggest
const IMAGE_EXT = { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg' };
function hookSaveAs(ses) {
  if (hookedSessions.has(ses)) return;
  hookedSessions.add(ses);
  ses.on('will-download', (_e, item) => {
    if (!savingAs.has(item.getURL())) return;                  // a download of the page's own: as usual
    const name = savingAs.get(item.getURL()); savingAs.delete(item.getURL());
    const ext = IMAGE_EXT[String(item.getMimeType() || '').toLowerCase()] || path.extname(item.getFilename()) || '';
    const base = String(name || path.parse(item.getFilename()).name || 'image').replace(/[^\w.\-]+/g, '_').replace(/^[._]+/, '').slice(0, 60) || 'image';
    item.setSaveDialogOptions({ title: 'Save image', defaultPath: path.join(app.getPath('downloads'), base + ext) });
  });
}
function runMenuAct(wc, a) {
  if (!a || wc.isDestroyed()) return;
  switch (a.do) {
    case 'external': openExternal(a.url); break;
    case 'copyText': clipboard.writeText(String(a.text || '')).catch(() => {}); break;
    case 'openImage': openSiteWindow(a.url, 520, 520, WEB_PARTITION); break;   // a picture from chat: none of your logins
    case 'saveImage': if (/^https?:\/\//i.test(a.url)) { hookSaveAs(wc.session); savingAs.set(a.url, a.name); wc.downloadURL(a.url); } break;
    case 'copyImage': wc.copyImageAt(a.x, a.y); break;
    case 'copyEmote':   // the app's page makes the still and copies it (see copyEmote in views.js)
      if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) wc.hostWebContents.send('view:copy-emote', JSON.stringify({ url: a.url, small: a.small, name: a.name }));
      break;
    case 'replaceMisspelling': wc.replaceMisspelling(a.word); break;
    case 'addWord': wc.session.addWordToSpellCheckerDictionary(a.word); break;
    case 'inspect': wc.inspectElement(a.x, a.y); break;
    case 'undo': case 'redo': case 'cut': case 'copy': case 'paste': case 'selectAll': case 'reload': wc[a.do](); break;
    // translating a chat: the app's page runs it (it talks to the chat and remembers it per chat)
    case 'translateChat': case 'translateAuto': case 'translateStop': case 'translateOne':
      if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) wc.hostWebContents.send('view:translate', wc.id, { do: a.do, tl: a.tl, on: !!a.on });
      break;
    // Developer tools: the chat's last messages and the list around them; how the message was read for alerts (the page shows it)
    case 'copyChatHtml': copyChatHtml(wc); break;
    case 'whyAlert':
      if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) wc.hostWebContents.send('view:why', wc.id);
      break;
    // a shoutout of who sent the message (Settings › Shoutouts): the app's page builds it and sends it in this chat
    case 'shoutout':
      if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) wc.hostWebContents.send('view:shoutout', wc.id, a.who);
      break;
  }
}
async function copyChatHtml(wc) {
  const r = await withTimeout(wc.executeJavaScript('window.__kmvMsg && window.__kmvMsg.chatHtml ? window.__kmvMsg.chatHtml(30) : null', true).catch(() => null), 3000, null);
  const host = wc.hostWebContents, tell = d => { if (host && !host.isDestroyed()) host.send('dev:copied', d); };
  if (!r || typeof r.html !== 'string') { tell({ what: 'chat', failed: true }); return; }
  let where = ''; try { const u = new URL(wc.getURL()); where = u.host + u.pathname; } catch {}
  const text = `<!-- Stream Multiview ${app.getVersion()} · ${where} · the last ${r.n} of ${r.total} messages · ${new Date().toISOString()} -->\n${r.html}`;
  clipboard.writeText(text);
  tell({ what: 'chat', n: r.n, bytes: Buffer.byteLength(text) });
}
// What the page under the pointer says about it: the emote there (emoteAgent), the chat message there (messageAgent)
// and whether it's a chat being translated (translateAgent). Only from chat windows the app loaded its helpers into; quick, or nothing.
async function viewContext(wc) {
  const js = '({ emote: window.__kmvEmote && window.__kmvEmote.ctx ? window.__kmvEmote.ctx() : null, chat: window.__kmvTr ? window.__kmvTr.state() : null, message: window.__kmvMsg ? window.__kmvMsg.ctx() : null })';
  const got = await Promise.race([wc.executeJavaScript(js).catch(() => null), sleep(400).then(() => null)]);
  return got && typeof got === 'object' ? got : {};
}
// The emote menu is drawn by the app's page (it has the big preview); it sends back which item was chosen.
const drawnMenus = new Map();   // web view id -> its menu's items
const appPage = wc => !!wc && !wc.isDestroyed() && /\/index\.html(\?|$)/.test(wc.getURL());
async function showViewMenu(wc, params) {
  const langs = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()) || [app.getLocale()];
  const ctx = wc.hostWebContents ? await viewContext(wc) : {};
  if (wc.isDestroyed()) return;
  const emote = ctx.emote && typeof ctx.emote === 'object' && typeof ctx.emote.text === 'string' && params.mediaType === 'image' ? ctx.emote : null;
  const chat = ctx.chat && typeof ctx.chat === 'object' ? { on: !!ctx.chat.on, auto: !!ctx.chat.auto } : null;
  const m = ctx.message && typeof ctx.message === 'object' ? ctx.message : null;
  const message = m && chat ? { text: String(m.text || ''), withEmotes: String(m.withEmotes || ''), html: String(m.html || ''), name: String(m.name || ''), shout: m.shout && typeof m.shout === 'object' ? m.shout : null } : null;
  const items = menuFor(params, { langs, dev: !!DEV, devTools: devOn, emote, chat, message });
  if (!items.length) return;
  const host = wc.hostWebContents;
  if (emote && appPage(host)) {
    const d = drawnItems(items);
    drawnMenus.set(wc.id, d.byId);
    host.send('view:menu', wc.id, {
      emote: { name: String(emote.name || '').slice(0, 60), site: String(emote.site || ''), big: String(emote.big || ''), small: String(emote.small || ''), animated: !!emote.animated, x: +emote.x || 0, y: +emote.y || 0 },
      items: d.items
    });
    return;
  }
  const tmplOf = list => list.map(x => x.type ? x : x.sub ? { label: x.label, submenu: tmplOf(x.sub) } : { label: x.label, enabled: x.enabled !== false, click: () => runMenuAct(wc, x.act),
    ...('checked' in x ? { type: 'checkbox', checked: !!x.checked } : {}) });
  const tmpl = tmplOf(items);
  const win = host && BrowserWindow.fromWebContents(host);
  Menu.buildFromTemplate(tmpl).popup(win ? { window: win } : {});
}
appIpc.on('view:menu-act', (e, id, i) => {
  const items = drawnMenus.get(id); drawnMenus.delete(id);
  const wc = items && webContents.fromId(id);
  const x = items && items[i];   // (by its number: see drawnItems)
  if (!wc || !x || x.type || x.enabled === false || wc.hostWebContents !== e.sender) return;   // only the page that drew it
  runMenuAct(wc, x.act);
});
appIpc.on('view:menu-close', (_e, id) => drawnMenus.delete(id));
// Translating chat messages for the app's page (see translateAgent in index.html)
const translateTexts = makeTranslator(async url => {
  const r = await Promise.race([net.fetch(url, { headers: BROWSER_HEADERS() }), sleep(8000).then(() => null)]);
  if (!r) throw new Error('timeout');
  if (!r.ok) { const err = new Error('refused'); err.status = r.status; throw err; }
  return r.json();
});
appIpc.handle('translate:texts', (_e, texts, tl) => translateTexts(texts, tl || translateTarget((app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()) || [app.getLocale()])));

app.on('web-contents-created', (_e, wc) => {
  // the streams' and chats' own pages (not the app's page, which has its own right-click)
  if (wc.getType() === 'webview') wc.on('context-menu', (_ev, params) => showViewMenu(wc, params));
  try { wc.setUserAgent(chromeUA()); } catch {}
  // Web views start with their sound off; the page turns it on once it's ready (a stream: once its volume is set).
  if (wc.getType() === 'webview') try { wc.setAudioMuted(true); } catch {}   // every view (incl. each stream's private storage) looks like normal Chrome
  // Sign-in pages that refuse the app as it is (Google's) get another browser's identity (see signInAs below);
  // everything else stays Chrome.
  const syncUA = (url, isMain) => {
    if (!isMain) return;
    const as = signInAs(url);
    const want = as ? as.userAgent() : chromeUA();
    try { if (wc.getUserAgent() !== want) wc.setUserAgent(want); } catch {}
    if (as) signinWcs.add(wc.id); else signinWcs.delete(wc.id);
  };
  wc.on('did-start-navigation', (d, url, _inPlace, isMain) => syncUA(d && d.url ? d.url : url, d && 'isMainFrame' in d ? d.isMainFrame : isMain));
  wc.on('will-redirect', (d, url, _inPlace, isMain) => syncUA(d && d.url ? d.url : url, d && 'isMainFrame' in d ? d.isMainFrame : isMain));
  wc.on('destroyed', () => signinWcs.delete(wc.id));
  // Web views: no preload or Node, sandboxed, https only, and only the app's own storage (guard.js).
  wc.on('will-attach-webview', (ev, webPreferences, params) => {
    if (!guard.lockWebview(webPreferences, params)) return ev.preventDefault();
    webPreferences.backgroundThrottling = false;   // nor slowed down when the window is behind others
    if (partitionCare.use(params.partition)) savePartitionsSoon();
  });
  // When you last clicked or typed in this page: a page opens links in your browser only just after that.
  wc.on('input-event', (_ev, input) => {
    if (!/^(mouseDown|rawKeyDown|keyDown|gestureTap|touchStart)$/.test(input.type)) return;
    lastInput.set(wc.id, Date.now());
    // a press in a stream or chat: the page makes it the active window (from Electron 44 on, a <webview> has no focus event)
    const host = wc.getType() === 'webview' && /^(mouseDown|gestureTap|touchStart)$/.test(input.type) ? wc.hostWebContents : null;
    if (host && !host.isDestroyed() && appContents(host)) host.send('view:pressed', wc.id);
  });
  wc.on('destroyed', () => lastInput.delete(wc.id));
  // Ctrl+K (⌘K on a Mac) in a stream or chat: a web view keeps its keys, so the search box of the window holding it opens
  if (wc.getType() === 'webview') wc.on('before-input-event', (ev, input) => {
    const mod = process.platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
    if (input.type !== 'keyDown' || !mod || input.alt || input.shift || String(input.key).toLowerCase() !== 'k') return;
    const host = wc.hostWebContents;
    if (!host || host.isDestroyed() || !appContents(host)) return;
    ev.preventDefault();
    host.send('palette:open');
  });
  wc.setWindowOpenHandler(({ url }) => {
    const fromApp = appContents(wc), recent = Date.now() - (lastInput.get(wc.id) || 0) < 5000;
    const how = guard.popupFor(url, { fromApp, recent });
    // The sites and their sign-in pages open inside the app, with the login of the page that opened them.
    if (how === 'app') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 560, height: 760, autoHideMenuBar: true, backgroundColor: '#0a0c0d', icon: ICON,
          webPreferences: { session: wc.session, contextIsolation: true, nodeIntegration: false, sandbox: true }   // same login as the page that opened it
        }
      };
    }
    // Anything else (links posted in chat, etc.) opens in your normal browser.
    if (how === 'external') openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', win => keepOnSites(win.webContents));
});
const lastInput = new Map();       // web contents id -> when you last clicked or typed in it
// The app's own windows (not a web view in them, a pop-up or an extension's page)
const appContents = wc => [mainWin, streamsWin, switcherWin].some(w => w && !w.isDestroyed() && w.webContents === wc);

/* ---------- messages from the multiview page ---------- */
appIpc.handle('open-window', (_e, url, w, h, opts) => {
  const win = openSiteWindow(url, w, h);
  if (win && opts && opts.muted) win.webContents.setAudioMuted(true);   // e.g. a channel page opened for its popups, not to watch
});
appIpc.handle('open-external', (_e, url) => { openExternal(url); });

// Streams pop-out window
const cleanSpecs = list => (Array.isArray(list) ? list : []).filter(s => s && typeof s.channel === 'string' && validCh(normCh(s.channel)))
  .map(s => ({ channel: s.channel, vol: +s.vol || 0, muted: !!s.muted,
    // a tab of a window with several sites (the page's windows/frames.js): which window, and whether it's the one shown
    ...(typeof s.frame === 'string' && /^f[a-z0-9]{1,20}$/.test(s.frame) ? { frame: s.frame, hiddenTab: !!s.hiddenTab } : {}) }));
mainIpc.handle('streams:open', (_e, specs) => { openStreamsWindow(cleanSpecs(specs)); });
appIpc.handle('streams:close', () => { streamsWin?.close(); });
appIpc.handle('streams:isOpen', () => !!streamsWin);
appIpc.on('streams:report', (_e, list) => { lastStreams = cleanSpecs(list); });
// Chat over the stream: new chat lines from the main window, for its channel's streams popped out into the Streams window
mainIpc.on('streams:chat', (_e, p) => {
  if (!streamsWin || streamsWin.isDestroyed() || !streamsReady || !p || typeof p.ch !== 'string' || p.ch.length > 120 || !Array.isArray(p.msgs)) return;
  streamsWin.webContents.send('streams:chat', { ch: p.ch, msgs: p.msgs.slice(-15) });   // (at most what Settings > Chat lets show at once)
});

/* ---------- Connected apps: the link with Pear Drops (link.js) ---------- */
// Made the first time the page asks (after the app is ready, for safeStorage). The page sends its Connect
// switch (the link.peardrops setting) at start and when it changes: this process can't read the page's settings.
let pearLink, activityTimer = null;
// The Activity view fetches its page again when there's something new: told at most every 300 ms.
function activityChanged() {
  if (activityTimer) return;
  activityTimer = setTimeout(() => { activityTimer = null; if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('link:activity'); }, 300);
}
// The link, once made (a promise: it asks safeStorage whether it can encrypt first), or null when it can't be.
function getPearLink() {
  if (pearLink !== undefined) return pearLink;
  const appWins = () => [mainWin, streamsWin].filter(w => w && !w.isDestroyed());
  pearLink = Promise.resolve().then(() => require('./link').createPearLink({
    version: app.getVersion(), userData: app.getPath('userData'), appData: app.getPath('appData'),
    dev: !app.isPackaged && !!process.env.SMV_DEV_DATA, safeStorage,
    send: st => appWins().forEach(w => w.webContents.send('link:state', st)),
    activity: activityChanged,
    log: (level, text) => { if (level !== 'info') console.warn('[grapevine]', text); }
  })).catch(e => { console.warn('Connected apps are unavailable:', e.message); return null; });   // e.g. its package not installed yet
  return pearLink;
}
// Runs fn with the link, or gives `none` without one.
const withLink = (fn, none = null) => getPearLink().then(l => l ? fn(l) : none);
const fromStreams = e => !!streamsWin && e.sender === streamsWin.webContents;
mainIpc.handle('link:set', (_e, on) => withLink(l => l.setOn(on)));
appIpc.handle('link:state', () => withLink(l => l.state()));
mainIpc.handle('link:disconnect', () => withLink(l => l.disconnect()));
mainIpc.handle('link:pair-again', () => withLink(l => l.pairAgain()));
mainIpc.handle('link:allow', () => withLink(l => l.allowPairing()));
appIpc.handle('link:icon', () => withLink(l => l.icon(), ''));
appIpc.handle('link:show', () => withLink(l => l.showPearDrops(), { shown: false }));
appIpc.handle('link:showReward', () => withLink(l => l.showReward(), { shown: false }));
appIpc.handle('link:test', () => withLink(l => l.test(), { ok: false, reason: 'unknown', text: "Connected apps aren't available in this copy" }));
appIpc.handle('link:activity', (_e, opts) => withLink(l => l.activityPage(pageOptions(opts))));
appIpc.on('link:note', (_e, text) => withLink(l => l.playersNote(text)));
appIpc.on('link:players', (e, report) => { const role = fromStreams(e) ? 'streams' : 'main'; withLink(l => l.playersReport(role, report)).catch(err => console.warn('[grapevine]', err.message)); });
app.on('before-quit', () => { pearLink?.then(l => l?.stop()); });

/* ---------- Settings › Sync: saved channels and settings, the same on every computer (sync.js) ----------
   The page sends its synced values at start (sync:hello, the main window) and each change after (sync:changed,
   either window); what other computers changed goes back to the main window as sync:pull. */
const sync = require('./sync').createSync({
  userData: app.getPath('userData'), version: app.getVersion(),
  // tests and captures: where to look for the folders already synced, and the computer's name
  ...(devEnv('SMV_SYNC_HOME') ? { home: devEnv('SMV_SYNC_HOME'), env: {} } : {}), ...(devEnv('SMV_SYNC_HOST') ? { hostname: devEnv('SMV_SYNC_HOST') } : {}),
  ...(+devEnv('SMV_SYNC_CHECK_MS') > 0 ? { checkMs: +devEnv('SMV_SYNC_CHECK_MS') } : {}),   // (the launch tests: a second, not a minute)
  ...(+devEnv('SMV_SYNC_REACH_MS') > 0 ? { reachMs: +devEnv('SMV_SYNC_REACH_MS') } : {}),   // (and "hasn't got your changes" after seconds)
  send: (ch, d) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, d); },
  log: m => console.warn(m)
});
const syncKey = k => typeof k === 'string' && k.length <= 60 && /^[\w.]+$/.test(k);
const syncValue = v => v === null || (typeof v === 'string' && v.length <= 12e6);   // (an alert sound is a data: URL)
mainIpc.handle('sync:hello', (_e, d) => {
  const values = {}, versions = {};
  for (const [k, v] of Object.entries((d && d.values) || {})) if (syncKey(k) && syncValue(v)) values[k] = v;
  for (const [k, v] of Object.entries((d && d.versions) || {})) if (syncKey(k) && Number.isInteger(v) && v > 0) versions[k] = v;
  return sync.hello({ values, versions });
});
appIpc.on('sync:changed', (_e, k, v) => { if (syncKey(k) && syncValue(v)) sync.changed(k, v); });
mainIpc.handle('sync:status', () => sync.status());
mainIpc.handle('sync:folders', () => sync.folders());
mainIpc.handle('sync:pick', async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: 'Choose a folder your sync app keeps the same on every computer', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
const syncFolder = f => typeof f === 'string' && f.length < 1000 && path.isAbsolute(f);
mainIpc.handle('sync:peek', (_e, folder) => syncFolder(folder) ? sync.peek(folder) : { ok: false, others: [] });
mainIpc.handle('sync:start', (_e, folder, mode) => syncFolder(folder) ? sync.start({ folder, mode: ['combine', 'theirs', 'mine'].includes(mode) ? mode : 'combine' }) : { ok: false });
mainIpc.handle('sync:stop', () => sync.stop());
mainIpc.handle('sync:now', () => sync.syncNow());
mainIpc.handle('sync:rename', (_e, name) => sync.rename(typeof name === 'string' ? name : ''));
mainIpc.handle('sync:forget', (_e, device) => sync.forget(typeof device === 'string' ? device : ''));
mainIpc.handle('sync:what', (_e, what) => sync.setWhat(what && typeof what === 'object' ? what : {}));
mainIpc.handle('sync:undo', () => sync.undo());
mainIpc.handle('sync:show', () => { const s = sync.status(); return s.dir ? shell.openPath(s.dir) : ''; });
app.on('will-quit', () => sync.close());
// A raid one window followed: the other window (main or streams pop-out) follows it too.
appIpc.on('raid:followed', (e, from, to) => {
  if (typeof from !== 'string' || typeof to !== 'string' || !validCh(normCh(from)) || !validCh(normCh(to))) return;
  [mainWin, streamsWin].forEach(w => { if (w && !w.isDestroyed() && w.webContents !== e.sender) w.webContents.send('raid:follow', from, to); });
});
// The pointer over a point of one of this window's own chat or stream pages (ALL's Twitch replies: Twitch only shows
// a line's Reply under a real pointer). Only a move: no click, no keys; only a page this window holds.
appIpc.handle('view:hover', (e, id, x, y) => {
  if (!Number.isInteger(id) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== e.sender) return false;
  wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
  return true;
});
appIpc.handle('chat:add', (_e, channel) => {
  if (typeof channel === 'string' && validCh(normCh(channel)) && mainWin) { mainWin.webContents.send('chat:add', channel); mainWin.focus(); }
});

/* ---------- the sites (sites/<id>/site.js) ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NET_TIMEOUT = 20000;   // one request to a site: after this it counts as no answer (a dead connection never ends)
const netSignal = () => AbortSignal.timeout(NET_TIMEOUT);
let importing = null;        // the site whose follow list is being read (one at a time)
// What each site's module shares with this file (see the top of sites/index.js)
const sites = createSites(site => ({
  site,
  session: () => session.fromPartition(site.partition),
  sessionOf: p => session.fromPartition(p),
  BrowserWindow,
  fetch: (url, opts) => globalThis.fetch(url, opts),   // (the one that notes requests for Settings › Developer)
  pageFetch, getJson, headers: BROWSER_HEADERS,
  netSignal, netTimeout: NET_TIMEOUT, sleep, notePageRequest, devEnv, stateFile, safeStorage,
  toMain: (ch, ...args) => mainWin?.webContents.send(ch, ...args),
  ipc: { app: appIpc, main: mainIpc },
  progress: text => progress(site.id, text),
  follows: { saved: () => followStore()[site.id], keep: items => keepFollows(site.id, items), changed: () => followsChanged() },
  importing: { busy: () => !!importing, run: async fn => { importing = site.id; try { return await fn(); } finally { importing = null; } } },
  live: { snapshot: () => watcher.snapshot(), checkSoon: () => watcher.checkSoon() },
  scrapeFollowPage: (url, opts) => scrapeFollowPage(sites.get(site.id), url, opts),
  setLoginCookies: list => setLoginCookies(site.partition, list),
  cachedProfile: ch => { const c = siteCache.get(ch); return c && c.data ? c.data : null; }
}));
const siteOf = ch => sites.of(ch);

/* ---------- live alerts for saved channels ---------- */
// Notifications are kept so their click handlers work. Electron doesn't always say when one is closed
// (one left in the notification centre, or that just timed out), so only the latest ones are kept.
const liveNotes = new Set();
const NOTES_MAX = 50;
function keepNote(n) {
  keepLatest(liveNotes, n, NOTES_MAX);
  const drop = () => liveNotes.delete(n);
  n.on('click', drop);
  n.on('close', drop);
}
let notifyPrefs = { all: true, away: false, off: [] };   // away: only while the app isn't in front
let desktopNotify = true;             // Settings > Notifications: off means no desktop notifications at all
mainIpc.on('notify:enabled', (_e, on) => { desktopNotify = on !== false; });
// "Send a test": 'shown', 'failed' (the system refused it) or 'sent' (no answer: macOS doesn't say if it's blocked)
appIpc.handle('notify:test', () => new Promise(res => {
  if (!Notification.isSupported()) return res('unsupported');
  const n = new Notification({ title: 'Stream Multiview', body: 'Desktop notifications work.', icon: ICON });
  keepNote(n);
  n.on('show', () => res('shown'));
  n.on('failed', () => res('failed'));
  setTimeout(() => res('sent'), 3000);
  n.show();
}));
// The app's messages ("Logged out of Twitch") as desktop notifications (Settings > Notifications > Show them as).
// The same message again within 3 seconds isn't sent twice.
let lastMessage = { text: '', t: 0 };
appIpc.on('notify:message', (_e, text) => {
  text = String(text || '').slice(0, 200);
  if (!text || !desktopNotify || !Notification.isSupported()) return;
  if (text === lastMessage.text && Date.now() - lastMessage.t < 3000) return;
  lastMessage = { text, t: Date.now() };
  const n = new Notification({ title: 'Stream Multiview', body: text, icon: ICON });
  keepNote(n);
  n.on('click', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } });
  n.show();
});
appIpc.handle('notify:settings', () => {
  const url = process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
    : process.platform === 'win32' ? 'ms-settings:notifications' : null;
  if (url) shell.openExternal(url);
  return !!url;
});
// A linked streamer (the page's Settings › Linked channels) going live on several sites within 10 minutes: one
// notification, replaced as more sites go live ("quietkoala is live on Kick and Twitch")
const groupNotes = new Map();   // group name -> { n, sites, at }
function notifyLive(slug, info) {
  mainWin?.webContents.send('live:went-live', slug, info);
  if (!desktopNotify || !notifyPrefs.all || notifyPrefs.off.includes(slug) || !Notification.isSupported()) return;
  if (notifyPrefs.away && BrowserWindow.getFocusedWindow()) return;
  const body = [info.title, info.category, info.viewers != null ? `${info.viewers.toLocaleString()} watching` : ''].filter(Boolean).join(' · ');
  const group = (notifyPrefs.groups || []).find(g => g.accounts.includes(String(slug).toLowerCase()));
  let title = `${info.name || slug} is live on ${platformOf(slug)}`;
  if (group) {
    const prev = groupNotes.get(group.name), recent = prev && Date.now() - prev.at < 10 * 60000;
    const sites = [...new Set([...(recent ? prev.sites : []), platformOf(slug)])];
    if (recent) { try { prev.n.close(); } catch {} }
    title = `${group.name} is live on ${sites.length > 1 ? sites.slice(0, -1).join(', ') + ' and ' + sites[sites.length - 1] : sites[0]}`;
    groupNotes.set(group.name, { n: null, sites, at: recent ? prev.at : Date.now() });
  }
  const n = new Notification({ title, body: body || 'Click to watch', icon: ICON });
  if (group) groupNotes.get(group.name).n = n;
  keepNote(n);
  n.on('click', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); mainWin.webContents.send('open-channel', slug); }
  });
  n.show();
}
// Is one channel live: its site's answer
const fetchAny = ch => { const a = siteOf(ch); return a ? a.liveOne(ch) : Promise.resolve(null); };

/* ---------- checking many channels at once ----------
   Each site its own way (liveBatch in sites/<id>/site.js): one question for many channels, or the live ones among the
   channels you follow. Whatever these can't answer is checked one at a time, as before. */
const SITE_TIMEOUT = 3 * 60e3;   // reading a long follow list takes a while; under the watcher's 5 min for the whole batch
async function liveBatch(list) {
  // Each site on its own clock: one that doesn't answer in time is checked one at a time instead, without holding up the others
  const safe = (a, chs) => { const none = { results: [], rest: chs }; return a.liveBatch ? withTimeout(a.liveBatch(chs), SITE_TIMEOUT, none).catch(() => none) : Promise.resolve(none); };
  const parts = await Promise.all(sites.list.map(a => safe(a, list.filter(c => SmvSites.siteOf(c) === a.id))));
  return { results: parts.flatMap(p => p.results), rest: parts.flatMap(p => p.rest) };
}

const watcher = createLiveWatcher({
  fetchChannel: fetchAny,
  fetchBatch: liveBatch,
  batchIntervalMs: 30000,   // batched checks are cheap: Kick (1-4 requests on your login) and Twitch (1) every 30 s
  onStatus: snap => { recordLive(snap); profQueue.sawLive(snap); mainWin?.webContents.send('live:status', snap); },
  onWentLive: notifyLive
});
mainIpc.on('live:watch', (_e, data) => {
  const d = data || {};
  notifyPrefs = { all: d.notifyAll !== false, away: d.away === true, off: Array.isArray(d.off) ? d.off.map(String) : [],
    groups: (Array.isArray(d.groups) ? d.groups : []).filter(g => g && typeof g.name === 'string' && Array.isArray(g.accounts)).map(g => ({ name: g.name.slice(0, 100), accounts: g.accounts.map(a => String(a).toLowerCase()) })) };
  watcher.setChannels(Array.isArray(d.channels) ? d.channels : []);
  profQueue.setSaved((Array.isArray(d.channels) ? d.channels : []).filter(okCh).map(normCh));
});
appIpc.on('live:check-now', () => watcher.checkSoon());
app.whenReady().then(() => powerMonitor.on('resume', () => watcher.checkSoon()));   // after sleep: who's live now, not hours ago

/* ---------- suggestions from the channels you follow (the Channels box) ----------
   The last follow list read from each site is kept (db.js, names only), with who's live among them. Each site reads
   its own again in the background while you're signed in (follows.tick in sites/<id>/site.js: how often, and whether it
   can tell who's live, differs by site). The switch in the Channels panel's ⋯ menu turns it all off and forgets the
   lists. A site you aren't signed in to shows no suggestions. */
let follows = null;
function followStore() {
  if (!follows) { let d = null; try { d = db.get('follows'); } catch {} follows = SmvFollows.normStore(d); }
  return follows;
}
const followsOn = () => !followStore().off;
function saveFollows(next) {
  follows = SmvFollows.normStore(next);
  try { db.set('follows', follows); } catch {}
  followsChanged();
}
let followsChangedT = null;
function followsChanged() {            // the page asks again (follows:get), at most twice a second
  if (followsChangedT) return;
  followsChangedT = setTimeout(() => { followsChangedT = null; mainWin?.webContents.send('follows:changed'); }, 500);
}
function keepFollows(site, items) {
  if (!followsOn() || !Array.isArray(items)) return;
  saveFollows(SmvFollows.setSite(followStore(), site, items));
}
let followsBusy = false;
async function followsTick() {
  if (followsBusy || !followsOn() || !mainWin) return;
  followsBusy = true;
  try {
    const now = Date.now();
    for (const a of sites.list) if (a.follows) await a.follows.tick(now);
  } catch {} finally { followsBusy = false; }
}
app.whenReady().then(() => {
  setTimeout(followsTick, 8000);                         // soon after start-up, after the first live checks
  setInterval(followsTick, 60e3).unref?.();
});
// The followed channels from the sites you're signed in to, and who's live among them (the page picks suggestions)
appIpc.handle('follows:get', async () => {
  if (!followsOn()) return { on: false, items: [], live: {} };
  const signed = await Promise.all(sites.list.map(a => a.signedIn()));
  const on = sites.list.filter((_a, i) => signed[i]).map(a => a.id);
  const live = {};
  for (const a of sites.list) if (on.includes(a.id) && a.follows && a.follows.live)
    a.follows.live().forEach((x, ch) => { live[ch] = { live: true, viewers: x.viewers, title: x.title || '', category: x.category || '' }; });
  return { on: true, items: SmvFollows.allFollows(followStore(), SmvFollows.SITES.filter(s => on.includes(s))), live };
});
mainIpc.handle('follows:set-on', (_e, on) => {
  if (on) { if (!followsOn()) { saveFollows({ v: 1 }); sites.list.forEach(a => a.follows && a.follows.retry()); setTimeout(followsTick, 500); } }
  else { sites.list.forEach(a => a.follows && a.follows.clearLive && a.follows.clearLive()); saveFollows({ v: 1, off: true }); }
  return followsOn();
});

/* ---------- streamer profiles ----------
   The live checks above are recorded (db.js: each stream seen, its viewer counts, a follower
   count a day, and your notes), and opening a profile asks the site for the rest. The queue below also
   asks for saved channels' profiles in the background: soon after one is saved, imported or goes live,
   and slowly for ones the app knows nothing about yet (profile-queue.js). */
let history = null, histT = null;
function hist() {
  if (!history) { let d = null; try { d = db.loadProfiles(); } catch {} history = createHistory(d); }
  return history;
}
function saveHistory() {      // only the channels that changed are written (db.js)
  clearTimeout(histT); histT = null; histDue = 0;
  if (!history || !history.takeChanged()) return;
  try { db.saveProfiles(history.data()); } catch {}
}
let histDue = 0;
function saveHistorySoon(ms = 20000) {      // sooner wins: notes are saved within seconds, live checks once a minute at most
  const due = Date.now() + ms;
  if (histT && histDue <= due) return;
  clearTimeout(histT); histDue = due; histT = setTimeout(saveHistory, ms);
}
function recordLive(snap) { try { hist().record(snap); saveHistorySoon(60000); } catch {} }
app.on('will-quit', () => { profQueue.stop(); saveHistory(); });

// Background profiles: one at a time, then the page swaps the letter for the picture.
const profQueue = createProfileQueue({
  fetch: async ch => {
    const p = await siteProfile(ch);
    if (p && !p.missing) mainWin?.webContents.send('profile:info', ch);
    return p;
  },
  infoAt: ch => { const i = hist().info(ch); return i ? i.at : null; }
});
setInterval(() => profQueue.addStale(), 6 * 3600e3).unref?.();

// A streamer's profile: its site's answer
async function fetchProfile(ch) { const a = siteOf(ch); return a ? a.profile(ch) : null; }

const siteCache = new Map();          // channel -> { at, data } (10 minutes)
async function siteProfile(ch, refresh) {
  const c = siteCache.get(ch);
  // a profile its site wants asked again (Kick's kept from before you signed in: no follow state, no Unfollow)
  const a = siteOf(ch);
  const stale = c && c.data && a && a.profileStale && await a.profileStale(c.data);
  if (c && !refresh && !stale && Date.now() - c.at < 10 * 60e3) return c.data;
  const p = await Promise.race([fetchProfile(ch).catch(() => null), sleep(20000).then(() => null)]);
  if (p) {
    siteCache.set(ch, { at: Date.now(), data: p });
    if (siteCache.size > 300) siteCache.delete(siteCache.keys().next().value);
    if (!p.missing) {
      const h = hist();
      h.mergeVods(ch, p.vods);
      if (p.followers != null) h.setFollowers(ch, p.followers);
      h.setInfo(ch, p);
      saveHistorySoon();
    }
  }
  return p;
}
const profileFor = (ch, site) => {
  const h = hist();
  const s = site && !site.missing ? { ...site, vods: undefined, vodCount: (site.vods || []).length } : null;
  return { ch, site: s, missing: !!(site && site.missing), video: !!(site && site.video), failed: !site, summary: profileSummary(h.entry(ch)), meta: h.getMeta(ch), info: h.info(ch) };
};
const okCh = ch => typeof ch === 'string' && validCh(normCh(ch));
appIpc.handle('profile:get', async (_e, ch, opt) => {
  if (!okCh(ch)) return { error: 'bad' };
  ch = normCh(ch);
  const o = opt || {};
  return profileFor(ch, o.local ? (siteCache.get(ch) || {}).data || null : await siteProfile(ch, !!o.refresh));
});
// The directory: what's known about many channels, without asking the sites.
appIpc.handle('profile:list', (_e, chs) => {
  const h = hist(), out = {};
  (Array.isArray(chs) ? chs : []).slice(0, 2000).forEach(ch => {
    if (!okCh(ch)) return;
    const k = normCh(ch), s = profileSummary(h.entry(k));
    out[ch] = { info: h.info(k), meta: h.getMeta(k), last: s.recap ? s.recap.end : null, streams30: s.stats ? s.stats.streams30 : 0, tracked: s.tracked };
  });
  return out;
});
// Opening a channel from the Channels box: does it exist on that site? 'yes', 'missing' (the site says there's no
// such channel) or 'unknown' (the site couldn't be asked: offline, rate-limited, slow), which doesn't stop it opening.
appIpc.handle('channel:exists', async (_e, ch) => {
  if (!okCh(ch)) return 'unknown';
  const p = await Promise.race([siteProfile(normCh(ch)).catch(() => null), sleep(8000).then(() => null)]);
  return !p ? 'unknown' : p.missing ? 'missing' : 'yes';
});
// Looking up a name that isn't saved: the same name on each site.
appIpc.handle('profile:lookup', async (_e, q) => {
  const name = String(q || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_.\-]{2,40}$/.test(name)) return [];
  const cands = sites.list.map(a => a.byName(name)).filter(c => validCh(c));
  const found = await Promise.all(cands.map(async ch => { const p = await siteProfile(ch); return p && !p.missing ? { ch, name: p.name, avatar: p.avatar, followers: p.followers, followersText: p.followersText || '', live: p.live ? { title: p.live.title, viewers: p.live.viewers } : null } : null; }));
  return found.filter(Boolean);
});
appIpc.handle('profile:meta', (_e, ch, patch) => {
  if (!okCh(ch) || !patch || typeof patch !== 'object') return null;
  const m = hist().setMeta(normCh(ch), patch);
  saveHistorySoon(2000);
  return m;
});
// Download an emote from an emote card in a chat (see emoteAgent in index.html): only pictures from the
// emote sites, at most 10 MB, saved where you choose (Downloads, named after the emote).
// (the add-ons' here, each site's in its module: emoteHost)
const EMOTE_HOSTS = /^(cdn\.7tv\.app|(\w+\.)?7tv\.app|cdn\.betterttv\.net|cdn\.frankerfacez\.com)$/;
const EMOTE_TYPES = { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg' };
const emoteUrlOk = u => { try { const x = new URL(u); return x.protocol === 'https:' && (EMOTE_HOSTS.test(x.hostname) || sites.list.some(a => a.emoteHost && a.emoteHost(x.hostname))); } catch { return false; } };
async function fetchEmote(url) {
  const r = await Promise.race([net.fetch(url, { headers: BROWSER_HEADERS() }), sleep(15000).then(() => null)]);
  if (!r || !r.ok) return null;
  const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!EMOTE_TYPES[type]) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length && buf.length <= 10 * 1024 * 1024 ? { buf, ext: EMOTE_TYPES[type] } : null;
}
// "Show in folder" on a saved emote under the bell: only files this app saved (this session), by their id.
const savedEmotes = new Map();
let savedEmoteId = 0;
/* ---------- new emotes (emote-lists.js): which emotes a channel added since you last opened its chat ----------
   Asked only when a chat opens with Settings > Chat > Highlight new emotes on, at most every 10 minutes per channel. */
const emoteFile = () => stateFile('emotes');
let emoteStore = null, emoteT = null;
function emotes() {
  if (!emoteStore) { let d = null; try { d = JSON.parse(fs.readFileSync(emoteFile(), 'utf8')); } catch {} emoteStore = createEmoteStore(d); }
  return emoteStore;
}
function saveEmotesSoon() {
  clearTimeout(emoteT);
  emoteT = setTimeout(() => {
    if (!emoteStore || !emoteStore.takeChanged()) return;
    try { const f = emoteFile(); fs.writeFileSync(f + '.tmp', JSON.stringify(emoteStore.data())); fs.renameSync(f + '.tmp', f); } catch {}
  }, 2000);
}
app.on('will-quit', () => { clearTimeout(emoteT); if (emoteStore && emoteStore.takeChanged()) try { fs.writeFileSync(emoteFile(), JSON.stringify(emoteStore.data())); } catch {} });
const EMOTE_APIS = { stv: devEnv('SMV_7TV_API') || 'https://7tv.io/v3', bttv: devEnv('SMV_BTTV_API') || 'https://api.betterttv.net/3', ffz: devEnv('SMV_FFZ_API') || 'https://api.frankerfacez.com/v1' };
async function getJson(url, opts = {}) {
  try {
    const r = await Promise.race([net.fetch(url, { ...opts, headers: { Accept: 'application/json', ...BROWSER_HEADERS(), ...(opts.headers || {}) } }), sleep(10000).then(() => null)]);
    return r && r.ok ? await r.json() : null;
  } catch { return null; }
}
// The emote add-ons a site's channels can have (emotes.addOns in sites/<id>/site.js: the name each one knows the site by)
const EMOTE_ADD_ONS = [
  { key: '7tv', url: (as, id) => `${EMOTE_APIS.stv}/users/${as}/${encodeURIComponent(id)}`, names: parse7tv, group: stvGroup },
  { key: 'bttv', url: (as, id) => `${EMOTE_APIS.bttv}/cached/users/${as}/${encodeURIComponent(id)}`, names: parseBttv, group: bttvGroup },
  { key: 'ffz', url: (_as, id) => `${EMOTE_APIS.ffz}/room/id/${encodeURIComponent(id)}`, names: parseFfz, group: ffzGroup }
];
// The add-ons' answers for a channel (id: its user there), in that order: read with x[how] (names or group), null for
// one the site hasn't got
const addOnEmotes = (a, id, how) => Promise.all(EMOTE_ADD_ONS.map(x => a.emotes.addOns[x.key] ? getJson(x.url(a.emotes.addOns[x.key], id)).then(x[how]) : null));
// { [source]: [names] } for the sources that answered (a source that didn't is left out, not emptied)
async function emoteLists(ch) {
  const out = {}, a = siteOf(ch);
  if (!a || !a.emotes) return out;                       // a site with no channel emote lists to ask
  const own = await a.emotes.list(ch);
  if (own) out[a.id] = own.names;
  if (own && own.id) {
    const got = await addOnEmotes(a, own.id, 'names');
    EMOTE_ADD_ONS.forEach((x, i) => { if (got[i]) out[x.key] = got[i]; });
  }
  return out;
}
const emoteAsked = new Map();     // channel -> when its lists were last asked (10 minutes apart at most)
appIpc.handle('emotes:open', async (_e, ch) => {
  if (!okCh(ch)) return null;
  ch = normCh(ch);
  const st = emotes();
  let added = [];
  if (!emoteAsked.has(ch) || Date.now() - emoteAsked.get(ch) > (+devEnv('SMV_EMOTE_RECHECK_MS') || 10 * 60e3)) {
    emoteAsked.set(ch, Date.now());
    const lists = await emoteLists(ch);
    if (Object.keys(lists).length) { added = st.update(ch, lists); saveEmotesSoon(); }
  }
  return { fresh: st.fresh(ch), added };
});
// The emotes to pick from in ALL (emote-picker.js): [{ id, label, emotes: [{ name, url, send }] }], kept 10 minutes per
// channel: what its site has (emotes.pick in sites/<id>/site.js), and the add-ons'.
const pickAsked = new Map();
appIpc.handle('emotes:pick', async (_e, ch, fresh) => {   // (fresh: asked again, not from the last 10 minutes: ALL reloaded)
  if (!okCh(ch)) return null;
  ch = normCh(ch);
  const was = pickAsked.get(ch);
  if (was && !fresh && Date.now() - was.at < 10 * 60e3) return was.groups;
  const a = siteOf(ch);
  if (!a || !a.emotes) return [];                            // a site whose chat has only its own box's emoji
  const { groups, id } = await a.emotes.pick(ch);
  if (id) groups.push(...(await addOnEmotes(a, id, 'group')).filter(Boolean));
  if (groups.length) pickAsked.set(ch, { at: Date.now(), groups });
  return groups;
});
appIpc.handle('emotes:seen', (_e, ch, name) => {
  if (!okCh(ch) || typeof name !== 'string') return false;
  const ok = emotes().seen(normCh(ch), name);
  if (ok) saveEmotesSoon();
  return ok;
});
// "Open image in new window" on an emote in ALL (the chats' own menu: openImage)
appIpc.handle('emote:open', (_e, url) => { if (!emoteUrlOk(url)) return false; openSiteWindow(url, 520, 520, WEB_PARTITION); return true; });
appIpc.handle('emote:download', async (e, url, name, small) => {
  if (!emoteUrlOk(url)) return { error: 'bad' };
  let got = await fetchEmote(url).catch(() => null);
  if (!got && small && small !== url && emoteUrlOk(small)) got = await fetchEmote(small).catch(() => null);   // the big one isn't there: the one in chat
  if (!got) return { error: 'fetch' };
  const win = BrowserWindow.fromWebContents(e.sender) || mainWin;
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Save emote', defaultPath: path.join(app.getPath('downloads'), emoteClip.fileName(name, got.ext)),
    filters: [{ name: 'Image', extensions: [got.ext.slice(1)] }] });
  if (canceled || !filePath) return { canceled: true };
  try { fs.writeFileSync(filePath, got.buf); } catch { return { error: 'write' }; }
  const id = String(++savedEmoteId);
  savedEmotes.set(id, filePath);
  while (savedEmotes.size > 50) savedEmotes.delete(savedEmotes.keys().next().value);
  return { saved: true, file: path.basename(filePath), id };
});
// "Copy image" on an emote: the picture, fetched like Download. The app's page turns it into a still PNG (not every
// kind of picture can be read here) and puts it on the clipboard with clipboard:emote.
appIpc.handle('emote:fetch', async (_e, url, small) => {
  if (!emoteUrlOk(url)) return { error: 'bad' };
  let got = await fetchEmote(url).catch(() => null);
  if (!got && small && small !== url && emoteUrlOk(small)) got = await fetchEmote(small).catch(() => null);
  if (!got) return { error: 'fetch' };
  const type = Object.keys(EMOTE_TYPES).find(k => EMOTE_TYPES[k] === got.ext);
  return { type, data: got.buf.toString('base64') };
});
// A still PNG on the clipboard (dataUrl: made by the app's page), and with it a file of the picture (files: its path)
async function copyPicture(dataUrl, file) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 20 * 1024 * 1024) return false;
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) return false;
  const item = { 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) };
  if (file) item['text/uri-list'] = pathToFileURL(file).href;   // (a file, as Finder or Explorer copy one)
  try { await clipboard.write([new ClipboardItem(item)]); } catch { return false; }
  return true;
}
appIpc.handle('clipboard:png', (_e, dataUrl) => copyPicture(dataUrl));
// An emote's still PNG and, when it moves, the emote itself as a file (see emote-clip.js): a 7TV one as its GIF
appIpc.handle('clipboard:emote', async (_e, dataUrl, url, small, name) => {
  let file = null;
  if (emoteUrlOk(url)) {
    const gif = emoteClip.gifUrl(url);
    let got = gif ? await fetchEmote(gif).catch(() => null) : null;
    if (!got) got = await fetchEmote(url).catch(() => null);
    if (!got && small && small !== url && emoteUrlOk(small)) got = await fetchEmote(small).catch(() => null);
    if (got && emoteClip.animated(got.buf))
      try { file = emoteClip.saveCopy(path.join(app.getPath('temp'), 'stream-multiview-emotes'), emoteClip.fileName(name, got.ext), got.buf); } catch {}
  }
  return copyPicture(dataUrl, file);
});
appIpc.handle('emote:show', (_e, id) => {
  const f = savedEmotes.get(String(id));
  if (!f || !fs.existsSync(f)) return false;
  shell.showItemInFolder(f);
  return true;
});
/* ---------- chat mentions / replies ---------- */
const heldTitle = id => (SmvSites.IDS.includes(id) && sites.get(id).heldTitle) || 'AutoMod held a message';
appIpc.on('mention:notify', (_e, m) => {
  if (!desktopNotify || !m || typeof m.channel !== 'string' || !Notification.isSupported()) return;
  const who = String(m.sender || 'Someone').slice(0, 40), where = String(m.label || m.channel).slice(0, 40);
  const title = m.kind === 'flagged' ? (m.what === 'held' ? `${heldTitle(m.site)} in ${where}'s chat` : `${String(m.why || 'Flagged').slice(0, 60)} in ${where}'s chat`)
    : m.kind === 'spam' ? `${m.abuse ? 'Abusive message' : 'Likely spam'} in ${where}'s chat` : m.kind === 'reply' ? `${who} replied to you in ${where}'s chat`
    : m.kind === 'support' ? `${who} ${m.raid ? 'raided' : 'supported'} ${where}`
    : m.kind === 'word' ? `${who} said "${String(m.word || '').slice(0, 40)}" in ${where}'s chat` : `${who} mentioned you in ${where}'s chat`;
  const body = (m.kind === 'spam' || m.kind === 'flagged' ? `${who}: ` : m.kind === 'reply' && m.quoted ? `"${String(m.quoted).slice(0, 60)}"  →  ` : '') + String(m.body || '').slice(0, 180);
  const n = new Notification({ title, body: body || ' ', icon: ICON });
  keepNote(n);
  n.on('click', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); mainWin.webContents.send('focus-chat', m.channel); }
  });
  n.show();
});
appIpc.handle('live:snapshot', () => watcher.snapshot());
// Is one channel live (saved or not)? Asked by a stream window whose player is stuck on its offline screen.
appIpc.handle('live:one', async (_e, ch) => {
  if (!okCh(ch)) return null;
  const i = await withTimeout(fetchAny(normCh(ch)), NET_TIMEOUT, null).catch(() => null);
  return i && !i.missing ? { live: !!i.live } : null;
});

async function logout(id) {
  const a = sites.get(id), ses = session.fromPartition(a.site.partition);
  // Close that site's open pages first so nothing re-saves the old login (not a site's own hidden windows: keeps).
  BrowserWindow.getAllWindows().forEach(w => {
    if (w === mainWin || w === streamsWin || w === switcherWin || sites.list.some(x => x.keeps && x.keeps(w))) return;
    try { if (w.webContents.session === ses) w.close(); } catch {}
  });
  await wipeSession(ses);
  if (a.loggedOut) a.loggedOut();
  mainWin?.webContents.send('account:changed', { platform: id, loggedOut: true });
}
function openLogin(id) {
  const a = sites.get(id);
  if (!a) return;
  if (a.openLogin) { a.openLogin(); return; }      // a site that signs in some other way (no login window)
  const w = openSiteWindow(a.loginUrl, 1100, 800, a.site.partition);
  w?.on('closed', () => mainWin?.webContents.send('account:changed', { platform: id, loggedOut: false }));
}
mainIpc.handle('account:logout', async (_e, plat) => { await logout(siteId(plat)); return true; });
mainIpc.handle('account:login', (_e, plat) => { openLogin(siteId(plat)); });
// Who is logged in where: each site's account(), its name or only whether you're signed in.
appIpc.handle('accounts:status', async () => {
  const out = {};
  for (const a of sites.list) out[a.id] = await a.account();
  return out;
});

/* ---------- sign-in pages that refuse the app as it is ----------
   Google blocks sign-in from apps built on Chromium ("This browser or app may not be secure"). On a site's sign-in
   pages like that (signInAs in sites/<id>/site.js) the app shows itself as another browser: its user agent, no Chrome
   client hints, and no Chrome-only page features (signin-preload.js). */
const signinWcs = new Set();     // web contents currently showing such a sign-in page
const signInAs = url => (sites.list.find(a => a.signInAs && a.signInAs.test(url)) || {}).signInAs || null;
function setupSignInAs(ses, as) {
  ses.webRequest.onBeforeSendHeaders({ urls: as.urls }, (d, cb) => {
    const signin = as.test(d.url) && (d.resourceType === 'mainFrame' || d.resourceType === 'subFrame') || signinWcs.has(d.webContentsId);
    if (!signin) return cb({ requestHeaders: d.requestHeaders });
    const h = {};
    for (const [k, v] of Object.entries(d.requestHeaders)) if (!/^sec-ch-ua/i.test(k)) h[k] = v;
    h['User-Agent'] = as.userAgent();
    cb({ requestHeaders: h });
  });
  const file = path.join(SRC, 'preload', 'signin-preload.js');
  try {
    if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', filePath: file });
    else ses.setPreloads([...ses.getPreloads(), file]);
  } catch {}
}

// A login copied in from another browser (a site's: YouTube's from Firefox, firefox-login.js), into its storage
async function setLoginCookies(partition, list) {
  const ses = session.fromPartition(partition);
  let n = 0;
  for (const c of list) {
    const host = c.domain.replace(/^\./, '');
    const hostPrefix = c.name.startsWith('__Host-');
    try {
      await ses.cookies.set({
        url: `https://${host}${hostPrefix ? '/' : c.path}`, name: c.name, value: c.value,
        ...(c.hostOnly || hostPrefix ? {} : { domain: c.domain }), path: hostPrefix ? '/' : c.path,
        secure: c.secure || hostPrefix || c.name.startsWith('__Secure-'), httpOnly: c.httpOnly,
        ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}), sameSite: c.sameSite
      });
      n++;
    } catch {}
  }
  await ses.cookies.flushStore().catch(() => {});
  return n;
}
/* ---------- import the channels you follow ---------- */
const progress = (plat, text) => mainWin?.webContents.send('follows:progress', { platform: plat, text });
// Open a page with your login in a hidden window, keep scrolling until no more channels load,
// and collect the channel links on it (a's fromLink). scope: where on the page its channels are; signedOut: the
// page's own way of saying you're signed out (a script's expression), for a page that doesn't send you to sign in.
async function scrapeFollowPage(a, url, { maxRounds = 70, scope = 'main', signedOut = '' } = {}) {
  const plat = a.id;
  const win = new BrowserWindow({ show: false, width: 1280, height: 1000,
    webPreferences: { partition: a.site.partition, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  try {
    await win.loadURL(url).catch(() => {});
    await sleep(3000);
    const cur = win.webContents.getURL();
    if (/\/login|signin|accounts\.google\.com|ServiceLogin/i.test(cur)) return { error: 'login' };
    const pickJs = `(() => {
      const scope = document.querySelector(${JSON.stringify(scope)}) || document;
      const out = [];
      scope.querySelectorAll('a[href]').forEach(a => {
        if (a.closest('nav, header, aside, ytd-guide-renderer, #guide, ytd-mini-guide-renderer, tp-yt-app-drawer, [data-a-target="side-nav-bar"], #masthead')) return;
        const card = a.closest('ytd-channel-renderer, [data-a-target="user-card-modal"], article, li, [class*="card" i]') || a;
        const t = (card.querySelector('#channel-title #text, #text.ytd-channel-name, h3, h4, p[title], [data-a-target="preview-card-channel-link"]') || a);
        out.push({ href: a.getAttribute('href'), name: (t.getAttribute && t.getAttribute('title')) || (t.textContent || '').trim() || (a.querySelector('img') && a.querySelector('img').alt) || '' });
      });
      return { links: out, signedOut: ${signedOut || 'false'} };
    })()`;
    const scrollJs = `(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 80 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; });
      return true; })()`;
    const found = new Map();
    let stable = 0;
    for (let i = 0; i < maxRounds && stable < 4; i++) {
      const r = await win.webContents.executeJavaScript(pickJs, true).catch(() => null);
      if (r && r.signedOut && !found.size) return { error: 'login' };
      const before = found.size;
      (r ? r.links : []).forEach(l => {
        const ch = a.fromLink(l.href);
        if (ch && validCh(ch) && !found.has(ch)) found.set(ch, String(l.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || SmvSites.bare(ch).replace(/^@/, ''));
      });
      if (found.size !== before) progress(plat, `Found ${found.size} so far…`);
      stable = found.size === before ? stable + 1 : 0;
      await win.webContents.executeJavaScript(scrollJs, true).catch(() => {});
      await sleep(1300);
    }
    return { items: [...found].map(([ch, name]) => ({ ch, name })) };
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
// Whether you can moderate a channel (its moderator, or your own channel): true, false, or null when it can't be
// told (signed out, offline, a site without a moderator check). Windows only show their mod view button when it's true.
appIpc.handle('mod:check', async (_e, ch) => {
  if (typeof ch !== 'string' || !validCh(ch)) return null;
  const a = siteOf(ch);
  if (!a || !a.modCheck) return null;
  try { return await a.modCheck(ch); } catch { return null; }
});
mainIpc.handle('follows:import', async (_e, plat) => {
  const a = SmvSites.IDS.includes(plat) ? sites.get(plat) : null;
  if (!a || !a.follows) return { error: 'bad' };
  if (importing) return { error: 'busy' };
  importing = plat;
  try {
    progress(plat, 'Reading the channels you follow…');
    const r = await a.follows.import();
    if (r && r.items) { r.items = r.items.filter(x => validCh(x.ch)); if (r.items.length) keepFollows(plat, r.items); }
    return r || { error: 'failed' };
  } catch { return { error: 'failed' }; }
  finally { importing = null; }
});

/* ---------- keeping saved logins safe ----------
   1. Encryption: harden.js (run by the launcher) switches on the engine's cookie encryption, so
      saved logins are encrypted with a key tied to your Windows account. Logins saved before that
      are re-saved once so they get encrypted too.
   2. "Forget my login when I close the app" per site: that site's saved login is wiped on quit
      (and at start-up if the app didn't get to: it closed without wiping, e.g. it crashed). */
const secFile = () => stateFile('security');
function loadSec() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(secFile(), 'utf8')) || {}; } catch {}
  d.forget = Object.assign(Object.fromEntries(SmvSites.IDS.map(id => [id, false])), d.forget || {});
  return d;
}
function saveSec(d) { try { fs.writeFileSync(secFile(), JSON.stringify(d)); } catch {} }
let sec = null;
let encState = null;
function encryptionState() {
  if (encState) return encState;
  try {
    const { readFuse, fuseFileFor } = require('./harden');
    const { file } = fuseFileFor(process.execPath);
    const st = fs.statSync(file), key = `${file}|${st.size}|${st.mtimeMs}`;
    if (sec.encKey === key && sec.enc) return (encState = sec.enc);   // reading the engine is slow-ish: remember the answer
    encState = readFuse(file).state;
    sec.encKey = key; sec.enc = encState; saveSec(sec);
  } catch { encState = 'unknown'; }
  return encState;
}
// Re-save logins that were stored before encryption was switched on, so they're encrypted too.
async function encryptOldLogins() {
  if (encryptionState() !== 'on' || sec.migrated) return;
  for (const s of SmvSites.SITES) {
    const ses = session.fromPartition(s.partition);
    let list = [];
    try { list = await ses.cookies.get({}); } catch {}
    for (const c of list) {
      const host = c.domain.replace(/^\./, '');
      try {
        await ses.cookies.set({ url: `http${c.secure ? 's' : ''}://${host}${c.path || '/'}`, name: c.name, value: c.value,
          ...(c.hostOnly ? {} : { domain: c.domain }), path: c.path || '/', secure: c.secure, httpOnly: c.httpOnly,
          ...(c.session || !c.expirationDate ? {} : { expirationDate: c.expirationDate }), sameSite: c.sameSite || 'unspecified' });
      } catch {}
    }
    await ses.cookies.flushStore().catch(() => {});
  }
  sec.migrated = true; saveSec(sec);
}
// Everything a site's session kept: cookies and storage, the cache, passwords typed into the site's sign-in
// prompts (the auth cache), and the cookie file on disk straight away.
async function wipeSession(ses) {
  await ses.clearStorageData().catch(() => {});
  await ses.clearCache().catch(() => {});
  await ses.clearAuthCache().catch(() => {});
  await ses.cookies.flushStore().catch(() => {});
}
async function forgetLogins(which) {
  for (const p of which) await wipeSession(session.fromPartition(partitionOf(p)));
}
const forgetList = () => SmvSites.IDS.filter(p => sec && sec.forget[p]);
appIpc.handle('security:get', () => ({ encryption: encryptionState(), forget: { ...sec.forget } }));
mainIpc.handle('security:setForget', (_e, plat, on) => {
  if (!SmvSites.IDS.includes(plat)) return null;
  sec.forget[plat] = !!on; saveSec(sec);
  return { ...sec.forget };
});
let forgotten = false;
let quitTidied = false;
app.on('will-quit', e => {            // every window is closed by now
  const needForget = !forgotten && sec && forgetList().length;
  const needGame = !quitTidied && (gameWin || gameHelper);
  if (!needForget && !needGame) return;
  e.preventDefault();
  forgotten = true; quitTidied = true;
  const jobs = [];
  if (needForget) jobs.push(forgetLogins(forgetList()).then(() => { sec.wiped = true; saveSec(sec); }));
  if (gameWin) jobs.push(Promise.race([releaseGame(), sleep(2500)]));
  Promise.all(jobs).finally(() => { try { gameHelper && gameHelper.kill(); } catch {} app.quit(); });
});

/* ---------- showing another app's window (e.g. a Discord pop-out) ---------- */
let pendingCapture = null;
appIpc.handle('capture:sources', async () => {
  const own = new Set(BrowserWindow.getAllWindows().map(w => { try { return w.getMediaSourceId(); } catch { return ''; } }));
  let list = [];
  try { list = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true }); } catch { return []; }
  return list.filter(s => s.name && !own.has(s.id)).map(s => ({
    id: s.id, name: s.name, screen: s.id.startsWith('screen:'),
    thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
    icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : ''
  }));
});
let pendingAt = 0;
appIpc.handle('capture:choose', (_e, id) => { pendingCapture = typeof id === 'string' && /^(window|screen):[\w:-]{1,60}$/.test(id) ? id : null; pendingAt = Date.now(); return true; });
function setupCapture() {
  // The page asks for "screen sharing"; answer with the window you picked (no system picker).
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    const id = pendingCapture; pendingCapture = null;
    // only the app's own page, for the window you picked in it a moment ago
    const frame = req && req.frame, fromApp = !!frame && !frame.parent && /^file:/i.test(frame.url || '') && [mainWin, streamsWin].some(w => { const m = w && !w.isDestroyed() && w.webContents.mainFrame; return !!m && m.processId === frame.processId && m.routingId === frame.routingId; });
    if (!id || !fromApp || Date.now() - pendingAt > 10000) return cb({});
    desktopCapturer.getSources({ types: ['window', 'screen'] })
      .then(list => { const s = list.find(x => x.id === id); s ? cb({ video: s }) : cb({}); })
      .catch(() => cb({}));
  });
}

/* ---------- Game focus: a see-through hole so the real game behind the app can be played ----------
   The main window is cut to a shape that leaves out the game area, so you see (and click into)
   whatever is behind it there. Windows and Linux only. */
let gameShape = null, shapeState = 'none';      // 'none' | 'hole' | 'full' (Linux: reverted by a full-size shape)
function applyGameShape() {
  if (!mainWin || mainWin.isDestroyed() || process.platform === 'darwin') return;
  const b = mainWin.getBounds(), cb = mainWin.getContentBounds();
  const W = b.width, H = b.height, ox = cb.x - b.x, oy = cb.y - b.y;
  const d = gameShape;
  if (!d || !d.hole) {
    if (shapeState === 'hole' || shapeState === 'full') {
      if (process.platform === 'win32') { mainWin.setShape([]); shapeState = 'none'; }
      else { mainWin.setShape([{ x: 0, y: 0, width: W, height: H }]); shapeState = 'full'; }
    }
    return;
  }
  const r = v => Math.round(v);
  const h = { x: r(d.hole.x + ox), y: r(d.hole.y + oy), w: r(d.hole.w), h: r(d.hole.h) };
  const rects = [
    { x: 0, y: 0, width: W, height: h.y },
    { x: 0, y: h.y + h.h, width: W, height: H - (h.y + h.h) },
    { x: 0, y: h.y, width: h.x, height: h.h },
    { x: h.x + h.w, y: h.y, width: W - (h.x + h.w), height: h.h },
    ...(Array.isArray(d.keep) ? d.keep : []).map(k => ({ x: r(k.x + ox), y: r(k.y + oy), width: r(k.w), height: r(k.h) }))
  ].filter(q => q.width > 0 && q.height > 0);
  mainWin.setShape(rects);
  shapeState = 'hole';
}
const rectOk = r => !!r && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k]) && Math.abs(r[k]) < 1e5);
mainIpc.on('game:shape', (_e, d) => {
  gameShape = d && rectOk(d.hole) ? { ...d, keep: (Array.isArray(d.keep) ? d.keep : []).filter(rectOk).slice(0, 16) } : null;
  applyGameShape(); placeGameSoon();
});

/* ---- Put a game here (Windows): move the game's own window into the see-through area and keep it
   there, optionally without its border. A small PowerShell helper calls the Windows window APIs. ---- */
const GAME_PS = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class SmvWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetLong(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetLong(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  public static string Title(IntPtr h) { StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  public static IntPtr Find(string t) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr p) { if (IsWindowVisible(h) && Title(h) == t) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
"@
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $a = $line.Split('|'); $id = $a[0]; $out = 'err'
  try {
    switch ($a[1]) {
      'info' {
        $h = [IntPtr][Int64]$a[2]
        if (-not [SmvWin]::IsWindow($h)) { $out = 'none' } else {
          $r = New-Object SmvWin+RECT; [void][SmvWin]::GetWindowRect($h, [ref]$r)
          $st = [SmvWin]::GetLong($h, -16).ToInt64()
          $t = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([SmvWin]::Title($h)))
          $out = "ok|$($r.L)|$($r.T)|$($r.R - $r.L)|$($r.B - $r.T)|$st|$t|$([SmvWin]::IsIconic($h))"
        }
      }
      'find' {
        $t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a[2]))
        $out = [string]([SmvWin]::Find($t).ToInt64())
      }
      'place' {
        $h = [IntPtr][Int64]$a[2]
        if (-not [SmvWin]::IsWindow($h)) { $out = 'none' } else {
          if ([SmvWin]::IsIconic($h)) { [void][SmvWin]::ShowWindow($h, 9) }
          if ($a[7] -eq '1') {
            $st = [SmvWin]::GetLong($h, -16).ToInt64()
            $ns = $st -band (-bnot [Int64]0x00CF0000)
            if ($ns -ne $st) { [void][SmvWin]::SetLong($h, -16, [IntPtr]$ns) }
          }
          [void][SmvWin]::SetWindowPos($h, [IntPtr]::Zero, [int]$a[3], [int]$a[4], [int]$a[5], [int]$a[6], 0x0260)
          if ($a[8] -eq '1') { [void][SmvWin]::SetForegroundWindow($h) }
          $out = 'ok'
        }
      }
      'restore' {
        $h = [IntPtr][Int64]$a[2]
        if ([SmvWin]::IsWindow($h)) {
          [void][SmvWin]::SetLong($h, -16, [IntPtr][Int64]$a[7])
          [void][SmvWin]::SetWindowPos($h, [IntPtr]::Zero, [int]$a[3], [int]$a[4], [int]$a[5], [int]$a[6], 0x0264)
        }
        $out = 'ok'
      }
    }
  } catch { $out = 'err' }
  [Console]::Out.WriteLine("$id|$out"); [Console]::Out.Flush()
}
`;
let gameHelper = null, gameHelperReady = null, ghSeq = 0;
const ghWaiting = new Map();
function startGameHelper() {
  if (process.platform !== 'win32') return Promise.resolve(false);
  if (gameHelperReady) return gameHelperReady;
  gameHelperReady = new Promise(resolve => {
    try {
      const file = path.join(app.getPath('userData'), 'game-helper.ps1');
      fs.writeFileSync(file, GAME_PS, 'utf8');
      const { spawn } = require('child_process');
      gameHelper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
      let buf = '', ready = false;
      gameHelper.stdout.on('data', d => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (line === 'ready') { ready = true; resolve(true); continue; }
          const k = line.indexOf('|'); const id = line.slice(0, k);
          const cb = ghWaiting.get(id); if (cb) { ghWaiting.delete(id); cb(line.slice(k + 1)); }
        }
      });
      gameHelper.on('exit', () => { gameHelper = null; gameHelperReady = null; ghWaiting.forEach(cb => cb('err')); ghWaiting.clear(); if (!ready) resolve(false); });
      setTimeout(() => { if (!ready) resolve(false); }, 15000);
    } catch { resolve(false); }
  });
  return gameHelperReady;
}
async function gh(...args) {
  if (!(await startGameHelper()) || !gameHelper) return 'err';
  return new Promise(res => {
    const id = String(++ghSeq);
    ghWaiting.set(id, res);
    setTimeout(() => { if (ghWaiting.has(id)) { ghWaiting.delete(id); res('err'); } }, 5000);
    try { gameHelper.stdin.write([id, ...args].join('|') + '\n'); } catch { ghWaiting.delete(id); res('err'); }
  });
}
let gameWin = null;          // { hwnd, name, strip, orig: {x,y,w,h,style} }
let lastPlaced = '', placeT = 0, focusNext = false;
function placeGameSoon() { clearTimeout(placeT); placeT = setTimeout(placeGame, 60); }
async function placeGame() {
  if (!gameWin || !gameShape || !gameShape.hole || !mainWin || mainWin.isDestroyed()) return;
  const cb = mainWin.getContentBounds(), h = gameShape.hole;
  let r = { x: Math.round(cb.x + h.x), y: Math.round(cb.y + h.y), width: Math.round(h.w), height: Math.round(h.h) };
  try { r = screen.dipToScreenRect(mainWin, r); } catch {}
  const sig = [gameWin.hwnd, r.x, r.y, r.width, r.height, gameWin.strip].join(',');
  if (sig === lastPlaced && !focusNext) return;
  lastPlaced = sig;
  const res = await gh('place', gameWin.hwnd, r.x, r.y, r.width, r.height, gameWin.strip ? '1' : '0', focusNext ? '1' : '0');
  focusNext = false;
  if (res === 'none') { const name = gameWin.name; gameWin = null; lastPlaced = ''; mainWin?.webContents.send('game:detached', { name, closed: true }); }
}
async function releaseGame() {
  if (!gameWin) return;
  const g = gameWin; gameWin = null; lastPlaced = '';
  const o = g.orig;
  await gh('restore', g.hwnd, o.x, o.y, o.w, o.h, o.style);
}
mainIpc.handle('game:attach', async (_e, d) => {
  if (process.platform !== 'win32') return { error: 'platform' };
  if (!d || typeof d.srcId !== 'string') return { error: 'bad' };
  if (!(await startGameHelper())) return { error: 'helper' };
  await releaseGame();
  const m = d.srcId.match(/^window:(\d+):/);
  let hwnd = m ? m[1] : '0';
  const parse = s => { const a = String(s).split('|'); if (a[0] !== 'ok') return null;
    return { x: +a[1], y: +a[2], w: +a[3], h: +a[4], style: a[5], title: Buffer.from(a[6] || '', 'base64').toString('utf8'), min: a[7] === 'True' }; };
  let info = parse(await gh('info', hwnd));
  if (!info || (d.name && info.title !== d.name)) {           // the id wasn't the window handle: look it up by its title
    const f = await gh('find', Buffer.from(String(d.name || ''), 'utf8').toString('base64'));
    if (/^\d+$/.test(f) && f !== '0') { hwnd = f; info = parse(await gh('info', hwnd)); }
  }
  if (!info) return { error: 'notfound' };
  gameWin = { hwnd, name: info.title || d.name, strip: d.strip !== false, orig: { x: info.x, y: info.y, w: info.w, h: info.h, style: info.style } };
  lastPlaced = ''; focusNext = true;
  await placeGame();
  return { ok: true, name: gameWin ? gameWin.name : d.name };
});
mainIpc.handle('game:release', async () => { await releaseGame(); return true; });
mainIpc.handle('game:strip', async (_e, on) => { if (gameWin) { gameWin.strip = !!on; if (!on) { const o = gameWin.orig; await gh('restore', gameWin.hwnd, o.x, o.y, o.w, o.h, o.style); } lastPlaced = ''; await placeGame(); } return true; });
mainIpc.handle('game:focus', async () => { if (gameWin) { focusNext = true; lastPlaced = ''; await placeGame(); } return !!gameWin; });
mainIpc.on('game:onTop', (_e, on) => { if (mainWin && !mainWin.isDestroyed()) mainWin.setAlwaysOnTop(!!on, on ? 'floating' : 'normal'); });

/* ---------- updates from GitHub ---------- */
const updater = require('./updater');
const updFile = () => stateFile('updates');
let upd = null;            // { repo, auto, lastCheck }
let updState = { state: 'idle', latest: null, notes: '', notesHtml: '', error: '', installed: null, needsInstall: false };
function loadUpd() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(updFile(), 'utf8')) || {}; } catch {}
  let pkgRepo = '';
  try { pkgRepo = String(require(path.join(APP_ROOT, 'package.json')).updateRepo || ''); } catch {}   // package.json sits above src/
  upd = { repo: updater.REPO_RE.test(d.repo || '') ? d.repo : (updater.REPO_RE.test(pkgRepo) ? pkgRepo : ''), auto: d.auto !== false, lastCheck: +d.lastCheck || 0 };
}
const saveUpd = () => { try { fs.writeFileSync(updFile(), JSON.stringify(upd)); } catch {} };
const isGitCopy = () => !app.isPackaged && fs.existsSync(path.join(APP_ROOT, '.git'));
// Installed with the .exe / .dmg: updates come as the new installer. Run from the source folder: the files are replaced.
const INSTALLED = app.isPackaged;
const updStatus = () => ({ current: app.getVersion(), repo: upd.repo, auto: upd.auto, lastCheck: upd.lastCheck, git: isGitCopy(),
  installed_app: INSTALLED, platform: process.platform, ...updState, ...(updState.state === 'downloading' ? updProgress : null) });
const sendUpd = () => mainWin?.webContents.send('update:status', updStatus());
const netFetch = (url, opt) => net.fetch(url, opt);
async function checkForUpdate({ install = upd.auto, manual = false } = {}) {
  if (!upd.repo) { updState = { ...updState, state: 'norepo', error: '' }; sendUpd(); return updStatus(); }
  if (updState.state === 'checking' || updState.state === 'downloading') return updStatus();
  updState = { ...updState, state: 'checking', error: '' }; sendUpd();
  try {
    const info = await updater.latestInfo(upd.repo, netFetch);
    upd.lastCheck = Date.now(); saveUpd();
    const ahead = updater.compareVersions(info.version, updState.installed || app.getVersion()) > 0;
    const inst = INSTALLED ? updater.pickInstaller(info.assets, process.platform) : null;
    const macZip = INSTALLED && process.platform === 'darwin' ? updater.pickMacZip(info.assets) : null;
    updState = { ...updState, latest: info.version, notes: info.notes, notesHtml: info.notesHtml, published: info.published, zip: info.zip, page: info.page, asset: inst, macZip,
      manual: INSTALLED && !inst,                       // no installer for this system in that release: download it from the page
      state: ahead ? 'available' : (updState.installed ? 'ready' : 'uptodate') };
    sendUpd();
    if (ahead && install && !isGitCopy() && !updState.manual) await installUpdate();
  } catch (e) {
    updState = { ...updState, state: 'error', error: String(e && e.message || e) };
    sendUpd();
  }
  return updStatus();
}
// How far the download has got ({ progress, received, total }), sent to the page at most a few times a second
let updProgress = null;
const dlOpts = () => ({ fetch: netFetch, onProgress: p => { updProgress = p; sendUpd(); } });
const downloadTo = (url, file) => updater.downloadTo(url, file, dlOpts());
// Mac: can this copy replace itself? '' if so, otherwise why not (see updater.macSwapBlocker).
const { execFile } = require('child_process');
const runTool = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (e, stdout, stderr) => e ? rej(e) : res(`${stdout}\n${stderr}`)));
async function macSwapCheck() {
  const appPath = updater.macAppBundle(process.execPath);
  let writable = false, req = '';
  try { fs.accessSync(path.dirname(appPath), fs.constants.W_OK); fs.accessSync(appPath, fs.constants.W_OK); writable = true; } catch {}
  if (appPath) req = updater.designatedReq(await runTool('codesign', ['-d', '-r-', appPath]).catch(() => ''));
  return { appPath, req, why: updater.macSwapBlocker({ app: appPath, writable, req }) };
}
// Mac: download the new app and unpack and check it (updater.unpackMacApp). Restart then swaps it in.
async function downloadMacApp() {
  const { appPath, req, why } = await macSwapCheck();
  if (why) throw new Error('mac swap: ' + why);
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'stream-multiview-update-'));
  try {
    const zip = await downloadTo(updState.macZip.url, path.join(dir, path.basename(updState.macZip.name)));
    const newApp = await updater.unpackMacApp(zip, path.join(dir, 'app'), req, runTool);
    fs.rmSync(zip, { force: true });
    return { appPath, newApp };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
async function installInstaller() {
  if (updState.manual || !updState.asset) { openExternal(updState.page || `https://github.com/${upd.repo}/releases/latest`); return updStatus(); }
  updProgress = null; updState = { ...updState, state: 'downloading', error: '' }; sendUpd();
  if (updState.macZip) {
    try {
      const swap = await downloadMacApp();
      updState = { ...updState, state: 'ready', installed: updState.latest, installerFile: '', swap, blocked: false, needsInstall: false };
      sendUpd();
      return updStatus();
    } catch (e) { console.log('Update: using the disk image instead (' + (e && e.message || e) + ')'); }
  }
  try {
    const dir = process.platform === 'darwin' ? app.getPath('downloads') : path.join(app.getPath('temp'), 'stream-multiview-update');
    const file = await downloadTo(updState.asset.url, path.join(dir, path.basename(updState.asset.name)));
    updState = { ...updState, state: 'ready', installed: updState.latest, installerFile: file, swap: null, blocked: false, needsInstall: false };
  } catch (e) {
    updState = { ...updState, state: 'error', error: String(e && e.message || e) };
  }
  sendUpd();
  return updStatus();
}
// Mac: a downloaded app that wasn't swapped in (the app closed without restarting) isn't left in the temp folder.
let swapStarted = false;
// Only the folder downloadMacApp made (stream-multiview-update-XXXXXX in the temp folder) is ever removed.
app.on('will-quit', () => {
  if (!updState.swap || swapStarted) return;
  const dir = path.dirname(path.dirname(String(updState.swap.newApp || '')));
  if (path.dirname(dir) === path.resolve(app.getPath('temp')) && /^stream-multiview-update-/.test(path.basename(dir))) try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});
// Hand over to the downloaded installer, then close so it can replace the app.
function runInstaller() {
  const sw = updState.swap;
  if (process.platform === 'darwin' && sw && fs.existsSync(sw.newApp)) {
    // macOS's App Management setting can refuse: then say where to allow it, and keep the app open
    let ok = false;
    try { ok = updater.canWriteInside(sw.appPath); } catch {}
    updState = { ...updState, blocked: !ok }; sendUpd();
    if (!ok) return false;
    const { spawn } = require('child_process');
    const script = path.join(path.dirname(path.dirname(sw.newApp)), 'swap.sh');
    fs.writeFileSync(script, updater.macSwapScript());
    spawn('/bin/sh', [script, String(process.pid), sw.appPath, sw.newApp, 'open', path.dirname(script)], { detached: true, stdio: 'ignore' }).unref();
    swapStarted = true;
    setTimeout(() => app.quit(), 300);    // the script waits for the app to close, swaps in the new one and opens it
    return true;
  }
  const f = updState.installerFile;
  if (!f || !fs.existsSync(f)) return false;
  if (process.platform === 'win32') {
    const { spawn } = require('child_process');
    spawn(f, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();   // silent install, then it starts the new version
    setTimeout(() => app.quit(), 300);
    return true;
  }
  shell.openPath(f);     // macOS: the disk image opens; drag Stream Multiview into Applications
  return true;
}
async function installUpdate() {
  if (INSTALLED) return installInstaller();
  if (!updState.zip || isGitCopy()) return updStatus();
  updProgress = null; updState = { ...updState, state: 'downloading', error: '' }; sendUpd();
  try {
    const buf = await updater.downloadBuffer(updState.zip, dlOpts());
    const files = updater.appFiles(updater.readZip(buf));
    // A brand-new release may still carry the previous version number for a minute or two
    // (until the release workflow has stamped it): use the release's own version.
    if (files['package.json'] && updState.latest) {
      try { const p = JSON.parse(files['package.json'].toString('utf8'));
        if (updater.compareVersions(updState.latest, p.version) > 0) { p.version = updState.latest; files['package.json'] = Buffer.from(JSON.stringify(p, null, 2) + '\n'); } } catch {}
    }
    const backup = path.join(app.getPath('userData'), 'update-backup', app.getVersion() + '-' + Date.now());
    const res = updater.applyUpdate(APP_ROOT, files, backup);
    updater.pruneBackups(path.dirname(backup));
    updState = { ...updState, state: 'ready', installed: res.version, needsInstall: res.needsInstall };
  } catch (e) {
    const m = String(e && e.message || e);
    updState = { ...updState, state: 'error', error: /EACCES|EPERM/.test(m) ? 'nowrite' : m };
  }
  sendUpd();
  return updStatus();
}
appIpc.handle('update:status', () => updStatus());
mainIpc.handle('update:check', () => checkForUpdate({ manual: true }));
mainIpc.handle('update:install', () => installUpdate());
mainIpc.handle('update:settings', (_e, d) => {
  if (d && typeof d.auto === 'boolean') upd.auto = d.auto;
  if (d && typeof d.repo === 'string') {
    const r = d.repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (r === '' || updater.REPO_RE.test(r)) { upd.repo = r; updState = { ...updState, state: 'idle', latest: null, error: '' }; }
  }
  saveUpd(); sendUpd();
  return updStatus();
});
// Mac: System Settings > Privacy & Security > App Management, where the app is allowed to update itself
mainIpc.handle('update:privacy-settings', () => { shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles'); return true; });
// Mac: don't swap the app in after all, download the disk image to drag in instead
mainIpc.handle('update:use-dmg', () => {
  if (updState.swap) fs.rmSync(path.dirname(path.dirname(updState.swap.newApp)), { recursive: true, force: true });
  updState = { ...updState, macZip: null, swap: null, blocked: false };
  return installInstaller();
});
mainIpc.handle('update:open-page', () => { openExternal(updState.page || `https://github.com/${upd.repo}/releases/latest`); return true; });
mainIpc.handle('update:restart', () => {
  if (INSTALLED) { const installer = runInstaller(); return { installer, mac: process.platform === 'darwin' && !updState.swap, blocked: !!updState.blocked }; }
  if (updState.needsInstall) return { needsInstall: true };      // the launcher has to reinstall the engine first
  app.relaunch(); app.exit(0);
  return { ok: true };
});
function scheduleUpdates() {
  loadUpd();
  const tick = () => { if (upd.auto && upd.repo && Date.now() - upd.lastCheck > 5.5 * 3600e3) checkForUpdate(); };
  setTimeout(() => { if (upd.auto && upd.repo) checkForUpdate(); }, 12000);     // shortly after start
  setInterval(tick, 30 * 60e3);
}

/* ---------- help files ---------- */
const HELP_FILES = ['CHANGELOG.md'];
// Installed builds keep the changelog next to the packed app (app.asar.unpacked), as before.
const helpPath = name => app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', name) : path.join(APP_ROOT, name);
appIpc.handle('help:read', (_e, name) => {
  if (!HELP_FILES.includes(name)) return null;
  try { return fs.readFileSync(helpPath(name), 'utf8'); } catch {}
  try { return fs.readFileSync(path.join(APP_ROOT, name), 'utf8'); } catch { return null; }
});
// The guide (Settings › Guide): every page in docs/guide, as text. Its README.md is the contents for GitHub.
appIpc.handle('help:guide', () => {
  const dir = path.join(APP_ROOT, 'docs', 'guide');
  try {
    return fs.readdirSync(dir).filter(f => /^[\w-]+\.md$/.test(f) && f !== 'README.md')
      .map(f => ({ name: f.slice(0, -3), text: fs.readFileSync(path.join(dir, f), 'utf8') }));
  } catch { return []; }
});
appIpc.handle('app:version', () => app.getVersion());

/* ---------- menu ---------- */
// Who is logged in where, as the page last told us (it checks on start and after every log in or out).
// (a site that's named: its account's name, '' signed out; the others: whether you're signed in)
let menuAccounts = Object.fromEntries(sites.list.map(a => [a.id, a.named ? '' : false]));
appIpc.on('accounts:state', (_e, a) => {
  const clean = v => (typeof v === 'string' && /^[A-Za-z0-9_]{1,30}$/.test(v) ? v : '');
  const next = Object.fromEntries(sites.list.map(x => [x.id, x.named ? clean(a && a[x.id]) : !!(a && a[x.id])]));
  if (JSON.stringify(next) === JSON.stringify(menuAccounts)) return;
  menuAccounts = next; buildMenu();
});
function showMain() {
  if (!mainWin) return null;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
  return mainWin;
}
const showSettings = tab => showMain()?.webContents.send('settings:show', tab);
const checkUpdatesNow = () => { showSettings('updates'); checkForUpdate({ manual: true }); };
// One item per site that says what clicking it does: log in, or log out of the account that's in.
// (a site that signs in some other way, openLogin: straight away; the others through the page, as its Log in does)
function accountItem(a) {
  const plat = a.id, name = a.site.name, who = menuAccounts[plat];
  if (!who) return { label: `Log in to ${name}…`, click: () => (a.openLogin ? openLogin(plat) : showMain()?.webContents.send('menu:account', { platform: plat, action: 'login' })) };
  return { label: `Log out of ${name}${typeof who === 'string' ? ` (${who})` : ''}`, click: () => showMain()?.webContents.send('menu:account', { platform: plat, action: 'logout' }) };
}
// The app window to open the search box in: the one you're in (the streams window too), else the main window
function paletteWin() {
  const f = BrowserWindow.getFocusedWindow();
  return f && !f.isDestroyed() && appContents(f.webContents) && f !== switcherWin ? f : showMain();
}
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const settingsItem = { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => showSettings() };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // Mac apps keep Settings and Check for Updates in the app's own menu; Windows and Linux in File.
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' },
      { label: 'Check for Updates…', click: checkUpdatesNow },
      { type: 'separator' },
      settingsItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]}] : [{ label: 'File', submenu: [settingsItem, { type: 'separator' }, { role: 'quit', label: 'Exit' }] }]),
    { label: 'Account', submenu: [
      ...sites.list.map(accountItem),
      { type: 'separator' },
      { label: 'Account settings…', click: () => showSettings('accounts') }
    ]},
    { role: 'editMenu' },
    { label: 'View', submenu: [
      // (the page and the web views handle the keys themselves: the menu shows them, and only a click comes from here)
      { label: 'Search and actions…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: (_i, _w, ev) => { if (!(ev && ev.triggeredByAccelerator)) paletteWin()?.webContents.send('palette:open'); } },
      { type: 'separator' },
      { role: 'reload', label: 'Reload everything' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'toggleDevTools' }
    ]},
    ...(isMac ? [{ label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' },
      { type: 'separator' },
      { role: 'close' },
      { type: 'separator' },
      { role: 'front' }
    ]}] : []),
    { label: 'Help', submenu: [
      { label: 'Guide', click: () => showMain()?.webContents.send('help:show', 'guide') },
      { label: 'Keyboard shortcuts', click: () => showMain()?.webContents.send('help:show', 'keys') },
      { label: 'What\'s new', click: () => showMain()?.webContents.send('help:show', 'news') },
      { type: 'separator' },
      { label: 'Check for updates…', click: checkUpdatesNow }
    ]}
  ]));
}

app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });

// Windows only shows desktop notifications for apps with an ID.
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.glowingpear.streammultiview' : process.execPath);

app.whenReady().then(async () => {
  partitionCare.prune(); savePartitions();       // before anything opens a stream's storage
  guard.lockSession(session.defaultSession, wc => appContents(wc));
  sec = loadSec();
  for (const a of sites.list) if (a.ready) await a.ready();     // (what the sites saved, e.g. YouTube's API key)
  if (forgetList().length && sec.wiped !== true) await forgetLogins(forgetList());     // the app didn't get to wipe them last time
  if (sec.wiped !== false) { sec.wiped = false; saveSec(sec); }     // logins saved from now on are wiped when it closes
  encryptOldLogins();
  const ua = chromeUA();
  app.userAgentFallback = ua;
  SmvSites.SITES.forEach(s => session.fromPartition(s.partition).setUserAgent(ua));
  sites.list.forEach(a => { if (a.signInAs) setupSignInAs(session.fromPartition(a.site.partition), a.signInAs); });
  setupCapture();
  extensions.createHost({ electron: require('electron'), userData: app.getPath('userData'),
    appWindows: () => [mainWin, streamsWin].filter(w => w && !w.isDestroyed()),
    // (Google's "Reject all" to its cookie question: the extension store is Google's too, and asks the same)
    rejectCookies: require('./sites/youtube/site').REJECT_ALL, ipc: { app: appIpc, main: mainIpc } });
  scheduleUpdates();
  buildMenu();
  createMain();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMain(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
