// Channel name in chat boxes: the setting in Settings > General (its text, suggestions and sample box), and the
// script inside a chat page on stand-ins built like each site's chat box (Kick's Lexical editor and the separate
// element with its text, Twitch's Slate editor, YouTube's #label), as the sites redraw them.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const saved = (page, k) => page.evaluate(k => localStorage.getItem('kickMultiview.' + k), k);

test('Channel name in chat boxes: off at first; on, a text field with suggestions and a sample box, saved', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('chat'));
  assert.equal(await page.isChecked('#chatNameSet'), false, 'off at first');
  assert.equal(await page.isVisible('#chatNameRow'), false, 'the text only while it\'s on');
  await page.check('#chatNameSet');
  assert.equal(await page.isVisible('#chatNameRow'), true);
  assert.equal(await page.textContent('#chatNameSample'), 'Pixel_Bandit', 'just the name at first');
  assert.deepEqual(await page.$$eval('#chatNameIdeas button', l => l.map(b => b.textContent)), ['{channel}', 'Chat in {channel}', 'Typing in {channel}', 'Message {channel}', '→ {channel}']);
  assert.ok(await page.$eval('#chatNameIdeas [data-t="{channel}"]', b => b.classList.contains('on')));
  // your own text: the sample shows it as you type
  await page.fill('#chatNameText', 'Typing in {channel}');
  assert.equal(await page.textContent('#chatNameSample'), 'Typing in Pixel_Bandit');
  await page.fill('#chatNameText', 'Over to');
  assert.equal(await page.textContent('#chatNameSample'), 'Over to Pixel_Bandit', 'no {channel}: the name at the end');
  // a suggestion fills it in
  await page.click('#chatNameIdeas [data-t="Chat in {channel}"]');
  assert.equal(await page.inputValue('#chatNameText'), 'Chat in {channel}');
  assert.equal(await page.textContent('#chatNameSample'), 'Chat in Pixel_Bandit');
  assert.ok(await page.$eval('#chatNameIdeas [data-t="Chat in {channel}"]', b => b.classList.contains('on')));
  assert.equal(await saved(page, 'chatNameText'), 'Chat in {channel}');
  // after a restart, as you left it
  await page.reload();
  await page.evaluate(() => window.openSettings('chat'));
  assert.equal(await page.isChecked('#chatNameSet'), true);
  assert.equal(await page.inputValue('#chatNameText'), 'Chat in {channel}');
  // just the name again: nothing saved
  await page.click('#chatNameIdeas [data-t="{channel}"]');
  assert.equal(await page.inputValue('#chatNameText'), '');
  assert.equal(await saved(page, 'chatNameText'), null);
  await page.uncheck('#chatNameSet');
  assert.equal(await page.isVisible('#chatNameRow'), false);
  // changed in the other window: shown here too
  await page.evaluate(() => { localStorage.setItem('kickMultiview.chatName', '1'); localStorage.setItem('kickMultiview.chatNameText', 'Message {channel}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.chatName', newValue: '1' })); });
  await page.waitForFunction(() => document.querySelector('#chatNameSet').checked);
  assert.equal(await page.textContent('#chatNameSample'), 'Message Pixel_Bandit');
});

// A stand-in chat box in the app's own page (so the script's code counts for coverage), with the site's settings
const BOXES = {
  kick: '<div class="relative w-full"><div data-testid="chat-input" contenteditable="true" class="editor-input"><p class="editor-paragraph"><br></p></div><div class="pointer-events-none absolute">Send a message</div></div>',
  twitch: '<div class="glFavL"><p class="chat-wysiwyg-input__placeholder" aria-hidden="true" title="Send a message">Send a message</p><div role="textbox" data-a-target="chat-input" aria-label="Send a message" data-placeholder="Send a message" contenteditable="true"><div><span>​</span></div></div></div>',
  youtube: '<yt-live-chat-text-input-field-renderer><div id="label"><span>Chat…</span></div><div id="input" contenteditable="true" aria-label="Chat…"></div></yt-live-chat-text-input-field-renderer>'
};
async function boxOf(t, site) {
  const page = await openApp(t);
  await page.evaluate(async ([site, html]) => {
    const cfg = (await import(`./page/platforms/${site}.js`))[site].chatBox;
    const d = document.createElement('div'); d.id = 'standin'; d.innerHTML = html; document.body.append(d);
    window.chatNameAgent(cfg);
    window.boxCfg = cfg;
  }, [site, BOXES[site]]);
  return page;
}
const hint = page => page.evaluate(() => document.querySelector(window.boxCfg.hint).textContent);
const boxAttrs = page => page.evaluate(() => { const b = document.querySelector(window.boxCfg.box); return window.boxCfg.attrs.map(a => b.getAttribute(a)); });
const setText = (page, t) => page.evaluate(t => window.__kmvName.set(t), t);
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 3000 });

