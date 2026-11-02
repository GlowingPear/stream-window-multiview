// The notification centre's list: kept per tab, the red number, filters, days and moving the old histories over.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../../../../../src/page/panels/bell/notifications.js').SmvNotes;

const T = new Date(2026, 5, 10, 15, 0).getTime(), MIN = 60e3, DAY = 864e5;
const m = o => ({ channel: 'alpha', sender: 'ann', body: 'hi', kind: 'mention', t: T, unread: true, ...o });

test('a new one goes first, with an id, its time and unread', () => {
  let l = N.add([], { kind: 'app', subject: 'layouts', text: 'Saved layout' }, T);
  l = N.add(l, { kind: 'spam', channel: 'alpha', sender: 'bot', t: T + 5 }, T + 10);
  assert.deepEqual(l.map(n => [n.kind, n.t, n.unread]), [['spam', T + 5, true], ['app', T, true]]);
  assert.ok(l[0].id && l[1].id && l[0].id !== l[1].id);
  assert.equal(N.add([], { kind: 'live', id: 'x', unread: false }).find(n => n.id === 'x').unread, false, 'its own id and unread stay');
});

test('each tab keeps its own latest 500, so a busy spam day keeps the mentions', () => {
  let l = [m({ body: 'old mention' })];
  for (let i = 0; i < N.MAX + 20; i++) l = N.add(l, { kind: 'spam', sender: 'bot' + i, t: T + i });
  assert.equal(l.filter(n => n.kind === 'spam').length, N.MAX);
  assert.equal(l[0].sender, 'bot' + (N.MAX + 19), 'the newest are kept');
  assert.equal(l.filter(n => n.kind === 'mention').length, 1);
  // mentions, replies and words share the Mentions tab's 500; went live and raids the Live tab's
  const mixed = [m(), m({ kind: 'reply' }), m({ kind: 'word' }), { kind: 'live' }, { kind: 'raid' }, { kind: 'live' }];
  assert.deepEqual(N.cap(mixed, 2).map(n => n.kind), ['mention', 'reply', 'live', 'raid']);
});

test('the red number: mentions and spam, everything but app messages, or nothing', () => {
  const l = [m(), m({ kind: 'reply', unread: false }), { kind: 'spam', unread: true }, { kind: 'live', unread: true },
    { kind: 'raid', unread: true }, { kind: 'app', unread: true }, { sender: 'no kind', unread: true }];
  assert.equal(N.badge(l), 3, 'mentions and spam, the default (one saved without a kind is a mention)');
  assert.equal(N.badge(l, 'ms'), 3);
  assert.equal(N.badge(l, 'all'), 5, 'app messages never count');
  assert.equal(N.badge(l, 'off'), 0);
});

