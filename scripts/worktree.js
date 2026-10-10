// Starts a change in its own git worktree (a second checkout of this repository), ready to run.
// Works on Windows, Mac and Linux.
//   npm run worktree -- fix/kick-import                 new branch from the latest origin/main
//   npm run worktree -- fix/kick-import --base main     ... from another branch or commit
//   npm run worktree -- fix/kick-import --path ../dir   ... in a folder of your choice
// The worktree goes in .worktrees/<branch> inside the main checkout (git and the installers leave that
// folder out), then gets npm install and the app engine. Run "npm run dev" inside it. When the change is
// merged:   git worktree remove .worktrees/<branch>   and   git branch -d <branch>
const fs = require('fs');
const path = require('path');
const { run, git, ensureElectron, slug } = require('./dev-tools');

function parseArgs(argv) {
  const o = { branch: '', base: '', dir: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i] || '';
    else if (a === '--path') o.dir = argv[++i] || '';
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!a.startsWith('-') && !o.branch) o.branch = a;
    else throw new Error(`Unknown option "${a}".`);
  }
  if (!o.help && !o.branch) throw new Error('Give the new branch a name, e.g. npm run worktree -- fix/kick-import');
  return o;
}

// The main checkout, even when this runs inside another worktree.
function mainCheckout(dir) {
  const common = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return common ? path.dirname(common) : '';
}

const defaultDir = (main, branch) => path.join(main, '.worktrees', slug(branch));

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 10).join('\n')); return; }

  const here = path.join(__dirname, '..');
  const mainDir = mainCheckout(here);
  if (!mainDir) { console.error('This folder is not a git checkout.'); process.exit(1); }
  if (!git(here, ['check-ref-format', '--branch', o.branch])) { console.error(`"${o.branch}" can't be a branch name.`); process.exit(1); }
  const dir = path.resolve(o.dir || defaultDir(mainDir, o.branch));
  if (fs.existsSync(dir)) { console.error(`${dir} already exists.`); process.exit(1); }
  fs.mkdirSync(path.dirname(dir), { recursive: true });   // e.g. the .worktrees folder, the first time

  if (git(here, ['rev-parse', '--verify', '--quiet', `refs/heads/${o.branch}`])) {
    console.log(`Using the existing branch ${o.branch}.`);
    run('git', ['worktree', 'add', dir, o.branch], { cwd: here });
  } else {
    let base = o.base;
    if (!base) {
      const hasOrigin = !!git(here, ['remote', 'get-url', 'origin']);
      if (hasOrigin) run('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: here });
      base = hasOrigin ? 'origin/main' : 'main';
    }
    run('git', ['worktree', 'add', '--no-track', '-b', o.branch, dir, base], { cwd: here });
  }

  console.log('\nInstalling (npm keeps a cache, so this is quick after the first time)…');
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir });
  ensureElectron(dir);

  console.log(`\nReady: ${dir} (branch ${o.branch})`);
  console.log(`  cd "${dir}"`);
  console.log('  npm run dev');
}

if (require.main === module) main();
module.exports = { parseArgs, defaultDir };
