// The app's page in a headless browser: adding streams, layouts, the switch control,
// undo / redo, keyboard shortcuts, themes and the Help panel.
// Kick, Twitch and YouTube are blocked, so the windows stay empty and the tests work offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, playwright, serve } = require('../helpers');

let browser, server;
test.before(async () => {
  server = await serve();
  browser = await playwright().chromium.launch();
});
test.after(async () => { await browser?.close(); server?.close(); });

// A fresh copy of the app (empty saved settings). Fails the test on any page error.
async function openApp(t) {
  // Wide enough for every toolbar button (Redo hides at 1400px and below).
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(u => !u.href.startsWith(server.url), r => r.abort());
  await page.goto(server.url + '/index.html');
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'the page had no errors');
  });
  return page;
}
const add = async (page, ...links) => { for (const l of links) { await page.fill('#url', l); await page.click('#add'); } };
const windows = page => page.$$eval('#stage .win', els => els.map(e => ({
  kind: ['stream', 'chat', 'web', 'capture'].find(k => e.classList.contains(k)),
  plat: (e.className.match(/plat-(\w+)/) || [])[1],
  title: e.querySelector('.title').textContent,
  featured: e.classList.contains('featured'),
  x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight
})));
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(350); };
const settle = page => page.waitForTimeout(1400);     // undo history records changes after a short pause (and settles 1.25 s after an undo)
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('starts empty, with the welcome message', async t => {
  const page = await openApp(t);
  assert.ok(await page.isVisible('#empty'));
  assert.equal((await windows(page)).length, 0);
});

test('adding Kick, Twitch and YouTube links opens their streams and chats', async t => {
  const page = await openApp(t);
  await add(page, 'https://kick.com/alpha', 'https://www.twitch.tv/bravo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const w = await windows(page);
  assert.deepEqual(w.map(x => `${x.kind}:${x.plat}:${x.title}`), [
    'stream:kick:alpha', 'chat:kick:alpha',
    'stream:twitch:bravo', 'chat:twitch:bravo',
    'stream:youtube:YouTube video'            // a normal video has no live chat
  ]);
  assert.equal(await page.isVisible('#empty'), false);
});

test('"Stream only" and "Chat only" add just that window, and a channel is not opened twice', async t => {
  const page = await openApp(t);
  await page.selectOption('#mode', 'stream');
  await add(page, 'alpha');
  await page.selectOption('#mode', 'chat');
  await add(page, 'bravo');
  await page.selectOption('#mode', 'stream');
  await add(page, 'alpha');
  assert.deepEqual((await windows(page)).map(x => `${x.kind}:${x.title}`), ['stream:alpha', 'chat:bravo']);
});

test('windows come back after restarting the app', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await settle(page);
  await page.reload();
  assert.deepEqual((await windows(page)).map(x => `${x.kind}:${x.title}`), ['stream:alpha', 'chat:alpha', 'stream:bravo', 'chat:bravo']);
});

