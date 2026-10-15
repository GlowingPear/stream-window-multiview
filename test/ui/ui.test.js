// The app's page in a headless browser: adding streams, layouts, the switch control,
// undo / redo, keyboard shortcuts, themes and the Help panel.
// Kick, Twitch and YouTube are blocked, so the windows stay empty and the tests work offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, playwright, serve, startCoverage, saveCoverage } = require('../helpers');

let browser, server;
test.before(async () => {
  server = await serve();
  browser = await playwright().chromium.launch();
});
test.after(async () => { await browser?.close(); server?.close(); });

// A fresh copy of the app (empty saved settings). Fails the test on any page error.
async function openApp(t, { init } = {}) {
  // Wide enough for every toolbar button (Redo hides at 1400px and below).
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  if (init) await page.addInitScript(init);   // runs before the app's own script
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(u => !u.href.startsWith(server.url), r => r.abort());
  await startCoverage(page);
  await page.goto(server.url + '/src/index.html');
  t.after(async () => {
    await saveCoverage(page);
    await context.close();
    assert.deepEqual(errors, [], 'the page had no errors');
  });
  return page;
}
// Opens each link or name from the Channels box, as typing it there and pressing Open does (the panel closes after)
const add = async (page, ...links) => {
  for (const l of links) {
    if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
    await page.fill('#savedInput', l); await page.click('#spOpen');
  }
  if (await page.isVisible('#savedPanel')) await page.click('#savedBtn');
};
// What the Channels box opens: Stream + chat, Stream only or Chat only (it's in the Channels panel)
const mode = async (page, v) => {
  if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
  await page.selectOption('#mode', v);
  await page.click('#savedBtn');
};
const windows = page => page.$$eval('#stage .win', els => els.map(e => ({
  kind: ['stream', 'chat', 'web', 'capture'].find(k => e.classList.contains(k)),
  plat: (e.className.match(/plat-(\w+)/) || [])[1],
  title: e.querySelector('.title').textContent,
  featured: e.classList.contains('featured'),
  x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight
})));
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(350); };
const settle = page => page.waitForTimeout(1400);     // undo history records changes after a short pause (and settles 1.25 s after an undo)
const openThemes = async page => { await page.click('#settingsBtn'); await page.click('#settingsDlg .st-rail [data-s=themes]'); };
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

test('the mod view button opens each site\'s mod dashboard, and YouTube has none', async t => {
  const page = await openApp(t);
  await add(page, 'https://kick.com/alpha', 'https://www.twitch.tv/bravo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const mod = await page.$$eval('#stage .win', els => els.map(e => e.querySelector('.title').textContent + ':' + !!e.querySelector('[data-a=mod]')));
  assert.deepEqual(mod, ['alpha:true', 'alpha:true', 'bravo:true', 'bravo:true', 'YouTube video:false']);
  await page.evaluate(() => { window.opened = []; window.open = u => { window.opened.push(u); return null; }; });
  await page.click('#stage .win.chat.plat-kick [data-a=mod]');
  await page.click('#stage .win.stream.plat-twitch [data-a=mod]');
  assert.deepEqual(await page.evaluate(() => window.opened), ['https://dashboard.kick.com/moderator/alpha', 'https://www.twitch.tv/moderator/bravo']);
});

test('"Stream only" and "Chat only" add just that window, and a channel is not opened twice', async t => {
  const page = await openApp(t);
  await mode(page, 'stream');
  await add(page, 'alpha');
  await mode(page, 'chat');
  await add(page, 'bravo');
  await mode(page, 'stream');
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

test('keyboard shortcuts: help, Esc, typing in the Channels box, and switching them off', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');

  await press(page, 'F1');
  assert.ok(await page.isVisible('#settingsDlg'), 'Help is part of Settings');
  assert.equal(await page.$eval('#settingsDlg .st-rail .on', e => e.dataset.s), 'keys');
  await press(page, 'Escape');
  assert.equal(await page.isVisible('#settingsDlg'), false);

  await press(page, 'n');
  assert.ok(await page.isVisible('#savedPanel'), 'N opens Channels');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'savedInput', 'and jumps to its box');
  await page.keyboard.type('tc');
  assert.equal(await page.inputValue('#savedInput'), 'tc', 'letters typed in the box are not shortcuts');
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('cols'))));
  await page.fill('#savedInput', '');
  await press(page, 'Escape');
  assert.equal(await page.isVisible('#savedPanel'), false);

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

  await openThemes(page);
  const names = await page.$$eval('#themePane .th-item b', e => e.map(x => x.textContent));
  assert.ok(names.length >= 11, 'all the built-in themes are listed');
  assert.ok(names.includes('Hikari'));
  await page.click('#themePane .th-item:has(b:text-is("Ocean"))');
  assert.equal(await accent(), '#3fb6ff');

  await page.fill('#themePane .th-var >> nth=0 >> .hex', '#123456');
  await page.fill('#themePane .th-name', 'My blue');
  await page.click('#themePane .th-savebtn');
  assert.ok((await page.$$eval('#themePane .th-item b', e => e.map(x => x.textContent))).includes('My blue'));

  await page.reload();
  assert.equal(await accent(), '#3fb6ff', 'the theme is remembered');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#123456');
});

