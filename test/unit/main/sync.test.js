// Sync through a folder (src/main/sync.js): two computers on one temporary folder, with timers the test runs by
// hand. Their own files, a channel and a setting going across, the first sync's choices, Undo, renaming,
// forgetting a computer, a folder that's gone, and finding the folders already synced on a computer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../../../src/main/sync');
const { tempDir } = require('../../helpers');

const VERSIONS = { theme: 1, snap: 1, 'alertSound.mention': 1, streamers: 1 };
// Timers that only run when the test says so
function fakeTimers() {
  let n = 0; const due = new Map();
  return {
    setTimeout: (fn) => { due.set(++n, fn); return n; }, clearTimeout: id => { due.delete(id); },
    setInterval: () => ++n, clearInterval: () => {},
    run() { for (let i = 0; i < 5 && due.size; i++) { const fns = [...due.values()]; due.clear(); fns.forEach(f => f()); } }
  };
}
// A computer: its data folder, its engine, what it sent the page, and its page's values
// (a stand-in for fs.watch, which takes a moment to close on macOS; one test uses the real one)
const fakeWatch = () => ({ on() {}, close() {} });
function computer(t, name, { clock, version = '0.5.0', userData, watchDir = fakeWatch } = {}) {
  const sent = [], timers = fakeTimers();
  const dir = userData || tempDir('sync-' + name, t);
  const sync = S.createSync({ userData: dir, version, send: (ch, d) => sent.push([ch, d]), now: clock, timers, watchDir, hostname: name + '.local', platform: 'darwin', home: dir });
  return { dir, sync, sent, timers, pulls: () => sent.filter(([ch]) => ch === 'sync:pull').map(([, d]) => d) };
}
const page = (saved, more = {}) => ({ values: { saved: JSON.stringify(saved), autoOpen: '[]', notifyOff: '[]', chNames: '{}', ytNames: null, theme: 'dark', snap: null, ...more }, versions: VERSIONS });

test('a computer gets an id and its name without .local, kept in its data folder', t => {
  const a = computer(t, 'Studio-MacBook');
  const s = a.sync.hello(page(['alpha']));
  assert.match(s.device, /^[0-9a-f]{16}$/);
  assert.equal(s.name, 'Studio-MacBook');
  assert.equal(s.on, false);
  assert.equal(s.channels, 1, 'the record is kept while sync is off');
  a.sync.close();
  const again = S.createSync({ userData: a.dir, version: '0.5.0', timers: fakeTimers(), watchDir: fakeWatch });
  assert.equal(again.status().device, s.device);
  assert.equal(S.defaultName(''), 'This computer');
});

test('two computers on one folder: a channel and a setting go across, and the page is told', t => {
  let now = 1000;
  const clock = () => now;
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock }), b = computer(t, 'b', { clock });
  a.sync.hello(page(['alpha']));
  b.sync.hello(page(['bravo'], { theme: 'light' }));
  assert.equal(a.sync.start({ folder }).ok, true);
  const devices = path.join(folder, S.SUB, 'devices');
  assert.deepEqual(fs.readdirSync(devices), [a.sync.status().device + '.json'], 'its own file, in the app\'s folder');

  assert.deepEqual(b.sync.peek(folder).others.map(o => [o.name, o.channels]), [['a', 1]]);
  b.sync.start({ folder, mode: 'combine' });
  const got = b.pulls()[0];
  assert.deepEqual(JSON.parse(got.values.saved), ['bravo', 'alpha']);
  assert.equal(got.from, 'a');
  assert.deepEqual(got.summary.added, ['alpha']);
  assert.equal(b.sync.status().computers.length, 2);
  assert.equal(b.sync.status().undo.from, 'a');

  now = 2000;
  a.sync.syncNow();
  assert.deepEqual(JSON.parse(a.pulls().at(-1).values.saved), ['alpha', 'bravo']);

  now = 3000;
  a.sync.changed('theme', 'pear');
  a.timers.run();                              // the write, after its debounce
  b.sync.syncNow();
  assert.equal(b.pulls().at(-1).values.theme, 'pear');

  now = 4000;
  b.sync.changed('saved', JSON.stringify(['alpha']));   // bravo removed on b
  b.timers.run();
  a.sync.syncNow();
  assert.deepEqual(JSON.parse(a.pulls().at(-1).values.saved), ['alpha']);
  assert.deepEqual(a.pulls().at(-1).summary.removed, ['bravo']);
  const writes = fs.statSync(path.join(devices, a.sync.status().device + '.json')).mtimeMs;
  a.sync.syncNow();
  assert.equal(fs.statSync(path.join(devices, a.sync.status().device + '.json')).mtimeMs, writes, 'nothing new: not written again');
  a.sync.close(); b.sync.close();
});

