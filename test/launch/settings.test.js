// Settings and the menu bar in the real desktop app: Settings is where each system expects it (the app menu
// on a Mac, File elsewhere), the Account menu shows one item per site that follows your login, and every
// tab is there. Uses a temporary data folder and needs no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stubExists, openChannel, setMode } = require('./app');
const { ROOT, playwright, killApp } = require('../helpers');

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
  await stubExists(app);
  const proc = app.process();
  process.once('exit', () => killApp(proc));   // never leave the app open if the tests die
  win = await app.firstWindow();
  win.setDefaultTimeout(15000);   // a failed step fails its test instead of waiting forever
  win.on('pageerror', e => pageErrors.push(e.message));
  await win.waitForSelector('#loginBtn:not([hidden])');
  started = Date.now();
});
test.after(async () => {
  if (!app) return;
  const closed = app.close().then(() => true, () => false);
  if (!(await Promise.race([closed, new Promise(r => setTimeout(() => r(false), 10000))]))) killApp(app.process());
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
  await win.click('#bellBtn');
  await win.click('#bellPanel #bellSettings');
  assert.equal(await settingsTab(), 'notify', 'the bell\'s gear');
  await win.click('#ntGrid .k-mention [data-go]');
  assert.equal(await settingsTab(), 'mentions', 'More on Mentions');
  assert.ok(await win.isVisible('[data-s=mentions] .st-subpane[data-t=alerts]'), 'on its alerts');
  await win.evaluate(() => document.querySelector('#ntTabs [data-t=bell]').click());   // Notifications was left on another tab
  await win.click('[data-s=mentions] .nt-chip >> nth=0');
  assert.equal(await settingsTab(), 'notify', 'its 🔗 Notifications chip goes back');
  assert.equal(await win.getAttribute('#ntTabs .on', 'data-t'), 'alerts', 'to Alerts, where the grid is');
  await win.click('#ntGrid .seg[data-al="mention.notify"] [data-v=always]');
  await win.click('#ntGrid .k-spam [data-go]');
  assert.ok(await win.isVisible('[data-s=spam] .st-subpane[data-t=alerts]'), 'More on Spam alerts');
  await win.click('#settingsDlg .st-rail [data-s=mentions]');
  assert.equal(await win.inputValue('[data-s=mentions] [data-al="mention.notify"]'), 'always', 'the grid\'s Desktop is the page\'s Desktop notification');
  await win.selectOption('[data-s=mentions] [data-al="mention.notify"]', 'unfocused');
  await win.click('#settingsDlg .st-rail [data-s=notify]');
  assert.equal(await win.getAttribute('#ntGrid .seg[data-al="mention.notify"] [data-v=unfocused]', 'aria-checked'), 'true', 'and back');
  await win.click('#settingsDlg .st-rail [data-s=mentions]');
  await win.click('#mentTabs [data-t=names]');
  await win.keyboard.press('Escape');
  await win.click('#loginBtn');
  await win.click('#accountMenu .am-more');
  assert.equal(await settingsTab(), 'accounts');
  assert.ok(await win.isHidden('#accountMenu'), 'the menu closes');
  const tabs = await win.$$eval('#settingsDlg .st-rail button', b => b.filter(x => !x.hidden).map(x => x.dataset.s));
  assert.deepEqual(tabs, ['general', 'layouts', 'themes', 'accounts', 'youtube', 'extensions', 'notify', 'mentions', 'spam', 'guide', 'keys', 'updates']);
  assert.ok(await win.isVisible('#settingsDlg .am-watch'), 'Watch signed in moved here');
  assert.ok(await win.isHidden('#mentUser'), 'your usernames are under Mentions');
  await win.click('#settingsDlg .st-rail [data-s=mentions]');
  assert.ok(await win.isVisible('#mentUser'), 'here');
  await win.click('#settingsDlg .st-rail [data-s=accounts]');

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

test('Settings > YouTube: the YouTube login, Skip ads and the cookie question (on to start with), Chat to show, and the API key', T, async () => {
  await win.evaluate(() => window.openSettings('accounts'));
  await win.click('#settingsDlg [data-go=youtube]');
  assert.equal(await settingsTab(), 'youtube', 'Accounts links to it');
  assert.ok(await win.isVisible('#settingsDlg .st-pane[data-s=youtube] .am-row[data-p=youtube] .am-imp'), 'the YouTube login is here too');
  assert.ok(await win.isVisible('#settingsDlg .am-yk'), 'and the API key');
  assert.equal(await win.isChecked('#ytSkip'), true);
  assert.equal(await win.isChecked('#ytConsent'), true);
  assert.equal(await win.inputValue('#ytConsentPick'), 'reject');
  assert.equal(await win.inputValue('#ytChatView'), 'top');
  await win.uncheck('#ytSkip');
  await win.selectOption('#ytConsentPick', 'accept');
  await win.selectOption('#ytChatView', 'live');
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  await win.evaluate(() => window.openSettings('youtube'));
  assert.equal(await win.isChecked('#ytSkip'), false, 'remembered');
  assert.equal(await win.inputValue('#ytConsentPick'), 'accept');
  assert.equal(await win.inputValue('#ytChatView'), 'live');
  await win.uncheck('#ytConsent');
  assert.ok(await win.isDisabled('#ytConsentPick'), 'nothing to pick when it\'s off');
  assert.equal(await win.evaluate(() => localStorage.getItem('kickMultiview.ytConsent')), 'off');
  await win.evaluate(() => { localStorage.removeItem('kickMultiview.ytSkip'); localStorage.removeItem('kickMultiview.ytConsent'); localStorage.removeItem('kickMultiview.ytChatView'); });
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
  await win.fill('#spamTry', 'you can call me Sam, we are going live soon');
  await win.click('#spamTryBtn');
  assert.match(await win.textContent('#spamRes'), /No signs of spam/, 'everyday words aren\'t disguised links');
  await win.fill('#spamTrySender', '@BotRix');
  await win.fill('#spamTry', 'hq ai stream upgrades botkiva com emojiBlowKiss zero cost upgrades emojiBlowKiss');
  await win.press('#spamTrySender', 'Enter');
  assert.equal(await win.textContent('#spamRes'), "Not checked: BotRix is on the chat bot list, so it's never flagged.");
  await win.fill('#spamTrySender', 'botrix_fan');
  await win.click('#spamTryBtn');
  assert.match(await win.textContent('#spamRes'), /Would be flagged/, 'only the whole name');
  await win.fill('#spamTrySender', '');
  await win.click('#spamTabs [data-t=lists]');
  await win.click('#spamListPick [data-l=allow]');
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

test('alert sounds: each one plays, and you can pick your own sound file', T, async () => {
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=alerts]');
  assert.ok(await win.isHidden('#mentUser') && await win.isHidden('[data-add=mbots]'), 'one sub-tab at a time');
  await win.uncheck('#mentOn');
  assert.equal(await win.evaluate(() => localStorage.getItem('kickMultiview.mentOn')), '0', 'mention alerts off');
  assert.ok(await win.$eval('.st-opts[data-for=mention]', e => e.classList.contains('st-dim')), 'their options dim');
  await win.check('#mentOn');
  for (const s of ['chime', 'ping', 'pop', 'knock']) {
    await win.selectOption('[data-s=mentions] [data-al="mention.sound"]', s);
    await win.click('[data-play=mention]');
  }
  // your own sound: a tiny WAV file
  const wav = path.join(os.tmpdir(), `smv-test-${process.pid}.wav`);
  const n = 800, buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(8000, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40); buf.fill(128, 44);
  fs.writeFileSync(wav, buf);
  // picked in the app's own list (not the system menu), it can still open the file picker; Escape there closes only the list
  await win.click('[data-s=mentions] [data-al="mention.sound"]');
  await win.keyboard.press('Escape');
  assert.equal(await win.isVisible('#settingsDlg'), true, 'Escape closed the list, not Settings');
  await win.click('[data-s=mentions] [data-al="mention.sound"]');
  const chooser = win.waitForEvent('filechooser');
  await win.click('.dd-list button:text-is("Your own sound")');
  await (await chooser).setFiles(wav);
  assert.equal(await win.isVisible('#settingsDlg'), true, 'Settings is still open');
  await win.waitForFunction(() => /^data:audio/.test(localStorage.getItem('kickMultiview.alertSound.mention') || ''));
  assert.equal(await win.inputValue('[data-s=mentions] [data-al="mention.sound"]'), 'custom');
  await win.click('[data-play=mention]');
  // picking it again and cancelling keeps what you had
  await win.selectOption('[data-s=mentions] [data-al="mention.sound"]', 'pop');
  const again = win.waitForEvent('filechooser');
  await win.selectOption('[data-s=mentions] [data-al="mention.sound"]', 'custom');
  await (await again).setFiles([]);
  await win.waitForTimeout(300);
  assert.equal(await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).mention.sound), 'pop');
  await win.keyboard.press('Escape');
  fs.rmSync(wav, { force: true });
});

test('spam alerts lists: remove an item, and Reset brings back the built-in list', T, async () => {
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=lists]');
  await win.click('#spamListPick [data-l=words]');
  const words = () => win.$$eval('[data-list=words] .st-chip > span', l => l.map(x => x.textContent));
  const before = await words();
  await win.click('[data-list=words] .st-chip:has-text("cheap") button');
  assert.deepEqual(await words(), before.filter(w => w !== 'cheap'));
  await win.fill('[data-add=words]', ''); await win.click('[data-addbtn=words]');
  assert.match(await win.textContent('#msg'), /Type a word or phrase/);
  await win.click('#spamListPick [data-l=allow]');
  await win.fill('[data-add=allow]', 'not a site'); await win.click('[data-addbtn=allow]');
  assert.match(await win.textContent('#msg'), /Type a site like example\.com/);
  const bots = () => win.$$eval('[data-list=ignore] .st-chip > span', l => l.map(x => x.textContent));
  const builtIn = await bots();
  assert.ok(builtIn.includes('botrix') && builtIn.includes('nightbot'), 'filled with common chat bots');
  await win.click('#spamListPick [data-l=ignore]');
  await win.uncheck('[data-al="spam.sharedBots"]');   // their own list
  await win.fill('[data-add=ignore]', '@MyTimerBot'); await win.press('[data-add=ignore]', 'Enter');
  assert.deepEqual(await bots(), [...builtIn, 'mytimerbot'], 'kept lower case, without the @');
  await win.click('[data-list=ignore] .st-chip:has-text("nightbot") button');
  assert.ok(!(await bots()).includes('nightbot'));
  await win.fill('[data-add=ignore]', ' '); await win.click('[data-addbtn=ignore]');
  assert.match(await win.textContent('#msg'), /Type a chat bot's name/);
  await win.click('[data-reset=ignore]');
  assert.deepEqual(await bots(), builtIn, 'back to the built-in bots');
  await win.check('[data-al="spam.sharedBots"]');
  await win.click('#spamListPick [data-l=words]');
  await win.click('[data-reset=words]');
  assert.deepEqual(await words(), before, 'back to the built-in words');
  assert.equal(await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).spam.words), null);
  await win.keyboard.press('Escape');
});

