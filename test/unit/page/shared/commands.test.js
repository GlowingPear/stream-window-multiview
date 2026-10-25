// What the search box can find and do (src/page/shared/commands.js): adding commands, when they're there or greyed,
// switches, lists that change, prefixes, ranking (kind, context, what you use), at most 7 a group, Recent and how use
// fades, and running them. With a stand-in localStorage and window (for the 'palette' setting).
const test = require('node:test');
const assert = require('node:assert/strict');

let commands, settings, store;
test.before(async () => {
  store = new Map();
  globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.window = new EventTarget();
  ({ commands } = await import('../../../../src/page/shared/commands.js'));
  ({ settings } = await import('../../../../src/page/shared/settings.js'));
});
test.beforeEach(() => store.clear());
const titles = rs => rs.map(r => r.item.title);
let n = 0;
const uid = p => `${p}.${++n}`;

test('add: an id and a title are needed; an action in Actions unless it says otherwise; the same id replaces it', () => {
  assert.throws(() => commands.add({ title: 'x' }), /an id and a title/);
  assert.throws(() => commands.add({ id: 'x' }), /an id and a title/);
  const id = uid('a');
  commands.add({ id, title: 'Zebra crossing' });
  assert.equal(commands.find(id).kind, 'action');
  assert.equal(commands.find(id).group, 'Actions');
  commands.add({ id, title: 'Zebra crossing two', group: 'Mine' });
  assert.equal(commands.find(id).title, 'Zebra crossing two');
  assert.equal(commands.all().filter(x => x.id === id).length, 1);
  commands.remove(id);
  assert.equal(commands.find(id), null);
});

test('when: left out while false (or when it fails); disabled: greyed with its reason, and running it says why', () => {
  let on = false, why = 'Open a stream first';
  const id = uid('w'), d = uid('d');
  commands.add([{ id, title: 'Quokka thing', when: () => on }, { id: d, title: 'Quokka other', disabled: () => why, run: () => { throw new Error('ran'); } }]);
  assert.equal(commands.find(id), null);
  assert.deepEqual(titles(commands.search('quokka')), ['Quokka other']);
  on = true;
  assert.deepEqual(titles(commands.search('quokka')).sort(), ['Quokka other', 'Quokka thing']);
  assert.equal(commands.disabledWhy(commands.find(d)), 'Open a stream first');
  assert.equal(commands.run(d), 'Open a stream first');
  why = false;
  assert.throws(() => commands.run(d), /ran/);
  const bad = uid('b');
  commands.add({ id: bad, title: 'Quokka broken', when: () => { throw new Error('x'); }, disabled: () => { throw new Error('y'); } });
  assert.equal(commands.find(bad), null, 'a when that fails: not there');
  assert.equal(commands.disabledWhy({ disabled: () => { throw new Error('y'); } }), '', 'a disabled that fails: not greyed');
});

test('run: Enter runs it, a switch flips, ⇧Enter its second choice, a number one of its buttons; each is remembered', () => {
  const did = [];
  let sw = false;
  const a = uid('r'), t = uid('t'), b = uid('btns');
  commands.add([
    { id: a, title: 'Run me', run: () => did.push('run'), alt: () => did.push('alt') },
    { id: t, title: 'Flip me', toggle: { get: () => sw, set: v => { sw = v; } } },
    { id: b, title: 'Buttons', buttons: [{ label: 'One', run: () => did.push('one') }, { label: 'Two', run: () => did.push('two') }] }
  ]);
  assert.equal(commands.run(a), '');
  assert.equal(commands.run(a, 'alt'), '');
  assert.equal(commands.run(t), ''); assert.equal(sw, true);
  assert.equal(commands.run(commands.find(t)), ''); assert.equal(sw, false, 'an item as well as its id');
  assert.equal(commands.run(b, 1), '');
  assert.equal(commands.run(b, 5), 'Not available here');
  assert.deepEqual(did, ['run', 'alt', 'two']);
  assert.equal(commands.run('nothing.like.this'), 'Not available here');
  assert.deepEqual(commands.recent().slice(0, 3), [b, t, a]);
  commands.add({ id: uid('noalt'), title: 'No alt', run: () => did.push('plain') });
  commands.run(commands.all().find(x => x.title === 'No alt'), 'alt');
  assert.equal(did.at(-1), 'plain', 'without a second choice: the first');
});