test('themes: a black accent keeps buttons readable, and window borders have their own colour', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  const css = (sel, prop) => page.$eval(sel, (e, p) => getComputedStyle(e)[p], prop);
  const setVar = async (label, hex) => { await page.fill(`#themePane .th-var:has(span:text-is("${label}")) .hex`, hex); };
  await openThemes(page);

  // Tron's case: Accent black (text on accent stays near-black) used to make accent buttons solid black
  await setVar('Accent', '#000000');
  assert.equal(await css('#spOpen', 'color'), 'rgb(255, 255, 255)', 'the button text turns white');
  assert.notEqual(await css('#spOpen', 'borderTopColor'), 'rgb(0, 0, 0)', 'the button keeps a visible outline');
  assert.ok(await page.isVisible('#themePane .th-warn'), 'the editor explains what happened');
  assert.match(await page.textContent('#themePane .th-warn'), /Window border/);

  // the window border follows Accent until it's set, then has its own colour
  assert.equal(await css('#stage .win.active', 'borderTopColor'), 'rgb(0, 0, 0)');
  await setVar('Accent', '#53fc18');
  assert.equal(await page.isVisible('#themePane .th-warn'), false, 'no warning for a readable theme');
  await setVar('Window border', '#283034');
  assert.equal(await css('#stage .win.active', 'borderTopColor'), 'rgb(40, 48, 52)', 'only the window border changed');
  assert.equal(await css('#spOpen', 'backgroundColor'), 'rgb(83, 252, 24)', 'accent buttons stay green');

  await page.reload();
  assert.equal(await css('#stage .win.active', 'borderTopColor'), 'rgb(40, 48, 52)', 'the window border colour is remembered');
});

test('themes: Tron (princess) is pink', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await openThemes(page);
  await page.click('#themePane .th-item:has(b:text-is("Tron (princess)"))');
  const v = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { accent: s.getPropertyValue('--accent').trim(), frame: s.getPropertyValue('--frame').trim() }; });
  assert.deepEqual(v, { accent: '#ff5fae', frame: '#ff9fd0' });
  assert.equal(await page.isVisible('#themePane .th-warn'), false, 'readable as it is');
});

test('every built-in theme is readable', async t => {
  const page = await openApp(t);
  await openThemes(page);
  const problems = [];
  const count = (await page.$$('#themePane .th-item')).length;
  for (let i = 0; i < count; i++) {
    const item = page.locator('#themePane .th-item').nth(i);      // the list is redrawn after each click
    const name = await item.locator('b').textContent();
    await item.click();
    if (await page.isVisible('#themePane .th-warn')) problems.push(`${name}: ${await page.textContent('#themePane .th-warn')}`);
  }
  assert.ok((await page.$$('#themePane .th-item')).length >= 12);
  assert.deepEqual(problems, []);
});

test('the toolbar fits any window width: Layout keeps its name while there is room, then the least-used buttons go into More', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel');
  await press(page, 'c');
  // the order: Channels on the left; Layout leads the right side, Clear is last
  const order = await page.$$eval('header > .btn', els => els.filter(e => !e.hidden && getComputedStyle(e).display !== 'none').map(e => e.id));
  assert.deepEqual(order, ['savedBtn', 'layoutBtn', 'swBtn', 'undoBtn', 'redoBtn', 'bellBtn', 'settingsBtn', 'focusBtn', 'clear']);
  const check = () => page.evaluate(() => {
    const h = document.querySelector('header'), hr = h.getBoundingClientRect();
    const cut = [...h.children].filter(e => !e.hidden && getComputedStyle(e).display !== 'none')
      .map(e => [e.id || e.className, e.getBoundingClientRect()]).filter(([, r]) => r.width && (r.right > hr.right + 1 || r.left < hr.left - 1)).map(([n]) => n);
    const shownHidden = [...h.children].filter(e => e.hidden && getComputedStyle(e).display !== 'none').map(e => e.id || e.className);
    const lb = document.querySelector('#layoutBtn .tb-l');
    return { over: h.scrollWidth - h.clientWidth, cut, shownHidden, more: !document.querySelector('#moreBtn').hidden,
      layoutName: getComputedStyle(lb).display !== 'none', layoutIcon: !!document.querySelector('#layoutBtn svg').getBoundingClientRect().width };
  });
  let sawNameGo = false;
  for (const width of [1920, 1280, 800, 640, 520, 460, 420, 380, 340]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(150);
    const r = await check();
    assert.equal(r.over, 0, `${width}px: the toolbar doesn't overflow`);
    assert.deepEqual(r.cut, [], `${width}px: no button is cut off`);
    assert.deepEqual(r.shownHidden, [], `${width}px: a hidden button stays hidden (the fitting skips it)`);
    assert.ok(r.layoutIcon, `${width}px: Layout always shows its icon`);
    if (width >= 800) assert.ok(r.layoutName, `${width}px: Layout shows its name when there's room`);
    if (!r.layoutName) sawNameGo = true;
    if (r.more) assert.ok(!r.layoutName, `${width}px: Layout's name goes before any button moves into More`);
  }
  assert.ok(sawNameGo, 'a narrow toolbar drops Layout\'s name');

  // at 340px the More menu holds the rest (Clear first), never Settings, and its buttons work
  assert.ok(await page.isVisible('#moreBtn'));
  await page.click('#moreBtn');
  assert.equal(await page.getAttribute('#moreBtn', 'aria-expanded'), 'true', 'the More button is marked open');
  assert.ok(await page.isVisible('#moreMenu #clear'), 'Clear is the first to go into More');
  assert.equal(await page.$eval('#settingsBtn', e => e.parentElement.tagName), 'HEADER', 'Settings never goes into More');
  assert.equal(await page.$eval('#layoutBtn', e => e.parentElement.tagName), 'HEADER', 'nor does Layout');
  assert.equal(await page.$eval('#bellBtn', e => e.parentElement.tagName), 'HEADER', 'nor the bell');
  assert.match(await page.textContent('#moreMenu #clear'), /Clear/, 'in the menu each button shows its name');
  const first = await page.$eval('#moreMenu .btn', e => e.id);
  assert.equal(first, 'clear');
  await page.click('#moreMenu #clear');
  assert.ok(await page.isVisible('#askDlg'), 'and it works (Clear asks first)');
  await page.waitForSelector('#moreMenu', { state: 'hidden', timeout: 2000 });   // the menu closes
  await press(page, 'Escape');

  // wide again: everything is back in the toolbar
  await page.setViewportSize({ width: 1920, height: 800 });
  await page.waitForTimeout(150);
  assert.equal(await page.$eval('#clear', e => e.parentElement.tagName), 'HEADER');
  assert.equal(await page.isVisible('#moreBtn'), false);
});

