// Settings › Connected apps (Pear Drops' card) and the toolbar's farming widget, with a stand-in desktop app that
// records what the page asks of the link, and the link's state pushed in as the main process would.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
// the stand-in desktop app: only the link's calls, so the rest of the page works as in a browser
const fakeApp = png => {
  window.calls = [];
  const log = (...a) => window.calls.push(a);
  let push = null;
  window.linkPush = st => push(st);
  window.linkNow = { on: false, peer: { id: 'com.streamorchard.peardrops', status: 'off', installed: true, summary: 'Collects your Kick emote and badge drops for you.', download: 'https://example.com/pear-drops' }, farming: null, open: false, wait: null };
  const ret = () => Promise.resolve(JSON.parse(JSON.stringify(window.linkNow)));
  window.kmv = {
    linkSet: on => { log('set', on); window.linkNow.on = on; window.linkNow.peer.status = on ? 'waiting' : 'off'; return ret(); },
    linkState: ret,
    linkDisconnect: () => { log('disconnect'); window.linkNow.on = false; window.linkNow.peer.status = 'off'; window.linkNow.farming = null; return ret(); },
    linkPairAgain: () => { log('pair'); return ret(); },
    linkIcon: () => Promise.resolve(png),
    linkShowPearDrops: () => { log('show'); return Promise.resolve({ shown: true }); },
    linkTest: () => new Promise(r => { window.finishTest = r; }),
    playersReport: st => log('players', st),
    onLinkState: cb => { push = cb; },
    openExternal: url => log('open', url)
  };
};
const minutes = m => new Date(Date.now() + m * 60000).toISOString();
const FARMING = () => ({
  seq: 3, at: new Date().toISOString(), state: 'farming',
  account: { platform: 'kick', user: 'pearfan' },
  channel: { platform: 'kick', slug: 'pixelpear', name: 'PixelPear', avatar: 'https://files.kick.com/pixelpear.webp' },
  drop: {
    campaign: 'Neon Rush Launch Week', category: 'Neon Rush', progress: { done: 48, total: 120, unit: 'minutes' },
    endsAt: minutes(3 * 1440 + 30), doneAt: minutes(72),
    rewards: { claimed: 1, total: 3, items: [
      { name: 'Pear Badge', image: 'https://files.kick.com/badge.png', required: 30, state: 'claimed' },
      { name: 'Hype Rocket Emote', required: 60, state: 'locked', unlocksAt: minutes(12) },
      { name: 'Neon Crown', required: 120, state: 'locked', unlocksAt: minutes(72) }] },
    next: { name: 'Hype Rocket Emote', required: 60, unlocksAt: minutes(12) }
  }
});
const peer = (o = {}) => ({ id: 'com.streamorchard.peardrops', status: 'connected', installed: true, version: '0.1.6', report: { state: 'works', text: 'Works' },
  pairedAt: '2026-10-18T09:00:00Z', summary: 'Collects your Kick emote and badge drops for you.', download: 'https://example.com/pear-drops', ...o });

async function openCard(t, { storage = {}, size, toolbar } = {}){
  const store = { 'link.peardrops': '1', ...storage };
  const init = `(${fakeApp})(${JSON.stringify(PNG)});` + Object.entries(store).map(([k, v]) => `localStorage.setItem('kickMultiview.${k}', ${JSON.stringify(v)});`).join('')
    + (toolbar ? `localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(toolbar))});` : '');
  const page = await openApp(t, { ...size, init: { content: init } });
  await page.waitForFunction(() => window.pearLink && window.pearLink.state);
  return page;
}
const showTab = page => page.evaluate(() => { document.querySelector('.st-rail [data-s=apps]').hidden = false; openSettings('apps'); });   // (the desktop app's page)
const push = (page, st) => page.evaluate(st => window.linkPush(st), st);
const card = page => page.evaluate(() => {
  const c = document.getElementById('caPearDrops'), vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const act = c.querySelector('.ca-act');
  return {
    chip: c.querySelector('.ca-chip').textContent, tone: c.querySelector('.ca-chip').className.replace('ca-chip ', ''),
    line: c.querySelector('.ca-line').textContent, foot: vis(c.querySelector('.ca-foot')) ? c.querySelector('.ca-foot').className.replace('ca-foot ', '') : null,
    act: vis(act) ? act.textContent : null, test: vis(c.querySelector('.ca-test')), paired: c.querySelector('.ca-paired').textContent,
    page: vis(c.querySelector('.ca-page'))
  };
});
const calls = (page, name) => page.evaluate(n => window.calls.filter(c => c[0] === n), name);

