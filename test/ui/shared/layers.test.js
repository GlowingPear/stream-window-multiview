// Dialogs and menus over a dialog (src/page/shared/layers.js): whatever opens while Settings is open is drawn above
// it. Every dialog (.dlg-bg) and every menu that closes on an outside press ([data-outside], shared/popover.js) the
// page has, so a new one is checked without changing this test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// For each one: shown over Settings, is it what you see at its middle? (its name, or why not)
const overSettings = page => page.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const name = el => el.id ? '#' + el.id : el.className.split(' ').map(c => '.' + c).join('');
  const all = [...document.querySelectorAll('.dlg-bg, [data-outside]')].filter(el => el.id !== 'settingsDlg' && el.hidden);
  const res = { checked: [], under: [] };
  for (const el of all) {
    el.hidden = false; await frame();
    const box = (el.matches('.dlg-bg') && el.querySelector('.dlg')) || el, r = box.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 2), innerWidth - 2), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 20), 2), innerHeight - 2);
    if (r.width && r.height && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) {
      const at = document.elementFromPoint(x, y);
      (el.contains(at) ? res.checked : res.under).push(name(el) + (el.contains(at) ? '' : ' (under ' + (at && (at.closest('[id]') || at).id) + ')'));
    }
    el.hidden = true; await frame();
  }
  return res;
});

test('every dialog and every menu that closes on an outside press, shown while Settings is open, is drawn above it', async t => {
  const page = await openApp(t);
  await page.evaluate(() => window.openSettings());
  await page.waitForSelector('#settingsDlg:not([hidden])');
  const { checked, under } = await overSettings(page);
  assert.deepEqual(under, [], 'none under Settings');
  assert.ok(checked.length >= 10, 'they were checked: ' + checked.join(', '));
  assert.ok(checked.includes('#linkDlg') && checked.includes('#askDlg'), checked.join(', '));
});

test('Settings › Linked channels: Edit on a linked streamer opens their card above Settings', async t => {
  const streamers = [{ id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala'] }];
  const set = { saved: JSON.stringify(['quietkoala', 'tw:quietkoala']), streamers: JSON.stringify(streamers), linkedOn: '1', linkedTip: '1', intro: JSON.stringify({ done: true, tips: true }) };
  const page = await openApp(t, { init: `if (window === top) for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v);` });
  await page.evaluate(() => window.openSettings());
  await page.click('.st-rail [data-s=linked]');
  await page.click('#laTabs [data-t=linked]');
  await page.click('#settingsDlg [data-cmd="link.edit:s1"]');
  await page.waitForSelector('#linkDlg:not([hidden]) .link-card');
  const r = await page.locator('#linkDlg .link-card').boundingBox();
  assert.equal(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#linkDlg'), [r.x + r.width / 2, r.y + 20]), true, 'the card, not Settings, is on top');
  await page.click('#linkDlg .link-card', { position: { x: r.width / 2, y: 20 } });   // and it takes clicks
});
