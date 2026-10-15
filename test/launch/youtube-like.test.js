// The like button on YouTube streams, and Settings > YouTube > Like streams automatically. The watch page is a
// stand-in (see app.js) with a hidden like button, so nothing is ever liked for real.
const test = require('node:test');
const { launchApp, inView, viewLoaded, winSel, assert, openChannel, setMode } = require('./app');

const T = { timeout: 60000 };
const VID = 'abcdefghijk';
let a;
test.before(async () => { a = await launchApp({ storage: { 'kickMultiview.alerts': { mention: { sound: 'none' }, spam: { sound: 'none' } } } }); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const add = async (...links) => { for (const l of links) await openChannel(a.win, l); };
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const clear = async () => { if (await a.win.locator('#stage .win').count()){ await a.win.click('#clear'); await a.win.click('#askDlg .ask-yes'); } };
test.beforeEach(() => a && clear());

// Settings > Accounts > Watch signed in for YouTube, and a YouTube login in its session (the SAPISID cookie)
async function signIn(on) {
  await a.app.evaluate(({ session }, on) => {
    const c = session.fromPartition('persist:youtube').cookies;
    return on ? c.set({ url: 'https://www.youtube.com', name: 'SAPISID', value: 'test' }) : c.remove('https://www.youtube.com', 'SAPISID');
  }, on);
  await a.win.evaluate(() => openSettings('accounts'));
  await a.win.setChecked('#settingsDlg .am-watch input[data-w=youtube]', on);
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
}
// opens a YouTube video as a stream and waits for its page; returns its window title
async function openVideo(vid = VID) {
  await setMode(a.win, 'stream');
  await add('https://www.youtube.com/watch?v=' + vid);
  const title = await a.win.$eval('#stage .win.stream.plat-youtube .title', e => e.textContent);
  await viewLoaded(a.win, title, 'stream', /youtube\.com\/watch/);
  return title;
}
const btn = title => `${winSel(title)} [data-a=like]`;
const tip = sel => a.win.$eval(sel, e => e.title || e.dataset.tipTitle);   // the title is put aside while the pointer is on it
const pressed = title => inView(a.win, title, 'stream', () => document.querySelector('like-button-view-model button').getAttribute('aria-pressed'));
const likes = title => inView(a.win, title, 'stream', () => window.__likes);

test('ytLikeAgent reads YouTube\'s like button and whether you\'re signed in, and clicks it only when signed in', T, async () => {
  const r = await a.win.evaluate(() => {
    const md = document.createElement('ytd-watch-metadata'), lv = document.createElement('like-button-view-model'), b = document.createElement('button');
    let clicks = 0; b.onclick = () => clicks++;
    b.setAttribute('aria-pressed', 'true'); lv.append(b); md.append(lv);
    const out = {};
    out.missing = ytLikeAgent(false);
    document.body.append(md);
    out.signedOut = ytLikeAgent(true);
    window.ytcfg = { get: k => k === 'LOGGED_IN' };
    out.signedIn = ytLikeAgent(false);
    out.clicked = ytLikeAgent(true);
    delete window.ytcfg; md.remove();
    return { out, clicks };
  });
  const noVid = { vid: null, playing: false };
  assert.deepEqual(r.out, {
    missing: { ...noVid, signedIn: false, liked: null },
    signedOut: { ...noVid, signedIn: false, liked: true },
    signedIn: { ...noVid, signedIn: true, liked: true },
    clicked: { ...noVid, signedIn: true, liked: false }
  });
  assert.equal(r.clicks, 1, 'only the signed-in click reached the button');
});

test('the like button is only on YouTube streams (a video opens no chat)', T, async () => {
  await setMode(a.win, 'both');
  await add('https://www.youtube.com/watch?v=' + VID, 'alpha', 'tw:beta');
  await a.win.waitForSelector('#stage .win.chat.plat-twitch');
  const has = await a.win.$$eval('#stage .win', es => es.map(e => [e.classList[1], e.classList[2], !!e.querySelector('[data-a=like]')]).sort());
  assert.deepEqual(has, [
    ['chat', 'plat-kick', false], ['chat', 'plat-twitch', false],
    ['stream', 'plat-kick', false], ['stream', 'plat-twitch', false], ['stream', 'plat-youtube', true]
  ]);
});

test('signed out: the button is greyed out, says how to sign in, and nothing is sent to the page', T, async () => {
  const title = await openVideo();
  const b = btn(title);
  await a.win.waitForTimeout(1500);
  assert.equal(await a.win.$eval(b, e => e.classList.contains('dim')), true);
  assert.match(await tip(b), /tick "Watch signed in" for YouTube in Settings › Accounts/);
  await a.win.click(b);
  assert.match(await a.win.textContent('#msg'), /Watch signed in/, 'clicking it says so');
  assert.equal(await a.win.evaluate(() => !document.querySelector('#settingsDlg').hidden && localStorage.getItem('kickMultiview.settingsTab')), 'accounts', 'and opens Settings › Accounts');
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
  assert.equal(await likes(title), 0);

  // Watch signed in, but not signed in to YouTube
  await signIn(true);
  await a.app.evaluate(({ session }) => session.fromPartition('persist:youtube').cookies.remove('https://www.youtube.com', 'SAPISID'));
  await a.win.click(`${winSel(title)} [data-a=reload]`);
  await until(async () => /sign in to YouTube/.test(await tip(b)));
  assert.equal(await a.win.$eval(b, e => e.classList.contains('dim')), true);
  await a.win.click(b);
  assert.match(await a.win.textContent('#msg'), /sign in to YouTube/);
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
  assert.equal(await likes(title), 0, 'still nothing sent');
  await signIn(false);
});

test('signed in: the button shows the page\'s like, likes and unlikes, follows a like made elsewhere, and starts again for a new page', T, async () => {
  await signIn(true);
  const title = await openVideo();
  const b = btn(title);
  await a.win.waitForSelector(`${b}:not(.dim)`);
  assert.equal(await a.win.getAttribute(b, 'aria-pressed'), 'false');
  assert.equal(await tip(b), 'Like this stream on YouTube');
  await a.win.click(b);
  await a.win.waitForSelector(`${b}.on`);
  assert.equal(await pressed(title), 'true', 'YouTube\'s own button was clicked');
  assert.equal(await a.win.getAttribute(b, 'aria-pressed'), 'true');
  assert.match(await tip(b), /remove your like/);
  await a.win.click(b);
  await a.win.waitForSelector(`${b}:not(.on)`);
  assert.equal(await pressed(title), 'false');
  assert.equal(await likes(title), 2);
  // liked in the page itself (or on youtube.com): the button follows
  await inView(a.win, title, 'stream', () => document.querySelector('like-button-view-model button').setAttribute('aria-pressed', 'true'));
  await a.win.waitForSelector(`${b}.on`);
  // the player goes to another video: the old video's like isn't shown for it
  await inView(a.win, title, 'stream', () => { location.href = 'https://www.youtube.com/watch?v=zzzzzzzzzzz'; });
  await a.win.waitForSelector(`${b}.dim:not(.on)`);
  await a.win.waitForTimeout(1500);
  assert.equal(await a.win.$eval(b, e => e.classList.contains('on')), false, 'still not shown as liked');
  await signIn(false);
});

test('Like streams automatically: likes once the stream itself plays, not during an ad or the cookie question, and only once', T, async () => {
  await a.win.evaluate(() => { openSettings('youtube'); localStorage.removeItem('kickMultiview.ytAutoLiked'); });
  assert.equal(await a.win.isChecked('#ytAutoLike'), false, 'off at first');
  await a.win.check('#ytAutoLike');
  await a.win.uncheck('#ytConsent');          // the cookie question stays open until you answer it
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
  await signIn(true);
  const title = await openVideo();
  const b = btn(title);
  // an ad is playing, then the cookie question is open: no like
  await inView(a.win, title, 'stream', () => document.getElementById('movie_player').classList.add('ad-showing'));
  await a.win.waitForSelector(`${b}:not(.dim)`);
  await a.win.waitForTimeout(4500);
  assert.equal(await likes(title), 0, 'not during an ad');
  await inView(a.win, title, 'stream', () => {
    document.getElementById('movie_player').classList.remove('ad-showing');
    const lb = document.createElement('ytd-consent-bump-v2-lightbox'), d = document.createElement('tp-yt-paper-dialog');
    d.opened = true; lb.append(d); document.body.append(lb);
  });
  await a.win.waitForTimeout(4500);
  assert.equal(await likes(title), 0, 'not while the cookie question is open');
  // paused: no like either
  await inView(a.win, title, 'stream', () => { document.querySelector('ytd-consent-bump-v2-lightbox').remove(); document.getElementById('movie_player').state = 2; });
  await a.win.waitForTimeout(4500);
  assert.equal(await likes(title), 0, 'not while paused');
  // the stream plays: liked after a few seconds, and remembered
  await inView(a.win, title, 'stream', () => { document.getElementById('movie_player').state = 1; });
  await a.win.waitForSelector(`${b}.on`, { timeout: 10000 });
  assert.equal(await likes(title), 1);
  assert.deepEqual(await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.ytAutoLiked'))), [VID]);
  // you remove the like: it isn't liked again, also after loading again (the stand-in page forgets its like)
  await a.win.click(b);
  await a.win.waitForSelector(`${b}:not(.on)`);
  await a.win.click(`${winSel(title)} [data-a=reload]`);
  await a.win.waitForSelector(`${b}:not(.dim)`);
  await a.win.waitForTimeout(4500);
  assert.equal(await likes(title), 0, 'the new page wasn\'t liked');
  assert.equal(await a.win.$eval(b, e => e.classList.contains('on')), false);
  // a video you already like is remembered without a click
  await clear();
  await a.win.evaluate(() => localStorage.removeItem('kickMultiview.ytAutoLiked'));
  const t2 = await openVideo('bbbbbbbbbbb');
  await inView(a.win, t2, 'stream', () => document.querySelector('like-button-view-model button').setAttribute('aria-pressed', 'true'));
  await until(async () => (await a.win.evaluate(() => localStorage.getItem('kickMultiview.ytAutoLiked'))) === '["bbbbbbbbbbb"]');
  assert.equal(await likes(t2), 0);
  await a.win.evaluate(() => { openSettings('youtube'); });
  await a.win.uncheck('#ytAutoLike');
  await a.win.check('#ytConsent');
  assert.equal(await a.win.evaluate(() => localStorage.getItem('kickMultiview.ytAutoLike')), '0');
  await a.win.evaluate(() => document.querySelector('#settingsDlg .help-x').click());
  await signIn(false);
});
