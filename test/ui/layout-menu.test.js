// The Layout menu's tabs (#103): Layouts, Switch control and Toolbar, as in Settings > Layouts. With the toolbar at
// the top, on the left, and on the left with icons only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add } = require('./app');
const { openApp } = setup();

// (it also runs in the stream windows' frames, where there's no localStorage)
const initBar = bar => `try { localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(bar))}) } catch {}`;
const BARS = [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }];
const nameOf = bar => bar.pos === 'top' ? 'at the top' : bar.labels ? 'on the left' : 'on the left, icons only';
const tab = (page, t) => page.click(`#layoutMenu .lm-tabs [data-t=${t}]`);
const shown = page => page.$$eval('#layoutMenu .lm-pane', ps => ps.filter(p => getComputedStyle(p).visibility === 'visible').map(p => p.dataset.t));

for (const bar of BARS) {
  test(`toolbar ${nameOf(bar)}: the menu has Settings' three tabs on one line, opens on Layouts, and each tab shows only its part`, async t => {
    const page = await openApp(t, { init: initBar(bar) });
    await add(page, 'alpha', 'bravo');
    await page.click('#layoutBtn');
    const tabs = await page.$$eval('#layoutMenu .lm-tabs [role=tab]', bs => bs.map(b => ({ t: b.textContent, top: Math.round(b.getBoundingClientRect().top), sel: b.getAttribute('aria-selected') })));
    assert.deepEqual(tabs.map(x => x.t), await page.$$eval('#lyTabs [role=tab]', bs => bs.map(b => b.textContent)), 'the same tabs as Settings, in its order');
    assert.deepEqual(tabs.map(x => x.t), ['Layouts', 'Switch control', 'Toolbar']);
    assert.equal(new Set(tabs.map(x => x.top)).size, 1, 'on one line');
    assert.deepEqual(tabs.map(x => x.sel), ['true', 'false', 'false'], 'opens on Layouts');
    assert.equal(await page.getAttribute('#layoutMenu .lm-tabs', 'role'), 'tablist');
    // Settings' tab style as it is: left-aligned, each as wide as its name, the accent line under the open one
    const style = sel => page.$eval(sel, b => { const c = getComputedStyle(b); return { fs: c.fontSize, fw: c.fontWeight, pad: c.padding, bb: c.borderBottomWidth, radius: c.borderTopLeftRadius }; });
    await page.evaluate(() => { document.querySelector('#settingsDlg').hidden = false; });
    const want = await style('#lyTabs [data-t=layouts]');
    await page.evaluate(() => { document.querySelector('#settingsDlg').hidden = true; });
    assert.deepEqual(await style('#layoutMenu .lm-tabs [data-t=layouts]'), want);
    const [first, menu] = await page.evaluate(() => [document.querySelector('#layoutMenu .lm-tabs button').getBoundingClientRect().left, document.querySelector('#layoutMenu .lm-tabs').getBoundingClientRect().left]);
    assert.ok(first - menu < 2, 'left-aligned');
    assert.equal(await page.$eval('#layoutMenu .lm-tabs .on', b => getComputedStyle(b).borderBottomColor), await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim() === '#53fc18' ? 'rgb(83, 252, 24)' : ''));

    // Layouts: the pictures, the hint, Options and Your layouts
    assert.deepEqual(await shown(page), ['layouts']);
    for (const sel of ['.lm-grid', '#lmHint', '#presetList', '#presetName']) assert.ok(await page.isVisible(`#layoutMenu .lm-pane[data-t=layouts] ${sel}`), sel);
    assert.equal(await page.locator('#layoutMenu .lm-pane[data-t=layouts] #lmOpts').count(), 1, 'the layout\'s Options are there too');
    assert.equal(await page.locator('#layoutMenu .lm-sec:text-is("Switch control"), #layoutMenu .lm-sec:text-is("Toolbar")').count(), 0, 'no section headings for them');
    // Switch control: its cards, one per row, a tick on the one in use
    await tab(page, 'switch');
    assert.deepEqual(await shown(page), ['switch']);
    const sw = await page.$$eval('#swModes [data-sw]', bs => bs.map(b => ({ name: b.querySelector('b').textContent, desc: b.querySelector('.lc-t span').textContent, ico: !!b.querySelector('.lc-ico svg'), top: b.getBoundingClientRect().top })));
    assert.deepEqual(sw.map(x => x.name), ['Docked', 'Floating'], '(Own window is for the desktop app)');
    assert.ok(sw.every(x => x.desc && x.ico) && sw[0].top < sw[1].top, JSON.stringify(sw));
    assert.equal(await page.$$eval('#swModes [aria-checked=true]', bs => bs.length), 1);
    // Toolbar: its three cards
    await tab(page, 'toolbar');
    assert.deepEqual(await shown(page), ['toolbar']);
    assert.deepEqual(await page.$$eval('#layoutMenu [data-tbv] b', bs => bs.map(b => b.textContent)), ['Top', 'Left', 'Left, icons only']);
    // what isn't shown can't be reached with Tab
    assert.equal(await page.$eval('#layoutMenu .lm-pane[data-t=layouts]', p => p.inert), true);
    // opened again: Layouts
    await page.keyboard.press('Escape');
    await page.click('#layoutBtn');
    assert.deepEqual(await shown(page), ['layouts']);
  });

  test(`toolbar ${nameOf(bar)}: the menu is the same height on every tab, and inside the window`, async t => {
    const page = await openApp(t, { init: initBar(bar) });
    await add(page, 'alpha', 'bravo');
    await page.click('#layoutBtn');
    const hs = [];
    for (const t2 of ['layouts', 'switch', 'toolbar', 'layouts']) {
      await tab(page, t2);
      const r = await page.$eval('#layoutMenu', m => { const b = m.getBoundingClientRect(); return { h: Math.round(b.height), y: Math.round(b.top), bottom: Math.round(b.bottom) }; });
      hs.push(r.h);
      assert.ok(r.y >= 0 && r.bottom <= 900, JSON.stringify(r));
    }
    assert.equal(new Set(hs).size, 1, JSON.stringify(hs));
    assert.equal(await page.$eval('#layoutMenu', m => m.scrollHeight <= m.clientHeight), true, 'no scrolling on a normal window');
  });
}

