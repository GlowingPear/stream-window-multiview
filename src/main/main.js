// Stream Multiview — desktop app (Electron main process)
const { app, BrowserWindow, session, shell, ipcMain, Menu, screen, Notification, dialog, desktopCapturer, net, safeStorage, powerMonitor, clipboard, ClipboardItem, nativeImage, webContents } = require('electron');
const { parseChannel, createLiveWatcher, SLUG_RE, platformOf, parseTwitch, parseTwitchHtml, ytLiveUrl, parseYouTube,
  validCh, isGoogleSignin, firefoxUA, readKickFollowPages, kickFollowsFrom, twitchFollowsFrom, canModerate, channelFromLink,
  parseTwitchUsers, readKickLive, parseYtFeed, parseYtVideos, ytErrorReason, createKeyGate, createFeedGate, ytNoFeed, normCh, toTime, withTimeout, keepLatest } = require('./live');
const { createHistory, profileSummary, parseKickProfile, parseKickVideos, parseTwitchProfile, parseYouTubeChannel } = require('./profiles');
const { parseKickEmotes, parseTwitchEmotes, parse7tv, parseBttv, parseFfz, createEmoteStore } = require('./emote-lists');
const { kickGroups, twitchGroups, stvGroup, bttvGroup, ffzGroup } = require('./emote-picker');
const { menuFor, translateTarget } = require('./context-menu');
const { makeTranslator } = require('./translate');
const { createProfileQueue } = require('./profile-queue');
const { centre, describe, fill, placeParts } = require('./monitors');
const SmvFollows = require('../shared/follows');
const path = require('path');
const fs = require('fs');
const { youtubeLoginFromFirefox } = require('./firefox-login');
const extensions = require('./extensions');
const guard = require('./guard');
const { pageOptions } = require('./activity');
const { createErrorLog, createSiteLog, describeRequest, diagnostics } = require('./devlog');
const { createSampleStore, exportSamples, healthReport } = require('./event-samples');

// Each platform's chats + login window share one saved session per platform, so you log in once.
const PARTITION = 'persist:kick';
const WEB_PARTITION = 'persist:kmv-web';      // other web pages: storage of their own, none of your logins
const PARTS = { kick: 'persist:kick', twitch: 'persist:twitch', youtube: 'persist:youtube' };
const LOGIN_URL = {
  kick: 'https://kick.com',
  twitch: 'https://www.twitch.tv/login',
  youtube: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'
};

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

if (!app.requestSingleInstanceLock()) { app.quit(); }