test('Help is part of Settings: the instructions, the shortcuts, and this version\'s changelog under Updates', async t => {
  const page = await openApp(t);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  await page.click('#settingsBtn');
  await page.click('#settingsDlg .st-rail [data-s=guide]');
  await page.waitForSelector('#settingsDlg [data-doc=guide] h3');
  assert.ok((await page.$$('#settingsDlg [data-doc=guide] h3')).length > 3, 'the instructions are shown');

  await page.click('#settingsDlg .st-rail [data-s=updates]');
  await page.waitForFunction(() => /\(current\)/.test(document.querySelector('#settingsDlg [data-doc=news]').textContent));
  assert.equal(await page.$eval('#settingsDlg [data-doc=news] h3', e => e.textContent), `${version} (current)`);
  assert.ok((await page.$$('#settingsDlg [data-doc=news] li')).length > 0);

  await page.click('#settingsDlg .st-rail [data-s=keys]');
  assert.ok((await page.$$('#settingsDlg .sc-row')).length >= 20, 'the shortcuts are listed');
});

test('Clear asks in the app first: Cancel, Esc and clicking outside keep the windows, and Undo brings them back', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'tw:bravo');
  await settle(page);
  const n = (await windows(page)).length;
  await page.click('#clear');
  assert.ok(await page.isVisible('#askDlg'), 'the app\'s own dialog, not the browser\'s');
  assert.equal(await page.textContent('#askTitle'), 'Close all windows?');
  assert.equal(await page.textContent('#askDlg .ask-yes'), 'Close all');
  assert.ok(await page.$eval('#askDlg .ask-yes', b => b.classList.contains('danger-fill')), 'shown as a destructive action');
  await page.click('#askDlg .ask-no');
  assert.ok(await page.isHidden('#askDlg'));
  await page.click('#clear'); await page.keyboard.press('Escape');
  await page.click('#clear'); await page.mouse.click(5, 895);   // outside the dialog
  assert.equal((await windows(page)).length, n, 'nothing closed');
  await page.click('#clear'); await page.keyboard.press('Enter');
  assert.equal((await windows(page)).length, 0, 'Enter closes them all');
  await settle(page);
  await page.click('#undoBtn');
  await settle(page);
  assert.equal((await windows(page)).length, n, 'Undo brings them back');
});

test('Close all lets go of what each window held: its timers and screen capture', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'tw:bravo');
  await settle(page);
  await page.evaluate(() => {
    window.__held = { fired: 0, stopped: 0 };
    window.openWins().forEach(w => {
      w.ytT = setTimeout(() => window.__held.fired++, 300);
      w.capStream = { getTracks: () => [{ stop: () => window.__held.stopped++ }] };
    });
  });
  const n = await page.evaluate(() => window.openWins().length);
  await page.click('#clear'); await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(() => window.__held), { fired: 0, stopped: n });
  assert.equal(await page.evaluate(() => window.spamFirst.size), 0);
});

test('keyboard shortcuts don\'t act behind the dialog', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  const answer = page.evaluate(() => window.ask('Sure?', 'Test', { ok: 'Yes' }));
  await page.waitForSelector('#askDlg:not([hidden])');
  await page.keyboard.press('?');   // the shortcut for Help
  assert.ok(await page.isHidden('#settingsDlg'));
  await page.keyboard.press('Escape');
  assert.equal(await answer, false);
});

// Every button that shows only an icon (in windows of every kind, the toolbar, Saved, the layout and theme menus,
// the switch control) has a one- or two-word name.
test('icon-only buttons have a short tooltip, shown quickly, with the longer hint underneath', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'tw:bravo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.click('#stage .win.stream.plat-kick [data-a=star]');
  await page.click('#savedBtn');
  await page.click('#layoutBtn');
  await page.click('#layoutMenu button[data-l="focus"]');
  await settle(page);
  const missing = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button').forEach(b => {
      if (!b.getClientRects().length || /[A-Za-z]{2,}/.test(b.innerText || '')) return;   // hidden, or its words show
      const name = window.tipFor(b);
      if (!name || name.split(/\s+/).length > 2) out.push((b.className || b.id || b.outerHTML.slice(0, 60)) + ' -> ' + JSON.stringify(name));
    });
    return out;
  });
  assert.deepEqual(missing, []);

  const reload = '#stage .win.stream.plat-kick [data-a=reload]';
  await page.hover(reload);
  await page.waitForSelector('#tip.on');
  assert.equal(await page.$eval('#tip', e => e.firstChild.textContent), 'Reload');
  const titled = sel => page.evaluate(sel => { for (let n = document.querySelector(sel); n; n = n.parentElement) if (n.title) return n.className || n.tagName; return null; }, sel);
  assert.equal(await titled(reload), null, 'no title on it or its window bar: the browser has no tooltip to show on top');
  await page.hover('#stage .win.stream.plat-kick [data-a=max]');
  await page.waitForFunction(() => document.querySelector('#tip').firstChild.textContent === 'Maximize');
  assert.match(await page.textContent('#tip small'), /double-click the bar/, 'the longer title as a hint');
  assert.equal(await page.getAttribute(reload, 'title'), 'Reload', 'the title is put back after');
  await page.mouse.move(800, 600);
  await page.waitForSelector('#tip:not(.on)', { state: 'attached' });
  assert.ok(await page.$eval(reload, b => !!b.closest('.bar').title), 'the window bar\'s title is put back too');
});

