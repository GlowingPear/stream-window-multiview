// Twitch's content gate in the real app (windows/content-gate.js): for a stream whose labels your Twitch content
// preferences limit, its embedded player keeps the gate up after its own Watch Anyway. Pressing it there loads the
// stream again without the gate (showMature=false), and the channel stays that way on this computer. The player is
// a stand-in (see app.js: the channel "gated"), which is still loading when it's pressed, as Twitch's often is.
const test = require('node:test');
const { launchApp, inView, viewLoaded, winSel, assert, openChannel, setMode } = require('../app');

const T = { timeout: 90000 };
const BUTTON = '[data-a-target="content-classification-gate-overlay-watch-anyway-button"]';
const SKIP = /[?&]showMature=false(&|$)/;
let a;
test.before(async () => { a = await launchApp(); await setMode(a.win, 'stream'); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const saved = () => a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.watchAnyway') || 'null'));
const src = title => a.win.locator(`${winSel(title)} webview`).evaluate(v => v.getURL());
// Until a window's stream has loaded without the gate (a limit, so a press that was missed fails here quickly)
async function skipped(title){
  for (let i = 0; i < 150; i++){ if (SKIP.test(await src(title).catch(() => ''))) return; await a.win.waitForTimeout(100); }
  assert.fail(`${title}'s stream wasn't loaded again without the gate`);
}
// The player's own page (Playwright's, for a real press in it): the newest with that channel in its address
async function playerPage(ch){
  for (let i = 0; i < 100; i++){
    const p = a.app.context().pages().filter(p => new RegExp(`^https://player\\.twitch\\.tv/\\?.*channel=${ch}(&|$)`).test(p.url())).pop();
    if (p) return p;
    await a.win.waitForTimeout(100);
  }
  throw new Error('no player page for ' + ch);
}

test('Watch Anyway, pressed while the player is still loading: the stream loads again without the gate, and the channel stays so', T, async () => {
  await openChannel(a.win, 'tw:gated');
  const p = await playerPage('gated');
  await p.locator(BUTTON).waitFor();
  assert.equal(await p.evaluate(() => !!window.__loaded), false, 'its page is still loading');
  assert.doesNotMatch(await src('gated'), SKIP, 'the gate shows the first time');
  await p.locator(BUTTON).click();
  await skipped('gated');
  assert.deepEqual(await saved(), ['tw:gated']);
  const again = await playerPage('gated');
  await again.waitForFunction(() => document.querySelector('video'));
  assert.equal(await again.locator('[data-a-target="content-classification-gate-overlay"]').count(), 0, 'no gate');

  // Opened again: without the gate straight away
  await a.win.click(`${winSel('gated')} [data-a=close]`);
  await openChannel(a.win, 'tw:gated');
  await skipped('gated');
  assert.deepEqual(await saved(), ['tw:gated'], 'kept once');
});

test('another Twitch channel still shows its gate, and a message that isn\'t the press changes nothing', T, async () => {
  await openChannel(a.win, 'tw:plain');
  await viewLoaded(a.win, 'plain', 'stream', /channel=plain/);
  await inView(a.win, 'plain', 'stream', () => { console.log('__kmv:watch-anyway {"x":1}'); console.log('__kmv:other {}'); });
  await a.win.waitForTimeout(500);
  assert.doesNotMatch(await src('plain'), SKIP);
  assert.deepEqual(await saved(), ['tw:gated']);
});

test('pressed in the other window: this window\'s streams of that channel load again without the gate', T, async () => {
  await openChannel(a.win, 'tw:gatedtwo');
  await viewLoaded(a.win, 'gatedtwo', 'stream', /channel=gatedtwo/);
  assert.doesNotMatch(await src('gatedtwo'), SKIP);
  // (the other window saves it: this one hears it as a storage event)
  await a.win.evaluate(() => {
    const k = 'kickMultiview.watchAnyway', v = JSON.stringify([...JSON.parse(localStorage.getItem(k) || '[]'), 'tw:gatedtwo']);
    localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v }));
  });
  await skipped('gatedtwo');
  assert.doesNotMatch(await src('plain'), SKIP, 'other channels are left as they are');
});

test('a script in a page this window holds, run before it has loaded (view:run-early): only such a page, only a script', T, async () => {
  const id = await a.win.locator(`${winSel('plain')} webview`).evaluate(v => v.getWebContentsId());
  assert.equal(await a.win.evaluate(id => window.kmv.viewRunEarly(id, 'window.__early = 1'), id), true);
  assert.equal(await inView(a.win, 'plain', 'stream', () => window.__early), 1);
  assert.equal(await a.win.evaluate(id => window.kmv.viewRunEarly(id, 'throw new Error("no")'), id), false, 'a script that fails');
  for (const bad of [[999999, '1'], ['x', '1'], [id, 5], [id, 'x'.repeat(20001)], [null, '1']])
    assert.equal(await a.win.evaluate(b => window.kmv.viewRunEarly(...b), bad), false, JSON.stringify(bad).slice(0, 60));
});