// Present as a normal Chrome browser so Kick's login / bot protection treats it like one.
const chromeUA = () => {
  const os = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
           : process.platform === 'win32'  ? 'Windows NT 10.0; Win64; x64'
           : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
};

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
   Every request to Kick, Twitch and YouTube about channels goes in Requests, with its answer's text while
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
app.on('will-quit', saveErrors);
// Requests to the sites (Node's fetch: live checks, follows, profiles), each noted as it's answered.
const nodeFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const href = typeof url === 'string' ? url : url && (url.href || url.url), d = describeRequest(href, opts && opts.body);
  if (!d) return nodeFetch(url, opts);
  const t0 = Date.now(), method = (opts && opts.method) || 'GET';
  try {
    const r = await nodeFetch(url, opts);
    siteLog.record({ ...d, method, url: href, status: r.status, ms: Date.now() - t0, request: devOn && typeof opts.body === 'string' ? opts.body : undefined,
      body: devOn ? await r.clone().text().catch(() => null) : undefined });
    return r;
  } catch (e) { siteLog.record({ ...d, method, url: href, status: 0, ms: Date.now() - t0, request: devOn && typeof opts.body === 'string' ? opts.body : undefined, error: e && e.message }); throw e; }
};
// a request made from inside a site's page (Kick's, with your login): what it got
const notePageRequest = (url, t0, r) => { const d = describeRequest(url); if (d) siteLog.record({ ...d, url, status: r ? r.status : 0, ms: Date.now() - t0, body: devOn && r && typeof r.body === 'string' ? r.body : undefined }); };
appIpc.on('dev:set', (_e, on) => { devOn = !!on; });
appIpc.on('dev:log', (_e, src, where, msg) => { if (['page', 'chat', 'stream'].includes(src)) devError(src, String(where || ''), String(msg || '')); });
appIpc.handle('dev:info', () => ({ errors: errorLog.list(), responses: siteLog.list() }));
appIpc.handle('dev:clear', () => { errorLog.clear(); siteLog.clear(); saveErrors(); return true; });
// The report: the page's part (its windows and settings, as lines) with this side's.
appIpc.handle('dev:report', (_e, pageLines) => {
  const ds = screen.getAllDisplays(), prim = screen.getPrimaryDisplay();
  return diagnostics({
    app: { version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, chrome: process.versions.chrome },
    sys: { os: { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform] || process.platform, release: process.getSystemVersion ? process.getSystemVersion() : '',
      arch: process.arch, displays: ds.length, scale: prim && prim.scaleFactor, locale: app.getLocale() },
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
/* ---------- Settings › Developer › Chat events (event-samples.js, #233) ----------
   Every kind of event the chats' connections bring, counted, with its last few samples (the chats' helpers send them,
   the page passes them on). Kept in a file for the next run; Export saves them without names, ids or words. */
const sampleStore = createSampleStore({ saved: (() => { try { return JSON.parse(fs.readFileSync(stateFile('event-samples'), 'utf8')); } catch { return null; } })() });
let samplesSaveT = null;
const saveSamples = () => { clearTimeout(samplesSaveT); samplesSaveT = null; try { fs.writeFileSync(stateFile('event-samples'), JSON.stringify(sampleStore.toSave())); } catch {} };
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
  contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true
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
  try { const h = new URL(url).hostname;
    if (/(^|\.)kick\.com$/.test(h)) return PARTITION;
    if (/(^|\.)twitch\.tv$/.test(h)) return PARTS.twitch;
    if (/(^|\.)(youtube\.com|youtu\.be|google\.com)$/.test(h)) return PARTS.youtube;
  } catch {}
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
    if (liveWin && !liveWin.isDestroyed()) liveWin.destroy();   // the hidden checker must not keep the app running
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
    case 'replaceMisspelling': wc.replaceMisspelling(a.word); break;
    case 'addWord': wc.session.addWordToSpellCheckerDictionary(a.word); break;
    case 'inspect': wc.inspectElement(a.x, a.y); break;
    case 'undo': case 'redo': case 'cut': case 'copy': case 'paste': case 'selectAll': case 'reload': wc[a.do](); break;
    // translating a chat: the app's page runs it (it talks to the chat and remembers it per chat)
    case 'translateChat': case 'translateAuto': case 'translateStop':
      if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) wc.hostWebContents.send('view:translate', wc.id, { do: a.do, tl: a.tl, on: !!a.on });
      break;
    // Developer tools: the chat's last messages and the list around them; how the message was read for alerts (the page shows it)
    case 'copyChatHtml': copyChatHtml(wc); break;
    case 'whyAlert':
      if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) wc.hostWebContents.send('view:why', wc.id);
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
  const message = m && chat ? { text: String(m.text || ''), withEmotes: String(m.withEmotes || ''), html: String(m.html || '') } : null;
  const items = menuFor(params, { langs, dev: !!DEV, devTools: devOn, emote, chat, message });
  if (!items.length) return;
  const host = wc.hostWebContents;
  if (emote && appPage(host)) {
    drawnMenus.set(wc.id, items);
    host.send('view:menu', wc.id, {
      emote: { name: String(emote.name || '').slice(0, 60), site: String(emote.site || ''), big: String(emote.big || ''), small: String(emote.small || ''), animated: !!emote.animated, x: +emote.x || 0, y: +emote.y || 0 },
      items: items.map(x => x.type ? { sep: true } : x.head ? { head: x.label } : { label: x.label, enabled: x.enabled !== false, checked: !!x.checked })
    });
    return;
  }
  const tmpl = items.map(x => x.type ? x : x.head ? { label: x.label, enabled: false } : { label: x.label, enabled: x.enabled !== false, click: () => runMenuAct(wc, x.act),
    ...('checked' in x ? { type: 'checkbox', checked: !!x.checked } : {}) });
  const win = host && BrowserWindow.fromWebContents(host);
  Menu.buildFromTemplate(tmpl).popup(win ? { window: win } : {});
}
appIpc.on('view:menu-act', (e, id, i) => {
  const items = drawnMenus.get(id); drawnMenus.delete(id);
  const wc = items && webContents.fromId(id);
  const x = items && items[i];
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
  // Google's sign-in pages get a Firefox identity (see googleSignin below); everything else stays Chrome.
  const syncUA = (url, isMain) => {
    if (!isMain) return;
    const want = isGoogleSignin(url) ? firefoxUA() : chromeUA();
    try { if (wc.getUserAgent() !== want) wc.setUserAgent(want); } catch {}
    if (isGoogleSignin(url)) signinWcs.add(wc.id); else signinWcs.delete(wc.id);
  };
  wc.on('did-start-navigation', (d, url, _inPlace, isMain) => syncUA(d && d.url ? d.url : url, d && 'isMainFrame' in d ? d.isMainFrame : isMain));
  wc.on('will-redirect', (d, url, _inPlace, isMain) => syncUA(d && d.url ? d.url : url, d && 'isMainFrame' in d ? d.isMainFrame : isMain));
  wc.on('destroyed', () => signinWcs.delete(wc.id));
  // Web views: no preload or Node, sandboxed, https only, and only the app's own storage (guard.js).
  wc.on('will-attach-webview', (ev, webPreferences, params) => { if (!guard.lockWebview(webPreferences, params)) ev.preventDefault(); });
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

/* ---------- live alerts for saved channels ---------- */
// A hidden, muted window on kick.com (using your Kick login) asks Kick for each saved channel's info.
let liveWin = null, liveLoading = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NET_TIMEOUT = 20000;   // one request to a site: after this it counts as no answer (a dead connection never ends)
const netSignal = () => AbortSignal.timeout(NET_TIMEOUT);
const liveJs = code => liveWin && !liveWin.isDestroyed() ? withTimeout(liveWin.webContents.executeJavaScript(code, true), NET_TIMEOUT, null) : Promise.resolve(null);   // null: no answer
function ensureLiveWin() {
  if (liveWin && !liveWin.isDestroyed()) return liveLoading;
  liveWin = new BrowserWindow({ show: false, width: 900, height: 700,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  liveWin.webContents.setAudioMuted(true);
  liveWin.on('closed', () => { liveWin = null; });
  // A crashed page never answers again: close it, and the next check opens a fresh one. (Not on 'unresponsive':
  // a busy computer sets that off too, and closing it then cuts off the checks in flight. Each one has a time limit.)
  const w = liveWin;
  w.webContents.on('render-process-gone', () => { if (!w.isDestroyed()) w.destroy(); });
  // Not on kick.com in time: its requests would run on a blank page (signed out, no answers), so start again next time
  liveLoading = withTimeout(w.loadURL('https://kick.com/robots.txt').then(() => true, () => true), NET_TIMEOUT, false)
    .then(ok => { if (ok) return; if (liveWin === w) liveWin = null; if (!w.isDestroyed()) w.destroy(); });
  return liveLoading;
}
async function fetchChannel(slug) {
  if (!SLUG_RE.test(slug)) return null;
  await ensureLiveWin();
  if (!liveWin) return null;
  for (const ver of ['v2', 'v1']) {
    const url = `/api/${ver}/channels/${slug}`, t0 = Date.now();
    const r = await liveJs(
      `fetch(${JSON.stringify(url)},{credentials:'include',headers:{Accept:'application/json'}})` +
      `.then(async r=>({status:r.status,body:r.ok?await r.text():''})).catch(()=>({status:0,body:''}))`
    ).catch(() => null) || { status: 0, body: '' };
    notePageRequest('https://kick.com' + url, t0, r);
    if (r.status === 200){ const info = parseChannel(r.body, slug); if (info) return info; }
    if (r.status === 404) return { missing: true };
  }
  // Blocked (e.g. a security check): open the address directly so the browser can pass the check, then read it.
  try {
    await withTimeout(liveWin.loadURL(`https://kick.com/api/v2/channels/${slug}`), NET_TIMEOUT, null);
    for (let i = 0; i < 6; i++) {
      await sleep(1500);
      const txt = await liveJs('document.body ? document.body.innerText : ""').catch(() => '') || '';
      const info = parseChannel(txt, slug);
      if (info) { liveLoading = Promise.resolve(); return info; }
    }
  } catch {}
  return null;
}
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
const TWITCH_CID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';   // Twitch's public web client id
const BROWSER_HEADERS = () => ({ 'User-Agent': chromeUA(), 'Accept-Language': 'en-US,en;q=0.9' });
async function fetchTwitch(login) {
  try {
    const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST',
      headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'text/plain;charset=UTF-8', ...BROWSER_HEADERS() },
      body: JSON.stringify({ query: `query{user(login:${JSON.stringify(login)}){login displayName stream{id title viewersCount createdAt game{name}}}}` }), signal: netSignal() });
    if (r.ok) { const info = parseTwitch(await r.json(), login); if (info) return info; }
  } catch {}
  try {   // fallback: the channel page
    const r = await fetch(`https://www.twitch.tv/${login}`, { headers: BROWSER_HEADERS(), signal: netSignal() });
    if (r.ok) return parseTwitchHtml(await r.text(), login);
  } catch {}
  return null;
}
async function fetchYouTube(ch) {
  try {
    const r = await fetch(ytLiveUrl(ch), { headers: { ...BROWSER_HEADERS(), Cookie: 'SOCS=CAI; CONSENT=YES+1' }, signal: netSignal() });
    if (r.status === 404) return { missing: true };
    if (r.ok) return parseYouTube(await r.text(), ch);
  } catch {}
  return null;
}
const fetchAny = ch => /^tw:/.test(ch) ? fetchTwitch(ch.slice(3)) : /^yt:/.test(ch) ? fetchYouTube(ch) : fetchChannel(ch);
appIpc.handle('yt:resolve', async (_e, ch) => (typeof ch === 'string' && /^yt:/.test(ch) ? fetchYouTube(ch) : null));

/* ---------- checking many channels at once ----------
   Twitch: one question for up to 100 channels. Kick (logged in): the live channels you follow, from your
   follow list (live ones come first, so usually 1-4 pages); the whole list is read every 30 min to know
   which saved channels you follow. YouTube with an API key: each channel's feed, then one question per 50
   videos. Whatever these can't answer is checked one at a time, as before. */
let kickFollowed = null, kickFollowedAt = 0, kickLiveFirst = true, kickLivePages = 0;
async function kickBatch(slugs) {
  // A few saved channels: asking for each is fewer requests than reading the follow list's live pages.
  if (slugs.length < Math.max(5, kickLivePages + 1)) return { results: [], rest: slugs };
  await ensureLiveWin();
  if (!liveWin) return { results: [], rest: slugs };
  const allPages = !kickFollowed || !kickLiveFirst || Date.now() - kickFollowedAt > 30 * 60e3;
  const get = async u => { const r = await kickGet(u); if (allPages) await sleep(400); return r; };   // the whole list: unhurried
  const r = await readKickLive(get, { allPages }).catch(() => null);
  if (!r || r.login) { if (r) kickFollowed = null; return { results: [], rest: slugs }; }
  if (r.followed) { kickFollowed = r.followed; kickFollowedAt = Date.now(); kickLiveFirst = r.liveFirst !== false; }
  if (!allPages) kickLivePages = r.pages;
  keptKickRead(r);
  const results = [], rest = [];
  for (const s of slugs) {
    if (!kickFollowed || !kickFollowed.has(s)) rest.push(s);
    else results.push([s, r.live.get(s) || { live: false, partial: true, title: '', viewers: null, category: '', name: '', checked: Date.now() }]);
  }
  return { results, rest };
}
async function twitchBatch(chs) {
  const results = [], rest = [];
  for (let i = 0; i < chs.length; i += 100) {
    const part = chs.slice(i, i + 100), logins = part.map(c => c.slice(3));
    let m = null;
    try {
      const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST',
        headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'text/plain;charset=UTF-8', ...BROWSER_HEADERS() },
        body: JSON.stringify({ query: 'query($l:[String!]){users(logins:$l){login displayName stream{id title viewersCount createdAt game{name}}}}', variables: { l: logins } }), signal: netSignal() });
      if (r.ok) m = parseTwitchUsers(await r.json(), logins);
    } catch {}
    if (!m) { rest.push(...part); continue; }
    for (const c of part) results.push([c, m.get(c.slice(3))]);
  }
  return { results, rest };
}

