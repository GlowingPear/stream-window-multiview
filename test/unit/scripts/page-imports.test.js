// npm run page-imports (scripts/page-imports.js): each page module imports what it uses from the others, and
// exports what they use from it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { plan } = require('../../../scripts/page-imports');

test('every module in src/page/ imports and exports what its code needs (if not: npm run page-imports)', () => {
  const { changes } = plan();
  assert.deepEqual(Object.keys(changes), []);
});

test('it adds what\'s missing, drops what isn\'t used, keeps the load order line, and an object\'s keys aren\'t uses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-imports-'));
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  put('app.js', '//    1. core.js\n//    2. panels/list.js\nimport \'./panels/list.js\';\n');
  put('core.js', 'const wins = [];\nlet unused = 1;\nconst helper = () => 1;\n');
  put('panels/list.js', [
    "import '../core.js';   // runs after it (see app.js)",
    "import { unused } from '../core.js';",
    '',
    'function draw(){ return wins.length + helper(); }',
    'const opts = { wins: 1, helper(){ return 2; } };   // keys, not uses',
    ''
  ].join('\n'));
  const { changes } = plan(dir);
  assert.equal(changes['panels/list.js'], [
    "import '../core.js';   // runs after it (see app.js)",
    "import { helper, wins } from '../core.js';",
    '',
    'function draw(){ return wins.length + helper(); }',
    'const opts = { wins: 1, helper(){ return 2; } };   // keys, not uses',
    ''
  ].join('\n'));
  assert.equal(changes['core.js'], 'const wins = [];\nlet unused = 1;\nconst helper = () => 1;\n\nexport { helper, wins };\n');
});

test('names a module declares inside itself: declarations, parameters and catch, never a use', () => {
  const { localNames } = require('../../../scripts/page-imports');
  const t = 'function draw(a, { b, c: d }, e = wins){ return f(wins, g); } const opts = { wins: 1, helper(x){ return 2; } };\n' +
    'if (wins) { go(); } items.forEach(it => use(it)); const [p, q] = arr; let { r, s: t2 } = o; try {} catch (err) {} for (const k of list) {}';
  assert.deepEqual([...localNames(t)].sort(), ['a', 'b', 'd', 'draw', 'e', 'err', 'it', 'k', 'opts', 'p', 'q', 'r', 't2', 'x']);
});

test('start-up code belongs in init(): a module\'s top only has what can run in any order', () => {
  const { startupProblems } = require('../../../scripts/page-imports');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-startup-')), dir = path.join(root, 'page');
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="page/shared/menu.js"></script><script type="module" src="page/app.js"></script>');
  put('app.js', "import { init } from './panel.js';\ninit();\n");
  put('shared/consts.js', "const SIZE = Math.max(1, 2);\nconst helpers = (() => ({ twice: n => n * 2 }))();\nexport { helpers, SIZE };\n");   // imports nothing
  put('shared/menu.js', "document.addEventListener('click', () => {});\n");    // the page loads it itself
  put('core.js', "const $ = s => document.querySelector(s);\nlet stage;\nfunction init(){ stage = $('#stage'); }\nexport { $, init, stage };\n");
  put('panel.js', [
    "import { $, stage } from './core.js';",
    "import { helpers, SIZE } from './shared/consts.js';",
    '',
    'const GAP = 6, list = [], seen = new Set();',
    'const big = SIZE * 2;',
    'const vars = { get gap(){ return GAP; }, set gap(v){ /* … */ } };',
    'const later = () => helpers.twice(stage.offsetWidth);',
    'const opts = { size: () => $("#x").offsetWidth, name: "panel" };',
    "const box = $('#box');",
    'const wide = stage.offsetWidth > 900;',
    "stage.classList.add('ready');",
    'function init(){}',
    'export { big, box, init, later, list, opts, seen, vars, wide };',
    ''
  ].join('\n'));
  assert.deepEqual(startupProblems(dir), [
    'panel.js:9: box needs other code to run first: declare it with let and set it in init()',
    'panel.js:10: wide needs other code to run first: declare it with let and set it in init()',
    'panel.js:11: runs as the module loads: put it in init()'
  ]);
});

test('files checked out with \\r\\n line ends (git on Windows) are read the same', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-crlf-'));
  const put = (f, t) => fs.writeFileSync(path.join(dir, f), t.replace(/\n/g, '\r\n'));
  put('app.js', "import { init } from './b.js';\ninit();\n");
  put('a.js', 'const wins = [];\n\nexport { wins };\n');
  put('b.js', "import { wins } from './a.js';\n\nfunction init(){ return wins; }\n\nexport { init };\n");
  assert.deepEqual(Object.keys(plan(dir).changes), [], 'nothing out of step');
});
