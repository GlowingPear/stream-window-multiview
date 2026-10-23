// Kick's /prediction in a chat window: a copy of Kick's prediction window (which Kick only shows on the channel page), the
// chat's full width, over its bottom. It starts one (the form, then Confirm), or manages the one that's running. The chat
// window and its Kick page are stand-ins (kick-stand-in.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { kickChat } = require('./kick-stand-in');
const { openApp } = setup();

const API = 'https://kick.com/api/v2/channels/xqc';
const OK = data => ({ status: 200, body: { data, message: 'Success' } });
// What Kick says about a channel with channel points and nothing running (the answers the window starts from)
const QUIET = {
  [`GET ${API}/channel-points/channel-settings`]: OK({ channel_points_enabled: true }),
  [`GET ${API}/predictions/latest`]: OK(null),
  [`GET ${API}/predictions/recent`]: OK({ predictions: [] }),
  [`GET ${API}/me`]: { status: 200, body: { is_broadcaster: false, is_moderator: true } }
};
const P = '.win[data-ch] .kpred';
const ago = s => new Date(Date.now() - s * 1000).toISOString();
const running = (over = {}) => ({ id: 'p1', title: 'Will we win?', state: 'ACTIVE', duration: 300, created_at: ago(60), winning_outcome_id: null,
  outcomes: [{ id: 'o1', title: 'Yes', total_vote_amount: 750, return_rate: 1.33 }, { id: 'o2', title: 'No', total_vote_amount: 250, return_rate: 4 }], ...over });

async function chat(t, opts, answers = {}) {
  const c = await kickChat(openApp, t, opts);
  await c.routes({ ...QUIET, ...answers });
  c.open = async (title = '', ch) => {
    const ok = await c.page.evaluate(([s, ch]) => !!window.openPredictionForm(window.__win(ch), s), [title, ch]);
    await c.page.waitForFunction(P => { const k = document.querySelector(P); return !k || !k.hasAttribute('aria-busy'); }, P);
    return ok;
  };
  c.state = () => c.page.evaluate(P => {
    const k = document.querySelector(P);
    if (!k) return null;
    const shown = e => !e.hidden && !e.closest('[hidden]');
    return {
      title: k.querySelector('h3').textContent,
      errors: [...k.querySelectorAll('.kpr-err')].filter(shown).map(e => e.textContent),
      fail: [...k.querySelectorAll('.kpr-fail')].filter(shown).map(e => e.querySelector('span').textContent)[0] || '',
      page: [...k.querySelectorAll('.kpr-page')].some(shown),
      buttons: [...k.querySelectorAll('.kpr-foot button')].map(b => b.textContent)
    };
  }, P);
  c.fill = (title, o1, o2) => c.page.evaluate(([P, v]) => {
    const k = document.querySelector(P);
    ['title', 'option1', 'option2'].forEach((n, i) => { const x = k.querySelector(`[name="${n}"]`); x.value = v[i]; x.dispatchEvent(new Event('input', { bubbles: true })); });
  }, [P, [title, o1, o2]]);
  c.press = label => c.page.click(`${P} .kpr-foot button:text-is("${label}")`);
  return c;
}

