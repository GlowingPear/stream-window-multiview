// Kick's /clip, /poll and /prediction: the popout chat can't show their popups, so the chat helper stops them being sent
// and the chat window shows its copy of Kick's instead (kick-poll.test.js, kick-prediction.test.js, kick-clip.test.js). The
// helper runs on a small stand-in Kick chat here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
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
    window.kickCmdAgent(window.KICK_PAGE_CMDS);
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
  const rest = await page.evaluate(() => ['/poll', '/poll What next?', '  /POLL   Pizza or tacos?  ', '/clip 30 Big play', 'hello'].map(x => window.__kmvKickCmd.restOf(x)));
  assert.deepEqual(rest, ['', 'What next?', 'Pizza or tacos?', '30 Big play', ''], 'what followed the command');
  assert.equal(await page.evaluate(() => window.kickCmdAgent(['clip'])), true, 'loading it twice is fine');
});

test('/clip, /poll and /prediction are not sent (Enter or the send button); the app is told instead, with what followed', async t => {
  const { logs, type, sent } = await chat(t);
  await type('/clip 30 Big play');
  await type('/poll', 'button');
  await type('/POLL Pizza or tacos?');
  await type('/prediction');
  assert.deepEqual(await sent(), [], 'nothing reached the chat');
  assert.deepEqual(logs.filter(l => l.startsWith('__kmv:kick-cmd')).map(l => JSON.parse(l.slice('__kmv:kick-cmd '.length))), [
    { cmd: 'clip', text: '30 Big play' }, { cmd: 'poll', text: '' }, { cmd: 'poll', text: 'Pizza or tacos?' }, { cmd: 'prediction', text: '' }]);
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

test('what the chat page says: each command opens its own panel, with what followed it; anything else is ignored', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(() => {
    const view = {};
    const win = ch => { document.querySelectorAll('.win[data-ch]').forEach(e => e.remove());
      const el = document.createElement('div'); el.className = 'win chat'; el.dataset.ch = ch;
      el.style.cssText = 'position:fixed;left:10px;top:60px;width:340px;height:600px;display:flex'; el.innerHTML = '<div class="body"></div>';
      document.body.append(el); return { channel: ch, el, view }; };
    const after = (ch, data, from = view) => { const w = win(ch); window.kickCmdHeard(w, data, from);
      const k = w.el.querySelector('.kcmd');
      return !k ? 'nothing' : k.matches('.kpoll') ? 'poll:' + k.querySelector('[name="subject"]').value : k.matches('.kpred') ? 'prediction' : k.matches('.kclip') ? 'clip' : 'other'; };
    return [
      after('xqc', '{"cmd":"poll","text":"Pizza or tacos?"}'),
      after('xqc', '{"cmd":"poll"}'),
      after('xqc', '{"cmd":"prediction","text":"Win?"}'),
      after('xqc', '{"cmd":"clip","text":"30"}'),
      after('xqc', '{"cmd":"poll","text":"x"}', {}),     // from another page of the window (an old one)
      after('xqc', '{"cmd":"raid"}'),
      after('xqc', 'not json'),
      after('xqc', '{"text":"no command"}'),
      after('tw:someone', '{"cmd":"poll"}'),
      after('tw:someone', '{"cmd":"clip"}')
    ];
  });
  assert.deepEqual(got, ['poll:Pizza or tacos?', 'poll:', 'prediction', 'clip', 'nothing', 'nothing', 'nothing', 'nothing', 'nothing', 'nothing']);
});
