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
  await page.evaluate(() => { window.allChat.modKnown.set('quietkoala', true); window.allChat.modKnown.set('tw:quietkoala', true); });   // (a mod: what was removed stays)
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
  // the filter pill's menu: all bots' messages shown
  await page.click('.all-filt');
  const seg = name => page.$$eval(`.all-fm [aria-label="${name}"] button`, l => l.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')));
  assert.deepEqual(await seg('Bots'), ['Hidden*', 'Shown']);
  await page.click('.all-fm [aria-label="Bots"] >> text=Shown');
  assert.deepEqual(await seg('Bots'), ['Hidden', 'Shown*'], 'the menu stays open, showing the choice');
  assert.match(await page.getAttribute('.all-filt', 'title'), /bots shown/);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.allBots')), 'shown');
  assert.match((await lines(page))[3], /koala_helper: you have 4,200 pointsTO YOU$/);
  await page.click('.all-fm [aria-label="Bots"] >> text=Hidden');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-fm'), false, 'Esc closes it');
  // deleted: kept, struck, with why; a timeout or ban marks their lines, and a line says what was done (and by whom, where the site says)
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('MessageDeletedEvent', { id: 'z', message: { id: 'k9' }, aiModerated: true, violatedRules: ['bullying'] })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'ban-duration': '600' }, ':tmi.twitch.tv CLEARCHAT #quietkoala :loudmouth99'), TW({ 'target-msg-id': 'a' }, ':tmi.twitch.tv CLEARMSG #quietkoala :x')] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('UserBannedEvent', { user: { slug: 'ratchetkid', username: 'ratchetkid' }, banned_by: { username: 'nightowl_mod' }, permanent: true })] });
  const after = await lines(page);
  assert.equal(after[7], 'al-m al-del | Kratchetkid: nobody likes youBanned');
  assert.equal(after[4], 'al-m al-del | Tloudmouth99: trash lolTimed out · 10m');
  assert.equal(after[0], 'al-m al-me al-del | Tlowtide: @MeTwitch what crosshair?@YOUDeleted');
  assert.deepEqual(after.slice(8), ['al-ev | Tloudmouth99 was timed out · 10m', 'al-ev | Knightowl_mod banned ratchetkid'], 'Twitch doesn\'t say which moderator; Kick does');
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('UserUnbannedEvent', { user: { slug: 'ratchetkid', username: 'ratchetkid' }, unbanned_by: { username: 'nightowl_mod' } })] });
  assert.equal((await lines(page)).pop(), 'al-ev | Knightowl_mod lifted the ban on ratchetkid');
});

test('ALL: where you aren\'t a mod, what a moderator removes goes from ALL (as the site doesn\'t show it to you either); a cleared chat says so', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => { window.allChat.modKnown.set('quietkoala', false); window.allChat.modKnown.set('tw:quietkoala', false); });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'loudmouth99', id: 'e' }, ':loudmouth99!l@l PRIVMSG #quietkoala :trash lol'),
    TW({ 'display-name': 'calm', id: 'f' }, ':calm!c@c PRIVMSG #quietkoala :hello'), TW({ 'display-name': 'rude', id: 'g' }, ':rude!r@r PRIVMSG #quietkoala :ugh')] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k1', content: 'hi from kick', type: 'message', sender: { id: 2, username: 'driftwood', slug: 'driftwood', identity: {} } })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'ban-duration': '600' }, ':tmi.twitch.tv CLEARCHAT #quietkoala :loudmouth99'), TW({ 'target-msg-id': 'g' }, ':tmi.twitch.tv CLEARMSG #quietkoala :ugh')] });
  assert.deepEqual(await lines(page), ['al-m | Tcalm: hello', 'al-m | Kdriftwood: hi from kick'], 'gone, and no line about it');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'tmi-sent-ts': String(Date.now()) }, ':tmi.twitch.tv CLEARCHAT #quietkoala')] });
  assert.deepEqual(await lines(page), ['al-m | Kdriftwood: hi from kick', 'al-ev | TA moderator cleared Twitch\'s chat'], 'Twitch\'s lines go; Kick\'s stay');
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
  await page.click('.all-filt');
  const ev = v => page.click(`.all-fm [aria-label="Events"] >> text=${v}`);
  assert.equal(await page.textContent('.all-fm [aria-label="Events"] .on'), 'Short');
  await ev('Full');
  assert.equal((await lines(page))[0], 'al-ev | Tbrightwick is gifting 5 Tier 1 Subs!See it on Twitch ›', 'the site\'s own words');
  await ev('Hidden');
  assert.deepEqual(await lines(page), ['al-m | Tquietkoala: scrims at 8pmAnnouncement']);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.allEvents')), 'hidden');
  assert.match(await page.getAttribute('.all-filt', 'title'), /events hidden/);
  assert.equal(await page.$eval('.all-filt', e => e.classList.contains('set')), true, 'changed: a dot');
  await ev('Short');
  assert.equal(await page.$eval('.all-filt', e => e.classList.contains('set')), false);
  await page.click('.all-filt');
  assert.equal(await page.isVisible('.all-fm'), false, 'the pill closes it again');
  // See it on Twitch: Twitch's own chat
  await page.click('.al-ev .al-go');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y']);
  assert.equal(await page.locator('.all-view').count(), 0);
});

test('ALL: Send on [K ▾]: the main site first, Tab steps the sites you can send on (YouTube only with a live chat), Enter sends there; ⇧Tab its own tab', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  // (the chats' pages "loaded": in the browser they never do)
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  const placeholder = () => page.getAttribute('.all-in', 'placeholder');
  assert.equal(await placeholder(), 'Send a message on Kick', 'their main site');
  assert.equal(await page.textContent('.all-pick .pi'), 'K');
  await page.focus('.all-in');
  await page.keyboard.press('Tab');
  assert.equal(await placeholder(), 'Send a message on Twitch');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.allSend'))), { s1: 'tw:quietkoala' }, 'remembered');
  await page.keyboard.press('Tab');
  assert.equal(await placeholder(), 'Send a message on Kick', 'YouTube skipped: no live chat');
  // the picker: each site, the ones you can't send on with why
  await page.click('.all-pick');
  assert.deepEqual(await page.$$eval('.all-menu .all-mi', l => l.map(b => b.textContent + (b.disabled ? ' (off)' : '') + (b.classList.contains('on') ? ' *' : ''))),
    ['KKickMain *', 'TTwitch', 'YYouTube · no live chat found (off)']);
  await page.click('.all-menu .all-mi >> nth=1');
  assert.equal(await page.isVisible('.all-menu'), false);
  assert.equal(await placeholder(), 'Send a message on Twitch');
  // Enter: sent on that site's chat (here a stand-in), the box empties; a refusal says why (on your line too)
  await page.evaluate(() => { window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push([m.channel, text]); return window.__answer || 'sent'; }; });
  await page.fill('.all-in', '  gg everyone ');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends), [['tw:quietkoala', 'gg everyone']]);
  assert.equal(await page.inputValue('.all-in'), '');
  await page.evaluate(() => { window.__answer = 'disabled'; });
  await page.fill('.all-in', 'hello?');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => /isn't letting you chat/.test(document.querySelector('#msg')?.textContent || ''));
  assert.match(await page.textContent('.al-mine-failed'), /hello\?Not sentTwitch isn't letting you chat/, 'your line says so, to try again');
  for (const [r, want] of [['no-box', /you may need to sign in to Twitch/], ['not-filled', /Couldn't type into Twitch's chat box/], ['not-sent', /Twitch didn't send it/], ['oops', /Twitch's chat didn't answer/]]){
    await page.evaluate(r => { window.__answer = r; }, r);
    await page.fill('.all-in', 'hello?');
    await page.press('.all-in', 'Enter');
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), want.source);
  }
  await page.evaluate(() => { window.allChat.sender.send = async () => { throw new Error('gone'); }; });
  await page.fill('.all-in', 'hello?');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => /didn't answer/.test(document.querySelector('#msg')?.textContent || ''));
  // ⇧Tab: the window's next tab (ALL › K › T), its own chat
  await page.focus('.all-in');
  await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await tabs(page), ['ALL', 'K*', 'T', 'Y']);
  assert.equal(await page.locator('.all-view').count(), 0);
});

