// Shoutouts (chat/shoutout.js, issue #300): off by default; in ALL a button on each line, a raid's button, the line's
// menu, the ✓ SO tag and asking before a second one soon; a run of recent chatters; Settings › Shoutouts.
// Sending is the stand-in ALL's tests use (window.allChat.sender.send). The names are made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const now = Date.now();
const LIVE = { quietkoala: { live: true, checked: now }, 'tw:quietkoala': { live: true, checked: now }, 'yt:@quietkoala': { live: false, checked: now } };
const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala'] };
async function allApp(t, extra = {}){
  const set = { saved: JSON.stringify(STREAMER.accounts), intro: JSON.stringify({ done: true, tips: true }), linkedTip: '1', linkedOn: '1', streamers: JSON.stringify([STREAMER]),
    myName: 'mekick', myTwitch: 'metwitch', allOpen: '["s1"]', shoutModOnly: '0', ...extra };   // (only where you're a mod: its own test)
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) if (v !== null) localStorage.setItem('kickMultiview.' + k, v); }` });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala']));
  await page.waitForSelector('.all-view');
  // both chats loaded (so ALL can send on them), sending recorded
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push([m.channel, text]); return (window.__answers && window.__answers.shift()) || 'sent'; }; }, LIVE);
  return page;
}
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;
const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
const feed = (page, ch, batch) => page.evaluate(([ch, b]) => window.allChat.ingest(ch, b), [ch, batch]);
const kick = (id, who, content, slug = who.toLowerCase()) => KF('ChatMessageEvent', { id, content, type: 'message', created_at: new Date().toISOString(), sender: { id: id.length, username: who, slug, identity: {} } });
const twitch = (id, who, text) => TW({ 'display-name': who, id, 'tmi-sent-ts': String(Date.now()) }, `:${who.toLowerCase()}!x@x PRIVMSG #quietkoala :${text}`);
async function chat(page){
  await feed(page, 'quietkoala', { s: 'kick', raw: [kick('k1', 'Driftwood_7', 'that boss fight was unreal'), kick('k2', 'mekick', 'thanks all')] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [twitch('t1', 'Tinroof', 'gg everyone')] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('StreamHostedEvent', { user: { username: 'MapleMoth', slug: 'maplemoth' }, message: { numberOfViewers: 23 } })] });
}
const line = (page, text) => page.locator(`.all-list .al-m:has-text("${text}")`).last();
const sends = page => page.evaluate(() => window.__sends);
const flashed = (page, re) => page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), re.source);

test('off by default: no buttons, menu items, raid button or ⋯ item anywhere, and nothing in the search box', async t => {
  const page = await allApp(t);
  await chat(page);
  await line(page, 'boss fight').hover();
  assert.equal(await page.locator('.all-list .al-so-b').count(), 0);
  assert.equal(await page.locator('.all-list .al-so').count(), 0, 'a raid: no Shout out');
  await line(page, 'boss fight').click({ button: 'right' });
  assert.ok(!(await page.textContent('.all-lm')).includes('Shout out'));
  assert.equal(await page.locator('#stage .win.chat:not(.tab-hidden) [data-a=shout]').evaluate(b => b.hidden), true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.palette.open()); await page.keyboard.type('shout out');
  await page.waitForTimeout(200);
  assert.ok(!(await page.evaluate(() => window.palette.rows())).some(r => r.group === 'Shoutouts'), 'its Settings options only');
});

