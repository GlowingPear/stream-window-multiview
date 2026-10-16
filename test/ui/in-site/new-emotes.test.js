// New emotes: the chat helper marks the emotes the app says are new, also in messages that come in later,
// and stops when you point at one (telling the app). Run in the app's own page, on a stand-in chat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const em = (src, alt) => `<img src="${src}" alt="${alt}" width="28" height="28">`;
const KICK = n => `https://files.kick.com/emotes/${n}/fullsize`;

test('new emotes are marked, also in later messages; pointing at one ends it everywhere and tells the app', async t => {
  const page = await openApp(t);
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.evaluate(h => { const c = document.createElement('div'); c.id = 'chat'; c.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483646'; c.innerHTML = h; document.body.append(c); },
    `<div>ann: ${em(KICK(1), 'pearHype')} ${em(KICK(2), 'oldOne')} ${em('https://cdn.7tv.app/emote/a/1x.webp', 'catJam')} ${em('https://example.com/x.png', 'pearHype')}</div>`);
  assert.equal(await page.evaluate(() => window.newEmoteAgent()), true);
  assert.equal(await page.evaluate(() => window.newEmoteAgent()), true, 'loading it twice is fine');
  await page.evaluate(() => window.__kmvNew.set(['pearHype', 'catJam']));
  const marked = () => page.$$eval('#chat img[data-kmv-new]', e => e.map(i => i.alt + '@' + new URL(i.src).hostname));
  assert.deepEqual(await marked(), ['pearHype@files.kick.com', 'catJam@cdn.7tv.app'], 'only emote-site pictures');
  // a message that comes in later
  await page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), `<div>bob: ${em(KICK(1), 'pearHype')}</div>`);
  await page.waitForFunction(() => document.querySelectorAll('#chat img[data-kmv-new]').length === 3);
  // pointing at one: both pearHype stop, catJam stays, and the app is told
  await page.hover('#chat img[alt=pearHype] >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('#chat img[data-kmv-new]').length === 1);
  assert.deepEqual(await marked(), ['catJam@cdn.7tv.app']);
  for (let i = 0; i < 20 && !logs.some(l => l.startsWith('__kmv:emote-seen')); i++) await page.waitForTimeout(50);
  assert.ok(logs.includes('__kmv:emote-seen {"name":"pearHype"}'));
  assert.deepEqual(await page.evaluate(() => window.__kmvNew.list()), ['catJam']);
  // pointing at one that isn't new: nothing
  await page.hover('#chat img[alt=oldOne]');
  assert.equal(logs.filter(l => l.startsWith('__kmv:emote-seen')).length, 1);
  // switched off: none marked
  await page.evaluate(() => window.__kmvNew.set([]));
  assert.deepEqual(await marked(), []);
  await page.evaluate(() => window.__kmvNew.set('nonsense'));
  assert.deepEqual(await page.evaluate(() => window.__kmvNew.list()), []);
});

test('Settings › General: Highlight new emotes is off by default, and only in the desktop app', async t => {
  const page = await openApp(t);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.newEmotes')), null);
  assert.equal(await page.$eval('#newEmoteSet', i => i.checked), false);
  await page.click('#settingsBtn');
  await page.click('#settingsDlg .st-rail [data-s=general]');
  assert.equal(await page.isVisible('#newEmoteSet'), false, 'the browser version can\'t ask the sites');
});
