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
