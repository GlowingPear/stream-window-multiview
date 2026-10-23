// Kick's /poll in a chat window: a copy of Kick's "Create a new poll" form (which Kick only shows on the channel page), the
// chat's full width, over its bottom. Here the chat window and its Kick page are stand-ins: the page's scripts run in the
// app's page, with Kick's API replaced by a stand-in fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// A chat window for a channel, its view running what the form sends to the Kick page (the scripts in in-site/kick-poll.js,
// called with the same arguments). fetch answers with window.__answer: { status, body } or 'throw'.
async function chat(t, { width = 340, height = 640 } = {}) {
  const page = await openApp(t, { width: 900, height: 800 });
  await page.evaluate(([width, height]) => {
    window.__ran = []; window.__fetched = []; window.__opened = []; window.__answer = { status: 200, body: { status: { error: false, code: 200 }, data: {} } };
    window.open = (...a) => { window.__opened.push(a.slice(0, 2)); return null; };
    window.fetch = async (url, o = {}) => {
      window.__fetched.push({ url, method: o.method, headers: o.headers, body: o.body ? JSON.parse(o.body) : null, credentials: o.credentials });
      if (window.__hold) await window.__hold;
      const a = window.__answer;
      if (a === 'throw') throw new TypeError('Failed to fetch');
      return new Response(typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status });
    };
    const view = { executeJavaScript: js => {
      window.__ran.push(js);
      const args = JSON.parse('[' + /\)\((.*)\)$/s.exec(js)[1] + ']');
      const fn = /kickPollPost/.test(js) ? window.kickPollPost : /kickClearBox/.test(js) ? window.kickClearBox : null;
      return Promise.resolve(fn(...args));
    } };
    window.__win = (ch = 'xqc', v = view) => {
      document.querySelectorAll('.win[data-ch]').forEach(e => e.remove());
      const el = document.createElement('div'); el.className = 'win chat'; el.dataset.ch = ch;
      el.style.cssText = `position:fixed;left:10px;top:60px;width:${width}px;height:${height}px;display:flex;flex-direction:column`;
      el.innerHTML = '<div class="body" style="position:relative;flex:1;min-height:0"></div>';
      document.body.append(el);
      return (window.__w = { channel: ch, el, view: v });
    };
    document.cookie = 'session_token=' + encodeURIComponent('123|tok en'); document.cookie = 'XSRF-TOKEN=xs%3D';
  }, [width, height]);
  const open = (subject, ch) => page.evaluate(([s, ch]) => !!window.openPollForm(window.__win(ch), s), [subject, ch]);
  const F = '.win[data-ch] .kpoll';
  const state = () => page.evaluate(F => {
    const f = document.querySelector(F);
    if (!f) return null;
    const shown = e => !e.hidden && !e.closest('[hidden]');
    return {
      options: [...f.querySelectorAll('.kp-o input')].map(i => i.placeholder + '=' + i.value),
      errors: [...f.querySelectorAll('.kp-err')].filter(shown).map(e => e.textContent),
      fail: shown(f.querySelector('.kp-fail')) ? f.querySelector('.kp-fail span').textContent : '',
      page: shown(f.querySelector('.kp-page'))
    };
  }, F);
  return { page, open, F, state, fetched: () => page.evaluate(() => window.__fetched) };
}

