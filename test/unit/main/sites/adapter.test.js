// What every site's main-process module and adapter have (src/main/sites/adapter.js): written down once, and checked
// as each one is made, so a site that's missing something, or has it wrong, stops at once with what's wrong.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SiteAdapter, checkModule, SLOTS, MODULE } = require('../../../../src/main/sites/adapter');

// The least a site has: a made-up one, with none of the optional parts
const fn = () => null;
const least = () => ({ id: 'pearstream', site: { id: 'pearstream' }, loginUrl: 'https://pearstream.example/login', named: true,
  signedIn: async () => false, account: async () => null, liveOne: fn, profile: fn, byName: n => 'ps:' + n, fromLink: fn });

test('a site with only what every site has: its optional parts are null (main.js skips them)', () => {
  const a = new SiteAdapter(least());
  assert.ok(a instanceof SiteAdapter);
  assert.equal(a.id, 'pearstream');
  for (const [name, [, required]] of Object.entries(SLOTS)) if (!required) assert.equal(a[name], null, name);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(SLOTS).sort(), 'every slot, and only those');
});

test('every required slot is required', () => {
  for (const [name, [, required]] of Object.entries(SLOTS)) {
    if (!required) continue;
    const o = least(); delete o[name];
    assert.throws(() => new SiteAdapter(o), new RegExp(`${name === 'id' ? '\\?' : 'pearstream'} site's main-process adapter: ${name} is missing`), name);   // (without its id: ?)
  }
});

test('a slot of the wrong kind, a part of one, or one that isn\'t on the list: refused, saying which', () => {
  assert.throws(() => new SiteAdapter({ ...least(), named: 'yes' }), /named must be a boolean, not string/);
  assert.throws(() => new SiteAdapter({ ...least(), liveBatch: [] }), /liveBatch must be a function, not array/);
  assert.throws(() => new SiteAdapter({ ...least(), follows: { import: fn, tick: fn } }), /follows\.retry is missing/);
  assert.throws(() => new SiteAdapter({ ...least(), follows: { import: fn, tick: fn, retry: fn, live: 3 } }), /follows\.live must be a function, not number/);
  assert.throws(() => new SiteAdapter({ ...least(), emotes: { list: fn, pick: fn, addOns: {}, extra: 1 } }), /emotes\.extra isn't a slot/);
  assert.throws(() => new SiteAdapter({ ...least(), liveOnce: fn }), /liveOnce isn't a slot \(src\/main\/sites\/adapter\.js lists them\)/);
  assert.throws(() => new SiteAdapter({ ...least(), signInAs: { urls: 'x', test: fn, userAgent: fn } }), /signInAs\.urls must be an array, not string/);
  assert.throws(() => new SiteAdapter(null), /\? site's main-process adapter: it must be an object/);
  // several wrong at once: all of them
  assert.throws(() => new SiteAdapter({ ...least(), loginUrl: 1, byName: undefined }), /loginUrl must be a string, not number; byName is missing/);
});

test('a site\'s module: create, describeRequest and fromLink, and shoutouts and ircChat only as true or false (its readers can come along)', () => {
  const mod = { create: fn, describeRequest: fn, fromLink: fn, shoutouts: true, parseThing: fn };
  assert.equal(checkModule('pearstream', mod), mod);
  assert.equal(checkModule('pearstream', { create: fn, describeRequest: fn, fromLink: fn }).create, fn);
  assert.throws(() => checkModule('pearstream', { create: fn, fromLink: fn }), /pearstream site's main-process module \(src\/main\/sites\/pearstream\/site\.js\): describeRequest is missing/);
  assert.throws(() => checkModule('pearstream', { ...mod, ircChat: 'yes' }), /ircChat must be a boolean, not string/);
  assert.deepEqual(Object.keys(MODULE), ['create', 'describeRequest', 'fromLink', 'shoutouts', 'ircChat']);
});
