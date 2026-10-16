// Keeps the import and export lines of the page's modules (src/page/) in step with their code. Works on Windows,
// Mac and Linux.
//   npm run page-imports              rewrites each module's imports (what it uses from the others) and exports
//   npm run page-imports -- --check   only says which modules are out of step (npm test runs this)
// A module's first line, when it's the bare "runs after it" import, is the load order (see src/page/app.js) and
// stays as it is. Everything else in the import block, and the export list at the end, is worked out again:
// a module imports each name it uses that another module declares at its top level, and exports the names
// other modules use. An object's key ({ name: … }) isn't a use. A name the module also declares inside itself
// (a parameter, a local variable) is only imported if it already was: the script says so, to check by hand.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', 'src', 'page');

/* ---- Reading code: identifiers outside strings, comments and regular expressions ---- */
function scan(src) {
  const ids = [];
  const stack = [];           // open template literals: how many { are open inside each ${ … }
  let i = 0, last = '';       // last: the last significant token, to tell a regex from a division
  const n = src.length;
  const regexOk = () => last === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(last) ||
    /^(return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await|&&|\|\||\?\?|=>)$/.test(last) ||
    (last.length > 1 && /[=!<>&|+\-*%^]=?$/.test(last));
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c) i += src[i] === '\\' ? 2 : 1; i++; last = 'str'; continue; }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === 0)) {
      if (c === '}') stack.pop();
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; stack.push(0); last = '{'; break; }
        i++;
      }
      if (i < n && src[i] === '`') { i++; last = 'str'; }
      continue;
    }
    if (c === '/' && regexOk()) {
      i++; let cls = false;
      while (i < n) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; i++; }
      i++; while (i < n && /[a-z]/.test(src[i])) i++;
      last = 'regex'; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; ids.push({ name: src.slice(i, j), i, prev: last }); last = src.slice(i, j); i = j; continue; }
    if (/\d/.test(c)) { while (i < n && /[\w.]/.test(src[i])) i++; last = 'num'; continue; }
    if (/\s/.test(c)) { i++; continue; }
    const op = src.slice(i, i + 4).match(/^(>>>=|\.\.\.|===|!==|\*\*=|<<=|>>=|>>>|&&=|\|\|=|\?\?=|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\*\*|<<|>>|.)/s)[0];
    if (stack.length) { if (op === '{') stack[stack.length - 1]++; else if (op === '}') stack[stack.length - 1]--; }
    i += op.length; last = op;
  }
  return ids;
}

