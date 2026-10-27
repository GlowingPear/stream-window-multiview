// Streamer profiles with Linked channels on: a linked streamer is one card and one profile (All sites, or one site),
// with one set of notes for every account. Off: one card per account, as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

const H = 36e5, D = 864e5;
// A desktop app's window.kmv with profiles: three accounts of one streamer, and another streamer
function init([on, H, D]){
  const now = Date.now();
  localStorage.setItem('kickMultiview.saved', JSON.stringify(['quietkoala', 'tw:quietkoala', 'yt:@quietkoala', 'novalynx']));
  localStorage.setItem('kickMultiview.streamers', JSON.stringify([{ id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala'] }]));
  if (on) localStorage.setItem('kickMultiview.linkedOn', '1');
  const fol = { quietkoala: 48200, 'tw:quietkoala': 21300, 'yt:@quietkoala': 9800, novalynx: 3100 };
  // the same three streams on Kick and Twitch (Twitch 10 minutes later), none on YouTube
  const hist = ch => [1, 2, 3].map(i => ({ start: now - i * D + (ch.startsWith('tw') ? 6e5 : 0), end: now - i * D + 4 * H, title: 'Ranked', cat: 'Valorant', peak: ch.startsWith('tw') ? 600 : 1200, exact: true, src: 'app' }));
  const metaSent = window.metaSent = {};
  const api = {
    desktop: true, platform: 'darwin',
    profileList: chs => Promise.resolve(Object.fromEntries(chs.map(c => [c, { info: { name: c.replace(/^(tw:|yt:@)/, ''), followers: fol[c] }, meta: c === 'tw:quietkoala' ? { notes: 'Scrims on Thursdays.', tags: ['fps'] } : {}, last: now - D }]))),
    profileGet: c => Promise.resolve({ ch: c, site: { name: c.replace(/^(tw:|yt:@)/, ''), followers: fol[c], bio: 'Valorant most nights.', url: 'https://example.com/' + c,
      socials: [{ site: 'Twitch', label: 'twitch.tv/quietkoala', url: 'https://twitch.tv/quietkoala' }, { site: 'X', label: 'x.com/quietkoala', url: 'https://x.com/quietkoala' }] },
      summary: { history: c.startsWith('yt') ? [] : hist(c), stats: { streams30: 3, hours30: 12, avgViewers: c.startsWith('tw') ? 600 : 1200, seenWithViewers: 3, avgLength: 4 * H, longest: 4 * H, dayCounts: [1, 1, 1, 0, 0, 0, 0], streak: { current: 3, best: 3 } }, sessions: 3 },
      meta: c === 'tw:quietkoala' ? { notes: 'Scrims on Thursdays.', tags: ['fps'] } : {} }),
    profileMeta: (c, m) => { metaSent[c] = m; return Promise.resolve(); },
    openExternal: () => {}
  };
  const fn = () => Promise.resolve(undefined);
  window.kmv = new Proxy(api, { get: (t, k) => k in t ? t[k] : (typeof k === 'string' && /^on[A-Z]/.test(k) ? () => () => {} : fn) });
}
const live = page => page.evaluate(() => smvNotes.liveStatus({ quietkoala: { live: true, viewers: 1240, title: 'Ranked', checked: Date.now() }, 'tw:quietkoala': { live: true, viewers: 640, checked: Date.now() }, 'yt:@quietkoala': { live: false, checked: Date.now() }, novalynx: { live: false, checked: Date.now() } }));

test('Profiles: a linked streamer is one card, its sites and followers added up, and filters match any account', async t => {
  const page = await openApp(t, { init: `(${init})(${JSON.stringify([true, H, D])})` });
  await live(page);
  await page.click('#profBtn');
  await page.waitForSelector('.pf-card');
  assert.equal(await page.locator('.pf-card').count(), 2, 'one card per streamer');
  assert.equal(await page.textContent('#profDlg .pf-count'), '2 saved · 1 live now');
  const card = page.locator('.pf-card.pf-multi');
  assert.equal(await card.locator('.pf-sites .pi').count(), 3, 'K / T / Y on the card');
  assert.equal(await card.locator('.pf-sites .pi.dim').count(), 1, 'YouTube is offline');
  assert.match(await card.locator('.pf-st').textContent(), /LIVE on Kick and Twitch · 1\.9K watching/);
  assert.match(await card.locator('.pf-foot').textContent(), /79K followers · 3 sites/);
  await page.click('.pf-chips[data-g=plat] [data-v=youtube]');
  assert.equal(await page.locator('.pf-card').count(), 1, 'YouTube: the streamer, by its YouTube account');
  await page.click('.pf-chips[data-g=plat] [data-v=all]');
  await page.click('.pf-chips[data-g=flag] [data-v=notes]');
  assert.equal(await page.locator('.pf-card').count(), 1, 'notes on its Twitch account count for the streamer');
});

test('Profiles: a linked streamer\'s profile adds every site up, merges the same stream on two sites, and keeps one set of notes', async t => {
  const page = await openApp(t, { init: `(${init})(${JSON.stringify([true, H, D])})` });
  await live(page);
  await page.evaluate(() => openProfile('quietkoala'));
  await page.waitForSelector('.pf-view');
  await page.waitForFunction(() => /12 h|11 h/.test(document.querySelector('.pf-stats').textContent) || document.querySelectorAll('.pf-hist tbody tr').length === 3);
  assert.match(await page.textContent('.pf-meta'), /79K followers across 3 sites · Kick 48K · Twitch 21K · YouTube 9\.8K/);
  assert.equal(await page.locator('.pf-socials button').count(), 1, 'the link to their Twitch is left out: it\'s an account now');
  assert.equal(await page.textContent('.pf-view .pf-chips .on'), 'All sites');
  assert.match(await page.textContent('.pf-now'), /Live now on Kick and Twitch/i);
  assert.match(await page.textContent('.pf-now'), /1,880 together/);
  assert.equal(await page.textContent('.pf-now-btns .primary'), 'Watch (tabs: K, T)');
  assert.equal(await page.locator('.pf-hist tbody tr').count(), 3, 'three streams, each on two sites, are three rows');
  assert.equal(await page.locator('.pf-hist tbody tr').first().locator('.pf-hs .pi').count(), 2, 'with both sites');
  assert.equal(await page.locator('.pf-hist tbody tr').first().locator('td.n').textContent(), '1,800', 'peak: the sites added up');
  assert.match(await page.textContent('.pf-stats'), /on 2 sites at once in 3/);
  assert.equal(await page.inputValue('.pf-notes textarea'), 'Scrims on Thursdays.', 'the notes from any account');
  assert.match(await page.textContent('.pf-notes h4'), /one set for quietkoala, on every site/);
  await page.fill('.pf-notes textarea', 'Scrims on Fridays.');
  await page.waitForFunction(() => Object.keys(window.metaSent).length === 3);
  assert.deepEqual(await page.evaluate(() => Object.values(window.metaSent).map(m => m.notes)), ['Scrims on Fridays.', 'Scrims on Fridays.', 'Scrims on Fridays.'], 'written to every account');
  // one site: that account alone, as before
  await page.click('.pf-view .pf-chips button:has-text("Twitch")');
  assert.match(await page.textContent('.pf-meta'), /^21K followers$/);
  assert.equal(await page.locator('.pf-hist tbody tr').count(), 3);
  // opened from a tab's profile button: starts on that site
  await page.evaluate(() => openProfile('tw:quietkoala'));
  await page.waitForSelector('.pf-view');
  assert.equal(await page.textContent('.pf-view .pf-chips .on'), 'TTwitch');
});

test('Profiles: with Linked channels off, every account is its own card', async t => {
  const page = await openApp(t, { init: `(${init})(${JSON.stringify([false, H, D])})` });
  await live(page);
  await page.click('#profBtn');
  await page.waitForSelector('.pf-card');
  assert.equal(await page.locator('.pf-card').count(), 4);
  assert.equal(await page.locator('.pf-card.pf-multi').count(), 0);
  await page.evaluate(() => openProfile('quietkoala'));
  await page.waitForSelector('.pf-prof .pf-hero');
  assert.equal(await page.locator('.pf-view').count(), 0, 'no All sites / site chips');
});
