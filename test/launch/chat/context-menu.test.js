// The right-click menu in the real app: chat and stream windows get it (the app's own page doesn't), and its
// items do their job. The menu is read instead of shown, and links "open" into a list instead of the browser.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');
const { tempDir } = require('../../helpers');

const T = { timeout: 60000 };
let a, out;
test.before(async () => {
  a = await launchApp();
  out = tempDir('menu');
  await a.app.evaluate(({ Menu, shell, session, clipboard }, out) => {
    const t = globalThis.__m = { menus: [], opened: [], saved: [], copied: null };
    // What the app copies: the test files run side by side and share the computer's clipboard, so another one
    // may copy something in between. (It still goes on the clipboard.)
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text, ...rest) => { t.copied = text; return writeText(text, ...rest); };
    Menu.buildFromTemplate = tmpl => { t.menus.push(tmpl); return { popup() {} }; };
    shell.openExternal = async u => { t.opened.push(u); };
    // "Save image as…": answer the save dialog with a folder of the test's
    // a stand-in Google Translate: Spanish in, English out
    const DICT = { 'hola amigos': 'hello friends', 'buenas noches': 'good night' };
    t.translated = [];
    session.defaultSession.protocol.handle('https', req => {
      const u = new URL(req.url);
      if (u.hostname !== 'translate.googleapis.com') return require('electron').net.fetch(req, { bypassCustomProtocolHandlers: true });
      const q = u.searchParams.get('q'); t.translated.push(q);
      const body = DICT[q] ? [[[DICT[q], q]], null, 'es'] : [[[q, q]], null, u.searchParams.get('tl')];
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    });
    session.fromPartition('persist:kick').on('will-download', (_e, item) => {
      item.setSaveDialogOptions = o => { t.saved.push(o.defaultPath); item.setSavePath(out + '/' + String(o.defaultPath).split(/[\\/]/).pop()); };
    });
  }, out);
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  await viewLoaded(a.win, 'alpha', 'stream', /player\.kick\.com\/alpha/);
  // the chat's helpers are in (the menu asks them what's there)
  for (let i = 0; i < 100 && !(await inView(a.win, 'alpha', 'chat', () => !!window.__kmvTr && !!window.__kmvEmote && !!window.__kmvMsg).catch(() => false)); i++) await new Promise(r => setTimeout(r, 100));
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// Right-click in a view: the menu it got (labels; a submenu: [its label, its labels]), and a way to pick one of its
// items, also in a submenu.
async function rightClick(urlRe, params) {
  const n = await a.app.evaluate(async ({ webContents }, [re, params]) => {
    const wc = webContents.getAllWebContents().find(w => new RegExp(re).test(w.getURL()));
    const before = globalThis.__m.menus.length;
    wc.emit('context-menu', { preventDefault() {} }, { x: 1, y: 1, editFlags: {}, ...params });
    // (it first asks the page what's there: a moment)
    for (let i = 0; i < 20 && globalThis.__m.menus.length === before; i++) await new Promise(r => setTimeout(r, 50));
    return globalThis.__m.menus.length > before ? globalThis.__m.menus.length - 1 : -1;
  }, [urlRe.source, params]);
  if (n < 0) return null;
  const labels = await a.app.evaluate((_, n) => { const of = l => l.map(x => x.type === 'separator' ? '—' : x.submenu ? [x.label, of(x.submenu)] : x.label); return of(globalThis.__m.menus[n]); }, n);
  return { labels, pick: label => a.app.evaluate((_, [n, label]) => {
    const find = l => { for (const x of l){ if (x.label === label && x.click) return x; const y = x.submenu && find(x.submenu); if (y) return y; } };
    find(globalThis.__m.menus[n]).click();
  }, [n, label]) };
}
const state = () => a.app.evaluate(() => globalThis.__m);

test('chat and stream windows get the menu; the app\'s own page does not', T, async () => {
  const chat = (await rightClick(/popout\/alpha\/chat/, {})).labels;
  assert.equal(chat[0][0], 'Translate', 'a submenu');
  assert.match(chat[0][1][0], /^Translate this chat to /);
  assert.deepEqual(chat.slice(1), ['—', 'Reload', '—', 'Inspect'], 'Inspect: this is a dev copy');
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
  assert.equal(await a.app.evaluate(() => globalThis.__m.copied), 'https://example.com/clip');
  await link.pick('Open link in your browser');
  assert.equal((await state()).opened[2], 'https://example.com/clip');
});

test('an emote: Save image as… suggests its name in Downloads and saves it; Open image opens a window with it', T, async () => {
  const img = await rightClick(/popout\/alpha\/chat/, { mediaType: 'image', srcURL: 'https://kick.com/emotes/pear.png', altText: 'pear Hype' });
  assert.deepEqual(img.labels.slice(0, 2), ['Copy image', ['Image', ['Copy image address', 'Open image in new window', 'Save image as…']]], 'not an emote the chat showed: the system menu, with a submenu');
  await img.pick('Save image as…');
  for (let i = 0; i < 100 && !(await state()).saved.length; i++) await new Promise(r => setTimeout(r, 100));
  const saved = (await state()).saved[0];
  assert.equal(path.basename(saved), 'pear_Hype.png');
  assert.equal(path.dirname(saved), await a.app.evaluate(({ app }) => app.getPath('downloads')));
  for (let i = 0; i < 100 && !fs.existsSync(path.join(out, 'pear_Hype.png')); i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(fs.existsSync(path.join(out, 'pear_Hype.png')));
  await img.pick('Copy image address');
  assert.equal(await a.app.evaluate(() => globalThis.__m.copied), 'https://kick.com/emotes/pear.png');
  await img.pick('Open image in new window');
  await a.app.evaluate(async ({ BrowserWindow }) => {
    const find = () => BrowserWindow.getAllWindows().find(x => /emotes\/pear\.png/.test(x.webContents.getURL()));
    for (let i = 0; i < 100 && !find(); i++) await new Promise(r => setTimeout(r, 100));
    if (!find()) throw new Error('no image window');
    find().close();
  });
});

// The chat page: a Kick-style message, and an emote the chat shows
const CHAT = /popout\/alpha\/chat/;
const kickMsg = (name, text) => `<div data-index="1"><div><div><button>${name}</button></div><span aria-hidden="true">:&nbsp;</span></div><span class="font-normal">${text}</span></div>`;
const chatText = () => inView(a.win, 'alpha', 'chat', () => [...document.querySelectorAll('[data-index] span.font-normal')].map(e => e.innerText.trim() + (e.querySelector('[data-kmv-trb]') ? ' [' + e.querySelector('[data-kmv-trb]').dataset.from + ']' : '')));

test('Translate this chat: the messages are translated by the app (a stand-in translator), and new ones too when chosen', T, async () => {
  await inView(a.win, 'alpha', 'chat', h => { document.body.insertAdjacentHTML('beforeend', h); return true; }, kickMsg('quietkoala', 'hola amigos'));
  let m = await rightClick(CHAT, {});
  await m.pick(m.labels[0][1][0]);
  for (let i = 0; i < 50 && (await chatText())[0] !== 'hello friends [SPANISH]'; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(await chatText(), ['hello friends [SPANISH]']);
  assert.deepEqual((await state()).translated, ['hola amigos']);
  m = await rightClick(CHAT, {});
  assert.deepEqual(m.labels[0][1].slice(1, 3), ['Translate new messages too', 'Stop translating']);
  assert.equal(await a.app.evaluate(() => globalThis.__m.menus.at(-1)[0].submenu[0].checked), true, 'ticked while translating');
  // new messages too: remembered for this chat
  await m.pick('Translate new messages too');
  await a.win.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.autoTranslate') || '[]').includes('alpha'));
  await inView(a.win, 'alpha', 'chat', h => { document.body.insertAdjacentHTML('beforeend', h); return true; }, kickMsg('nightowl', 'buenas noches'));
  for (let i = 0; i < 50 && (await chatText())[1] !== 'good night [SPANISH]'; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(await chatText(), ['hello friends [SPANISH]', 'good night [SPANISH]']);
  // Stop translating: everything back, and forgotten
  m = await rightClick(CHAT, {});
  await m.pick('Stop translating');
  for (let i = 0; i < 50 && (await chatText())[0] !== 'hola amigos'; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(await chatText(), ['hola amigos', 'buenas noches']);
  assert.deepEqual(await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.autoTranslate'))), []);
  await inView(a.win, 'alpha', 'chat', () => { document.querySelectorAll('[data-index]').forEach(e => e.remove()); return true; });
});

test('right-clicking an emote the chat shows: the app draws the menu with its preview, and its items work', T, async () => {
  // the emote, right-clicked in the page (the page notes what was under the pointer), then Electron's event
  const at = await inView(a.win, 'alpha', 'chat', () => {
    const i = document.createElement('img'); i.src = 'https://files.kick.com/emotes/1/fullsize'; i.alt = 'pearHype';
    i.style.cssText = 'position:fixed;left:30px;top:40px;width:28px;height:28px'; document.body.append(i);
    i.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }));
    return true;
  });
  assert.ok(at);
  const before = (await state()).menus.length;
  await a.app.evaluate(({ webContents }, re) => {
    const wc = webContents.getAllWebContents().find(w => new RegExp(re).test(w.getURL()));
    wc.emit('context-menu', { preventDefault() {} }, { x: 40, y: 50, editFlags: {}, mediaType: 'image', srcURL: 'https://files.kick.com/emotes/1/fullsize', altText: 'pearHype' });
  }, CHAT.source);
  await a.win.waitForSelector('.vmenu');
  assert.equal((await state()).menus.length, before, 'not the system menu');
  assert.equal(await a.win.textContent('.vmenu .vm-nm'), 'pearHype');
  assert.equal(await a.win.textContent('.vmenu .vm-badge'), 'Kick');
  const items = await a.win.$$eval('.vmenu:not(.vm-fly) [role^=menuitem]', els => els.map(e => e.textContent));
  assert.deepEqual(items.slice(0, 2), ['Copy image', 'Emote›'], 'Copy image first, the rest in a submenu');
  assert.ok(items.includes('Inspect'), 'the same items as the system menu would have');
  await a.win.hover('.vmenu [data-sub=Emote]');
  assert.deepEqual(await a.win.$$eval('.vm-fly [role^=menuitem]', els => els.map(e => e.textContent)), ['Copy emote text', 'Copy image address', 'Open image in new window', 'Save image as…']);
  // where it was right-clicked: the chat window's place plus the pointer's place in it
  const [mb, vb] = await a.win.evaluate(() => {
    const v = [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent.toLowerCase() === 'alpha').querySelector('webview');
    const m = document.querySelector('.vmenu:not(.vm-fly)').getBoundingClientRect(), r = v.getBoundingClientRect();
    return [{ x: m.left, y: m.top }, { x: r.left + 40 * v.getZoomFactor(), y: r.top + 50 * v.getZoomFactor() }];
  });
  assert.ok(Math.abs(mb.x - vb.x) < 2 || mb.x < vb.x, JSON.stringify([mb, vb]));
  await a.win.click('.vm-fly [role=menuitem]:has(.vm-l:text-is("Copy emote text"))');
  for (let i = 0; i < 50 && (await a.app.evaluate(() => globalThis.__m.copied)) !== 'pearHype'; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(await a.app.evaluate(() => globalThis.__m.copied), 'pearHype');
  assert.equal(await a.win.locator('.vmenu').count(), 0, 'closed');
  await inView(a.win, 'alpha', 'chat', () => { document.querySelectorAll('img[alt=pearHype]').forEach(e => e.remove()); return true; });
});

test('a chat message: Copy message, Copy message with emotes and Copy with @name copy it, also from the emote menu; Translate this message; with Developer tools on, Copy message HTML', T, async () => {
  const pic = '<img src="https://files.kick.com/emotes/1/fullsize" alt="pearHype" style="display:inline-block;width:28px;height:28px">';
  await inView(a.win, 'alpha', 'chat', h => { document.body.insertAdjacentHTML('beforeend', h); return true; }, kickMsg('quietkoala', `gg ${pic} well played`));
  // right-clicked in the page (it notes the message), then Electron's event
  const press = sel => inView(a.win, 'alpha', 'chat', sel => { const e = document.querySelector(sel), r = e.getBoundingClientRect();
    e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2 })); return [r.left + 2, r.top + 2]; }, sel);
  const copied = async want => { for (let i = 0; i < 50 && (await a.app.evaluate(() => globalThis.__m.copied)) !== want; i++) await new Promise(r => setTimeout(r, 100)); return a.app.evaluate(() => globalThis.__m.copied); };
  const html = await inView(a.win, 'alpha', 'chat', () => document.querySelector('[data-index]').outerHTML);
  for (const [label, want] of [['Copy message', 'gg well played'], ['Copy message with emotes', 'gg pearHype well played'], ['Copy with @name', '@quietkoala: gg pearHype well played']]) {
    await press('[data-index] button');
    const m = await rightClick(CHAT, {});
    assert.deepEqual(m.labels.slice(0, 3), ['Copy message', ['Copy', ['Copy message with emotes', 'Copy with @name']], '—']);
    assert.ok(!JSON.stringify(m.labels).includes('Copy message HTML'), 'the HTML only with Developer tools on');
    await m.pick(label);
    assert.equal(await copied(want), want, label);
  }
  await a.win.evaluate(() => window.devTools.setDev(true));
  await press('[data-index] button');
  await (await rightClick(CHAT, {})).pick('Copy message HTML');
  assert.equal(await copied(html), html, 'Copy message HTML');
  await a.win.evaluate(() => window.devTools.setDev(false));
  // on the emote in it: the app's drawn menu has them too
  const [x, y] = await press('[data-index] img');
  await a.app.evaluate(({ webContents }, [re, x, y]) => {
    webContents.getAllWebContents().find(w => new RegExp(re).test(w.getURL()))
      .emit('context-menu', { preventDefault() {} }, { x, y, editFlags: {}, mediaType: 'image', srcURL: 'https://files.kick.com/emotes/1/fullsize', altText: 'pearHype' });
  }, [CHAT.source, x, y]);
  await a.win.waitForSelector('.vmenu');
  const items = await a.win.$$eval('.vmenu:not(.vm-fly) [role^=menuitem]', els => els.map(e => e.textContent));
  assert.deepEqual(items.slice(0, 3), ['Copy image', 'Copy message', 'Copy›']);
  await a.win.hover('.vmenu [data-sub=Copy]');
  assert.deepEqual(await a.win.$$eval('.vm-fly [role^=menuitem]', els => els.map(e => e.textContent)),
    ['Copy message with emotes', 'Copy with @name', 'Copy emote text', 'Copy image address', 'Open image in new window', 'Save image as…']);
  await a.win.click('.vm-fly [role=menuitem]:has(.vm-l:text-is("Copy with @name"))');
  assert.equal(await copied('@quietkoala: gg pearHype well played'), '@quietkoala: gg pearHype well played', 'chosen in a submenu');
  // Translate this message: that one, with the chat left as it is
  await inView(a.win, 'alpha', 'chat', h => { document.body.insertAdjacentHTML('beforeend', h); return true; }, kickMsg('nightowl', 'hola amigos'));
  await press('[data-index]:last-of-type button');
  await (await rightClick(CHAT, {})).pick('Translate this message');
  for (let i = 0; i < 50 && (await chatText())[1] !== 'hello friends [SPANISH]'; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal((await chatText())[1], 'hello friends [SPANISH]');
  assert.ok(!(await chatText())[0].includes('['), 'not the other message');
  assert.deepEqual(await inView(a.win, 'alpha', 'chat', () => window.__kmvTr.state()), { on: false, auto: false });
  await inView(a.win, 'alpha', 'chat', () => { window.__kmvTr.stop(); return true; });
  await inView(a.win, 'alpha', 'chat', () => { document.querySelectorAll('[data-index]').forEach(e => e.remove()); return true; });
});

test('Shoutouts on (Settings › Shoutouts): the chat page gets its buttons; the right-click menu\'s Shout out sends it in that chat; off: all gone', T, async () => {
  const setOn = on => a.win.evaluate(on => {
    const m = document.querySelector('#shoutModSet'); m.checked = false; m.dispatchEvent(new Event('change'));   // (only where you're a mod: off, the stand-in chat isn't moderated)
    const c = document.querySelector('#shoutOnSet'); c.checked = on; c.dispatchEvent(new Event('change'));
  }, on);
  const chatJs = (fn, arg) => inView(a.win, 'alpha', 'chat', fn, arg);
  const until = async (fn, ok, what) => { let v; for (let i = 0; i < 100; i++){ v = await fn().catch(() => null); if (ok(v)) return v; await new Promise(r => setTimeout(r, 100)); } assert.fail(`${what}: ${JSON.stringify(v)}`); };
  // a Kick chat box that records what's sent, and a message with the data Kick draws it from (its sender's address)
  await chatJs(h => {
    window.__sent = [];
    const box = document.createElement('div'); box.contentEditable = 'true'; box.setAttribute('data-testid', 'chat-input');
    box.addEventListener('keydown', e => { if (e.key === 'Enter'){ window.__sent.push(box.innerText.trim()); box.textContent = ''; } });
    document.body.insertAdjacentHTML('beforeend', h); document.body.append(box);
    document.querySelector('[data-index]')['__reactFiber$t'] = { memoizedProps: { message: { id: 'm1', sender: { username: 'Pixel_Fox', slug: 'pixel-fox' } } } };
    return true;
  }, kickMsg('Pixel_Fox', 'hello there'));
  const press = () => chatJs(() => { const e = document.querySelector('[data-index] .font-normal'), r = e.getBoundingClientRect();
    e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2 })); return true; });
  await press();
  assert.ok(!(await rightClick(CHAT, {})).labels.some(l => /Shout out/.test(l)), 'off: not offered');
  await setOn(true);
  await until(() => chatJs(() => !!(window.__kmvShout && window.__kmvShout.on)), v => v === true, 'the chat page has its shoutouts');
  // the button: on the message under the pointer
  await chatJs(() => { document.querySelector('[data-index] .font-normal').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true; });
  assert.equal(await chatJs(() => document.querySelectorAll('[data-index] .kmv-so-b').length), 1);
  // the menu: Shout out first, by the sender's address; it sends in this chat
  await press();
  const m = await rightClick(CHAT, {});
  assert.equal(m.labels[0], 'Shout out');
  await m.pick('Shout out');
  const sent = await until(() => chatJs(() => window.__sent), v => Array.isArray(v) && v.length === 1, 'sent in the chat');
  assert.match(sent[0], /^Go check out Pixel_Fox! .*→ https:\/\/kick\.com\/pixel-fox$/);
  // off: the buttons go from the page, and the menu doesn't offer it
  await setOn(false);
  await until(() => chatJs(() => document.querySelectorAll('[data-kmv-so]').length), v => v === 0, 'buttons gone');
  await press();
  assert.ok(!(await rightClick(CHAT, {})).labels.some(l => /Shout out/.test(l)));
  await chatJs(() => { document.querySelectorAll('[data-index], [data-testid="chat-input"]').forEach(e => e.remove()); return true; });
});

