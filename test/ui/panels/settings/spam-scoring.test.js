// Settings › Spam alerts › Scoring: a slider for each sign's points, warnings about the ones that may misfire, and
// Reset to defaults. Also the abuse toggle and lists, and Try it with your points.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

async function show(page, tab){
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=spam]').hidden = false; openSettings('spam'); });   // (the desktop app's page)
  await page.click(`#spamTabs [data-t=${tab}]`);
}
async function openSpam(t, tab, size){
  const page = await openApp(t, size);
  await show(page, tab);
  return page;
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts') || '{}').spam || {});
const slide = (page, key, v) => page.fill(`.sc-row[data-pt="${key}"] input`, String(v));
const val = (page, key) => page.textContent(`.sc-row[data-pt="${key}"] .sc-val`);
const warnings = page => page.$$eval('#spamWarn:not([hidden]) div', e => e.map(d => d.textContent));

test('Scoring: every sign has a slider from 0 (Off) to 8 at its built-in points, and only changed points are kept', async t => {
  const page = await openSpam(t, 'scoring');
  const rows = await page.$$eval('#spamPoints .sc-group', g => g.map(x => [x.dataset.g, [...x.querySelectorAll('.sc-row')].map(r => r.dataset.pt)]));
  assert.deepEqual(rows, [['spam', ['hidden', 'plain', 'contact', 'elsewhere', 'flood', 'opener', 'words', 'junk', 'newbie']], ['abuse', ['insult', 'slur', 'swearing', 'again']]]);
  assert.deepEqual(await page.$eval('.sc-row[data-pt=hidden] input', e => [e.min, e.max, e.value]), ['0', '8', '3']);
  assert.equal(await page.textContent('.sc-row[data-pt=hidden] .sc-flag'), '⚑', 'can flag a message');
  assert.equal(await page.textContent('.sc-row[data-pt=newbie] .sc-flag'), '', 'only adds points');
  assert.deepEqual(await page.$eval('.sc-row[data-pt=plain] .sc-name', e => [e.textContent, e.title]), ['Unlisted link', 'Link to a site not on the allowed list'], 'a short name, the full one as its tooltip');
  assert.deepEqual(await warnings(page), [], 'the built-in points: no warnings');
  assert.ok(await page.isDisabled('#spamPointsReset'), 'nothing to reset');

  await slide(page, 'hidden', 5);
  assert.equal(await val(page, 'hidden'), '5');
  assert.ok(await page.$eval('.sc-row[data-pt=hidden]', e => e.classList.contains('changed')));
  await slide(page, 'opener', 0);
  assert.equal(await val(page, 'opener'), 'Off');
  assert.deepEqual((await saved(page)).points, { hidden: 5, opener: 0 });
  await slide(page, 'hidden', 3);
  assert.deepEqual((await saved(page)).points, { opener: 0 }, 'back at its built-in points: not kept');
  await page.dblclick('.sc-row[data-pt=opener] .sc-slider');
  assert.equal((await saved(page)).points, null, 'double-click puts it back');
  assert.equal(await val(page, 'opener'), '6');

  await slide(page, 'insult', 7);
  await page.reload();
  await show(page, 'scoring');
  assert.equal(await page.inputValue('.sc-row[data-pt=insult] input'), '7', 'remembered');
});

test('Scoring: warnings follow the points and the sensitivity, and Reset to defaults asks first', async t => {
  const page = await openSpam(t, 'scoring');
  await slide(page, 'plain', 5);
  assert.deepEqual(await warnings(page), ['Link to a site not on the allowed list (5) is now enough on its own on Balanced: every message with it is flagged.']);
  await page.selectOption('[data-s=spam] .st-subpane[data-t=scoring] [data-al="spam.sens"]', 'relaxed');
  assert.deepEqual(await warnings(page), [], 'Relaxed needs 6');
  await page.selectOption('[data-s=spam] .st-subpane[data-t=scoring] [data-al="spam.sens"]', 'balanced');
  for (const k of ['hidden', 'plain', 'contact', 'elsewhere', 'flood', 'opener']) await slide(page, k, 0);
  assert.deepEqual(await warnings(page), ['Nothing can flag promo spam: every sign that can is off.']);

  await page.click('#spamPointsReset');
  await page.click('#askDlg .ask-no');
  assert.equal((await saved(page)).points.hidden, 0, 'not without asking');
  await page.click('#spamPointsReset');
  await page.click('#askDlg .ask-yes');
  assert.equal((await saved(page)).points, null);
  assert.equal(await page.inputValue('.sc-row[data-pt=hidden] input'), '3');
  assert.deepEqual(await warnings(page), []);
  assert.ok(await page.isDisabled('#spamPointsReset'));
});

test('abuse: the toggle dims its signs and silences its warnings; Try it uses your points and says when it\'s abuse', async t => {
  const page = await openSpam(t, 'alerts');
  assert.ok(await page.isChecked('[data-al="spam.abuse"]'), 'on to start with');
  await page.click('#spamTabs [data-t=try]');
  await page.fill('#spamTry', 'kys');
  await page.click('#spamTryBtn');
  assert.match(await page.textContent('#spamRes'), /^Would be flagged as abusive \(5 points needed\)Slur or threat: "kys"\+5/);
  await page.fill('#spamTry', 'ur a whore');
  await page.click('#spamTryBtn');
  assert.match(await page.textContent('#spamRes'), /^Not flagged \(4 of the 5 points needed\)Insult aimed at someone/);
  await page.click('#spamTabs [data-t=scoring]');
  await slide(page, 'insult', 5);
  await page.click('#spamTabs [data-t=try]');
  assert.match(await page.textContent('#spamRes'), /^Would be flagged as abusive/, 'checked again with the new points');

  await page.click('#spamTabs [data-t=scoring]');
  for (const k of ['insult', 'slur', 'swearing']) await slide(page, k, 0);
  assert.deepEqual(await warnings(page), ['Nothing can flag abuse: every sign that can is off.']);
  await page.click('#spamTabs [data-t=alerts]');
  await page.click('[data-s=spam] [data-al="spam.abuse"]');
  assert.equal((await saved(page)).abuse, false);
  await page.click('#spamTabs [data-t=scoring]');
  assert.ok(await page.$eval('.sc-group[data-g=abuse]', e => e.classList.contains('st-dim')));
  assert.deepEqual(await warnings(page), [], 'abuse off: nothing to warn about');
  await page.click('#spamTabs [data-t=try]');
  await page.fill('#spamTry', 'kys');
  await page.click('#spamTryBtn');
  assert.match(await page.textContent('#spamRes'), /No signs of spam/);
});

test('Lists: abuse words, slurs and threats, and swear words can be added to, emptied and reset', async t => {
  const page = await openSpam(t, 'lists');
  const chips = which => page.$$eval(`[data-list=${which}] .st-chip`, c => c.map(x => x.textContent));
  for (const [which, has] of [['abuseWords', 'whore'], ['slurs', 'kys'], ['swears', 'fuck']]) {
    await page.click(`#spamListPick [data-l=${which}]`);
    assert.ok((await chips(which)).includes(has), which);
    assert.equal(await page.textContent(`[data-lcount=${which}]`), String((await chips(which)).length));
  }
  await page.click('#spamListPick [data-l=abuseWords]');
  await page.fill('[data-add=abuseWords]', '  Muppet ');
  await page.press('[data-add=abuseWords]', 'Enter');
  assert.ok((await chips('abuseWords')).includes('muppet'), 'kept in lower case');
  assert.ok((await saved(page)).abuseWords.includes('muppet'));
  await page.click('#spamTabs [data-t=try]');
  await page.fill('#spamTry', 'ur a muppet');
  await page.click('#spamTryBtn');
  assert.match(await page.textContent('#spamRes'), /Insult aimed at someone: "ur a muppet"/);
  await page.click('#spamTabs [data-t=lists]');
  await page.click('[data-reset=abuseWords]');
  assert.equal((await saved(page)).abuseWords, null);
  await page.click('#spamListPick [data-l=swears]');
  await page.fill('[data-add=swears]', '!!');
  await page.click('[data-addbtn=swears]');
  assert.match(await page.textContent('#msg'), /Type a word or phrase/);
});

test('Scoring fits without scrolling in a 1280 × 800 window, with warnings showing, and every name on one line', async t => {
  const page = await openSpam(t, 'scoring', { width: 1280, height: 800 });
  await slide(page, 'plain', 5);
  await slide(page, 'newbie', 4);
  assert.equal((await warnings(page)).length, 2);
  const { scroll, view } = await page.$eval('#settingsDlg .st-body', e => ({ scroll: e.scrollHeight, view: e.clientHeight }));
  assert.ok(scroll <= view, `no vertical scrolling: ${scroll} > ${view}`);
  const cut = await page.$$eval('.sc-name', e => e.filter(n => n.scrollWidth > n.clientWidth).map(n => n.textContent));
  assert.deepEqual(cut, [], 'no name cut short');
});
