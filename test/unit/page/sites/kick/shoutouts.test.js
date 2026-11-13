// Kick's shoutouts (src/page/sites/kick/shoutouts.js): the addresses a name can be, and who sent a line in its chat.
const test = require('node:test');
const assert = require('node:assert/strict');

let kickShoutouts;
test.before(async () => { ({ kickShoutouts } = await import('../../../../../src/page/sites/kick/shoutouts.js')); });
const clean = s => String(s || '').trim().replace(/^@/, '');

test('a name\'s addresses: as it is, then with - for _ (only when it has a _)', () => {
  assert.deepEqual(kickShoutouts.tries('@Mossy_Rock '), ['mossy_rock', 'mossy-rock']);
  assert.deepEqual(kickShoutouts.tries('nightowl'), ['nightowl']);
  assert.deepEqual(kickShoutouts.tries(''), []);
  assert.equal(kickShoutouts.command, null);
});

test('who sent a line: its sender\'s slug (its address) and name; without a slug the name is only a name', () => {
  const { sender } = kickShoutouts.page;
  assert.deepEqual(sender({ sender: { slug: 'mossy-rock', username: 'Mossy_Rock' } }, clean), { login: 'mossy-rock', name: 'Mossy_Rock', named: false });
  assert.deepEqual(sender({ user: { username: '@Pixel_Fox' } }, clean), { login: 'pixel_fox', name: 'Pixel_Fox', named: true });
  assert.equal(sender({ sender: {} }, clean), null);
  assert.equal(sender({}, clean), null, 'a notice of the site\'s own');
  assert.deepEqual([kickShoutouts.page.line, kickShoutouts.page.namesDiffer, kickShoutouts.page.special.length], ['[data-index]', true, 2]);
});
