// "Watch signed in" (Settings › Accounts): on for every site unless switched off. A value saved before it was on
// by default is switched on once, also your own Kick choice kept while Pear Drops' Auto sets Kick.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const ls = (page, k) => page.evaluate(k => localStorage.getItem('kickMultiview.' + k), k);
const watching = page => page.evaluate(() => ({ ...window.watchSignedIn }));
// the page as saved by an earlier version (or this one), loaded again
async function withSaved(page, saved){
  await page.evaluate(saved => {
    localStorage.clear();
    for (const [k, v] of Object.entries(saved)) localStorage.setItem('kickMultiview.' + k, v);
  }, saved);
  await page.reload();
  await page.waitForFunction(() => window.watchSignedIn);
}

test('on for every site by default', async t => {
  const page = await openApp(t);
  await withSaved(page, {});
  assert.deepEqual(await watching(page), { kick: true, twitch: true, youtube: true });
  assert.deepEqual(JSON.parse(await ls(page, 'watchSignedIn')), { kick: true, twitch: true, youtube: true, v: 2 });
});

test('switched off from before it was on by default: on once, with your Kick choice under Pear Drops\' Auto', async t => {
  const page = await openApp(t);
  await withSaved(page, { watchSignedIn: JSON.stringify({ kick: false, twitch: true }), 'link.kickBefore': 'false' });
  assert.deepEqual(await watching(page), { kick: true, twitch: true, youtube: true });
  assert.deepEqual(JSON.parse(await ls(page, 'watchSignedIn')), { kick: true, twitch: true, youtube: true, v: 2 });
  assert.equal(await ls(page, 'link.kickBefore'), 'true', 'Auto off gives you signed-in Kick players');

  // Auto never took over (nothing kept): left as it is
  await withSaved(page, { watchSignedIn: JSON.stringify({ youtube: false }) });
  assert.equal(await ls(page, 'link.kickBefore'), null);
  assert.deepEqual(await watching(page), { kick: true, twitch: true, youtube: true });
});

test('switched off since: stays off', async t => {
  const page = await openApp(t);
  await withSaved(page, { watchSignedIn: JSON.stringify({ kick: false, twitch: true, youtube: false, v: 2 }), 'link.kickBefore': 'false' });
  assert.deepEqual(await watching(page), { kick: false, twitch: true, youtube: false });
  assert.equal(await ls(page, 'link.kickBefore'), 'false');
});