test('it opens over the chat, the chat window’s full width, with Kick’s fields, choices and defaults', async t => {
  const { page, open, F } = await chat(t);
  assert.equal(await open('What should we play next?'), true);
  const got = await page.evaluate(F => {
    const f = document.querySelector(F);
    f.getAnimations().forEach(a => a.finish());   // (it slides up)
    const body = f.closest('.body').getBoundingClientRect(), r = f.getBoundingClientRect();
    const sels = [...f.querySelectorAll('select')];
    return {
      title: f.querySelector('h3').textContent, role: f.getAttribute('role'),
      labels: [...f.querySelectorAll('.kp-l')].map(e => e.textContent),
      subject: f.querySelector('[name="subject"]').value, subjectPh: f.querySelector('[name="subject"]').placeholder,
      focused: document.activeElement === f.querySelector('[name="subject"]'),
      options: [...f.querySelectorAll('.kp-o input')].map(i => i.placeholder),
      lists: sels.map(s => [...s.options].map(o => `${o.value}=${o.textContent}`)), picked: sels.map(s => s.value),
      buttons: [...f.querySelectorAll('.kp-foot button')].map(b => b.textContent),
      fullWidth: Math.abs(r.left - body.left) < 1 && Math.abs(r.right - body.right) < 1 && Math.abs(r.bottom - body.bottom) < 1,
      fieldsFill: [...f.querySelectorAll('input, select')].every(e => Math.abs(e.getBoundingClientRect().width - f.clientWidth + 28) < 2),
      cleared: window.__ran.filter(js => /kickClearBox/.test(js)).length
    };
  }, F);
  assert.deepEqual(got, {
    title: 'Create a new poll', role: 'dialog',
    labels: ['Subject', 'Options (minimum 2)', 'Duration', 'Result displayed for'],
    subject: 'What should we play next?', subjectPh: 'Enter poll subject', focused: true,
    options: ['Option 1', 'Option 2'],
    lists: [['30=30 seconds', '120=2 minutes', '180=3 minutes', '240=4 minutes', '300=5 minutes'],
      ['15=15 seconds', '30=30 seconds', '120=2 minutes', '180=3 minutes', '240=4 minutes', '300=5 minutes']],
    picked: ['30', '15'],
    buttons: ['Cancel', 'Create'],
    fullWidth: true, fieldsFill: true,
    cleared: 1   // "/poll …" leaves Kick's chat box
  });
});

test('options: typing in the last adds one, up to six; emptying one takes it away and goes back to the one before', async t => {
  const { page, open, F, state } = await chat(t);
  await open('');
  for (let i = 0; i < 6; i++) await page.locator(`${F} .kp-o input`).nth(i).pressSequentially(`Game ${i + 1}`);
  assert.deepEqual((await state()).options, [1, 2, 3, 4, 5, 6].map(i => `Option ${i}=Game ${i}`), 'six, and no seventh');

  const third = page.locator(`${F} .kp-o input`).nth(2);
  await third.click();
  await third.press('End');
  for (let i = 0; i < 6; i++) await third.press('Backspace');
  assert.deepEqual((await state()).options, ['Option 1=Game 1', 'Option 2=Game 2', 'Option 3=Game 4', 'Option 4=Game 5', 'Option 5=Game 6'], 'numbered again');
  assert.equal(await page.evaluate(F => [...document.querySelectorAll(`${F} .kp-o input`)].indexOf(document.activeElement), F), 1, 'back to the one before');

  await page.locator(`${F} .kp-o input`).nth(4).fill('');
  await page.locator(`${F} .kp-o input`).nth(3).fill('');
  await page.locator(`${F} .kp-o input`).nth(2).fill('');
  assert.deepEqual((await state()).options, ['Option 1=Game 1', 'Option 2=Game 2']);
  await page.locator(`${F} .kp-o input`).nth(1).fill('');
  assert.deepEqual((await state()).options, ['Option 1=Game 1', 'Option 2='], 'never fewer than two');
  await page.locator(`${F} .kp-o input`).nth(0).fill('   ');
  assert.deepEqual((await state()).options, ['Option 1=   ', 'Option 2='], 'spaces count as empty');
  await page.locator(`${F} .kp-o input`).nth(1).fill('Yes');
  assert.deepEqual((await state()).options, ['Option 1=   ', 'Option 2=Yes', 'Option 3='], 'only the last adds one');
});

test('Kick’s checks, when Create is pressed and then as you type; nothing is sent until they pass', async t => {
  const { page, open, F, state, fetched } = await chat(t);
  await open('A');
  await page.click(`${F} .kp-create`);
  assert.deepEqual((await state()).errors, ["The poll's subject needs to be at least 2 character(s) long.", 'You need to specify at least 2 options.']);

  const sub = page.locator(`${F} [name="subject"]`), opt = i => page.locator(`${F} .kp-o input`).nth(i);
  await sub.fill('x'.repeat(65));
  assert.deepEqual((await state()).errors, ["The poll's subject can't be longer than 64 character(s).", 'You need to specify at least 2 options.'], 'checked again as you type');
  await sub.fill('x'.repeat(64));
  await opt(0).fill('A');
  await opt(1).fill('y'.repeat(65));
  assert.deepEqual((await state()).errors, ['Option labels need to be at least 2 character(s) long.', "Option labels can't be longer than 64 character(s)."]);
  await opt(0).fill('  A  ');
  assert.deepEqual((await state()).errors, ['Option labels need to be at least 2 character(s) long.', "Option labels can't be longer than 64 character(s)."], 'measured without spaces');
  await opt(0).fill('Ab');
  await opt(1).fill('Cd');
  assert.deepEqual((await state()).errors, []);
  assert.deepEqual(await fetched(), [], 'nothing sent while it was wrong');
});