test('Connected apps: Pear Drops\' card, for each state of the link: its chip, one status line and its button', async t => {
  const page = await openCard(t, { storage: { 'link.peardrops': '0' } });
  await showTab(page);
  assert.equal(await page.getAttribute('#caPearDrops .ca-logo', 'src'), PNG, 'the logo from the app');
  let c = await card(page);
  assert.deepEqual([c.chip, c.foot], ['Off', null], 'switched off, installed: nothing to say');
  await push(page, { on: false, peer: peer({ status: 'off', installed: false }), farming: null, open: false });
  c = await card(page);
  assert.deepEqual([c.chip, c.line, c.act, c.test, c.page], ['Not installed', 'Free for Windows, macOS and Linux.', 'Download', false, false], 'not installed: Download, not the Download page link');
  assert.ok(await page.$eval('#caPearDrops .ca-act', b => b.classList.contains('primary')), 'a green Download');
  await page.click('#caPearDrops .ca-act');
  assert.deepEqual(await calls(page, 'open'), [['open', 'https://example.com/pear-drops']]);

  await page.click('#caConnect');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'set' && c[1] === true));
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.link.peardrops')), '1');
  const states = [
    [{ status: 'waiting', installed: true }, 'Waiting', "Pear Drops isn't open, or its Connect switch is off.", null],
    [{ status: 'waiting', reason: 'switched-off' }, 'Waiting', 'Pear Drops is open, but its own Connect switch is off.', null],
    [{ status: 'waiting', reason: 'disconnected-there' }, 'Waiting', 'Disconnected in Pear Drops. Switch it on there to link again.', null],
    [{ status: 'waiting', installed: false }, 'Not installed', 'Free for Windows, macOS and Linux.', 'Download'],
    [{ status: 'pair-again', keyHeldBy: 'us' }, 'Pair again', "The pairing doesn't match Pear Drops' any more. Pair again to start afresh.", 'Pair again'],
    [{ status: 'pair-again', keyHeldBy: 'them' }, 'Pair again', "Press Pair again in Pear Drops' Connected apps.", null],
    [{ status: 'incompatible', report: { state: 'incompatible', text: "Can't connect: update Stream Multiview to 0.4.0 or later" } }, "Can't connect", "Can't connect: update Stream Multiview to 0.4.0 or later", null],
    [{ status: 'incompatible', report: null }, "Can't connect", "Can't connect: one of the apps needs updating.", null],
    [{}, 'Connected · 0.1.6', "Pear Drops isn't farming · Kick players are signed in", 'Disconnect'],
    [{ report: { state: 'limited', text: 'Works, with a feature missing: update Pear Drops to 0.1.7 or later' } }, 'Connected · 0.1.6', 'Works, with a feature missing: update Pear Drops to 0.1.7 or later', 'Disconnect']
  ];
  for (const [p, chip, line, act] of states){
    await push(page, { on: true, peer: peer({ version: p.status && p.status !== 'connected' ? null : '0.1.6', ...p }), farming: null, open: true });
    c = await card(page);
    assert.deepEqual([c.chip, c.line, c.act], [chip, line, act], JSON.stringify(p));
    assert.equal(c.test, true, 'Test while Connect is on');
  }
  assert.equal(c.paired, 'Paired 18 Oct', 'the date the same on every computer');
  await push(page, { on: true, peer: peer({ status: 'pair-again', keyHeldBy: 'us', version: null }), farming: null, open: true });
  await page.click('#caPearDrops .ca-act');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'pair'));
  // fits without scrolling
  assert.ok(await page.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1), 'the tab fits');
});

