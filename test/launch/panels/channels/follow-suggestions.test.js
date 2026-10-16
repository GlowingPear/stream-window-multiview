// Suggestions from the channels you follow, in the real desktop app: Kick's follow list is read by itself when
// you're signed in (even with no saved Kick channels), Twitch's list and who's live on it too, the lists are kept in
// follows.json, the Channels box suggests them, and switching it off forgets them. kick.com and Twitch's API are
// stand-ins, so nothing reaches the real sites.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, assert } = require('../../app');

const T = { timeout: 90000 };
const until = async (fn, ms = 40000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 400)); } };

let a;
const file = () => path.join(a.data, 'Stream Multiview', 'follows.json');
const stored = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } };
test.before(async () => {
  a = await launchApp({ storage: { 'kickMultiview.saved': ['alpha'] } });
  await a.app.evaluate(async ({ session }) => {
    // signed in to Kick, whose follow list has a live channel and an offline one
    const k = session.fromPartition('persist:kick');
    await k.cookies.set({ url: 'https://kick.com', name: 'session_token', value: 'test' });
    k.protocol.unhandle('https');
    const t = globalThis.__fol = { kickAsked: 0, gql: [] };
    k.protocol.handle('https', req => {
      if (/\/api\/v2\/channels\/followed-page/.test(req.url)) {
        t.kickAsked++;
        return new Response(JSON.stringify({ channels: [
          { channel_slug: 'alpha', user_username: 'Alpha', is_live: false },
          { channel_slug: 'delta', user_username: 'DeltaGG', is_live: true, viewer_count: 1240, category_name: 'Games' },
          { channel_slug: 'echo', user_username: 'Echo', is_live: false }], nextCursor: null }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response('<!doctype html><title>kick</title>', { headers: { 'content-type': 'text/html' } });
    });
    // signed in to Twitch: its follow list and who's live on it, from a stand-in for its API
    await session.fromPartition('persist:twitch').cookies.set({ url: 'https://www.twitch.tv', name: 'auth-token', value: 'test' });
    const real = globalThis.fetch;
    globalThis.fetch = async (url, opt) => {
      if (!/gql\.twitch\.tv/.test(String(url))) return real(url, opt);
      const body = String(opt && opt.body || ''); t.gql.push(/follows\(/.test(body) ? 'follows' : /users\(/.test(body) ? 'users' : 'other');
      const json = d => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
      if (/follows\(/.test(body)) return json({ data: { currentUser: { follows: { edges: [{ cursor: '1', node: { login: 'foxtrot', displayName: 'Foxtrot' } }, { cursor: '2', node: { login: 'golf', displayName: 'GolfTV' } }], pageInfo: { hasNextPage: false } } } } });
      if (/users\(/.test(body)) return json({ data: { users: [{ login: 'foxtrot', displayName: 'Foxtrot', stream: { id: '1', title: 'speedruns', viewersCount: 77, createdAt: new Date().toISOString(), game: { name: 'Celeste' } } }, { login: 'golf', displayName: 'GolfTV', stream: null }] } });
      return json({ data: {} });
    };
  });
  // read them now (the app's own first read may have run before these stand-ins were in place): off and on again
  await a.win.evaluate(async () => { await window.kmv.followsSetOn(false); await window.kmv.followsSetOn(true); });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

test('signed in, the follow lists are read by themselves and kept (names only), even with one saved Kick channel', T, async () => {
  const s = await until(() => { const d = stored(); return d && d.kick && d.twitch && d; });
  assert.deepEqual(s.kick.items, [{ ch: 'alpha', name: 'alpha' }, { ch: 'delta', name: 'DeltaGG' }, { ch: 'echo', name: 'echo' }], 'Kick: the whole list (names where the list gives them)');
  assert.deepEqual(s.twitch.items, [{ ch: 'tw:foxtrot', name: 'Foxtrot' }, { ch: 'tw:golf', name: 'GolfTV' }], 'Twitch: its follow list');
  assert.ok((await a.app.evaluate(() => globalThis.__fol)).kickAsked >= 1);
  // who's live among them, for the page
  const f = await until(async () => { const x = await a.win.evaluate(() => window.kmv.followsGet()); return x.live['tw:foxtrot'] && x; });
  assert.equal(f.on, true);
  assert.deepEqual(f.items.map(x => x.ch).sort(), ['alpha', 'delta', 'echo', 'tw:foxtrot', 'tw:golf']);
  assert.deepEqual(Object.keys(f.live).sort(), ['delta', 'tw:foxtrot']);
  assert.equal(f.live.delta.viewers, 1240);
  assert.equal(f.live['tw:foxtrot'].category, 'Celeste');
});

test('the Channels box suggests them: the live ones with an empty box, matches while typing, never one you saved', T, async () => {
  const w = a.win;
  await w.click('#savedBtn');
  await w.waitForSelector('#savedList .fsug');
  assert.deepEqual(await w.$$eval('#savedList .fsug', r => r.map(x => x.dataset.ch)), ['delta', 'tw:foxtrot']);
  await w.fill('#savedInput', 'a');
  assert.deepEqual(await w.$$eval('#savedList .fsug', r => r.map(x => x.dataset.ch)), ['delta']);   // alpha is saved
  await w.fill('#savedInput', 'go');
  assert.deepEqual(await w.$$eval('#savedList .fsug', r => r.map(x => x.dataset.ch)), ['tw:golf']);
  await w.fill('#savedInput', '');
  await w.keyboard.press('Escape');
});

test('switched off, the lists are forgotten and not read again; on again, they come back', T, async () => {
  const w = a.win;
  assert.equal(await w.evaluate(() => window.kmv.followsSetOn(false)), false);
  assert.deepEqual(stored(), { v: 1, off: true }, 'forgotten');
  assert.deepEqual(await w.evaluate(() => window.kmv.followsGet()), { on: false, items: [], live: {} });
  // Import still works, but isn't kept
  const r = await w.evaluate(() => window.kmv.importFollows('twitch'));
  assert.equal(r.items.length, 2);
  assert.deepEqual(stored(), { v: 1, off: true });
  assert.equal(await w.evaluate(() => window.kmv.followsSetOn(true)), true);
  await until(() => { const d = stored(); return d && d.kick && d.twitch; });
});

test('Import follows keeps what it found', T, async () => {
  await a.app.evaluate(() => { const real = globalThis.fetch; globalThis.fetch = (u, o) => (/follows\(/.test(String(o && o.body || '')) && /gql/.test(String(u))
    ? Promise.resolve(new Response(JSON.stringify({ data: { currentUser: { follows: { edges: [{ cursor: '1', node: { login: 'hotel', displayName: 'Hotel' } }], pageInfo: { hasNextPage: false } } } } }), { headers: { 'content-type': 'application/json' } }))
    : real(u, o)); });
  const r = await a.win.evaluate(() => window.kmv.importFollows('twitch'));
  assert.deepEqual(r.items, [{ ch: 'tw:hotel', name: 'Hotel' }]);
  assert.deepEqual(stored().twitch.items, [{ ch: 'tw:hotel', name: 'Hotel' }]);
});
