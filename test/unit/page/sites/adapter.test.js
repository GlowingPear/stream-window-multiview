// What every site gives the page (src/page/sites/adapter.js): written down once and checked as each site is made, so a
// site that's missing something, or has it wrong, stops at once with what's wrong. And a made-up fourth site with only
// what every site must have, plugged into the page's list, to show the parts that go through the sites take it.
const test = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../../../../src/shared/sites.js');

// A made-up site (its entry in the shared list, as src/shared/sites.js would have it)
const PEARSTREAM = { id: 'pearstream', name: 'Pearstream', letter: 'P', prefix: 'ps:', partition: 'persist:pearstream', hosts: ['pearstream.example'],
  signIn: [], home: 'https://pearstream.example/', ids: [/^ps:[a-z0-9]{2,20}$/], video: null, keepCase: null };
// ... and the least its page module has
const least = () => ({ id: 'pearstream', idFor: n => 'ps:' + n, handle: ch => ch.slice(3), label: ch => ch.slice(3),
  fromUrl: host => (host === 'pearstream.example' ? null : undefined), streamUrl: ch => 'https://pearstream.example/embed/' + ch.slice(3),
  chatUrl: ch => 'https://pearstream.example/chat/' + ch.slice(3), pageUrl: ch => 'https://pearstream.example/' + ch.slice(3),
  profileUrl: ch => 'https://pearstream.example/' + ch.slice(3), colors: { dot: '#c7f464', brand: '#a2d42c' },
  me: { setting: 'myPearstream', valid: /^[a-z0-9]{2,20}$/ } });

let Site, SLOTS, REQUIRED, PLATFORMS;
test.before(async () => {
  globalThis.SmvSites = shared.make([...shared.SITES, PEARSTREAM], shared.DEFAULT);   // (the page loads the list before its modules)
  ({ Site } = await import('../../../../src/page/sites/adapter.js'));
  ({ SLOTS, REQUIRED } = Site);
  ({ PLATFORMS } = await import('../../../../src/page/sites/sites.js'));
});

test('every site on the page is a Site with every slot, its id, name and addresses from the shared list', () => {
  for (const [id, p] of Object.entries(PLATFORMS)) {
    assert.ok(p instanceof Site, id);
    assert.equal(p.id, id);
    for (const k of Object.keys(SLOTS)) assert.ok(k in p, `${id}.${k}`);
    for (const k of ['name', 'letter', 'prefix', 'partition', 'hosts', 'home']) assert.equal(p[k], shared.byId[id][k], `${id}.${k}`);
  }
  assert.deepEqual(Object.keys(PLATFORMS), shared.IDS, 'the shared list\'s sites, in its order');
});

test('a site with only what every site must have: the rest is its defaults (it hasn\'t got them)', () => {
  const p = new Site(least());
  assert.equal(p.name, 'Pearstream');
  assert.equal(p.partition, 'persist:pearstream');
  for (const k of ['feed', 'shoutouts', 'held', 'quality', 'chatBox', 'chatScroll', 'support', 'stuckJs', 'timeoutCmd', 'modRequest']) assert.equal(p[k], null, k);
  for (const k of ['mentions', 'spamAlerts', 'flagged', 'pageCommands', 'likes', 'liveVideo', 'emoteLists']) assert.equal(p[k], false, k);
  assert.equal(p.offlineChat, true);
  assert.equal(p.chatMax, 500);
  assert.deepEqual(p.chatCommands, []);
  assert.deepEqual(p.me, { setting: 'myPearstream', valid: /^[a-z0-9]{2,20}$/, at: false, named: true, word: 'username' });
  assert.deepEqual(p.login, { fromPages: false, firefox: false, unfollow: false });
  assert.deepEqual(Object.values(p.chat), Array(Object.keys(p.chat).length).fill(false));
  assert.ok(Object.values(p.inSite).every(v => v === null), 'no parts in its pages');
  assert.deepEqual(p.send, { button: null, inner: null, waitEnabled: false, realPress: false });
  assert.equal(p.fromText('ps:x'), undefined);
  assert.equal(p.modUrl('ps:x'), null);
  assert.equal(p.isHost('ps:x', 'x'), false);
  assert.equal(p.nameStyle({}), null);
  // two sites' defaults aren't the same list
  assert.notEqual(new Site(least()).chatCommands, p.chatCommands);
});

