// "Copy my YouTube login from Firefox": finding Firefox profiles and reading only the YouTube /
// Google login out of their cookie database. Uses fake Firefox folders made by the test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { firefoxRoots, parseProfilesIni, findProfiles, readYouTubeCookies, youtubeLoginFromFirefox } = require('../../../src/main/firefox-login');

const FUTURE = Math.floor(Date.now() / 1000) + 86400 * 365;
const PAST = Math.floor(Date.now() / 1000) - 86400;

// A Firefox profile folder with a cookies.sqlite like Firefox's (same table and columns).
function profile(root, dir, cookies) {
  const p = path.join(root, ...dir.split('/'));
  fs.mkdirSync(p, { recursive: true });
  const db = new DatabaseSync(path.join(p, 'cookies.sqlite'));
  db.exec(`CREATE TABLE moz_cookies (id INTEGER PRIMARY KEY, originAttributes TEXT NOT NULL DEFAULT '', name TEXT, value TEXT,
    host TEXT, path TEXT, expiry INTEGER, lastAccessed INTEGER, creationTime INTEGER, isSecure INTEGER, isHttpOnly INTEGER,
    inBrowserElement INTEGER DEFAULT 0, sameSite INTEGER DEFAULT 0, rawSameSite INTEGER DEFAULT 0, schemeMap INTEGER DEFAULT 0)`);
  const ins = db.prepare('INSERT INTO moz_cookies (originAttributes, name, value, host, path, expiry, isSecure, isHttpOnly, sameSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const c of cookies) ins.run(c.oa ?? '', c.name, c.value ?? 'v', c.host, c.path ?? '/', c.expiry ?? FUTURE, c.secure ?? 1, c.httpOnly ?? 0, c.sameSite ?? 0);
  db.close();
  return p;
}
const signedIn = [
  { host: '.youtube.com', name: 'LOGIN_INFO', value: 'login', httpOnly: 1, sameSite: 0 },
  { host: '.google.com', name: 'SAPISID', value: 'sapisid' },
  { host: '.google.com', name: '__Secure-3PSID', value: 'psid', httpOnly: 1 },
  { host: 'accounts.google.com', name: '__Host-GAPS', value: 'gaps', sameSite: 1 }
];
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'smv-fftest-'));

test('reads only the YouTube and Google login, nothing from other sites', () => {
  const root = tmpRoot();
  const dir = profile(root, 'Profiles/abc.default-release', [
    ...signedIn,
    { host: '.github.com', name: 'user_session', value: 'SECRET' },
    { host: 'mail.proton.me', name: 'AUTH', value: 'SECRET' },
    { host: '.notyoutube.com', name: 'SAPISID', value: 'SECRET' },          // looks similar, isn't YouTube
    { host: '.youtube.com.evil.example', name: 'SAPISID', value: 'SECRET' },
    { host: '.youtube.com', name: 'CONTAINER', value: 'SECRET', oa: '^userContextId=2' },   // a container tab
    { host: '.youtube.com', name: 'OLD', value: 'SECRET', expiry: PAST }
  ]);
  const got = readYouTubeCookies(dir);
  assert.deepEqual(got.map(c => c.name).sort(), ['LOGIN_INFO', 'SAPISID', '__Host-GAPS', '__Secure-3PSID']);
  assert.ok(!got.some(c => c.value === 'SECRET'));
  const host = got.find(c => c.name === '__Host-GAPS'), info = got.find(c => c.name === 'LOGIN_INFO');
  assert.equal(host.hostOnly, true); assert.equal(host.sameSite, 'lax');
  assert.equal(info.hostOnly, false); assert.equal(info.httpOnly, true); assert.equal(info.sameSite, 'no_restriction');
  assert.equal(info.expirationDate, FUTURE);
});

test('handles newer Firefox versions that store expiry in milliseconds', () => {
  const dir = profile(tmpRoot(), 'p', [{ host: '.youtube.com', name: 'LOGIN_INFO', expiry: FUTURE * 1000 }]);
  assert.equal(readYouTubeCookies(dir)[0].expirationDate, FUTURE);
});

test('leaves no copy of the database behind', () => {
  const dir = profile(tmpRoot(), 'p', signedIn);
  const before = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('smv-ff-')).length;
  readYouTubeCookies(dir);
  assert.equal(fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('smv-ff-')).length, before);
  assert.deepEqual(fs.readdirSync(dir), ['cookies.sqlite'], 'the Firefox profile is untouched');
});

