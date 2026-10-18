// Settings › Connected apps › Activity, with a stand-in desktop app that keeps a log the way src/main/activity.js does
// and answers the page's link:activity calls: the words for each message, the fields of one, the chart, the filters,
// paging through as many rows as fit (Settings never scrolls), new messages coming in, and the way back to the card.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

const PD = 'com.streamorchard.peardrops';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const FARMING = { seq: 3, at: '2026-10-18T16:55:00Z', state: 'farming', account: { platform: 'kick', user: 'pearfan' }, channel: { platform: 'kick', slug: 'pixelpear', name: 'PixelPear' },
  drop: { campaign: 'Neon Rush Launch Week', category: 'Neon Rush', progress: { done: 48, total: 120, unit: 'minutes' }, rewards: { claimed: 1, total: 3, items: [{}, {}, {}, {}] } } };
const PLAYERS = { platforms: { kick: { signedIn: false, mode: 'auto', account: { platform: 'kick', user: 'pearfan' }, open: [{ platform: 'kick', slug: 'pixelpear' }, { platform: 'kick', slug: 'retrorally' }] } } };

// the stand-in desktop app: the link's calls, and a log of `entries` (oldest first) paged as the main process does
const fakeApp = ({ png, entries, problems }) => {
  window.calls = [];
  window.linkNow = { on: true, peer: { id: 'com.streamorchard.peardrops', status: 'connected', installed: true, version: '0.1.6', report: { state: 'works', text: 'Works' }, pairedAt: '2026-10-18T09:00:00Z' }, farming: null, open: true, wait: null };
  window.actLog = { entries, totals: { sent: 5, received: 7, bytesOut: 2048, bytesIn: 150000, problems, pings: 3, heard: Date.now() - 12000, since: null }, started: new Date(2026, 9, 18, 16, 55).getTime() };
  const isProblem = e => e.kind === 'error' || e.tone === 'bad' || e.tone === 'warn';
  const pass = { all: () => true, out: e => e.dir === 'out', in: e => e.dir === 'in', problems: isProblem };
  const minutes = Array.from({ length: 30 }, (_, i) => (i === 29 ? { out: 2, in: 3, bad: 1 } : i === 20 ? { out: 4, in: 0, bad: 0 } : { out: 0, in: 0, bad: 0 }));
  let push = null, pushAct = null;
  window.linkPush = st => push(st);
  window.actPush = () => pushAct();
  window.kmv = {
    linkSet: on => { window.linkNow.on = on; return Promise.resolve(JSON.parse(JSON.stringify(window.linkNow))); },
    linkState: () => Promise.resolve(JSON.parse(JSON.stringify(window.linkNow))),
    linkIcon: () => Promise.resolve(png),
    linkTest: () => Promise.resolve({ ok: true, text: 'Pear Drops 0.1.6 answered in 2 ms' }),
    playersReport: () => {},
    onLinkState: cb => { push = cb; },
    onLinkActivity: cb => { pushAct = cb; },
    linkActivity: o => {
      window.calls.push(['activity', o]);
      const log = window.actLog, f = pass[o.filter] || pass.all;
      const mine = log.entries.filter(f), older = o.before == null ? mine : mine.filter(e => e.n < o.before);
      return Promise.resolve(JSON.parse(JSON.stringify({
        entries: older.slice(-Math.max(1, o.limit)).reverse(), total: mine.length, newer: mine.length - older.length,
        problems: log.entries.filter(isProblem).length, totals: log.totals, minutes, started: log.started, latest: log.entries.length ? log.entries[log.entries.length - 1].n : 0
      })));
    }
  };
  navigator.clipboard.writeText = t => { window.copied = t; return Promise.resolve(); };
};