test('chat bots: the list is in Mentions, spam alerts show it until they get their own, and new built-in bots reach a list you changed once', T, async () => {
  const chips = sel => win.$$eval(`${sel} .st-chip > span`, l => l.map(x => x.textContent));
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=bots]');
  await win.fill('[data-add=mbots]', '@Mention_Only_Bot'); await win.press('[data-add=mbots]', 'Enter');
  assert.ok((await chips('[data-list=mbots]')).includes('mention_only_bot'), 'kept lower case, without the @');
  await win.fill('[data-add=mbots]', ''); await win.click('[data-addbtn=mbots]');
  assert.match(await win.textContent('#msg'), /Type a chat bot's name/);

  // spam alerts: the same list, read-only, with a way to it
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=lists]');
  await win.click('#spamListPick [data-l=ignore]');
  assert.equal(await win.isChecked('[data-al="spam.sharedBots"]'), true, 'shared to start with');
  assert.deepEqual(await chips('[data-list=ignore]'), await chips('[data-list=mbots]'));
  assert.equal(await win.textContent('[data-lcount=ignore]'), String((await chips('[data-list=ignore]')).length), 'its count on the left');
  assert.equal(await win.$$eval('[data-list=ignore] .st-chip button', b => b.length), 0, 'nothing to remove here');
  assert.ok(await win.isHidden('[data-add=ignore]') && await win.isHidden('[data-reset=ignore]'), 'nothing to add or reset');
  assert.ok(await win.isHidden('[data-add=allow]'), 'one list at a time');
  await win.click('[data-s=spam] [data-go=mentions][data-sub=bots]');
  assert.ok(await win.isVisible('[data-add=mbots]'), 'the link opens Mentions > Chat bots');

  // their own list: editable, and apart from mentions
  await win.evaluate(() => window.openSettings('spam'));
  await win.uncheck('[data-al="spam.sharedBots"]');
  assert.match(await win.textContent('#msg'), /Spam alerts have their own chat bot list/);
  assert.ok(await win.isHidden('[data-s=spam] [data-go=mentions]'));
  assert.ok(!(await chips('[data-list=ignore]')).includes('mention_only_bot'), 'starts as the built-in list');
  await win.fill('[data-add=ignore]', 'spam_only_bot'); await win.click('[data-addbtn=ignore]');
  assert.ok(!(await chips('[data-list=mbots]')).includes('spam_only_bot'), 'not in Mentions');
  await win.click('[data-reset=ignore]');
  await win.check('[data-al="spam.sharedBots"]');
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('[data-reset=mbots]');
  await win.keyboard.press('Escape');

  // from before mentions had a list: the one made for spam alerts is the shared one, with the bots built in since added once
  await win.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('kickMultiview.alerts') || '{}');
    delete a.mention.bots; delete a.mention.botsOffered;
    a.spam = { ...a.spam, ignore: ['botrix', 'mytimerbot'], botsOffered: null };
    localStorage.setItem('kickMultiview.alerts', JSON.stringify(a));
  });
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  const saved = () => win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')));
  const added = ['botrix', 'mytimerbot', 'griddlebot', 'kickpulsebot', 'kicklet', 'lumiastream'];
  assert.deepEqual((await saved()).mention.bots, added);
  assert.deepEqual((await saved()).spam.ignore, added, 'and to the spam alerts\' own list');
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=bots]');
  await win.click('[data-list=mbots] .st-chip:has-text("kicklet") button');
  await win.keyboard.press('Escape');
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  assert.ok(!(await saved()).mention.bots.includes('kicklet'), 'removed: stays removed');
  await win.evaluate(() => window.openSettings('mentions'));
  await win.click('#mentTabs [data-t=bots]');
  await win.click('[data-reset=mbots]');
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=lists]'); await win.click('#spamListPick [data-l=ignore]');
  await win.uncheck('[data-al="spam.sharedBots"]'); await win.click('[data-reset=ignore]'); await win.check('[data-al="spam.sharedBots"]');
  await win.keyboard.press('Escape');
});

