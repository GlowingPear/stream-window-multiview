// Emote preview in the real app: the chat helper is loaded into chat windows, and Download saves the
// emote where you choose. kick.com and its emote pictures are stand-ins; the save dialog is answered by the test.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, inView, viewLoaded, assert, openChannel } = require('../app');
const { tempDir } = require('../../helpers');

const T = { timeout: 60000 };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAAKAAAALAAAAAABAAEAAAICTAEAIfkEAAoAAAAsAAAAAAEAAQAAAgJEAQA7';   // two frames
let a, out;
test.before(async () => {
  a = await launchApp();
  out = tempDir('emote');
  await a.app.evaluate(({ session, net, dialog }, [png, gif, out]) => {
    const pic = Buffer.from(png, 'base64'), moving = Buffer.from(gif, 'base64');
    globalThis.__asked = [];
    session.defaultSession.protocol.handle('https', req => {
      if (/^https:\/\/files\.kick\.com\/emotes\/1\//.test(req.url)) return new Response(pic, { headers: { 'content-type': 'image/png' } });
      if (/^https:\/\/files\.kick\.com\/emotes\/3\//.test(req.url)) return new Response(moving, { headers: { 'content-type': 'image/gif' } });
      if (/^https:\/\/files\.kick\.com\/emotes\/2\//.test(req.url)) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
    dialog.showSaveDialog = async (_w, o) => { globalThis.__asked.push(o.defaultPath); return globalThis.__cancel ? { canceled: true } : { canceled: false, filePath: out + '/' + String(o.defaultPath).split(/[\\/]/).pop() }; };
  }, [PNG, GIF, out]);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

test('chat windows get the emote preview, and Download saves the emote, named after it', T, async () => {
  const w = a.win;
  await openChannel(w, 'alpha');
  await viewLoaded(w, 'alpha', 'chat', /popout\/alpha\/chat/);
  await w.waitForFunction(() => {
    const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent.toLowerCase() === 'alpha')?.querySelector('webview');
    return v && v.executeJavaScript('!!window.__kmvEmote');
  });
  // the card's Download button: the chat page asks the app
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-dl ' + JSON.stringify({ url: 'https://files.kick.com/emotes/1/fullsize', small: '', name: 'pear Hype!' })));
  await w.waitForFunction(() => /Saved pear Hype!/.test(document.getElementById('msg').textContent));
  const asked = await a.app.evaluate(() => globalThis.__asked);
  assert.equal(path.basename(asked[0]), 'pear_Hype_.png', 'a file name made from the emote name, in Downloads');
  assert.equal(fs.readFileSync(path.join(out, 'pear_Hype_.png')).toString('base64'), PNG);

  // straight to the main process: only emote pictures from the emote sites
  const dl = (...x) => w.evaluate(x => window.kmv.emoteDownload(...x), x);
  assert.deepEqual(await dl('https://example.com/x.png', 'x'), { error: 'bad' });
  assert.deepEqual(await dl('http://files.kick.com/emotes/1/fullsize', 'x'), { error: 'bad' });
  assert.deepEqual(await dl('https://files.kick.com/emotes/2/fullsize', 'x'), { error: 'fetch' }, 'not a picture');
  const got = await dl('https://files.kick.com/emotes/2/fullsize', 'small', 'https://files.kick.com/emotes/1/small');
  assert.deepEqual({ ...got, id: typeof got.id }, { saved: true, file: 'small.png', id: 'string' }, 'the big one fails: the one from chat');
  // Show in folder (from the bell): only a file this app saved, by its id
  await a.app.evaluate(({ shell }) => { shell.showItemInFolder = f => { globalThis.__shown = f; }; });
  assert.equal(await w.evaluate(id => window.kmv.emoteShow(id), got.id), true);
  assert.equal(path.basename(await a.app.evaluate(() => globalThis.__shown)), 'small.png');
  assert.equal(await w.evaluate(() => window.kmv.emoteShow('../../etc/passwd')), false, 'nothing else');
  fs.rmSync(path.join(out, 'small.png'), { force: true });
  assert.equal(await w.evaluate(id => window.kmv.emoteShow(id), got.id), false, 'nor a file that\'s gone');
  await a.app.evaluate(() => { globalThis.__cancel = true; });
  assert.deepEqual(await dl('https://files.kick.com/emotes/1/fullsize', 'x'), { canceled: true });
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-dl {"url":"https://example.com/x.png","name":"nope"}'));
  await w.waitForFunction(() => /Couldn’t download nope/.test(document.getElementById('msg').textContent));
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-dl {broken'));   // ignored
});

test('Settings > General switches the emote preview off and on in open chats', T, async () => {
  const w = a.win;
  const on = () => inView(w, 'alpha', 'chat', () => { const i = document.createElement('img'); i.src = 'https://files.kick.com/emotes/1/x'; i.alt = 'e'; i.width = i.height = 28; document.body.append(i); return true; });
  await on();
  await w.evaluate(() => { document.getElementById('settingsBtn').click(); });
  await w.click('#settingsDlg [data-s=chat]').catch(() => {});
  await w.click('#chatTabs [data-t=emotes]');
  assert.equal(await w.isChecked('#emoteSet'), false, 'off by default');
  assert.equal(await inView(w, 'alpha', 'chat', () => { const i = document.querySelector('img[alt=e]'); i.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return new Promise(r => setTimeout(() => r(!!document.querySelector('kmv-emote-card')), 400)); }), false, 'no card');
  await w.locator('label[for=emoteSet]').click();
  assert.equal(await w.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), '1');
  assert.equal(await inView(w, 'alpha', 'chat', () => { const i = document.querySelector('img[alt=e]'); i.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return new Promise(r => setTimeout(() => r(!!document.querySelector('kmv-emote-card')), 400)); }), true, 'on in the open chat straight away');
  await w.locator('label[for=emoteSet]').click();
  assert.equal(await w.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), '0');
  await w.keyboard.press('Escape');
});

// What the app copies: the still's size, and the file copied with it (a moving emote). The test files run side by side
// and share the computer's clipboard, so another one may copy something in between. (It still goes on the clipboard.)
const copied = async () => {
  for (let i = 0; i < 50 && !(await a.app.evaluate(() => globalThis.__copied)); i++) await new Promise(r => setTimeout(r, 100));
  return a.app.evaluate(() => { const c = globalThis.__copied; globalThis.__copied = null; return c; });
};
const fileOf = c => c && c.uri ? require('url').fileURLToPath(c.uri) : null;

test('the card\'s Copy image puts the emote\'s picture on the clipboard; only pictures from the emote sites', T, async () => {
  const w = a.win;
  await a.app.evaluate(({ clipboard, nativeImage }) => {
    globalThis.__copied = null;
    const write = clipboard.write.bind(clipboard);
    clipboard.write = async (items, ...rest) => {
      const png = await items[0].getType('image/png');
      const uri = items[0].types.includes('text/uri-list') ? await (await items[0].getType('text/uri-list')).text() : null;
      globalThis.__copied = { size: nativeImage.createFromBuffer(Buffer.from(await png.arrayBuffer())).getSize(), uri, types: items[0].types };
      return write(items, ...rest);
    };
  });
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-copy ' + JSON.stringify({ url: 'https://files.kick.com/emotes/1/fullsize', small: '', name: 'pearHype' })));
  assert.deepEqual(await copied(), { size: { width: 1, height: 1 }, uri: null, types: ['image/png'] }, 'a still emote: only its picture');
  // a moving one: its still, and the emote itself as a file (where chat apps take a pasted file, it pastes moving)
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-copy ' + JSON.stringify({ url: 'https://files.kick.com/emotes/3/fullsize', small: '', name: 'pear Dance' })));
  const c = await copied();
  assert.deepEqual(c.size, { width: 1, height: 1 });
  assert.equal(path.basename(fileOf(c)), 'pear_Dance.gif', 'named after the emote');
  assert.equal(fs.readFileSync(fileOf(c)).toString('base64'), GIF, 'the GIF as it is');
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-copy {"url":"https://example.com/x.png","name":"nope"}'));
  await w.waitForFunction(() => /Couldn’t copy nope/.test(document.getElementById('msg').textContent));
  // straight to the main process
  assert.deepEqual(await w.evaluate(() => window.kmv.emoteFetch('https://example.com/x.png')), { error: 'bad' });
  assert.equal(await w.evaluate(() => window.kmv.clipboardPng('data:text/html;base64,PGI+')), false, 'only a PNG');
  assert.equal(await w.evaluate(() => window.kmv.clipboardEmote('data:text/html;base64,PGI+', 'https://files.kick.com/emotes/3/fullsize', '', 'x')), false, 'only a PNG');
  // an address that isn't an emote site's: only the still, no file
  const still = await w.evaluate(p => window.kmv.clipboardEmote('data:image/png;base64,' + p, 'https://example.com/x.gif', '', 'x'), PNG);
  assert.equal(still, true);
  assert.deepEqual((await copied()).types, ['image/png']);
  // the big one isn't there: the one from chat
  assert.equal(await w.evaluate(p => window.kmv.clipboardEmote('data:image/png;base64,' + p, 'https://files.kick.com/emotes/2/fullsize', 'https://files.kick.com/emotes/3/small', 'y'), PNG), true);
  assert.equal(path.basename(fileOf(await copied())), 'y.gif');
});

test('Copy image in an emote\'s right-click menu: the app copies it, a moving one also as a file', T, async () => {
  const w = a.win;
  // right-clicked in the page (it notes the emote under the pointer), then Electron's event
  const at = await inView(w, 'alpha', 'chat', () => {
    const i = document.createElement('img'); i.src = 'https://files.kick.com/emotes/3/fullsize'; i.alt = 'pearDance';
    i.style.cssText = 'position:fixed;left:30px;top:40px;width:28px;height:28px'; document.body.append(i);
    i.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }));
    return true;
  });
  assert.ok(at);
  await a.app.evaluate(({ webContents }) => {
    webContents.getAllWebContents().find(w => /popout\/alpha\/chat/.test(w.getURL()))
      .emit('context-menu', { preventDefault() {} }, { x: 40, y: 50, editFlags: {}, mediaType: 'image', srcURL: 'https://files.kick.com/emotes/3/fullsize', altText: 'pearDance' });
  });
  await w.click('.vmenu [role=menuitem]:text-is("Copy image")');
  const c = await copied();
  assert.equal(path.basename(fileOf(c)), 'pearDance.gif');
  assert.equal(fs.readFileSync(fileOf(c)).toString('base64'), GIF);
  await inView(w, 'alpha', 'chat', () => { document.querySelectorAll('img[alt=pearDance]').forEach(e => e.remove()); return true; });
});
