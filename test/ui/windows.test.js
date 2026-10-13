// Moving and resizing windows by hand, snapping, maximizing, and the buttons on each window's title bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, drag, windows } = require('./app');
const { openApp } = setup();

// Two streams side by side to work with ("Stream only", so each channel is one window).
async function twoStreams(t) {
  const page = await openApp(t);
  await page.selectOption('#mode', 'stream');
  await add(page, 'alpha', 'bravo');
  await page.keyboard.press('t');            // Tile
  await page.waitForTimeout(400);
  return page;
}
const grab = b => ({ x: b.x + 13, y: b.y + 12 });                  // the dot at the start of the title bar
const corner = b => ({ x: b.x + b.w - 3, y: b.y + b.h - 3 });
async function moveBy(page, loc, dx, dy) { const p = grab(await box(loc)); await drag(page, p, { x: p.x + dx, y: p.y + dy }); }
async function sizeTo(page, loc, w, h) { const b = await box(loc); await drag(page, corner(b), { x: b.x + w - 3, y: b.y + h - 3 }); }

test('drag a window by its title bar; it snaps to another window\'s edge, unless Snap is off', async t => {
  const page = await twoStreams(t);
  const a = win(page, 'alpha'), b = win(page, 'bravo');
  await sizeTo(page, a, 300, 220);
  let ab = await box(a);
  assert.deepEqual([ab.w, ab.h], [300, 220], 'resized by its corner');
  const start = await box(a);
  await moveBy(page, a, 100, 200);
  ab = await box(a);
  assert.deepEqual([ab.x - start.x, ab.y - start.y], [100, 200], 'moved with the mouse');
  // dropped with its right edge 16 px from bravo: it snaps to the usual 6 px gap
  const bb = await box(b);
  await moveBy(page, a, bb.x - (ab.x + ab.w) - 16, 0);
  ab = await box(a);
  assert.equal(bb.x - (ab.x + ab.w), 6, 'snapped next to bravo');
  // with Snap off the same move stays where you let go
  await page.click('#settingsBtn'); await page.uncheck('#snap'); await page.keyboard.press('Escape');
  await moveBy(page, a, -60, 0);
  await moveBy(page, a, 50, 0);
  ab = await box(a);
  assert.equal(bb.x - (ab.x + ab.w), 16, 'no snapping');
  // can't go above the stage
  await moveBy(page, a, 0, -2000);
  assert.equal((await box(a)).y, (await box(page.locator('#stage'))).y, 'stops at the top');
});

test('resizing shows the size, keeps a minimum, Shift keeps a stream 16:9, and every edge works', async t => {
  const page = await twoStreams(t);
  const a = win(page, 'alpha');
  let ab = await box(a);
  const c = corner(ab);
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  await page.mouse.move(c.x - 100, c.y - 80, { steps: 5 });
  assert.ok(await page.isVisible('#sizehint'), 'the size shows while resizing');
  assert.match(await page.textContent('#sizehint'), /^\d+ × \d+$/);
  await page.mouse.up();
  assert.equal(await page.isVisible('#sizehint'), false);
  await sizeTo(page, a, 20, 20);
  ab = await box(a);
  assert.deepEqual([ab.w, ab.h], [220, 140], 'no smaller than this');
  await drag(page, corner(ab), { x: ab.x + 480, y: ab.y + 200 }, { shift: true });
  ab = await box(a);
  assert.ok(Math.abs(ab.w / (ab.h - 30) - 16 / 9) < 0.03, `16:9 video (${ab.w} × ${ab.h - 30})`);
  await sizeTo(page, a, 300, 220);                 // clear of bravo, so every edge can be grabbed
  await moveBy(page, a, 150, 150);
  await page.click('#settingsBtn'); await page.uncheck('#snap'); await page.keyboard.press('Escape');   // so nothing snaps back
  for (const d of ['n', 'w', 'ne', 'nw', 'sw', 'e', 's']) {
    const h = await box(a.locator(`.rz-${d}`)), before = await box(a);
    // just inside the window (the handles stick out past its clipped edge)
    const p = { x: h.x + h.w / 2 + (d.includes('e') ? -2 : d.includes('w') ? 2 : 0), y: h.y + h.h / 2 + (d.includes('s') ? -2 : d.includes('n') ? 2 : 0) };
    await drag(page, p, { x: p.x + (d.includes('w') ? -25 : d.includes('e') ? 25 : 0), y: p.y + (d.includes('n') ? -25 : d.includes('s') ? 25 : 0) });
    assert.notDeepEqual(await box(a), before, `the ${d} edge resizes`);
  }
});

