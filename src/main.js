// Stream Multiview — desktop app (Electron main process)
const { app, BrowserWindow, session, shell, ipcMain, Menu, screen, Notification, dialog, desktopCapturer, net, safeStorage } = require('electron');
const { parseChannel, createLiveWatcher, SLUG_RE, platformOf, parseTwitch, parseTwitchHtml, ytLiveUrl, parseYouTube,
  validCh, isGoogleSignin, firefoxUA, readKickFollowPages, kickFollowsFrom, twitchFollowsFrom, canModerate, channelFromLink,
  parseTwitchUsers, readKickLive, parseYtFeed, parseYtVideos, ytErrorReason, createKeyGate } = require('./live');
const path = require('path');
const fs = require('fs');
const { youtubeLoginFromFirefox } = require('./firefox-login');

// Each platform's chats + login window share one saved session per platform, so you log in once.
const PARTITION = 'persist:kick';
const PARTS = { kick: 'persist:kick', twitch: 'persist:twitch', youtube: 'persist:youtube' };
const LOGIN_URL = {
  kick: 'https://kick.com',
  twitch: 'https://www.twitch.tv/login',
  youtube: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'
};

// The app used to be called "Kick Multiview": keep using that data folder (your logins, saved channels, layouts).
app.setName('Stream Multiview');
// npm run dev (scripts/dev.js): a developer copy with its own data folder, and its branch in the window titles.
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
const APP_ROOT = path.join(__dirname, '..');
const ICON = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

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

const isKick = url => { try { const h = new URL(url).hostname; return /(^|\.)(kick\.com|twitch\.tv|youtube\.com|youtu\.be)$/.test(h); } catch { return false; } };
const isLoginProvider = url => /^https:\/\/([a-z0-9-]+\.)*(google\.com|apple\.com|accounts\.youtube\.com)\//i.test(url);

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

const appWebPrefs = () => ({
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true
});

