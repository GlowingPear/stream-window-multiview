// Chrome extensions: which ones are installed, and which pages each one runs on.
// An extension is switched on per site (Kick, Twitch, YouTube) and per window type (streams, chats).
// Electron loads an extension into a session (a set of pages sharing storage), so:
//   - chats use their site's login session, shared by every chat of that site (and by its streams
//     while "Watch signed in" is on), so they follow the Chats setting;
//   - each logged-out stream has its own session, so a single stream window can be switched on or off.
// The top half is plain logic (tested on its own); createHost() below wires it into Electron.
const fs = require('fs');
const path = require('path');

const PLATS = ['kick', 'twitch', 'youtube'];
const KINDS = ['stream', 'chat'];
const SITE_PARTS = { 'persist:kick': 'kick', 'persist:twitch': 'twitch', 'persist:youtube': 'youtube' };
const STREAM_PREFIX = 'persist:kmv-stream-';
const STORE_PART = 'persist:kmv-webstore';
const STORE_URL = 'https://chromewebstore.google.com/';
const UPDATE_EVERY = 5 * 60 * 60 * 1000;

// New extensions: on for streams, off for chats.
const defaultGrid = () => Object.fromEntries(PLATS.map(p => [p, { stream: true, chat: false }]));

// A session's site and window type. Sites' own sessions count as chats.
function targetOf(partition, plat, kind) {
  if (SITE_PARTS[partition]) return { plat: SITE_PARTS[partition], kind: 'chat', perWindow: false };
  if (typeof partition === 'string' && partition.startsWith(STREAM_PREFIX) && PLATS.includes(plat) && kind === 'stream')
    return { plat, kind: 'stream', perWindow: true };
  return null;
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || !/^[a-p]{32}$/.test(e.id)) return null;
  const grid = defaultGrid();
  for (const p of PLATS) for (const k of KINDS) if (typeof e.grid?.[p]?.[k] === 'boolean') grid[p][k] = e.grid[p][k];
  const win = {};
  for (const [part, on] of Object.entries(e.win || {})) if (part.startsWith(STREAM_PREFIX) && typeof on === 'boolean') win[part] = on;
  const out = { id: e.id, source: e.source === 'folder' ? 'folder' : 'store', enabled: e.enabled !== false, grid, win };
  if (out.source === 'folder') { if (typeof e.path !== 'string' || !e.path) return null; out.path = e.path; }
  return out;
}
function normalizeList(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).map(normalizeEntry).filter(e => e && !seen.has(e.id) && seen.add(e.id));
}

// Is this extension on in this session? A stream window's own choice wins over the grid.
function isOn(entry, t, partition) {
  if (!entry.enabled || !t) return false;
  if (t.perWindow && typeof entry.win[partition] === 'boolean') return entry.win[partition];
  return entry.grid[t.plat][t.kind];
}
const wantedIds = (list, t, partition) => list.filter(e => isOn(e, t, partition)).map(e => e.id);

