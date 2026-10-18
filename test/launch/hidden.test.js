// npm run test:launch:hidden: the app's windows never go on the screen and never take focus, while the tests
// can still click and type in them. Windows Electron opens itself are see-through (Linux can't do that; CI
// runs it under xvfb-run anyway).
const test = require('node:test');
const { launchApp, assert, openChannel } = require('./app');

const T = { timeout: 90000 };
const MAC = process.platform === 'darwin', SEE_THROUGH = process.platform !== 'linux';

test('hidden: the windows stay off the screen, nothing takes focus, and the app still works (and draws)', T, async () => {
  const a = await launchApp({ hidden: true });
  try {
    const state = () => a.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => /index\.html$/.test(w.webContents.getURL()));
      return { hidden: !!globalThis.__smvHidden, shown: globalThis.__smvOnScreen(w), visible: w.isVisible(), opacity: w.getOpacity(), focused: !!BrowserWindow.getFocusedWindow(), full: w.isFullScreen() };
    });
    let s = await state();
    assert.equal(s.hidden, true, 'the hidden mode is loaded');
    assert.equal(s.shown, false, 'its window is not on the screen');
    assert.equal(s.visible, true, 'but the app is told it is');
    if (SEE_THROUGH) assert.equal(s.opacity, 0, 'and see-through, if it ever is');
    if (MAC) assert.equal(s.focused, false, 'and has no focus');
    assert.equal(await a.win.evaluate(() => document.visibilityState), 'visible', 'its page still counts as seen, so it draws');

    // what the app does to come to the front changes nothing
    await a.app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => /index\.html$/.test(w.webContents.getURL()));
      w.setOpacity(1); w.show(); w.focus(); w.moveTop(); w.setFullScreen(true); app.focus();
    });
    await a.win.waitForTimeout(300);
    s = await state();
    assert.equal(s.shown, false, 'still not on the screen');
    if (SEE_THROUGH) assert.equal(s.opacity, 0, 'still see-through');
    if (MAC) assert.equal(s.focused, false, 'still no focus');
    assert.equal(s.full, false, 'no fullscreen Space');

    // a window it opens itself (and one made hidden, then shown) is see-through too
    await a.win.evaluate(() => window.open('https://kick.com/someone', '_blank'));
    await a.app.evaluate(({ BrowserWindow }) => { const w = new BrowserWindow({ show: false }); w.loadURL('about:blank'); w.show(); });
    let others = [];
    for (let i = 0; i < 50 && others.length < 2; i++) {     // they take a moment to open on a busy computer
      await a.win.waitForTimeout(200);
      others = await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
        .filter(w => /kick\.com\/someone|about:blank/.test(w.webContents.getURL())).map(w => w.getOpacity()));
    }
    assert.equal(others.length, 2, 'the other windows opened');
    if (SEE_THROUGH) assert.deepEqual(others, others.map(() => 0));

    // no desktop notification
    await a.app.evaluate(({ Notification }) => new Notification({ title: 'test', body: 'hidden' }).show());

    // the tests still click and type in it
    await openChannel(a.win, 'alpha');
    await a.win.waitForSelector('#stage .win.stream');
    // and it keeps drawing (Playwright waits for a drawn frame before every click): a see-through window on the
    // screen drew about once a second after a few seconds (a Mac, Electron 42 on)
    await a.win.waitForTimeout(6000);
    const frames = await a.win.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
    assert.ok(frames >= 20, `it draws (${frames} frames in a second)`);
  } finally { await a.close(); }
});

