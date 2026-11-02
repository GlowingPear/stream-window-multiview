// The notification centre: the toolbar bell, its tabs and rows, All notifications, and Settings > Notifications.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, midday } = require('../../app');

const { openApp } = setup();
const MIN = 60e3;
// Made-up notifications of every kind, newest first.
const seed = (now = Date.now()) => {
  return [
    { id: 'm1', kind: 'mention', channel: 'alpha', label: 'alpha', sender: 'ann', body: '@me hi', quoted: '', t: now - MIN, unread: true },
    { id: 's1', kind: 'spam', channel: 'tw:bravo', label: 'bravo · Twitch', sender: 'cheapbot', body: 'cheap viewers → site . net', score: 7, need: 6,
      signs: [{ text: 'Disguised link: site . net', points: 3 }, { text: 'Promo words: cheap, viewers', points: 2 }, { text: 'A new chatter', points: 2 }], t: now - 2 * MIN, unread: true },
    { id: 'l1', kind: 'live', channel: 'charlie', label: 'charlie', title: 'Late night chess', category: 'Chess', viewers: 1200, t: now - 3 * MIN, unread: true },
    { id: 'r1', kind: 'raid', channel: 'delta', from: 'echo', label: 'delta', t: now - 4 * MIN, unread: true },
    { id: 'a1', kind: 'app', subject: 'accounts', text: 'Logged out of Twitch', detail: 'Log in again to keep chat and follows working.', act: { t: 'login', p: 'twitch' }, t: now - 5 * MIN, unread: true },
    { id: 'a2', kind: 'app', subject: 'layouts', text: 'Saved layout “Late night”', t: now - 6 * MIN, unread: false },
    { id: 'm2', kind: 'reply', channel: 'tw:bravo', label: 'bravo · Twitch', sender: 'bob', body: 'sure', quoted: 'want to raid?', t: now - 7 * MIN, unread: false },
    { id: 'm3', kind: 'word', word: 'pear', channel: 'alpha', label: 'alpha', sender: 'cat', body: 'ask pear', quoted: '', t: now - 8 * MIN, unread: true }
  ];
};
// Stored before the page loads (only the first load: a reload keeps what the page changed).
const withNotes = (list, extra = {}) => ({ init: ([l, x]) => {
  if (location.pathname.indexOf('/src/index.html') < 0 || sessionStorage.getItem('seeded')) return;   // (not in the chats' frames)
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem('kickMultiview.notifications', JSON.stringify(l));
  for (const k in x) localStorage.setItem(k, x[k]);
}, arg: [list, extra] });
async function open(t, list = seed(), extra = {}, opts = {}){
  const s = withNotes(list, extra);
  return openApp(t, { ...opts, init: `(${s.init})(${JSON.stringify(s.arg)})` });
}
const badge = page => page.$eval('#bellBtn .mb-count', e => e.hidden ? '' : e.textContent);
const rows = (page, sel = '#bellList') => page.$$eval(`${sel} .nc-row`, e => e.map(r => r.dataset.id));
const tab = (page, t, root = '#bellPanel') => page.click(`${root} .nc-tabs [data-tab=${t}]`);
const chip = (page, v, root = '#bellPanel') => page.click(`${root} .nc-chips [data-v=${v}]`);
// a button's title (put aside in data-tip-title while the pointer is on it, for the app's own tooltip)
const tip = b => b.title || b.dataset.tipTitle || '';
const rect = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; });

for (const bar of [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }]){
  const name = bar.pos === 'top' ? 'at the top' : bar.labels ? 'on the left' : 'on the left, icons only';
  test(`the bell with the toolbar ${name}: its red number, and the popover next to it on screen`, async t => {
    const page = await open(t, seed(), { 'kickMultiview.toolbar': JSON.stringify(bar) });
    assert.equal(await page.evaluate(() => document.body.classList.contains('bar-left')), bar.pos === 'left');
    assert.ok(await page.isVisible('#bellBtn'));
    assert.equal(await badge(page), '3', 'mentions and spam that are new');
    const b = await rect(page, '#bellBtn'), c = await rect(page, '#bellBtn .mb-count');
    assert.ok(c.x >= b.x - 2 && c.r <= b.r + 2 && c.y >= b.y - 2 && c.b <= b.b + 2, `the number sits on the button: ${JSON.stringify([b, c])}`);
    await page.click('#bellBtn');
    const p = await rect(page, '#bellPanel'), vw = await page.evaluate(() => [innerWidth, innerHeight]);
    assert.ok(p.x >= 0 && p.r <= vw[0] && p.y >= 0 && p.b <= vw[1], 'all on screen');
    if (bar.pos === 'top') assert.ok(p.y >= b.b, 'under the toolbar');
    else {
      const head = await rect(page, 'header');
      assert.ok(p.x >= head.r, 'beside the toolbar, not over it');
    }
    const d = await rect(page, '#bellPanel .nc-dnd');
    assert.ok(d.w > 0 && d.x >= p.x && d.r <= p.r && d.y >= p.y && d.b <= p.b, 'its Do not disturb button is inside it, top right');
    await page.click('#bellPanel .nc-dnd');
    assert.equal(await page.evaluate(() => document.querySelector('#bellBtn').classList.contains('off')), true, 'and works from here');
    await page.click('#bellPanel .nc-dnd');
    assert.equal(await page.getAttribute('#bellBtn', 'aria-expanded'), 'true');
    assert.equal(await badge(page), '', 'what it shows is seen');
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#bellPanel'));
  });
}

