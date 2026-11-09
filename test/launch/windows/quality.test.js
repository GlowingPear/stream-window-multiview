// Stream quality in the real app (windows/quality.js): the quality button on a stream's title bar (what it plays), its
// menu, Settings' and a channel's choice, Fits the window, hidden streams at their lowest, and Kick putting its own
// 720p cap back. The players are stand-ins (see app.js): Kick's and Twitch's an IVS player capped at 720p, YouTube's
// with its own quality calls.
const test = require('node:test');
const { launchApp, inView, winSel, assert, openChannel, setMode } = require('../app');

const T = { timeout: 120000 };
let a;
test.before(async () => {
  a = await launchApp();
  await setMode(a.win, 'stream');
});
test.after(async () => { if (!a) return; const errors = [...a.errors]; await a.close(); assert.deepEqual(errors, [], 'the page had no errors'); });

const btn = ch => winSel(ch) + ' .btns [data-a=quality]';
const label = ch => a.win.textContent(btn(ch));
const ivs = ch => inView(a.win, ch, 'stream', () => ({ now: window.__ivs.getQuality().name, caps: window.__ivs.caps }));
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; let v; while (!(v = await fn().catch(() => null)) && Date.now() < end) await new Promise(r => setTimeout(r, 150)); return v; };
const plays = (ch, name) => until(async () => (await ivs(ch)).now === name);
const set = (k, v) => a.win.evaluate(([k, v]) => { localStorage.setItem('kickMultiview.' + k, typeof v === 'string' ? v : JSON.stringify(v)); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.' + k, newValue: localStorage.getItem('kickMultiview.' + k) })); }, [k, v]);
const unset = k => a.win.evaluate(k => { localStorage.removeItem('kickMultiview.' + k); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.' + k, newValue: null })); }, k);
const rectOf = (ch, r) => a.win.evaluate(([ch, r]) => { const w = window.openWins().find(o => o.channel === ch && o.kind === 'stream'); window.setWinRect(w, r); }, [ch, r]);
const winQuality = ch => a.win.evaluate(ch => window.openWins().find(o => o.channel === ch && o.kind === 'stream').quality || null, ch);

test('a Kick stream: its button says what it plays; the menu picks Best, a height, or its channel\'s again, saved with the window', T, async () => {
  await openChannel(a.win, 'nightowl');
  await a.win.waitForSelector(btn('nightowl') + ':not([hidden])', { timeout: 20000 });
  assert.equal(await label('nightowl'), '720p');
  assert.match(await a.win.getAttribute(btn('nightowl'), 'title'), /^Quality: 720p60 · Site's own$/);
  await a.win.click(btn('nightowl'));
  assert.equal(await a.win.isVisible('#qualityMenu'), true);
  assert.deepEqual(await a.win.$$eval('#qualityMenu .qm-tile', l => l.map(b => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : ''))), ['Channel\'s*', 'Fit', 'Best']);
  assert.deepEqual(await a.win.$$eval('#qualityMenu .qm-step', l => l.map(b => b.textContent + (b.classList.contains('now') ? ' (playing)' : ''))), ['1080', '720 (playing)', '480', '360', '160']);
  await a.win.click('#qualityMenu [data-q=best]');
  assert.ok(await plays('nightowl', '1080p60'), 'past Kick\'s own 720p');
  await until(async () => (await label('nightowl')) === '1080p');
  assert.equal(await winQuality('nightowl'), 'best');
  assert.equal(await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.v1')).find(w => w.channel === 'nightowl').quality), 'best', 'saved with the window');
  await a.win.click('#qualityMenu [data-q="360"]');
  assert.ok(await plays('nightowl', '360p'));
  assert.equal(await a.win.getAttribute('#qualityMenu [data-q="360"]', 'aria-checked'), 'true');
  await a.win.click('#qualityMenu [data-q=channel]');
  assert.ok(await plays('nightowl', '720p60'), 'its channel\'s again: the site\'s own');
  assert.equal(await winQuality('nightowl'), null);
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.isVisible('#qualityMenu'), false);
});

test('Kick puts its own 720p cap back when its player loads again: the app sets its quality again', T, async () => {
  await a.win.evaluate(() => window.quality.setWinQuality(window.openWins().find(o => o.channel === 'nightowl'), 'best'));
  assert.ok(await plays('nightowl', '1080p60'));
  await inView(a.win, 'nightowl', 'stream', () => window.__ivs.reset());
  assert.equal((await ivs('nightowl')).now, '720p60');
  assert.ok(await plays('nightowl', '1080p60'), 'set again');
  await a.win.evaluate(() => window.quality.setWinQuality(window.openWins().find(o => o.channel === 'nightowl'), null));
});

test('a channel\'s own quality (Channel settings), and Settings\' for every stream; the window\'s own wins over both', T, async () => {
  await set('chanOpts', { nightowl: { quality: '480' } });
  assert.ok(await plays('nightowl', '480p'), 'its channel\'s');
  await set('quality', 'best');
  assert.equal((await ivs('nightowl')).now, '480p', 'its channel\'s wins over Settings\'');
  await unset('chanOpts');
  assert.ok(await plays('nightowl', '1080p60'), 'Settings\'');
  await a.win.evaluate(() => window.quality.setWinQuality(window.openWins().find(o => o.channel === 'nightowl'), '160'));
  assert.ok(await plays('nightowl', '160p'), 'the window\'s own');
  await a.win.evaluate(() => window.quality.setWinQuality(window.openWins().find(o => o.channel === 'nightowl'), null));
  await unset('quality');
  assert.ok(await plays('nightowl', '720p60'));
});

test('Fits the window: from its size on the screen, inside Settings\' range; up to the site\'s own is Kick\'s 720p', T, async () => {
  await set('qualityFit', { min: 160, max: 1080 });
  await set('quality', 'fit');
  // a window whose picture is about this many of the screen's pixels tall (16:9, under its 30 px title bar)
  const dpr = await a.win.evaluate(() => devicePixelRatio);
  const tall = px => rectOf('nightowl', { x: 20, y: 20, w: Math.round(px * 16 / 9 / dpr) + 2, h: Math.round(px / dpr) + 30 });
  await tall(950);
  assert.ok(await plays('nightowl', '1080p60'), 'big');
  await tall(300);
  assert.ok(await plays('nightowl', '360p'), 'small');
  await set('qualityFit', { min: 480, max: 1080 });
  assert.ok(await plays('nightowl', '480p'), 'never under the lowest');
  await tall(950);
  await unset('qualityFit');
  assert.ok(await plays('nightowl', '720p60'), 'up to the site\'s own');
  assert.match(await a.win.getAttribute(btn('nightowl'), 'title'), /Fits the window \(160–720p\)/);
  await unset('quality');
});

test('a stream you can\'t see plays at its lowest after a moment, and at its quality again when you can; Settings can keep it', T, async () => {
  await rectOf('nightowl', { x: 20, y: 20, w: 640, h: 400 });
  assert.ok(await plays('nightowl', '720p60'));
  await rectOf('nightowl', { x: 5000, y: 20, w: 640, h: 400 });
  assert.ok(await plays('nightowl', '160p'), 'off the screen');
  await rectOf('nightowl', { x: 20, y: 20, w: 640, h: 400 });
  assert.ok(await plays('nightowl', '720p60'), 'back');
  await set('qualityHidden', 'same');
  await rectOf('nightowl', { x: 5000, y: 20, w: 640, h: 400 });
  await a.win.waitForTimeout(4500);
  assert.equal((await ivs('nightowl')).now, '720p60', 'Their usual quality');
  await rectOf('nightowl', { x: 20, y: 20, w: 640, h: 400 });
  await unset('qualityHidden');
});

test('a Twitch stream has it too, and Twitch\'s own goes as high as the stream', T, async () => {
  await openChannel(a.win, 'twitch.tv/quietkoala');
  await a.win.waitForSelector(btn('quietkoala') + ':not([hidden])', { timeout: 20000 });
  assert.ok(await plays('quietkoala', '1080p60'), 'no cap of its own');
  assert.equal(await label('quietkoala'), '1080p');
});

test('out of room it goes into ⋯ with what it plays, and opens its menu under ⋯; Settings › Windows can keep it there', T, async () => {
  await rectOf('nightowl', { x: 20, y: 20, w: 300, h: 200 });
  await a.win.waitForSelector(winSel('nightowl') + ' [data-a=more]:not([hidden])');
  await a.win.click(winSel('nightowl') + ' [data-a=more]');
  const row = '#barMenu button:has(.bm-t:text-is("Quality"))';
  assert.equal(await a.win.textContent(row + ' .bm-n'), await label('nightowl'));
  await a.win.click(row);
  assert.equal(await a.win.isVisible('#qualityMenu'), true);
  const [m, more] = await Promise.all([a.win.locator('#qualityMenu').boundingBox(), a.win.locator(winSel('nightowl') + ' [data-a=more]').boundingBox()]);
  assert.ok(Math.abs(m.y - (more.y + more.height + 4)) < 2, 'under ⋯');
  await a.win.keyboard.press('Escape');
  await rectOf('nightowl', { x: 20, y: 20, w: 900, h: 520 });
  await set('barButtons', { order: [], always: ['quality', 'ext', 'state', 'inspect'], never: null });
  await until(() => a.win.locator(btn('nightowl')).evaluate(b => b.classList.contains('ovf')));
  assert.equal(await a.win.locator(btn('nightowl')).evaluate(b => b.classList.contains('ovf')), true, 'always in ⋯');
  await unset('barButtons');
});

test('the search box lists its choices for the window', T, async () => {
  const titles = await a.win.evaluate(() => window.winActions(window.openWins().find(o => o.channel === 'nightowl')));
  for (const t of ['Quality: as its channel says ✓', 'Quality: fits the window', 'Quality: best', 'Quality: up to 1080p', 'Quality: up to 160p']) assert.ok(titles.includes(t), t);
});

test('the menu opens under its button with the toolbar on top, on the left, and on the left with icons only', T, async () => {
  for (const tb of [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }]) {
    await a.win.evaluate(tb => localStorage.setItem('kickMultiview.toolbar', JSON.stringify(tb)), tb);
    await a.win.reload();
    await a.win.waitForSelector(btn('nightowl') + ':not([hidden])', { timeout: 20000 });
    await a.win.click(btn('nightowl'));
    const [m, b] = await Promise.all([a.win.locator('#qualityMenu').boundingBox(), a.win.locator(btn('nightowl')).boundingBox()]);
    assert.ok(Math.abs(m.y - (b.y + b.height + 4)) < 2 && Math.abs(m.x + m.width - (b.x + b.width)) < 2, `${JSON.stringify(tb)}: under its button, lined up on the right`);
    await a.win.keyboard.press('Escape');
  }
  await a.win.evaluate(() => localStorage.removeItem('kickMultiview.toolbar'));
});