test('layouts: Tile, Columns, Chat focus, Focus view and Game focus', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  const stage = await page.$eval('#stage', e => ({ w: e.clientWidth, h: e.clientHeight }));

  await press(page, 't');
  let w = await windows(page);
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) assert.ok(!overlaps(w[i], w[j]), `Tile: windows ${i} and ${j} overlap`);
  for (const x of w) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= stage.w && x.y + x.h <= stage.h, 'Tile: every window fits on screen');

  await press(page, 'c');
  assert.ok(await page.evaluate(() => document.body.classList.contains('cols')), 'Columns view is on');
  w = await windows(page);
  for (let i = 0; i < w.length; i += 2) {
    assert.equal(w[i].kind, 'stream'); assert.equal(w[i + 1].kind, 'chat');
    assert.equal(w[i].x, w[i + 1].x, 'each chat sits under its stream');
    assert.ok(w[i + 1].y > w[i].y);
  }

  await press(page, 'Shift+C');
  assert.ok(await page.evaluate(() => document.body.classList.contains('chatfocus')), 'Chat focus is on');
  w = await windows(page);
  const streams = w.filter(x => x.kind === 'stream'), chats = w.filter(x => x.kind === 'chat');
  assert.ok(streams.every(s => s.x === streams[0].x), 'streams are stacked in one column');
  assert.ok(chats.every(c => c.x > streams[0].x), 'chats fill the rest');

  await press(page, 'f');
  w = await windows(page);
  const big = w.filter(x => x.featured);
  assert.deepEqual(big.map(x => x.kind), ['stream', 'chat'], 'one stream and its chat are big');
  assert.ok(big[0].w > w.filter(x => !x.featured && x.kind === 'stream')[0].w, 'the big stream is bigger than the others');

  await press(page, 'g');
  assert.ok(await page.isVisible('#gameArea'), 'the game area is shown');
  const ga = await page.$eval('#gameArea', e => ({ x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }));
  for (const x of await windows(page)) assert.ok(!overlaps(ga, x), `${x.kind} ${x.title} is outside the game area`);
});

test('switch control: lists the streams, makes one big, floats, and removes a channel', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  await press(page, 'f');
  const names = () => page.$$eval('#featSwitch .fs-name span', e => e.map(x => x.textContent));
  assert.deepEqual(await names(), ['alpha', 'bravo', 'charlie']);

  await page.click('#featSwitch .fs-item[data-ch] >> nth=1 >> .fs-name');
  await page.waitForTimeout(300);
  assert.deepEqual((await windows(page)).filter(x => x.featured).map(x => x.title), ['bravo', 'bravo']);

  await press(page, 's');
  assert.ok(await page.$eval('#featSwitch', e => e.classList.contains('floating')), 'S makes it float');
  await press(page, 's');
  assert.ok(!(await page.$eval('#featSwitch', e => e.classList.contains('floating'))), 'S again docks it');

  await page.click('#featSwitch .fs-item[data-ch] >> nth=2 >> .fs-x');
  await page.waitForTimeout(300);
  assert.ok(!(await windows(page)).some(x => x.title === 'charlie'), 'charlie\'s stream and chat are gone');
  assert.deepEqual(await names(), ['alpha', 'bravo']);
});

test('undo and redo: closing a window, and the toolbar buttons', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await settle(page);
  assert.equal((await windows(page)).length, 4);

  await page.click('#stage .win.chat >> nth=0 >> [data-a=close]');
  await settle(page);
  assert.equal((await windows(page)).length, 3);
  assert.equal(await page.isDisabled('#undoBtn'), false);

  await page.keyboard.press('Control+z');
  await settle(page);
  assert.equal((await windows(page)).length, 4, 'Ctrl+Z brings the chat back');

  await page.keyboard.press('Control+y');
  await settle(page);
  assert.equal((await windows(page)).length, 3, 'Ctrl+Y closes it again');

  await page.click('#undoBtn');
  await settle(page);
  assert.equal((await windows(page)).length, 4, 'the Undo button works too');
  await page.click('#redoBtn');
  await settle(page);
  assert.equal((await windows(page)).length, 3, 'and the Redo button');
});

test('undo puts a layout change back', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 't');
  await settle(page);
  const before = await windows(page);
  await press(page, 'c');
  await settle(page);
  assert.notDeepEqual(await windows(page), before);
  await page.keyboard.press('Control+z');
  await settle(page);
  assert.deepEqual((await windows(page)).map(({ x, y, w, h }) => [x, y, w, h]), before.map(({ x, y, w, h }) => [x, y, w, h]));
});

