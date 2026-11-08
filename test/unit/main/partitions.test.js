const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createPartitionCare, folderOf, folderSize, UNUSED_DAYS, CODE_CACHE_MAX, STREAMS_MAX, DAY } = require('../../../src/main/partitions');
const { tempDir } = require('../../helpers');

const NOW = Date.UTC(2026, 9, 31);
// a storage folder with a cookie file last changed `daysAgo` and `cache` bytes of compiled scripts
function storage(dir, name, { daysAgo = 0, cache = 0, cookies = true } = {}) {
  const d = path.join(dir, name);
  fs.mkdirSync(path.join(d, 'Code Cache', 'js'), { recursive: true });
  if (cache) fs.writeFileSync(path.join(d, 'Code Cache', 'js', 'index'), Buffer.alloc(cache));
  const t = new Date(NOW - daysAgo * DAY);
  if (cookies) { fs.writeFileSync(path.join(d, 'Cookies'), ''); fs.utimesSync(path.join(d, 'Cookies'), t, t); }
  fs.utimesSync(d, t, t);
  return d;
}
const left = dir => fs.readdirSync(dir).sort();

test('folderOf: a saved partition\'s folder; null for one kept in memory or not a name', () => {
  assert.equal(folderOf('persist:kmv-stream-alpha'), 'kmv-stream-alpha');
  assert.equal(folderOf('kmv-stream-alpha'), null);
  assert.equal(folderOf(undefined), null);
});

test('use: only streams\' own storage is noted, with the time; it says when something changed', () => {
  let t = NOW;
  const care = createPartitionCare({ dir: '/nowhere', now: () => t });
  assert.equal(care.takeChanged(), false);
  for (const p of ['persist:kick', 'persist:twitch', 'persist:youtube', 'persist:kmv-web', 'persist:kmv-mini', 'kmv-stream-x', 'persist:kmv-stream-a/b', null])
    assert.equal(care.use(p), false, String(p));
  assert.equal(care.takeChanged(), false);
  assert.equal(care.use('persist:kmv-stream-alpha'), true);
  t += 5; care.use('persist:kmv-stream-alpha');
  assert.deepEqual(care.toSave(), { used: { 'kmv-stream-alpha': NOW + 5 }, sizes: {} });
  assert.equal(care.takeChanged(), true);
  assert.equal(care.takeChanged(), false);
});

test('prune: streams unused for a month go (by the date noted, else their cookies\', else the folder\'s); logins and other pages stay', t => {
  const dir = tempDir('parts', t);
  for (const name of ['kick', 'twitch', 'youtube', 'kmv-web', 'kmv-mini']) storage(dir, name, { daysAgo: 400 });
  storage(dir, 'kmv-stream-noted', { daysAgo: 400 });                // its files are old, but it was used yesterday
  storage(dir, 'kmv-stream-old', { daysAgo: 2 });                    // its files are new, but it was noted 40 days ago
  storage(dir, 'kmv-stream-cookies', { daysAgo: UNUSED_DAYS + 1 });  // from before the app noted them
  storage(dir, 'kmv-stream-recent', { daysAgo: UNUSED_DAYS - 1 });
  storage(dir, 'kmv-stream-nocookies', { daysAgo: 90, cookies: false });
  fs.writeFileSync(path.join(dir, 'kmv-stream-file'), '');           // not a folder
  const care = createPartitionCare({ dir, now: () => NOW, saved: {
    'kmv-stream-noted': NOW - DAY, 'kmv-stream-old': NOW - 40 * DAY, 'kmv-stream-gone': NOW, '../evil': NOW, 'kmv-stream-bad': 'x' } });
  assert.deepEqual(care.prune().sort(), ['kmv-stream-cookies', 'kmv-stream-nocookies', 'kmv-stream-old']);
  assert.deepEqual(left(dir).filter(n => !n.startsWith('.removed-')),
    ['kick', 'kmv-mini', 'kmv-stream-file', 'kmv-stream-noted', 'kmv-stream-recent', 'kmv-web', 'twitch', 'youtube']);
  assert.equal(left(dir).filter(n => n.startsWith('.removed-')).length, 3, 'renamed out of the way');
  assert.deepEqual(care.toSave().used, { 'kmv-stream-noted': NOW - DAY }, 'what\'s gone (and what wasn\'t a stream\'s) is forgotten');
  assert.equal(care.takeChanged(), true);
});

test('prune: no Partitions folder yet (a new install) is nothing to do', () => {
  const care = createPartitionCare({ dir: path.join(tempDir('none'), 'Partitions'), now: () => NOW });
  assert.deepEqual(care.prune(), []);
  assert.equal(care.takeChanged(), false);
});