test('the bell\'s tabs and sub-filters, the new ones marked once, and the rows of each kind', async t => {
  const page = await open(t);
  await page.click('#bellBtn');
  assert.deepEqual(await page.$$eval('#bellPanel .nc-tabs button', e => e.map(b => b.textContent)), ['All5', 'Mentions2', 'Mod1', 'Live2', 'App'],
    'new ones in each tab (app messages never count)');
  assert.deepEqual(await rows(page), ['m1', 's1', 'l1', 'r1', 'a1', 'a2', 'm2', 'm3']);
  assert.deepEqual(await page.$$eval('#bellList .nc-row.unread', e => e.map(r => r.dataset.id)), ['m1', 's1', 'l1', 'r1', 'a1', 'm3'], 'new ones keep their mark while it\'s open');
  assert.deepEqual(await page.$$eval('#bellPanel .nc-chips button', e => e.map(b => b.textContent)), ['All 8', 'Mentions 3', 'Mod 1', 'Live 2', 'App 2']);
  await chip(page, 'live');
  assert.deepEqual(await rows(page), ['l1', 'r1']);

  await tab(page, 'mentions');
  assert.deepEqual(await page.$$eval('#bellPanel .nc-chips button', e => e.map(b => b.textContent)), ['All 3', '@ Mentions 1', 'Replies 1', 'Words 1', 'Support']);
  assert.deepEqual(await page.$$eval('#bellList .nc-row .mp-kind', e => e.map(b => b.textContent)), ['Mention', 'Reply', 'Word: pear']);
  await page.selectOption('#bellPanel .nc-pick', 'tw:bravo');
  assert.deepEqual(await rows(page), ['m2'], 'one chat');
  await chip(page, 'word');
  assert.match(await page.textContent('#bellList'), /Nothing matches/);
  await page.selectOption('#bellPanel .nc-pick', '');
  assert.deepEqual(await rows(page), ['m3']);

  await tab(page, 'spam');
  assert.equal(await page.isHidden('#bellPanel .nc-chips'), true, 'no sub-filters');
  assert.equal(await page.textContent('#bellPanel .nc-sum'), '1 in the last day', 'a summary instead (already seen on All)');
  const spam = page.locator('#bellList .nc-row[data-id=s1]');
  assert.equal(await spam.locator('.mp-kind').textContent(), '7 / 6');
  assert.ok(await spam.locator('.nc-why').isHidden());
  await spam.locator('.nc-acts button:text-is("Why?")').click();
  assert.equal(await spam.locator('.nc-why').textContent(), 'Likely spam (7 points, 6 needed):\n• Disguised link: site . net (+3)\n• Promo words: cheap, viewers (+2)\n• A new chatter (+2)', 'the same as the tag in chat');
  await spam.locator('.nc-acts button:text-is("Add to bots")').click();
  assert.match(await spam.locator('.nc-acts').textContent(), /On the chat bot list/);
  assert.ok(await page.evaluate(() => smvNotes.alerts.mention.bots.includes('cheapbot')), 'on the shared chat bot list');
  await spam.locator('.nc-acts button:text-is("Not spam")').click();
  assert.match(await page.textContent('#bellList'), /Nothing flagged/);

  await tab(page, 'live');
  assert.deepEqual(await page.$$eval('#bellPanel .nc-chips button', e => e.map(b => b.textContent)), ['All 2', 'Went live 1', 'Raids 1', 'Opened by itself']);
  assert.deepEqual(await page.$$eval('#bellPanel .nc-pick option', e => e.map(o => o.textContent)), ['All sites', 'Kick', 'Twitch', 'YouTube']);
  const live = page.locator('#bellList .nc-row[data-id=l1]');
  assert.equal(await live.locator('.mp-body').textContent(), 'Late night chess · Chess · 1,200 watching');
  assert.equal(await page.textContent('#bellList .nc-row[data-id=r1] .mp-kind'), 'raided by echo');
  await page.evaluate(() => { smvNotes.setInfo('delta', { live: false }); });
  await tab(page, 'all'); await tab(page, 'live');
  assert.equal(await page.textContent('#bellList .nc-row[data-id=r1] .nc-acts'), 'Offline', 'gone offline since');
  await live.locator('button:text-is("Chat only")').click();
  assert.ok(await page.isHidden('#bellPanel'), 'it closes');
  assert.deepEqual(await page.$$eval('#stage .win', e => e.map(w => [w.classList.contains('chat'), w.querySelector('.title').textContent])), [[true, 'charlie']]);
  await page.click('#bellBtn');
  assert.equal(await page.textContent('#bellList .nc-row[data-id=l1] .nc-acts'), 'Already open', 'the tab it was on');

  await tab(page, 'app');
  assert.deepEqual(await page.$$eval('#bellPanel .nc-chips button', e => e.map(b => b.textContent)), ['All', 'Accounts', 'Layouts', 'Windows', 'Downloads', 'Updates'],
    'App\'s chips only count new ones (seen on All)');
  assert.equal(await page.textContent('#bellList .nc-row[data-id=a1] .mp-body'), 'Log in again to keep chat and follows working.');
  assert.equal(await page.locator('#bellList .nc-row[data-id=a1] .nc-acts').count(), 0, 'Log in needs the desktop app');
  assert.ok(await page.isVisible('#bellClear'), 'nothing new here: Clear instead of Mark all read');
  await page.click('#bellClear');
  assert.match(await page.textContent('#bellList'), /No messages from the app/);
  await tab(page, 'all');
  assert.deepEqual(await rows(page), ['m1', 'l1', 'r1', 'm2', 'm3'], 'only App was cleared');
  assert.deepEqual(await page.$$eval('#bellList .nc-row.unread', e => e.map(r => r.dataset.id)), [], 'and the rest were seen when shown');
  await page.click('#bellSettings');
  assert.ok(await page.isVisible('#settingsDlg [data-s=notify]'), 'the gear opens Settings > Notifications');
});