test('everything else with a title gets the app\'s tooltip too, never the browser\'s', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  const titled = sel => page.evaluate(sel => { for (let n = document.querySelector(sel); n; n = n.parentElement) if (n.title) return n.className || n.tagName; return null; }, sel);
  await page.mouse.move(800, 500);
  await page.hover('#savedBtn');   // a button with words
  await page.waitForFunction(() => document.querySelector('#tip.on') && document.querySelector('#tip').textContent === "Your channels: open one, add a new one, see who's live");
  assert.equal(await titled('#savedBtn'), null);
  await page.hover('#stage .win.stream.plat-kick .bar .dot');   // the window bar's title: which channel and window this is
  await page.waitForFunction(() => document.querySelector('#tip.on') && /alpha/.test(document.querySelector('#tip').textContent));
  assert.equal(await titled('#stage .win.stream.plat-kick .bar .dot'), null);
  await page.mouse.move(800, 600);
  assert.equal(await page.getAttribute('#savedBtn', 'title'), "Your channels: open one, add a new one, see who's live", 'titles are put back');
});

test('Auto layout fills the space with an odd number of streams: no empty cells, nothing overlapping', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie', 'delta', 'echo');
  await page.click('#layoutBtn'); await page.click('#layoutMenu button[data-l="auto"]');
  await page.waitForTimeout(500);
  const w = await windows(page);
  assert.equal(w.length, 10);
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) assert.ok(!overlaps(w[i], w[j]), `${w[i].kind} ${w[i].title} and ${w[j].kind} ${w[j].title} overlap`);
  const stage = await page.$eval('#stage', e => ({ w: e.clientWidth, h: e.clientHeight }));
  const covered = w.reduce((a, x) => a + x.w * x.h, 0) / (stage.w * stage.h);
  assert.ok(covered > 0.9, `windows cover ${Math.round(covered * 100)}% of the space`);
  const streams = w.filter(x => x.kind === 'stream');
  for (const s of streams) assert.ok(Math.abs((s.h - 30) / s.w - 9 / 16) < 0.12, `${s.title} is about 16:9`);
});

test('Chat focus keeps the chosen stream columns when picked again, and every chat gets its own space', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot');
  const colsOn = async () => { await page.click('#layoutBtn'); const n = await page.$eval('#lmCols .on', e => e.dataset.n); await page.keyboard.press('Escape'); return n; };
  const streamXs = async () => new Set((await windows(page)).filter(x => x.kind === 'stream').map(x => x.x)).size;
  const noOverlaps = w => { for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) assert.ok(!overlaps(w[i], w[j]), `${w[i].kind} ${w[i].title} and ${w[j].kind} ${w[j].title} overlap`); };

  await press(page, 'Shift+C');
  assert.equal(await colsOn(), '1');
  assert.equal(await streamXs(), 1, 'streams in one column');
  // picking Chat focus again doesn't change the count
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=chatfocus]'); await page.waitForTimeout(350);
  await press(page, 'Shift+C');
  assert.equal(await colsOn(), '1', 'still 1 after the menu and Shift+C');
  assert.equal(await streamXs(), 1, 'and the streams are still in one column');

  // a saved layout from before it had its own stream columns
  await page.click('#layoutBtn'); await page.click('#lmCols [data-n="3"]');
  await page.fill('#presetName', 'Old'); await page.click('#presetSave');
  await page.keyboard.press('Escape');
  // two channels with a second copy of their chat
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('kickMultiview.presets')); delete p[0].streamCols;
    localStorage.setItem('kickMultiview.presets', JSON.stringify(p));
    const d = JSON.parse(localStorage.getItem('kickMultiview.v1'));
    for (const c of ['alpha', 'charlie']) d.push({ ...d.find(x => x.kind === 'chat' && x.channel.endsWith(c)), x: 40, y: 40, ord: d.length, z: 99 });
    localStorage.setItem('kickMultiview.v1', JSON.stringify(d));
  });
  await page.reload(); await page.waitForTimeout(500);
  const w = await windows(page);
  assert.equal(w.filter(x => x.kind === 'chat').length, 8);
  noOverlaps(w);

  await page.click('#layoutBtn'); await page.click('#lmCols [data-n="3"]');
  await page.click('#presetList .pr-load'); await page.waitForTimeout(400);
  assert.equal(await colsOn(), '1', 'a saved layout without its own count uses 1, the same as its options show');
  assert.equal(await streamXs(), 1);
});

test('Hide bar: the button says Show bar while the bar is hidden, and brings it back', async t => {
  const page = await openApp(t);
  const hidden = () => page.evaluate(() => document.body.classList.contains('focus'));
  await page.click('#focusBtn');
  assert.equal(await hidden(), true);
  assert.equal(await page.getAttribute('#focusBtn', 'aria-label'), 'Show bar');
  await page.mouse.move(800, 2);   // the top edge: the bar peeks out
  await page.waitForTimeout(400);
  await page.click('#focusBtn');
  assert.equal(await hidden(), false, 'clicking it again keeps the bar showing');
  assert.equal(await page.getAttribute('#focusBtn', 'aria-label'), 'Hide bar');
  await page.mouse.move(800, 400);
  await page.waitForTimeout(400);
  assert.equal(await page.$eval('header', h => h.getBoundingClientRect().top), 0, 'still showing after the mouse leaves');
  await page.keyboard.press('h');
  assert.equal(await hidden(), true, 'H hides it');
  await page.keyboard.press('Escape');
  assert.equal(await hidden(), false, 'Esc brings it back');
  assert.equal(await page.getAttribute('#focusBtn', 'aria-label'), 'Hide bar');
});

