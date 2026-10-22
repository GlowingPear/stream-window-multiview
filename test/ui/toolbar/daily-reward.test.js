// The toolbar's daily reward chest (toolbar/daily-reward.js), with a stand-in desktop app: the link's state pushed in
// as the main process would, and what a click asks of it. Each state, the account check, the "Claim reward" chip
// and where it has room, the click with and without Pear Drops, and Grapevine's own example messages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixtures } = require('@streamorchard/grapevine/fixtures');
const { setup } = require('../app');
const { openApp } = setup();

const RING_C = 2 * Math.PI * 9;
// the stand-in desktop app: only the link's calls, so the rest of the page works as in a browser
const fakeApp = () => {
  window.calls = [];
  const log = (...a) => window.calls.push(a);
  let push = null;
  window.linkPush = st => push(st);
  window.rewardShown = true;
  const now = { on: true, peer: { id: 'com.streamorchard.peardrops', status: 'waiting', installed: true }, farming: null, reward: null, open: true, wait: null };
  window.kmv = {
    linkSet: () => Promise.resolve(now),
    linkState: () => Promise.resolve(now),
    linkIcon: () => Promise.resolve(''),
    linkShowReward: () => { log('showReward'); return Promise.resolve({ shown: window.rewardShown }); },
    openWindow: (url, w, h) => log('window', url, w, h),
    playersReport: () => {},
    onLinkState: cb => { push = cb; }
  };
  window.open = (url, name) => { log('open', url, name); return null; };
};
const peer = (shares = ['drops.farming', 'rewards.daily']) => ({ id: 'com.streamorchard.peardrops', status: 'connected', installed: true, version: '0.1.12',
  report: { state: 'works', text: 'Works' }, shares: { out: ['players'], in: shares } });
const hours = h => new Date(Date.now() + h * 3600000).toISOString();
const REWARD = (o = {}) => ({ seq: 4, at: new Date().toISOString(), state: 'earning', account: { platform: 'kick', user: 'PearFan' }, minutes: 37, threshold: 60, endsAt: hours(6.2), ...o });
const linked = (reward, shares) => ({ on: true, peer: peer(shares), farming: null, reward, open: true, wait: null });

async function openPage(t, { storage = {}, toolbar, width, height } = {}){
  const store = { 'link.peardrops': '1', accounts: JSON.stringify({ kick: 'pearfan' }), ...storage };
  const init = `(${fakeApp})();` + Object.entries(store).map(([k, v]) => `localStorage.setItem('kickMultiview.${k}', ${JSON.stringify(v)});`).join('')
    + (toolbar ? `localStorage.setItem('kickMultiview.toolbar', ${JSON.stringify(JSON.stringify(toolbar))});` : '');
  const page = await openApp(t, { width, height, init: { content: init } });
  await page.waitForFunction(() => window.pearLink && window.pearLink.state);
  return page;
}
const push = (page, st) => page.evaluate(st => window.linkPush(st), st);
const calls = (page, name) => page.evaluate(n => window.calls.filter(c => c[0] === n).map(c => c.slice(1)), name);
// what the chest shows now (null: hidden)
const chest = page => page.evaluate(() => {
  const b = document.getElementById('rewardBtn'), vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  if (b.hidden || !vis(b)) return null;
  const r = b.getBoundingClientRect(), h = document.querySelector('header').getBoundingClientRect();
  return {
    state: [...b.classList].find(c => c.startsWith('state-')).slice(6),
    ring: vis(b.querySelector('.dr-ring')) ? +b.querySelector('.dr-ring-value').getAttribute('stroke-dashoffset') : null,
    label: vis(b.querySelector('.tb-l')) ? b.querySelector('.tb-l').textContent : null,
    name: b.dataset.label, title: b.title, aria: b.getAttribute('aria-label'),
    hop: getComputedStyle(b.querySelector('.chest-box')).animationName,
    dim: +getComputedStyle(b.querySelector('.dr-ic')).opacity,
    width: r.width,
    inBar: r.left >= h.left - 1 && r.right <= h.right + 1 && r.top >= h.top - 1 && r.bottom <= h.bottom + 1
  };
});
const ring = frac => +(RING_C * (1 - frac)).toFixed(2);