test('App\'s chips stay on one line in a narrow window (they scroll sideways), and the latest 30 of a tab show', async t => {
  const now = Date.now();
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, kind: 'app', subject: ['accounts', 'layouts', 'windows', 'downloads', 'updates'][i % 5], text: 'Message ' + i, t: now - i * 1000, unread: true }));
  const page = await open(t, many, {}, { width: 420, height: 800 });
  assert.equal(await badge(page), '', 'app messages never count');
  await page.click('#bellBtn');
  await tab(page, 'app');
  const box = await rect(page, '#bellPanel .nc-chips'), chips = await page.$$eval('#bellPanel .nc-chips button', e => e.map(b => b.getBoundingClientRect().top));
  assert.equal(new Set(chips).size, 1, 'one line');
  assert.ok(await page.$eval('#bellPanel .nc-chips', e => e.scrollWidth > e.clientWidth), 'too wide for it, so it scrolls');
  assert.ok(box.r <= 420);
  assert.equal(await page.textContent('#bellPanel .nc-chips [data-v=updates]'), 'Updates 2', 'the new ones in each (All showed the latest 30)');
  assert.equal((await rows(page)).length, 30);
  assert.equal(await page.textContent('#bellAll'), 'All notifications (40) ›');
});

test('the red number: mentions and spam, everything, or off', async t => {
  const page = await open(t);
  assert.equal(await badge(page), '3');
  await page.evaluate(() => openSettings('notify'));
  await page.click('#ntTabs [data-t=bell]');
  await page.selectOption('#bellCount', 'all');
  assert.equal(await badge(page), '5', 'went live and raids too, never app messages');
  await page.selectOption('#bellCount', 'off');
  assert.equal(await badge(page), '');
  await page.reload();
  assert.equal(await page.evaluate(() => [smvNotes.bellCount, document.querySelector('#bellCount').value].join()), 'off,off', 'remembered');
});