test('run: a button\'s command clicks that button, there while it isn\'t hidden and greyed while it\'s disabled', () => {
  const btn = { hidden: false, disabled: false, clicks: 0, click(){ this.clicks++; }, dataset: {} };
  globalThis.document = { querySelector: () => btn, querySelectorAll: () => [btn] };
  try {
    const id = uid('btn');
    commands.add({ id, title: 'Pop it', button: '#pop', offWhy: 'No streams' });
    assert.equal(btn.dataset.cmd, id, 'the button is marked with its command');
    assert.equal(commands.run(id), ''); assert.equal(btn.clicks, 1);
    btn.disabled = true;
    assert.equal(commands.run(id), 'No streams');
    btn.hidden = true;
    assert.equal(commands.find(id), null);
  } finally { delete globalThis.document; }
});

test('provide: lists asked for on every key; one that fails is left out; what it gave can be found again for Recent', () => {
  const p = uid('prov');
  let qs = [];
  commands.provide(p, q => { qs.push(q); return q === 'boom' ? null : [{ id: p + ':x', title: 'Wombat ' + q }, { title: 'no id' }]; });
  commands.provide(uid('fails'), () => { throw new Error('broken'); });
  assert.deepEqual(titles(commands.search('wombat')), ['Wombat wombat']);
  assert.ok(qs.includes('wombat'));
  assert.equal(commands.search('boom').length >= 0, true, 'nothing from it, no error');
  qs = [];
  assert.equal(commands.find(p + ':x').title, 'Wombat ');
  assert.equal(qs[0], '', 'find asks with nothing typed');
  commands.provide(p, () => []);
  assert.equal(commands.find(p + ':x').title, 'Wombat ', 'gone from the list: the last one it gave');
  commands.provide(p, () => [{ id: p + ':y', title: 'Off', when: () => false }]);
  assert.equal(commands.find(p + ':y'), null);
});

test('prefixes: > actions, @ channels and windows, # Settings, ? help (and Settings); on its own a prefix lists everything of its kind', () => {
  const k = uid('kind');
  commands.provide(k, () => [
    { id: k + 'a', kind: 'action', title: 'Narwhal action' }, { id: k + 'l', kind: 'layout', title: 'Narwhal layout' },
    { id: k + 'c', kind: 'channel', title: 'narwhal' }, { id: k + 'w', kind: 'window', title: 'narwhal · chat' },
    { id: k + 's', kind: 'setting', title: 'Narwhal option' }, { id: k + 'h', kind: 'help', title: 'Narwhal guide' }
  ]);
  const kinds = (text, o) => commands.search(text, o).filter(r => r.item.id.startsWith(k)).map(r => r.item.kind).sort();
  assert.deepEqual(kinds('>narwhal'), ['action', 'layout']);
  assert.deepEqual(kinds('@narwhal'), ['channel', 'window']);
  assert.deepEqual(kinds('#narwhal'), ['setting']);
  assert.deepEqual(kinds('?narwhal'), ['help', 'setting'], 'help: the guide, and the options it explains');
  assert.deepEqual(kinds('narwhal', { scope: '>' }), ['action', 'layout'], 'the scope chip');
  assert.deepEqual(kinds('#'), ['setting'], 'a prefix on its own');
  assert.deepEqual(kinds(''), [], 'nothing typed, no prefix: nothing (the empty box has its own lists)');
  assert.deepEqual(commands.parse('  @ nightowl '), { scope: '@', q: 'nightowl' });
  assert.deepEqual(commands.parse('tile'), { scope: '', q: 'tile' });
});

