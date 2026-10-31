// The storage on disk of each stream watched signed out: every channel's player gets its own (persist:kmv-stream-<channel>,
// page/platforms/platforms.js), in <userData>/Partitions/kmv-stream-<channel>. Left alone, each grows past a gigabyte
// (the site's files and its compiled scripts) and stays after you stop watching. So:
// - every saved storage's HTTP cache has a size (HTTP_CACHE_MAX, Chromium's disk-cache-size: main.js sets it),
// - a stream's storage that hasn't been used for UNUSED_DAYS goes (it only had that player's own cookies and
//   settings, and comes back the next time you watch the channel): prune() at start-up, before any view opens,
// - the compiled scripts ("Code Cache", which disk-cache-size doesn't limit) are cleared past CODE_CACHE_MAX, and a
//   cache far past its size (from before it had one) straight away.
// The logins' storage (kick, twitch, youtube) and the other pages' (kmv-web, kmv-mini) are never removed.
// Plain data and the file system, so it can be tested: main.js gives it the folder and keeps what it saves.
const fs = require('fs');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;
const UNUSED_DAYS = 30;
const HTTP_CACHE_MAX = 200 * 1024 * 1024;
const CODE_CACHE_MAX = 150 * 1024 * 1024;
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

// dir: <userData>/Partitions. saved: what toSave() gave last time ({ [folder]: when last used }). now: the clock (for the tests).
function createPartitionCare({ dir, saved, now = () => Date.now() } = {}) {
  const used = {};
  if (saved && typeof saved === 'object') for (const [k, t] of Object.entries(saved)) if (STREAM_DIR.test(k) && Number.isFinite(t)) used[k] = t;
  let changed = false;
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
    // Streams' storage unused for UNUSED_DAYS, renamed out of the way (quick: nothing has it open yet). -> their folders
    prune() {
      const gone = [], t = now();
      for (const name of list()) {
        if (!STREAM_DIR.test(name) || t - lastUsed(name) < UNUSED_DAYS * DAY) continue;
        try { fs.renameSync(path.join(dir, name), path.join(dir, `${TRASH}${name}-${t}`)); gone.push(name); } catch {}
      }
      // what's no longer there needs no date
      const here = new Set(list());
      for (const name of Object.keys(used)) if (!here.has(name)) { delete used[name]; changed = true; }
      return gone;
    },
    // The files of the storage prune() removed (and of any a closed app didn't get to delete), in the background.
    async emptyTrash() {
      for (const name of list()) if (name.startsWith(TRASH)) await fs.promises.rm(path.join(dir, name), { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    },
    // The partitions whose folder `sub` is over `max`, to clear: 'Code Cache' (session.clearCodeCaches), and 'Cache'
    // well over HTTP_CACHE_MAX (session.clearCache: Chromium only brings it down to its size when a page next uses it)
    async oversized(sub, max) {
      const big = [];
      for (const name of list()) if (!name.startsWith(TRASH) && await folderSize(path.join(dir, name, sub)) > max) big.push('persist:' + name);
      return big;
    },
    toSave: () => ({ ...used }),
    // whether anything changed since the last call (so main.js only saves then)
    takeChanged() { const c = changed; changed = false; return c; }
  };
}

module.exports = { createPartitionCare, folderOf, folderSize, UNUSED_DAYS, HTTP_CACHE_MAX, CODE_CACHE_MAX, DAY };
