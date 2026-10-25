// The search box (Ctrl/⌘+K, #184) in the real app: the keys from inside a chat's or a stream's page (a web view keeps
// its keys, so main.js passes them on), the menu bar's View › Search and actions…, an action run from it (Pop out
// streams), the box in the Streams window, and Settings › Search box switching it off.
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel } = require('../app');

let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  await viewLoaded(a.win, 'alpha', 'stream', /player\.kick\.com/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const isOpen = win => win.evaluate(() => window.palette.isOpen());
const close = async win => { if (await isOpen(win)) await win.evaluate(() => window.palette.close()); };
// Ctrl+K (⌘K on a Mac) pressed inside a web view's page, as the keyboard would: the app's main process hears it
// before the page does (before-input-event)
function keysInView(kind, mods){
  return a.app.evaluate(({ webContents }, [kind, mods]) => {
    const re = kind === 'chat' ? /popout\/alpha\/chat/ : /player\.kick\.com/;
    const wc = webContents.getAllWebContents().find(w => w.getType() === 'webview' && re.test(w.getURL()));
    if (!wc) return false;
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: mods });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: mods });
    return true;
  }, [kind, mods]);
}
const MOD = process.platform === 'darwin' ? 'meta' : 'control';

test('Ctrl/⌘+K inside a chat or a stream opens the box of the window holding it, and again closes it', { timeout: 60000 }, async () => {
  for (const kind of ['chat', 'stream']){
    await close(a.win);
    assert.equal(await keysInView(kind, [MOD]), true, `the ${kind}'s page is there`);
    await a.win.waitForFunction(() => window.palette.isOpen());
    assert.equal(await keysInView(kind, [MOD]), true);
    await a.win.waitForFunction(() => !window.palette.isOpen());
  }
  // with Shift or the other modifier it's the page's own key
  await keysInView('chat', [MOD, 'shift']);
  await keysInView('chat', [MOD === 'meta' ? 'control' : 'meta']);
  await a.win.waitForTimeout(300);
  assert.equal(await isOpen(a.win), false);
});

test('the menu bar: View › Search and actions… (Ctrl/⌘+K) opens it', { timeout: 30000 }, async () => {
  await close(a.win);
  const item = await a.app.evaluate(({ Menu }) => {
    const view = Menu.getApplicationMenu().items.find(i => i.label === 'View');
    const it = view.submenu.items.find(i => i.label === 'Search and actions…');
    if (!it) return null;
    it.click();
    return { accel: it.accelerator, first: view.submenu.items[0] === it };
  });
  assert.deepEqual(item, { accel: 'CmdOrCtrl+K', first: true });
  await a.win.waitForFunction(() => window.palette.isOpen());
  await close(a.win);
});

test('Settings › Search box off: Ctrl/⌘+K inside a stream and the menu bar\'s Search and actions… only say where to turn it on', { timeout: 60000 }, async () => {
  await close(a.win);
  const lead = '#settingsDlg .st-pane[data-s=search] .st-lead';
  await a.win.evaluate(() => window.openSettings('search'));
  await a.win.click(lead);
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.isVisible('#palBtn'), false, 'no Search button');
  const said = () => a.win.waitForFunction(() => document.querySelector('#msg').textContent === 'The search box is off. Turn it on in Settings › Search box');
  assert.equal(await keysInView('stream', [MOD]), true);
  await said();
  await a.win.evaluate(() => { document.querySelector('#msg').textContent = ''; });
  await a.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.label === 'View').submenu.items.find(i => i.label === 'Search and actions…').click());
  await said();
  await a.win.waitForTimeout(300);
  assert.equal(await isOpen(a.win), false, 'it never opened');
  // on again
  await a.win.evaluate(() => window.openSettings('search'));
  await a.win.click(lead);
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.isVisible('#palBtn'), true);
  assert.equal(await keysInView('stream', [MOD]), true);
  await a.win.waitForFunction(() => window.palette.isOpen());
  await close(a.win);
});

test('an action from the box in the real app: Pop out streams, then the box in the Streams window', { timeout: 60000 }, async () => {
  await a.win.keyboard.press('ControlOrMeta+k');
  await a.win.type('#palQ', 'pop out streams');
  await a.win.waitForTimeout(100);
  assert.equal((await a.win.evaluate(() => window.palette.rows()))[0].title, 'Pop out streams');
  await a.win.keyboard.press('Enter');
  // the Streams window (once its page has loaded: the window first shows a blank page)
  let sw;
  for (let i = 0; i < 150; i++){
    sw = a.app.windows().find(p => !p.isClosed() && /role=streams/.test(p.url()));
    if (sw && await sw.evaluate(() => !!window.palette && !!document.querySelector('#stage .win.stream')).catch(() => false)) break;
    sw = null; await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(sw, 'the Streams window opened, with the stream in it');
  await sw.keyboard.press('ControlOrMeta+k');
  assert.equal(await isOpen(sw), true);
  await sw.type('#palQ', '>');
  const titles = (await sw.evaluate(() => window.palette.rows())).map(r => r.title);
  for (const want of ['Tile', 'Spotlight', 'Bring streams back']) assert.ok(titles.includes(want), `${want} in ${titles}`);
  assert.ok(!titles.includes('Pop out streams') && !titles.includes('Lock layout'), 'not the main window\'s');
  await sw.fill('#palQ', 'bring streams back');
  await sw.keyboard.press('Enter').catch(() => {});     // (the window closes as the key goes down)
  await a.win.waitForFunction(() => !!document.querySelector('#stage .win.stream'), null, { timeout: 15000 });
});