test('ranking: the match, then the kind, then context (boost); ties: the shorter title; strong matches drop scattered letters', () => {
  const g = uid('rank');
  commands.provide(g, () => [
    { id: g + '1', kind: 'help', group: 'H', title: 'Ibex' },
    { id: g + '2', kind: 'window', group: 'W', title: 'Ibex' },
    { id: g + '3', kind: 'action', group: 'A', title: 'Ibex goes far' },
    { id: g + '4', kind: 'action', group: 'A', title: 'Ibex go' },
    { id: g + '5', kind: 'note', group: 'N', title: 'Ibex', boost: 20 },
    { id: g + '6', kind: 'action', group: 'A', title: 'Iambic verse ox' }
  ]);
  const r = commands.search('ibex').filter(x => x.item.id.startsWith(g));
  assert.deepEqual(r.map(x => x.item.id.slice(g.length)), ['5', '2', '1', '4', '3'], 'boosted, window, help, then the starts (shorter first); scattered letters left out');
  assert.equal(r[0].match, 100, 'match: how well the words matched, without the rest');
});

test('at most 7 a group and 40 in all; a prefix lists all of its kind; keep: the empty box\'s lists', () => {
  const g = uid('many');
  commands.provide(g, () => [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `${g}a${i}`, group: 'Lots', title: `Yak ${i}`, kind: 'action' })),
    ...Array.from({ length: 50 }, (_, i) => ({ id: `${g}b${i}`, group: 'G' + i, title: `Yak b${i}`, kind: 'theme' })),
    { id: g + 'k', group: 'Kept', title: 'Kept one', keep: true }
  ]);
  const r = commands.search('yak').filter(x => x.item.id.startsWith(g));
  assert.equal(r.filter(x => x.item.group === 'Lots').length, 7);
  assert.ok(commands.search('yak').length <= 40);
  assert.equal(commands.search('yak', { scope: '>' }).filter(x => x.item.group === 'Lots').length, 12, 'with a prefix: every one');
  assert.deepEqual(titles(commands.search('', { keep: true }).filter(x => x.item.id.startsWith(g))), ['Kept one']);
  // with nothing typed, a prefix's list is by group, then A–Z
  const lots = commands.search('', { scope: '>' }).filter(x => x.item.group === 'Lots').map(x => x.item.title);
  assert.deepEqual(lots.slice(0, 3), ['Yak 0', 'Yak 1', 'Yak 2']);
  assert.deepEqual(lots.slice(-2), ['Yak 10', 'Yak 11'], 'numbers in order');
});

test('matched: a provider\'s own score when the name doesn\'t match; fallback: only when nothing else is found', () => {
  const g = uid('fb');
  commands.provide(g, q => [
    { id: g + 'page', kind: 'help', group: 'Guide', title: 'Some page', matched: q === 'koala' ? 30 : 0 },
    { id: g + 'fb', fallback: true, group: 'Nothing found', title: `Search the guide for “${q}”` }
  ]);
  assert.deepEqual(titles(commands.search('koala').filter(x => x.item.id.startsWith(g))), ['Some page']);
  assert.deepEqual(titles(commands.search('kiwi').filter(x => x.item.id.startsWith(g))), []);
  assert.deepEqual(commands.fallbacks('kiwi').filter(x => x.id.startsWith(g)).map(x => x.title), ['Search the guide for “kiwi”']);
  const only = [{ id: 'o1', title: 'Make big' }, { id: 'o2', title: 'Mute' }, { id: 'o3', title: 'Off', when: () => false }];
  assert.deepEqual(titles(commands.search('', { only })), ['Make big', 'Mute'], 'Tab\'s list, in its own order');
  assert.deepEqual(titles(commands.search('mu', { only })), ['Mute']);
  assert.deepEqual(commands.grouped([{ item: { group: 'A' } }, { item: { group: 'B' } }, { item: { group: 'A' } }]).map(g => [g.group, g.rows.length]), [['A', 2], ['B', 1]]);
});

test('Recent keeps the last 20 run, newest first; how often each was run is kept for the 300 used last', () => {
  for (let i = 0; i < 25; i++) commands.ran('r' + i, 1000 + i);
  commands.ran('r3', 5000);
  const m = settings.json('palette');
  assert.equal(m.recent.length, 20);
  assert.deepEqual(m.recent.slice(0, 3), ['r3', 'r24', 'r23']);
  assert.deepEqual(m.used.r3, { n: 2, t: 5000 });
  for (let i = 0; i < 320; i++) commands.ran('u' + i, 10000 + i);
  assert.equal(Object.keys(settings.json('palette').used).length, 300);
  assert.ok(!('u0' in settings.json('palette').used), 'the ones used longest ago go');
  commands.ran('');
  assert.equal(settings.json('palette').recent[0], 'u319', 'nothing to remember');
  store.set('kickMultiview.palette', '{"recent":"x","used":5}');
  assert.deepEqual(commands.recent(), [], 'a damaged setting reads as empty');
});