test('it asks Kick what to show (with the chat’s login), then opens the form over the chat, its full width, with Kick’s fields, choices and wording', async t => {
  const { page, open, fetched } = await chat(t);
  assert.equal(await open('Will we win this round?'), true);
  const got = await page.evaluate(P => {
    const k = document.querySelector(P);
    k.getAnimations().forEach(a => a.finish());   // (it slides up)
    const body = k.closest('.body').getBoundingClientRect(), r = k.getBoundingClientRect();
    return {
      title: k.querySelector('h3').textContent, role: k.getAttribute('role'),
      text: [...k.querySelectorAll('.kpr-form > .kpr-d, .kpr-l')].map(e => e.textContent),
      fields: [...k.querySelectorAll('input')].map(i => `${i.name}=${i.value}|${i.placeholder}`),
      focused: document.activeElement.name,
      durations: [...k.querySelectorAll('[name="duration"] option')].map(o => `${o.value}=${o.textContent}`), picked: k.querySelector('[name="duration"]').value,
      note: k.querySelector('.kpr-selw + .kpr-d').textContent,
      buttons: [...k.querySelectorAll('.kpr-foot button')].map(b => b.textContent),
      past: !!k.querySelector('[name="past"]'),
      fullWidth: Math.abs(r.left - body.left) < 1 && Math.abs(r.right - body.right) < 1 && Math.abs(r.bottom - body.bottom) < 1,
      cleared: window.__ran.filter(js => /kickClearBox/.test(js)).length
    };
  }, P);
  assert.deepEqual(got, {
    title: 'Start a prediction', role: 'dialog',
    text: ['Streamers and mods are able to create predictions. Viewers who predict the correct outcome win Channel Points. These predictions must follow our Terms of Service.',
      'Prediction Title *', 'Options *', 'Prediction lasts for *'],
    fields: ['title=Will we win this round?|Enter prediction question', 'option1=|Option 1', 'option2=|Option 2'],
    focused: 'title',
    durations: ['1=1 minute', '5=5 minutes', '10=10 minutes', '30=30 minutes'], picked: '1',
    note: 'Time limit viewers have to place a prediction.',
    buttons: ['Cancel', 'Start prediction'],
    past: false, fullWidth: true,
    cleared: 1   // "/prediction" leaves Kick's chat box
  });
  const asked = await fetched();
  assert.deepEqual(asked.map(f => f.key).sort(), [`GET ${API}/channel-points/channel-settings`, `GET ${API}/me`, `GET ${API}/predictions/latest`, `GET ${API}/predictions/recent`]);
  assert.deepEqual(asked[0].headers, { Accept: 'application/json', Authorization: 'Bearer 123|tok en', 'X-XSRF-TOKEN': 'xs=' });
  assert.equal(asked[0].credentials, 'include');

  await page.click(`${P} .kpr-link`);
  assert.deepEqual(await page.evaluate(() => window.__opened), [['https://kick.com/channel-points-terms-and-conditions', '_blank']], 'Terms of Service: Kick’s, in the browser');
});

test('Kick’s checks, when Start prediction is pressed and then as you type; nothing is sent', async t => {
  const { page, open, state, fill, press, fetched } = await chat(t);
  await open();
  const asked = (await fetched()).length;
  await press('Start prediction');
  assert.deepEqual((await state()).errors, ['Prediction title is required', 'Option 1 is required', 'Option 2 is required']);
  assert.deepEqual(await page.evaluate(P => [...document.querySelectorAll(`${P} .kpr-f.bad input`)].map(i => i.name), P), ['title'], 'only the title is marked, as on Kick');
  await fill('x'.repeat(41), 'y'.repeat(16), 'No');
  assert.deepEqual((await state()).errors, ['Title must be between 1 and 40 characters long', 'Option must be between 1 and 15 characters long'], 'checked again as you type');
  await fill('x'.repeat(40), ' ', 'y'.repeat(15));
  assert.deepEqual((await state()).errors, [], 'as typed: a space is something, 40 and 15 are fine');
  assert.equal(await page.locator(`${P} .kpr-f.bad`).count(), 0);
  assert.equal((await fetched()).length, asked, 'nothing sent');
});

test('Confirm: Cancel goes back to the form as it was; Start prediction sends Kick’s request, and the window closes when Kick starts it', async t => {
  const { page, open, state, fill, press, routes, fetched } = await chat(t);
  await open();
  await fill('Will we win this round?', 'Yes', 'No');
  await page.click(`${P} [name="duration"]`);
  assert.equal(await page.locator('.dd-list.kick.kick-lg').count(), 1, 'the app’s own list, dressed as Kick’s');
  await page.click('.dd-list.kick button:has-text("10 minutes")');
  await press('Start prediction');
  const confirm = await page.evaluate(P => { const k = document.querySelector(P);
    return [k.querySelector('h3').textContent, ...[...k.querySelectorAll('.kpr-d')].map(p => p.textContent), k.querySelector('.kpr-d b').textContent, document.activeElement === k]; }, P);
  assert.deepEqual(confirm, ['Confirm prediction',
    'Streamers or moderators must finalize an outcome for the prediction within 24 hours of the submission window. Once a prediction has been started, it\'s locked, except for deleting or closing submissions. If no outcome is chosen or the prediction is deleted, all Channel Points will be refunded.',
    'Mods who have participated are not able to choose the outcome.', '24 hours', true]);
  assert.deepEqual((await state()).buttons, ['Cancel', 'Start prediction']);
  await press('Cancel');
  assert.deepEqual(await page.evaluate(P => [...document.querySelectorAll(`${P} input, ${P} select`)].map(i => i.value), P), ['Will we win this round?', 'Yes', 'No', '10'], 'as it was');

  await press('Start prediction');
  await page.evaluate(() => { window.__routes[`POST https://kick.com/api/v2/channels/xqc/predictions`] = new Promise(r => { window.__release = () => r({ status: 200, body: { data: {} } }); }); });
  await press('Start prediction');
  await page.waitForFunction(P => document.querySelector(P).hasAttribute('aria-busy'), P);
  assert.equal(await page.locator(`${P} .kpr-b.green`).isDisabled(), true, 'busy while Kick answers');
  await page.evaluate(() => window.__release());
  await page.waitForSelector(P, { state: 'detached' });
  const sent = (await fetched()).filter(f => f.key.startsWith('POST'));
  assert.deepEqual(sent.map(f => [f.key, f.body, f.headers['Content-Type']]), [[`POST ${API}/predictions`, { title: 'Will we win this round?', outcomes: ['Yes', 'No'], duration: 600 }, 'application/json']]);
  await routes({});
});

