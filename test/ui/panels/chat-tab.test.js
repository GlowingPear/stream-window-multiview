// Settings > Chat (#137): every chat setting in one page, moved out of General and Layouts with the same saved settings,
// in tabs (#189: Chat box, Messages, Emotes, Translation). (Chat text size, Highlight new emotes and the Messages tab
// need the desktop app: the launch tests check them there.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// each tab shown, with the settings it shows: [['Chat box', ['chatNameSet']], …]
const shown = page => page.$$eval('#chatTabs button', tabs => tabs.filter(b => !b.hidden).map(b => {
  b.click();
  const rows = [...document.querySelectorAll('#settingsDlg [data-s=chat] .st-row:not([hidden])')].filter(e => e.offsetParent);
  return [b.textContent, rows.map(e => (e.querySelector('input[type=checkbox]') || {}).id || e.id)];
}));

test('Settings > Chat: after Layouts, every chat setting in its tab; General and Layouts no longer have them', async t => {
  const page = await openApp(t);
  await page.click('#settingsBtn');
  const rail = await page.$$eval('#settingsDlg .st-rail button', l => l.filter(b => !b.hidden).map(b => b.dataset.s));
  assert.equal(rail[rail.indexOf('layouts') + 1], 'chat', 'right after Layouts');
  assert.ok(await page.$eval('#settingsDlg .st-rail [data-s=chat] svg', s => !!s), 'with its icon');
  await page.click('#settingsDlg .st-rail [data-s=chat]');
  assert.equal(await page.textContent('#settingsDlg [data-s=chat] h4'), 'Chat');
  assert.deepEqual(await shown(page), [['Chat box', ['chatNameSet']], ['Emotes', ['emoteSet']], ['Translation', ['trAllSet']]], 'Messages and Chat bots only in the desktop app');
  assert.deepEqual(await page.$$eval('#chatTabs button', l => l.map(b => b.textContent)), ['Chat box', 'Messages', 'Emotes', 'Translation', 'Chat bots']);
  // one tab at a time
  await page.click('#chatTabs [data-t=box]');
  assert.deepEqual(await page.$$eval('#settingsDlg [data-s=chat] .st-subpane', l => l.filter(p => !p.hidden).map(p => p.dataset.t)), ['box']);
  assert.ok(await page.$eval('#chatTabs [data-t=box]', b => b.classList.contains('on')));
  // the channel name's text shows with it, as before
  await page.check('#chatNameSet');
  assert.ok(await page.isVisible('#chatNameRow'));
  // Emote preview: one row, its example inside it
  assert.equal(await page.locator('#settingsDlg [data-s=chat] .st-row:has(#emoteSet) #emoteExample').count(), 1);
  assert.equal(await page.locator('.st-row.st-ex').count(), 0, 'no separate Example row');
  // moved, not copied
  for (const id of ['chatNameSet', 'emoteSet', 'newEmoteSet', 'trAllSet', 'emoteSample', 'emoteExample', 'lyZoom'])
    assert.ok(await page.locator(`#settingsDlg [data-s=general] #${id}, #settingsDlg [data-s=layouts] #${id}`).count() === 0, `${id} only in Chat`);
  // it opens on Chat next time
  await page.keyboard.press('Escape');
  await page.reload();
  await page.click('#settingsBtn');
  assert.ok(await page.isVisible('#settingsDlg [data-s=chat]'), 'remembered');
});

test('Settings > Chat: each switch saves the same setting as before, and reads it back', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings('chat', { sub: 'emotes' }));
  await page.locator('label[for=emoteSet]').click();
  await page.click('#chatTabs [data-t=translate]');
  await page.locator('label:has(#trAllSet)').click();
  await page.click('#chatTabs [data-t=box]');
  await page.check('#chatNameSet');
  const saved = () => page.evaluate(() => ['emotePreview', 'translateAll', 'chatName'].map(k => localStorage.getItem('kickMultiview.' + k)));
  assert.deepEqual(await saved(), ['1', '1', '1']);
  await page.reload();
  await page.evaluate(() => window.openSettings('chat'));
  assert.deepEqual(await page.evaluate(() => ['emoteSet', 'trAllSet', 'chatNameSet'].map(id => document.getElementById(id).checked)), [true, true, true]);
  // the same row's name and switch, both ways
  await page.click('#chatTabs [data-t=emotes]');
  await page.locator('label[for=emoteSet]').click();
  assert.equal(await page.isChecked('#emoteSet'), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), '0');
});
