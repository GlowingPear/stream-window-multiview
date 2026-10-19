// The updater's look, in the real desktop app: Settings › Updates for each state (the pear's badge, the sentence, the
// buttons, the download's bar), the release card, What's new as a timeline, the toolbar's chip, and the "Updated" card
// on a new version's first start. The update status is a stand-in; nothing is checked or downloaded.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, assert } = require('../../app');
const { ROOT } = require('../../../helpers');

const T = { timeout: 60000 };
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const BASE = { current: VERSION, repo: 'o/r', auto: true, lastCheck: Date.now() - 4 * 60e3, git: false, installed_app: true, platform: 'win32',
  state: 'uptodate', latest: VERSION, notes: '', notesHtml: '', published: '', page: '', installed: null, error: '' };
let a;
test.before(async () => {
  a = await launchApp();
  await a.app.evaluate(({ ipcMain }) => {
    const s = globalThis.__u = { status: {}, calls: [], opened: [] };
    for (const ch of ['update:status', 'update:check', 'update:install', 'update:restart', 'update:privacy-settings', 'update:use-dmg']) {
      ipcMain.removeHandler(ch);
      ipcMain.handle(ch, () => { if (ch !== 'update:status') s.calls.push(ch); return ch === 'update:restart' ? {} : s.status; });
    }
    ipcMain.removeHandler('open-external'); ipcMain.handle('open-external', (_e, url) => { s.opened.push(url); });
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });
const status = extra => a.app.evaluate(({ BrowserWindow }, s) => { globalThis.__u.status = s; BrowserWindow.getAllWindows().forEach(w => w.webContents.send('update:status', s)); }, { ...BASE, ...extra });
const calls = () => a.app.evaluate(() => globalThis.__u.calls.splice(0));
async function showUpdates(extra){
  await status(extra);
  if (await a.win.isHidden('#settingsDlg')) await a.win.evaluate(() => window.openSettings('updates'));
  await a.win.waitForSelector('.upd-hero');
}
// what the hero card shows: its look, the pear's badge, the sentence, the buttons
const hero = () => a.win.$eval('.upd-hero', e => ({
  tone: ['glow', 'bad'].find(c => e.classList.contains(c)) || '',
  badge: (e.querySelector('.upd-badge')?.className.match(/b-(\w+)/) || [])[1] || (e.querySelector('.upd-badge .spin') ? 'spin' : ''),
  say: e.querySelector('.upd-state').textContent,
  when: e.querySelector('.upd-when').textContent,
  title: [...e.querySelector('.upd-title').children].map(c => c.textContent),
  buttons: [...e.querySelectorAll('.upd-acts .btn')].map(b => b.textContent + (b.disabled ? ' (off)' : ''))
}));

test('each state has its badge, sentence and buttons, and the card glows when there\'s something to do', T, async () => {
  const rows = [
    [{ state: 'checking' }, { tone: '', badge: 'spin', say: /^Checking for updates…$/, buttons: ['Check now (off)'] }],
    [{ state: 'downloading', latest: '9.0.0' }, { tone: '', badge: 'drop', say: /^Downloading version 9\.0\.0…$/, buttons: ['Check now (off)'] }],
    [{ state: 'available', latest: '9.0.0' }, { tone: 'glow', badge: 'sparkle', say: /^Version 9\.0\.0 is available\.$/, buttons: ['Download update', 'Check now'] }],
    [{ state: 'available', latest: '9.0.0', installed_app: false }, { tone: 'glow', badge: 'sparkle', say: /is available\.$/, buttons: ['Download and install', 'Check now'] }],
    [{ state: 'available', latest: '9.0.0', manual: true }, { tone: 'glow', badge: 'sparkle', say: /Download it from the GitHub page/, buttons: ['Open download page', 'Check now'] }],
    [{ state: 'ready', latest: '9.0.0', installed: '9.0.0' }, { tone: 'glow', badge: 'gift', say: /9\.0\.0 is downloaded\. Click Restart and install: the app closes/, buttons: ['Restart and install', 'Check now'] }],
    [{ state: 'ready', latest: '9.0.0', installed: '9.0.0', installed_app: false }, { tone: 'glow', badge: 'gift', say: /is installed\. Restart the app to use it/, buttons: ['Restart now', 'Check now'] }],
    [{ state: 'ready', latest: '9.0.0', installed: '9.0.0', installed_app: false, needsInstall: true }, { tone: 'glow', badge: 'gift', say: /one-time engine install/, buttons: ['Check now'] }],
    [{ state: 'ready', latest: '9.0.0', installed: '9.0.0', platform: 'darwin', swap: { appPath: '/a', newApp: '/b' }, blocked: true },
      { tone: 'bad', badge: 'alert', say: /macOS stopped.*App Management/, buttons: ['Open System Settings', 'Restart and install', 'Use the disk image instead', 'Check now'] }],
    [{ state: 'uptodate' }, { tone: '', badge: 'check', say: /^You have the newest version\.$/, buttons: ['Check now'] }],
    [{ state: 'error', error: 'offline' }, { tone: 'bad', badge: 'alert', say: /^Couldn't check for updates right now \(offline\)\. Try again later\.$/, buttons: ['Check now'] }],
    [{ state: 'error', error: 'notfound' }, { tone: 'bad', badge: 'alert', say: /wasn't found/, buttons: ['Check now'] }],
    [{ state: 'error', error: 'nowrite' }, { tone: 'bad', badge: 'alert', say: /folder you own/, buttons: ['Check now'] }],
    [{ state: 'error', error: 'wrongapp' }, { tone: 'bad', badge: 'alert', say: /doesn't look like Stream Multiview/, buttons: ['Check now'] }],
    [{ state: 'norepo', repo: '' }, { tone: 'bad', badge: 'alert', say: /No GitHub page is set yet/, buttons: ['Check now (off)'] }],
    [{ state: 'uptodate', git: true, latest: '' }, { tone: '', badge: 'lock', say: /to update it\.$/, buttons: ['Check now'] }],
    [{ state: 'uptodate', git: true, latest: '9.0.0' }, { tone: '', badge: 'lock', say: /git checkout.*newest version is 9\.0\.0/, buttons: ['Check now'] }],
    [{ state: 'checking', git: true }, { tone: '', badge: 'spin', say: /git checkout.*Checking…$/, buttons: ['Check now (off)'] }],
    [{ state: 'error', git: true, error: 'offline' }, { tone: '', badge: 'lock', say: /The check didn't work\.$/, buttons: ['Check now'] }],
    [{ state: 'idle', lastCheck: 0 }, { tone: '', badge: '', say: /^Not checked yet\.$/, buttons: ['Check now'] }]
  ];
  for (const [st, want] of rows){
    await showUpdates(st);
    const h = await hero();
    const what = JSON.stringify(st);
    assert.equal(h.tone, want.tone, what);
    assert.equal(h.badge, want.badge, what);
    assert.match(h.say, want.say, what);
    assert.deepEqual(h.buttons, want.buttons, what);
  }
  await showUpdates({ state: 'uptodate' });
  assert.equal((await hero()).when, 'Checked 4m ago · github.com/o/r', 'how long ago, and where from');
  assert.deepEqual((await hero()).title, ['Stream Multiview', 'v' + VERSION, ...(/^0\./.test(VERSION) ? ['beta'] : [])]);
  await showUpdates({ state: 'idle', lastCheck: 0, repo: '' });
  assert.equal((await hero()).when, '', 'nothing to say before the first check');
});

test('the buttons do their jobs', T, async () => {
  await calls();
  await showUpdates({ state: 'available', latest: '9.0.0' });
  await a.win.click('.upd-install');
  await a.win.click('.upd-check');
  await showUpdates({ state: 'ready', latest: '9.0.0', installed: '9.0.0', platform: 'darwin', swap: { appPath: '/a', newApp: '/b' }, blocked: true });
  await a.win.click('.upd-privacy');
  await a.win.click('.upd-dmg');
  await a.win.click('.upd-restart');
  assert.deepEqual(await calls(), ['update:install', 'update:check', 'update:privacy-settings', 'update:use-dmg', 'update:restart']);
});

test('while downloading, a bar says how far it got, and moves back and forth when the size isn\'t known', T, async () => {
  await showUpdates({ state: 'downloading', latest: '9.0.0', progress: 0.42, received: 38.2e6, total: 91e6 });
  const bar = () => a.win.$eval('.upd-prog', e => ({ ind: e.classList.contains('ind'), width: e.querySelector('.upd-bar i').style.width, text: e.querySelector('.upd-pct').textContent }));
  assert.deepEqual(await bar(), { ind: false, width: '42%', text: '42% · 38 of 91 MB' });
  // more of it arrives: only the bar moves (the card isn't built again)
  await a.win.evaluate(() => { document.querySelector('.upd-hero').dataset.mark = '1'; });
  await status({ state: 'downloading', latest: '9.0.0', progress: 0.5, received: 45.5e6, total: 91e6 });
  assert.deepEqual(await bar(), { ind: false, width: '50%', text: '50% · 46 of 91 MB' });
  assert.equal(await a.win.$eval('.upd-hero', e => e.dataset.mark), '1');
  await status({ state: 'downloading', latest: '9.0.0', progress: null, received: 12e6, total: null });
  assert.deepEqual(await bar(), { ind: true, width: '', text: '12 MB' });
  await status({ state: 'ready', latest: '9.0.0', installed: '9.0.0' });
  assert.equal(await a.win.locator('.upd-prog').count(), 0, 'no bar once it\'s downloaded');
});

test('the release card: the new version, its date, its release page and its notes', T, async () => {
  await a.app.evaluate(() => { globalThis.__u.opened.length = 0; });
  await showUpdates({ state: 'available', latest: '9.0.0', published: '2026-10-18T12:00:00Z', page: 'https://github.com/o/r/releases/tag/v9.0.0', notesHtml: '<h3>Highlights</h3><ul><li>A new thing</li></ul>' });
  const card = await a.win.$eval('.upd-rel', e => ({ head: e.querySelector('.upd-rel-head').textContent, notes: e.querySelector('.upd-notes').textContent }));
  assert.match(card.head, /^NewVersion 9\.0\.0.*2026.*Release page$/);
  assert.match(card.head, /18/);
  assert.equal(card.notes, 'HighlightsA new thing');
  await a.win.click('.upd-page');
  assert.deepEqual(await a.app.evaluate(() => globalThis.__u.opened), ['https://github.com/o/r/releases/tag/v9.0.0']);
  assert.equal(await a.win.isHidden('.upd-news'), true, 'What\'s new waits until it\'s installed');
  // ready: the version it downloaded; no date or page when GitHub didn't give one (or not an https one)
  await showUpdates({ state: 'ready', latest: '9.0.1', installed: '9.0.0', published: '', page: 'http://example.com', notes: '- plain' });
  assert.equal(await a.win.textContent('.upd-rel-head'), 'NewVersion 9.0.0');
  assert.equal(await a.win.textContent('.upd-notes'), '- plain');
  await showUpdates({ state: 'uptodate' });
  assert.equal(await a.win.locator('.upd-rel').count(), 0, 'no release card when nothing is waiting');
});

test('What\'s new: the changelog as a timeline, this version marked', T, async () => {
  await showUpdates({ state: 'uptodate' });
  await a.win.waitForSelector('.upd-news:not([hidden]) .upd-tv');
  const tl = await a.win.$$eval('.upd-tv', l => l.map(e => ({ v: e.dataset.v, mine: e.classList.contains('this'), chip: e.querySelector('.upd-this')?.textContent || '', lines: e.querySelectorAll('li').length })));
  assert.ok(tl.length > 1 && tl.length <= 8, 'the newest few versions');
  assert.deepEqual(tl[0], { v: VERSION, mine: true, chip: 'This version', lines: tl[0].lines });
  assert.ok(tl[0].lines > 0);
  assert.ok(tl.slice(1).every(x => !x.mine && !x.chip), 'only this one is marked');
  assert.equal(await a.win.isVisible('.upd-foot.st-end'), true, 'the footer under it');
});

test('Update automatically is a switch, and the GitHub repository a box with Save', T, async () => {
  await a.app.evaluate(({ ipcMain }) => {
    const s = globalThis.__u; s.settings = [];
    ipcMain.removeHandler('update:settings'); ipcMain.handle('update:settings', (_e, d) => { s.settings.push(d); Object.assign(s.status, d); return s.status; });
  });
  await showUpdates({ state: 'uptodate' });
  assert.equal(await a.win.$eval('.upd-auto', e => e.classList.contains('st-sw') && e.checked), true);
  await a.win.click('.upd-row:has(.upd-auto)');
  assert.equal(await a.win.textContent('.upd-pre'), 'github.com/');
  await a.win.fill('.upd-repo input', 'someone/fork');
  await a.win.click('.upd-save');
  assert.deepEqual(await a.app.evaluate(() => globalThis.__u.settings), [{ auto: false }, { repo: 'someone/fork' }]);
  // a status arriving while you type keeps what you typed
  await a.win.fill('.upd-repo input', 'half/typ');
  await status({ state: 'checking', repo: 'someone/fork' });
  assert.equal(await a.win.inputValue('.upd-repo input'), 'half/typ');
  await a.win.keyboard.press('Escape');
});

for (const bar of [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }]){
  const name = bar.pos === 'top' ? 'at the top' : bar.labels ? 'on the left' : 'on the left, icons only';
  test(`the toolbar's chip with the toolbar ${name}: out, downloading, ready, and Settings › Updates on a click`, T, async () => {
    await a.win.evaluate(b => localStorage.setItem('kickMultiview.toolbar', JSON.stringify(b)), bar);
    await a.win.reload();
    await a.win.waitForSelector('#settingsBtn');
    await status({ state: 'uptodate' });
    assert.equal(await a.win.isHidden('#updChip'), true, 'nothing to say');
    const chip = () => a.win.$eval('#updChip', e => ({ st: e.dataset.st, label: e.querySelector('.tb-l').textContent, ico: e.querySelector('i[data-ico]').dataset.ico, title: e.title || e.dataset.tipTitle || '' }));
    await status({ state: 'available', latest: '9.0.0' });
    assert.deepEqual(await chip(), { st: 'out', label: 'v9.0.0', ico: 'sparkle', title: 'Version 9.0.0 is out: see what\'s new' });
    await status({ state: 'downloading', latest: '9.0.0', progress: 0.42, received: 38e6, total: 91e6 });
    assert.deepEqual(await chip(), { st: 'dl', label: '42%', ico: 'down', title: 'Downloading version 9.0.0 (42%)' });
    await status({ state: 'downloading', latest: '9.0.0', progress: null, received: 1e6, total: null });
    assert.equal((await chip()).label, 'Downloading');
    await status({ state: 'ready', latest: '9.0.0', installed: '9.0.0' });
    assert.deepEqual(await chip(), { st: 'ready', label: 'Update ready', ico: 'gift', title: 'Version 9.0.0 is ready to install' });
    // beside the bell, on screen, and never put away in ⋯
    assert.equal(await a.win.$eval('#updChip', e => e.parentElement.tagName + ' ' + e.nextElementSibling.id), 'HEADER bellBtn');
    const r = await a.win.$eval('#updChip', e => { const b = e.getBoundingClientRect(); return { w: b.width, x: b.x, r: b.right, vw: innerWidth }; });
    assert.ok(r.w > 20 && r.x >= 0 && r.r <= r.vw, JSON.stringify(r));
    assert.equal(await a.win.isVisible('#updChip .tb-l'), !(bar.pos === 'left' && !bar.labels), 'its words, except in the slim column');
    await a.win.click('#updChip');
    await a.win.waitForSelector('#settingsDlg:not([hidden])');
    assert.equal(await a.win.$eval('#settingsDlg .st-rail .on', e => e.dataset.s), 'updates');
    await a.win.keyboard.press('Escape');
  });
}

test('a git copy has no chip', T, async () => {
  await a.win.evaluate(() => localStorage.setItem('kickMultiview.toolbar', JSON.stringify({ pos: 'top' })));
  await a.win.reload();
  await a.win.waitForSelector('#settingsBtn');
  await status({ state: 'available', latest: '9.0.0', git: true });
  await a.win.waitForTimeout(200);
  assert.equal(await a.win.isHidden('#updChip'), true);
});

test('the first start of a newer version shows the Updated card once; Nice, Esc and a click outside close it', T, async () => {
  const lines = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').split(/^## /m)[1].split('\n').filter(l => /^- /.test(l)).map(l => l.slice(2).trim());
  const firstStart = async seen => {
    await a.win.evaluate(v => { if (v) localStorage.setItem('kickMultiview.seenVersion', v); }, seen);
    await a.win.reload();
    await a.win.waitForSelector('#settingsBtn');
  };
  await firstStart('0.0.1');
  await a.win.waitForSelector('#updNewsDlg:not([hidden])', { timeout: 6000 });
  const card = await a.win.$eval('#updNewsDlg', e => ({ from: e.querySelector('.wn-from').textContent, title: e.querySelector('h3').textContent, lines: [...e.querySelectorAll('.wn-list li')].map(l => l.textContent) }));
  assert.deepEqual(card, { from: 'Updated from 0.0.1', title: `Stream Multiview ${VERSION}`, lines });
  assert.match(await a.win.textContent('#msg'), new RegExp(`Updated to version ${VERSION.replace(/\./g, '\\.')}`), 'the bell\'s message too');
  assert.equal(await a.win.evaluate(() => document.activeElement.className), 'btn primary wn-ok');
  await a.win.click('#updNewsDlg .wn-ok');
  assert.equal(await a.win.isHidden('#updNewsDlg'), true, 'Nice closes it');
  assert.equal(await a.win.isHidden('#settingsDlg'), true, 'and Settings doesn\'t open');
  // not again for the same version
  await firstStart();
  await a.win.waitForTimeout(2000);
  assert.equal(await a.win.isHidden('#updNewsDlg'), true, 'once');
  // Esc, and a click outside it
  await firstStart('0.0.1');
  await a.win.waitForSelector('#updNewsDlg:not([hidden])', { timeout: 6000 });
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.isHidden('#updNewsDlg'), true, 'Esc closes it');
  await firstStart('0.0.1');
  await a.win.waitForSelector('#updNewsDlg:not([hidden])', { timeout: 6000 });
  await a.win.mouse.click(5, 300);
  assert.equal(await a.win.isHidden('#updNewsDlg'), true, 'a click outside closes it');
});

test('See every version opens What\'s new in Settings › Updates; going back a version shows no card', T, async () => {
  await status({ state: 'uptodate' });
  await a.win.evaluate(() => localStorage.setItem('kickMultiview.seenVersion', '0.0.1'));
  await a.win.reload();
  await a.win.waitForSelector('#updNewsDlg:not([hidden])', { timeout: 6000 });
  await a.win.click('#updNewsDlg .wn-all');
  await a.win.waitForSelector('#settingsDlg:not([hidden])');
  assert.equal(await a.win.isHidden('#updNewsDlg'), true);
  assert.equal(await a.win.$eval('#settingsDlg .st-rail .on', e => e.dataset.s), 'updates');
  await a.win.waitForSelector('.upd-news .upd-tv.this');
  await a.win.keyboard.press('Escape');
  // an older version than the one last seen (going back): only the bell's message
  await a.win.evaluate(() => localStorage.setItem('kickMultiview.seenVersion', '999.0.0'));
  await a.win.reload();
  await a.win.waitForSelector('#settingsBtn');
  await a.win.waitForFunction(() => /Updated to version/.test(document.querySelector('#msg')?.textContent || ''), null, { timeout: 6000 });
  assert.equal(await a.win.isHidden('#updNewsDlg'), true);
});
