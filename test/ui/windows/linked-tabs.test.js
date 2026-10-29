// Linked channels (Settings › Linked channels, issue #202): a streamer's Kick, Twitch and YouTube accounts as one,
// with their windows as one window with a tab per site. Off by default: then everything is as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, press } = require('../app');
const { openApp } = setup();

const now = Date.now();
const LIVE = {
  quietkoala: { live: true, viewers: 1240, title: 'Ranked', category: 'Valorant', checked: now },
  'tw:quietkoala': { live: true, viewers: 640, title: 'Ranked', category: 'VALORANT', checked: now },
  'yt:@quietkoala': { live: false, checked: now },
  novalynx: { live: true, viewers: 312, title: 'cozy', checked: now },
  'tw:novalynx': { live: false, checked: now }
};
const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala'] };
// saved channels, a linked streamer, and the switch (on or off); then who's live
async function linkedApp(t, { on = true, streamers = [STREAMER], saved = ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala', 'novalynx'], extra = {} } = {}){
  const set = { saved: JSON.stringify(saved), intro: JSON.stringify({ done: true, tips: true }), linkedTip: '1', ...(streamers ? { streamers: JSON.stringify(streamers) } : {}), ...(on ? { linkedOn: '1' } : {}), ...extra };
  // (only the first time the page loads: a reload keeps what the test changed)
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v); }` });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  return page;
}
// every window, the tabs you can't see too: kind, channel, its window (frame), whether it's hidden
const all = page => page.evaluate(() => window.openWins().map(w => ({ kind: w.kind, ch: w.channel, frame: w.frame || null, hidden: !!w.hiddenTab, split: !!w.split, sbs: !!w.sbs, muted: w.muted, x: w.x, y: w.y, w: w.w, h: w.h })));
const shown = async (page, kind) => (await all(page)).filter(w => !w.hidden && (!kind || w.kind === kind));
const tabs = (page, kind = 'stream') => page.$$eval(`#stage .win.${kind}:not(.tab-hidden) .ptab`, bs => bs.map(b => b.className.replace(/\s+/g, ' ').trim()));

// what each window's bar shows for its sites: the tabs you can see, and whether the badge on its picture shows
const siteMarks = page => page.$$eval('#stage .win:not(.tab-hidden)', l => l.map(e => {
  const seen = el => !!el && getComputedStyle(el).display !== 'none' && !!el.getClientRects().length;
  return [e.classList.contains('chat') ? 'chat' : 'stream', [...e.querySelectorAll('.bar .ptab')].filter(seen).map(b => b.textContent).join(''), seen(e.querySelector('.bar .bar-av .pi'))];
}));
test('a window with one site, stream or chat, has no tab: the badge on its picture says the site; a linked one has its tabs instead', async t => {
  const page = await linkedApp(t);
  await add(page, 'novalynx');                       // not linked to anything (as a channel a raid opens)
  await page.waitForSelector('#stage .win.chat .bar .bar-av');
  assert.deepEqual(await siteMarks(page), [['stream', '', true], ['chat', '', true]], 'the chat too, though its bar has room for a tab');
  await page.evaluate(() => window.openWins().forEach(w => w.el.querySelector('[data-a=close]')?.click()));
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'both'));
  await page.waitForSelector('#stage .win.chat:not(.tab-hidden) .bar .bar-av');
  assert.deepEqual(await siteMarks(page), [['stream', 'KTY', false], ['chat', 'ALLKTY', false]], 'a linked chat has ALL too (chat/all-chat.js)');
});
test('off by default: one row and one window per account, each window with its own site icon and no suffix or tag', async t => {
  const page = await linkedApp(t, { on: false });
  await page.click('#savedBtn');
  assert.equal(await page.locator('#savedList .sv:not(.sv-acc)').count(), 4, 'every account its own row');
  assert.equal(await page.locator('#savedList .sv-sug').count(), 0, 'no suggestions');
  await page.click('#savedBtn');
  await add(page, 'quietkoala', 'twitch.tv/quietkoala');
  const w = await all(page);
  assert.equal(w.length, 4, 'two streams and two chats');
  assert.ok(w.every(x => !x.frame && !x.hidden), 'no tabs');
  assert.deepEqual(await page.$$eval('#stage .win.stream .ptab', bs => bs.map(b => b.textContent + ':' + b.classList.contains('solo'))), ['K:true', 'T:true']);
  assert.equal(await page.locator('#stage .win .tag').count(), 0, 'no STREAM / CHAT tag');
  assert.deepEqual(await page.$$eval('#stage .win.stream .col-pick option', os => [...new Set(os.map(o => o.textContent))]), ['quietkoala'], 'no "· Twitch" after the name');
  assert.equal(await page.locator('#stage .win [data-a=link]:not([hidden])').count(), 0, 'no Link channels… in ⋯');
  assert.equal(await page.evaluate(() => window.linkedApi.suggestions().length), 0);
});