test('Undo puts back what the last sync changed, as new changes the others take too', t => {
  let now = 1000;
  const clock = () => now;
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock }), b = computer(t, 'b', { clock });
  a.sync.hello(page(['alpha'])); a.sync.start({ folder });
  b.sync.hello(page(['alpha']));  b.sync.start({ folder });
  now = 2000; a.sync.changed('theme', 'pear'); a.sync.changed('saved', '["alpha","charlie"]'); a.timers.run();
  b.sync.syncNow();
  assert.equal(b.pulls().at(-1).values.theme, 'pear');
  now = 3000;
  b.sync.undo();
  const back = b.pulls().at(-1);
  assert.equal(back.undo, true);
  assert.equal(back.values.theme, 'dark');
  assert.deepEqual(JSON.parse(back.values.saved), ['alpha']);
  assert.equal(b.sync.status().undo, null);
  assert.equal(b.sync.undo().undo, null, 'once');
  a.sync.syncNow();
  assert.equal(a.pulls().at(-1).values.theme, 'dark');
  assert.deepEqual(JSON.parse(a.pulls().at(-1).values.saved), ['alpha']);
  a.sync.close(); b.sync.close();
});

test("the first sync: Use theirs and Use this computer's", t => {
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock: () => 1000 });
  a.sync.hello(page(['alpha'], { theme: 'light' })); a.sync.start({ folder });
  const b = computer(t, 'b', { clock: () => 2000 });
  b.sync.hello(page(['bravo'])); b.sync.start({ folder, mode: 'theirs' });
  assert.equal(b.pulls()[0].values.theme, 'light');
  assert.deepEqual(JSON.parse(b.pulls()[0].values.saved), ['alpha']);
  const c = computer(t, 'c', { clock: () => 3000 });
  c.sync.hello(page(['charlie'])); c.sync.start({ folder, mode: 'mine' });
  assert.deepEqual(c.pulls(), [], "nothing of the others' comes in");
  a.sync.syncNow();
  assert.deepEqual(JSON.parse(a.pulls().at(-1).values.saved), ['charlie']);
  assert.equal(a.pulls().at(-1).values.theme, 'dark');
  [a, b, c].forEach(x => x.sync.close());
});

test('sounds are files of their own; what syncs can be switched off', t => {
  let now = 1000;
  const clock = () => now;
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock }), b = computer(t, 'b', { clock });
  a.sync.hello(page([], { 'alertSound.mention': 'data:audio/x;base64,AAAA' })); a.sync.start({ folder });
  const file = path.join(folder, S.SUB, 'sounds', a.sync.status().device, 'alertSound.mention');
  assert.equal(fs.readFileSync(file, 'utf8'), 'data:audio/x;base64,AAAA');
  b.sync.hello(page([])); b.sync.start({ folder });
  assert.equal(b.pulls()[0].values['alertSound.mention'], 'data:audio/x;base64,AAAA');
  now = 2000; a.sync.changed('alertSound.mention', null); a.timers.run();
  assert.equal(fs.existsSync(file), false, 'removed with the sound');
  b.sync.setWhat({ settings: false, sounds: false });
  assert.deepEqual(b.sync.status().what, { channels: true, settings: false, sounds: false });
  now = 3000; a.sync.changed('theme', 'pear'); a.timers.run();
  const n = b.pulls().length;
  b.sync.syncNow();
  assert.equal(b.pulls().length, n, 'settings switched off: not applied');
  a.sync.close(); b.sync.close();
});

test('renaming, other versions, a newer format, forgetting, stopping', t => {
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock: () => 1000 });
  a.sync.hello(page([])); a.sync.start({ folder });
  assert.equal(a.sync.rename('  Stream   desk Mac  ').name, 'Stream desk Mac');
  assert.equal(a.sync.rename('').name, 'Stream desk Mac', 'an empty name is ignored');
  assert.equal(a.sync.rename('x'.repeat(60)).name.length, 40);
  const devices = path.join(folder, S.SUB, 'devices');
  const write = (dev, d) => fs.writeFileSync(path.join(devices, dev + '.json'), JSON.stringify({ device: dev, at: 900, settings: {}, channels: {}, ...d }));
  write('old1', { format: 1, name: 'Travel laptop', os: 'Linux', app: '0.4.22' });
  write('new1', { format: 99, name: 'Office PC', os: 'Windows', app: '0.6.0' });
  fs.writeFileSync(path.join(devices, 'broken.json'), '{');
  fs.writeFileSync(path.join(devices, '.cloud1.json.icloud'), '');
  fs.writeFileSync(path.join(devices, 'x.json.tmp'), '{}');
  const list = a.sync.syncNow().computers;
  assert.deepEqual(list.map(c => [c.name, !!c.me, !!c.older, !!c.newer]), [['x'.repeat(40), true, false, false], ['Travel laptop', false, true, false], ['Office PC', false, false, true]]);
  a.sync.forget('old1');
  assert.equal(fs.existsSync(path.join(devices, 'old1.json')), false);
  assert.equal(a.sync.forget('../etc').computers.length, 2, 'only a device id');
  const off = a.sync.stop();
  assert.equal(off.on, false);
  assert.deepEqual(off.computers, []);
  a.sync.close();
});