test('maximize with the button or a double-click; dragging a maximized window pulls it back out', async t => {
  const page = await twoStreams(t);
  const a = win(page, 'alpha'), stage = await box(page.locator('#stage'));
  await sizeTo(page, a, 400, 300);
  const before = await box(a);
  const settle = () => page.waitForTimeout(350);                  // it animates
  await a.locator('[data-a=max]').click(); await settle();
  let ab = await box(a);
  assert.ok(Math.abs(ab.w - stage.w) <= 2 && Math.abs(ab.h - stage.h) <= 2, `fills the stage (${ab.w}×${ab.h} vs ${stage.w}×${stage.h})`);
  await a.locator('[data-a=max]').click(); await settle();
  assert.deepEqual(await box(a), before, 'and back');
  await a.locator('.bar .grab').dblclick(); await settle();   // the bar's empty part, not its channel dropdown
  ab = await box(a);
  assert.ok(Math.abs(ab.w - stage.w) <= 2, 'a double-click maximizes');
  await moveBy(page, a, 60, 120);
  assert.equal((await box(a)).w, before.w, 'dragging it gives back its own size');
});

test('title bar buttons: + Chat, save, reload, open in a window, swap, close', async t => {
  const page = await twoStreams(t);
  const a = win(page, 'alpha');
  await a.locator('[data-a=chat]').click();
  assert.equal(await win(page, 'alpha', 'chat').count(), 1, '+ Chat opens its chat');
  assert.equal(await a.locator('[data-a=chat]').isHidden(), true, 'and the button goes away');

  await a.locator('[data-a=star]').click();
  assert.ok(await a.locator('[data-a=star].on').count(), 'saved: the star shows it');
  await page.click('#savedBtn');
  assert.match(await page.textContent('#savedList'), /alpha/);
  await page.keyboard.press('Escape');

  const frame = a.locator('iframe');
  const s1 = await frame.getAttribute('src');
  await frame.evaluate(f => { f.src = 'about:blank'; });
  await a.locator('[data-a=reload]').click();
  assert.equal(await frame.getAttribute('src'), s1, 'reload loads the stream again');

  await page.evaluate(() => { window.opened = []; window.open = (...x) => { window.opened.push(x); return null; }; });
  await a.locator('[data-a=pop]').click();
  await win(page, 'alpha', 'chat').locator('[data-a=pop]').click();
  const opened = await page.evaluate(() => window.opened);
  assert.deepEqual(opened.map(o => o[0]), ['https://kick.com/alpha', 'https://kick.com/popout/alpha/chat']);
  assert.match(opened[1][2], /width=380/, 'chats open narrow');

  // the name's dropdown swaps two windows of the same kind
  const before = await windows(page);
  await a.locator('.col-pick').selectOption({ label: 'bravo' });
  await page.waitForTimeout(400);
  const after = await windows(page);
  const pos = (l, n) => { const w = l.find(x => x.kind === 'stream' && x.title === n); return [w.x, w.y]; };
  assert.deepEqual(pos(after, 'alpha'), pos(before, 'bravo'), 'alpha took bravo\'s place');
  assert.deepEqual(pos(after, 'bravo'), pos(before, 'alpha'), 'and bravo took alpha\'s');

  await win(page, 'bravo').locator('[data-a=close]').click();
  assert.equal(await win(page, 'bravo').count(), 0, 'closed');
});

// What a narrow title bar shows: everything still fits, close always shows, and the rest is in its ⋯ menu.
const barState = loc => loc.evaluate(el => {
  const bar = el.querySelector('.bar'), shown = b => !b.hidden && getComputedStyle(b).display !== 'none';
  const name = [...bar.querySelectorAll('.col-pick, .title')].find(shown), right = bar.querySelector('.vol, .btns');
  return { fits: bar.scrollWidth <= bar.clientWidth + 1,
    grab: right.getBoundingClientRect().left - name.getBoundingClientRect().right,
    shown: [...bar.querySelectorAll('.btns button')].filter(shown).map(b => b.dataset.a),
    inMenu: [...bar.querySelectorAll('.btns button.ovf:not([hidden])')].map(b => b.dataset.a) };
});

