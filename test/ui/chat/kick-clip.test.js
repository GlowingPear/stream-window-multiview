// Kick's /clip in a chat window: like on Kick's channel page, "/clip [seconds] [title]" makes the clip straight away, then
// shows Share Clip; here it's in the chat window, its full width, over its bottom. The chat window and its Kick page are
// stand-ins (kick-stand-in.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { kickChat } = require('./kick-stand-in');
const { openApp } = setup();

const INFO = 'GET https://kick.com/api/v2/channels/xqc/info', START = 'POST https://web.kick.com/api/v1/clips';
const FINISH = 'POST https://web.kick.com/api/v1/clips/clip_1/finalize';
const live = (title = 'Big stream tonight') => ({ status: 200, body: { id: 7, slug: 'xqc', livestream: { vod_id: 'vod-9', session_title: title } } });
// Kick live, and making clips: the stream so far is 600 seconds long
const LIVE = {
  [INFO]: live(),
  [START]: { status: 200, body: { data: { id: 'clip_1', source_duration: 600, preview_url: 'https://x/preview.m3u8' }, message: 'OK' } },
  [FINISH]: { status: 200, body: { data: { id: 'clip_1', title: 'ignored: the answer’s', thumbnail_url: 'https://clips.kick.com/clip_1/thumbnail.webp' }, message: 'OK' } }
};
const C = '.win[data-ch] .kclip';

async function chat(t, opts, answers = {}) {
  const c = await kickChat(openApp, t, opts);
  await c.routes({ ...LIVE, ...answers });
  c.clip = async (text = '', ch) => {
    const ok = await c.page.evaluate(([s, ch]) => !!window.makeClip(window.__win(ch), s), [text, ch]);
    await c.page.waitForFunction(C => { const k = document.querySelector(C); return !k || !k.hasAttribute('aria-busy'); }, C);
    return ok;
  };
  c.said = () => c.page.evaluate(C => { const k = document.querySelector(C); return k && [k.querySelector('h3').textContent, k.querySelector('.kcmd-c').innerText.replace(/\s*\n+\s*/g, ' | ').trim()]; }, C);
  c.sent = () => c.page.evaluate(() => window.__fetched.map(f => [f.key, f.body]));
  return c;
}

test('/clip makes the clip of the last 30 seconds, titled with the stream’s title, with Kick’s own requests; then Share Clip', async t => {
  const { page, clip, said, fetched } = await chat(t);
  await page.evaluate(() => { window.__routes['POST https://web.kick.com/api/v1/clips'] = new Promise(r => { window.__go = () => r({ status: 200, body: { data: { id: 'clip_1', source_duration: 600 } } }); }); });
  await page.evaluate(() => window.makeClip(window.__win(), ''));
  await page.waitForFunction(() => window.__go);
  assert.deepEqual(await said(), ['Create Clip', 'Creating your clip...'], 'while Kick makes it');
  assert.equal(await page.evaluate(C => document.querySelector(C).getAttribute('aria-busy'), C), 'true');
  await page.evaluate(() => window.__go());
  await page.waitForFunction(C => !document.querySelector(C).hasAttribute('aria-busy'), C);
  const asked = await fetched();
  assert.deepEqual(asked.map(f => [f.key, f.body]), [
    [INFO, undefined],
    [START, { video_id: 'vod-9' }],
    [FINISH, { title: 'Big stream tonight', trim_duration: 30, trim_start: 570 }]
  ]);
  assert.deepEqual(asked[1].headers, { Accept: 'application/json', Authorization: 'Bearer 123|tok en', 'Content-Type': 'application/json', 'x-app-platform': 'web' },
    'web.kick.com: no X-XSRF-TOKEN (it refuses it)');
  assert.equal(asked[1].credentials, 'include');
  assert.equal(asked[0].headers['X-XSRF-TOKEN'], 'xs=', 'kick.com: with it');

  const share = await page.evaluate(C => { const k = document.querySelector(C); k.getAnimations().forEach(a => a.finish());
    const body = k.closest('.body').getBoundingClientRect(), r = k.getBoundingClientRect();
    return { title: k.querySelector('h3').textContent, done: k.querySelector('.kcl-done').textContent, img: k.querySelector('.kcl-thumb img').src,
      name: k.querySelector('.kcl-title').textContent, link: k.querySelector('.kcl-url input').value, linkOff: k.querySelector('.kcl-url input').disabled,
      tiles: [...k.querySelectorAll('.kcl-t')].map(b => b.textContent), focused: document.activeElement === k,
      fullWidth: Math.abs(r.left - body.left) < 1 && Math.abs(r.right - body.right) < 1 && Math.abs(r.bottom - body.bottom) < 1,
      cleared: window.__ran.filter(js => /kickClearBox/.test(js)).length }; }, C);
  assert.deepEqual(share, { title: 'Share Clip', done: 'You have successfully published your clip. You can now share it to other places.',
    img: 'https://clips.kick.com/clip_1/thumbnail.webp', name: 'ignored: the answer’s', link: 'https://kick.com/xqc/clips/clip_1', linkOff: true,
    tiles: ['Download', 'Chat', 'Facebook', 'X'], focused: true, fullWidth: true, cleared: 1 });
});

