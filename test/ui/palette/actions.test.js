// The search box's actions (#184) do what their buttons and keys do: layouts, muting and refreshing every stream,
// Lock layout, Do not disturb, a theme, hiding the toolbar, undo, Settings' pages, the Channels panel's tabs, the
// toolbar's place, Close every window (asking first), the switch control, the bell; and Pear Drops' only with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, windows } = require('../app');
const { openApp } = setup();

const K = 'ControlOrMeta+k';
// runs the first row for the words, as Enter does
async function run(page, text, how = 'Enter'){
  await page.keyboard.press(K);
  await page.fill('#palQ', ''); await page.type('#palQ', text); await page.waitForTimeout(60);
  await page.keyboard.press(how);
  await page.waitForTimeout(150);
}
const first = async (page, text) => { await page.keyboard.press(K); await page.fill('#palQ', text); await page.waitForTimeout(60); const r = await page.evaluate(() => window.palette.rows()); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); return r; };

test('each layout, as its picture in the Layout menu does', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  for (const [words, l] of [['chat stage', 'stage'], ['chat rail', 'rail'], ['tile', 'tile'], ['auto layout', 'auto'], ['chat focus', 'chatfocus'], ['game focus', 'game']]){
    await run(page, words);
    assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.lastLayout')), l, words);
  }
  await run(page, 'columns');
  assert.equal(await page.evaluate(() => document.querySelector('#stage').classList.contains('cols') || localStorage.getItem('kickMultiview.cols')), '1');
  await run(page, 'focus view');
  assert.equal((await windows(page)).some(w => w.featured), true, 'one stream big');
});

test('Mute / Unmute every stream, Refresh every stream, Lock layout, Pause all except focus', async t => {
  const page = await openApp(t);
  await add(page, 'alpha', 'bravo');
  await run(page, 'unmute every');
  assert.deepEqual(await page.evaluate(() => window.mutedStreams()), []);
  await run(page, 'mute every stream');
  assert.deepEqual(await page.evaluate(() => window.mutedStreams()), ['alpha', 'bravo']);
  await run(page, 'refresh every');
  assert.match(await page.textContent('#msg'), /Refreshing every stream/);
  await run(page, 'lock layout');
  assert.equal(await page.getAttribute('#layoutLock', 'aria-pressed'), 'true');
  await page.keyboard.press('Enter');     // (a switch: the box stayed open) again: off
  assert.equal(await page.getAttribute('#layoutLock', 'aria-pressed'), 'false');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await run(page, 'pause all except focus');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.focusOnly')), '1');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
});

test('Do not disturb for a while and off; a theme; hiding and showing the toolbar; undo', async t => {
  const page = await openApp(t);
  await run(page, 'do not disturb: 30');
  assert.equal(await page.evaluate(() => window.smvNotes.dndOn()), true);
  assert.ok(await page.evaluate(() => window.smvNotes.dndUntil - Date.now() > 29 * 60000));
  await run(page, 'turn off do not');
  assert.equal(await page.evaluate(() => window.smvNotes.dndOn()), false);
  await run(page, 'theme: ocean');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.theme')).name), 'Ocean');
  assert.match(await page.textContent('#themeVars'), /--accent:#3fb6ff/);
  await run(page, 'dark mode');                 // (other names: a theme by light or dark)
  await run(page, 'hide the toolbar');
  assert.equal(await page.evaluate(() => document.body.classList.contains('focus')), true);
  await run(page, 'show the toolbar');
  assert.equal(await page.evaluate(() => document.body.classList.contains('focus')), false);
  await add(page, 'alpha');
  await page.waitForTimeout(1400);          // (undo history records changes after a short pause)
  await page.click('#stage .win.stream [data-a=close]');
  await page.waitForTimeout(1400);
  await run(page, 'undo');
  assert.ok((await windows(page)).some(w => w.kind === 'stream'), 'the stream is back');
});

test('Settings\' pages and tabs; the Channels panel at a site; the toolbar on the left; the switch control floating; the bell at a tab', async t => {
  const page = await openApp(t);
  await run(page, 'settings › themes');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=themes]'), true);
  await page.keyboard.press('Escape');
  await run(page, 'layouts › switch control');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=layouts] .st-subpane[data-t=switch]'), true, 'at the tab');
  await page.keyboard.press('Escape');
  await run(page, 'channels: twitch');
  assert.equal(await page.isVisible('#savedPanel'), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.savedTab')), 'twitch');
  await page.keyboard.press('Escape');
  await run(page, 'toolbar: left, icons');
  assert.equal(await page.evaluate(() => document.body.classList.contains('bar-icons')), true);
  await run(page, 'toolbar: top');
  assert.equal(await page.evaluate(() => document.body.classList.contains('bar-left')), false);
  await add(page, 'alpha');
  await run(page, 'switch control: floating');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.switchMode')), 'float');
  await run(page, 'bell: live');
  assert.equal(await page.isVisible('#bellPanel'), true);
  assert.equal(await page.getAttribute('#bellPanel .nc-tabs .on', 'data-tab'), 'live');
  await page.keyboard.press('Escape');
  await run(page, 'layout menu: toolbar');
  assert.equal(await page.isVisible('#layoutMenu'), true);
  assert.equal(await page.getAttribute('#layoutMenu .lm-tabs .on', 'data-t'), 'toolbar');
});

test('Close every window asks first, as its button does; a greyed one (nothing open) says why', async t => {
  const page = await openApp(t);
  await run(page, 'close every window');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true);
  assert.match(await page.textContent('#palBg .pal-foot'), /Nothing open/);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await add(page, 'alpha');
  await run(page, 'close every window');
  assert.equal(await page.isVisible('#askDlg'), true);
  await page.click('#askDlg .ask-yes');
  assert.deepEqual(await windows(page), []);
});

test('Pear Drops\' daily reward and farming are there only while their toolbar buttons are (while it\'s connected)', async t => {
  const page = await openApp(t);
  assert.deepEqual((await first(page, 'daily reward')).filter(r => r.group === 'Pear Drops'), [], 'without Pear Drops: as if it didn\'t exist');
  assert.deepEqual((await first(page, 'farming')).filter(r => r.group === 'Pear Drops'), []);
  await page.evaluate(() => { const b = document.querySelector('#rewardBtn'); b.hidden = false; window.claimed = 0; b.onclick = () => window.claimed++; });
  assert.deepEqual((await first(page, 'daily reward')).filter(r => r.group === 'Pear Drops').map(r => r.title), ['Daily reward: claim']);
  await run(page, 'daily reward');
  assert.equal(await page.evaluate(() => window.claimed), 1, 'it does what the chest does');
});
