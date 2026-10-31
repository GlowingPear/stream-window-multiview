// Each stream's own storage in the real desktop app (src/main/partitions.js): one unused for a month is removed as the
// app starts, the logins' and recently used ones stay, the cache of the sites' files has a size, and the streams
// open as it closes are noted as used (partitions.json).
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
  const used = JSON.parse(fs.readFileSync(path.join(home, 'partitions.json'), 'utf8'));
  assert.ok(Date.now() - used['kmv-stream-alpha'] < 5 * 60 * 1000, 'the open stream was noted');
  assert.equal(used['kmv-stream-old'], undefined);
});
