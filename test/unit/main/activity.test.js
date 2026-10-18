// Settings › Connected apps › Activity's log (src/main/activity.js): newest first and paged by `before`, the last 500
// kept while the totals count every one, the filters, the heartbeat counted rather than listed, notes, and the chart.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createActivity, pageOptions, MAX, MINUTES } = require('../../../src/main/activity');

const PD = 'com.streamorchard.peardrops';
const T0 = Date.UTC(2026, 9, 18, 16, 55);
// A log with its own clock, and Grapevine-shaped messages
function setup(o = {}) {
  let now = T0;
  const log = createActivity({ now: () => now, ...o });
  const msg = (m = {}) => ({ at: now, app: PD, dir: 'in', kind: 'event', method: 'drops.farming.changed', bytes: 100, data: { state: 'paused' }, ...m });
  return { log, msg, tick: ms => { now += ms; }, at: () => now };
}

test('entries come newest first, each numbered, with what the message said', () => {
  const { log, msg } = setup();
  const a = log.add(msg({ id: undefined }));
  const b = log.add(msg({ dir: 'out', kind: 'request', method: 'drops.farming.show', id: 7, bytes: 60, data: {} }));
  assert.deepEqual([a.n, b.n], [1, 2]);
  const p = log.page(PD);
  assert.deepEqual(p.entries.map(e => e.n), [2, 1]);
  assert.deepEqual(p.entries[0], { n: 2, at: T0, app: PD, dir: 'out', kind: 'request', method: 'drops.farming.show', id: 7, ms: undefined, bytes: 60, data: {} });
  assert.equal(p.total, 2);
  assert.equal(p.newer, 0);
  assert.equal(p.latest, 2);
  assert.equal(p.started, T0);
});

test('pages: `before` is an entry, so a page stays put while new messages arrive', () => {
  const { log, msg } = setup();
  for (let i = 0; i < 12; i++) log.add(msg());
  const first = log.page(PD, { limit: 5 });
  assert.deepEqual(first.entries.map(e => e.n), [12, 11, 10, 9, 8]);
  const second = log.page(PD, { limit: 5, before: 8 });
  assert.deepEqual(second.entries.map(e => e.n), [7, 6, 5, 4, 3]);
  assert.equal(second.newer, 5, 'five on the newer page');
  log.add(msg()); log.add(msg());
  const again = log.page(PD, { limit: 5, before: 8 });
  assert.deepEqual(again.entries.map(e => e.n), [7, 6, 5, 4, 3], 'the same entries');
  assert.equal(again.newer, 7);
  assert.equal(again.total, 14);
  assert.deepEqual(log.page(PD, { limit: 5, before: 3 }).entries.map(e => e.n), [2, 1], 'the last page');
  assert.equal(log.page(PD, { limit: 0 }).entries.length, 1, 'at least one');
});

test('the last 500 are kept; the totals count every one', () => {
  const { log, msg } = setup();
  for (let i = 0; i < MAX + 20; i++) log.add(msg({ bytes: 10 }));
  const p = log.page(PD, { limit: 50 });
  assert.equal(p.total, MAX);
  assert.equal(p.entries[0].n, MAX + 20);
  assert.equal(log.page(PD, { before: 22, limit: 50 }).entries.length, 1, 'the oldest are gone: only 21 is left before 22');
  assert.equal(p.totals.received, MAX + 20);
  assert.equal(p.totals.bytesIn, (MAX + 20) * 10);
  assert.equal(createActivity({ max: 3 }).page(PD).total, 0);
});

test('the filters: sent, received, problems (an error, a warning or a bad note); each counts its own', () => {
  const { log, msg } = setup();
  log.add(msg());
  log.add(msg({ dir: 'out', kind: 'event', method: 'players.changed', bytes: 200 }));
  log.add(msg({ dir: 'in', kind: 'error', method: 'drops.farming.show', data: { code: -32601, message: 'No such method' } }));
  log.note(PD, { kind: 'note', tone: 'warn', text: 'Dropped an invalid drops.farming.changed from Pear Drops' });
  log.note(PD, { tone: 'ok', text: 'Connected to Pear Drops' });
  const ids = f => log.page(PD, { filter: f }).entries.map(e => e.n);
  assert.deepEqual(ids('all'), [5, 4, 3, 2, 1]);
  assert.deepEqual(ids('out'), [2]);
  assert.deepEqual(ids('in'), [3, 1]);
  assert.deepEqual(ids('problems'), [4, 3]);
  assert.deepEqual(ids('nonsense'), [5, 4, 3, 2, 1], 'anything else is all');
  const p = log.page(PD, { filter: 'out' });
  assert.equal(p.total, 1, 'the filter\'s own total');
  assert.equal(p.problems, 2, 'problems whatever the filter');
  assert.deepEqual(
    { sent: p.totals.sent, received: p.totals.received, bytesOut: p.totals.bytesOut, bytesIn: p.totals.bytesIn, problems: p.totals.problems },
    { sent: 1, received: 2, bytesOut: 200, bytesIn: 200, problems: 2 });
});

