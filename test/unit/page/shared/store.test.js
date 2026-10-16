// The page's store (src/page/shared/store.js): who shows what, told when it changes.
const test = require('node:test');
const assert = require('node:assert/strict');

let store;
test.before(async () => { ({ store } = await import('../../../../src/page/shared/store.js')); });

test('a change runs the parts that watch it, straight away and in the order they started watching', () => {
  const ran = [];
  store.watch('saved', () => ran.push('list'));
  store.watch(['saved', 'wins'], () => ran.push('stars'));
  store.watch('wins', () => ran.push('empty stage'));
  store.changed('saved');
  assert.deepEqual(ran, ['list', 'stars'], 'done by the time changed() returns');
  ran.length = 0;
  store.changed('saved', 'wins');
  assert.deepEqual(ran, ['list', 'stars', 'empty stage'], 'each once, even when it watches both');
  ran.length = 0;
  store.changed('notes');
  assert.deepEqual(ran, [], 'nobody watching');
});

test('only the things it knows about: a typo is a mistake, not a change nobody hears', () => {
  assert.throws(() => store.changed('saves'), /Not something the store knows about: saves/);
  assert.throws(() => store.watch(['wins', 'window'], () => {}), /window/);
});