test('on: one Channels row for the streamer, its accounts under ▾, and the counts are of streamers', async t => {
  const page = await linkedApp(t);
  await page.click('#savedBtn');
  const rows = page.locator('#savedList > .sv');
  assert.equal(await rows.count(), 2, 'quietkoala once, and novalynx');
  const q = page.locator('#savedList .sv-multi');
  assert.deepEqual(await q.locator('.sv-sites .pi').evaluateAll(is => is.map(i => i.textContent + (i.classList.contains('dim') ? '-' : '+'))), ['K+', 'T+', 'Y-']);
  assert.match(await q.locator('.sv-meta').textContent(), /1\.2K.*640/);
  assert.equal(await page.textContent('#openLive'), 'Open 2 live');
  await q.locator('.exp').click();
  assert.equal(await page.locator('#savedList .sv-acc').count(), 3);
  assert.match(await page.locator('#savedList .sv-acc').first().textContent(), /quietkoala.*Main/);
  // search matches any of their accounts
  await page.fill('#savedInput', 'quietkoa');
  assert.equal(await page.locator('#savedList .sv-multi').count(), 1);
});

test('opening them: one stream window and one chat window, a tab per site; switching swaps the sound and the bar', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'both'));
  const w = await all(page);
  assert.equal(w.length, 4, 'Kick and Twitch, each a stream and a chat (YouTube is offline: no window until you open it)');
  assert.equal((await shown(page)).length, 2, 'one window each for streams and chats');
  assert.deepEqual((await shown(page)).map(x => x.ch), ['quietkoala', 'quietkoala'], 'the main account shows');
  const hidden = w.find(x => x.kind === 'stream' && x.hidden), lead = w.find(x => x.kind === 'stream' && !x.hidden);
  assert.deepEqual([hidden.x, hidden.y, hidden.w, hidden.h], [lead.x, lead.y, lead.w, lead.h], 'the hidden tab sits under it, the same size');
  assert.equal(hidden.muted, true, 'and is muted');
  assert.deepEqual(await tabs(page), ['ptab kick on live', 'ptab twitch live', 'ptab youtube off locked']);
  // the bar's buttons are the site's: Twitch's window has no Like (only YouTube's does) — and switching keeps place and sound
  await page.evaluate(() => { const w = window.openWins().find(x => x.kind === 'stream' && !x.hiddenTab); w.muted = false; w.vol = 0.5; });
  await page.click('#stage .win.stream:not(.tab-hidden) .ptab.twitch');
  const after = await all(page), tw = after.find(x => x.kind === 'stream' && x.ch === 'tw:quietkoala'), k = after.find(x => x.kind === 'stream' && x.ch === 'quietkoala');
  assert.equal(tw.hidden, false); assert.equal(k.hidden, true);
  assert.deepEqual([tw.x, tw.y, tw.w, tw.h], [lead.x, lead.y, lead.w, lead.h], 'in the same place');
  assert.equal(tw.muted, false, 'the sound moves to the tab you watch'); assert.equal(k.muted, true);
  assert.equal(after.find(x => x.kind === 'chat' && !x.hidden).ch, 'tw:quietkoala', 'the chat follows the stream\'s tab');
  // ⌥1 goes back (the window you last clicked)
  await page.click('#stage .win.stream:not(.tab-hidden) .bar .grab');
  await press(page, 'Alt+Digit1');
  assert.equal((await shown(page, 'stream'))[0].ch, 'quietkoala');
});

test('an offline site\'s tab can\'t be clicked, dragged out or switched to, and its menu has nothing that loads it', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  const yt = '#stage .win.stream:not(.tab-hidden) .ptab.youtube';
  assert.equal(await page.getAttribute(yt, 'aria-disabled'), 'true');
  assert.match(await page.getAttribute(yt, 'title'), /YouTube · offline\nIt opens here when it goes live\./);
  await page.click(yt, { force: true });   // (Playwright won't click it by itself: it's marked disabled)
  assert.equal((await all(page)).length, 2, 'clicking it opens nothing');
  await page.dragAndDrop(yt, '#stage', { force: true, targetPosition: { x: 400, y: 400 } });
  assert.equal((await all(page)).length, 2, 'nor does dragging it out');
  // ⌥3 does nothing; ⌥→ goes past it
  await page.click('#stage .win.stream:not(.tab-hidden) .bar .grab');
  await press(page, 'Alt+Digit3');
  assert.equal((await shown(page, 'stream'))[0].ch, 'quietkoala');
  await press(page, 'Alt+ArrowRight');
  assert.equal((await shown(page, 'stream'))[0].ch, 'tw:quietkoala');
  await press(page, 'Alt+ArrowRight');
  assert.equal((await shown(page, 'stream'))[0].ch, 'quietkoala', 'round to Kick, past YouTube');
  await page.focus('#stage .win.stream:not(.tab-hidden) .ptab.kick');
  await press(page, 'Alt+ArrowRight');
  assert.equal((await shown(page, 'stream'))[0].ch, 'tw:quietkoala', 'a focused tab: one step, not two');
  await press(page, 'Alt+ArrowLeft');
  assert.equal((await all(page)).length, 2);
  // its menu: no Watch here, own window or side by side
  await page.click(yt, { button: 'right', force: true });
  const text = await page.textContent('#tabMenu');
  assert.match(text, /quietkoala on YouTube · offline/);
  for (const s of ['Watch here', 'Open in its own window', 'side by side']) assert.ok(!text.includes(s), s);
  assert.ok(text.includes('Unlink from quietkoala'));
  await page.keyboard.press('Escape');
});

