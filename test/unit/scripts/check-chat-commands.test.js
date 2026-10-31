// scripts/check-chat-commands.js: what differs between the chat commands ALL knows and a site's own list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { compare, KICK_WHO } = require('../../../scripts/check-chat-commands');

test('new, gone and changed commands, by name; the ones ALL leaves out on purpose aren\'t new', () => {
  const copy = [{ name: 'ban', args: '<username> [reason]', who: 'mod' }, { name: 'clip', args: '[duration]', who: 'all' }, { name: 'old', args: '', who: 'mod' }];
  const live = [{ name: 'ban', args: '<username> [reason]', who: 'mod' }, { name: 'clip', args: '[duration] [title]', who: 'mod' }, { name: 'shiny', args: '', who: 'mod' }, { name: 'user', args: '<username>', who: 'mod' }];
  assert.deepEqual(compare(copy, live, ['user']), { added: ['shiny'], removed: ['old'], changed: [{ name: 'clip', what: 'args: "[duration]" → "[duration] [title]"' }, { name: 'clip', what: 'who: "all" → "mod"' }] });
  assert.deepEqual(compare(copy, copy), { added: [], removed: [], changed: [] }, 'the same');
  assert.deepEqual(KICK_WHO, { viewer: 'all', moderator: 'mod', broadcaster: 'host' });
});