// 30 messages and notes, oldest first: two problems (an error and a warning)
function sampleLog(){
  const at = new Date(2026, 9, 18, 17, 0, 0).getTime();
  const list = [
    { dir: 'in', kind: 'request', method: 'link.hello', id: 1 },
    { dir: 'out', kind: 'reply', method: 'link.hello', id: 1, ms: 0.4 },
    { kind: 'status', tone: 'ok', text: 'Connected to Pear Drops' },
    { dir: 'in', kind: 'request', method: 'link.subscribe', id: 3, data: { events: ['players.changed'] } },
    { dir: 'out', kind: 'reply', method: 'link.subscribe', id: 3, ms: 1, data: { subscribed: ['players.changed'] } },
    { dir: 'out', kind: 'error', method: 'drops.farming.get', id: 4, ms: 2, data: { code: -32601, message: 'No such method' } },
    { kind: 'note', tone: 'warn', text: 'Dropped an invalid drops.farming.changed from Pear Drops' }
  ];
  for (let i = 0; i < 23; i++) list.push(i % 2 ? { dir: 'out', kind: 'event', method: 'players.changed', data: PLAYERS } : { dir: 'in', kind: 'event', method: 'drops.farming.changed', data: FARMING });
  return list.map((e, i) => ({ n: i + 1, at: at + i * 1000, app: PD, dir: null, method: null, bytes: e.kind === 'status' || e.kind === 'note' ? undefined : 300, ...e }));
}

async function openActivity(t, { entries = sampleLog(), problems = 2, size, connect = '1' } = {}){
  const init = `(${fakeApp})(${JSON.stringify({ png: PNG, entries, problems })});localStorage.setItem('kickMultiview.link.peardrops', ${JSON.stringify(connect)});`;
  const page = await openApp(t, { ...size, init: { content: init } });
  await page.waitForFunction(() => window.pearLink && window.pearLink.state);
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=apps]').hidden = false; openSettings('apps'); });
  return page;
}
const view = page => page.evaluate(() => {
  const v = document.getElementById('caActivity'), vis = el => !!el && el.offsetParent !== null;
  return {
    shown: vis(v), card: vis(document.getElementById('caPearDrops')),
    who: v.querySelector('.act-who-txt') && v.querySelector('.act-who-txt').textContent, chip: v.querySelector('.ca-chip') && v.querySelector('.ca-chip').textContent,
    tiles: [...v.querySelectorAll('.act-tile')].map(t => [...t.querySelectorAll('.act-tile-label, b, em')].map(e => e.textContent).join(' ')), bad: !!v.querySelector('.act-tile.bad'),
    rows: [...v.querySelectorAll('.act-list > .act-row')].map(r => r.classList.contains('act-marker') ? '— ' + r.querySelector('.act-pill').textContent : r.querySelector('.act-method').textContent + ' · ' + r.querySelector('.act-text').textContent),
    ns: [...v.querySelectorAll('.act-list > .act-row')].map(r => +r.dataset.n),
    range: v.querySelector('.act-range') && v.querySelector('.act-range').textContent,
    filter: v.querySelector('.act-filter.on') && v.querySelector('.act-filter.on').dataset.f,
    count: v.querySelector('.act-count') && v.querySelector('.act-count').textContent,
    newest: vis(v.querySelector('.act-newest')), newer: v.querySelector('.act-newer') && !v.querySelector('.act-newer').disabled, older: v.querySelector('.act-older') && !v.querySelector('.act-older').disabled,
    empty: v.querySelector('.act-empty') && [...v.querySelectorAll('.act-empty b, .act-empty > span:last-child')].map(e => e.textContent),
    room: v.querySelector('.act-list') ? Math.floor(v.querySelector('.act-list').clientHeight / 46) : 0
  };
});
const CLOCK = '\\d{1,2}:\\d\\d(?:\\s?[AP]M)?';   // the computer's own way of writing the time
const fits = page => page.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1);
const settle = page => page.waitForFunction(() => !window.smvActivity.state.loading && window.smvActivity.state.data);