test('Create sends Kick’s own request from the chat page, with its login; the form closes when Kick starts the poll', async t => {
  const { page, open, F, fetched } = await chat(t);
  await open('Pizza or tacos?');
  const opt = i => page.locator(`${F} .kp-o input`).nth(i);
  await opt(0).fill('Pizza');
  await opt(1).fill('  Tacos ');
  await opt(2).fill('Both');
  await opt(2).fill('');                  // (gone again)
  await page.click(`${F} .kp-sel >> nth=0`);
  assert.equal(await page.locator('.dd-list.kick').count(), 1, 'the app’s own list, dressed as Kick’s');
  await page.click('.dd-list.kick button:has-text("2 minutes")');
  await page.click(`${F} .kp-sel >> nth=1`);
  await page.click('.dd-list.kick button:has-text("30 seconds")');

  await page.evaluate(() => { window.__hold = new Promise(r => { window.__release = r; }); });
  await page.click(`${F} .kp-create`);
  await page.waitForFunction(() => window.__fetched.length === 1);
  assert.deepEqual(await page.evaluate(F => { const f = document.querySelector(F); return [f.querySelector('.kp-create').disabled, f.getAttribute('aria-busy')]; }, F), [true, 'true'], 'busy while Kick answers');
  await page.click(`${F} .kp-create`, { force: true });
  await page.evaluate(() => window.__release());
  await page.waitForSelector(F, { state: 'detached' });
  assert.deepEqual(await fetched(), [{
    url: '/api/v2/channels/xqc/polls', method: 'POST', credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer 123|tok en', 'X-XSRF-TOKEN': 'xs=' },
    body: { duration: 120, result_display_duration: 30, options: ['Pizza', '  Tacos '], title: 'Pizza or tacos?' }
  }], 'sent once, the empty option left out');
});

test('when Kick says no, the form says why (in Kick’s words when it gave some) and offers the channel page', async t => {
  const { page, open, F, state } = await chat(t);
  const tryWith = async (answer, setup) => {
    await open('Pizza or tacos?');
    await page.evaluate(([a, setup]) => { window.__answer = a; if (setup === 'signed out') document.cookie = 'session_token=; max-age=0';
      if (setup === 'no page') window.__w.view = {}; }, [answer, setup]);
    await page.locator(`${F} .kp-o input`).nth(0).fill('Pizza');
    await page.locator(`${F} .kp-o input`).nth(1).fill('Tacos');
    await page.click(`${F} .kp-create`);
    await page.waitForSelector(`${F} .kp-fail:not([hidden])`);
    const s = await state();
    await page.evaluate(() => { document.cookie = 'session_token=' + encodeURIComponent('123|tok en'); });
    return [s.fail, s.page];
  };
  const generic = 'There was an error creating the poll. Please try again.';
  assert.deepEqual(await tryWith({ status: 403, body: { message: 'Forbidden' } }), ['Only the streamer and the channel’s moderators can start polls.', true]);
  assert.deepEqual(await tryWith({ status: 200 }, 'signed out'), ['You need to be signed in to Kick to start a poll.', false]);
  assert.deepEqual(await tryWith({ status: 401, body: { message: 'Unauthenticated.' } }), ['You need to be signed in to Kick to start a poll.', false]);
  assert.deepEqual(await tryWith({ status: 422, body: { message: 'There is already an active poll.' } }), ['There is already an active poll.', true]);
  assert.deepEqual(await tryWith({ status: 200, body: { status: { error: true, code: 400, message: 'Poll options are invalid' }, data: null } }), ['Poll options are invalid', true]);
  assert.deepEqual(await tryWith({ status: 500, body: '<html>oops</html>' }), [generic, true]);
  assert.deepEqual(await tryWith('throw'), [generic, true]);
  assert.deepEqual(await tryWith({ status: 200 }, 'no page'), [generic, true]);

  await page.locator(`${F} [name="subject"]`).fill('Pizza or tacos?!');
  assert.equal((await state()).fail, '', 'typing again hides it');
  await page.click(`${F} .kp-create`);
  await page.waitForSelector(`${F} .kp-fail:not([hidden])`);
  await page.click(`${F} .kp-page`);
  assert.equal(await page.locator(F).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__opened), [['https://kick.com/xqc', 'kmv_page_xqc']], 'Open channel page: the channel’s page');
});

