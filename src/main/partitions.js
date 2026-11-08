// The storage on disk of each stream watched signed out: every channel's player gets its own (persist:kmv-stream-<channel>,
// page/platforms/platforms.js), in <userData>/Partitions/kmv-stream-<channel>. Left alone, each grows past a gigabyte
// (the site's files and its compiled scripts) and stays after you stop watching. So:
// - every saved storage's HTTP cache has a size (HTTP_CACHE_MAX, Chromium's disk-cache-size: main.js sets it),
// - a stream's storage that hasn't been used for UNUSED_DAYS goes (it only had that player's own cookies and
//   settings, and comes back the next time you watch the channel): prune() at start-up, before any view opens,
// - the compiled scripts ("Code Cache", which disk-cache-size doesn't limit) are cleared past CODE_CACHE_MAX, and a
//   cache far past its size (from before it had one) straight away,
// - all the streams' storage together stays under STREAMS_MAX: past it, the ones used longest ago go first.
// Each storage's size is measured in the background (measure()) and noted with the dates, so prune() at start-up can
// remove what's over without reading every file first. It also removes a Code Cache that was past its size: nothing
// has it open yet then, where clearing it while the app runs has been seen to leave it as it was.
// The logins' storage (kick, twitch, youtube) and the other pages' (kmv-web, kmv-mini) are never removed (their Code
// Cache is cleared like the others').
// Plain data and the file system, so it can be tested: main.js gives it the folder and keeps what it saves.
const fs = require('fs');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;
const UNUSED_DAYS = 30;
const HTTP_CACHE_MAX = 200 * 1024 * 1024;
const CODE_CACHE_MAX = 150 * 1024 * 1024;
const STREAMS_MAX = 3 * 1024 * 1024 * 1024;
const STREAM_DIR = /^kmv-stream-[\w-]{1,120}$/;
const TRASH = '.removed-';      // a storage being removed: renamed straight away, its files deleted after

// the folder of a partition ('persist:kmv-stream-alpha' -> 'kmv-stream-alpha'); null for one not saved on disk
const folderOf = partition => typeof partition === 'string' && partition.startsWith('persist:') ? partition.slice(8) : null;

// The size of a folder's files, all the way down (0 for one that isn't there).
async function folderSize(dir) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  let n = 0;
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += await folderSize(p);
    else if (e.isFile()) try { n += (await fs.promises.stat(p)).size; } catch {}
  }
  return n;
}

// What each storage's size was when last measured: all of it, its Code Cache and its HTTP Cache, in bytes
const SIZE_KEYS = ['all', 'code', 'http'];
const cleanSize = v => v && typeof v === 'object' && SIZE_KEYS.every(k => Number.isFinite(v[k]) && v[k] >= 0) ? { all: v.all, code: v.code, http: v.http } : null;
const SAFE_DIR = /^[\w-]{1,140}$/;

