// Settings › Sync (#337): saved channels and settings, the same on every computer, through a folder a sync app
// already moves (iCloud Drive, OneDrive, Dropbox, Google Drive desktop, Syncthing…). Each computer writes only its
// own file there and reads everyone's, so nothing needs a lock and sync apps never make "conflicted copies":
//   Stream Multiview Sync/devices/<device id>.json     (sync-merge.js: what's in it, and the merge)
//   Stream Multiview Sync/sounds/<device id>/<key>     your alert sounds, a file each
// This process is the only one on the computer that reads and writes the folder. The page can't be read from here,
// so it sends its synced values at start (hello) and each change after (changed); what comes back goes to the main
// window as 'sync:pull'. This copy's record (sync.json in the data folder) is kept whether sync is on or not, so a
// first sync knows which values changed when.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('./sync-merge');

const STATE_FILE = 'sync.json';
const BACKUPS = 'sync-backups';
const KEEP_BACKUPS = 5;
const SUB = 'Stream Multiview Sync';             // the app's folder inside the chosen one
const WRITE_MS = 1500;                           // a change is written this long after the last one
const PULL_MS = 800;                             // a change in the folder is read this long after it's seen
const CHECK_MS = 60e3;                           // and every minute anyway: some sync apps don't trigger fs.watch
const REACH_MS = 3 * 60e3;                       // a change the other computers haven't got after this long: Settings says so
const NAME_MAX = 40;
const OS_NAME = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

