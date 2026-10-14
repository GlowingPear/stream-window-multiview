// Emote preview: pointing at an emote in a chat shows it bigger with its name, site, Copy name and Download.
// The chat helper runs on a small stand-in chat page (the emote pictures don't load: the sites are blocked).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./app');
const { openApp } = setup();

const img = (src, alt, size = 28) => `<img src="${src}" alt="${alt}" width="${size}" height="${size}">`;
// The helper runs in the app's own page here (the same code it sends to chat pages), on a stand-in chat.
async function chat(t, body) {
  const page = await openApp(t, { width: 420, height: 640 });
  await page.evaluate(body => {
    const c = document.createElement('div'); c.id = 'chat';
    c.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:2147483646;background:#0e1112;font:15px sans-serif';
    c.innerHTML = body; document.body.append(c);
    window.emoteAgent();
  }, body);
  return page;
}
const card = page => page.locator('kmv-emote-card .card');

test('which pictures are emotes, and the bigger picture for each site', async t => {
  const page = await chat(t, [
    img('https://files.kick.com/emotes/123/fullsize', 'pearHype'),
    img('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', 'lulBlob'),
    img('https://static-cdn.jtvnw.net/emoticons/v2/99/animated/dark/2.0', 'spinny'),
    img('https://cdn.7tv.app/emote/abc/1x.webp', 'oakCozy'),
    img('https://cdn.betterttv.net/emote/def/1x', 'catJam'),
    img('https://cdn.frankerfacez.com/emote/77/1', 'ffzOne'),
    img('https://files.kick.com/emotes/5/fullsize', ''),                     // no name
    img('https://files.kick.com/images/user/1/profile_image/a.webp', 'avatar'),// not an emote picture
    img('https://example.com/x.png', 'other'),
    img('https://files.kick.com/emotes/9/fullsize', 'huge', 200)             // too big to be in a message
  ].join(' '));
  const all = await page.evaluate(() => [...document.querySelectorAll('#chat img')].map(i => { const e = window.__kmvEmote.emoteOf(i); return e && [e.name, e.site, e.big, e.animated, e.addOn]; }));
  assert.deepEqual(all, [
    ['pearHype', 'Kick', 'https://files.kick.com/emotes/123/fullsize', false, false],
    ['lulBlob', 'Twitch', 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0', false, false],
    ['spinny', 'Twitch', 'https://static-cdn.jtvnw.net/emoticons/v2/99/animated/dark/3.0', true, false],
    ['oakCozy', '7TV', 'https://cdn.7tv.app/emote/abc/4x.webp', false, true],
    ['catJam', 'BTTV', 'https://cdn.betterttv.net/emote/def/3x', false, true],
    ['ffzOne', 'FFZ', 'https://cdn.frankerfacez.com/emote/77/4', false, true],
    null, null, null, null
  ]);
  assert.equal(await page.evaluate(() => window.__kmvEmote.emoteOf(document.body)), null);
  assert.equal(await page.evaluate(() => window.emoteAgent()), true, "loading it twice is fine");
});

test('pointing at an emote shows the card; it stays while you move onto it, Copy name and Download work, and it goes away', async t => {
  const page = await chat(t, `<div style="height:400px"></div><div>quietkoala: hi ${img('https://files.kick.com/emotes/123/fullsize', 'pearHype')}
    ${img('https://static-cdn.jtvnw.net/emoticons/v2/99/animated/dark/1.0', 'spinny')}</div>`);
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.hover('#chat img[alt=pearHype]');
  await card(page).waitFor({ state: 'visible' });
  assert.equal(await card(page).locator('.nm').textContent(), 'pearHype');
  assert.equal(await card(page).locator('.badge').textContent(), 'Kick');
  assert.equal(await card(page).locator('.sub').textContent(), 'Kick emote');
  assert.equal(await card(page).locator('.pic img').getAttribute('src'), 'https://files.kick.com/emotes/123/fullsize');
  assert.equal(await card(page).locator('.anim').count(), 0);
  const e = await page.locator('#chat img[alt=pearHype]').boundingBox(), c = await card(page).boundingBox();
  assert.ok(c.y + c.height <= e.y, 'above the emote');

  // onto the card: it stays, and its buttons work
  await page.mouse.move(c.x + c.width / 2, c.y + c.height - 20, { steps: 4 });
  await page.waitForTimeout(400);
  assert.ok(await card(page).isVisible(), 'still there over the card');
  await card(page).locator('button:text("Download")').click();
  for (let i = 0; i < 40 && !logs.some(l => l.startsWith('__kmv:emote-dl')); i++) await page.waitForTimeout(50);
  assert.ok(logs.some(l => l === '__kmv:emote-dl ' + JSON.stringify({ url: 'https://files.kick.com/emotes/123/fullsize', small: 'https://files.kick.com/emotes/123/fullsize', name: 'pearHype' })), 'asks the app to download it: ' + JSON.stringify(logs));
  await card(page).locator('button:text("Copy name")').click();
  await page.waitForFunction(() => document.querySelector('kmv-emote-card').shadowRoot.querySelector('button').textContent === 'Copied');

  // the next emote: straight away, with its own details
  await page.hover('#chat img[alt=spinny]');
  await page.waitForFunction(() => document.querySelector('kmv-emote-card').shadowRoot.querySelector('.nm').textContent === 'spinny');
  assert.equal(await card(page).locator('.anim').textContent(), 'ANIMATED');
  assert.equal(await card(page).locator('.badge').textContent(), 'Twitch');

  // away from both: it goes
  await page.mouse.move(5, 5);
  await card(page).waitFor({ state: 'hidden' });
  // Esc closes it, and switched off nothing shows
  await page.hover('#chat img[alt=pearHype]'); await card(page).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape'); await card(page).waitFor({ state: 'hidden' });
  await page.mouse.move(5, 5);
  await page.evaluate(() => window.__kmvEmote.on(false));
  await page.hover('#chat img[alt=pearHype]'); await page.waitForTimeout(400);
  assert.equal(await card(page).isVisible(), false);
});

test('near the top of the chat the card opens below the emote; add-on emotes say where they come from', async t => {
  const page = await chat(t, `<div style="position:fixed;top:8px;right:8px">${img('https://cdn.7tv.app/emote/abc/1x.webp', 'oakCozy')}</div>`);
  await page.hover('#chat img[alt=oakCozy]');
  await card(page).waitFor({ state: 'visible' });
  const e = await page.locator('#chat img[alt=oakCozy]').boundingBox(), c = await card(page).boundingBox();
  assert.ok(c.y >= e.y + e.height, 'below the emote');
  assert.ok(c.x + c.width <= 420, 'inside the window');
  assert.equal(await card(page).locator('.badge').textContent(), 'Add-on');
  assert.equal(await card(page).locator('.sub').textContent(), 'From the 7TV add-on');
  assert.match(await card(page).locator('.tip').getAttribute('class'), /up/);
});
