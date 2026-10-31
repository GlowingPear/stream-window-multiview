const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createPartitionCare, folderOf, folderSize, UNUSED_DAYS, CODE_CACHE_MAX, DAY } = require('../../../src/main/partitions');
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
  assert.deepEqual(care.toSave(), { 'kmv-stream-alpha': NOW + 5 });
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
  assert.deepEqual(care.toSave(), { 'kmv-stream-noted': NOW - DAY }, 'what\'s gone (and what wasn\'t a stream\'s) is forgotten');
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

test('oversized: every saved storage whose folder is over the size, not the ones being removed', async t => {
  const dir = tempDir('code', t);
  storage(dir, 'kick', { cache: 3000 });
  storage(dir, 'kmv-stream-big', { cache: 2000 });
  storage(dir, 'kmv-stream-small', { cache: 500 });
  storage(dir, '.removed-kmv-stream-x-1', { cache: 5000 });
  fs.mkdirSync(path.join(dir, 'kmv-stream-nocache'));
  const care = createPartitionCare({ dir, now: () => NOW });
  assert.deepEqual((await care.oversized('Code Cache', 1000)).sort(), ['persist:kick', 'persist:kmv-stream-big']);
  assert.deepEqual(await care.oversized('Code Cache', CODE_CACHE_MAX), []);
  assert.deepEqual(await care.oversized('Cache', 0), [], 'none has that folder');
});

test('folderSize: every file all the way down; 0 for a missing folder', async t => {
  const dir = tempDir('size', t);
  fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'one'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'a', 'b', 'two'), Buffer.alloc(32));
  assert.equal(await folderSize(dir), 42);
  assert.equal(await folderSize(path.join(dir, 'missing')), 0);
});
