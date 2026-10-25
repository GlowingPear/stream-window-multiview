// The guide (docs/guide, shown in the app as Settings › Guide): every page has what the app needs, its links and
// buttons go somewhere real, and README.md (the contents GitHub shows) lists every page in the app's order.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'docs', 'guide');
const GROUPS = ['start', 'watching', 'chat', 'alerts', 'sites', 'app', 'help'];
const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const icons = fs.readFileSync(path.join(ROOT, 'src', 'page', 'shared', 'icons.js'), 'utf8');
const panes = [...html.matchAll(/class="st-pane[^"]*" data-s="([\w-]+)"/g)].map(m => m[1]);

// the header the same way the app reads it (src/page/panels/help/guide.js frontMatter)
function read(name) {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8').replace(/\r/g, '');   // (Windows checks them out with \r\n)
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${name} starts with its header between --- lines`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/); assert.ok(kv, `${name}: "${line}" is "key: value"`);
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
    else if (/^-?\d+$/.test(v)) v = +v;
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^"(.*)"$/, '$1');
    fm[kv[1]] = v;
  }
  return { name, slug: name.slice(0, -3), fm, body: m[2] };
}
const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.md') && f !== 'README.md').map(read);
const slugs = new Set(pages.map(p => p.slug));

test('every page has a title, a group, an icon the app has, a line about it and its place', () => {
  assert.ok(pages.length >= 25);
  for (const { name, fm } of pages) {
    assert.ok(/^[\w-]+\.md$/.test(name), `${name}: letters, digits and - only`);
    assert.ok(fm.title && typeof fm.title === 'string', `${name}: title`);
    assert.ok(GROUPS.includes(fm.group), `${name}: group is one of ${GROUPS.join(', ')}`);
    assert.ok(new RegExp(`^\\s+${fm.icon}:'<svg`, 'm').test(icons), `${name}: icon "${fm.icon}" is in icons.js`);
    assert.ok(fm.lede && fm.lede.length < 200, `${name}: a short lede`);
    assert.equal(typeof fm.order, 'number', `${name}: order`);
    assert.ok(Array.isArray(fm.words) && fm.words.length, `${name}: words to find it by`);
    for (const k of Object.keys(fm)) assert.ok(['title', 'group', 'icon', 'lede', 'settings', 'show', 'keys', 'words', 'related', 'order'].includes(k), `${name}: unknown header "${k}"`);
  }
  const orders = pages.map(p => p.fm.order);
  assert.equal(new Set(orders).size, orders.length, 'no two pages share a place');
});

test('what a page points at is there: its Settings page, Show me\'s button, related pages and links', () => {
  for (const { name, fm, body } of pages) {
    if (fm.settings) assert.ok(panes.includes(fm.settings), `${name}: Settings page "${fm.settings}" exists`);
    if (fm.show) {
      const id = String(fm.show).match(/^#([\w-]+)$/);
      assert.ok(id && html.includes(`id="${id[1]}"`), `${name}: Show me points at ${fm.show}, which is in index.html`);
    }
    for (const r of fm.related || []) assert.ok(slugs.has(r), `${name}: related page ${r} exists`);
    for (const m of body.matchAll(/\]\(([^)]+)\)/g)) {
      const to = m[1];
      if (/^https:\/\//.test(to)) continue;
      assert.ok(/^[\w-]+\.md(#[\w-]+)?$/.test(to) && slugs.has(to.replace(/\.md.*$/, '')), `${name}: the link to ${to} goes to a page`);
    }
    assert.ok(!/^# /m.test(body), `${name}: no # heading (the title is in the header)`);
  }
});

test('README.md lists every page, by group, in the app\'s order', () => {
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8').replace(/\r/g, '');
  const listed = [...readme.matchAll(/^- \[([^\]]+)\]\(([\w-]+)\.md\): (.*)$/gm)].map(m => ({ title: m[1], slug: m[2], lede: m[3] }));
  const want = pages.slice().sort((a, b) => GROUPS.indexOf(a.fm.group) - GROUPS.indexOf(b.fm.group) || a.fm.order - b.fm.order);
  assert.deepEqual(listed.map(x => x.slug), want.map(p => p.slug), 'the same pages, in the same order');
  listed.forEach((x, i) => { assert.equal(x.title, want[i].fm.title, `${x.slug}: the same title`); assert.equal(x.lede, want[i].fm.lede, `${x.slug}: the same lede`); });
});