test('Activity: the words for each message, from this app\'s side', async t => {
  const page = await openActivity(t);
  const words = await page.evaluate(({ FARMING, PLAYERS }) => {
    const d = (method, dir, kind, data) => { const w = window.smvActivity.describeActivity({ method, dir, kind, data }); return [w.title, w.kind, w.text].join(' | '); };
    return [
      d('drops.farming.changed', 'in', 'event', FARMING),
      d('drops.farming.changed', 'in', 'event', { ...FARMING, drop: { campaign: 'Neon Rush Launch Week' }, channel: null }),
      d('drops.farming.changed', 'in', 'event', { state: 'farming', drop: { category: 'Neon Rush' }, channel: { slug: 'pixelpear' } }),
      ...['paused', 'done', 'signed-out', 'waiting', 'farming', 'resting'].map(state => d('drops.farming.changed', 'in', 'event', { state })),
      d('drops.farming.get', 'out', 'request', {}), d('drops.farming.get', 'in', 'request', {}), d('drops.farming.get', 'in', 'reply', FARMING), d('drops.farming.get', 'in', 'reply', null),
      d('drops.farming.show', 'out', 'request', {}), d('drops.farming.show', 'in', 'request', {}), d('drops.farming.show', 'in', 'reply', { shown: true }), d('drops.farming.show', 'in', 'reply', { shown: false }),
      d('players.changed', 'out', 'event', PLAYERS),
      d('players.changed', 'out', 'event', { platforms: { kick: { ...PLAYERS.platforms.kick, signedIn: true } } }),
      d('players.changed', 'out', 'event', { platforms: { kick: { ...PLAYERS.platforms.kick, signedIn: true, mode: 'signed-in', open: [{}] } } }),
      d('players.changed', 'out', 'event', { platforms: { kick: { ...PLAYERS.platforms.kick, mode: 'signed-out' } } }),
      d('players.changed', 'out', 'event', { platforms: { kick: { ...PLAYERS.platforms.kick, mode: 'new-mode' } } }),
      d('players.changed', 'out', 'event', { platforms: { kick: { ...PLAYERS.platforms.kick, open: [] } } }),
      d('players.get', 'in', 'request', {}), d('players.get', 'out', 'request', {}), d('players.get', 'out', 'reply', PLAYERS),
      d('link.hello', 'in', 'request'), d('link.hello', 'out', 'reply'), d('link.hello', 'out', 'request'), d('link.hello', 'in', 'reply'),
      d('link.auth', 'in', 'request'), d('link.auth', 'out', 'reply'),
      d('link.subscribe', 'in', 'request', { events: ['players.changed'] }), d('link.subscribe', 'out', 'reply', { subscribed: ['players.changed'] }),
      d('link.subscribe', 'out', 'request', { events: ['drops.farming.changed'] }), d('link.subscribe', 'in', 'reply', { subscribed: [] }),
      d('link.unpair', 'out', 'request', {}), d('link.unpair', 'in', 'request', {}), d('link.unpair', 'in', 'reply', {}),
      d('link.bye', 'in', 'event', { reason: 'quitting' }), d('link.bye', 'out', 'event', {}),
      d('drops.farming.show', 'in', 'error', { code: -32601, message: 'No such method' }), d(null, 'in', 'error', {}),
      d('drops.rewards.changed', 'in', 'event', { seq: 1, at: 'x', items: [], total: 3 }), d('drops.rewards.changed', 'in', 'event', {}), d(null, 'in', 'event', 'text'),
      [window.smvActivity.describeActivity({ kind: 'status', tone: 'ok', text: 'Connected to Pear Drops' })].map(w => [w.title, w.kind, w.text].join(' | '))[0],
      [window.smvActivity.describeActivity({ kind: 'note', tone: 'warn' })].map(w => [w.title, w.kind, w.text].join(' | '))[0]
    ];
  }, { FARMING, PLAYERS });
  assert.deepEqual(words, [
    'drops.farming.changed | event | Farming Neon Rush Launch Week on PixelPear · 48 of 120 min',
    'drops.farming.changed | event | Farming Neon Rush Launch Week',
    'drops.farming.changed | event | Farming Neon Rush on pixelpear',
    'drops.farming.changed | event | Paused', 'drops.farming.changed | event | Every drop is done', 'drops.farming.changed | event | Signed out of Kick',
    'drops.farming.changed | event | Waiting for a stream with drops', 'drops.farming.changed | event | Farming', 'drops.farming.changed | event | State: resting',
    "drops.farming.get | request | Asked Pear Drops what's being farmed", "drops.farming.get | request | Pear Drops asked what's being farmed",
    'drops.farming.get | reply | Farming Neon Rush Launch Week on PixelPear · 48 of 120 min', 'drops.farming.get | reply | No fields',
    'drops.farming.show | request | Asked Pear Drops to come to the front', 'drops.farming.show | request | Pear Drops asked to be shown',
    'drops.farming.show | reply | Shown', 'drops.farming.show | reply | Not shown',
    'players.changed | event | 2 Kick players open, signed out while Pear Drops farms',
    'players.changed | event | 2 Kick players open, signed in (Auto)',
    'players.changed | event | 1 Kick player open, signed in (always)',
    'players.changed | event | 2 Kick players open, signed out (always)',
    'players.changed | event | 2 Kick players open, signed out · new-mode',
    'players.changed | event | No Kick players open',
    'players.get | request | Pear Drops asked about the players', 'players.get | request | Asked Pear Drops about its players',
    'players.get | reply | 2 Kick players open, signed out while Pear Drops farms',
    'link.hello | request | Pear Drops said hello', 'link.hello | reply | Hello back to Pear Drops', 'link.hello | request | Said hello to Pear Drops', 'link.hello | reply | Pear Drops said hello back',
    'link.auth | request | The pairing proof', 'link.auth | reply | Pairing proof accepted',
    'link.subscribe | request | Pear Drops asked for players.changed', 'link.subscribe | reply | Will send players.changed',
    'link.subscribe | request | Asked Pear Drops for drops.farming.changed', 'link.subscribe | reply | Pear Drops will send nothing',
    'link.unpair | request | Asked Pear Drops to forget the pairing', 'link.unpair | request | Pear Drops asked to forget the pairing', 'link.unpair | reply | The pairing is forgotten',
    'link.bye | event | Goodbye: quitting', 'link.bye | event | Goodbye',
    'drops.farming.show | error | No such method (-32601)', 'Error | error | Failed',
    'drops.rewards.changed | event | items, total', 'drops.rewards.changed | event | No fields', 'Message | event | No fields',
    'Link | status | Connected to Pear Drops', 'Noticed | note | '
  ]);
  // a message's fields: path · value, arrays as how many, the first eight and how many more
  const f = await page.evaluate(FARMING => [window.smvActivity.activityFields(FARMING), window.smvActivity.activityFields({ a: {}, b: null, c: [1] }), window.smvActivity.activityFields(undefined)], FARMING);
  assert.deepEqual(f[0].fields.slice(0, 4), [['seq', '3'], ['at', '2026-10-18T16:55:00Z'], ['state', 'farming'], ['account.platform', 'kick']]);
  assert.deepEqual(f[0].fields.length, 8);
  assert.equal(f[0].more, 8);
  assert.deepEqual(f[1], { fields: [['a', '{}'], ['b', 'null'], ['c', '1 item']], more: 0 });
  assert.deepEqual(f[2], { fields: [['(empty)', '{}']], more: 0 });
});