test('on: the hover bar\'s Shout out sends at once in the chat the line came from; then ✓ SO, and asking before another soon', async t => {
  const page = await allApp(t, { shoutOn: '1' });
  await chat(page);
  await line(page, 'boss fight').hover();
  const b = line(page, 'boss fight').locator('.al-so-b');
  assert.equal(await b.getAttribute('title'), 'Shout out Driftwood_7 on Kick');
  assert.equal(await line(page, 'thanks all').locator('.al-so-b').count(), 0, 'not on your own lines');
  await b.click();
  await flashed(page, /Shouted out Driftwood_7 in Kick chat/);
  assert.deepEqual(await sends(page), [['quietkoala', 'Go check out Driftwood_7! → https://kick.com/driftwood_7']], 'no game known: the [ ] part left out; a full link');
  assert.match(await line(page, 'boss fight').locator('.al-tag-so').getAttribute('title'), /You shouted them out just now/);
  // again soon: asked first (Cancel: nothing sent; Shout out again: sent)
  await line(page, 'boss fight').hover(); await line(page, 'boss fight').locator('.al-so-b').click();
  await page.waitForSelector('#askDlg:not([hidden])');
  assert.equal(await page.textContent('#askTitle'), 'Shout out Driftwood_7 again?');
  await page.click('#askDlg .ask-no');
  await page.waitForTimeout(100);
  assert.equal((await sends(page)).length, 1);
  await line(page, 'boss fight').hover(); await line(page, 'boss fight').locator('.al-so-b').click();
  await page.click('#askDlg .ask-yes');
  await page.waitForFunction(() => window.__sends.length === 2);
  // a site's chat that doesn't send it: says why, no tag change
  await page.evaluate(() => { window.__answers = ['no-box']; });
  await line(page, 'gg everyone').hover(); await line(page, 'gg everyone').locator('.al-so-b').click();
  await flashed(page, /Not sent: Sign in to Twitch to chat there/);
  assert.equal(await line(page, 'gg everyone').locator('.al-tag-so').count(), 0);
});

test('on: a raid\'s line has Shout out, then ✓ Shouted out; a Kick name is looked up (- for _ when Kick says so), and nothing goes without it', async t => {
  const page = await allApp(t, { shoutOn: '1', shoutText: 'Hi {name}[, last seen playing {game}]: {link}' });
  await chat(page);
  const raid = page.locator('.all-list .al-ev:has-text("raided")');
  assert.equal(await raid.locator('.al-so').textContent(), 'Shout out');
  await raid.locator('.al-so').click();
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await sends(page), [['quietkoala', 'Hi MapleMoth: https://kick.com/maplemoth']]);
  assert.match(await raid.textContent(), /Shouted out/);
  assert.equal(await raid.locator('button.al-so').count(), 0);
  // a raider whose address Kick didn't send: looked up (no lookups here: not sent)
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('StreamHostedEvent', { user: { username: 'Nova_Lynx' }, message: { numberOfViewers: 3 } })] });
  await page.locator('.all-list .al-ev:has-text("Nova_Lynx") .al-so').click();
  await flashed(page, /Couldn't find Nova_Lynx's Kick channel/);
  assert.equal((await sends(page)).length, 1);
  // with Kick's answers: nova_lynx isn't there, nova-lynx is; its recent category is the game
  await page.evaluate(() => { window.__asked = []; window.kmv = { profileGet: async ch => { window.__asked.push(ch); return ch === 'nova-lynx' ? { ch, site: { recent: ['Tidepool'], vodCount: 0 } } : { ch, missing: true }; } }; });
  await page.locator('.all-list .al-ev:has-text("Nova_Lynx") .al-so').click();
  await page.waitForFunction(() => window.__sends.length === 2);
  assert.deepEqual((await sends(page))[1], ['quietkoala', 'Hi Nova_Lynx, last seen playing Tidepool: https://kick.com/nova-lynx']);
  assert.deepEqual(await page.evaluate(() => window.__asked), ['nova_lynx', 'nova-lynx']);
  assert.deepEqual(await page.evaluate(() => window.shoutouts.known()['kick:nova_lynx'].login), 'nova-lynx', 'remembered');
  // no answer at all (the lookup failed): nothing concluded, nothing sent
  await page.evaluate(() => { window.kmv = { profileGet: async () => ({ failed: true }) }; });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('StreamHostedEvent', { user: { username: 'Quill_Fern' }, message: { numberOfViewers: 2 } })] });
  await page.locator('.all-list .al-ev:has-text("Quill_Fern") .al-so').click();
  await flashed(page, /Couldn't find Quill_Fern's Kick channel/);
  assert.equal(await page.evaluate(() => window.shoutouts.known()['kick:quill_fern']), undefined);
  await page.evaluate(() => { delete window.kmv; });
});

