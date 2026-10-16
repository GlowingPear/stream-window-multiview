// Emote preview: pointing at an emote in a chat shows it bigger with its name, site, Copy name and Download.
// The chat helper runs on a small stand-in chat page (the emote pictures don't load: the sites are blocked).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// (the sites are blocked, so each picture fails to load: sized in CSS, it keeps its size instead of shrinking to its alt text)
const img = (src, alt, size = 28) => `<img src="${src}" alt="${alt}" style="display:inline-block;width:${size}px;height:${size}px">`;
// The helper runs in the app's own page here (the same code it sends to chat pages), on a stand-in chat.
async function chat(t, body) {
  const page = await openApp(t, { width: 420, height: 640 });
  await page.evaluate(body => {
    const c = document.createElement('div'); c.id = 'chat';
    c.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:2147483646;background:#0e1112;font:15px sans-serif';
    c.innerHTML = body; document.body.append(c);
    window.emoteAgent();
    window.__kmvEmote.on(true);                              // (off unless switched on in Settings)
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

test('what Copy emote text copies: the code, Kick\'s name, and on YouTube the emoji or its shortcode', async t => {
  const page = await chat(t, [
    img('https://files.kick.com/emotes/123/fullsize', 'pearHype'),
    img('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', 'lulBlob'),
    img('https://cdn.7tv.app/emote/abc/1x.webp', 'oakCozy'),
    `<yt-live-chat-text-message-renderer><span id="message">${img('https://yt3.ggpht.com/a=w24-h24', ':_pearWave:')}
      <img src="https://yt3.ggpht.com/b=w24-h24" alt="pearDance" shared-tooltip-text=":_pearDance:" style="width:24px;height:24px">
      ${img('https://www.gstatic.com/youtube/img/emojis/emojis-svg-9/1f602.svg', '😂', 24)}
      ${img('https://yt3.ggpht.com/c=w24-h24', 'plain')}</span></yt-live-chat-text-message-renderer>`
  ].join(' '));
  const texts = await page.evaluate(() => [...document.querySelectorAll('#chat img')].map(i => window.__kmvEmote.emoteOf(i).text));
  assert.deepEqual(texts, ['pearHype', 'lulBlob', 'oakCozy', ':_pearWave:', ':_pearDance:', '😂', ':plain:']);
});

test('the card\'s Copy image asks the app for the picture; Copy name copies the text for this chat', async t => {
  const page = await chat(t, `<div style="height:400px"></div><div>quietkoala: ${img('https://files.kick.com/emotes/123/fullsize', 'pearHype')}</div>`);
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.hover('#chat img[alt=pearHype]');
  await card(page).waitFor({ state: 'visible' });
  assert.deepEqual(await card(page).locator('button').allTextContents(), ['Copy name', 'Copy image', 'Download']);
  const c = await card(page).boundingBox(), b = await card(page).locator('button:text("Copy image")').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + 20, { steps: 4 });
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 40 && !logs.some(l => l.startsWith('__kmv:emote-copy')); i++) await page.waitForTimeout(50);
  assert.ok(logs.includes('__kmv:emote-copy ' + JSON.stringify({ url: 'https://files.kick.com/emotes/123/fullsize', small: 'https://files.kick.com/emotes/123/fullsize', name: 'pearHype' })));
  assert.equal(await card(page).locator('button:text("Copied")').count(), 1);
  // the buttons fit on one line
  const tops = await card(page).locator('button').evaluateAll(bs => bs.map(x => x.getBoundingClientRect().top));
  assert.equal(new Set(tops).size, 1);
});

test('off by default: pointing at an emote shows nothing until the setting is on', async t => {
  const page = await openApp(t, { width: 420, height: 640 });
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), null);
  await page.evaluate(i => { const c = document.createElement('div'); c.id = 'chat'; c.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483646'; c.innerHTML = i; document.body.append(c); },
    img('https://files.kick.com/emotes/123/fullsize', 'pearHype'));
  await page.hover('#chat img');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('kmv-emote-card .card:visible').count(), 0, 'no card');
  await page.click('#settingsBtn');
  assert.equal(await page.isChecked('#emoteSet'), false);
});

test('Settings > General: the example emote shows the same card, with the setting on or off', async t => {
  const page = await openApp(t, { width: 1200, height: 800 });
  await page.click('#settingsBtn');
  assert.match(await page.textContent('label:has(#emoteSet)'), /The same preview is always in the right-click menu on an emote/);
  assert.equal(await page.isChecked('#emoteSet'), false);
  await page.hover('#emoteSample');
  await card(page).waitFor({ state: 'visible' });
  assert.equal(await card(page).locator('.nm').textContent(), 'pearWave');
  assert.match(await card(page).locator('.pic img').getAttribute('src'), /^data:image\/svg\+xml/, 'drawn by the app: nothing fetched');
  const c = await card(page).boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + 30, { steps: 4 });
  await card(page).locator('button:text("Download")').click();
  assert.equal(await card(page).locator('button:text("Only an example")').count(), 1, 'Download does nothing here');
  await card(page).locator('button:text("Copy name")').click();
  await page.waitForFunction(() => document.querySelector('kmv-emote-card').shadowRoot.querySelector('button').textContent === 'Copied');
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  assert.equal(await card(page).isVisible(), false);
  // switched on, and from the button too
  await page.locator('label:has(#emoteSet)').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), '1');
  await page.click('#emoteExample');
  await card(page).waitFor({ state: 'visible' });
  assert.equal(await card(page).locator('.nm').textContent(), 'pearWave');
});

