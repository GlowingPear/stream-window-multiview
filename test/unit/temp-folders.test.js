// The tests and the developer tools leave nothing in the system's temp folder: thousands of runs each leaving a
// folder or two filled a developer's disk. A test makes its scratch folders with tempDir() from test/helpers.js,
// which removes them when the test (or the test file) ends; the few places that make one themselves remove it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FOLDERS = ['test', 'scripts', '.claude/skills'];
// Those that make their own, and what removes it
const ALLOWED = {
  'test/helpers.js': 'tempDir() itself',
  'scripts/dev.js': 'prepare()\'s cleanup(), when the app closes or the script exits',
  'scripts/visual-diff.js': 'removed at the end, unless it holds a report of differences',
  '.claude/skills/drive-app/drive.js': 'a video run folder, emptied and removed when the run closes'
};
// comments may mention it
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

function findTempFolders(file, text) {
  const code = strip(text), found = [];
  for (const m of code.matchAll(/\bmkdtemp(?:Sync)?\s*\(/g)) {
    const line = code.slice(0, m.index).split('\n').length;
    found.push(`${file}:${line}: ${m[0].replace(/\s*\($/, '')}(): use tempDir() from test/helpers.js, which removes the folder again`);
  }
  return found;
}

test('nothing in the tests or the developer tools makes a temp folder it doesn\'t remove', () => {
  const files = FOLDERS.flatMap(dir => fs.readdirSync(path.join(ROOT, dir), { recursive: true })
    .map(f => `${dir}/${f.split(path.sep).join('/')}`)
    .filter(f => /\.js$/.test(f) && !f.includes('/node_modules/')));
  assert.ok(files.includes('test/helpers.js') && files.includes('test/launch/app.js') && files.includes('scripts/dev.js'));
  for (const f of Object.keys(ALLOWED)) assert.ok(files.includes(f), `${f} (allowed) is still there`);
  const found = files.filter(f => !ALLOWED[f] && f !== 'test/unit/temp-folders.test.js')
    .flatMap(f => findTempFolders(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(found, [], 'temp folders made outside tempDir():\n' + found.join('\n'));
});

test('the check finds mkdtemp and mkdtempSync, and leaves comments alone', () => {
  const sample = [
    "const a = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));",
    "const b = await fs.promises.mkdtemp('y-');",
    '// fs.mkdtempSync() in a comment',
    '/* mkdtemp( */',
    'const tempDir = name => name;'
  ].join('\n');
  const found = findTempFolders('x.js', sample).map(l => l.replace(/:.*?: /, ': '));
  assert.deepEqual(found, [
    'x.js: mkdtempSync(): use tempDir() from test/helpers.js, which removes the folder again',
    'x.js: mkdtemp(): use tempDir() from test/helpers.js, which removes the folder again'
  ]);
});

test('tempDir() makes a fresh folder each time and removes it when the test ends', async t => {
  const { tempDir } = require('../helpers');
  let dir, other;
  await t.test('a test with a folder', st => {
    dir = tempDir('check', st); other = tempDir('check', st);
    assert.notEqual(dir, other);
    assert.match(path.basename(dir), /^smv-check-/);
    fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
    fs.mkdirSync(path.join(dir, 'sub'));
  });
  assert.equal(fs.existsSync(dir), false, 'removed, with what was in it');
  assert.equal(fs.existsSync(other), false);
});