test('on: the line\'s menu has Shout out, a submenu with in its chat and in every chat; People rows and Twitch\'s own /shoutout (a mod, switched on)', async t => {
  const page = await allApp(t, { shoutOn: '1', shoutTwitch: '1', shoutPeople: JSON.stringify([{ site: 'twitch', login: 'tinroof', name: 'Tinroof', msg: 'Captain {name}! {link}' }]) });
  await page.evaluate(() => window.allChat.modKnown.set('tw:quietkoala', true));
  await chat(page);
  await line(page, 'gg everyone').click({ button: 'right' });
  const items = await page.$$eval('.all-lm:not(.all-lm-sub) .all-li', l => l.map(b => b.textContent));
  assert.ok(items.includes('Shout out Tinroof›'), items.join(' | '));
  await page.hover('.all-lm .all-lh'); await page.hover('.all-lm [data-sub="all.menuShout"]');
  assert.deepEqual(await page.$$eval('.all-lm-sub .all-li', l => l.map(b => b.textContent)), ['In Twitch chat', 'In every chatKickTwitch']);
  await page.click('.all-lm-sub [data-cmd="all.menuShoutout"]');
  await page.waitForFunction(() => window.__sends.length === 2, null, { timeout: 5000 });
  assert.deepEqual(await sends(page), [['tw:quietkoala', 'Captain Tinroof! https://twitch.tv/tinroof'], ['tw:quietkoala', '/shoutout tinroof']], 'their row\'s message; then Twitch\'s own');
  // every chat: once in each, and Twitch's own isn't for someone without a Twitch channel
  await page.evaluate(() => { window.__sends = []; });
  await line(page, 'boss fight').click({ button: 'right' });
  await page.hover('.all-lm .all-lh'); await page.hover('.all-lm [data-sub="all.menuShout"]'); await page.click('.all-lm-sub [data-cmd="all.menuShoutoutAll"]');
  await page.waitForFunction(() => window.__sends.length === 2);
  await page.waitForTimeout(1500);
  assert.deepEqual(await sends(page), [['quietkoala', 'Go check out Driftwood_7! → https://kick.com/driftwood_7'], ['tw:quietkoala', 'Go check out Driftwood_7! → https://kick.com/driftwood_7']]);
});

test('Send straight away off: the shoutout goes in ALL\'s box on its site, for you to send; nothing is sent (Twitch\'s own neither)', async t => {
  const page = await allApp(t, { shoutOn: '1', shoutSend: '0', shoutTwitch: '1' });
  await page.evaluate(() => window.allChat.modKnown.set('tw:quietkoala', true));
  await chat(page);
  await line(page, 'gg everyone').hover(); await line(page, 'gg everyone').locator('.al-so-b').click();
  await flashed(page, /Shoutout for Tinroof is in the chat box: press Enter to send it/);
  assert.equal(await page.evaluate(() => document.querySelector('.all-in').value), 'Go check out Tinroof! → https://twitch.tv/tinroof');
  assert.equal(await page.textContent('.all-pick .pi'), 'T', 'on Twitch, where they chatted');
  await page.waitForTimeout(1500);
  assert.deepEqual(await sends(page), [], 'not sent, and no /shoutout');
  assert.equal(await line(page, 'gg everyone').locator('.al-tag-so').count(), 1, 'counted as shouted out (you send it)');
  // Enter sends it, as anything in the box
  await page.focus('.all-in'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await sends(page), [['tw:quietkoala', 'Go check out Tinroof! → https://twitch.tv/tinroof']]);
});

