// Connected apps in the real desktop app, with Grapevine's stand-in Pear Drops in a folder of the test's own (never
// the real one): Kick stream players sign out while it farms and back in after the wait, chats stay signed in,
// Pear Drops hears it, Test, the widget, the locked Kick chip in Logins, the Activity log, and Disconnect.
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, winSel, assert, openChannel } = require('../app');
const { standInPeer } = require('@streamorchard/grapevine/stand-in-peer');
const { memoryKeyStore, paths } = require('@streamorchard/grapevine');

const T = { timeout: 90000 };
const PD = 'com.streamorchard.peardrops';
const GV = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-gv-'));
const FAST = { pollMs: 100, backoffMs: [100] };
const peerKeys = memoryKeyStore();          // the stand-in's pairing, kept when it's started again
let a, peer, heard = [], shown = 0;

async function startPeer() {
  peer = await standInPeer({ as: PD, dir: GV, version: '0.1.6', provides: { 'drops.farming': '1.0' }, uses: { players: '1.0' }, keys: peerKeys, timing: FAST });
  peer.link.on('event', (from, name, params) => { if (name === 'players.changed') heard.push(params.platforms.kick); });
  peer.link.handle('drops.farming.show', () => { shown++; return { shown: true }; });
}
const farm = (user = 'pearfan', state = 'farming') => peer.link.publish('drops.farming.changed', {
  state, account: { platform: 'kick', user },
  channel: state === 'farming' ? { platform: 'kick', slug: 'pixelpear', name: 'PixelPear' } : null,
  drop: state === 'farming' ? { campaign: 'Neon Rush Launch Week', category: 'Neon Rush', progress: { done: 48, total: 120, unit: 'minutes' } } : null
});
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out waiting for ' + fn); await new Promise(r => setTimeout(r, 100)); } };
const partition = kind => a.win.$eval(`${winSel('pixelpear', kind)} webview`, w => w.getAttribute('partition'));
const status = () => a.win.evaluate(() => window.pearLink.state && window.pearLink.state.peer.status);
const slugs = () => paths.listSlugs({ env: { GRAPEVINE_DIR: GV } });

