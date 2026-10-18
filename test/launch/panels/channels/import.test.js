// The Import follows dialog in the real desktop app: reading, progress, picking, filtering, adding
// to Saved, and every error. The app's import and login are replaced by stand-ins that the test
// controls, so it needs no Kick/Twitch/YouTube login or network. Uses a temporary data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, playwright, killApp } = require('../../../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

let app, win;
const pageErrors = [];
const SAVED = 'kickMultiview.saved';
const T = { timeout: 45000 };   // per test, so one stuck test can't hold up the run

test.before(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-import-'));
  // no update check against GitHub during the test: automatic checks off, and the update address goes nowhere
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };   // a data folder of its own (see npm run dev)
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', '--use-mock-keychain', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => killApp(proc));   // never leave the app open if the tests die
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#empty');
  // stand-ins: the import waits until the test answers; logging in is only recorded
  await app.evaluate(({ ipcMain }) => {
    const s = globalThis.__test = { imports: [], logins: [], sender: null, answer: null };
    ipcMain.removeHandler('follows:import');
    ipcMain.handle('follows:import', (e, plat) => {
      s.imports.push(plat); s.sender = e.sender;
      return new Promise(r => { s.answer = v => { s.answer = null; r(v); }; });
    });
    ipcMain.removeHandler('account:login');
    ipcMain.handle('account:login', (_e, plat) => { s.logins.push(plat); return true; });
  });
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) killApp(app.process());
});

const answer = result => app.evaluate((_e, r) => globalThis.__test.answer(r), result);
const progress = (platform, text) => app.evaluate((_e, p) => globalThis.__test.sender.send('follows:progress', p), { platform, text });
const stubs = () => app.evaluate(() => ({ imports: globalThis.__test.imports, logins: globalThis.__test.logins }));
const shown = sel => win.isVisible(sel);
const text = sel => win.textContent(sel).then(t => t.trim());
const rows = () => win.$$eval('#importDlg .dlg-list label', ls => ls.map(l => ({
  name: l.querySelector('.nm').textContent, id: l.querySelector('.id').textContent,
  checked: l.querySelector('input').checked, disabled: l.querySelector('input').disabled })));
const savedList = () => win.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), SAVED);

// Start clean even if an earlier test failed half-way: finish any import still waiting, close dialogs.
async function reset() {
  await app.evaluate(() => globalThis.__test.answer && globalThis.__test.answer({ error: 'failed' }));
  await win.waitForTimeout(100);
  await win.evaluate(() => document.querySelectorAll('.dlg-bg').forEach(d => { d.hidden = true; }));
}

async function openImport(plat) {
  await reset();
  if (!(await shown('#savedPanel'))) await win.click('#savedBtn');
  if (!(await shown('#importRow'))) await win.click('#spMore');
  await win.click(`#importRow [data-imp="${plat}"]`);
  await win.waitForSelector('#importDlg:not([hidden])');
}

test('opens for the platform, with the pear while it reads', T, async () => {
  await win.evaluate(k => { localStorage.setItem(k, JSON.stringify(['streamer3'])); }, SAVED);   // one channel already saved
  await win.reload();
  await win.waitForSelector('#empty');
  await openImport('kick');
  assert.equal(await text('#importDlg .dlg-title'), 'Import Kick follows');
  assert.equal(await win.$eval('#importDlg .pdot', e => getComputedStyle(e).backgroundColor), 'rgb(83, 252, 24)');
  assert.match(await text('#importDlg .dlg-sub'), /Reading the channels you follow on Kick/);
  assert.ok(await shown('#importDlg .pear-load'), 'the pear shows');
  assert.equal(await text('#importDlg .prog'), 'Reading the channels you follow…');
  assert.equal(await shown('#importDlg .dlg-ok'), false, 'nothing to add yet');
  assert.equal(await shown('#importDlg .dlg-tools'), false, 'no filter yet');
  assert.deepEqual((await stubs()).imports, ['kick']);
});

test('progress changes only the text, so the pear keeps running', T, async () => {
  await win.$eval('#importDlg .pear-load', e => { e.dataset.first = '1'; });
  await progress('kick', 'Found 20 so far…');
  await progress('kick', 'Found 40 so far…');
  await win.waitForFunction(() => document.querySelector('#importDlg .prog').textContent === 'Found 40 so far…');
  assert.equal(await win.$eval('#importDlg .pear-load', e => e.dataset.first), '1', 'still the same pear');
  await progress('twitch', 'Found 999 so far…');   // another platform's progress is ignored
  await win.waitForTimeout(200);
  assert.equal(await text('#importDlg .prog'), 'Found 40 so far…');
});

