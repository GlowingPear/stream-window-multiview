// Settings › Sync, with a stand-in desktop app that records what the page asks of the main process (src/main/sync.js)
// and answers with a status the test sets: each state of the page, the first sync's question, renaming, what
// another computer changed arriving (and Undo), and every synced setting taken while the page is open.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../../app');
const { openApp } = setup();

const NOW = new Date(2026, 10, 4, 14, 5).getTime();   // (local time, as the page shows it)
const HOME = '/Users/someone';
const ICLOUD = HOME + '/Library/Mobile Documents/com~apple~CloudDocs';
// the stand-in desktop app: only sync's calls, so the rest of the page works as in a browser
const fakeApp = (o) => {
  window.calls = [];
  const log = (...a) => window.calls.push(a);
  const S = window.syncNow_ = { on: false, folder: '', dir: '', home: o.HOME, name: 'Studio-MacBook', device: 'me1', what: { channels: true, settings: true, sounds: true },
    error: '', lastSync: 0, computers: [], channels: 2, undo: null, now: o.NOW };
  const ret = () => Promise.resolve(JSON.parse(JSON.stringify(window.syncNow_)));
  let pull = null, push = null;
  window.syncPull = d => pull(d);
  window.syncPush = s => { Object.assign(window.syncNow_, s); push(JSON.parse(JSON.stringify(window.syncNow_))); };
  window.peekAnswer = { ok: true, others: [], channels: 2 };
  window.kmv = {
    syncHello: d => { log('hello', d); return ret(); },
    syncChanged: (k, v) => log('changed', k, v),
    syncStatus: ret,
    syncFolders: () => Promise.resolve([{ id: 'icloud', name: 'iCloud Drive', path: o.ICLOUD }, { id: 'dropbox', name: 'Dropbox', path: o.HOME + '/Dropbox' }]),
    syncPick: () => { log('pick'); return Promise.resolve(o.HOME + '/Sync'); },
    syncPeek: f => { log('peek', f); return Promise.resolve(window.peekAnswer); },
    syncStart: (f, mode) => { log('start', f, mode); Object.assign(S, { on: true, folder: f, dir: f + '/Stream Multiview Sync', lastSync: o.NOW - 120e3,
      computers: [{ device: 'me1', name: S.name, os: 'macOS', app: '0.5.0', at: o.NOW, me: true }] }); return ret().then(s => ({ ok: true, ...s })); },
    syncStop: () => { log('stop'); Object.assign(S, { on: false, computers: [] }); return ret(); },
    syncNow: () => { log('now'); return ret(); },
    syncRename: n => { log('rename', n); S.name = n.trim(); S.computers.forEach(c => { if (c.me) c.name = S.name; }); return ret(); },
    syncForget: d => { log('forget', d); S.computers = S.computers.filter(c => c.device !== d); return ret(); },
    syncWhat: w => { log('what', w); Object.assign(S.what, w); return ret(); },
    syncUndo: () => { log('undo'); S.undo = null; return ret(); },
    onSyncPull: cb => { pull = cb; },
    onSyncStatus: cb => { push = cb; }
  };
};
const ON = {
  on: true, folder: ICLOUD, dir: ICLOUD + '/Stream Multiview Sync', lastSync: NOW - 120e3, channels: 48,
  computers: [
    { device: 'me1', name: 'Studio MacBook', os: 'macOS', app: '0.5.0', at: NOW, me: true },
    { device: 'pc1', name: 'Gaming PC', os: 'Windows', app: '0.5.0', at: NOW - 180e3 },
    { device: 'lx1', name: 'Travel laptop', os: 'Linux', app: '0.4.22', at: NOW - 2 * 86400e3, older: true }],
  undo: { at: NOW - 180e3, from: 'Gaming PC', summary: { added: ['alpha', 'bravo'], removed: [], keys: ['theme'] } }
};