test.before(async () => {
  process.env.GRAPEVINE_DIR = GV;
  process.env.SMV_LINK_SIGN_BACK_IN_MS = '500';
  await startPeer();
  a = await launchApp({ storage: { 'kickMultiview.watchSignedIn': { kick: true }, 'kickMultiview.accounts': { kick: 'pearfan' }, 'kickMultiview.alerts': { mention: { sound: 'none' }, spam: { sound: 'none' } } } });
  // logged in to Kick as pearfan (the app asks Kick who you are)
  await a.app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('me:detect'); ipcMain.handle('me:detect', () => 'pearfan'); });
});
test.after(async () => {
  if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); }
  await peer?.stop();
  delete process.env.GRAPEVINE_DIR; delete process.env.SMV_LINK_SIGN_BACK_IN_MS;
  fs.rmSync(GV, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('switched off: no socket; on, Pear Drops connects; farming signs the Kick stream out within 2 s, the chat stays signed in', T, async () => {
  await openChannel(a.win, 'pixelpear');
  assert.deepEqual(slugs(), ['pear-drops'], 'off: no socket');
  assert.equal(await partition('stream'), 'persist:kick', 'Watch signed in');
  await a.win.evaluate(() => openSettings('apps'));
  await a.win.click('#caConnect');
  await until(async () => (await status()) === 'connected', 15000);
  assert.ok(slugs().includes('stream-multiview'), 'on: it listens');
  assert.match(await a.win.textContent('#caPearDrops .ca-chip'), /^Connected · 0\.1\.6$/);
  const at = Date.now();
  farm();
  await until(async () => (await partition('stream')) === 'persist:kmv-stream-pixelpear', 2000);
  assert.ok(Date.now() - at < 2000, 'within 2 s');
  assert.equal(await partition('chat'), 'persist:kick', 'the chat stays signed in');
  await until(() => heard.length && heard.at(-1).signedIn === false);
  assert.deepEqual(heard.at(-1), { signedIn: false, mode: 'auto', account: { platform: 'kick', user: 'pearfan' }, open: [{ platform: 'kick', slug: 'pixelpear' }] }, 'Pear Drops hears it');
  assert.match(await a.win.textContent('#caPearDrops .ca-line'), /^Farming Neon Rush Launch Week on PixelPear · your Kick players are signed out$/);
});

test('Logins: Kick is a locked "Auto" chip while Pear Drops sets it, with a link to Connected apps', T, async () => {
  await a.win.evaluate(() => openSettings('accounts'));
  assert.ok(await a.win.isVisible('#settingsDlg .am-auto'));
  assert.ok(await a.win.isHidden('#settingsDlg .am-watch input[data-w=kick]'), 'no box to change');
  assert.match(await a.win.textContent('#settingsDlg .am-auto-note'), /^Kick is set by Pear Drops\. Players are signed in, except while Pear Drops is farming/);
  await a.win.click('#settingsDlg .am-auto-note [data-go=apps]');
  assert.ok(await a.win.isVisible('#caPearDrops'), 'Change in Connected apps opens it');
});

test('Test answers while connected; the widget opens Pear Drops', T, async () => {
  await a.win.click('#caPearDrops .ca-test');
  await a.win.waitForFunction(() => /answered in \d+ ms$/.test(document.querySelector('#caPearDrops .ca-line').textContent));
  await a.win.keyboard.press('Escape');
  await a.win.waitForSelector('#farmBtn:not([hidden])');
  assert.equal(await a.win.textContent('#farmBtn .fw-name'), 'PixelPear');
  await a.win.click('#farmBtn');
  await until(() => shown === 1);
});

test('farming stops: signed back in after the wait; another Kick account is left alone', T, async () => {
  farm('pearfan', 'waiting');
  await a.win.waitForTimeout(200);
  assert.equal(await partition('stream'), 'persist:kmv-stream-pixelpear', 'not at once');
  await until(async () => (await partition('stream')) === 'persist:kick', 5000);
  await until(() => heard.at(-1).signedIn === true);
  farm('otherfan');
  await a.win.waitForTimeout(1500);
  assert.equal(await partition('stream'), 'persist:kick', 'farming with another account: no conflict');
});

test('the app started again while Pear Drops farms: Kick players wait for it and load signed out straight away', T, async () => {
  farm('pearfan');
  await until(async () => (await partition('stream')) === 'persist:kmv-stream-pixelpear');
  await a.win.addInitScript(() => {
    window.__parts = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.tagName === 'WEBVIEW') window.__parts.push(n.getAttribute('partition')); })))
      .observe(document, { childList: true, subtree: true });
  });
  await a.win.reload();
  await a.win.waitForSelector(`${winSel('pixelpear')} webview`);
  await a.win.waitForSelector(`${winSel('pixelpear', 'chat')} webview`);
  assert.deepEqual((await a.win.evaluate(() => window.__parts)).sort(), ['persist:kick', 'persist:kmv-stream-pixelpear'], 'the chat, and the stream signed out: never signed in first');
});