test('keyboard shortcuts: help, Esc, typing in the link box, and switching them off', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');

  await press(page, 'F1');
  assert.ok(await page.isVisible('#helpDlg'));
  assert.equal(await page.$eval('.help-tabs .on', e => e.dataset.h), 'keys');
  await press(page, 'Escape');
  assert.equal(await page.isVisible('#helpDlg'), false);

  await press(page, 'n');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'url', 'N jumps to the link box');
  await page.keyboard.type('tc');
  assert.equal(await page.inputValue('#url'), 'tc', 'letters typed in the box are not shortcuts');
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('cols'))));
  await page.fill('#url', '');
  await page.evaluate(() => document.activeElement.blur());

  await press(page, '?');
  await page.uncheck('#keysOn');
  await press(page, 'Escape');
  await press(page, 'c');
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('cols'))), 'C does nothing while shortcuts are off');
  await page.reload();
  await press(page, 'c');
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('cols'))), 'they stay off after a restart');
});

test('themes: pick one, it sticks after a restart, and save your own', async t => {
  const page = await openApp(t);
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  assert.equal(await accent(), '#53fc18', 'starts with Pear');

  await page.click('#themeBtn');
  const names = await page.$$eval('#themeDlg .th-item b', e => e.map(x => x.textContent));
  assert.ok(names.length >= 11, 'all the built-in themes are listed');
  assert.ok(names.includes('Hikari'));
  await page.click('#themeDlg .th-item:has(b:text-is("Ocean"))');
  assert.equal(await accent(), '#3fb6ff');

  await page.fill('#themeDlg .th-var >> nth=0 >> .hex', '#123456');
  await page.fill('#themeDlg .th-name', 'My blue');
  await page.click('#themeDlg .th-savebtn');
  assert.ok((await page.$$eval('#themeDlg .th-item b', e => e.map(x => x.textContent))).includes('My blue'));

  await page.reload();
  assert.equal(await accent(), '#3fb6ff', 'the theme is remembered');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#123456');
});

test('themes: a black accent keeps buttons readable, and window borders have their own colour', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  const css = (sel, prop) => page.$eval(sel, (e, p) => getComputedStyle(e)[p], prop);
  const setVar = async (label, hex) => { await page.fill(`#themeDlg .th-var:has(span:text-is("${label}")) .hex`, hex); };
  await page.click('#themeBtn');

  // Tron's case: Accent black (text on accent stays near-black) used to make the Done button solid black
  await setVar('Accent', '#000000');
  assert.equal(await css('#themeDlg .dlg-cancel', 'color'), 'rgb(255, 255, 255)', 'the button text turns white');
  assert.notEqual(await css('#themeDlg .dlg-cancel', 'borderTopColor'), 'rgb(0, 0, 0)', 'the button keeps a visible outline');
  assert.ok(await page.isVisible('#themeDlg .th-warn'), 'the editor explains what happened');
  assert.match(await page.textContent('#themeDlg .th-warn'), /Window border/);

  // the window border follows Accent until it's set, then has its own colour
  assert.equal(await css('#stage .win.active', 'borderTopColor'), 'rgb(0, 0, 0)');
  await setVar('Accent', '#53fc18');
  assert.equal(await page.isVisible('#themeDlg .th-warn'), false, 'no warning for a readable theme');
  await setVar('Window border', '#283034');
  assert.equal(await css('#stage .win.active', 'borderTopColor'), 'rgb(40, 48, 52)', 'only the window border changed');
  assert.equal(await css('#themeDlg .dlg-cancel', 'backgroundColor'), 'rgb(83, 252, 24)', 'accent buttons stay green');

  await page.reload();
  assert.equal(await css('#stage .win.active', 'borderTopColor'), 'rgb(40, 48, 52)', 'the window border colour is remembered');
});

test('themes: Tron (princess) is pink', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await page.click('#themeBtn');
  await page.click('#themeDlg .th-item:has(b:text-is("Tron (princess)"))');
  const v = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { accent: s.getPropertyValue('--accent').trim(), frame: s.getPropertyValue('--frame').trim() }; });
  assert.deepEqual(v, { accent: '#ff5fae', frame: '#ff9fd0' });
  assert.equal(await page.isVisible('#themeDlg .th-warn'), false, 'readable as it is');
});

