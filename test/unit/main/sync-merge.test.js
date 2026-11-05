// Sync's merge (src/main/sync-merge.js): the logical clock, this computer's record, the device files and their
// formats, merging keys and channels, the first sync's choices, and old markers.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../../src/main/sync-merge');

const V = { theme: 1, mentWords: 1, 'alertSound.mention': 1, snap: 1 };
const rec = () => ({ settings: {}, channels: {} });
const chVals = (saved, more = {}) => ({ saved: JSON.stringify(saved), autoOpen: null, notifyOff: null, chNames: null, ytNames: null, ...more });
// Another computer's file, as readDevice() gives it
const other = (device, { settings = {}, channels = {}, at = 1000, app = '0.5.0' } = {}) =>
  M.readDevice({ format: 1, device, name: device.toUpperCase(), os: 'Windows', app, at, settings, channels }).file;
const ALL = { channels: true, settings: true, sounds: true };

test('the clock: now, or one past the highest stamp seen; ties go to the device id', () => {
  assert.equal(M.tick(0, 500), 500);
  assert.equal(M.tick(900, 500), 901, "another computer's clock was ahead");
  assert.ok(M.beats({ at: 2, dev: 'a' }, { at: 1, dev: 'z' }));
  assert.ok(M.beats({ at: 1, dev: 'b' }, { at: 1, dev: 'a' }));
  assert.ok(!M.beats({ at: 1, dev: 'a' }, { at: 1, dev: 'b' }));
  assert.ok(M.beats({ at: 0, dev: 'a' }, undefined));
});

test('what kind each key is', () => {
  assert.equal(M.kindOf('saved'), 'channels');
  assert.equal(M.kindOf('chNames'), 'channels');
  assert.equal(M.kindOf('alertSound.mention'), 'sounds');
  assert.equal(M.kindOf('theme'), 'settings');
});

test('the saved channels from the page: auto-open, alerts off and names go with each', () => {
  assert.deepEqual(M.channelsOf(chVals(['alpha', 'tw:bravo'], { autoOpen: '["alpha","gone"]', notifyOff: '["tw:bravo"]', chNames: '{"alpha":"Alpha"}', ytNames: '{"tw:bravo":"Bravo"}' })),
    { alpha: { autoOpen: true, name: 'Alpha' }, 'tw:bravo': { notifyOff: true, name: 'Bravo' } });
  assert.deepEqual(M.channelsOf({ saved: 'not json', autoOpen: '{"a":1}' }), {});
});

test("the first record starts at 0; a change after gets a stamp; the same value doesn't", () => {
  const r = rec();
  let { clock, changed } = M.recordLocal(r, { theme: 'dark', snap: null, ...chVals(['alpha']) }, { dev: 'me', now: 100, versions: V, first: true });
  assert.deepEqual(changed, ['theme', 'ch:alpha']);
  assert.equal(r.settings.theme.at, 0);
  assert.equal(r.channels.alpha.at, 0);
  assert.equal(clock, 0);
  ({ clock, changed } = M.recordLocal(r, { theme: 'dark' }, { dev: 'me', now: 200, clock, versions: V }));
  assert.deepEqual(changed, []);
  ({ clock, changed } = M.recordLocal(r, { theme: 'light' }, { dev: 'me', now: 200, clock, versions: V }));
  assert.deepEqual(r.settings.theme, { v: 1, at: 200, dev: 'me', value: 'light' });
  ({ clock } = M.recordLocal(r, { snap: '1' }, { dev: 'me', now: 150, clock, versions: { snap: 2 } }));
  assert.deepEqual(r.settings.snap, { v: 2, at: 201, dev: 'me', value: '1' }, 'never older than the last stamp; with the copy\'s version');
});