// YouTube API key: optional, stored encrypted with the system's key store, never sent to the page.
let ytKey = '', ytKeySaved = false;
const ytGate = createKeyGate();
const ytKeyFile = () => stateFile('youtube-key');
// (safeStorage's async calls, once the app is ready: the sync ones are gone in Electron 46, and what they saved reads the same)
async function loadYtKey() {
  try {
    const d = JSON.parse(fs.readFileSync(ytKeyFile(), 'utf8'));
    if (!d || !d.enc || !(await safeStorage.isAsyncEncryptionAvailable())) return;
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(d.enc, 'base64'));
    ytKey = result; ytKeySaved = true;
    if (shouldReEncrypt) await storeYtKey(result);       // the system's key changed: saved again with the new one
  } catch {}
}
async function storeYtKey(key) {
  ytKey = key; ytKeySaved = false; ytGate.reset();
  try {
    if (!key) fs.rmSync(ytKeyFile(), { force: true });
    else if (await safeStorage.isAsyncEncryptionAvailable()) {
      const enc = await safeStorage.encryptStringAsync(key);
      if (ytKey !== key) return;                          // changed again meanwhile: that one is saved instead
      fs.writeFileSync(ytKeyFile(), JSON.stringify({ enc: enc.toString('base64') })); ytKeySaved = true;
    }
  } catch {}
}
const ytKeyStatus = () => ({ set: !!ytKey, saved: ytKeySaved, ...ytGate.status() });
let lastYtState = 'ok';
function ytKeyChanged() {
  const st = ytGate.status().state;
  if (st !== lastYtState) { lastYtState = st; mainWin?.webContents.send('ytkey:status', ytKeyStatus()); }
}
const YT_API = devEnv('SMV_YT_API') || 'https://www.googleapis.com/youtube/v3';   // tests point this at a stand-in
const YT_FEED = devEnv('SMV_YT_FEED') || 'https://www.youtube.com/feeds/videos.xml';   // and this
// One YouTube Data API call. Error answers go to the gate (which decides when to use the key again) and throw.
async function ytApi(pathAndQuery, key = ytKey) {
  const r = await fetch(`${YT_API}/${pathAndQuery}&key=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' }, signal: netSignal() });
  const d = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error('youtube ' + r.status); e.status = r.status; e.reason = ytErrorReason(d); throw e; }
  return d;
}
const ytIds = new Map();      // "yt:@handle" -> "UC…" (asked once: 1 quota unit)
const ytDone = new Set();     // videos that can never be live (normal videos, finished streams): not asked about again
async function ytChannelId(ch) {
  if (ch.startsWith('yt:c:')) return ch.slice(5);
  if (ytIds.has(ch)) return ytIds.get(ch);
  const d = await ytApi('channels?part=id&forHandle=' + encodeURIComponent(ch.slice(3)));
  const id = d && Array.isArray(d.items) && d.items[0] ? d.items[0].id : '';
  ytIds.set(ch, id);
  return id;
}
const ytFeed = createFeedGate();   // the channel feeds, shared: they go down for everyone at once
async function ytBatch(chs) {
  if (!chs.length || !ytKey || !ytGate.usable()) return { results: [], rest: chs };
  const results = [], rest = [], feeds = new Map(), ask = new Set(), noFeed = [], recheck = new Map();
  try {
    const tryFeed = ytFeed.usable();
    let answered = false;
    for (const ch of chs) {
      if (ch.startsWith('yt:v:')) { ask.add(ch.slice(5)); continue; }
      const id = await ytChannelId(ch);
      if (!id) { results.push([ch, { missing: true }]); continue; }
      let f = null;
      if (tryFeed) {
        try {
          // A 404 here is the feed being down (it happens to every channel at once), not a missing channel
          const r = await fetch(YT_FEED + '?channel_id=' + id, { headers: BROWSER_HEADERS(), signal: netSignal() });
          if (r.ok) f = parseYtFeed(await r.text());
        } catch {}
      }
      if (!f) { noFeed.push(ch); continue; }
      answered = true;
      feeds.set(ch, f);
      f.ids.forEach(v => { if (!ytDone.has(v)) ask.add(v); });
    }
    if (answered) ytFeed.ok(); else if (tryFeed && noFeed.length) ytFeed.fail();
    const prev = noFeed.length ? watcher.snapshot() : {};
    for (const ch of noFeed) {
      const what = ytNoFeed(prev[ch], { allFailing: !answered, down: ytFeed.down() });
      if (what === 'recheck' && !ytDone.has(prev[ch].videoId)) { recheck.set(ch, prev[ch].videoId); ask.add(prev[ch].videoId); }
      else if (what === 'page' || what === 'recheck') rest.push(ch);
      // 'keep': left out of this round, so its last result stays
    }
    const vids = new Map(), ids = [...ask];
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50);
      const m = parseYtVideos(await ytApi('videos?part=snippet,liveStreamingDetails&id=' + part.join(','))) || new Map();
      for (const v of part) { const x = m.get(v); if (!x || x.state === 'done') ytDone.add(v); else vids.set(v, x); }
    }
    if (ytDone.size > 50000) ytDone.clear();
    ytGate.ok(); ytKeyChanged();
    const at = Date.now();
    const result = (ch, liveId, f) => {
      const v = liveId && vids.get(liveId);
      return [ch, { live: !!v, videoId: liveId || null, title: v ? v.title : '', viewers: v ? v.viewers : null, category: '', startedAt: v ? v.startedAt : null,
        name: (f && f.name) || (v && v.channelTitle) || ch.replace(/^yt:(v:|c:)?/, ''), checked: at }];
    };
    for (const [ch, vid] of recheck) {
      // still live: the same stream. Ended: a new one may have started, which only its page can tell
      if (vids.has(vid) && vids.get(vid).state === 'live') results.push(result(ch, vid, { name: prev[ch].name })); else rest.push(ch);
    }
    for (const ch of chs) {
      if (ch.startsWith('yt:v:')) { const v = ch.slice(5); results.push(result(ch, vids.has(v) && vids.get(v).state === 'live' ? v : null, null)); continue; }
      const f = feeds.get(ch);
      if (!f) continue;
      results.push(result(ch, f.ids.find(v => vids.has(v) && vids.get(v).state === 'live'), f));
    }
    return { results, rest };
  } catch (e) {
    if (e && e.status) { ytGate.fail(e); ytKeyChanged(); }
    return { results: [], rest: chs };   // this round is checked page by page instead
  }
}
const SITE_TIMEOUT = 3 * 60e3;   // reading a long Kick follow list takes a while; under the watcher's 5 min for the whole batch
async function liveBatch(list) {
  const kick = list.filter(c => !/^(tw|yt):/.test(c)), tw = list.filter(c => /^tw:/.test(c)), yt = list.filter(c => /^yt:/.test(c));
  // Each site on its own clock: one that doesn't answer in time is checked one at a time instead, without holding up the others
  const safe = (fn, chs) => { const none = { results: [], rest: chs }; return withTimeout(fn(chs), SITE_TIMEOUT, none).catch(() => none); };
  const parts = await Promise.all([safe(kickBatch, kick), safe(twitchBatch, tw), safe(ytBatch, yt)]);
  return { results: parts.flatMap(p => p.results), rest: parts.flatMap(p => p.rest) };
}
appIpc.handle('ytkey:status', () => ytKeyStatus());
mainIpc.handle('ytkey:set', async (_e, key) => {
  key = String(key || '').trim();
  if (!/^[\w-]{20,100}$/.test(key)) return { ...ytKeyStatus(), error: 'format' };
  try { await ytApi('videos?part=id&id=dQw4w9WgXcQ', key); }   // one test question (1 quota unit)
  catch (e) {
    if (!e.status) return { ...ytKeyStatus(), error: 'network' };
    const g = createKeyGate(); const st = g.fail(e);
    if (st === 'badkey') return { ...ytKeyStatus(), error: 'badkey', reason: e.reason };
    // over quota or too fast: the key itself is fine, so keep it
    await storeYtKey(key); ytGate.fail(e); ytKeyChanged(); watcher.checkSoon();
    return ytKeyStatus();
  }
  await storeYtKey(key); ytKeyChanged(); watcher.checkSoon();
  return ytKeyStatus();
});
mainIpc.handle('ytkey:remove', async () => { await storeYtKey(''); ytKeyChanged(); return ytKeyStatus(); });

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
   The last follow list read from each site is kept in follows.json (names only), with who's live among them:
   - Kick: the live checks read your follow list when you have 5 or more saved Kick channels. For suggestions it's
     also read whenever you're signed in: the whole list at start-up and every 30 minutes, the live ones (1-4 pages)
     about once a minute when the live checks haven't just done it.
   - Twitch and YouTube: what Import follows found, read again in the background at most once a day while you're
     signed in. Who's live on Twitch: one question per 100 channels every 2 minutes. YouTube: no live state.
   The switch in the Channels panel's ⋯ menu turns it all off and forgets the lists. A site you aren't signed in to
   shows no suggestions. */
const followsFile = () => stateFile('follows');
let follows = null;
const followLive = { kick: new Map(), twitch: new Map() }, followLiveAt = { kick: 0, twitch: 0 };
const followTried = { kick: 0, twitch: 0, youtube: 0 };   // the last time the whole list was asked for (worked or not)
function followStore() {
  if (!follows) { let d = null; try { d = JSON.parse(fs.readFileSync(followsFile(), 'utf8')); } catch {} follows = SmvFollows.normStore(d); }
  return follows;
}
const followsOn = () => !followStore().off;
function saveFollows(next) {
  follows = SmvFollows.normStore(next);
  try { const f = followsFile(); fs.writeFileSync(f + '.tmp', JSON.stringify(follows)); fs.renameSync(f + '.tmp', f); } catch {}
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
// A read of Kick's follow list (by the live checks or for suggestions): who's live, and the whole list when it was read
function keptKickRead(r) {
  if (!r || r.login) return;
  followLive.kick = r.live || new Map(); followLiveAt.kick = Date.now();
  if (r.followed) keepFollows('kick', [...r.followed].map(ch => ({ ch, name: (r.live.get(ch) || {}).name || '' })));
  else followsChanged();
}
let followsBusy = false;
async function followsTick() {
  if (followsBusy || !followsOn() || !mainWin) return;
  followsBusy = true;
  try {
    const st = followStore(), now = Date.now();
    if (await kickSignedIn()) {
      const whole = (!kickFollowedAt || now - kickFollowedAt > 30 * 60e3 || !st.kick) && now - followTried.kick > 30 * 60e3;
      if (whole) followTried.kick = now;
      if (whole || now - followLiveAt.kick > 75e3) {
        await ensureLiveWin();
        if (liveWin) {
          const get = async u => { const x = await kickGet(u); if (whole) await sleep(400); return x; };   // the whole list: unhurried
          const r = await readKickLive(get, { allPages: whole }).catch(() => null);
          if (r && r.login) { kickFollowed = null; followLive.kick = new Map(); }
          else if (r) {
            if (r.followed) { kickFollowed = r.followed; kickFollowedAt = Date.now(); kickLiveFirst = r.liveFirst !== false; }
            keptKickRead(r);
          }
        }
      }
    } else if (followLive.kick.size) { followLive.kick = new Map(); followsChanged(); }
    const token = await twitchToken();
    if (token) {
      if ((!st.twitch || now - st.twitch.at > 24 * 3600e3) && now - followTried.twitch > 6 * 3600e3) {
        followTried.twitch = now;
        const r = await twitchFollows({ scrape: false }).catch(() => null);
        if (r && r.items) keepFollows('twitch', r.items);
      }
      const tw = (followStore().twitch || { items: [] }).items.map(x => x.ch);
      if (tw.length && now - followLiveAt.twitch > 120e3) {
        const r = await twitchBatch(tw).catch(() => null);
        if (r) {
          const m = new Map(r.results.filter(([, x]) => x && x.live).map(([ch, x]) => [ch, x]));
          if (m.size || followLive.twitch.size) followsChanged();
          followLive.twitch = m; followLiveAt.twitch = Date.now();
        }
      }
    } else if (followLive.twitch.size) { followLive.twitch = new Map(); followsChanged(); }
    const yt = followStore().youtube;
    if ((!yt || now - yt.at > 24 * 3600e3) && now - followTried.youtube > 6 * 3600e3 && !importing && (await youtubeSignedIn())) {
      importing = 'youtube'; followTried.youtube = now;
      try { const r = await youtubeFollows().catch(() => null); if (r && r.items && r.items.length) keepFollows('youtube', r.items.filter(x => validCh(x.ch))); }
      finally { importing = null; }
    }
  } catch {} finally { followsBusy = false; }
}
app.whenReady().then(() => {
  setTimeout(followsTick, 8000);                         // soon after start-up, after the first live checks
  setInterval(followsTick, 60e3).unref?.();
});
// The followed channels from the sites you're signed in to, and who's live among them (the page picks suggestions)
appIpc.handle('follows:get', async () => {
  if (!followsOn()) return { on: false, items: [], live: {} };
  const [k, tw, yt] = await Promise.all([kickSignedIn(), twitchToken().then(Boolean), youtubeSignedIn()]);
  const sites = SmvFollows.SITES.filter((s, i) => [k, tw, yt][i]);
  const live = {};
  for (const s of ['kick', 'twitch']) if (sites.includes(s)) followLive[s].forEach((x, ch) => { live[ch] = { live: true, viewers: x.viewers, title: x.title || '', category: x.category || '' }; });
  return { on: true, items: SmvFollows.allFollows(followStore(), sites), live };
});
mainIpc.handle('follows:set-on', (_e, on) => {
  if (on) { if (!followsOn()) { saveFollows({ v: 1 }); Object.keys(followTried).forEach(k => { followTried[k] = 0; }); setTimeout(followsTick, 500); } }
  else { followLive.kick = new Map(); followLive.twitch = new Map(); saveFollows({ v: 1, off: true }); }
  return followsOn();
});

/* ---------- streamer profiles ----------
   The live checks above are recorded (profiles.json: each stream seen, its viewer counts, a follower
   count a day, and your notes), and opening a profile asks the site for the rest. The queue below also
   asks for saved channels' profiles in the background: soon after one is saved, imported or goes live,
   and slowly for ones the app knows nothing about yet (profile-queue.js). */
const profFile = () => stateFile('profiles');
let history = null, histT = null;
function hist() {
  if (!history) { let d = null; try { d = JSON.parse(fs.readFileSync(profFile(), 'utf8')); } catch {} history = createHistory(d); }
  return history;
}
function saveHistory() {
  clearTimeout(histT); histT = null; histDue = 0;
  if (!history || !history.takeChanged()) return;
  try { const f = profFile(); fs.writeFileSync(f + '.tmp', JSON.stringify(history.data())); fs.renameSync(f + '.tmp', f); } catch {}
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

// One request to Kick's API from the kick.com page (with your login when you're logged in).
async function kickApi(u, method = 'GET') {
  await ensureLiveWin();
  if (!liveWin || liveWin.isDestroyed()) return null;
  return liveWin.webContents.executeJavaScript(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const t = ck('session_token'), x = ck('XSRF-TOKEN'), method = ${JSON.stringify(method)};
    if (method !== 'GET' && !t) return { login: true };
    const h = { Accept: 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    if (x) h['X-XSRF-TOKEN'] = x;
    try {
      const r = await fetch(${JSON.stringify(u)}, { method, credentials: 'include', headers: h });
      let d = null; try { d = r.status === 204 ? null : await r.json(); } catch {}
      return { status: r.status, d, auth: !!t };
    } catch (e) { return { status: 0, d: null, auth: !!t }; }
  })()`, true).catch(() => null);
}
async function twitchQuery(query, variables, token) {
  const headers = { 'Client-Id': TWITCH_CID, 'Content-Type': 'text/plain;charset=UTF-8', ...BROWSER_HEADERS() };
  if (token) headers.Authorization = 'OAuth ' + token;
  const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  return r.ok ? r.json() : null;
}
const TW_PROFILE = `query($l:String!){user(login:$l){id login displayName description profileImageURL(width:300) bannerImageURL createdAt
  roles{isPartner isAffiliate} followers{totalCount} stream{createdAt viewersCount title game{name} previewImageURL(width:440,height:248)}
  lastBroadcast{startedAt title game{name}} channel{socialMedias{name title url}}
  videos(first:40,type:ARCHIVE,sort:TIME){edges{node{id title createdAt lengthSeconds viewCount game{name}}}}}}`;
