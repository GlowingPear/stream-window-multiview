// Every button the desktop app shows has a command in the search box too (#184): the parts a browser doesn't have,
// opened in the real app: the Logins menu, Streamer profiles, All notifications at each tab, every Settings page and
// tab (Accounts, Connected apps, YouTube, Extensions, Mentions, Spam alerts, Updates, Developer…), and a window's ⋯
// menu. The same check and short list as test/ui/palette/coverage.test.js.
const test = require('node:test');
const { launchApp, assert, openChannel } = require('../app');
const { check } = require('../../ui/palette/coverage');

let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await openChannel(a.win, 'tw:bravo');
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

test('every visible button and tab in the desktop app\'s own parts has a command', { timeout: 120000 }, async () => {
  const w = a.win, seen = new Map();
  await check(w, 'two channels open', seen);
  await w.click('#loginBtn'); await w.waitForTimeout(200); await check(w, 'Logins', seen); await w.keyboard.press('Escape');
  await w.click('#savedBtn'); await w.click('#spMore'); await check(w, 'Channels ⋯', seen); await w.keyboard.press('Escape'); await w.keyboard.press('Escape');
  await w.click('#profBtn'); await w.waitForTimeout(300); await check(w, 'Streamer profiles', seen);
  await w.evaluate(() => window.openProfile('alpha')); await w.waitForTimeout(500); await check(w, 'a streamer\'s profile', seen);
  await w.keyboard.press('Escape');
  await w.evaluate(() => window.openNoteHistory('all'));
  for (const t of ['all', 'mentions', 'spam', 'live', 'app']){ await w.click(`#noteDlg .nc-tabs [data-tab=${t}]`); await check(w, 'All notifications › ' + t, seen); }
  await w.keyboard.press('Escape');
  const panes = await w.$$eval('#settingsDlg .st-rail button[data-s]', bs => bs.filter(b => !b.hidden).map(b => b.dataset.s));
  for (const s of panes){
    await w.evaluate(s => window.openSettings(s), s);
    await w.waitForTimeout(150);
    await check(w, 'Settings › ' + s, seen);
    for (const sub of await w.$$eval(`#settingsDlg .st-pane[data-s="${s}"] .st-tabs button[data-t]`, bs => bs.filter(b => b.checkVisibility()).map(b => b.dataset.t))){
      await w.click(`#settingsDlg .st-pane[data-s="${s}"] .st-tabs button[data-t="${sub}"]`);
      await w.waitForTimeout(100);
      await check(w, `Settings › ${s} › ${sub}`, seen);
    }
  }
  await w.keyboard.press('Escape');
  // a window's ⋯ menu: what didn't fit on its bar (each one the bar's button, a command of the window's)
  await w.evaluate(() => { const b = document.querySelector('#stage .win.stream [data-a=more]'); b.hidden = false; b.click(); });
  await check(w, 'a window\'s ⋯ menu', seen);
  assert.deepEqual([...seen].map(([u, part]) => `${u} (${part})`), [], 'buttons without a command');
});