test('toolbar on the left: a column of named rows or slim icons (names over the streams on hover), menus beside it, remembered', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await press(page, 't');
  const body = c => page.evaluate(c => document.body.classList.contains(c), c);
  const rect = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; });
  // Layout menu > Toolbar: Left. "Left toolbar" (Labels / Icons only) only works on the left
  await page.click('#layoutBtn');
  assert.ok(await page.isDisabled('#layoutMenu [data-tb=labels] [data-v="0"]'), 'Icons only is greyed out while the toolbar is on top');
  await page.click('#layoutMenu [data-tb=pos] [data-v=left]');
  assert.ok(await body('bar-left'));
  assert.equal(await page.isVisible('#layoutMenu'), false, 'the menu closes (it was placed for the top bar)');
  await page.waitForTimeout(900);                    // the layout fits the new space
  const h = await rect('header'), st = await rect('#stage');
  assert.deepEqual([h.x, h.y, h.w, h.h], [0, 0, 180, 900], 'a 180px column down the left');
  assert.deepEqual([st.x, st.y, st.w], [180, 0, 1420], 'the streams get the rest, the whole height');
  const wins = await windows(page);
  assert.ok(wins.every(w => w.x >= 0 && w.x + w.w <= 1420 + 1), 'Tile fits in the space left');
  assert.equal(await page.isVisible('#layoutBtn .tb-l'), true, 'every row shows its name');
  assert.ok((await rect('#savedBtn')).y < (await rect('#layoutBtn')).y, 'Channels at the top, Layout further down');

  // menus and panels open beside the column, next to their row
  await page.click('#layoutBtn');
  const lm = await rect('#layoutMenu'), lb = await rect('#layoutBtn');
  assert.equal(lm.x, 186, 'the Layout menu opens to the right of the column');
  assert.ok(lm.y <= lb.y && lm.y + lm.h <= 900, 'by its row, and inside the window');
  assert.equal(await page.getAttribute('#layoutBtn', 'aria-expanded'), 'true', 'its row is marked open');
  await page.keyboard.press('Escape');
  await page.click('#savedBtn');
  assert.equal((await rect('#savedPanel')).x, 186);
  await page.click('#savedBtn');

  // Settings > Layouts > Toolbar: Icons only, the same setting as the Layout menu
  await page.evaluate(() => window.openSettings('layouts'));
  await page.click('#lyTabs [data-t=toolbar]');
  assert.ok(await page.$eval('#settingsDlg [data-tb=pos] [data-v=left]', b => b.classList.contains('on')), 'Settings shows Left too');
  await page.click('#settingsDlg [data-tb=labels] [data-v="0"]');
  assert.ok(await body('bar-icons'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.equal((await rect('header')).w, 44, 'a slim 44px column');
  assert.equal((await rect('#stage')).x, 44);
  assert.equal(await page.isVisible('#layoutBtn .tb-l'), false, 'icons only');

  // pointing at it slides the names out over the streams, after a short pause; nothing underneath moves
  await page.mouse.move(22, 400);
  await page.waitForTimeout(100);
  assert.equal(await body('bar-peek'), false, 'not when the mouse just passes over it');
  await page.waitForTimeout(400);
  assert.ok(await body('bar-peek'), 'the names come out');
  await page.waitForTimeout(250);
  assert.equal((await rect('header')).w, 180);
  assert.equal((await rect('#stage')).x, 44, 'over the streams: the stage stays where it was');
  assert.equal(await page.getAttribute('#barFold', 'aria-label'), 'Keep open');
  await page.mouse.move(900, 400);
  await page.waitForTimeout(600);
  assert.equal(await body('bar-peek'), false, 'and go again when the mouse leaves');
  assert.equal(await page.getAttribute('#barFold', 'aria-label'), 'Keep names open');
  // a click works straight away, without the names coming out first; opening a panel puts them away
  await page.mouse.move(22, 400);
  await page.waitForTimeout(450);
  await page.click('#savedBtn');
  assert.equal(await body('bar-peek'), false, 'opening a panel closes the names');
  assert.equal((await rect('#savedPanel')).x, 50, 'and it opens beside the slim column');
  await page.click('#savedBtn');
  await page.mouse.move(900, 400);
  await page.waitForTimeout(600);
  // the keyboard: Tab into the column opens it
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  for (let i = 0; i < 4 && !(await page.evaluate(() => !!document.activeElement.closest('header'))); i++) await page.keyboard.press('Tab');
  assert.ok(await body('bar-peek'), 'Tab into the column shows the names');
  await page.evaluate(() => document.activeElement.blur());

  // » keeps the names open (Labels); « Collapse goes back to icons only
  await page.click('#barFold');
  assert.equal(await body('bar-icons'), false);
  assert.equal(await page.getAttribute('#barFold', 'aria-label'), 'Collapse');
  await page.click('#layoutBtn');
  assert.ok(await page.$eval('#layoutMenu [data-tb=labels] [data-v="1"]', b => b.classList.contains('on')), 'the Layout menu follows');
  await page.keyboard.press('Escape');
  await page.click('#barFold');
  assert.ok(await body('bar-icons'));

  // Hide bar: the column slides off to the left, and the left edge brings it back
  await page.click('#focusBtn');
  await page.waitForTimeout(400);
  assert.ok((await rect('header')).right <= 0, 'slid off to the left');
  assert.equal((await rect('#stage')).x, 0);
  await page.mouse.move(2, 400);
  await page.waitForTimeout(300);
  assert.ok(await body('peek'), 'the left edge brings it out');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await body('focus'), false);

  // a short window: the least-used buttons go into ⋯ at the bottom, whose menu opens beside it
  await page.setViewportSize({ width: 1600, height: 300 });
  await page.waitForTimeout(400);
  assert.equal(await page.$eval('header', h => h.scrollHeight <= h.clientHeight + 1), true, 'nothing is cut off');
  assert.ok(await page.isVisible('#moreBtn'));
  await page.click('#moreBtn');
  assert.ok(await page.isVisible('#moreMenu #clear'), 'Clear goes first');
  assert.ok((await rect('#moreMenu')).x >= 44);
  await page.keyboard.press('Escape');

  // remembered
  await page.reload();
  assert.ok(await body('bar-left'));
  assert.ok(await body('bar-icons'));
  // back on top
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.click('#layoutBtn');
  await page.click('#layoutMenu [data-tb=pos] [data-v=top]');
  assert.equal(await body('bar-left'), false);
  assert.equal(await body('bar-icons'), false, 'Icons only is for the left toolbar');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.toolbar'))), { pos: 'top', labels: false }, 'it keeps Icons only for next time');
});