test('Settings > Notifications: Do not disturb, then tabs, with nothing to scroll', async t => {
  const page = await open(t, seed(), {}, { width: 1280, height: 800 });
  await page.evaluate(() => openSettings('notify'));
  const fits = () => page.$eval('#settingsDlg .st-body', b => b.scrollHeight <= b.clientHeight + 1);
  assert.ok(await page.isVisible('#dndOn') && await page.isVisible('#ntGrid'), 'Do not disturb, and Alerts to start with');
  assert.ok(await page.isHidden('#bellCount'));
  assert.ok(await fits(), 'Alerts fits without scrolling');
  await page.click('#ntTabs [data-t=bell]');
  assert.ok(await page.isVisible('#bellCount') && await page.isVisible('#msgPos') && await page.isHidden('#ntGrid'), 'Bell & pop-ups');
  assert.ok(await page.isVisible('#dndOn'), 'Do not disturb stays on every tab');
  assert.ok(await fits());
});

test('Do not disturb from the bell and All notifications: on for the chosen time, and off again', async t => {
  const page = await open(t);
  const state = () => page.evaluate(() => [smvNotes.dndOn(), document.querySelector('#dndOn').checked, document.querySelector('#bellBtn').classList.contains('off'),
    ...[...document.querySelectorAll('.nc-dnd')].map(b => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true')].join());
  await page.evaluate(() => { const f = document.querySelector('#dndFor'); f.value = '60'; f.dispatchEvent(new Event('change')); });   // Settings' "For 1 hour"
  await page.click('#bellBtn');
  assert.match(await page.$eval('#bellPanel .nc-dnd', tip), /^Do not disturb \(for 1 hour\)/, 'says how long');
  await page.click('#bellPanel .nc-dnd');
  assert.equal(await state(), 'true,true,true,true,true', 'on: Settings, the bell and both buttons');
  const left = await page.evaluate(() => smvNotes.dndUntil - Date.now());
  assert.ok(left > 59 * 60e3 && left <= 60 * 60e3, 'for the chosen hour');
  assert.match(await page.textContent('#msg'), /^Do not disturb until /);
  assert.match(await page.$eval('#bellPanel .nc-dnd', tip), /^Do not disturb is on until .*Click to turn it off$/);
  await page.click('#bellAll');
  await page.click('#noteDlg .nc-dnd');
  assert.equal(await state(), 'false,false,false,false,false', 'off from All notifications');
  assert.equal(await page.textContent('#msg'), 'Do not disturb off');
  await page.evaluate(() => { const f = document.querySelector('#dndFor'); f.value = '0'; f.dispatchEvent(new Event('change')); });
  await page.click('#noteDlg .nc-dnd');
  assert.equal(await page.evaluate(() => smvNotes.dndUntil), -1, '"Until I turn it off"');
  assert.match(await page.$eval('#noteDlg .nc-dnd', tip), /until you turn it off/);
  assert.equal(await page.textContent('#msg'), 'Do not disturb on');
});

test('All notifications: search, Unread only, Mark all read, delete, clear a tab, grouped by day; opens on the bell\'s tab', async t => {
  const at = midday();
  const page = await open(t, seed(at), {}, { clock: at });
  await page.evaluate(() => openNoteHistory('all'));
  assert.equal(await page.textContent('#noteDlg .mh-count'), '8 kept · 6 new');
  assert.deepEqual(await page.$$eval('#noteDlg .nc-chips button', e => e.map(b => b.textContent)), ['All 8', 'Mentions 3', 'Mod 1', 'Live 2', 'App 2'], 'the kind chips');
  await page.fill('#nhQ', 'chess');
  assert.deepEqual(await rows(page, '#nhList'), ['l1'], 'titles are searchable');
  await page.fill('#nhQ', 'bravo');
  assert.deepEqual(await rows(page, '#nhList'), ['s1', 'm2'], 'and chats by name');
  await page.fill('#nhQ', '');
  await page.check('#nhUnread');
  assert.deepEqual(await rows(page, '#nhList'), ['m1', 's1', 'l1', 'r1', 'a1', 'm3']);
  await tab(page, 'mentions', '#noteDlg');
  await page.selectOption('#noteDlg .nc-pick', 'alpha');
  assert.deepEqual(await rows(page, '#nhList'), ['m1', 'm3']);
  await page.click('#nhRead');
  assert.match(await page.textContent('#nhList'), /Nothing matches/);
  await tab(page, 'all', '#noteDlg');
  assert.deepEqual(await rows(page, '#nhList'), ['s1', 'l1', 'r1', 'a1'], 'only that tab was marked read');
  await page.uncheck('#nhUnread');
  assert.deepEqual(await page.$$eval('#nhList .mh-day b', e => e.map(d => d.textContent)), ['Today']);
  await page.hover('#nhList .nc-row[data-id=r1]');
  await page.click('#nhList .nc-row[data-id=r1] .mp-x');
  assert.ok(!(await rows(page, '#nhList')).includes('r1'), 'one deleted');
  await tab(page, 'spam', '#noteDlg');
  await page.click('#nhClear');
  await page.click('#askDlg .ask-no');
  assert.deepEqual(await rows(page, '#nhList'), ['s1'], 'Clear asks first');
  await page.click('#nhClear');
  await page.click('#askDlg .ask-yes');
  assert.match(await page.textContent('#nhList'), /Nothing flagged/);
  await tab(page, 'all', '#noteDlg');
  assert.equal((await rows(page, '#nhList')).length, 6, 'only spam was cleared');
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#noteDlg'));
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.notifications'))).length, 6);
  assert.equal(await badge(page), '', 'closing it counts as seeing them all');
  // from the bell: on its tab and sub-filter
  await page.click('#bellBtn');
  await tab(page, 'live'); await chip(page, 'live');
  await page.click('#bellAll');
  assert.ok(await page.isHidden('#bellPanel'));
  assert.equal(await page.textContent('#noteDlg .nc-tabs .on span'), 'Live');
  assert.equal(await page.textContent('#noteDlg .nc-chips .on'), 'Went live 1');
  assert.deepEqual(await rows(page, '#nhList'), ['l1']);
});

test('All notifications: a long list scrolls, and a small day isn\'t squashed to a sliver (#85)', async t => {
  const now = midday(), y = new Date(now - 864e5); y.setHours(23, 0, 0, 0);
  const list = [];
  for (let i = 0; i < 4; i++) list.push({ id: 'a' + i, kind: 'app', subject: 'updates', text: `Note ${i}`, t: now - i * MIN, unread: false });
  for (let i = 0; i < 60; i++) list.push({ id: 'm' + i, kind: 'mention', channel: 'alpha', label: 'alpha', sender: 'ann', body: `@me ${i}`, quoted: '', t: +y - i * MIN, unread: false });
  const page = await open(t, list, {}, { clock: now });
  await page.evaluate(() => openNoteHistory('all'));
  assert.deepEqual(await page.$$eval('#nhList .mh-day b', e => e.map(d => d.textContent)), ['Today', 'Yesterday']);
  const groups = await page.$$eval('#nhList .mh-group', e => e.map(g => [g.clientHeight, g.scrollHeight]));
  for (const [h, full] of groups) assert.ok(h >= full - 1, `each day is as tall as its rows: ${JSON.stringify(groups)}`);
  assert.ok(await page.$eval('#nhList', l => l.scrollHeight > l.clientHeight), 'the list scrolls instead');
  const r = await rect(page, '#nhList .nc-row[data-id=a3]');
  assert.ok(r.h > 30, 'the last of today\'s rows is whole');
});

test('Undo from the bell works while it still can; raids and going live are kept; a pop-up can be turned off per kind', async t => {
  const page = await open(t, []);
  await add(page, 'alpha', 'bravo');
  await page.evaluate(() => smvNotes.removeChannel('alpha'));
  assert.ok(await page.isVisible('#toast'));
  await page.click('#bellBtn'); await tab(page, 'app');
  const undo = page.locator('#bellList .nc-row:has-text("Removed alpha") button:text-is("Undo")');
  await undo.click();
  assert.equal(await page.locator('#stage .win.stream .title:text-is("alpha")').count(), 1, 'Undo brings it back');
  assert.equal(await undo.count(), 0, 'and is used up');
  await page.evaluate(() => smvNotes.removeChannel('bravo'));
  await page.click('#toast button');
  assert.equal(await page.locator('#bellList .nc-row:has-text("Removed bravo") button').count(), 0, 'used from the toast');
  await page.evaluate(() => smvNotes.removeChannel('alpha'));
  await add(page, 'alpha');
  await page.click('#bellBtn'); await tab(page, 'all'); await tab(page, 'app');
  assert.equal(await page.locator('#bellList .nc-row:has-text("Removed alpha") button').count(), 0, 'not once it\'s open again');
  await page.keyboard.press('Escape');

  await page.evaluate(() => followRaid('bravo', 'charlie', true));
  assert.match(await page.textContent('#msg'), /bravo raided charlie: switched to them/);
  await page.evaluate(() => { smvNotes.liveNote('delta', { live: true, name: 'Delta', title: 'Speedruns' }, false); smvNotes.liveNote('delta', null, true); });
  assert.match(await page.textContent('#msg'), /delta just went live on Kick/);
  let live = await page.evaluate(() => smvNotes.notes.filter(n => n.kind === 'live' || n.kind === 'raid').map(n => [n.kind, n.channel, n.label, n.title || '', !!n.auto, n.from || '']));
  assert.deepEqual(live, [['live', 'delta', 'Delta', 'Speedruns', true, ''], ['raid', 'charlie', 'charlie', '', false, 'bravo']], 'opened by itself joins the went-live one');
  await page.click('#bellBtn'); await tab(page, 'live'); await chip(page, 'auto');
  assert.match(await page.textContent('#bellList'), /Deltawent live.*opened by itself/);
  await page.keyboard.press('Escape');

  await page.evaluate(() => { smvNotes.flash(''); openSettings('notify'); });
  await page.uncheck('#ntGrid [data-al="live.popup"]');
  await page.keyboard.press('Escape');
  await page.evaluate(() => smvNotes.liveNote('echo', { live: true }, false));
  assert.equal(await page.textContent('#msg'), '', 'no pop-up');
  assert.equal(await page.evaluate(() => smvNotes.notes[0].channel), 'echo', 'still kept under the bell');
  await page.evaluate(() => smvNotes.flash('Saved layout “Late night”', { subject: 'layouts' }));
  assert.equal(await page.textContent('#msg'), 'Saved layout “Late night”');
  assert.deepEqual(await page.evaluate(() => [smvNotes.notes[0].kind, smvNotes.notes[0].subject, smvNotes.notes[0].unread]), ['app', 'layouts', true]);
  await page.evaluate(() => smvNotes.flash('Nothing to undo'));
  assert.equal(await page.evaluate(() => smvNotes.notes[0].text), 'Saved layout “Late night”', 'messages without a subject are only shown');
});

test('Do not disturb: kept under the bell, but no pop-ups or sounds, until it ends', async t => {
  const page = await open(t, []);
  await page.evaluate(() => {
    window.played = [];
    window.AudioContext = class { constructor(){ this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      createGain(){ return { gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }; }
      createOscillator(){ window.played.push(1); return { type: '', frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, start(){}, stop(){} }; } };
  });
  await page.evaluate(() => openSettings('notify'));
  await page.selectOption('#ntGrid [data-al="live.sound"]', 'ping');
  const played = () => page.evaluate(() => window.played.splice(0).length);
  assert.ok(await played() > 0, 'choosing a sound plays it');
  await page.selectOption('#dndFor', '30');
  await page.check('#dndOn');
  assert.match(await page.textContent('#dndSt'), /On until/);
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => document.querySelector('#bellBtn').classList.contains('off')), 'the bell shows it');
  await page.evaluate(() => { smvNotes.flash(''); smvNotes.liveNote('alpha', { live: true }, false); });
  assert.equal(await page.textContent('#msg'), '', 'no pop-up');
  assert.equal(await played(), 0, 'no sound');
  assert.equal(await page.evaluate(() => smvNotes.notes.length), 1, 'kept');
  await page.evaluate(() => openSettings('notify'));
  await page.evaluate(() => smvNotes.playSound('live', true));
  assert.ok(await played() > 0, 'a sound you play yourself still plays');
  // it ends by itself
  await page.evaluate(() => smvNotes.endDnd());
  assert.equal(await page.isChecked('#dndOn'), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.dnd')), '0');
  await page.selectOption('#dndFor', '0');
  await page.check('#dndOn');
  assert.match(await page.textContent('#dndSt'), /until you turn it off/);
  await page.reload();
  assert.equal(await page.evaluate(() => smvNotes.dndOn()), true, 'remembered');
  await page.evaluate(() => openSettings('notify'));
  assert.equal(await page.inputValue('#dndFor'), '0');
  await page.selectOption('#dndFor', '60');
  assert.ok(await page.evaluate(() => smvNotes.dndUntil > Date.now() + 59 * 60e3), 'a new length starts again from now');
  await page.uncheck('#dndOn');
  await page.selectOption('#dndFor', '120');
  assert.equal(await page.evaluate(() => [smvNotes.dndOn(), localStorage.getItem('kickMultiview.dndFor')].join()), 'false,120', 'picked for next time');
});

test('the grid in Settings > Notifications and the Mentions and Spam alerts pages are the same settings', async t => {
  const page = await open(t, []);
  await page.evaluate(() => openSettings('notify'));
  assert.equal(await page.locator('#ntGrid [data-go]').count(), 0, 'the pages they link to are the desktop app\'s');
  const pageVal = sel => page.$eval(`[data-s=mentions] ${sel}, [data-s=spam] ${sel}`, e => e.type === 'checkbox' ? e.checked : e.value);
  await page.uncheck('#ntGrid [data-al="mention.popup"]');
  await page.selectOption('#ntGrid [data-al="spam.sound"]', 'pop');
  assert.equal(await pageVal('[data-al="mention.popup"]'), false, 'the Mentions page follows');
  assert.equal(await pageVal('[data-al="spam.sound"]'), 'pop', 'and Spam alerts');
  // changed on its own page
  await page.evaluate(() => {
    const set = (sel, v) => { const e = document.querySelector(sel); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('[data-s=mentions] [data-al="mention.popup"]', true);
    set('[data-s=mentions] [data-al="mention.sound"]', 'knock');
  });
  assert.equal(await page.isChecked('#ntGrid [data-al="mention.popup"]'), true);
  assert.equal(await page.inputValue('#ntGrid [data-al="mention.sound"]'), 'knock');
  await page.reload();
  assert.deepEqual(await page.evaluate(() => [smvNotes.alerts.mention.popup, smvNotes.alerts.mention.sound, smvNotes.alerts.spam.sound]), [true, 'knock', 'pop'], 'saved once, for both');
});

test('notifications from before the bell: mentions and spam history move in, once', async t => {
  const page = await openApp(t, { init: `(${() => {
    if (location.pathname.indexOf('/src/index.html') < 0 || sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kickMultiview.mentions', JSON.stringify([{ channel: 'alpha', sender: 'ann', body: '@me hi', kind: 'mention', quoted: '', t: Date.now() - 1000, unread: true }]));
    localStorage.setItem('kickMultiview.spamHistory', JSON.stringify([{ channel: 'alpha', sender: 'bot', body: 'cheap', score: 6, need: 6, signs: [], t: Date.now() - 500 }]));
  }})()` });
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifications')).map(n => [n.kind, n.sender, n.unread]));
  assert.deepEqual(await kept(), [['spam', 'bot', false], ['mention', 'ann', true]]);
  await page.evaluate(() => openSettings('notify'));
  assert.match(await page.$eval('#spamHist', e => e.textContent), /bot6 \/ 6 points/, 'Spam alerts > History (drawn when Settings opens)');
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => localStorage.getItem('kickMultiview.mentions')), 'the old ones stay, for an older version');
  await page.evaluate(() => { localStorage.setItem('kickMultiview.notifications', '[]'); });
  await page.reload();
  assert.deepEqual(await kept(), [], 'only the first time');
  await page.evaluate(() => openSettings('notify'));
  assert.match(await page.$eval('#spamHist', e => e.textContent), /Nothing flagged yet/, 'Spam alerts > History (the desktop app\'s) is the bell\'s spam');
});

for (const bar of [{ pos: 'top' }, { pos: 'left', labels: true }, { pos: 'left', labels: false }]){
  const name = bar.pos === 'top' ? 'at the top' : bar.labels ? 'on the left' : 'on the left, icons only';
  test(`the bell with the toolbar ${name}: the chat filter keeps one small width, however long the names, leaving the chips more room (#100)`, async t => {
    const now = Date.now(), long = 'averyveryverylongchannelname42', list = [];
    for (let i = 0; i < 1050; i++){           // up to four-digit counts (500 of each kind are kept)
      const ch = [long, 'bravo', 'charlie'][i % 3], kind = ['mention', 'reply', 'word'][Math.floor(i / 3) % 3];
      list.push({ id: 'n' + i, kind, ...(kind === 'word' ? { word: 'pear' } : {}), channel: ch, label: ch, sender: 'ann', body: '@me hi pear', quoted: kind === 'reply' ? 'hm?' : '', t: now - i * MIN, unread: false });
    }
    const page = await open(t, list, { 'kickMultiview.toolbar': JSON.stringify(bar) });
    await page.click('#bellBtn');
    assert.equal((await rect(page, '#bellPanel')).w, 490, 'the panel is a little wider');
    const look = () => page.$eval('#bellPanel', p => {
      const pick = p.querySelector('.nc-pick'), chips = p.querySelector('.nc-chips'), r = pick.getBoundingClientRect();
      return { w: Math.round(r.width), room: chips.clientWidth, inside: r.right <= p.getBoundingClientRect().right,
        lines: new Set([...chips.children].map(b => Math.round(b.getBoundingClientRect().top))).size };
    });
    for (const tb of ['all', 'mentions']){
      await tab(page, tb);
      const all = await look();
      assert.equal(all.w, 110, `${tb}: small`);
      assert.ok(all.room >= 340, `${tb}: the chips have ${all.room}px (they had 218px); whether a long count fits depends on the font`);
      assert.ok(all.inside);
      assert.equal(all.lines, 1, `${tb}: the chips stay on one line`);
      await page.selectOption('#bellPanel .nc-pick', long);
      assert.deepEqual(await look(), all, `${tb}: the same with a long name picked`);
      await page.selectOption('#bellPanel .nc-pick', '');
    }
    const cut = await page.$eval('#bellPanel .nc-pick', e => getComputedStyle(e).textOverflow);
    assert.equal(cut, 'ellipsis', 'a long name is cut short with …');
  });
}

test('All notifications: the chat filter is the same width with short or long channel names (#100)', async t => {
  const width = async names => {
    const page = await open(t, names.map((ch, i) => ({ id: 'w' + i, kind: 'mention', channel: ch, label: ch, sender: 'ann', body: '@me hi', quoted: '', t: Date.now() - i * MIN, unread: false })));
    await page.click('#bellBtn');
    await page.click('#bellPanel .mp-all');
    return page.$eval('.menthist .nc-pick', e => Math.round(e.getBoundingClientRect().width));
  };
  assert.equal(await width(['averyveryverylongchannelname42', 'bravo']), await width(['al', 'bo']));
});

test('settings changed in the other window apply here too: Do not disturb, where pop-ups show, alert sounds', async t => {
  const page = await openApp(t);
  // as the other window (the streams window) changes one: saved, and this window told
  const change = (name, value) => page.evaluate(([k, v]) => {
    localStorage.setItem(k, v);
    window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v }));
  }, ['kickMultiview.' + name, value]);
  const until = Date.now() + 60 * MIN;
  await change('dnd', String(until));
  assert.equal(await page.evaluate(() => smvNotes.dndUntil), until);
  assert.equal(await page.evaluate(() => smvNotes.dndOn()), true, 'Do not disturb is on here too');
  await change('msg', JSON.stringify({ pos: 'bl' }));
  assert.equal(await page.getAttribute('#msg', 'data-pos'), 'bl', 'pop-ups show bottom left');
  assert.equal(await page.inputValue('#msgPos'), 'bl');
  await change('alerts', JSON.stringify({ mention: { sound: 'ping', vol: 0.3 } }));
  assert.deepEqual(await page.evaluate(() => [smvNotes.alerts.mention.sound, smvNotes.alerts.mention.vol]), ['ping', 0.3]);
  await change('desktopNotify', '0');                     // (only the desktop app shows desktop notifications)
  await change('dnd', '0');
  assert.equal(await page.evaluate(() => smvNotes.dndOn()), false, 'and off again');
});

