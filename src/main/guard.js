// What the app lets in: who may send its messages, what the sites in it may ask for, which addresses open
// where, and which storage a web view may use. main.js wires these in; nothing here needs a window (the unit
// tests call it with stand-ins).
const path = require('path');
const { fileURLToPath } = require('url');

/* ---------- addresses ---------- */
const urlOf = u => { try { return new URL(String(u)); } catch { return null; } };
// An address to open in your browser: http or https, without a name and password in it ('' for anything else).
function webUrl(u) {
  const x = urlOf(u);
  return x && (x.protocol === 'https:' || x.protocol === 'http:') && !x.username && !x.password ? x.href : '';
}
const httpsHost = u => { const x = urlOf(u); return x && x.protocol === 'https:' ? x.hostname.toLowerCase() : ''; };
const SITE_HOST = /(^|\.)(kick\.com|twitch\.tv|youtube\.com|youtu\.be)$/;
const LOGIN_HOST = /(^|\.)(google\.com|apple\.com)$|^accounts\.youtube\.com$/;
// The sites themselves, and the pages they send you to to sign in: these open inside the app, with its logins.
const isSite = u => SITE_HOST.test(httpsHost(u));
const isLogin = u => LOGIN_HOST.test(httpsHost(u));
const inApp = u => isSite(u) || isLogin(u);

/* ---------- web views ---------- */
// The storage a <webview> may use: a site's login, a stream's own, the switch control's, web pages'.
const VIEW_PARTITION = /^persist:(kick|twitch|youtube|kmv-mini|kmv-web|kmv-stream-[\w-]{1,120})$/;
// will-attach-webview: what a web view may be. -> false to refuse it
function lockWebview(webPreferences, params) {
  delete webPreferences.preload;
  delete webPreferences.preloadURL;
  delete webPreferences.enableBlinkFeatures;
  Object.assign(webPreferences, {
    nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, contextIsolation: true,
    sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, plugins: false, experimentalFeatures: false
  });
  return !!httpsHost(params && params.src) && VIEW_PARTITION.test(String(params && params.partition || ''));
}

/* ---------- who sent a message ---------- */
// files: { main, streams, switcher } the page each app window shows; windows(): those windows now.
// -> e => 'main' | 'streams' | 'switcher' | null (anything else: a web view, a pop-up, an extension's page)
function senderRole({ files, windows }) {
  const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  return e => {
    const wc = e && e.sender, f = e && e.senderFrame;
    if (!wc || !f || f.parent) return null;                 // only the window's own page, not a frame in it
    const u = urlOf(f.url);
    if (!u || u.protocol !== 'file:') return null;
    let file;
    try { file = path.normalize(fileURLToPath(u)); } catch { return null; }
    const w = windows();
    for (const role of ['main', 'streams', 'switcher']) {
      const win = w[role];
      if (win && !win.isDestroyed() && win.webContents === wc && same(file, path.normalize(files[role]))) return role;
    }
    return null;
  };
}
// ipcMain.handle / ipcMain.on that only answer the app windows in `roles` (anyone else: refused, and denied() told).
function guardedIpc(ipcMain, roleOf, roles, denied = () => {}) {
  const ok = e => roles.includes(roleOf(e));
  return {
    handle: (ch, fn) => ipcMain.handle(ch, (e, ...a) => {
      if (ok(e)) return fn(e, ...a);
      denied(ch, e);
      throw new Error(`${ch} isn't allowed from there`);
    }),
    on: (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (ok(e)) fn(e, ...a); else denied(ch, e); })
  };
}

/* ---------- what pages may ask for ---------- */
// The app's own pages: full screen, copying, and showing a window you picked (window capture). The sites: full
// screen and copying (their players and copy buttons). Everything else is refused: microphone, camera, location,
// notifications (the app sends its own), opening other apps (external links go through the app), devices.
const APP_ASKS = new Set(['fullscreen', 'clipboard-sanitized-write', 'display-capture', 'media']);
const SITE_ASKS = new Set(['fullscreen', 'clipboard-sanitized-write']);
// { app: whether it's the app's own page, permission, mediaTypes (a request) or mediaType (a check) } -> true to allow
function mayAsk({ app, permission, mediaTypes, mediaType }) {
  if (!(app ? APP_ASKS : SITE_ASKS).has(permission)) return false;
  if (permission !== 'media') return true;
  if (Array.isArray(mediaTypes)) return mediaTypes.length > 0 && mediaTypes.every(t => t === 'video');   // a picture, never sound
  return mediaType === 'video';
}
// Puts the rules on a session. isApp(webContents, url) says whether it's one of the app's own pages.
const locked = new WeakSet();
function lockSession(ses, isApp) {
  if (!ses || locked.has(ses)) return;
  locked.add(ses);
  const app = (wc, url) => { try { return !!wc && /^file:/i.test(String(url || '')) && isApp(wc); } catch { return false; } };
  ses.setPermissionRequestHandler((wc, permission, cb, details = {}) =>
    cb(mayAsk({ app: app(wc, details.requestingUrl), permission, mediaTypes: details.mediaTypes })));
  ses.setPermissionCheckHandler((wc, permission, origin, details = {}) =>
    mayAsk({ app: app(wc, details.requestingUrl || origin), permission, mediaType: details.mediaType }));
  if (ses.setDevicePermissionHandler) ses.setDevicePermissionHandler(() => false);
  // asked to pick a device: no device (without an answer, Electron would pick the first one)
  for (const ev of ['select-hid-device', 'select-serial-port', 'select-usb-device'])
    ses.on(ev, (e, _details, cb) => { e.preventDefault(); try { cb(ev === 'select-usb-device' ? undefined : ''); } catch {} });
}

/* ---------- pop-ups and links ---------- */
// A page asks to open `url` in a new window. fromApp: one of the app's own pages. recent: you clicked or typed in
// that page just before. -> 'app' (a window in the app, with the page's login), 'external' (your browser) or 'deny'.
function popupFor(url, { fromApp = false, recent = true } = {}) {
  if (!fromApp && inApp(url)) return 'app';
  return webUrl(url) && (fromApp || recent) ? 'external' : 'deny';
}
// Whether a window that should stay on the sites (a pop-up, a sign-in window) may go to `url`.
const mayNavigate = url => inApp(url) || /^about:blank$/.test(String(url));

module.exports = { webUrl, isSite, isLogin, inApp, VIEW_PARTITION, lockWebview, senderRole, guardedIpc, mayAsk, lockSession, popupFor, mayNavigate };
