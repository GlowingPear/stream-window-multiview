// Settings › Guide (src/page/panels/help/guide.js): the pages in docs/guide, their contents, search, the ? on each
// Settings page and Show me.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

async function guide(t, slug = '') {
  const page = await openApp(t, { width: 1400, height: 900 });
  await page.evaluate(s => window.guide.show(s), slug);
  await page.waitForSelector('#settingsDlg .gd-art');
  return page;
}
const h2 = page => page.textContent('#settingsDlg .gd-art h2');
const toc = page => page.locator('#settingsDlg .gd-toc');

test('the first page lists every topic by group; a topic has its buttons, its links work, and Previous / Next step through', async t => {
  const page = await guide(t);
  assert.equal(await h2(page), 'Guide');
  assert.deepEqual(await page.$$eval('#settingsDlg .gd-card h3', e => e.map(x => x.textContent)), ['Start', 'Watching', 'Chat', 'Alerts', 'Sites & apps', 'The app', 'Help']);
  assert.equal(await page.$eval('#settingsDlg .gd-home', e => e.classList.contains('on')), true);
  // a topic from the contents: where it is, what it's about, Open Settings and Show me
  await toc(page).locator('.gd-ti', { hasText: 'Layouts' }).first().click();
  assert.equal(await h2(page), 'Layouts');
  assert.equal(await page.textContent('#settingsDlg .gd-crumb'), 'Watching › Layouts');
  assert.match(await page.textContent('#settingsDlg .gd-lede'), /Arrange every window/);
  assert.deepEqual(await page.$$eval('#settingsDlg .gd-acts .gd-chip', e => e.map(x => x.textContent)), ['Open Settings › Layouts', 'Show me']);
  assert.equal(await toc(page).locator('.on').textContent(), 'Layouts');
  // Next and Previous
  await page.click('#settingsDlg .gd-next');
  assert.equal(await h2(page), 'The switch control');
  await page.click('#settingsDlg .gd-prev');
  assert.equal(await h2(page), 'Layouts');
  // a related topic, a link in the text, and "Settings › …" in the text opening that page
  await page.click('#settingsDlg .gd-rel .gd-chip:text-is("Playing a game")');
  assert.equal(await h2(page), 'Playing a game');
  await page.evaluate(() => window.guide.show('mentions'));
  await page.click('#settingsDlg .gd-text .gd-link:text-is("Developer tools")');
  assert.equal(await h2(page), 'Developer tools');
  await page.evaluate(() => window.guide.show('handy'));
  await page.click('#settingsDlg .gd-text .gd-set:text-is("Settings › Chat")');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=chat]'), true, 'Settings › Chat in the text opens that page');
  // Open Settings › Layouts
  await page.evaluate(() => window.guide.show('layouts'));
  await page.click('#settingsDlg .gd-acts .gd-chip.pri');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=layouts]'), true);
  // the keyboard shortcuts' topic lists them, the first page goes back
  await page.evaluate(() => window.guide.show('keyboard-shortcuts'));
  assert.ok(await page.locator('#settingsDlg .gd-keys .sc-row').count() >= 20);
  await page.click('#settingsDlg .gd-home');
  assert.equal(await h2(page), 'Guide');
  await page.click('#settingsDlg .gd-cl:text-is("Spam alerts")');
  assert.equal(await h2(page), 'Spam alerts');
  assert.equal(await page.locator('#settingsDlg .gd-tip').count(), 1, 'its tip');
});