test('what follows /clip, read as Kick reads it: the seconds (10 to 180), then the title (cut to 50 characters)', async t => {
  const { page, clip, said, sent } = await chat(t);
  const finish = async text => {
    await page.evaluate(() => { window.__fetched = []; document.querySelector('.win[data-ch] .kcmd')?.remove(); });
    await clip(text);
    return (await sent()).find(s => s[0] === FINISH)?.[1] || (await said())[1];
  };
  assert.deepEqual(await finish('60 What a play'), { title: 'What a play', trim_duration: 60, trim_start: 540 });
  assert.deepEqual(await finish('  10    Two   spaces  '), { title: 'Two spaces', trim_duration: 10, trim_start: 590 });
  assert.deepEqual(await finish('180'), { title: 'Big stream tonight', trim_duration: 180, trim_start: 420 });
  assert.deepEqual(await finish('30 ' + 'x'.repeat(51)), { title: 'x'.repeat(47) + '...', trim_duration: 30, trim_start: 570 });
  assert.deepEqual(await finish('30 ' + 'x'.repeat(50)), { title: 'x'.repeat(50), trim_duration: 30, trim_start: 570 });
  for (const bad of ['9', '181', '30.5', 'What a play', '0'])
    assert.equal(await finish(bad), 'Clip duration must be between 10 and 180 seconds. | Close', bad);
  assert.deepEqual((await sent()).map(s => s[0]), [INFO], 'checked before asking for a clip');

  await page.evaluate(() => { window.__routes['GET https://kick.com/api/v2/channels/xqc/info'] = { status: 200, body: { livestream: { vod_id: 'v', session_title: 'y'.repeat(60) } } };
    window.__routes['POST https://web.kick.com/api/v1/clips'] = { status: 200, body: { data: { id: 'clip_1', source_duration: 12 } } }; });
  assert.deepEqual(await finish('30'), { title: 'y'.repeat(47) + '...', trim_duration: 30, trim_start: 0 }, 'the stream’s title cut too; never before its start');
});

test('when there’s no clip: offline, signed out, too many, or Kick not making it; Close closes', async t => {
  const { page, clip, said, routes } = await chat(t);
  const tryWith = async (answers, signedOut) => {
    await page.evaluate(() => document.querySelector('.win[data-ch] .kcmd')?.remove());
    await routes({ ...LIVE, ...answers });
    if (signedOut) await page.evaluate(() => { document.cookie = 'session_token=; max-age=0'; });
    await clip('');
    await page.evaluate(() => { document.cookie = 'session_token=' + encodeURIComponent('123|tok en'); });
    return (await said()).join(' | ');
  };
  const generic = 'Create Clip | There was an error creating the clip. Please try again. | Close';
  assert.equal(await tryWith({ [INFO]: { status: 200, body: { livestream: null } } }), 'Create Clip | There is no active livestream. | Close');
  assert.equal(await tryWith({ [INFO]: { status: 200, body: { livestream: { session_title: 'no vod' } } } }), 'Create Clip | There is no active livestream. | Close');
  assert.equal(await tryWith({ [INFO]: { status: 404, body: {} } }), 'Create Clip | There is no active livestream. | Close');
  assert.equal(await tryWith({}, true), 'Create Clip | You need to be signed in to Kick to make a clip. | Close');
  assert.equal(await tryWith({ [INFO]: 'throw' }), generic);
  assert.equal(await tryWith({ [START]: { status: 429, body: { message: 'Too Many Attempts.' } } }), 'Create Clip | You\'ve exceeded the rate limit. Please wait a minute before initializing another clip. | Close');
  assert.equal(await tryWith({ [START]: { status: 200, body: { data: {} } } }), generic);
  assert.equal(await tryWith({ [FINISH]: { status: 429, body: {} } }), 'Create Clip | You\'ve exceeded the rate limit. Please wait a minute before initializing another clip. | Close');
  assert.equal(await tryWith({ [FINISH]: { status: 422, body: { message: 'bad' } } }), generic);
  assert.equal(await tryWith({ [FINISH]: 'throw' }), generic);
  assert.equal(await page.evaluate(C => document.activeElement === document.querySelector(`${C} .kcl-b`), C), true, 'Close is focused');
  await page.click(`${C} .kcl-b`);
  assert.equal(await page.locator(C).count(), 0);
});