test('frecency: 12 × log2(1 + times run), halved for every 7 days since it was last run; it lifts what you use', () => {
  const day = 86400000, now = 100 * day;
  commands.ran('f', now); commands.ran('f', now); commands.ran('f', now);
  assert.equal(commands.frecency('f', now), 24);
  assert.equal(commands.frecency('f', now + 7 * day), 12);
  assert.equal(commands.frecency('f', now + 14 * day), 6);
  assert.equal(commands.frecency('never', now), 0);
  const g = uid('fr');
  commands.provide(g, () => [{ id: g + 'a', title: 'Gnu one' }, { id: g + 'b', title: 'Gnu two' }]);
  assert.equal(titles(commands.search('gnu'))[0], 'Gnu one');
  commands.ran(g + 'b'); commands.ran(g + 'b');
  assert.equal(titles(commands.search('gnu'))[0], 'Gnu two');
});

test('forget: one out of Recent and how often it was run; forgetAll: all of it; each says so (the store\'s recent)', async () => {
  const { store: topics } = await import('../../../../src/page/shared/store.js');
  let told = 0; topics.watch('recent', () => told++);
  commands.ran('a', 1); commands.ran('b', 2); commands.ran('c', 3);
  assert.equal(told, 3, 'running one says so');
  commands.forget('b');
  assert.deepEqual(commands.recent(), ['c', 'a']);
  assert.ok(!('b' in settings.json('palette').used), 'and how often it was run');
  assert.ok('a' in settings.json('palette').used);
  assert.equal(told, 4);
  commands.forget('never there');
  assert.deepEqual(commands.recent(), ['c', 'a']);
  commands.forgetAll();
  assert.deepEqual(commands.recent(), []);
  assert.equal(commands.frecency('a'), 0);
  assert.equal(store.has('kickMultiview.palette'), false);
  assert.equal(told, 6);
  commands.forget('a');   // nothing remembered: fine
  assert.deepEqual(commands.recent(), []);
});

test('Recent off (Settings › Search box): nothing new is remembered and nothing counts; what was is kept for when it\'s on', () => {
  const g = uid('off');
  commands.provide(g, () => [{ id: g + 'a', title: 'Quagga one' }, { id: g + 'b', title: 'Quagga two' }]);
  commands.ran(g + 'b'); commands.ran(g + 'b');
  assert.equal(titles(commands.search('quagga'))[0], 'Quagga two');
  settings.set('paletteRecent', false);
  assert.deepEqual(commands.recent(), [], 'no Recent');
  assert.deepEqual(commands.remembered(), [g + 'b'], 'still there for Settings');
  assert.equal(commands.frecency(g + 'b'), 0);
  assert.equal(titles(commands.search('quagga'))[0], 'Quagga one', 'what you used doesn\'t rank higher');
  commands.ran(g + 'a');
  assert.deepEqual(commands.remembered(), [g + 'b'], 'nothing new');
  settings.set('paletteRecent', true);
  assert.deepEqual(commands.recent(), [g + 'b'], 'back when it\'s on');
  assert.equal(titles(commands.search('quagga'))[0], 'Quagga two');
});

test('noRecent: running it isn\'t remembered (Clear Recent); remembered() reads a damaged setting as empty', () => {
  const id = uid('nr');
  commands.add({ id, title: 'Forgetful', noRecent: true, run: () => {} });
  assert.equal(commands.run(id), '');
  assert.deepEqual(commands.recent(), []);
  store.set('kickMultiview.palette', '{"recent":5}');
  assert.deepEqual(commands.remembered(), []);
  store.set('kickMultiview.palette', 'null');
  assert.deepEqual(commands.remembered(), []);
  commands.forget(id);
});
