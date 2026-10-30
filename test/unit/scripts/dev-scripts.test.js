// The developer scripts: npm run dev (scripts/dev.js) and npm run worktree (scripts/worktree.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dev = require('../../../scripts/dev');
const worktree = require('../../../scripts/worktree');
const { slug } = require('../../../scripts/dev-tools');
const { tempDir } = require('../../helpers');

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
  assert.ok(!dir.startsWith(path.join(__dirname, '..', '..', '..')));
});

// A checkout with a stand-in app engine and harden.js, so prepare() runs without the real Electron.
function fakeCheckout(t) {
  const dir = tempDir('dev', t);
  fs.mkdirSync(path.join(dir, 'node_modules', 'electron'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'electron', 'index.js'), "module.exports = 'electron-stand-in';\n");
  fs.mkdirSync(path.join(dir, 'src', 'main'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'main', 'harden.js'), '');
  return dir;
}

test('npm run dev without a profile: a fresh data folder, removed by cleanup()', t => {
  const p = dev.prepare({ dir: fakeCheckout(t) });
  t.after(() => { process.removeListener('exit', p.cleanup); p.cleanup(); });
  assert.match(path.basename(p.data), /^stream-multiview-dev-/);
  assert.equal(p.electron, 'electron-stand-in');
  assert.equal(p.env.SMV_DEV_DATA, p.data);
  assert.equal(p.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.ok(process.listeners('exit').includes(p.cleanup), 'also removed if the script ends first');
  fs.writeFileSync(path.join(p.data, 'saved.json'), '{}');
  p.cleanup();
  assert.equal(fs.existsSync(p.data), false);
});

test('npm run dev: the temporary data folder goes when the script ends before the app closes', t => {
  const r = spawnSync(process.execPath, ['-e', `
    const p = require(${JSON.stringify(path.join(__dirname, '..', '..', '..', 'scripts', 'dev'))}).prepare({ dir: ${JSON.stringify(fakeCheckout(t))} });
    require('fs').writeFileSync(require('path').join(p.data, 'saved.json'), '{}');
    console.log(p.data);
    process.exit(0);`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const data = r.stdout.trim().split('\n').pop();
  assert.match(path.basename(data), /^stream-multiview-dev-/);
  assert.equal(fs.existsSync(data), false);
});

test('npm run worktree options', () => {
  assert.deepEqual(worktree.parseArgs(['fix/x']), { branch: 'fix/x', base: '', dir: '', clean: false });
  assert.deepEqual(worktree.parseArgs(['fix/x', '--base', 'main', '--path', '../d']), { branch: 'fix/x', base: 'main', dir: '../d', clean: false });
  assert.deepEqual(worktree.parseArgs(['--clean']), { branch: '', base: '', dir: '', clean: true });
  assert.throws(() => worktree.parseArgs([]), /branch a name/);
  assert.throws(() => worktree.parseArgs(['--clean', 'fix/x']), /no other options/);
});

test('worktrees go in .worktrees inside the main checkout, named after the branch', () => {
  const main = path.join(path.sep, 'code', 'stream-window-multiview');
  assert.equal(worktree.defaultDir(main, 'fix/Kick import!'), path.join(main, '.worktrees', 'fix-kick-import'));
  assert.equal(slug('--feature/A..B--'), 'feature-a..b');
});

test('npm run worktree -- --clean reads the list of worktrees', () => {
  const list = 'worktree /code/app\nHEAD 1\nbranch refs/heads/main\n\nworktree /code/app/.worktrees/fix-x\nHEAD 2\nbranch refs/heads/fix/x\n\nworktree /code/app/.worktrees/old\nHEAD 3\ndetached\n';
  assert.deepEqual(worktree.parseWorktrees(list), [
    { dir: path.resolve('/code/app'), branch: 'main' },
    { dir: path.resolve('/code/app/.worktrees/fix-x'), branch: 'fix/x' },
    { dir: path.resolve('/code/app/.worktrees/old'), branch: '' }
  ]);
});