for (const toolbar of [null, { pos: 'left', labels: true }, { pos: 'left', labels: false }]) {
  const where = toolbar ? 'on the left' + (toolbar.labels ? ', with labels' : ', icons only') : 'on top';
  test(`The daily reward chest (toolbar ${where}): each state, its ring, its tooltip, and when it's hidden`, async t => {
    const page = await openPage(t, { toolbar });
    const label = name => (toolbar && toolbar.labels ? name : null);

    // Pear Drops not connected yet: no chest
    assert.equal(await chest(page), null, 'not connected');

    // connected, but too old to send the reward: a plain chest, next to the farming widget
    await push(page, linked(null, ['drops.farming']));
    let c = await chest(page);
    assert.deepEqual([c.state, c.ring, c.title, c.label], ['plain', null, 'Daily reward on Kick', label('Daily reward')]);
    assert.ok(c.inBar, 'in the toolbar');
    assert.equal(await page.evaluate(() => document.getElementById('rewardBtn').nextElementSibling.id), 'farmBtn', 'the farming widget on its right');

    // earning: the ring fills to minutes ÷ threshold
    await push(page, linked(REWARD()));
    c = await chest(page);
    assert.deepEqual([c.state, c.ring, c.label], ['earning', ring(37 / 60), label('Daily reward')]);
    assert.equal(c.title, 'Daily reward · 37 of 60 min\n23 min to go');
    assert.equal(c.name, 'Daily reward · 37 of 60 min', 'the tooltip\'s name: its first line');
    assert.equal(c.hop, 'none', 'still');
    const earningWidth = c.width;

    // ready: no ring, the chest hops; on top the "Claim reward" chip, on the left "Reward ready"
    await push(page, linked(REWARD({ state: 'ready', minutes: 60, endsAt: '2026-10-21T00:00:00Z' })));
    c = await chest(page);
    assert.deepEqual([c.state, c.ring, c.hop], ['ready', null, 'dr-hop']);
    assert.equal(c.label, !toolbar ? 'Claim reward' : toolbar.labels ? 'Reward ready' : null);
    const ends = await page.evaluate(() => new Date('2026-10-21T00:00:00Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    assert.equal(c.title, `Daily reward is ready\nClaim before ${ends}\nOpen Pear Drops to claim it`);
    assert.equal(c.name, 'Daily reward is ready', 'short lines: the time never wraps');
    assert.equal(c.aria, `Daily reward is ready. Claim before ${ends}. Open Pear Drops to claim it`);
    if (!toolbar) assert.ok(c.width > earningWidth + 40, 'the chip is wider than the chest');
    assert.ok(c.inBar);
    const label2 = await page.$eval('#rewardBtn .tb-l', e => getComputedStyle(e).color);
    const accent = await page.evaluate(() => { const e = document.createElement('i'); e.style.color = 'var(--accent)'; document.body.append(e); const v = getComputedStyle(e).color; e.remove(); return v; });
    if (!toolbar || toolbar.labels) assert.equal(label2, accent, 'its words are green');

    // claimed: the chest alone (no ring), and when the next one is
    await push(page, linked(REWARD({ state: 'claimed', minutes: 60, endsAt: hours(6.2) })));
    c = await chest(page);
    assert.deepEqual([c.state, c.ring, c.hop], ['claimed', null, 'none']);
    assert.match(c.title, /^Daily reward claimed\nNext one in 6h 1[12]m$/);
    await push(page, linked(REWARD({ state: 'claimed', endsAt: null })));
    assert.equal((await chest(page)).title, 'Daily reward claimed', 'no time: no countdown');

    // unavailable, and a state this app doesn't know: dimmed, no ring
    for (const state of ['unavailable', 'event-crate']){
      await push(page, linked(REWARD({ state })));
      c = await chest(page);
      assert.deepEqual([c.state, c.ring, c.title], ['unavailable', null, "Kick's daily reward isn't answering"], state);
      assert.ok(c.dim < 0.6, 'dimmed');
    }

    // hidden: signed out of Kick in Pear Drops, or Pear Drops on another Kick account
    await push(page, linked(REWARD({ state: 'signed-out', account: null })));
    assert.equal(await chest(page), null, 'signed out');
    await push(page, linked(REWARD({ account: { platform: 'kick', user: 'otherfan' } })));
    assert.equal(await chest(page), null, 'another account');
    await push(page, linked(REWARD({ account: null })));
    assert.equal(await chest(page), null, 'no account');
    await push(page, linked(REWARD()));
    assert.ok(await chest(page), 'the same account, whatever its case');
    // no Kick account here, or switched off in Connected apps
    await page.evaluate(() => { localStorage.setItem('kickMultiview.accounts', '{}'); window.pearLink.applyLink(); });
    assert.equal(await chest(page), null, 'no Kick account here');
    await page.evaluate(() => { localStorage.setItem('kickMultiview.accounts', '{"kick":"pearfan"}'); localStorage.setItem('kickMultiview.link.dailyReward', '0'); window.pearLink.applyLink(); });
    assert.equal(await chest(page), null, 'switched off');
    await page.evaluate(() => { localStorage.setItem('kickMultiview.link.dailyReward', '1'); window.pearLink.applyLink(); });
    assert.ok(await chest(page), 'on again');
    // Pear Drops gone again: no chest
    await push(page, { ...linked(REWARD()), peer: { ...peer(), status: 'waiting' } });
    assert.equal(await chest(page), null, 'Pear Drops closed');
  });
}

test('The daily reward chest: an earning reward with little to say, and the countdown ticks', async t => {
  const page = await openPage(t);
  await push(page, linked(REWARD({ minutes: undefined, threshold: undefined, endsAt: undefined })));
  let c = await chest(page);
  assert.deepEqual([c.state, c.ring, c.title], ['earning', ring(0), 'Daily reward']);
  await push(page, linked(REWARD({ minutes: 75, threshold: 60 })));
  c = await chest(page);
  assert.deepEqual([c.ring, c.title], [0, 'Daily reward · 75 of 60 min\n0 min to go'], 'never past full');
  await push(page, linked(REWARD({ state: 'claimed', endsAt: hours(-1) })));
  assert.equal((await chest(page)).title, 'Daily reward claimed', 'the time has gone');
  await push(page, linked(REWARD({ state: 'claimed', endsAt: hours(0.25) })));
  assert.match((await chest(page)).title, /Next one in 1[45]m$/);
});

test('The daily reward chip shrinks to the chest in a tight toolbar, and grows back', async t => {
  const page = await openPage(t);
  await push(page, linked(REWARD({ state: 'ready' })));
  assert.equal((await chest(page)).label, 'Claim reward');
  await page.setViewportSize({ width: 420, height: 700 });
  await page.waitForFunction(() => document.querySelector('header').classList.contains('c3'));
  await page.waitForTimeout(100);
  let c = await chest(page);
  assert.equal(c.label, null, 'tight: just the hopping chest');
  assert.equal(c.hop, 'dr-hop');
  const fits = () => page.evaluate(() => { const h = document.querySelector('header'); return h.scrollWidth <= h.clientWidth + 1; });
  assert.ok(await fits(), 'the toolbar still fits');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => !document.querySelector('header').classList.contains('c3'));
  await page.waitForTimeout(100);
  c = await chest(page);
  assert.equal(c.label, 'Claim reward', 'room again: the chip');
  // with room for everything, the chip's words fit (with headroom for Linux's wider fonts)
  const room = await page.$eval('#rewardBtn .tb-l', e => e.scrollWidth <= e.clientWidth);
  assert.ok(room);
});

test('The daily reward chest: a click asks Pear Drops to show it; with one too old, or if it couldn\'t, Kick\'s own dialog', async t => {
  const page = await openPage(t);
  const KICK = 'https://kick.com/?daily-reward=open';
  // an older Pear Drops (before 0.1.12: no rewards.daily): Kick's dialog, in an app window (with the Kick login)
  await push(page, linked(null, ['drops.farming']));
  await page.click('#rewardBtn');
  assert.deepEqual(await calls(page, 'window'), [[KICK, 1100, 820]]);
  assert.equal((await calls(page, 'showReward')).length, 0);
  // linked: Pear Drops shows it
  await push(page, linked(REWARD({ state: 'ready' })));
  await page.click('#rewardBtn');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'showReward'));
  assert.equal((await calls(page, 'window')).length, 1, 'and nothing else');
  // Pear Drops couldn't: Kick's dialog
  await page.evaluate(() => { window.rewardShown = false; });
  await page.click('#rewardBtn');
  await page.waitForFunction(() => window.calls.filter(c => c[0] === 'window').length === 2);
  // an older Pear Drops (before 0.1.12: no rewards.daily): the plain chest, and Kick's dialog
  await push(page, linked(REWARD({ state: 'ready' }), ['drops.farming']));
  const c = await chest(page);
  assert.deepEqual([c.state, c.title], ['plain', 'Daily reward on Kick']);
  await page.click('#rewardBtn');
  await page.waitForFunction(() => window.calls.filter(c => c[0] === 'window').length === 3);
  assert.equal((await calls(page, 'showReward')).length, 2, 'not asked');
  // Connect switched off: no chest
  await page.evaluate(() => { localStorage.setItem('kickMultiview.link.peardrops', '0'); window.pearLink.applyLink(); });
  await push(page, linked(REWARD({ state: 'ready' })));
  assert.equal(await chest(page), null);
  // no desktop app to open a window: a browser window
  await page.evaluate(() => { localStorage.setItem('kickMultiview.link.peardrops', '1'); window.pearLink.applyLink(); });
  await push(page, linked(REWARD({ state: 'ready' }), ['drops.farming']));
  await page.evaluate(() => { delete window.kmv.openWindow; });
  await page.click('#rewardBtn');
  assert.deepEqual(await calls(page, 'open'), [[KICK, 'kmv_daily_reward']]);
});

