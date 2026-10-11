// Columns and Focus view: scrolling sideways (buttons, strip, scrollbar, mouse wheel), moving whole columns,
// Linked on and off, and the switch control's buttons, drag to swap, side chats and floating panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, box, drag, press } = require('./app');
const { openApp } = setup();

const NAMES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
async function columns(t) {
  const page = await openApp(t);
  await add(page, ...NAMES);
  await press(page, 'c');                        // Columns
  return page;
}
// The channels in the order their columns are shown, left to right (from where their streams are).
const order = page => page.$$eval('#stage .win.stream', els => els.map(e => [e.querySelector('.title').textContent, e.offsetLeft]).sort((a, b) => a[1] - b[1]).map(x => x[0]));
const firstX = page => page.$eval('#stage .win.stream:has(.title)', () => Math.min(...[...document.querySelectorAll('#stage .win.stream')].map(e => e.offsetLeft)));
const settle = page => page.waitForTimeout(700);   // scrolling eases into place

test('Columns: more than fit scroll sideways with the arrows, the strip, the scrollbar and the mouse wheel', async t => {
  const page = await columns(t);
  assert.ok(await page.isVisible('#hscroll'), 'a scrollbar when they don\'t all fit');
  assert.ok(await page.isVisible('#colStrip'), 'and the strip above them');
  const x0 = await firstX(page);
  const colW = await page.$eval('#stage .win.stream', e => e.offsetWidth) + 6;

  await page.click('#colNav [data-d="1"]'); await settle(page);
  assert.ok(Math.abs((x0 - await firstX(page)) - colW) < 3, 'the toolbar arrow moves one column');
  await page.click('#colNav [data-d="-1"]'); await settle(page);
  assert.equal(await firstX(page), x0, 'and back');

  await page.click('#colStrip .cs-btn[data-d="1"]'); await settle(page);
  assert.ok(await firstX(page) < x0, 'the strip\'s arrow');
  await page.selectOption('#colStrip .cs-pick', '0'); await settle(page);
  assert.equal(await firstX(page), x0, 'picking a stream from the strip jumps to it');

  // one page at a time
  await page.click('#colStrip .cs-mode'); await settle(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.pageStep')), '1', 'page steps are remembered');
  await page.click('#colStrip .cs-btn[data-d="1"]'); await settle(page);
  assert.ok(x0 - await firstX(page) > colW * 1.5, 'a page is several columns');
  await page.click('#colStrip .cs-mode');
  await page.selectOption('#colStrip .cs-pick', '0'); await settle(page);

  // the scrollbar: click beside the thumb, or drag it
  const hb = await box(page.locator('#hscroll')), th = await box(page.locator('#hscroll .thumb'));
  await page.mouse.click(hb.x + hb.w - 5, hb.y + hb.h / 2); await settle(page);
  assert.ok(await firstX(page) < x0, 'clicking the bar right of the thumb scrolls right');
  await page.selectOption('#colStrip .cs-pick', '0'); await settle(page);
  await drag(page, { x: th.x + th.w / 2, y: th.y + th.h / 2 }, { x: hb.x + hb.w, y: th.y + th.h / 2 }); await settle(page);
  const end = await firstX(page);
  assert.ok(end < x0 - colW, 'dragging the thumb all the way scrolls to the end');

  // the mouse wheel over a title bar or the strip
  await page.selectOption('#colStrip .cs-pick', '0'); await settle(page);
  const bar = await box(win(page, 'alpha').locator('.bar'));
  await page.mouse.move(bar.x + bar.w / 2, bar.y + 10);
  await page.mouse.wheel(0, 400); await settle(page);
  assert.ok(await firstX(page) < x0, 'the wheel over a title bar scrolls sideways');
  const strip = await box(page.locator('#colStrip'));
  await page.mouse.move(strip.x + 20, strip.y + strip.h / 2);
  const before = await firstX(page);
  await page.mouse.wheel(0, -100); await settle(page);
  assert.ok(await firstX(page) > before, 'over the strip it steps back a column');
});

test('Columns, Linked: drag a column by its title bar to move the stream and its chat together', async t => {
  const page = await columns(t);
  await page.click('#layoutBtn');
  assert.ok(await page.isVisible('#lmLinked'), 'Linked is in the Layout menu\'s options');
  assert.ok(await page.isChecked('#lmLinked'));
  await page.click('#layoutBtn');
  assert.ok(await page.evaluate(() => document.body.classList.contains('linked')), 'linked at first');
  const a = await box(win(page, 'alpha').locator('.bar')), c = await box(win(page, 'charlie').locator('.bar'));
  // grab the bar's left edge (in narrow columns its middle is the channel dropdown)
  await drag(page, { x: a.x + 5, y: a.y + 12 }, { x: c.x + 25, y: c.y + 12 }, { steps: 14 });
  await page.waitForTimeout(500);
  const o = await order(page);
  assert.ok(o.indexOf('alpha') > o.indexOf('bravo'), `alpha moved right (${o.slice(0, 4).join(', ')})`);
  const sx = (await box(win(page, 'alpha'))).x, cx = (await box(win(page, 'alpha', 'chat'))).x;
  assert.equal(sx, cx, 'its chat came along');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.colOrder'))).indexOf('alpha') > 0, true, 'the order is remembered');
  await press(page, 'a');
  await page.click('#layoutBtn');
  assert.equal(await page.isVisible('#lmLinked'), false, 'no Linked outside Columns and Focus view');
  assert.ok(await page.isVisible('#lmAutoFit'), 'Auto layout has its own option');

});

test('Columns, Unlinked: each window moves on its own', async t => {
  const page = await columns(t);
  await page.click('#layoutBtn'); await page.uncheck('#lmLinked'); await page.click('#layoutBtn');
  assert.equal(await page.evaluate(() => document.body.classList.contains('linked')), false, 'unlinked');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.linked')), '0');
  await page.waitForTimeout(400);
  const bb = await box(win(page, 'bravo')), chat0 = await box(win(page, 'bravo', 'chat'));
  await drag(page, { x: bb.x + 5, y: bb.y + 12 }, { x: bb.x + 45, y: bb.y + 112 });
  await page.waitForTimeout(400);                 // windows glide to where they're put
  const nb = await box(win(page, 'bravo'));
  assert.ok(nb.y - bb.y > 60, `unlinked windows move on their own (${JSON.stringify([bb, nb])})`);
  const chat1 = await box(win(page, 'bravo', 'chat'));
  assert.deepEqual([chat1.x, chat1.y], [chat0.x, chat0.y], 'without their chat');
});

test('Focus view: the switch control picks the big stream, swaps by dragging, sets side chats and switches views', async t => {
  const page = await columns(t);
  await press(page, 'f');
  assert.ok(await page.isVisible('#featSwitch'), 'the switch control under the big stream');
  const big = () => page.$eval('#stage .win.stream.featured .title', e => e.textContent);
  assert.equal(await big(), 'alpha');
  await page.click('#featSwitch .fs-item[data-ch=charlie] .fs-name');
  assert.equal(await big(), 'charlie', 'clicking a name makes it big');
  await page.click('#featSwitch .fs-item[data-ch=charlie] .fs-name');
  assert.equal(await page.locator('#stage .win.stream.featured').count(), 0, 'clicking the big one again puts it back');
  await press(page, 'f');

  // drag one entry onto another: they swap places
  const names = () => page.$$eval('#featSwitch .fs-item', l => l.map(x => x.dataset.ch));
  const before = await names();
  const it = await box(page.locator(`#featSwitch .fs-item[data-ch=${before[1]}] .fs-name`)), to = await box(page.locator(`#featSwitch .fs-item[data-ch=${before[3]}]`));
  await drag(page, { x: it.x + 10, y: it.y + it.h / 2 }, { x: to.x + to.w / 2, y: to.y + to.h / 2 }, { steps: 12 });
  await page.waitForTimeout(300);
  const after = await names();
  assert.deepEqual([after[1], after[3]], [before[3], before[1]], 'dragged onto another, they swap');

  // side chats: how many columns beside the big stream
  const sideW = () => page.$eval('#stage .win.chat:not(.featured)', e => e.offsetWidth);
  await page.selectOption('#featSwitch .fs-side select', '1'); await page.waitForTimeout(400);   // windows animate to their new size
  const one = await sideW();
  await page.selectOption('#featSwitch .fs-side select', '3'); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.sideCols')), '3', 'remembered');
  assert.ok(await sideW() < one - 60, 'three side columns are narrower than one');
  const bigW = () => page.$eval('#stage .win.stream.featured', e => e.offsetWidth);
  const b3 = await bigW();
  await page.selectOption('#featSwitch .fs-side select', '1'); await page.waitForTimeout(400);
  assert.ok(await bigW() > b3, 'and the big stream is bigger with fewer');

  // refresh and remove from the switch control
  const fr = win(page, after[2]).locator('iframe');
  await fr.evaluate(f => { f.src = 'about:blank'; });
  await page.click(`#featSwitch .fs-item[data-ch=${after[2]}] .fs-rl`);
  assert.notEqual(await fr.getAttribute('src'), 'about:blank', 'refresh reloads it');
  await page.click(`#featSwitch .fs-item[data-ch=${after[4]}] .fs-x`);
  assert.equal(await win(page, after[4]).count(), 0, '× removes its stream');
  assert.equal(await win(page, after[4], 'chat').count(), 0, 'and chat');
  assert.ok(await page.isVisible('#toast'), 'with a few seconds to undo');
  await page.click('#toast button');
  await page.waitForTimeout(300);
  assert.equal(await win(page, after[4]).count(), 1, 'Undo brings it back');

  // the view buttons
  await page.click('#featSwitch .fs-tocols');
  assert.equal(await page.locator('#stage .win.featured').count(), 0, 'Columns view: nothing big');
  await press(page, 'f');
  assert.ok(await page.locator('#stage .win.stream.featured').count(), 'Focus view again');
  await page.click('#featSwitch .fs-tocf');
  assert.equal(await page.evaluate(() => document.body.classList.contains('cols')), false, 'Chat focus view');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), 'chatfocus');
});