test('a run of recent chatters, in ALL the chat its send box is on: the list (streamers only, a recent one unticked, Show them), then one a second with a strip; held back, it waits; Stop', async t => {
  const known = { 'kick:driftwood_7': { login: 'driftwood_7', game: 'Harbor Run', streams: true, t: now }, 'twitch:tinroof': { login: 'tinroof', game: '', streams: true, t: now },
    'kick:maplemoth': { login: 'maplemoth', game: 'Meadowlight', streams: true, t: now }, 'kick:pebble': { login: 'pebble', streams: false, t: now }, 'kick:oakmoss': { login: 'oakmoss', game: '', streams: true, t: now } };
  const page = await allApp(t, { shoutOn: '1', shoutKnown: JSON.stringify(known), shoutSent: JSON.stringify({ 'kick:oakmoss': Date.now() - 120000 }) });   // (its own now: the file's can be minutes old)
  await page.evaluate(() => Object.assign(window.shoutouts.timing, { gap: 50, look: 300, retry: 1 }));
  await chat(page);
  await feed(page, 'quietkoala', { s: 'kick', raw: [kick('k3', 'Oakmoss', 'hello'), kick('k4', 'Pebble', 'hi'), kick('k5', 'quietkoala', 'welcome raiders')] });
  // ALL's ⋯: Shout out (a tile for the whole streamer); the send box is on Kick: Kick's chat only
  await page.click('#stage .win.chat:not(.tab-hidden) [data-a=more]');
  await page.click('.bm-tile:has-text("Shout out")');
  await page.waitForSelector('.so-dlg .so-row');
  assert.match(await page.textContent('.so-dlg .dlg-sub'), /in quietkoala's Kick chat, newest first/);
  const rows = () => page.$$eval('.so-dlg .so-row', l => l.map(r => [r.querySelector('b').textContent, r.querySelector('input').checked, r.querySelector('small').textContent, r.querySelector('.ago').textContent]));
  assert.deepEqual(await rows(), [['Oakmoss', false, 'Kick', 'Shouted out 2 min ago'], ['MapleMoth', true, 'Raided · Streams Meadowlight', 'just now'], ['Driftwood_7', true, 'Streams Harbor Run', 'just now']], 'not Twitch\'s Tinroof');
  assert.equal(await page.textContent('.so-dlg .so-skip'), 'Left out: you, quietkoala and 1 person with no streams found. Show them');
  assert.equal(await page.textContent('.so-dlg .btn.primary'), 'Send 2');
  await page.click('.so-dlg [data-cmd="shout.runShowAll"]');
  assert.deepEqual((await rows())[3], ['Pebble', false, 'Kick', 'No streams found']);
  await page.click('.so-dlg .so-row:has-text("Pebble") input');
  assert.equal(await page.textContent('.so-dlg .btn.primary'), 'Send 3');
  // fewer: the list again (saved)
  await page.click('.so-dlg [data-cmd="shout.runFewer"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.shoutRunN')), '4');
  // held back once: the strip waits and says why, then it goes
  await page.evaluate(() => { window.__answers = ['sent', 'not-sent']; });
  await page.click('.so-dlg .btn.primary');
  await page.waitForSelector('.all-view .so-strip.paused');
  assert.match(await page.textContent('.all-view .so-strip'), /The chat held the message back · 1 s/);
  await flashed(page, /Shouted out 3 people/);
  assert.deepEqual((await sends(page)).map(s => s[0] + ' ' + s[1].split('!')[0]), ['quietkoala Go check out MapleMoth', 'quietkoala Go check out Driftwood_7', 'quietkoala Go check out Driftwood_7', 'quietkoala Go check out Pebble']);
  assert.equal(await page.locator('.so-strip').count(), 0, 'the strip goes when it\'s done');
  // the send box on Twitch: Twitch's chat
  await page.evaluate(() => { localStorage.setItem('kickMultiview.allSend', JSON.stringify({ s1: 'tw:quietkoala' })); window.__sends = []; });
  await page.evaluate(() => window.shoutouts.openRun(window.openWins().find(w => w.kind === 'chat' && w.allView)));
  await page.waitForSelector('.so-dlg .so-row');
  assert.deepEqual((await rows()).map(r => r[0]), ['Tinroof']);
  assert.match(await page.textContent('.so-dlg .dlg-sub'), /Twitch chat/);
  await page.click('.so-dlg .btn.primary');
  await flashed(page, /Shouted out 1 person/);
  assert.deepEqual(await sends(page), [['tw:quietkoala', 'Go check out Tinroof! → https://twitch.tv/tinroof']]);
  // started straight away (the setting, from its tick), ⇧ for the list; Stop
  await page.evaluate(() => { localStorage.setItem('kickMultiview.allSend', JSON.stringify({ s1: 'quietkoala' })); localStorage.setItem('kickMultiview.shoutListFirst', '0');
    const sent = window.shoutouts.sent(); Object.keys(sent).forEach(k => delete sent[k]); window.__sends = []; window.shoutouts.timing.gap = 3000; });   // (no one shouted out lately)
  await page.evaluate(() => { window.shoutouts.openRun(window.openWins().find(w => w.kind === 'chat' && w.allView)); });   // (not waited for: it's the whole run)
  await page.waitForSelector('.all-view .so-strip', { timeout: 5000 }).catch(async () => { throw new Error('no strip; flash: ' + await page.textContent('#msg') + ' dlg ' + await page.locator('.so-dlg').count()); });
  assert.equal(await page.locator('.so-dlg').count(), 0, 'no list');
  assert.match(await page.textContent('.all-view .so-strip'), /Shouting out [12] of \d · /);
  await page.waitForFunction(() => window.__sends.length === 1);
  await page.click('.all-view .so-strip [data-cmd="shout.stop"]');
  assert.equal(await page.locator('.so-strip').count(), 0);
  await page.waitForTimeout(200);
  assert.equal((await sends(page)).length, 1, 'stopped after the first');
  await page.evaluate(() => window.shoutouts.openRun(window.openWins().find(w => w.kind === 'chat' && w.allView), { flip: true }));
  await page.waitForSelector('.so-dlg');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.so-dlg').count(), 0);
});