test('macOS, toolbar on the left: the lights sit at the top of the column, hide with Icons only and show while its names are out', async t => {
  const page = await openApp(t, { init: () => {
    localStorage.setItem('kickMultiview.toolbar', JSON.stringify({ pos: 'left', labels: false }));
    window.lights = []; window.watching = [];
    window.kmv = { platform: 'darwin', setLights: on => window.lights.push(on), onFullscreen: cb => { window.goFullscreen = cb; },
      watchTop: (on, edge) => window.watching.push([on, edge]), onTop: cb => { window.mouseAtTop = cb; } };
  } });
  const lights = () => page.evaluate(() => window.lights.splice(0));
  await page.waitForTimeout(300);
  assert.deepEqual(await lights(), [false], 'no room for them in the slim column');
  await page.mouse.move(22, 400);
  await page.waitForTimeout(700);
  assert.deepEqual(await lights(), [true], 'they show while the names are out');
  await page.mouse.move(900, 400);
  await page.waitForTimeout(600);
  assert.deepEqual(await lights(), [false], 'and hide again');
  assert.equal(await page.$eval('header', e => getComputedStyle(e).getPropertyValue('-webkit-app-region')), 'drag', 'the column moves the window');
  // Hide bar watches the left edge (the window's resize edge, which the page can't see)
  await page.click('#focusBtn');
  assert.deepEqual(await page.evaluate(() => window.watching.splice(0)), [[true, 'left']]);
  await page.evaluate(() => window.mouseAtTop());
  assert.ok(await page.evaluate(() => document.body.classList.contains('peek')), 'the mouse at the left edge brings it out');
  await page.keyboard.press('Escape');
  // with names, the lights stay where they are
  await page.mouse.move(22, 400); await page.waitForTimeout(600);
  await page.click('#barFold');
  await page.mouse.move(900, 400); await page.waitForTimeout(600);
  await lights();
  assert.equal(await page.$eval('header .brand', e => getComputedStyle(e).paddingLeft), '80px', 'room for the lights at the top of the column');
  await page.mouse.move(22, 400); await page.mouse.move(900, 400); await page.waitForTimeout(600);
  assert.ok((await lights()).every(Boolean), 'and stay showing');
});

test('macOS: the toolbar is the title bar, and the traffic lights hide and come back with Hide bar', async t => {
  // The Mac parts of the desktop bridge: records what the page asks of the lights, and lets the test go fullscreen.
  const page = await openApp(t, { init: () => {
    window.lights = [];
    window.watching = [];
    window.kmv = { platform: 'darwin', setLights: on => window.lights.push(on), onFullscreen: cb => { window.goFullscreen = cb; },
      watchTop: on => window.watching.push(on), onTop: cb => { window.mouseAtTop = cb; } };
  } });
  const lights = () => page.evaluate(() => window.lights.splice(0));
  const css = (sel, prop) => page.$eval(sel, (e, p) => getComputedStyle(e).getPropertyValue(p), prop);
  assert.equal(await css('header', '-webkit-app-region'), 'drag', 'empty toolbar space moves the window');
  assert.equal(await css('#savedBtn', '-webkit-app-region'), 'no-drag', 'buttons still click');
  assert.equal(await css('header', 'padding-left'), '86px', 'room for the lights');
  assert.ok(await page.isVisible('.brand .pear'), 'the pear stays');
  assert.equal(await page.isVisible('.brand-txt'), false, 'the name goes');

  await page.click('#focusBtn');
  assert.deepEqual(await lights(), [false], 'the lights go as soon as the bar starts sliding away');
  await page.mouse.move(800, 400);
  await page.waitForTimeout(300);
  assert.ok((await lights()).every(on => !on), 'and stay away');
  await page.mouse.move(800, 2);   // the top edge: the bar peeks out
  assert.deepEqual(await lights(), [], 'not while it is still sliding in');
  await page.waitForTimeout(300);
  assert.deepEqual(await lights(), [true], 'back once it is in');
  await page.mouse.move(800, 400, { steps: 20 });   // down through the bar and off it
  assert.deepEqual(await lights(), [false], 'away again when the mouse leaves the bar');

  // back up over the top edge while the bar is out: it stays out (the edge strip used to take the mouse off it)
  const peeking = () => page.evaluate(() => document.body.classList.contains('peek'));
  await page.mouse.move(800, 4);
  await page.mouse.move(800, 30, { steps: 5 });
  await page.mouse.move(800, 2, { steps: 5 });
  await page.waitForTimeout(300);
  assert.equal(await peeking(), true, 'still out with the mouse at the very top');
  assert.deepEqual(await lights(), [true]);
  await page.mouse.move(800, 400, { steps: 20 });
  assert.equal(await peeking(), false);
  // hidden with the mouse already at the top edge: moving it there brings the bar out
  await page.keyboard.press('Escape');
  await page.mouse.move(800, 8);
  await page.keyboard.press('h');
  await page.mouse.move(820, 8);
  assert.equal(await peeking(), true, 'a nudge along the top edge is enough');
  await page.mouse.move(800, 400, { steps: 20 });
  await lights();

  // the app watches the mouse while the bar is hidden (the page can't see the window's top edge on a Mac)
  assert.deepEqual(await page.evaluate(() => window.watching.splice(0)), [true, false, true]);
  await page.evaluate(() => window.mouseAtTop());
  assert.equal(await peeking(), true, 'the mouse at the top edge brings the bar out');
  await page.mouse.move(800, 30);
  await page.mouse.move(800, -5);   // up off the top, e.g. into the menu bar in fullscreen
  assert.equal(await peeking(), true, 'leaving through the top keeps it out');
  await page.mouse.move(800, 30);
  await page.mouse.move(800, 400, { steps: 20 });
  assert.equal(await peeking(), false);
  await lights();

  await page.evaluate(() => window.goFullscreen(true));
  assert.equal(await css('header', 'padding-left'), '12px', 'fullscreen: macOS hides the lights, so no room for them');
  assert.deepEqual(await lights(), [true], 'fullscreen: macOS shows them in the strip that drops down with the menu bar');
  await page.mouse.move(800, 4);
  await page.waitForTimeout(300);
  await page.mouse.move(800, 400, { steps: 20 });
  await page.waitForTimeout(300);
  assert.deepEqual(await lights(), [], 'and Hide bar leaves them alone there');
  await page.evaluate(() => window.goFullscreen(false));
  assert.deepEqual(await lights(), [false], 'leaving fullscreen with the bar hidden hides them');
  assert.equal(await css('header', 'padding-left'), '86px');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.deepEqual(await lights(), [true], 'Esc brings the bar and the lights back');
  assert.deepEqual(await page.evaluate(() => window.watching.splice(0)), [false], 'and stops watching the mouse');
  await page.evaluate(() => window.goFullscreen(false));
  assert.deepEqual(await lights(), [true], 'leaving fullscreen with the bar showing shows them');
});