/* ---- What a module declares at its top level (V8 says where each statement ends) ---- */
function topLevelNames(lines) {
  const parses = t => { try { new vm.Script('(async function(){\n' + t + '\n})'); return true; } catch { return false; } };
  const goesOn = l => !/^\s*\/[*/]/.test(l) && /^([\s})\].?:,+\-*|&`<>=]|else\b|catch\b|finally\b|$)/.test(l);
  const names = new Set();
  let s = 0;
  while (s < lines.length) {
    if (/^\s*$/.test(lines[s]) || /^\s*\/[/*]/.test(lines[s]) && parses(lines[s])) { s++; continue; }
    let e = s;
    while (e < lines.length && !((lines[e + 1] === undefined || !goesOn(lines[e + 1])) && parses(lines.slice(s, e + 1).join('\n')))) e++;
    const text = lines.slice(s, e + 1).join('\n');
    let m;
    if ((m = text.match(/^(?:async\s+)?function\s*\*?\s*([\w$]+)/)) || (m = text.match(/^class\s+([\w$]+)/))) names.add(m[1]);
    else if (/^(const|let|var)\s/.test(text)) {
      // run it as "var …" behind a throw, in a sandbox of its own: V8 declares the names without running anything
      const ctx = vm.createContext({}), list = 'Object.getOwnPropertyNames(globalThis)';
      const before = new Set(vm.runInContext(list, ctx));
      try { vm.runInContext('throw 0;\n' + text.replace(/^(const|let)\s/, 'var '), ctx); } catch (er) { if (er !== 0) throw er; }
      for (const nm of vm.runInContext(list, ctx)) if (!before.has(nm)) names.add(nm);
    }
    s = e + 1;
  }
  return names;
}

/* ---- Names a module declares inside itself: local variables, parameters, catch (…) ----
   Only the ones it's sure of: missing one means an import too many (harmless), while taking a use for a
   declaration would leave an import out. */
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'typeof', 'await', 'new']);
function localNames(text) {
  const out = new Set();
  // a parameter list or destructuring: each name, without its default, and not a key it's renamed from
  const fromList = list => list.split(',').forEach(part => {
    part = part.replace(/=[^,]*$/, '');
    for (const m of part.matchAll(/([A-Za-z_$][\w$]*)\s*(:)?/g)) if (!m[2] && m[1] !== 'async') out.add(m[1]);
  });
  for (const m of text.matchAll(/\b(?:let|const|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  // let a = 1, b = [] …: the names after the first, up to the end of the statement (commas inside brackets aren't theirs)
  for (const m of text.matchAll(/\b(?:let|const|var)\s+/g)) {
    let depth = 0, i = m.index + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (!depth) break; depth--; }
      else if (!depth && (c === ';' || c === '\n')) break;
      else if (!depth && c === ',') { const n = text.slice(i + 1).match(/^\s*([A-Za-z_$][\w$]*)\s*(=|,|;|$)/m); if (n) out.add(n[1]); }
    }
  }
  for (const m of text.matchAll(/\b(?:let|const|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)) fromList(m[1]);
  for (const m of text.matchAll(/\bfunction\s*\*?\s*[\w$]*\s*\(([^()]*)\)/g)) fromList(m[1]);
  for (const m of text.matchAll(/\(([^()]*)\)\s*=>/g)) fromList(m[1]);
  for (const m of text.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) out.add(m[1]);
  // object methods: name(params){ … } after { or ,
  for (const m of text.matchAll(/(?:^|[{,])\s*(?:async\s+|get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*\{/gm)) if (!KEYWORDS.has(m[1])) fromList(m[2]);
  return out;
}

/* ---- A module: its load-order line, what it imports now, and its code ---- */
function readModule(file) {
  const L = fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
  let i = 0, chain = null;
  const had = new Set();
  while (i < L.length && /^import /.test(L[i])) {
    if (/^import '[^']+';/.test(L[i])) { chain = L[i]; i++; continue; }
    const st = i;
    while (i < L.length && !/;(\s*\/\/.*)?$/.test(L[i])) i++;
    const m = L.slice(st, i + 1).join(' ').match(/\{([^}]*)\}/);
    if (m) m[1].split(',').map(x => x.trim()).filter(Boolean).forEach(nm => had.add(nm));
    i++;
  }
  while (i < L.length && L[i] === '') i++;
  let j = L.length, k = j - 1;
  while (k >= 0 && L[k] === '') k--;
  if (k >= 0 && /};$/.test(L[k])) {
    let s = k; while (s >= 0 && !/^export \{/.test(L[s])) s--;
    if (s >= 0 && L.slice(s, k + 1).every((l, x) => x === 0 || /^ {2}/.test(l))) j = s;
  }
  while (j > i && L[j - 1] === '') j--;
  return { chain, had, body: L.slice(i, j) };
}

// Wraps "import { a, b, … } from '…';" at about 120 characters.
function wrap(list, lead, tail) {
  const lines = []; let cur = lead;
  for (const nm of list) { const piece = (cur === lead ? '' : ', ') + nm; if (cur.length + piece.length > 116 && cur !== lead) { lines.push(cur + ','); cur = '  ' + nm; } else cur += piece; }
  lines.push(cur + tail);
  return lines;
}

// { file: new text } for the modules whose imports or exports aren't what their code needs, and notes to check.
function plan(dir = PAGE) {
  const files = fs.readdirSync(dir, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => f.endsWith('.js') && f !== 'app.js').sort();
  const order = fs.readFileSync(path.join(dir, 'app.js'), 'utf8').split('\n').map(l => l.match(/^\/\/\s+\d+\. (.+)$/)).filter(Boolean).map(m => m[1]);
  const rank = f => order.indexOf(f);          // modules outside the load order (-1) first
  const mods = Object.fromEntries(files.map(f => [f, readModule(path.join(dir, f))]));
  const declared = Object.fromEntries(files.map(f => [f, topLevelNames(mods[f].body)]));
  const owner = {}, ambiguous = new Set();     // a name several modules declare (each its own) is never imported
  for (const f of files) for (const nm of declared[f]) { if (owner[nm] && owner[nm] !== f) ambiguous.add(nm); owner[nm] = f; }
  for (const nm of ambiguous) delete owner[nm];
  const uses = {}, notes = [];
  for (const f of files) {
    const text = mods[f].body.join('\n'), m = new Map(), skipped = new Set(), inside = localNames(text);
    const declaresInside = nm => inside.has(nm);
    for (const t of scan(text)) {
      if (t.prev === '.' || t.prev === '?.') continue;
      const after = text.slice(t.i + t.name.length);
      if ((t.prev === '{' || t.prev === ',') && (/^\s*:(?!:)/.test(after) || /^\s*\([^()]*\)\s*\{/.test(after))) continue;
      if (ambiguous.has(t.name) && !declared[f].has(t.name) && !declaresInside(t.name)) throw new Error(`${f} uses ${t.name}, which several modules declare`);
      if (!(t.name in owner) || owner[t.name] === f) continue;
      if (!mods[f].had.has(t.name) && declaresInside(t.name)) { skipped.add(t.name); continue; }
      if (!m.has(owner[t.name])) m.set(owner[t.name], new Set());
      m.get(owner[t.name]).add(t.name);
    }
    if (skipped.size) notes.push(`${f}: not imported, as it also declares them inside (check): ${[...skipped].join(', ')}`);
    uses[f] = m;
  }
  const exportsOf = {};
  for (const m of Object.values(uses)) for (const [src, set] of m) set.forEach(nm => (exportsOf[src] = exportsOf[src] || new Set()).add(nm));
  const rel = (from, to) => { const r = path.posix.relative(path.posix.dirname(from), to); return r.startsWith('.') ? r : './' + r; };
  const changes = {};
  for (const f of files) {
    const head = mods[f].chain ? [mods[f].chain] : [];
    for (const src of [...uses[f].keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)))
      head.push(...wrap([...uses[f].get(src)].sort(), 'import { ', ` } from '${rel(f, src)}';`));
    const ex = [...(exportsOf[f] || [])].sort((a, b) => a.localeCompare(b));
    const tail = ex.length ? ['', ...wrap(ex, 'export { ', ' };')] : [];
    const text = [...head, ...(head.length ? [''] : []), ...mods[f].body, ...tail].join('\n') + '\n';
    if (fs.readFileSync(path.join(dir, f), 'utf8') !== text) changes[f] = text;
  }
  return { changes, notes };
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const { changes, notes } = plan();
  notes.forEach(nt => console.log(nt));
  const files = Object.keys(changes);
  if (check) {
    if (files.length) { console.error(`Imports or exports out of step in: ${files.join(', ')}. Run npm run page-imports.`); process.exitCode = 1; }
    else console.log('Every module\'s imports and exports match its code.');
  } else {
    for (const f of files) fs.writeFileSync(path.join(PAGE, f), changes[f]);
    console.log(files.length ? `Updated: ${files.join(', ')}` : 'Nothing to change.');
  }
}

module.exports = { localNames, plan, scan, topLevelNames };
