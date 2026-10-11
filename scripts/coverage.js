// Runs every test while recording which of the app's code they run, then reports what no test runs.
// Works on Windows, Mac and Linux.
//   npm run test:coverage                 unit, UI and launch tests, then the report
//   npm run test:coverage -- --report     only the report, from the last run (coverage/)
//   npm run test:coverage -- --update     also raise the minimums in test/coverage-min.json to today's numbers
// Recorded: the app's pages (src/*.html and the scripts they load) in the browser and in the desktop app,
// the desktop app's main process, and the code the unit tests load. The report (coverage/report.md, and the
// run's summary page on GitHub) lists each file's lines and functions run, and the bigger functions nothing
// runs. It fails when a test fails. A file below its minimum fails it in CI, where the minimums are measured
// (Linux, the Node version in .nvmrc); on your computer some code can't run (e.g. Windows-only parts, or Node 22+ parts on an older Node), so there it
// only warns.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'coverage');
const RAW = path.join(OUT, 'raw');
const MIN_FILE = path.join(ROOT, 'test', 'coverage-min.json');
const SUITES = [
  ['Unit', 'test/unit/*.test.js', 60000],
  ['UI', 'test/ui/*.test.js', 120000],
  ['Launch', 'test/launch/*.test.js', 120000]
];
// Not in the report: the preload scripts run inside each window's sandbox, where their code can't be
// recorded (the launch tests use them all the time), and this script runs the tests rather than being tested.
const SKIP = new Set(['src/preload.js', 'src/signin-preload.js', 'scripts/coverage.js']);
const BIG = 120;            // functions shorter than this many characters aren't listed one by one

// The files the report covers: the app's code and the developer scripts.
function sourceFiles() {
  const list = [];
  for (const dir of ['src', 'scripts']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) {
      if (!/\.(js|html)$/.test(f) || SKIP.has(`${dir}/${f}`)) continue;
      const rel = `${dir}/${f}`, text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (f.endsWith('.html') && !/<script>/.test(text)) continue;
      list.push({ rel, text });
    }
  }
  return list;
}

function runSuites() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(RAW, { recursive: true });
  const env = { ...process.env, SMV_COVERAGE: RAW, NODE_V8_COVERAGE: path.join(RAW, 'node') };
  delete env.ELECTRON_RUN_AS_NODE;          // the desktop app must start as an app, not as Node
  const failed = [];
  for (const [name, glob, timeout] of SUITES) {
    console.log(`\n=== ${name} tests ===`);
    const r = spawnSync(process.execPath, ['--test', '--test-force-exit', `--test-timeout=${timeout}`, glob], { cwd: ROOT, env, stdio: 'inherit' });
    if (r.status !== 0) failed.push(name);
  }
  return failed;
}

// Which characters of a file ran: V8 gives nested ranges per function, the innermost one counts.
function markRanges(functions, length) {
  const count = new Int32Array(length).fill(-1);
  const all = functions.flatMap(f => f.ranges.map((r, i) => ({ ...r, outer: i === 0 })));
  all.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
  for (const r of all) count.fill(r.count, Math.max(0, r.startOffset), Math.min(length, r.endOffset));
  return count;
}

function collect(files) {
  const byRel = new Map(files.map(f => [f.rel, { ...f, ran: new Uint8Array(f.text.length), seen: new Uint8Array(f.text.length), fns: new Map() }]));
  // Copies of a script (the release tests run them from a temporary folder) count for the real file.
  const relOf = url => {
    const m = String(url).replace(/[?#].*$/, '').match(/\/(src|scripts)\/([^/]+\.(?:js|html))$/);
    return m && byRel.has(`${m[1]}/${m[2]}`) ? `${m[1]}/${m[2]}` : null;
  };
  const add = (rel, source, functions) => {
    const f = byRel.get(rel); if (!f) return;
    const at = source === null ? 0 : f.text.indexOf(source);
    if (at < 0) return;                                   // an older copy of the file: skip it
    const len = source === null ? f.text.length : source.length;
    const count = markRanges(functions, len);
    for (let i = 0; i < len; i++) if (count[i] >= 0){ f.seen[at + i] = 1; if (count[i] > 0) f.ran[at + i] = 1; }
    for (const fn of functions) {
      const r = fn.ranges[0];
      if (r.startOffset === 0 && r.endOffset >= len - 1) continue;          // the file itself
      const key = at + r.startOffset, prev = f.fns.get(key);
      f.fns.set(key, { name: fn.functionName, start: key, end: at + r.endOffset, ran: (prev && prev.ran) || r.count > 0 });
    }
  };
  const read = dir => { try { return fs.readdirSync(dir).map(f => path.join(dir, f)); } catch { return []; } };
  for (const file of read(path.join(RAW, 'node'))) {
    let d; try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const s of d.result || []) {
      const rel = relOf(s.url); if (!rel) continue;
      const real = byRel.get(rel).text;
      let copy = real;
      try { if (/^file:/.test(s.url)) copy = fs.readFileSync(new URL(s.url), 'utf8'); } catch {}
      add(rel, copy === real ? null : copy, s.functions);
    }
  }
  for (const file of read(path.join(RAW, 'page'))) {
    let list; try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const s of list) { const rel = relOf(s.url); if (rel && s.source) add(rel, rel.endsWith('.html') ? s.source : s.source === byRel.get(rel).text ? null : s.source, s.functions); }
  }
  return [...byRel.values()];
}