test('⌥→ (and Tab in a chat) only goes to a site known to be live: not one not checked yet or not found', async t => {
  // novalynx (live) and a Twitch account the live check hasn't answered for yet
  const page = await linkedApp(t, { streamers: [STREAMER, { id: 's2', name: '', main: 'novalynx', accounts: ['novalynx', 'tw:novaquiet'] }], saved: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala', 'novalynx', 'tw:novaquiet'] });
  await page.evaluate(() => window.frames_.openStreamer('novalynx', 'stream', ['novalynx', 'tw:novaquiet']));
  await page.click('#stage .win.stream:not(.tab-hidden) .bar .grab');
  await press(page, 'Alt+ArrowRight');
  assert.equal((await shown(page, 'stream'))[0].ch, 'novalynx', 'Twitch not checked yet: stays on Kick');
  await page.evaluate(() => window.smvNotes.setInfo('tw:novaquiet', { missing: true, checked: Date.now() }));
  await press(page, 'Alt+ArrowLeft');
  assert.equal((await shown(page, 'stream'))[0].ch, 'novalynx', 'Twitch not found: stays on Kick');
  await page.evaluate(() => window.smvNotes.liveStatus({ novalynx: { live: true, checked: Date.now() }, 'tw:novaquiet': { live: true, checked: Date.now() } }));
  await press(page, 'Alt+ArrowRight');
  assert.equal((await shown(page, 'stream'))[0].ch, 'tw:novaquiet', 'live: ⌥→ goes to it');
  // from the one you watch you can always step back, even when it has gone offline since
  await page.evaluate(() => window.smvNotes.liveStatus({ novalynx: { live: true, checked: Date.now() }, 'tw:novaquiet': { live: false, checked: Date.now() } }));
  await press(page, 'Alt+ArrowLeft');
  assert.equal((await shown(page, 'stream'))[0].ch, 'novalynx');
});
test('a tab you aren\'t watching that goes offline is closed (not loaded), and comes back when it\'s live again', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'both'));
  assert.equal((await all(page)).length, 4);
  await page.evaluate(live => window.smvNotes.liveStatus({ ...live, 'tw:quietkoala': { live: false, checked: Date.now() } }), LIVE);
  let w = await all(page);
  assert.deepEqual(w.map(x => x.kind + ' ' + x.ch).sort(), ['chat quietkoala', 'chat tw:quietkoala', 'stream quietkoala'], 'Twitch\'s stream tab is closed; its chat stays (ALL reads it)');
  assert.deepEqual(await tabs(page), ['ptab kick on live', 'ptab twitch off locked', 'ptab youtube off locked'], 'its tab stays, offline');
  assert.deepEqual(await page.$$eval('#stage .win.chat:not(.tab-hidden) .ptabs .ptab:not(.all)', l => l.map(b => b.className.replace(/\s+/g, ' '))), ['ptab kick on live', 'ptab twitch off', 'ptab youtube off locked'], 'the chat\'s Twitch tab can be watched');
  assert.equal(await page.locator('#stage .win.stream .ptab-add').count(), 0, 'not as closed by you (no +)');
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  w = await all(page);
  assert.ok(w.some(x => x.kind === 'stream' && x.ch === 'tw:quietkoala' && x.hidden), 'live again: its tab is back');
});

test('closing one tab leaves the others; + brings it back; the window\'s ✕ closes them all', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  await page.click('#stage .win.stream:not(.tab-hidden) .ptab.twitch', { button: 'middle' });
  let w = await all(page);
  assert.deepEqual(w.map(x => x.ch), ['quietkoala'], 'Twitch\'s tab closed');
  assert.equal(await page.locator('#stage .win.stream .ptab.twitch').count(), 0, 'and isn\'t a tab any more');
  await page.click('#stage .win.stream .ptab-add');
  await page.click('#tabMenu button:has-text("Twitch")');
  w = await all(page);
  assert.equal(w.length, 2); assert.equal(w.find(x => !x.hidden).ch, 'tw:quietkoala', 'back, and shown');
  assert.match(await page.getAttribute('#stage .win.stream:not(.tab-hidden) [data-a=close]', 'title'), /Close quietkoala \(Twitch, Kick\)|Close quietkoala \(Kick, Twitch\)/);
  await page.click('#stage .win.stream:not(.tab-hidden) [data-a=close]');
  assert.equal((await all(page)).length, 0);
});

test('a tab\'s menu (right-click) lists only what applies: no "undefined" or "false" lines', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  await page.click('#stage .win.stream:not(.tab-hidden) .ptab.twitch', { button: 'right' });
  await page.waitForSelector('#tabMenu:not([hidden])');
  const lines = await page.$$eval('#tabMenu > *', es => es.map(e => e.tagName === 'HR' ? '—' : e.textContent.trim()));
  assert.match(lines[0], /quietkoala on Twitch · live/i);
  assert.ok(!lines.some(l => /^(undefined|false|null)$/.test(l)), lines.join(' | '));
  assert.equal(await page.$eval('#tabMenu', m => [...m.childNodes].filter(n => n.nodeType === 3).length), 0, 'no loose text');
  assert.ok(lines.some(l => l.startsWith('Make Twitch the main channel')));
  await page.keyboard.press('Escape');
});

