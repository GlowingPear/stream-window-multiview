// Shared helpers for the developer scripts (dev.js, worktree.js). Works on Windows, Mac and Linux.
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WIN = process.platform === 'win32';

// Runs a command and stops with its exit code if it fails. npm is a .cmd file on Windows,
// which Node only starts through the shell.
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: WIN && cmd === 'npm', ...opts });
  if (r.status !== 0) {
    console.error(`\n"${cmd} ${args.join(' ')}" failed${r.error ? ': ' + r.error.message : ''}.`);
    process.exit(r.status || 1);
  }
  return r;
}

// Output of a git command in a folder, or '' if it fails.
function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

// The app engine (Electron) isn't downloaded by npm install (from Electron 42 on it fetches itself the first
// time it starts): download it here if it's missing, so the app starts straight away.
function ensureElectron(dir) {
  const has = () => spawnSync(process.execPath, ['-e', 'require("electron")'], { cwd: dir, stdio: 'ignore' }).status === 0;
  if (has()) return;
  const install = path.join(dir, 'node_modules', 'electron', 'install.js');
  if (!fs.existsSync(install)) {
    console.error('The app engine is not installed. Run "npm install" first.');
    process.exit(1);
  }
  console.log('Downloading the app engine (Electron)…');
  run(process.execPath, [install], { cwd: dir });
  if (!has()) { console.error('The app engine still could not be loaded. Delete node_modules/electron and run "npm install" again.'); process.exit(1); }
}

// A free port on this computer.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// Where each system keeps app data (the same folders Electron uses).
function appDataDir() {
  if (WIN) return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

// "feature/Kick import!" -> "feature-kick-import": safe in folder names on every system.
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');

module.exports = { WIN, run, git, ensureElectron, freePort, appDataDir, slug };