async function openSync(t, { storage = {} } = {}){
  const init = `(${fakeApp})(${JSON.stringify({ HOME, ICLOUD, NOW })});` + Object.entries(storage).map(([k, v]) => `localStorage.setItem('kickMultiview.${k}', ${JSON.stringify(v)});`).join('');
  const page = await openApp(t, { clock: NOW, init: { content: init } });
  await page.waitForFunction(() => window.smvSync && window.smvSync.status);
  return page;
}
const showPage = async page => {
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=sync]').hidden = false; openSettings('sync'); });   // (the desktop app's page)
  await page.waitForSelector('#syncFound .st-row');
};
const calls = (page, name) => page.evaluate(n => window.calls.filter(c => c[0] === n).map(c => c.slice(1)), name);
const text = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim());
const shown = (page, sel) => page.$eval(sel, e => !!e.offsetParent);
// each computer's row: its name, tag, second line and time (or button), with ' · ' between
const computers = page => page.$$eval('#syncComputers .sy-cr', rows => rows.map(r => [r.querySelector('.sy-t').firstChild.textContent, r.querySelector('.sy-tag')?.textContent,
  r.querySelector('.sy-t small').textContent, r.querySelector('.sy-when, .btn')?.textContent].filter(Boolean).join(' | ')));

test('every synced setting is taken while the page is open, and the page sends its values at start', async t => {
  const page = await openSync(t, { storage: { theme: '{"name":"Pear"}' } });
  assert.deepEqual(await page.evaluate(() => window.smvSync.unheard()), [], 'each needs a settings.onChange handler');
  const [[hello]] = await calls(page, 'hello');
  assert.equal(hello.values.theme, '{"name":"Pear"}');
  assert.ok('saved' in hello.values && !('v1' in hello.values), 'synced keys only');
  assert.equal(hello.versions.theme, 1);
  await page.evaluate(() => { localStorage.clear(); });
  await page.click('#settingsBtn'); await page.click('.st-rail [data-s=general]');
  await page.click('label:has(#snap)');
  assert.deepEqual((await calls(page, 'changed')).map(c => c[0]), ['snap'], 'a synced change goes to the main process; settingsTab does not');
});

test('sync is off: the folders already synced first, then any folder; the name; Use this turns it on', async t => {
  const page = await openSync(t);
  const badge = () => page.$eval('.st-rail [data-s=sync] .st-new', e => !e.hidden);
  assert.equal(await badge(), true, 'New, until it\'s opened');
  await showPage(page);
  assert.equal(await badge(), false);
  assert.equal(await text(page, '#syncCard .sy-title'), 'Turn on sync');
  assert.equal(await text(page, '#syncCard .ca-chip'), 'Off');
  assert.deepEqual(await page.$$eval('#syncFound .st-row', rows => rows.map(r => [r.querySelector('.st-t').textContent, r.querySelector('button').className])),
    [['iCloud Drive~/Library/Mobile Documents/com~apple~CloudDocs', 'btn primary'], ['Dropbox~/Dropbox', 'btn']]);
  assert.equal(await page.inputValue('#syncNameIn'), 'Studio-MacBook');
  for (const sel of ['#syncComputers', '#syncUndoRow', '#syncStop']) assert.equal(await shown(page, sel), false, sel + ' only while syncing');
  await page.fill('#syncNameIn', 'Stream desk Mac');
  await page.click('#syncFound .st-row button');
  await page.waitForSelector('#syncComputers .sy-cr');
  assert.deepEqual(await calls(page, 'rename'), [['Stream desk Mac']], 'the name, before it starts');
  assert.deepEqual(await calls(page, 'start'), [[ICLOUD, 'combine']], 'nobody there yet: no question');
  assert.equal(await text(page, '#syncCard .sy-title'), 'Syncing through a folder');
  assert.equal(await text(page, '#syncCard .sy-sum'), 'iCloud Drive › Stream Multiview Sync');
  await page.click('#syncChange');
  await page.waitForFunction(() => window.calls.filter(c => c[0] === 'start').length === 2);
  assert.deepEqual((await calls(page, 'start'))[1], [HOME + '/Sync', 'combine'], 'Change… picks another folder');
});