test('notes: in their app\'s log, with the time they happened; one with no app shows in every log', () => {
  const { log, tick, at } = setup();
  tick(5000);
  const e = log.note(PD, { tone: 'ok', text: 'Connected to Pear Drops' });
  assert.deepEqual(e, { n: 1, at: at(), app: PD, dir: null, kind: 'status', method: null, tone: 'ok', text: 'Connected to Pear Drops' });
  log.note(null, { kind: 'note', tone: 'bad', text: 'Not sent: players.changed doesn\'t fit players 1' });
  log.note('com.example.other', { text: 'Connected to Other' });
  assert.deepEqual(log.page(PD).entries.map(x => x.text), ['Not sent: players.changed doesn\'t fit players 1', 'Connected to Pear Drops']);
  assert.equal(log.page(PD).totals.problems, 0, 'a note with no app is nobody\'s problem in the totals');
  assert.equal(log.page(PD).problems, 1, 'but it shows under Problems');
});

test('a hello before Pear Drops says who it is (no app yet) is listed, but not in the totals', () => {
  const { log, msg } = setup();
  log.add(msg({ app: null, kind: 'request', method: 'link.hello', id: 1, data: undefined }));
  const p = log.page(PD);
  assert.equal(p.entries[0].method, 'link.hello');
  assert.equal(p.entries[0].data, undefined, 'the hello keeps no data');
  assert.equal(p.totals.received, 0);
  assert.equal(log.chart(PD).reduce((s, m) => s + m.in, 0), 0);
});

test('the heartbeat: counted, never listed; Pear Drops asks, so when it was last heard is kept; forgotten when the link drops', () => {
  const { log, msg, tick, at } = setup();
  assert.equal(log.add(msg({ kind: 'request', method: 'link.ping', id: 4, bytes: 50, data: {} })), null);
  const heard = at();
  tick(1);
  assert.equal(log.add(msg({ dir: 'out', kind: 'reply', method: 'link.ping', id: 4, ms: 0.4, bytes: 40, data: {} })), null);
  let p = log.page(PD);
  assert.equal(p.total, 0, 'not in the list');
  assert.equal(p.totals.pings, 1);
  assert.equal(p.totals.heard, heard);
  assert.equal(p.totals.received, 1, 'but counted with what went each way');
  assert.equal(p.totals.sent, 1);
  assert.equal(log.chart(PD).reduce((s, m) => s + m.in + m.out, 0), 0, 'nor in the chart');
  // this side asking (it doesn't, but a reply would count as heard)
  tick(20000);
  log.add(msg({ dir: 'out', kind: 'request', method: 'link.ping', id: 9, data: {} }));
  log.add(msg({ kind: 'reply', method: 'link.ping', id: 9, ms: 2, data: {} }));
  p = log.page(PD);
  assert.equal(p.totals.pings, 2);
  assert.equal(p.totals.heard, at());
  // a failed heartbeat is a problem, and listed
  assert.ok(log.add(msg({ kind: 'error', method: 'link.ping', id: 10, data: { code: -32000, message: 'Timed out' } })));
  assert.equal(log.page(PD, { filter: 'problems' }).total, 1);
  log.ended(PD);
  assert.equal(log.page(PD).totals.heard, null, 'a new connection starts afresh');
  log.ended('com.example.nobody');   // (an app it never heard from)
});

test('the chart: messages a minute for the last 30 minutes, oldest first, kept apart from the 500 entries', () => {
  const { log, msg, tick } = setup({ max: 2 });
  log.add(msg({ dir: 'out', kind: 'event', method: 'players.changed' }));
  log.add(msg());
  log.add(msg());
  log.add(msg({ kind: 'error', method: 'drops.farming.get', data: { code: -32601, message: 'No such method' } }));
  tick(60000);
  log.add(msg());
  const m = log.chart(PD);
  assert.equal(m.length, MINUTES);
  assert.deepEqual(m[MINUTES - 2], { out: 1, in: 3, bad: 1 }, 'all four, though only two entries are kept');
  assert.deepEqual(m[MINUTES - 1], { out: 0, in: 1, bad: 0 });
  assert.deepEqual(m[0], { out: 0, in: 0, bad: 0 });
  assert.deepEqual(log.page(PD).minutes, m);
  // an hour on, those minutes are out of the chart, and forgotten
  tick(3 * MINUTES * 60000);
  log.add(msg());
  assert.equal(log.chart(PD).reduce((s, x) => s + x.in + x.out + x.bad, 0), 1);
  assert.equal(log.chart('com.example.nobody').length, MINUTES);
});

test('page options from the page: one of the filters, `before` a whole number or null, 1 to 50 entries', () => {
  assert.deepEqual(pageOptions({ filter: 'in', before: 12, limit: 8 }), { filter: 'in', before: 12, limit: 8 });
  assert.deepEqual(pageOptions({ filter: 'drop table', before: '12', limit: 500 }), { filter: 'all', before: null, limit: 50 });
  assert.deepEqual(pageOptions({ before: 1.5, limit: 0 }), { filter: 'all', before: null, limit: 1 });
  assert.deepEqual(pageOptions(null), { filter: 'all', before: null, limit: 10 });
  assert.deepEqual(pageOptions('all'), { filter: 'all', before: null, limit: 10 });
});