// dir: <userData>/Partitions. saved: what toSave() gave last time ({ used: { [folder]: when last used }, sizes: { [folder]:
// { all, code, http } } }, or only the dates, from before sizes were noted). now: the clock (for the tests).
function createPartitionCare({ dir, saved, now = () => Date.now() } = {}) {
  const used = {}, sizes = {};
  const savedUsed = saved && typeof saved === 'object' ? (saved.used && typeof saved.used === 'object' ? saved.used : saved.sizes ? {} : saved) : {};
  for (const [k, t] of Object.entries(savedUsed)) if (STREAM_DIR.test(k) && Number.isFinite(t)) used[k] = t;
  if (saved && saved.sizes && typeof saved.sizes === 'object') for (const [k, v] of Object.entries(saved.sizes)) if (SAFE_DIR.test(k) && cleanSize(v)) sizes[k] = cleanSize(v);
  let changed = false;
  const trash = (from, name, t) => { fs.renameSync(from, path.join(dir, `${TRASH}${name}-${t}`)); };
  const list = () => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; } };
  // when a storage was last used: as noted, or (for one from before the app noted it) when its cookies last changed
  const lastUsed = name => {
    if (used[name]) return used[name];
    for (const f of ['Cookies', '.']) try { return fs.statSync(path.join(dir, name, f)).mtimeMs; } catch {}
    return 0;
  };
  return {
    // A view opened with this partition (or still had it open as the app closed): a stream's storage is in use.
    use(partition) {
      const name = folderOf(partition);
      if (!name || !STREAM_DIR.test(name)) return false;
      used[name] = now(); changed = true;
      return true;
    },
    // Renamed out of the way (quick: nothing has them open yet), by the sizes measure() noted last time: streams' storage
    // unused for UNUSED_DAYS, any Code Cache past CODE_CACHE_MAX, then the streams used longest ago while all of theirs
    // together is past STREAMS_MAX. -> the streams' folders that went
    prune() {
      const gone = [], t = now();
      const drop = name => { try { trash(path.join(dir, name), name, t); gone.push(name); return true; } catch { return false; } };
      for (const name of list()) if (STREAM_DIR.test(name) && t - lastUsed(name) >= UNUSED_DAYS * DAY) drop(name);
      for (const name of list()) {
        const sz = sizes[name];
        if (name.startsWith(TRASH) || !sz || sz.code <= CODE_CACHE_MAX) continue;
        try { trash(path.join(dir, name, 'Code Cache'), name + '-code', t); sizes[name] = { ...sz, all: Math.max(0, sz.all - sz.code), code: 0 }; changed = true; } catch {}
      }
      const streams = list().filter(n => STREAM_DIR.test(n)).sort((a, b) => lastUsed(a) - lastUsed(b));
      let total = streams.reduce((n, name) => n + (sizes[name] ? sizes[name].all : 0), 0);
      for (const name of streams) {
        if (total <= STREAMS_MAX) break;
        if (drop(name)) total -= sizes[name] ? sizes[name].all : 0;
      }
      // what's no longer there needs no date or size
      const here = new Set(list());
      for (const name of Object.keys(used)) if (!here.has(name)) { delete used[name]; changed = true; }
      for (const name of Object.keys(sizes)) if (!here.has(name)) { delete sizes[name]; changed = true; }
      return gone;
    },
    // Every storage's size, noted for prune() (in the background: it reads every file)
    async measure() {
      const next = {};
      for (const name of list()) {
        if (name.startsWith(TRASH) || !SAFE_DIR.test(name)) continue;
        const d = path.join(dir, name);
        next[name] = { all: await folderSize(d), code: await folderSize(path.join(d, 'Code Cache')), http: await folderSize(path.join(d, 'Cache')) };
      }
      if (JSON.stringify(next) !== JSON.stringify(sizes)) {
        for (const k of Object.keys(sizes)) delete sizes[k];
        Object.assign(sizes, next); changed = true;
      }
    },
    // The files of the storage prune() removed (and of any a closed app didn't get to delete), in the background.
    async emptyTrash() {
      for (const name of list()) if (name.startsWith(TRASH)) await fs.promises.rm(path.join(dir, name), { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    },
    // The partitions whose `kind` ('code' or 'http') was over `max` when last measured, to clear: their Code Cache
    // (session.clearCodeCaches), and an HTTP Cache well over HTTP_CACHE_MAX (session.clearCache: Chromium only brings it
    // down to its size when a page next uses it)
    oversized(kind, max) {
      return Object.keys(sizes).filter(name => sizes[name][kind] > max).map(name => 'persist:' + name);
    },
    toSave: () => ({ used: { ...used }, sizes: JSON.parse(JSON.stringify(sizes)) }),
    // whether anything changed since the last call (so main.js only saves then)
    takeChanged() { const c = changed; changed = false; return c; }
  };
}

module.exports = { createPartitionCare, folderOf, folderSize, UNUSED_DAYS, HTTP_CACHE_MAX, CODE_CACHE_MAX, STREAMS_MAX, DAY };