test('syncing: up to date, the computers (this one, an older version), what syncs, Undo and Stop syncing', async t => {
  const page = await openSync(t);
  await showPage(page);
  await page.evaluate(s => window.syncPush(s), ON);
  assert.equal(await text(page, '#syncCard .ca-chip'), 'Syncing');
  assert.equal(await page.getAttribute('#syncCard .sy-sum', 'title'), '~/Library/Mobile Documents/com~apple~CloudDocs/Stream Multiview Sync', 'the path on hover');
  assert.equal(await text(page, '#syncCard .sy-sum'), 'iCloud Drive › Stream Multiview Sync');
  assert.equal(await text(page, '#syncCard .sy-foot .ca-line'), 'Up to date Last synced 2 minutes ago · 48 channels · 3 computers');
  assert.deepEqual(await computers(page), ['Studio MacBook | This computer | macOS · v0.5.0 | Just now', 'Gaming PC | Windows · v0.5.0 | 3 min ago',
    'Travel laptop | Older version | Linux · v0.4.22 · a few settings reach it once it updates | 2 days ago']);
  assert.equal(await text(page, '#syncUndoRow small'), 'Today at 14:02, from Gaming PC: 2 channels added, the theme changed.');
  await page.click('#syncSounds');
  assert.deepEqual(await calls(page, 'what'), [[{ sounds: false }]]);
  await page.click('#syncStaysBtn');
  assert.equal(await shown(page, '#syncStays'), true);
  await page.click('#syncUndo');
  await page.waitForFunction(() => !document.querySelector('#syncUndoRow').offsetParent);
  assert.deepEqual(await calls(page, 'undo'), [[]]);
  await page.click('#syncComputers .sy-cr[data-device=pc1] .sy-x');
  await page.click('#askDlg .ask-yes');
  await page.waitForFunction(() => document.querySelectorAll('#syncComputers .sy-cr').length === 2);
  assert.deepEqual(await calls(page, 'forget'), [['pc1']]);
  await page.click('#syncStop');
  assert.match(await text(page, '#askTitle'), /Stop syncing/);
  await page.click('#askDlg .ask-yes');
  await page.waitForFunction(() => document.querySelector('#syncCard .sy-title').textContent === 'Turn on sync');
  assert.deepEqual(await calls(page, 'stop'), [[]]);
});

test("something needs you: the folder can't be reached, and another computer writes a newer sync file", async t => {
  const page = await openSync(t);
  await showPage(page);
  const dbx = HOME + '/Dropbox';
  await page.evaluate(s => window.syncPush(s), { ...ON, folder: dbx, dir: dbx + '/Stream Multiview Sync', error: 'missing', lastSync: NOW - 16 * 3600e3 + 35 * 60e3, undo: null,
    computers: [ON.computers[0], { device: 'of1', name: 'Office PC', os: 'Windows', app: '0.6.0', at: NOW - 3600e3, newer: true }] });
  assert.equal(await text(page, '#syncCard .ca-chip'), 'Folder not found');
  assert.match(await page.getAttribute('#syncCard .ca-chip', 'class'), /bad/);
  assert.equal(await text(page, '#syncCard .sy-foot .ca-line'), "Can't reach the folder Is Dropbox running? Your changes wait here and sync once it's back. Last synced yesterday at 22:40.");
  assert.equal(await shown(page, '#syncRetry'), true);
  assert.equal(await shown(page, '#syncNow'), false);
  assert.deepEqual((await computers(page))[1], 'Office PC | Newer version | Windows · v0.6.0 · writes a newer sync file: update Multiview here to sync with it | Check for updates');
  assert.equal(await shown(page, '#syncChannels'), true, 'what syncs stays');
  await page.click('#syncRetry');
  assert.deepEqual(await calls(page, 'now'), [[]]);
  await page.click('#syncComputers .sy-cr.newer .btn');
  await page.waitForSelector('.st-pane[data-s=updates]:not([hidden])');
});