test('the chat box on Kick: the name instead of Send a message, kept as the site redraws it, and the site\'s text back when off', async t => {
  const page = await boxOf(t, 'kick');
  await setText(page, 'Bestenya');
  assert.equal(await hint(page), 'Bestenya');
  // the site puts its text back (React redrawing the same text): the name again
  await page.evaluate(() => { document.querySelector(window.boxCfg.hint).firstChild.nodeValue = 'Send a message'; });
  await until(page, () => document.querySelector(window.boxCfg.hint).textContent === 'Bestenya');
  // a whole new box (the chat reconnected)
  await page.evaluate(html => { document.getElementById('standin').innerHTML = html; }, BOXES.kick);
  await until(page, () => document.querySelector(window.boxCfg.hint).textContent === 'Bestenya');
  // what you type is yours
  await page.evaluate(() => { document.querySelector(window.boxCfg.box).firstChild.textContent = 'hello chat'; });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.querySelector(window.boxCfg.box).textContent), 'hello chat');
  // another text, then off: the site's own text back
  await setText(page, 'Chat in Bestenya');
  assert.equal(await hint(page), 'Chat in Bestenya');
  assert.equal(await page.evaluate(() => window.__kmvName.get()), 'Chat in Bestenya');
  await setText(page, '');
  assert.equal(await hint(page), 'Send a message');
  // off stays off as the site redraws
  await page.evaluate(html => { document.getElementById('standin').innerHTML = html; }, BOXES.kick);
  await page.waitForTimeout(200);
  assert.equal(await hint(page), 'Send a message');
  // running it again (a chat that loaded again) keeps the one that's there
  assert.equal(await page.evaluate(() => window.chatNameAgent(window.boxCfg)), true);
});

test('the chat box on Twitch: its text, title, label and placeholder all say the name; a box that says why you can\'t chat keeps it', async t => {
  const page = await boxOf(t, 'twitch');
  await setText(page, 'Corgicam');
  assert.equal(await hint(page), 'Corgicam');
  assert.deepEqual(await boxAttrs(page), ['Corgicam', 'Corgicam'], 'aria-label and data-placeholder, for screen readers too');
  assert.equal(await page.getAttribute('.chat-wysiwyg-input__placeholder', 'title'), 'Corgicam');
  // the site sets its own attributes again: the name again
  await page.evaluate(() => document.querySelector(window.boxCfg.box).setAttribute('aria-label', 'Send a message'));
  await until(page, () => document.querySelector(window.boxCfg.box).getAttribute('aria-label') === 'Corgicam');
  // followers-only: the site's words stay
  await page.evaluate(() => { const p = document.querySelector(window.boxCfg.hint); p.firstChild.nodeValue = 'Followers-only mode'; p.title = 'Followers-only mode'; });
  await page.waitForTimeout(250);
  assert.equal(await hint(page), 'Followers-only mode');
  assert.equal(await page.getAttribute('.chat-wysiwyg-input__placeholder', 'title'), 'Followers-only mode');
  // off: the site's own words back where it still showed the name, followers-only untouched
  await setText(page, '');
  assert.equal(await hint(page), 'Followers-only mode');
  assert.deepEqual(await boxAttrs(page), ['Send a message', 'Send a message']);
});

test('the chat box on YouTube: its label and the box\'s label say the name', async t => {
  const page = await boxOf(t, 'youtube');
  await setText(page, 'Lofi Girl');
  assert.equal(await hint(page), 'Lofi Girl', 'its words are inside another element');
  assert.deepEqual(await boxAttrs(page), ['Lofi Girl']);
  await setText(page, '  ');
  assert.equal(await hint(page), 'Chat…');
  assert.deepEqual(await boxAttrs(page), ['Chat…']);
});
