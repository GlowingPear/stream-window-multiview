// Settings › Sync in the real desktop app: two copies on one temporary folder, both open. A channel added on one shows
// up on the other, a removed one stays removed, a setting goes across (and shows), and Undo puts the last sync back
// on both. The folder is checked every half second here (SMV_SYNC_CHECK_MS), not every minute.
const test = require('node:test');
const { launchApp, assert } = require('../../app');
const { tempDir } = require('../../../helpers');

const T = { timeout: 180000 };
const savedOf = win => win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.saved') || '[]'));
async function until(win, fn, arg, ms = 30000){
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 150))) if (await win.evaluate(fn, arg)) return;
  throw new Error('timed out waiting for ' + fn);
}
const has = (win, ch) => until(win, ch => JSON.parse(localStorage.getItem('kickMultiview.saved') || '[]').includes(ch), ch);
const hasNot = (win, ch) => until(win, ch => !JSON.parse(localStorage.getItem('kickMultiview.saved') || '[]').includes(ch), ch);

test('two copies on one folder: channels and a setting go across while both are open, and Undo goes back on both', T, async () => {
  const folder = tempDir('sync-folder');
  process.env.SMV_SYNC_CHECK_MS = '500';
  process.env.SMV_SYNC_HOST = 'Studio-MacBook.local';
  const a = await launchApp({ hidden: true, storage: { 'kickMultiview.saved': ['alpha'] } });
  process.env.SMV_SYNC_HOST = 'Gaming-PC';
  const b = await launchApp({ hidden: true, storage: { 'kickMultiview.saved': ['zulu'] } });
  delete process.env.SMV_SYNC_HOST;
  try {
    assert.equal((await a.win.evaluate(f => window.kmv.syncStart(f, 'combine'), folder)).ok, true);
    const peek = await b.win.evaluate(f => window.kmv.syncPeek(f), folder);
    assert.deepEqual(peek.others.map(o => [o.name, o.channels]), [['Studio-MacBook', 1]], 'the first computer is there, by its name');
    await b.win.evaluate(f => window.kmv.syncStart(f, 'combine'), folder);
    await has(b.win, 'alpha');
    await has(a.win, 'zulu');                                         // (noticed while open)
    assert.deepEqual((await savedOf(a.win)).sort(), ['alpha', 'zulu']);
    await until(b.win, () => /Synced from/.test(document.querySelector('#msg').textContent));

    // a setting, with the switch in Settings
    await a.win.evaluate(() => openSettings('general'));
    const was = await a.win.evaluate(() => document.querySelector('#snap').checked);
    await a.win.click('label:has(#snap)');
    await until(b.win, was => document.querySelector('#snap').checked === !was, was);

    // a channel removed on one stays removed on both
    await b.win.click('#savedBtn');
    await b.win.click('#savedPanel .sv:has-text("alpha") .rm', { force: true });
    await hasNot(b.win, 'alpha');
    await hasNot(a.win, 'alpha');
    await a.win.waitForTimeout(1500);
    assert.ok(!(await savedOf(a.win)).includes('alpha'), 'not brought back');

    // Undo (Settings › Sync) puts the last sync back here, and on the other computer
    await a.win.evaluate(() => openSettings('sync'));
    await a.win.waitForSelector('#syncUndoRow:not([hidden]) #syncUndo');
    await a.win.click('#syncUndo');
    await has(a.win, 'alpha');
    await has(b.win, 'alpha');
    assert.deepEqual((await a.win.evaluate(() => window.smvSync.status.computers.map(c => c.name))).sort(), ['Gaming-PC', 'Studio-MacBook']);
  } finally { await a.close(); await b.close(); delete process.env.SMV_SYNC_CHECK_MS; }
});