test('ALL: with one site to send on, Tab says so; with none, the box says so', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = w.channel === 'quietkoala'; }); window.smvNotes.liveStatus(live); }, LIVE);
  await page.focus('.all-in');
  await page.keyboard.press('Tab');
  assert.match(await page.textContent('#msg'), /Only Kick can be sent on right now/);
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = false; }); window.smvNotes.liveStatus(live); }, LIVE);
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'No chat to send on right now');
  assert.equal(await page.isDisabled('.all-in'), true);
});

test('ALL: reply from a line: the box locks to its site with a bar (Kick: its own threaded reply; Twitch: an @); Esc unlocks', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k1', content: 'what crosshair are you using?', type: 'message', sender: { id: 1, username: 'lowtide', identity: {} } })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'tinroof', id: 't1' }, ':tinroof!t@t PRIVMSG #quietkoala :is this the same stream?')] });
  await page.evaluate(() => { window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push(['send', m.channel, text]); return 'sent'; };
    window.allChat.sender.reply = async (m, id, text) => { window.__sends.push(['reply', m.channel, id, text]); return window.__replyAnswer || 'sent'; }; });
  // Twitch first (the send site was Kick): locked to Twitch
  await page.hover('.all-list .al-m >> nth=1');
  await page.click('.all-list .al-m >> nth=1 >> .al-hb button');
  assert.match(await page.textContent('.all-rb'), /Replying to tinroof on Twitch, as an @mention· is this the same stream\?/);
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on Twitch');
  assert.ok(await page.$eval('.all-pick', b => b.classList.contains('locked')));
  await page.keyboard.press('Tab');
  assert.match(await page.textContent('#msg'), /Locked to Twitch while replying · Esc unlocks/);
  await page.click('.all-pick');
  assert.match(await page.textContent('#msg'), /Locked to this site/);
  await page.fill('.all-in', 'yeah same one');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends[0]), ['send', 'tw:quietkoala', '@tinroof yeah same one']);
  assert.equal(await page.isVisible('.all-rb'), false, 'sent: unlocked');
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on Kick', 'back to the site it was on');
  // Kick: its own threaded reply
  await page.hover('.all-list .al-m >> nth=0');
  await page.click('.all-list .al-m >> nth=0 >> .al-hb button');
  assert.match(await page.textContent('.all-rb'), /^Replying to lowtide on Kick·/);
  await page.fill('.all-in', 'default, 1.2 green');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => window.__sends.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__sends[1]), ['reply', 'quietkoala', 'k1', 'default, 1.2 green']);
  // the message has gone from Kick's chat: it says so on your line; Edit: the reply again, to try once more
  await page.evaluate(() => { window.__replyAnswer = 'no-reply'; });
  await page.hover('.all-list .al-m >> nth=0');
  await page.click('.all-list .al-m >> nth=0 >> .al-hb button');
  await page.fill('.all-in', 'again');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => /Couldn't start a reply on Kick/.test(document.querySelector('#msg')?.textContent || ''));
  assert.match(await page.textContent('.al-mine-failed'), /↩ replying to lowtide.*Not sent/);
  await page.click('.al-mine-failed [data-cmd="all.edit"]');
  assert.equal(await page.inputValue('.all-in'), 'again');
  assert.ok(await page.isVisible('.all-rb'));
  // Esc, and ✕: unlocked
  await page.focus('.all-in');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-rb'), false);
  await page.hover('.all-list .al-m >> nth=0');
  await page.click('.all-list .al-m >> nth=0 >> .al-hb button');
  await page.click('.all-rb-x');
  assert.equal(await page.isVisible('.all-rb'), false);
  // a site you can't send on: no reply
  await page.evaluate(() => { window.openWins().forEach(w => { if (w.channel === 'tw:quietkoala') w.ready = false; }); });
  await page.hover('.all-list .al-m >> nth=1');
  await page.click('.all-list .al-m >> nth=1 >> .al-hb button');
  assert.match(await page.textContent('#msg'), /Can't send on Twitch right now/);
});

test('ALL: @ suggests names from their chats; picking one locks to its site, and then only its names; a name opens their card on its site', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k1', content: 'hi', type: 'message', sender: { id: 1, username: 'lowtide', identity: {} } }),
    KF('ChatMessageEvent', { id: 'k2', content: 'yo', type: 'message', sender: { id: 2, username: 'Lofi_Kick', identity: {} } })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'lowkey_gg', id: 't1' }, ':lowkey_gg!l@l PRIVMSG #quietkoala :sup'), TW({ 'display-name': 'Nightbot', id: 't2' }, ':nightbot!n@n PRIVMSG #quietkoala :@lo follow!')] });
  const list = () => page.$$eval('.all-at .all-ati', l => l.map(b => b.textContent + (b.classList.contains('on') ? '*' : '')));
  await page.focus('.all-in');
  await page.keyboard.type('nice one @lo');
  assert.deepEqual(await list(), ['Tlowkey_ggTwitch*', 'KLofi_KickKick', 'KlowtideKick'], 'newest first, no bots');
  assert.match(await page.textContent('.all-at'), /Names in chat/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  assert.deepEqual(await list(), ['Tlowkey_ggTwitch', 'KLofi_KickKick*', 'KlowtideKick']);
  await page.keyboard.press('Tab');
  assert.equal(await page.inputValue('.all-in'), 'nice one @Lofi_Kick ');
  assert.equal(await page.isVisible('.all-at'), false);
  assert.match(await page.textContent('.all-rb'), /Mentioning on Kick · Kick names only/);
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on Kick');
  await page.keyboard.type('and @lo');
  assert.deepEqual(await list(), ['KLofi_KickKick*', 'KlowtideKick'], 'only Kick names now');
  assert.match(await page.textContent('.all-at'), /Kick names/);
  await page.click('.all-at .all-ati >> nth=1');
  assert.equal(await page.inputValue('.all-in'), 'nice one @Lofi_Kick and @lowtide ');
  await page.keyboard.type('@zz');
  assert.equal(await page.isVisible('.all-at'), false, 'nobody by that name');
  await page.keyboard.type(' @lo');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-at'), false, 'Esc closes the list first');
  assert.ok(await page.isVisible('.all-rb'));
  await page.fill('.all-in', '');
  await page.dispatchEvent('.all-in', 'input');
  assert.equal(await page.isVisible('.all-rb'), false, 'an empty box: unlocked');
  // a name: their card, on its own site's tab
  await page.click('.all-list .al-m >> nth=2 >> .al-n');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y']);
});