test('every built-in theme is readable', async t => {
  const page = await openApp(t);
  await page.click('#themeBtn');
  const problems = [];
  const count = (await page.$$('#themeDlg .th-item')).length;
  for (let i = 0; i < count; i++) {
    const item = page.locator('#themeDlg .th-item').nth(i);      // the list is redrawn after each click
    const name = await item.locator('b').textContent();
    await item.click();
    if (await page.isVisible('#themeDlg .th-warn')) problems.push(`${name}: ${await page.textContent('#themeDlg .th-warn')}`);
  }
  assert.ok((await page.$$('#themeDlg .th-item')).length >= 12);
  assert.deepEqual(problems, []);
});

test('the toolbar fits any window width, with the rest in the More menu', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel');
  await press(page, 'c');                       // Columns adds the most toolbar buttons
  const check = () => page.evaluate(() => {
    const h = document.querySelector('header'), hr = h.getBoundingClientRect();
    const cut = [...h.children].filter(e => !e.hidden && getComputedStyle(e).display !== 'none')
      .map(e => [e.id || e.className, e.getBoundingClientRect()]).filter(([, r]) => r.width && (r.right > hr.right + 1 || r.left < hr.left - 1)).map(([n]) => n);
    return { over: h.scrollWidth - h.clientWidth, cut, more: !document.querySelector('#moreBtn').hidden };
  });
  for (const width of [1920, 1600, 1440, 1280, 1100, 900, 760, 640]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(150);
    const r = await check();
    assert.equal(r.over, 0, `${width}px: the toolbar doesn't overflow`);
    assert.deepEqual(r.cut, [], `${width}px: no button is cut off`);
  }

  // at 640px the More menu holds the rest, and its buttons work
  assert.ok(await page.isVisible('#moreBtn'));
  await page.click('#moreBtn');
  assert.ok(await page.isVisible('#moreMenu #themeBtn'), 'Colours and themes is in the More menu');
  assert.ok(await page.isVisible('#moreMenu #clear'), 'so is Clear');
  await page.click('#moreMenu #themeBtn');
  assert.ok(await page.isVisible('#themeDlg'), 'and it opens the theme editor');
  await page.waitForSelector('#moreMenu', { state: 'hidden', timeout: 2000 });   // the menu closes
  await press(page, 'Escape');

  // ticking a setting in the menu keeps the menu open and still works
  await page.click('#moreBtn');
  await page.uncheck('#moreMenu #snap');
  assert.ok(await page.isVisible('#moreMenu'));
  assert.equal(await page.isChecked('#snap'), false);

  // wide again: everything is back in the toolbar
  await page.setViewportSize({ width: 1920, height: 800 });
  await page.waitForTimeout(150);
  assert.equal(await page.$eval('#themeBtn', e => e.parentElement.tagName), 'HEADER');
  assert.equal(await page.isVisible('#moreBtn'), false);
});

test('Help shows the instructions and this version\'s changelog', async t => {
  const page = await openApp(t);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  await page.click('#helpBtn');
  assert.equal(await page.$eval('.help-tabs .on', e => e.dataset.h), 'guide');
  await page.waitForSelector('#helpDlg .help-body h3');
  assert.ok((await page.$$('#helpDlg .help-body h3')).length > 3, 'the instructions are shown');

  await page.click('.help-tabs [data-h=news]');
  await page.waitForFunction(() => /\(current\)/.test(document.querySelector('#helpDlg .help-body').textContent));
  assert.equal(await page.$eval('#helpDlg .help-body h3', e => e.textContent), `${version} (current)`);
  assert.ok((await page.$$('#helpDlg .help-body li')).length > 0);

  await page.click('.help-tabs [data-h=keys]');
  assert.ok((await page.$$('#helpDlg .sc-row')).length >= 20, 'the shortcuts are listed');
});