test('Settings › Shoutouts: off by default (Twitch\'s own too, only where you\'re a mod on); the message with its preview (with a game and without), and the run\'s options', async t => {
  const page = await allApp(t, { shoutModOnly: null });
  await page.evaluate(() => window.openSettings('shoutouts'));
  await page.waitForSelector('#shoutOnSet');
  assert.deepEqual(await page.evaluate(() => ['#shoutOnSet', '#shoutModSet', '#shoutSendSet', '#shoutTwitchSet', '#shoutStreamersSet', '#shoutListSet'].map(s => document.querySelector(s).checked)), [false, true, true, false, true, true]);
  assert.equal(await page.inputValue('#shoutAgainSet'), '15');
  assert.equal(await page.textContent('#shoutRunSet .zoomPct'), '5');
  const preview = () => page.$$eval('#shoutPreview > span', l => l.map(s => s.textContent));
  assert.deepEqual(await preview(), ['Kmekick: Go check out Pixelfox! Last seen playing Tidepool → https://kick.com/pixelfox', 'Tmetwitch: Go check out Lumen! → https://twitch.tv/lumen no game found']);
  await page.fill('#shoutText', 'Follow ');
  await page.click('#shoutTokens button:has-text("{name}")');
  assert.deepEqual(await preview(), ['Kmekick: Follow Pixelfox', 'Tmetwitch: Follow Lumen no game found']);
  await page.waitForFunction(() => localStorage.getItem('kickMultiview.shoutText') === 'Follow {name}');
  // on, only where you're a mod (here: nowhere), then everywhere: the ⋯ item shows on the chat windows
  await page.check('#shoutOnSet');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.shoutOn')), '1');
  assert.equal(await page.locator('#stage .win.chat [data-a=shout]').first().evaluate(b => b.hidden), true, 'not a mod there');
  await page.uncheck('#shoutModSet');
  assert.equal(await page.locator('#stage .win.chat [data-a=shout]').first().evaluate(b => b.hidden), false);
  await page.selectOption('#shoutAgainSet', '0');
  await page.click('#soTabs [data-t=runs]');
  assert.deepEqual(await page.$$eval('.st-pane[data-s=shoutouts] .st-subpane', l => l.filter(p => !p.hidden).map(p => p.dataset.t)), ['runs'], 'one tab at a time');
  await page.click('#shoutRunSet [data-z="1"]');
  assert.equal(await page.textContent('#shoutRunSet .zoomPct'), '6');
  assert.deepEqual(await page.evaluate(() => ['shoutAgain', 'shoutRunN', 'shoutModOnly'].map(k => localStorage.getItem('kickMultiview.' + k))), ['0', '6', '0']);
  await page.click('#soTabs [data-t=message]');
  await page.uncheck('#shoutOnSet');
  assert.equal(await page.locator('#stage .win.chat [data-a=shout]').first().evaluate(b => b.hidden), true);
});

