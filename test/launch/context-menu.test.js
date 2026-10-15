// The right-click menu in the real app: chat and stream windows get it (the app's own page doesn't), and its
// items do their job. The menu is read instead of shown, and links "open" into a list instead of the browser.
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, viewLoaded, assert, openChannel } = require('./app');

const T = { timeout: 60000 };
let a, out;
test.before(async () => {
  a = await launchApp();
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-menu-'));
  await a.app.evaluate(({ Menu, shell, session }, out) => {
    const t = globalThis.__m = { menus: [], opened: [], saved: [] };
    Menu.buildFromTemplate = tmpl => { t.menus.push(tmpl); return { popup() {} }; };
    shell.openExternal = async u => { t.opened.push(u); };
    // "Save image as…": answer the save dialog with a folder of the test's
    session.fromPartition('persist:kick').on('will-download', (_e, item) => {
      item.setSaveDialogOptions = o => { t.saved.push(o.defaultPath); item.setSavePath(out + '/' + String(o.defaultPath).split(/[\\/]/).pop()); };
    });
  }, out);
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  await viewLoaded(a.win, 'alpha', 'stream', /player\.kick\.com\/alpha/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// Right-click in a view: the menu it got (labels), and a way to pick one of its items.
async function rightClick(urlRe, params) {
  const n = await a.app.evaluate(({ webContents }, [re, params]) => {
    const wc = webContents.getAllWebContents().find(w => new RegExp(re).test(w.getURL()));
    const before = globalThis.__m.menus.length;
    wc.emit('context-menu', { preventDefault() {} }, { x: 1, y: 1, editFlags: {}, ...params });
    return globalThis.__m.menus.length > before ? globalThis.__m.menus.length - 1 : -1;
  }, [urlRe.source, params]);
  if (n < 0) return null;
  const labels = await a.app.evaluate((_, n) => globalThis.__m.menus[n].map(x => x.type === 'separator' ? '—' : x.label), n);
  return { labels, pick: label => a.app.evaluate((_, [n, label]) => globalThis.__m.menus[n].find(x => x.label === label).click(), [n, label]) };
}
const state = () => a.app.evaluate(() => globalThis.__m);

test('chat and stream windows get the menu; the app\'s own page does not', T, async () => {
  assert.deepEqual((await rightClick(/popout\/alpha\/chat/, {})).labels, ['Reload', '—', 'Inspect'], 'Inspect: this is a dev copy');
  assert.deepEqual((await rightClick(/player\.kick\.com\/alpha/, {})).labels, ['Reload', '—', 'Inspect']);
  assert.equal(await rightClick(/index\.html(?!.*role=streams)/, {}), null);
});

test('its items: translate and search open the browser, copy copies, links open outside the app', T, async () => {
  const sel = await rightClick(/popout\/alpha\/chat/, { selectionText: 'buenas noches' });
  assert.match(sel.labels[1], /^Translate “buenas noches” to /);
  await sel.pick(sel.labels[1]);
  await sel.pick('Search Google for “buenas noches”');
  const { opened } = await state();
  assert.match(opened[0], /^https:\/\/translate\.google\.com\/\?sl=auto&tl=[\w-]+&text=buenas%20noches&op=translate$/);
  assert.equal(opened[1], 'https://www.google.com/search?q=buenas%20noches');

  const link = await rightClick(/popout\/alpha\/chat/, { linkURL: 'https://example.com/clip' });
  await link.pick('Copy link address');
  assert.equal(await a.app.evaluate(({ clipboard }) => clipboard.readText()), 'https://example.com/clip');
  await link.pick('Open link in your browser');
  assert.equal((await state()).opened[2], 'https://example.com/clip');
});

test('an emote: Save image as… suggests its name in Downloads and saves it; Open image opens a window with it', T, async () => {
  const img = await rightClick(/popout\/alpha\/chat/, { mediaType: 'image', srcURL: 'https://kick.com/emotes/pear.png', altText: 'pear Hype' });
  assert.deepEqual(img.labels, ['Open image in new window', 'Save image as…', 'Copy image', 'Copy image address', '—', 'Inspect']);
  await img.pick('Save image as…');
  for (let i = 0; i < 100 && !(await state()).saved.length; i++) await new Promise(r => setTimeout(r, 100));
  const saved = (await state()).saved[0];
  assert.equal(path.basename(saved), 'pear_Hype.png');
  assert.equal(path.dirname(saved), await a.app.evaluate(({ app }) => app.getPath('downloads')));
  for (let i = 0; i < 100 && !fs.existsSync(path.join(out, 'pear_Hype.png')); i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(fs.existsSync(path.join(out, 'pear_Hype.png')));
  await img.pick('Copy image address');
  assert.equal(await a.app.evaluate(({ clipboard }) => clipboard.readText()), 'https://kick.com/emotes/pear.png');
  await img.pick('Open image in new window');
  await a.app.evaluate(async ({ BrowserWindow }) => {
    const find = () => BrowserWindow.getAllWindows().find(x => /emotes\/pear\.png/.test(x.webContents.getURL()));
    for (let i = 0; i < 100 && !find(); i++) await new Promise(r => setTimeout(r, 100));
    if (!find()) throw new Error('no image window');
    find().close();
  });
});
