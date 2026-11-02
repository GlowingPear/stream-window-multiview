// Translating a chat (right-click a chat > Translate this chat): the chat helper on stand-in Kick, Twitch and YouTube
// messages, with a stand-in translator answering what it's asked (see translateAgent).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// each site's markup for "name: message", as their chats draw it
const kick = (name, html) => `<div data-index="1"><div><div><div class="inline-flex"><button title="${name}">${name}</button></div><span aria-hidden="true">:&nbsp;</span></div><span class="font-normal">${html}</span></div></div>`;
const twitch = (name, html) => `<div class="chat-line__message"><span class="chat-author__display-name">${name}</span><span>: </span><span data-a-target="chat-line-message-body">${html}</span></div>`;
const yt = (name, html) => `<yt-live-chat-text-message-renderer><span id="author-name">${name}</span><span id="message">${html}</span></yt-live-chat-text-message-renderer>`;
const emote = n => `<span data-emote-name="${n}"><img alt="${n}" src="https://files.kick.com/emotes/1/fullsize" style="width:20px;height:20px"></span>`;
const DICT = { 'hola amigos': ['hello friends', 'es'], 'buenas noches': ['good night', 'es'], 'qué tal': ['how are you', 'es'], 'bonjour à tous': ['hello everyone', 'fr'],
  'mira esto': ['look at this', 'es'], 'nuevo mensaje': ['new message', 'es'], 'hola': ['hello', 'es'] };
const NAMES = { es: 'Spanish', fr: 'French' };

async function chat(t, body) {
  const page = await openApp(t, { width: 600, height: 700 });
  await page.evaluate(([body, DICT, NAMES]) => {
    const c = document.createElement('div'); c.id = 'chat';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0e1112;color:#fff;font:15px sans-serif;overflow:auto';
    c.innerHTML = body; document.body.append(c);
    window.translateAgent();
    window.__asked = [];
    window.__trOffline = false;
    window.__kmvTr.setSend((what, d) => {
      if (what !== 'tr') return;
      window.__asked.push(...d.texts);
      setTimeout(() => window.__kmvTr.got(d.texts, d.texts.map(x => window.__trOffline ? null
        : DICT[x.toLowerCase()] ? { text: DICT[x.toLowerCase()][0], from: DICT[x.toLowerCase()][1], fromName: NAMES[DICT[x.toLowerCase()][1]] } : { same: true })), 20);
    });
  }, [body, DICT, NAMES]);
  return page;
}
const msgs = page => page.$$eval('[data-a-target="chat-line-message-body"], #message, [data-index] span.font-normal', els => els.map(e => ({
  text: e.innerText.replace(/\s+/g, ' ').trim(), badge: e.querySelector('[data-kmv-trb]') ? getComputedStyle(e.querySelector('[data-kmv-trb]'), '::after').content : null })));

test('Translate this chat: every message shown is translated in place, with a TRANSLATED · language badge', async t => {
  const page = await chat(t, [kick('quietkoala', 'hola amigos'), twitch('lofilane', 'Bonjour à tous'), yt('tidepool', 'buenas noches'), kick('pixelpear', 'hello everyone'), kick('nightowl', ':) 123')].join(''));
  assert.deepEqual(await page.evaluate(() => window.__kmvTr.state()), { on: false, auto: false });
  await page.evaluate(() => window.__kmvTr.start(false));
  await page.waitForFunction(() => document.querySelectorAll('[data-kmv-trb]').length === 3);
  assert.deepEqual(await msgs(page), [
    { text: 'hello friends', badge: '"TRANSLATED · SPANISH"' },
    { text: 'hello everyone', badge: '"TRANSLATED · FRENCH"' },
    { text: 'good night', badge: '"TRANSLATED · SPANISH"' },
    { text: 'hello everyone', badge: null },                 // already in your language
    { text: ':) 123', badge: null }                          // no words: not sent
  ]);
  assert.deepEqual((await page.evaluate(() => window.__asked)).sort(), ['Bonjour à tous', 'buenas noches', 'hello everyone', 'hola amigos']);
  assert.deepEqual(await page.evaluate(() => window.__kmvTr.state()), { on: true, auto: false });
  // the names are left alone
  assert.equal(await page.textContent('[data-index] button'), 'quietkoala');
});