const TW_BASIC = 'query($l:String!){user(login:$l){id login displayName description profileImageURL(width:300) bannerImageURL createdAt followers{totalCount} stream{createdAt viewersCount title game{name}}}}';
const TW_SELF = 'query($l:String!){user(login:$l){self{follower{followedAt} subscriptionBenefit{tier purchasedWithPrime}}}}';

async function fetchProfile(ch) {
  if (/^tw:/.test(ch)) {
    const login = ch.slice(3);
    let d = await twitchQuery(TW_PROFILE, { l: login }).catch(() => null);
    if (!d || (d.errors && !(d.data && d.data.user !== undefined))) d = await twitchQuery(TW_BASIC, { l: login }).catch(() => null);   // a field Twitch no longer has
    const p = parseTwitchProfile(d, login);
    if (!p || p.missing) return p;
    const token = await twitchToken();
    if (token) {
      const me = await twitchQuery(TW_SELF, { l: login }, token).catch(() => null);
      const self = me && me.data && me.data.user && me.data.user.self;
      if (self) { const x = parseTwitchProfile({ data: { user: { login, self } } }, login); p.following = x.following; p.sub = x.sub; }
    }
    p.loggedIn = !!token;
    return p;
  }
  if (/^yt:/.test(ch)) {
    if (/^yt:v:/.test(ch)) return { missing: true, video: true };
    const url = ch.startsWith('yt:c:') ? 'https://www.youtube.com/channel/' + ch.slice(5) : 'https://www.youtube.com/' + ch.slice(3);
    const r = await fetch(url, { headers: { ...BROWSER_HEADERS(), Cookie: 'SOCS=CAI; CONSENT=YES+1' } });
    if (r.status === 404) return { missing: true };
    return r.ok ? parseYouTubeChannel(await r.text(), ch) : null;
  }
  const r = await kickApi(`/api/v2/channels/${encodeURIComponent(ch)}`);
  if (!r) return null;
  if (r.status === 404) return { missing: true };
  const p = r.status === 200 ? parseKickProfile(r.d, ch) : null;
  if (!p) return null;
  const v = await kickApi(`/api/v2/channels/${encodeURIComponent(ch)}/videos`);
  const vods = v && v.status === 200 ? parseKickVideos(Array.isArray(v.d) ? v.d : v.d && v.d.data) : null;
  if (vods && vods.length) p.vods = vods;
  p.loggedIn = !!r.auth;
  if (r.auth) {
    const me = await kickApi(`/api/v2/channels/${encodeURIComponent(ch)}/me`);
    const m = me && me.status === 200 && me.d;
    if (m && typeof m.following === 'boolean') p.following = m.following ? { since: toTime(m.following_since || m.followed_at) } : false;
    if (m && m.subscription) p.sub = { tier: '', months: Number.isFinite(+m.subscription.months) ? +m.subscription.months : null };
  }
  if (p.following === undefined && kickFollowed) p.following = kickFollowed.has(ch) ? { since: null } : false;
  return p;
}