test('Settings › Shoutouts › Channels: a card for a found channel, its message with a preview per site, its other accounts; #300\'s rows moved over; a linked streamer\'s per site', async t => {
  const rows = [{ site: 'kick', login: 'pebblesong', name: 'Pebblesong', every: true, msg: 'Pebble time {link}' },
    { site: 'kick', login: 'quillby', name: 'Quillby', every: true, msg: '', to: { login: 'rowanbrook', name: 'Rowanbrook' } }];
  const page = await allApp(t, { shoutOn: '1', shoutPeople: JSON.stringify(rows) });
  await page.evaluate(() => window.openSettings('shoutouts'));
  await page.click('#soTabs [data-t=channels]');
  const cards = () => page.$$eval('#shoutPeople .shc-card', l => l.map(c => [c.dataset.ch, c.querySelector('.nm').textContent, (c.querySelector('.shc-sum') || {}).textContent || '']));
  assert.deepEqual(await cards(), [['pebblesong', 'Pebblesong', 'Pebble time {link}'], ['rowanbrook', 'Rowanbrook', 'Your general message · also for Quillby']], 'moved over: an alias is a chatter on its channel\'s card');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.shoutPeople')), null, 'once');
  // a found channel (no lookups here: as typed, on each site), its card open for its message
  await page.fill('.shc-add input', 'Tinroof'); await page.click('.shc-add .btn');
  assert.deepEqual(await page.$$eval('.shc-res .shc-ri', l => l.map(r => r.querySelector('small').textContent)), ['Kick', 'Twitch']);
  await page.click('.shc-res .shc-ri >> nth=1');
  const open = '#shoutPeople .shc-card.open';
  assert.equal(await page.getAttribute(open, 'data-ch'), 'tw:tinroof');
  await page.fill(`${open} textarea`, 'Captain {name} {link}');
  assert.match(await page.textContent(`${open} .shc-pv`), /metwitch: Captain tinroof https:\/\/twitch\.tv\/tinroof/);
  // the tokens, as under your general message: put in where the caret is
  assert.deepEqual(await page.$$eval(`${open} .so-tok button`, l => l.map(b => b.textContent)), ['{name} their name', '{link} their channel', '{links} every site', '{game} last game']);
  await page.$eval(`${open} textarea`, t => t.setSelectionRange(8, 8));
  await page.click(`${open} .so-tok button:has-text("{game}")`);
  assert.equal(await page.inputValue(`${open} textarea`), 'Captain {game}{name} {link}');
  assert.match(await page.textContent(`${open} .shc-pv`), /metwitch: Captain Tidepooltinroof/);
  await page.fill(`${open} textarea`, 'Captain {name} {link}');
  await page.fill(`${open} .shc-chip-in`, 'tin_alt'); await page.press(`${open} .shc-chip-in`, 'Enter');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')) || []).some(c => c.ch === 'tw:tinroof' && c.msg && c.also.length));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')).find(c => c.ch === 'tw:tinroof')),
    { ch: 'tw:tinroof', streamer: '', name: 'tinroof', avatar: '', msg: 'Captain {name} {link}', perSite: false, sites: {}, also: [{ site: 'twitch', login: 'tin_alt', name: 'tin_alt' }] });
  await page.click(`${open} [data-cmd="settings.shoutChatterRemove"]`);
  // the same channel again: Added
  await page.fill('.shc-add input', 'tinroof'); await page.click('.shc-add .btn');
  assert.match(await page.textContent('.shc-res .shc-ri >> nth=1'), /Added/);
  await page.keyboard.press('Escape');
  // a linked streamer: one message, or one per site, each with its preview
  await page.fill('.shc-add input', 'quietkoala'); await page.click('.shc-add .btn');
  assert.deepEqual(await page.$$eval('.shc-res .shc-ri small', l => l.map(x => x.textContent)), ['Linked streamer · Kick and Twitch']);
  await page.click('.shc-res .shc-ri');
  await page.click(`${open} [data-cmd="settings.shoutCardPerSite"]`);
  assert.deepEqual(await page.$$eval(`${open} .shc-msg .mh`, l => l.map(x => x.textContent)), ['KOn Kick', 'TOn Twitch']);
  await page.fill(`${open} textarea[aria-label="Their message on Twitch"]`, 'Twitch only ');
  assert.equal(await page.locator(`${open} .shc-msg .so-tok`).count(), 2, 'one for each site\'s message');
  await page.click(`${open} .shc-msg:has(textarea[aria-label="Their message on Twitch"]) .so-tok button:has-text("{link}")`);
  assert.equal(await page.inputValue(`${open} textarea[aria-label="Their message on Twitch"]`), 'Twitch only {link}');
  assert.equal(await page.inputValue(`${open} textarea[aria-label="Their message on Kick"]`), '', 'not the other site\'s');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')) || []).some(c => c.streamer === 's1' && c.perSite && c.sites.twitch === 'Twitch only {link}'));
  // removed
  await page.click(`${open} [data-cmd="settings.shoutCardRemove"]`);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')).some(c => c.streamer === 's1')), false);
  assert.deepEqual((await cards()).map(c => c[0]), ['pebblesong', 'rowanbrook', 'tw:tinroof'], 'gone from the list too (Remove had the focus)');
});

