// Each stream's own storage in the real desktop app (src/main/partitions.js): one unused for a month is removed as the
// app starts, the logins' and recently used ones stay, the cache of the sites' files has a size, and the streams
// open as it closes are noted as used (partitions.json). A Code Cache noted past its size, and the streams used longest
// ago while all of theirs is past the total, go at start-up too, and while the app runs (not the ones it has opened).
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { SIGNED_OUT, launchApp, assert, openChannel, winSel } = require('../app');
const { tempDir } = require('../../helpers');

const T = { timeout: 90000 };
const DAY = 24 * 60 * 60 * 1000;
function storage(parts, name, daysAgo) {
  const d = path.join(parts, name);
  fs.mkdirSync(d, { recursive: true });
  const t = new Date(Date.now() - daysAgo * DAY);
  fs.writeFileSync(path.join(d, 'Cookies'), '');
  fs.utimesSync(path.join(d, 'Cookies'), t, t);
}

test('a stream\'s storage unused for a month goes at start-up; what\'s open as the app closes is noted as used', T, async () => {
  const data = tempDir('parts');
  const home = path.join(data, 'Stream Multiview'), parts = path.join(home, 'Partitions');
  storage(parts, 'kmv-stream-old', 40);
  storage(parts, 'kmv-stream-recent', 3);
  storage(parts, 'kick', 400);
  const a = await launchApp({ data, hidden: true, storage: SIGNED_OUT });
  try {
    const left = fs.readdirSync(parts);
    assert.ok(!left.includes('kmv-stream-old'), 'the unused one was removed');
    assert.ok(left.includes('kmv-stream-recent') && left.includes('kick'), 'the recent one and the login stay');
    assert.equal(await a.app.evaluate(({ app }) => app.commandLine.getSwitchValue('disk-cache-size')), String(200 * 1024 * 1024));
    await openChannel(a.win, 'alpha', 'stream');
    await a.win.waitForSelector(winSel('alpha') + ' webview');
  } finally { await a.close(); }
  const { used } = JSON.parse(fs.readFileSync(path.join(home, 'partitions.json'), 'utf8'));
  assert.ok(Date.now() - used['kmv-stream-alpha'] < 5 * 60 * 1000, 'the open stream was noted');
  assert.equal(used['kmv-stream-old'], undefined);
});

test('at start-up, a Code Cache noted past its size goes, and the oldest streams while all of theirs is past the total', T, async () => {
  const data = tempDir('partsizes');
  const home = path.join(data, 'Stream Multiview'), parts = path.join(home, 'Partitions');
  for (const name of ['kick', 'kmv-stream-older', 'kmv-stream-newer']) storage(parts, name, 1);
  fs.mkdirSync(path.join(parts, 'kick', 'Code Cache', 'wasm'), { recursive: true });
  const compiled = path.join(parts, 'kick', 'Code Cache', 'wasm', 'old_0');
  fs.writeFileSync(compiled, 'x');
  const GB = 1024 ** 3, size = (all, code = 0) => ({ all, code, http: all - code });
  fs.writeFileSync(path.join(home, 'partitions.json'), JSON.stringify({
    used: { 'kmv-stream-older': Date.now() - 2 * DAY, 'kmv-stream-newer': Date.now() - DAY },
    sizes: { kick: size(GB, GB / 2), 'kmv-stream-older': size(2 * GB), 'kmv-stream-newer': size(2 * GB) } }));
  const a = await launchApp({ data, hidden: true, storage: SIGNED_OUT });
  try {
    const left = fs.readdirSync(parts).filter(n => !n.startsWith('.removed-'));
    assert.ok(!left.includes('kmv-stream-older'), 'the stream used longest ago went');
    assert.ok(left.includes('kmv-stream-newer') && left.includes('kick'), 'the newer stream and the login stay');
    assert.ok(!fs.existsSync(compiled), 'the login\'s oversized Code Cache went (Chromium starts a new one)');
  } finally { await a.close(); }
});

test('while the app runs, the oldest streams past the total go, not one on screen', { timeout: 120000 }, async () => {
  const data = tempDir('partstrim');
  const home = path.join(data, 'Stream Multiview'), parts = path.join(home, 'Partitions');
  for (const name of ['kmv-stream-big', 'kmv-stream-small']) storage(parts, name, 1);
  // past the total without using the disk: a file with nothing written in it (sparse) still has its size
  fs.mkdirSync(path.join(parts, 'kmv-stream-big', 'Cache'), { recursive: true });
  const fd = fs.openSync(path.join(parts, 'kmv-stream-big', 'Cache', 'data_1'), 'w');
  try { fs.ftruncateSync(fd, 3.5 * 1024 ** 3); } finally { fs.closeSync(fd); }
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'partitions.json'), JSON.stringify({
    used: { 'kmv-stream-big': Date.now() - 2 * DAY, 'kmv-stream-small': Date.now() - DAY } }));
  const a = await launchApp({ data, hidden: true, storage: SIGNED_OUT });
  try {
    assert.ok(fs.existsSync(path.join(parts, 'kmv-stream-big')), 'no sizes noted yet: it stays at start-up');
    await openChannel(a.win, 'alpha', 'stream');
    await a.win.waitForSelector(winSel('alpha') + ' webview');
    // the first tidy, 30 s after start: it measures, then trims
    const until = Date.now() + 60000;
    while (fs.existsSync(path.join(parts, 'kmv-stream-big')) && Date.now() < until) await new Promise(r => setTimeout(r, 500));
    const left = fs.readdirSync(parts).filter(n => !n.startsWith('.removed-'));
    assert.ok(!left.includes('kmv-stream-big'), 'the oldest, past the total, went');
    assert.ok(left.includes('kmv-stream-small') && left.includes('kmv-stream-alpha'), 'the rest fits: the newer one and the one on screen stay');
  } finally { await a.close(); }
});
