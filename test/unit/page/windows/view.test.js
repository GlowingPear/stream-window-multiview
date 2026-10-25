// Running scripts in a stream's or chat's view (src/page/windows/view.js): on a page still loading, every call waits
// on one listener for that load (Electron's own wait adds one per call, and a chat asked every second piles them up).
const test = require('node:test');
const assert = require('node:assert/strict');

let V;
test.before(async () => { V = await import('../../../../src/page/windows/view.js'); });

// a stand-in <webview>: loading or not, with the listeners added to it counted
function fakeView({ url = 'https://kick.com/popout/alpha/chat', busy = false, fail = false } = {}) {
  const listeners = [];
  return {
    ran: [], url, busy,
    getURL() { return this.url; },
    isLoadingMainFrame() { return this.busy; },
    executeJavaScript(js) { this.ran.push(js); return fail ? Promise.reject(new Error('Script failed to execute')) : Promise.resolve('got ' + js); },
    addEventListener(name, fn, opts) { listeners.push({ name, fn, once: !!(opts && opts.once) }); },
    listeners: name => listeners.filter(l => l.name === name).length,
    stopLoading() { this.busy = false; const all = listeners.splice(0); all.forEach(l => l.fn()); }
  };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('a loaded page: the script runs straight away, with no listener', async () => {
  const v = fakeView();
  assert.equal(await V.askIn(v, '1+1'), 'got 1+1');
  await V.runIn(v, 'x()');
  assert.deepEqual(v.ran, ['1+1', 'x()']);
  assert.equal(v.listeners('did-stop-loading'), 0);
});

test('a page still loading: every call waits on ONE listener, then all run, in order', async () => {
  const v = fakeView({ busy: true });
  const asks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => V.askIn(v, 'poll' + n));
  V.runIn(v, 'inject()');
  await tick();
  assert.equal(v.listeners('did-stop-loading'), 1, 'one listener, not 13');
  assert.deepEqual(v.ran, [], 'nothing runs before it has loaded');
  v.stopLoading();
  assert.deepEqual((await Promise.all(asks)).slice(0, 2), ['got poll1', 'got poll2']);
  await tick();
  assert.deepEqual(v.ran, [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => 'poll' + n), 'inject()']);
  // loaded now: no more waiting; the next load waits on a new listener
  await V.askIn(v, 'after');
  assert.equal(v.listeners('did-stop-loading'), 0);
  v.busy = true; V.runIn(v, 'again'); await tick();
  assert.equal(v.listeners('did-stop-loading'), 1);
  v.stopLoading(); await tick();
  assert.equal(v.ran.at(-1), 'again');
});

test('a page with no address yet counts as loading; runIn never fails, askIn passes the failure on', async () => {
  const v = fakeView({ url: '' });
  const p = V.askIn(v, 'a');
  await tick();
  assert.equal(v.listeners('did-stop-loading'), 1);
  v.url = 'https://x/'; v.stopLoading();
  assert.equal(await p, 'got a');
  const bad = fakeView({ fail: true });
  await V.runIn(bad, 'x');                                  // never fails
  await assert.rejects(V.askIn(bad, 'x'), /Script failed/);
  // a view that throws when asked, or isn't a view at all
  const odd = { executeJavaScript() { throw new Error('gone'); }, getURL() { throw new Error('gone'); } };
  await V.runIn(odd, 'x');
  await assert.rejects(V.askIn(odd, 'x'), /gone/);
  await V.runIn(null, 'x');
  await assert.rejects(V.askIn(null, 'x'), /no view/);
  // an older view without isLoadingMainFrame: isLoading
  const old = { getURL: () => 'https://x/', isLoading: () => false, executeJavaScript: async js => js };
  assert.equal(await V.askIn(old, 'y'), 'y');
});