// The right-click menu on an emote (drawn by the app's page with what the main process sends; see showViewMenu)
const MENU = { emote: { name: 'pearHype', site: 'Kick', big: 'https://files.kick.com/emotes/123/fullsize', small: '', animated: true, x: 0, y: 0 },
  items: [{ label: 'Copy emote text', enabled: true }, { sep: true }, { label: 'Open image in new window', enabled: true }, { label: 'Save image as…', enabled: true },
    { label: 'Copy image', enabled: true }, { label: 'Copy image address', enabled: true }, { sep: true },
    { label: 'Translate this chat to English', enabled: true, checked: false }, { label: 'Translate new messages too', enabled: true, checked: true }, { label: 'Disabled one', enabled: false }] };
async function menuAt(page, x, y) {
  await page.evaluate(([d, x, y]) => {
    window.__picked = [];
    const v = document.createElement('div'); v.id = 'fakeView'; v.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%';
    document.getElementById('fakeView')?.remove(); document.body.append(v);
    window.showViewMenu(v, 7, { ...d, emote: { ...d.emote, x, y } }, i => window.__picked.push(i));
  }, [MENU, x, y]);
  return page.locator('.vmenu');
}

test('the emote menu: its preview, the same items as the system menu, and the keyboard', async t => {
  const page = await openApp(t, { width: 900, height: 700 });
  const m = await menuAt(page, 100, 80);
  assert.equal(await m.getAttribute('role'), 'menu');
  assert.equal(await m.locator('.vm-nm').textContent(), 'pearHype');
  assert.equal(await m.locator('.vm-badge').textContent(), 'Kick');
  assert.equal(await m.locator('.vm-sub').textContent(), 'Kick emote');
  assert.equal(await m.locator('.vm-anim').textContent(), 'ANIMATED');
  assert.deepEqual(await m.locator('[role^=menuitem]').allTextContents(), MENU.items.filter(x => !x.sep).map(x => x.label));
  assert.equal(await m.locator('[role=separator]').count(), 2);
  assert.equal(await m.locator('[aria-checked=true]').textContent(), 'Translate new messages too');
  assert.equal(await m.locator('[aria-disabled=true]').textContent(), 'Disabled one');
  const b = await m.boundingBox();
  assert.deepEqual([b.x, b.y], [100, 80], 'where you right-clicked');
  // arrows, wrapping round and skipping what's off; a letter jumps; Enter chooses
  await page.keyboard.press('ArrowDown');
  assert.equal(await m.locator('.cur').textContent(), 'Copy emote text');
  await page.keyboard.press('ArrowUp');
  assert.equal(await m.locator('.cur').textContent(), 'Translate new messages too', 'up from the first: the last one that works');
  await page.keyboard.press('s');
  assert.equal(await m.locator('.cur').textContent(), 'Save image as…');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.__picked), [3], 'its place in the list the main process sent');
  assert.equal(await page.locator('.vmenu').count(), 0, 'closed');
  // the mouse; a disabled item does nothing
  const m2 = await menuAt(page, 100, 80);
  await m2.locator('text=Disabled one').click({ force: true });
  assert.equal(await page.locator('.vmenu').count(), 1);
  await m2.locator('text=Copy emote text').click();
  assert.deepEqual(await page.evaluate(() => window.__picked), [0]);
  // Esc, and a click outside, close it without choosing
  await menuAt(page, 100, 80);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.vmenu').count(), 0);
  await menuAt(page, 100, 80);
  await page.mouse.click(600, 600);
  assert.equal(await page.locator('.vmenu').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__picked), []);
});

test('the emote menu stays inside the window: near the right or bottom edge it opens the other way', async t => {
  const page = await openApp(t, { width: 700, height: 560 });
  const m = await menuAt(page, 690, 550);
  const b = await m.boundingBox();
  assert.ok(b.x + b.width <= 700 && b.y + b.height <= 560 && b.x >= 0 && b.y >= 0, JSON.stringify(b));
  assert.ok(Math.abs(b.x + b.width - 690) < 2, 'to the left of the pointer');
  // taller than the room above or below: kept inside anyway
  const page2 = await openApp(t, { width: 700, height: 420 });
  const b2 = await (await menuAt(page2, 20, 200)).boundingBox();
  assert.ok(b2.y >= 0 && b2.y + b2.height <= 420, JSON.stringify(b2));
});