test('the first sync, when the folder has another computer\'s file: combine, theirs or this computer\'s, or cancel', async t => {
  const page = await openSync(t);
  await showPage(page);
  await page.evaluate(now => { window.peekAnswer = { ok: true, channels: 48, others: [{ device: 'pc1', name: 'Gaming PC', os: 'Windows', at: now - 180e3, channels: 52 }] }; }, NOW);
  await page.click('#syncFound .st-row:nth-child(2) button');
  await page.waitForSelector('#askDlg:not([hidden]) .ask-opt');
  assert.equal(await text(page, '#askTitle'), "This folder already has another computer's settings");
  assert.equal(await text(page, '#askMsg'), 'Gaming PC synced here 3 min ago: 52 saved channels and its settings. This computer has 48 channels.');
  assert.equal(await page.$eval('#askMsg b', b => b.textContent), 'Gaming PC');
  assert.deepEqual(await page.$$eval('#askDlg .ask-opt', o => o.map(b => [b.querySelector('b').textContent, b.getAttribute('aria-checked')])),
    [['Combine themRECOMMENDED', 'true'], ["Use Gaming PC's", 'false'], ["Use this computer's", 'false']]);
  assert.equal(await text(page, '#askDlg .ask-note'), "A backup of this computer's channels and settings is kept either way.");
  await page.click('#askDlg .ask-no');
  await page.waitForSelector('#askDlg', { state: 'hidden' });
  assert.deepEqual(await calls(page, 'start'), [], 'cancelled: not started');
  await page.click('#syncFound .st-row:nth-child(2) button');
  await page.waitForSelector('#askDlg:not([hidden]) .ask-opt');
  await page.focus('#askDlg .ask-opt.on');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.$eval('#askDlg .ask-opt.on b', b => b.textContent), "Use Gaming PC's", 'the arrows pick');
  await page.click('#askDlg .ask-yes');
  await page.waitForFunction(() => window.calls.some(c => c[0] === 'start'));
  assert.deepEqual(await calls(page, 'start'), [[HOME + '/Dropbox', 'theirs']]);
  // several computers already there
  await page.evaluate(() => window.kmv.syncStop());
  await page.evaluate(now => { window.syncPush({ on: false }); window.peekAnswer = { ok: true, channels: 3, others: [
    { device: 'pc1', name: 'Gaming PC', at: now - 30e3, channels: 1 }, { device: 'lx1', name: 'Travel laptop', at: now - 86400e3, channels: 9 }] }; }, NOW);
  await page.click('#syncFound .st-row:nth-child(1) button');
  await page.waitForSelector('#askDlg:not([hidden]) .ask-opt');
  assert.equal(await text(page, '#askTitle'), "This folder already has other computers' settings");
  assert.equal(await text(page, '#askMsg'), 'Gaming PC synced here just now: 1 saved channel and its settings, and 1 other computer with theirs. This computer has 3 channels.');
  assert.equal(await page.$eval('#askDlg .ask-opt:nth-child(2) b', b => b.textContent), 'Use theirs');
  await page.keyboard.press('Escape');
});

test('renaming this computer: the pencil, Enter saves, Esc puts the old name back', async t => {
  const page = await openSync(t);
  await showPage(page);
  await page.evaluate(s => window.syncPush(s), ON);
  await page.click('#syncComputers .sy-pen');
  await page.waitForSelector('#syncComputers .sy-edit input');
  assert.equal(await page.inputValue('#syncComputers .sy-edit input'), 'Studio-MacBook');
  assert.match(await text(page, '#syncComputers .sy-hint'), /^Enter saves, Esc cancels\. Your other computers see it the next time they sync\.$/);
  await page.fill('#syncComputers .sy-edit input', 'Stream desk Mac');
  await page.keyboard.press('Escape');
  assert.deepEqual(await calls(page, 'rename'), []);
  assert.equal(await page.isVisible('#settingsDlg'), true, 'Esc only stops renaming');
  await page.click('#syncComputers .sy-pen');
  await page.fill('#syncComputers .sy-edit input', 'Stream desk Mac');
  await page.evaluate(() => window.syncPush({ lastSync: Date.now() }));      // a status arriving while you type
  assert.equal(await page.inputValue('#syncComputers .sy-edit input'), 'Stream desk Mac', 'what you typed stays');
  await page.focus('#syncComputers .sy-edit input');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#syncComputers .sy-pen');
  assert.deepEqual(await calls(page, 'rename'), [['Stream desk Mac']]);
  assert.match((await computers(page))[0], /^Stream desk Mac \| This computer/);
});

test('a change from another computer: taken straight away, a message with Undo, and kept under the bell', async t => {
  const page = await openSync(t, { storage: { saved: '["alpha"]' } });
  await page.evaluate(s => window.syncPush(s), ON);
  await page.evaluate(() => window.syncPull({ values: { saved: '["alpha","bravo","charlie"]', snap: '1', theme: null }, versions: { snap: 1 }, from: 'Gaming PC',
    summary: { added: ['bravo', 'charlie'], removed: [], keys: ['snap', 'theme'] } }));
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.saved')), '["alpha","bravo","charlie"]');
  assert.equal(await page.evaluate(() => document.querySelector('#snap').checked), true, 'the switch shows it');
  assert.equal(await text(page, '#msg'), 'Synced from Gaming PC 2 channels added · the theme changed · 1 setting changed Undo');
  assert.equal(await page.$eval('#msg b', b => b.textContent), 'Gaming PC');
  assert.deepEqual(await calls(page, 'changed'), [], 'not sent back');
  const note = await page.evaluate(() => window.smvNotes.notes.find(n => n.subject === 'sync'));
  assert.equal(note.text, 'Synced from Gaming PC');
  assert.deepEqual(note.act, { t: 'undo' });
  await page.click('#msg .btn');
  assert.deepEqual(await calls(page, 'undo'), [[]]);
  await page.evaluate(() => window.syncPull({ values: { saved: '["alpha"]' }, undo: true }));
  assert.match(await text(page, '#msg'), /The last sync is undone/);
  // a value from a newer version of a setting isn't used
  await page.evaluate(() => window.syncPull({ values: { snap: '0' }, versions: { snap: 9 }, from: 'Office PC', summary: { keys: ['snap'] } }));
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.snap')), '1');
});