test('prune: a folder that can\'t be moved stays, and is tried again next time', t => {
  const dir = tempDir('stuck', t);
  storage(dir, 'kmv-stream-stuck', { daysAgo: 90 });
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); };
  try { assert.deepEqual(createPartitionCare({ dir, now: () => NOW }).prune(), []); } finally { fs.renameSync = rename; }
  assert.deepEqual(left(dir), ['kmv-stream-stuck']);
  assert.deepEqual(createPartitionCare({ dir, now: () => NOW }).prune(), ['kmv-stream-stuck']);
});

test('emptyTrash: deletes what prune() moved (and any left by an earlier run), nothing else', async t => {
  const dir = tempDir('trash', t);
  storage(dir, 'kmv-stream-old', { daysAgo: 90, cache: 1000 });
  storage(dir, 'kmv-stream-new', { daysAgo: 1 });
  storage(dir, '.removed-kmv-stream-earlier-1', { daysAgo: 400 });
  const care = createPartitionCare({ dir, now: () => NOW });
  care.prune();
  await care.emptyTrash();
  assert.deepEqual(left(dir), ['kmv-stream-new']);
  await care.emptyTrash();                                           // nothing left to delete
  await createPartitionCare({ dir: path.join(dir, 'missing') }).emptyTrash();
});

test('measure: notes every storage\'s size, its Code Cache\'s and its HTTP Cache\'s, not the ones being removed; oversized reads them', async t => {
  const dir = tempDir('code', t);
  storage(dir, 'kick', { cache: 3000 });
  storage(dir, 'kmv-stream-big', { cache: 2000 });
  storage(dir, 'kmv-stream-small', { cache: 500 });
  storage(dir, '.removed-kmv-stream-x-1', { cache: 5000 });
  fs.mkdirSync(path.join(dir, 'kmv-stream-nocache'));
  fs.mkdirSync(path.join(dir, 'kmv-stream-nocache', 'Cache'));
  fs.writeFileSync(path.join(dir, 'kmv-stream-nocache', 'Cache', 'data_1'), Buffer.alloc(700));
  fs.mkdirSync(path.join(dir, 'not a name'));
  const care = createPartitionCare({ dir, now: () => NOW });
  assert.deepEqual(care.oversized('code', 0), [], 'nothing measured yet');
  await care.measure();
  assert.equal(care.takeChanged(), true);
  assert.deepEqual(care.toSave().sizes, {
    kick: { all: 3000, code: 3000, http: 0 }, 'kmv-stream-big': { all: 2000, code: 2000, http: 0 },
    'kmv-stream-small': { all: 500, code: 500, http: 0 }, 'kmv-stream-nocache': { all: 700, code: 0, http: 700 } });
  assert.deepEqual(care.oversized('code', 1000).sort(), ['persist:kick', 'persist:kmv-stream-big']);
  assert.deepEqual(care.oversized('code', CODE_CACHE_MAX), []);
  assert.deepEqual(care.oversized('http', 0), ['persist:kmv-stream-nocache']);
  await care.measure();
  assert.equal(care.takeChanged(), false, 'the same sizes again: nothing to save');
  fs.rmSync(path.join(dir, 'kmv-stream-small'), { recursive: true });
  await care.measure();
  assert.equal(care.takeChanged(), true);
  assert.equal(care.toSave().sizes['kmv-stream-small'], undefined, 'gone, forgotten');
});

test('saved: the dates alone (from before sizes were noted) still count; bad sizes and names are left out', () => {
  assert.deepEqual(createPartitionCare({ dir: '/nowhere', saved: { 'kmv-stream-a': NOW } }).toSave(), { used: { 'kmv-stream-a': NOW }, sizes: {} });
  const care = createPartitionCare({ dir: '/nowhere', saved: { used: { 'kmv-stream-a': NOW, kick: NOW }, sizes: {
    kick: { all: 5, code: 2, http: 1, extra: 9 }, 'kmv-stream-a': { all: -1, code: 0, http: 0 }, 'kmv-stream-b': { all: 1, code: 'x', http: 0 },
    '../evil': { all: 1, code: 1, http: 1 }, 'kmv-stream-c': null } } });
  assert.deepEqual(care.toSave(), { used: { 'kmv-stream-a': NOW }, sizes: { kick: { all: 5, code: 2, http: 1 } } });
  assert.deepEqual(createPartitionCare({ dir: '/nowhere', saved: { sizes: { kick: { all: 1, code: 0, http: 0 } } } }).toSave().used, {}, 'sizes alone: no dates');
  assert.deepEqual(createPartitionCare({ dir: '/nowhere', saved: 'x' }).toSave(), { used: {}, sizes: {} });
});

