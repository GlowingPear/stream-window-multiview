// The app shows no system pop-ups: they ignore the theme, and on a Mac they sit above every app and take the
// keyboard, even from a window you can't see (npm run test:launch:hidden). Dropdowns get the app's own list
// by themselves (src/dropdown.js); messages and questions use the app's own dialog. File pickers stay the
// system's (there's no other way to pick a file), and so do the colour pickers for now.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const BANNED = [
  [/(?<![\w.$])(?:window\.)?(alert|confirm|prompt)\s*\(/g, 'the browser\'s $1(): use ask() or flash() (src/page/shared/)'],
  [/<datalist\b|<input\b[^>]*\slist=/g, 'a <datalist> suggestion list'],
  [/\bMenu\.popup\b|\.popup\s*\(\s*\{/g, 'a system menu (Menu.popup)'],
  [/\bdialog\.show(MessageBox|MessageBoxSync|ErrorBox)\b/g, 'a system message box (dialog.show$1): use the app\'s own dialog'],
  [/<input\b[^>]*type=["']?(date|time|month|week|datetime-local)\b/g, 'a system $1 picker']
];
// comments may mention them
const strip = s => s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

function findPopups(file, text) {
  const code = strip(text), found = [];
  for (const [re, what] of BANNED) {
    for (const m of code.matchAll(re)) {
      // a function of the file's own with the same name (extensions.js has its own confirm())
      if (m[1] && new RegExp(`function\\s+${m[1]}\\s*\\(`).test(code) && !/^window\./.test(m[0])) continue;
      const line = code.slice(0, m.index).split('\n').length;
      found.push(`${file}:${line}: ${m[0].replace(re, what)}`);
    }
  }
  return found;
}

test('nothing in src/ opens a system pop-up', () => {
  const files = fs.readdirSync(SRC, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => /\.(html|js)$/.test(f));
  assert.ok(files.includes('index.html') && files.includes('main.js') && files.includes('page/shared/ask.js'));
  const found = files.flatMap(f => findPopups('src/' + f, fs.readFileSync(path.join(SRC, f), 'utf8')));
  assert.deepEqual(found, [], 'system pop-ups found:\n' + found.join('\n'));
});

test('the check finds each kind, and leaves comments and the file\'s own functions alone', () => {
  const sample = [
    'if (confirm("Sure?")) go();',
    'window.alert("hi");',
    'const n = prompt("Name");',
    '<input list="names"><datalist id="names"></datalist>',
    'menu.popup({ window: win });',
    'dialog.showMessageBox(win, {});',
    '<input type="date">',
    '// confirm() would freeze the page',
    '/* alert("no") */',
    '<!-- prompt("no") -->',
    'ask.confirm(x); thing.alert(y);',
    '<input type="color">'
  ].join('\n');
  const found = findPopups('x.js', sample).map(l => l.replace(/:.*?: /, ': '));
  assert.deepEqual(found, [
    "x.js: the browser's confirm(): use ask() or flash() (src/page/shared/)",
    "x.js: the browser's alert(): use ask() or flash() (src/page/shared/)",
    "x.js: the browser's prompt(): use ask() or flash() (src/page/shared/)",
    'x.js: a <datalist> suggestion list',
    'x.js: a <datalist> suggestion list',
    'x.js: a system menu (Menu.popup)',
    'x.js: a system message box (dialog.showMessageBox): use the app\'s own dialog',
    'x.js: a system date picker'
  ]);
  assert.deepEqual(findPopups('own.js', 'function confirm(info) {}\nawait confirm({ id });'), [], 'its own confirm()');
});
