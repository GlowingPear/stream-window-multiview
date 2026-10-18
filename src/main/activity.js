// Settings › Connected apps › Activity: what went between this app and Pear Drops this run, from Grapevine's
// `message` event (every request, reply, error and event, each way), plus what link.js notices itself (connected,
// disconnected, unpaired, a Test's answer, a message Grapevine dropped). The same as Pear Drops' own log.
//
// Kept in memory only, the last MAX entries. The heartbeat (link.ping, every 20 seconds) isn't an entry: it's
// counted, and when it was last heard kept. Pear Drops connects, so it's the one asking: this side only answers,
// and never knows the round trip.
const MAX = 500;
const MIN = 60000;
const MINUTES = 30;          // the traffic chart's span
const PING = 'link.ping';
const FILTER_NAMES = ['all', 'out', 'in', 'problems'];

const blank = () => ({ sent: 0, received: 0, bytesOut: 0, bytesIn: 0, problems: 0, pings: 0, heard: null, since: null });
// (a first pairing waiting for Allow is answered with an error, but it's how pairing works, not a problem)
const isProblem = e => (e.kind === 'error' && !e.waitsForAllow) || e.tone === 'bad' || e.tone === 'warn';
const FILTERS = { all: () => true, out: e => e.dir === 'out', in: e => e.dir === 'in', problems: isProblem };

// opts: max (entries kept), now (the clock, for the tests).
function createActivity({ max = MAX, now = Date.now } = {}) {
  const entries = [];          // oldest first
  const totals = new Map();    // app id -> blank()
  const minutes = new Map();   // app id -> Map(minute -> { out, in, bad })
  const started = now();
  let n = 0;

  const totalsOf = app => { if (!totals.has(app)) totals.set(app, blank()); return totals.get(app); };
  function count(app, at, key) {
    if (!minutes.has(app)) minutes.set(app, new Map());
    const m = minutes.get(app), minute = Math.floor(at / MIN);
    const slot = m.get(minute) || { out: 0, in: 0, bad: 0 };
    slot[key]++;
    m.set(minute, slot);
    for (const k of m.keys()) if (k < minute - MINUTES * 2) m.delete(k);
  }
  function push(entry) {
    const e = { n: ++n, ...entry };
    entries.push(e);
    if (entries.length > max) entries.splice(0, entries.length - max);
    if (isProblem(e) && e.app) { totalsOf(e.app).problems++; count(e.app, e.at, 'bad'); }
    return e;
  }

  // One of Grapevine's messages ({ at, app, dir, kind, method, id, ms, bytes, data }): the entry, or null for
  // the heartbeat. `app` is null for the hello that arrives before it says who it is.
  function add(m) {
    const app = m.app || null;
    if (app) {
      const t = totalsOf(app);
      if (t.since == null) t.since = m.at;
      if (m.dir === 'out') { t.sent++; t.bytesOut += m.bytes || 0; } else { t.received++; t.bytesIn += m.bytes || 0; }
    }
    if (m.method === PING && m.kind !== 'error') {
      if (app && m.kind === 'request') { const t = totalsOf(app); t.pings++; if (m.dir === 'in') t.heard = m.at; }
      if (app && m.kind === 'reply' && m.dir === 'in') totalsOf(app).heard = m.at;
      return null;
    }
    if (app) count(app, m.at, m.dir === 'out' ? 'out' : 'in');
    const { at, dir, kind, method = null, id, ms, bytes, data, truncated, waitsForAllow } = m;
    return push({ at, app, dir, kind, method, id, ms, bytes, data, ...(truncated ? { truncated: true } : {}), ...(waitsForAllow ? { waitsForAllow: true } : {}) });
  }

  // The link to an app ended: its heartbeat starts again with the next connection.
  const ended = app => { if (totals.has(app)) totals.get(app).heard = null; };

  // Something link.js noticed: kind 'status' (connected, disconnected, a Test) or 'note' (a dropped message),
  // tone 'ok', '', 'warn' or 'bad', and what it's about when that's not the link itself ('players': the page's
  // Kick players, e.g. the wait to sign them back in).
  const note = (app, { kind = 'status', tone = '', text, about, at = now() }) =>
    push({ at, app: app || null, dir: null, kind, method: null, tone, text, ...(about ? { about } : {}) });

  // Messages a minute over the last 30 minutes, oldest first: { out, in, bad }.
  function chart(app, at = now()) {
    const m = minutes.get(app) || new Map(), last = Math.floor(at / MIN);
    return Array.from({ length: MINUTES }, (_, i) => m.get(last - MINUTES + 1 + i) || { out: 0, in: 0, bad: 0 });
  }

  // A page of one app's entries, newest first: those older than entry `before` (the newest when null) that pass
  // `filter`, with the counts (total, newer pages' entries, problems), the totals and the chart's minutes.
  function page(app, { filter = 'all', before = null, limit = 10 } = {}) {
    const pass = FILTERS[filter] || FILTERS.all;
    const theirs = entries.filter(e => e.app === app || e.app === null);
    const mine = theirs.filter(pass);
    const older = before == null ? mine : mine.filter(e => e.n < before);
    return {
      entries: older.slice(-Math.max(1, limit)).reverse(),
      total: mine.length,
      newer: mine.length - older.length,
      problems: theirs.filter(isProblem).length,
      totals: { ...blank(), ...totals.get(app) },
      minutes: chart(app),
      started,
      latest: n
    };
  }

  return { add, note, ended, page, chart };
}

// What the page may ask for (the link:activity call): one of the filters, `before` an entry's number or null,
// and 1 to 50 entries.
function pageOptions(o) {
  o = o && typeof o === 'object' ? o : {};
  const limit = Number.isInteger(o.limit) ? Math.min(50, Math.max(1, o.limit)) : 10;
  return { filter: FILTER_NAMES.includes(o.filter) ? o.filter : 'all', before: Number.isInteger(o.before) ? o.before : null, limit };
}

module.exports = { createActivity, pageOptions, MAX, MINUTES };