test('Settings › Shoutouts › Channels: the cards by name, whatever their case; a card without a picture gets its site\'s, asked for once', async t => {
  const card = (ch, name, avatar = '') => ({ ch, streamer: '', name, avatar, msg: '', perSite: false, sites: {}, also: [] });
  const list = [card('wrenfield', 'Wrenfield'), card('tw:mossling', 'Mossling'), card('ashgrove', ''), card('juniperhall', 'JuniperHall', 'https://pics.test/j.png'), card('oddone', 'oddone')];
  const page = await allApp(t, { shoutOn: '1', shoutChannels: JSON.stringify(list) });
  await page.evaluate(() => { window.__asked = []; window.kmv = { profileGet: async ch => { window.__asked.push(ch);
    return ch === 'wrenfield' ? { ch, site: { avatar: 'https://pics.test/w.png' } } : ch === 'tw:mossling' ? { ch, site: null, info: { avatar: 'https://pics.test/m.png' } }
      : ch === 'oddone' ? { ch, site: { avatar: 'http://pics.test/o.png' } } : { ch, missing: true }; } }; });
  await page.evaluate(() => window.openSettings('shoutouts'));
  await page.click('#soTabs [data-t=channels]');
  const names = () => page.$$eval('#shoutPeople .shc-card .nm', l => l.map(n => n.textContent));
  assert.deepEqual(await names(), ['ashgrove', 'JuniperHall', 'Mossling', 'oddone', 'Wrenfield']);
  const saved = () => page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')).map(c => [c.ch, c.avatar])));
  await page.waitForFunction(() => window.__asked.length === 4 && JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')).some(c => c.ch === 'tw:mossling' && c.avatar));
  assert.deepEqual(await saved(), { wrenfield: 'https://pics.test/w.png', 'tw:mossling': 'https://pics.test/m.png', ashgrove: '', juniperhall: 'https://pics.test/j.png', oddone: '' }, 'only https pictures');
  assert.deepEqual((await page.evaluate(() => window.__asked)).sort(), ['ashgrove', 'oddone', 'tw:mossling', 'wrenfield'], 'not one that has a picture');
  assert.deepEqual(await names(), ['ashgrove', 'JuniperHall', 'Mossling', 'oddone', 'Wrenfield'], 'drawn again, still by name');
  // the tab again: not asked again this session
  await page.click('#soTabs [data-t=message]'); await page.click('#soTabs [data-t=channels]');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__asked.length), 4);
});

test('Channel settings › Shoutout: their message with the tokens, saved as their card', async t => {
  const page = await allApp(t, { shoutOn: '1' });
  await page.evaluate(() => window.openLinkCard('quietkoala', { tab: 'shoutout' }));
  const box = '#linkDlg .shc-bare';
  await page.waitForSelector(box);
  await page.fill(`${box} textarea`, 'Hey ');
  await page.click(`${box} .so-tok button:has-text("{name}")`);
  assert.equal(await page.inputValue(`${box} textarea`), 'Hey {name}');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kickMultiview.shoutChannels')) || []).some(c => c.streamer === 's1' && c.msg === 'Hey {name}'));
});