test('ALL: mod actions where you\'re a mod: the hover\'s Delete, the menu (timeout lengths, ban asks first), keys on a name; not for mods, the streamer or where you aren\'t one', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.allChat.modKnown.set('quietkoala', true); window.allChat.modKnown.set('tw:quietkoala', false); window.smvNotes.liveStatus(live); }, LIVE);
  await page.evaluate(() => { window.__acts = []; window.allChat.sender.mod = async (m, action, id) => { window.__acts.push([action, m.channel, id]); return window.__modAnswer || 'done'; };
    window.allChat.sender.send = async (m, text) => { window.__acts.push(['send', m.channel, text]); return 'sent'; }; });
  const ks = (id, name, badges = []) => KF('ChatMessageEvent', { id, content: 'trash lol', type: 'message', sender: { id: 1, username: name, slug: name, identity: { badges: badges.map(type => ({ type })) } } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [ks('k1', 'loudmouth'), ks('k2', 'nightowl_mod', ['moderator']), ks('k3', 'quietkoala', ['broadcaster']), ks('k4', 'mekick')] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'twitchy', id: 't1' }, ':twitchy!t@t PRIVMSG #quietkoala :hi')] });
  const acts = () => page.evaluate(() => window.__acts);
  const line = n => `.all-list .al-m >> nth=${n}`;
  // the hover: Delete only for someone you can moderate
  assert.deepEqual(await page.$$eval('.all-list .al-m', l => l.map(e => !!e.querySelector('[data-cmd="all.delete"]'))), [true, false, false, false, false]);
  await page.hover(line(0)); await page.click(`${line(0)} >> [data-cmd="all.delete"]`);
  await page.waitForFunction(() => window.__acts.length === 1);
  assert.deepEqual(await acts(), [['delete', 'quietkoala', 'k1']]);
  assert.match(await page.textContent('#msg'), /Deleted loudmouth's message on Kick/);
  // the menu: timeout lengths (remembered), pin, ban after asking
  await page.click(line(0), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li', l => l.map(b => b.textContent.trim() + (b.disabled ? ' (off)' : ''))).then(x => x.map(s => s.replace(/\s+/g, ' '))),
    ['Reply', 'Pin message', 'Open profile on Kick', /Delete message.*click name/.source && 'Delete message' + (process.platform === 'darwin' ? '⇧-click name' : 'Shift-click name'),
     'Timeout' + (process.platform === 'darwin' ? '⌘-click name' : 'Ctrl-click name'), 'Ban' + (process.platform === 'darwin' ? '⌘+⇧-click name' : 'Ctrl+Shift-click name'), 'Copy message', 'Open Kick mod view'].map(x => x));
  await page.click('.all-lm .all-durs button >> text=1h');
  await page.waitForFunction(() => window.__acts.length === 2);
  assert.deepEqual((await acts())[1], ['send', 'quietkoala', '/timeout loudmouth 60'], 'Kick counts minutes');
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.allTimeout')), '3600');
  await page.click(line(0), { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuPin"]');
  await page.waitForFunction(() => window.__acts.length === 3);
  assert.deepEqual((await acts())[2], ['pin', 'quietkoala', 'k1']);
  await page.click(line(0), { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuBan"]');
  await page.waitForSelector('#askDlg:not([hidden])');
  assert.match(await page.textContent('#askDlg'), /Ban loudmouth on Kick\?/);
  await page.click('#askDlg .ask-yes');
  await page.waitForFunction(() => window.__acts.length === 4);
  assert.deepEqual((await acts())[3], ['send', 'quietkoala', '/ban loudmouth']);
  // keys on the name: Ctrl/⌘ times out for the last length, Shift deletes, both ban (asked; No does nothing)
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.click(`${line(0)} >> .al-n`, { modifiers: [mod] });
  await page.waitForFunction(() => window.__acts.length === 5);
  assert.deepEqual((await acts())[4], ['send', 'quietkoala', '/timeout loudmouth 60']);
  await page.click(`${line(0)} >> .al-n`, { modifiers: ['Shift'] });
  await page.waitForFunction(() => window.__acts.length === 6);
  assert.deepEqual((await acts())[5], ['delete', 'quietkoala', 'k1']);
  await page.click(`${line(0)} >> .al-n`, { modifiers: [mod, 'Shift'] });
  await page.waitForSelector('#askDlg:not([hidden])');
  await page.click('#askDlg .ask-no');
  assert.equal((await acts()).length, 6, 'not banned');
  // can't: a mod, the streamer, you; and a site where you aren't a mod
  for (const [n, why] of [[1, /nightowl_mod is a mod on Kick/], [2, /quietkoala is the streamer/], [3, /That's you/], [4, /You're not a mod on Twitch/]]){
    await page.click(`${line(n)} >> .al-n`, { modifiers: ['Shift'] });
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), why.source);
  }
  await page.click(line(1), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li:disabled', l => l.map(b => b.title)), ['nightowl_mod is a mod on Kick', 'nightowl_mod is a mod on Kick', 'nightowl_mod is a mod on Kick']);
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-lm'), false, 'Esc closes it');
  await page.click(line(4), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li', l => l.map(b => b.textContent.trim())), ['Reply', 'Open profile on Twitch', 'Copy message'], 'no mod part where you aren\'t a mod');
  await page.mouse.click(5, 5);
  // a message gone from the site's chat, and a site that won't take it
  for (const [ans, want] of [['no-line', /That message has gone from Kick's chat/], ['no-button', /Kick doesn't offer that there/], ['nope', /Kick didn't take it/]]){
    await page.evaluate(a => { window.__modAnswer = a; }, ans);
    await page.click(`${line(0)} >> .al-n`, { modifiers: ['Shift'] });
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), want.source);
  }
});

test('ALL: what you send shows at once (sending, then sent) and the real line takes its place; Enter can\'t send twice; not sent: Retry or Edit', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  await page.evaluate(() => { window.__sends = []; window.allChat.sender.send = (m, text) => new Promise(r => { window.__sends.push(text); window.__done = r; }); });
  const mine = () => page.$$eval('.all-list .al-mine', l => l.map(e => e.className.replace(/.*al-mine-/, '') + ' | ' + e.textContent.replace(/\s+/g, ' ').trim()));
  await page.fill('.all-in', 'first one');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await mine(), ['sending | Kmekick: first oneSending']);
  assert.equal(await page.inputValue('.all-in'), '', 'the box is free for the next one');
  // Enter again while it's sending: nothing sent twice
  await page.fill('.all-in', 'second one');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => /Still sending the last one/.test(document.querySelector('#msg')?.textContent || ''));
  assert.deepEqual(await page.evaluate(() => window.__sends), ['first one']);
  assert.equal(await page.inputValue('.all-in'), 'second one', 'kept');
  await page.evaluate(() => window.__done('sent'));
  await page.waitForFunction(() => document.querySelector('.al-mine-sent'));
  // the chat brings it back: the real line, in its place
  const KF = (data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify(data) } } } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF({ id: 'k9', content: 'first  one', type: 'message', sender: { id: 2, username: 'MeKick', slug: 'mekick', identity: { badges: [{ type: 'subscriber' }] } } })] });
  assert.deepEqual(await mine(), []);
  assert.deepEqual(await lines(page), ['al-m | Kmekick: first one'.replace('mekick', 'MeKick')]);
  // not sent: red, with why; Retry sends it again; Edit puts it back in the box
  await page.evaluate(() => { window.allChat.sender.send = async (m, text) => { window.__sends.push(text); return window.__answer; }; window.__answer = 'not-sent'; });
  await page.fill('.all-in', 'try me');
  await page.press('.all-in', 'Enter');
  await page.waitForSelector('.al-mine-failed');
  assert.match((await mine())[0], /^failed \| KMeKick: try meNot sentKick didn't send it: it's still in its chat box/, 'as in your last message there');
  assert.deepEqual(await page.$eval('.al-mine .al-who', w => [...w.children].map(c => c.className)), ['pi pi-kick', 'al-b al-b-sub'], 'with your badges');
  await page.evaluate(() => { window.__answer = 'sent'; });
  await page.click('.al-mine-failed [data-cmd="all.retry"]');
  await page.waitForSelector('.al-mine-sent');
  assert.deepEqual(await page.evaluate(() => window.__sends.slice(-2)), ['try me', 'try me']);
  await page.evaluate(() => { window.__answer = 'disabled'; });
  await page.fill('.all-in', 'edit me');
  await page.press('.all-in', 'Enter');
  await page.waitForSelector('.al-mine-failed');
  await page.fill('.all-in', '');
  await page.click('.al-mine-failed [data-cmd="all.edit"]');
  assert.equal(await page.inputValue('.all-in'), 'edit me');
  assert.equal(await page.locator('.al-mine-failed').count(), 0, 'its line goes');
});