test("a folder that's gone: says so, keeps the changes, and writes them once it's back", t => {
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock: () => 1000 });
  a.sync.hello(page([]));
  assert.equal(a.sync.start({ folder: path.join(folder, 'nope') }).ok, false);
  a.sync.start({ folder });
  const moved = folder + '-away';
  fs.renameSync(folder, moved);
  assert.equal(a.sync.syncNow().error, 'missing');
  a.sync.changed('theme', 'pear'); a.timers.run();
  assert.equal(a.sync.status().error, 'missing');
  fs.renameSync(moved, folder);
  assert.equal(a.sync.syncNow().error, '');
  const own = JSON.parse(fs.readFileSync(path.join(folder, S.SUB, 'devices', a.sync.status().device + '.json'), 'utf8'));
  assert.equal(own.settings.theme.value, 'pear');
  a.sync.close();
});

test('a backup before the first sync and before the first start of a new version, keeping the last few', t => {
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock: () => Date.UTC(2026, 10, 4) });
  a.sync.hello(page(['alpha'])); a.sync.start({ folder }); a.sync.close();
  const backups = path.join(a.dir, S.BACKUPS);
  assert.equal(fs.readdirSync(backups).length, 1);
  for (let i = 0; i < 7; i++) {
    const b = computer(t, 'a', { userData: a.dir, version: '0.6.' + i, clock: () => Date.UTC(2026, 10, 5, 0, 0, i) });
    b.sync.hello(page(['alpha'])); b.sync.close();
  }
  const names = fs.readdirSync(backups);
  assert.equal(names.length, 5);
  assert.ok(names.at(-1).endsWith('before-v0.6.6.json'));
  assert.ok(JSON.parse(fs.readFileSync(path.join(backups, names.at(-1)), 'utf8')).record.channels.alpha);
});