test('channels: added, changed and removed ones get stamps; a removed one leaves a marker; a new name alone is no change', () => {
  const r = rec();
  let { clock } = M.recordLocal(r, chVals(['alpha', 'bravo']), { dev: 'me', now: 10, versions: V });
  ({ clock } = M.recordLocal(r, chVals(['alpha'], { autoOpen: '["alpha"]' }), { dev: 'me', now: 20, clock, versions: V }));
  assert.deepEqual(r.channels.alpha, { at: 20, dev: 'me', autoOpen: true });
  assert.deepEqual(r.channels.bravo, { at: 21, dev: 'me', removed: true });
  const { changed } = M.recordLocal(r, chVals(['alpha'], { autoOpen: '["alpha"]', chNames: '{"alpha":"Alpha"}' }), { dev: 'me', now: 30, clock, versions: V });
  assert.deepEqual(changed, []);
  assert.equal(r.channels.alpha.name, 'Alpha');
  ({ clock } = M.recordLocal(r, chVals(['alpha', 'bravo'], { autoOpen: '["alpha"]' }), { dev: 'me', now: 40, clock, versions: V }));
  assert.deepEqual(r.channels.bravo, { at: 40, dev: 'me' }, 'saved again');
});

test('device files: read back as written; damaged entries and files are left out', () => {
  const r = rec();
  M.recordLocal(r, { theme: 'dark', 'alertSound.mention': 'data:audio/x;base64,AA', ...chVals(['alpha'], { autoOpen: '["alpha"]' }) }, { dev: 'me', now: 5, versions: V });
  const file = M.deviceFile(r, { device: 'me', name: 'Studio', os: 'macOS', app: '0.5.0', at: 9, what: ALL });
  assert.equal(file.format, M.FORMAT);
  assert.equal(file.settings['alertSound.mention'].value, null, 'a sound is a file of its own');
  assert.equal(file.settings['alertSound.mention'].file, true);
  const back = M.readDevice(JSON.parse(JSON.stringify(file)));
  assert.ok(back.ok);
  assert.deepEqual(back.file.settings.theme, { v: 1, at: 5, dev: 'me', value: 'dark' });
  assert.deepEqual(back.file.channels.alpha, { at: 7, dev: 'me', autoOpen: true }, 'a stamp each');
  const only = M.deviceFile(r, { device: 'me', name: '', os: '', app: '', at: 9, what: { channels: false, settings: true, sounds: false } });
  assert.deepEqual(Object.keys(only.settings), ['theme']);
  assert.deepEqual(only.channels, {});
  assert.deepEqual(M.readDevice(null), { ok: false });
  assert.deepEqual(M.readDevice({ format: 1 }), { ok: false });
  assert.deepEqual(M.readDevice({ format: 0, device: 'x' }), { ok: false });
  const odd = M.readDevice({ format: 1, device: 'x', settings: { a: null, b: { at: 'no' }, c: { at: 3, value: 7 } }, channels: { z: 'no', y: { at: 2, name: '' } } }).file;
  assert.deepEqual(odd.settings, { c: { v: 1, at: 3, dev: 'x', value: null } });
  assert.deepEqual(odd.channels, { y: { at: 2, dev: 'x' } });
});

test('every past format reads as today\'s, and a newer format is left alone', () => {
  // format 1 (0.5.0): the first one
  const f1 = { format: 1, device: 'old', name: 'Old', os: 'Linux', app: '0.5.0', at: 7, settings: { theme: { v: 1, at: 3, dev: 'old', value: 'dark' } }, channels: { alpha: { at: 3, dev: 'old' } } };
  const r = M.readDevice(f1);
  assert.ok(r.ok);
  assert.equal(r.file.format, 1);
  assert.equal(r.file.settings.theme.value, 'dark');
  const newer = M.readDevice({ format: M.FORMAT + 1, device: 'new', name: 'Office PC', app: '0.6.0', at: 9, settings: 'whatever it is' });
  assert.equal(newer.ok, false);
  assert.equal(newer.newer, true);
  assert.deepEqual(newer.file, { device: 'new', name: 'Office PC', os: '', app: '0.6.0', at: 9, format: M.FORMAT + 1 });
});

