const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Db, openDb, backupName, FILE, MIGRATIONS } = require('../../../src/main/db');
const { tempDir } = require('../../helpers');

const profiles = () => ({ v: 1, ch: { alpha: { tracked: 1, sessions: [{ start: 1, end: 2 }] }, 'tw:bravo': { tracked: 2, sessions: [] } }, meta: { alpha: { notes: 'Raid train', tags: ['Speedrun'] } } });

test('profiles: none at first; saved and read back as they were', () => {
  const db = new Db(':memory:');
  assert.equal(db.loadProfiles(), null);
  db.saveProfiles(profiles());
  assert.deepEqual(new Db(':memory:').loadProfiles(), null, 'a database of its own');
  const again = Object.assign(Object.create(Db.prototype), db, { rows: new Map() });
  assert.deepEqual(again.loadProfiles(), profiles());
  assert.equal(db.version, MIGRATIONS.length);
  db.close(); db.close();
  assert.equal(db.isOpen, false);
});

test('profiles: only the channels that changed are written; ones gone (and notes cleared) are deleted', () => {
  const db = new Db(':memory:');
  const d = profiles();
  db.saveProfiles(d);
  const writes = [];
  const run = db.q.bind(db);
  db.q = text => { const st = run(text); return /INSERT|DELETE/.test(text) ? { run: (...a) => { writes.push(text.split(' ')[0] + ' ' + a[0]); return st.run(...a); } } : st; };
  db.saveProfiles(d);
  assert.deepEqual(writes, [], 'nothing changed: nothing written');
  d.ch.alpha.sessions.push({ start: 3, end: 4 });
  delete d.ch['tw:bravo'];
  d.meta = {};
  db.saveProfiles(d);
  assert.deepEqual(writes.sort(), ['DELETE alpha', 'DELETE tw:bravo', 'INSERT alpha']);
  db.q = run;
  db.rows = new Map();
  assert.deepEqual(db.loadProfiles(), { v: 1, ch: { alpha: d.ch.alpha }, meta: {} });
  db.saveProfiles(null);
  db.rows = new Map();
  assert.equal(db.loadProfiles(), null);
});

test('profiles: a damaged row is left out', () => {
  const db = new Db(':memory:');
  db.sql.prepare('INSERT INTO profiles (ch, data) VALUES (?, ?)').run('broken', '{ not json');
  db.sql.prepare('INSERT INTO profiles (ch, data) VALUES (?, ?)').run('alpha', '{"tracked":1}');
  assert.deepEqual(db.loadProfiles(), { v: 1, ch: { alpha: { tracked: 1 } }, meta: {} });
});

test('state: anything JSON holds, a fallback when not set or damaged; null or undefined removes it', () => {
  const db = new Db(':memory:');
  assert.equal(db.get('follows'), null);
  assert.deepEqual(db.get('follows', {}), {});
  db.set('follows', { sites: { kick: ['alpha'] } });
  assert.deepEqual(db.get('follows'), { sites: { kick: ['alpha'] } });
  db.set('follows', null);
  assert.equal(db.get('follows', 'none'), 'none');
  db.set('n', 0); assert.equal(db.get('n'), 0);
  db.set('n', undefined); assert.equal(db.get('n'), null);
  db.sql.prepare('INSERT INTO state (key, value) VALUES (?, ?)').run('bad', '{');
  assert.equal(db.get('bad', 1), 1);
});

test('transaction: all or nothing, and one inside another is part of it', () => {
  const db = new Db(':memory:');
  assert.throws(() => db.transaction(() => { db.set('a', 1); db.transaction(() => db.set('b', 2)); throw new Error('no'); }), /no/);
  assert.equal(db.get('a'), null);
  assert.equal(db.get('b'), null);
  assert.equal(db.transaction(() => { db.set('a', 1); return 'done'; }), 'done');
  assert.equal(db.get('a'), 1);
});

