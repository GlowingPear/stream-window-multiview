// Kick's /clip, /poll and /prediction: the popout chat can't show their popups, so the chat helper stops them being sent
// and the app offers to open the channel page instead. The helper runs on a small stand-in Kick chat here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./app');
const { openApp } = setup();

// A stand-in for Kick's chat box and send button. What reaches the page's own handlers is recorded:
// that's what Kick would send.
async function chat(t) {
  const page = await openApp(t, { width: 900, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = 'kchat';
    c.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483646;background:#0e1112;padding:8px';
    c.innerHTML = '<div data-testid="chat-input" contenteditable="true" style="width:300px;min-height:20px;color:#fff"></div><button id="send-message-button"><span>Chat</span></button>';
    document.body.append(c);
    window.__sent = [];
    const box = c.querySelector('[data-testid="chat-input"]');
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) window.__sent.push(box.innerText); });
    c.querySelector('button').addEventListener('click', () => window.__sent.push(box.innerText));
    window.kickCmdAgent(Object.keys(window.KICK_PAGE_CMDS));
  });
  const type = async (text, how = 'Enter') => {
    await page.evaluate(t => { document.querySelector('#kchat [data-testid="chat-input"]').innerText = t; }, text);
    await page.click('#kchat [data-testid="chat-input"]');
    if (how === 'button') await page.click('#send-message-button span');
    else await page.keyboard.press(how);
  };
  return { page, logs, type, sent: () => page.evaluate(() => window.__sent) };
}

test('which messages are page-only commands', async t => {
  const { page } = await chat(t);
  const got = await page.evaluate(() => ['/clip', '/clip 30', '/clip 30 Big play', '  /CLIP', '/poll', '/poll ', '/Poll what now',
    '/prediction', '/polldelete', '/clipboard', '/predictions', 'hi /clip', '/user someone', '', null].map(x => window.__kmvKickCmd.cmdOf(x)));
  assert.deepEqual(got, ['clip', 'clip', 'clip', 'clip', 'poll', 'poll', 'poll', 'prediction', null, null, null, null, null, null, null]);
  assert.equal(await page.evaluate(() => window.kickCmdAgent(['clip'])), true, 'loading it twice is fine');
});

test('/clip, /poll and /prediction are not sent (Enter or the send button); the app is told instead', async t => {
  const { logs, type, sent } = await chat(t);
  await type('/clip 30 Big play');
  await type('/poll', 'button');
  await type('/POLL');
  await type('/prediction');
  assert.deepEqual(await sent(), [], 'nothing reached the chat');
  assert.deepEqual(logs.filter(l => l.startsWith('__kmv:kick-cmd')), ['__kmv:kick-cmd clip', '__kmv:kick-cmd poll', '__kmv:kick-cmd poll', '__kmv:kick-cmd prediction']);
});

test('other messages and other commands are sent as usual', async t => {
  const { logs, type, sent } = await chat(t);
  await type('hello there');
  await type('/user someone');
  await type('/polldelete', 'button');
  await type('/clip', 'Shift+Enter');              // a new line, not sending
  assert.deepEqual(await sent(), ['hello there', '/user someone', '/polldelete']);
  assert.equal(logs.filter(l => l.startsWith('__kmv:kick-cmd')).length, 0);
});

test('the chat window offers to open the channel page; Cancel leaves nothing open', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    window.__opened = []; window.open = (...a) => { window.__opened.push(a.slice(0, 2)); return null; };
    window.__win = ch => { const el = document.createElement('div'); el.className = 'win chat'; el.dataset.ch = ch;
      el.style.cssText = 'position:fixed;left:10px;top:60px;width:340px;height:500px;display:flex'; el.innerHTML = '<div class="body"></div>';
      document.body.append(el); return { channel: ch, el }; };
  });
  const run = (ch, cmd) => page.evaluate(([ch, cmd]) => window.kickPageCmd(window.__win(ch), cmd), [ch, cmd]);
  const card = '.win[data-ch="xqc"] .kcmd';

  await run('xqc', 'clip');
  assert.equal(await page.textContent(`${card} h3`), '/clip doesn’t work in this chat');
  assert.match(await page.textContent(`${card} .kcmd-sub`), /make a clip on the channel page.*xqc.*muted/);
  assert.equal(await page.isHidden('#askDlg'), true, 'in the chat window, not the app dialog');
  await page.click(`${card} .kcmd-no`);
  assert.equal(await page.locator(card).count(), 0, 'Cancel: it goes away');
  assert.deepEqual(await page.evaluate(() => window.__opened), [], 'Cancel: nothing opens');

  await page.evaluate(() => document.querySelectorAll('.win[data-ch]').forEach(e => e.remove()));
  await run('xqc', 'prediction');
  assert.match(await page.textContent(`${card} .kcmd-sub`), /start a prediction/);
  await page.evaluate(() => window.kickPageCmd({ channel: 'xqc', el: document.querySelector('.win[data-ch="xqc"]') }, 'clip'));
  assert.equal(await page.locator(card).count(), 1, 'one at a time: the newest');
  assert.match(await page.textContent(`${card} .kcmd-sub`), /make a clip/);
  await page.click(`${card} .kcmd-yes`);
  assert.equal(await page.locator(card).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__opened), [['https://kick.com/xqc', 'kmv_page_xqc']]);

  // only Kick, and only the known commands
  await run('tw:someone', 'clip');
  await run('xqc', 'raid');
  await page.evaluate(() => window.kickPageCmd({ channel: 'xqc' }, 'poll'));   // a window that's gone
  assert.equal(await page.locator('.kcmd').count(), 0, 'not shown');
});