const readJson = (file, def = null) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; } };
// Written next to the file and renamed over it, so nobody (another computer, a sync app) reads half a file.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
// "0.4.22" < "0.5.0"
function cmpVersion(a, b) {
  const x = String(a || '').split(/[.-]/).map(n => parseInt(n, 10) || 0), y = String(b || '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const defaultName = host => cleanName(String(host || '').replace(/\.local$/i, '')) || 'This computer';
// The app's folder, from the one chosen (or the one chosen already, if it's that)
const syncDirOf = folder => path.basename(folder) === SUB ? folder : path.join(folder, SUB);

/* The folders already synced on this computer, where each app keeps its own: [{ id, name, path }], only ones
   that are there. home, env and platform come from main.js (the tests pass their own). */
function syncedFolders({ platform = process.platform, home = require('os').homedir(), env = process.env } = {}) {
  const out = [], add = (id, name, p) => { if (p && isDir(p) && !out.some(f => path.resolve(f.path) === path.resolve(p))) out.push({ id, name, path: p }); };
  const mac = platform === 'darwin', win = platform === 'win32';
  const under = (dir, re) => { try { return fs.readdirSync(dir).filter(n => re.test(n)).map(n => path.join(dir, n)); } catch { return []; } };
  if (mac) add('icloud', 'iCloud Drive', path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
  if (win) add('icloud', 'iCloud Drive', path.join(home, 'iCloudDrive'));
  // Dropbox says where its folders are
  const dbx = [path.join(home, '.dropbox', 'info.json'), ...(win ? [env.APPDATA, env.LOCALAPPDATA].filter(Boolean).map(d => path.join(d, 'Dropbox', 'info.json')) : [])];
  for (const f of dbx) { const d = readJson(f); if (d) { add('dropbox', 'Dropbox', d.personal && d.personal.path); add('dropbox', 'Dropbox', d.business && d.business.path); } }
  add('dropbox', 'Dropbox', path.join(home, 'Dropbox'));
  if (win) ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'].forEach(k => add('onedrive', 'OneDrive', env[k]));
  if (mac) under(path.join(home, 'Library', 'CloudStorage'), /^OneDrive/).forEach(p => add('onedrive', 'OneDrive', p));
  add('onedrive', 'OneDrive', path.join(home, 'OneDrive'));
  if (mac) under(path.join(home, 'Library', 'CloudStorage'), /^GoogleDrive-/).forEach(p => add('gdrive', 'Google Drive', path.join(p, 'My Drive')));
  if (win) add('gdrive', 'Google Drive', 'G:\\My Drive');
  add('gdrive', 'Google Drive', path.join(home, 'Google Drive'));
  add('syncthing', 'Syncthing', path.join(home, 'Sync'));
  add('nextcloud', 'Nextcloud', path.join(home, 'Nextcloud'));
  return out;
}

/* userData: the data folder. send(channel, data): to the main window. Tests pass now, timers, watchDir (fs.watch:
   closing one takes a moment on macOS), checkMs, reachMs, hostname, platform, home and env. */
function createSync({ userData, version, send = () => {}, now = Date.now, timers = global, hostname = require('os').hostname(),
  platform = process.platform, home = require('os').homedir(), env = process.env, watchDir = fs.watch, checkMs = CHECK_MS, reachMs = REACH_MS, log = () => {} }) {
  const stateFile = path.join(userData, STATE_FILE);
  const st = Object.assign({
    device: '', name: '', on: false, folder: '', what: { channels: true, settings: true, sounds: true },
    clock: 0, record: null, app: '', lastSync: 0, lastWrite: 0, error: '', undo: null, sounds: {}
  }, readJson(stateFile, {}));
  if (!st.device) st.device = crypto.randomBytes(8).toString('hex');
  if (!st.name) st.name = defaultName(hostname);
  st.what = { channels: true, settings: true, sounds: true, ...st.what };
  let local = {};                    // the page's channel values (saved, autoOpen, notifyOff, chNames, ytNames)
  let versions = {};                 // { key: v } of this copy's page
  let ready = false;                 // the page said hello
  let others = [];                   // the other computers, as last read: readDevice() files (+ newer, waiting)
  let watcher = null, checkTimer = null, writeTimer = null, pullTimer = null, saveTimer = null;
  // The record changed since this computer's file was last written. Only then is it written again: every write
  // wakes the other computers' watchers, and their reads mustn't write back each time.
  let dirty = true;

  const save = () => { timers.clearTimeout(saveTimer); saveTimer = null; try { writeAtomic(stateFile, JSON.stringify(st)); } catch (e) { log('sync: ' + e.message); } };
  const saveSoon = () => { if (!saveTimer) saveTimer = timers.setTimeout(save, 300); };
  const syncDir = () => syncDirOf(st.folder);
  const devicesDir = () => path.join(syncDir(), 'devices');
  const ownFile = () => path.join(devicesDir(), st.device + '.json');

  function backup(why) {
    if (!st.record) return;
    try {
      const dir = path.join(userData, BACKUPS);
      fs.mkdirSync(dir, { recursive: true });
      const at = new Date(now()).toISOString().slice(0, 19).replace(/:/g, '-');
      writeAtomic(path.join(dir, `sync-${at}Z-${why}.json`), JSON.stringify({ app: version, record: st.record, local }));
      const all = fs.readdirSync(dir).filter(n => /^sync-.*\.json$/.test(n)).sort();
      all.slice(0, Math.max(0, all.length - KEEP_BACKUPS)).forEach(n => fs.rmSync(path.join(dir, n), { force: true }));
    } catch (e) { log('sync backup: ' + e.message); }
  }

  // The other computers' files in the folder -> { files, newer, waiting } or null when the folder can't be reached
  function readOthers() {
    if (!isDir(st.folder)) return null;
    let names;
    try { fs.mkdirSync(devicesDir(), { recursive: true }); names = fs.readdirSync(devicesDir()); } catch { return null; }
    const files = [], newer = [], waiting = [], t = now();
    for (const n of names) {
      const icloud = /^\.(.+)\.json\.icloud$/.exec(n);             // iCloud hasn't downloaded it yet
      if (icloud) { if (icloud[1] !== st.device) waiting.push(icloud[1]); continue; }
      if (!/\.json$/.test(n) || n === st.device + '.json') continue;
      const r = M.readDevice(readJson(path.join(devicesDir(), n)));
      if (r.newer) { if (!M.stale(r.file, t)) newer.push(r.file); continue; }
      if (!r.ok || r.file.device === st.device || M.stale(r.file, t)) continue;
      files.push(r.file);
    }
    return { files, newer, waiting };
  }
  // A sound that would win is read from the computer that has it
  function loadSounds(files) {
    for (const f of files) for (const [k, e] of Object.entries(f.settings)) {
      if (M.kindOf(k) !== 'sounds' || !e.file || !M.beats(e, st.record.settings[k])) continue;
      try { e.value = fs.readFileSync(path.join(syncDir(), 'sounds', f.device, k), 'utf8'); } catch { /* not here yet */ }
    }
  }

  function pull() {
    timers.clearTimeout(pullTimer); pullTimer = null;
    if (!st.on || !ready) return status();
    const r = readOthers();
    if (!r) { st.error = 'missing'; saveSoon(); return status(true); }
    st.error = '';
    others = [...r.files, ...r.newer.map(f => ({ ...f, newer: true }))];
    loadSounds(r.files);
    const m = M.merge(st.record, r.files, { values: local, versions, what: st.what, clock: st.clock });
    st.clock = m.clock;
    if (m.touched) dirty = true;
    if (Object.keys(m.apply).length) {
      const from = r.files.find(f => f.device === m.from);
      st.undo = { at: now(), from: from ? from.name : '', summary: m.summary, before: m.before };
      for (const [k, v] of Object.entries(m.apply)) if (M.LOCAL_KEYS.includes(k)) local[k] = v;
      send('sync:pull', { values: m.apply, versions: m.applyV, from: st.undo.from, summary: m.summary });
    }
    st.lastSync = now();
    if (dirty || !fs.existsSync(ownFile())) write(); else saveSoon();
    return status(true);
  }
  const pullSoon = () => { if (!pullTimer) pullTimer = timers.setTimeout(pull, PULL_MS); };

  function write() {
    timers.clearTimeout(writeTimer); writeTimer = null;
    if (!st.on || !st.record) return;
    if (!isDir(st.folder)) { st.error = 'missing'; save(); status(true); return; }
    try {
      M.prune(st.record, now());
      st.lastWrite = now();
      const file = M.deviceFile(st.record, { device: st.device, name: st.name, os: OS_NAME[platform] || platform, app: version, at: st.lastWrite, what: st.what });
      writeAtomic(ownFile(), JSON.stringify(file));
      dirty = false;
      const dir = path.join(syncDir(), 'sounds', st.device);
      for (const [k, e] of Object.entries(st.record.settings)) {
        if (M.kindOf(k) !== 'sounds') continue;
        if (e.value === null || !st.what.sounds) { if (k in st.sounds) { fs.rmSync(path.join(dir, k), { force: true }); delete st.sounds[k]; } continue; }
        if (st.sounds[k] === e.at && fs.existsSync(path.join(dir, k))) continue;
        writeAtomic(path.join(dir, k), e.value);
        st.sounds[k] = e.at;
      }
      st.error = '';
    } catch (e) { st.error = 'missing'; log('sync write: ' + e.message); }
    save();
  }
  const writeSoon = () => { if (st.on && !writeTimer) writeTimer = timers.setTimeout(() => { write(); status(true); }, WRITE_MS); };

  function watch() {
    unwatch();
    if (!st.on) return;
    try {
      fs.mkdirSync(devicesDir(), { recursive: true });
      watcher = watchDir(devicesDir(), (_e, name) => { if (!name || String(name) !== st.device + '.json') pullSoon(); });
      watcher.on('error', () => { unwatch(true); });
    } catch { watcher = null; }
    checkTimer = timers.setInterval(() => { if (!watcher && isDir(st.folder)) watch(); pull(); }, checkMs);
  }
  function unwatch(keepTimer = false) {
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
    if (!keepTimer && checkTimer) { timers.clearInterval(checkTimer); checkTimer = null; }
  }

  // values: { key: value } of synced keys (all of them at hello, one at a change)
  function record(values) {
    const first = !st.record;
    if (first) st.record = { settings: {}, channels: {} };
    const r = M.recordLocal(st.record, values, { dev: st.device, now: now(), clock: st.clock, versions, first });
    st.clock = r.clock;
    if (r.changed.length || first) { dirty = true; saveSoon(); writeSoon(); }
    return r.changed;
  }

  /* Has another computer got this computer's latest change? Its file has the same entry (a setting, a channel or a
     linked streamer) with that stamp or a later one, or it doesn't sync that kind. When a sync app stops carrying this
     computer's file (Dropbox said "up to date" while it wasn't uploading), the others' files never catch up. */
  function latestOwn() {
    let best = null;
    const look = (table, kind) => { for (const [key, e] of Object.entries(table || {})) if (e.dev === st.device && e.at > 0 && (!best || e.at > best.at)) best = { kind, key, at: e.at }; };
    if (st.record) { look(st.record.settings, 'settings'); look(st.record.channels, 'channels'); look(st.record.streamers, 'streamers'); }
    if (best && best.kind === 'settings') best.kind = M.kindOf(best.key);
    return best;
  }
  function hasGot(f, latest) {
    if (f.what && f.what[M.switchOf(latest.kind)] === false) return true;
    const table = latest.kind === 'channels' ? f.channels : latest.kind === 'streamers' ? f.streamers : f.settings;
    const e = table && table[latest.key];
    return !!e && e.at >= latest.at;
  }

  // What Settings › Sync shows
  function status(push = false) {
    const t = now();
    const latest = st.on && !st.error ? latestOwn() : null;
    const waiting = !!latest && t - Math.min(latest.at, t) > reachMs;     // (a stamp ahead of this clock: from now)
    const me = { device: st.device, name: st.name, os: OS_NAME[platform] || platform, app: version, at: st.lastWrite || 0, me: true };
    const list = [me, ...others.map(f => ({ device: f.device, name: f.name || 'A computer', os: f.os, app: f.app, at: f.at,
      ...(f.newer ? { newer: true } : cmpVersion(f.app, version) < 0 ? { older: true } : {}),
      ...(waiting && !f.newer && !hasGot(f, latest) ? { behind: latest.at } : {}) }))];
    const channels = st.record ? Object.values(st.record.channels).filter(e => !e.removed).length : 0;
    const s = { on: st.on, folder: st.folder, dir: st.folder ? syncDirOf(st.folder) : '', home, name: st.name, device: st.device,
      what: { ...st.what }, error: st.error, lastSync: st.lastSync, computers: st.on ? list : [], channels,
      undo: st.undo ? { at: st.undo.at, from: st.undo.from, summary: st.undo.summary } : null, now: t };
    // none of the others has this computer's latest change yet (one that's off for the day looks the same)
    const rest = s.computers.filter(c => !c.me && !c.newer);
    if (rest.length && rest.every(c => c.behind)) s.behind = latest.at;
    if (push) send('sync:status', s);
    return s;
  }

  return {
    // The page's values at start: { values: { key: value }, versions: { key: v } }
    hello({ values = {}, versions: v = {} } = {}) {
      versions = { ...v };
      for (const k of M.LOCAL_KEYS) local[k] = values[k] ?? null;
      if (st.record && st.app && st.app !== version) backup('before-v' + version);
      st.app = version;
      record(values);
      ready = true;
      save();
      if (st.on) { watch(); pull(); }
      return status();
    },
    changed(key, value) {
      if (!ready || typeof key !== 'string') return;
      if (M.kindOf(key) === 'channels') { local[key] = value ?? null; record(Object.fromEntries(M.CHANNEL_KEYS.map(k => [k, local[k]]))); }
      else if (key === M.STREAMERS) { local[key] = value ?? null; record({ [key]: local[key] }); }
      else record({ [key]: value ?? null });
    },
    status: () => status(),
    folders: () => syncedFolders({ platform, home, env }),
    // Who's in a folder already, for the first sync's question: { others: [{ name, os, at, channels }], channels }
    peek(folder) {
      const keep = st.folder; st.folder = folder;
      const r = readOthers();
      st.folder = keep;
      if (!r) return { ok: false, others: [] };
      const list = r.files.map(f => ({ device: f.device, name: f.name, os: f.os, at: f.at, channels: Object.values(f.channels).filter(e => !e.removed).length })).sort((a, b) => b.at - a.at);
      return { ok: true, others: list, channels: st.record ? Object.values(st.record.channels).filter(e => !e.removed).length : 0 };
    },
    // Turns sync on with a folder. mode: 'combine' | 'theirs' | 'mine' (only matters when others are there)
    start({ folder, mode = 'combine' } = {}) {
      if (!folder || !isDir(folder)) return { ok: false, error: 'missing', ...status() };
      backup('before-first-sync');
      st.folder = folder; st.on = true; st.error = ''; st.undo = null; st.sounds = {};
      if (!st.record) st.record = { settings: {}, channels: {} };
      const r = readOthers();
      dirty = true;
      if (r && r.files.length) st.clock = M.firstSync(st.record, r.files, mode, { dev: st.device, now: now(), clock: st.clock });
      save();
      watch();
      pull();
      return { ok: true, ...status() };
    },
    stop() { st.on = false; st.error = ''; others = []; unwatch(); timers.clearTimeout(writeTimer); writeTimer = null; save(); return status(true); },
    syncNow() { if (st.on && !watcher) watch(); return pull(); },
    rename(name) {
      const n = cleanName(name);
      if (!n) return status();
      st.name = n; dirty = true; save(); if (st.on) write();
      return status(true);
    },
    // Forgets another computer: its file and sounds go from the folder (it writes them again if it's still in use)
    forget(device) {
      if (!st.on || !device || device === st.device || !/^[\w-]+$/.test(device)) return status();
      try { fs.rmSync(path.join(devicesDir(), device + '.json'), { force: true }); fs.rmSync(path.join(syncDir(), 'sounds', device), { recursive: true, force: true }); } catch {}
      others = others.filter(f => f.device !== device);
      return pull();
    },
    setWhat(what = {}) {
      for (const k of ['channels', 'settings', 'sounds']) if (typeof what[k] === 'boolean') st.what[k] = what[k];
      dirty = true; save(); if (st.on) { write(); pull(); }
      return status(true);
    },
    // Puts back what the last sync changed, as new changes, so the other computers take the undo too
    undo() {
      const u = st.undo;
      if (!u) return status();
      st.undo = null;
      const ch = {}, rest = {};
      for (const [k, v] of Object.entries(u.before)) (M.kindOf(k) === 'channels' ? ch : rest)[k] = v;
      if (M.STREAMERS in rest) local[M.STREAMERS] = rest[M.STREAMERS];
      record(rest);
      if (Object.keys(ch).length) { Object.assign(local, ch); record(Object.fromEntries(M.CHANNEL_KEYS.map(k => [k, local[k]]))); }
      send('sync:pull', { values: u.before, undo: true });
      write();
      return status(true);
    },
    close() {
      const pending = !!writeTimer;
      unwatch(); for (const t of [writeTimer, pullTimer]) timers.clearTimeout(t);
      writeTimer = pullTimer = null;
      if (pending) write();
      if (saveTimer) save();
    }
  };
}

module.exports = { createSync, syncedFolders, syncDirOf, defaultName, cmpVersion, SUB, STATE_FILE, BACKUPS, CHECK_MS, WRITE_MS, PULL_MS, REACH_MS };
