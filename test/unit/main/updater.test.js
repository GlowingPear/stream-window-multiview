// Updates: version checks, picking the installer, reading GitHub downloads, replacing files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile, execFileSync, spawn, spawnSync } = require('child_process');
const { compareVersions, pickInstaller, pickMacZip, macAppBundle, designatedReq, macSwapBlocker, unpackMacApp, canWriteInside, macSwapScript,
  latestInfo, readZip, appFiles, applyUpdate, REPO_RE } = require('../../../src/main/updater');

/* ---------- version numbers ---------- */
test('compareVersions orders beta versions correctly', () => {
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1);     // 10 is newer than 9, not "1" < "9"
  assert.equal(compareVersions('0.2.9', '0.2.10'), -1);
  assert.equal(compareVersions('0.3.0', '0.2.99'), 1);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
});
test('compareVersions ignores a leading v and missing zeros', () => {
  assert.equal(compareVersions('v0.2.10', '0.2.10'), 0);
  assert.equal(compareVersions('0.2', '0.2.0'), 0);
  assert.equal(compareVersions('V1.0', '1.0.0'), 0);
});

/* ---------- which installer to download ---------- */
const ASSETS = [
  { name: 'Stream-Multiview-Setup-0.2.10.exe.blockmap', url: 'https://x/1' },
  { name: 'Stream-Multiview-Setup-0.2.10.exe', url: 'https://x/2' },
  { name: 'Stream-Multiview-0.2.10-mac.dmg', url: 'https://x/3' }
];
test('pickInstaller picks the Windows setup and the Mac disk image', () => {
  assert.equal(pickInstaller(ASSETS, 'win32').name, 'Stream-Multiview-Setup-0.2.10.exe');
  assert.equal(pickInstaller(ASSETS, 'darwin').name, 'Stream-Multiview-0.2.10-mac.dmg');
});
test('pickInstaller returns nothing when there is no matching installer', () => {
  assert.equal(pickInstaller(ASSETS, 'linux'), null);
  assert.equal(pickInstaller([], 'win32'), null);
  assert.equal(pickInstaller(undefined, 'darwin'), null);
  assert.equal(pickInstaller([{ name: 'notes.txt', url: 'https://x' }], 'win32'), null);
});

/* ---------- Mac: the app replacing itself ---------- */
test('pickMacZip picks the Mac app zip, not the source code or other zips', () => {
  const assets = [...ASSETS, { name: 'Stream-Multiview-0.2.10-mac.zip', url: 'https://x/4' }, { name: 'extras.zip', url: 'https://x/5' }];
  assert.equal(pickMacZip(assets).name, 'Stream-Multiview-0.2.10-mac.zip');
  assert.equal(pickMacZip(ASSETS), null);          // older releases only have the disk image
  assert.equal(pickMacZip(undefined), null);
  assert.equal(pickMacZip([{ name: 'extras.zip', url: 'https://x' }]), null);
});
test('macAppBundle finds the .app the app runs from', () => {
  assert.equal(macAppBundle('/Applications/Stream Multiview.app/Contents/MacOS/Stream Multiview'), '/Applications/Stream Multiview.app');
  assert.equal(macAppBundle('/Users/a/Apps/Stream Multiview.app/Contents/MacOS/Stream Multiview'), '/Users/a/Apps/Stream Multiview.app');
  assert.equal(macAppBundle('/usr/local/bin/electron'), '');
  assert.equal(macAppBundle(undefined), '');
});
test('designatedReq reads the requirement out of codesign\'s output', () => {
  const out = 'Executable=/Applications/Stream Multiview.app/Contents/MacOS/Stream Multiview\n'
    + 'designated => identifier "com.glowingpear.streammultiview" and certificate root = H"abc123"\n';
  assert.equal(designatedReq(out), 'identifier "com.glowingpear.streammultiview" and certificate root = H"abc123"');
  assert.equal(designatedReq('code object is not signed at all'), '');
  assert.equal(designatedReq(''), '');
});
test('macSwapBlocker only allows a signed app in a folder it can write to', () => {
  const ok = { app: '/Applications/Stream Multiview.app', writable: true, req: 'identifier "x" and certificate root = H"1"' };
  assert.equal(macSwapBlocker(ok), '');
  assert.equal(macSwapBlocker({ ...ok, app: '' }), 'nobundle');
  assert.equal(macSwapBlocker({ ...ok, app: '/Volumes/Stream Multiview 0.2.20/Stream Multiview.app' }), 'volume');
  assert.equal(macSwapBlocker({ ...ok, app: '/private/var/folders/x/T/AppTranslocation/1234/d/Stream Multiview.app' }), 'translocated');
  assert.equal(macSwapBlocker({ ...ok, writable: false }), 'nowrite');
  assert.equal(macSwapBlocker({ ...ok, req: '' }), 'unsigned');
  assert.equal(macSwapBlocker({ ...ok, req: 'cdhash H"0123abcd"' }), 'adhoc');
});
const unix = process.platform !== 'win32';
test('canWriteInside says whether the app may change its own files, and leaves nothing behind', { skip: !unix || process.getuid?.() === 0 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-write-'));
  try {
    assert.equal(canWriteInside(dir), true);
    assert.deepEqual(fs.readdirSync(dir), []);
    fs.chmodSync(dir, 0o555);                              // refused, like macOS's App Management does
    assert.equal(canWriteInside(dir), false);
    assert.throws(() => canWriteInside(path.join(dir, 'missing')), /ENOENT/);   // anything else isn't a refusal
  } finally { fs.chmodSync(dir, 0o755); fs.rmSync(dir, { recursive: true, force: true }); }
});