test('Activity: the button opens it in place of the card, with the header, the tiles and the chart; Esc and the back arrow go back', async t => {
  const page = await openActivity(t);
  assert.ok(await page.isVisible('#caPearDrops .ca-activity'), 'next to Test while Connect is on');
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  let v = await view(page);
  assert.deepEqual([v.shown, v.card], [true, false], 'in place of the card');
  assert.equal(await page.isVisible('#settingsDlg .st-pane[data-s=apps] > h4'), false, 'its own heading');
  assert.equal(await page.textContent('#caActivity .act-top h4'), 'Activity');
  assert.match(v.who, new RegExp(`^Pear DropsEvery message between the two since ${CLOCK}, kept until Stream Multiview quits\\.$`));
  assert.equal(v.chip, 'Connected · 0.1.6');
  assert.equal(await page.getAttribute('#caActivity .act-logo', 'src'), PNG);
  assert.deepEqual([v.tiles[0], v.tiles[1], v.tiles[3]], ['Sent 5 2.0 KB', 'Received 7 146 KB', 'Problems 2']);
  assert.match(v.tiles[2], /^Heartbeat 1\ds ago last heard$/, 'heard 12 s before the page opened');
  assert.ok(v.bad, 'Problems is red when there are any');
  // the chart: a bar a minute, sent under received, a red dot for a problem, and each one's tooltip
  const chart = await page.$$eval('#caActivity .act-col', cols => cols.map(c => ({ tip: c.title, out: !!c.querySelector('.act-seg.out'), in: !!c.querySelector('.act-seg.in'), bad: !!c.querySelector('.act-bad'), h: [...c.querySelectorAll('.act-seg')].map(s => s.style.height) })));
  assert.equal(chart.length, 30);
  assert.match(chart[29].tip, new RegExp(`^${CLOCK} · 2 sent, 3 received, 1 problem$`));
  assert.match(chart[20].tip, new RegExp(`^${CLOCK} · 4 sent, 0 received$`));
  assert.match(chart[0].tip, new RegExp(`^${CLOCK} · 0 sent, 0 received$`));
  assert.deepEqual([chart[29].out, chart[29].in, chart[29].bad, chart[29].h], [true, true, true, ['40%', '60%']], 'the tallest is 5 messages');
  assert.deepEqual([chart[20].out, chart[20].in, chart[20].bad], [true, false, false]);
  assert.deepEqual([chart[0].out, chart[0].in], [false, false]);
  assert.deepEqual(await page.$$eval('#caActivity .act-axis span', s => s.map(e => e.textContent)), ['30 min ago', '15 min', 'now']);
  const order = await page.$eval('#caActivity .act-col:last-child', c => [...c.children].map(e => e.className));
  assert.deepEqual(order, ['act-seg out', 'act-seg in', 'act-bad'], 'sent at the bottom (the column runs upwards)');
  assert.ok(await fits(page), 'Settings doesn\'t scroll');
  // the heartbeat's "ago" keeps up, and "last heard" stays put as it counts
  const heardAt = () => page.$eval('#caActivity .act-tile.beat em', e => e.getBoundingClientRect().left);
  const lefts = [];
  for (const s of [1, 6, 14, 51]){   // (it counts on as it's read: one or two digits is what matters)
    await page.evaluate(s => { window.smvActivity.state.data.totals.heard = Date.now() - s * 1000; }, s);
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#caActivity .act-tile.beat b').textContent), s < 9 ? '^\\ds ago$' : '^\\d\\ds ago$');
    lefts.push(await heardAt());
  }
  assert.equal(new Set(lefts).size, 1, 'last heard at ' + lefts.join(', '));
  await page.evaluate(() => { window.smvActivity.state.data.totals.heard = Date.now() - 75000; });
  await page.waitForFunction(() => document.querySelector('#caActivity .act-tile.beat b').textContent === '1m ago');

  await page.keyboard.press('Escape');
  v = await view(page);
  assert.deepEqual([v.shown, v.card], [false, true], 'Esc: back to the card');
  assert.equal(await page.isVisible('#settingsDlg'), true, 'Settings stays open');
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  await page.click('#caActivity .act-back');
  assert.deepEqual(await view(page).then(x => [x.shown, x.card]), [false, true], 'the back arrow too');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#settingsDlg'), false, 'then Esc closes Settings as before');
  // leaving the tab goes back to the card
  await page.evaluate(() => openSettings('apps'));
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  await page.evaluate(() => openSettings('general'));
  await page.evaluate(() => openSettings('apps'));
  assert.deepEqual(await view(page).then(x => [x.shown, x.card]), [false, true]);
  // switched off: no Activity button
  await page.click('#caConnect');
  assert.equal(await page.isVisible('#caPearDrops .ca-activity'), false);
});