test('emotes, @mentions and links in a message stay as they are; only the text around them is sent', async t => {
  const page = await chat(t, kick('quietkoala', `hola ${emote('pearHype')} @nightowl mira esto https://example.com/clip`));
  await page.evaluate(() => window.__kmvTr.start(false));
  await page.waitForSelector('[data-kmv-trb]');
  assert.equal((await msgs(page))[0].text, 'hello @nightowl look at this https://example.com/clip');
  assert.equal(await page.locator('[data-emote-name=pearHype] img').count(), 1, 'the emote is still there');
  assert.deepEqual((await page.evaluate(() => window.__asked)).sort(), ['hola', 'mira esto'], 'never the name, link or emote');
});

test('the badge shows the original and back; Stop translating puts every message back', async t => {
  const page = await chat(t, [kick('a1', 'hola amigos'), twitch('b2', 'qué tal')].join(''));
  await page.evaluate(() => window.__kmvTr.start(false));
  await page.waitForFunction(() => document.querySelectorAll('[data-kmv-trb]').length === 2);
  await page.click('[data-index] [data-kmv-trb]');
  assert.equal((await msgs(page))[0].text, 'hola amigos');
  assert.equal((await msgs(page))[0].badge, '"ORIGINAL · SPANISH"');
  await page.waitForTimeout(300);                          // (the chat changing doesn't translate it again)
  assert.equal((await msgs(page))[0].text, 'hola amigos');
  await page.click('[data-index] [data-kmv-trb]');
  assert.equal((await msgs(page))[0].text, 'hello friends');
  await page.evaluate(() => window.__kmvTr.stop());
  assert.deepEqual(await msgs(page), [{ text: 'hola amigos', badge: null }, { text: 'qué tal', badge: null }]);
  assert.deepEqual(await page.evaluate(() => window.__kmvTr.state()), { on: false, auto: false });
});

test('Translate this message: just that one, with the chat left as it is; it can show the original too; Stop translating puts it back', async t => {
  const page = await chat(t, [kick('a1', 'hola amigos'), twitch('b2', 'qué tal'), kick('c3', 'buenas noches')].join(''));
  assert.equal(await page.evaluate(() => window.__kmvTr.one(document.querySelector('.chat-line__message'))), true, 'its whole line');
  await page.waitForSelector('[data-kmv-trb]');
  assert.deepEqual(await msgs(page), [{ text: 'hola amigos', badge: null }, { text: 'how are you', badge: '"TRANSLATED · SPANISH"' }, { text: 'buenas noches', badge: null }]);
  assert.deepEqual(await page.evaluate(() => window.__asked), ['qué tal'], 'only it is sent');
  assert.deepEqual(await page.evaluate(() => window.__kmvTr.state()), { on: false, auto: false }, 'the chat isn\'t being translated');
  await page.click('.chat-line__message [data-kmv-trb]');
  assert.equal((await msgs(page))[1].text, 'qué tal');
  await page.click('.chat-line__message [data-kmv-trb]');
  // its text, also; not a message: nothing
  await page.evaluate(() => window.__kmvTr.one(document.querySelectorAll('[data-index] span.font-normal')[1]));
  await page.waitForFunction(() => document.querySelectorAll('[data-kmv-trb]').length === 2);
  assert.equal((await msgs(page))[2].text, 'good night');
  assert.deepEqual(await page.evaluate(() => [window.__kmvTr.one(null), window.__kmvTr.one(document.body.appendChild(document.createElement('p')))]), [false, false]);
  // drawn again (the chat redraws it): translated again, without asking
  await page.evaluate(() => { const b = document.querySelector('[data-a-target="chat-line-message-body"]'); b.replaceChildren(document.createTextNode('qué tal')); });
  await page.waitForFunction(() => document.querySelector('[data-a-target="chat-line-message-body"]').innerText.includes('how are you'));
  assert.equal((await page.evaluate(() => window.__asked)).length, 2);
  await page.evaluate(() => window.__kmvTr.stop());
  assert.deepEqual((await msgs(page)).map(m => m.text), ['hola amigos', 'qué tal', 'buenas noches']);
});

