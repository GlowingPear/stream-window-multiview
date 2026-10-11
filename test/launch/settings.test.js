// Settings and the menu bar in the real desktop app: Settings is where each system expects it (the app menu
// on a Mac, File elsewhere), the Account menu shows one item per site that follows your login, and every
// tab is there. Uses a temporary data folder and needs no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, playwright } = require('../helpers');

function electronPath() {
  if (process.env.ELECTRON_PATH) return process.env.ELECTRON_PATH;
  try { return require('electron'); } catch {
    throw new Error('The app engine is not installed. Run "npm install" first.');
  }
}

const T = { timeout: 45000 };   // per test, so one stuck test can't hold up the run
let app, win, started = 0;
const pageErrors = [];

test.before(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-settings-'));
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', ROOT], env, timeout: 60000 });
  const proc = app.process();
  process.once('exit', () => { try { proc.kill(); } catch {} });   // never leave the app open if the tests die
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#loginBtn:not([hidden])');
  started = Date.now();
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) app.process().kill('SIGKILL');
});

// The menu bar as [menu, [items]], with each item's keyboard shortcut in brackets.
const menuBar = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(i => [i.label,
  i.submenu.items.filter(s => s.type !== 'separator').map(s => s.label + (s.accelerator ? ` [${s.accelerator}]` : ''))]));
const menu = async name => (await menuBar()).find(([l]) => l === name)?.[1];
const clickMenu = (name, label) => app.evaluate(({ Menu }, [n, l]) => {
  const m = Menu.getApplicationMenu().items.find(i => i.label === n);
  m.submenu.items.find(s => s.label.startsWith(l)).click();
}, [name, label]);
const settingsTab = () => win.$eval('#settingsDlg .st-rail .on', e => e.dataset.s);

test('Settings is in the app menu on a Mac, and in File on Windows and Linux', T, async () => {
  const where = process.platform === 'darwin' ? (await menuBar())[0][0] : 'File';
  const items = await menu(where);
  assert.ok(items.includes('Settings… [CmdOrCtrl+,]'), items.join(', '));
  if (process.platform === 'darwin') assert.ok(items.includes('Check for Updates…'));
  else assert.ok(items.includes('Exit'));
  await clickMenu(where, 'Settings');
  await win.waitForSelector('#settingsDlg:not([hidden])');
  await win.keyboard.press('Escape');
});

test('the Account menu has one item per site that follows your login', T, async () => {
  await win.waitForTimeout(Math.max(0, started + 6500 - Date.now()));   // after the page's own login check, 5 s in
  assert.deepEqual(await menu('Account'), ['Log in to Kick…', 'Log in to Twitch…', 'Log in to YouTube…', 'Account settings…']);
  await win.evaluate(() => window.kmv.accountsState({ kick: 'someone', twitch: '', youtube: true }));
  await win.waitForTimeout(200);
  assert.deepEqual(await menu('Account'), ['Log out of Kick (someone)', 'Log in to Twitch…', 'Log out of YouTube', 'Account settings…']);
  await clickMenu('Account', 'Log out of Kick');
  await win.waitForSelector('#askDlg:not([hidden])');
  assert.equal(await win.textContent('#askTitle'), 'Log out of Kick?', 'it asks first, like the Accounts button');
  await win.click('#askDlg .ask-no');
  await clickMenu('Account', 'Account settings');
  await win.waitForSelector('#settingsDlg:not([hidden])');
  assert.equal(await settingsTab(), 'accounts');
  await win.keyboard.press('Escape');
  await win.evaluate(() => window.kmv.accountsState({ kick: '', twitch: '', youtube: false }));
});

test('Help opens the matching Settings tab, and Check for updates opens Updates', T, async () => {
  assert.deepEqual(await menu('Help'), ['Instructions', 'Keyboard shortcuts', 'What\'s new', 'Check for updates…']);
  for (const [label, tab] of [['Instructions', 'guide'], ['Keyboard shortcuts', 'keys'], ['What\'s new', 'updates'], ['Check for updates', 'updates']]) {
    await clickMenu('Help', label);
    await win.waitForSelector('#settingsDlg:not([hidden])');
    assert.equal(await settingsTab(), tab, label);
    await win.keyboard.press('Escape');
  }
});

test('every tab is there in the app, and the Accounts menu links to the rest', T, async () => {
  await win.click('#loginBtn');
  await win.click('#accountMenu .am-more');
  assert.equal(await settingsTab(), 'accounts');
  assert.ok(await win.isHidden('#accountMenu'), 'the menu closes');
  const tabs = await win.$$eval('#settingsDlg .st-rail button', b => b.filter(x => !x.hidden).map(x => x.dataset.s));
  assert.deepEqual(tabs, ['general', 'accounts', 'mentions', 'spam', 'themes', 'updates', 'guide', 'keys']);
  assert.ok(await win.isVisible('#settingsDlg .am-watch'), 'Watch signed in moved here');
  assert.ok(await win.isVisible('#mentUser'), 'so did your usernames');

  // Import follows opens over Settings, and Esc closes only the top one
  await win.click('#settingsDlg .am-row[data-p=kick] .am-imp');
  await win.waitForSelector('#importDlg:not([hidden])');
  assert.ok(await win.isVisible('#settingsDlg'), 'Settings stays open underneath');
  assert.ok(await win.evaluate(() => { const r = document.querySelector('#importDlg .dlg').getBoundingClientRect();
    return document.getElementById('importDlg').contains(document.elementFromPoint(r.x + r.width / 2, r.y + 10)); }), 'and the import is on top');
  await win.keyboard.press('Escape');
  assert.ok(await win.isHidden('#importDlg'));
  assert.ok(await win.isVisible('#settingsDlg'));
  await win.keyboard.press('Escape');
  assert.ok(await win.isHidden('#settingsDlg'));
  await win.click('#loginBtn');
  assert.equal(await win.$$eval('#accountMenu .am-imp', b => b.length), 3, 'Import follows is in the Accounts menu too');
  await win.keyboard.press('Escape');
});

test('spam alerts: off until you turn them on, remembered, and Try it explains a flag', T, async () => {
  await win.evaluate(() => window.openSettings('spam'));
  assert.equal(await win.isChecked('#spamOn'), false);
  await win.check('#spamOn');
  assert.equal(await win.textContent('#settingsDlg .st-rail [data-s=spam] .st-pill'), 'On');
  await win.click('#spamTabs [data-t=try]');
  await win.fill('#spamTry', 'hq ai stream upgrades botkiva com emojiBlowKiss zero cost upgrades emojiBlowKiss');
  await win.click('#spamTryBtn');
  assert.match(await win.textContent('#spamRes'), /Would be flagged.*Disguised link: botkiva com.*Total6/s);
  await win.fill('#spamTry', 'clip it kick.com/someone/clips/abc');
  await win.click('#spamTryBtn');
  assert.match(await win.textContent('#spamRes'), /Not flagged/);
  await win.click('#spamTabs [data-t=lists]');
  await win.fill('[data-add=allow]', 'https://www.botkiva.com/promo');
  await win.click('[data-addbtn=allow]');
  assert.ok((await win.$$eval('[data-list=allow] .st-chip', c => c.map(x => x.textContent))).includes('botkiva.com'), 'kept as just the site');
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  const saved = await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).spam);
  assert.equal(saved.on, true);
  assert.ok(saved.allow.includes('botkiva.com'));
  assert.deepEqual(pageErrors, []);
});