test('Activity: as many rows as fit, newest first, and paging with Older, Newer and Newest', async t => {
  const page = await openActivity(t);
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  await page.waitForFunction(() => document.querySelectorAll('#caActivity .act-list > .act-row').length === Math.floor(document.querySelector('#caActivity .act-list').clientHeight / 46));
  let v = await view(page);
  const n = v.room;
  assert.ok(n >= 6, n + ' rows');
  assert.equal(v.ns[0], 30, 'newest first');
  assert.equal(v.range, `1–${n} of 30`);
  assert.deepEqual([v.newest, v.newer, v.older], [false, false, true]);
  assert.equal(v.rows[0], 'drops.farming.changed · Farming Neon Rush Launch Week on PixelPear · 48 of 120 min');
  assert.equal(v.rows[1], 'players.changed · 2 Kick players open, signed out while Pear Drops farms');
  assert.ok(await fits(page), 'the rows fit: nothing scrolls');
  await page.click('#caActivity .act-older');
  await settle(page);
  await page.waitForFunction(n => document.querySelector('#caActivity .act-range').textContent.startsWith((n + 1) + '–'), n);
  v = await view(page);
  assert.equal(v.ns[0], 30 - n);
  assert.deepEqual([v.newest, v.newer], [true, true], 'Newest and Newer once off the first page');
  // a new message arrives: this page stays put
  await page.evaluate(() => { window.actLog.entries.push({ n: 31, at: Date.now(), app: 'com.streamorchard.peardrops', dir: 'in', kind: 'event', method: 'drops.farming.changed', bytes: 90, data: { state: 'paused' } }); window.actPush(); });
  await page.waitForFunction(() => / of 31$/.test(document.querySelector('#caActivity .act-range').textContent));
  v = await view(page);
  assert.equal(v.ns[0], 30 - n, 'the same entries');
  assert.equal(v.range, `${n + 2}–${2 * n + 1} of 31`);
  // to the last page and back
  while (await page.isEnabled('#caActivity .act-older')){ await page.click('#caActivity .act-older'); await settle(page); }
  v = await view(page);
  assert.equal(v.ns[v.ns.length - 1], 1, 'the oldest');
  assert.match(v.rows[v.rows.length - 1], /^link\.hello · Pear Drops said hello$/);
  await page.click('#caActivity .act-newer');
  await settle(page);
  await page.click('#caActivity .act-newest');
  await settle(page);
  await page.waitForFunction(() => document.querySelector('#caActivity .act-range').textContent.startsWith('1–'));
  v = await view(page);
  assert.equal(v.ns[0], 31);
  assert.deepEqual([v.newest, v.newer], [false, false]);
  // on the newest page, new messages show as they come, lit for a moment
  await page.evaluate(() => { window.actLog.entries.push({ n: 32, at: Date.now(), app: 'com.streamorchard.peardrops', dir: 'out', kind: 'event', method: 'players.changed', bytes: 90, data: { platforms: {} } }); window.actPush(); });
  await page.waitForSelector('#caActivity .act-row.fresh[data-n="32"]');
  assert.ok(await page.$$eval('#caActivity .act-row.fresh', r => r.every(e => +e.dataset.n > 30)), 'only what came since you last looked at the newest page');
  // a smaller window: fewer rows, still no scrolling
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => document.querySelectorAll('#caActivity .act-list > .act-row').length === Math.max(3, Math.floor(document.querySelector('#caActivity .act-list').clientHeight / 46)));
  assert.ok((await view(page)).ns.length < n);
  assert.ok(await fits(page));
});