test('an abusive message in the bell and in Spam alerts › History says so', async t => {
  const now = Date.now();
  const page = await open(t, [{ id: 'x1', kind: 'spam', abuse: true, channel: 'alpha', label: 'alpha', sender: 'troll', body: 'ur a whore', score: 5, need: 5,
    signs: [{ key: 'insult', text: 'Insult aimed at someone: "ur a whore"', points: 4 }, { key: 'newbie', text: 'Started chatting in the last few minutes', points: 1 }], t: now - MIN, unread: true }]);
  await page.click('#bellBtn');
  await tab(page, 'spam');
  const row = page.locator('#bellList .nc-row[data-id=x1]');
  assert.equal(await row.locator('.mp-kind').textContent(), 'Abusive · 5 / 5');
  await row.locator('.nc-acts button:text-is("Why?")').click();
  assert.equal(await row.locator('.nc-why').textContent(), 'Abusive (5 points, 5 needed):\n• Insult aimed at someone: "ur a whore" (+4)\n• Started chatting in the last few minutes (+1)');
  assert.equal(await row.locator('.nc-acts button:text-is("Not abuse")').count(), 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=spam]').hidden = false; openSettings('spam'); });   // (the desktop app's page)
  await page.click('#spamTabs [data-t=history]');
  assert.equal(await page.textContent('#spamHist .sh-score'), 'Abusive · 5 / 5 points');
});