test('search: topics, Settings options and shortcuts as you type; the arrows and Enter; the words marked in the topic; Esc clears', async t => {
  const page = await guide(t, 'layouts');
  await page.locator('#settingsDlg .gd-body').focus();
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gdSearch', '/ goes to the search');
  await page.keyboard.type('spam');
  await page.waitForSelector('#settingsDlg .gd-r');
  assert.match(await page.textContent('#settingsDlg .gd-r.cur .gd-rt'), /^Spam alerts/, 'the topic named for it first');
  assert.match(await page.textContent('#settingsDlg .gd-count'), /^\d+ results$/);
  assert.equal(await toc(page).locator('.gd-ti', { hasText: 'Spam alerts' }).evaluate(e => !e.classList.contains('dim') && !!e.querySelector('.gd-c')), true, 'counted in the contents');
  assert.equal(await toc(page).locator('.gd-ti', { hasText: 'Playing a game' }).evaluate(e => e.classList.contains('dim')), true, 'and the others faded');
  assert.ok(await page.locator('#settingsDlg .gd-r mark').count() > 0, 'the word marked in the snippets');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#settingsDlg .gd-r').nth(1).evaluate(e => e.classList.contains('cur')), true);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  assert.equal(await h2(page), 'Spam alerts');
  assert.ok(await page.locator('#settingsDlg .gd-text mark.gd-hit').count() > 1, 'the topic opens with the words marked');
  assert.equal(await page.inputValue('#gdSearch'), '');
  // a Settings option: its page opens with it lit
  await page.fill('#gdSearch', 'snap windows');
  const opt = page.locator('#settingsDlg .gd-r', { hasText: 'Settings › General' });
  assert.match(await opt.textContent(), /^Snap windows/);
  await opt.click();
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=general]'), true);
  assert.equal(await page.locator('#settingsDlg .st-pane[data-s=general] .st-row.gd-lit').count(), 1);
  // a shortcut: Keyboard shortcuts opens
  await page.evaluate(() => window.guide.show('layouts'));
  await page.keyboard.press('Control+f');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gdSearch', 'Ctrl+F too');
  await page.keyboard.type('chat rail');
  const keys = page.locator('#settingsDlg .gd-r', { hasText: 'Keyboard shortcuts' }).first();
  assert.match(await keys.textContent(), /Chat Rail/);
  await keys.click();
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=keys]'), true);
  // nothing found, then Esc: the topic again, and Settings stays open
  await page.evaluate(() => window.guide.show('layouts'));
  await page.fill('#gdSearch', 'qqzzxx');
  assert.match(await page.textContent('#settingsDlg .gd-none'), /Nothing found for “qqzzxx”/);
  assert.equal(await page.textContent('#settingsDlg .gd-count'), 'No results');
  await page.press('#gdSearch', 'Escape');
  assert.equal(await page.inputValue('#gdSearch'), '');
  assert.equal(await h2(page), 'Layouts');
  assert.equal(await page.isVisible('#settingsDlg'), true);
  // more than one word: pages with all of them
  const both = await page.evaluate(() => window.guide.search('youtube key').filter(r => r.kind === 'topic').map(r => r.title));
  assert.equal(both[0], 'YouTube');
  assert.deepEqual(await page.evaluate(() => window.guide.search('   ')), []);
});

test('the ? on a Settings page says what it\'s for and opens its topic; Show me points at the button', async t => {
  const page = await openApp(t, { width: 1400, height: 900 });
  await page.evaluate(() => window.guide.load());
  await page.evaluate(() => window.openSettings('themes'));
  await page.click('#settingsDlg .st-pane[data-s=themes] h4 .gd-q');
  const pop = page.locator('.gd-pop');
  assert.equal(await pop.isVisible(), true);
  assert.match(await pop.textContent(), /^Colours and themesPick a theme or make your own\.Read the guide ›$/);
  await page.click('#settingsDlg .st-pane[data-s=themes] h4', { position: { x: 5, y: 5 } });
  assert.equal(await pop.isVisible(), false, 'a click outside closes it');
  await page.click('#settingsDlg .st-pane[data-s=themes] h4 .gd-q');
  await page.click('.gd-pop .gd-chip');
  await page.waitForSelector('#settingsDlg .gd-art h2:text-is("Colours and themes")');
  assert.equal(await pop.isVisible(), false);
  // Show me: Settings closes and the button is pointed at
  await page.evaluate(() => window.guide.show('channels'));
  await page.click('#settingsDlg .gd-acts .gd-chip:text-is("Show me")');
  assert.equal(await page.isVisible('#settingsDlg'), false);
  assert.equal(await page.isVisible('#tourLayer'), true);
  assert.equal(await page.textContent('#tourLayer h4'), 'Channels');
});

test('a page is only text: markup in it stays text; its header is read', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.guide.load());
  const html = await page.evaluate(() => window.guide.pageHtml('A <img src=x onerror="x()"> **bold** `code`\n\n## Part two\n- one\n  - in\n1. first\n> **Tip:** this\n[out](https://example.com/a) [in](layouts.md)'));
  assert.ok(!/<img/.test(html) && /&lt;img src=x onerror=&quot;x\(\)&quot;&gt;/.test(html), 'markup is shown, not run');
  assert.match(html, /<b>bold<\/b> <code>code<\/code>/);
  assert.match(html, /<h3 id="gd-part-two">Part two<\/h3><ul><li>one<\/li><li class="sub">in<\/li><\/ul><ol><li>first<\/li><\/ol><div class="gd-tip">/);
  assert.match(html, /<a href="https:\/\/example\.com\/a" target="_blank" rel="noopener">out<\/a> <button type="button" class="gd-link" data-topic="layouts">in<\/button>/);
  assert.deepEqual(await page.evaluate(() => window.guide.frontMatter('---\ntitle: "A: b"\nwords: [x, y z]\norder: 3\nkeys: true\nbad line\n---\nbody')),
    [{ title: 'A: b', words: ['x', 'y z'], order: 3, keys: true }, 'body']);
  assert.deepEqual(await page.evaluate(() => window.guide.frontMatter('no header')), [{}, 'no header']);
  assert.ok((await page.evaluate(() => window.guide.topics().length)) >= 29);
});