test('Settings opens from the gear and Ctrl+, shows only what works in a browser, and remembers General', async t => {
  const page = await openApp(t);
  await page.click('#settingsBtn');
  assert.ok(await page.isVisible('#settingsDlg'));
  const tabs = await page.$$eval('#settingsDlg .st-rail button', b => b.filter(x => !x.hidden).map(x => x.dataset.s));
  assert.deepEqual(tabs, ['general', 'layouts', 'themes', 'notify', 'guide', 'keys', 'updates'], 'accounts, alerts and spam need the desktop app');
  assert.deepEqual(await page.$$eval('#settingsDlg .st-rail-sec', h => h.filter(x => !x.hidden).map(x => x.textContent)), ['Alerts', 'Help'], 'Sites has nothing here, so its heading goes');
  await press(page, 'Escape');
  assert.ok(await page.isHidden('#settingsDlg'));
  await page.keyboard.press('Control+,');
  assert.ok(await page.isVisible('#settingsDlg'), 'Ctrl+, opens it');

  await page.click('#settingsDlg .st-rail [data-s=general]');
  await page.uncheck('#snap'); await page.uncheck('#muted'); await page.check('#autoPause');
  await page.uncheck('#keysSet');
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ['snap', 'muted', 'autoPause'].map(id => document.getElementById(id).checked)), [false, false, true], 'remembered');
  await page.keyboard.press('Control+,');
  await page.click('#settingsDlg .st-rail [data-s=keys]');
  assert.equal(await page.isChecked('#keysOn'), false, 'the shortcuts tab shows the same switch');
  await page.check('#keysOn');
  await page.click('#settingsDlg .st-rail [data-s=general]');
  assert.equal(await page.isChecked('#keysSet'), true);
});

test('messages show as a pop-up where Settings puts it, close on a click, and can be turned off', async t => {
  const page = await openApp(t);
  assert.equal(await page.evaluate(() => !!document.querySelector('header #msg')), false, 'not in the toolbar any more');
  await page.click('#savedBtn'); await page.fill('#savedInput', '%%%'); await page.press('#savedInput', 'Enter');
  assert.match(await page.textContent('#msg'), /Couldn.t read that link/);
  assert.ok(await page.isVisible('#msg'));
  assert.equal(await page.getAttribute('#msg', 'data-pos'), 'tc', 'under the toolbar to start with');
  await page.click('#msg');
  assert.ok(await page.isHidden('#msg'), 'a click closes it');
  await page.click('#settingsBtn'); await page.click('#settingsDlg .st-rail [data-s=notify]');
  assert.ok(await page.isHidden('#dnOn'), 'desktop notifications need the desktop app');
  assert.ok(await page.isHidden('#ntTabs [data-t=desktop]'), 'so there\'s no Desktop tab');
  assert.equal(await page.locator('#ntGrid .seg').first().evaluate(e => getComputedStyle(e.parentNode).visibility), 'hidden', 'and so does the Desktop column');
  await page.click('#ntTabs [data-t=bell]');
  await page.selectOption('#msgPos', 'br');
  assert.equal(await page.getAttribute('#msg', 'data-pos'), 'br');
  assert.ok(await page.isVisible('#msg'), 'it shows where they go now, over Settings');
  await page.click('#ntTabs [data-t=alerts]');
  await page.uncheck('#ntGrid [data-al="app.popup"]');
  await page.reload();
  assert.deepEqual(await page.evaluate(() => [document.querySelector('#ntGrid [data-al="app.popup"]').checked, msgPos.value]), [false, 'br'], 'remembered');
  await page.click('#savedBtn'); await page.fill('#savedInput', '%%%'); await page.press('#savedInput', 'Enter');
  assert.ok(await page.isHidden('#msg'), 'off: nothing shows');
});

test('messages from before the bell: "Show messages" off and "as desktop notifications" become the App messages row', async t => {
  const page = await openApp(t, { init: () => { if (!sessionStorage.getItem('seeded')){ sessionStorage.setItem('seeded', '1'); localStorage.setItem('kickMultiview.msg', JSON.stringify({ on: false, pos: 'bl', via: 'desktop' })); localStorage.setItem('kickMultiview.notifyAll', '0'); } } });
  assert.deepEqual(await page.evaluate(() => [smvNotes.alerts.app.popup, smvNotes.alerts.app.notify, smvNotes.alerts.live.notify, msg.dataset.pos]), [false, 'always', 'never', 'bl']);
});

