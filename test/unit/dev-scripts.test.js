// The developer scripts: npm run dev (scripts/dev.js) and npm run worktree (scripts/worktree.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const dev = require('../../scripts/dev');
const worktree = require('../../scripts/worktree');
const { slug } = require('../../scripts/dev-tools');

test('npm run dev options', () => {
  assert.deepEqual(dev.parseArgs([]), { profile: '', debug: false, port: 0 });
  assert.deepEqual(dev.parseArgs(['--profile', 'work', '--debug']), { profile: 'work', debug: true, port: 0 });
  assert.equal(dev.parseArgs(['--debug', '9333']).port, 9333);
  assert.throws(() => dev.parseArgs(['--profile', '../escape']), /profile name/);
  assert.throws(() => dev.parseArgs(['--nope']), /Unknown option/);
});

test('dev profiles are kept outside the project, one folder each', () => {
  const dir = dev.profileDir('work');
  assert.equal(path.basename(dir), 'work');
  assert.equal(path.basename(path.dirname(dir)), 'Stream Multiview Dev');
  assert.ok(!dir.startsWith(path.join(__dirname, '..', '..')));
});

test('npm run worktree options', () => {
  assert.deepEqual(worktree.parseArgs(['fix/x']), { branch: 'fix/x', base: '', dir: '' });
  assert.deepEqual(worktree.parseArgs(['fix/x', '--base', 'main', '--path', '../d']), { branch: 'fix/x', base: 'main', dir: '../d' });
  assert.throws(() => worktree.parseArgs([]), /branch a name/);
});

test('worktrees go next to the main checkout, named after the branch', () => {
  const main = path.join(path.sep, 'code', 'stream-window-multiview');
  assert.equal(worktree.defaultDir(main, 'fix/Kick import!'), path.join(path.sep, 'code', 'stream-window-multiview-fix-kick-import'));
  assert.equal(slug('--feature/A..B--'), 'feature-a..b');
});