test('every required slot is required', () => {
  for (const [name, [, def]] of Object.entries(SLOTS)) {
    if (def !== REQUIRED || name === 'id') continue;
    const o = least(); delete o[name];
    assert.throws(() => new Site(o), new RegExp(`The pearstream site \\(src/page/sites/pearstream/site\\.js\\): ${name} is missing`), name);
  }
  assert.throws(() => new Site({ ...least(), me: { setting: 'x' } }), /me\.valid is missing/);
  assert.throws(() => new Site({ ...least(), colors: undefined }), /colors is missing/);
});

test('a slot of the wrong kind, a part of one, one that isn\'t on the list, or a site the shared list hasn\'t got: refused, saying which', () => {
  assert.throws(() => new Site({ ...least(), mentions: 'yes' }), /mentions must be a boolean, not string/);
  assert.throws(() => new Site({ ...least(), threadedReplies: 1 }), /threadedReplies must be a boolean or a string, not number/);
  assert.throws(() => new Site({ ...least(), me: { setting: 'x', valid: '^a$' } }), /me\.valid must be a regexp, not string/);
  assert.throws(() => new Site({ ...least(), chat: { look: 1 } }), /chat\.look must be a boolean, not number/);
  assert.throws(() => new Site({ ...least(), chat: { looks: true } }), /chat\.looks isn't a slot/);
  assert.throws(() => new Site({ ...least(), inSite: { tap: 'x' } }), /inSite\.tap must be a function, not string/);
  assert.throws(() => new Site({ ...least(), held: { by: 'Bot' } }), /held\.allow is missing; held\.deny is missing; held\.denied is missing/);
  assert.throws(() => new Site({ ...least(), streamURL: () => '' }), /streamURL isn't a slot \(src\/page\/sites\/adapter\.js lists them\)/);
  assert.throws(() => new Site({ ...least(), id: 'myspace' }), /The myspace site \(src\/page\/sites\/myspace\/site\.js\): myspace isn't in src\/shared\/sites\.js/);
  assert.throws(() => new Site(null), /The \? site/);
  // a reader's own parts can come along (its tests use them); the ones every reader has are still checked
  assert.equal(typeof new Site({ ...least(), feed: { parse: () => null, known: {}, ignored: {}, mine: () => 1 } }).feed.mine, 'function');
  assert.throws(() => new Site({ ...least(), feed: { known: {}, ignored: {} } }), /feed\.parse is missing/);
});

test('a fourth site in the page\'s list: the chat feed, its events\' kinds and shoutouts take it (it has no reader and no shoutouts)', async () => {
  const { feedParse } = await import('../../../../src/page/chat/feed-parse.js');
  const text = await import('../../../../src/page/chat/shoutout-text.js');
  const before = { known: feedParse.known(), ignored: feedParse.ignored() };
  PLATFORMS.pearstream = new Site(least());
  try {
    assert.deepEqual(feedParse.parseFeed({ s: 'pearstream', raw: ['anything'] }), [], 'no reader: nothing read');
    assert.deepEqual(feedParse.known(), before.known, 'none of its kinds known');
    assert.deepEqual(feedParse.ignored(), before.ignored);
    assert.equal(feedParse.ignoredWhy('pearstream', 'x'), '');
    assert.equal(feedParse.leftOut('pearstream', { x: 1 }), false);
    assert.equal(text.shoutLink('pearstream', 'pip'), '', 'no shoutouts');
    const run = text.pickRun([{ site: 'pearstream', login: 'pip', t: 1 }, { site: 'kick', login: 'pebble', t: 2 }], { onlyStreamers: false });
    assert.deepEqual(run.list.map(p => p.login), ['pebble'], 'its chatters aren\'t in a run');
    // with a reader and shoutouts, it's read and shouted out like the others
    PLATFORMS.pearstream = new Site({ ...least(), feed: { parse: r => ({ site: 'pearstream', kind: 'message', id: r }), known: { msg: 'a message' }, ignored: { ping: 'its own' } },
      shoutouts: { tries: null, command: null, page: {} } });
    assert.deepEqual(feedParse.parseFeed({ s: 'pearstream', raw: ['a1'] }), [{ site: 'pearstream', kind: 'message', id: 'a1' }]);
    assert.deepEqual(feedParse.known().pearstream, { msg: 'a message' });
    assert.equal(feedParse.ignoredWhy('pearstream', 'ping'), 'its own');
    assert.equal(text.shoutLink('pearstream', 'Pip'), 'https://pearstream.example/pip');
    assert.deepEqual(text.pickRun([{ site: 'pearstream', login: 'pip', t: 1 }], { onlyStreamers: false }).list.map(p => p.site), ['pearstream']);
  } finally { delete PLATFORMS.pearstream; }
});