// The extension ID from a Chrome Web Store link (or the ID itself).
function idFromInput(s) {
  const m = String(s || '').trim().match(/(?:^|[/=])([a-p]{32})(?=$|[/?#&])/);
  return m ? m[1] : null;
}

// Chrome features extensions use that this app doesn't have.
const UNSUPPORTED = {
  tabCapture: 'capturing a page\'s sound (tabCapture)',
  offscreen: 'offscreen documents',
  userScripts: 'user scripts',
  debugger: 'the debugger',
  downloads: 'downloads',
  history: 'history',
  bookmarks: 'bookmarks',
  sidePanel: 'the side panel',
  identity: 'signing in with Google (identity)',
  proxy: 'proxy settings',
  tts: 'text to speech',
  pageCapture: 'saving pages',
  desktopCapture: 'screen capture'
};
const permsOf = m => new Set([...(m?.permissions || []), ...(m?.optional_permissions || [])]);
function compat(manifest) {
  const perms = permsOf(manifest);
  return Object.keys(UNSUPPORTED).filter(p => perms.has(p)).map(p => UNSUPPORTED[p]);
}
// Blockers (uBlock Origin Lite and the like) block with Chrome's blocking rules, which Electron doesn't have.
const blocksNothing = manifest => ['declarativeNetRequest', 'declarativeNetRequestWithHostAccess'].some(p => permsOf(manifest).has(p));

// The sites an extension asks for: its host permissions and where its content scripts run.
const hostsOf = m => [...(m.host_permissions || []), ...(m.content_scripts || []).flatMap(c => c.matches || []),
  ...(m.manifest_version === 2 ? (m.permissions || []).filter(p => /[:/*]/.test(p)) : [])];

// Which of Kick, Twitch and YouTube it can run on. One that names no sites (a popup, or activeTab) might
// run anywhere, so it counts as all of them.
const SITE_HOSTS = { kick: 'kick.com', twitch: 'twitch.tv', youtube: 'youtube.com' };
function sitesOf(manifest) {
  const hosts = hostsOf(manifest || {});
  if (!hosts.length) return [...PLATS];
  const names = hosts.map(h => h === '<all_urls>' ? '*' : (h.match(/^(?:[^:/]*:\/\/)?([^/:]+)/) || [])[1]).filter(Boolean).map(n => n.replace(/^\*\./, ''));
  return PLATS.filter(p => names.some(n => n === '*' || n === SITE_HOSTS[p] || n.endsWith('.' + SITE_HOSTS[p])));
}

// What the extension can do, in words, for the install dialog.
function permissionLines(manifest) {
  const m = manifest || {};
  const perms = new Set(m.permissions || []);
  const hosts = hostsOf(m);
  const lines = [];
  if (hosts.some(h => h === '<all_urls>' || /^\*:\/\/\*\/|^https?:\/\/\*\//.test(h)))
    lines.push('Read and change everything on the pages it\'s switched on for, including while you\'re signed in');
  else if (hosts.length) {
    const names = [...new Set(hosts.map(h => (h.match(/:\/\/(?:\*\.)?([^/]+)/) || [])[1]).filter(Boolean))];
    lines.push('Read and change your data on ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' and ' + (names.length - 4) + ' more' : ''));
  }
  const words = {
    tabs: 'See the address and title of every window', cookies: 'Read and change cookies',
    webRequest: 'See your network requests', declarativeNetRequest: 'Block or change network requests',
    tabCapture: 'Capture sound and video from pages', notifications: 'Show notifications',
    clipboardRead: 'Read what you copy', clipboardWrite: 'Change what you copy', downloads: 'Manage downloads',
    history: 'Read and change your history', management: 'See and manage your other extensions'
  };
  for (const [p, w] of Object.entries(words)) if (perms.has(p)) lines.push(w);
  return lines;
}

// The best icon file in an extension folder, as a data: URL.
function iconDataUrl(dir, manifest) {
  const icons = manifest?.icons || manifest?.action?.default_icon || {};
  const list = typeof icons === 'string' ? [[32, icons]] : Object.entries(icons).map(([s, f]) => [+s, f]);
  list.sort((a, b) => Math.abs(a[0] - 48) - Math.abs(b[0] - 48));
  for (const [, f] of list) {
    try {
      const file = path.join(dir, String(f).replace(/^\/+/, ''));
      if (!file.startsWith(path.resolve(dir))) continue;
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) continue;
      return 'data:image/' + (ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + fs.readFileSync(file).toString('base64');
    } catch {}
  }
  return '';
}

function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

// Before reloading an extension from its folder: { manifest }, or { error } saying what's wrong with the folder.
function checkFolder(dir) {
  try { if (!fs.statSync(dir).isDirectory()) throw new Error(); } catch { return { error: 'Its folder isn\'t there any more: ' + dir }; }
  let text;
  try { text = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'); } catch { return { error: 'Its folder has no manifest.json any more.' }; }
  let manifest;
  try { manifest = JSON.parse(text.replace(/^﻿/, '')); } catch (err) { return { error: 'Its manifest.json has a mistake in it: ' + err.message }; }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { error: 'Its manifest.json has a mistake in it.' };
  return { manifest };
}
// What a new version of an extension can do that the old one couldn't, in words (then it asks again).
function addedAccess(before, after) {
  const had = new Set(permissionLines(before));
  return permissionLines(after).filter(l => !had.has(l));
}

/* ---------- Electron side ---------- */
// deps: { electron, userData, appWindows: () => BrowserWindow[], rejectCookies: Google's "Reject all" cookie value }
// An address an extension may open in a window of its own: a web page, or one of its own pages.
const extOpenable = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:' || /^chrome-extension:\/\/[a-p]{32}\//.test(x.href); } catch { return false; } };
// The store window stays on the store (and Google's sign-in); anything else opens in your browser.
const STORE_HOST = /^(chromewebstore|accounts|consent)\.google\.com$/;
const storeNavOk = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' && STORE_HOST.test(x.hostname); } catch { return false; } };
const EXT_ID = /^[a-p]{32}$/;
const EXT_PARTITION = /^persist:(kick|twitch|youtube|kmv-stream-[\w-]{1,120})$/;

// chrome.cookies as Chrome has it: only with the "cookies" permission, and only the cookies of sites the extension
// may reach (its host permissions). electron-chrome-extensions gives every extension every cookie of its session
// (a chat's: your login), so its handlers are wrapped (scopeCookies).
function cookieHosts(manifest) {
  const m = manifest || {};
  return [...(Array.isArray(m.host_permissions) ? m.host_permissions : []), ...(Array.isArray(m.permissions) ? m.permissions : [])]
    .filter(p => typeof p === 'string')
    .map(p => p === '<all_urls>' ? '*' : ((p.match(/^(?:\*|https?|wss?):\/\/([^/]+)\//) || [])[1] || '').toLowerCase()).filter(Boolean);
}
// May an extension (its manifest) touch the cookies of `host` (a cookie's domain, or an address's host)?
function mayTouchCookie(manifest, host) {
  const h = String(host || '').toLowerCase().replace(/^\./, '');
  if (!h || !manifest || !Array.isArray(manifest.permissions) || !manifest.permissions.includes('cookies')) return false;
  return cookieHosts(manifest).some(p => p === '*' || p === h || p.endsWith('.' + h)            // the site, or a page of it (a parent's cookie)
    || (p.startsWith('*.') && (h === p.slice(2) || h.endsWith(p.slice(1)))));
}
const hostOfUrl = u => { try { return new URL(String(u)).hostname; } catch { return ''; } };
function scopeCookies(router) {
  const handlers = router && router.handlers;
  if (!handlers || typeof handlers.get !== 'function') return false;
  const wrap = (name, fn) => { const h = handlers.get(name); if (h) handlers.set(name, { ...h, permission: 'cookies', callback: (event, ...a) => fn(h.callback, event, ...a) }); };
  const may = (event, host) => mayTouchCookie(event && event.extension && event.extension.manifest, host);
  const refuse = () => { throw new Error('The extension may not use the cookies of this site'); };
  for (const name of ['cookies.get', 'cookies.set', 'cookies.remove'])
    wrap(name, (cb, event, details = {}, ...a) => may(event, hostOfUrl(details.url) || details.domain) ? cb(event, details, ...a) : refuse());
  wrap('cookies.getAll', async (cb, event, details = {}, ...a) => {
    if ((details.url || details.domain) && !may(event, hostOfUrl(details.url) || details.domain)) refuse();
    const all = await cb(event, details, ...a);
    return (Array.isArray(all) ? all : []).filter(c => may(event, c && c.domain));
  });
  // a change: told only to the extensions that may see that cookie
  const send = router.sendEvent.bind(router), broadcast = router.broadcastEvent.bind(router);
  router.broadcastEvent = (eventName, ...args) => {
    if (eventName !== 'cookies.onChanged') return broadcast(eventName, ...args);
    const domain = args[0] && args[0].cookie && args[0].cookie.domain;
    const ids = new Set(((router.listeners && router.listeners.get(eventName)) || []).map(l => l.extensionId));
    const exts = router.session && (router.session.extensions || router.session);
    for (const id of ids) { const ext = exts && exts.getExtension && exts.getExtension(id); if (ext && mayTouchCookie(ext.manifest, domain)) send(id, eventName, ...args); }
  };
  return true;
}

function createHost(deps) {
  const { electron, userData } = deps;
  const { app, session, BrowserWindow, webContents, ipcMain, dialog } = electron;
  // its messages answer only the app's windows (main.js); the ones that change what's installed, the main window only
  const ipc = deps.ipc || { app: ipcMain, main: ipcMain };
  const { ElectronChromeExtensions } = require('electron-chrome-extensions');
  const cws = require('electron-chrome-web-store');
  const listFile = path.join(userData, 'extensions.json');
  const extDir = path.join(userData, 'Extensions');
  let list = [];
  try { list = normalizeList(JSON.parse(fs.readFileSync(listFile, 'utf8'))); } catch {}
  const save = () => { try { fs.writeFileSync(listFile, JSON.stringify(list, null, 2)); } catch {} };
  const store = () => session.fromPartition(STORE_PART);
  const tracked = new Map();              // partition -> { plat, kind }: sessions the app's windows use
  const shells = new WeakMap();           // session -> ElectronChromeExtensions (tabs, popups, badges)
  const pending = new Map();              // extension id -> grid chosen in the Web Store's install dialog
  const opened = new WeakSet();           // windows extensions opened (the only ones they may close)
  let ready = null;

  // Every installed extension stays loaded in the Web Store's session (no logins there): it's the
  // catalogue the other sessions load from, and where updates are checked.
  const catalogue = id => store().extensions.getExtension(id);

  function shellFor(ses) {
    let s = shells.get(ses);
    if (s) return s;
    // Each one listens for new pages on the app (its 'web-contents-created'): one listener per session with an
    // extension on, and every stream channel has a session of its own, so the limit of 10 grows with them.
    app.setMaxListeners(app.getMaxListeners() + 1);
    s = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: ses,
      // An extension opening a page (its welcome page, a link in its popup): a window of its own on the same session.
      createTab: async details => {
        const win = new BrowserWindow({ width: 1000, height: 760, autoHideMenuBar: true, backgroundColor: '#0a0c0d',
          webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true } });
        opened.add(win);
        if (details.url && extOpenable(details.url)) win.loadURL(details.url);
        return [win.webContents, win];
      },
      createWindow: async details => {
        const win = new BrowserWindow({ width: details.width || 1000, height: details.height || 760, autoHideMenuBar: true,
          webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true } });
        opened.add(win);
        const url = Array.isArray(details.url) ? details.url[0] : details.url;
        if (url && extOpenable(url)) win.loadURL(url);
        return win;
      },
      // Also called whenever any of its pages goes away (a window closing, the app's windows reloading),
      // so only windows an extension opened itself are closed.
      removeTab: (_wc, win) => { if (win && opened.has(win) && !win.isDestroyed()) win.close(); }
    });
    if (!scopeCookies(s.ctx && s.ctx.router)) console.warn('extensions: could not limit chrome.cookies');
    // A popup waits for its page to report its size, which Electron doesn't always do for a hidden window
    // (or reports the smallest size): then measure the page's natural size, and show it next to the button.
    s.on('browser-action-popup-created', popup => {
      popup.whenReady().then(() => setTimeout(async () => {
        const win = popup.browserWindow;
        if (popup.isDestroyed() || !win || win.isDestroyed()) return;
        const b = win.getBounds();
        if (!popup.hidden && b.width > 25 && b.height > 25) return;
        try {
          win.setBounds({ ...win.getBounds(), width: 800, height: 600 });
          const width = await win.webContents.executeJavaScript(`(() => { const d = document.documentElement, w = d.style.width;
            d.style.width = 'max-content'; const r = Math.ceil(d.getBoundingClientRect().width); d.style.width = w; return r; })()`);
          popup.setSize({ width, height: 600 });
          const height = await win.webContents.executeJavaScript(`(() => { const b = document.body;   // where its content ends
            const r = document.createRange(); r.selectNodeContents(b);
            const end = Math.max(r.getBoundingClientRect().bottom, ...[...b.children].map(e => e.getBoundingClientRect().bottom));
            return Math.ceil(end + parseFloat(getComputedStyle(b).marginBottom || 0)) || 600; })()`);
          if (popup.isDestroyed()) return;
          popup.setSize({ width, height });
          popup.updatePosition();
          popup.show();
        } catch {}
      }, 250));
    });
    shells.set(ses, s);
    // web views already open in this session become its "tabs"
    for (const wc of webContents.getAllWebContents()) if (wc.session === ses) addTab(wc);
    return s;
  }
  function addTab(wc) {
    try {
      if (wc.getType() !== 'webview' || !wc.hostWebContents) return;
      const s = shells.get(wc.session);
      const win = BrowserWindow.fromWebContents(wc.hostWebContents);
      if (s && win) s.addTab(wc, win);
    } catch {}
  }
  app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'webview') wc.once('did-attach', () => addTab(wc)); });

  // Load the extensions a session should have and remove the rest. Returns true if anything changed.
  async function sync(partition) {
    const t = tracked.get(partition);
    const ses = session.fromPartition(partition);
    const want = new Set(wantedIds(list, targetOf(partition, t?.plat, t?.kind), partition).filter(id => catalogue(id)));
    if (want.size) shellFor(ses);
    let changed = false;
    for (const e of ses.extensions.getAllExtensions()) {
      const cat = catalogue(e.id);
      if (!want.has(e.id) || (cat && cat.version !== e.version)) { ses.extensions.removeExtension(e.id); changed = true; }
    }
    for (const id of want) {
      if (ses.extensions.getExtension(id)) continue;
      try { await ses.extensions.loadExtension(catalogue(id).path); changed = true; } catch (err) { console.error('extension', id, err.message); }
    }
    return changed;
  }
  // force: tell the app windows even if no session changed (the list itself did).
  // also: sessions already changed by the caller, whose windows need reloading too.
  async function syncAll(force, also = []) {
    const changed = [...also];
    for (const p of tracked.keys()) if (await sync(p) && !changed.includes(p)) changed.push(p);
    if (changed.length || force) for (const w of deps.appWindows()) w.webContents.send('ext:changed', changed);
    return changed;
  }

  async function start() {
    await cws.installChromeWebStore({
      session: store(), extensionsPath: extDir, loadExtensions: true, autoUpdate: false,
      beforeInstall: async d => {
        const ans = await confirm({ id: d.id, name: d.localizedName || d.manifest?.name, version: d.manifest?.version,
          icon: d.icon && !d.icon.isEmpty() ? d.icon.toDataURL() : '', manifest: d.manifest });
        if (ans && ans.ok) { pending.set(d.id, { grid: ans.grid, manifest: d.manifest || {} }); return { action: 'allow' }; }
        return { action: 'deny' };
      }
    });
    // Installed from the Web Store window: add it once it has loaded.
    store().extensions.on('extension-loaded', async (_e, ext) => {
      const p = pending.get(ext.id);
      if (!p) return;
      pending.delete(ext.id);
      // the dialog showed what the store's page said: if what came asks for more, ask again (Cancel: switched off)
      let grid = p.grid, enabled = true;
      if (addedAccess(p.manifest, ext.manifest).length) {
        const ans = await confirm({ id: ext.id, name: ext.name, version: ext.version, icon: iconDataUrl(ext.path, ext.manifest), manifest: ext.manifest, grid, reload: true });
        if (ans && ans.ok) grid = ans.grid; else enabled = false;
      }
      add({ id: ext.id, source: 'store', grid, enabled });
    });
    for (const e of list) if (e.source === 'folder' && !catalogue(e.id)) {
      try { await store().extensions.loadExtension(e.path); } catch (err) { console.error('extension folder', e.path, err.message); }
    }
    for (const p of Object.keys(SITE_PARTS)) tracked.set(p, { plat: SITE_PARTS[p], kind: 'chat' });
    for (const p of tracked.keys()) await sync(p);
    setTimeout(update, 60 * 1000).unref?.();
    setInterval(update, UPDATE_EVERY).unref?.();
  }

  // Store updates. One that asks for more than the version you said yes to is switched off until you say yes
  // again (as in Chrome: its new files are already in place).
  async function update() {
    if (!list.some(e => e.source === 'store')) return;
    const before = new Map(list.filter(e => e.source === 'store').map(e => [e.id, catalogue(e.id)?.manifest]).filter(([, m]) => m));
    try { await cws.updateExtensions(store()); } catch (err) { console.error('extension updates', err.message); }
    let changed = false;
    for (const e of list) {
      const old = before.get(e.id), now = catalogue(e.id);
      if (!old || !now || !e.enabled || !addedAccess(old, now.manifest).length) continue;
      e.enabled = false; changed = true;
      confirm({ id: e.id, name: now.name, version: now.version, icon: iconDataUrl(now.path, now.manifest), manifest: now.manifest, grid: e.grid, reload: true })
        .then(ans => { if (ans && ans.ok) { e.enabled = true; e.grid = ans.grid; save(); syncAll(true); } });
    }
    if (changed) save();
    await syncAll(changed);
  }

  function add({ id, source, path: dir, grid, enabled = true }) {
    const e = normalizeEntry({ id, source, path: dir, grid: grid || defaultGrid(), enabled });
    if (!e) return;
    list = list.filter(x => x.id !== id).concat(e);
    save();
    return syncAll(true);
  }

  // Ask the app window to show the install dialog. Resolves { ok, grid }.
  let confirmSeq = 0;
  const confirmWaits = new Map();
  function confirm(info) {
    const win = deps.appWindows()[0];
    if (!win) return Promise.resolve({ ok: false });
    const reqId = ++confirmSeq;
    const m = info.manifest || {};
    win.webContents.send('ext:confirm', { reqId, id: info.id, name: info.name || m.name || info.id, version: info.version || m.version || '',
      icon: info.icon || '', source: info.source || 'store', perms: permissionLines(m), compat: compat(m), noBlock: blocksNothing(m), sites: sitesOf(m),
      grid: info.grid || defaultGrid(), reload: !!info.reload });
    if (win.isMinimized()) win.restore();
    win.focus();
    return new Promise(res => confirmWaits.set(reqId, res));
  }
  ipc.main.handle('ext:confirmReply', (_e, reqId, ans) => {
    const res = confirmWaits.get(reqId);
    confirmWaits.delete(reqId);
    if (res) res({ ok: !!ans?.ok, grid: normalizeEntry({ id: 'a'.repeat(32), grid: ans?.grid })?.grid });
  });

  function describe(e) {
    const ext = catalogue(e.id);
    const m = ext?.manifest || {};
    return { id: e.id, source: e.source, enabled: e.enabled, grid: e.grid, missing: !ext,
      name: ext?.name || e.id, version: ext?.version || '', description: m.description && !/^__MSG_/.test(m.description) ? m.description : '',
      icon: ext ? iconDataUrl(ext.path, m) : '', perms: permissionLines(m), compat: compat(m), noBlock: blocksNothing(m), sites: sitesOf(m),
      popup: !!(m.action?.default_popup || m.browser_action?.default_popup),
      options: !!(m.options_page || m.options_ui?.page) };
  }

  ipc.app.handle('ext:list', async () => { await ready; return list.map(describe); });
  ipc.main.handle('ext:set', async (_e, id, change) => {
    await ready;
    const e = list.find(x => x.id === id);
    if (!e || !change || typeof change !== 'object') return null;
    if (typeof change.enabled === 'boolean') e.enabled = change.enabled;
    if (PLATS.includes(change.plat) && KINDS.includes(change.kind) && typeof change.on === 'boolean') e.grid[change.plat][change.kind] = change.on;
    // one stream window: its own choice, forgotten again once it matches the grid
    const t = tracked.get(change.partition);
    if (typeof change.partition === 'string' && change.partition.startsWith(STREAM_PREFIX) && !change.plat) {
      if (typeof change.on === 'boolean' && (!t || change.on !== e.grid[t.plat][t.kind])) e.win[change.partition] = change.on;
      else delete e.win[change.partition];
    }
    save();
    await syncAll(true);
    return describe(e);
  });
  ipc.main.handle('ext:remove', async (_e, id) => {
    await ready;
    const e = list.find(x => x.id === id);
    if (!e) return false;
    list = list.filter(x => x !== e);
    save();
    await syncAll(true);
    if (e.source === 'store') { try { await cws.uninstallExtension(id, { session: store(), extensionsPath: extDir }); } catch {} }
    else if (catalogue(id)) store().extensions.removeExtension(id);
    return true;
  });

  // Before a window's page loads: get its session ready, so the extensions are there from the start.
  ipc.app.handle('ext:prepare', async (_e, partition, plat, kind) => {
    await ready;
    if (typeof partition !== 'string' || !targetOf(partition, plat, kind)) return false;
    if (!SITE_PARTS[partition]) tracked.set(partition, { plat, kind });
    await sync(partition);
    return true;
  });

  // The extensions in one window, for its extensions menu.
  ipc.app.handle('ext:window', async (_e, partition, plat, kind) => {
    await ready;
    const t = targetOf(partition, plat, kind);
    if (!t) return [];
    return list.filter(e => e.enabled && catalogue(e.id)).map(e => ({ ...describe(e), on: isOn(e, t, partition),
      perWindow: t.perWindow, own: t.perWindow && typeof e.win[partition] === 'boolean' }));
  });

  ipc.app.handle('ext:options', async (_e, id, partition) => {
    await ready;
    if (typeof id !== 'string' || !EXT_ID.test(id) || typeof partition !== 'string' || !EXT_PARTITION.test(partition)) return false;
    const ext = session.fromPartition(partition).extensions.getExtension(id) || null;
    const page = ext && (ext.manifest.options_ui?.page || ext.manifest.options_page);
    if (!page) return false;
    const win = new BrowserWindow({ width: 820, height: 680, autoHideMenuBar: true, backgroundColor: '#ffffff', title: ext.name,
      webPreferences: { session: session.fromPartition(partition), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.loadURL(`chrome-extension://${id}/${page.replace(/^\/+/, '')}`);
    return true;
  });

  ipc.main.handle('ext:installLink', async (_e, input) => {
    await ready;
    const id = idFromInput(input);
    if (!id) return { error: 'That isn\'t a Chrome Web Store link or extension ID.' };
    if (list.some(e => e.id === id)) return { error: 'That extension is already installed.' };
    let ext;
    try { ext = await cws.installExtension(id, { session: store(), extensionsPath: extDir }); }
    catch (err) { return { error: 'Couldn\'t download it from the Chrome Web Store (' + err.message + ').' }; }
    const ans = await confirm({ id, name: ext.name, version: ext.version, icon: iconDataUrl(ext.path, ext.manifest), manifest: ext.manifest });
    if (!ans.ok) { try { await cws.uninstallExtension(id, { session: store(), extensionsPath: extDir }); } catch {} return { cancelled: true }; }
    await add({ id, source: 'store', grid: ans.grid });
    return { id };
  });

  ipc.main.handle('ext:loadFolder', async () => {
    await ready;
    const r = await dialog.showOpenDialog(deps.appWindows()[0], { title: 'Choose an unpacked extension folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { cancelled: true };
    const dir = r.filePaths[0];
    const m = readManifest(dir);
    if (!m) return { error: 'That folder has no manifest.json, so it isn\'t an extension.' };
    let ext;
    try { ext = await store().extensions.loadExtension(dir); }
    catch (err) { return { error: 'It couldn\'t be loaded: ' + err.message }; }
    if (list.some(e => e.id === ext.id)) return { error: 'That extension is already installed.' };
    const ans = await confirm({ id: ext.id, name: ext.name, version: ext.version, icon: iconDataUrl(dir, m), manifest: m, source: 'folder' });
    if (!ans.ok) { store().extensions.removeExtension(ext.id); return { cancelled: true }; }
    await add({ id: ext.id, source: 'folder', path: dir, grid: ans.grid });
    return { id: ext.id };
  });

  // Read an extension loaded from a folder again (after its files were edited), keeping its settings.
  ipc.main.handle('ext:reload', async (_e, id) => {
    await ready;
    const e = list.find(x => x.id === id);
    if (!e || e.source !== 'folder') return { error: 'Only extensions loaded from a folder can be reloaded.' };
    const chk = checkFolder(e.path);
    if (chk.error) return chk;
    const old = catalogue(id);
    // it asks for more than when it was added: ask again (Cancel keeps the one that's loaded)
    if (old && addedAccess(old.manifest, chk.manifest).length) {
      const ans = await confirm({ id, name: chk.manifest.name, version: chk.manifest.version, icon: iconDataUrl(e.path, chk.manifest),
        manifest: chk.manifest, source: 'folder', reload: true, grid: e.grid });
      if (!ans.ok) return { cancelled: true };
      e.grid = ans.grid;
      save();
    }
    // out of every session (sync() only reloads one whose version changed), then back from the folder
    const had = [...tracked.keys()].filter(p => {
      const exts = session.fromPartition(p).extensions;
      if (!exts.getExtension(id)) return false;
      exts.removeExtension(id);
      return true;
    });
    if (old) store().extensions.removeExtension(id);
    let ext, error = '';
    try { ext = await store().extensions.loadExtension(e.path); }
    catch (err) { error = 'It couldn\'t be loaded: ' + err.message; }
    if (ext && ext.id !== id) {           // a "key" added to (or changed in) its manifest gives it another ID
      store().extensions.removeExtension(ext.id);
      error = 'Its ID changed (the "key" in its manifest.json), so remove it and add it again.';
    }
    await syncAll(true, had);
    return error ? { error } : describe(e);
  });

  let storeWin = null;
  ipc.main.handle('ext:openStore', async () => {
    await ready;
    if (storeWin && !storeWin.isDestroyed()) { storeWin.focus(); return true; }
    // Google's cookie question, answered "Reject all" (as the app does for YouTube), so the store opens straight away
    if (deps.rejectCookies) await store().cookies.set({ url: 'https://chromewebstore.google.com', domain: '.google.com', name: 'SOCS',
      value: deps.rejectCookies, secure: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 390 * 86400 }).catch(() => {});
    storeWin = new BrowserWindow({ width: 1180, height: 820, autoHideMenuBar: true, title: 'Chrome Web Store', backgroundColor: '#ffffff',
      webPreferences: { session: store(), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const keep = (e, url) => { if (storeNavOk(url)) return; e.preventDefault(); if (/^https?:\/\//i.test(url)) electron.shell.openExternal(url); };
    storeWin.webContents.on('will-navigate', keep);
    storeWin.webContents.on('will-redirect', keep);
    storeWin.loadURL(STORE_URL);
    storeWin.on('closed', () => { storeWin = null; });
    return true;
  });

  ready = start().catch(err => console.error('extensions', err));
  return { ready: () => ready, list: () => list, sync, syncAll, update };
}

module.exports = { mayTouchCookie, scopeCookies, extOpenable, storeNavOk, PLATS, KINDS, STREAM_PREFIX, STORE_PART, defaultGrid, targetOf, normalizeList, normalizeEntry, isOn, wantedIds, idFromInput, compat, blocksNothing, sitesOf, permissionLines, addedAccess, iconDataUrl, readManifest, checkFolder, createHost };