test('a chat window lights up for a mention until you click it, and gets stronger while unseen', async t => {
  const page = await openApp(t);
  await page.evaluate(() => localStorage.setItem('kickMultiview.alerts', JSON.stringify({ mention: { esc: 10, max: 'flash', sound: 'none', color: '#123456' } })));
  await page.reload();
  await page.clock.install();
  await add(page, 'alpha');
  const cls = () => page.$eval('#stage .win.chat', e => ['al-1', 'al-2', 'al-3', 'al-brief'].filter(c => e.classList.contains(c)));
  await page.evaluate(() => window.raiseAlert('alpha', 'mention'));
  assert.deepEqual(await cls(), ['al-1']);
  assert.equal(await page.$eval('#stage .win.chat', e => e.style.getPropertyValue('--al')), '#123456', 'in your colour');
  await page.clock.fastForward(10500);
  assert.deepEqual(await cls(), ['al-2'], 'pulses after 10 s');
  await page.clock.fastForward(10500);
  assert.deepEqual(await cls(), ['al-3'], 'then flashes');
  await page.clock.fastForward(30000);
  assert.deepEqual(await cls(), ['al-3'], 'and no further');
  await page.$eval('#stage .win.chat .body', e => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));   // the paused clock holds up layout, so no real click
  assert.deepEqual(await cls(), [], 'clicking the chat clears it');

  await page.evaluate(() => localStorage.setItem('kickMultiview.alerts', JSON.stringify({ mention: { hl: 'brief', sound: 'none' } })));
  await page.reload();
  await page.evaluate(() => window.raiseAlert('alpha', 'mention'));
  assert.deepEqual(await cls(), ['al-brief'], 'or just a short glow');
});

test('the chat helper hands over new messages and tags flagged ones without changing their text', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  await page.setContent(`<div id="chat">
    <div class="row"><span>12:01 PM </span><b>regular</b>: <span>hello there</span></div>
  </div>`);
  await page.evaluate(js);
  await page.evaluate(() => window.__kmvMention.setWatch(true));
  await page.waitForTimeout(2800);                       // what's already in the chat counts as old
  await page.evaluate(() => document.getElementById('chat').insertAdjacentHTML('beforeend',
    '<div class="row" id="spam"><span>12:02 PM </span><b>newacct</b>: <span>hq ai stream upgrades botkiva com <img alt=""> zero cost upgrades</span></div>'));
  const q = await page.evaluate(() => window.__kmvMention.take());
  assert.deepEqual(q.k, ['regular'], 'people chatting before it started are reported once');
  assert.deepEqual(q.l.map(l => [l.sender, l.body]), [['newacct', 'hq ai stream upgrades botkiva com  zero cost upgrades']], 'emotes are pictures, so they leave a gap');

  const before = await page.$eval('#spam', e => e.innerText);
  await page.evaluate(l => window.__kmvMention.mark(l, 'Likely spam: test', '#ff5f5f'), q.l[0].line);
  assert.equal(await page.$eval('#spam > [data-kmv-spam]', e => e.title), 'Likely spam: test', 'tagged after the message');
  assert.equal(await page.$eval('#spam', e => e.innerText), before, 'the message text is unchanged');
  assert.equal(await page.$eval('#spam', e => getComputedStyle(e.lastElementChild, '::after').content), '"LIKELY SPAM"');
  assert.equal(await page.$eval('#chat .row', e => e.querySelector('[data-kmv-spam]')), null, 'only that message');
  assert.deepEqual((await page.evaluate(() => window.__kmvMention.take())).l, [], 'and the tag isn\'t read as a new message');

  // the chat draws the message again (it scrolled out and back): the tag comes back
  await page.evaluate(() => { const o = document.getElementById('spam'), n = o.cloneNode(true); n.querySelector('[data-kmv-spam]').remove(); o.replaceWith(n); });
  await page.evaluate(() => window.__kmvMention.take());
  assert.ok(await page.$('#spam > [data-kmv-spam]'));
});

test('the chat helper reads Kick messages, where the name and the message are on separate lines', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  // Kick's layout: the name is a block inside an inline-flex, so its text sits on a line of its own.
  const row = (id, name, body) => `<div class="row" id="${id}"><span style="display:none">12:01 PM</span>` +
    `<div style="display:inline-flex"><button style="display:block">${name}</button></div><span style="display:inline-flex">:&nbsp;</span><span>${body}</span></div>`;
  await page.setContent(`<div id="chat">${row('old', 'regular', 'hello there')}</div>`);
  assert.match(await page.$eval('#old', e => e.innerText), /^regular\n:\s+hello there$/, 'the name is on its own line');
  await page.evaluate(js);
  await page.evaluate(() => { window.__kmvMention.setMe('Mod_Me'); window.__kmvMention.setWatch(true); });
  await page.waitForTimeout(2800);
  await page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h),
    row('spam', 'newacct', 'hq ai stream upgrades botkiva com <img alt=""> zero cost upgrades') + row('ping', 'friend', 'hey @mod_me look'));
  const q = await page.evaluate(() => window.__kmvMention.take());
  assert.deepEqual(q.k, ['regular'], 'people chatting before it started are reported once');
  assert.deepEqual(q.l.map(l => [l.sender, l.body]), [['newacct', 'hq ai stream upgrades botkiva com  zero cost upgrades'], ['friend', 'hey @mod_me look']]);
  assert.deepEqual(q.m.map(m => [m.sender, m.kind]), [['friend', 'mention']], 'mentions work too');

  await page.evaluate(l => window.__kmvMention.mark(l, 'Likely spam: test', '#ff5f5f'), q.l[0].line);
  assert.equal(await page.$eval('#spam > [data-kmv-spam]', e => e.title), 'Likely spam: test', 'tagged after the message');
  assert.equal(await page.$('#ping [data-kmv-spam]'), null, 'only that message');
});
