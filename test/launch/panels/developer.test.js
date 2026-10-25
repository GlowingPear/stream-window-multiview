// Settings › Developer in the real app: the switch (and what it adds to the chats' right-click menu and the windows'
// ⋯ menu), the error log, the sites' answers, Copy diagnostics, Save as file, Copy window state, Inspect, Copy chat
// HTML and Why didn't this alert?. What's copied is caught on its way to the clipboard (the test files share it).
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');

const T = { timeout: 90000 };
const CHAT = /popout\/alpha\/chat/;
let a, out;
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (!(v = await fn().catch(() => null)) && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return v; };
test.before(async () => {
  a = await launchApp();
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-dev-'));
  await a.app.evaluate(({ Menu, clipboard, dialog }, out) => {
    const t = globalThis.__d = { menus: [], copied: null, saved: [] };
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text, ...rest) => { t.copied = text; return writeText(text, ...rest); };
    Menu.buildFromTemplate = tmpl => { t.menus.push(tmpl); return { popup() {} }; };
    dialog.showSaveDialog = async (_w, o) => { t.saved.push(o.defaultPath); return { canceled: false, filePath: out + '/' + path.basename(o.defaultPath) }; };
    const path = require('path');
  }, out).catch(async () => {
    // (require isn't there: the same without path)
    await a.app.evaluate(({ Menu, clipboard, dialog }, out) => {
      const t = globalThis.__d = { menus: [], copied: null, saved: [] };
      const writeText = clipboard.writeText.bind(clipboard);
      clipboard.writeText = (text, ...rest) => { t.copied = text; return writeText(text, ...rest); };
      Menu.buildFromTemplate = tmpl => { t.menus.push(tmpl); return { popup() {} }; };
      dialog.showSaveDialog = async (_w, o) => { t.saved.push(o.defaultPath); return { canceled: false, filePath: out + '/' + String(o.defaultPath).split(/[\\/]/).pop() }; };
    }, out);
  });
  // what the page copies (navigator.clipboard)
  await a.win.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve(); }; });
  await openChannel(a.win, 'alpha', 'chat');
  await viewLoaded(a.win, 'alpha', 'chat', CHAT);
  await until(() => inView(a.win, 'alpha', 'chat', () => !!window.__kmvMsg && !!window.__kmvMention));
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const copied = () => a.win.evaluate(() => window.__copied.at(-1) || '');
const pane = sel => a.win.locator('#settingsDlg .st-pane[data-s=developer] ' + sel);
async function rightClick(params = {}) {
  const n = await a.app.evaluate(async ({ webContents }, [re, params]) => {
    const wc = webContents.getAllWebContents().find(w => new RegExp(re).test(w.getURL()));
    const before = globalThis.__d.menus.length;
    wc.emit('context-menu', { preventDefault() {} }, { x: 1, y: 1, editFlags: {}, ...params });
    for (let i = 0; i < 20 && globalThis.__d.menus.length === before; i++) await new Promise(r => setTimeout(r, 50));
    return globalThis.__d.menus.length - 1;
  }, [CHAT.source, params]);
  const labels = await a.app.evaluate((_, n) => globalThis.__d.menus[n].map(x => x.type === 'separator' ? '—' : x.label + (x.enabled === false ? ' (off)' : '')), n);
  return { labels, pick: label => a.app.evaluate((_, [n, label]) => globalThis.__d.menus[n].find(x => x.label === label).click(), [n, label]) };
}
// a Kick-style message in the stand-in chat, right-clicked in the page
async function pressMessage() {
  await inView(a.win, 'alpha', 'chat', () => {
    if (!document.querySelector('[data-index="7"]')) document.body.insertAdjacentHTML('beforeend', '<div data-index="7"><div><div><button>quietkoala</button></div><span aria-hidden="true">:&nbsp;</span></div><span class="font-normal">hello there</span></div>');
    document.querySelector('[data-index="7"] button').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
    return true;
  });
}

