// Moving and resizing windows by hand, snapping, maximizing, and the buttons on each window's title bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, mode, win, box, drag, windows } = require('../app');
const { openApp } = setup();

// Two streams side by side to work with ("Stream only", so each channel is one window).
async function twoStreams(t) {
  const page = await openApp(t);
  await mode(page, 'stream');
  await add(page, 'alpha', 'bravo');
  await page.keyboard.press('t');            // Tile
  await page.waitForTimeout(400);
  return page;
}
const corner = b => ({ x: b.x + b.w - 3, y: b.y + b.h - 3 });
// the empty part of the title bar (the picture at its start opens the channel list)
const grab = async loc => { const g = await box(loc.locator('.bar .grab')); return { x: g.x + g.w / 2, y: g.y + g.h / 2 }; };
async function moveBy(page, loc, dx, dy) { const p = await grab(loc); await drag(page, p, { x: p.x + dx, y: p.y + dy }); }
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

test('Auto layout stays chosen after a restart and when an edge is only clicked; moving a window by hand ends it, and says so if fitting in is on', async t => {
  const page = await twoStreams(t);
  const layoutBtn = async () => (await page.getAttribute('#layoutBtn', 'title')).split('. ')[0];   // its tooltip names the layout in use
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=auto]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), 'auto', 'saved straight away');
  const placed = await windows(page);
  await page.reload(); await page.waitForTimeout(400);
  assert.equal(await layoutBtn(), 'Layout: Auto layout', 'still Auto layout after a restart');
  assert.deepEqual(await windows(page), placed, 'with the windows where they were');
  await page.click('#layoutBtn');
  assert.ok(await page.isVisible('#lmAutoFit'), 'so fitting in is offered (and works) again');
  await page.check('#lmAutoFit'); await page.keyboard.press('Escape');

  // clicking a resize edge without moving keeps it
  const a = win(page, 'alpha'), c = corner(await box(a));
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.up();
  assert.equal(await layoutBtn(), 'Layout: Auto layout', 'a click on an edge keeps it');
  assert.equal(await page.textContent('#msg'), '');

  // swapping two windows with the name list keeps it too: they trade places, and refitting keeps the new order
  const before = { alpha: await box(a), bravo: await box(win(page, 'bravo')) };
  await a.locator('.col-pick').selectOption({ label: 'bravo' });
  await page.waitForTimeout(400);
  assert.deepEqual([await box(a), await box(win(page, 'bravo'))], [before.bravo, before.alpha], 'swapped');
  assert.equal(await layoutBtn(), 'Layout: Auto layout', 'a swap keeps it');
  assert.equal(await page.textContent('#msg'), '');
  await page.setViewportSize({ width: 1500, height: 850 }); await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.querySelector('#stage .win.anim'));   // the refit has finished moving them
  assert.ok((await box(win(page, 'bravo'))).x < (await box(a)).x, 'still refits, in the swapped order');

  // really resizing ends it, and the button and a message say so
  await sizeTo(page, a, 400, 300);
  assert.equal(await layoutBtn(), 'Layout', 'resized by hand: no longer Auto layout');
  assert.match(await page.textContent('#msg'), /Auto layout is off because you moved a window/);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), '');

  // moving by the title bar ends it too; with fitting in off there's nothing to say
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=auto]');
  await page.click('#layoutBtn'); await page.uncheck('#lmAutoFit'); await page.keyboard.press('Escape');
  await page.click('#msg');                  // closes the message
  await moveBy(page, a, 50, 40);
  assert.equal(await layoutBtn(), 'Layout', 'moved by hand: no longer Auto layout');
  assert.equal(await page.textContent('#msg'), '', 'no message while fitting in is off');
});