test('when Kick doesn’t start it, the window says why, in Kick’s words, and offers the channel page', async t => {
  const { page, open, state, fill, press, routes } = await chat(t);
  const tryWith = async (answer, signedOut) => {
    await page.evaluate(() => document.querySelector('.win[data-ch] .kcmd')?.remove());
    await open();
    await fill('Win?', 'Yes', 'No');
    await press('Start prediction');
    await routes({ [`POST ${API}/predictions`]: answer });
    if (signedOut) await page.evaluate(() => { document.cookie = 'session_token=; max-age=0'; });
    await press('Start prediction');
    await page.waitForSelector(`${P} .kpr-fail:not([hidden])`);
    const s = await state();
    await page.evaluate(() => { document.cookie = 'session_token=' + encodeURIComponent('123|tok en'); });
    return [s.fail, s.page];
  };
  const generic = 'An error occurred while creating the prediction. Please try again.';
  assert.deepEqual(await tryWith({ status: 400, body: { message: 'Bad' } }), ['The prediction you\'re trying to create is invalid. Please try again.', true]);
  assert.deepEqual(await tryWith({ status: 409, body: { message: 'PREDICTION_ALREADY_EXISTS' } }), ['A prediction already exists for this channel, please close the existing prediction before creating a new one.', true]);
  assert.deepEqual(await tryWith({ status: 409, body: { message: 'Something else' } }), [generic, true]);
  assert.deepEqual(await tryWith({ status: 412, body: {} }), ['Channel points are disabled on this channel, please enable them in the creator dashboard to create predictions.', true]);
  assert.deepEqual(await tryWith({ status: 403, body: { message: 'Forbidden' } }), ['Only the streamer and the channel’s moderators can start predictions.', true]);
  assert.deepEqual(await tryWith({ status: 200 }, true), ['You need to be signed in to Kick to start a prediction.', false]);
  assert.deepEqual(await tryWith({ status: 500, body: '<html>oops</html>' }), [generic, true]);
  assert.deepEqual(await tryWith('throw'), [generic, true]);
  await page.click(`${P} .kpr-page`);
  assert.equal(await page.locator(P).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__opened), [['https://kick.com/xqc', 'kmv_page_xqc']], 'Open channel page');
});

