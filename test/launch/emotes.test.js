// Emote preview in the real app: the chat helper is loaded into chat windows, and Download saves the
// emote where you choose. kick.com and its emote pictures are stand-ins; the save dialog is answered by the test.
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchApp, inView, viewLoaded, assert, openChannel } = require('./app');

const T = { timeout: 60000 };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let a, out;
test.before(async () => {
  a = await launchApp();
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-emote-'));
  await a.app.evaluate(({ session, net, dialog }, [png, out]) => {
    const pic = Buffer.from(png, 'base64');
    globalThis.__asked = [];
    session.defaultSession.protocol.handle('https', req => {
      if (/^https:\/\/files\.kick\.com\/emotes\/1\//.test(req.url)) return new Response(pic, { headers: { 'content-type': 'image/png' } });
      if (/^https:\/\/files\.kick\.com\/emotes\/2\//.test(req.url)) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
    dialog.showSaveDialog = async (_w, o) => { globalThis.__asked.push(o.defaultPath); return globalThis.__cancel ? { canceled: true } : { canceled: false, filePath: out + '/' + String(o.defaultPath).split(/[\\/]/).pop() }; };
  }, [PNG, out]);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

test('chat windows get the emote preview, and Download saves the emote, named after it', T, async () => {
  const w = a.win;
  await openChannel(w, 'alpha');
  await viewLoaded(w, 'alpha', 'chat', /popout\/alpha\/chat/);
  await w.waitForFunction(() => {
    const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent === 'alpha')?.querySelector('webview');
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
  await w.click('#settingsDlg [data-s=general]').catch(() => {});
  assert.equal(await w.isChecked('#emoteSet'), false, 'off by default');
  assert.equal(await inView(w, 'alpha', 'chat', () => { const i = document.querySelector('img[alt=e]'); i.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return new Promise(r => setTimeout(() => r(!!document.querySelector('kmv-emote-card')), 400)); }), false, 'no card');
  await w.locator('label:has(#emoteSet)').click();
  assert.equal(await w.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), '1');
  assert.equal(await inView(w, 'alpha', 'chat', () => { const i = document.querySelector('img[alt=e]'); i.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return new Promise(r => setTimeout(() => r(!!document.querySelector('kmv-emote-card')), 400)); }), true, 'on in the open chat straight away');
  await w.locator('label:has(#emoteSet)').click();
  assert.equal(await w.evaluate(() => localStorage.getItem('kickMultiview.emotePreview')), '0');
  await w.keyboard.press('Escape');
});

test('the card\'s Copy image puts the emote\'s picture on the clipboard; only pictures from the emote sites', T, async () => {
  const w = a.win;
  await a.app.evaluate(({ clipboard }) => clipboard.clear());
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-copy ' + JSON.stringify({ url: 'https://files.kick.com/emotes/1/fullsize', small: '', name: 'pearHype' })));
  for (let i = 0; i < 50 && (await a.app.evaluate(({ clipboard }) => clipboard.readImage().isEmpty())); i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(await a.app.evaluate(({ clipboard }) => clipboard.readImage().getSize()), { width: 1, height: 1 }, 'the picture');
  await inView(w, 'alpha', 'chat', () => console.log('__kmv:emote-copy {"url":"https://example.com/x.png","name":"nope"}'));
  await w.waitForFunction(() => /Couldn’t copy nope/.test(document.getElementById('msg').textContent));
  // straight to the main process
  assert.deepEqual(await w.evaluate(() => window.kmv.emoteFetch('https://example.com/x.png')), { error: 'bad' });
  assert.equal(await w.evaluate(() => window.kmv.clipboardPng('data:text/html;base64,PGI+')), false, 'only a PNG');
});
