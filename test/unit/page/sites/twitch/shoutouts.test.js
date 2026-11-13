// Twitch's shoutouts (src/page/sites/twitch/shoutouts.js): who sent a line in its chat, and its own shoutout command.
const test = require('node:test');
const assert = require('node:assert/strict');

let twitchShoutouts;
test.before(async () => { ({ twitchShoutouts } = await import('../../../../../src/page/sites/twitch/shoutouts.js')); });
const clean = s => String(s || '').trim().replace(/^@/, '');

test('who sent a line: its user\'s login and display name, or who raided (a raid\'s notice); its names are logins', () => {
  const { sender } = twitchShoutouts.page;
  assert.deepEqual(sender({ user: { userLogin: 'QuietKoala', userDisplayName: 'QuietKoala' } }, clean), { login: 'quietkoala', name: 'QuietKoala', named: false });
  assert.deepEqual(sender({ params: { login: 'tinroof', displayName: 'TinRoof' } }, clean), { login: 'tinroof', name: 'TinRoof', named: false });
  assert.deepEqual(sender({ msgParams: { 'msg-param-login': 'tinroof', 'msg-param-displayName': 'TinRoof' } }, clean), { login: 'tinroof', name: 'TinRoof', named: false });
  assert.equal(sender({ user: {} }, clean), null);
  assert.deepEqual([twitchShoutouts.tries, twitchShoutouts.command, twitchShoutouts.page.namesDiffer], [null, '/shoutout', false]);
});