test('Share Clip: copy the link; Download opens the clip’s page; Chat puts the link in the chat box; Facebook and X share it', async t => {
  const { page, clip } = await chat(t);
  await page.evaluate(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async s => { window.__copied.push(s); } }, configurable: true }); });
  await clip('30 Big play');
  await page.click(`${C} .kcl-copy`);
  assert.deepEqual(await page.evaluate(C => [window.__copied, document.querySelector(`${C} .kcl-copy`).getAttribute('aria-label')], C), [['https://kick.com/xqc/clips/clip_1'], 'Copied']);
  await page.waitForFunction(C => document.querySelector(`${C} .kcl-copy`).getAttribute('aria-label') === 'Copy', C);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.click(`${C} .kcl-copy`);
  assert.equal(await page.getAttribute(`${C} .kcl-copy`, 'aria-label'), 'Copy', 'not copied: says nothing');

  await page.click(`${C} .kcl-t:has-text("Facebook")`);
  await page.click(`${C} .kcl-t:has-text("X")`);
  const t1 = 'ignored%3A%20the%20answer%E2%80%99s', u = 'https%3A%2F%2Fkick.com%2Fxqc%2Fclips%2Fclip_1';
  assert.deepEqual(await page.evaluate(() => window.__opened), [
    [`https://www.facebook.com/sharer/sharer.php?u=${u}&t=${t1}`, '_blank'], [`https://twitter.com/share?url=${u}&text=${t1}`, '_blank']], 'in the browser; it stays open');
  await page.click(`${C} .kcl-t:has-text("Download")`);
  assert.equal(await page.locator(C).count(), 0);
  assert.deepEqual((await page.evaluate(() => window.__opened)).pop(), ['https://kick.com/xqc/clips/clip_1', '_blank']);

  await clip('');
  await page.click(`${C} .kcl-t:has-text("Chat")`);
  assert.equal(await page.locator(C).count(), 0);
  assert.deepEqual(await page.evaluate(() => [window.__ran.filter(js => /kickFillBox/.test(js)).map(js => js.slice(js.lastIndexOf('})(') + 3, -1)), window.__viewFocused]),
    [['"https://kick.com/xqc/clips/clip_1"'], true], 'the link, in Kick’s box, and the keyboard there: Enter sends it');
});