test('closing it, and /poll again while it’s open', async t => {
  const { page, open, F } = await chat(t);
  for (const how of ['.kp-cancel', '.kcmd-x', 'Escape']) {
    await open('');
    if (how === 'Escape') await page.press(`${F} [name="subject"]`, 'Escape'); else await page.click(`${F} ${how}`);
    assert.equal(await page.locator(F).count(), 0, how);
  }
  await open('');
  await page.click(`${F} .kp-sel >> nth=0`);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(F).count(), 1, 'Esc closes an open list first');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(F).count(), 0);

  await open('First');
  await page.locator(`${F} .kp-o input`).nth(0).fill('Kept');
  await page.evaluate(() => { window.kickPageCmd(window.__w, 'clip'); });
  assert.equal(await page.locator('.win[data-ch] .kcmd').count(), 1, 'the /clip card takes its place');
  await page.evaluate(() => { window.openPollForm(window.__w, 'Again'); });
  await page.locator(`${F} .kp-o input`).nth(0).fill('Kept');
  await page.evaluate(() => window.__w.el.querySelector('.kp-cancel').focus());
  assert.equal(await page.evaluate(() => !!window.openPollForm(window.__w, 'Third')), true);
  assert.deepEqual(await page.evaluate(F => { const f = document.querySelector(F);
    return [document.querySelectorAll(F).length, f.querySelector('[name="subject"]').value, f.querySelector('.kp-o input').value, document.activeElement.name]; }, F),
  [1, 'Again', 'Kept', 'subject'], 'the open form, as it was, with the subject focused');
  assert.equal(await page.evaluate(() => window.openPollForm({ channel: 'xqc' }, '')), null, 'a window that’s gone');
});

test('narrow and short chats: it’s always the chat’s width, and scrolls when the chat is shorter than it', async t => {
  for (const [width, height] of [[460, 700], [220, 700], [220, 320]]) {
    const { page, open, F } = await chat(t, { width, height });
    await open('A question that is rather long for a narrow chat window');
    for (let i = 0; i < 6; i++) await page.locator(`${F} .kp-o input`).nth(i).fill(`Option number ${i + 1}`);
    const got = await page.evaluate(F => {
      const f = document.querySelector(F), body = f.closest('.body').getBoundingClientRect(), r = f.getBoundingClientRect();
      return { fullWidth: Math.abs(r.width - body.width) < 1, noSideways: f.scrollWidth <= f.clientWidth,
        inside: r.top >= body.top - 1, scrolls: f.scrollHeight > f.clientHeight + 1 };
    }, F);
    assert.deepEqual(got, { fullWidth: true, noSideways: true, inside: true, scrolls: height < 700 }, `${width}×${height}`);
  }
});

test('emptying Kick’s chat box: its editor gets an empty state; without one it’s left alone', async t => {
  const { page } = await chat(t);
  const got = await page.evaluate(() => {
    const box = document.createElement('div'); box.dataset.testid = 'chat-input'; document.body.append(box);
    const none = window.kickClearBox();
    let set = null;
    box.__lexicalEditor = { parseEditorState: s => JSON.parse(s), setEditorState: st => { set = st; } };
    const done = window.kickClearBox();
    box.__lexicalEditor = { parseEditorState: () => { throw new Error('bad'); }, setEditorState() {} };
    const broken = window.kickClearBox();
    box.remove();
    return { none, done, empty: set && set.root.children.length === 1 && set.root.children[0].children.length === 0, broken, noBox: window.kickClearBox() };
  });
  assert.deepEqual(got, { none: false, done: true, empty: true, broken: false, noBox: false });
});
