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

// YouTube's Send: a <button> inside yt-button-shape inside yt-button-renderer inside #send-button (a click on the wrapper
// does nothing), off (aria-disabled / disabled) until YouTube has seen the text. on: when it turns on (ms, or never);
// off: how (aria on the button, disabled on it, or aria on the wrapper); real: it only takes a real press (isTrusted)
const addYtSend = (page, { on = 0, off = 'aria', real = false } = {}) => page.evaluate(([on, off, real]) => {
  const s = document.createElement('div'); s.id = 'send-button';
  const wrap = document.createElement('yt-button-renderer'), shape = document.createElement('yt-button-shape'), b = document.createElement('button');
  b.setAttribute('aria-label', 'Send'); b.style.cssText = 'position:fixed;left:200px;top:100px;width:40px;height:20px';
  const offOn = x => { if (off === 'aria') b.setAttribute('aria-disabled', String(x)); else if (off === 'disabled') b.disabled = x; else x ? wrap.setAttribute('aria-disabled', 'true') : wrap.removeAttribute('aria-disabled'); };
  offOn(on !== 0); if (on > 0) setTimeout(() => offOn(false), on);
  window.__wrapClicks = 0; wrap.addEventListener('click', e => { if (e.target === wrap) window.__wrapClicks++; });
  const box = document.getElementById('sd-box');
  b.addEventListener('click', e => { window.__presses++; if (b.disabled || b.getAttribute('aria-disabled') === 'true' || (real && !e.isTrusted)) return; window.__sent.push('button:' + box.innerText.trim()); box.textContent = ''; });
  shape.append(b); wrap.append(shape); s.append(wrap); document.getElementById('sd-wrap').append(s);
}, [on, off, real]);

test('YouTube: its Send button is waited for until it\'s on, then the <button> inside is pressed (not its wrapper)', async t => {
  const page = await openApp(t);
  for (const off of ['aria', 'disabled', 'wrapper']){
    await addBox(page); await addYtSend(page, { on: 600, off });
    const t0 = Date.now();
    assert.equal(await send(page, 'youtube', 'Haii King'), 'sent', off);
    assert.ok(Date.now() - t0 >= 600, 'it waited for the button: ' + off);
    assert.deepEqual(await page.evaluate(() => [window.__sent, window.__wrapClicks]), [['button:Haii King'], 0], 'the button, once, not Enter: ' + off);
  }
});

test('YouTube: a Send button that stays off: Enter in the box after 1.5 s, the button never pressed', async t => {
  const page = await openApp(t);
  for (const off of ['aria', 'wrapper']){
    await addBox(page); await addYtSend(page, { on: -1, off });
    assert.equal(await send(page, 'youtube', 'still off'), 'sent');
    assert.deepEqual(await page.evaluate(() => window.__sent), ['enter:still off'], off);
  }
  await addBox(page, { deaf: 9 });   // no Send button at all: Enter, three times, as on the other sites
  assert.equal(await send(page, 'youtube', 'no button'), 'not-sent');
  assert.equal(await page.evaluate(() => window.__presses), 3);
});

test('YouTube: a Send button that ignores a script\'s press: where to press it for real (its centre), then whether it sent', async t => {
  const page = await openApp(t);
  await addBox(page); await addYtSend(page, { real: true });
  const t0 = Date.now();
  const r = await send(page, 'youtube', 'Haii King');
  assert.deepEqual(r.press, { x: 220, y: 110 }, 'the button\'s centre, in the page\'s pixels');
  assert.ok(r.start >= t0 && r.start <= Date.now());
  assert.deepEqual(await page.evaluate(() => [window.__presses, window.__sent, document.getElementById('sd-box').innerText.trim()]), [1, [], 'Haii King'], 'pressed once here; the text still in the box');
  const sent = start => page.evaluate(start => window.sentAgent('youtube', 'Haii King', start, '#sd-box'), start);
  assert.equal(await sent(r.start), 'not-sent', 'still in its box after 1.5 s');
  await page.evaluate(() => setTimeout(() => { document.getElementById('sd-box').textContent = ''; }, 300));
  assert.equal(await sent(r.start), 'sent', 'its box emptied');
  await page.evaluate(() => { document.getElementById('sd-box').textContent = 'Haii King'; window.__kmvFeed = { recent: [{ t: Date.now(), v: 'you: Haii King' }] }; });
  assert.equal(await sent(r.start), 'sent', 'its chat brought it back, whatever the box shows');
  assert.equal(await sent(Date.now() + 1000), 'not-sent', 'only what came back since it was sent');
  await page.evaluate(() => { delete window.__kmvFeed; });
  assert.equal(await page.evaluate(() => window.sentAgent('youtube', 'Haii King', 0, '#nothing-here')), 'not-sent', 'no box: not sent');
});