test('the folders already synced on a computer, only ones that are there', t => {
  const home = tempDir('sync-home', t);
  const mk = (...p) => { const d = path.join(home, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
  const icloud = mk('Library', 'Mobile Documents', 'com~apple~CloudDocs');
  const dbx = mk('Work Dropbox');
  mk('.dropbox'); fs.writeFileSync(path.join(home, '.dropbox', 'info.json'), JSON.stringify({ personal: { path: dbx } }));
  const one = mk('Library', 'CloudStorage', 'OneDrive-Personal');
  const g = mk('Library', 'CloudStorage', 'GoogleDrive-someone', 'My Drive');
  mk('Sync');
  assert.deepEqual(S.syncedFolders({ platform: 'darwin', home, env: {} }).map(f => [f.id, f.path]),
    [['icloud', icloud], ['dropbox', dbx], ['onedrive', one], ['gdrive', g], ['syncthing', path.join(home, 'Sync')]]);
  const win = mk('OneDriveWin');
  mk('iCloudDrive');
  assert.deepEqual(S.syncedFolders({ platform: 'win32', home, env: { OneDrive: win } }).map(f => f.id), ['icloud', 'dropbox', 'onedrive', 'syncthing']);
  assert.deepEqual(S.syncedFolders({ platform: 'linux', home: tempDir('sync-empty', t), env: {} }), []);
});

test('versions compare by number; the folder inside the chosen one', () => {
  assert.equal(S.cmpVersion('0.4.22', '0.5.0'), -1);
  assert.equal(S.cmpVersion('0.10.0', '0.9.9'), 1);
  assert.equal(S.cmpVersion('0.5.0', '0.5.0'), 0);
  assert.equal(S.syncDirOf(path.join('x', 'Dropbox')), path.join('x', 'Dropbox', S.SUB));
  assert.equal(S.syncDirOf(path.join('x', S.SUB)), path.join('x', S.SUB));
});

test("a change in the folder is read soon after it's seen (fs.watch), this computer's own writes aren't, and a watch that fails is made again", t => {
  const folder = tempDir('sync-folder', t);
  let fire = null, errored = null, made = 0;
  const watchDir = (dir, fn) => { made++; fire = fn; return { on: (ev, f) => { if (ev === 'error') errored = f; }, close() {} }; };
  const a = computer(t, 'a', { clock: () => 1000, watchDir }), b = computer(t, 'b', { clock: () => 2000 });
  a.sync.hello(page([])); a.sync.start({ folder });
  b.sync.hello(page(['bravo'])); b.sync.start({ folder });
  fire('rename', a.sync.status().device + '.json');
  a.timers.run();
  assert.deepEqual(a.pulls(), [], 'its own file: nothing to read');
  fire('rename', b.sync.status().device + '.json');
  a.timers.run();
  assert.deepEqual(JSON.parse(a.pulls()[0].values.saved), ['bravo']);
  errored();
  a.sync.syncNow();
  assert.equal(made, 2, 'watching again');
  a.sync.close(); b.sync.close();
});

test('linked streamers made on each computer at nearly the same time: both stay', t => {
  let now = 1000;
  const clock = () => now;
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock }), b = computer(t, 'b', { clock });
  const s = (id, accounts) => ({ id, name: '', main: accounts[0], accounts });
  a.sync.hello(page(['alpha', 'yt:@alpha', 'bravo', 'tw:bravo'], { streamers: '[]' })); a.sync.start({ folder });
  b.sync.hello(page(['alpha', 'yt:@alpha', 'bravo', 'tw:bravo'], { streamers: '[]' })); b.sync.start({ folder });
  now = 2000; a.sync.changed('streamers', JSON.stringify([s('sa', ['alpha', 'yt:@alpha'])])); a.timers.run();
  now = 2001; b.sync.changed('streamers', JSON.stringify([s('sb', ['bravo', 'tw:bravo'])])); b.timers.run();
  b.sync.syncNow();
  assert.deepEqual(JSON.parse(b.pulls().at(-1).values.streamers).map(x => x.id), ['sb', 'sa']);
  a.sync.syncNow();
  assert.deepEqual(JSON.parse(a.pulls().at(-1).values.streamers).map(x => x.id), ['sa', 'sb']);
  assert.deepEqual(a.pulls().at(-1).summary.keys, ['streamers']);
  now = 3000; b.sync.undo();
  assert.deepEqual(JSON.parse(b.pulls().at(-1).values.streamers).map(x => x.id), ['sb'], 'Undo puts the list back as it was');
  a.sync.close(); b.sync.close();
});

test("a change the other computers haven't got after a few minutes: each one, and all of them, say so", t => {
  let now = 1000;
  const clock = () => now;
  const folder = tempDir('sync-folder', t);
  const a = computer(t, 'a', { clock }), b = computer(t, 'b', { clock });
  a.sync.hello(page([])); a.sync.start({ folder });
  b.sync.hello(page([])); b.sync.start({ folder });
  now = 2000; a.sync.changed('theme', 'pear'); a.timers.run();
  let s = a.sync.syncNow();
  assert.equal(s.computers[1].behind, undefined, 'not yet: a minute or two is normal');
  now = 2000 + S.REACH_MS + 1;
  s = a.sync.syncNow();
  assert.equal(s.computers[1].behind, 2000);
  assert.equal(s.behind, 2000, 'none of the others has it');
  b.sync.syncNow();                                    // b takes it, and its file has it
  s = a.sync.syncNow();
  assert.equal(s.computers[1].behind, undefined);
  assert.equal(s.behind, undefined);
  // a kind the other computer doesn't sync doesn't count
  b.sync.setWhat({ settings: false });
  now += 10; a.sync.changed('theme', 'dark'); a.timers.run();
  now += S.REACH_MS + 1;
  assert.equal(a.sync.syncNow().computers[1].behind, undefined);
  // a channel and a linked streamer count as changes too
  b.sync.setWhat({ settings: true });
  now += 10; a.sync.changed('saved', '["zulu"]'); a.timers.run();
  now += S.REACH_MS + 1;
  assert.ok(a.sync.syncNow().computers[1].behind);
  b.sync.syncNow();
  now += 10; a.sync.changed('streamers', JSON.stringify([{ id: 'sz', main: 'zulu', accounts: ['zulu', 'tw:zulu'] }])); a.timers.run();
  now += S.REACH_MS + 1;
  assert.ok(a.sync.syncNow().behind);
  a.sync.close(); b.sync.close();
});