test('Activity: the filters, with the problems counted; notes are pills across the list', async t => {
  const page = await openActivity(t);
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  let v = await view(page);
  assert.equal(v.filter, 'all');
  assert.equal(v.count, '2', 'Problems with its count');
  await page.click('#caActivity .act-filter[data-f=in]');
  await page.waitForFunction(() => window.smvActivity.state.filter === 'in' && !window.smvActivity.state.loading);
  await page.waitForFunction(() => / of 14$/.test(document.querySelector('#caActivity .act-range').textContent));
  v = await view(page);
  assert.equal(v.filter, 'in');
  assert.ok(v.rows.every(r => /^(drops\.farming\.changed|link\.subscribe|link\.hello)/.test(r)));
  assert.ok(await page.$$eval('#caActivity .act-list > .act-row', r => r.every(e => e.classList.contains('in'))), 'received only');
  await page.click('#caActivity .act-filter[data-f=out]');
  await page.waitForFunction(() => / of 14$/.test(document.querySelector('#caActivity .act-range').textContent) && window.smvActivity.state.filter === 'out');
  assert.ok(await page.$$eval('#caActivity .act-list > .act-row', r => r.every(e => e.classList.contains('out'))), 'sent only');
  await page.click('#caActivity .act-filter[data-f=problems]');
  await page.waitForFunction(() => / of 2$/.test(document.querySelector('#caActivity .act-range').textContent));
  v = await view(page);
  assert.deepEqual(v.rows, ['— Dropped an invalid drops.farming.changed from Pear Drops', 'drops.farming.get · No such method (-32601)']);
  assert.ok(await page.$eval('#caActivity .act-row.k-error', r => r.classList.contains('out')), 'an error has its own badge');
  assert.ok(await page.$('#caActivity .act-marker.tone-warn'));
  await page.click('#caActivity .act-filter[data-f=all]');
  await settle(page);
  // a status note in the list
  while (!(await page.$('#caActivity .act-marker.tone-ok'))){ await page.click('#caActivity .act-older'); await settle(page); }
  assert.equal(await page.textContent('#caActivity .act-marker.tone-ok .act-pill'), 'Connected to Pear Drops');
  assert.ok(await page.$('#caActivity .act-marker.tone-ok .act-pill svg path'), 'with the link icon');
});

