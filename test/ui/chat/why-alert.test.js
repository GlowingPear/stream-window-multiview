// Why didn't this alert? (src/page/chat/why-alert.js): each check in order, from what the chat's helper said about the
// message and the app's own settings, and the first reason it didn't alert.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const rows = (page, ch, r) => page.evaluate(([ch, r]) => { const x = window.whyChecks({ channel: ch }, r);
  return { rows: x.checks.map(c => (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '– ') + c.text + (c.note ? ` (${c.note})` : '')), verdict: (x.verdict.alert ? 'Alerted: ' : 'No alert: ') + x.verdict.text }; }, [ch, r]);
const said = (o = {}) => ({ found: true, sender: 'quietkoala', body: 'hello there', at: false, word: '', own: false, armed: true, decided: { v: 'nomatch', t: Date.now() }, ...o });

test('no username, a site without mention alerts, a message the helper couldn\'t find', async t => {
  const page = await openApp(t);
  let r = await rows(page, 'pixelpear', said());
  assert.deepEqual(r.rows, ['✓ Read as a message: name quietkoala, text “hello there”', '✓ Mention alerts are on', '✓ Mentions are on for this chat',
    '✗ No Kick username to look for (Settings › Mentions › Your usernames)', '– Words to watch: none set',
    '✗ Read when it came in: it didn\'t mention you or a word you watch for', '– Spam alerts: off']);
  assert.equal(r.verdict, 'No alert: No Kick username to look for');
  r = await rows(page, 'yt:@mossfern', said());
  assert.equal(r.rows[1], '✗ Mention alerts read Kick and Twitch chats, not YouTube');
  assert.equal(r.rows.at(-1), '– Spam alerts: not for YouTube');
  r = await rows(page, 'pixelpear', { found: false, text: 'pinned: be nice' });
  assert.deepEqual(r.rows, ['✗ Read as a message (The helper couldn\'t find “pinned: be nice” among the chat\'s messages)']);
  assert.match((await rows(page, 'pixelpear', null)).rows[0], /didn't answer/);
  assert.match((await rows(page, 'pixelpear', said({ decided: null, armed: false }))).rows.join('\n'), /Alerts hadn't started in this chat yet/);
  assert.match((await rows(page, 'pixelpear', said({ decided: null }))).rows.join('\n'), /Not read yet by the helper/);
  for (const [v, text] of [['before', 'already in the chat'], ['own', 'your own message'], ['translated', 'before it was translated'], ['redrawn', 'drew a message again'], ['busy', 'Too many alerts'], ['off', 'no name or word']])
    assert.match((await rows(page, 'pixelpear', said({ decided: { v, t: 0 } }))).rows.join('\n'), new RegExp(text), v);
});

test('mentions off, off in this chat, a chat bot, your words, alerted, spam alerts, do not disturb and the bell', async t => {
  const page = await openApp(t, { init: () => {
    const s = (k, v) => localStorage.setItem('kickMultiview.' + k, v);
    s('myName', 'mod_me'); s('mentWords', '["pear"]'); s('mentMuted', '["pixelpear"]'); s('mentOn', '0'); s('dnd', '-1');
    s('alerts', JSON.stringify({ spam: { on: true } }));
    s('notifications', JSON.stringify([{ id: 'n1', kind: 'mention', channel: 'pixelpear', sender: 'Nightbot', body: 'pear pie', t: Date.now() - 60000 }]));
  } });
  const r = await rows(page, 'pixelpear', said({ sender: 'Nightbot', body: 'pear pie https://bit ly/x', word: 'pear', decided: { v: 'alerted', kind: 'word', t: Date.now() } }));
  assert.deepEqual(r.rows.slice(0, 6), ['✓ Read as a message: name Nightbot, text “pear pie https://bit ly/x”', '✗ Mention alerts are off (Settings › Mentions)',
    '✗ Mentions are off for this chat (The @ button on its title bar)', '✗ Nightbot is on the chat bot list (Never a mention)', '✗ Mentions you: looked for @mod_me',
    '✓ Has “pear”, a word you watch for']);
  assert.match(r.rows[6], /^✓ Alerted as a word you watch for at \d/);
  assert.match(r.rows[7], /^– Spam alerts: on the chat bot list|^– Spam alerts: \d+ of the \d+ points needed|^✓ Spam alerts: would flag it/);
  assert.ok(r.rows.includes('– Do not disturb is on (Alerts still go under the bell, without pop-ups or sounds)'));
  assert.match(r.rows.at(-1), /^✓ It's under the bell \(/);
  assert.equal(r.verdict, 'Alerted: It did alert: it\'s under the bell');
  // a mention of you, with words set but not in it
  const m = await rows(page, 'pixelpear', said({ body: '@mod_me hi', at: true }));
  assert.ok(m.rows.includes('✓ Mentions you (@mod_me)') && m.rows.includes('– Words to watch: none of yours (pear)'));
  // spam alerts on, someone else's message: its score
  const s = await rows(page, 'pixelpear', said({ body: 'best viewers here: streamboost dot com zero cost upgrades' }));
  assert.match(s.rows.find(x => /Spam alerts/.test(x)), /^(✓|–) Spam alerts: /);
});

test('the dialog: the checks, Copy, Mention settings and Close', async t => {
  const page = await openApp(t);
  // a chat window whose helper answers (the view is stood in: the sites are blocked here)
  await page.evaluate(() => {
    const view = { executeJavaScript: async () => ({ found: true, sender: 'quietkoala', body: 'hello <b>there</b>', at: false, word: '', own: false, armed: true, decided: { v: 'nomatch', t: Date.now() } }) };
    window.__copied = [];
    navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve(); };
    return window.showWhy({ channel: 'pixelpear', view });
  });
  await page.waitForSelector('#whyDlg');
  assert.equal(await page.textContent('#whyDlg .why-line'), 'quietkoala: hello <b>there</b>', 'the message is text');
  assert.equal(await page.textContent('#whyDlg .dlg-sub'), 'pixelpear\'s chat · Kick');
  assert.match(await page.textContent('#whyDlg .why-verdict'), /^No alert: No Kick username/);
  await page.click('#whyDlg button:text-is("Copy")');
  assert.match(await page.evaluate(() => window.__copied[0]), /^How this message was read · pixelpear · Kick\nquietkoala: hello <b>there<\/b>\n✓ Read as a message/);
  await page.click('#whyDlg button:text-is("Mention settings")');
  assert.equal(await page.locator('#whyDlg').count(), 0);
  assert.equal(await page.isVisible('#settingsDlg'), true, 'Settings (its Mentions page is the desktop app\'s)');
  // Close, and a click outside it
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.showWhy({ channel: 'pixelpear', view: { executeJavaScript: async () => null } }));
  await page.click('#whyDlg .why-ok');
  assert.equal(await page.locator('#whyDlg').count(), 0);
  await page.evaluate(() => window.showWhy({ channel: 'pixelpear', view: { executeJavaScript: async () => { throw new Error('gone'); } } }));
  await page.mouse.click(4, 4);
  assert.equal(await page.locator('#whyDlg').count(), 0);
  await page.evaluate(() => window.showWhy(null));
  assert.equal(await page.locator('#whyDlg').count(), 0, 'no window: nothing');
});