// The swap script with a stand-in for `open`, on folders that look like apps.
function swapSetup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-swap-'));
  const app = path.join(dir, 'Applications', 'Stream Multiview.app'), stage = path.join(dir, 'stage', 'Stream Multiview.app');
  for (const [d, v] of [[app, 'old'], [stage, 'new']]) { fs.mkdirSync(path.join(d, 'Contents'), { recursive: true }); fs.writeFileSync(path.join(d, 'Contents', 'v'), v); }
  const script = path.join(dir, 'swap.sh'), opener = path.join(dir, 'open.sh'), opened = path.join(dir, 'opened');
  fs.writeFileSync(script, macSwapScript());
  fs.writeFileSync(opener, `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\n`); fs.chmodSync(opener, 0o755);
  return { dir, app, stage, script, opener, opened };
}
const runSwap = (t, pid, newApp = t.stage) => execFileSync('/bin/sh', [t.script, String(pid), t.app, newApp, t.opener]);
test('the swap script waits for the app to close, swaps in the new app and opens it', { skip: !unix }, async () => {
  const t = swapSetup();
  try {
    const app = spawn('sleep', ['0.6']);                   // stands in for the app, still closing
    const started = Date.now();
    await new Promise((res, rej) => { const p = spawn('/bin/sh', [t.script, String(app.pid), t.app, t.stage, t.opener]); p.on('exit', c => c ? rej(new Error('exit ' + c)) : res()); });
    assert.ok(Date.now() - started >= 400, 'it waited for the app to close');
    assert.equal(fs.readFileSync(path.join(t.app, 'Contents', 'v'), 'utf8'), 'new');
    assert.equal(fs.existsSync(t.stage), false);
    assert.deepEqual(fs.readdirSync(path.dirname(t.app)), ['Stream Multiview.app']);   // the old copy is gone
    assert.equal(fs.readFileSync(t.opened, 'utf8'), t.app);
  } finally { fs.rmSync(t.dir, { recursive: true, force: true }); }
});
test('if the new app can\'t be moved in, the swap script puts the old one back and opens it', { skip: !unix }, () => {
  const t = swapSetup();
  try {
    runSwap(t, 2 ** 22 + 12345, path.join(t.dir, 'missing.app'));   // a process that doesn't exist: already closed
    assert.equal(fs.readFileSync(path.join(t.app, 'Contents', 'v'), 'utf8'), 'old');
    assert.deepEqual(fs.readdirSync(path.dirname(t.app)), ['Stream Multiview.app']);
    assert.equal(fs.readFileSync(t.opened, 'utf8'), t.app);
  } finally { fs.rmSync(t.dir, { recursive: true, force: true }); }
});