test('Activity: every message with Pear Drops this run, filtered, opened; it fits without scrolling, and Esc or the back arrow go back', T, async () => {
  await a.win.evaluate(() => openSettings('apps'));
  await a.win.click('#caPearDrops .ca-activity');
  await a.win.waitForSelector('#caActivity .act-list > .act-row');
  assert.ok(await a.win.isHidden('#caPearDrops'), 'in place of the card');
  const rows = () => a.win.$$eval('#caActivity .act-list > .act-row', r => r.map(e => (e.classList.contains('act-marker') ? 'note ' : e.classList.contains('out') ? 'out ' : 'in ') + e.textContent));
  const all = await rows();
  assert.ok(all.some(r => /^in .*drops\.farming\.changed.*Farming Neon Rush Launch Week on PixelPear · 48 of 120 min/.test(r)), 'what Pear Drops farms');
  assert.match(await a.win.textContent('#caActivity .act-range'), /^1–\d+ of \d+$/);
  assert.match(await a.win.textContent('#caActivity .act-tile.out'), /^Sent[1-9]\d*/);
  // as many rows as fit, and nothing scrolls
  await a.win.waitForFunction(() => { const l = document.querySelector('#caActivity .act-list'); return l.querySelectorAll('.act-row').length === Math.floor(l.clientHeight / 46); }).catch(() => {});
  const fit = await a.win.$eval('#caActivity .act-list', l => ({ rows: l.querySelectorAll('.act-row').length, room: Math.floor(l.clientHeight / 46), over: l.scrollHeight > l.clientHeight + 1 }));
  assert.equal(fit.rows, fit.room, 'the rows fill the list');
  assert.equal(fit.over, false, 'and fit in it');
  assert.ok(await a.win.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1), 'Settings doesn\'t scroll');
  await a.win.click('#caActivity .act-filter[data-f=in]');
  await a.win.waitForFunction(() => [...document.querySelectorAll('#caActivity .act-list > .act-row')].every(r => r.classList.contains('in')));
  await a.win.click('#caActivity .act-filter[data-f=out]');
  await a.win.waitForFunction(() => [...document.querySelectorAll('#caActivity .act-list > .act-row')].every(r => r.classList.contains('out')));
  assert.ok((await rows()).some(r => /players\.changed.*Kick player.* open, signed (in|out)/.test(r)), 'what this app sends');
  await a.win.click('#caActivity .act-list > .act-row.k-event');
  await a.win.waitForSelector('#caActivity .act-fields');
  assert.ok(await a.win.$$eval('#caActivity .act-fields dt', d => d.some(e => e.textContent.startsWith('platforms.kick.'))), 'its fields');
  assert.ok(await a.win.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1), 'still no scrolling');
  await a.win.keyboard.press('Escape');
  assert.ok(await a.win.isVisible('#caPearDrops'), 'Esc: the card again');
  assert.ok(await a.win.isVisible('#settingsDlg'), 'with Settings still open');
  await a.win.click('#caPearDrops .ca-activity');
  await a.win.waitForSelector('#caActivity .act-list > .act-row');
  await a.win.click('#caActivity .act-back');
  assert.ok(await a.win.isVisible('#caPearDrops'), 'the back arrow too');
  await a.win.keyboard.press('Escape');
});

test('Pear Drops quits: signed back in after the wait, and Test says it isn\'t open', T, async () => {
  await peer.stop();
  await until(async () => (await status()) !== 'connected');
  await until(async () => (await partition('stream')) === 'persist:kick', 5000);
  await a.win.evaluate(() => openSettings('apps'));
  await a.win.click('#caPearDrops .ca-test');
  await a.win.waitForFunction(() => /^Pear Drops isn't open$/.test(document.querySelector('#caPearDrops .ca-line').textContent)).catch(async e => {
    e.message += ' (the line: ' + await a.win.textContent('#caPearDrops .ca-line') + ')'; throw e;
  });
});

test('Disconnect forgets the pairing and switches the link off', T, async () => {
  await startPeer();
  await until(async () => (await status()) === 'connected', 15000);
  const keys = () => JSON.parse(fs.readFileSync(path.join(a.data, 'Stream Multiview', 'grapevine.json'), 'utf8')).peers;
  assert.ok(keys()[PD], 'paired');
  await a.win.waitForFunction(() => document.querySelector('#caPearDrops .ca-act').textContent === 'Disconnect');
  await a.win.click('#caPearDrops .ca-act');
  await a.win.waitForFunction(() => !document.getElementById('caConnect').checked);
  assert.equal(keys()[PD], undefined, 'forgotten here');
  await until(() => !peerKeys.get('com.glowingpear.streammultiview'), 5000);
  assert.deepEqual(slugs(), ['pear-drops'], 'off: no socket');
  assert.equal(JSON.parse(await a.win.evaluate(() => localStorage.getItem('kickMultiview.watchSignedIn'))).kick, true, 'your own Kick choice is back');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.link.kickBefore')), null);
});
