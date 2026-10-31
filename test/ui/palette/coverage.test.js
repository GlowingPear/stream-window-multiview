// Every button in the app that does something is also in the search box (Ctrl/⌘+K, #184): it carries the id of
// its command (data-cmd), or sits in a part whose controls are all commands as they show (data-cmds: Game focus's
// bar, the switch control's head…). Each part of the app is opened in turn, and any visible button, tab or control
// (a switch, slider, list or box: a Settings option) without one fails, unless it's on the short list in coverage.js,
// each with why. (The desktop app's own parts: in
// test/launch/palette/coverage.test.js.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add } = require('../app');
const { openApp } = setup();
const { check } = require('./coverage');

test('every visible button and tab has a command in the search box, in every part of the app', async t => {
  // something remembered, so Settings › Search box lists it (each row with its ×) and the box shows Recent
  const page = await openApp(t, { init: () => { try { localStorage.setItem('kickMultiview.palette', JSON.stringify({ recent: ['settings.general', 'settings.themes'], used: {} })); } catch {} } });
  const seen = new Map();
  await check(page, 'the welcome screen', seen);
  // the toolbar on top, its menus and panels
  await add(page, 'alpha', 'tw:bravo');
  await check(page, 'two channels open', seen);
  await page.click('#layoutBtn');
  for (const tab of ['layouts', 'switch', 'toolbar']){ await page.click(`#layoutMenu .lm-tabs [data-t=${tab}]`); await check(page, 'Layout menu › ' + tab, seen); }
  await page.keyboard.press('Escape');
  await page.click('#savedBtn'); await check(page, 'Channels', seen);
  await page.click('#spMore'); await check(page, 'Channels ⋯', seen);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.click('#bellBtn'); await check(page, 'the bell', seen);
  await page.keyboard.press('Escape');
  // each Settings page, and each tab inside it
  const panes = await page.$$eval('#settingsDlg .st-rail button[data-s]', bs => bs.filter(b => !b.hidden).map(b => b.dataset.s));
  for (const s of panes){
    await page.evaluate(s => window.openSettings(s), s);
    await page.waitForTimeout(100);
    await check(page, 'Settings › ' + s, seen);
    for (const sub of await page.$$eval(`#settingsDlg .st-pane[data-s="${s}"] .st-tabs button[data-t]`, bs => bs.filter(b => b.checkVisibility()).map(b => b.dataset.t))){
      await page.click(`#settingsDlg .st-pane[data-s="${s}"] .st-tabs button[data-t="${sub}"]`);
      await check(page, `Settings › ${s} › ${sub}`, seen);
    }
  }
  await page.keyboard.press('Escape');
  // the layouts, each with its own controls
  for (const l of ['focus', 'columns', 'chatfocus', 'stage', 'rail', 'auto', 'tile', 'game']){
    await page.click('#layoutBtn'); await page.click(`#layoutMenu [data-l=${l}]`); await page.waitForTimeout(300);
    await check(page, 'layout ' + l, seen);
  }
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-l=focus]');
  await page.evaluate(() => document.querySelector('#swModes [data-sw=float]').click()); await page.waitForTimeout(200);
  await check(page, 'the floating switch control', seen);
  await page.evaluate(() => window.blowUpChat('alpha')); await page.waitForTimeout(200);
  await check(page, 'a blown-up chat', seen);
  await page.keyboard.press('Escape');
  // the toolbar on the left
  await page.click('#layoutBtn'); await page.click('#layoutMenu .lm-tabs [data-t=toolbar]'); await page.click('#layoutMenu [data-tbv=left]');
  await page.keyboard.press('Escape');
  await check(page, 'the toolbar on the left', seen);
  // Linked channels on: a window with a tab per site, its tab menu and +, the Channels row and its accounts,
  // Settings › Linked channels' tabs and the Link channels card
  await page.evaluate(() => { window.linkedApi.setOn(true); window.linkedApi.link('alpha', 'tw:alpha'); window.smvNotes.liveStatus({ alpha: { live: true, checked: Date.now() }, 'tw:alpha': { live: true, checked: Date.now() } }); });
  await page.evaluate(() => { localStorage.setItem('kickMultiview.saved', JSON.stringify(['alpha', 'tw:alpha'])); window.frames_.openStreamer('alpha', 'both'); });
  await page.waitForTimeout(300);
  await check(page, 'a window with tabs', seen);
  await page.click('#stage .win.stream:not(.tab-hidden) .ptab.twitch', { button: 'right' }); await check(page, 'the tab menu', seen);
  await page.keyboard.press('Escape');
  // ALL in its chat, and the menus its title bar's buttons open there (which site's)
  await page.evaluate(() => window.allChat.setAll(window.openWins().find(w => w.kind === 'chat' && !w.hiddenTab), true));
  await page.waitForSelector('.all-view');
  await check(page, 'ALL', seen);
  for (const a of ['pop', 'popchat', 'star']){
    await page.$eval(`#stage .win.chat:not(.tab-hidden) [data-a=${a}]`, b => b.click()); await check(page, `ALL's ${a} menu`, seen);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => window.allChat.setAll(window.openWins().find(w => w.kind === 'chat' && !w.hiddenTab), false));
  await page.evaluate(() => window.openSettings('linked'));
  for (const sub of ['tabs', 'playing', 'live', 'sugs', 'linked']){ await page.click(`#laTabs [data-t=${sub}]`); await check(page, 'Settings › Linked channels › ' + sub, seen); }
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.openLinkCard('alpha')); await check(page, 'the Link channels card', seen);
  await page.keyboard.press('Escape');
  assert.deepEqual([...seen].map(([u, part]) => `${u} (${part})`), [], 'buttons without a command');
});
