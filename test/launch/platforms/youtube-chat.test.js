// YouTube chats in the real desktop app: Settings > YouTube > Chat to show (Top chat or Live chat) picks the
// view in each chat's own menu, leaves a chat you switched yourself alone, and a chat YouTube draws half dark
// (signed out, in dark mode) uses YouTube's light theme. The chat is a stand-in page with a copy of
// YouTube's view menu (see app.js).
const test = require('node:test');
const { launchApp, inView, viewLoaded, assert, openChannel, setMode } = require('../app');

const T = { timeout: 90000 };
let a, title;
test.before(async () => {
  a = await launchApp();
  await setMode(a.win, 'chat');
  await openChannel(a.win, 'https://www.youtube.com/live_chat?v=abcdefghijk');
  title = await a.win.$eval('#stage .win.chat .title', e => e.textContent);
  await viewLoaded(a.win, title, 'chat', /live_chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const chat = (fn, arg) => inView(a.win, title, 'chat', fn, arg);
// YouTube's chat view menu: items in the menu's data and as links, in this order: Top chat, Live chat. Picking
// one builds the menu again (YouTube does too). The labels are French: items are found by position, not by name.
const menu = sel => chat(sel => {
  window.__menu = window.__menu || function build(sel){
    document.querySelector('#view-selector')?.remove();
    const box = document.createElement('span'); box.id = 'view-selector';
    const r = document.createElement('yt-sort-filter-sub-menu-renderer');
    r.data = { subMenuItems: [{ title: 'Meilleurs messages', selected: sel === 0 }, { title: 'Chat en direct', selected: sel === 1 }] };
    const list = document.createElement('tp-yt-paper-listbox');
    r.data.subMenuItems.forEach((it, i) => {
      const l = document.createElement('a');
      l.textContent = it.title; l.setAttribute('aria-selected', String(it.selected));
      l.style.cssText = `position:fixed;left:10px;top:${10 + i * 40}px;width:150px;height:30px;display:block;background:#ccc;z-index:9`;
      l.onclick = () => { window.__picks = (window.__picks || 0) + 1; setTimeout(() => build(i), 50); };
      list.append(l);
    });
    r.append(list); box.append(r); document.body.prepend(box);
  };
  window.__menu(sel);
}, sel);
const view = () => chat(() => { const r = document.querySelector('#view-selector yt-sort-filter-sub-menu-renderer'); return r ? r.data.subMenuItems.findIndex(x => x.selected) : -1; });
const pick = async v => { await a.win.selectOption('#ytChatView', v); };
// A real click (as you'd make) on one of the menu's items.
const click = i => a.win.evaluate(i => {
  const v = document.querySelector('#stage .win.chat webview');
  ['mouseDown', 'mouseUp'].forEach(type => v.sendInputEvent({ type, x: 80, y: 25 + i * 40, button: 'left', clickCount: 1 }));
}, i);

test('Chat to show: Top chat to start with, Live chat picked in open chats, found by position, and nothing without a menu', T, async () => {
  await a.win.evaluate(() => window.openSettings('youtube'));
  assert.equal(await a.win.inputValue('#ytChatView'), 'top', 'Top chat, as on YouTube');
  await a.win.waitForTimeout(800);
  assert.equal(await chat(() => !!window.__kmvYtChat && !window.__kmvYtChat.el), true, 'running, and nothing to do: the chat has no menu (off, members-only, or YouTube changed it)');
  await menu(0);
  await a.win.waitForTimeout(1200);
  assert.equal(await view(), 0, 'Top chat is left as it is');
  assert.equal(await chat(() => window.__picks || 0), 0);
  await pick('live');
  await until(async () => (await view()) === 1);
  assert.equal(await chat(() => window.__picks), 1, 'picked once');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.ytChatView')), 'live');
});

test('a chat you switch yourself stays as you left it, also when YouTube rebuilds it, until the setting changes or it reloads', T, async () => {
  assert.equal(await view(), 1);
  await click(0);                                           // you pick Top chat in the chat's own menu
  await until(async () => (await view()) === 0);
  await a.win.waitForTimeout(2500);
  assert.equal(await view(), 0, 'not switched back to Live chat');
  assert.equal(await chat(() => window.__kmvYtChat.mine), true);
  await menu(0);                                            // YouTube rebuilds the chat
  await a.win.waitForTimeout(2500);
  assert.equal(await view(), 0, 'still yours after a rebuild');

  await pick('top'); await pick('live');                    // changing the setting applies to it again
  await until(async () => (await view()) === 1);
  await click(0);
  await until(async () => (await view()) === 0);
  await a.win.evaluate(() => document.querySelector('#stage .win.chat webview').reload());
  await viewLoaded(a.win, title, 'chat', /live_chat/);
  await until(() => chat(() => !!window.__kmvYtChat).catch(() => false));
  await menu(0);                                            // a reloaded chat starts on Top chat again
  await until(async () => (await view()) === 1);
  assert.equal(await chat(() => window.__kmvYtChat.mine), false, 'a reload forgets your switch');
  await pick('top');
  await until(async () => (await view()) === 0);
});

test('YouTube\'s half-dark chat (white under white text, signed out) uses its light theme; a proper dark chat stays dark', T, async () => {
  const look = () => chat(() => document.documentElement.hasAttribute('dark'));
  await chat(() => {
    const list = document.createElement('yt-live-chat-renderer');
    list.style.cssText = 'display:block;background:#0f0f0f'; document.body.append(list);
    document.documentElement.setAttribute('dark', '');
  });
  await a.win.waitForTimeout(1200);
  assert.equal(await look(), true, 'dark and drawn dark: left alone');
  await chat(() => { document.querySelector('yt-live-chat-renderer').style.background = '#fff'; });
  await until(async () => (await look()) === false);
  await chat(() => document.documentElement.setAttribute('dark', ''));   // YouTube switching it back
  await until(async () => (await look()) === false);
});

// Sending from ALL: YouTube's Send button can ignore a script's press (a click that isn't a real one). This stand-in's
// only acts on a real press (event.isTrusted), as YouTube's may: the app presses it for real where sendAgent says it
// is (scaled by the chat's zoom), the keyboard stays where you were typing, and it's 'sent' once the box empties.
test('ALL\'s send on YouTube: a Send button that only takes a real press is pressed for real, at any zoom, keeping your keyboard', T, async () => {
  await chat(() => {
    document.querySelector('#kmv-send')?.remove();
    const wrap = document.createElement('div'); wrap.id = 'kmv-send';
    wrap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:48px;display:flex;align-items:center;background:#eee;z-index:99';
    const f = document.createElement('yt-live-chat-text-input-field-renderer'), box = document.createElement('div');
    box.id = 'input'; box.contentEditable = 'true'; box.style.cssText = 'flex:1;min-width:60px;height:24px'; f.style.cssText = 'display:flex;flex:1'; f.append(box);
    const s = document.createElement('div'); s.id = 'send-button';
    const r = document.createElement('yt-button-renderer'), shape = document.createElement('yt-button-shape'), b = document.createElement('button');
    b.setAttribute('aria-label', 'Send'); b.textContent = '>'; b.style.cssText = 'width:40px;height:32px;margin:0 8px';
    window.__fake = 0; window.__real = [];
    b.addEventListener('click', e => { if (!e.isTrusted){ window.__fake++; return; } window.__real.push(box.innerText.trim()); box.textContent = ''; });
    shape.append(b); r.append(shape); s.append(r); wrap.append(f, s); document.body.append(wrap);
  });
  if (await a.win.isVisible('#settingsDlg')){ await a.win.keyboard.press('Escape'); await a.win.waitForSelector('#settingsDlg', { state: 'hidden' }); }   // (the tests before)
  await a.win.click('#savedBtn'); await a.win.fill('#savedInput', 'typing here');
  const send = (text, zoom) => a.win.evaluate(async ([text, zoom]) => {
    const w = window.openWins().find(o => o.kind === 'chat');
    w.view.setZoomFactor(zoom);
    await new Promise(r => setTimeout(r, 300));
    const r = await window.allChat.sender.send(w, text);
    return [r && r.press ? 'press' : r, await window.allChat.sender.press(w, r, text)];
  }, [text, zoom]);
  try {
    assert.deepEqual(await send('Haii King', 1), ['press', 'sent'], 'the script\'s press ignored, the real one sent it');
    assert.deepEqual(await send('zoomed in', 1.5), ['press', 'sent'], 'at 150 %');
  } finally { await a.win.evaluate(() => window.openWins().find(o => o.kind === 'chat').view.setZoomFactor(1)); }
  assert.deepEqual(await chat(() => [window.__real, window.__fake]), [['Haii King', 'zoomed in'], 2], 'each sent once, by the real press');
  await a.win.waitForTimeout(600);
  assert.equal(await a.win.evaluate(() => document.activeElement.id), 'savedInput', 'the keyboard stays where you were typing');
  // a press somewhere else in the chat: nothing sent, and it says so
  const missed = await a.win.evaluate(async () => {
    const w = window.openWins().find(o => o.kind === 'chat');
    await window.allChat.sender.send(w, 'missed');
    return window.allChat.sender.press(w, { press: { x: 2, y: 2 }, start: Date.now() }, 'missed');
  });
  assert.equal(missed, 'not-sent');
  assert.deepEqual(await chat(() => window.__real), ['Haii King', 'zoomed in']);
  await chat(() => document.querySelector('#kmv-send').remove());
  await a.win.click('#savedBtn');
});
