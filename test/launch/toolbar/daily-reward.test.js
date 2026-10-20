// The toolbar's daily reward chest in the real desktop app, with Grapevine's stand-in Pear Drops in a folder of the
// test's own (never the real one, and nothing here calls Kick): an older Pear Drops without rewards.daily gets the
// plain chest and the card says which version to update to; one that sends it fills the ring, shows the "Claim
// reward" chip when it's ready, and a click asks it to show the reward.
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, assert } = require('../app');
const { standInPeer } = require('@streamorchard/grapevine/stand-in-peer');
const { memoryKeyStore } = require('@streamorchard/grapevine');

const T = { timeout: 90000 };
const PD = 'com.streamorchard.peardrops';
const GV = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-gv-'));
const FAST = { pollMs: 100, backoffMs: [100] };
const peerKeys = memoryKeyStore();          // the stand-in's pairing, kept when it's started again
let a, peer, shown = 0;

async function startPeer(version, provides) {
  peer = await standInPeer({ as: PD, dir: GV, version, provides, uses: { players: '1.0' }, keys: peerKeys, timing: FAST });
  peer.link.handle('rewards.daily.show', () => { shown++; return { shown: true }; });
}
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out waiting for ' + fn); await new Promise(r => setTimeout(r, 100)); } };
const status = () => a.win.evaluate(() => window.pearLink.state && window.pearLink.state.peer.status);
const chest = () => a.win.evaluate(() => {
  const b = document.getElementById('rewardBtn');
  return b.hidden ? null : { state: [...b.classList].find(c => c.startsWith('state-')).slice(6), title: b.title, label: getComputedStyle(b.querySelector('.tb-l')).display === 'none' ? null : b.querySelector('.tb-l').textContent };
});
const reward = o => peer.link.publish('rewards.daily.changed', { state: 'earning', account: { platform: 'kick', user: 'pearfan' }, minutes: 37, threshold: 60, endsAt: '2026-10-21T00:00:00Z', ...o });

test.before(async () => {
  process.env.GRAPEVINE_DIR = GV;
  await startPeer('0.1.6', { 'drops.farming': '1.0' });
  a = await launchApp({ storage: { 'kickMultiview.accounts': { kick: 'pearfan' } } });
  // logged in to Kick as pearfan (the app asks Kick who you are)
  await a.app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('me:detect'); ipcMain.handle('me:detect', () => 'pearfan'); });
});
test.after(async () => {
  if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); }
  await peer?.stop();
  delete process.env.GRAPEVINE_DIR;
  fs.rmSync(GV, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('an older Pear Drops (no rewards.daily): the plain chest, and the card says to update it', T, async () => {
  await a.win.waitForSelector('#rewardBtn:not([hidden])');
  assert.deepEqual(await chest(), { state: 'plain', title: 'Daily reward on Kick', label: null }, 'not linked: the plain chest');
  await a.win.evaluate(() => openSettings('apps'));
  assert.ok(await a.win.isChecked('#caReward'), 'on by default');
  await a.win.click('#caConnect');
  await until(async () => (await status()) === 'confirm', 15000);
  await a.win.click('#caPearDrops .ca-act');                           // Allow
  await until(async () => (await status()) === 'connected', 15000);
  assert.match(await a.win.textContent('#caPearDrops .ca-line'), /^Works, with a feature missing: update Pear Drops( \(stand-in\))? to 0\.1\.12 or later$/);
  assert.deepEqual(await a.win.evaluate(() => window.pearLink.state.peer.shares.in), ['drops.farming']);
  assert.equal((await chest()).state, 'plain', 'still the plain chest');
  assert.ok(await a.win.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1), 'the card fits without scrolling');
  await a.win.keyboard.press('Escape');
});

test('Pear Drops 0.1.12: the ring fills, "Claim reward" when it\'s ready, and a click asks Pear Drops to show it', T, async () => {
  await peer.stop();
  await until(async () => (await status()) !== 'connected');
  await startPeer('0.1.12', { 'drops.farming': '1.0', 'rewards.daily': '1.0' });
  await until(async () => (await status()) === 'connected', 15000);
  reward();
  await until(async () => ((await chest()) || {}).state === 'earning');
  assert.equal((await chest()).title, 'Daily reward · 37 of 60 min\n23 min to go');
  reward({ state: 'ready', minutes: 60 });
  await until(async () => ((await chest()) || {}).state === 'ready');
  assert.equal((await chest()).label, 'Claim reward');
  await a.win.click('#rewardBtn');
  await until(() => shown === 1);
  const rows = (await a.win.evaluate(() => window.kmv.linkActivity({ limit: 50 }))).entries.map(e => e.method + ' ' + e.kind);
  assert.ok(rows.includes('rewards.daily.changed event') && rows.includes('rewards.daily.show request') && rows.includes('rewards.daily.show reply'), 'in the Activity log');
  // signed out of Kick in Pear Drops, or the switch off: no chest
  peer.link.publish('rewards.daily.changed', { state: 'signed-out', account: null, endsAt: null });
  await until(async () => (await chest()) === null);
  reward({ state: 'claimed' });
  await until(async () => ((await chest()) || {}).state === 'claimed');
  await a.win.evaluate(() => openSettings('apps'));
  await a.win.click('#caReward');
  await until(async () => (await chest()) === null);
  await a.win.keyboard.press('Escape');
});