function openStreamsWindow(specs = []) {
  pendingStreams.push(...specs);
  if (streamsWin) {
    if (streamsReady) flushStreams();
    streamsWin.show(); streamsWin.focus();
    return;
  }
  const st = loadState('streams-window-state');
  // Default: put it on a second monitor if there is one.
  let def = { width: 1280, height: 760 };
  const others = screen.getAllDisplays().filter(d => mainWin && d.id !== screen.getDisplayMatching(mainWin.getBounds()).id);
  if (!st && others[0]) { const b = others[0].workArea; def = { x: b.x + 40, y: b.y + 40, width: b.width - 80, height: b.height - 80 }; }
  streamsReady = false;
  streamsWin = new BrowserWindow({
    ...(st ? { width: st.width || 1280, height: st.height || 760, x: st.x, y: st.y } : def),
    minWidth: 480, minHeight: 300, backgroundColor: '#0a0c0d', title: 'Stream Multiview – Streams', autoHideMenuBar: true, icon: ICON,
    webPreferences: appWebPrefs()
  });
  if (st?.maximized || (!st && others[0])) streamsWin.maximize();
  if (st?.fullscreen) streamsWin.setFullScreen(true);
  streamsWin.loadFile(path.join(__dirname, 'index.html'), { query: { role: 'streams' } });
  streamsWin.webContents.on('will-navigate', e => e.preventDefault());
  streamsWin.webContents.on('did-finish-load', () => { streamsReady = true; flushStreams(); });
  streamsWin.on('close', () => saveState(streamsWin, 'streams-window-state'));
  streamsWin.on('closed', () => {
    streamsWin = null; streamsReady = false;
    // Closing the streams window on its own sends its streams back to the main window.
    if (!quitting && mainWin) { mainWin.webContents.send('streams:returned', lastStreams); }
    lastStreams = [];
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
  switcherReady = false;
  switcherWin = new BrowserWindow({
    ...(st && st.width ? { width: st.width, height: st.height, x: st.x, y: st.y } : { width: 620, height: 520 }),
    minWidth: 320, minHeight: 160, backgroundColor: '#0a0c0d', title: 'Stream Multiview – Switch control', autoHideMenuBar: true, icon: ICON,
    alwaysOnTop: pref.onTop !== false,
    webPreferences: appWebPrefs()
  });
  switcherWin.loadFile(path.join(__dirname, 'switcher.html'));
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
ipcMain.handle('switcher:open', () => openSwitcherWindow());
ipcMain.handle('switcher:close', () => { if (switcherWin) { switcherQuiet = true; switcherWin.close(); } });
ipcMain.on('switcher:state', (_e, st) => {
  switcherLast = st;
  if (switcherWin && switcherReady) switcherWin.webContents.send('switcher:state', st);
});
ipcMain.on('switcher:cmd', (_e, cmd) => { if (cmd && typeof cmd.type === 'string') mainWin?.webContents.send('switcher:cmd', cmd); });
ipcMain.handle('switcher:pin', (_e, on) => {
  if (!switcherWin) return false;
  switcherWin.setAlwaysOnTop(!!on);
  return switcherWin.isAlwaysOnTop();
});

function partitionFor(url) {
  try { const h = new URL(url).hostname;
    if (/(^|\.)twitch\.tv$/.test(h)) return PARTS.twitch;
    if (/(^|\.)(youtube\.com|youtu\.be|google\.com)$/.test(h)) return PARTS.youtube;
  } catch {}
  return PARTITION;
}
function openSiteWindow(url, width = 1100, height = 780, partition) {
  if (!/^https:\/\//.test(url)) return;
  const win = new BrowserWindow({
    width, height, backgroundColor: '#0a0c0d', autoHideMenuBar: true, title: 'Stream Multiview', icon: ICON,
    webPreferences: { partition: partition || partitionFor(url), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadURL(url);
  return win;
}

function createMain() {
  const st = loadState();
  mainWin = new BrowserWindow({
    width: st?.width || 1600, height: st?.height || 900, x: st?.x, y: st?.y,
    minWidth: 800, minHeight: 500, backgroundColor: '#0a0c0d', title: 'Stream Multiview', autoHideMenuBar: true, icon: ICON,
    webPreferences: appWebPrefs()
  });
  if (st?.maximized) mainWin.maximize();
  mainWin.loadFile(path.join(__dirname, 'index.html'));
  mainWin.webContents.on('will-navigate', e => e.preventDefault());
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
app.on('web-contents-created', (_e, wc) => {
  try { wc.setUserAgent(chromeUA()); } catch {}   // every view (incl. each stream's private storage) looks like normal Chrome
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
  // Lock down embedded views: no Node access, https only.
  wc.on('will-attach-webview', (ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    if (!/^https:\/\//.test(params.src || '')) ev.preventDefault();
  });

  wc.setWindowOpenHandler(({ url }) => {
    // Kick pages and login providers open inside the app so they share the login.
    if (isKick(url) || isLoginProvider(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 560, height: 760, autoHideMenuBar: true, backgroundColor: '#0a0c0d', icon: ICON,
          webPreferences: { session: wc.session, contextIsolation: true, nodeIntegration: false, sandbox: true }   // same login as the page that opened it
        }
      };
    }
    // Anything else (links posted in chat, etc.) opens in your normal browser.
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

/* ---------- messages from the multiview page ---------- */
ipcMain.handle('open-window', (_e, url, w, h) => { openSiteWindow(url, w, h); });
ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

// Streams pop-out window
const cleanSpecs = list => (Array.isArray(list) ? list : []).filter(s => s && typeof s.channel === 'string')
  .map(s => ({ channel: s.channel, vol: +s.vol || 0, muted: !!s.muted }));
ipcMain.handle('streams:open', (_e, specs) => { openStreamsWindow(cleanSpecs(specs)); });
ipcMain.handle('streams:close', () => { streamsWin?.close(); });
ipcMain.handle('streams:isOpen', () => !!streamsWin);
ipcMain.on('streams:report', (_e, list) => { lastStreams = cleanSpecs(list); });
ipcMain.handle('chat:add', (_e, channel) => {
  if (typeof channel === 'string' && mainWin) { mainWin.webContents.send('chat:add', channel); mainWin.focus(); }
});

/* ---------- live alerts for saved channels ---------- */
// A hidden, muted window on kick.com (using your Kick login) asks Kick for each saved channel's info.
let liveWin = null, liveLoading = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ensureLiveWin() {
  if (liveWin && !liveWin.isDestroyed()) return liveLoading;
  liveWin = new BrowserWindow({ show: false, width: 900, height: 700,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  liveWin.webContents.setAudioMuted(true);
  liveWin.on('closed', () => { liveWin = null; });
  liveLoading = liveWin.loadURL('https://kick.com/robots.txt').catch(() => {});
  return liveLoading;
}
async function fetchChannel(slug) {
  if (!SLUG_RE.test(slug)) return null;
  await ensureLiveWin();
  if (!liveWin) return null;
  for (const ver of ['v2', 'v1']) {
    const url = `/api/${ver}/channels/${slug}`;
    const r = await liveWin.webContents.executeJavaScript(
      `fetch(${JSON.stringify(url)},{credentials:'include',headers:{Accept:'application/json'}})` +
      `.then(async r=>({status:r.status,body:r.ok?await r.text():''})).catch(()=>({status:0,body:''}))`, true
    ).catch(() => ({ status: 0, body: '' }));
    if (r.status === 200){ const info = parseChannel(r.body, slug); if (info) return info; }
    if (r.status === 404) return { missing: true };
  }
  // Blocked (e.g. a security check): open the address directly so the browser can pass the check, then read it.
  try {
    await liveWin.loadURL(`https://kick.com/api/v2/channels/${slug}`);
    for (let i = 0; i < 6; i++) {
      await sleep(1500);
      const txt = await liveWin.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true).catch(() => '');
      const info = parseChannel(txt, slug);
      if (info) { liveLoading = Promise.resolve(); return info; }
    }
  } catch {}
  return null;
}
const liveNotes = new Set();          // keep notifications alive so their click handlers work
let notifyPrefs = { all: true, off: [] };
function notifyLive(slug, info) {
  mainWin?.webContents.send('live:went-live', slug, info);
  if (!notifyPrefs.all || notifyPrefs.off.includes(slug) || !Notification.isSupported()) return;
  const body = [info.title, info.category, info.viewers != null ? `${info.viewers.toLocaleString()} watching` : ''].filter(Boolean).join(' · ');
  const n = new Notification({ title: `${info.name || slug} is live on ${platformOf(slug)}`, body: body || 'Click to watch', icon: ICON });
  liveNotes.add(n);
  n.on('click', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); mainWin.webContents.send('open-channel', slug); }
    liveNotes.delete(n);
  });
  n.on('close', () => liveNotes.delete(n));
  n.show();
}
const TWITCH_CID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';   // Twitch's public web client id
const BROWSER_HEADERS = () => ({ 'User-Agent': chromeUA(), 'Accept-Language': 'en-US,en;q=0.9' });
async function fetchTwitch(login) {
  try {
    const r = await fetch('https://gql.twitch.tv/gql', { method: 'POST',
      headers: { 'Client-Id': TWITCH_CID, 'Content-Type': 'text/plain;charset=UTF-8', ...BROWSER_HEADERS() },
      body: JSON.stringify({ query: `query{user(login:${JSON.stringify(login)}){login displayName stream{id title viewersCount game{name}}}}` }) });
    if (r.ok) { const info = parseTwitch(await r.json(), login); if (info) return info; }
  } catch {}
  try {   // fallback: the channel page
    const r = await fetch(`https://www.twitch.tv/${login}`, { headers: BROWSER_HEADERS() });
    if (r.ok) return parseTwitchHtml(await r.text(), login);
  } catch {}
  return null;
}
async function fetchYouTube(ch) {
  try {
    const r = await fetch(ytLiveUrl(ch), { headers: { ...BROWSER_HEADERS(), Cookie: 'SOCS=CAI; CONSENT=YES+1' } });
    if (r.status === 404) return { missing: true };
    if (r.ok) return parseYouTube(await r.text(), ch);
  } catch {}
  return null;
}
const fetchAny = ch => /^tw:/.test(ch) ? fetchTwitch(ch.slice(3)) : /^yt:/.test(ch) ? fetchYouTube(ch) : fetchChannel(ch);
ipcMain.handle('yt:resolve', async (_e, ch) => (typeof ch === 'string' && /^yt:/.test(ch) ? fetchYouTube(ch) : null));

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
        body: JSON.stringify({ query: 'query($l:[String!]){users(logins:$l){login displayName stream{id title viewersCount game{name}}}}', variables: { l: logins } }) });
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
function loadYtKey() {
  try {
    const d = JSON.parse(fs.readFileSync(ytKeyFile(), 'utf8'));
    if (d && d.enc && safeStorage.isEncryptionAvailable()) { ytKey = safeStorage.decryptString(Buffer.from(d.enc, 'base64')); ytKeySaved = true; }
  } catch {}
}
function storeYtKey(key) {
  ytKey = key; ytKeySaved = false; ytGate.reset();
  try {
    if (!key) fs.rmSync(ytKeyFile(), { force: true });
    else if (safeStorage.isEncryptionAvailable()) { fs.writeFileSync(ytKeyFile(), JSON.stringify({ enc: safeStorage.encryptString(key).toString('base64') })); ytKeySaved = true; }
  } catch {}
}
const ytKeyStatus = () => ({ set: !!ytKey, saved: ytKeySaved, ...ytGate.status() });
let lastYtState = 'ok';
function ytKeyChanged() {
  const st = ytGate.status().state;
  if (st !== lastYtState) { lastYtState = st; mainWin?.webContents.send('ytkey:status', ytKeyStatus()); }
}
const YT_API = process.env.SMV_YT_API || 'https://www.googleapis.com/youtube/v3';   // tests point this at a stand-in
// One YouTube Data API call. Error answers go to the gate (which decides when to use the key again) and throw.
async function ytApi(pathAndQuery, key = ytKey) {
  const r = await fetch(`${YT_API}/${pathAndQuery}&key=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' } });
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
async function ytBatch(chs) {
  if (!chs.length || !ytKey || !ytGate.usable()) return { results: [], rest: chs };
  const results = [], rest = [], feeds = new Map(), ask = new Set();
  try {
    for (const ch of chs) {
      if (ch.startsWith('yt:v:')) { ask.add(ch.slice(5)); continue; }
      const id = await ytChannelId(ch);
      if (!id) { results.push([ch, { missing: true }]); continue; }
      let f = null;
      try {
        const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { headers: BROWSER_HEADERS() });
        if (r.status === 404) { results.push([ch, { missing: true }]); continue; }
        if (r.ok) f = parseYtFeed(await r.text());
      } catch {}
      if (!f) { rest.push(ch); continue; }
      feeds.set(ch, f);
      f.ids.forEach(v => { if (!ytDone.has(v)) ask.add(v); });
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
    for (const ch of chs) {
      if (results.some(([c]) => c === ch) || rest.includes(ch)) continue;
      const f = feeds.get(ch), cand = ch.startsWith('yt:v:') ? [ch.slice(5)] : f.ids;
      const liveId = cand.find(v => vids.has(v) && vids.get(v).state === 'live');
      const v = liveId && vids.get(liveId);
      results.push([ch, { live: !!v, videoId: liveId || null, title: v ? v.title : '', viewers: v ? v.viewers : null, category: '',
        name: (f && f.name) || (v && v.channelTitle) || ch.replace(/^yt:(v:|c:)?/, ''), checked: at }]);
    }
    return { results, rest };
  } catch (e) {
    if (e && e.status) { ytGate.fail(e); ytKeyChanged(); }
    return { results: [], rest: chs };   // this round is checked page by page instead
  }
}
async function liveBatch(list) {
  const kick = list.filter(c => !/^(tw|yt):/.test(c)), tw = list.filter(c => /^tw:/.test(c)), yt = list.filter(c => /^yt:/.test(c));
  const safe = (fn, chs) => fn(chs).catch(() => ({ results: [], rest: chs }));
  const parts = await Promise.all([safe(kickBatch, kick), safe(twitchBatch, tw), safe(ytBatch, yt)]);
  return { results: parts.flatMap(p => p.results), rest: parts.flatMap(p => p.rest) };
}
ipcMain.handle('ytkey:status', () => ytKeyStatus());
ipcMain.handle('ytkey:set', async (_e, key) => {
  key = String(key || '').trim();
  if (!/^[\w-]{20,100}$/.test(key)) return { ...ytKeyStatus(), error: 'format' };
  try { await ytApi('videos?part=id&id=dQw4w9WgXcQ', key); }   // one test question (1 quota unit)
  catch (e) {
    if (!e.status) return { ...ytKeyStatus(), error: 'network' };
    const g = createKeyGate(); const st = g.fail(e);
    if (st === 'badkey') return { ...ytKeyStatus(), error: 'badkey', reason: e.reason };
    // over quota or too fast: the key itself is fine, so keep it
    storeYtKey(key); ytGate.fail(e); ytKeyChanged(); watcher.checkSoon();
    return ytKeyStatus();
  }
  storeYtKey(key); ytKeyChanged(); watcher.checkSoon();
  return ytKeyStatus();
});
ipcMain.handle('ytkey:remove', () => { storeYtKey(''); ytKeyChanged(); return ytKeyStatus(); });

const watcher = createLiveWatcher({
  fetchChannel: fetchAny,
  fetchBatch: liveBatch,
  batchIntervalMs: 30000,   // batched checks are cheap: Kick (1-4 requests on your login) and Twitch (1) every 30 s
  onStatus: snap => mainWin?.webContents.send('live:status', snap),
  onWentLive: notifyLive
});
ipcMain.on('live:watch', (_e, data) => {
  const d = data || {};
  notifyPrefs = { all: d.notifyAll !== false, off: Array.isArray(d.off) ? d.off.map(String) : [] };
  watcher.setChannels(Array.isArray(d.channels) ? d.channels : []);
});
ipcMain.on('live:check-now', () => watcher.checkSoon());

/* ---------- chat mentions / replies ---------- */
ipcMain.on('mention:notify', (_e, m) => {
  if (!m || typeof m.channel !== 'string' || !Notification.isSupported()) return;
  const who = String(m.sender || 'Someone').slice(0, 40), where = String(m.label || m.channel).slice(0, 40);
  const title = m.kind === 'spam' ? `Likely spam in ${where}'s chat` : m.kind === 'reply' ? `${who} replied to you in ${where}'s chat` : `${who} mentioned you in ${where}'s chat`;
  const body = (m.kind === 'spam' ? `${who}: ` : m.kind === 'reply' && m.quoted ? `"${String(m.quoted).slice(0, 60)}"  →  ` : '') + String(m.body || '').slice(0, 180);
  const n = new Notification({ title, body: body || ' ', icon: ICON });
  liveNotes.add(n);
  n.on('click', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); mainWin.webContents.send('focus-chat', m.channel); }
    liveNotes.delete(n);
  });
  n.on('close', () => liveNotes.delete(n));
  n.show();
});
// Best guess at your Kick username from your logged-in session (you can also type it in).
ipcMain.handle('me:detect', async () => {
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
ipcMain.handle('live:snapshot', () => watcher.snapshot());

async function logout(plat = 'kick') {
  const part = PARTS[plat];
  // Close that platform's open pages first so nothing re-saves the old login.
  BrowserWindow.getAllWindows().forEach(w => {
    if (w === mainWin || w === streamsWin || w === liveWin || w === switcherWin) return;
    try { if (w.webContents.session === session.fromPartition(part)) w.close(); } catch {}
  });
  await session.fromPartition(part).clearStorageData();
  await session.fromPartition(part).clearCache().catch(() => {});
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
ipcMain.handle('account:logout', async (_e, plat) => { await logout(PARTS[plat] ? plat : 'kick'); return true; });
ipcMain.handle('account:login', (_e, plat) => { openLogin(PARTS[plat] ? plat : 'kick'); });
// Who is logged in where (Twitch keeps your name in a cookie; YouTube only tells us that you're signed in).
ipcMain.handle('accounts:status', async () => {
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
  const file = path.join(__dirname, 'signin-preload.js');
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
ipcMain.handle('youtube:consentFallback', async (_e, part) => {
  if (typeof part !== 'string' || !/^persist:(kmv-[\w-]+|youtube)$/.test(part)) return false;
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
ipcMain.handle('youtube:fromFirefox', async () => {
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
      return { links: out, signedOut: ${JSON.stringify(plat)} === 'youtube' && !!document.querySelector('ytd-masthead a[href*="ServiceLogin"], ytd-masthead ytd-button-renderer a[href*="accounts.google.com"]') };
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
  return liveWin.webContents.executeJavaScript(`(async () => {
    const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
    const t = ck('session_token'), x = ck('XSRF-TOKEN');
    if (!t) return { login: true };
    const h = { Accept: 'application/json', Authorization: 'Bearer ' + t };
    if (x) h['X-XSRF-TOKEN'] = x;
    try { const r = await fetch(${JSON.stringify(u)}, { credentials: 'include', headers: h }); return { status: r.status, d: r.ok ? await r.json() : null }; }
    catch (e) { return { status: 0, d: null }; }
  })()`, true).catch(() => null);
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
async function twitchFollows() {
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
  return scrapeFollowPage('twitch', 'https://www.twitch.tv/directory/following/channels');
}
// Whether you can moderate a channel (its moderator, or your own channel): true, false, or null when
// it can't be told (signed out, offline). Windows only show their mod view button when it's true.
ipcMain.handle('mod:check', async (_e, ch) => {
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
ipcMain.handle('follows:import', async (_e, plat) => {
  if (!PARTS[plat]) return { error: 'bad' };
  if (importing) return { error: 'busy' };
  importing = plat;
  try {
    progress(plat, 'Reading the channels you follow…');
    const r = await (plat === 'kick' ? kickFollows() : plat === 'twitch' ? twitchFollows() : youtubeFollows());
    if (r && r.items) r.items = r.items.filter(x => validCh(x.ch));
    return r || { error: 'failed' };
  } catch { return { error: 'failed' }; }
  finally { importing = null; }
});

/* ---------- keeping saved logins safe ----------
   1. Encryption: harden.js (run by the launcher) switches on the engine's cookie encryption, so
      saved logins are encrypted with a key tied to your Windows account. Logins saved before that
      are re-saved once so they get encrypted too.
   2. "Forget my login when I close the app" per site: that site's saved login is wiped on quit
      (and at start-up, in case the app didn't close normally). */
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
async function forgetLogins(which) {
  for (const p of which) {
    const ses = session.fromPartition(PARTS[p]);
    await ses.clearStorageData().catch(() => {});
    await ses.clearCache().catch(() => {});
    await ses.cookies.flushStore().catch(() => {});
  }
}
const forgetList = () => Object.keys(PARTS).filter(p => sec && sec.forget[p]);
ipcMain.handle('security:get', () => ({ encryption: encryptionState(), forget: { ...sec.forget } }));
ipcMain.handle('security:setForget', (_e, plat, on) => {
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
  if (needForget) jobs.push(forgetLogins(forgetList()));
  if (gameWin) jobs.push(Promise.race([releaseGame(), sleep(2500)]));
  Promise.all(jobs).finally(() => { try { gameHelper && gameHelper.kill(); } catch {} app.quit(); });
});

/* ---------- showing another app's window (e.g. a Discord pop-out) ---------- */
let pendingCapture = null;
ipcMain.handle('capture:sources', async () => {
  const own = new Set(BrowserWindow.getAllWindows().map(w => { try { return w.getMediaSourceId(); } catch { return ''; } }));
  let list = [];
  try { list = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true }); } catch { return []; }
  return list.filter(s => s.name && !own.has(s.id)).map(s => ({
    id: s.id, name: s.name, screen: s.id.startsWith('screen:'),
    thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
    icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : ''
  }));
});
ipcMain.handle('capture:choose', (_e, id) => { pendingCapture = typeof id === 'string' ? id : null; return true; });
function setupCapture() {
  // The page asks for "screen sharing"; answer with the window you picked (no system picker).
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    const id = pendingCapture; pendingCapture = null;
    if (!id) return cb({});
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
ipcMain.on('game:shape', (_e, d) => { gameShape = d && d.hole ? d : null; applyGameShape(); placeGameSoon(); });

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
ipcMain.handle('game:attach', async (_e, d) => {
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
ipcMain.handle('game:release', async () => { await releaseGame(); return true; });
ipcMain.handle('game:strip', async (_e, on) => { if (gameWin) { gameWin.strip = !!on; if (!on) { const o = gameWin.orig; await gh('restore', gameWin.hwnd, o.x, o.y, o.w, o.h, o.style); } lastPlaced = ''; await placeGame(); } return true; });
ipcMain.handle('game:focus', async () => { if (gameWin) { focusNext = true; lastPlaced = ''; await placeGame(); } return !!gameWin; });
ipcMain.on('game:onTop', (_e, on) => { if (mainWin && !mainWin.isDestroyed()) mainWin.setAlwaysOnTop(!!on, on ? 'floating' : 'normal'); });

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
  installed_app: INSTALLED, platform: process.platform, ...updState });
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
    updState = { ...updState, latest: info.version, notes: info.notes, notesHtml: info.notesHtml, zip: info.zip, page: info.page, asset: inst,
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
// Save a download to disk without holding it all in memory.
async function downloadTo(url, file) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'Stream-Multiview-Updater' } });
  if (!r.ok || !r.body) throw new Error('download ' + r.status);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.part', out = fs.createWriteStream(tmp);
  const reader = r.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(Buffer.from(value))) await new Promise(res => out.once('drain', res));
    }
  } finally { await new Promise(res => out.end(res)); }
  fs.renameSync(tmp, file);
  return file;
}
async function installInstaller() {
  if (updState.manual || !updState.asset) { shell.openExternal(updState.page || `https://github.com/${upd.repo}/releases/latest`); return updStatus(); }
  updState = { ...updState, state: 'downloading', error: '' }; sendUpd();
  try {
    const dir = process.platform === 'darwin' ? app.getPath('downloads') : path.join(app.getPath('temp'), 'stream-multiview-update');
    const file = await downloadTo(updState.asset.url, path.join(dir, path.basename(updState.asset.name)));
    updState = { ...updState, state: 'ready', installed: updState.latest, installerFile: file, needsInstall: false };
  } catch (e) {
    updState = { ...updState, state: 'error', error: String(e && e.message || e) };
  }
  sendUpd();
  return updStatus();
}
// Hand over to the downloaded installer, then close so it can replace the app.
function runInstaller() {
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
  updState = { ...updState, state: 'downloading', error: '' }; sendUpd();
  try {
    const r = await net.fetch(updState.zip, { headers: { 'User-Agent': 'Stream-Multiview-Updater' } });
    if (!r.ok) throw new Error('download ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
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
ipcMain.handle('update:status', () => updStatus());
ipcMain.handle('update:check', () => checkForUpdate({ manual: true }));
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('update:settings', (_e, d) => {
  if (d && typeof d.auto === 'boolean') upd.auto = d.auto;
  if (d && typeof d.repo === 'string') {
    const r = d.repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (r === '' || updater.REPO_RE.test(r)) { upd.repo = r; updState = { ...updState, state: 'idle', latest: null, error: '' }; }
  }
  saveUpd(); sendUpd();
  return updStatus();
});
ipcMain.handle('update:open-page', () => { shell.openExternal(updState.page || `https://github.com/${upd.repo}/releases/latest`); return true; });
ipcMain.handle('update:restart', () => {
  if (INSTALLED) return { installer: runInstaller(), mac: process.platform === 'darwin' };
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
const HELP_FILES = ['INSTRUCTIONS.txt', 'CHANGELOG.md'];
// Installed builds keep the help files next to the packed app (app.asar.unpacked) so other programs can open them.
const helpPath = name => app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', name) : path.join(APP_ROOT, name);
ipcMain.handle('help:read', (_e, name) => {
  if (!HELP_FILES.includes(name)) return null;
  try { return fs.readFileSync(helpPath(name), 'utf8'); } catch {}
  try { return fs.readFileSync(path.join(APP_ROOT, name), 'utf8'); } catch { return null; }
});
ipcMain.handle('help:open', (_e, name) => { if (HELP_FILES.includes(name)) shell.openPath(helpPath(name)); });
ipcMain.handle('app:version', () => app.getVersion());

/* ---------- menu ---------- */
// Who is logged in where, as the page last told us (it checks on start and after every log in or out).
let menuAccounts = { kick: '', twitch: '', youtube: false };
ipcMain.on('accounts:state', (_e, a) => {
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
      { label: 'Instructions', click: () => showMain()?.webContents.send('help:show', 'guide') },
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
  sec = loadSec();
  loadYtKey();
  if (forgetList().length) await forgetLogins(forgetList());     // the app didn't get to wipe them last time
  encryptOldLogins();
  const ua = chromeUA();
  app.userAgentFallback = ua;
  Object.values(PARTS).forEach(p => session.fromPartition(p).setUserAgent(ua));
  setupGoogleSignin(session.fromPartition(PARTS.youtube));
  setupCapture();
  scheduleUpdates();
  buildMenu();
  createMain();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMain(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
