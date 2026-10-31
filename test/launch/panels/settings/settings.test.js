// Settings and the menu bar in the real desktop app: Settings is where each system expects it (the app menu
// on a Mac, File elsewhere), the Account menu shows one item per site that follows your login, and every
// tab is there. Uses a temporary data folder and needs no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { stubExists, openChannel, setMode } = require('../../app');
const { ROOT, playwright, killApp, tempDir } = require('../../../helpers');

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
  const data = tempDir('settings');
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'updates.json'), JSON.stringify({ auto: false }));
  const env = { ...process.env, SMV_DEV_DATA: data, SMV_UPDATE_API: 'http://127.0.0.1:9', ELECTRON_ENABLE_LOGGING: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright()._electron.launch({ executablePath: electronPath(), args: ['--no-sandbox', '--use-mock-keychain', ROOT], env, timeout: 60000 });
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
  else assert.ok(items.some(i => /^Exit( \[|$)/.test(i)), items.join(', '));   // (Electron 44 gives it a shortcut)
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
  assert.deepEqual(await menu('Help'), ['Guide', 'Keyboard shortcuts', 'What\'s new', 'Check for updates…']);
  for (const [label, tab] of [['Guide', 'guide'], ['Keyboard shortcuts', 'keys'], ['What\'s new', 'updates'], ['Check for updates', 'updates']]) {
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
  await win.click('#settingsDlg .st-rail [data-s=notify]');
  await win.click('#ntGrid .k-support [data-go]');
  assert.equal(await settingsTab(), 'support', 'More on Support: its own page (#189)');
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
  assert.deepEqual(tabs, ['general', 'windows', 'layouts', 'chat', 'themes', 'search', 'accounts', 'linked', 'apps', 'youtube', 'extensions', 'notify', 'mentions', 'support', 'spam', 'guide', 'keys', 'updates', 'developer']);
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

// #189: at 1600×900 (and bigger) every page and tab fits without scrolling, with the options that show more switched on.
// Keyboard shortcuts, Spam alerts › How it works, the Guide and Updates are pages to read, so they may scroll.
test('no Settings page or tab scrolls at 1600×900', T, async () => {
  const size = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(x => /index\.html$/.test(x.webContents.getURL()));
    const was = w.getContentSize(); w.setContentSize(1600, 900); return was;
  });
  try {
    await win.waitForFunction(() => innerWidth === 1600 && innerHeight === 900);
    const over = await win.evaluate(async () => {
      const wait = () => new Promise(r => setTimeout(r, 120));
      for (const id of ['chatNameSet', 'chatOverlaySet']) if (!document.getElementById(id).checked) document.getElementById(id).click();
      window.openSettings('general'); await wait();
      const dlg = document.getElementById('settingsDlg'), body = dlg.querySelector('.st-body'), out = [];
      for (const b of [...dlg.querySelectorAll('.st-rail button[data-s]')].filter(x => !x.hidden && !['keys', 'guide', 'updates'].includes(x.dataset.s))){
        window.openSettings(b.dataset.s); await wait();
        const tabs = [...dlg.querySelectorAll(`.st-pane[data-s="${b.dataset.s}"] > .st-tabs button[data-t]`)].filter(t => !t.hidden);
        for (const t of tabs.length ? tabs : [null]){
          if (t){ if (b.dataset.s === 'spam' && t.dataset.t === 'how') continue; t.click(); await wait(); }
          if (body.scrollHeight > body.clientHeight) out.push(`${b.dataset.s}${t ? ' › ' + t.dataset.t : ''} +${body.scrollHeight - body.clientHeight}px`);
        }
      }
      for (const id of ['chatNameSet', 'chatOverlaySet']) document.getElementById(id).click();
      return out;
    });
    assert.deepEqual(over, []);
  } finally {
    await win.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows().find(x => /index\.html$/.test(x.webContents.getURL())).setContentSize(...s), size);
  }
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
  const wav = path.join(tempDir('sound'), 'sound.wav');
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
  await win.click('[data-s=spam] [data-al="spam.botsMode"] [data-v=own]');   // their own list
  await win.fill('[data-add=ignore]', '@MyTimerBot'); await win.press('[data-add=ignore]', 'Enter');
  assert.deepEqual(await bots(), [...builtIn, 'mytimerbot'], 'kept lower case, without the @');
  await win.click('[data-list=ignore] .st-chip:has-text("nightbot") button');
  assert.ok(!(await bots()).includes('nightbot'));
  await win.fill('[data-add=ignore]', ' '); await win.click('[data-addbtn=ignore]');
  assert.match(await win.textContent('#msg'), /Type a chat bot's name/);
  await win.click('[data-reset=ignore]');
  assert.deepEqual(await bots(), builtIn, 'back to the built-in bots');
  await win.click('[data-s=spam] [data-al="spam.botsMode"] [data-v=shared]');
  await win.click('#spamListPick [data-l=words]');
  await win.click('[data-reset=words]');
  assert.deepEqual(await words(), before, 'back to the built-in words');
  assert.equal(await win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).spam.words), null);
  await win.keyboard.press('Escape');
});

