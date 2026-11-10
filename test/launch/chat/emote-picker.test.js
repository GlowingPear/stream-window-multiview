// The emotes ALL's picker shows for a Kick channel, asked of Kick in the real app with your login (kick.com is a stand-in,
// see app.js): your favourites (web.kick.com, Kick's newer API) first, then the channel's and Kick's.
const test = require('node:test');
const { launchApp, assert } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => { a = await launchApp(); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const FAV = 'https://web.kick.com/api/v1/chat/emotes/favourites';
const kickApi = answers => a.app.evaluate((_, answers) => { globalThis.__kickApi = answers; globalThis.__kickCalls = []; }, answers);
const kickCalls = () => a.app.evaluate(() => globalThis.__kickCalls.map(c => ({ ...c })));
const cookie = (name, value) => a.app.evaluate(({ session }, [name, value]) => session.fromPartition('persist:kick').cookies.set({ url: 'https://kick.com', name, value }), [name, value]);
const pick = ch => a.win.evaluate(ch => window.kmv.emotesPick(ch, true), ch);

test('Kick: your favourites first, asked of web.kick.com with your login (without kick.com\'s XSRF token, which it refuses)', T, async () => {
  await cookie('session_token', encodeURIComponent('42|tok'));
  await cookie('XSRF-TOKEN', 'xsrf');
  await kickApi({
    'GET https://kick.com/emotes/alpha': { status: 200, body: [{ slug: 'alpha', user_id: 0, emotes: [{ id: 1, name: 'alphaHi' }, { id: 2, name: 'alphaWave' }] }, { id: 'Global', emotes: [{ id: 9, name: 'KEKW' }] }] },
    [`GET ${FAV}`]: { status: 200, body: { data: { limit: 30, emotes: [{ id: 9, name: 'KEKW', type: 'global' }, { id: 2, name: 'alphaWave', type: 'subscriber' }] }, message: 'OK' } }
  });
  const g = await pick('alpha');
  assert.deepEqual(g.map(x => [x.label, x.emotes.map(e => e.name)]), [['Favourites', ['KEKW', 'alphaWave']], ['Channel', ['alphaHi', 'alphaWave']], ['Kick', ['KEKW']]]);
  const fav = (await kickCalls()).find(c => c.key === `GET ${FAV}`);
  assert.ok(fav, 'asked');
  assert.equal(fav.auth, 'Bearer 42|tok', 'with your login');
  assert.equal(fav.xsrf, null, 'without the XSRF token');

  // no favourites (signed out, or Kick says no): the rest as before
  await kickApi({ 'GET https://kick.com/emotes/alpha': { status: 200, body: [{ slug: 'alpha', emotes: [{ id: 1, name: 'alphaHi' }] }] }, [`GET ${FAV}`]: { status: 401, body: { message: 'Unauthenticated' } } });
  assert.deepEqual((await pick('alpha')).map(x => x.label), ['Channel']);
});