test('tabs and their sub-filters, the chat and site pickers, unread only and search', () => {
  const l = [
    m({ sender: 'ann', body: 'hey @me', channel: 'alpha' }),
    m({ sender: 'bob', kind: 'reply', quoted: 'want to raid?', channel: 'tw:bravo', unread: false }),
    m({ sender: 'cat', kind: 'word', word: 'pear', channel: 'alpha' }),
    { kind: 'spam', sender: 'bot', body: 'cheap viewers', channel: 'tw:bravo', unread: true },
    { kind: 'live', channel: 'yt:@charlie', title: 'Late night chess', category: 'Chess' },
    { kind: 'live', channel: 'delta', title: 'Speedruns', auto: true },
    { kind: 'raid', channel: 'echo', from: 'delta' },
    { kind: 'app', subject: 'layouts', text: 'Saved layout “Late night”' },
    { kind: 'app', subject: 'accounts', text: 'Logged out of Twitch' }
  ];
  const who = f => N.filter(l, f).map(n => n.sender || n.text || n.channel);
  assert.equal(N.filter(l).length, l.length, 'All');
  assert.deepEqual(who({ tab: 'all', sub: 'spam' }), ['bot']);
  assert.deepEqual(who({ tab: 'mentions' }), ['ann', 'bob', 'cat']);
  assert.deepEqual(who({ tab: 'mentions', sub: 'reply' }), ['bob']);
  assert.deepEqual(who({ tab: 'mentions', chan: 'alpha' }), ['ann', 'cat']);
  assert.deepEqual(who({ tab: 'mentions', unread: true }), ['ann', 'cat']);
  assert.deepEqual(who({ tab: 'live' }), ['yt:@charlie', 'delta', 'echo']);
  assert.deepEqual(who({ tab: 'live', sub: 'live' }), ['yt:@charlie', 'delta']);
  assert.deepEqual(who({ tab: 'live', sub: 'raid' }), ['echo']);
  assert.deepEqual(who({ tab: 'live', sub: 'auto' }), ['delta'], 'opened by itself');
  assert.deepEqual(who({ tab: 'live', site: 'youtube' }), ['yt:@charlie']);
  assert.deepEqual(who({ tab: 'live', site: 'kick' }), ['delta', 'echo']);
  assert.deepEqual(who({ tab: 'spam', sub: 'all' }), ['bot']);
  assert.deepEqual(who({ tab: 'spam', sub: 'spam' }), ['bot']);
  assert.deepEqual(who({ tab: 'spam', sub: 'flagged' }), [], 'the Mod tab: spam, and Settings › Flagged\'s');
  assert.deepEqual([N.tabOf({ kind: 'flagged' }), N.SUBS.spam], ['spam', ['all', 'spam', 'flagged']]);
  assert.deepEqual(who({ tab: 'app', sub: 'accounts' }), ['Logged out of Twitch']);
  // search: names, messages, quoted messages, titles, app messages, and the chat by its shown name
  assert.deepEqual(who({ q: 'RAID' }), ['bob']);
  assert.deepEqual(who({ q: 'chess' }), ['yt:@charlie']);
  assert.deepEqual(who({ q: 'late night' }), ['yt:@charlie', 'Saved layout “Late night”']);
  assert.deepEqual(who({ q: 'from delta', label: ch => 'from ' + ch }), ['delta'], 'the chat name from label()');
  assert.deepEqual(who({ tab: 'live', q: 'delta' }), ['delta', 'echo'], 'and who raided');
  assert.deepEqual(who({ q: '  ' }).length, l.length);
  // the numbers on the chips, with the other filters applied
  assert.deepEqual(N.subCounts(l, { tab: 'mentions' }), { all: 3, mention: 1, reply: 1, word: 1, support: 0 });
  assert.deepEqual(N.subCounts(l, { tab: 'mentions', unread: true }), { all: 2, mention: 1, reply: 0, word: 1, support: 0 });
  assert.deepEqual(N.subCounts(l), { all: 9, mentions: 3, spam: 1, live: 3, app: 2 });
  assert.deepEqual(N.subCounts(l, { tab: 'live' }), { all: 3, live: 2, raid: 1, auto: 1 });
  assert.deepEqual(N.subCounts(l, { tab: 'app' }), { all: 2, accounts: 1, layouts: 1, windows: 0, downloads: 0, updates: 0 });
  assert.deepEqual(N.subCounts(l, { tab: 'spam' }), { all: 1, spam: 1, flagged: 0 });
  assert.deepEqual(N.filter(l, { tab: 'nope', sub: 'x' }), [], 'a tab that doesn\'t exist has nothing');
  assert.deepEqual(N.chats(l), [['alpha', 2], ['tw:bravo', 2], ['yt:@charlie', 1], ['delta', 1], ['echo', 1]]);
  assert.deepEqual([N.tabOf({ kind: 'raid' }), N.tabOf({ kind: 'support' }), N.tabOf({}), N.tabOf(null)], ['live', 'mentions', 'mentions', 'mentions']);
});

test('grouped by day: Today, Yesterday, then the date', () => {
  const l = [m({ t: T - MIN }), m({ t: T - 2 * MIN }), m({ t: T - DAY }), m({ t: T - 5 * DAY }), m({ t: T - 400 * DAY })];
  const g = N.byDay(l, T);
  assert.deepEqual(g.map(x => x.items.length), [2, 1, 1, 1]);
  assert.deepEqual(g.slice(0, 2).map(x => x.day), ['Today', 'Yesterday']);
  assert.equal(g[2].day, new Date(T - 5 * DAY).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
  assert.match(g[3].day, /2025/, 'another year shows the year');
  assert.equal(N.dayLabel(Date.now()), 'Today');
});

test('the mentions and spam histories from before move over, nothing lost', () => {
  const mentions = [m({ body: 'newest', t: T }), m({ kind: 'reply', t: T - 3 * MIN, unread: false }), { sender: 'old', body: 'no kind', t: T - DAY }, null, 'junk'];
  const spam = [{ channel: 'tw:bravo', sender: 'bot', body: 'cheap viewers', score: 7, need: 6, signs: [{ text: 'a link', points: 3 }], t: T - MIN }];
  const l = N.migrate(mentions, spam);
  assert.deepEqual(l.map(n => [n.kind, n.t]), [['mention', T], ['spam', T - MIN], ['reply', T - 3 * MIN], ['mention', T - DAY]], 'newest first');
  assert.deepEqual(l[1], { ...spam[0], kind: 'spam', unread: false, id: l[1].id }, 'spam keeps its score and signs, already seen');
  assert.equal(l[0].unread, true);
  assert.ok(l.every(n => n.id));
  assert.equal(new Set(l.map(n => n.id)).size, 4);
  assert.deepEqual(N.migrate(null, undefined), []);
  assert.deepEqual(N.migrate([{ id: 'keep', t: 1 }], []).map(n => n.id), ['keep']);
  assert.equal(N.migrate([{ sender: 'no time' }, { sender: 'x', t: 5 }], [{ sender: 'y' }]).length, 3, 'a missing time sorts last');
});