test('Connected apps: farming signs Kick players out at once, the line says so, and they sign back in after the wait', async t => {
  const page = await openCard(t, { storage: { watchSignedIn: JSON.stringify({ kick: true }), accounts: JSON.stringify({ kick: 'pearfan' }) } });
  await showTab(page);
  await push(page, { on: true, peer: peer(), farming: FARMING(), open: true, wait: 600 });
  assert.equal(await page.evaluate(() => window.pearLink.kickOut), true);
  let c = await card(page);
  assert.equal(c.line, 'Farming Neon Rush Launch Week on PixelPear · your Kick players are signed out');
  assert.equal(c.foot, 'ok');
  let report = (await calls(page, 'players')).pop()[1].platforms.kick;
  assert.deepEqual(report, { signedIn: false, mode: 'auto', account: { platform: 'kick', user: 'pearfan' }, open: [] }, 'Pear Drops hears it');
  // it stops farming: still out, until the wait is over
  await push(page, { on: true, peer: peer(), farming: { ...FARMING(), state: 'waiting', channel: null, drop: null }, open: true, wait: 600 });
  c = await card(page);
  assert.match(c.line, /^Signing Kick players back in at \d{1,2}:\d{2}/);
  assert.equal(await page.evaluate(() => window.pearLink.kickOut), true);
  // farming again within the wait: still out, the wait is off
  await push(page, { on: true, peer: peer(), farming: FARMING(), open: true, wait: 600 });
  assert.equal(await page.evaluate(() => window.pearLink.backAt), null);
  await push(page, { on: true, peer: peer(), farming: { ...FARMING(), state: 'paused' }, open: true, wait: 600 });
  await page.waitForFunction(() => window.pearLink.kickOut === false, null, { timeout: 5000 });
  c = await card(page);
  assert.equal(c.line, "Pear Drops isn't farming · Kick players are signed in");
  report = (await calls(page, 'players')).pop()[1].platforms.kick;
  assert.equal(report.signedIn, true, 'back in: Pear Drops hears it');
  // farming with another Kick account, or with Auto off: the players stay as they are
  await push(page, { on: true, peer: peer(), farming: { ...FARMING(), account: { platform: 'kick', user: 'otherfan' } }, open: true, wait: 600 });
  assert.equal(await page.evaluate(() => window.pearLink.kickOut), false);
  assert.equal((await card(page)).line, 'Farming Neon Rush Launch Week on PixelPear · on another Kick account, so Kick players are signed in');
  await page.click('#caKickAuto');
  await push(page, { on: true, peer: peer(), farming: FARMING(), open: true, wait: 600 });
  assert.equal((await card(page)).line, 'Farming Neon Rush Launch Week on PixelPear · Kick players are signed in (signing out is off)');
  assert.equal(await page.evaluate(() => window.pearLink.kickOut), false);
  report = (await calls(page, 'players')).pop()[1].platforms.kick;
  assert.deepEqual([report.mode, report.signedIn], ['signed-in', true], 'your own choice again');
});

test('Connected apps: Auto keeps your own Kick choice and gives it back; Disconnect switches the link off', async t => {
  const page = await openCard(t, { storage: { 'link.peardrops': '0', watchSignedIn: JSON.stringify({ kick: false, twitch: true }) } });
  await showTab(page);
  const ls = k => page.evaluate(k => localStorage.getItem('kickMultiview.' + k), k);
  await page.click('#caConnect');                                      // Connect on, Auto on (by default): Auto takes over
  assert.equal(await ls('link.kickBefore'), 'false', 'your choice kept');
  assert.equal(await page.isChecked('#caKickAuto'), true, 'on by default');
  await page.evaluate(() => localStorage.setItem('kickMultiview.link.kickBefore', 'true'));
  await page.click('#caKickAuto');                                     // Auto off: your choice back
  assert.equal(await ls('link.kickBefore'), null);
  assert.deepEqual(JSON.parse(await ls('watchSignedIn')), { kick: true, twitch: true, youtube: false });
  await page.click('#caKickAuto');                                     // on again
  assert.equal(await ls('link.kickBefore'), 'true');
  await push(page, { on: true, peer: peer(), farming: null, open: true });
  await page.click('#caPearDrops .ca-act');                            // Disconnect
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'disconnect'));
  await page.waitForFunction(() => !document.getElementById('caConnect').checked);
  assert.equal(await ls('link.peardrops'), '0', 'switched off');
  assert.equal(await ls('link.kickBefore'), null, 'and your Kick choice is back');
  assert.equal((await card(page)).chip, 'Off');
  await page.click('#caWidget');
  assert.equal(await ls('link.widget'), '0');
});

test('Connected apps: Test checks the link, says "Testing…" while it runs, and shows the answer in place of the line', async t => {
  const page = await openCard(t);
  await showTab(page);
  await push(page, { on: true, peer: peer(), farming: null, open: true });
  await page.click('#caPearDrops .ca-test');
  assert.equal(await page.textContent('#caPearDrops .ca-test'), 'Testing…');
  assert.ok(await page.isDisabled('#caPearDrops .ca-test'));
  await page.evaluate(() => window.finishTest({ ok: true, ms: 2, version: '0.1.6', text: 'Pear Drops 0.1.6 answered in 2 ms' }));
  await page.waitForFunction(() => document.querySelector('#caPearDrops .ca-line').textContent === 'Pear Drops 0.1.6 answered in 2 ms');
  let c = await card(page);
  assert.deepEqual([c.foot, await page.textContent('#caPearDrops .ca-test')], ['ok tested', 'Test'], 'green');
  await page.click('#caPearDrops .ca-test');
  await page.evaluate(() => window.finishTest({ ok: false, reason: 'not-running', text: "Pear Drops isn't open" }));
  await page.waitForFunction(() => document.querySelector('#caPearDrops .ca-line').textContent === "Pear Drops isn't open");
  c = await card(page);
  assert.equal(c.foot, 'wait tested', 'amber');
  await page.click('#caPearDrops .ca-test');
  await page.evaluate(() => window.finishTest(null));                 // no answer at all
  await page.waitForFunction(() => document.querySelector('#caPearDrops .ca-line').textContent === "Couldn't test the link");
});