for (const bar of [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }]){
  const name = bar.pos === 'top' ? 'at the top' : bar.labels ? 'on the left' : 'on the left, icons only';
  test(`Lock layout, toolbar ${name}: the padlock in the Layout menu and Shift+L lock it, the Layout button shows a padlock, remembered (#83)`, async t => {
    const page = await openApp(t, { init: `localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(bar))})` });
    const state = () => page.evaluate(() => ({
      pressed: document.querySelector('#layoutLock').getAttribute('aria-pressed'), lit: document.querySelector('#layoutLock').classList.contains('on'),
      ico: document.querySelector('#layoutBtn i[data-ico]').dataset.ico, title: document.querySelector('#layoutBtn').title,
      saved: localStorage.getItem('kickMultiview.layoutLocked')
    }));
    await page.click('#layoutBtn');
    assert.equal(await page.getAttribute('#layoutLock', 'title'), 'Lock layout (Shift+L)');
    const head = await page.$$eval('#layoutMenu .lm-head button', l => l.map(b => b.id));
    assert.deepEqual(head, ['layoutLock', 'layoutSet'], 'next to Layout settings');
    await page.click('#layoutLock');
    let s = await state();
    assert.deepEqual([s.pressed, s.lit, s.ico, s.saved], ['true', true, 'lock', '1'], 'lit up, and the Layout button is a padlock');
    assert.match(s.title, /\(locked\)/);
    assert.equal(await page.getAttribute('#layoutLock', 'title'), 'Unlock layout (Shift+L)');
    assert.match(await page.textContent('#msg'), /Layout locked/);
    await page.keyboard.press('Escape');
    await page.reload();
    s = await state();
    assert.deepEqual([s.pressed, s.ico], ['true', 'lock'], 'still locked after a restart');
    assert.ok(await page.evaluate(() => document.body.classList.contains('layout-locked')));
    await page.keyboard.press('Shift+L');
    s = await state();
    assert.deepEqual([s.pressed, s.lit, s.ico, s.saved], ['false', false, 'layout', '0'], 'Shift+L unlocks it');
    assert.doesNotMatch(s.title, /locked/);
    await page.keyboard.press('Shift+L');
    assert.equal((await state()).pressed, 'true', 'and locks it again');
    await page.keyboard.press('l');
    assert.ok(await page.isVisible('#layoutMenu'), 'L still opens the Layout menu');
  });
}