test('Settings › Shoutouts › Channels: a long list scrolls on its own, under the tabs and the Add box', async t => {
  const list = Array.from({ length: 30 }, (_, i) => ({ ch: 'chan' + i, streamer: '', name: 'Chan' + String(i).padStart(2, '0'), avatar: 'https://pics.test/x.png', msg: '', perSite: false, sites: {}, also: [] }));
  const page = await allApp(t, { shoutOn: '1', shoutChannels: JSON.stringify(list) });
  await page.evaluate(() => window.openSettings('shoutouts'));
  await page.click('#soTabs [data-t=channels]');
  const top = () => page.evaluate(() => ['#soTabs', '.shc-add'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top)));
  const before = await top();
  assert.equal(await page.$eval('#shoutPeople', l => l.scrollHeight > l.clientHeight), true, 'the list scrolls');
  await page.$eval('#shoutPeople', l => { l.scrollTop = l.scrollHeight; });
  await page.locator('#shoutPeople .shc-card').last().click();
  assert.deepEqual(await top(), before, 'the tabs and the Add box stay where they are');
  assert.equal(await page.$eval('#settingsDlg .st-body', b => b.scrollTop), 0);
  assert.equal(await page.locator('#shoutPeople .shc-card.open').count(), 1);
  assert.ok(await page.$eval('#shoutPeople .shc-card', c => c.getBoundingClientRect().height) < 44, 'a closed card is one line');
  // the other tabs scroll as before
  await page.click('#soTabs [data-t=message]');
  assert.equal(await page.$eval('#settingsDlg .st-body', b => getComputedStyle(b).overflowY), 'auto');
});

test('only in chats where you\'re a mod (on unless switched off): no buttons elsewhere; your own channel counts', async t => {
  const page = await allApp(t, { shoutOn: '1', shoutModOnly: '1' });
  await chat(page);
  await line(page, 'boss fight').hover();
  assert.equal(await page.locator('.all-list .al-so-b').count(), 0, 'not a mod');
  await page.evaluate(() => { window.allChat.modKnown.set('quietkoala', true); window.allChat.syncMod(); });
  await line(page, 'boss fight').hover();
  assert.equal(await line(page, 'boss fight').locator('.al-so-b').count(), 1, 'a mod on Kick: its lines');
  assert.equal(await line(page, 'gg everyone').locator('.al-so-b').count(), 0, 'not on Twitch');
  await page.evaluate(() => { localStorage.setItem('kickMultiview.myTwitch', 'quietkoala'); window.allChat.modKnown.set('quietkoala', false); window.allChat.syncMod(); });
});

test('a chat bot\'s line shouts out who it\'s about, never the bot, and has no button when it\'s about no one; special lines have one too', async t => {
  const page = await allApp(t, { shoutOn: '1' });
  await feed(page, 'quietkoala', { s: 'kick', raw: [kick('b1', 'BotRix', 'Thanks for the follow Pixel_Fox'), kick('b2', 'BotRix', '@viewer9 the stream has been live for 2h'),
    KF('SubscriptionEvent', { username: 'Oakmoss', months: 3 })] });
  const bot = n => page.locator('.all-list .al-m:has(.al-n:text-is("BotRix"))').nth(n);   // (its text hidden, as bots' are)
  await bot(0).locator('.al-n').hover();   // (not its Show: over that, the hover bar steps aside)
  const b = bot(0).locator('.al-so-b');
  assert.equal(await b.getAttribute('title'), 'Shout out Pixel_Fox on Kick (from BotRix\'s message)');
  assert.equal(await bot(1).locator('.al-so-b').count(), 0, 'an @ of whoever used a command: no button');
  // (its Kick address looked up: no lookups here, so not sent)
  await bot(0).locator('.al-n').hover(); await b.click();
  await flashed(page, /Couldn't find Pixel_Fox's Kick channel/);
  // a sub: its button, for who subscribed
  const sub = page.locator('.all-list .al-ev:has-text("Oakmoss")');
  await sub.hover(); await sub.locator('.al-so-ev').click();
  await flashed(page, /Couldn't find Oakmoss's Kick channel/);
});

