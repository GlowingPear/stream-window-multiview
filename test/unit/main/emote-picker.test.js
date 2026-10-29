// Emotes to pick from in ALL (src/main/emote-picker.js): each one's name, picture, and what to send for it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { kickGroups, twitchGroups, stvGroup, bttvGroup, ffzGroup } = require('../../../src/main/emote-picker');

test('Kick: the channel\'s, Kick\'s and the emoji, each sent as Kick writes an emote', () => {
  const g = kickGroups([
    { slug: 'Alpha', emotes: [{ id: 1, name: 'pearHype', subscribers_only: true }, { id: 2, name: 'pearWave' }, { id: 3, name: '' }, null] },
    { id: 'Global', emotes: [{ id: 9, name: 'KEKW' }, { id: 9, name: 'KEKW' }] },
    { id: 'Emoji', emotes: [] }
  ], 'alpha');
  assert.deepEqual(g.map(x => [x.id, x.label, x.emotes.map(e => e.name)]), [['kick-channel', 'Channel', ['pearHype', 'pearWave']], ['kick-global', 'Kick', ['KEKW']]], 'empty groups left out');
  assert.deepEqual(g[0].emotes[0], { name: 'pearHype', url: 'https://files.kick.com/emotes/1/fullsize', send: '[emote:1:pearHype]', subs: true });
  assert.equal(kickGroups({ message: 'no' }, 'alpha'), null);
});

test('Kick: the emotes of the other channels you\'re subscribed to (signed in), after the channel\'s, as Sub emotes (each with its channel); then your collectibles', () => {
  const g = kickGroups([
    { slug: 'alpha', emotes: [{ id: 1, name: 'pearHype', subscribers_only: true }] },
    { slug: 'beta', user: { username: 'Beta' }, emotes: [{ id: 2, name: 'betaWave', subscribers_only: true }] }, { slug: 'gamma', emotes: [{ id: 3, name: 'gammaLUL', subscribers_only: true }] },
    { id: 'Global', emotes: [{ id: 9, name: 'KEKW' }] }, { id: 'Collectibles', emotes: [{ id: 7, name: 'collectiblesCooked' }] }
  ], 'Alpha');
  assert.deepEqual(g.map(x => [x.id, x.label, x.emotes.map(e => e.name)]), [['kick-channel', 'Channel', ['pearHype']], ['kick-yours', 'Sub emotes', ['betaWave', 'gammaLUL']], ['kick-collectibles', 'Collectibles', ['collectiblesCooked']], ['kick-global', 'Kick', ['KEKW']]]);
  assert.deepEqual(g[1].emotes[0], { name: 'betaWave', url: 'https://files.kick.com/emotes/2/fullsize', send: '[emote:2:betaWave]', from: 'Beta' }, 'yours to use: not marked subs; its channel as Kick names it');
  assert.equal(g[1].emotes[1].from, 'gamma', 'or its slug');
});

test('Twitch: the channel\'s, your other sets, and Twitch\'s own', () => {
  const g = twitchGroups({ data: { currentUser: { emoteSets: [
    { id: 's1', owner: { login: 'alpha' }, emotes: [{ id: 'e1', token: 'alphaHi' }] },
    { id: 's2', owner: { login: 'beta', displayName: 'Beta' }, emotes: [{ id: 'e2', token: 'betaWave' }] },
    { id: '0', owner: null, emotes: [{ id: '25', token: 'Kappa' }, { token: 'noid' }] }
  ] } } }, 'Alpha');
  assert.deepEqual(g.map(x => [x.label, x.emotes.map(e => e.name)]), [['Channel', ['alphaHi']], ['Sub emotes', ['betaWave']], ['Twitch', ['Kappa']]]);
  assert.equal(g[1].emotes[0].from, 'Beta', 'each with its channel');
  assert.deepEqual(g[2].emotes[0], { name: 'Kappa', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', send: 'Kappa' });
  assert.equal(twitchGroups({ data: { currentUser: null } }, 'alpha'), null, 'signed out');
});

test('7TV, BetterTTV and FrankerFaceZ: the name is what\'s sent', () => {
  assert.deepEqual(stvGroup({ emote_set: { emotes: [{ name: 'catJAM', data: { host: { url: '//cdn.7tv.app/emote/x' } } }, { name: 'nohost', data: {} }] } }),
    { id: '7tv', label: '7TV', emotes: [{ name: 'catJAM', url: 'https://cdn.7tv.app/emote/x/1x.webp', send: 'catJAM' }] });
  assert.deepEqual(bttvGroup({ channelEmotes: [{ id: 'b1', code: 'monkaS' }], sharedEmotes: [] }).emotes, [{ name: 'monkaS', url: 'https://cdn.betterttv.net/emote/b1/1x', send: 'monkaS' }]);
  assert.deepEqual(ffzGroup({ sets: { 1: { emoticons: [{ name: 'LULW', urls: { 1: '//cdn.frankerfacez.com/x/1' } }, { name: 'abs', urls: { 1: 'https://a/1' } }] } } }).emotes.map(e => e.url),
    ['https://cdn.frankerfacez.com/x/1', 'https://a/1']);
  for (const f of [stvGroup, bttvGroup, ffzGroup]) assert.equal(f(null), null);
  assert.equal(stvGroup({ emote_set: { emotes: [] } }), null, 'nothing: no group');
});
