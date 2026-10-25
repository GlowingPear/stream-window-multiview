// The chat message you right-click (Copy message, Copy message with emotes, Copy message HTML): its text without who
// sent it, with emotes left out or as their text, and the whole message's HTML, on stand-in Kick, Twitch and YouTube lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const img = (src, alt, more = '') => `<img src="${src}" alt="${alt}" ${more} style="display:inline-block;width:28px;height:28px">`;
const KICK = `<div data-index="4"><div class="row"><div><span class="ts">12:01</span><button>quietkoala</button></div><span aria-hidden="true">:&nbsp;</span></div>`
  + `<span class="font-normal">gg ${img('https://files.kick.com/emotes/123/fullsize', 'pearHype', 'data-kmv-new=""')}  well played<span data-kmv-trb="" data-from="SPANISH"></span></span></div>`;
const TWITCH = `<div class="chat-line__message" data-a-target="chat-line-message"><span class="chat-author__display-name">oakleaf</span><span>: </span>`
  + `<span data-a-target="chat-line-message-body"><span class="text-fragment">nice </span>${img('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0', 'lulBlob')}</span></div>`;
const YT = `<yt-live-chat-text-message-renderer><span id="author-name">mossfern</span><span id="message">hello ${img('https://yt3.ggpht.com/abc=w24-h24', 'pearWave', 'shared-tooltip-text=":_pearWave:"')} `
  + `${img('https://www.gstatic.com/youtube/img/emojis/1f602.png', '😂')}</span></yt-live-chat-text-message-renderer>`;
// a Kick line with only an emote, or with no message text at all
const ONLY = (body = '') => `<div data-index="5"><div><div><button>quietkoala</button></div><span aria-hidden="true">:&nbsp;</span></div>${body}</div>`;

async function chat(t, body) {
  const page = await openApp(t, { width: 420, height: 640 });
  await page.evaluate(body => {
    const c = document.createElement('div'); c.id = 'chat';
    c.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:2147483646;background:#0e1112;font:15px sans-serif';
    c.innerHTML = body; document.body.append(c);
    window.emoteAgent(); window.messageAgent();
  }, body);
  return page;
}
const at = (page, sel) => page.evaluate(sel => window.__kmvMsg.messageOf(document.querySelector(sel)), sel);

test('Kick, Twitch and YouTube: the text without the name, with each emote as its text, and the whole message\'s HTML', async t => {
  const page = await chat(t, KICK + TWITCH + YT + ONLY(`<span class="font-normal">${img('https://files.kick.com/emotes/9/fullsize', 'oakCozy')}</span>`));
  const kick = await at(page, '[data-index="4"] .font-normal');
  assert.equal(kick.text, 'gg well played', 'no name, no emote, no translate badge');
  assert.equal(kick.withEmotes, 'gg pearHype well played');
  assert.match(kick.html, /^<div data-index="4">.*quietkoala.*<\/div>$/s, 'the whole message, with its name');
  assert.ok(!/data-kmv/.test(kick.html), 'without what the app added (the badge, the new-emote mark)');
  assert.match(kick.html, /<img src="https:\/\/files\.kick\.com\/emotes\/123\/fullsize" alt="pearHype"/);
  const tw = await at(page, '[data-a-target="chat-line-message-body"] img');
  assert.deepEqual([tw.text, tw.withEmotes], ['nice', 'nice lulBlob'], 'right-clicking the emote: its message');
  assert.match(tw.html, /^<div class="chat-line__message"[^>]*>.*oakleaf/s);
  const yt = await at(page, '#author-name');
  assert.deepEqual([yt.text, yt.withEmotes], ['hello', 'hello :_pearWave: 😂'], 'right-clicking the name: its message; YouTube emojis as you\'d type them');
  assert.match(yt.html, /^<yt-live-chat-text-message-renderer>.*<\/yt-live-chat-text-message-renderer>$/s);
  const only = await at(page, '[data-index="5"] button');
  assert.deepEqual([only.text, only.withEmotes], ['', 'oakCozy'], 'only an emote: nothing without it');
});

test('right-click: ctx() is that message, once and only just after; not a message: null', async t => {
  const page = await chat(t, '<div class="other">Welcome to the chat!</div>' + KICK + ONLY());
  await page.click('[data-index="4"] button', { button: 'right' });
  const m = await page.evaluate(() => window.__kmvMsg.ctx());
  assert.equal(m.text, 'gg well played');
  assert.equal(await page.evaluate(() => window.__kmvMsg.ctx()), null, 'asked once');
  await page.click('#chat .other', { button: 'right' });
  assert.equal(await page.evaluate(() => window.__kmvMsg.ctx()), null, 'not a message');
  await page.click('[data-index="5"] button', { button: 'right' });
  assert.equal(await page.evaluate(() => window.__kmvMsg.ctx()), null, 'a line with no message text');
  await page.click('[data-index="4"] button', { button: 'right' });
  await page.evaluate(() => { const n = Date.now; Date.now = () => n() + 4000; });
  assert.equal(await page.evaluate(() => window.__kmvMsg.ctx()), null, 'too long ago');
  assert.equal(await page.evaluate(() => window.__kmvMsg.messageOf(null)), null);
  assert.equal(await page.evaluate(() => window.__kmvMsg.messageOf(document.querySelector('[data-index="4"] .font-normal').firstChild).text), 'gg well played', 'from a text node too');
  assert.equal(await page.evaluate(() => window.messageAgent()), true, 'loading it twice is fine');
});