test('importFiles: the older files copied in once (and left where they were); damaged or missing ones skipped', t => {
  const dir = tempDir('dbimport', t);
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify(profiles()));
  fs.writeFileSync(path.join(dir, 'event-samples.json'), JSON.stringify({ kick: { A: { n: 1 } } }));
  fs.writeFileSync(path.join(dir, 'follows.json'), '{ damaged');
  const db = new Db(':memory:');
  assert.deepEqual(db.importFiles(dir), ['profiles.json', 'event-samples.json']);
  assert.deepEqual(db.loadProfiles(), profiles());
  assert.deepEqual(db.get('eventSamples'), { kick: { A: { n: 1 } } });
  assert.equal(db.get('follows'), null);
  assert.deepEqual(db.get('imported').files, ['profiles.json', 'event-samples.json']);
  assert.ok(fs.existsSync(path.join(dir, 'profiles.json')), 'left as it was');
  fs.writeFileSync(path.join(dir, 'follows.json'), JSON.stringify({ sites: {} }));
  assert.deepEqual(db.importFiles(dir), [], 'only once');
  assert.equal(db.get('follows'), null);
});

test('importFiles: a profiles file of another shape is skipped; no files at all is fine', t => {
  const dir = tempDir('dbshape', t);
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ v: 2, ch: {} }));
  const db = new Db(':memory:');
  assert.deepEqual(db.importFiles(dir), []);
  assert.equal(db.loadProfiles(), null);
  assert.deepEqual(new Db(':memory:').importFiles(path.join(dir, 'missing')), []);
});

test('migrations: each step once, in order, with a copy made before a later one changes the file', t => {
  const dir = tempDir('dbmig', t), file = path.join(dir, 'x.db'), backups = path.join(dir, 'b');
  const one = ['CREATE TABLE a (x)'];
  let db = new Db(file, { backups, migrations: one });
  assert.equal(db.version, 1);
  db.sql.exec('INSERT INTO a VALUES (7)');
  db.close();
  db = new Db(file, { backups, migrations: one });
  assert.equal(db.version, 1, 'nothing to do');
  assert.ok(!fs.existsSync(backups), 'no copy when nothing changes');
  db.close();
  db = new Db(file, { backups, migrations: [...one, 'CREATE TABLE b (y)'] });
  assert.equal(db.version, 2);
  const copies = fs.readdirSync(backups);
  assert.equal(copies.length, 1);
  assert.match(copies[0], /^stream-multiview-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-before-v2\.db$/);
  db.close();
  assert.throws(() => new Db(file, { migrations: [...one, 'CREATE TABLE b (y)', 'NOT SQL'] }), /syntax/);
  db = new Db(file, { migrations: [...one, 'CREATE TABLE b (y)'] });
  assert.equal(db.version, 2, 'a step that fails is undone, and the file stays as it was');
  db.close();
  assert.equal(backupName(Date.UTC(2026, 9, 31, 9, 12), 3), 'stream-multiview-2026-10-31T09-12-00Z-before-v3.db');
});

test('openDb: makes the folder and the file; a damaged file is moved aside and a new one copies the old files in again', t => {
  const dir = path.join(tempDir('dbopen', t), 'data');
  let db = openDb(dir);
  assert.ok(fs.existsSync(path.join(dir, FILE)));
  db.set('x', 1); db.close();
  db = openDb(dir);
  assert.equal(db.get('x'), 1, 'kept between runs');
  db.close();
  fs.rmSync(path.join(dir, FILE + '-wal'), { force: true }); fs.rmSync(path.join(dir, FILE + '-shm'), { force: true });
  fs.writeFileSync(path.join(dir, FILE), 'this is not a database, just text that is long enough to have a header');
  fs.writeFileSync(path.join(dir, 'follows.json'), JSON.stringify({ sites: { kick: ['alpha'] } }));
  const logs = [];
  db = openDb(dir, { log: m => logs.push(m) });
  assert.ok(db.restored && fs.existsSync(db.restored.aside), 'moved aside');
  assert.match(logs[0], /couldn't be opened/);
  assert.deepEqual(db.importFiles(dir), ['follows.json']);
  db.close();
});

test('openDb: a folder that can\'t be written keeps the data in memory this run', t => {
  const file = path.join(tempDir('dbro', t), 'a-file');
  fs.writeFileSync(file, '');
  const logs = [];
  const db = openDb(file, { log: m => logs.push(m) });   // a file where the folder should be
  db.set('x', 1);
  assert.equal(db.get('x'), 1);
  assert.equal(db.file, ':memory:');
  assert.match(logs.join('\n'), /nothing will be saved this run/);
});