test('ALL with an offline Kick or Twitch: its chat is loaded (a hidden tab) to read and send on, and its tab can be watched; not YouTube\'s', async t => {
  const page = await allApp(t);
  const OFF = { ...LIVE, 'tw:quietkoala': { live: false, checked: now } };
  await page.evaluate(off => window.smvNotes.liveStatus(off), OFF);
  const chats = () => page.evaluate(() => window.openWins().filter(w => w.kind === 'chat').map(w => w.channel + (w.hiddenTab ? ' (hidden)' : '')).sort());
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  await page.waitForFunction(() => window.openWins().some(w => w.kind === 'chat' && w.channel === 'tw:quietkoala'));
  assert.deepEqual(await chats(), ['quietkoala', 'tw:quietkoala (hidden)']);
  await page.evaluate(off => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(off); }, OFF);
  assert.deepEqual(await chats(), ['quietkoala', 'tw:quietkoala (hidden)'], 'kept while offline');
  await page.click('.all-pick');
  assert.deepEqual(await page.$$eval('.all-menu .all-mi', l => l.map(b => b.textContent + (b.disabled ? ' (off)' : ''))), ['KKickMain', 'TTwitch', 'YYouTube · no live chat found (off)']);
  await page.keyboard.press('Escape');
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.twitch');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y'], 'its tab: watched');
  // ⇧Tab in a chat box (the site's script says so): the window's tabs in order, the offline Twitch too, not YouTube's
  const cycle = () => page.evaluate(() => window.frames_.cycleTabs(window.openWins().find(w => w.kind === 'chat' && !w.hiddenTab)));
  await cycle(); assert.deepEqual(await tabs(page), ['ALL*', 'K', 'T', 'Y']);
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'all-in', 'the keyboard in ALL\'s box');
  await cycle(); assert.deepEqual(await tabs(page), ['ALL', 'K*', 'T', 'Y']);
  await cycle(); assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y'], 'offline Twitch');
  await cycle(); assert.deepEqual(await tabs(page), ['ALL*', 'K', 'T', 'Y'], 'YouTube offline: skipped');
});

test('ALL: the title bar\'s mod button lists each site\'s mod view (where you\'re a mod) and Open all; a site\'s tab opens its own', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.__opened = []; window.open = u => { window.__opened.push(u); }; window.allChat.modKnown.set('quietkoala', true); window.allChat.modKnown.set('tw:quietkoala', true); window.smvNotes.liveStatus(live); }, LIVE);
  const btn = '#stage .win.chat:not(.tab-hidden) [data-a=mod]';
  const rows = () => page.$$eval('.all-mv .all-li', l => l.map(b => b.textContent.replace(/\s+/g, ' ').trim() + (b.disabled ? ' (off)' : '')));
  await page.$eval(btn, b => b.click());
  assert.equal(await page.textContent('.all-mvh'), 'Mod views');
  assert.deepEqual(await rows(), ['KKick mod view', 'TTwitch mod view', 'YYouTube · no mod view (off)', 'Open all2 windows']);
  await page.click('.all-mv [data-cmd="all.modViewsAll"]');
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://dashboard.kick.com/moderator/quietkoala', 'https://www.twitch.tv/moderator/quietkoala']);
  assert.equal(await page.isVisible('.all-mv'), false, 'closed once picked');
  // one site where you're a mod: no Open all; the other says why
  await page.evaluate(() => { window.allChat.modKnown.set('tw:quietkoala', false); window.__opened = []; });
  await page.$eval(btn, b => b.click());
  assert.deepEqual(await rows(), ['KKick mod view', 'TTwitch · you\'re not a mod (off)', 'YYouTube · no mod view (off)']);
  await page.click('.all-mv [data-cmd="all.modView"] >> nth=0');
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://dashboard.kick.com/moderator/quietkoala']);
  await page.$eval(btn, b => b.click());
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-mv'), false, 'Esc closes it');
  // a site's own tab: its own mod view, straight away
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.kick');
  await page.evaluate(() => { window.__opened = []; });
  await page.$eval(btn, b => b.click());
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://dashboard.kick.com/moderator/quietkoala']);
});

test('ALL: a reward redeemed with text reads as a message with the reward\'s name; without text, Kicks sent and Kick\'s subs are events', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const KE = (event, data) => JSON.stringify({ push: { channel: 'chatroom_1', pub: { data: { event, data: JSON.stringify(data) } } } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KE('RewardRedeemedEvent', { reward_title: 'Shoutout', username: 'driftwood_7', user_input: 'say hi to sam', reward_background_color: '#00F1FF' }),
    KE('RewardRedeemedEvent', { reward_title: 'Hydrate', username: 'oakmoss', user_input: '' }), KE('KicksGifted', { gift_transaction_id: 'g1', sender: { username: 'Jshoti' }, gift: { name: 'Full Send', amount: 100 } }),
    KF('GiftedSubscriptionsEvent', { gifter_username: 'brightwick', gifted_usernames: ['a', 'b'] })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'custom-reward-id': 'abc', id: 'r1', 'display-name': 'tinroof' }, ':tinroof!t@t PRIVMSG #quietkoala :play the new map')] });
  assert.deepEqual(await lines(page), ['al-m | Kdriftwood_7: say hi to samShoutout', 'al-ev | Koakmoss redeemed HydrateSee it on Kick ›', 'al-ev | KJshoti sent Full Send · 100 KicksSee it on Kick ›',
    'al-ev | Kbrightwick gifted 2 subsSee it on Kick ›2 recipients', 'al-m | Ttinroof: play the new mapChannel points']);
  assert.equal(await page.$$eval('.all-list .al-rw', l => l.length), 2, 'redeems: their own edge');
  assert.equal(await page.$eval('.al-tag-rw', e => e.style.getPropertyValue('--rw')), '#00F1FF', 'in the reward\'s colour');
});

