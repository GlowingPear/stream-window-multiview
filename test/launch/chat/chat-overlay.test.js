// Chat over streams in the real app: the toolbar button switches it on, a new message in a channel's real chat window
// shows over its stream, and over the stream once it's popped out into the Streams window (the main process passes the
// lines on). Players and chats are stand-in pages (see app.js).
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');

let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const say = (sender, text) => inView(a.win, 'alpha', 'chat', ([s, t]) => {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = '<b></b>: <span></span>'; d.querySelector('b').textContent = s; d.querySelector('span').textContent = t;
  document.getElementById('chat').appendChild(d);
}, [sender, text]);
// the chat helper treats what's already there as old for 2.5 s after it starts handing messages over
const armed = () => inView(a.win, 'alpha', 'chat', () => !!(window.__kmvMention && window.__kmvMention.ready && window.__kmvMention.ready()));
async function waitArmed(){
  for (const end = Date.now() + 15000; !(await armed()); ) {
    assert.ok(Date.now() < end, 'the chat helper never started');
    await new Promise(r => setTimeout(r, 250));
  }
}

test('the toolbar button turns it on; a new chat message shows over its stream', { timeout: 60000 }, async () => {
  assert.equal(await a.win.isVisible('#overlayBtn'), true, 'in the toolbar');
  await a.win.click('#overlayBtn');
  assert.equal(await a.win.getAttribute('#overlayBtn', 'aria-pressed'), 'true');
  await waitArmed();
  await say('mossyrock', 'hello from chat');
  await a.win.waitForFunction(() => [...document.querySelectorAll('#stage .win.stream .co-line')].some(l => l.textContent === 'mossyrock: hello from chat'), null, { timeout: 10000 });
});

test('popped out into the Streams window, the stream still shows its chat\'s new messages', { timeout: 90000 }, async () => {
  await a.win.click('#popBtn');
  let sw = null;
  for (let i = 0; i < 100 && !sw; i++) { sw = a.app.windows().find(p => !p.isClosed() && /role=streams/.test(p.url())); if (!sw) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(sw, 'the Streams window opened');
  await sw.waitForSelector('#stage .win.stream');
  await say('tinycomet', 'seen in the Streams window');
  await sw.waitForFunction(() => [...document.querySelectorAll('#stage .win.stream .co-line')].some(l => l.textContent === 'tinycomet: seen in the Streams window'), null, { timeout: 10000 });
  await a.win.evaluate(() => window.kmv.closeStreams());
});