test('a tab out into its own window and Join; chats side by side', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'both'));
  await page.evaluate(() => window.frames_.splitTab(window.openWins().find(w => w.kind === 'chat' && w.channel === 'tw:quietkoala')));
  let chats = (await all(page)).filter(x => x.kind === 'chat');
  assert.deepEqual(chats.map(x => [x.ch, x.hidden, x.split]), [['quietkoala', false, false], ['tw:quietkoala', false, true]], 'two chat windows');
  assert.equal(await page.locator('#stage .win.chat .ptab-join').count(), 1, 'the split one has Join');
  await page.click('#stage .win.chat .ptab-join');
  chats = (await all(page)).filter(x => x.kind === 'chat');
  assert.equal(chats.filter(x => !x.hidden).length, 1, 'one chat window again');
  await page.evaluate(() => window.frames_.setSideBySide(window.openWins().find(w => w.kind === 'chat' && !w.hiddenTab), true));
  const lead = await page.$eval('#stage .win.chat.sbs-lead', e => getComputedStyle(e).getPropertyValue('--sbs-n').trim());
  assert.equal(lead, '2');
  assert.equal(await page.locator('#stage .win.chat.sbs-col').count(), 1, 'the other chat is a column beside it');
  assert.equal(await page.$eval('#stage .win.chat.sbs-col', e => getComputedStyle(e).opacity), '1');
});

test('their tabs are kept when the app starts again', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  await page.click('#stage .win.stream:not(.tab-hidden) .ptab.twitch');
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForTimeout(500);
  const w = await all(page);
  assert.equal(w.length, 2);
  assert.ok(w[0].frame && w[0].frame === w[1].frame, 'one window');
  assert.equal(w.find(x => !x.hidden).ch, 'tw:quietkoala', 'the tab you watched');
});

test('turning it off splits their window into one per site and keeps the streamers; on puts them back together, with Undo', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  await page.evaluate(() => window.linkedApi.setOn(false));
  let w = await all(page);
  assert.ok(w.every(x => !x.frame && !x.hidden), 'every site its own window');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.streamers')).length), 1, 'the streamer is kept');
  await page.evaluate(() => window.linkedApi.setOn(true));
  w = await all(page);
  assert.equal(w.filter(x => !x.hidden).length, 1, 'together again');
  assert.match(await page.textContent('#stage .tab-note'), /quietkoala's Kick and Twitch windows are together now/);
  await page.click('#stage .tab-note button:has-text("Undo")');
  assert.equal((await all(page)).filter(x => !x.hidden).length, 2);
});

test('linking with their windows open puts them together; unlinking one account takes its tab out', async t => {
  const page = await linkedApp(t, { streamers: [] });
  await add(page, 'novalynx');
  await page.evaluate(() => window.openWins());
  await page.click('#savedBtn'); await page.selectOption('#mode', 'stream'); await page.click('#savedBtn');
  await add(page, 'twitch.tv/novalynx');
  assert.equal((await shown(page, 'stream')).length, 2);
  await page.evaluate(() => window.linkedApi.link('novalynx', 'tw:novalynx'));
  assert.equal((await shown(page, 'stream')).length, 1, 'one stream window');
  await page.evaluate(() => window.linkedApi.unlink('tw:novalynx'));
  assert.equal((await shown(page, 'stream')).length, 2, 'apart again');
});

test('raids: a tab you don\'t watch, or while another site is live, is only a note; the last live one is followed, with Back to', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  // the Twitch tab (hidden) raids: nothing moves
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:pixelmoth', true));
  let w = await all(page);
  assert.deepEqual(w.map(x => x.ch).sort(), ['quietkoala', 'tw:quietkoala']);
  // the Kick tab you watch raids while Twitch is live: it switches to Twitch and offers the raid
  await page.evaluate(() => window.followRaid('quietkoala', 'novalynx', true));
  w = await all(page);
  assert.equal(w.find(x => !x.hidden).ch, 'tw:quietkoala');
  assert.match(await page.textContent('#stage .tab-note'), /quietkoala raided novalynx on Kick/);
  // now nobody else is live: Twitch's raid is followed, and Back to rebuilds their window
  await page.evaluate(() => { window.smvNotes.setInfo('quietkoala', { live: false }); window.smvNotes.setInfo('tw:quietkoala', { live: true }); });
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:emberandoak', true));
  w = await all(page);
  assert.deepEqual(w.map(x => x.ch), ['tw:emberandoak'], 'the raided channel took the window');
  await page.click('#stage .tab-note button:has-text("Back to quietkoala")');
  w = await all(page);
  assert.deepEqual(w.map(x => x.ch).sort(), ['quietkoala', 'tw:quietkoala']);
});

test('raids: set to, a tab you don\'t watch that raids opens the raided channel in a window of its own beside them (once)', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  await page.evaluate(() => window.linkedApi.setOpt('raidOther', 'open'));
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:pixelmoth', true));
  const w = await all(page);
  assert.deepEqual(w.filter(x => !x.hidden).map(x => x.kind + ' ' + x.ch).sort(), ['chat tw:pixelmoth', 'stream quietkoala', 'stream tw:pixelmoth'], 'they stay; the raided channel opens beside them (its stream and chat)');
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:pixelmoth', true));
  assert.equal((await all(page)).filter(x => x.ch === 'tw:pixelmoth').length, (w.filter(x => x.ch === 'tw:pixelmoth')).length, 'not twice');
  // the option, in Settings › Linked channels › Live & raids
  await page.evaluate(() => window.openSettings('linked'));
  await page.click('#laTabs [role=tab]:has-text("Live & raids")');
  assert.equal(await page.$eval('[data-lo=raidOther]', e => e.value), 'open');
});