test('ALL: pins wait in the pill (how many), which shows and hides one compact strip: the newest, K T Y switch, ▾ all of them; a new pin pings the pill; a pin taken down goes', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  assert.equal(await page.isVisible('.all-pinchip'), false, 'no pins: no pill');
  const kpin = (id, text) => KF('PinnedMessageCreatedEvent', { message: { id, content: text, type: 'message', sender: { username: 'quietkoala', slug: 'quietkoala', identity: {} } }, pinned_by: { username: 'nightowl_mod' } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [kpin('k5', 'scrims at 8pm')] });
  assert.equal((await page.textContent('.all-pinchip')).trim(), '1');
  assert.equal(await page.isVisible('.all-pins'), false, 'in the pill, not over the chat');
  assert.deepEqual(await page.$eval('.all-pinchip', e => [...e.classList]), ['all-pinchip', 'ping', 'ping-kick'], 'a new pin: the pill pings, in the site\'s colour');
  await page.click('.all-pinchip');
  assert.equal(await page.getAttribute('.all-pinchip', 'aria-pressed'), 'true');
  const strip = () => page.$eval('.all-pins', e => e.textContent.replace(/\s+/g, ' ').trim());
  assert.equal(await strip(), 'Kquietkoala scrims at 8pmjust now');
  assert.match(await page.getAttribute('.all-pin-row', 'title'), /^quietkoala: scrims at 8pm\nPinned by nightowl_mod$/, 'the whole message, and who pinned it');
  await page.evaluate(() => window.allChat.ingest('tw:quietkoala', { s: 'youtube', raw: [{ addBannerToLiveChatCommand: { bannerRenderer: { liveChatBannerRenderer: { actionId: 'b1', contents: { liveChatTextMessageRenderer: { id: 'y9', authorName: { simpleText: 'Mika R.' }, message: { runs: [{ text: 'clip of the ace' }] } } } } } } }] }));
  assert.equal(await strip(), 'YMika R. clip of the acejust nowYK', 'the newest');
  await page.click('.all-pin-sw .pi-kick');
  assert.match(await strip(), /^Kquietkoala scrims at 8pmjust nowYK/);
  assert.equal(await page.getAttribute('.all-pin-open', 'aria-label'), 'All 2 pins');
  await page.click('.all-pin-open');
  assert.deepEqual(await page.$$eval('.all-pins .all-pin-row', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim())), ['YMika R. clip of the acejust now', 'Kquietkoala scrims at 8pmjust now']);
  await page.click('.all-pin-open');
  // the pill hides the strip again
  await page.click('.all-pinchip');
  assert.equal(await page.isVisible('.all-pins'), false);
  assert.equal((await page.textContent('.all-pinchip')).trim(), '2');
  await page.click('.all-pinchip');
  // taken down on its site: gone from the strip
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('PinnedMessageDeletedEvent', {})] });
  assert.equal(await strip(), 'YMika R. clip of the acejust now');
  // Twitch's, from its other connection: the newest; taken down by its id
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [hermes('pin-message', { id: 'tp1', pinned_by: { display_name: 'QuietKoala' }, message: { id: 'tm1', sender: { login: 'quietkoala', display_name: 'QuietKoala', chat_color: '#FF69B4' }, content: { text: 'giveaway at 500 subs' } } })] });
  assert.match(await strip(), /^TQuietKoala giveaway at 500 subsjust nowTY/);
  assert.deepEqual(await page.$eval('.all-pinchip', e => [...e.classList]), ['all-pinchip', 'ping', 'ping-twitch']);
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [hermes('unpin-message', { id: 'other' })] });
  assert.match(await strip(), /^TQuietKoala/, 'another pin\'s id: stays');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [hermes('unpin-message', { id: 'tp1' })] });
  assert.equal(await strip(), 'YMika R. clip of the acejust now');
  // one already up when ALL starts reading a chat (pinAgent): in the pill quietly, and not again when the site sends it too
  await page.evaluate(() => window.allChat.ingest('quietkoala', { s: 'kick', raw: [JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\PinnedMessageCreatedEvent', data: JSON.stringify({ message: { id: 'k7', content: 'merch is live', type: 'message', sender: { username: 'quietkoala', slug: 'quietkoala', identity: {} } } }) } } } })] }, true));
  assert.equal(await page.$eval('.all-pinchip', e => e.classList.contains('ping-kick')), false, 'already up: no ping');
  assert.equal((await page.textContent('.all-pinchip')).trim(), '2');
});

test('ALL: as it starts reading a chat it asks for a pin already up (into the pill, quietly); its text follows Chat text size, and the bigger size Chat Stage, Chat Rail or Blow up give the chat', async t => {
  const page = await allApp(t);
  await page.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab.all');
  // the Kick chat's page answers pinAgent with its pin (as Kick's chat history would)
  await page.evaluate(() => {
    const w = window.openWins().find(o => o.kind === 'chat' && o.channel === 'quietkoala');
    const pin = { s: 'kick', raw: [JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\PinnedMessageCreatedEvent', data: JSON.stringify({ message: { id: 'k7', content: 'merch is live', type: 'message', sender: { username: 'quietkoala', slug: 'quietkoala', identity: {} } } }) } } } })] };
    w.view.executeJavaScript = async js => (/pinAgent|pinnedChatMessages/.test(js) ? pin : true);
    w.ready = true; w.feedOn = false;
    window.allChat.setAll(w, true);
  });
  await page.waitForSelector('.all-pinchip:not([hidden])');
  assert.equal((await page.textContent('.all-pinchip')).trim(), '1');
  assert.equal(await page.$eval('.all-pinchip', e => e.classList.contains('ping')), false, 'already up: no ping');
  assert.equal(await page.isVisible('.all-pins'), false);
  // the text size
  const size = () => page.$eval('.all-view', e => e.style.zoom);
  assert.equal(await size(), '');
  const zoom = i => page.evaluate(i => window.chatZoomTo(i), i);   // (Chat text size: 0.6 … 1 (5), 1.1, 1.25)
  await zoom(6);
  assert.equal(await size(), '1.1');
  await page.evaluate(() => { const w = window.openWins().find(o => o.allView); w.view.style.zoom = '1.5'; });
  await page.waitForFunction(() => document.querySelector('.all-view').style.zoom === '1.65');
  await page.evaluate(() => { const w = window.openWins().find(o => o.allView); w.view.style.zoom = ''; });
  await zoom(5);
  await page.waitForFunction(() => document.querySelector('.all-view').style.zoom === '');
  // a menu in a bigger ALL still opens under what opened it
  await zoom(7);
  await page.click('.all-filt');
  const [pill, menu] = await page.evaluate(() => [document.querySelector('.all-filt').getBoundingClientRect(), document.querySelector('.all-fm').getBoundingClientRect()].map(r => ({ bottom: r.bottom, top: r.top, right: r.right })));
  assert.ok(menu.top >= pill.bottom && menu.top - pill.bottom < 12, `under the pill (${pill.bottom} → ${menu.top})`);
  assert.ok(Math.abs(menu.right - pill.right) < 8, `lined up with it (${pill.right} / ${menu.right})`);
});

test('ALL honours the chats\' settings: 7TV, BetterTTV and FrankerFaceZ emotes in messages; words you watch for (not in a muted chat); spam alerts\' tag; translating; new emotes glowing; Developer tools\' message data', async t => {
  const page = await allApp(t, { allOpen: '["s1"]', mentWords: JSON.stringify(['giveaway']), mentMuted: JSON.stringify(['quietkoala']), newEmotes: '1' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => {
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';   // (a real one: a broken picture shows its name)
    window.__seen = []; window.__tr = [];
    window.kmv = { ...(window.kmv || {}),
      emotesPick: async ch => (ch === 'tw:quietkoala' ? [{ id: 'twitch-global', label: 'Twitch', emotes: [{ name: 'Kappa', url: img, send: 'Kappa' }] },
        { id: '7tv', label: '7TV', emotes: [{ name: 'catJAM', url: img, send: 'catJAM' }] }, { id: 'bttv', label: 'BTTV', emotes: [{ name: 'monkaS', url: img, send: 'monkaS' }] }] : []),
      emotesSeen: async (ch, name) => { window.__seen.push([ch, name]); },
      translate: async texts => { window.__tr.push(...texts); return texts.map(x => (/hola/.test(x) ? { text: 'hello friends', from: 'es' } : null)); } };
    window.freshEmotes.set('tw:quietkoala', new Set(['catJAM']));
  });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'a' }, ':drift!d@d PRIVMSG #quietkoala :warming up')] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'b' }, ':drift!d@d PRIVMSG #quietkoala :catJAM this song monkaS'),
    TW({ 'display-name': 'lowtide', id: 'c' }, ':lowtide!l@l PRIVMSG #quietkoala :is the GIVEAWAY still on?')] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k1', content: 'giveaway when', type: 'message', sender: { id: 3, username: 'brightwick', slug: 'brightwick', identity: {} } })] });
  // add-on emotes: in their words, with where they come from; a new one glows until pointed at
  await page.waitForSelector('.all-list img[alt=monkaS]');
  assert.deepEqual(await page.$$eval('.all-list [data-key="twitch:b"] img', l => l.map(i => [i.alt, i.title, i.classList.contains('al-new')])), [['catJAM', 'catJAM · new', true], ['monkaS', 'monkaS · BetterTTV', false]]);
  await page.hover('.all-list [data-key="twitch:b"] img[alt=catJAM]');
  await page.waitForFunction(() => window.__seen.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__seen), [['tw:quietkoala', 'catJAM']]);
  assert.equal(await page.$eval('.all-list [data-key="twitch:b"] img[alt=catJAM]', i => i.classList.contains('al-new')), false);
  // a word you watch for: marked as to you, the word its tag; not in a chat with mentions muted
  assert.deepEqual(await lines(page).then(l => l.slice(-2)), ['al-m al-me | Tlowtide: is the GIVEAWAY still on?GIVEAWAY', 'al-m | Kbrightwick: giveaway when']);
  // spam alerts' tag, where you moderate (alerts/spam-alerts.js finds it in the chat; the same message here)
  await page.evaluate(() => window.allChat.spamTag('tw:quietkoala', 'Drift', 'catJAM  this song monkaS', 'Repeats the same message · new chatter', false));
  assert.deepEqual(await page.$eval('.all-list [data-key="twitch:b"]', e => [e.classList.contains('al-spam'), e.querySelector('.al-tag-spam').textContent, e.querySelector('.al-tag-spam').title]), [true, 'Spam?', 'Repeats the same message · new chatter']);
  await page.evaluate(() => window.allChat.spamTag('tw:quietkoala', 'nobody', 'x', 'y', true));
  // translating: from the line's menu, then with Translate new messages in every chat; the badge shows the original
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'sol', id: 'd' }, ':sol!s@s PRIVMSG #quietkoala :hola amigos')] });
  await page.hover('.all-list [data-key="twitch:d"]'); await page.click('.all-list [data-key="twitch:d"] [data-cmd="all.more"]');
  await page.click('.all-lm [data-cmd="all.menuTranslate"]');
  await page.waitForSelector('.all-list [data-key="twitch:d"] .al-tag-tr');
  assert.equal(await page.textContent('.all-list [data-key="twitch:d"] .al-txt'), 'hello friends');
  assert.equal(await page.textContent('.all-list [data-key="twitch:d"] .al-tag-tr'), 'Translated · ES');
  await page.click('.all-list [data-key="twitch:d"] .al-tag-tr');
  assert.equal(await page.textContent('.all-list [data-key="twitch:d"] .al-txt'), 'hola amigos');
  assert.equal(await page.textContent('.all-list [data-key="twitch:d"] .al-tag-tr'), 'Original · ES');
  await page.evaluate(() => { localStorage.setItem('kickMultiview.translateAll', '1'); });
  await page.evaluate(async () => { const { setTrAll } = await import('./page/chat/translate.js'); setTrAll(true); });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'sol', id: 'e' }, ':sol!s@s PRIVMSG #quietkoala :hola otra vez'), TW({ 'display-name': 'sol', id: 'f' }, ':sol!s@s PRIVMSG #quietkoala :ok')] });
  await page.waitForSelector('.all-list [data-key="twitch:e"] .al-tag-tr');
  assert.deepEqual(await page.evaluate(() => window.__tr), ['hola amigos', 'hola otra vez'], 'only words are asked for (not "ok")');
  // Developer tools: Copy message data (what ALL made of it, and the site's own line)
  await page.evaluate(() => { window.devTools.setDev(true); window.__copied = ''; navigator.clipboard.writeText = async t => { window.__copied = t; }; });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'zed', id: 'g' }, ':zed!z@z PRIVMSG #quietkoala :check this')] });
  await page.hover('.all-list [data-key="twitch:g"]'); await page.click('.all-list [data-key="twitch:g"] [data-cmd="all.more"]');
  await page.click('.all-lm [data-cmd="all.menuData"]');
  await page.waitForFunction(() => window.__copied);
  const data = JSON.parse(await page.evaluate(() => window.__copied));
  assert.equal(data.sender, 'zed'); assert.match(data.raw, /PRIVMSG #quietkoala :check this$/);
  await page.evaluate(() => window.devTools.setDev(false));
});