test('The daily reward chest: its tooltip shows the first line as its name, the rest under it', async t => {
  const page = await openPage(t);
  await push(page, linked(REWARD()));
  await page.hover('#rewardBtn');
  await page.waitForSelector('#tip.on');
  assert.equal(await page.$eval('#tip', e => e.firstChild.textContent), 'Daily reward · 37 of 60 min');
  assert.equal(await page.textContent('#tip small'), '23 min to go');
  // a chip with words: the whole title, both lines
  await page.mouse.move(800, 600);
  await push(page, linked(REWARD({ state: 'ready', endsAt: null })));
  await page.hover('#rewardBtn');
  await page.waitForSelector('#tip.on.plain');
  assert.equal(await page.$eval('#tip', e => e.innerText), 'Daily reward is ready\nOpen Pear Drops to claim it');
});

test('The daily reward chest: Grapevine\'s example messages (every good one shows, signed-out hides it; bad ones show nothing of theirs)', async t => {
  const page = await openPage(t);
  const { valid, invalid } = fixtures('rewards.daily', 1);
  const changed = valid.filter(f => f.event === 'rewards.daily.changed' || f.result === 'rewards.daily.get');
  assert.ok(changed.length >= 5);
  for (const f of changed){
    await push(page, linked(f.params));
    const c = await chest(page);
    if (f.params.state === 'signed-out') assert.equal(c, null, f.name);
    else assert.equal(c && c.state, ['earning', 'ready', 'claimed'].includes(f.params.state) ? f.params.state : 'unavailable', f.name);
  }
  for (const f of invalid.filter(f => f.event === 'rewards.daily.changed')){
    await push(page, linked(f.params));
    const c = await chest(page);
    assert.ok(!c || c.state === 'plain', f.name + ': not shown as a reward');
  }
  await push(page, linked({ state: 'earning', account: { platform: 'kick', user: 'pearfan' }, minutes: -5, threshold: 60 }));
  assert.equal((await chest(page)).title, 'Daily reward', 'minutes below zero: not shown');
});

test('The daily reward chest stops hopping for reduced motion', async t => {
  const page = await openPage(t);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await push(page, linked(REWARD({ state: 'ready' })));
  const c = await chest(page);
  assert.deepEqual([c.state, c.hop], ['ready', 'none']);
  assert.equal(await page.$eval('#rewardBtn', e => getComputedStyle(e).animationName), 'none', 'no glow either');
});

test('No two stylesheets name a keyframes animation the same (one would play the other\'s)', async t => {
  const page = await openPage(t);
  const names = await page.evaluate(() => {
    const out = [];
    for (const sheet of document.styleSheets){
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const walk = list => { for (const r of list){ if (r.type === CSSRule.KEYFRAMES_RULE) out.push(r.name); else if (r.cssRules) walk(r.cssRules); } };
      walk(rules);
    }
    return out;
  });
  assert.ok(names.includes('dr-hop') && names.includes('dr-burst') && names.includes('dr-glow'));
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});