test('while reading, clicking outside does not close it, and a second import is ignored', T, async () => {
  await win.mouse.click(5, 5);
  assert.ok(await shown('#importDlg'));
  await win.evaluate(() => window.importFollows('twitch'));
  assert.deepEqual((await stubs()).imports, ['kick']);
  assert.equal(await text('#importDlg .dlg-title'), 'Import Kick follows');
});

test('the results: sorted by name, already-saved ones marked, everything new ticked', T, async () => {
  await answer({ items: [
    { ch: 'zeta', name: 'zeta' }, { ch: 'alpha', name: 'Alpha' }, { ch: 'streamer3', name: 'Streamer3' }, { ch: 'beta', name: 'beta' },
    { ch: 'gamma', name: 'Gamma' }, { ch: 'delta', name: 'delta' }, { ch: 'streamer5', name: 'Fifth' }, { ch: 'omega', name: 'Omega' },
    { ch: 'kappa', name: '' }
  ] });
  await win.waitForSelector('#importDlg .dlg-list label');
  assert.equal(await text('#importDlg .dlg-sub'), 'Found 9 channels you follow (1 already saved). Untick any you don\'t want.');
  const r = await rows();
  assert.deepEqual(r.map(x => x.name), ['Alpha', 'beta', 'delta', 'Fifth', 'Gamma', 'kappa', 'Omega', 'Streamer3', 'zeta'], 'sorted, ignoring case; a missing name shows the channel');
  assert.deepEqual(r.find(x => x.name === 'Streamer3'), { name: 'Streamer3', id: 'already saved', checked: true, disabled: true });
  assert.ok(r.filter(x => x.name !== 'Streamer3').every(x => x.checked && !x.disabled));
  assert.equal(r.find(x => x.name === 'Fifth').id, 'streamer5');
  assert.equal(await text('#importDlg .dlg-ok'), 'Add 8 to Saved');
  assert.ok(await shown('#importDlg .dlg-tools'), 'a filter for 8 or more');
  assert.equal(await text('#importDlg .dlg-note'), '', 'no long-list tip for 8 channels');
  const names = await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.chNames') || '{}'));
  assert.equal(names.alpha, 'Alpha', 'the display names are remembered for the rest of the app');
  assert.equal(names.streamer5, undefined, 'a name that isn\'t the channel\'s handle is not');
});

test('picking: untick one, None, All', T, async () => {
  await win.uncheck('#importDlg .dlg-list input[value="zeta"]');
  assert.equal(await text('#importDlg .dlg-ok'), 'Add 7 to Saved');
  await win.click('#importDlg .dlg-none');
  assert.equal(await text('#importDlg .dlg-ok'), 'Add to Saved');
  assert.equal(await win.isDisabled('#importDlg .dlg-ok'), true);
  assert.equal(await win.isChecked('#importDlg .dlg-list input[value="streamer3"]'), true, 'already saved stays ticked');
  await win.click('#importDlg .dlg-all');
  assert.equal(await text('#importDlg .dlg-ok'), 'Add 8 to Saved');
  await win.uncheck('#importDlg .dlg-list input[value="beta"]');
});

test('the filter matches names and channels, and keeps your ticks', T, async () => {
  await win.fill('#importDlg .dlg-q', 'ALP');
  assert.deepEqual((await rows()).map(x => x.name), ['Alpha']);
  await win.fill('#importDlg .dlg-q', 'streamer5');
  assert.deepEqual((await rows()).map(x => x.name), ['Fifth'], 'by channel');
  await win.fill('#importDlg .dlg-q', 'nobody');
  assert.equal(await text('#importDlg .dlg-list'), 'Nothing matches.');
  await win.fill('#importDlg .dlg-q', '');
  assert.equal((await rows()).length, 9);
  assert.equal(await win.isChecked('#importDlg .dlg-list input[value="beta"]'), false, 'beta is still unticked');
  assert.equal(await text('#importDlg .dlg-ok'), 'Add 7 to Saved');
});

test('Add puts only the ticked channels in Saved', T, async () => {
  await win.click('#importDlg .dlg-ok');
  assert.equal(await shown('#importDlg'), false);
  assert.equal(await text('#msg'), 'Added 7 Kick channels to Saved');
  assert.deepEqual(await savedList(), ['alpha', 'delta', 'gamma', 'kappa', 'omega', 'streamer3', 'streamer5', 'zeta']);
  await win.reload();
  await win.waitForSelector('#empty');
  assert.ok((await savedList()).includes('zeta'), 'remembered after a reload');
});

