// Shoutouts (chat/shoutout.js, issue #300): off by default; in ALL a button on each line, a raid's button, the line's
// menu, the ✓ SO tag and asking before a second one soon; a run of recent chatters; Settings › Chat › Shoutouts.
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
    myName: 'mekick', myTwitch: 'metwitch', allOpen: '["s1"]', ...extra };
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v); }` });
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

test('on: the line\'s menu has Shout out (in its chat) and Shout out in every chat; People rows and Twitch\'s own /shoutout (a mod, switched on)', async t => {
  const page = await allApp(t, { shoutOn: '1', shoutTwitch: '1', shoutPeople: JSON.stringify([{ site: 'twitch', login: 'tinroof', name: 'Tinroof', msg: 'Captain {name}! {link}' }]) });
  await page.evaluate(() => window.allChat.modKnown.set('tw:quietkoala', true));
  await chat(page);
  await line(page, 'gg everyone').click({ button: 'right' });
  const items = await page.$$eval('.all-lm .all-li', l => l.map(b => b.textContent));
  assert.ok(items.includes('Shout out TinroofTwitch chat'), items.join(' | '));
  assert.ok(items.includes('Shout out in every chatKickTwitch'));
  await page.click('.all-lm [data-cmd="all.menuShoutout"]');
  await page.waitForFunction(() => window.__sends.length === 2, null, { timeout: 5000 });
  assert.deepEqual(await sends(page), [['tw:quietkoala', 'Captain Tinroof! https://twitch.tv/tinroof'], ['tw:quietkoala', '/shoutout tinroof']], 'their row\'s message; then Twitch\'s own');
  // every chat: once in each, and Twitch's own isn't for someone without a Twitch channel
  await page.evaluate(() => { window.__sends = []; });
  await line(page, 'boss fight').click({ button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuShoutoutAll"]');
  await page.waitForFunction(() => window.__sends.length === 2);
  await page.waitForTimeout(1500);
  assert.deepEqual(await sends(page), [['quietkoala', 'Go check out Driftwood_7! → https://kick.com/driftwood_7'], ['tw:quietkoala', 'Go check out Driftwood_7! → https://kick.com/driftwood_7']]);
});

test('a run of recent chatters, in ALL the chat its send box is on: the list (streamers only, a recent one unticked, Show them), then one a second with a strip; held back, it waits; Stop', async t => {
  const known = { 'kick:driftwood_7': { login: 'driftwood_7', game: 'Harbor Run', streams: true, t: now }, 'twitch:tinroof': { login: 'tinroof', game: '', streams: true, t: now },
    'kick:maplemoth': { login: 'maplemoth', game: 'Meadowlight', streams: true, t: now }, 'kick:pebble': { login: 'pebble', streams: false, t: now }, 'kick:oakmoss': { login: 'oakmoss', game: '', streams: true, t: now } };
  const page = await allApp(t, { shoutOn: '1', shoutKnown: JSON.stringify(known), shoutSent: JSON.stringify({ 'kick:oakmoss': now - 120000 }) });
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
  assert.match(await page.textContent('.all-view .so-strip'), /Shouting out 1 of \d · /);
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

test('Settings › Chat › Shoutouts: off by default (Twitch\'s own too); the message with its preview (with a game and without), People, and the run\'s options', async t => {
  const page = await allApp(t);
  await page.evaluate(() => window.openSettings('chat', { sub: 'shoutouts' }));
  await page.waitForSelector('#shoutOnSet');
  assert.deepEqual(await page.evaluate(() => ['#shoutOnSet', '#shoutTwitchSet', '#shoutStreamersSet', '#shoutListSet'].map(s => document.querySelector(s).checked)), [false, false, true, true]);
  assert.equal(await page.inputValue('#shoutAgainSet'), '15');
  assert.equal(await page.textContent('#shoutRunSet .zoomPct'), '5');
  const preview = () => page.$$eval('#shoutPreview > span', l => l.map(s => s.textContent));
  assert.deepEqual(await preview(), ['Kmekick: Go check out Pixelfox! Last seen playing Tidepool → https://kick.com/pixelfox', 'Tmetwitch: Go check out Lumen! → https://twitch.tv/lumen no game found']);
  await page.fill('#shoutText', 'Follow ');
  await page.click('#shoutTokens button:has-text("{name}")');
  assert.deepEqual(await preview(), ['Kmekick: Follow Pixelfox', 'Tmetwitch: Follow Lumen no game found']);
  await page.waitForFunction(() => localStorage.getItem('kickMultiview.shoutText') === 'Follow {name}');
  // on: the ⋯ item shows on the chat windows
  await page.check('#shoutOnSet');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.shoutOn')), '1');
  assert.equal(await page.locator('#stage .win.chat [data-a=shout]').first().evaluate(b => b.hidden), false);
  await page.selectOption('#shoutAgainSet', '0');
  await page.click('#shoutRunSet [data-z="1"]');
  assert.equal(await page.textContent('#shoutRunSet .zoomPct'), '6');
  assert.deepEqual(await page.evaluate(() => ['shoutAgain', 'shoutRunN'].map(k => localStorage.getItem('kickMultiview.' + k))), ['0', '6']);
  // People: a row with its own message, then gone again
  await page.click('#shoutAdd');
  await page.selectOption('#shoutPeople .so-pr select', 'twitch');
  await page.fill('#shoutPeople .so-pr input[aria-label="Their name"]', 'Tinroof'); await page.press('#shoutPeople .so-pr input[aria-label="Their name"]', 'Tab');
  await page.fill('#shoutPeople .so-pr input[aria-label="Their message"]', 'Captain {name} {link}');
  await page.waitForFunction(() => /Captain/.test(localStorage.getItem('kickMultiview.shoutPeople') || ''));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.shoutPeople')).map(r => [r.site, r.login, r.name, r.msg])), [['twitch', 'tinroof', 'Tinroof', 'Captain {name} {link}']]);
  await page.click('#shoutPeople [data-cmd="settings.shoutPersonRemove"]');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.shoutPeople'))), []);
  await page.uncheck('#shoutOnSet');
  assert.equal(await page.locator('#stage .win.chat [data-a=shout]').first().evaluate(b => b.hidden), true);
});
