// Raids: a chat (or player) that moves to another channel is a raid. Every window of the old channel
// switches to the new one in the same place; pages that aren't a channel are left alone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, windows, press } = require('../app');
const { openApp } = setup();

test('which addresses count as a raid to another channel', async t => {
  const page = await openApp(t);
  const target = (kind, channel, url) => page.evaluate(([kind, channel, url]) => window.raidTarget({ kind, channel }, url), [kind, channel, url]);
  // Kick chat: the new channel's page, its pop-out chat or its chatroom
  assert.equal(await target('chat', 'alpha', 'https://kick.com/Bravo'), 'bravo');
  assert.equal(await target('chat', 'alpha', 'https://kick.com/popout/bravo/chat'), 'bravo');
  assert.equal(await target('chat', 'alpha', 'https://kick.com/bravo/chatroom'), 'bravo');
  assert.equal(await target('chat', 'alpha', 'https://kick.com/popout/alpha/chat'), 'alpha');
  for (const u of ['https://kick.com/login', 'https://kick.com/categories', 'https://kick.com/following', 'https://kick.com/bravo/videos/123',
    'https://kick.com/', 'https://kick.com/x', 'https://example.com/bravo', 'not a link', 'https://player.kick.com/bravo'])
    assert.equal(await target('chat', 'alpha', u), null, u);
  // Kick player
  assert.equal(await target('stream', 'alpha', 'https://player.kick.com/bravo?autoplay=true'), 'bravo');
  assert.equal(await target('stream', 'alpha', 'https://kick.com/bravo'), null, 'a player only follows to a player');
  // Twitch
  assert.equal(await target('chat', 'tw:alpha', 'https://www.twitch.tv/popout/bravo/chat?popout='), 'tw:bravo');
  assert.equal(await target('chat', 'tw:alpha', 'https://www.twitch.tv/bravo?referrer=raid'), 'tw:bravo');
  assert.equal(await target('chat', 'tw:alpha', 'https://www.twitch.tv/directory'), null);
  assert.equal(await target('chat', 'tw:alpha', 'https://www.twitch.tv/bravo/videos'), null);
  assert.equal(await target('chat', 'tw:alpha', 'https://player.twitch.tv/?channel=bravo'), null);
  assert.equal(await target('stream', 'tw:alpha', 'https://player.twitch.tv/?channel=Bravo&parent=localhost'), 'tw:bravo');
  assert.equal(await target('stream', 'tw:alpha', 'https://www.twitch.tv/bravo'), null);
  // not a raid: other sites, YouTube, windows without a channel
  assert.equal(await target('chat', 'alpha', 'https://www.twitch.tv/bravo'), null, 'Kick chat to Twitch');
  assert.equal(await target('chat', 'yt:@alpha', 'https://www.youtube.com/@bravo'), null);
  assert.equal(await target('web', 'alpha', 'https://kick.com/bravo'), null);
  assert.equal(await page.evaluate(() => window.raidTarget({ kind: 'web' }, 'https://kick.com/bravo')), null);
});

test('a raid switches the stream and chat in place, keeps the highlight and the column order, and says so', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'charlie');
  await press(page, 'c');                                         // Columns
  await page.click('#stage .win.stream:has(.title:text-is("alpha")) [data-a=feat]');
  await page.waitForTimeout(700);                                 // layouts ease into place
  const before = await windows(page);
  await page.evaluate(() => window.followRaid('alpha', 'bravo', true));
  await page.waitForTimeout(700);
  const after = await windows(page);
  assert.deepEqual(after.map(w => [w.kind, w.title]).sort(), [['chat', 'bravo'], ['chat', 'charlie'], ['stream', 'bravo'], ['stream', 'charlie']]);
  const at = (l, kind, title) => l.find(w => w.kind === kind && w.title === title);
  for (const kind of ['stream', 'chat']) {
    const a = at(before, kind, 'alpha'), b = at(after, kind, 'bravo');
    assert.deepEqual([b.x, b.y, b.w, b.h, b.featured], [a.x, a.y, a.w, a.h, a.featured], kind + ' in the same place');
  }
  assert.equal(at(after, 'stream', 'bravo').featured, true, 'still the big one');
  assert.match(await page.textContent('#msg'), /alpha raided bravo: switched to them/);
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.colOrder') || '[]'));
  assert.ok(store.includes('bravo') && !store.includes('alpha'), 'the column order keeps its spot');
  // the same raid reported again (the stream and chat both see it): nothing more happens
  await page.evaluate(() => window.followRaid('alpha', 'bravo', true));
  assert.equal((await windows(page)).length, 4);
});

test('a raid to a channel that is already open closes the old windows instead of doubling up', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await page.evaluate(() => window.followRaid('alpha', 'bravo', false));
  assert.deepEqual((await windows(page)).map(w => [w.kind, w.title]).sort(), [['chat', 'bravo'], ['stream', 'bravo']]);
  // other sites, the same channel, nothing open: nothing happens
  await page.evaluate(() => { window.followRaid('bravo', 'tw:bravo', false); window.followRaid('bravo', 'bravo', false); window.followRaid('zulu', 'yankee', false); window.followRaid('', 'x', false); });
  assert.equal((await windows(page)).length, 2);
});