test('ALL: gifted subs say who got them: Twitch\'s line for each on its "gifted N subs" line (the same gift id), Kick\'s from its list; yours lit, and To you', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const N = (id, tags) => TW({ 'display-name': 'BrightWick', login: 'brightwick', id, ...tags }, ':tmi.twitch.tv USERNOTICE #quietkoala');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [N('g1', { 'msg-id': 'submysterygift', 'msg-param-mass-gift-count': '3', 'msg-param-community-gift-id': '777' }),
    N('g2', { 'msg-id': 'subgift', 'msg-param-recipient-display-name': 'LowTide', 'msg-param-recipient-user-name': 'lowtide', 'msg-param-community-gift-id': '777' }),
    N('g3', { 'msg-id': 'subgift', 'msg-param-recipient-display-name': 'Drift', 'msg-param-recipient-user-name': 'drift', 'msg-param-community-gift-id': '777' }),
    N('g4', { 'msg-id': 'subgift', 'msg-param-recipient-display-name': 'Sol', 'msg-param-recipient-user-name': 'sol' })] });
  assert.deepEqual(await lines(page), ['al-ev | TBrightWick gifted 3 subsSee it on Twitch ›2 recipients', 'al-ev | TBrightWick gifted a sub to SolSee it on Twitch ›'], 'one line for the gift; a gift of its own stays a line');
  await page.click('.al-gto');
  assert.deepEqual(await page.$$eval('.al-gl .al-gc', l => l.map(e => e.textContent)), ['LowTide', 'Drift']);
  assert.equal(await page.getAttribute('.al-gto', 'aria-expanded'), 'true');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [N('g5', { 'msg-id': 'subgift', 'msg-param-recipient-display-name': 'MeTwitch', 'msg-param-recipient-user-name': 'metwitch', 'msg-param-community-gift-id': '777' })] });
  assert.deepEqual(await page.$$eval('.al-gl .al-gc', l => l.map(e => e.textContent + (e.classList.contains('me') ? '*' : ''))), ['LowTide', 'Drift', 'MeTwitch*'], 'still open, yours lit');
  assert.match(await page.textContent('.al-gift'), /To you/);
  await page.click('.al-gto');
  assert.equal(await page.locator('.al-gl .al-gc').count(), 0, 'closed: the names go, the button stays');
  // Kick: its gift has the names
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('GiftedSubscriptionsEvent', { gifted_usernames: ['mekick', 'Koala2'], gifter_username: 'Yajeli', correlation_id: 'c1' })] });
  assert.match((await lines(page)).pop(), /^al-ev \| KYajeli gifted 2 subsSee it on Kick ›2 recipientsTo you$/);
});

