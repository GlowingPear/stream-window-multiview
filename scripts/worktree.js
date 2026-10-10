// Starts a change in its own git worktree (a second checkout of this repository), ready to run.
// Works on Windows, Mac and Linux.
//   npm run worktree -- fix/kick-import                 new branch from the latest origin/main
//   npm run worktree -- fix/kick-import --base main     ... from another branch or commit
//   npm run worktree -- fix/kick-import --path ../dir   ... in a folder of your choice
//   npm run worktree -- --clean                         removes worktrees whose pull request is merged
// The worktree goes in .worktrees/<branch> inside the main checkout (git and the installers leave that
// folder out), then gets npm install and the app engine. Run "npm run dev" inside it. --clean deletes a
// worktree and its branch once the branch is in origin/main (or gh shows its PR merged), unless it has
// uncommitted changes.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { run, git, ensureElectron, slug } = require('./dev-tools');

function parseArgs(argv) {
  const o = { branch: '', base: '', dir: '', clean: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i] || '';
    else if (a === '--path') o.dir = argv[++i] || '';
    else if (a === '--clean') o.clean = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!a.startsWith('-') && !o.branch) o.branch = a;
    else throw new Error(`Unknown option "${a}".`);
  }
  if (o.clean && (o.branch || o.base || o.dir)) throw new Error('--clean takes no other options.');
  if (!o.help && !o.clean && !o.branch) throw new Error('Give the new branch a name, e.g. npm run worktree -- fix/kick-import');
  return o;
}

// The main checkout, even when this runs inside another worktree.
function mainCheckout(dir) {
  const common = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return common ? path.dirname(common) : '';
}

const defaultDir = (main, branch) => path.join(main, '.worktrees', slug(branch));

// `git worktree list --porcelain` -> [{ dir, branch }] (branch is '' when detached).
function parseWorktrees(text) {
  return text.split(/\r?\n\r?\n/).map(block => {
    const dir = (block.match(/^worktree (.+)$/m) || [])[1];
    const branch = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1] || '';
    return dir && { dir: path.resolve(dir), branch };
  }).filter(Boolean);
}

// Merged when origin/main has the branch's commits through a merge (a branch that was just created
// from main is on main's own line of commits, so it doesn't count), or gh shows a merged PR for it
// (squash and rebase merges).
function isMerged(here, branch, base) {
  const tip = git(here, ['rev-parse', `refs/heads/${branch}`]);
  if (!tip) return false;
  const merged = spawnSync('git', ['merge-base', '--is-ancestor', tip, base], { cwd: here }).status === 0;
  if (merged && !git(here, ['rev-list', '--first-parent', base]).split('\n').includes(tip)) return true;
  const r = spawnSync('gh', ['pr', 'list', '--state', 'merged', '--head', branch, '--json', 'headRefOid', '--jq', '.[].headRefOid'], { cwd: here, encoding: 'utf8' });
  return r.status === 0 && r.stdout.split('\n').includes(tip);
}

function clean(here, mainDir) {
  const hasOrigin = !!git(here, ['remote', 'get-url', 'origin']);
  if (hasOrigin) git(here, ['fetch', '--quiet', 'origin', 'main']);
  const base = hasOrigin ? 'origin/main' : 'main';
  const self = path.resolve(here);
  let removed = 0;
  for (const wt of parseWorktrees(git(here, ['worktree', 'list', '--porcelain']))) {
    if (wt.dir === path.resolve(mainDir) || !wt.branch || !isMerged(here, wt.branch, base)) continue;
    if (wt.dir === self) { console.log(`Skipped ${wt.dir}: it's the one this runs in. Run --clean from another checkout.`); continue; }
    if (fs.existsSync(wt.dir) && git(wt.dir, ['status', '--porcelain'])) { console.log(`Skipped ${wt.dir}: it has uncommitted changes.`); continue; }
    if (fs.existsSync(wt.dir) && spawnSync('git', ['worktree', 'remove', wt.dir], { cwd: here, stdio: 'inherit' }).status !== 0) continue;
    git(here, ['branch', '-D', wt.branch]);
    console.log(`Removed ${wt.dir} and the branch ${wt.branch} (merged).`);
    removed++;
  }
  git(here, ['worktree', 'prune']);
  if (!removed) console.log('No merged worktrees to remove.');
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 12).join('\n')); return; }

  const here = path.join(__dirname, '..');
  const mainDir = mainCheckout(here);
  if (!mainDir) { console.error('This folder is not a git checkout.'); process.exit(1); }
  if (o.clean) return clean(here, mainDir);
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
module.exports = { parseArgs, defaultDir, parseWorktrees };