// Real ditto and codesign: an app signed (ad hoc) like a release is unpacked; a changed copy is refused.
const mac = process.platform === 'darwin';
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, (e, o, er) => e ? rej(e) : res(`${o}\n${er}`)));
function signedApp(dir) {
  const app = path.join(dir, 'build', 'Test.app'), exe = path.join(app, 'Contents', 'MacOS', 'Test');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Test</string><key>CFBundleIdentifier</key><string>test.smv.swap</string></dict></plist>`);
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n'); fs.chmodSync(exe, 0o755);
  execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'ignore' });
  const r = spawnSync('codesign', ['-d', '-r-', app], { encoding: 'utf8' });
  return { app, exe, req: designatedReq(`${r.stdout}\n${r.stderr}`) };
}
test('unpackMacApp unpacks the app and accepts it when the signature matches', { skip: !mac }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-unpack-'));
  try {
    const { app, req } = signedApp(dir);
    assert.match(req, /cdhash/);
    const zip = path.join(dir, 'Test-mac.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', app, zip]);
    const got = await unpackMacApp(zip, path.join(dir, 'out'), req, run);
    assert.equal(got, path.join(dir, 'out', 'Test.app'));
    assert.ok(fs.existsSync(path.join(got, 'Contents', 'MacOS', 'Test')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('unpackMacApp refuses an app that was changed, or signed by someone else', { skip: !mac }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-unpack-'));
  try {
    const { app, exe, req } = signedApp(dir);
    fs.appendFileSync(exe, 'echo changed\n');                      // changed after signing: the signature is broken
    const broken = path.join(dir, 'broken-mac.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', app, broken]);
    await assert.rejects(unpackMacApp(broken, path.join(dir, 'out1'), req, run));
    execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'ignore' });   // a valid signature, but not this app's
    execFileSync('codesign', ['--verify', '--deep', '--strict', app]);             // (valid on its own)
    const zip = path.join(dir, 'Test-mac.zip');
    execFileSync('ditto', ['-c', '-k', '--keepParent', app, zip]);
    await assert.rejects(unpackMacApp(zip, path.join(dir, 'out'), req, run));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('unpackMacApp checks the new app against this app\'s signature requirement (any system, stand-in tools)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-unpack-'));
  try {
    const out = path.join(dir, 'out'), calls = [];
    const fake = async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd === 'ditto') fs.mkdirSync(path.join(out, 'Stream Multiview.app', 'Contents'), { recursive: true });
      if (cmd === 'codesign' && !args.includes('-R=identifier "x"')) throw new Error('code failed to satisfy specified code requirement(s)');
      return '';
    };
    const app = path.join(out, 'Stream Multiview.app');
    assert.equal(await unpackMacApp('u.zip', out, 'identifier "x"', fake), app);
    assert.deepEqual(calls, [['ditto', '-x', '-k', 'u.zip', out], ['codesign', '--verify', '--deep', '--strict', '-R=identifier "x"', app]]);
    fs.rmSync(out, { recursive: true, force: true });
    await assert.rejects(unpackMacApp('u.zip', out, 'identifier "someone else"', fake), /requirement/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('unpackMacApp refuses a download without an app in it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-unpack-'));
  try {
    const out = path.join(dir, 'out');
    const fake = async cmd => { if (cmd === 'ditto') { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'readme.txt'), 'x'); } return ''; };
    await assert.rejects(unpackMacApp('x.zip', out, 'req', fake), /no app/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ---------- asking GitHub for the newest version ---------- */
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
function fakeFetch(routes) {
  const seen = [];
  const fn = async url => {
    seen.push(url);
    for (const [part, res] of routes) if (url.includes(part)) return typeof res === 'function' ? res() : res;
    return reply(404, {});
  };
  fn.seen = seen;
  return fn;
}

test('latestInfo reads the newest release and its installers', async () => {
  const f = fakeFetch([['/releases/latest', reply(200, {
    tag_name: 'v0.2.11', name: 'v0.2.11', body: '- New thing', html_url: 'https://github.com/o/r/releases/tag/v0.2.11',
    zipball_url: 'https://api.github.com/repos/o/r/zipball/v0.2.11',
    assets: [
      { name: 'Stream-Multiview-Setup-0.2.11.exe', browser_download_url: 'https://github.com/o/r/a.exe', size: 5 },
      { name: 'sneaky.exe', browser_download_url: 'file:///C:/evil.exe', size: 1 }
    ]
  })]]);
  const info = await latestInfo('o/r', f);
  assert.equal(info.version, '0.2.11');
  assert.equal(info.source, 'release');
  assert.equal(info.notes, '- New thing');
  assert.equal(info.page, 'https://github.com/o/r/releases/tag/v0.2.11');
  assert.deepEqual(info.assets.map(a => a.name), ['Stream-Multiview-Setup-0.2.11.exe'], 'only https downloads are kept');
});

test('latestInfo also gets the release notes as GitHub renders them (HTML)', async () => {
  let accept = '';
  const f = async (url, opt) => {
    if (url.includes('/releases/latest')) {
      accept = opt.headers.Accept;
      return reply(200, { tag_name: 'v0.2.12', body: '## What\'s Changed\n* Fix by @x in https://github.com/o/r/pull/10', body_html: '<h2>What\'s Changed</h2><ul><li>Fix by <a href="https://github.com/x">@x</a></li></ul>' });
    }
    return reply(404, {});
  };
  const info = await latestInfo('o/r', f);
  assert.equal(accept, 'application/vnd.github.full+json', 'asks for the notes as text and HTML');
  assert.match(info.notes, /^## What's Changed/);
  assert.match(info.notesHtml, /^<h2>What's Changed<\/h2>/);
});

test('latestInfo falls back to package.json on the main branch when there are no releases', async () => {
  const f = fakeFetch([
    ['/releases/latest', reply(404, {})],
    ['raw.githubusercontent.com/o/r/main/package.json', reply(200, { name: 'stream-multiview', version: '0.2.12' })],
    ['/repos/o/r', reply(200, { default_branch: 'main' })]
  ]);
  const info = await latestInfo('o/r', f);
  assert.equal(info.version, '0.2.12');
  assert.equal(info.source, 'branch');
  assert.deepEqual(info.assets, []);
  assert.equal(info.notesHtml, '', 'no notes without a release');
});

test('latestInfo reports a missing repository and rejects bad names', async () => {
  await assert.rejects(latestInfo('o/missing', fakeFetch([])), /notfound/);
  await assert.rejects(latestInfo('not a repo', fakeFetch([])), /repo/);
  await assert.rejects(latestInfo('../../etc', fakeFetch([])), /repo/);
  await assert.rejects(latestInfo('o/r', fakeFetch([['/releases/latest', reply(500, {})]])), /http 500/);
  assert.ok(REPO_RE.test('GlowingPear/stream-window-multiview'));
});

/* ---------- reading the downloaded zip ---------- */
// Builds a small .zip like GitHub's source downloads (some files stored, some compressed).
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content, deflate] of entries) {
    const nameBuf = Buffer.from(name), data = Buffer.from(content ?? '');
    const isDir = name.endsWith('/');
    const body = isDir ? Buffer.alloc(0) : deflate ? zlib.deflateRawSync(data) : data;
    const method = !isDir && deflate ? 8 : 0;
    const crc = zlib.crc32 ? zlib.crc32(data) : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(isDir ? 0 : data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(isDir ? 0 : data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, body);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('readZip reads stored and compressed files and skips folders', () => {
  const big = 'x'.repeat(5000);
  const entries = readZip(makeZip([
    ['top/', null],
    ['top/main.js', 'console.log(1)'],
    ['top/index.html', big, true]
  ]));
  assert.deepEqual(entries.map(e => e.name), ['top/main.js', 'top/index.html']);
  assert.equal(entries[1].data.toString(), big);
});

test('readZip refuses something that is not a zip', () => {
  assert.throws(() => readZip(Buffer.from('this is not a zip file at all, just some text')), /zip/);
});

test('appFiles strips GitHub\'s top folder and leaves out repo-only folders and unsafe paths', () => {
  const files = appFiles(readZip(makeZip([
    ['GlowingPear-stream-window-multiview-abc123/package.json', '{}'],
    ['GlowingPear-stream-window-multiview-abc123/main.js', 'm'],
    ['GlowingPear-stream-window-multiview-abc123/scripts/x.js', 's'],
    ['GlowingPear-stream-window-multiview-abc123/.github/workflows/build.yml', 'w'],
    ['GlowingPear-stream-window-multiview-abc123/node_modules/electron/index.js', 'n'],
    ['GlowingPear-stream-window-multiview-abc123/../evil.js', 'e']
  ])));
  assert.deepEqual(Object.keys(files).sort(), ['main.js', 'package.json', 'scripts/x.js']);
});

test('appFiles finds the app when it sits in a sub-folder of the repository', () => {
  const files = appFiles(readZip(makeZip([
    ['o-r-1/README.md', 'r'],
    ['o-r-1/app/package.json', '{}'],
    ['o-r-1/app/main.js', 'm']
  ])));
  assert.deepEqual(Object.keys(files).sort(), ['main.js', 'package.json']);
});

/* ---------- replacing the app's files ---------- */
function appDir(pkg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-upd-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(dir, 'main.js'), 'old main');
  fs.writeFileSync(path.join(dir, 'index.html'), 'old page');
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'not in the update');
  return dir;
}
const PKG = { name: 'stream-multiview', version: '0.2.10', devDependencies: { electron: '^38.0.0' } };
const newFiles = (pkg, extra = {}) => ({
  'package.json': Buffer.from(JSON.stringify(pkg)),
  'main.js': Buffer.from('new main'),
  'index.html': Buffer.from('new page'),
  ...extra
});

test('applyUpdate replaces the files, keeps a backup and leaves other files alone', () => {
  const dir = appDir(PKG), bk = path.join(dir, '..', path.basename(dir) + '-bk');
  const res = applyUpdate(dir, newFiles({ ...PKG, version: '0.2.11' }, { 'scripts/new.js': Buffer.from('n') }), bk);
  assert.deepEqual(res, { version: '0.2.11', needsInstall: false });
  assert.equal(fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), 'new main');
  assert.equal(fs.readFileSync(path.join(dir, 'scripts', 'new.js'), 'utf8'), 'n');
  assert.equal(fs.readFileSync(path.join(bk, 'main.js'), 'utf8'), 'old main');
  assert.equal(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8'), 'not in the update');
  assert.equal(fs.existsSync(path.join(dir, '.needs-install')), false);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.smv-new')), [], 'no half-written files left');
});

test('applyUpdate flags a needed engine install when the dependencies change', () => {
  const dir = appDir(PKG);
  const res = applyUpdate(dir, newFiles({ ...PKG, version: '0.3.0', devDependencies: { electron: '^39.0.0' } }), dir + '-bk');
  assert.equal(res.needsInstall, true);
  assert.ok(fs.existsSync(path.join(dir, '.needs-install')));
});

test('applyUpdate refuses a download that is a different or incomplete app', () => {
  const dir = appDir(PKG);
  assert.throws(() => applyUpdate(dir, newFiles({ ...PKG, name: 'something-else' }), dir + '-bk'), /wrongapp/);
  const noMain = newFiles(PKG); delete noMain['main.js'];
  assert.throws(() => applyUpdate(dir, noMain, dir + '-bk'), /incomplete/);
  assert.throws(() => applyUpdate(dir, { 'main.js': Buffer.from('x') }, dir + '-bk'), /nopkg/);
  assert.equal(fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), 'old main', 'nothing was changed');
});

test('applyUpdate handles the app moving into src/, and tidies the old copies', () => {
  const dir = appDir(PKG), bk = dir + '-bk';            // an old copy: main.js and index.html in the top folder
  fs.writeFileSync(path.join(dir, 'live.js'), 'old live');
  const pkg = { ...PKG, version: '0.2.13', main: 'src/main.js' };
  const res = applyUpdate(dir, {
    'package.json': Buffer.from(JSON.stringify(pkg)),
    'src/main.js': Buffer.from('new main'), 'src/index.html': Buffer.from('new page'), 'src/live.js': Buffer.from('new live'),
    'CHANGELOG.md': Buffer.from('notes')
  }, bk);
  assert.equal(res.version, '0.2.13');
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'main.js'), 'utf8'), 'new main');
  for (const f of ['main.js', 'index.html', 'live.js']) {
    assert.equal(fs.existsSync(path.join(dir, f)), false, `old ${f} removed from the top folder`);
    assert.ok(fs.existsSync(path.join(bk, f)), `old ${f} kept in the backup`);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8'), 'not in the update', 'other files are left alone');
});

test('applyUpdate refuses an update whose start file is missing', () => {
  const dir = appDir(PKG);
  assert.throws(() => applyUpdate(dir, { 'package.json': Buffer.from(JSON.stringify({ ...PKG, main: 'src/main.js' })), 'main.js': Buffer.from('x'), 'index.html': Buffer.from('y') }, dir + '-bk'), /incomplete/);
});

/* ---------- removing files a new version no longer has ---------- */
const listOf = dir => JSON.parse(fs.readFileSync(path.join(dir, '.smv-files.json'), 'utf8')).sort();

test('applyUpdate removes files the last update installed that the new version dropped', () => {
  const dir = appDir(PKG), bk = dir + '-bk';
  fs.mkdirSync(path.join(dir, 'old'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'old', 'gone.js'), 'dropped');
  fs.writeFileSync(path.join(dir, 'dropped.txt'), 'dropped');
  fs.mkdirSync(path.join(dir, 'node_modules', 'electron'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'electron', 'index.js'), 'engine');
  fs.writeFileSync(path.join(dir, '.smv-files.json'), JSON.stringify(['package.json', 'main.js', 'index.html', 'old/gone.js', 'dropped.txt']));
  applyUpdate(dir, newFiles({ ...PKG, version: '0.2.11' }, { 'NEW.md': Buffer.from('n') }), bk);
  for (const f of ['old/gone.js', 'dropped.txt']) {
    assert.equal(fs.existsSync(path.join(dir, f)), false, `${f} removed`);
    assert.equal(fs.readFileSync(path.join(bk, f), 'utf8'), 'dropped', `${f} kept in the backup`);
  }
  assert.equal(fs.existsSync(path.join(dir, 'old')), false, 'its folder went too, once empty');
  assert.equal(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8'), 'not in the update', 'files the updater never installed stay');
  assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'electron', 'index.js')), 'the app engine stays');
  assert.deepEqual(listOf(dir), ['NEW.md', 'index.html', 'main.js', 'package.json'], 'the list now has this version\'s files');
});

test('without a list yet, only files the app is known to have dropped are tidied', () => {
  const dir = appDir(PKG), bk = dir + '-bk';
  for (const f of ['README.txt', 'CHANGELOG.txt', 'my-notes.txt']) fs.writeFileSync(path.join(dir, f), f);
  applyUpdate(dir, newFiles({ ...PKG, version: '0.2.15' }, { 'README.md': Buffer.from('r') }), bk);
  assert.equal(fs.existsSync(path.join(dir, 'README.txt')), false);
  assert.equal(fs.existsSync(path.join(dir, 'CHANGELOG.txt')), false);
  assert.ok(fs.existsSync(path.join(bk, 'README.txt')), 'kept in the backup');
  assert.ok(fs.existsSync(path.join(dir, 'my-notes.txt')), 'your own files stay');
  assert.ok(fs.existsSync(path.join(dir, 'keep.txt')));
  assert.deepEqual(listOf(dir), ['README.md', 'index.html', 'main.js', 'package.json']);
});

test('a damaged or tampered list cannot remove anything outside the app\'s own files', () => {
  const dir = appDir(PKG), bk = dir + '-bk';
  const outside = path.join(path.dirname(dir), path.basename(dir) + '-outside.txt');
  fs.writeFileSync(outside, 'not the app\'s');
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'x.js'), 'engine');
  fs.writeFileSync(path.join(dir, '.smv-files.json'), JSON.stringify(['../' + path.basename(outside), outside, 'node_modules/x.js', '', 42, 'keep.txt/..', null]));
  applyUpdate(dir, newFiles({ ...PKG, version: '0.2.11' }), bk);
  assert.ok(fs.existsSync(outside), 'a file outside the app folder stays');
  assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'x.js')), 'the app engine stays');
  assert.ok(fs.existsSync(path.join(dir, 'keep.txt')));
  fs.writeFileSync(path.join(dir, '.smv-files.json'), 'not json');
  applyUpdate(dir, newFiles({ ...PKG, version: '0.2.12' }), bk + '2');
  assert.ok(fs.existsSync(path.join(dir, 'keep.txt')), 'an unreadable list removes nothing but the known dropped files');
});