test('the switch control floats: move it by its handle, resize it, and dock it again', async t => {
  const page = await columns(t);
  await press(page, 's');                        // switch control on, floating
  const fs = page.locator('#featSwitch');
  assert.ok(await fs.evaluate(e => e.classList.contains('floating')));
  const b0 = await box(fs), grip = await box(page.locator('#featSwitch .fs-grip')), st = await box(page.locator('#stage'));
  // toward the middle of the stage, so it isn't stopped by an edge
  const dx = b0.x + b0.w / 2 > st.x + st.w / 2 ? -150 : 150, dy = b0.y + b0.h / 2 > st.y + st.h / 2 ? -80 : 80;
  await drag(page, { x: grip.x + grip.w / 2, y: grip.y + grip.h / 2 }, { x: grip.x + grip.w / 2 + dx, y: grip.y + grip.h / 2 + dy });
  const b1 = await box(fs);
  assert.deepEqual([b1.x - b0.x, b1.y - b0.y], [dx, dy], 'moved by its handle');
  // floating in plain Columns it offers Focus view
  await page.click('#featSwitch .fs-tofocus');
  assert.ok(await page.locator('#stage .win.stream.featured').count(), 'Focus view from the floating panel');
  const rz = await box(page.locator('#fsResize'));
  const b1b = await box(fs);
  await drag(page, { x: rz.x + rz.w / 2, y: rz.y + rz.h / 2 }, { x: rz.x + rz.w / 2 - 80, y: rz.y + rz.h / 2 - 60 });
  const b2 = await box(fs);
  assert.deepEqual([b2.w - b1b.w, b2.h - b1b.h], [-80, -60], 'resized from its corner');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.switchRect')));
  assert.deepEqual([saved.w, saved.h], [b2.w, b2.h], 'size and place are remembered');
  // the Layout menu has the same choices
  await page.click('#layoutBtn'); await page.click('#swModes [data-sw=dock]');
  assert.equal(await fs.evaluate(e => e.classList.contains('floating')), false, 'Layout menu: Docked');
  await page.click('#layoutBtn'); await page.click('#swModes [data-sw=float]');
  assert.ok(await fs.evaluate(e => e.classList.contains('floating')), 'Layout menu: Floating');
  await page.click('#featSwitch .fs-mdock');
  assert.equal(await fs.evaluate(e => e.classList.contains('floating')), false, 'docked');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.switchMode')), 'dock');
});