test('Kick’s quick start: a past prediction fills in the form', async t => {
  const past = [{ id: 'a', title: 'First kill?', duration: 300, outcomes: [{ title: 'Me' }, { title: 'Them' }] },
    { id: 'b', title: 'Odd one', duration: 120, outcomes: [{ title: 'A' }, { title: 'B' }] }, { id: 'c', title: 'Broken', outcomes: [] }];
  const { page, open, state, press } = await chat(t, {}, { [`GET ${API}/predictions/recent`]: OK({ predictions: past }) });
  await open();
  await press('Start prediction');           // (checked already: picking one checks again)
  const pick = await page.evaluate(P => { const s = document.querySelector(`${P} [name="past"]`);
    return [s.closest('.kpr-f').querySelector('.kpr-l').textContent, [...s.options].map(o => o.textContent), s.value]; }, P);
  assert.deepEqual(pick, ['Past history predictions', ['Select a past prediction to get a quick start!', 'First kill?', 'Odd one'], '']);
  await page.click(`${P} [name="past"]`);
  await page.click('.dd-list.kick button:has-text("First kill?")');
  assert.deepEqual(await page.evaluate(P => [...document.querySelectorAll(`${P} input, ${P} [name="duration"]`)].map(i => i.value), P), ['First kill?', 'Me', 'Them', '5']);
  assert.deepEqual((await state()).errors, []);
  await page.click(`${P} [name="past"]`);
  await page.click('.dd-list.kick button:has-text("Odd one")');
  assert.equal(await page.inputValue(`${P} [name="duration"]`), '5', 'a length Kick doesn’t offer leaves it');
});

test('before the form: signed out, channel points off (the streamer is offered to turn them on), or Kick not answering', async t => {
  const { page, open, state, routes } = await chat(t);
  const text = () => page.evaluate(P => [...document.querySelectorAll(`${P} .kpr-d, ${P} .kpr-alert`)].map(e => e.innerText.replace(/\n+/g, ' ')), P);

  await page.evaluate(() => { document.cookie = 'session_token=; max-age=0'; });
  await open();
  assert.deepEqual([(await state()).title, ...(await text())], ['Start a prediction', 'You need to be signed in to Kick to start a prediction.']);
  await page.evaluate(() => { document.cookie = 'session_token=' + encodeURIComponent('123|tok en'); });

  await routes({ [`GET ${API}/channel-points/channel-settings`]: OK({ channel_points_enabled: false }) });
  await open();
  assert.deepEqual([(await state()).title, ...(await text()), ...(await state()).buttons], ['Unable to create prediction',
    'To start a prediction, channel points needs to be enabled by the channel owner in creator dashboard.', 'Got it']);
  await page.click(`${P} .kpr-foot button`);
  assert.equal(await page.locator(P).count(), 0, 'Got it closes it');

  await routes({ [`GET ${API}/me`]: { status: 200, body: { is_broadcaster: true } } });
  await open();
  assert.deepEqual((await state()).buttons, ['Cancel', 'Enable now']);
  await page.click(`${P} .kpr-foot button:text-is("Enable now")`);
  assert.deepEqual(await page.evaluate(() => window.__opened), [['https://dashboard.kick.com/channel/community/channel-points', '_blank']]);

  for (const answer of [{ status: 500, body: {} }, 'throw']) {
    await routes({ ...QUIET, [`GET ${API}/predictions/latest`]: answer });
    await open();
    assert.deepEqual([(await state()).title, ...(await text()), ...(await state()).buttons],
      ['Manage Prediction', 'Unable to load Sorry, we couldn\'t load your latest prediction. Please try again later.', 'Got it'], JSON.stringify(answer));
    await page.evaluate(() => document.querySelector('.win[data-ch] .kcmd').remove());
  }
  await routes({ ...QUIET, [`GET ${API}/channel-points/channel-settings`]: { status: 503, body: {} } });
  await open();
  assert.equal((await state()).title, 'Manage Prediction', 'or the channel points question');
  await routes({ ...QUIET, [`GET ${API}/predictions/latest`]: { status: 404, body: {} } });
  await page.evaluate(() => document.querySelector('.win[data-ch] .kcmd').remove());
  await open();
  assert.equal((await state()).title, 'Start a prediction', 'none to show: the form');
});