test('another of their accounts going live adds its tab, with one message', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'stream'));
  await page.evaluate(live => window.smvNotes.liveStatus({ ...live, 'yt:@quietkoala': { live: true, viewers: 90, checked: Date.now() } }), LIVE);
  const w = await all(page);
  assert.ok(w.some(x => x.ch === 'yt:@quietkoala' && x.hidden), 'YouTube is a tab now');
  assert.match(await page.textContent('#msg'), /quietkoala is now live on YouTube too/);
});

test('suggestions: the same name on another site, Not the same is never suggested again, and Undo in Settings brings it back', async t => {
  const page = await linkedApp(t, { streamers: [], saved: ['mossbyte', 'yt:@mossbyte'] });
  await page.click('#savedBtn');
  assert.match(await page.textContent('#savedList .sv-sug'), /mossbyte on Kick and on YouTube: the same streamer\?/);
  await page.evaluate(() => window.openSettings('linked', { sub: 'sugs' }));
  assert.doesNotMatch(await page.textContent('#laSugs'), /null|undefined/, 'nothing dismissed yet: no stray text under the list');
  await page.keyboard.press('Escape');
  if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
  await page.click('#savedList .sv-sug button:has-text("Not the same")');
  assert.equal(await page.locator('#savedList .sv-sug').count(), 0);
  await page.evaluate(() => window.openSettings('linked', { sub: 'sugs' }));
  assert.match(await page.textContent('#laSugs'), /Dismissed · 1/);
  await page.click('#laSugs button:has-text("Undo")');
  assert.match(await page.textContent('#laSugs'), /Suggested · 1/);
  await page.click('#laSugs button:has-text("Link")');
  assert.equal(await page.evaluate(() => window.linkedApi.listStreamers().length), 1);
});