test('another /clip while one is open: Kick’s “Discard this clip?”; Keep editing keeps it, Start new clip starts again', async t => {
  const { page, clip, said, sent } = await chat(t);
  await page.evaluate(() => { window.__routes['POST https://web.kick.com/api/v1/clips'] = new Promise(r => { window.__go = () => r({ status: 200, body: { data: { id: 'clip_1', source_duration: 600 } } }); }); });
  await page.evaluate(() => window.makeClip(window.__win(), '30 First'));
  await page.waitForFunction(() => window.__go);
  assert.equal(await page.evaluate(() => !!window.makeClip(window.__w, '20 Second')), true);
  assert.deepEqual(await said(), ['Discard this clip?', 'You have a clip in progress. Starting a new one will discard it. | Keep editing | Start new clip']);
  assert.equal(await page.evaluate(C => document.activeElement.textContent, C), 'Keep editing');
  await page.evaluate(() => window.__go());
  await page.waitForFunction(() => window.__fetched.length === 3);
  await page.evaluate(() => new Promise(r => setTimeout(r, 30)));
  assert.equal((await said())[0], 'Discard this clip?', 'still asking while the first one finished');
  await page.click(`${C} .kcl-b:text-is("Keep editing")`);
  assert.equal((await said())[0], 'Share Clip', 'Keep editing: back to it, as it is now');

  await page.evaluate(() => window.makeClip(window.__w, '20 Second'));
  await page.evaluate(() => window.makeClip(window.__w, '25 Third'));   // (asked once)
  await page.click(`${C} .kcl-b:text-is("Start new clip")`);
  await page.waitForFunction(C => !document.querySelector(C).hasAttribute('aria-busy'), C);
  assert.deepEqual((await sent()).filter(s => s[0] === FINISH).map(s => s[1].title), ['First', 'Second'], 'the new one: what came with it');
  assert.equal((await said())[0], 'Share Clip');
});

test('an older clip’s answer doesn’t replace a newer one, nor a closed panel', async t => {
  const { page, clip, said, routes } = await chat(t);
  await page.evaluate(() => { window.__routes['GET https://kick.com/api/v2/channels/xqc/info'] = new Promise(r => { window.__go = () => r({ status: 200, body: { livestream: null } }); }); });
  await page.evaluate(() => window.makeClip(window.__win(), ''));
  await page.waitForFunction(() => window.__go);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(C).count(), 0, 'Esc closes it while it’s being made');
  await page.evaluate(() => window.__go());
  await page.evaluate(() => new Promise(r => setTimeout(r, 30)));
  assert.equal(await page.locator('.win[data-ch] .kcmd').count(), 0, 'nothing comes back');
  await routes(LIVE);
  assert.equal(await clip('9'), true);
  assert.equal((await said())[1], 'Clip duration must be between 10 and 180 seconds. | Close');
  assert.equal(await page.evaluate(() => window.makeClip({ channel: 'xqc' }, '')), null, 'a window that’s gone');
});

test('Kick’s chat box: filled with text and focused through its editor; without one it’s left alone', async t => {
  const { page } = await chat(t);
  const got = await page.evaluate(() => {
    const box = document.createElement('div'); box.dataset.testid = 'chat-input'; document.body.append(box);
    const none = window.kickFillBox('x');
    let set = null, focused = false;
    box.__lexicalEditor = { parseEditorState: s => JSON.parse(s), setEditorState: st => { set = st; }, focus: () => { focused = true; } };
    const done = window.kickFillBox('https://kick.com/xqc/clips/clip_1');
    box.__lexicalEditor = { parseEditorState: () => { throw new Error('bad'); }, setEditorState() {}, focus() {} };
    const broken = window.kickFillBox('x');
    box.remove();
    return { none, done, text: set && set.root.children[0].children.map(c => c.text).join(''), focused, broken };
  });
  assert.deepEqual(got, { none: false, done: true, text: 'https://kick.com/xqc/clips/clip_1', focused: true, broken: false });
});

test('narrow chats: Share Clip is the chat’s width, and its four buttons always share one row', async t => {
  for (const [width, lines] of [[460, 1], [300, 1], [220, 1]]) {
    const { page, clip } = await chat(t, { width, height: 760 });
    await clip('');
    const got = await page.evaluate(([C, width]) => { const k = document.querySelector(C), body = k.closest('.body').getBoundingClientRect(), r = k.getBoundingClientRect();
      return { fullWidth: Math.abs(r.width - body.width) < 1, noSideways: k.scrollWidth <= k.clientWidth,
        lines: new Set([...k.querySelectorAll('.kcl-t')].map(b => Math.round(b.getBoundingClientRect().top))).size,
        labels: width > 250 ? [...k.querySelectorAll('.kcl-t span')].every(l => l.scrollWidth <= l.clientWidth) : true }; }, [C, width]);   // (whole labels from 250)
    assert.deepEqual(got, { fullWidth: true, noSideways: true, lines, labels: true }, String(width));
  }
});
