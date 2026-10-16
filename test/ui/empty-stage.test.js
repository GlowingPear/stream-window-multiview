// The empty stage (#53): Welcome for a first run (paste box, feature cards with "Show me", the tour), then the
// Launchpad once a stream has been opened (paste box, reopen the last session). Browser build: no logins or live checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, windows } = require('./app');
const { openApp } = setup();

const shown = async page => (await page.isVisible('#empty .es-first')) ? 'welcome' : (await page.isVisible('#empty .es-pad')) ? 'launchpad' : 'none';
const box = (page, which) => page.locator(`#empty .es-${which} .es-in`);
const titles = async page => (await windows(page)).map(w => `${w.kind}:${w.title}`);
const intro = page => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.intro') || '{}'));

test('a first run shows Welcome: the paste box knows what you typed, and opening a stream moves on to the Launchpad', async t => {
  const page = await openApp(t);
  assert.equal(await shown(page), 'welcome');
  assert.match(await page.textContent('#empty .es-first'), /Welcome to Stream Multiview/);
  // every link format is explained
  const formats = await page.textContent('#empty .es-first .es-formats');
  for (const f of ['kick.com/nightowl', 'tw:nightowl', '@nightowl', 'youtu.be', 'popout']) assert.ok(formats.includes(f), f);
  // a link: its kind; a bare name: pick the site
  const b = box(page, 'first');
  await b.fill('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(await page.textContent('#empty .es-first .es-badge'), 'YouTube video');
  await b.fill('kick.com/popout/alpha/chat');
  assert.equal(await page.textContent('#empty .es-first .es-badge'), 'Kick chat');
  await b.fill('example.com/schedule');
  assert.equal(await page.textContent('#empty .es-first .es-badge'), 'Web page');
  await b.fill('bravo');
  assert.equal(await page.isVisible('#empty .es-first .es-badge'), false);
  assert.equal(await page.isVisible('#empty .es-first .es-plat'), true);
  assert.equal(await page.getAttribute('#empty .es-first .es-plat [data-p=kick]', 'aria-checked'), 'true', 'Kick by default');
  await page.click('#empty .es-first .es-plat [data-p=twitch]');
  await page.selectOption('#empty .es-first .es-mode', 'stream');
  await b.press('Enter');
  assert.deepEqual(await titles(page), ['stream:bravo'], 'Twitch, stream only');
  assert.equal(await page.locator('#stage .win.stream.plat-twitch').count(), 1);
  assert.equal((await intro(page)).done, true, 'a stream was opened: next time it\'s the Launchpad');
  // the window tips, once
  assert.equal(await page.isVisible('#tipCard'), true);
  await page.click('#tipCard .tip-ok');
  assert.equal(await page.isVisible('#tipCard'), false);

  // close it: the Launchpad, with the last session to reopen
  await page.click('#stage .win [data-a=close]');
  assert.equal(await shown(page), 'launchpad');
  assert.match(await page.textContent('#empty .es-reopen'), /Reopen last session\s*1 window/);
  await page.click('#empty .es-reopen');
  assert.deepEqual(await titles(page), ['stream:bravo']);
  assert.equal(await page.isVisible('#tipCard'), false, 'the tips don\'t come back');
  await page.click('#stage .win [data-a=close]');

  // pasting a link opens it straight away; something unreadable says so
  await box(page, 'pad').fill('');
  await box(page, 'pad').focus();
  await page.evaluate(() => { const i = document.querySelector('#empty .es-pad .es-in'); i.value = 'https://kick.com/charlie'; i.dispatchEvent(new Event('paste')); });
  await page.waitForFunction(() => document.querySelectorAll('#stage .win').length === 2);
  assert.deepEqual(await titles(page), ['stream:charlie', 'chat:charlie']);
  await page.evaluate(() => [...document.querySelectorAll('#stage .win [data-a=close]')].forEach(b => b.click()));
  await box(page, 'pad').fill('not a channel!!');
  await page.click('#empty .es-pad .es-go');
  assert.match(await page.textContent('#msg'), /Couldn’t read that/);
  await box(page, 'pad').fill('');
  await page.click('#empty .es-pad .es-go');
  assert.equal((await windows(page)).length, 0);
});

test('Learn the app: Show me points at the feature and ticks it off; the tour steps through the toolbar', async t => {
  const page = await openApp(t);
  const prog = () => page.textContent('#empty .es-prog');
  const n = await page.locator('#empty .es-learn .es-card').count();
  assert.equal(await prog(), `0 of ${n} seen`);
  await page.click('#empty .es-card[data-id=channels] .es-show');
  assert.equal(await page.isVisible('#tourLayer'), true);
  assert.equal(await page.textContent('#tourLayer h4'), 'Your channels');
  assert.equal(await page.textContent('#tourLayer .tour-step'), 'Here it is');
  await page.waitForTimeout(350);
  const ring = await page.locator('#tourLayer .tour-ring').boundingBox(), btn = await page.locator('#savedBtn').boundingBox();
  assert.ok(ring.x < btn.x && ring.x + ring.width > btn.x + btn.width && ring.y < btn.y, 'around the Channels button');
  assert.equal(await page.isVisible('#tourLayer .tour-end'), false);
  await page.click('#tourLayer .tour-next');
  assert.equal(await page.isVisible('#tourLayer'), false);
  assert.equal(await prog(), `1 of ${n} seen`);
  assert.ok(await page.locator('#empty .es-card[data-id=channels].seen .es-tick').count());
  // a Settings one opens its tab
  await page.click('#empty .es-card[data-id=themes] .es-show');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=themes]'), true);
  await page.keyboard.press('Escape');

  // the tour: Next, Back, the keyboard, and it remembers it was taken
  await page.click('#empty .es-tour');
  const step = () => page.textContent('#tourLayer .tour-step');
  assert.match(await step(), /^Step 1 of \d+$/);
  assert.equal(await page.isVisible('#tourLayer .tour-back'), false);
  await page.click('#tourLayer .tour-next');
  assert.match(await step(), /^Step 2 of/);
  await page.keyboard.press('ArrowRight');
  assert.match(await step(), /^Step 3 of/);
  await page.keyboard.press('ArrowLeft');
  await page.click('#tourLayer .tour-back');
  assert.match(await step(), /^Step 1 of/);
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#tourLayer'), false);
  assert.equal(await page.textContent('#empty .es-tour'), 'Take the tour again');
  await page.click('#empty .es-tour');
  const total = +(await step()).match(/of (\d+)/)[1];
  for (let i = 1; i < total; i++) await page.click('#tourLayer .tour-next');
  assert.equal(await page.textContent('#tourLayer .tour-next'), 'Finish');
  await page.click('#tourLayer .tour-next');
  assert.equal(await page.isVisible('#tourLayer'), false);
  assert.equal((await intro(page)).tour, true);
});