test('the switch: asked about the first time, then the chats\' menu has a Developer group and the windows\' ⋯ menu Copy window state and Inspect', T, async () => {
  await a.win.evaluate(() => window.openSettings('developer'));
  assert.equal(await pane('h4').textContent(), 'Developer');
  assert.equal(await pane('h4 .gd-q').getAttribute('aria-label'), 'Help: Developer tools', 'with its ?');
  assert.equal(await a.win.isChecked('#devOn'), false, 'off at first');
  await pressMessage();
  assert.ok(!(await rightClick()).labels.some(l => /Developer|HTML|alert/.test(l)), 'off: no Developer group');
  // the first time: what Inspect can see, and Cancel keeps it off
  await a.win.click('label:has(#devOn)');
  await a.win.waitForSelector('#askDlg:not([hidden])');
  assert.match(await a.win.textContent('#askMsg'), /login/);
  await a.win.click('#askDlg .ask-no');
  assert.equal(await a.win.isChecked('#devOn'), false);
  await a.win.click('label:has(#devOn)');
  await a.win.click('#askDlg .ask-yes');
  assert.equal(await a.win.isChecked('#devOn'), true);
  // the chat's menu, on a message
  await pressMessage();
  const m = await rightClick();
  assert.deepEqual(m.labels.slice(-6), ['—', 'Developer (off)', 'Copy message HTML', 'Copy chat HTML', 'Why didn\'t this alert?', 'Inspect']);
  // off and on again: not asked again
  await a.win.click('label:has(#devOn)');
  assert.equal(await a.win.isChecked('#devOn'), false);
  await a.win.click('label:has(#devOn)');
  assert.equal(await a.win.isVisible('#askDlg'), false, 'asked only the first time');
  assert.equal(await a.win.isChecked('#devOn'), true);
  // the chat window's ⋯ menu
  await a.win.keyboard.press('Escape');
  const chat = a.win.locator('#stage .win.chat');
  await chat.locator('[data-a=more]').click();
  assert.deepEqual(await a.win.$$eval('#barMenu > *', e => e.map(x => x.textContent.trim())).then(l => l.slice(-3)), ['Developer', 'Copy window state', 'Inspect']);
  await a.win.click('#barMenu button:has-text("Copy window state")');
  const state = await until(copied);
  assert.match(state, /^alpha · Kick · chat\naddress   https:\/\/kick\.com\/popout\/alpha\/chat/);
  assert.match(state, /\nloaded    yes\n/);
  assert.match(state, /\nhelpers   emote ✓ {2}translate ✓ {2}message ✓ {2}mentions ✓/);
  // Inspect: Chrome's developer tools for that page (caught, so none open)
  await a.app.evaluate(({ webContents }) => webContents.getAllWebContents().forEach(w => { w.openDevTools = () => { globalThis.__inspected = w.getURL(); }; }));
  await chat.locator('[data-a=more]').click();
  await a.win.click('#barMenu button:has-text("Inspect")');
  assert.match(await until(() => a.app.evaluate(() => globalThis.__inspected)), CHAT);
});

test('Copy chat HTML and Why didn\'t this alert?, from a message', T, async () => {
  await a.win.evaluate(() => window.devTools.setDev(true));
  await pressMessage();
  let m = await rightClick();
  await m.pick('Copy chat HTML');
  const html = await until(() => a.app.evaluate(() => /Stream Multiview/.test(globalThis.__d.copied || '') && globalThis.__d.copied));
  assert.match(html, /^<!-- Stream Multiview [\d.]+ · kick\.com\/popout\/alpha\/chat · the last 1 of 1 messages · \d{4}-/);
  assert.match(html, /quietkoala.*hello there/s);
  await a.win.waitForSelector('#msg:has-text("Copied the chat’s HTML (1 message")');
  // Why didn't this alert?: no Kick username set, so nothing to look for
  await pressMessage();
  m = await rightClick();
  await m.pick('Why didn\'t this alert?');
  await a.win.waitForSelector('#whyDlg');
  assert.equal(await a.win.textContent('#whyDlg .why-line'), 'quietkoala: hello there');
  const rows = await a.win.$$eval('#whyDlg .why-row', e => e.map(x => x.textContent));
  assert.ok(rows.includes('✓Read as a message: name quietkoala, text “hello there”'), rows.join('\n'));
  assert.ok(rows.includes('✗No Kick username to look forSettings › Mentions › Your usernames'), rows.join('\n'));
  assert.match(await a.win.textContent('#whyDlg .why-verdict'), /^No alert: /);
  await a.win.click('#whyDlg button:text-is("Copy")');
  assert.match(await until(copied), /^How this message was read · alpha · Kick\nquietkoala: hello there\n✓ Read as a message/);
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.locator('#whyDlg').count(), 0, 'Esc closes it');
});