test('the Link channels card: their own chat bots, a name on one site each; their own name warns; only in their chats on that site', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => window.openLinkCard('quietkoala'));
  assert.equal(await page.getAttribute('#lcBotIn', 'placeholder'), 'Bot\'s name on Kick', 'their main site first');
  await page.fill('#lcBotIn', '@QuietKoala'); await page.press('#lcBotIn', 'Enter');
  await page.click('#linkDlg .lc-botplat button[data-bp=twitch]');
  assert.equal(await page.getAttribute('#lcBotIn', 'placeholder'), 'Bot\'s name on Twitch');
  await page.fill('#lcBotIn', 'koala_helper'); await page.click('#linkDlg [data-cmd="link.botAdd"]');
  await page.fill('#lcBotIn', 'KOALA_HELPER'); await page.press('#lcBotIn', 'Enter');
  await page.fill('#lcBotIn', ' '); await page.click('#linkDlg [data-cmd="link.botAdd"]');
  assert.match(await page.textContent('#msg'), /Type a chat bot's name/);
  const bots = () => page.evaluate(() => window.linkedApi.listStreamers()[0].bots);
  assert.deepEqual(await bots(), [{ p: 'kick', name: 'QuietKoala' }, { p: 'twitch', name: 'koala_helper' }], 'without the @, and not twice');
  assert.deepEqual(await page.$$eval('#linkDlg .lc-bot', l => l.map(c => c.textContent + (c.classList.contains('lc-own') ? '*' : ''))), ['KQuietKoala*', 'Tkoala_helper']);
  assert.match(await page.textContent('#linkDlg .lc-warn'), /QuietKoala is their own name on Kick: everything they type in Kick chat counts as the bot's\. Their messages on other sites aren't affected\./);
  // only in their chats, on that site, as well as the app's list
  const lists = () => page.evaluate(() => ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala', 'novalynx'].map(ch => [window.linkedApi.streamerBots(ch), window.botsFor('mention', ch).slice(-1)[0], window.botsFor('spam', ch).includes('nightbot')]));
  assert.deepEqual(await lists(), [[['QuietKoala'], 'QuietKoala', true], [['koala_helper'], 'koala_helper', true], [[], 'botrixoficial', true], [[], 'botrixoficial', true]]);
  // removed: no warning
  await page.click('#linkDlg .lc-bot.lc-own button');
  assert.deepEqual(await bots(), [{ p: 'twitch', name: 'koala_helper' }]);
  assert.equal(await page.locator('#linkDlg .lc-warn').count(), 0);
  // the link to the app's list
  await page.click('#linkDlg [data-cmd="link.botsApp"]');
  assert.equal(await page.isVisible('#linkDlg'), false);
  assert.deepEqual(await page.$$eval('[data-s=chat] .st-subpane', e => e.filter(p => !p.hidden).map(p => p.dataset.t)), ['bots']);
  // the last one removed: nothing saved
  await page.evaluate(() => window.openLinkCard('quietkoala'));
  await page.click('#linkDlg .lc-bot button');
  assert.equal(await bots(), undefined);
});
test('Channel settings for a channel on its own: its chat bots, Opens by itself and its ALL tab; what only a linked streamer has, greyed with how to get it; linking it moves its bots to the streamer', async t => {
  const page = await linkedApp(t, { on: false });
  await page.evaluate(() => window.openLinkCard('novalynx'));
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.linkedOn')), null, 'opening it doesn\'t turn Linked channels on: linking does');
  const opts = () => page.$$eval('#linkDlg .lc-opt', l => l.map(o => [o.querySelector('.st-t').firstChild.textContent, o.querySelector('small').textContent, o.querySelector('select').disabled]));
  assert.deepEqual(await opts(), [['Their streams', 'Link another channel to use this', true], ['Opens by itself when live ⚡', 'Going live opens it', false],
    ['ALL tab', 'Its chat in ALL\'s list, with its badges, emotes and filters', false], ['Name shown', 'Link another channel to use this', true]]);
  assert.match(await page.textContent('#linkDlg .lc-head p'), /Its settings, and its other sites to link/);
  assert.deepEqual(await page.$$eval('#linkDlg .lc-sec', l => l.map(e => e.textContent)), ['Channels', 'Add a channel', 'Their chat bots', 'This channel']);
  assert.equal(await page.isDisabled('#linkDlg .lc-unlink'), true, 'Unlink all: greyed');
  // its own chat bot: on its site only (no site to pick), kept with the channel
  assert.equal(await page.locator('#linkDlg .lc-botplat button').count(), 1);
  await page.fill('#lcBotIn', 'lynxbot'); await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => [JSON.parse(localStorage.getItem('kickMultiview.chanOpts')), window.linkedApi.streamerBots('novalynx')]), [{ novalynx: { bots: ['lynxbot'] } }, ['lynxbot']]);
  // Opens by itself, and its ALL tab
  await page.selectOption('#linkDlg [data-cmd="link.autoOpen"]', 'on');
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.autoOpen')))).includes('novalynx'));
  await page.evaluate(() => window.frames_.openStreamer('novalynx', 'chat', ['novalynx']));
  await page.selectOption('#linkDlg [data-cmd="link.allTab"]', 'on');
  assert.deepEqual(await page.evaluate(() => [JSON.parse(localStorage.getItem('kickMultiview.chanOpts')).novalynx.allTab, JSON.parse(localStorage.getItem('kickMultiview.allOpen'))]), [true, ['c:novalynx']]);
  await page.click('#linkDlg [data-cmd="link.done"]');
  await page.waitForSelector('#stage .win.chat:not(.tab-hidden) .all-view');
  assert.deepEqual(await page.$$eval('#stage .win.chat:not(.tab-hidden) .ptab', l => l.map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['ALL*', 'K'], 'ALL, and its site\'s own chat');
  const KF = (id, user, content) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify({ id, content, type: 'message', sender: { id: 1, username: user, identity: {} } }) } } } });
  await page.evaluate(([a, b]) => window.allChat.ingest('novalynx', { s: 'kick', raw: [a, b] }), [KF('n1', 'tide', 'hi lynx'), KF('n2', 'LynxBot', 'follow the socials')]);
  assert.deepEqual(await page.$$eval('#stage .win.chat:not(.tab-hidden) .all-list .al-m', l => l.map(e => e.classList.contains('al-bot') + ' ' + e.querySelector('.al-n').textContent)), ['false tide', 'true LynxBot'], 'its own bot: hidden');
  // linked: its bot goes to the streamer, its ALL on stays on (and shown), as the streamer's
  await page.evaluate(() => { window.linkedApi.setOn(true); window.linkedApi.link('novalynx', 'tw:novalynx'); });
  const st = await page.evaluate(() => { const s = window.linkedApi.listStreamers().find(x => x.accounts.includes('novalynx')); return [s.bots, s.allTab, JSON.parse(localStorage.getItem('kickMultiview.allOpen')).includes(s.id), JSON.parse(localStorage.getItem('kickMultiview.chanOpts'))]; });
  assert.deepEqual(st, [[{ p: 'kick', name: 'lynxbot' }], true, true, {}]);
  assert.equal(await page.$eval('#linkDlg [data-cmd="link.allTab"]', e => e.value), 'on');
  await page.evaluate(() => window.openLinkCard('novalynx'));
  assert.deepEqual((await opts()).map(o => o[2]), [false, false, false, false], 'linked: all of it');
  assert.equal(await page.isDisabled('#linkDlg .lc-unlink'), false);
});

test('a channel with its ALL off, linked: the streamer\'s ALL is As in Settings', async t => {
  const page = await linkedApp(t, { extra: { chanOpts: JSON.stringify({ novalynx: { bots: ['lynxbot'] } }) } });
  await page.evaluate(() => window.linkedApi.link('novalynx', 'tw:novalynx'));
  assert.equal(await page.evaluate(() => window.linkedApi.listStreamers().find(x => x.accounts.includes('novalynx')).allTab), undefined);
  await page.evaluate(() => window.openLinkCard('novalynx'));
  assert.equal(await page.$eval('#linkDlg [data-cmd="link.allTab"]', e => e.value), '', 'As in Settings');
});