test('profiles.ini: relative and absolute profiles, and the default from the Install section', () => {
  const root = path.join(os.tmpdir(), 'ffroot');
  const list = parseProfilesIni(`[Install308046B0AF4A39CB]
Default=Profiles/xyz.default-release
Locked=1

[Profile1]
Name=default
IsRelative=1
Path=Profiles/abc.default
Default=1

[Profile0]
Name=default-release
IsRelative=1
Path=Profiles/xyz.default-release

[Profile2]
Name=elsewhere
IsRelative=0
Path=${path.join(os.tmpdir(), 'other-profile')}

[General]
StartWithLastProfile=1
`, root);
  assert.deepEqual(list.map(p => [p.name, p.dir, p.isDefault]), [
    ['default', path.join(root, 'Profiles', 'abc.default'), false],
    ['default-release', path.join(root, 'Profiles', 'xyz.default-release'), true],
    ['elsewhere', path.join(os.tmpdir(), 'other-profile'), false]
  ]);
});

test('picks the profile that is signed in to YouTube, preferring Firefox\'s default one', () => {
  const root = tmpRoot();
  profile(root, 'Profiles/old.default', [{ host: '.youtube.com', name: 'PREF', value: 'x' }]);       // not signed in
  profile(root, 'Profiles/work.other', signedIn.map(c => ({ ...c, value: 'work' })));
  profile(root, 'Profiles/main.default-release', signedIn.map(c => ({ ...c, value: 'main' })));
  fs.writeFileSync(path.join(root, 'profiles.ini'), `[Install1]
Default=Profiles/main.default-release

[Profile0]
Name=default
IsRelative=1
Path=Profiles/old.default

[Profile1]
Name=work
IsRelative=1
Path=Profiles/work.other

[Profile2]
Name=default-release
IsRelative=1
Path=Profiles/main.default-release
`);
  assert.equal(findProfiles([root]).length, 3);
  const r = youtubeLoginFromFirefox({ roots: [root] });
  assert.equal(r.profile, 'default-release');
  assert.ok(r.cookies.every(c => c.value === 'main'));
});

test('finds profiles even without a profiles.ini', () => {
  const root = tmpRoot();
  profile(root, 'Profiles/only.default', signedIn);
  assert.equal(youtubeLoginFromFirefox({ roots: [root] }).profile, 'only.default');
});

test('says why when there is no Firefox, or Firefox is not signed in to YouTube', () => {
  assert.deepEqual(youtubeLoginFromFirefox({ roots: [path.join(tmpRoot(), 'none')] }), { error: 'nofirefox' });
  const root = tmpRoot();
  profile(root, 'Profiles/a.default', [{ host: '.youtube.com', name: 'PREF' }, { host: '.github.com', name: 'user_session' }]);
  assert.deepEqual(youtubeLoginFromFirefox({ roots: [root] }), { error: 'nologin' });
});

test('knows where Firefox keeps its profiles on Windows, Mac and Linux', () => {
  assert.deepEqual(firefoxRoots('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: path.join(tmpRoot(), 'none') }, 'C:\\Users\\me'),
    [path.join('C:\\Users\\me\\AppData\\Roaming', 'Mozilla', 'Firefox')]);
  assert.deepEqual(firefoxRoots('darwin', {}, '/Users/me'), [path.join('/Users/me', 'Library', 'Application Support', 'Firefox')]);
  assert.ok(firefoxRoots('linux', {}, '/home/me').includes(path.join('/home/me', '.mozilla', 'firefox')));
  assert.ok(firefoxRoots('linux', {}, '/home/me').includes(path.join('/home/me', 'snap', 'firefox', 'common', '.mozilla', 'firefox')));
});

test('works while Firefox is open (recent logins still in the write-ahead log)', () => {
  const dir = profile(tmpRoot(), 'p', []);
  const db = new DatabaseSync(path.join(dir, 'cookies.sqlite'));            // Firefox keeps the database open
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
  db.prepare("INSERT INTO moz_cookies (originAttributes, name, value, host, path, expiry, isSecure, isHttpOnly, sameSite) VALUES ('', 'LOGIN_INFO', 'fresh', '.youtube.com', '/', ?, 1, 1, 0)").run(FUTURE);
  try {
    assert.ok(fs.existsSync(path.join(dir, 'cookies.sqlite-wal')));
    assert.deepEqual(readYouTubeCookies(dir).map(c => c.value), ['fresh']);
  } finally { db.close(); }
});
