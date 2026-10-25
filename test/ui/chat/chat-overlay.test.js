// Chat over streams (the toolbar's button, Settings › Chat): each stream's new chat messages over it at the bottom left,
// each for about 6 s, at most 5 at once, also when its chat is in sight; the button on a stream's bar turns it off for
// that channel only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, press } = require('../app');
const { openApp } = setup();

async function appWith(t, names) {
  const page = await openApp(t);
  await add(page, ...names);
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');
  await press(page, 't');
  return page;
}
const lines = (page, name) => win(page, name).locator('.co-line').evaluateAll(l => l.map(e => e.textContent));
const say = (page, ch, msgs) => page.evaluate(([ch, msgs]) => window.chatOverlay(ch, msgs), [ch, msgs]);
const KICK_EMOTE = 'https://files.kick.com/emotes/37226/fullsize';

test('off at first; on, a channel\'s new messages show over its stream (its chat in sight too), the newest 5, with emotes, text kept as text', async t => {
  const page = await appWith(t, ['alpha', 'bravo']);
  await say(page, 'alpha', [{ sender: 'mossyrock', body: 'hello' }]);
  assert.deepEqual(await lines(page, 'alpha'), [], 'off at first');
  await page.evaluate(() => window.setChatOverlay(true));
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.chatOverlay')), '1', 'saved');
  await say(page, 'alpha', Array.from({ length: 7 }, (_, i) => ({ sender: 'chatter' + i, body: 'message ' + i })));
  assert.deepEqual(await lines(page, 'alpha'), ['chatter2: message 2', 'chatter3: message 3', 'chatter4: message 4', 'chatter5: message 5', 'chatter6: message 6']);
  assert.deepEqual(await lines(page, 'bravo'), [], 'only that channel\'s stream');
  // emotes from a known emote site as pictures; anything else in a message stays text
  // (read as it's drawn: the tests can't load the emote's picture, so it soon turns into its name)
  const drawn = await page.evaluate(src => {
    window.chatOverlay('bravo', [{ sender: 'sundew', body: '<img src=x onerror=alert(1)> hi pearWave', parts: [{ t: '<img src=x onerror=alert(1)> hi ' }, { e: 'pearWave', src }] }]);
    const line = [...document.querySelectorAll('#stage .win.stream')].find(w => w.querySelector('.title').textContent === 'bravo').querySelector('.co-line');
    const img = line.querySelector('img');
    return { text: line.textContent, imgs: line.querySelectorAll('img').length, src: img && img.getAttribute('src'), alt: img && img.alt };
  }, KICK_EMOTE);
  assert.deepEqual(drawn, { text: 'sundew: <img src=x onerror=alert(1)> hi ', imgs: 1, src: KICK_EMOTE, alt: 'pearWave' });
  // at the bottom left, letting clicks through to the stream
  const box = await win(page, 'alpha').locator('.co-box').evaluate(b => { const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect(); return { left: Math.round(r.left - p.left), bottom: Math.round(p.bottom - r.bottom), events: getComputedStyle(b).pointerEvents }; });
  assert.deepEqual(box, { left: 8, bottom: 8, events: 'none' });
});

test('the button on a stream\'s bar turns it off for that stream only, remembered; switched off everywhere, the lines go', async t => {
  const page = await appWith(t, ['alpha', 'bravo']);
  assert.equal(await win(page, 'alpha').locator('[data-a=overlay]').isHidden(), true, 'no button while it\'s off');
  await page.evaluate(() => window.setChatOverlay(true));
  const btn = win(page, 'alpha').locator('[data-a=overlay]');
  assert.equal(await btn.isHidden(), false);
  await btn.click();
  assert.match(await page.textContent('#msg'), /Chat over alpha's stream off/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.chatOverlayOff'))), ['alpha']);
  assert.ok(await btn.evaluate(b => b.classList.contains('off')));
  await say(page, 'alpha', [{ sender: 'mossyrock', body: 'hello' }]);
  await say(page, 'bravo', [{ sender: 'mossyrock', body: 'hello' }]);
  assert.deepEqual(await lines(page, 'alpha'), [], 'off for alpha');
  assert.deepEqual(await lines(page, 'bravo'), ['mossyrock: hello']);
  await page.reload();
  assert.ok(await win(page, 'alpha').locator('[data-a=overlay]').evaluate(b => b.classList.contains('off')), 'remembered');
  // off for every stream (e.g. from the other window): the lines on screen go
  await say(page, 'bravo', [{ sender: 'sundew', body: 'still here' }]);
  await page.evaluate(() => { localStorage.setItem('kickMultiview.chatOverlay', '0'); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.chatOverlay', newValue: '0' })); });
  await page.waitForFunction(() => !document.querySelector('.co-box'));
  assert.equal(await win(page, 'bravo').locator('[data-a=overlay]').isHidden(), true);
});

test('each line fades after about 6 seconds; the Streams window draws the lines it\'s passed', async t => {
  const page = await appWith(t, ['alpha']);
  await page.evaluate(() => window.setChatOverlay(true));
  await say(page, 'alpha', [{ sender: 'mossyrock', body: 'soon gone' }]);
  assert.deepEqual(await lines(page, 'alpha'), ['mossyrock: soon gone']);
  await page.waitForFunction(() => !document.querySelector('.co-line'), null, { timeout: 8000 });
  // (in the Streams window, the main window's lines come in through the app and are drawn the same way)
  await page.evaluate(() => window.drawChatLines('alpha', [{ sender: 'tinycomet', body: 'from the main window' }]));
  assert.deepEqual(await lines(page, 'alpha'), ['tinycomet: from the main window']);
});
