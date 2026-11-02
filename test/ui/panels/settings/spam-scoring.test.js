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
// The warnings' messages (on hover), in the order their ⚠ icons show
const warnings = page => page.$$eval('[data-s=spam] [data-t=scoring] .sc-warn-ico:not([hidden])', e => e.map(i => i.title));
const warnedAt = page => page.$$eval('[data-s=spam] [data-t=scoring] .sc-warn-ico:not([hidden])', e => e.map(i => i.id || i.closest('[data-pt]')?.dataset.pt || i.closest('[data-g]').dataset.g));

test('Scoring: every sign has a slider from 0 (Off) to 8 at its built-in points, and only changed points are kept', async t => {
  const page = await openSpam(t, 'scoring');
  const rows = await page.$$eval('#spamPoints .sc-group', g => g.map(x => [x.dataset.g, [...x.querySelectorAll('.sc-row')].map(r => r.dataset.pt)]));
  assert.deepEqual(rows, [['spam', ['hidden', 'plain', 'contact', 'elsewhere', 'flood', 'opener', 'words', 'junk', 'newbie', 'filler']], ['abuse', ['insult', 'slur', 'sexual', 'swearing', 'again']]]);
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
  assert.deepEqual(await warnedAt(page), ['plain'], 'a ⚠ on its row, with the message on hover');
  assert.equal(await page.getAttribute('.sc-row[data-pt=plain] .sc-warn-ico', 'aria-label'), (await warnings(page))[0]);
  await page.selectOption('[data-s=spam] .st-subpane[data-t=scoring] [data-al="spam.sens"]', 'relaxed');
  assert.deepEqual(await warnings(page), [], 'Relaxed needs 6');
  await page.selectOption('[data-s=spam] .st-subpane[data-t=scoring] [data-al="spam.sens"]', 'balanced');
  for (const k of ['hidden', 'plain', 'contact', 'elsewhere', 'flood', 'opener']) await slide(page, k, 0);
  assert.deepEqual(await warnings(page), ['Nothing can flag promo spam: every sign that can is off.']);
  assert.deepEqual(await warnedAt(page), ['spam'], 'on the Spam heading');

  await page.click('#spamPointsReset');
  await page.click('#askDlg .ask-no');
  assert.equal((await saved(page)).points.hidden, 0, 'not without asking');
  await page.click('#spamPointsReset');
  await page.click('#askDlg .ask-yes');
  assert.equal((await saved(page)).points, null);
  assert.equal(await page.inputValue('.sc-row[data-pt=hidden] input'), '3');
  assert.deepEqual(await warnings(page), []);
  assert.ok(await page.isDisabled('#spamPointsReset'));

  // every sign at 8: most signs high goes on the line above them, and each that's now enough on its own on its row
  for (const k of ['hidden', 'plain', 'contact', 'elsewhere', 'flood', 'opener', 'words', 'junk', 'newbie', 'insult', 'slur', 'sexual', 'swearing', 'again']) await slide(page, k, 8);
  assert.deepEqual(await warnedAt(page), ['spamWarnAll', 'hidden', 'plain', 'contact', 'elsewhere', 'insult']);
  assert.match(await page.getAttribute('#spamWarnAll', 'title'), /^Most signs are worth 4 or more/);
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
  for (const k of ['insult', 'slur', 'sexual', 'swearing']) await slide(page, k, 0);
  assert.deepEqual(await warnings(page), ['Nothing can flag abuse: every sign that can is off.']);
  assert.deepEqual(await warnedAt(page), ['abuse']);
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

test('Lists: abuse words, slurs and threats, swear words and sexual words can be added to, emptied and reset', async t => {
  const page = await openSpam(t, 'lists');
  const chips = which => page.$$eval(`[data-list=${which}] .st-chip`, c => c.map(x => x.textContent));
  for (const [which, has] of [['abuseWords', 'whore'], ['slurs', 'kys'], ['swears', 'fuck'], ['sexual', 'penis']]) {
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
  await page.click('#spamListPick [data-l=sexual]');
  await page.fill('[data-add=sexual]', 'Wiggle');
  await page.click('[data-addbtn=sexual]');
  assert.ok((await saved(page)).sexual.includes('wiggle'));
  await page.click('#spamTabs [data-t=try]');
  await page.fill('#spamTry', 'your wiggle');
  await page.click('#spamTryBtn');
  assert.match(await page.textContent('#spamRes'), /Would be flagged as abusive[\s\S]*Sexual remark aimed at someone: "wiggle"/);
  await page.click('#spamTabs [data-t=lists]');
  await page.click('[data-reset=sexual]');
  assert.equal((await saved(page)).sexual, null);
  await page.click('#spamListPick [data-l=swears]');
  await page.fill('[data-add=swears]', '!!');
  await page.click('[data-addbtn=swears]');
  assert.match(await page.textContent('#msg'), /Type a word or phrase/);
});

test('Lists: the abuse lists are blurred under a cover until you click it, and hidden again when Settings reopens', async t => {
  const page = await openSpam(t, 'lists');
  const veiled = which => page.$eval(`[data-list=${which}]`, b => b.parentNode.classList.contains('veiled') && b.inert);
  assert.equal(await page.$eval('[data-list=allow]', b => b.parentNode.classList.contains('st-veil')), false, 'the other lists have no cover');
  await page.click('#spamListPick [data-l=slurs]');
  assert.ok(await veiled('slurs'));
  assert.equal(await page.textContent('[data-reveal=slurs] small'), `Click to show all ${await page.textContent('[data-lcount=slurs]')}`);
  assert.equal(await page.isVisible('[data-hide=slurs]'), false);
  const blur = await page.$eval('[data-list=slurs]', b => getComputedStyle(b).filter);
  assert.match(blur, /blur/);
  await page.click('[data-reveal=slurs]');
  assert.equal(await veiled('slurs'), false);
  await page.waitForSelector('[data-reveal=slurs]', { state: 'hidden' });   // (once it's faded out)
  await page.click('[data-list=slurs] .st-chip:has-text("kys") button');   // its words can be removed once shown
  assert.equal((await saved(page)).slurs.includes('kys'), false);
  await page.click('[data-hide=slurs]');
  assert.ok(await veiled('slurs'), 'Hide puts the cover back');
  await page.click('[data-reveal=slurs]');
  await page.click('#spamListPick [data-l=swears]');
  assert.ok(await veiled('swears'), 'each list has its own cover');
  await page.click('#spamListPick [data-l=sexual]');
  assert.ok(await veiled('sexual'), 'sexual words too');
  await page.click('#spamListPick [data-l=slurs]');
  assert.equal(await veiled('slurs'), false, 'shown until Settings closes');
  await show(page, 'lists');
  assert.ok(await veiled('slurs'), 'hidden again when Settings opens');
  await page.evaluate(() => document.querySelector('[data-add=abuseWords]').closest('.ly-panel').hidden = false);
  for (const w of await page.$$eval('[data-list=abuseWords] .st-chip > span', s => s.map(x => x.textContent))) {
    await page.evaluate(w => [...document.querySelectorAll('[data-list=abuseWords] .st-chip')].find(c => c.firstChild.textContent === w)?.querySelector('button').click(), w);
  }
  assert.deepEqual((await saved(page)).abuseWords, []);
  assert.equal(await veiled('abuseWords'), false, 'nothing to hide in an empty list');
  assert.equal(await page.isVisible('[data-hide=abuseWords]'), false);
});

test('Scoring fits without scrolling in a 1280 × 800 window, with warnings showing, every name on one line, and Reset beside the line above', async t => {
  const page = await openSpam(t, 'scoring', { width: 1280, height: 800 });
  await slide(page, 'plain', 5);
  await slide(page, 'newbie', 4);
  assert.equal((await warnings(page)).length, 2);
  const { scroll, view } = await page.$eval('#settingsDlg .st-body', e => ({ scroll: e.scrollHeight, view: e.clientHeight }));
  assert.ok(scroll <= view, `no vertical scrolling: ${scroll} > ${view}`);
  const cut = await page.$$eval('.sc-name', e => e.filter(n => n.scrollWidth > n.clientWidth).map(n => n.textContent));
  assert.deepEqual(cut, [], 'no name cut short');
  const widths = await page.$$eval('.sc-row .sc-slider', e => [...new Set(e.map(x => Math.round(x.getBoundingClientRect().width)))]);
  assert.deepEqual(widths, [84], 'every slider the same width, with or without a ⚠ in its row');
  const [desc, reset] = [await page.locator('.sc-top .st-sub').boundingBox(), await page.locator('#spamPointsReset').boundingBox()];
  assert.ok(reset.x >= desc.x + desc.width && Math.abs((reset.y + reset.height / 2) - (desc.y + desc.height / 2)) < 12, 'Reset to defaults right of the text');
});
