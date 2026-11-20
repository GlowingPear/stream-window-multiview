// Rumble's chat data as ALL's messages (src/page/sites/rumble/feed.js; what a message is: src/page/chat/feed-parse.js).
// Made up, in the shape its tap hands them over (src/page/sites/rumble/in-site/feed.js), from its connection's events
// (read from its chat 2026-11-20).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');   // (import() of a Windows path needs a file:// URL)
const ROOT = path.join(__dirname, '../../../../..');
const load = async () => {
  globalThis.SmvSites = require(path.join(ROOT, 'src/shared/sites.js'));
  const { rumbleFeed: feed } = await import(pathToFileURL(path.join(ROOT, 'src/page/sites/rumble/feed.js')).href);
  const { feedParse } = await import(pathToFileURL(path.join(ROOT, 'src/page/chat/feed-parse.js')).href);
  return { ...feed, feedParse };
};
const PIP = { id: '200920893', username: 'PipTheOwl', color: '#417eeb', badges: ['moderator', 'recurring_subscription', 'premium'] };
const msg = (t, m, extra = {}) => ({ t, m: { id: '2841553472156348459', time: '2026-11-20T21:05:45+00:00', text: 'hi', rant: null, ...m }, u: PIP, pics: [], emotes: {}, ...extra });

test('a message: its sender, their colour and badges (its subscribers as subs), its emotes as pictures', async () => {
  const { parse } = await load();
  const m = parse(msg('message', { text: 'gg :r+rumblecharge: well played :nope:' }, {
    emotes: { ':r+rumblecharge:': 'https://hugh.cdn.rumble.cloud/video/z12/S/1/x/Y/S1xYQ.baa.gif' },
    pics: [{ url: 'https://hugh.cdn.rumble.cloud/badge/mod.png', title: 'Moderator' }, { title: 'no picture' }] }));
  assert.deepEqual(m, { site: 'rumble', kind: 'message', id: '2841553472156348459', t: Date.UTC(2026, 10, 20, 21, 5, 45), sender: 'PipTheOwl', login: 'piptheowl',
    color: '#417eeb', userId: '200920893', badges: ['mod', 'sub'], pics: [{ url: 'https://hugh.cdn.rumble.cloud/badge/mod.png', title: 'Moderator' }],
    parts: [{ text: 'gg ' }, { emote: 'https://hugh.cdn.rumble.cloud/video/z12/S/1/x/Y/S1xYQ.baa.gif', name: 'r+rumblecharge' }, { text: ' well played :nope:' }] });
  assert.equal(parse(msg('message', {}, { u: { ...PIP, color: 'blue', badges: ['admin'] } })).color, '', 'only a colour as #rrggbb');
  assert.deepEqual(parse(msg('message', {}, { u: { ...PIP, badges: ['admin'] } })).badges, ['staff']);
  assert.equal(parse(msg('message', { time: 'not a time' })).t > 0, true, 'no time: now');
  assert.equal(parse(msg('message', { id: '' })), null);
  assert.equal(parse(msg('nonsense', {})), null);
  assert.equal(parse(null), null);
});

test('a line its chat already showed comes with its parts as drawn', async () => {
  const { parse } = await load();
  const parts = [{ text: 'hello ' }, { emote: 'https://hugh.cdn.rumble.cloud/e.png', name: 'wave' }];
  const m = parse({ t: 'shown', m: { id: '9', time: '', text: 'hello', rant: null }, u: { id: '1', username: 'Pip', color: '', badges: [] }, pics: [], parts });
  assert.deepEqual([m.kind, m.parts, m.sender], ['message', parts, 'Pip']);
  assert.equal(parse({ t: 'shown', m: { id: '9' }, u: null }).sender, '', 'someone unknown');
});

test('a rant (a paid message): an event with its amount, and support as a Super Chat is', async () => {
  const { parse } = await load();
  const r = parse(msg('rant', { text: 'great stream', rant: { cents: 500 } }));
  assert.deepEqual([r.kind, r.event, r.amount, r.text], ['event', 'rant', '$5', 'PipTheOwl sent a Rant · $5']);
  assert.deepEqual(r.support, { kind: 'superchat', who: 'PipTheOwl', n: 5, amt: '$5' });
  assert.deepEqual(r.parts, [{ text: 'great stream' }]);
  assert.equal(parse(msg('rant', { rant: { cents: 250 } })).amount, '$2.50');
  assert.equal(parse(msg('rant', { rant: null })).kind, 'message', 'a rant without its amount: a message');
});

test('deletions, someone muted, pins', async () => {
  const { parse } = await load();
  assert.deepEqual({ ...parse({ t: 'delete', id: '77' }), t: 0 }, { site: 'rumble', kind: 'delete', target: '77', t: 0 });
  assert.deepEqual({ ...parse({ t: 'mute', id: '200920893' }), t: 0 }, { site: 'rumble', kind: 'clear', userId: '200920893', t: 0 });
  assert.equal(parse({ t: 'delete' }), null);
  assert.equal(parse({ t: 'mute' }), null);
  const pin = parse(msg('pin', { text: 'pinned!' }));
  assert.deepEqual([pin.kind, pin.id, pin.msg.parts], ['pin', '2841553472156348459', [{ text: 'pinned!' }]]);
  assert.equal(parse({ t: 'unpin' }).kind, 'unpin');
});

test('what ALL says of each kind its tap counts: the ones it reads, the ones it leaves out and why', async () => {
  const { known, ignored, feedParse } = await load();
  assert.ok(known.messages && known['messages:rant'] && known.delete_messages && known.pin_message);
  assert.equal(feedParse.ignoredWhy('rumble', 'livestream_started'), 'the stream starting');
  assert.equal(feedParse.ignoredWhy('rumble', 'raid_confirmed'), '', 'not one ALL knows yet: Settings › Developer shows it');
  assert.equal(Object.keys(ignored).some(k => known[k]), false);
  assert.deepEqual(feedParse.parseFeed({ s: 'rumble', raw: [{ t: 'delete', id: '1' }, { t: '??' }] }).map(m => m.kind), ['delete']);
});