// Lines that hold code (not blank, not only comments or brackets), and which of them ran.
function codeLines(f) {
  const ranges = f.rel.endsWith('.html')
    ? [...f.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => [m.index + 8, m.index + 8 + m[1].length])
    : [[0, f.text.length]];
  const lines = []; let off = 0, n = 0, inComment = false;
  for (const line of f.text.split('\n')) {
    n++;
    const start = off, end = off + line.length; off = end + 1;
    if (!ranges.some(([a, b]) => start >= a && end <= b)) continue;
    let t = line.trim();
    if (inComment){ if (t.includes('*/')){ inComment = false; t = t.slice(t.indexOf('*/') + 2).trim(); } else continue; }
    if (t.startsWith('/*') && !t.includes('*/')){ inComment = true; continue; }
    if (!t || t.startsWith('//') || /^\/\*.*\*\/$/.test(t) || /^[\s{}()[\];,]*$/.test(t)) continue;
    let ran = false;
    for (let i = start; i < end; i++) if (f.ran[i] && !/\s/.test(f.text[i])){ ran = true; break; }
    lines.push({ n, ran });
  }
  return lines;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 100);
function report(files) {
  const rows = [], gaps = [];
  for (const f of files) {
    const lines = codeLines(f), fns = [...f.fns.values()];
    const lineOf = off => f.text.slice(0, off).split('\n').length;
    rows.push({ file: f.rel, lines: pct(lines.filter(l => l.ran).length, lines.length), lineCount: lines.length,
      fns: pct(fns.filter(x => x.ran).length, fns.length), fnCount: fns.length, loaded: f.seen.some(Boolean) });
    // the biggest functions nothing runs (not the ones inside another function nothing runs)
    const missed = fns.filter(x => !x.ran && x.end - x.start >= BIG).sort((a, b) => a.start - b.start);
    const top = []; for (const x of missed) if (!top.length || x.start >= top[top.length - 1].end) top.push(x);
    for (const x of top) gaps.push({ file: f.rel, line: lineOf(x.start), name: x.name || '(unnamed)', size: x.end - x.start,
      code: f.text.slice(x.start, x.start + 80).replace(/\s+/g, ' ') });
  }
  return { rows, gaps };
}

function main() {
  const args = process.argv.slice(2);
  const failed = args.includes('--report') ? [] : runSuites();
  const { rows, gaps } = report(collect(sourceFiles()));
  let min = {}; try { min = JSON.parse(fs.readFileSync(MIN_FILE, 'utf8')); } catch {}
  const low = rows.filter(r => min[r.file] !== undefined && r.lines + 0.05 < min[r.file]);

  const md = ['## Test coverage', '', '| File | Lines run | Functions run | Minimum (lines) |', '|---|---:|---:|---:|',
    ...rows.map(r => `| ${r.file} | ${r.loaded ? `${r.lines}% of ${r.lineCount}` : 'not loaded by any test'} | ${r.fns}% of ${r.fnCount} | ${min[r.file] !== undefined ? min[r.file] + '%' : ''} |`), ''];
  if (low.length) md.push('**Below the minimum:** ' + low.map(r => `${r.file} (${r.lines}%, minimum ${min[r.file]}%)`).join(', '), '');
  md.push('<details><summary>Functions no test runs (' + gaps.length + ')</summary>', '', '| Where | Function |', '|---|---|',
    ...gaps.map(g => `| ${g.file}:${g.line} | \`${g.name}\` ${g.code.replace(/\|/g, '\\|').replace(/`/g, "'")} |`), '', '</details>', '');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');

  console.log('\nTest coverage (lines run, functions run):');
  const w = Math.max(...rows.map(r => r.file.length));
  for (const r of rows) console.log(`  ${r.file.padEnd(w)}  ${r.loaded ? `${String(r.lines).padStart(5)}%` : '  none'}  ${String(r.fns).padStart(5)}%${min[r.file] !== undefined ? `   (minimum ${min[r.file]}%)` : ''}`);
  console.log(`\n${gaps.length} functions no test runs: see coverage/report.md`);

  if (args.includes('--update')) {
    const next = Object.fromEntries(rows.filter(r => r.loaded).map(r => [r.file, Math.max(min[r.file] || 0, Math.floor(r.lines))]));
    fs.writeFileSync(MIN_FILE, JSON.stringify(next, null, 2) + '\n');
    console.log('Minimums updated in test/coverage-min.json');
  }
  if (failed.length) console.error(`\nTests failed: ${failed.join(', ')}`);
  const strict = !!process.env.CI;
  if (low.length) console.error(`\n${strict ? '' : 'Warning: '}below the minimum: ${low.map(r => `${r.file} ${r.lines}% (minimum ${min[r.file]}%)`).join(', ')}.` +
    (strict ? ' Add tests for what you changed.' : ' CI checks this; some code may not run on this computer.'));
  process.exit(failed.length || (strict && low.length) ? 1 : 0);
}

if (require.main === module) main();
module.exports = { markRanges, codeLines, collect, report };