test('ALL: pressing or typing in it is seeing its chats: their alerts stop (the tabs\' and the window\'s glow); one that comes while you\'re in it only glows a moment', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const glow = () => page.$$eval('#stage .win.chat', l => l.map(e => ['al-1', 'al-2', 'al-3', 'al-brief'].filter(c => e.classList.contains(c)).join(' ')).filter(Boolean));
  await page.evaluate(() => window.raiseAlert('tw:quietkoala', 'mention'));
  assert.deepEqual(await glow(), ['al-1', 'al-1'], 'its hidden tab, and the window (its ALL) show it');
  await page.click('.all-list');
  assert.deepEqual(await glow(), [], 'seen in ALL');
  assert.equal(await page.evaluate(() => window.openWins().find(o => o.channel === 'tw:quietkoala').alert), null);
  // while you're in ALL (its box): a moment's glow, not one that stays
  await page.focus('.all-in');
  await page.evaluate(() => window.raiseAlert('quietkoala', 'mention'));
  assert.deepEqual(await page.evaluate(() => window.openWins().filter(o => o.kind === 'chat').map(o => !!o.alert)), [false, false]);
  await page.locator('.all-in').blur();
});

test('ALL: the send site\'s modes above the box; slow mode counts down after you send; followers or subscribers only, or a ban, close the box and say why; a moderator is exempt', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push([m.channel, text]); return 'sent'; }; }, LIVE);
  const bar = () => page.$eval('.all-modes', e => (e.hidden ? '' : e.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(await bar(), '', 'no modes: no bar');
  // Kick (the send site): slow mode and emotes only, as its chatroom said; you a follower, not a mod
  await page.evaluate(() => window.allChat.setModes('quietkoala', { modes: { slow: 3, followers: null, subs: false, emotes: true }, me: { signedIn: true, follower: true, followedAt: 1 } }));
  assert.equal(await bar(), 'Slow 3sEmotes only');
  await page.fill('.all-in', 'gg');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  await page.waitForSelector('.all-modes.waiting');
  assert.match(await bar(), /^Slow mode · you can send in [123]s/);
  assert.equal(await page.getAttribute('.all-send-b', 'data-wait') !== '', true);
  await page.fill('.all-in', 'again'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__sends.length), 1, 'not while waiting');
  await page.waitForFunction(() => !document.querySelector('.all-modes.waiting'), null, { timeout: 5000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 2);
  // as it changes live: followers only for 10 minutes (Kick's event), and you only followed a minute ago
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, follower: true, followedAt: Date.now() - 60000 } }));
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatroomUpdatedEvent', { slow_mode: { enabled: false }, followers_mode: { enabled: true, min_duration: 10 }, subscribers_mode: { enabled: false }, emotes_mode: { enabled: false } })] });
  assert.match(await page.getAttribute('.all-in', 'placeholder'), /^Followers only · you can chat in 9 min$/);
  assert.equal(await page.isDisabled('.all-in'), true);
  assert.match(await bar(), /^Followers only · you can chat in 9 minFollowers 10 min$/);
  // subscribers only, not subscribed; then a ban
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatroomUpdatedEvent', { followers_mode: { enabled: false }, subscribers_mode: { enabled: true } })] });
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Subscribers only · subscribe on Kick to chat');
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, banned: true } }));
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'You’re banned from this Kick chat');
  // a moderator: the modes show, quieter, and don't apply
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, mod: true } }));
  assert.equal(await page.isDisabled('.all-in'), false);
  assert.equal(await bar(), 'Subscribers onlyexempt');
  // Twitch (Tab): its ROOMSTATE, its own modes; YouTube's words where its box would be
  await page.evaluate(() => window.allChat.setModes('tw:quietkoala', { me: { signedIn: true, follower: false } }));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'followers-only': '0', 'room-id': '1' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')] });
  await page.focus('.all-in'); await page.keyboard.press('Tab');
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Followers only · follow on Twitch to chat');
  assert.equal(await bar(), 'Followers only · follow on Twitch to chatFollowers only');
  await page.evaluate(() => window.allChat.setModes('yt:quietkoala', { blocked: 'Sign in to chat' }));
});

test('ALL: where you moderate Twitch, its moderation lines say who (its moderation actions, before or after its chat\'s line); a deleted message says by whom; a mode changed is a line', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => { window.allChat.modKnown.set('tw:quietkoala', true); window.allChat.syncMod(); });
  const act = (moderation_action, args, extra = {}) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'moderation_action', data: { moderation_action, args, created_by: 'NightOwl', ...extra } }) } });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'loudmouth99', id: 'e' }, ':loudmouth99!l@l PRIVMSG #quietkoala :trash lol'), TW({ 'display-name': 'rude', id: 'g' }, ':rude!r@r PRIVMSG #quietkoala :ugh')] });
  // the chat's line first, then who
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'ban-duration': '600' }, ':tmi.twitch.tv CLEARCHAT #quietkoala :loudmouth99')] });
  assert.equal((await lines(page)).pop(), 'al-ev | Tloudmouth99 was timed out · 10m');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [act('timeout', ['loudmouth99', '600'])] });
  assert.equal((await lines(page)).pop(), 'al-ev | TNightOwl timed out loudmouth99 · 10m');
  // who first, then the chat's line
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [act('ban', ['rude'], { target_user_login: 'rude' })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'room-id': '1' }, ':tmi.twitch.tv CLEARCHAT #quietkoala :rude')] });
  assert.equal((await lines(page)).pop(), 'al-ev | TNightOwl banned rude');
  // a deleted message: by whom (either order)
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'h' }, ':drift!d@d PRIVMSG #quietkoala :oops'), TW({ 'target-msg-id': 'h' }, ':tmi.twitch.tv CLEARMSG #quietkoala :oops'), act('delete', ['drift', 'oops', 'h'])] });
  assert.match(await page.textContent('.all-list [data-key="twitch:h"]'), /Deleted by NightOwl/);
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'i' }, ':drift!d@d PRIVMSG #quietkoala :again'), act('delete', ['drift', 'again', 'i']), TW({ 'target-msg-id': 'i' }, ':tmi.twitch.tv CLEARMSG #quietkoala :again')] });
  assert.match(await page.textContent('.all-list [data-key="twitch:i"]'), /Deleted by NightOwl/);
  // a mode changed; the chat cleared, by whom
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [act('slow', ['30']), act('followersoff', []), act('somethingnew', [])] });
  assert.deepEqual((await lines(page)).slice(-2), ['al-ev | TNightOwl turned on slow mode · 30s', 'al-ev | TNightOwl turned off followers-only']);
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [act('clear', []), TW({ 'tmi-sent-ts': String(Date.now()) }, ':tmi.twitch.tv CLEARCHAT #quietkoala')] });
  assert.equal((await lines(page)).pop(), 'al-ev | TNightOwl cleared Twitch\'s chat');
});