test('a running prediction: how it’s going and the time left; End Submissions, then Choose outcome, as Kick does them', async t => {
  const { page, open, state, routes, fetched } = await chat(t, {}, { [`GET ${API}/predictions/latest`]: OK({ prediction: running(), user_vote: null }) });
  await open();
  const look = () => page.evaluate(P => { const k = document.querySelector(P);
    return { title: k.querySelector('h3').textContent, q: k.querySelector('.kpr-q').textContent, pts: k.querySelector('.kpr-pts').textContent,
      pit: k.querySelector('.kpr-pit').innerText.replace(/\s+/g, ' ').trim(),
      options: [...k.querySelectorAll('.kpr-out')].map(o => o.innerText.replace(/\s+/g, ' ').trim() + (o.matches('.lost') ? ' (lost)' : '')),
      time: k.querySelector('.kpr-time')?.innerText.trim() || '', buttons: [...k.querySelectorAll('.kpr-foot button')].map(b => b.textContent),
      bar: k.querySelector('.kpr-bar i')?.style.transform || '' }; }, P);
  const a = await look();
  assert.match(a.time, /^Prediction closes in 0[34]:\d\d$/);
  assert.match(a.bar, /^scaleX\(0\.[78]\d*\)$/, 'four fifths left');
  assert.deepEqual({ ...a, time: '', bar: '' }, { title: 'Manage Prediction', q: 'Will we win?', pts: '1,000 points contributed', pit: '75% vs 25%',
    options: ['Yes 750 1:1.3 *', 'No 250 1:4 *'], time: '', bar: '', buttons: ['Delete', 'End Submissions'] });
  assert.equal(await page.evaluate(P => document.activeElement === document.querySelector(P), P), true, 'no button is focused');
  assert.equal(await page.evaluate(P => document.querySelector(`${P} .kcmd-c`).childNodes[0].nodeType, P), 1, 'no Limited Access, and nothing in its place');

  await routes({ [`PATCH ${API}/predictions/p1`]: OK({}), [`GET ${API}/predictions/latest`]: OK({ prediction: running({ state: 'LOCKED' }) }) });
  await page.click(`${P} .kpr-foot button:text-is("End Submissions")`);
  await page.waitForFunction(P => document.querySelector(P).innerText.includes('Predictions closed'), P);
  assert.deepEqual((await look()).buttons, ['Delete', 'Choose outcome']);
  assert.deepEqual((await look()).options, ['Yes 750 1:1.3', 'No 250 1:4'], 'no * once closed');

  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  assert.equal((await state()).title, 'Choose outcome');
  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  assert.deepEqual((await state()).errors, ['Please select an outcome']);
  await page.click(`${P} .kpr-pick:has-text("No")`);
  assert.deepEqual(await page.evaluate(P => [[...document.querySelectorAll(`${P} .kpr-pick`)].map(b => b.getAttribute('aria-pressed')),
    document.querySelector(`${P} .kpr-picks ~ .kpr-d, ${P} .kpr-f + .kpr-d`).innerText.replace(/\n+/g, ' ')], P),
  [['false', 'true'], 'Are you sure "No" is the correct outcome? Once you choose the outcome, viewers who have chosen the correct outcome will be awarded 250 channel points. You will not be able to reverse your choice and this will end the prediction.']);
  assert.deepEqual((await state()).errors, []);
  await page.click(`${P} .kpr-foot button:text-is("Cancel")`);
  assert.equal((await state()).title, 'Manage Prediction', 'Cancel: back');
  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  await page.click(`${P} .kpr-pick:has-text("Yes")`);
  await routes({ [`GET ${API}/predictions/latest`]: OK({ prediction: running({ state: 'RESOLVED', winning_outcome_id: 'o1' }) }) });
  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  await page.waitForFunction(P => document.querySelector(P).innerText.includes('Winner'), P);
  const done = await look();
  assert.deepEqual([done.title, done.pit, done.options, done.time, done.buttons],
    ['Manage Prediction', 'Winner 75%', ['Yes Winner 750 1:1.3', 'No 250 1:4 (lost)'], '', ['Cancel', 'Start a prediction']]);
  const patches = (await fetched()).filter(f => f.key.startsWith('PATCH')).map(f => [f.key, f.body]);
  assert.deepEqual(patches, [[`PATCH ${API}/predictions/p1`, { state: 'LOCKED' }], [`PATCH ${API}/predictions/p1`, { state: 'RESOLVED', winning_outcome_id: 'o1' }]]);

  await page.click(`${P} .kpr-foot button:text-is("Start a prediction")`);
  assert.deepEqual([(await state()).title, await page.inputValue(`${P} [name="title"]`)], ['Start a prediction', ''], 'a new one, from scratch');
});