test('a narrow title bar moves buttons into its ⋯ menu, which does what they do, and gets them back when wider', async t => {
  const page = await twoStreams(t);
  const a = win(page, 'alpha');
  await sizeTo(page, a, 600, 300);
  let st = await barState(a);
  assert.ok(st.fits && !st.shown.includes('more') && !st.inMenu.length, `wide: everything shows (${st.shown})`);

  await sizeTo(page, a, 220, 300);
  st = await barState(a);
  assert.ok(st.fits, 'nothing runs off the edge');
  assert.ok(st.grab >= 30, `room left to drag it by (${st.grab}px)`);
  assert.ok(st.shown.includes('close') && st.shown.includes('more'), `close and ⋯ stay (${st.shown})`);
  const ORDER = ['chat', 'mod', 'reload', 'pop', 'profile', 'ext', 'at', 'feat', 'star', 'max'], rank = a => ORDER.indexOf(a);
  assert.ok(['chat', 'mod', 'reload'].every(a => st.inMenu.includes(a)), `the least-used go first (${st.inMenu})`);
  assert.ok(Math.max(...st.inMenu.map(rank)) < Math.min(...st.shown.filter(a => ORDER.includes(a)).map(rank)), 'in that order');

  const more = a.locator('[data-a=more]');
  await more.click();
  const items = await page.$$eval('#barMenu .bm-t', ts => ts.map(t => t.textContent));
  assert.equal(items.length, st.inMenu.length, 'the menu lists them all');
  assert.ok(items.includes('Add chat') && items.includes('Reload'), JSON.stringify(items));
  await more.click();
  assert.equal(await page.isVisible('#barMenu'), false, '⋯ again closes it');
  await more.click();
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#barMenu'), false, 'so does Escape');
  await more.click();
  await page.mouse.click(5, 5);
  assert.equal(await page.isVisible('#barMenu'), false, 'and clicking elsewhere');

  // a menu item does its button's job
  await more.click();
  await page.click('#barMenu button:has(.bm-t:text-is("Add chat"))');
  assert.equal(await page.isVisible('#barMenu'), false);
  assert.equal(await win(page, 'alpha', 'chat').count(), 1, 'Add chat opened its chat');

  // a button that appears later is fitted too
  await a.evaluate(el => { el.querySelector('[data-a=mod]').hidden = true; });
  await page.waitForTimeout(50);
  st = await barState(a);
  assert.ok(st.fits && !st.inMenu.includes('mod'), 'a hidden button is not in the menu');
  await a.evaluate(el => { el.querySelector('[data-a=mod]').hidden = false; });
  await page.waitForTimeout(50);
  assert.ok((await barState(a)).fits, 'it still fits when one shows again');

  await sizeTo(page, a, 600, 300);
  st = await barState(a);
  assert.ok(st.fits && !st.shown.includes('more') && !st.inMenu.length, `wider again: all back (${st.shown})`);
});

test('Chat focus: drag a stream onto another to swap them, and their chats swap too', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  await page.keyboard.press('Shift+C'); await page.waitForTimeout(400);
  const order = kind => page.$$eval(`#stage .win.${kind}`, l => l.map(e => [e.querySelector('.title').textContent, e.offsetTop, e.offsetLeft]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]));
  assert.deepEqual(await order('stream'), ['alpha', 'bravo', 'charlie']);
  const a = await box(win(page, 'alpha')), c = await box(win(page, 'charlie'));
  await drag(page, { x: a.x + a.w / 2, y: a.y + 12 }, { x: c.x + c.w / 2, y: c.y + c.h / 2 }, { steps: 10 });
  await page.waitForTimeout(400);
  assert.deepEqual(await order('stream'), ['charlie', 'bravo', 'alpha'], 'swapped');
  const chats = await page.$$eval('#stage .win.chat', l => l.map(e => [e.querySelector('.title').textContent, e.offsetLeft]).sort((x, y) => x[1] - y[1]).map(x => x[0]));
  assert.deepEqual(chats, ['charlie', 'bravo', 'alpha'], 'the chats follow');
  // dropped on nothing: it goes back
  const b = await box(win(page, 'bravo'));
  await drag(page, { x: b.x + b.w / 2, y: b.y + 12 }, { x: b.x + b.w / 2 + 600, y: b.y + 12 }, { steps: 10 });
  await page.waitForTimeout(400);
  assert.deepEqual(await box(win(page, 'bravo')), b, 'dropped elsewhere, it snaps back');
});

test('Auto layout with nothing open: choosing it and resizing the window lay out nothing, without an error', async t => {
  const page = await openApp(t);
  await page.evaluate(() => document.querySelector('#layoutMenu [data-l=auto]').click());
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(350);
  assert.deepEqual(await windows(page), []);
});