test('Twitch: one channel, shown without "tw:", no filter for a short list', T, async () => {
  await openImport('twitch');
  assert.equal(await text('#importDlg .dlg-title'), 'Import Twitch follows');
  assert.equal(await win.$eval('#importDlg .pdot', e => getComputedStyle(e).backgroundColor), 'rgb(169, 112, 255)');
  await answer({ items: [{ ch: 'tw:shroud', name: 'shroud' }] });
  await win.waitForSelector('#importDlg .dlg-list label');
  assert.equal(await text('#importDlg .dlg-sub'), 'Found 1 channel you follow. Untick any you don\'t want.');
  assert.equal((await rows())[0].id, 'shroud');
  assert.equal(await shown('#importDlg .dlg-tools'), false);
  await win.click('#importDlg .dlg-ok');
  assert.equal(await text('#msg'), 'Added 1 Twitch channel to Saved');
  assert.ok((await savedList()).includes('tw:shroud'));
});

test('YouTube: a long list gets the live-check tip; Cancel closes', T, async () => {
  await openImport('youtube');
  await answer({ items: Array.from({ length: 45 }, (_, i) => ({ ch: `yt:@channel${i}`, name: `Channel ${i}` })) });
  await win.waitForSelector('#importDlg .dlg-list label');
  assert.match(await text('#importDlg .dlg-note'), /very long lists are checked more slowly/);
  assert.equal((await rows())[0].id, '@channel0');
  await win.click('#importDlg .dlg-cancel');
  assert.equal(await shown('#importDlg'), false);
  assert.ok(!(await savedList()).some(c => c.startsWith('yt:')), 'nothing added');
});

test('Cancel while reading: a late result does not reopen it', T, async () => {
  await openImport('kick');
  await win.click('#importDlg .dlg-cancel');
  await answer({ items: [{ ch: 'late', name: 'late' }] });
  await win.waitForTimeout(300);
  assert.equal(await shown('#importDlg'), false);
});

test('signed out: Log in opens the login and closes the dialog', T, async () => {
  await openImport('kick');
  await answer({ error: 'login' });
  await win.waitForSelector('#importDlg .imp-login');
  assert.equal(await text('#importDlg .dlg-sub'), 'You need to be logged in to Kick in this app first.');
  assert.equal(await text('#importDlg .imp-login'), 'Log in to Kick');
  await win.click('#importDlg .imp-login');
  assert.equal(await shown('#importDlg'), false);
  assert.deepEqual((await stubs()).logins, ['kick']);
  assert.match(await text('#msg'), /Log in, close the login window/);
});

test('signed out of YouTube: the button opens the Firefox sign-in steps', T, async () => {
  await openImport('youtube');
  await answer({ error: 'login' });
  await win.waitForSelector('#importDlg .imp-login');
  assert.match(await text('#importDlg .dlg-sub'), /only works through Firefox/);
  assert.equal(await text('#importDlg .imp-login'), 'Sign in to YouTube with Firefox');
  await win.click('#importDlg .imp-login');
  assert.ok(await shown('#ffDlg'));
  assert.deepEqual((await stubs()).logins, ['kick'], 'no in-app login for YouTube');
  await win.click('#ffDlg .dlg-cancel');
});

test('other outcomes: busy, failed, and nothing followed', T, async () => {
  for (const [result, sub] of [
    [{ error: 'busy' }, 'Another import is still running. Try again in a moment.'],
    [{ error: 'failed' }, /^Couldn't read your Kick follows right now/],
    [null, /^Couldn't read your Kick follows right now/],
    [{ items: [] }, 'No followed Kick channels found.']
  ]) {
    await openImport('kick');
    await answer(result);
    await win.waitForFunction(() => !document.querySelector('#importDlg .pear-load'));
    if (typeof sub === 'string') assert.equal(await text('#importDlg .dlg-sub'), sub);
    else assert.match(await text('#importDlg .dlg-sub'), sub);
    assert.equal(await text('#importDlg .dlg-list'), '');
    assert.equal(await shown('#importDlg .dlg-ok'), false);
    await win.click('#importDlg .dlg-cancel');
  }
  assert.deepEqual(pageErrors, [], 'the page had no errors');
});
