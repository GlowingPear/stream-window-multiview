// The release scripts: prepare-release.js (version + changelog from the release notes)
// and release-notes.js (release description from the changelog).
// Each test runs the real script on a copy of the project in a temporary folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { tempDir } = require('../../helpers');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHANGELOG = `# What's new in Stream Multiview

Intro text.

## 0.2.10 (current)
- Installers.

## 0.2.9
- Hikari theme.
`;

function project({ changelog = CHANGELOG, version = '0.2.10' } = {}) {
  const dir = tempDir('rel');
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const f of ['prepare-release.js', 'release-notes.js']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'stream-multiview', version }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}
function prepare(dir, tag, notes) {
  const nf = path.join(dir, 'notes.md');
  fs.writeFileSync(nf, notes ?? '');
  return spawnSync(process.execPath, [path.join(dir, 'scripts', 'prepare-release.js'), tag, nf], { encoding: 'utf8' });
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

const GENERATED = `## What's Changed
* Use CHANGELOG.md instead of CHANGELOG.txt by @GlowingPear in https://github.com/GlowingPear/stream-window-multiview/pull/2
* Add a test suite by @Tron in https://github.com/GlowingPear/stream-window-multiview/pull/3
* Bump something by @dependabot[bot] in https://github.com/GlowingPear/stream-window-multiview/pull/4

## New Contributors
* @Tron made their first contribution in https://github.com/GlowingPear/stream-window-multiview/pull/3

**Full Changelog**: https://github.com/GlowingPear/stream-window-multiview/compare/v0.2.10...v0.2.11
`;

test('prepare-release sets the version in the lock file too, so npm ci still matches', () => {
  const dir = project();
  const lock = { name: 'stream-multiview', version: '0.2.10', lockfileVersion: 3, requires: true,
    packages: { '': { name: 'stream-multiview', version: '0.2.10', dependencies: { left: '^1.0.0' } }, 'node_modules/left': { version: '1.0.0' } } };
  fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  const r = prepare(dir, 'v0.2.11', GENERATED);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(read(dir, 'package-lock.json'));
  assert.equal(after.version, '0.2.11');
  assert.equal(after.packages[''].version, '0.2.11');
  assert.deepEqual(after.packages['node_modules/left'], { version: '1.0.0' }, 'the rest as it was');
  assert.ok(read(dir, 'package-lock.json').endsWith('}\n'));
  // a lock without a root entry: only its top-level version
  fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'stream-multiview', version: '0.2.11', lockfileVersion: 1 }) + '\n');
  assert.equal(prepare(dir, 'v0.2.12', '').status, 0);
  assert.equal(JSON.parse(read(dir, 'package-lock.json')).version, '0.2.12');
});

test('prepare-release turns GitHub\'s generated notes into a new changelog section', () => {
  const dir = project();
  const r = prepare(dir, 'v0.2.11', GENERATED);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(read(dir, 'package.json')).version, '0.2.11');
  const cl = read(dir, 'CHANGELOG.md');
  assert.ok(cl.includes(`## 0.2.11 (current)
- Use CHANGELOG.md instead of CHANGELOG.txt
- Add a test suite
- Bump something

## 0.2.10
- Installers.`), cl);
  assert.ok(!/made their first contribution|Full Changelog|@Tron|https:/.test(cl), 'links, names and extra sections are left out');
  assert.equal((cl.match(/\(current\)/g) || []).length, 1, 'only the new version is marked current');
  assert.ok(cl.indexOf('Intro text.') < cl.indexOf('## 0.2.11'), 'the intro stays at the top');
});

test('prepare-release keeps a section that was already written by hand', () => {
  const dir = project({ changelog: CHANGELOG.replace('## 0.2.10 (current)', '## 0.2.11\n- Written by hand.\n\n## 0.2.10 (current)') });
  const r = prepare(dir, 'v0.2.11', GENERATED);
  assert.equal(r.status, 0, r.stderr);
  const cl = read(dir, 'CHANGELOG.md');
  assert.ok(cl.includes('## 0.2.11 (current)\n- Written by hand.'), cl);
  assert.ok(!cl.includes('Add a test suite'));
  assert.ok(cl.includes('## 0.2.10\n'));
});

test('prepare-release handles plain notes and empty notes', () => {
  let dir = project();
  prepare(dir, 'v0.2.11', 'Fixed the chat zoom.\nFaster start.');
  assert.ok(read(dir, 'CHANGELOG.md').includes('## 0.2.11 (current)\n- Fixed the chat zoom.\n- Faster start.\n'));
  dir = project();
  prepare(dir, 'v0.2.11', '');
  assert.ok(read(dir, 'CHANGELOG.md').includes('## 0.2.11 (current)\n- Small fixes and improvements.\n'));
});

test('prepare-release keeps Windows line endings and the byte-order mark', () => {
  const dir = project({ changelog: '﻿' + CHANGELOG.replace(/\n/g, '\r\n') });
  prepare(dir, 'v0.2.11', GENERATED);
  const cl = read(dir, 'CHANGELOG.md');
  assert.ok(cl.startsWith('﻿'));
  assert.ok(!/[^\r]\n/.test(cl), 'every line ends in CRLF');
});

test('prepare-release refuses a tag that is not a version', () => {
  for (const tag of ['latest', 'v1.2', 'release-0.2.11', '']) {
    const dir = project();
    const r = prepare(dir, tag, GENERATED);
    assert.notEqual(r.status, 0, tag);
    assert.equal(JSON.parse(read(dir, 'package.json')).version, '0.2.10', 'nothing was changed');
    assert.equal(read(dir, 'CHANGELOG.md'), CHANGELOG);
  }
});

test('release-notes prints a version\'s changes and the installer names', () => {
  const dir = project();
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts', 'release-notes.js'), 'v0.2.9'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("### What's new in 0.2.9\n- Hikari theme."));
  assert.ok(r.stdout.includes('Stream-Multiview-Setup-0.2.9.exe'));
  assert.ok(r.stdout.includes('Stream-Multiview-0.2.9-mac.dmg'));
  assert.ok(!r.stdout.includes('Installers.'), 'other versions are left out');
});

test('release-notes still works for a version missing from the changelog', () => {
  const dir = project();
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts', 'release-notes.js'), '9.9.9'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('See CHANGELOG.md for details.'));
});

test('the real changelog has exactly one current version, matching package.json', () => {
  const cl = read(ROOT, 'CHANGELOG.md');
  const current = [...cl.matchAll(/^##\s+v?(\d+\.\d+\.\d+).*\(current\)\s*$/gm)].map(m => m[1]);
  assert.deepEqual(current, [JSON.parse(read(ROOT, 'package.json')).version]);
});
