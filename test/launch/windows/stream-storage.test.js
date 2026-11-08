// Each stream's own storage in the real desktop app (src/main/partitions.js): one unused for a month is removed as the
// app starts, the logins' and recently used ones stay, the cache of the sites' files has a size, and the streams
// open as it closes are noted as used (partitions.json). A Code Cache noted past its size, and the streams used longest
// ago while all of theirs is past the total, go at start-up too.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, assert, openChannel, winSel } = require('../app');
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
  const a = await launchApp({ data, hidden: true });
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
  const a = await launchApp({ data, hidden: true });
  try {
    const left = fs.readdirSync(parts).filter(n => !n.startsWith('.removed-'));
    assert.ok(!left.includes('kmv-stream-older'), 'the stream used longest ago went');
    assert.ok(left.includes('kmv-stream-newer') && left.includes('kick'), 'the newer stream and the login stay');
    assert.ok(!fs.existsSync(compiled), 'the login\'s oversized Code Cache went (Chromium starts a new one)');
  } finally { await a.close(); }
});
