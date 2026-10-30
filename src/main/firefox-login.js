// "Copy my YouTube login from Firefox".
// Google blocks signing in to YouTube inside apps like this one, and Chrome / Edge lock their logins
// to the browser (they can't be copied). Firefox keeps its logins in a cookies.sqlite file in your
// Firefox profile, so the app reads the YouTube login straight from there:
//   - only what signing in to YouTube needs (the database query asks for nothing else): youtube.com's cookies,
//     Google's sign-in page's (accounts.google.com) and the sign-in cookies YouTube checks on google.com.
//     Google's others (search, other Google sites) stay in Firefox. (YouTube signs you out without the google.com ones.)
//   - the database is read from a temporary copy (Firefox may have it open), deleted straight after,
//   - nothing is written to your Downloads or anywhere else, and no browser extension is needed.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOMAINS = ['youtube.com', 'google.com'];
// google.com's sign-in cookies (SID, its secure copies, and the ones that keep it fresh)
const GOOGLE_SIGNIN = /^(SID|HSID|SSID|APISID|SAPISID|SIDCC|__Secure-[13]P(SID|APISID|SIDTS|SIDCC))$/;
// Is this cookie one the YouTube login needs? youtube.com's all, accounts.google.com's all, google.com's sign-in ones.
function needed(c) {
  const d = String(c.domain).toLowerCase();
  if (/(^|\.)youtube\.com$/.test(d)) return true;
  if (d === 'accounts.google.com') return true;
  return d === '.google.com' && GOOGLE_SIGNIN.test(c.name);
}
const LOGIN_COOKIE = /^(SAPISID|__Secure-3PSID|LOGIN_INFO)$/;

// Folders that can hold Firefox's profiles.ini, for this computer.
function firefoxRoots(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    const roots = [];
    if (env.APPDATA) roots.push(path.join(env.APPDATA, 'Mozilla', 'Firefox'));
    // Firefox from the Microsoft Store keeps its profiles inside its app package
    const pk = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Packages');
    try { for (const d of fs.readdirSync(pk)) if (/^Mozilla\.Firefox/i.test(d)) roots.push(path.join(pk, d, 'LocalCache', 'Roaming', 'Mozilla', 'Firefox')); } catch {}
    return roots;
  }
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Firefox')];
  return [
    path.join(home, '.mozilla', 'firefox'),
    path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'mozilla', 'firefox'),
    path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
    path.join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')
  ];
}

// profiles.ini -> [{ dir, name, isDefault }]
function parseProfilesIni(text, root) {
  const sections = [];
  let cur = null;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const h = line.match(/^\[(.+)\]$/);
    if (h) { cur = { _name: h[1] }; sections.push(cur); continue; }
    const kv = line.match(/^([^=;#]+)=(.*)$/);
    if (kv && cur) cur[kv[1].trim()] = kv[2].trim();
  }
  const resolve = (p, rel) => (rel === '0' ? path.normalize(p) : path.join(root, ...p.split('/')));
  const installDefaults = new Set(sections.filter(s => /^Install/i.test(s._name) && s.Default).map(s => resolve(s.Default, '1')));
  return sections.filter(s => /^Profile/i.test(s._name) && s.Path).map(s => {
    const dir = resolve(s.Path, s.IsRelative);
    return { dir, name: s.Name || path.basename(dir), isDefault: installDefaults.has(dir) || (!installDefaults.size && s.Default === '1') };
  });
}

// Every Firefox profile on this computer that has a cookies database.
function findProfiles(roots = firefoxRoots()) {
  const out = [], seen = new Set();
  const add = p => {
    const key = path.resolve(p.dir).toLowerCase();
    if (seen.has(key) || !fs.existsSync(path.join(p.dir, 'cookies.sqlite'))) return;
    seen.add(key); out.push(p);
  };
  for (const root of roots) {
    let ini = null;
    try { ini = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf8'); } catch {}
    if (ini) parseProfilesIni(ini, root).forEach(add);
    // profiles that aren't listed (or no profiles.ini at all)
    for (const sub of ['Profiles', '']) {
      try { for (const d of fs.readdirSync(path.join(root, sub))) add({ dir: path.join(root, sub, d), name: d, isDefault: false }); } catch {}
    }
  }
  return out;
}

// Firefox's sameSite numbers -> the names Electron uses.
const SAMESITE = { 0: 'no_restriction', 1: 'lax', 2: 'strict' };

// The YouTube cookies in one profile, in the form the app stores them.
function readYouTubeCookies(profileDir, { now = Date.now() / 1000 } = {}) {
  const { DatabaseSync } = require('node:sqlite');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-ff-'));
  try {
    // Firefox may have the database open: read a copy (with its write-ahead log, which holds recent changes).
    for (const f of ['cookies.sqlite', 'cookies.sqlite-wal']) {
      const src = path.join(profileDir, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
    }
    const db = new DatabaseSync(path.join(tmp, 'cookies.sqlite'));
    let rows;
    try {
      const where = DOMAINS.map(() => '(host = ? OR host = ? OR host LIKE ?)').join(' OR ');
      const args = DOMAINS.flatMap(d => [d, '.' + d, '%.' + d]);
      // originAttributes = '' : your normal Firefox tabs (not containers, private windows or embedded frames)
      rows = db.prepare(`SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE originAttributes = '' AND (${where})`).all(...args);
    } finally { db.close(); }
    return rows.map(r => {
      let exp = Number(r.expiry) || 0;
      if (exp > 1e11) exp = exp / 1000;          // newer Firefox versions store milliseconds
      return {
        domain: String(r.host).toLowerCase(), hostOnly: !String(r.host).startsWith('.'), path: r.path || '/',
        name: String(r.name), value: String(r.value), secure: !!r.isSecure, httpOnly: !!r.isHttpOnly,
        expirationDate: exp > 0 ? Math.floor(exp) : undefined, sameSite: SAMESITE[r.sameSite] || 'unspecified'
      };
    }).filter(c => (!c.expirationDate || c.expirationDate > now) && needed(c));
  } finally {
    // (Windows can hold the copy for a moment after it's closed: try again, and never fail the sign-in over it)
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

// The YouTube login from the best Firefox profile:
// a profile signed in to YouTube, preferring Firefox's default one, then the most recently used.
// -> { cookies, profile } or { error: 'nofirefox' | 'nologin' | 'read' }
function youtubeLoginFromFirefox({ roots } = {}) {
  const profiles = findProfiles(roots);
  if (!profiles.length) return { error: 'nofirefox' };
  const found = [];
  let readErrors = 0;
  for (const p of profiles) {
    try {
      const cookies = readYouTubeCookies(p.dir);
      if (cookies.some(c => LOGIN_COOKIE.test(c.name))) {
        let used = 0; try { used = fs.statSync(path.join(p.dir, 'cookies.sqlite')).mtimeMs; } catch {}
        found.push({ p, cookies, used });
      }
    } catch { readErrors++; }
  }
  if (!found.length) return { error: readErrors === profiles.length ? 'read' : 'nologin' };
  found.sort((a, b) => (b.p.isDefault - a.p.isDefault) || (b.used - a.used));
  return { cookies: found[0].cookies, profile: found[0].p.name };
}

module.exports = { needed, firefoxRoots, parseProfilesIni, findProfiles, readYouTubeCookies, youtubeLoginFromFirefox, LOGIN_COOKIE };
