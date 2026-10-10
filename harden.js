// Turns on encryption for the logins this app saves (Electron's "cookie encryption" fuse).
// With it on, saved logins are encrypted with a key tied to your Windows account (macOS:
// Keychain), so a copy of the app's data folder is useless on another PC or another account.
// The launcher runs this every time before starting the app; it only changes one byte in the
// app engine (node_modules/electron) the first time, and does nothing after that.
//   node harden.js          turn it on (if needed)
//   node harden.js --check  only report
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const COOKIE_ENCRYPTION = 1;          // position of the fuse in the fuse wire (V1)
const ON = 0x31, OFF = 0x30, REMOVED = 0x72;

// Where the fuses live for an engine executable.
function fuseFileFor(exe) {
  const m = exe.match(/^(.*?\.app)(\/|$)/);
  if (process.platform === 'darwin' && m) {
    const fw = path.join(m[1], 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework');
    if (fs.existsSync(fw)) return { file: fw, app: m[1] };
  }
  return { file: exe, app: null };
}

// -> { state: 'on' | 'off' | 'removed' | 'unknown', positions: [byte offsets] }
function readFuse(file) {
  const buf = fs.readFileSync(file);
  const positions = [];
  let state = 'unknown';
  for (let i = buf.indexOf(SENTINEL); i >= 0; i = buf.indexOf(SENTINEL, i + 1)) {
    const ver = buf[i + SENTINEL.length], len = buf[i + SENTINEL.length + 1];
    if (!(ver === 1 || ver === 0x31) || len <= COOKIE_ENCRYPTION) continue;
    const at = i + SENTINEL.length + 2 + COOKIE_ENCRYPTION;
    positions.push(at);
    const b = buf[at];
    const s = b === ON ? 'on' : b === OFF ? 'off' : b === REMOVED ? 'removed' : 'unknown';
    state = state === 'unknown' || state === s ? s : 'mixed';
  }
  return { state, positions };
}

function harden(exe, { check = false } = {}) {
  const { file, app } = fuseFileFor(exe);
  const r = readFuse(file);
  if (check || r.state === 'on' || !r.positions.length || r.state === 'removed') return r.state;
  const fd = fs.openSync(file, 'r+');
  try { r.positions.forEach(p => fs.writeSync(fd, Buffer.from([ON]), 0, 1, p)); } finally { fs.closeSync(fd); }
  if (app) {   // macOS: changing the engine breaks its signature; re-sign it for this computer
    try { execFileSync('codesign', ['--sign', '-', '--force', '--deep', '--preserve-metadata=entitlements,requirements,flags,runtime', app], { stdio: 'ignore' }); } catch {}
  }
  return readFuse(file).state === 'on' ? 'turned-on' : 'failed';
}

module.exports = { harden, readFuse, fuseFileFor };

if (require.main === module) {
  let exe;
  try { exe = require('electron'); } catch { console.log('Login encryption: app engine not installed yet.'); process.exit(0); }
  try {
    const res = harden(exe, { check: process.argv.includes('--check') });
    const msg = { on: 'on', 'turned-on': 'turned on', off: 'off', removed: 'not available in this engine', unknown: 'not available in this engine', failed: 'could not be turned on' }[res] || res;
    console.log('Saved-login encryption: ' + msg);
  } catch (e) {
    // e.g. the app is already running and Windows has the engine file locked: try again next start
    console.log('Saved-login encryption: will be turned on next time the app starts (' + (e.code || e.message) + ')');
  }
}