test('prune: a Code Cache noted past its size goes at start-up, logins\' too; the storage stays', t => {
  const dir = tempDir('codeprune', t);
  for (const name of ['kick', 'kmv-stream-big', 'kmv-stream-small']) storage(dir, name, { cache: 10 });
  const big = CODE_CACHE_MAX + 1;
  const care = createPartitionCare({ dir, now: () => NOW, saved: { used: { 'kmv-stream-big': NOW, 'kmv-stream-small': NOW }, sizes: {
    kick: { all: big + 50, code: big, http: 0 }, 'kmv-stream-big': { all: big, code: big, http: 0 }, 'kmv-stream-small': { all: 100, code: 100, http: 0 } } } });
  assert.deepEqual(care.prune(), [], 'no storage removed');
  assert.ok(!fs.existsSync(path.join(dir, 'kick', 'Code Cache')));
  assert.ok(!fs.existsSync(path.join(dir, 'kmv-stream-big', 'Code Cache')));
  assert.ok(fs.existsSync(path.join(dir, 'kmv-stream-small', 'Code Cache')));
  assert.ok(fs.existsSync(path.join(dir, 'kick', 'Cookies')));
  assert.deepEqual(care.toSave().sizes.kick, { all: 50, code: 0, http: 0 });
  assert.equal(left(dir).filter(n => n.startsWith('.removed-')).length, 2, 'moved to be deleted');
  assert.equal(care.takeChanged(), true);
});

test('prune: past STREAMS_MAX all together, the streams used longest ago go first; logins don\'t count', t => {
  const dir = tempDir('total', t);
  const third = Math.ceil(STREAMS_MAX / 3);
  for (const name of ['kick', 'kmv-stream-a', 'kmv-stream-b', 'kmv-stream-c', 'kmv-stream-d', 'kmv-stream-unmeasured']) storage(dir, name);
  const used = { 'kmv-stream-a': NOW - 3 * DAY, 'kmv-stream-b': NOW - DAY, 'kmv-stream-c': NOW - 2 * DAY, 'kmv-stream-d': NOW, 'kmv-stream-unmeasured': NOW - 9 * DAY };
  const size = all => ({ all, code: 0, http: all });
  const care = createPartitionCare({ dir, now: () => NOW, saved: { used, sizes: {
    kick: size(STREAMS_MAX * 2), 'kmv-stream-a': size(third), 'kmv-stream-b': size(third), 'kmv-stream-c': size(third), 'kmv-stream-d': size(third) } } });
  assert.deepEqual(care.prune(), ['kmv-stream-unmeasured', 'kmv-stream-a'], 'oldest first, until the rest fits');
  assert.deepEqual(left(dir).filter(n => !n.startsWith('.removed-')), ['kick', 'kmv-stream-b', 'kmv-stream-c', 'kmv-stream-d']);
  assert.deepEqual(Object.keys(care.toSave().sizes).sort(), ['kick', 'kmv-stream-b', 'kmv-stream-c', 'kmv-stream-d']);
  assert.deepEqual(createPartitionCare({ dir, now: () => NOW, saved: care.toSave() }).prune(), [], 'under the total: nothing more');
});

test('prune: a stream or Code Cache that can\'t be moved stays and still counts', t => {
  const dir = tempDir('stucktotal', t);
  for (const name of ['kmv-stream-old', 'kmv-stream-new']) storage(dir, name);
  const sizes = { 'kmv-stream-old': { all: STREAMS_MAX, code: CODE_CACHE_MAX + 1, http: 0 }, 'kmv-stream-new': { all: STREAMS_MAX, code: 0, http: 0 } };
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); };
  let care;
  try {
    care = createPartitionCare({ dir, now: () => NOW, saved: { used: { 'kmv-stream-old': NOW - DAY, 'kmv-stream-new': NOW }, sizes } });
    assert.deepEqual(care.prune(), []);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(care.toSave().sizes['kmv-stream-old'], sizes['kmv-stream-old'], 'noted as it was');
  assert.deepEqual(left(dir), ['kmv-stream-new', 'kmv-stream-old']);
});

test('folderSize: every file all the way down; 0 for a missing folder', async t => {
  const dir = tempDir('size', t);
  fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'one'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'a', 'b', 'two'), Buffer.alloc(32));
  assert.equal(await folderSize(dir), 42);
  assert.equal(await folderSize(path.join(dir, 'missing')), 0);
});
