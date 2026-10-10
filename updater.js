// Updates from GitHub.
// Looks at the newest Release on the repository (or, if there are no releases, the version in
// package.json on the main branch). If it's newer than this copy, it downloads that version's
// files, backs up the current ones, and copies the new ones over this folder. Your settings,
// logins and saved channels live elsewhere (the app's data folder) and are never touched.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const API = process.env.SMV_UPDATE_API || 'https://api.github.com';
const RAW = process.env.SMV_UPDATE_RAW || 'https://raw.githubusercontent.com';
const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

// "2.10.1" vs "2.9" -> 1 / 0 / -1
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

const HDRS = { 'User-Agent': 'Stream-Multiview-Updater', Accept: 'application/vnd.github+json' };

// -> { version, zip, notes, name, source } or throws
async function latestInfo(repo, fetchFn) {
  if (!REPO_RE.test(repo || '')) throw new Error('repo');
  let r = await fetchFn(`${API}/repos/${repo}/releases/latest`, { headers: HDRS });
  if (r.ok) {
    const d = await r.json();
    if (d && d.tag_name && !d.draft) {
      return { version: String(d.tag_name).replace(/^v/i, ''), zip: d.zipball_url || `${API}/repos/${repo}/zipball/${encodeURIComponent(d.tag_name)}`,
        notes: String(d.body || '').slice(0, 4000), name: d.name || d.tag_name, source: 'release',
        page: d.html_url || `https://github.com/${repo}/releases/latest`,
        assets: (Array.isArray(d.assets) ? d.assets : []).map(x => ({ name: String(x.name || ''), url: String(x.browser_download_url || ''), size: +x.size || 0 })).filter(x => /^https:\/\//.test(x.url) || /^http:\/\/127\.0\.0\.1/.test(x.url)) };
    }
  } else if (r.status !== 404) throw new Error('http ' + r.status);
  // No releases: use the version in package.json on the default branch.
  r = await fetchFn(`${API}/repos/${repo}`, { headers: HDRS });
  if (!r.ok) throw new Error(r.status === 404 ? 'notfound' : 'http ' + r.status);
  const info = await r.json();
  const branch = info.default_branch || 'main';
  r = await fetchFn(`${RAW}/${repo}/${encodeURIComponent(branch)}/package.json`, { headers: { 'User-Agent': HDRS['User-Agent'] } });
  if (!r.ok) throw new Error('http ' + r.status);
  const pkg = JSON.parse(await r.text());
  return { version: String(pkg.version || '0'), zip: `${API}/repos/${repo}/zipball/${encodeURIComponent(branch)}`, notes: '', name: 'v' + pkg.version, source: 'branch',
    page: `https://github.com/${repo}/releases`, assets: [] };
}

// Minimal .zip reader (stored + deflate), enough for GitHub's source downloads.
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('zip');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.slice(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data || data.length !== usize) throw new Error('zip');
    out.push({ name, data });
  }
  return out;
}

// Files in the download -> { relativePath: Buffer }, without GitHub's "owner-repo-abc123/" top folder.
function appFiles(entries) {
  const tops = new Set(entries.map(e => e.name.split('/')[0]));
  const strip = tops.size === 1 && entries.every(e => e.name.includes('/'));
  const files = {};
  for (const e of entries) {
    const rel = strip ? e.name.slice(e.name.indexOf('/') + 1) : e.name;
    if (!rel || rel.split('/').some(s => s === '..' || s === '') || path.isAbsolute(rel)) continue;
    if (/^(node_modules|\.git|\.github)\//.test(rel)) continue;
    files[rel] = e.data;
  }
  if (!files['package.json']) {          // the app sits in a sub-folder of the repository
    const pk = Object.keys(files).filter(k => k.endsWith('/package.json')).sort((x, y) => x.split('/').length - y.split('/').length)[0];
    if (pk) {
      const pre = pk.slice(0, -'package.json'.length), sub = {};
      for (const [k, v] of Object.entries(files)) if (k.startsWith(pre)) sub[k.slice(pre.length)] = v;
      return sub;
    }
  }
  return files;
}

// Copy the new files over appDir (backing up the old ones first). Returns { version, needsInstall }.
function applyUpdate(appDir, files, backupDir) {
  if (!files['package.json']) throw new Error('nopkg');
  const pkg = JSON.parse(files['package.json'].toString('utf8'));
  const cur = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  if (pkg.name !== cur.name) throw new Error('wrongapp');
  if (!files['main.js'] || !files['index.html']) throw new Error('incomplete');
  const deps = p => JSON.stringify([p.dependencies || {}, p.devDependencies || {}]);
  const needsInstall = deps(pkg) !== deps(cur);
  fs.mkdirSync(backupDir, { recursive: true });
  const written = [];
  try {
    for (const [rel, data] of Object.entries(files)) {
      const dest = path.join(appDir, ...rel.split('/'));
      if (!dest.startsWith(path.resolve(appDir) + path.sep)) continue;
      if (fs.existsSync(dest)) {
        const bk = path.join(backupDir, ...rel.split('/'));
        fs.mkdirSync(path.dirname(bk), { recursive: true });
        fs.copyFileSync(dest, bk);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.smv-new', data);
      written.push(dest);
    }
  } catch (e) {
    for (const dest of written) { try { fs.unlinkSync(dest + '.smv-new'); } catch {} }
    throw e;
  }
  const swapped = [];
  try {
    for (const dest of written) { fs.renameSync(dest + '.smv-new', dest); swapped.push(dest); }   // swap them all in at the end
  } catch (e) {                       // put back what was already swapped, so the app isn't half-updated
    for (const dest of swapped) {
      const rel = path.relative(appDir, dest), bk = path.join(backupDir, rel);
      try { if (fs.existsSync(bk)) fs.copyFileSync(bk, dest); else fs.unlinkSync(dest); } catch {}
    }
    for (const dest of written) { try { fs.unlinkSync(dest + '.smv-new'); } catch {} }
    throw e;
  }
  if (needsInstall) fs.writeFileSync(path.join(appDir, '.needs-install'), 'The app engine changed in this update: the launcher reinstalls it.\n');
  return { version: String(pkg.version), needsInstall };
}

// Installed builds (.exe / .dmg) update by downloading the matching installer from the release.
function pickInstaller(assets, platform) {
  const list = Array.isArray(assets) ? assets : [];
  if (platform === 'win32') return list.find(a => /setup.*\.exe$/i.test(a.name)) || list.find(a => /\.exe$/i.test(a.name)) || null;
  if (platform === 'darwin') return list.find(a => /(mac|universal).*\.dmg$/i.test(a.name)) || list.find(a => /\.dmg$/i.test(a.name)) || null;
  return null;
}

module.exports = { pickInstaller, compareVersions, latestInfo, readZip, appFiles, applyUpdate, REPO_RE };