test('Lock layout, Auto layout: no resizing or moving; drag a stream onto a stream to swap just those two, with a preview; closing and opening refit it (#83)', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo', 'charlie');
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=auto]');
  await page.waitForTimeout(400);
  await page.keyboard.press('Shift+L');
  const layoutBtn = async () => (await page.getAttribute('#layoutBtn', 'title')).split('. ')[0];
  const settle = () => page.waitForFunction(() => !document.querySelector('#stage .win.anim'));
  const placed = await windows(page);

  // resizing is blocked, and says why
  const a = win(page, 'alpha');
  await sizeTo(page, a, 300, 200);
  assert.deepEqual(await windows(page), placed, 'nothing changed size');
  assert.match(await page.textContent('#msg'), /layout is locked/i);
  assert.equal(await page.$eval('#stage .win .rz-se', e => getComputedStyle(e).cursor), 'not-allowed');
  await page.click('#msg');                  // closes the message (it sits over the top of the chats)
  // moving into free space or onto a chat: it goes back
  await moveBy(page, a, 700, 0); await settle();
  assert.deepEqual(await windows(page), placed, 'dropped on a chat, it goes back');
  await moveBy(page, a, 0, -400); await settle();
  assert.deepEqual(await windows(page), placed, 'and off the top, too');
  assert.equal(await layoutBtn(), 'Layout: Auto layout (locked)', 'still Auto layout');

  // dragging alpha over charlie: charlie lights up with "Swap alpha ⇄ charlie", an outline where charlie will land
  const ab = await box(a), cb = await box(win(page, 'charlie'));
  const ag = await grab(a);
  await page.mouse.move(ag.x, ag.y); await page.mouse.down();
  await page.mouse.move(cb.x + cb.w / 2, cb.y + cb.h / 2, { steps: 10 });
  const during = await page.evaluate(() => {
    const lit = [...document.querySelectorAll('#stage .win.swap-target')].map(e => e.className.split(' ')[1] + ':' + e.querySelector('.title').textContent);
    const g = document.querySelector('#swapGhost'), r = g.getBoundingClientRect();
    return { lit, label: document.querySelector('.win.swap-target .shield')?.dataset.swap, ghost: getComputedStyle(g).display, ghostText: g.textContent,
      ghostAt: [Math.round(r.x), Math.round(r.y)], back: g.classList.contains('back') };
  });
  assert.deepEqual(during.lit, ['stream:charlie'], 'only charlie (its chat stays)');
  assert.equal(during.label, 'Swap alpha ⇄ charlie');
  assert.equal(during.ghost, 'grid');
  assert.equal(during.ghostText, 'charlie goes here');
  assert.deepEqual(during.ghostAt, [ab.x, ab.y], 'where alpha was');
  assert.equal(during.back, false);
  const over = await box(win(page, 'bravo', 'chat'));
  await page.mouse.move(over.x + over.w / 2, over.y + over.h / 2, { steps: 5 });   // over a chat: not a stream, so it would go back
  assert.deepEqual(await page.$$eval('#stage .win.swap-target', l => l.length), 0);
  assert.ok(await page.$eval('#swapGhost', g => g.classList.contains('back')), 'the outline says it goes back');
  await page.mouse.move(cb.x + cb.w / 2, cb.y + cb.h / 2, { steps: 5 });
  await page.mouse.up(); await settle();
  assert.equal(await page.$eval('#swapGhost', g => getComputedStyle(g).display), 'none');
  assert.deepEqual([await box(a), await box(win(page, 'charlie'))], [cb, ab], 'swapped');
  const chatsAt = await page.$$eval('#stage .win.chat', l => l.map(e => e.querySelector('.title').textContent + '@' + e.offsetLeft + ',' + e.offsetTop));
  assert.deepEqual(chatsAt, placed.filter(w => w.kind === 'chat').map(w => w.title + '@' + w.x + ',' + w.y), 'the chats stay where they were');
  assert.equal(await layoutBtn(), 'Layout: Auto layout (locked)');

  // a chat onto a chat swaps those two
  const ach = await box(win(page, 'alpha', 'chat')), bch = await box(win(page, 'bravo', 'chat'));
  await drag(page, await grab(win(page, 'alpha', 'chat')), { x: bch.x + bch.w / 2, y: bch.y + bch.h / 2 }, { steps: 10 }); await settle();
  assert.deepEqual([await box(win(page, 'alpha', 'chat')), await box(win(page, 'bravo', 'chat'))], [bch, ach]);

  // closing bravo: Auto layout refits around what's left, keeping the swapped order
  await win(page, 'bravo').locator('[data-a=close]').evaluate(b => b.click());
  await settle();
  const streams = async () => (await windows(page)).filter(w => w.kind === 'stream').sort((p, q) => p.y - q.y || p.x - q.x);
  let s = await streams();
  assert.deepEqual(s.map(w => w.title), ['charlie', 'alpha'], 'swapped order kept');
  assert.ok(s[0].h > ab.h, 'the streams got bigger');
  // opening delta: fitted in as the last stream, without moving the chats out of their swapped places
  await add(page, 'delta'); await settle();
  s = await streams();
  assert.deepEqual(s.map(w => w.title), ['charlie', 'alpha', 'delta'], 'fitted in last');
  const all = await windows(page);
  const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  assert.ok(all.every(p => all.every(q => p === q || !overlap(p, q))), 'nothing overlaps');
  const chats = all.filter(w => w.kind === 'chat').sort((p, q) => p.y - q.y || p.x - q.x).map(w => w.title);
  assert.deepEqual(chats, ['bravo', 'alpha', 'charlie', 'delta'], 'the chats keep their swapped order (bravo\'s stays open), delta\'s last');
  assert.equal(await layoutBtn(), 'Layout: Auto layout (locked)');
});

test('Lock layout: maximise still works, a maximised window doesn\'t move, and unlocking lets windows move again (#83)', async t => {
  const page = await twoStreams(t);
  await page.keyboard.press('Shift+L');
  const a = win(page, 'alpha'), before = await box(a);
  await a.locator('.bar .grab').dblclick(); await page.waitForTimeout(350);
  const max = await box(a);
  assert.ok(max.w > before.w, 'maximised');
  await moveBy(page, a, 200, 150); await page.waitForTimeout(350);
  assert.deepEqual(await box(a), max, 'a maximised window stays put');
  await a.locator('.bar .grab').dblclick(); await page.waitForTimeout(350);
  assert.deepEqual(await box(a), before, 'and goes back');
  await page.keyboard.press('Shift+L');
  await moveBy(page, a, 50, 40);
  assert.deepEqual(await box(a), { ...before, x: before.x + 50, y: before.y + 40 }, 'unlocked: it moves');
});