test('merge: the newer value wins and is applied; this computer adopts its stamp', () => {
  const r = rec();
  M.recordLocal(r, { theme: 'dark', mentWords: '["a"]' }, { dev: 'me', now: 100, versions: V });
  const f = other('pc', { settings: { theme: { v: 1, at: 150, dev: 'pc', value: 'light' }, mentWords: { v: 1, at: 50, dev: 'pc', value: '["b"]' } } });
  const m = M.merge(r, [f], { values: {}, versions: V, what: ALL, clock: 100 });
  assert.deepEqual(m.apply, { theme: 'light' });
  assert.deepEqual(m.before, { theme: 'dark' });
  assert.deepEqual(m.applyV, { theme: 1 });
  assert.deepEqual(m.summary.keys, ['theme']);
  assert.equal(m.from, 'pc');
  assert.equal(m.clock, 150);
  assert.ok(m.touched);
  assert.deepEqual(r.settings.theme, { v: 1, at: 150, dev: 'pc', value: 'light' });
  const again = M.merge(r, [f], { values: {}, versions: V, what: ALL, clock: m.clock });
  assert.deepEqual(again.apply, {});
  assert.equal(again.touched, false, 'nothing new: nothing to write');
});

test("merge: an unknown key, a newer setting version, and kinds switched off aren't applied", () => {
  const r = rec();
  const f = other('pc', { settings: { future: { v: 1, at: 9, value: 'x' }, theme: { v: 2, at: 9, value: 'v2' }, snap: { v: 1, at: 9, value: '1' } } });
  let m = M.merge(r, [f], { values: {}, versions: V, what: { ...ALL, settings: false }, clock: 0 });
  assert.deepEqual(m.apply, {});
  m = M.merge(r, [f], { values: {}, versions: V, what: ALL, clock: 0 });
  assert.deepEqual(m.apply, { snap: '1' });
  assert.equal(r.settings.theme, undefined, 'the newer value waits until this copy updates');
});

test('merge: the same value from another computer only takes its stamp; a value removed elsewhere is removed here', () => {
  const r = rec();
  M.recordLocal(r, { theme: 'dark', snap: '1' }, { dev: 'me', now: 10, versions: V });
  const m = M.merge(r, [other('pc', { settings: { theme: { v: 1, at: 20, value: 'dark' }, snap: { v: 1, at: 30, value: null } } })], { values: {}, versions: V, what: ALL, clock: 10 });
  assert.deepEqual(m.apply, { snap: null });
  assert.equal(r.settings.theme.at, 20);
});

test('merge: sounds come with their value, or wait for their file', () => {
  const r = rec();
  const e = { v: 1, at: 5, dev: 'pc', value: null, file: true };
  const f = other('pc', { settings: { 'alertSound.mention': e } });
  assert.deepEqual(M.merge(r, [f], { values: {}, versions: V, what: ALL }).apply, {}, 'its file not read yet');
  f.settings['alertSound.mention'].value = 'data:audio/x;base64,AA';
  assert.deepEqual(M.merge(r, [f], { values: {}, versions: V, what: ALL }).apply, { 'alertSound.mention': 'data:audio/x;base64,AA' });
  const r2 = rec();
  assert.deepEqual(M.merge(r2, [f], { values: {}, versions: V, what: { ...ALL, sounds: false } }).apply, {});
});

