// What a release video covers: the pull requests merged since the last release (or between two tags), with
// their descriptions, and the CHANGELOG lines of any releases in that range.
//   node .claude/skills/release-video/changes.js              merged into origin/main since the newest tag
//   node .claude/skills/release-video/changes.js v0.2.16      since that tag
//   node .claude/skills/release-video/changes.js v0.2.16 v0.2.18
// Nothing merged since the newest tag: says so and shows the newest release's own changes instead.
// PR descriptions come from gh when it's installed and logged in; otherwise only the merge commits are listed.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const git = args => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }); return r.status ? '' : r.stdout.trim(); };
const tags = () => git(['tag', '--list', 'v*', '--sort=-v:refname']).split('\n').filter(Boolean);

function range(from, to) {
  git(['fetch', '-q', '--tags', 'origin']);
  const t = tags();
  if (!from) {
    from = t[0];
    if (!git(['log', '--oneline', `${from}..origin/main`])) {
      console.log(`Nothing merged since ${from}: showing ${from}'s own changes (${t[1]}..${from}).\n`);
      return { from: t[1], to: from };
    }
  }
  return { from, to: to || 'origin/main' };
}

// PR numbers merged in from..to (merge commits on main's first-parent line)
function prs(from, to) {
  return git(['log', '--merges', '--first-parent', '--format=%s', `${from}..${to}`]).split('\n')
    .map(s => /Merge pull request #(\d+)/.exec(s)).filter(Boolean).map(m => +m[1]).reverse();
}

function prInfo(n) {
  const r = spawnSync('gh', ['pr', 'view', String(n), '--json', 'number,title,body,mergedAt,files'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// CHANGELOG sections for released versions after `from` up to `to`
function changelog(from, to) {
  const v = s => (/^v?(\d+\.\d+\.\d+)$/.exec(s) || [])[1];
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
  const lo = v(from), hi = v(to);
  const text = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r/g, '');
  return text.split(/\n(?=## )/).filter(sec => {
    const m = /^## (\d+\.\d+\.\d+)/.exec(sec);
    return m && lo && cmp(m[1], lo) > 0 && (!hi || cmp(m[1], hi) <= 0);
  }).join('\n').trim();
}

if (require.main === module) {
  const { from, to } = range(process.argv[2], process.argv[3]);
  console.log(`# Changes ${from}..${to}\n`);
  if (to === 'origin/main') {   // not released yet: the version it will most likely ship as
    const [a, b, c] = from.replace(/^v/, '').split('.').map(Number);
    console.log(`Not released yet. Next version (if nothing bigger): ${a}.${b}.${c + 1}\n`);
  }
  const log = changelog(from, to);
  if (log) console.log(`## From CHANGELOG.md\n\n${log}\n`);
  const list = prs(from, to);
  if (!list.length) console.log('No pull requests merged in this range.');
  for (const n of list) {
    const p = prInfo(n);
    if (!p) { console.log(`## #${n}\n(gh not available: see the merge commit)\n${git(['log', '-1', '--format=%b', '--grep', `#${n} `, `${from}..${to}`])}\n`); continue; }
    const files = (p.files || []).map(f => f.path).filter(f => /^src\//.test(f));
    console.log(`## #${p.number} ${p.title}\nmerged ${p.mergedAt}; app files: ${files.join(', ') || 'none (tests, docs or tooling only)'}\n\n${(p.body || '').trim()}\n`);
  }
}

module.exports = { range, prs, changelog };