test('new messages: only translated with "Translate new messages too"; a message drawn again is translated again without asking', async t => {
  const page = await chat(t, kick('a1', 'hola amigos'));
  await page.evaluate(() => window.__kmvTr.start(false));
  await page.waitForSelector('[data-kmv-trb]');
  const add = (html) => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), html);
  await add(kick('b2', 'nuevo mensaje'));
  await page.waitForTimeout(500);
  assert.equal((await msgs(page))[1].text, 'nuevo mensaje', 'not asked: new messages are off');
  // the chat draws the first message again (scrolling): it's put back translated, from what's known
  const asked = (await page.evaluate(() => window.__asked)).length;
  await page.evaluate(() => { const r = document.querySelector('[data-index]'); r.outerHTML = r.outerHTML.replace(/hello friends<span[^]*?<\/span>/, 'hola amigos'); });
  await page.waitForFunction(() => document.querySelector('[data-index] span.font-normal').innerText.startsWith('hello friends'));
  assert.equal((await page.evaluate(() => window.__asked)).length, asked, 'nothing asked again');
  // with new messages on
  await page.evaluate(() => window.__kmvTr.setAuto(true));
  assert.deepEqual(await page.evaluate(() => window.__kmvTr.state()), { on: true, auto: true });
  await page.waitForFunction(() => document.querySelectorAll('[data-kmv-trb]').length === 2);
  await add(twitch('c3', 'buenas noches'));
  await page.waitForFunction(() => document.querySelectorAll('[data-kmv-trb]').length === 3);
  assert.equal((await msgs(page))[2].text, 'good night');
});

test('offline or refused: the chat stays as it is, quietly', async t => {
  const page = await chat(t, kick('a1', 'hola amigos'));
  await page.evaluate(() => { window.__trOffline = true; window.__kmvTr.start(true); });
  await page.waitForFunction(() => window.__asked.length === 1);
  await page.waitForTimeout(400);
  assert.deepEqual(await msgs(page), [{ text: 'hola amigos', badge: null }]);
  assert.equal(await page.evaluate(() => window.__asked.length), 1, 'not asked again straight away');
});

test('the mention reader skips a message shown translated (it read the original)', async t => {
  const page = await chat(t, kick('a1', 'hola amigos'));
  await page.evaluate(() => window.__kmvTr.start(false));
  await page.waitForSelector('[data-kmv-trb]');
  assert.equal(await page.evaluate(() => window.__kmvTr.has('hello friends')), true);
  assert.equal(await page.evaluate(() => window.__kmvTr.has('hola amigos')), false);
  assert.equal(await page.evaluate(() => window.translateAgent()), true, 'loading it twice is fine');
});

test('Settings > Chat: Translate new messages in every chat is off by default', async t => {
  const page = await openApp(t);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.translateAll')), null);
  await page.evaluate(() => window.openSettings('chat', { sub: 'translate' }));
  assert.equal(await page.isChecked('#trAllSet'), false);
  assert.match(await page.textContent('label:has(#trAllSet)'), /sent to Google Translate; nothing is sent until you switch this on/);
  await page.locator('label:has(#trAllSet)').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.translateAll')), '1');
  await page.locator('label:has(#trAllSet)').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.translateAll')), '0');
});