test('Delete: the prediction goes and the points come back; Go back keeps it', async t => {
  const { page, open, state, routes, fetched } = await chat(t, {}, { [`GET ${API}/predictions/latest`]: OK({ prediction: running() }) });
  await open();
  await page.click(`${P} .kpr-foot button:text-is("Delete")`);
  assert.deepEqual([(await state()).title, await page.evaluate(P => document.querySelector(`${P} .kpr-d`).innerText.replace(/\n+/g, ' '), P), ...(await state()).buttons],
    ['Delete Prediction', 'This will remove the ongoing prediction. Viewers will no longer be able to participate, votes are discarded, and Channel Points are automatically returned. Selecting \'Delete & return points\' will return 1,000 Channel Points to participating viewers.', 'Go back', 'Delete & return points']);
  await page.click(`${P} .kpr-foot button:text-is("Go back")`);
  assert.equal((await state()).title, 'Manage Prediction');
  await page.click(`${P} .kpr-foot button:text-is("Delete")`);
  await routes({ [`PATCH ${API}/predictions/p1`]: OK({}), [`GET ${API}/predictions/latest`]: OK({ prediction: running({ state: 'CANCELLED' }) }) });
  await page.click(`${P} .kpr-foot button:text-is("Delete & return points")`);
  await page.waitForFunction(P => document.querySelector(`${P} .kpr-foot`)?.innerText.includes('Start a prediction'), P);
  assert.deepEqual((await fetched()).filter(f => f.key.startsWith('PATCH')).map(f => f.body), [{ state: 'CANCELLED' }]);
  assert.equal(await page.evaluate(P => document.querySelector(`${P} .kpr-pit`).innerText.replace(/\s+/g, ' ').trim(), P), '75% vs 25%', 'no winner');
});

test('when Kick doesn’t change it, the window says why, in Kick’s words', async t => {
  const { page, open, state, routes } = await chat(t, {}, { [`GET ${API}/predictions/latest`]: OK({ prediction: running() }) });
  await open();
  const end = async answer => {
    await routes({ [`PATCH ${API}/predictions/p1`]: answer });
    await page.click(`${P} .kpr-foot button:text-is("End Submissions")`);
    await page.waitForSelector(`${P} .kpr-fail:not([hidden])`);
    return [(await state()).fail, (await state()).page];
  };
  assert.deepEqual(await end({ status: 400, body: {} }), ['The prediction you\'re trying to update is invalid. Please try again.', false]);
  assert.deepEqual(await end({ status: 403, body: {} }), ['You are not allowed to update this prediction.', false]);
  assert.deepEqual(await end({ status: 404, body: {} }), ['The prediction you\'re trying to update was not found. Please try again.', false]);
  assert.deepEqual(await end({ status: 500, body: {} }), ['An error occurred while ending the prediction. Please try again.', false]);
  await page.click(`${P} .kpr-foot button:text-is("Delete")`);
  await page.click(`${P} .kpr-foot button:text-is("Delete & return points")`);
  await page.waitForSelector(`${P} .kpr-fail:not([hidden])`);
  assert.equal((await state()).fail, 'An error occurred while deleting the prediction. Please try again.');

  await routes({ [`GET ${API}/predictions/latest`]: OK({ prediction: running({ state: 'LOCKED' }) }) });
  await page.evaluate(() => document.querySelector('.win[data-ch] .kcmd').remove());
  await open();
  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  await page.click(`${P} .kpr-pick >> nth=0`);
  await routes({ [`PATCH ${API}/predictions/p1`]: 'throw' });
  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  await page.waitForSelector(`${P} .kpr-fail:not([hidden])`);
  assert.equal((await state()).fail, 'An error occurred while choosing the outcome. Please try again.');
  await page.evaluate(() => { document.cookie = 'session_token=; max-age=0'; });
  await page.click(`${P} .kpr-foot button:text-is("Choose outcome")`);
  await page.waitForFunction(P => document.querySelector(`${P} .kpr-fail span`).textContent.includes('signed in'), P);
  assert.equal((await state()).fail, 'You need to be signed in to Kick to start a prediction.');
});

test('a mod who predicted can only watch it (Kick’s Limited Access)', async t => {
  const { page, open, state } = await chat(t, {}, { [`GET ${API}/predictions/latest`]: OK({ prediction: running(), user_vote: { outcome_id: 'o1' } }) });
  await open();
  assert.deepEqual([await page.evaluate(P => document.querySelector(`${P} .kpr-alert`).innerText.replace(/\n+/g, ' '), P), (await state()).buttons],
    ['Limited Access Since you\'ve participated in this prediction, you can no longer manage this event.', []]);
});