test('a button that is in the ⋯ menu right now: the tour points at ⋯', async t => {
  const page = await openApp(t, { width: 420, height: 700 });
  await page.click('#empty .es-tour');
  for (let i = 0; i < 12 && await page.isVisible('#tourLayer'); i++){
    if (/in the ⋯ menu/.test(await page.textContent('#tourLayer p'))){
      await page.waitForTimeout(350);                         // the spotlight slides over
      const ring = await page.locator('#tourLayer .tour-ring').boundingBox(), more = await page.locator('#moreBtn').boundingBox();
      assert.ok(Math.abs(ring.x + ring.width / 2 - (more.x + more.width / 2)) < 2, 'around ⋯');
      return;
    }
    await page.click('#tourLayer .tour-next');
  }
  assert.fail('no step was in the ⋯ menu at this width');
});

test('Skip, Learn the app, and Settings › General brings Welcome back; people who used the app before go to the Launchpad', async t => {
  const page = await openApp(t);
  await page.click('#empty .es-skip');
  assert.equal(await shown(page), 'launchpad');
  assert.equal(await page.isVisible('#empty .es-reopen'), false, 'nothing to reopen yet');
  assert.match(await page.textContent('#empty .es-live'), /haven’t saved any channels/);
  await page.click('#empty .es-learnbtn');
  assert.equal(await shown(page), 'welcome');
  await page.click('#empty .es-skip');
  await page.click('#settingsBtn');
  await page.click('#settingsDlg .st-rail [data-s=general]');
  await page.click('#introReset');
  await page.keyboard.press('Escape');
  assert.equal(await shown(page), 'welcome');
  assert.deepEqual(await intro(page), {});

  // someone with saved channels from before this screen existed
  await page.evaluate(() => { localStorage.removeItem('kickMultiview.intro'); localStorage.setItem('kickMultiview.saved', JSON.stringify(['alpha'])); });
  await page.reload();
  assert.equal(await shown(page), 'launchpad');
  assert.match(await page.textContent('#empty .es-live'), /Open a saved channel/);
  await page.click('#empty .es-opench');
  assert.equal(await page.isVisible('#savedPanel'), true);
  assert.deepEqual(await intro(page), { done: true, tips: true });
});

test('Welcome and the Launchpad in a light theme: text stays readable', async t => {
  const page = await openApp(t);
  await page.evaluate(() => localStorage.setItem('kickMultiview.theme', JSON.stringify({ name: 'Daylight' })));
  await page.reload();
  const contrast = () => page.evaluate(() => {
    const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bgOf = el => { for (let e = el; e; e = e.parentElement){ const b = getComputedStyle(e).backgroundColor; if (!/rgba\(.*,\s*0\)$|transparent/.test(b)) return b; } return getComputedStyle(document.body).backgroundColor; };
    const el = document.querySelector('#empty .es:not([hidden]) h2');
    const a = lum(getComputedStyle(el).color), b = lum(bgOf(el));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert.ok(await contrast() > 7, 'Welcome title');
  await page.click('#empty .es-skip');
  assert.ok(await contrast() > 7, 'Launchpad title');
});