test('chat bots: one list in Chat › Chat bots for mentions and spam alerts, each can have their own, and new built-in bots reach a list you changed once', T, async () => {
  const chips = sel => win.$$eval(`${sel} .st-chip > span`, l => l.map(x => x.textContent));
  const saved = () => win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')));
  const tryIt = async sender => { await win.fill('#spamTrySender', sender); await win.fill('#spamTry', 'hq ai stream upgrades botkiva com zero cost upgrades'); await win.click('#spamTryBtn'); return win.textContent('#spamRes'); };
  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  assert.ok((await chips('[data-list=mbots]')).includes('botrixofficial'), 'BotRix on Twitch is built in');
  await win.fill('[data-add=mbots]', '@Mention_Only_Bot'); await win.press('[data-add=mbots]', 'Enter');
  assert.ok((await chips('[data-list=mbots]')).includes('mention_only_bot'), 'kept lower case, without the @');
  await win.fill('[data-add=mbots]', ''); await win.click('[data-addbtn=mbots]');
  assert.match(await win.textContent('#msg'), /Type a chat bot's name/);
  for (const k of ['mention', 'spam']) assert.equal(await win.getAttribute(`[data-s=chat] [data-al="${k}.botsMode"] [data-v=shared]`, 'aria-checked'), 'true', `${k}: this list to start with`);

  // spam alerts: the same list, read-only, with a way to it
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=lists]');
  await win.click('#spamListPick [data-l=ignore]');
  assert.deepEqual(await chips('[data-list=ignore]'), await chips('[data-list=mbots]'));
  assert.equal(await win.textContent('[data-lcount=ignore]'), String((await chips('[data-list=ignore]')).length), 'its count on the left');
  assert.equal(await win.$$eval('[data-list=ignore] .st-chip button', b => b.length), 0, 'nothing to remove here');
  assert.ok(await win.isHidden('[data-add=ignore]') && await win.isHidden('[data-reset=ignore]'), 'nothing to add or reset');
  assert.ok(await win.isHidden('[data-add=allow]'), 'one list at a time');
  await win.click('[data-s=spam] [data-shared] [data-go=chat][data-sub=bots]');
  assert.ok(await win.isVisible('[data-add=mbots]'), 'the link opens Chat › Chat bots');

  // their own list: editable, and apart from the app's
  await win.click('[data-s=chat] [data-al="spam.botsMode"] [data-v=own]');
  assert.match(await win.textContent('#msg'), /Spam alerts have their own chat bot list/);
  assert.equal((await saved()).spam.botsMode, 'own');
  await win.evaluate(() => window.openSettings('spam'));
  assert.equal(await win.getAttribute('[data-s=spam] [data-al="spam.botsMode"] [data-v=own]', 'aria-checked'), 'true', 'the same choice in both places');
  assert.ok(await win.isHidden('[data-s=spam] [data-shared]') && await win.isHidden('[data-s=spam] [data-both]'));
  assert.ok(!(await chips('[data-list=ignore]')).includes('mention_only_bot'), 'starts as the built-in list');
  await win.fill('[data-add=ignore]', 'spam_only_bot'); await win.click('[data-addbtn=ignore]');
  assert.ok(!(await chips('[data-list=mbots]')).includes('spam_only_bot'), 'not on the app\'s list');
  await win.click('#spamTabs [data-t=try]');
  assert.match(await tryIt('spam_only_bot'), /Not checked: spam_only_bot is on the chat bot list/);
  assert.doesNotMatch(await tryIt('mention_only_bot'), /Not checked/, 'the app\'s list isn\'t used');
  // both: the app's list and their own
  await win.click('#spamTabs [data-t=lists]');
  await win.click('[data-s=spam] [data-al="spam.botsMode"] [data-v=both]');
  assert.match(await win.textContent('#msg'), /Spam alerts use the app's chat bot list and their own/);
  assert.ok(await win.isVisible('[data-s=spam] [data-both]') && await win.isVisible('[data-add=ignore]'));
  await win.click('#spamTabs [data-t=try]');
  for (const n of ['spam_only_bot', 'mention_only_bot']) assert.match(await tryIt(n), /Not checked/, n);
  await win.click('#spamTabs [data-t=lists]');
  await win.click('[data-reset=ignore]');
  await win.click('[data-s=spam] [data-al="spam.botsMode"] [data-v=shared]');
  assert.match(await win.textContent('#msg'), /Spam alerts use the app's chat bot list \(Chat › Chat bots\)/);

  // mentions: their own list, in Mentions › Chat bots
  await win.evaluate(() => window.openSettings('mentions', { sub: 'bots' }));
  assert.ok(await win.isVisible('[data-s=mentions] [data-mshared] [data-go=chat]') && await win.isHidden('[data-add=mownbots]'));
  await win.click('[data-s=mentions] [data-al="mention.botsMode"] [data-v=own]');
  assert.ok(await win.isHidden('[data-s=mentions] [data-mshared]') && await win.isVisible('[data-add=mownbots]'));
  assert.ok(!(await chips('[data-list=mownbots]')).includes('mention_only_bot'), 'starts as the built-in list');
  await win.fill('[data-add=mownbots]', '@OwnBot'); await win.click('[data-addbtn=mownbots]');
  assert.deepEqual((await saved()).mention.ownBots.slice(-1), ['ownbot']);
  await win.click('[data-reset=mownbots]');
  await win.click('[data-s=mentions] [data-al="mention.botsMode"] [data-v=shared]');
  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  await win.click('[data-reset=mbots]');
  await win.keyboard.press('Escape');

  // from before mentions had a list: the one made for spam alerts is the shared one, with the bots built in since added
  // once. Promo words and bot lines you changed get the ones built in since too.
  await win.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('kickMultiview.alerts') || '{}');
    delete a.mention.bots; delete a.mention.botsOffered;
    a.spam = { ...a.spam, ignore: ['botrix', 'mytimerbot'], botsOffered: null, words: ['upgrade', 'subs'], wordsOffered: null,
               openers: ['Hey stranger, still running the show?'], openersOffered: null };
    localStorage.setItem('kickMultiview.alerts', JSON.stringify(a));
  });
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  const added = ['botrix', 'mytimerbot', 'griddlebot', 'kickpulsebot', 'kicklet', 'lumiastream', 'botrixofficial', 'botrixoficial'];
  assert.deepEqual((await saved()).mention.bots, added);
  assert.deepEqual((await saved()).spam.ignore, added, 'and to the spam alerts\' own list');
  assert.deepEqual((await saved()).spam.words, ['upgrade', 'subs', 'chatbot', 'make your stream', 'stays active', 'engagement', 'organic', 'traffic', 'ai-driven'], 'new promo words');
  assert.deepEqual((await saved()).spam.openers, ['Hey stranger, still running the show?', 'If you do not wish to receive any more messages', 'type !noads'], 'new bot lines');
  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  await win.click('[data-list=mbots] .st-chip:has-text("kicklet") button');
  await win.keyboard.press('Escape');
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  assert.ok(!(await saved()).mention.bots.includes('kicklet'), 'removed: stays removed');

  // from before Chat › Chat bots: spam alerts with their own list. It joins the app's list, and they use that
  await win.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('kickMultiview.alerts') || '{}');
    a.mention.bots = ['botrix', 'nightbot']; a.mention.botsOffered = null;
    a.spam = { ...a.spam, sharedBots: false, ignore: ['NightBot', 'promo_watch'] }; delete a.spam.botsMode;
    localStorage.setItem('kickMultiview.alerts', JSON.stringify(a));
  });
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  const now = await saved();
  assert.deepEqual(now.mention.bots.slice(0, 3), ['botrix', 'nightbot', 'promo_watch'], 'merged, without NightBot twice');
  assert.equal(now.spam.botsMode, 'shared');
  assert.ok(!('sharedBots' in now.spam), 'the old switch is gone');
  // and an app that shared the list keeps it as it was
  await win.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('kickMultiview.alerts') || '{}');
    a.mention.bots = ['botrix']; a.spam = { ...a.spam, sharedBots: true, ignore: ['ownonly'] }; delete a.spam.botsMode;
    localStorage.setItem('kickMultiview.alerts', JSON.stringify(a));
  });
  await win.reload();
  await win.waitForSelector('#loginBtn:not([hidden])');
  assert.ok(!(await saved()).mention.bots.includes('ownonly'), 'its unused own list doesn\'t join');
  assert.equal((await saved()).spam.botsMode, 'shared');

  await win.evaluate(() => window.openSettings('chat', { sub: 'bots' }));
  await win.click('[data-reset=mbots]');
  await win.evaluate(() => window.openSettings('spam'));
  await win.click('#spamTabs [data-t=lists]'); await win.click('#spamListPick [data-l=ignore]');
  await win.click('[data-s=spam] [data-al="spam.botsMode"] [data-v=own]'); await win.click('[data-reset=ignore]'); await win.click('[data-s=spam] [data-al="spam.botsMode"] [data-v=shared]');
  for (const l of ['words', 'openers']){ await win.click(`#spamListPick [data-l=${l}]`); await win.click(`[data-reset=${l}]`); }
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