const widget = page => page.evaluate(() => {
  const b = document.getElementById('farmBtn');
  if (b.hidden) return null;
  return { name: b.querySelector('.fw-name').textContent, next: b.querySelector('.fw-next').textContent, bar: b.querySelector('.fw-bar i').style.width, avatar: b.querySelector('.fw-av').getAttribute('src') };
});

for (const toolbar of [null, { pos: 'left', labels: true }, { pos: 'left', labels: false }]) {
  test(`The farming widget (${toolbar ? 'toolbar on the left' + (toolbar.labels ? '' : ', icons only') : 'toolbar on top'}): only while connected and farming, its hover card, and a click opens Pear Drops`, async t => {
    const page = await openCard(t, { toolbar });
    assert.equal(await widget(page), null, 'not linked: no widget');
    await push(page, { on: true, peer: peer(), farming: FARMING(), open: true });
    await page.waitForFunction(() => !document.getElementById('farmBtn').hidden);
    const w = await widget(page);
    assert.equal(w.name, 'PixelPear');
    assert.equal(w.bar, '40%', '48 of 120 minutes');
    assert.match(w.next, /^Hype Rocket Emote in 1[12]m$/);
    await page.waitForFunction(png => document.querySelector('#farmBtn .fw-av').getAttribute('src') === png, PNG);   // Kick's picture failed: the logo
    const hb = await page.locator('header').boundingBox(), bb = await page.locator('#farmBtn').boundingBox();
    assert.ok(bb.width > 20 && bb.x >= hb.x - 1 && bb.x + bb.width <= hb.x + hb.width + 1 && bb.y >= hb.y - 1 && bb.y + bb.height <= hb.y + hb.height + 1, 'in the toolbar');
    await page.hover('#farmBtn');
    await page.waitForSelector('#farmCard:not([hidden])');
    const cardText = await page.textContent('#farmCard');
    for (const s of ['Neon Rush Launch Week', 'Pear Drops is farming on PixelPear · 48 / 120 min', '1 of 3 claimed', 'Ends in 3 days', 'Open Pear Drops →']) assert.ok(cardText.includes(s), s);
    assert.match(cardText, /Hype Rocket Emote unlocks in 1[12] min/);
    assert.match(cardText, /All rewards by \d{1,2}:\d{2}/);
    assert.deepEqual(await page.$$eval('#farmCard .fw-item', l => l.map(e => [e.style.left, e.classList.contains('claimed')])), [['25%', true], ['50%', false], ['100%', false]], 'each reward at its minutes, ticked when claimed');
    const cb = await page.locator('#farmCard').boundingBox(), vp = page.viewportSize();
    assert.ok(cb.x >= 0 && cb.y >= 0 && cb.x + cb.width <= vp.width && cb.y + cb.height <= vp.height, 'the card is on screen');
    await page.hover('#farmCard');
    await page.click('#farmCard .fw-open');
    await page.click('#farmBtn');
    assert.equal((await calls(page, 'show')).length, 2, 'both open Pear Drops');
    await page.mouse.move(800, 600);
    await page.waitForSelector('#farmCard', { state: 'hidden' });
    // not farming, or the widget switched off: gone
    await push(page, { on: true, peer: peer(), farming: { ...FARMING(), state: 'waiting' }, open: true });
    assert.equal(await widget(page), null);
    await push(page, { on: true, peer: peer(), farming: FARMING(), open: true });
    assert.ok(await widget(page));
    await page.evaluate(() => { localStorage.setItem('kickMultiview.link.widget', '0'); window.pearLink.applyLink(); });
    assert.equal(await widget(page), null, 'switched off in Connected apps');
  });
}

test('The farming widget copes with a drop that has little to say', async t => {
  const page = await openCard(t);
  await push(page, { on: true, peer: peer(), farming: { state: 'farming', account: null, channel: { platform: 'kick', slug: 'pixelpear' }, drop: null }, open: true });
  await page.waitForFunction(() => !document.getElementById('farmBtn').hidden);
  const w = await widget(page);
  assert.deepEqual([w.name, w.next], ['pixelpear', '']);
  assert.ok(await page.$eval('#farmBtn .fw-bar', e => e.hidden), 'no progress: no bar');
  await page.hover('#farmBtn');
  await page.waitForSelector('#farmCard:not([hidden])');
  assert.equal(await page.textContent('#farmCard .fw-ht'), 'Pear DropsPear Drops is farming on pixelpear');
  assert.equal(await page.$$eval('#farmCard .fw-item', l => l.length), 0);
});
