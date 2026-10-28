// Sending from ALL (in-site/send.js): the text goes into the site's chat box as typing would and is sent as Enter or
// the send button would. Stand-in boxes in the app's own page (so its code counts for coverage).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// a box like the sites' (an editor you can type in), Enter and a send button that record what they'd send and empty
// the box, as the sites do; deaf: how many presses it misses first (an editor not ready yet)
const addBox = (page, { editable = 'true', disabled = false, button = false, slate = false, deaf = 0 } = {}) => page.evaluate(([editable, disabled, button, slate, deaf]) => {
  document.getElementById('sd-wrap')?.remove();
  window.__sent = [];
  const wrap = document.createElement('div'); wrap.id = 'sd-wrap'; if (disabled) wrap.setAttribute('aria-disabled', 'true');
  const b = document.createElement('div'); b.id = 'sd-box'; b.contentEditable = editable;
  window.__presses = 0;
  const sent = how => { window.__presses++; if (window.__presses <= deaf) return; window.__sent.push(how + ':' + b.innerText.trim()); b.textContent = ''; };
  b.addEventListener('keydown', e => { if (e.key === 'Enter') sent('enter'); });
  wrap.append(b);
  if (button){ const s = document.createElement('button'); s.setAttribute('data-a-target', 'chat-send-button'); s.onclick = () => sent('button'); wrap.append(s); }
  if (slate){   // Twitch's editor: its own state, which typed input doesn't reach
    const editor = { children: [{ type: 'paragraph', children: [{ text: 'old text' }] }], selection: null,
      deleteFragment(){ this.children = [{ type: 'paragraph', children: [{ text: '' }] }]; }, insertText(t){ this.children[0].children[0].text += t; b.textContent = this.children[0].children[0].text; } };
    b['__reactFiber$x'] = { memoizedProps: {}, return: { memoizedProps: { editor } } };
    window.__slate = editor;
  }
  document.body.append(wrap);
}, [editable, disabled, button, slate, deaf]);
const send = (page, site, text = 'hello chat') => page.evaluate(([site, text]) => window.sendAgent(site, text, '#sd-box'), [site, text]);

test('a box that takes typed text: it\'s filled and sent with Enter, or the send button where the site has one', async t => {
  const page = await openApp(t);
  await addBox(page);
  assert.equal(await send(page, 'kick'), 'sent');
  assert.deepEqual(await page.evaluate(() => window.__sent), ['enter:hello chat']);
  await addBox(page, { button: true });
  assert.equal(await send(page, 'twitch', 'gg'), 'sent');
  assert.deepEqual(await page.evaluate(() => window.__sent), ['button:gg'], 'the button, not Enter');
});

test('Twitch\'s editor gets the text through its own insertText (what was in it replaced), then the button', async t => {
  const page = await openApp(t);
  await addBox(page, { button: true, slate: true });
  assert.equal(await send(page, 'twitch', 'new words'), 'sent');
  assert.equal(await page.evaluate(() => window.__slate.children[0].children[0].text), 'new words');
  assert.deepEqual(await page.evaluate(() => window.__sent), ['button:new words']);
});

test('a press the site missed (its editor not ready): pressed again until its box empties; one it never takes: not-sent', async t => {
  const page = await openApp(t);
  await addBox(page, { button: true, slate: true, deaf: 1 });
  assert.equal(await send(page, 'twitch', 'second try'), 'sent');
  assert.deepEqual(await page.evaluate(() => [window.__presses, window.__sent]), [2, ['button:second try']], 'sent once');
  await addBox(page, { deaf: 9 });
  assert.equal(await send(page, 'kick', 'never'), 'not-sent');
  assert.equal(await page.evaluate(() => window.__presses), 3, 'three presses, then it says so');
});

test('no box, a box the site has turned off, or one that won\'t take the text: it says why, and sends nothing', async t => {
  const page = await openApp(t);
  assert.equal(await page.evaluate(() => window.sendAgent('youtube', 'hi', '#nothing-here')), 'no-box');
  await addBox(page, { disabled: true });
  assert.equal(await send(page, 'kick'), 'disabled');
  await addBox(page, { editable: 'false' });
  assert.equal(await send(page, 'kick'), 'disabled');
  await page.evaluate(() => { const b = document.createElement('div'); b.id = 'sd-dead'; document.body.append(b); b.tabIndex = 0; });
  assert.equal(await page.evaluate(() => window.sendAgent('youtube', 'hi', '#sd-dead')), 'not-filled', 'not something you can type in');
  assert.deepEqual(await page.evaluate(() => window.__sent), []);
});
