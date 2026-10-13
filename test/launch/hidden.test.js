// npm run test:launch:hidden: the app's windows are invisible and never take focus, while the tests can
// still click and type in them. Linux can't make a window see-through (CI runs it under xvfb-run anyway).
const test = require('node:test');
const { launchApp, assert } = require('./app');

const T = { timeout: 90000 };
const MAC = process.platform === 'darwin', SEE_THROUGH = process.platform !== 'linux';

test('hidden: the windows are invisible and click-through, nothing takes focus, and the app still works', T, async () => {
  const a = await launchApp({ hidden: true });
  try {
    const state = () => a.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => /index\.html$/.test(w.webContents.getURL()));
      return { hidden: !!globalThis.__smvHidden, opacity: w.getOpacity(), focused: !!BrowserWindow.getFocusedWindow(), full: w.isFullScreen() };
    });
    let s = await state();
    assert.equal(s.hidden, true, 'the hidden mode is loaded');
    if (SEE_THROUGH) assert.equal(s.opacity, 0, 'but it is see-through');
    if (MAC) assert.equal(s.focused, false, 'and has no focus');
    assert.equal(await a.win.evaluate(() => document.visibilityState), 'visible', 'its page still counts as seen, so it draws');

    // what the app does to come to the front changes nothing
    await a.app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => /index\.html$/.test(w.webContents.getURL()));
      w.setOpacity(1); w.show(); w.focus(); w.moveTop(); w.setFullScreen(true); app.focus();
    });
    await a.win.waitForTimeout(300);
    s = await state();
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
    await a.win.fill('#url', 'alpha');
    await a.win.click('#add');
    await a.win.waitForSelector('#stage .win.stream');
  } finally { await a.close(); }
});

