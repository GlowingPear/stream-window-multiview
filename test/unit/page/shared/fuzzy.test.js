// Matching what's typed in the search box (src/page/shared/fuzzy.js): each level and its order, the starts of
// words, the letters that matched, accents and other alphabets, and odd input.
const test = require('node:test');
const assert = require('node:assert/strict');

let fuzzy;
test.before(async () => { ({ fuzzy } = await import('../../../../src/page/shared/fuzzy.js')); });
const score = (q, t) => { const m = fuzzy.match(q, t); return m && m.score; };
const marks = (q, t) => fuzzy.match(q, t).marks;

test('each level: the whole name, its start, its words\' starts, a word\'s start, inside a word, letters in order', () => {
  assert.equal(score('tile', 'Tile'), 100);
  assert.equal(score('chat s', 'Chat Stage'), 80);
  assert.equal(score('cs', 'Chat Stage'), 70);
  assert.equal(score('chst', 'Chat Stage'), 70, 'more than one letter of a word');
  assert.equal(score('stage', 'Chat Stage'), 55);
  assert.equal(score('tag', 'Chat Stage'), 35);
  const loose = score('chtsg', 'Chat Stage');
  assert.ok(loose >= 10 && loose <= 30, String(loose));
  assert.equal(fuzzy.match('xyz', 'Chat Stage'), null);
});

test('the levels rank in that order, and letters closer together score more', () => {
  const t = 'Chat Stage';
  const s = ['chat stage', 'chat s', 'cs', 'stage', 'tag', 'chtsg'].map(q => score(q, t));
  assert.deepEqual([...s].sort((a, b) => b - a), s);
  assert.ok(score('mut', 'Mute every stream') > score('mvs', 'Mute every stream x'), 'a start beats letters spread out');
  assert.ok(score('abc', 'aXbXc') > score('abc', 'aXXXXbXXXXc'), 'fewer gaps, more points');
});

test('several words: each has to match, and the name scores a little under a match of the whole', () => {
  assert.equal(score('mute every', 'Mute every stream'), 80, 'the start of the name');
  const turned = score('every mute', 'Mute every stream');
  assert.ok(turned > 35 && turned < 80, String(turned));
  assert.equal(fuzzy.match('mute nothing', 'Mute every stream'), null, 'a word that isn\'t there');
  assert.equal(score('  tile  ', 'Tile'), 100, 'spaces around don\'t count');
});

test('the letters that matched, as places in the name', () => {
  assert.deepEqual(marks('cs', 'Chat Stage'), [0, 5]);
  assert.deepEqual(marks('stage', 'Chat Stage'), [5, 6, 7, 8, 9]);
  assert.deepEqual(marks('mute every', 'Mute every stream'), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(marks('every mute', 'Mute every stream'), [0, 1, 2, 3, 5, 6, 7, 8, 9]);
});

test('capitals and accents don\'t count, other alphabets match, and the marks are in the name as written', () => {
  assert.equal(score('CAFE', 'café'), 100);
  assert.equal(score('cafe', 'Café au lait'), 80);
  assert.deepEqual(marks('ca', 'Ça va'), [0, 1]);
  assert.equal(score('привет', 'Привет мир'), 80);
  assert.equal(score('мир', 'Привет мир'), 55);
  assert.equal(score('😀', '😀 smile'), 80);
  assert.deepEqual(marks('s', '😀 smile'), [3], 'after a two-part character');
});

test('words start after anything that isn\'t a letter or a digit, and where digits begin', () => {
  assert.equal(score('ln', 'last-night'), 70);
  assert.equal(score('night', 'last_night'), 55);
  assert.equal(score('2', 'Stream columns: 2'), 55);
  assert.equal(score('cols2', 'cols2'), 100);
  assert.equal(score('c2', 'cols2'), 70, 'the digits are a word of their own');
});

test('a name that starts with a symbol (a YouTube @handle) counts from its first letter, unless the symbol is typed too', () => {
  assert.equal(score('sleepy', '@sleepy'), 100);
  assert.equal(score('sle', '@sleepy'), 80);
  assert.deepEqual(marks('sle', '@sleepy'), [1, 2, 3]);
  assert.equal(score('@sle', '@sleepy'), 80);
  assert.deepEqual(marks('@sle', '@sleepy'), [0, 1, 2, 3]);
});

test('odd input: nothing typed, nothing to match, and a very long query', () => {
  assert.equal(fuzzy.match('', 'Tile'), null);
  assert.equal(fuzzy.match('   ', 'Tile'), null);
  assert.equal(fuzzy.match('tile', ''), null);
  assert.equal(fuzzy.match('tile', null), null);
  assert.equal(fuzzy.match(null, 'Tile'), null);
  assert.equal(score('1', 1), 100, 'a number is its text');
  assert.equal(fuzzy.match('a'.repeat(40), 'a'.repeat(30)), null, 'longer than the name');
  assert.ok(score('abcdefghijklmnopqrstuvwxyz', 'a b c d e f g h i j k l m n o p q r s t u v w x y z') > 0, 'long, no word-start search');
});

test('an item: its title in full, its other names at 0.6, its second line at 0.3', () => {
  assert.equal(fuzzy.scoreItem('mute', { title: 'Mute' }).score, 100);
  assert.equal(fuzzy.scoreItem('volume', { title: 'Mute', words: ['volume'] }).score, 60);
  assert.equal(fuzzy.scoreItem('popped', { title: 'Mute', sub: 'popped out' }).score, 24);
  assert.equal(fuzzy.scoreItem('popped', { title: 'Mute', sub: 'popped out' }).level, 80, 'how well, where it matched (before its weight)');
  assert.deepEqual(fuzzy.scoreItem('volume', { title: 'Mute', words: ['volume'] }).marks, [], 'no letters of the title to mark');
  assert.equal(fuzzy.scoreItem('mute', { title: 'Mute', words: ['mute'] }).score, 100, 'the best of them');
  assert.equal(fuzzy.scoreItem('zzz', { title: 'Mute', words: ['volume'], sub: 'popped out' }), null);
});
