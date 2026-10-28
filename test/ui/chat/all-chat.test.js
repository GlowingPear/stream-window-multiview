// The ALL tab of a linked streamer's chat window (issue #203): their sites' chats as one list, from each site's own
// connection (in-site/feed.js). Here the messages are handed to it as the chats would (window.allChat.ingest).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const now = Date.now();
const LIVE = { quietkoala: { live: true, checked: now }, 'tw:quietkoala': { live: true, checked: now }, 'yt:@quietkoala': { live: false, checked: now } };
const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala'], bots: [{ p: 'twitch', name: 'koala_helper' }] };
async function allApp(t, extra = {}){
  const set = { saved: JSON.stringify(STREAMER.accounts), intro: JSON.stringify({ done: true, tips: true }), linkedTip: '1', linkedOn: '1', streamers: JSON.stringify([STREAMER]),
    myName: 'mekick', myTwitch: 'metwitch', ...extra };
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v); }` });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala']));
  await page.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab.all');
  return page;
}
const tabs = page => page.$$eval('#stage .win.chat:not(.tab-hidden) .ptabs button', bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')));
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;
const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
const feed = (page, ch, batch) => page.evaluate(([ch, b]) => window.allChat.ingest(ch, b), [ch, batch]);
const lines = page => page.$$eval('#stage .win.chat:not(.tab-hidden) .all-list > *', l => l.map(e => [...e.classList].filter(c => /^al-(m|ev|me|rep|bot|del|hl)$/.test(c)).join(' ') + ' | ' + e.textContent.replace(/\s+/g, ' ').trim()));

test('an ALL tab before the sites: it shows their chats as one list, and a site\'s tab shows its own chat again', async t => {
  const page = await allApp(t);
  assert.deepEqual(await tabs(page), ['ALL', 'K*', 'T', 'Y']);
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  assert.deepEqual(await tabs(page), ['ALL*', 'K', 'T', 'Y']);
  assert.ok(await page.isVisible('#stage .win.chat .all-view'));
  assert.match(await page.textContent('.all-empty'), /Kick and Twitch chats together.*YouTube is offline.*New messages show here/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.allOpen'))), ['s1'], 'remembered for the streamer');
  // messages from both sites, in the order they come
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k1', content: 'that clutch [emote:1:KEKW]', type: 'message', created_at: new Date().toISOString(),
    sender: { id: 1, username: 'driftwood_7', slug: 'driftwood_7', identity: { color: '#7CFF4F', badges: [{ type: 'og' }] } } })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ badges: 'subscriber/6', color: '#FF7F50', 'display-name': 'tinroof', id: 't1' }, ':tinroof!t@t PRIVMSG #quietkoala :hi from twitch chat')] });
  await page.waitForFunction(() => !document.querySelector('.all-list .al-e'));   // (no network here: the picture can't load)
  assert.deepEqual(await lines(page), ['al-m | Kdriftwood_7: that clutch KEKW', 'al-m | Ttinroof: hi from twitch chat'], 'an emote whose picture can\'t load: its name');
  assert.equal(await page.isVisible('.all-empty'), false);
  assert.deepEqual(await page.$$eval('.all-list .al-m .al-who', l => l.map(w => [...w.children].map(c => c.className))), [['pi pi-kick', 'al-b al-b-og'], ['pi pi-twitch', 'al-b al-b-sub']], 'site icon, then badges');
  assert.equal(await page.$eval('.all-list .al-m .al-n', n => n.style.color), 'rgb(124, 255, 79)', 'the name\'s own colour');
  // the site's tab: its chat again (ALL stays for next time it's picked)
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.twitch');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y']);
  assert.equal(await page.locator('#stage .win.chat .all-view').count(), 0);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.allOpen'))), []);
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  assert.equal((await lines(page)).length, 2, 'what came before is still there');
});

test('ALL: messages to you, bots hidden one by one, deletions with who or AI moderation, timeouts', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [
    TW({ 'display-name': 'lowtide', id: 'a' }, ':lowtide!l@l PRIVMSG #quietkoala :@MeTwitch what crosshair?'),
    TW({ 'display-name': 'quill', id: 'b', 'reply-parent-msg-id': 'x', 'reply-parent-user-login': 'metwitch', 'reply-parent-display-name': 'MeTwitch', 'reply-parent-msg-body': 'is\\sit\\sdefault?' }, ':quill!q@q PRIVMSG #quietkoala :yeah'),
    TW({ 'display-name': 'Nightbot', id: 'c' }, ':nightbot!n@n PRIVMSG #quietkoala :Follow the socials!'),
    TW({ 'display-name': 'koala_helper', id: 'd', 'reply-parent-msg-id': 'y', 'reply-parent-user-login': 'metwitch', 'reply-parent-display-name': 'MeTwitch' }, ':koala_helper!k@k PRIVMSG #quietkoala :you have 4,200 points'),
    TW({ 'display-name': 'loudmouth99', id: 'e' }, ':loudmouth99!l@l PRIVMSG #quietkoala :trash lol'),
    TW({ 'display-name': 'happy', id: 'f', 'msg-id': 'highlighted-message', bits: '100' }, ':happy!h@h PRIVMSG #quietkoala :HAPPY BIRTHDAY'),
    TW({ 'display-name': 'Jean', login: 'jean', id: 'g', 'msg-id': 'resub', 'system-msg': 'Jean\\ssubscribed\\sfor\\s38\\smonths!' }, ':tmi.twitch.tv USERNOTICE #quietkoala :love it')
  ] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k9', content: 'nobody likes you', type: 'message', sender: { id: 2, username: 'ratchetkid', identity: {} } })] });
  assert.deepEqual(await lines(page), [
    'al-m al-me | Tlowtide: @MeTwitch what crosshair?@YOU',
    'al-m al-rep | ↩ replying to you: is it default?Tquill: yeahREPLY',
    'al-m al-bot | TNightbot: bot message hiddenShow',
    'al-m al-rep al-bot | ↩ replying to youTkoala_helper: bot message hiddenTO YOUShow',
    'al-m | Tloudmouth99: trash lol',
    'al-m al-hl | Thappy: HAPPY BIRTHDAYHighlighted100 bits',
    'al-ev | TJean subscribedlove itSee it on Twitch ›',
    'al-m | Kratchetkid: nobody likes you']);
  // Show opens one bot's message, Hide closes it
  await page.click('.all-list .al-bot >> nth=0 >> .al-show');
  assert.match((await lines(page))[2], /Nightbot: Follow the socials!Hide/);
  await page.click('.all-list .al-bot >> nth=0 >> .al-show');
  assert.match((await lines(page))[2], /bot message hidden/);
  // the chip: all bots' messages shown
  assert.match(await page.textContent('.all-chip'), /Bots: hidden/);
  await page.click('.all-chip');
  assert.match(await page.textContent('.all-chip'), /Bots: shown/);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.allBots')), 'shown');
  assert.match((await lines(page))[3], /koala_helper: you have 4,200 pointsTO YOU$/);
  await page.click('.all-chip');
  // deleted: kept, struck, with why; a timeout marks their lines
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('MessageDeletedEvent', { id: 'z', message: { id: 'k9' }, aiModerated: true, violatedRules: ['bullying'] })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'ban-duration': '600' }, ':tmi.twitch.tv CLEARCHAT #quietkoala :loudmouth99'), TW({ 'target-msg-id': 'a' }, ':tmi.twitch.tv CLEARMSG #quietkoala :x')] });
  const after = await lines(page);
  assert.equal(after[7], 'al-m al-del | Kratchetkid: nobody likes youDeleted · AI moderation · bullying');
  assert.equal(after[4], 'al-m al-del | Tloudmouth99: trash lolTimed out');
  assert.equal(after[0], 'al-m al-me al-del | Tlowtide: @MeTwitch what crosshair?@YOUDeleted');
});

test('ALL: off in Settings › Linked channels, no tab; and a new message while scrolled up offers to jump down', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const many = Array.from({ length: 60 }, (_, i) => TW({ 'display-name': 'u' + i, id: 'm' + i }, `:u${i}!u@u PRIVMSG #quietkoala :line ${i}`));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: many });
  await page.$eval('.all-list', l => { l.scrollTop = 0; });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'late', id: 'late' }, ':late!l@l PRIVMSG #quietkoala :one more')] });
  assert.ok(await page.isVisible('.all-more'), 'scrolled up: the list stays, a button goes down');
  await page.click('.all-more');
  assert.equal(await page.isVisible('.all-more'), false);
  await page.evaluate(() => { localStorage.setItem('kickMultiview.linkedOpts', JSON.stringify({ allTab: false })); window.openSettings('linked'); });
  await page.evaluate(() => { const c = document.querySelector('[data-lo=allTab]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.deepEqual(await tabs(page), ['K*', 'T', 'Y']);
  assert.equal(await page.locator('.all-view').count(), 0);
});

test('ALL: events are a short line with See it on …; Events: short, full or hidden; an announcement is a message', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [
    TW({ 'display-name': 'brightwick', login: 'brightwick', 'msg-id': 'submysterygift', 'msg-param-mass-gift-count': '5', id: 'g1', 'system-msg': 'brightwick\\sis\\sgifting\\s5\\sTier\\s1\\sSubs!' }, ':tmi.twitch.tv USERNOTICE #quietkoala'),
    TW({ 'display-name': 'quietkoala', 'msg-id': 'announcement', 'msg-param-color': 'GREEN', id: 'a1' }, ':tmi.twitch.tv USERNOTICE #quietkoala :scrims at 8pm')] });
  assert.deepEqual(await lines(page), ['al-ev | Tbrightwick gifted 5 subsSee it on Twitch ›', 'al-m | Tquietkoala: scrims at 8pmAnnouncement']);
  assert.equal(await page.textContent('.al-ev .al-amt'), '5 subs', 'the amount picked out');
  assert.ok(await page.$eval('.all-list .al-m', l => l.classList.contains('al-ann-green')));
  const chip = '.all-evchip';
  assert.equal(await page.textContent(chip), 'Events: short');
  await page.click(chip);
  assert.equal(await page.textContent(chip), 'Events: full');
  assert.equal((await lines(page))[0], 'al-ev | Tbrightwick is gifting 5 Tier 1 Subs!See it on Twitch ›', 'the site\'s own words');
  await page.click(chip);
  assert.equal(await page.textContent(chip), 'Events: hidden');
  assert.deepEqual(await lines(page), ['al-m | Tquietkoala: scrims at 8pmAnnouncement']);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.allEvents')), 'hidden');
  await page.click(chip);
  // See it on Twitch: Twitch's own chat
  await page.click('.al-ev .al-go');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y']);
  assert.equal(await page.locator('.all-view').count(), 0);
});
