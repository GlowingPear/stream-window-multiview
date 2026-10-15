// Channel names: once the app has seen a channel's display name (live checks, imports, profiles, YouTube
// pages), it shows that instead of the lowercase id: in title bars, the Channels panel and messages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, windows } = require('./app');
const { openApp } = setup();

const SAVED = ['pixelbandit', 'retro-rally', 'tw:nightowlgames', 'tw:kanjiname', 'yt:@maplerye', 'yt:c:UCabcdefghijklmnop'];
const savedNames = async page => {
  if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
  return page.$$eval('#savedList .nm', els => els.map(e => e.textContent).sort());
};

test('display names from a live check replace the lowercase ids, but only for the same handle', async t => {
  const page = await openApp(t);
  await page.evaluate(saved => { localStorage.setItem('kickMultiview.saved', JSON.stringify(saved)); }, SAVED);
  await page.reload();
  await add(page, 'pixelbandit', 'twitch:nightowlgames');
  assert.deepEqual((await windows(page)).filter(w => w.kind === 'stream').map(w => w.title).sort(), ['nightowlgames', 'pixelbandit']);

  await page.evaluate(() => smvNotes.liveStatus({
    pixelbandit: { live: true, name: 'PixelBandit', checked: Date.now() },
    'retro-rally': { live: false, name: 'Retro_Rally', checked: Date.now() },      // Kick swaps _ for - in the address
    'tw:nightowlgames': { live: false, name: 'NightOwlGames', checked: Date.now() },
    'tw:kanjiname': { live: false, name: '漢字', checked: Date.now() },              // another script: keeps the handle
    'yt:@maplerye': { live: false, name: 'Maple & Rye', checked: Date.now() },      // a @handle stays as it is
    'yt:c:UCabcdefghijklmnop': { live: false, name: 'Some Channel', checked: Date.now() },
    gone: { missing: true, name: 'Gone' }
  }));
  assert.deepEqual((await windows(page)).filter(w => w.kind === 'stream').map(w => w.title).sort(), ['NightOwlGames', 'PixelBandit']);
  assert.deepEqual(await savedNames(page), ['@maplerye', 'kanjiname', 'NightOwlGames', 'PixelBandit', 'Retro_Rally', 'Some Channel'].sort());

  // a name that's only the id again, or empty, doesn't undo it; search still finds it by its id
  await page.evaluate(() => smvNotes.liveStatus({ pixelbandit: { live: false, name: 'pixelbandit' }, 'tw:nightowlgames': { live: false, name: '' } }));
  assert.ok((await savedNames(page)).includes('PixelBandit'));
  await page.fill('#savedInput', 'nightowl');
  assert.deepEqual(await page.$$eval('#savedList .nm', els => els.map(e => e.textContent)), ['NightOwlGames']);
  await page.fill('#savedInput', '');

  // kept for next time
  await page.reload();
  assert.deepEqual(await savedNames(page), ['@maplerye', 'kanjiname', 'NightOwlGames', 'PixelBandit', 'Retro_Rally', 'Some Channel'].sort());
});

test('names learned earlier for YouTube ids are kept, and names learned in the other window show here', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    localStorage.setItem('kickMultiview.saved', JSON.stringify(['tw:nightowlgames', 'yt:c:UCabcdefghijklmnop']));
    localStorage.setItem('kickMultiview.ytNames', JSON.stringify({ 'yt:c:UCabcdefghijklmnop': 'Some Channel' }));
  });
  await page.reload();
  assert.deepEqual(await savedNames(page), ['Some Channel', 'nightowlgames']);

  // the streams window learned a name: it arrives as a storage change
  await page.evaluate(() => {
    const send = v => window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.chNames', newValue: v }));
    send('not json'); send(JSON.stringify({ 'tw:nightowlgames': 7 }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.other', newValue: '{}' }));
    send(JSON.stringify({ 'tw:nightowlgames': 'NightOwlGames', 'yt:c:UCabcdefghijklmnop': 'Some Channel' }));
  });
  assert.deepEqual(await savedNames(page), ['NightOwlGames', 'Some Channel'].sort());
});