test('what a sync changed, in words; times', async t => {
  const page = await openSync(t);
  const r = await page.evaluate(now => {
    const s = window.smvSync;
    return [s.describe({ added: ['a'], removed: ['b', 'c'], changed: ['d'], keys: ['mentWords', 'alertSound.mention', 'snap', 'snap2'] }), s.describe(null),
      s.ago(now - 30e3), s.ago(now - 5 * 60e3, true), s.ago(now - 3 * 3600e3), s.ago(now - 86400e3), s.ago(0), s.when(now - 9 * 86400e3)];
  }, NOW);
  assert.deepEqual(r, [['1 channel added', '2 channels removed', '1 channel changed', 'your mention words changed', '1 alert sound changed', '2 settings changed'], [],
    'Just now', '5 minutes ago', '3 hours ago', 'Yesterday', 'Not yet', 'on 26 Oct at 14:05']);
});

test("another computer's toolbar, emote and General choices show straight away (and the same value again changes nothing)", async t => {
  const page = await openSync(t);
  const pull = values => page.evaluate(v => window.syncPull({ values: v, from: 'Gaming PC', summary: { keys: Object.keys(v) } }), values);
  const state = () => page.evaluate(() => ({ left: document.body.classList.contains('bar-left'), emote: document.querySelector('#emoteSet').checked,
    fresh: document.querySelector('#newEmoteSet').checked, muted: document.querySelector('#muted').checked, snap: document.querySelector('#snap').checked }));
  const muted = await page.evaluate(() => document.querySelector('#muted').defaultChecked);
  await pull({ toolbar: JSON.stringify({ pos: 'left', labels: true }), emotePreview: '1', newEmotes: '1', startMuted: '0', snap: '1' });
  assert.deepEqual(await state(), { left: true, emote: true, fresh: true, muted: false, snap: true });
  await pull({ toolbar: JSON.stringify({ pos: 'left', labels: true }), emotePreview: '1', newEmotes: '1' });
  assert.deepEqual(await state(), { left: true, emote: true, fresh: true, muted: false, snap: true }, 'the same again: nothing moves');
  await pull({ toolbar: 'not json', emotePreview: '0', newEmotes: '0', startMuted: null });
  assert.deepEqual(await state(), { left: false, emote: false, fresh: false, muted, snap: true }, 'a damaged value: the toolbar on top; a removed one: its default');
});

test("your changes haven't reached the other computers: each one waiting, and the status line when none has them", async t => {
  const page = await openSync(t);
  await showPage(page);
  const at = NOW - 10 * 60e3;
  const comps = (b1, b2) => [ON.computers[0], { ...ON.computers[1], ...(b1 ? { behind: at } : {}) }, { ...ON.computers[2], ...(b2 ? { behind: at } : {}) }];
  const time = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  await page.evaluate(s => window.syncPush(s), { ...ON, computers: comps(true, false) });
  assert.equal((await computers(page))[1], `Gaming PC | Waiting | Windows · v0.5.0 · hasn't got this computer's changes from ${time} yet | 3 min ago`);
  assert.equal(await text(page, '#syncCard .sy-foot .ca-line b'), 'Up to date', 'one of them: only its row');
  await page.evaluate(s => window.syncPush(s), { ...ON, computers: comps(true, true), behind: at });
  assert.match(await page.getAttribute('#syncCard .sy-foot', 'class'), /\bwait\b/);
  assert.equal(await text(page, '#syncCard .sy-foot .ca-line'), `Waiting for your other computers They haven't got this computer's changes from ${time}. If they're on, check iCloud Drive is syncing here (restarting it can help).`);
  await page.evaluate(s => window.syncPush(s), { ...ON, computers: [ON.computers[0], { ...ON.computers[1], behind: at }], behind: at });
  assert.match(await text(page, '#syncCard .sy-foot .ca-sub'), /^Gaming PC hasn't got this computer's changes from .* If it's on,/);
  await page.evaluate(() => window.syncPush({ behind: undefined, computers: [] }));
});