test('the tabs and the keyboard: arrows move between them, Home and End go to the ends', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await page.click('#layoutBtn');
  await page.focus('#layoutMenu .lm-tabs [data-t=layouts]');
  const at = () => page.evaluate(() => [document.activeElement.dataset.t, document.querySelector('#layoutMenu .lm-tabs .on').dataset.t]);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await at(), ['switch', 'switch']);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await at(), ['layouts', 'layouts'], 'round to the first');
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await at(), ['toolbar', 'toolbar']);
  await page.keyboard.press('Home');
  assert.deepEqual(await at(), ['layouts', 'layouts']);
  await page.keyboard.press('End');
  assert.deepEqual(await at(), ['toolbar', 'toolbar']);
  assert.deepEqual(await page.$$eval('#layoutMenu .lm-tabs [role=tab]', bs => bs.map(b => b.tabIndex)), [-1, -1, 0], 'only the open tab is in the Tab order');
  // Settings' tabs work the same way
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.openSettings('layouts'));
  await page.focus('#lyTabs [data-t=layouts]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.querySelector('#lyTabs .on').dataset.t), 'switch');
  assert.equal(await page.isVisible('#lySw'), true);
});

test('⚙ opens Settings > Layouts on the menu\'s tab', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  for (const t2 of ['switch', 'toolbar', 'layouts']) {
    await page.click('#layoutBtn');
    await tab(page, t2);
    await page.click('#layoutSet');
    assert.equal(await page.isVisible('#layoutMenu'), false);
    assert.equal(await page.evaluate(() => document.querySelector('#settingsDlg .st-rail .on, #settingsDlg .st-rail [aria-current]')?.dataset.s), 'layouts');
    assert.equal(await page.evaluate(() => document.querySelector('#lyTabs .on').dataset.t), t2);
    assert.equal(await page.isVisible(`#settingsDlg [data-s=layouts] .st-subpane[data-t=${t2}]`), true);
    await page.keyboard.press('Escape');
  }
});

for (const bar of BARS) {
  test(`toolbar ${nameOf(bar)}: each toolbar card in the menu changes it straight away; the menu stays open beside the new toolbar`, async t => {
    const page = await openApp(t, { init: initBar(bar) });
    await add(page, 'alpha', 'bravo');
    await page.click('#layoutBtn');
    await tab(page, 'toolbar');
    const want = { top: { pos: 'top', labels: bar.labels !== false }, left: { pos: 'left', labels: true }, icons: { pos: 'left', labels: false } };
    for (const v of ['icons', 'top', 'left', 'top', 'icons']) {
      const before = JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.toolbar') || '{"labels":true}'));
      await page.click(`#layoutMenu [data-tbv=${v}]`);
      await page.waitForTimeout(400);                      // the toolbar slides to its new width
      const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.toolbar')));
      assert.deepEqual(stored, v === 'top' ? { pos: 'top', labels: before.labels !== false } : want[v], `${v}: stored as { pos, labels }`);
      assert.equal(await page.evaluate(() => document.body.classList.contains('bar-left')), v !== 'top');
      assert.equal(await page.evaluate(() => document.body.classList.contains('bar-icons')), v === 'icons');
      assert.equal(await page.isVisible('#layoutMenu'), true, `${v}: still open`);
      assert.equal(await page.getAttribute(`#layoutMenu [data-tbv=${v}]`, 'aria-checked'), 'true');
      assert.deepEqual(await shown(page), ['toolbar'], 'on its Toolbar tab');
      const [m, h] = await page.evaluate(() => [document.querySelector('#layoutMenu').getBoundingClientRect(), document.querySelector('header').getBoundingClientRect()].map(r => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom })));
      if (v === 'top') assert.ok(m.y >= h.bottom, `below the top bar: ${JSON.stringify([m, h])}`);
      else assert.ok(m.x >= h.right, `beside the column: ${JSON.stringify([m, h])}`);
    }
  });
}