test('merge: channels from both computers; removed ones stay removed; auto-open, alerts and names come along', () => {
  const r = rec();
  const values = chVals(['alpha', 'bravo'], { notifyOff: '["bravo"]', chNames: '{"alpha":"Alpha"}' });
  M.recordLocal(r, values, { dev: 'me', now: 100, versions: V });
  const f = other('pc', { channels: {
    charlie: { at: 120, name: 'Charlie', autoOpen: true },
    bravo: { at: 130, removed: true },
    alpha: { at: 50, removed: true },          // older than this computer's: alpha stays
    delta: { at: 10, removed: true }           // never here: nothing to do
  } });
  const m = M.merge(r, [f], { values, versions: V, what: ALL, clock: 100 });
  assert.deepEqual(JSON.parse(m.apply.saved), ['alpha', 'charlie']);
  assert.deepEqual(JSON.parse(m.apply.autoOpen), ['charlie']);
  assert.deepEqual(JSON.parse(m.apply.notifyOff), []);
  assert.deepEqual(JSON.parse(m.apply.chNames), { alpha: 'Alpha', charlie: 'Charlie' });
  assert.deepEqual(m.summary.added, ['charlie']);
  assert.deepEqual(m.summary.removed, ['bravo']);
  assert.deepEqual(m.before.saved, values.saved);
  assert.equal(m.from, 'pc');
  assert.ok(r.channels.delta.removed, 'the marker is kept, so it passes on');
  // a channel's auto-open changed elsewhere
  const v2 = { ...values, ...m.apply };
  const m2 = M.merge(r, [other('pc', { channels: { alpha: { at: 200, autoOpen: true } } })], { values: v2, versions: V, what: ALL, clock: m.clock });
  assert.deepEqual(JSON.parse(m2.apply.autoOpen), ['charlie', 'alpha']);
  assert.deepEqual(m2.summary.changed, ['alpha']);
  assert.equal(m2.apply.saved, undefined, 'the list itself is the same');
  assert.deepEqual(M.merge(r, [other('pc', { channels: { zulu: { at: 900 } } })], { values: v2, versions: V, what: { ...ALL, channels: false } }).apply, {});
});

test('merge: the computer the newest change came from is named', () => {
  const r = rec();
  const m = M.merge(r, [other('a', { settings: { theme: { v: 1, at: 5, value: 'x' } } }), other('b', { settings: { snap: { v: 1, at: 9, value: '1' } } })], { values: {}, versions: V, what: ALL });
  assert.equal(m.from, 'b');
});

test("the first sync: combine merges as usual; theirs takes the others'; mine keeps this computer's", () => {
  const mk = () => { const r = rec(); M.recordLocal(r, { theme: 'dark', ...chVals(['alpha', 'mine']) }, { dev: 'me', now: 0, versions: V, first: true }); return r; };
  const f = () => other('pc', { settings: { theme: { v: 1, at: 0, dev: 'aaa', value: 'light' }, snap: { v: 1, at: 0, dev: 'aaa', value: '1' } }, channels: { alpha: { at: 0, dev: 'aaa' }, theirs: { at: 0, dev: 'aaa' } } });
  const values = chVals(['alpha', 'mine']);

  let r = mk();
  assert.equal(M.firstSync(r, [f()], 'combine', { dev: 'me', now: 10 }), 0);
  let m = M.merge(r, [f()], { values, versions: V, what: ALL });
  assert.deepEqual(JSON.parse(m.apply.saved), ['alpha', 'mine', 'theirs']);
  assert.equal(m.apply.theme, undefined, "a tie: 'me' beats 'aaa'");

  r = mk();
  M.firstSync(r, [f()], 'theirs', { dev: 'me', now: 10 });
  m = M.merge(r, [f()], { values, versions: V, what: ALL, clock: 10 });
  assert.equal(m.apply.theme, 'light');
  assert.equal(m.apply.snap, '1');
  assert.deepEqual(JSON.parse(m.apply.saved), ['alpha', 'theirs']);
  assert.ok(r.channels.mine.removed);

  r = mk();
  const clock = M.firstSync(r, [f()], 'mine', { dev: 'me', now: 10 });
  assert.ok(clock >= 10);
  m = M.merge(r, [f()], { values, versions: V, what: ALL, clock });
  assert.deepEqual(m.apply, {});
  assert.equal(r.settings.snap.value, null, 'the others take this computer\'s default');
  assert.ok(r.channels.theirs.removed);
  assert.ok(r.settings.theme.at > 0);
});

test('old markers and computers not seen for 6 months go', () => {
  const r = rec();
  r.channels = { old: { at: 1, dev: 'x', removed: true }, recent: { at: M.KEEP_MS, dev: 'x', removed: true }, kept: { at: 1, dev: 'x' }, zero: { at: 0, dev: 'x', removed: true } };
  M.prune(r, M.KEEP_MS + 2);
  assert.deepEqual(Object.keys(r.channels), ['recent', 'kept', 'zero']);
  assert.ok(M.stale({ at: 1 }, M.KEEP_MS + 2));
  assert.ok(!M.stale({ at: 10 }, 20));
});