test('the error log and the sites\' answers: from the main process, the page and the chats\' helpers; Copy diagnostics, Save as file and Clear', T, async () => {
  await a.win.evaluate(() => window.devTools.setDev(true));
  await a.app.evaluate(() => console.error('main went wrong'));
  await a.win.evaluate(() => { dispatchEvent(new ErrorEvent('error', { message: 'page went wrong', filename: 'app://x/src/page/windows/pause.js', lineno: 88 })); });
  await a.win.evaluate(() => { dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('promise went wrong') })); });
  await inView(a.win, 'alpha', 'chat', () => { setTimeout(() => { null.helperWentWrong(); }); return true; });
  // a site that didn't answer (a closed port: no time limit to wait for)
  await a.app.evaluate(() => fetch('https://kick.com:1/api/v2/channels/alpha?token=SECRET').catch(() => null));
  await a.win.evaluate(() => window.openSettings('developer'));
  await until(() => a.win.evaluate(() => document.querySelectorAll('#devList .dv-row').length >= 4));
  const rows = await a.win.$$eval('#devList .dv-row', e => e.map(x => x.querySelector('.dv-src').textContent + ' ' + x.querySelector('.dv-msg').textContent));
  assert.ok(rows.includes('MAIN main went wrong'), rows.join('\n'));
  assert.ok(rows.includes('PAGE windows/pause.js:88: page went wrong'), rows.join('\n'));
  assert.ok(rows.includes('PAGE promise: promise went wrong'), rows.join('\n'));
  assert.ok(rows.some(r => /^CHAT alpha \d+:\d+: .*helperWentWrong/.test(r)), rows.join('\n'));
  assert.match(await a.win.textContent('#devTabs [data-t=errors]'), /^Errors \(\d+\)$/);
  // the sites' answers: Errors only, and a click copies the request and the answer
  await a.win.click('#devTabs [data-t=responses]');
  await a.win.click('#devList .dv-f:has-text("Errors only")');
  const resp = a.win.locator('#devList .dv-resp', { hasText: 'kick.com:1' }).first();
  assert.match(await resp.textContent(), /Kickchannel · GET https:\/\/kick\.com:1\/api\/v2\/channels\/alpha\?token=…failed/);
  await resp.click();
  assert.match(await until(copied), /^GET https:\/\/kick\.com:1\/api\/v2\/channels\/alpha\?token=…\n→ failed: /);
  // Copy diagnostics: the app, the system, the windows, the errors
  await a.win.click('#devCopy');
  const report = await until(async () => { const c = await copied(); return /^## Stream Multiview diagnostics/.test(c) && c; });
  assert.match(report, /\nversion   [\d.]+ \(from source\) · Electron [\d.]+ · Chrome [\d.]+\n/);
  assert.match(report, /\nwindows   main window · layout \w+ · 0 streams, 1 chat\n {2}Kick {6}alpha +chat +loaded/);
  assert.match(report, /\ndeveloper tools on\n/);
  assert.match(report, /## Errors \(\d+, newest first\)\n[\s\S]*main went wrong/);
  assert.match(report, /## Site responses \(\d+, newest first\)\n.*kick +channel +failed/);
  assert.ok(!/SECRET/.test(report), 'nothing private');
  // Save as file: in Downloads by default, with the date in its name
  await a.win.click('#devSave');
  const saved = await until(() => a.app.evaluate(() => globalThis.__d.saved[0]));
  assert.match(path.basename(saved), /^stream-multiview-diagnostics-\d{8}-\d{4}\.txt$/);
  const file = path.join(out, path.basename(saved));
  await until(async () => fs.existsSync(file));
  assert.match(fs.readFileSync(file, 'utf8'), /^## Stream Multiview diagnostics/);
  // kept for the next run
  await until(async () => fs.existsSync(path.join(a.data, 'Stream Multiview', 'error-log.json')), 9000);
  assert.ok(JSON.parse(fs.readFileSync(path.join(a.data, 'Stream Multiview', 'error-log.json'), 'utf8')).some(e => e.msg === 'main went wrong'));
  // Clear
  await a.win.click('#devClear');
  await a.win.click('#devTabs [data-t=errors]');
  await until(() => a.win.evaluate(() => /No errors/.test(document.querySelector('#devList').textContent)));
});