test('while it’s running the time counts down, and every 5 seconds the window asks Kick again (until it’s closed)', async t => {
  const now = Date.parse('2026-10-23T12:00:00Z'), at = new Date(now - 298000).toISOString();   // (the page's clock is set to now)
  const { page, open, routes } = await chat(t, {}, { [`GET ${API}/predictions/latest`]: OK({ prediction: running({ created_at: at }) }) });
  await page.clock.install({ time: now });
  await open();
  const left = () => page.evaluate(P => document.querySelector(`${P} .kpr-left`).textContent, P);
  const asked = () => page.evaluate(() => window.__fetched.filter(f => f.key.endsWith('/predictions/latest')).length);
  const before = await asked(), t0 = await left();
  assert.equal(t0, '00:02');
  await routes({ [`GET ${API}/predictions/latest`]: OK({ prediction: running({ created_at: at, outcomes: [{ id: 'o1', title: 'Yes', total_vote_amount: 100, return_rate: 2 }, { id: 'o2', title: 'No', total_vote_amount: 100, return_rate: 2 }] }) }) });
  await page.clock.runFor(3100);
  assert.equal(await left(), '00:00', 'counted down, not below nothing');
  await page.clock.runFor(2000);
  await page.evaluate(() => new Promise(r => queueMicrotask(r)));
  assert.equal(await asked(), before + 1, 'asked again');
  await page.clock.runFor(100);
  assert.equal(await page.evaluate(P => document.querySelector(`${P} .kpr-pit`).innerText.replace(/\s+/g, ' ').trim(), P), '50% vs 50%', 'with the news');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(P).count(), 0);
  const n = await asked();
  await page.clock.runFor(11000);
  assert.equal(await asked(), n, 'not once it’s closed');
});

test('closing it, /prediction again while it’s open, and only Kick chats', async t => {
  const { page, open, fill } = await chat(t);
  for (const how of ['cancel', '×', 'Escape']) {
    await open();
    if (how === 'Escape') await page.press(`${P} [name="title"]`, 'Escape');
    else await page.click(how === '×' ? `${P} .kcmd-x` : `${P} .kpr-foot button:text-is("Cancel")`);
    assert.equal(await page.locator(P).count(), 0, how);
  }
  await open();
  await page.click(`${P} [name="duration"]`);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(P).count(), 1, 'Esc closes an open list first');

  await fill('Kept', '', '');
  await page.evaluate(() => window.__w.el.querySelector('.kcmd-x').focus());
  assert.equal(await page.evaluate(() => !!window.openPredictionForm(window.__w, 'Other')), true);
  assert.deepEqual(await page.evaluate(P => [document.querySelectorAll(P).length, document.querySelector(`${P} [name="title"]`).value, document.activeElement.name], P),
    [1, 'Kept', 'title'], 'the open one, as it was, with its box focused');
  await page.evaluate(() => window.openPollForm(window.__w, ''));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.win[data-ch] .kcmd')].map(e => e.className)), ['kcmd kpoll'], '/poll takes its place');
  assert.equal(await page.evaluate(() => window.openPredictionForm({ channel: 'xqc' }, '')), null, 'a window that’s gone');
});

test('narrow and short chats: always the chat’s width; it scrolls when the chat is shorter, and the buttons stack when it’s narrow', async t => {
  for (const [width, height] of [[460, 760], [240, 760], [240, 320]]) {
    const { page, open, fill } = await chat(t, { width, height });
    await open('A question that is long');
    await fill('A question that is long', 'Option number 1', 'Option number 2');
    const got = await page.evaluate(P => {
      const k = document.querySelector(P), body = k.closest('.body').getBoundingClientRect(), r = k.getBoundingClientRect();
      const [a, b] = [...k.querySelectorAll('.kpr-foot button')].map(x => x.getBoundingClientRect());
      return { fullWidth: Math.abs(r.width - body.width) < 1, noSideways: k.scrollWidth <= k.clientWidth, inside: r.top >= body.top - 1,
        scrolls: k.scrollHeight > k.clientHeight + 1, stacked: Math.abs(a.top - b.top) > 1 };
    }, P);
    assert.deepEqual(got, { fullWidth: true, noSideways: true, inside: true, scrolls: height < 700, stacked: width < 300 }, `${width}×${height}`);
  }
});
