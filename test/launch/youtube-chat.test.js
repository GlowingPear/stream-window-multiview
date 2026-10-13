// YouTube chats in the real desktop app: Settings > YouTube > Chat to show (Top chat or Live chat) picks the
// view in each chat's own menu, leaves a chat you switched yourself alone, and a chat YouTube draws half dark
// (signed out, in dark mode) uses YouTube's light theme. The chat is a stand-in page with a copy of
// YouTube's view menu (see app.js).
const test = require('node:test');
const { launchApp, inView, viewLoaded, assert } = require('./app');

const T = { timeout: 90000 };
let a, title;
test.before(async () => {
  a = await launchApp();
  await a.win.selectOption('#mode', 'chat');
  await a.win.fill('#url', 'https://www.youtube.com/live_chat?v=abcdefghijk');
  await a.win.click('#add');
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