test('a window\'s "open in its own window" and mod view buttons open app windows', T, async () => {
  await app.evaluate(({ app: eapp, session, ipcMain }) => {
    const fake = s => { try { s.protocol.handle('https', () => new Response('<!doctype html><title>stand-in</title>', { headers: { 'content-type': 'text/html' } })); } catch {} };
    ['persist:kick', 'persist:twitch'].forEach(p => fake(session.fromPartition(p)));
    eapp.on('session-created', fake);
    ipcMain.removeHandler('mod:check'); ipcMain.handle('mod:check', () => true);
  });
  await openChannel(win, 'alpha', 'chat');
  const opened = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.webContents.getURL()).filter(u => /^https:/.test(u) && !/robots\.txt/.test(u)));   // (not the hidden live checker)
  await win.waitForSelector('#stage .win.chat [data-a=mod]:not([hidden])');
  await win.click('#stage .win.chat [data-a=pop]');
  await win.click('#stage .win.chat [data-a=mod]');
  for (let i = 0; i < 50 && (await opened()).length < 2; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual((await opened()).sort(), ['https://dashboard.kick.com/moderator/alpha', 'https://kick.com/popout/alpha/chat']);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => /^https:/.test(w.webContents.getURL()) && !/robots/.test(w.webContents.getURL())).forEach(w => w.close()));
  await win.click('#stage .win.chat [data-a=close]');
  await setMode(win, 'both');
});

test('logging out really clears that site\'s login', T, async () => {
  await app.evaluate(({ session }) => session.fromPartition('persist:twitch').cookies.set({ url: 'https://www.twitch.tv', name: 'login', value: 'someone' }));
  assert.equal((await win.evaluate(() => window.kmv.accountsStatus())).twitch, 'someone');
  const changed = win.evaluate(() => new Promise(r => window.kmv.onAccountChanged(info => r(info))));
  await win.evaluate(() => window.kmv.logout('twitch'));
  assert.deepEqual(await changed, { platform: 'twitch', loggedOut: true }, 'the page hears about it');
  assert.equal((await win.evaluate(() => window.kmv.accountsStatus())).twitch, null);
  assert.deepEqual(pageErrors, []);
});