test('chat bots: which list mentions and spam alerts use (this list, their own, both for spam alerts)', async t => {
  const page = await linkedApp(t);
  const use = (kind, mode, own) => page.evaluate(([kind, mode, own]) => { const a = window.smvNotes.alerts[kind]; a.botsMode = mode; if (kind === 'spam') a.ignore = own; else a.ownBots = own; return window.botsFor(kind, 'novalynx'); }, [kind, mode, own]);
  assert.ok((await use('mention', 'shared', ['ownbot'])).includes('nightbot'));
  assert.deepEqual(await use('mention', 'own', ['ownbot']), ['ownbot']);
  assert.deepEqual(await use('spam', 'own', ['spambot']), ['spambot']);
  const both = await use('spam', 'both', ['spambot']);
  assert.ok(both.includes('nightbot') && both.includes('spambot'));
  assert.ok((await use('mention', 'both', ['ownbot'])).includes('nightbot'), 'mentions have no "both": the app\'s list');
});
test('the Link channels card: add an account by name, make one main, the streamer\'s choices', async t => {
  const page = await linkedApp(t, { streamers: [], saved: ['novalynx'] });
  await page.evaluate(() => window.openLinkCard('novalynx'));
  await page.click('#linkDlg .lc-plat button[data-p=twitch]');
  await page.fill('#lcIn', 'novalynx');
  await page.click('#linkDlg button:has-text("Link")');
  assert.deepEqual(await page.evaluate(() => window.linkedApi.listStreamers().map(s => s.accounts)), [['novalynx', 'tw:novalynx']]);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.saved')).includes('tw:novalynx')), 'the new account is saved too');
  await page.click('#linkDlg .lc-mk');
  assert.equal(await page.evaluate(() => window.linkedApi.listStreamers()[0].main), 'tw:novalynx');
  await page.selectOption('#linkDlg select[data-cmd="link.streams"]', 'separate');
  assert.equal(await page.evaluate(() => window.linkedApi.listStreamers()[0].streams), 'separate');
  await page.click('#linkDlg button:has-text("Done")');
  assert.equal(await page.isVisible('#linkDlg'), false);
});

test('Settings › Linked channels: off, the page only says what it does; on, its five tabs', async t => {
  const page = await linkedApp(t, { on: false });
  await page.evaluate(() => window.openSettings('linked'));
  assert.equal(await page.isVisible('#laOff'), true); assert.equal(await page.isVisible('#laTabs'), false);
  await page.click('#linkedOnSet');
  assert.equal(await page.isVisible('#laTabs'), true);
  assert.deepEqual(await page.$$eval('#laTabs [role=tab]', bs => bs.map(b => b.textContent.trim().replace(/\s+\d+$/, ''))), ['Tabs', 'Playing', 'Live & raids', 'Suggestions', 'Linked streamers']);
  await page.selectOption('[data-lo=streams]', 'separate');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.linkedOpts')).streams), 'separate');
  // it sits under Accounts, with its own icon
  assert.equal(await page.$eval('.st-rail [data-s=linked]', b => b.previousElementSibling.dataset.s), 'accounts');
});

test('Settings › Windows: names off, Always / Never in ⋯ and the order of the buttons', async t => {
  const page = await linkedApp(t, { on: false });
  await add(page, 'novalynx');
  await page.evaluate(() => window.openSettings('windows'));
  await page.click('#barNameStream');
  assert.equal(await page.locator('#stage .win.stream .bar.nm-off').count(), 1, 'the stream\'s name is off');
  assert.notEqual(await page.$eval('#stage .win.stream .bar.nm-off .col-pick', s => getComputedStyle(s).color), 'rgba(0, 0, 0, 0)', 'its ▾ still shows (drawn in the text\'s colour)');
  // Never in ⋯: Reload, right next to ⋯; then Pop out instead (Reload back to When out of room)
  await page.click('#wbList [data-k=reload] button:has-text("Never in ⋯")');
  const order = () => page.$$eval('#stage .win.stream .btns > button', bs => bs.map(b => b.dataset.a));
  let o = await order();
  assert.equal(o[o.indexOf('more') - 1], 'reload');
  await page.click('#wbList [data-k=pop] button:has-text("Never in ⋯")');
  o = await order();
  assert.equal(o[o.indexOf('more') - 1], 'pop');
  assert.equal(await page.evaluate(() => window.barButtons().never), 'pop', 'only one');
  // Always in ⋯: off the bar, in the ⋯ menu
  await page.click('#wbList [data-k=star] button:has-text("Always in ⋯")');
  assert.equal(await page.$eval('#stage .win.stream [data-a=star]', b => b.classList.contains('ovf')), true);
  await page.click('#wbReset');
  assert.equal(await page.evaluate(() => window.barButtons().never), null);
});

