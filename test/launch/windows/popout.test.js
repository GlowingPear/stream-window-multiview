// Popping streams out into their own window, the Streams window's own layouts and swaps, sending a chat
// back, bringing the streams back, popping out only the hidden ones, and the switch control in its own
// window. Players and chats are stand-in pages (see app.js).
const test = require('node:test');
const { launchApp, winSel, assert, openChannel } = require('../app');
const { startCoverage, saveCoverage } = require('../../helpers');
// npm run test:coverage: keep what a window ran before closing it (a closed window's record is lost)
const keep = async page => { await saveCoverage(page); await startCoverage(page); };

const T = { timeout: 90000 };
let a;
test.before(async () => { a = await launchApp(); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const add = async (...links) => { for (const l of links) await openChannel(a.win, l); };
const titles = (page, kind) => page.$$eval(`#stage .win.${kind}`, l => l.map(e => e.querySelector('.title').textContent).sort());
const clear = async () => { if (await a.win.locator('#stage .win').count()){ await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes'); } };
test.beforeEach(async () => {                             // each test starts with nothing open, streams back here
  if (!a) return;
  if (a.app.windows().some(p => /role=streams/.test(p.url()))) { await a.win.evaluate(() => window.kmv.closeStreams()); await a.win.waitForTimeout(500); }
  await clear();
});
async function windowFor(re) {
  for (let i = 0; i < 100; i++) {
    const w = a.app.windows().find(p => !p.isClosed() && re.test(p.url()));
    if (w) { await w.waitForLoadState('domcontentloaded'); return w; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('window did not open: ' + re);
}
// Waits until no window has moved for 200 ms (at most 4 s).
async function settled(page) {
  let prev = '';
  for (let i = 0; i < 40; i++) {
    const now = JSON.stringify(await page.$$eval('#stage .win', l => l.map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })));
    if (now === prev) return;
    prev = now; await page.waitForTimeout(200);
  }
}
const box = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };

test('Pop out streams: streams move to their own window with Tile, Spotlight and swaps; chats stay; Bring streams back', T, async () => {
  await add('alpha', 'bravo', 'charlie');
  await a.win.click('#popBtn');
  const sw = await windowFor(/role=streams/);
  const errors = []; sw.on('pageerror', e => errors.push(e.message));
  await sw.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 3);
  await sw.waitForTimeout(1500);                       // the window settles at its size and lays out again
  await a.win.waitForFunction(() => !document.querySelector('#stage .win.stream'));
  await a.win.waitForFunction(() => document.querySelectorAll('#stage .win.chat').length === 3, null, { timeout: 5000 }).catch(() => {});
  const chats = await titles(a.win, 'chat');
  assert.deepEqual(chats, ['alpha', 'bravo', 'charlie'], `the chats stay (${chats.join(', ')})`);
  assert.match(await a.win.textContent('#popBtn'), /Bring|back/i, 'the button now brings them back');

  await sw.click('#tile'); await sw.waitForTimeout(400);
  const t = await sw.$$eval('#stage .win.stream', l => l.map(e => e.offsetWidth));
  assert.ok(Math.max(...t) - Math.min(...t) < 4, 'Tile: equal sizes');
  await sw.click(`${winSel('bravo')} .bar .grab`);   // the bar's empty part, not its channel dropdown
  await sw.click('#spotBtn'); await sw.waitForTimeout(400);
  const sizes = await sw.$$eval('#stage .win.stream', l => Object.fromEntries(l.map(e => [e.querySelector('.title').textContent, e.offsetWidth])));
  assert.ok(sizes.bravo > sizes.alpha * 2, 'Spotlight: the one you clicked is big');

  // drag one stream onto another: they swap spots (measured once Spotlight has finished moving them; on a busy
  // machine that takes longer than the wait above)
  await settled(sw);
  const al = await box(sw, `${winSel('alpha')} .bar .grab`), br = await box(sw, winSel('bravo'));
  await sw.mouse.move(al.x + al.w / 2, al.y + al.h / 2); await sw.mouse.down();      // the bar's empty part, not its channel dropdown
  await sw.mouse.move(br.x + br.w / 2, br.y + br.h / 2, { steps: 10 }); await sw.mouse.up();
  await sw.waitForFunction(() => {                      // the swap animates: wait for it (longer on a busy machine)
    const w = Object.fromEntries([...document.querySelectorAll('#stage .win.stream')].map(e => [e.querySelector('.title').textContent, e.offsetWidth]));
    return w.alpha > w.bravo * 2;
  }, null, { timeout: 5000 }).catch(() => {});
  const after = await sw.$$eval('#stage .win.stream', l => Object.fromEntries(l.map(e => [e.querySelector('.title').textContent, e.offsetWidth])));
  assert.ok(after.alpha > after.bravo * 2, `dropped on the big one, alpha takes its place (${JSON.stringify(after)})`);

  // + Chat in the Streams window opens that chat in the main window
  await a.win.click(`${winSel('charlie', 'chat')} [data-a=close]`);
  await sw.$eval(`${winSel('charlie')} [data-a=chat]`, b => b.click());     // (hidden on narrow windows)
  await a.win.waitForSelector(winSel('charlie', 'chat'));

  // a channel added while they're popped out goes to the Streams window, its chat here
  await add('delta');
  await sw.waitForSelector(winSel('delta'));
  assert.deepEqual(await titles(a.win, 'stream'), []);
  assert.ok((await titles(a.win, 'chat')).includes('delta'));

  await keep(sw);
  // the button closes this window, which can happen before Playwright has finished the click
  await Promise.all([sw.waitForEvent('close'), sw.click('#backBtn').catch(e => { if (!/closed/i.test(e.message)) throw e; })]);
  await a.win.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 4);
  assert.equal(a.app.windows().some(p => /role=streams/.test(p.url())), false, 'the Streams window closed');
  assert.deepEqual(errors, []);
});

test('Pop out hidden: only the streams you can\'t see go to the Streams window', T, async () => {
  await add('alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel');
  await a.win.keyboard.press('f');
  await a.win.click('#featSwitch .fs-pophid');
  const sw = await windowFor(/role=streams/);
  await sw.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length > 0);
  const out = await titles(sw, 'stream'), here = await titles(a.win, 'stream');
  assert.ok(out.length && here.length, `some went (${out.join(', ')}), some stayed (${here.join(', ')})`);
  assert.ok(here.includes('alpha'), 'the big one stays');
  await keep(sw);
  await sw.close();
  await a.win.waitForFunction(() => document.querySelectorAll('#stage .win.stream').length === 8);
});

