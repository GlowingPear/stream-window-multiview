// Streams in the real desktop app: each stream's volume (title bar and switch control), pause and play,
// auto-pause for streams you can't see, "pause all except focus", small previews, chat text size, and
// YouTube channels waiting until they're live. The players and chats are stand-in pages (see app.js).
const test = require('node:test');
const { launchApp, inView, viewLoaded, winSel, assert, openChannel, setMode } = require('../app');

const T = { timeout: 60000 };
let a;
test.before(async () => { a = await launchApp({ storage: { 'kickMultiview.alerts': { mention: { sound: 'none' }, spam: { sound: 'none' } } } }); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const add = async (...links) => { for (const l of links) await openChannel(a.win, l); };
const video = (title, prop) => inView(a.win, title, 'stream', p => { const v = document.getElementById('v'); return v ? v[p] : null; }, prop);
const ready = title => viewLoaded(a.win, title, 'stream', /player/);
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const clear = async () => { if (await a.win.locator('#stage .win').count()){ await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes'); } };
test.beforeEach(() => a && clear());                       // each test starts with nothing open

test('YouTube: the cookie question is answered with the button you picked, in any language, and an ad\'s Skip button is found', T, async () => {
  const r = await a.win.evaluate(() => {
    const lb = document.createElement('ytd-consent-bump-v2-lightbox'), dlg = document.createElement('tp-yt-paper-dialog'), clicked = [];
    lb.data = { disagreeButton: { buttonRenderer: { text: { simpleText: 'Tout refuser' } } }, agreeButton: { buttonRenderer: { text: { runs: [{ text: 'Tout ' }, { text: 'accepter' }] } } } };
    for (const t of ['Tout refuser', 'Tout accepter']) { const b = document.createElement('button'); b.textContent = t; b.onclick = () => clicked.push(t); dlg.append(b); }
    dlg.opened = true; lb.append(dlg); document.body.append(lb);
    const out = { reject: ytAgent(false, 'reject'), accept: ytAgent(false, 'accept'), off: ytAgent(false, '') };
    lb.data = {}; out.changed = ytAgent(false, 'reject');
    dlg.opened = false; out.answered = ytAgent(false, 'reject');
    lb.remove();
    const sk = document.createElement('button'); sk.className = 'ytp-skip-ad-button';
    sk.style.cssText = 'position:fixed;left:100px;top:50px;width:80px;height:30px'; document.body.append(sk);
    out.skip = ytAgent(true, ''); out.skipOff = ytAgent(false, ''); sk.remove();
    out.noAd = ytAgent(true, 'reject');
    return { out, clicked };
  });
  assert.deepEqual(r.clicked, ['Tout refuser', 'Tout accepter'], 'each button found by its label from the question itself');
  assert.deepEqual(r.out, { reject: { consent: 'clicked' }, accept: { consent: 'clicked' }, off: {}, changed: { consent: 'missing' }, answered: {},
    skip: { skip: { x: 140, y: 65 } }, skipOff: {}, noAd: {} });
  // the fallback: "Reject all" saved in that YouTube player's storage, and only a player's
  assert.equal(await a.win.evaluate(() => window.kmv.ytConsentFallback('persist:kmv-stream-yt__test')), true);
  const c = await a.app.evaluate(({ session }) => session.fromPartition('persist:kmv-stream-yt__test').cookies.get({ name: 'SOCS' }));
  assert.deepEqual(c.map(x => [x.domain, x.secure]), [['.youtube.com', true]]);
  assert.equal(await a.win.evaluate(() => window.kmv.ytConsentFallback('persist:kick')), false);
});

test('YouTube: Skip is clicked for real without taking your keyboard, and a question it can\'t answer falls back to "Reject all"', T, async () => {
  await setMode(a.win, 'stream');
  await add('https://www.youtube.com/watch?v=abcdefghijk');
  const title = await a.win.$eval('#stage .win.stream .title', e => e.textContent);
  await viewLoaded(a.win, title, 'stream', /youtube\.com\/watch/);
  await add('alpha');                                    // the newest window is the active one
  await ready('alpha');
  assert.equal(await a.win.$eval(winSel(title), e => e.classList.contains('active')), false);
  await a.win.click('#savedBtn'); await a.win.fill('#savedInput', 'typing here');
  await inView(a.win, title, 'stream', () => {
    const b = document.createElement('button'); b.className = 'ytp-skip-ad-button';
    b.style.cssText = 'position:fixed;left:20px;top:20px;width:80px;height:30px';
    b.onclick = e => { window.__skipped = e.isTrusted; b.remove(); };
    document.getElementById('movie_player').append(b);   // inside the player, as on YouTube
  });
  await until(() => inView(a.win, title, 'stream', () => window.__skipped === true));
  await a.win.waitForTimeout(300);
  assert.equal(await a.win.evaluate(() => document.activeElement.id), 'savedInput', 'the keyboard stays where you were typing');
  assert.equal(await a.win.$eval(winSel(title), e => e.classList.contains('active')), false, 'and the stream isn\'t made the active window');
  // a cookie question whose buttons can't be found: "Reject all" is saved for that player, and it loads again
  await inView(a.win, title, 'stream', () => {
    const lb = document.createElement('ytd-consent-bump-v2-lightbox'), d = document.createElement('tp-yt-paper-dialog');
    d.opened = true; lb.append(d); document.body.append(lb);
  });
  const socs = () => a.app.evaluate(({ session }) => session.fromPartition('persist:kmv-stream-yt_v_abcdefghijk').cookies.get({ name: 'SOCS' }));
  await until(async () => (await socs()).length === 1);
  await until(() => inView(a.win, title, 'stream', () => !document.querySelector('ytd-consent-bump-v2-lightbox')).catch(() => false));
  await a.win.fill('#savedInput', ''); await a.win.click('#savedBtn');
});

test('volume: the title bar\'s mute button, slider and mouse wheel set that stream\'s own volume', T, async () => {
  await setMode(a.win, 'stream');
  await add('alpha');
  await ready('alpha');
  const startedAt = Date.now();
  await a.win.waitForTimeout(1500);
  const bar = `${winSel('alpha')} .vol`;
  assert.equal(await a.win.textContent(`${bar} .pct`), 'off', 'starts muted (Start muted is on)');
  assert.equal(await video('alpha', 'muted'), true);
  await a.win.click(`${bar} button`);
  assert.equal(await a.win.textContent(`${bar} .pct`), '80%');
  await until(async () => (await video('alpha', 'muted')) === false);
  await a.win.$eval(`${bar} input`, s => { s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await a.win.textContent(`${bar} .pct`), '30%');
  assert.ok(Math.abs(await video('alpha', 'volume') - 0.3) < 0.001, 'the player\'s own volume');
  const vb = await a.win.locator(bar).boundingBox();
  await a.win.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await a.win.mouse.wheel(0, -100);
  assert.equal(await a.win.textContent(`${bar} .pct`), '35%', 'scrolling up turns it up');
  await a.win.waitForTimeout(800);
  const saved = JSON.parse(await a.win.evaluate(() => localStorage.getItem('kickMultiview.v1')));
  assert.deepEqual([saved[0].vol, saved[0].muted], [0.35, false], 'remembered');
  // a change made in the player itself (its own controls) shows in the title bar. For its first 8 s the
  // app keeps putting its own volume back (players restore a shared saved volume while they load)
  await a.win.waitForTimeout(Math.max(0, startedAt + 8500 - Date.now()));
  await inView(a.win, 'alpha', 'stream', () => { window.dispatchEvent(new Event('pointerdown')); document.getElementById('v').volume = 0.6; });
  await until(async () => (await a.win.textContent(`${bar} .pct`)) === '60%');
  await clear();
});

test('YouTube: the app\'s volume and mute go through YouTube\'s own player, from the title bar, the switch control and the keys, and back', T, async () => {
  await setMode(a.win, 'stream');
  await add('https://www.youtube.com/watch?v=abcdefghijk');
  const title = await a.win.$eval('#stage .win.stream .title', e => e.textContent);
  await viewLoaded(a.win, title, 'stream', /youtube\.com\/watch/);
  const startedAt = Date.now();
  const yt = () => inView(a.win, title, 'stream', () => { const p = document.getElementById('movie_player'); return [p.getVolume(), p.isMuted()]; });
  const bar = `${winSel(title)} .vol`, item = `#featSwitch .fs-item`;
  await until(async () => (await yt())[1] === true);                 // YouTube's player was saved unmuted: Start muted mutes it
  await a.win.click(`${bar} button`);
  await until(async () => String(await yt()) === '80,false');
  assert.equal(await video(title, 'volume'), 0.4, 'YouTube sets the video from its player (levelled)');
  await a.win.waitForTimeout(1700);
  assert.deepEqual(await yt(), [80, false], 'and the app doesn\'t fight YouTube\'s levelling');
  assert.equal(await a.win.textContent(`${bar} .pct`), '80%');
  await a.win.$eval(`${bar} input`, s => { s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(async () => String(await yt()) === '30,false');
  // the switch control and the keys (m, ↑ for the stream in the big spot)
  await a.win.evaluate(() => document.querySelector('#layoutMenu [data-l=focus]').click());
  await a.win.click(`${item} .fs-mute`);
  await until(async () => String(await yt()) === '30,true');
  await a.win.evaluate(() => document.activeElement.blur());
  await a.win.keyboard.press('m');
  await until(async () => String(await yt()) === '30,false');
  await a.win.keyboard.press('ArrowUp');
  await until(async () => String(await yt()) === '35,false');
  await a.win.keyboard.press('Shift+M');
  await until(async () => String(await yt()) === '35,true');
  await a.win.keyboard.press('m');
  await until(async () => String(await yt()) === '35,false');
  // a change made with YouTube's own controls shows in the title bar (after the first 8 s, see above)
  await a.win.waitForTimeout(Math.max(0, startedAt + 8500 - Date.now()));
  await inView(a.win, title, 'stream', () => { window.dispatchEvent(new Event('pointerdown')); document.getElementById('movie_player').setVolume(60); });
  await until(async () => (await a.win.textContent(`${bar} .pct`)) === '60%');
  await inView(a.win, title, 'stream', () => { window.dispatchEvent(new Event('pointerdown')); document.getElementById('movie_player').mute(); });
  await until(async () => (await a.win.textContent(`${bar} .pct`)) === 'off');
  await a.win.evaluate(() => document.querySelector('#layoutMenu [data-l=columns]').click());
});

test('a stream\'s sound stays off until the app\'s volume and mute are on its player, also when it loads again; chats get theirs at once', T, async () => {
  // the main process watches every new web view: is its sound off from the start, and when it comes on, is the player muted yet?
  await a.app.evaluate(({ app }) => {
    globalThis.__aud = [];
    app.on('web-contents-created', (_e, wc) => {
      if (wc.getType() !== 'webview') return;
      const rec = { offAtStart: wc.isAudioMuted(), on: [] };
      globalThis.__aud.push(rec);
      let was = rec.offAtStart;
      const t = setInterval(() => {
        if (wc.isDestroyed()) return clearInterval(t);
        const off = wc.isAudioMuted();
        if (was && !off) wc.executeJavaScript('(() => { const p = document.getElementById("movie_player"), v = document.querySelector("video"); return { url: location.href, muted: p ? p.isMuted() : v ? v.muted : null }; })()')
          .then(r => rec.on.push(r), () => rec.on.push(null));
        was = off;
      }, 5);
    });
  });
  await setMode(a.win, 'stream');
  await add('https://www.youtube.com/watch?v=abcdefghijk');
  const title = await a.win.$eval('#stage .win.stream .title', e => e.textContent);
  await setMode(a.win, 'chat');
  await add('alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout/);
  const sound = kind => a.win.evaluate(k => !document.querySelector(`#stage .win.${k} webview`).isAudioMuted(), kind);
  await until(() => sound('stream'));
  await until(() => sound('chat'));
  let aud = await a.app.evaluate(() => globalThis.__aud);
  const yt = aud.find(r => r.on.some(o => o && /youtube\.com\/watch/.test(o.url)));
  assert.ok(yt && yt.offAtStart, 'the stream\'s sound is off from the start');
  assert.deepEqual(yt.on.map(o => o.muted), [true], 'and comes on only once its player is muted (Start muted)');
  // loading again: off again until the player has the app's volume
  await a.win.click(`${winSel(title)} [data-a=reload]`);
  await until(async () => !(await sound('stream')));
  await until(() => sound('stream'));
  aud = await a.app.evaluate(() => globalThis.__aud);
  assert.deepEqual(aud.find(r => r.on.some(o => o && /youtube\.com\/watch/.test(o.url))).on.map(o => o.muted), [true, true], 'after loading again, too');
});

test('the switch control: pause and play, mute, hear only one, its volume, and a small live preview', T, async () => {
  await setMode(a.win, 'both');
  await add('alpha', 'bravo', 'charlie');
  await ready('charlie');
  await a.win.evaluate(() => document.querySelector('#layoutMenu [data-l=focus]').click());   // not the f key: it goes back to Columns if Focus view is already showing
  const item = ch => `#featSwitch .fs-item[data-ch=${ch}]`;
  await a.win.click(`${item('bravo')} .fs-play`);
  assert.ok(await a.win.$eval(item('bravo'), e => e.classList.contains('paused')), 'paused');
  await until(() => inView(a.win, 'bravo', 'stream', () => !!(window.__kmv && window.__kmv.get().p)));
  await a.win.click(`${item('bravo')} .fs-play`);
  assert.equal(await a.win.$eval(item('bravo'), e => e.classList.contains('paused')), false, 'and playing again');

  await a.win.click(`${item('alpha')} .fs-mute`);
  assert.match(await a.win.textContent(`${item('alpha')} .fs-pct`), /\d+%/, 'unmuted');
  await a.win.click(`${item('charlie')} .fs-mute`, { modifiers: ['Shift'] });
  const muted = await a.win.$$eval('#featSwitch .fs-item', l => l.map(e => [e.dataset.ch, e.querySelector('.fs-mute').classList.contains('muted')]));
  assert.deepEqual(muted, [['alpha', true], ['bravo', true], ['charlie', false]], 'Shift-click: hear only that one');
  await a.win.$eval(`${item('charlie')} input`, s => { s.value = 25; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await a.win.textContent(`${winSel('charlie')} .vol .pct`), '25%', 'the title bar follows the switch control');
  const vw = await a.win.locator(`${item('charlie')} .fs-volw`).boundingBox();
  await a.win.mouse.move(vw.x + 20, vw.y + vw.height / 2);
  await a.win.waitForTimeout(500);
  await a.win.mouse.wheel(0, 100);
  assert.equal(await a.win.textContent(`${item('charlie')} .fs-pct`), '20%', 'scrolling over its volume');

  await a.win.click(`${item('bravo')} .fs-pv`);
  await a.win.waitForSelector(`${item('bravo')} .fs-thumb`);
  await a.win.waitForFunction(() => document.querySelectorAll('.fs-mini webview, .mini webview, webview.mini').length > 0 || [...document.querySelectorAll('webview')].length > 6);
  await a.win.click(`${item('bravo')} .fs-pv`);
  assert.equal(await a.win.locator(`${item('bravo')} .fs-thumb`).count(), 0, 'preview hidden again');
});

test('"Pause all except focus", and auto-pause for streams scrolled out of sight', T, async () => {
  await add('alpha', 'bravo', 'charlie');
  await ready('charlie');
  await a.win.evaluate(() => document.querySelector('#layoutMenu [data-l=focus]').click());   // not the f key: it goes back to Columns if Focus view is already showing
  await a.win.click('#featSwitch .fs-only');
  const paused = () => a.win.$$eval('#featSwitch .fs-item', l => l.filter(e => e.classList.contains('paused')).map(e => e.dataset.ch));
  const big = await a.win.$eval('#featSwitch .fs-item.on', e => e.dataset.ch);
  await a.win.waitForFunction(() => document.querySelectorAll('#featSwitch .fs-item.paused').length === 2, null, { timeout: 5000 });
  assert.ok(!(await paused()).includes(big), 'everything but the big one pauses');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.focusOnly')), '1');
  await a.win.click('#featSwitch .fs-only');
  await a.win.waitForFunction(() => !document.querySelector('#featSwitch .fs-item.paused'), null, { timeout: 5000 });
  await clear();

  // auto-pause: in Columns, the streams you scroll past pause after 2 s
  await a.win.evaluate(() => window.openSettings('general'));
  await a.win.check('#autoPause');
  await a.win.keyboard.press('Escape');
  await add('alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel');
  await a.win.keyboard.press('c');
  await a.win.keyboard.press('s');                         // switch control floating, to see the states
  await a.win.waitForFunction(() => document.querySelectorAll('#featSwitch .fs-item.autopaused').length >= 2, null, { timeout: 8000 });
  const hidden = await a.win.$$eval('#featSwitch .fs-item.autopaused', l => l.map(e => e.dataset.ch));
  assert.ok(!hidden.includes('alpha'), `the ones out of sight (${hidden.join(', ')})`);
  await a.win.click(`#featSwitch .fs-item[data-ch=${hidden[0]}] .fs-play`);
  assert.equal(await a.win.$eval(`#featSwitch .fs-item[data-ch=${hidden[0]}]`, e => e.classList.contains('paused')), false, 'play one anyway');
  await a.win.evaluate(() => window.openSettings('general'));
  await a.win.uncheck('#autoPause');
  await a.win.keyboard.press('Escape');
  await a.win.keyboard.press('s');
  await clear();
});

test('chat text size: − and + in the Layout menu (and Settings > Chat) change every chat and are remembered', T, async () => {
  await add('alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /chat/);
  await a.win.waitForTimeout(500);
  await a.win.click('#layoutBtn');
  assert.ok(await a.win.isVisible('#layoutMenu #chatZoom'), 'in the Layout menu, in every layout');
  assert.equal(await a.win.textContent('#zoomPct'), '100%');
  await a.win.click('#chatZoom [data-z="-1"]');
  await a.win.click('#chatZoom [data-z="-1"]');
  assert.equal(await a.win.textContent('#zoomPct'), '80%');
  const zoom = () => a.win.$eval(`${winSel('alpha', 'chat')} webview`, v => v.getZoomFactor());
  assert.ok(Math.abs(await zoom() - 0.8) < 0.01, 'the chat is smaller');
  await a.win.click('#chatZoom [data-z="1"]');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.chatZoom')), '4');
  await a.win.keyboard.press('Escape');
  await a.win.evaluate(() => window.openSettings('chat', { sub: 'messages' }));
  assert.equal(await a.win.textContent('#lyZoom .zoomPct'), '90%', 'Settings > Chat shows the same size');
  await a.win.click('#lyZoom [data-z="1"]');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.chatZoom')), '5', 'and changes it');
  assert.equal(await a.win.textContent('#zoomPct'), '100%', 'the Layout menu follows');
  await a.win.keyboard.press('Escape');
  await clear();
});

test('a YouTube channel that isn\'t live waits, says so, and opens when it goes live', T, async () => {
  await a.app.evaluate(({ ipcMain }) => {
    globalThis.__yt = { live: false, n: 0 };
    ipcMain.removeHandler('yt:resolve');
    ipcMain.handle('yt:resolve', () => { globalThis.__yt.n++; return globalThis.__yt.live ? { live: true, videoId: 'dQw4w9WgXcQ', name: 'Some Channel' } : { live: false, name: 'Some Channel' }; });
  });
  await setMode(a.win, 'stream');
  await add('https://www.youtube.com/@somechannel');
  const wait = '#stage .win.stream .waitmsg';
  await a.win.waitForSelector(`${wait}:has-text("isn’t live right now")`);
  assert.ok(await a.win.isVisible(`${wait} button`), 'with a Check now button');
  await a.app.evaluate(() => { globalThis.__yt.live = true; });
  await a.win.click(`${wait} button`);
  await a.win.waitForSelector('#stage .win.stream webview');
  assert.match(await a.win.$eval('#stage .win.stream webview', v => v.getAttribute('src')), /dQw4w9WgXcQ/, 'its live video plays');
  assert.ok(await a.win.isHidden(wait));
  await clear();
});

test('a YouTube channel live again with a new stream: its window follows it, and Reload asks YouTube again', T, async () => {
  await a.app.evaluate(({ ipcMain }) => {
    globalThis.__yt = { vid: 'firstStrm01', n: 0 };
    ipcMain.removeHandler('yt:resolve');
    ipcMain.handle('yt:resolve', () => { globalThis.__yt.n++; return { live: true, videoId: globalThis.__yt.vid, name: 'Some Channel' }; });
  });
  await setMode(a.win, 'stream');
  await add('https://www.youtube.com/@restartchan');
  await a.win.waitForSelector('#stage .win.stream webview');
  const url = () => a.win.$eval('#stage .win.stream webview', v => { try { return v.getURL() || v.getAttribute('src'); } catch { return v.getAttribute('src'); } });
  await until(async () => /firstStrm01/.test(await url()));
  const ch = await a.win.evaluate(() => window.openWins()[0].channel);
  // the live check says another video is live now: the channel started again
  await a.win.evaluate(ch => window.smvNotes.liveStatus({ [ch]: { live: true, videoId: 'secondStr02', checked: Date.now() } }), ch);
  await until(async () => /secondStr02/.test(await url()));
  // Reload asks YouTube which video is live, and loads it
  await a.app.evaluate(() => { globalThis.__yt.vid = 'thirdStrm03'; });
  const reload = () => a.win.evaluate(() => document.querySelector('#stage .win.stream [data-a=reload]').click());
  await reload();
  await until(async () => /thirdStrm03/.test(await url()));
  // the same one: an ordinary reload, still that video
  const asked = await a.app.evaluate(() => globalThis.__yt.n);
  await reload();
  await until(() => a.app.evaluate((_e, n) => globalThis.__yt.n > n, asked));
  await new Promise(r => setTimeout(r, 600));
  assert.match(await url(), /thirdStrm03/);
  await clear();
});