test('ALL: they raid someone: a line with Open (Opened once it is)', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:pixelmoth', true));   // (a tab you don't watch: not followed)
  assert.equal((await lines(page)).pop(), 'al-ev | Tquietkoala raided pixelmoth on TwitchOpen ›');
  await page.click('[data-cmd="all.raidOpen"]');
  assert.equal((await lines(page)).pop(), 'al-ev | Tquietkoala raided pixelmoth on TwitchOpened');
  assert.ok(await page.evaluate(() => window.openWins().some(w => w.channel === 'tw:pixelmoth')));
});

test('ALL: :name suggests the send site\'s emotes (with pictures), the smiley opens its picker; picking one locks the box to that site and sends it as the site writes it', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    const img = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    window.__asked = [];
    window.kmv = { ...(window.kmv || {}), emotesPick: async ch => { window.__asked.push(ch); return ch === 'quietkoala'
      ? [{ id: 'kick-channel', label: 'Channel', emotes: [{ name: 'koalaHype', url: img, send: '[emote:1:koalaHype]', subs: true }, { name: 'koalaWave', url: img, send: '[emote:2:koalaWave]' }] },
         { id: 'kick-global', label: 'Kick', emotes: [{ name: 'KEKW', url: img, send: '[emote:9:KEKW]' }] }]
      : [{ id: 'twitch-global', label: 'Twitch', emotes: [{ name: 'Kappa', url: img, send: 'Kappa' }] }]; } };
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push([m.channel, text]); return 'sent'; };
  }, LIVE);
  // :name
  await page.focus('.all-in');
  await page.keyboard.type('gg :ke');
  await page.waitForSelector('.all-at:not([hidden]) .all-emi');
  assert.deepEqual(await page.$$eval('.all-at .all-emi', l => l.map(b => b.textContent)), ['KEKWKick']);
  assert.match(await page.textContent('.all-at-h'), /Kick emotes/);
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('.all-in'), 'gg KEKW ');
  assert.match(await page.textContent('.all-rb'), /Emotes from Kick · sends on Kick only/, 'locked to Kick');
  await page.keyboard.press('Tab');
  assert.match(await page.textContent('#msg'), /Locked to Kick while using its emotes/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends[0]), ['quietkoala', 'gg [emote:9:KEKW]'], 'as Kick writes it');
  assert.match(await page.textContent('.al-mine'), /gg KEKW/, 'your line shows its name');
  assert.equal(await page.isVisible('.all-rb'), false, 'sent: unlocked');
  // the smiley: tabs, search, a pick
  await page.click('.all-emo-b');
  await page.waitForSelector('.all-ep .all-ep-e');
  assert.deepEqual(await page.$$eval('.all-ep-tabs button', l => l.map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['Channel*', 'Kick']);
  assert.deepEqual(await page.$$eval('.all-ep-e', l => l.map(b => b.title)), ['koalaHype (subscribers)', 'koalaWave']);
  await page.fill('.all-ep-q', 'wave');
  assert.deepEqual(await page.$$eval('.all-ep-e', l => l.map(b => b.title)), ['koalaWave']);
  await page.fill('.all-ep-q', 'zzz');
  assert.match(await page.textContent('.all-ep-grid'), /No Kick emote matches “zzz”/);
  await page.fill('.all-ep-q', '');
  await page.click('.all-ep-tabs button >> text=Kick');
  await page.click('.all-ep-e');
  assert.equal(await page.inputValue('.all-in'), 'KEKW ');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-ep'), false, 'Esc closes it');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-rb'), false, 'Esc: unlocked');
  // on Twitch an emote is its name; a word that only looks like an emote stays a word
  await page.fill('.all-in', '');
  await page.keyboard.press('Tab');
  await page.keyboard.type(':kap');
  await page.waitForSelector('.all-at:not([hidden]) .all-emi');
  await page.keyboard.press('Tab');
  await page.keyboard.type('KEKW');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__sends[1]), ['tw:quietkoala', 'Kappa KEKW']);
  assert.deepEqual(await page.evaluate(() => window.__asked), ['quietkoala', 'tw:quietkoala'], 'each site\'s asked once');
});

test('ALL: the send button: there once there\'s something to send, says where, sends like Enter, a spinner (and no second send) while sending', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    window.__sends = []; window.allChat.sender.send = (m, text) => new Promise(r => { window.__sends.push([m.channel, text]); window.__done = r; }); }, LIVE);
  const b = () => page.$eval('.all-send-b', e => ({ off: e.disabled, busy: e.classList.contains('busy'), title: e.title || e.dataset.tipTitle || '' }));
  assert.deepEqual(await b(), { off: true, busy: false, title: 'Send on Kick (Enter)' }, 'nothing to send yet');
  await page.fill('.all-in', '   ');
  assert.equal((await b()).off, true, 'only spaces');
  await page.fill('.all-in', 'gg everyone');
  assert.equal((await b()).off, false);
  await page.click('.all-send-b');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends[0]), ['quietkoala', 'gg everyone']);
  assert.deepEqual(await b(), { off: true, busy: true, title: 'Sending…' });
  assert.equal(await page.evaluate(() => document.activeElement.className), 'all-in', 'the keyboard back in the box');
  await page.fill('.all-in', 'next one');
  assert.equal((await b()).off, true, 'one at a time');
  await page.evaluate(() => window.__done('sent'));
  await page.waitForFunction(() => !document.querySelector('.all-send-b').disabled);
  assert.deepEqual(await b(), { off: false, busy: false, title: 'Send on Kick (Enter)' });
  await page.keyboard.press('Tab');
  assert.equal((await b()).title, 'Send on Twitch (Enter)', 'the site it sends on');
});

test('ALL: with Settings › Chat › Channel name in chat boxes, its box says what the setting\'s text makes of the channel, as the sites\' boxes do', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  const ph = () => page.getAttribute('.all-in', 'placeholder');
  assert.equal(await ph(), 'Send a message on Kick');
  await page.evaluate(() => { const c = document.querySelector('#chatNameSet'); c.checked = true; c.dispatchEvent(new Event('change')); });
  assert.equal(await ph(), 'quietkoala');
  await page.evaluate(() => { const f = document.querySelector('#chatNameText'); f.value = 'Chat in {channel}'; f.dispatchEvent(new Event('input')); });
  await page.waitForFunction(() => document.querySelector('.all-in').placeholder === 'Chat in quietkoala');
  await page.focus('.all-in'); await page.keyboard.press('Tab');
  assert.equal(await ph(), 'Chat in quietkoala', 'the same on Twitch (the picker says the site)');
  assert.equal(await page.textContent('.all-pick .pi'), 'T');
  await page.evaluate(() => { const c = document.querySelector('#chatNameSet'); c.checked = false; c.dispatchEvent(new Event('change')); });
  assert.equal(await ph(), 'Send a message on Twitch', 'off: the usual words');
});