test('Settings › Windows: a button you move glides to its place, lifted, and glows there; the others and the preview\'s buttons glide too; not with reduced motion', async t => {
  const page = await linkedApp(t, { on: false });
  await page.evaluate(() => window.openSettings('windows'));
  const moving = () => page.evaluate(() => ({
    reload: document.querySelector('#wbList [data-k=reload]').getAnimations().length,
    lifted: document.querySelector('#wbList [data-k=reload]').classList.contains('wb-lift'),
    others: [...document.querySelectorAll('#wbList .wb-row:not([data-k=reload])')].filter(r => r.getAnimations().length).map(r => r.dataset.k),
    preview: document.querySelector('#wbPreview [data-k=reload]').getAnimations().length }));
  await page.click('#wbList [data-k=reload] button:has-text("Never in ⋯")');
  const m = await moving();
  assert.ok(m.reload && m.lifted && m.preview, JSON.stringify(m));
  assert.deepEqual(m.others, ['mod', 'pop', 'max'], 'the rows below it move up');
  await page.waitForFunction(() => document.querySelector('#wbList [data-k=reload]').classList.contains('wb-glow'), null, { timeout: 3000 });
  assert.equal(await page.$eval('#wbList .wb-row:last-child', r => r.dataset.k), 'reload', 'at the bottom, next to ⋯');
  assert.equal(await page.$eval('#wbList [data-k=reload]', r => r.classList.contains('wb-lift')), false, 'put down');
  // dragging a row: it lifts too
  await page.locator('#wbList [data-k=max]').dragTo(page.locator('#wbList [data-k=chat]'), { targetPosition: { x: 40, y: 2 } });
  assert.equal(await page.$eval('#wbList .wb-row:first-child', r => r.dataset.k), 'max');
  // reduced motion: it just moves
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#wbList [data-k=pop] button:has-text("Never in ⋯")');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#wbList .wb-row, #wbPreview .wb-b')].some(e => e.getAnimations().length)), false);
  assert.equal(await page.$eval('#wbList .wb-row:last-child', r => r.dataset.k), 'pop');
});

test('the search box: a linked streamer is one result with its sites; "link" finds the linking actions', async t => {
  const page = await linkedApp(t, { saved: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala', 'mossbyte', 'yt:@mossbyte'] });
  await page.keyboard.press('Control+k');
  await page.keyboard.type('quietkoala');
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#palList .pal-row.hero'), /quietkoala.*Watch: Kick \+ Twitch as tabs/);
  assert.equal(await page.locator('#palList .pal-row.hero .pal-sic .pi').count(), 3);
  await page.fill('#palQ', 'link');
  await page.waitForTimeout(300);
  const text = await page.textContent('#palList');
  for (const s of ['Link mossbyte on Kick with @mossbyte on YouTube', 'Link channels…', 'Find streamers on several sites', 'Show linked streamers']) assert.ok(text.includes(s), s);
});

test('Channels: drag one row onto another links them; Later hides a suggestion until the app starts again', async t => {
  const page = await linkedApp(t, { streamers: [], saved: ['mossbyte', 'yt:@mossbyte', 'novalynx', 'tw:pixelmoth'] });
  await page.click('#savedBtn');
  await page.click('#savedList .sv-sug button:has-text("Later")');
  assert.equal(await page.locator('#savedList .sv-sug').count(), 0, 'Later hides it');
  const row = name => page.locator('#savedList > .sv', { has: page.locator(`.nm:text-is("${name}")`) });
  await row('tw:pixelmoth').count();
  await row('pixelmoth').dragTo(row('novalynx'));
  assert.deepEqual(await page.evaluate(() => window.linkedApi.listStreamers().map(s => s.accounts.sort())), [['novalynx', 'tw:pixelmoth']]);
  assert.match(await page.textContent('#msg'), /Linked: novalynx/);
});

test('Channels: an account\'s own row opens that site; the streamer\'s ✕ removes every account', async t => {
  const page = await linkedApp(t, { saved: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala'] });
  await page.click('#savedBtn');
  await page.click('#savedList .sv-multi .exp');
  await page.click('#savedList .sv-acc:has-text("@quietkoala")');
  assert.equal((await shown(page, 'stream'))[0].ch, 'yt:@quietkoala');
  if (!(await page.isVisible('#savedPanel'))) await page.click('#savedBtn');
  await page.evaluate(() => document.querySelector('#savedList .sv-multi .rm').click());
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.saved'))), []);
});

test('went live on two sites: one note under the bell, "is live on Kick and Twitch", with Watch as tabs', async t => {
  const page = await linkedApp(t);
  await page.evaluate(() => { window.smvNotes.liveNote('quietkoala', { viewers: 1240, title: 'Ranked' }); window.smvNotes.liveNote('tw:quietkoala', { viewers: 640 }); });
  const notes = await page.evaluate(() => window.smvNotes.notes.filter(n => n.kind === 'live'));
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0].sites, ['quietkoala', 'tw:quietkoala']);
  await page.click('#bellBtn');
  assert.match(await page.textContent('#bellPanel, .mp-list, body'), /is live on Kick and Twitch/);
  await page.click('button:has-text("Watch as tabs")');
  assert.equal((await shown(page, 'stream')).length, 1);
  assert.equal((await all(page)).filter(w => w.kind === 'stream').length, 2, 'Kick and Twitch as tabs');
});

test('opening by themselves: together as tabs when any account goes live, and not twice', async t => {
  const page = await linkedApp(t, { extra: { autoOpen: '["quietkoala"]' } });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  const w = await all(page);
  assert.equal(w.filter(x => x.kind === 'stream').length, 2, 'Kick and Twitch, one window');
  assert.equal(w.filter(x => x.kind === 'stream' && !x.hidden).length, 1);
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  assert.equal((await all(page)).filter(x => x.kind === 'stream').length, 2, 'not opened again');
});
