// What the app keeps for itself, in one SQLite file (stream-multiview.db in the data folder): streamer profiles (one
// row a channel, so a live check only writes the channels it changed, not the whole history), and small saved state
// (Settings › Developer › Chat events, the follow lists). The page's settings stay in its localStorage, and the
// small files the app reads before anything else (window-state.json, security.json, updates.json) stay files.
//
// Node's built-in node:sqlite, so there's no native module to build for each system. It's still marked as in
// development in Node, so everything that touches it is here (as Pear Drops' db.js): a change in a later Electron
// only touches this file. Other modules get what they need from main.js, and tests use new Db(':memory:').
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const FILE = 'stream-multiview.db';
// The copy made before a schema update (and, after one, the place to look if it went wrong).
const BACKUPS = 'backups';

// Each step brings the schema up one version (PRAGMA user_version). Never edit a released step: add another.
const MIGRATIONS = [
  `CREATE TABLE profiles (ch TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE notes (ch TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

// The files older versions kept, copied in once by importFiles(): the profiles, and saved state by its key.
const OLD_FILES = { profiles: 'profiles.json', eventSamples: 'event-samples.json', follows: 'follows.json' };

const parse = text => { try { return JSON.parse(text); } catch { return undefined; } };

// A backup's file name: when it was made (UTC), and the schema step it was made before.
// stream-multiview-2026-10-31T09-12-00Z-before-v2.db
const backupName = (at, before) => `stream-multiview-${new Date(at).toISOString().slice(0, 19).replace(/:/g, '-')}Z-before-v${before}.db`;

// Removes a database file and the ones SQLite keeps beside it.
function removeDb(file) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
}

class Db {
  // file: the database file, or ':memory:' (tests). backups: the folder for the copy made before a schema update.
  // migrations: tests only.
  constructor(file, { backups = null, migrations = MIGRATIONS } = {}) {
    this.file = file;
    this.backups = backups;
    this.migrations = migrations;
    this.sql = new DatabaseSync(file);
    try {
      this.sql.exec('PRAGMA busy_timeout = 2000');
      if (file !== ':memory:') this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL');
      this.migrate();
    } catch (e) {
      this.sql.close();
      throw e;
    }
    this.statements = new Map();
    this.rows = new Map();   // the profiles' rows as last read or written ('ch:<channel>', 'note:<channel>'), so unchanged ones aren't written again
  }

  migrate() {
    const at = this.sql.prepare('PRAGMA user_version').get().user_version;
    // an update that changes the schema: a copy first, so a mistake in the new step can't cost the data
    if (at > 0 && at < this.migrations.length && this.backups) {
      fs.mkdirSync(this.backups, { recursive: true });
      this.sql.exec(`VACUUM INTO '${path.join(this.backups, backupName(Date.now(), at + 1)).replace(/'/g, "''")}'`);
    }
    for (let v = at; v < this.migrations.length; v++) this.transaction(() => {
      this.sql.exec(this.migrations[v]);
      this.sql.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }

  // the schema's version (its step in MIGRATIONS)
  get version() { return this.sql.prepare('PRAGMA user_version').get().user_version; }

  // a prepared statement, made once
  q(text) {
    if (!this.statements.has(text)) this.statements.set(text, this.sql.prepare(text));
    return this.statements.get(text);
  }

  // runs fn() as one all-or-nothing write
  transaction(fn) {
    if (this.sql.isTransaction) return fn();
    this.sql.exec('BEGIN');
    try {
      const out = fn();
      this.sql.exec('COMMIT');
      return out;
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }
  }

  get isOpen() { return this.sql.isOpen; }

  close() {
    if (!this.sql.isOpen) return;
    try { this.sql.exec('PRAGMA optimize'); } catch {}
    this.sql.close();
  }

  /* ---------- streamer profiles (profiles.js's createHistory) ---------- */

  // { v: 1, ch: { [channel]: entry }, meta: { [channel]: notes } }, or null when there's none yet
  loadProfiles() {
    const d = { v: 1, ch: {}, meta: {} };
    let any = false;
    for (const [table, key, into] of [['profiles', 'ch:', d.ch], ['notes', 'note:', d.meta]]) for (const r of this.q(`SELECT ch, data FROM ${table}`).all()) {
      this.rows.set(key + r.ch, r.data);
      const v = parse(r.data);
      if (v && typeof v === 'object') { into[r.ch] = v; any = true; }
    }
    return any ? d : null;
  }

  // Saves the profiles (as loadProfiles() gives them), writing only the channels that changed since the last save.
  saveProfiles(d) {
    const next = new Map();
    for (const [ch, e] of Object.entries((d && d.ch) || {})) if (e) next.set('ch:' + ch, JSON.stringify(e));
    for (const [ch, m] of Object.entries((d && d.meta) || {})) if (m) next.set('note:' + ch, JSON.stringify(m));
    const table = key => key.startsWith('ch:') ? ['profiles', key.slice(3)] : ['notes', key.slice(5)];
    this.transaction(() => {
      for (const [key, value] of next) if (this.rows.get(key) !== value) { const [t, ch] = table(key); this.q(`INSERT OR REPLACE INTO ${t} (ch, data) VALUES (?, ?)`).run(ch, value); }
      for (const key of this.rows.keys()) if (!next.has(key)) { const [t, ch] = table(key); this.q(`DELETE FROM ${t} WHERE ch = ?`).run(ch); }
    });
    this.rows = next;
  }

  /* ---------- saved state ---------- */

  // a saved value (anything JSON can hold), or `fallback`
  get(key, fallback = null) {
    const row = this.q('SELECT value FROM state WHERE key = ?').get(key);
    const value = row ? parse(row.value) : undefined;
    return value === undefined ? fallback : value;
  }

  set(key, value) {
    if (value === undefined || value === null) this.q('DELETE FROM state WHERE key = ?').run(key);
    else this.q('INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
  }

  /* ---------- files from older versions ---------- */

  // Copies in what older versions kept in files (profiles.json, event-samples.json, follows.json), once, in one go.
  // The files are left as they were, so going back to an older version still finds them. -> the names copied in
  importFiles(dir) {
    if (this.get('imported')) return [];
    const read = name => { try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch { return null; } };
    const found = [];
    this.transaction(() => {
      for (const [key, name] of Object.entries(OLD_FILES)) {
        const v = parse(read(name));
        if (!v || typeof v !== 'object') continue;
        if (key === 'profiles') { if (v.v !== 1 || !v.ch || typeof v.ch !== 'object') continue; this.saveProfiles(v); }
        else this.set(key, v);
        found.push(name);
      }
      this.set('imported', { at: Date.now(), files: found });
    });
    return found;
  }
}

// Opens (or creates) the database in the data folder. One that can't be opened (damaged) is moved aside as
// stream-multiview.db.broken-<time>, and a new one copies in the older versions' files again if they're still there
// (`db.restored`). A folder that can't be written: this run keeps its data in memory.
function openDb(dir, { log = () => {} } = {}) {
  const file = path.join(dir, FILE), backups = path.join(dir, BACKUPS);
  try {
    fs.mkdirSync(dir, { recursive: true });
    return new Db(file, { backups });
  } catch (e) {
    const aside = `${file}.broken-${Date.now()}`;
    for (const suffix of ['', '-wal', '-shm']) try { fs.renameSync(file + suffix, aside + suffix); } catch {}
    log(`The data file couldn't be opened (${e.message}): starting a new one`);
    try {
      const db = new Db(file, { backups });
      db.restored = { aside, error: e.message };
      return db;
    } catch (again) {
      log(`The data file couldn't be created (${again.message}): nothing will be saved this run`);
      return new Db(':memory:');
    }
  }
}

module.exports = { Db, openDb, backupName, removeDb, FILE, BACKUPS, OLD_FILES, MIGRATIONS };
