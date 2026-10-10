// Runs the app from this folder as a separate developer copy. Works on Windows, Mac and Linux.
//   npm run dev                       a fresh data folder, deleted when the app closes
//   npm run dev -- --profile work     keeps its data (logins, saved channels) between runs
//   npm run dev -- --debug            also opens the debugging port for test scripts (a free port, printed)
//   npm run dev -- --debug 9333       ... on that port
// It never uses the data of an installed copy, so both run side by side. The window titles show
// the branch, so copies from different worktrees are easy to tell apart.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { git, ensureElectron, freePort, appDataDir } = require('./dev-tools');

const root = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { profile: '', debug: false, port: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') o.profile = argv[++i] || '';
    else if (a === '--debug') { o.debug = true; if (/^\d+$/.test(argv[i + 1] || '')) o.port = +argv[++i]; }
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`Unknown option "${a}". Use --profile <name> and/or --debug [port].`);
  }
  if (o.profile && !/^[\w-]{1,40}$/.test(o.profile)) throw new Error('A profile name can only use letters, numbers, - and _.');
  return o;
}

// The persistent profiles live with other apps' data, outside the project.
const profileDir = name => path.join(appDataDir(), 'Stream Multiview Dev', name);

// Everything needed to start a dev copy of the app in the folder `dir`. Also used by scripts that
// start the app themselves (e.g. Playwright's _electron.launch to record a video).
function prepare({ dir = root, profile = '' } = {}) {
  ensureElectron(dir);
  spawnSync(process.execPath, [path.join(dir, 'src', 'harden.js')], { stdio: 'inherit' });   // as npm start does
  const data = profile ? profileDir(profile) : fs.mkdtempSync(path.join(os.tmpdir(), 'stream-multiview-dev-'));
  fs.mkdirSync(data, { recursive: true });
  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'dev';
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_DEV_LABEL: branch };
  delete env.ELECTRON_RUN_AS_NODE;   // set by Electron-based editors and tools; the app can't start with it
  const cleanup = () => { if (!profile) { try { fs.rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} } };
  return { electron: require(path.join(dir, 'node_modules', 'electron')), dir, data, branch, env, cleanup };
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 7).join('\n')); return; }

  const p = prepare({ profile: o.profile });
  const port = o.debug ? (o.port || await freePort()) : 0;
  const args = [p.dir, ...(port ? [`--remote-debugging-port=${port}`] : [])];   // Chromium only listens on 127.0.0.1

  console.log(`Stream Multiview (dev) from ${p.branch}`);
  console.log(`  data:  ${p.data}${o.profile ? '' : ' (deleted when the app closes)'}`);
  if (port) console.log(`  debug: http://127.0.0.1:${port}`);

  const child = spawn(p.electron, args, { env: p.env, stdio: 'inherit' });
  const stop = () => { if (child.exitCode === null) child.kill(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', code => { p.cleanup(); process.exit(code ?? 0); });
}

if (require.main === module) main();
module.exports = { parseArgs, profileDir, prepare };