test('Chat focus: while dragging, the stream and its chat light up, with the swap shown (#83)', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await page.keyboard.press('Shift+C'); await page.waitForTimeout(400);
  const a = await box(win(page, 'alpha')), b = await box(win(page, 'bravo'));
  await page.mouse.move(a.x + a.w / 2, a.y + 12); await page.mouse.down();
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2, { steps: 10 });
  const lit = await page.$$eval('#stage .win.swap-target', l => l.map(e => e.className.split(' ')[1] + ':' + e.querySelector('.title').textContent).sort());
  assert.deepEqual(lit, ['chat:bravo', 'stream:bravo'], 'the whole pair');
  assert.equal(await page.$eval('#stage .win.stream.swap-target .shield', e => e.dataset.swap), 'Swap alpha ⇄ bravo');
  await page.mouse.up(); await page.waitForTimeout(400);
  assert.deepEqual(await page.$$eval('#stage .win.swap-target', l => l.length), 0);
});

test('a channel window\'s name dropdown starts with the channel\'s picture: its site, live or offline; other windows keep the dot', async t => {
  const page = await openApp(t);
  await page.evaluate(() => localStorage.setItem('kickMultiview.saved', JSON.stringify(['alpha', 'tw:bravo'])));
  await page.reload();
  await mode(page, 'stream');
  await add(page, 'alpha', 'twitch:bravo', 'charlie', 'https://example.com/page');
  await page.waitForSelector('#stage .win.web');
  const bars = () => page.$$eval('#stage .win', l => l.map(e => {
    const a = e.querySelector('.bar .bar-av');
    return a ? [e.querySelector('.col-pick').value, a.firstChild.textContent, a.querySelector('.pi').textContent, a.classList.contains('live') ? 'live' : a.classList.contains('off') ? 'off' : '?', !!e.querySelector('.bar .dot')]
      : ['web', !!e.querySelector('.bar .dot')];
  }));
  await page.waitForFunction(() => document.querySelectorAll('#stage .bar .ch-av').length === 3);
  assert.deepEqual(await bars(), [['alpha', 'AL', 'K', '?', false], ['tw:bravo', 'BR', 'T', '?', false], ['charlie', 'CH', 'K', '?', false], ['web', true]],
    'initials until there\'s a picture; nothing known about live yet');
  // the live check: a red ring while live, greyed out when offline (channels it doesn't check stay as they are)
  await page.evaluate(() => smvNotes.liveStatus({ alpha: { live: true, checked: Date.now() }, 'tw:bravo': { live: false, checked: Date.now() } }));
  assert.deepEqual((await bars()).map(b => b[3]), ['live', 'off', '?', undefined]);
  // unchanged: the same picture stays (not drawn again)
  await page.evaluate(() => { window.__av = document.querySelector('#stage .bar .bar-av'); });
  await page.evaluate(() => smvNotes.liveStatus({ alpha: { live: true, checked: Date.now() }, 'tw:bravo': { live: false, checked: Date.now() } }));
  assert.equal(await page.evaluate(() => window.__av === document.querySelector('#stage .bar .bar-av')), true);
  // it's part of the dropdown: the name starts after it, and clicking it opens the list, with a picture on each row
  const [av, pick] = await Promise.all([win(page, 'alpha').locator('.bar-av').boundingBox(), win(page, 'alpha').locator('.col-pick').boundingBox()]);
  assert.ok(av.x > pick.x && av.x + av.width < pick.x + 25, 'inside the dropdown\'s left end');
  await page.mouse.click(av.x + av.width / 2, av.y + av.height / 2);
  await page.waitForSelector('.dd-list');
  assert.deepEqual(await page.$$eval('.dd-list button .ch-av', l => l.map(a => a.className)), ['ch-av live', 'ch-av off', 'ch-av']);
  await page.keyboard.press('Escape');
});
