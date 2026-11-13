// The sites' main-process modules (src/main/sites/index.js): one per site in src/shared/sites.js, each with the same
// shape, and a channel's site found by its id.
const test = require('node:test');
const assert = require('node:assert/strict');
const SmvSites = require('../../../../src/shared/sites');
const sites = require('../../../../src/main/sites');
const { stubCtx } = require('./stub-ctx');
const { SiteAdapter } = require('../../../../src/main/sites/adapter');

test('a module for every site in sites.js, and none for a site it doesn\'t list', () => {
  assert.deepEqual(Object.keys(sites.MODULES).sort(), [...SmvSites.IDS].sort());
  for (const id of SmvSites.IDS) {
    const m = sites.moduleOf(id);
    assert.equal(typeof m.create, 'function', id);
    assert.equal(typeof m.describeRequest, 'function', id);
    assert.equal(typeof m.fromLink, 'function', id);
  }
  assert.equal(sites.moduleOf('__proto__'), null);
  assert.equal(sites.moduleOf('myspace'), null);
});

test('every adapter is a SiteAdapter (adapter.js checks its slots as it\'s made), in sites.js order', () => {
  const made = sites.createSites(site => stubCtx(site.id).ctx);
  assert.deepEqual(made.list.map(a => a.id), SmvSites.IDS, 'in sites.js order');
  for (const a of made.list) {
    assert.ok(a instanceof SiteAdapter, a.id);
    assert.equal(a.site, SmvSites.byId[a.id]);
    assert.match(a.loginUrl, /^https:\/\//, a.id);
    for (const k of Object.keys(a.emotes ? a.emotes.addOns : {})) assert.ok(['7tv', 'bttv', 'ffz'].includes(k), `${a.id}: ${k}`);
    // a plain name there is one of its own channels
    assert.equal(SmvSites.siteOf(a.byName('pearfan')), a.id);
    assert.ok(SmvSites.validCh(a.byName('pearfan')), a.id);
  }
});

test('a channel\'s site, from its id', () => {
  const made = sites.createSites(site => stubCtx(site.id).ctx);
  assert.equal(made.of('pixelpear').id, 'kick');
  assert.equal(made.of('tw:alpha').id, 'twitch');
  assert.equal(made.of('yt:@lofi').id, 'youtube');
  assert.equal(made.of(''), null);
  assert.equal(made.get('youtube'), made.list[2]);
  assert.equal(made.get('constructor'), null);
});

test('a request to a site, in words, from the site it\'s for', () => {
  assert.deepEqual(sites.describeRequest('https://kick.com/api/v2/channels/pixelpear'), { site: 'kick', what: 'channel' });
  assert.deepEqual(sites.describeRequest('https://gql.twitch.tv/gql', 'isModerator'), { site: 'twitch', what: 'moderator check' });
  assert.deepEqual(sites.describeRequest('https://www.youtube.com/@lofi/live'), { site: 'youtube', what: 'live page' });
  assert.equal(sites.describeRequest('https://example.com/'), null);
  assert.equal(sites.describeRequest('not an address'), null);
});

test('what a site\'s chat can do: shoutouts, IRC lines', () => {
  assert.equal(sites.has('kick', 'shoutouts'), true);
  assert.equal(sites.has('twitch', 'shoutouts'), true);
  assert.equal(sites.has('youtube', 'shoutouts'), false);
  assert.equal(sites.has('twitch', 'ircChat'), true);
  assert.equal(sites.has('kick', 'ircChat'), false);
  assert.equal(sites.has('__proto__', 'shoutouts'), false);
  assert.equal(sites.has(undefined, 'shoutouts'), false);
});