test('Translate new messages in every chat: on in open and new chats, off in one chat only, and back to each chat\'s choice when switched off', T, async () => {
  const w = a.win;
  const st = ch => inView(w, ch, 'chat', () => window.__kmvTr ? window.__kmvTr.state() : null);
  const until = async (fn, want) => { for (let i = 0; i < 80 && JSON.stringify(await fn().catch(() => null)) !== JSON.stringify(want); i++) await new Promise(r => setTimeout(r, 100)); assert.deepEqual(await fn(), want); };
  await until(() => st('alpha'), { on: false, auto: false });
  // switched on: the open chat starts straight away
  await w.evaluate(() => window.openSettings('chat', { sub: 'translate' }));
  await w.locator('label:has(#trAllSet)').click();
  await w.keyboard.press('Escape');
  await until(() => st('alpha'), { on: true, auto: true });
  await inView(w, 'alpha', 'chat', h => { document.body.insertAdjacentHTML('beforeend', h); return true; }, kickMsg('quietkoala', 'hola amigos'));
  for (let i = 0; i < 50 && (await chatText())[0] !== 'hello friends [SPANISH]'; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(await chatText(), ['hello friends [SPANISH]']);
  // the menu shows it ticked
  const m = await rightClick(CHAT, {});
  assert.equal(await a.app.evaluate(() => globalThis.__m.menus.at(-1)[0].submenu[1].checked), true);
  // a chat opened later starts on too
  await openChannel(w, 'bravo', 'chat');
  await viewLoaded(w, 'bravo', 'chat', /popout\/bravo\/chat/);
  await until(() => st('bravo'), { on: true, auto: true });
  // Stop translating in one chat: off there only, remembered (the chat loaded again stays off)
  await m.pick('Stop translating');
  await until(() => st('alpha'), { on: false, auto: false });
  assert.deepEqual(await w.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.noTranslate'))), ['alpha']);
  assert.deepEqual(await st('bravo'), { on: true, auto: true }, 'the other chat keeps going');
  await w.evaluate(() => [...document.querySelectorAll('#stage .win.chat')].find(e => e.querySelector('.title').textContent.toLowerCase() === 'alpha').querySelector('webview').reload());
  await new Promise(r => setTimeout(r, 1500));
  await until(() => st('alpha'), { on: false, auto: false });
  // switched off: back to each chat's own choice (neither chose it)
  await w.evaluate(() => window.openSettings('chat', { sub: 'translate' }));
  await w.locator('label:has(#trAllSet)').click();
  await w.keyboard.press('Escape');
  await until(() => st('bravo'), { on: false, auto: false });
  assert.equal(await w.evaluate(() => localStorage.getItem('kickMultiview.translateAll')), '0');
});
