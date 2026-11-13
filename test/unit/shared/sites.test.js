// The list of sites both sides share (src/shared/sites.js): channel ids, their sites, names, hosts; and a made-up
// fourth site, to show the list's helpers take one with nothing else changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../../src/shared/sites.js');

// A made-up site: its own prefix, a channel id shape, hosts and a sign-in page of its own
const PEARSTREAM = { id: 'pearstream', name: 'Pearstream', letter: 'P', prefix: 'ps:', partition: 'persist:pearstream', hosts: ['pearstream.example'],
  signIn: ['login.pear.example'], home: 'https://pearstream.example/', ids: [/^ps:[a-z0-9]{2,20}$/], video: null, keepCase: null };

test('the three sites, in order, each with what both sides read', () => {
  assert.deepEqual(S.IDS, ['kick', 'twitch', 'youtube']);
  assert.equal(S.DEFAULT, 'kick');
  for (const s of S.SITES) {
    assert.equal(S.byId[s.id], s);
    for (const k of ['name', 'letter', 'prefix', 'partition', 'home']) assert.equal(typeof s[k], 'string', `${s.id}.${k}`);
    for (const k of ['hosts', 'signIn', 'ids']) assert.ok(Array.isArray(s[k]), `${s.id}.${k}`);
    assert.ok('video' in s && 'keepCase' in s, `${s.id}: video and keepCase (null for none)`);
    assert.match(s.partition, /^persist:/);
    assert.match(s.home, /^https:\/\/.+\/$/);
  }
});

test('a channel\'s site from its prefix (in any case); a bare name is Kick\'s; nothing is no site', () => {
  assert.deepEqual(['pixelpear', 'tw:alpha', 'TW:Alpha', 'yt:@lofi', 'yt:c:UCx', 'yt:v:abc'].map(S.siteOf), ['kick', 'twitch', 'twitch', 'youtube', 'youtube', 'youtube']);
  assert.equal(S.siteOf(''), '');
  assert.equal(S.siteOf(null), '');
});

test('ids as they\'re kept: lower case, but YouTube\'s video and channel ids keep their case', () => {
  assert.equal(S.normCh('  PixelPear '), 'pixelpear');
  assert.equal(S.normCh('TW:Alpha'), 'tw:alpha');
  assert.equal(S.normCh('YT:@LoFi'), 'yt:@lofi');
  assert.equal(S.normCh('YT:C:UCAbCdEf'), 'yt:c:UCAbCdEf');
  assert.equal(S.normCh('yt:V:AbCdEfGhIjK'), 'yt:v:AbCdEfGhIjK');
  assert.equal(S.normCh(null), '');
});

test('valid channel ids; names an object already has never are (they\'re keys in the saved lists)', () => {
  for (const ch of ['pixelpear', 'pixel_pear-2', 'PixelPear', 'tw:alpha_1', 'yt:@lo.fi-x', 'yt:c:UCabcdefghijkl', 'yt:v:abcdefghijk']) assert.equal(S.validCh(ch), true, ch);
  for (const ch of ['', 'a b', 'tw:', 'tw:Alpha', 'tw:a-b', 'yt:lofi', 'yt:c:x', 'yt:v:short', 'x'.repeat(41), '__proto__', 'tw:constructor', 'yt:@tostring', 7, null])
    assert.equal(S.validCh(ch), false, String(ch));
});

test('a channel\'s name on its site, and whether it\'s one video', () => {
  assert.deepEqual(['pixelpear', 'tw:alpha', 'yt:@lofi', 'yt:c:UCabc', 'yt:v:abc', ''].map(S.bare), ['pixelpear', 'alpha', '@lofi', 'UCabc', 'abc', '']);
  assert.deepEqual(['yt:v:abcdefghijk', 'yt:@lofi', 'tw:alpha', 'pixelpear', ''].map(S.isVideo), [true, false, false, false, false]);
});

test('the site a web address is on: its pages, and (unless left out) the sign-in pages it sends you to', () => {
  assert.equal(S.siteOfHost('kick.com').id, 'kick');
  assert.equal(S.siteOfHost('www.Twitch.tv').id, 'twitch');
  assert.equal(S.siteOfHost('youtu.be').id, 'youtube');
  assert.equal(S.siteOfHost('accounts.google.com').id, 'youtube');
  assert.equal(S.siteOfHost('accounts.google.com', { signIn: false }), null);
  assert.equal(S.siteOfHost('notkick.com'), null);
  assert.equal(S.siteOfHost('kick.com.evil.example'), null);
  assert.equal(S.siteOfHost(''), null);
});

test('a fourth site: added to the list, every helper takes it, and the others are as they were', () => {
  const T = S.make([...S.SITES, PEARSTREAM], 'kick');
  assert.deepEqual(T.IDS, ['kick', 'twitch', 'youtube', 'pearstream']);
  assert.equal(T.siteOf('ps:pip'), 'pearstream');
  assert.equal(T.siteOf('PS:Pip'), 'pearstream');
  assert.equal(T.normCh('PS:Pip'), 'ps:pip');
  assert.equal(T.validCh('ps:pip'), true);
  assert.equal(T.validCh('ps:p'), false);
  assert.equal(T.bare('ps:pip'), 'pip');
  assert.equal(T.isVideo('ps:pip'), false);
  assert.equal(T.siteOfHost('www.pearstream.example').id, 'pearstream');
  assert.equal(T.siteOfHost('login.pear.example').id, 'pearstream');
  for (const ch of ['pixelpear', 'tw:alpha', 'yt:@lofi', 'yt:c:UCabcdefghijkl']) {
    assert.equal(T.siteOf(ch), S.siteOf(ch), ch);
    assert.equal(T.validCh(ch), S.validCh(ch), ch);
  }
  // a prefix that starts like another's: the longer one wins
  const U = S.make([...S.SITES, { ...PEARSTREAM, id: 'ytx', prefix: 'ytx:', ids: [/^ytx:[a-z]+$/] }], 'kick');
  assert.equal(U.siteOf('ytx:pip'), 'ytx');
  assert.equal(U.siteOf('yt:@pip'), 'youtube');
});
