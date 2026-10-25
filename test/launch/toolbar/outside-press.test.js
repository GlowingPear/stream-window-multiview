// The Channels panel in the real app: a press in a stream or chat closes it. The press goes to the <webview>'s own
// page, which the app's page never sees: windows/views.js hears it from the app and says so (shared/popover.js).
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'stream', /player\.kick\.com\/alpha/);
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// a press on a window's view, where nothing (the open panel) is over it
async function pressView(kind){
  const at = await a.win.evaluate(kind => {
    const v = document.querySelector(`#stage .win.${kind} webview`), r = v.getBoundingClientRect();
    for (let y = r.bottom - 10; y > r.top; y -= 20) for (let x = r.right - 10; x > r.left; x -= 20) if (document.elementFromPoint(x, y) === v) return { x, y };
    return null;
  }, kind);
  assert.ok(at, `some of the ${kind} shows`);
  await a.win.mouse.click(at.x, at.y);
}

for (const kind of ['stream', 'chat']) {
  test(`a press in a ${kind} closes the Channels panel`, T, async () => {
    await a.win.click('#savedBtn');
    await a.win.click('#savedInput');
    assert.equal(await a.win.isVisible('#savedPanel'), true, 'a press inside it: open');
    await pressView(kind);
    await a.win.waitForFunction(() => document.querySelector('#savedPanel').hidden, null, { timeout: 5000 });
  });
}
