// Scripts the app runs in a chat or stream while its page is still loading (src/page/windows/view.js): they wait for it
// on one listener, not one each. Electron's own wait adds a listener per call, and a chat asked every second or two
// while it loads collected 11 and more ("MaxListenersExceededWarning: 11 did-stop-loading listeners").
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha', 'chat');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  // a page that takes 4 seconds to arrive, in the chats' session
  await a.app.evaluate(({ session, net }) => {
    const ses = session.fromPartition('persist:kick');
    ses.protocol.unhandle('https');
    ses.protocol.handle('https', req => /[?&]slow=1/.test(req.url)
      ? new Promise(r => setTimeout(() => r(new Response('<!doctype html><title>chat</title><body>slow</body>', { headers: { 'content-type': 'text/html' } })), 4000))
      : net.fetch(req, { bypassCustomProtocolHandlers: true }));
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const chatWc = fn => a.app.evaluate(({ webContents }, src) => {
  const wc = webContents.getAllWebContents().find(w => w.getType() === 'webview' && /kick\.com\/popout\/alpha\/chat/.test(w.getURL()));
  return new Function('wc', `return (${src})(wc)`)(wc);
}, fn.toString());

test('15 scripts while the chat loads: one listener on its page, and all of them run once it has loaded', T, async () => {
  const base = await chatWc(wc => wc.listenerCount('did-stop-loading'));
  await a.win.evaluate(() => {
    const v = [...document.querySelectorAll('#stage .win.chat webview')][0];
    v.loadURL('https://kick.com/popout/alpha/chat?slow=1').catch(() => {});
    window.__answers = [];
    for (let i = 0; i < 15; i++) window.viewCalls.askIn(v, `window.__n = (window.__n || 0) + 1`).then(n => window.__answers.push(n), e => (window.__errs = window.__errs || []).push(String(e)));
    window.viewCalls.runIn(v, 'window.__ran = true');
  });
  await new Promise(r => setTimeout(r, 1000));
  const during = await chatWc(wc => [wc.isLoadingMainFrame(), wc.listenerCount('did-stop-loading')]);
  assert.equal(during[0], true, 'still loading');
  assert.ok(during[1] <= base + 1, `${during[1]} did-stop-loading listeners (${base} before)`);
  await a.win.waitForFunction(() => window.__answers.length === 15, null, { timeout: 15000 });
  assert.deepEqual(await a.win.evaluate(() => window.__answers.sort((x, y) => x - y)), Array.from({ length: 15 }, (_, i) => i + 1), 'each ran once, on the loaded page');
  assert.equal(await a.win.evaluate(() => [...document.querySelectorAll('#stage .win.chat webview')][0].executeJavaScript('window.__ran === true && document.body.textContent')), 'slow');
  assert.equal(await chatWc(wc => wc.listenerCount('did-stop-loading')), base, 'and none left over');
});