const siteCache = new Map();          // channel -> { at, data } (10 minutes)
// Signed in to Kick (its login cookie), asked of the session itself: a page can still see the old cookies for a moment.
const kickSignedIn = () => session.fromPartition(PARTITION).cookies.get({ url: 'https://kick.com', name: 'session_token' }).then(l => l.some(c => c.value), () => false);
async function siteProfile(ch, refresh) {
  const c = siteCache.get(ch);
  // a Kick profile kept from before you signed in (no follow state, no Unfollow): ask again
  const stale = c && c.data && !/^(tw|yt):/.test(ch) && c.data.loggedIn === false && await kickSignedIn();
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
// Looking up a name that isn't saved: the same name on Kick, Twitch and YouTube.
appIpc.handle('profile:lookup', async (_e, q) => {
  const name = String(q || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_.\-]{2,40}$/.test(name)) return [];
  const cands = [name, 'tw:' + name, 'yt:@' + name].filter(c => validCh(c));
  const found = await Promise.all(cands.map(async ch => { const p = await siteProfile(ch); return p && !p.missing ? { ch, name: p.name, avatar: p.avatar, followers: p.followers, followersText: p.followersText || '', live: p.live ? { title: p.live.title, viewers: p.live.viewers } : null } : null; }));
  return found.filter(Boolean);
});
appIpc.handle('profile:meta', (_e, ch, patch) => {
  if (!okCh(ch) || !patch || typeof patch !== 'object') return null;
  const m = hist().setMeta(normCh(ch), patch);
  saveHistorySoon(2000);
  return m;
});
// Unfollow on Kick itself (what the Unfollow button on the channel's page does).
// Download an emote from an emote card in a chat (see emoteAgent in index.html): only pictures from the
// emote sites, at most 10 MB, saved where you choose (Downloads, named after the emote).
const EMOTE_HOSTS = /^(files\.kick\.com|static-cdn\.jtvnw\.net|cdn\.7tv\.app|(\w+\.)?7tv\.app|cdn\.betterttv\.net|cdn\.frankerfacez\.com|(\w+\.)?ggpht\.com|www\.gstatic\.com)$/;
const EMOTE_TYPES = { 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg' };
const emoteUrlOk = u => { try { const x = new URL(u); return x.protocol === 'https:' && EMOTE_HOSTS.test(x.hostname); } catch { return false; } };
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
// { [source]: [names] } for the sources that answered (a source that didn't is left out, not emptied)
async function emoteLists(ch) {
  const out = {};
  let platform = 'kick', id = null;
  if (/^tw:/.test(ch)) {
    platform = 'twitch';
    const d = await getJson('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ query: 'query($l:String!){user(login:$l){id subscriptionProducts{emotes{token}}}}', variables: { l: ch.slice(3) } }) });
    const t = parseTwitchEmotes(d);
    if (t) { out.twitch = t.names; id = t.userId; }
  } else if (!/^yt:/.test(ch)) {
    const r = await kickApi(`/emotes/${encodeURIComponent(ch)}`).catch(() => null);
    const k = r && r.status === 200 ? parseKickEmotes(r.d, ch) : null;
    if (k) { out.kick = k.names; id = k.userId; }
  } else return out;                                     // YouTube: no channel emote lists to ask
  if (id) {
    const [stv, bttv, ffz] = await Promise.all([
      getJson(`${EMOTE_APIS.stv}/users/${platform}/${encodeURIComponent(id)}`).then(parse7tv),
      platform === 'twitch' ? getJson(`${EMOTE_APIS.bttv}/cached/users/twitch/${encodeURIComponent(id)}`).then(parseBttv) : null,
      platform === 'twitch' ? getJson(`${EMOTE_APIS.ffz}/room/id/${encodeURIComponent(id)}`).then(parseFfz) : null
    ]);
    if (stv) out['7tv'] = stv;
    if (bttv) out.bttv = bttv;
    if (ffz) out.ffz = ffz;
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
// channel. Kick's channel and site emotes; on Twitch the ones your account can use (signed in); the add-ons' for both.
const pickAsked = new Map();
appIpc.handle('emotes:pick', async (_e, ch) => {
  if (!okCh(ch)) return null;
  ch = normCh(ch);
  const was = pickAsked.get(ch);
  if (was && Date.now() - was.at < 10 * 60e3) return was.groups;
  let groups = [], id = null, platform = 'kick';
  if (/^yt:/.test(ch)) return [];                            // YouTube: its own box's emoji only
  if (/^tw:/.test(ch)) {
    platform = 'twitch';
    const token = await twitchToken();
    const r = token ? await twitchGql(token, 'query($l:String!){currentUser{emoteSets{id owner{login} emotes{id token}}} user(login:$l){id}}', { l: ch.slice(3) }).catch(() => null) : null;
    groups = twitchGroups(r && r.d, ch.slice(3)) || [];
    id = r && r.d && r.d.data && r.d.data.user && r.d.data.user.id;
  } else {
    const r = await kickApi(`/emotes/${encodeURIComponent(ch)}`).catch(() => null);
    if (r && r.status === 200) {
      groups = kickGroups(r.d, ch) || [];
      const own = Array.isArray(r.d) && r.d.find(s => s && String(s.slug || '').toLowerCase() === ch);
      id = own && own.user_id;
    }
  }
  if (id) {
    const [stv, bttv, ffz] = await Promise.all([
      getJson(`${EMOTE_APIS.stv}/users/${platform}/${encodeURIComponent(id)}`).then(stvGroup),
      platform === 'twitch' ? getJson(`${EMOTE_APIS.bttv}/cached/users/twitch/${encodeURIComponent(id)}`).then(bttvGroup) : null,
      platform === 'twitch' ? getJson(`${EMOTE_APIS.ffz}/room/id/${encodeURIComponent(id)}`).then(ffzGroup) : null
    ]);
    groups.push(...[stv, bttv, ffz].filter(Boolean));
  }
  if (groups.length) pickAsked.set(ch, { at: Date.now(), groups });
  return groups;
});
appIpc.handle('emotes:seen', (_e, ch, name) => {
  if (!okCh(ch) || typeof name !== 'string') return false;
  const ok = emotes().seen(normCh(ch), name);
  if (ok) saveEmotesSoon();
  return ok;
});
appIpc.handle('emote:download', async (e, url, name, small) => {
  if (!emoteUrlOk(url)) return { error: 'bad' };
  let got = await fetchEmote(url).catch(() => null);
  if (!got && small && small !== url && emoteUrlOk(small)) got = await fetchEmote(small).catch(() => null);   // the big one isn't there: the one in chat
  if (!got) return { error: 'fetch' };
  const base = String(name || 'emote').replace(/[^\w.\-]+/g, '_').replace(/^[._]+/, '').slice(0, 60) || 'emote';
  const win = BrowserWindow.fromWebContents(e.sender) || mainWin;
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Save emote', defaultPath: path.join(app.getPath('downloads'), base + got.ext),
    filters: [{ name: 'Image', extensions: [got.ext.slice(1)] }] });
  if (canceled || !filePath) return { canceled: true };
  try { fs.writeFileSync(filePath, got.buf); } catch { return { error: 'write' }; }
  const id = String(++savedEmoteId);
  savedEmotes.set(id, filePath);
  while (savedEmotes.size > 50) savedEmotes.delete(savedEmotes.keys().next().value);
  return { saved: true, file: path.basename(filePath), id };
});
// "Copy image" on an emote card: the picture, fetched like Download. The app's page turns it into a still
// PNG (the clipboard has no moving pictures, and not every kind of picture can be read here) and puts it on the clipboard.
appIpc.handle('emote:fetch', async (_e, url, small) => {
  if (!emoteUrlOk(url)) return { error: 'bad' };
  let got = await fetchEmote(url).catch(() => null);
  if (!got && small && small !== url && emoteUrlOk(small)) got = await fetchEmote(small).catch(() => null);
  if (!got) return { error: 'fetch' };
  const type = Object.keys(EMOTE_TYPES).find(k => EMOTE_TYPES[k] === got.ext);
  return { type, data: got.buf.toString('base64') };
});
appIpc.handle('clipboard:png', async (_e, dataUrl) => {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 20 * 1024 * 1024) return false;
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) return false;
  try { await clipboard.write([new ClipboardItem({ 'image/png': new Blob([img.toPNG()], { type: 'image/png' }) })]); } catch { return false; }
  return true;
});
appIpc.handle('emote:show', (_e, id) => {
  const f = savedEmotes.get(String(id));
  if (!f || !fs.existsSync(f)) return false;
  shell.showItemInFolder(f);
  return true;
});
appIpc.handle('kick:unfollow', async (_e, slug) => {
  slug = String(slug || '').toLowerCase();
  if (!SLUG_RE.test(slug)) return { error: 'bad' };
  const r = await kickApi(`/api/v2/channels/${encodeURIComponent(slug)}/follow`, 'DELETE');
  if (!r) return { error: 'failed' };
  if (r.login || r.status === 401) return { error: 'login' };
  if (r.status >= 200 && r.status < 300) {
    if (kickFollowed) kickFollowed.delete(slug);
    const c = siteCache.get(slug); if (c && c.data) c.data.following = false;
    return { ok: true };
  }
  return { error: r.status === 403 ? 'refused' : 'failed', status: r.status };
});