test('Activity: the wait to sign Kick players back in is a pill with a clock', async t => {
  const at = new Date(2026, 9, 18, 17, 0, 0).getTime(), PD = 'com.streamorchard.peardrops';
  const page = await openActivity(t, { problems: 0, entries: [
    { n: 1, at, app: PD, dir: 'in', kind: 'event', method: 'drops.farming.changed', bytes: 90, data: { state: 'waiting' } },
    { n: 2, at: at + 50, app: PD, dir: null, kind: 'status', method: null, tone: '', about: 'players', text: 'Farming stopped · Kick players sign back in at 17:05:00 (in 5 min)' }
  ] });
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  assert.deepEqual((await view(page)).rows, ['— Farming stopped · Kick players sign back in at 17:05:00 (in 5 min)', 'drops.farming.changed · Waiting for a stream with drops']);
  assert.ok(await page.$('#caActivity .act-marker.tone-plain .act-pill svg circle'), 'a clock, not the link');
  assert.equal(await page.evaluate(() => document.querySelector('#caActivity .act-filter[data-f=problems]').textContent), 'Problems', 'not a problem');
});

test('Activity: a click opens a message\'s fields, with Copy JSON; the hello\'s are never shown', async t => {
  const page = await openActivity(t);
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  await page.waitForFunction(() => document.querySelectorAll('#caActivity .act-list > .act-row').length >= 6);
  const before = (await view(page)).ns.length;
  await page.click('#caActivity .act-row[data-n="30"]');
  await page.waitForSelector('#caActivity .act-detail');
  const fields = await page.$$eval('#caActivity .act-fields > div', d => d.map(e => e.querySelector('dt').textContent + ' · ' + e.querySelector('dd').textContent));
  assert.deepEqual(fields, ['seq · 3', 'at · 2026-10-18T16:55:00Z', 'state · farming', 'account.platform · kick', 'account.user · pearfan', 'channel.platform · kick', 'channel.slug · pixelpear', 'channel.name · PixelPear']);
  assert.match(await page.textContent('#caActivity .act-detail-foot span'), /^\+8 more fields$/);
  assert.equal(await page.$eval('#caActivity .act-fields', e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 2, 'two columns');
  // fewer rows make room for it, and nothing scrolls
  await page.waitForFunction(b => document.querySelectorAll('#caActivity .act-list > .act-row').length < b, before);
  assert.ok(await fits(page));
  await page.click('#caActivity .act-copy');
  await page.waitForFunction(() => document.querySelector('#caActivity .act-copy').textContent === 'Copied');
  const copied = JSON.parse(await page.evaluate(() => window.copied));
  assert.deepEqual([copied.method, copied.kind, copied.dir, copied.data.drop.campaign], ['drops.farming.changed', 'event', 'in', 'Neon Rush Launch Week']);
  await page.waitForFunction(() => document.querySelector('#caActivity .act-copy').textContent === 'Copy JSON', null, { timeout: 4000 });
  await page.click('#caActivity .act-row[data-n="30"]');
  assert.equal(await page.$('#caActivity .act-detail'), null, 'a second click closes it');
  // the hello: its data never reaches the page
  while (await page.isEnabled('#caActivity .act-older')){ await page.click('#caActivity .act-older'); await settle(page); }
  await page.click('#caActivity .act-row[data-n="1"]');
  assert.equal(await page.textContent('#caActivity .act-hidden'), "Not shown: the hello and the pairing proof hold the pairing's secrets.");
  assert.equal(await page.$('#caActivity .act-copy'), null, 'nothing to copy');
  assert.equal(await page.textContent('#caActivity .act-detail-foot span'), 'id 1');
});

test('Activity: text from the messages is only ever text', async t => {
  const evil = '<img src=x onerror="window.pwned=1">';
  const entries = [{ n: 1, at: Date.now(), app: PD, dir: 'in', kind: 'event', method: 'drops.farming.changed', bytes: 90,
    data: { state: 'farming', channel: { name: evil }, drop: { campaign: evil + ' Week'.repeat(20) } } }];
  const page = await openActivity(t, { entries, problems: 0 });
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  await page.click('#caActivity .act-row[data-n="1"]');
  assert.equal(await page.$('#caActivity img[src=x]'), null);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.ok((await page.textContent('#caActivity .act-text')).includes(evil));
  const long = await page.$eval('#caActivity .act-fields dd[title]', d => [d.textContent.length, d.title.length]);
  assert.deepEqual(long, [81, evil.length + 5 * 20], 'a long value is cut, and whole in its tooltip');
  assert.equal((await view(page)).bad, false, 'no problems: Problems isn\'t red');
});

test('Activity: empty, with nothing under a filter, and with Connect off', async t => {
  const page = await openActivity(t, { entries: [], problems: 0 });
  await page.click('#caPearDrops .ca-activity');
  await settle(page);
  let v = await view(page);
  assert.deepEqual(v.empty, ['Nothing yet', 'Messages between Stream Multiview and Pear Drops show here as they happen.']);
  assert.equal(v.range, null, 'no pager');
  assert.equal(v.count, null);
  await page.click('#caActivity .act-filter[data-f=problems]');
  await page.waitForFunction(() => document.querySelector('#caActivity .act-empty b').textContent === 'No problems');
  assert.deepEqual((await view(page)).empty, ['No problems', 'Everything between Stream Multiview and Pear Drops went through this run.']);
  await page.click('#caActivity .act-filter[data-f=out]');
  await page.waitForFunction(() => document.querySelector('#caActivity .act-empty > span:last-child').textContent === 'Nothing sent this run.');
  await page.click('#caActivity .act-filter[data-f=in]');
  await page.waitForFunction(() => document.querySelector('#caActivity .act-empty > span:last-child').textContent === 'Nothing received this run.');
  // Connect switched off meanwhile (in the other window)
  await page.evaluate(() => { localStorage.setItem('kickMultiview.link.peardrops', '0'); window.linkPush({ ...window.linkNow, on: false, peer: { ...window.linkNow.peer, status: 'off' } }); });
  await page.waitForFunction(() => document.querySelector('#caActivity .act-empty b').textContent === 'Connect is off');
  v = await view(page);
  assert.deepEqual(v.empty, ['Connect is off', 'Switch on Connect with Pear Drops, and the messages between the two show here as they happen.']);
  assert.equal(v.chip, 'Off');
});

test('Activity: outside the desktop app there\'s no log to ask, and nothing breaks', async t => {
  const page = await openApp(t, { init: { content: "localStorage.setItem('kickMultiview.link.peardrops', '1');" } });
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=apps]').hidden = false; openSettings('apps'); window.smvActivity.open(); });
  await page.waitForSelector('#caActivity .act-tiles');
  assert.deepEqual((await view(page)).tiles, ['Sent 0 0 B', 'Received 0 0 B', 'Heartbeat —', 'Problems 0']);
  assert.equal(await page.$$eval('#caActivity .act-col', c => c.length), 30);
  await page.evaluate(() => window.smvActivity.close());
  assert.equal((await view(page)).shown, false);
});