test('the switch control in its own window controls the main window', T, async () => {
  await add('alpha', 'bravo', 'charlie');
  // Focus view: the last test can leave the layout on it, and then f would switch it back to Columns
  if (!(await a.win.$('#layoutMenu [data-l=focus].on'))) await a.win.keyboard.press('f');
  await a.win.click('#featSwitch .fs-mwin');
  const sc = await windowFor(/switcher\.html/);
  await sc.waitForSelector('.fs-item[data-ch=bravo]');
  assert.ok(await a.win.isHidden('#featSwitch'), 'gone from the main window');
  await sc.click('.fs-item[data-ch=bravo] .fs-name');
  await a.win.waitForFunction(() => document.querySelector('#stage .win.stream.featured .title')?.textContent === 'bravo');
  await sc.click('.fs-item[data-ch=charlie] .fs-mute');
  await a.win.waitForFunction(sel => !document.querySelector(sel)?.classList.contains('muted'), `#stage .win.stream:nth-of-type(1)`).catch(() => {});
  await sc.waitForFunction(() => document.querySelector('.fs-item[data-ch=charlie] .fs-pct')?.textContent.endsWith('%'));
  await sc.click('.fs-item[data-ch=alpha] .fs-play');
  await sc.waitForFunction(() => document.querySelector('.fs-item[data-ch=alpha]').classList.contains('paused'));
  const onTop = () => a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => /switcher/.test(w.webContents.getURL())).isAlwaysOnTop());
  const was = await onTop();
  await sc.click('.fs-pin');
  await sc.waitForTimeout(300);
  assert.equal(await onTop(), !was, 'the pin keeps it on top of other windows, or not');
  await sc.click('.fs-side select'); await sc.click('.dd-list button:text-is("2")');   // its own window has the app's dropdown list too
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.sideCols')), '2');
  await keep(sc);
  // the button closes this window, sometimes before the click has finished
  await Promise.all([sc.waitForEvent('close'), sc.click('.fs-mfloat').catch(e => { if (!/closed/i.test(e.message)) throw e; })]);
  await a.win.waitForFunction(() => document.getElementById('featSwitch').classList.contains('floating'));
  assert.equal(a.app.windows().some(p => /switcher\.html/.test(p.url())), false, 'its window closed');
  await a.win.click('#featSwitch .fs-mdock');
});