/* ---------- chat mentions / replies ---------- */
appIpc.on('mention:notify', (_e, m) => {
  if (!desktopNotify || !m || typeof m.channel !== 'string' || !Notification.isSupported()) return;
  const who = String(m.sender || 'Someone').slice(0, 40), where = String(m.label || m.channel).slice(0, 40);
  const title = m.kind === 'spam' ? `${m.abuse ? 'Abusive message' : 'Likely spam'} in ${where}'s chat` : m.kind === 'reply' ? `${who} replied to you in ${where}'s chat`
    : m.kind === 'support' ? `${who} ${m.raid ? 'raided' : 'supported'} ${where}`
    : m.kind === 'word' ? `${who} said "${String(m.word || '').slice(0, 40)}" in ${where}'s chat` : `${who} mentioned you in ${where}'s chat`;
  const body = (m.kind === 'spam' ? `${who}: ` : m.kind === 'reply' && m.quoted ? `"${String(m.quoted).slice(0, 60)}"  →  ` : '') + String(m.body || '').slice(0, 180);
  const n = new Notification({ title, body: body || ' ', icon: ICON });
  keepNote(n);
  n.on('click', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); mainWin.webContents.send('focus-chat', m.channel); }
  });
  n.show();
});
// Best guess at your Kick username from your logged-in session (you can also type it in).
appIpc.handle('me:detect', async () => {
  await ensureLiveWin();
  if (!liveWin) return null;
  const r = await liveWin.webContents.executeJavaScript(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const h = { Accept: 'application/json' }, t = ck('session_token'), x = ck('XSRF-TOKEN');
    if (t) h.Authorization = 'Bearer ' + t;
    if (x) h['X-XSRF-TOKEN'] = x;
    for (const u of ['/api/v1/user', '/api/v2/user']) {
      try { const r = await fetch(u, { credentials: 'include', headers: h });
        if (r.ok) { const d = await r.json(); const n = d.username || (d.user && d.user.username) || d.slug; if (n) return String(n); } } catch (e) {}
    }
    return null; })()`, true).catch(() => null);
  return typeof r === 'string' && /^[A-Za-z0-9_]{2,30}$/.test(r) ? r : null;
});
appIpc.handle('live:snapshot', () => watcher.snapshot());
// Is one channel live (saved or not)? Asked by a stream window whose player is stuck on its offline screen.
appIpc.handle('live:one', async (_e, ch) => {
  if (!okCh(ch)) return null;
  const i = await withTimeout(fetchAny(normCh(ch)), NET_TIMEOUT, null).catch(() => null);
  return i && !i.missing ? { live: !!i.live } : null;
});

async function logout(plat = 'kick') {
  const part = PARTS[plat];
  // Close that platform's open pages first so nothing re-saves the old login.
  BrowserWindow.getAllWindows().forEach(w => {
    if (w === mainWin || w === streamsWin || w === liveWin || w === switcherWin) return;
    try { if (w.webContents.session === session.fromPartition(part)) w.close(); } catch {}
  });
  await wipeSession(session.fromPartition(part));
  if (plat === 'kick' && liveWin && !liveWin.isDestroyed()) liveWin.destroy();   // the Kick checker starts fresh, logged out
  mainWin?.webContents.send('account:changed', { platform: plat, loggedOut: true });
}
function openLogin(plat = 'kick') {
  if (!PARTS[plat]) return;
  // Google blocks signing in to YouTube inside the app: show how to sign in with Firefox instead.
  if (plat === 'youtube'){ mainWin?.webContents.send('youtube:signin'); return; }
  const w = openSiteWindow(LOGIN_URL[plat], 1100, 800, PARTS[plat]);
  w?.on('closed', () => mainWin?.webContents.send('account:changed', { platform: plat, loggedOut: false }));
}
mainIpc.handle('account:logout', async (_e, plat) => { await logout(PARTS[plat] ? plat : 'kick'); return true; });
mainIpc.handle('account:login', (_e, plat) => { openLogin(PARTS[plat] ? plat : 'kick'); });
// Who is logged in where (Twitch keeps your name in a cookie; YouTube only tells us that you're signed in).
const youtubeSignedIn = () => session.fromPartition(PARTS.youtube).cookies.get({}).then(c => c.some(x => /(youtube|google)\.com$/.test(x.domain) && /^(SAPISID|__Secure-3PSID|LOGIN_INFO)$/.test(x.name)), () => false);
appIpc.handle('accounts:status', async () => {
  const out = { kick: null, twitch: null, youtube: false };
  try {
    const c = await session.fromPartition(PARTS.twitch).cookies.get({ name: 'login' });
    const tw = c.find(x => /twitch\.tv$/.test(x.domain));
    if (tw && /^[A-Za-z0-9_]{2,30}$/.test(tw.value)) out.twitch = tw.value;
  } catch {}
  try {
    const c = await session.fromPartition(PARTS.youtube).cookies.get({});
    out.youtube = c.some(x => /(youtube|google)\.com$/.test(x.domain) && /^(SAPISID|__Secure-3PSID|LOGIN_INFO)$/.test(x.name));
  } catch {}
  return out;
});

/* ---------- Google (YouTube) sign-in ----------
   Google blocks sign-in from apps built on Chromium ("This browser or app may not be secure").
   On Google's sign-in pages only, the app shows itself as Firefox: Firefox user agent, no Chrome
   client hints, and no Chrome-only page features (signin-preload.js). */
const signinWcs = new Set();     // web contents currently showing a Google sign-in page
function setupGoogleSignin(ses) {
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://*.google.com/*', 'https://*.youtube.com/*', 'https://*.gstatic.com/*'] }, (d, cb) => {
    const signin = isGoogleSignin(d.url) && (d.resourceType === 'mainFrame' || d.resourceType === 'subFrame') || signinWcs.has(d.webContentsId);
    if (!signin) return cb({ requestHeaders: d.requestHeaders });
    const h = {};
    for (const [k, v] of Object.entries(d.requestHeaders)) if (!/^sec-ch-ua/i.test(k)) h[k] = v;
    h['User-Agent'] = firefoxUA();
    cb({ requestHeaders: h });
  });
  const file = path.join(SRC, 'preload', 'signin-preload.js');
  try {
    if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', filePath: file });
    else ses.setPreloads([...ses.getPreloads(), file]);
  } catch {}
}

/* ---------- YouTube: cookie question ----------
   In some countries YouTube asks about cookies first and keeps the video paused until you answer.
   The stream page clicks the answer chosen in Settings > YouTube; if that doesn't work (YouTube changed
   the question), it asks for this: "Reject all" saved in that player's storage, as YouTube saves it. */
const YT_REJECT_ALL = 'CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg';
appIpc.handle('youtube:consentFallback', async (_e, part) => {
  if (typeof part !== 'string' || !/^persist:(kmv-stream-[\w-]{1,120}|youtube)$/.test(part)) return false;
  try {
    await session.fromPartition(part).cookies.set({ url: 'https://www.youtube.com', domain: '.youtube.com', name: 'SOCS', value: YT_REJECT_ALL,
      secure: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 390 * 86400 });
    return true;
  } catch { return false; }
});

/* ---------- YouTube: copy the login from Firefox ----------
   Google blocks signing in to YouTube inside apps, so YouTube sign-in goes through Firefox:
   you sign in there, and the app copies just the YouTube / Google login out of Firefox's
   cookie database (see firefox-login.js). No extension and no exported file. */
async function setLoginCookies(plat, list) {
  const ses = session.fromPartition(PARTS[plat]);
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
mainIpc.handle('youtube:fromFirefox', async () => {
  let r;
  try { r = youtubeLoginFromFirefox(); } catch { return { error: 'read' }; }
  if (r.error) return r;
  const n = await setLoginCookies('youtube', r.cookies);
  mainWin?.webContents.send('account:changed', { platform: 'youtube', loggedOut: false });
  return { ok: true, count: n, profile: r.profile, signedIn: await hasLogin('youtube') };
});
async function hasLogin(plat) {
  const names = { kick: /^session_token$/, twitch: /^auth-token$/, youtube: /^(SAPISID|__Secure-3PSID|LOGIN_INFO)$/ }[plat];
  try { return (await session.fromPartition(PARTS[plat]).cookies.get({})).some(c => names.test(c.name)); } catch { return false; }
}
const platformName = p => ({ kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' })[p] || p;

/* ---------- import the channels you follow ---------- */
const progress = (plat, text) => mainWin?.webContents.send('follows:progress', { platform: plat, text });
// Open a page with your login in a hidden window, keep scrolling until no more channels load,
// and collect the channel links on it.
async function scrapeFollowPage(plat, url, { maxRounds = 70 } = {}) {
  const win = new BrowserWindow({ show: false, width: 1280, height: 1000,
    webPreferences: { partition: PARTS[plat], contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  try {
    await win.loadURL(url).catch(() => {});
    await sleep(3000);
    const cur = win.webContents.getURL();
    if (/\/login|signin|accounts\.google\.com|ServiceLogin/i.test(cur)) return { error: 'login' };
    const pickJs = `(() => {
      const scope = ${JSON.stringify(plat)} === 'youtube'
        ? (document.querySelector('ytd-browse[page-subtype="subscriptions"], ytd-browse[page-subtype="channels"], ytd-browse:not([hidden])') || document)
        : (document.querySelector('main') || document);
      const out = [];
      scope.querySelectorAll('a[href]').forEach(a => {
        if (a.closest('nav, header, aside, ytd-guide-renderer, #guide, ytd-mini-guide-renderer, tp-yt-app-drawer, [data-a-target="side-nav-bar"], #masthead')) return;
        const card = a.closest('ytd-channel-renderer, [data-a-target="user-card-modal"], article, li, [class*="card" i]') || a;
        const t = (card.querySelector('#channel-title #text, #text.ytd-channel-name, h3, h4, p[title], [data-a-target="preview-card-channel-link"]') || a);
        out.push({ href: a.getAttribute('href'), name: (t.getAttribute && t.getAttribute('title')) || (t.textContent || '').trim() || (a.querySelector('img') && a.querySelector('img').alt) || '' });
      });
      // YouTube signed out: its page says so (ytcfg), or shows a Sign in button
      const ytOut = !!(window.ytcfg && window.ytcfg.get && window.ytcfg.get('LOGGED_IN') === false)
        || !!document.querySelector('ytd-masthead a[href*="ServiceLogin"], ytd-masthead ytd-button-renderer a[href*="accounts.google.com"]');
      return { links: out, signedOut: ${JSON.stringify(plat)} === 'youtube' && ytOut };
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
        const ch = channelFromLink(plat, l.href);
        if (ch && validCh(ch) && !found.has(ch)) found.set(ch, String(l.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || ch.replace(/^(tw:|yt:@|yt:c:)/, ''));
      });
      if (found.size !== before) progress(plat, `Found ${found.size} so far…`);
      stable = found.size === before ? stable + 1 : 0;
      await win.webContents.executeJavaScript(scrollJs, true).catch(() => {});
      await sleep(1300);
    }
    return { items: [...found].map(([ch, name]) => ({ ch, name })) };
  } finally { if (!win.isDestroyed()) win.destroy(); }
}
// One API call from the kick.com page, so your login goes with it.
async function kickGet(u) {
  if (!liveWin || liveWin.isDestroyed()) return null;
  const t0 = Date.now();
  return liveJs(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const t = ck('session_token'), x = ck('XSRF-TOKEN');
    if (!t) return { login: true };
    const h = { Accept: 'application/json', Authorization: 'Bearer ' + t };
    if (x) h['X-XSRF-TOKEN'] = x;
    try { const r = await fetch(${JSON.stringify(u)}, { credentials: 'include', headers: h }); return { status: r.status, d: r.ok ? await r.json() : null }; }
    catch (e) { return { status: 0, d: null }; }
  })()`).catch(() => null).then(r => { if (!r || !r.login) notePageRequest(new URL(u, 'https://kick.com').href, t0, r && { status: r.status, body: r.d ? JSON.stringify(r.d) : '' }); return r; });
}
async function twitchToken() {
  try {
    const c = await session.fromPartition(PARTS.twitch).cookies.get({ name: 'auth-token' });
    return (c.find(x => /twitch\.tv$/.test(x.domain)) || {}).value || '';
  } catch { return ''; }
}
async function twitchGql(token, query, variables) {
  const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST',
    headers: { 'Client-Id': TWITCH_CID, Authorization: 'OAuth ' + token, 'Content-Type': 'text/plain;charset=UTF-8', ...BROWSER_HEADERS() },
    body: JSON.stringify({ query, variables }) });
  return { status: r.status, d: r.ok ? await r.json() : null };
}
async function kickFollows() {
  await ensureLiveWin();
  if (!liveWin) return { error: 'failed' };
  const r = await readKickFollowPages(kickGet, { onCount: n => progress('kick', `Found ${n} so far…`) });
  if (r.login) return { error: 'login' };
  const { pages, status } = r;
  const items = kickFollowsFrom(pages);
  if (items.length) return { items };
  if ((status === 401 || status === 403) && !pages.length) {
    const s = await scrapeFollowPage('kick', 'https://kick.com/following');   // the API is blocked: read the Following page instead
    return s.items && s.items.length ? s : { error: 'login' };
  }
  return scrapeFollowPage('kick', 'https://kick.com/following');
}
async function twitchFollows({ scrape = true } = {}) {
  const token = await twitchToken();
  if (!token) return { error: 'login' };
  const items = new Map(); let after = null, ok = false;
  for (let i = 0; i < 60; i++) {
    let page = null;
    try {
      const r = await twitchGql(token, 'query($after:Cursor){currentUser{follows(first:100,after:$after){edges{cursor node{login displayName}} pageInfo{hasNextPage}}}}', { after });
      if (r.status === 401) return { error: 'login' };
      if (r.d) page = twitchFollowsFrom(r.d);
    } catch {}
    if (!page) break;
    ok = true;
    page.items.forEach(x => items.set(x.ch, x.name));
    progress('twitch', `Found ${items.size} so far…`);
    if (!page.next) break;
    after = page.next;
  }
  if (ok && items.size) return { items: [...items].map(([ch, name]) => ({ ch, name })) };
  if (ok && !scrape) return { items: [] };               // follows nobody (Import also looks at the Following page)
  return scrape ? scrapeFollowPage('twitch', 'https://www.twitch.tv/directory/following/channels') : null;
}
// Whether you can moderate a channel (its moderator, or your own channel): true, false, or null when
// it can't be told (signed out, offline). Windows only show their mod view button when it's true.
appIpc.handle('mod:check', async (_e, ch) => {
  if (typeof ch !== 'string' || !validCh(ch) || /^yt:/.test(ch)) return null;
  try {
    if (/^tw:/.test(ch)) {
      const token = await twitchToken();
      if (!token) return null;
      const r = await twitchGql(token, 'query($l:String!){currentUser{login} user(login:$l){self{isModerator isEditor}}}', { l: ch.slice(3) });
      return canModerate('twitch', r.d, ch.slice(3));
    }
    await ensureLiveWin();
    const r = await kickGet(`/api/v2/channels/${encodeURIComponent(ch)}/me`);
    return r && r.d ? canModerate('kick', r.d, ch) : null;
  } catch { return null; }
});
const youtubeFollows = () => scrapeFollowPage('youtube', 'https://www.youtube.com/feed/channels');
let importing = null;
mainIpc.handle('follows:import', async (_e, plat) => {
  if (!PARTS[plat]) return { error: 'bad' };
  if (importing) return { error: 'busy' };
  importing = plat;
  try {
    progress(plat, 'Reading the channels you follow…');
    const r = await (plat === 'kick' ? kickFollows() : plat === 'twitch' ? twitchFollows() : youtubeFollows());
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
  d.forget = Object.assign({ kick: false, twitch: false, youtube: false }, d.forget || {});
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
  for (const p of Object.values(PARTS)) {
    const ses = session.fromPartition(p);
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
  for (const p of which) await wipeSession(session.fromPartition(PARTS[p]));
}
const forgetList = () => Object.keys(PARTS).filter(p => sec && sec.forget[p]);
appIpc.handle('security:get', () => ({ encryption: encryptionState(), forget: { ...sec.forget } }));
mainIpc.handle('security:setForget', (_e, plat, on) => {
  if (!PARTS[plat]) return null;
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
    spawn('/bin/sh', [script, String(process.pid), sw.appPath, sw.newApp], { detached: true, stdio: 'ignore' }).unref();
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
let menuAccounts = { kick: '', twitch: '', youtube: false };
appIpc.on('accounts:state', (_e, a) => {
  const clean = v => (typeof v === 'string' && /^[A-Za-z0-9_]{1,30}$/.test(v) ? v : '');
  const next = { kick: clean(a && a.kick), twitch: clean(a && a.twitch), youtube: !!(a && a.youtube) };
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
function accountItem(plat, name) {
  const who = menuAccounts[plat];
  if (!who) return { label: `Log in to ${name}…`, click: () => (plat === 'youtube' ? openLogin('youtube') : showMain()?.webContents.send('menu:account', { platform: plat, action: 'login' })) };
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
      accountItem('kick', 'Kick'),
      accountItem('twitch', 'Twitch'),
      accountItem('youtube', 'YouTube'),
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
  guard.lockSession(session.defaultSession, wc => appContents(wc));
  sec = loadSec();
  await loadYtKey();
  if (forgetList().length && sec.wiped !== true) await forgetLogins(forgetList());     // the app didn't get to wipe them last time
  if (sec.wiped !== false) { sec.wiped = false; saveSec(sec); }     // logins saved from now on are wiped when it closes
  encryptOldLogins();
  const ua = chromeUA();
  app.userAgentFallback = ua;
  Object.values(PARTS).forEach(p => session.fromPartition(p).setUserAgent(ua));
  setupGoogleSignin(session.fromPartition(PARTS.youtube));
  setupCapture();
  extensions.createHost({ electron: require('electron'), userData: app.getPath('userData'),
    appWindows: () => [mainWin, streamsWin].filter(w => w && !w.isDestroyed()), rejectCookies: YT_REJECT_ALL, ipc: { app: appIpc, main: mainIpc } });
  scheduleUpdates();
  buildMenu();
  createMain();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMain(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
