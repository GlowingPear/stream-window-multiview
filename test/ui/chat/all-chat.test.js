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
  // its corners still resize the window: the handles are over ALL, not under it
  assert.deepEqual(await page.$eval('#stage .win.chat:not(.tab-hidden)', w => { const r = w.getBoundingClientRect(), at = (x, y) => document.elementFromPoint(x, y).className;
    return [at(r.right - 3, r.bottom - 3), at(r.left + 3, r.bottom - 3)]; }), ['rz rz-se', 'rz rz-sw']);
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
  // the chats are still read while a site's tab shows (as its chat page says, __kmv:feed): back on ALL, nothing is missing
  await page.evaluate(async ([ch, raw]) => {
    const { siteMessage } = await import('./page/shared/incoming.js'), w = window.openWins().find(o => o.kind === 'chat' && o.channel === ch);
    siteMessage(w, w.view, '__kmv:feed ' + JSON.stringify({ s: 'kick', raw: [raw] }));
  }, ['quietkoala', KF('ChatMessageEvent', { id: 'k-while', content: 'said while Twitch showed', type: 'message', sender: { id: 3, username: 'tide', identity: {} } })]);
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  assert.equal((await lines(page)).length, 3, 'what came before is still there, and what was said meanwhile');
  assert.match((await lines(page))[2], /tide: said while Twitch showed/);
});

test('ALL: what the chats already show as it starts reading them comes in too, among the others by time, once each; asked of each chat as ALL starts', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const at = s => new Date(Date.now() - s * 1000).toISOString();
  const km = (id, content, secs, who = 'tide') => KF('ChatMessageEvent', { id, content, type: 'message', created_at: at(secs), sender: { id: 3, username: who, identity: {} } });
  // a live one first, then what the chats showed before
  await feed(page, 'quietkoala', { s: 'kick', raw: [km('k-live', 'just now', 1)] });
  await page.evaluate(([k, tw]) => { window.allChat.ingest('quietkoala', k, true, true); window.allChat.ingest('tw:quietkoala', tw, true, true); }, [
    { s: 'kick', raw: [km('k-old', 'a minute ago', 60), km('k-live', 'just now', 1), JSON.stringify({ push: { pub: { data: { event: 'App\\Events\\MessageDeletedEvent', data: '{"message":{"id":"k-live"}}' } } } })] },
    { s: 'twitch', raw: [TW({ 'display-name': 'tinroof', id: 't-old', 'tmi-sent-ts': String(Date.now() - 30000) }, ':tinroof!t@t PRIVMSG #quietkoala :half a minute ago')] }]);
  assert.deepEqual(await lines(page), ['al-m | Ktide: a minute ago', 'al-m | Ttinroof: half a minute ago', 'al-m | Ktide: just now'], 'by time; one it had: once; nothing but messages from them (not a deletion)');
  assert.equal(await page.isVisible('.all-empty'), false);
  assert.equal(await page.$eval('.all-list', l => l.scrollHeight - l.scrollTop - l.clientHeight < 2), true, 'at the newest');
  // asked of each chat as ALL starts reading it (with the pin, badges and modes)
  const asked = await page.evaluate(async () => {
    const { feedReady } = await import('./page/chat/all-chat.js');
    const w = window.openWins().find(o => o.channel === 'quietkoala'), js = [];
    feedReady(w, { executeJavaScript: async code => { js.push(code); return null; }, getWebContentsId: () => 1 });
    await new Promise(r => setTimeout(r, 50));
    return js.some(c => c.startsWith('(async function shownAgent('));
  });
  assert.equal(asked, true);
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
    'al-m al-bot | TNightbot: hiddenShow',
    'al-m al-rep al-bot | ↩ replying to youTkoala_helper: hiddenTO YOUShow',
    'al-m | Tloudmouth99: trash lol',
    'al-m al-hl | Thappy: HAPPY BIRTHDAYHighlighted100 bits',
    'al-ev | TJean subscribedlove it',
    'al-m | Kratchetkid: nobody likes you']);
  // Show opens one bot's message, Hide closes it
  await page.click('.all-list .al-bot >> nth=0 >> .al-show');
  assert.match((await lines(page))[2], /Nightbot: Follow the socials!Hide/);
  await page.click('.all-list .al-bot >> nth=0 >> .al-show');
  assert.match((await lines(page))[2], /hidden/);
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
  // the chat bot lists changed: the messages already here checked again (Settings › Chat › Chat bots, the streamer's own bots)
  await page.evaluate(async () => { const { alerts, saveAlerts } = await import('./page/alerts/alerts.js'), { SmvSpam } = await import('./page/alerts/spam.js'); alerts.mention.bots = [...(alerts.mention.bots || SmvSpam.BOTS), 'loudmouth99']; saveAlerts(); });
  assert.equal((await lines(page))[4], 'al-m al-bot | Tloudmouth99: hiddenShow');
  await page.evaluate(async () => { const { alerts, saveAlerts } = await import('./page/alerts/alerts.js'); alerts.mention.bots = alerts.mention.bots.filter(b => b !== 'loudmouth99'); saveAlerts(); });
  assert.equal((await lines(page))[4], 'al-m | Tloudmouth99: trash lol');
  await page.evaluate(() => window.linkedApi.setStreamerOpt('s1', 'bots', [{ p: 'kick', name: 'ratchetkid' }]));
  assert.equal((await lines(page))[7], 'al-m al-bot | Kratchetkid: hiddenShow');
  await page.evaluate(() => window.linkedApi.setStreamerOpt('s1', 'bots', [{ p: 'twitch', name: 'koala_helper' }]));
  assert.equal((await lines(page))[7], 'al-m | Kratchetkid: nobody likes you');
  // Bots and Events changed in the other window: here too
  const fromOther = (k, v) => page.evaluate(([k, v]) => { localStorage.setItem('kickMultiview.' + k, v); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.' + k, newValue: v })); }, [k, v]);
  await fromOther('allBots', 'shown');
  assert.match((await lines(page))[2], /Nightbot: Follow the socials!$/);
  await fromOther('allEvents', 'hidden');
  assert.ok(!(await lines(page)).some(l => l.startsWith('al-ev')), 'events hidden');
  await fromOther('allBots', 'hidden'); await fromOther('allEvents', 'short');
  assert.match((await lines(page))[2], /hidden/);
  assert.equal((await lines(page))[6], 'al-ev | TJean subscribedlove it');
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

test('ALL: new messages in its hidden site tabs count as read while it shows (Count new messages in chats you can\'t see); /poll on Kick opens in Kick\'s own chat', async t => {
  const page = await allApp(t, { allOpen: '["s1"]', chatCounts: '1' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => window.chatNew('tw:quietkoala', 3));
  assert.equal(await page.evaluate(() => window.chatNewFor('tw:quietkoala')), 0, 'ALL shows them');
  await page.evaluate(() => window.allChat.setAll(window.openWins().find(o => o.channel === 'quietkoala'), false));
  await page.evaluate(() => window.chatNew('tw:quietkoala', 3));
  assert.equal(await page.evaluate(() => window.chatNewFor('tw:quietkoala')), 3, 'ALL off: its hidden tab counts');
  // Kick's /poll from ALL: Kick's own tab, its poll form there; nothing sent
  await page.evaluate(() => window.allChat.setAll(window.openWins().find(o => o.channel === 'quietkoala'), true));
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push(text); return 'sent'; }; }, LIVE);
  await page.fill('.all-in', '/poll Best map?'); await page.keyboard.press('Enter');
  await page.waitForSelector('.kpoll');
  assert.deepEqual(await tabs(page), ['ALL', 'K*', 'T', 'Y']);
  assert.equal(await page.$eval('.kpoll [name="subject"]', e => e.value), 'Best map?');
  assert.deepEqual(await page.evaluate(() => window.__sends), []);
});

test('ALL: the window\'s @ button (the desktop app\'s) turns mentions off and on for every chat of theirs it reads; only its own chat with ALL off', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const at = () => page.evaluate(() => window.chatMentions.atChannels(window.openWins().find(o => o.channel === 'quietkoala')));
  const press = () => page.evaluate(() => window.chatMentions.toggleChatMentions(window.chatMentions.atChannels(window.openWins().find(o => o.channel === 'quietkoala'))));
  const muted = () => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.mentMuted') || '[]').sort());
  assert.deepEqual((await at()).sort(), ['quietkoala', 'tw:quietkoala'], 'YouTube isn\'t covered by mentions');
  await press();
  assert.deepEqual(await muted(), ['quietkoala', 'tw:quietkoala']);
  assert.match(await page.textContent('#msg'), /Mentions off for quietkoala's chats/);
  await page.evaluate(() => window.chatMentions.toggleChatMentions('tw:quietkoala'));   // one of them on again (the search box's)
  await press();
  assert.deepEqual(await muted(), ['quietkoala', 'tw:quietkoala'], 'not all off: all off');
  await press();
  assert.deepEqual(await muted(), []);
  await page.evaluate(() => window.allChat.setAll(window.openWins().find(o => o.channel === 'quietkoala'), false));
  assert.deepEqual(await at(), ['quietkoala'], 'ALL off: its own chat');
});

test('ALL: the sites\' own badges (a channel\'s sub badge for their months, Kick\'s picked ones), with the sites\' words; ALL\'s icons until the pictures come; a channel\'s badges and emotes go with its last chat, groups several chats have kept once', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  await page.evaluate(img => {
    const set = (id, label, names) => ({ id, label, emotes: names.map(name => ({ name, url: img, send: name })) });
    window.kmv = { ...(window.kmv || {}), emotesPick: async ch => (ch === 'tw:quietkoala' ? [set('twitch-global', 'Twitch', ['Kappa']), set('7tv', '7TV', ['catJAM'])] : [set('kick-global', 'Kick', ['KEKW']), set('7tv', '7TV', ['catJAM'])]) };
  }, img);
  await page.route('https://ext.cdn.kick.com/**', r => r.fulfill({ body: Buffer.from(img.split(',')[1], 'base64'), contentType: 'image/gif' }));   // (Kick's badge pictures: a stand-in)
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'a', badges: 'subscriber/24,moderator/1,glhf-pledge/1', 'badge-info': 'subscriber/27' }, ':drift!d@d PRIVMSG #quietkoala :hi')] });
  const kickSender = { id: 2, username: 'Lowtide', slug: 'lowtide', identity: { badges: [{ type: 'moderator', text: 'Moderator', sort_order: 3 }, { type: 'subscriber', count: 4, sort_order: 9 }, { type: 'founder', text: 'Founder', sort_order: 6 }], badges_v2: [{ name: 'GoldenK', image_url: 'https://ext.cdn.kick.com/chat/badges/k.png', selected: true, sort_order: 4 }, { name: 'level', image_url: 'https://ext.cdn.kick.com/chat/badges/lv.png', selected: false, sort_order: 1 }] } };
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'k1', content: 'yo', type: 'message', sender: kickSender })] });
  const badges = () => page.$$eval('.all-list .al-m .al-who', l => l.map(w => [...w.querySelectorAll('.al-b, .al-bi')].map(b => b.tagName === 'IMG' ? `img ${b.getAttribute('src').replace(/^data:[^#]*|^https:\/\/ext\.cdn\.kick\.com\/chat\/badges\//, '')} ${b.title}` : b.className.replace('al-b al-b-', 'icon '))));
  assert.deepEqual(await badges(), [['icon sub', 'icon mod'], ['icon mod', 'img k.png GoldenK', 'icon founder', 'icon sub']], 'before the pictures: ALL\'s icons, in Kick\'s order (its picked ones came with theirs; not a level it didn\'t pick)');
  // the pictures come: Twitch's (the channel's sub badge, Twitch's own moderator), Kick's sub badges by months
  await page.evaluate(img => {
    window.allChat.gotBadges('tw:quietkoala', { twitch: { own: { 'subscriber/24': { url: img + '#sub24', title: '2-Year Subscriber' } }, global: { 'moderator/1': { url: img + '#mod', title: 'Moderator' } } } });
    window.allChat.gotBadges('quietkoala', { kick: { subs: [{ months: 1, url: img + '#s1' }, { months: 3, url: img + '#s3' }, { months: 6, url: img + '#s6' }] } });
  }, img);
  assert.deepEqual(await badges(), [['img #sub24 27-Month Subscriber (2-Year Badge)', 'img #mod Moderator'], ['icon mod', 'img k.png GoldenK', 'icon founder', 'img #s3 4-Month Subscriber']], 'as the sites say them; one without a picture: left out');
  assert.deepEqual(await page.$$eval('.all-list .al-m:last-child .al-b', l => l.map(b => b.title)), ['Moderator', 'Founder'], 'Kick\'s names for its own');
  // Kick's own icons, once its chat has drawn them: cleaned to shapes and colours, a gift by how many (30: Gift25)
  const kickLine = sender => KF('ChatMessageEvent', { id: 'k-' + sender.username, content: 'hi', type: 'message', sender });
  await feed(page, 'quietkoala', { s: 'kick', raw: [kickLine({ id: 4, username: 'Gifty', slug: 'gifty', identity: { badges: [{ type: 'sub_gifter', text: 'Sub Gifter', count: 30, sort_order: 8 }, { type: 'founder', text: 'Founder', sort_order: 6 }],
    badges_v2: [{ name: 'level', image_url: 'https://ext.cdn.kick.com/chat/badges/lv.png', metadata: { level: 24 }, selected: true, sort_order: 1 }] } })] });
  const giftyBadges = () => page.$$eval('.all-list [data-key="kick:k-Gifty"] .al-who > :not(.pi)', l => l.map(b => b.className + ' ' + (b.title || b.dataset.tipTitle || '')));
  assert.deepEqual(await giftyBadges(), ['al-bi Level 24', 'al-b al-b-founder Founder', 'al-b al-b-gifter Sub Gifter'], 'before Kick\'s icons: its level\'s picture, ALL\'s icons');
  const cleaned = await page.evaluate(() => {
    window.__ran = 0;
    window.allChat.gotKickIcons({ Gift25: '<svg data-ds-icon="Gift25" viewBox="0 0 20 20" width="20" class="x" onload="window.__ran++"><script>window.__ran++</script><path d="M1 1h18v18H1z" fill="#53fc18" style="fill:red" onclick="window.__ran++"/><a href="javascript:window.__ran++"><path d="M0 0"/></a><use href="https://evil/x.svg#a"/><path fill="url(https://evil/x)" d="M2 2"/></svg>',
      founder: '<svg viewBox="0 0 20 20"><defs><linearGradient id="g1"><stop stop-color="#feb635"/></linearGradient></defs><circle cx="10" cy="10" r="9" fill="url(#g1)"/></svg>', Level24: '<svg viewBox="0 0 20 20"><path d="M1 1h2v2H1z"/></svg>', 'bad key!': '<svg/>', moderator: 'not svg' });
    return { gift: window.allChat.kickIcons.get('Gift25'), keys: [...window.allChat.kickIcons.keys()], ran: window.__ran };
  });
  assert.equal(cleaned.gift, '<svg viewBox="0 0 20 20"><path d="M1 1h18v18H1z" fill="#53fc18"/><path d="M2 2"/></svg>', 'only shapes and colours: no script, handler, style, link or outside address');
  assert.deepEqual(cleaned.keys, ['Gift25', 'founder', 'Level24']);
  assert.equal(cleaned.ran, 0);
  assert.deepEqual(await giftyBadges(), ['al-bk Level 24', 'al-bk Founder', 'al-bk Sub Gifter'], 'Kick\'s own icons, in its order');
  // Kick's OG icon draws its shapes twice (<use>), and its page writes xlink:href without saying what xlink is: kept, from
  // inside the icon only
  const og = await page.evaluate(() => {
    window.allChat.gotKickIcons({ og: '<svg viewBox="0 0 20 20" data-ds-icon="OGBadge"><use xlink:href="#OGBadge__a" fill="url(#OGBadge__b)"/><use href="#x" xlink:href="https://evil/x.svg#a"/><defs><linearGradient id="OGBadge__b"><stop stop-color="#00fff2"/></linearGradient><path id="OGBadge__a" d="M1 1h4v4H1z"/></defs></svg>' });
    return window.allChat.kickIcons.get('og');
  });
  assert.equal(og, '<svg viewBox="0 0 20 20"><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#OGBadge__a" fill="url(#OGBadge__b)"/><defs><linearGradient id="OGBadge__b"><stop stop-color="#00fff2"/></linearGradient><path id="OGBadge__a" d="M1 1h4v4H1z"/></defs></svg>');
  // Twitch's own kept once: a second Twitch chat's answer without them still finds them
  await page.evaluate(() => window.allChat.gotBadges('tw:quietkoala', { twitch: { own: {} } }));
  assert.deepEqual((await badges())[0], ['icon sub', 'img #mod Moderator']);
  // the emotes several chats have (the streamer's 7TV set on both sites): one copy
  const sharedSet = () => page.evaluate(async () => { const c = window.allEmotes.emoteCache; const a = await c.get('quietkoala'), b = await c.get('tw:quietkoala'); return a && b ? [a[1] === b[1], a[0] === b[0]] : null; });
  assert.deepEqual(await sharedSet(), [true, false], 'the 7TV set once; each site\'s own set its own');
  // the streamer's window closed: their badges and emotes go; Twitch's own too, with no Twitch chat open
  await page.click('#stage .win.chat:not(.tab-hidden) button.x');
  await page.waitForFunction(() => !document.querySelector('#stage .win.chat'));
  assert.deepEqual(await page.evaluate(() => [window.allChat.badgePics.size, window.allEmotes.emoteCache.size, window.allChat.twBadges()]), [0, 0, null]);
});

test('ALL has the sites\' chats\' extras: links open in your browser; the line menu\'s link, emote and selected-text items, both copies, translating its site\'s chat; the emote card on hover; Copy message HTML; Blow up on a click', async t => {
  const page = await allApp(t, { allOpen: '["s1"]', emotePreview: '1', chatBlowup: '1' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => {
    window.__opened = []; window.open = url => { window.__opened.push(url); return null; };
    window.__copied = []; navigator.clipboard.writeText = async x => { window.__copied.push(x); };
    window.__saved = []; window.kmv = { ...(window.kmv || {}), emoteDownload: async (url, name) => { window.__saved.push([url, name]); return { saved: true }; }, translate: async texts => texts.map(() => ({ text: 'hello', from: 'es' })) };
  });
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  await page.route('https://static-cdn.jtvnw.net/**', r => r.fulfill({ body: gif, contentType: 'image/gif' }));   // (Twitch's emote pictures: a stand-in)
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'a', emotes: '25:0-4' }, ':drift!d@d PRIVMSG #quietkoala :Kappa clip at https://clips.twitch.tv/BraveOwl-abc, nice')] });
  // a link: shown as one, opens in the browser (without the comma after it)
  assert.equal(await page.getAttribute('.all-list .al-link', 'href'), 'https://clips.twitch.tv/BraveOwl-abc');
  await page.click('.all-list .al-link');
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://clips.twitch.tv/BraveOwl-abc']);
  // without https://: www.…, or a name with a usual ending (and its path), opened as https://; not an address or a number
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'a2' }, ':drift!d@d PRIVMSG #quietkoala :socials: kick.com/quietkoala, www.koala.gg! mail me@koala.com v1.2.3')] });
  assert.deepEqual(await page.$$eval('.all-list .al-m:last-child .al-link', l => l.map(a => [a.textContent, a.getAttribute('href')])), [['kick.com/quietkoala', 'https://kick.com/quietkoala'], ['www.koala.gg', 'https://www.koala.gg']]);
  // right-click the link: its items
  await page.click('.all-list .al-link', { button: 'right' });
  const items = () => page.$$eval('.all-lm .all-li', l => l.map(b => b.textContent.trim()));
  assert.deepEqual((await items()).slice(0, 2), ['Open link in your browser', 'Copy link address']);
  assert.doesNotMatch(await page.textContent('.all-lm'), /false|null|undefined/, 'only what applies');
  await page.click('.all-lm [data-cmd="all.menuLinkCopy"]');
  assert.deepEqual(await page.evaluate(() => window.__copied), ['https://clips.twitch.tv/BraveOwl-abc']);
  // right-click the emote: its items; Save asks for the bigger picture
  await page.click('.all-list img.al-e', { button: 'right' });
  assert.deepEqual((await items()).slice(0, 4), ['Copy emote text', 'Save image as…', 'Copy image', 'Copy image address']);
  await page.click('.all-lm [data-cmd="all.menuEmoteSave"]');
  await page.waitForFunction(() => window.__saved.length);
  assert.deepEqual(await page.evaluate(() => window.__saved[0]), ['https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0', 'Kappa']);
  // the emote card on hover (Emote preview on hover is on)
  await page.hover('.all-list img.al-e');
  await page.waitForSelector('.all-ecard:not([hidden])');
  assert.equal(await page.textContent('.all-ecard .all-enm'), 'Kappa');
  assert.deepEqual(await page.$$eval('.all-ecard .all-eacts button', l => l.map(b => b.textContent)), ['Copy name', 'Copy image', 'Download']);
  await page.mouse.move(5, 5); await page.waitForSelector('.all-ecard', { state: 'hidden' });
  // words selected: Copy, Translate, Search
  await page.evaluate(() => { const t = document.querySelector('.all-list .al-txt'), r = document.createRange(); r.selectNodeContents(t.lastChild); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.click('.all-list .al-txt', { button: 'right' });
  const sel = await items();
  assert.ok(sel.includes('Copy') && sel.some(x => /^Translate “.*” to /.test(x)) && sel.some(x => /^Search Google for “/.test(x)), sel.join(' | '));
  await page.click('.all-lm [data-cmd="all.menuSelSearch"]');
  assert.match((await page.evaluate(() => window.__opened)).pop(), /^https:\/\/www\.google\.com\/search\?q=/);
  await page.evaluate(() => getSelection().removeAllRanges());
  // both copies
  await page.click('.all-list .al-txt', { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuCopyPlain"]');
  await page.click('.all-list .al-txt', { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuCopy"]');
  assert.deepEqual((await page.evaluate(() => window.__copied)).slice(-2), ['clip at https://clips.twitch.tv/BraveOwl-abc, nice', 'Kappa clip at https://clips.twitch.tv/BraveOwl-abc, nice']);
  // translate its site's chat: every Twitch line here; Translate new messages too; Stop translating
  await page.click('.all-list .al-txt', { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuTranslateChat"]');
  await page.waitForSelector('.all-list .al-tag-tr');
  await page.click('.all-list .al-txt', { button: 'right' });
  assert.equal(await page.isVisible('.all-lm [data-cmd="all.menuTranslateStop"]'), true);
  await page.click('.all-lm [data-cmd="all.menuTranslateAuto"]');
  await page.click('.all-list .al-txt', { button: 'right' });
  assert.equal((await page.textContent('.all-lm [data-cmd="all.menuTranslateAuto"]')).trim(), 'Stop translating new messages');
  await page.click('.all-lm [data-cmd="all.menuTranslateStop"]');
  assert.equal(await page.textContent('.all-list .al-tag-tr'), 'Original · ES');
  // Developer tools: Copy message HTML, from its site's chat
  await page.evaluate(() => { window.devTools.setDev(true); const w = window.openWins().find(o => o.channel === 'tw:quietkoala'); w.view.executeJavaScript = async js => (/messageHtml|outerHTML/.test(js) ? '<div class="chat-line__message">…</div>' : true); });
  await page.click('.all-list .al-txt', { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuHtml"]');
  await page.waitForFunction(() => window.__copied.some(x => x.startsWith('<div')));
  await page.evaluate(() => window.devTools.setDev(false));
  // Blow up chat: a click into ALL blows its window up
  await page.mouse.move(5, 5); await page.waitForSelector('.all-ecard', { state: 'hidden' });
  await page.click('.all-list', { position: { x: 20, y: 240 } });
  assert.equal(await page.$eval('#stage .win.chat:not(.tab-hidden)', e => e.classList.contains('blown')), true);
});

test('ALL: on or off for each linked streamer (their card), over Settings › Linked channels', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => window.linkedApi.setStreamerOpt('s1', 'allTab', false));
  assert.deepEqual(await tabs(page), ['K*', 'T', 'Y'], 'off for them: no ALL tab');
  assert.equal(await page.locator('.all-view').count(), 0);
  // off in Settings, on for them
  await page.evaluate(() => { window.linkedApi.setOpt('allTab', false); window.linkedApi.setStreamerOpt('s1', 'allTab', true); });
  assert.deepEqual((await tabs(page))[0], 'ALL*');
  // as in Settings again (off)
  await page.evaluate(() => window.linkedApi.setStreamerOpt('s1', 'allTab', null));
  assert.equal((await tabs(page)).includes('ALL') || (await tabs(page)).includes('ALL*'), false);
  // their card: the choice
  await page.evaluate(() => { window.linkedApi.setOpt('allTab', true); });
  await page.evaluate(() => window.openLinkCard('quietkoala'));
  await page.selectOption('[data-cmd="link.allTab"]', 'off');
  assert.equal(await page.evaluate(() => window.linkedApi.listStreamers()[0].allTab), false);
});

test('the search box has a chat\'s whole-chat menu items: in ALL, one set per site\'s chat (Translate, its new messages too, Stop; with Developer tools, its HTML and Why); a message ALL has already is not drawn twice', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const acts = () => page.evaluate(() => window.winActions(window.openWins().find(o => o.channel === 'tw:quietkoala')).filter(x => /translat|HTML|alert\?/i.test(x)));
  const got = await acts();
  for (const site of ['Twitch', 'Kick']) assert.deepEqual(got.filter(x => x.startsWith(site + ':')), [`${site}: translate`, `${site}: translate new messages`, `${site}: stop translating`]);
  assert.ok(!got.some(x => /HTML|alert\?/.test(x)), 'developer items only with Developer tools');
  await page.evaluate(() => window.devTools.setDev(true));
  const dev = await acts();
  assert.ok(dev.includes('Twitch: copy chat HTML') && dev.includes('Kick: why no alert?'), dev.join(' | '));
  await page.evaluate(() => window.devTools.setDev(false));
  // the same message sent again (YouTube does, when its chat is rebuilt or switches view): one line
  const one = { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'dup1' }, ':drift!d@d PRIVMSG #quietkoala :only once')] };
  await feed(page, 'tw:quietkoala', one); await feed(page, 'tw:quietkoala', one);
  assert.equal(await page.$$eval('.all-list .al-txt', l => l.filter(e => /only once/.test(e.textContent)).length), 1);
});

test('ALL\'s developer items: Why didn\'t this alert? (its site\'s chat explains that line, found by its id), Copy the chat\'s HTML; Esc puts back a chat blown up from ALL, also from its box', async t => {
  const page = await allApp(t, { allOpen: '["s1"]', chatBlowup: '1', myTwitch: 'metwitch' });
  await page.waitForSelector('.all-view');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'w1' }, ':drift!d@d PRIVMSG #quietkoala :hey metwitch look')] });
  await page.evaluate(() => {
    window.devTools.setDev(true); window.__copied = []; navigator.clipboard.writeText = async x => { window.__copied.push(x); };
    const w = window.openWins().find(o => o.channel === 'tw:quietkoala'); w.ready = true;
    w.view.executeJavaScript = async js => (/chatHtml\(30\)/.test(js) ? { html: '<div class="chat-list">…</div>', n: 30, total: 120 }
      : /explain/.test(js) && /"w1"/.test(js) ? { found: true, line: 'drift: hey metwitch look', sender: 'drift', body: 'hey metwitch look', me: 'metwitch', words: [], armed: true, decided: null, at: false, word: '', own: false } : true);
  });
  await page.click('.all-list .al-txt', { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuWhy"]');
  await page.waitForSelector('#whyTitle');
  assert.match(await page.textContent('.why-line'), /hey metwitch look/);
  await page.keyboard.press('Escape');
  await page.click('.all-list .al-txt', { button: 'right' });
  await page.click('.all-lm [data-cmd="all.menuChatHtml"]');
  await page.waitForFunction(() => window.__copied.length);
  assert.match(await page.evaluate(() => window.__copied[0]), /^<!-- Stream Multiview · Twitch · the last 30 of 120 messages · .* -->\n<div class="chat-list">/);
  await page.evaluate(() => window.devTools.setDev(false));
  // Blow up from ALL, then Esc: in the list, and in its box
  const blown = () => page.evaluate(() => !!window.blownWin());
  await page.click('.all-list', { position: { x: 20, y: 200 } });
  assert.equal(await blown(), true);
  await page.keyboard.press('Escape');
  assert.equal(await blown(), false, 'Esc from the list');
  await page.click('.all-list', { position: { x: 20, y: 200 } });
  await page.focus('.all-in');
  await page.keyboard.press('Escape');
  assert.equal(await blown(), false, 'Esc from its box');
});

test('ALL: a Twitch watch streak is their message highlighted with its tag (as Twitch\'s chat shows it); a reward redeemed without text and a shoutout are events', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const ws = (id, text) => TW({ 'display-name': 'Brightwick', login: 'brightwick', id, 'msg-id': 'viewermilestone', 'msg-param-category': 'watch-streak', 'msg-param-value': '5' }, ':tmi.twitch.tv USERNOTICE #quietkoala' + (text ? ' :' + text : ''));
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [ws('w1', 'five streams, let\'s go'), ws('w2', ''),
    hermes('reward-redeemed', { redemption: { id: 'r1', user: { id: '9', login: 'tide', display_name: 'Tide' }, reward: { title: 'Hydrate!', background_color: '#1D7C9F' } } }),
    hermes('create', { shoutoutID: 's9', sourceLogin: 'quietkoala', targetLogin: 'novalynx', targetUserDisplayName: 'Novalynx' })] });
  const all = await page.$$eval('#stage .win.chat:not(.tab-hidden) .all-list > *', l => l.map(e => [e.className.split(' ').filter(c => /^al-(m|ev|streak)$/.test(c)).join(' '), e.textContent.replace(/\s+/g, ' ').trim()]));
  assert.deepEqual(all, [['al-m al-streak', "TBrightwick: five streams, let's goWatch streak · 5"], ['al-m al-streak', 'TBrightwick: watched 5 streams in a rowWatch streak · 5'],
    ['al-ev', 'TTide redeemed Hydrate!'], ['al-ev', 'Tquietkoala shouted out NovalynxOpen ›']]);
  // a quiet tint behind it (a name in any colour stays readable), its warm edge, the tag readable on it
  assert.deepEqual(await page.$eval('.all-list .al-streak', e => { const s = getComputedStyle(e), tag = getComputedStyle(e.querySelector('.al-tag-streak'));
    return [s.backgroundImage.match(/rgba\([^)]*\)/)[0], s.boxShadow, tag.backgroundColor, tag.color]; }),
    ['rgba(255, 138, 31, 0.1)', 'rgb(255, 159, 69) 3px 0px 0px 0px inset', 'rgba(255, 138, 31, 0.14)', 'rgb(255, 198, 144)']);
  // a shoutout's Open: that channel, in a window of its own
  await page.click('.all-list [data-cmd="all.shoutoutOpen"]');
  assert.ok(await page.evaluate(() => window.openWins().some(w => w.channel === 'tw:novalynx')));
});

test('ALL: events are a short line (no See it on …); Events: short, full or hidden; an announcement is a message', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [
    TW({ 'display-name': 'brightwick', login: 'brightwick', 'msg-id': 'submysterygift', 'msg-param-mass-gift-count': '5', id: 'g1', 'system-msg': 'brightwick\\sis\\sgifting\\s5\\sTier\\s1\\sSubs!' }, ':tmi.twitch.tv USERNOTICE #quietkoala'),
    TW({ 'display-name': 'quietkoala', 'msg-id': 'announcement', 'msg-param-color': 'GREEN', id: 'a1' }, ':tmi.twitch.tv USERNOTICE #quietkoala :scrims at 8pm')] });
  assert.deepEqual(await lines(page), ['al-ev | Tbrightwick gifted 5 subs', 'al-m | Tquietkoala: scrims at 8pmAnnouncement']);
  assert.equal(await page.textContent('.al-ev .al-amt'), '5 subs', 'the amount picked out');
  assert.ok(await page.$eval('.all-list .al-m', l => l.classList.contains('al-ann-green')));
  await page.click('.all-filt');
  const ev = v => page.click(`.all-fm [aria-label="Events"] >> text=${v}`);
  assert.equal(await page.textContent('.all-fm [aria-label="Events"] .on'), 'Short');
  await ev('Full');
  assert.equal((await lines(page))[0], 'al-ev | Tbrightwick is gifting 5 Tier 1 Subs!', 'the site\'s own words');
  await ev('Hidden');
  assert.deepEqual(await lines(page), ['al-m | Tquietkoala: scrims at 8pmAnnouncement']);
  assert.equal(await page.evaluate(() => localStorage.getItem('kickMultiview.allEvents')), 'hidden');
  assert.match(await page.getAttribute('.all-filt', 'title'), /events hidden/);
  assert.equal(await page.$eval('.all-filt', e => e.classList.contains('set')), true, 'changed: a dot');
  await ev('Short');
  assert.equal(await page.$eval('.all-filt', e => e.classList.contains('set')), false);
  await page.click('.all-filt');
  assert.equal(await page.isVisible('.all-fm'), false, 'the pill closes it again');
  // no See it on … on an event's line: the line itself opens (below)
  assert.equal(await page.locator('.all-list .al-ev button').count(), 0);
  assert.doesNotMatch(await page.textContent('.all-list'), /See it on/);
});

test('ALL: an event line cut off with … opens in place on a click, its short words and message wrapped, and closes on another; one that fits doesn\'t; its buttons and links don\'t toggle it', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); }; });
  const KE = (event, data) => JSON.stringify({ push: { channel: 'chatroom_1', pub: { data: { event, data: JSON.stringify(data) } } } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KE('RewardRedeemedEvent', { reward_title: 'Pick the next map and the loadout for the whole squad for one round', username: 'oakmoss', user_input: '' }),
    KE('RewardRedeemedEvent', { reward_title: 'Hydrate', username: 'tide', user_input: '' })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'Jean', login: 'jean', id: 'g', 'msg-id': 'resub', 'system-msg': 'Jean\\ssubscribed\\sfor\\s38\\smonths!' },
    ':tmi.twitch.tv USERNOTICE #quietkoala :three years already, thanks for all the late night streams and the chill vibes, my clips are at clips.example.com/jean')] });
  const ev = n => page.locator('.all-list .al-ev').nth(n);
  const state = n => ev(n).evaluate(e => ({ open: e.classList.contains('al-open'), can: e.classList.contains('al-can'), expanded: e.getAttribute('aria-expanded'), cursor: getComputedStyle(e).cursor,
    h: e.offsetHeight, wrap: getComputedStyle(e.querySelector('.al-evw')).whiteSpace, text: e.textContent }));
  const closed = await state(0);
  assert.deepEqual([closed.open, closed.wrap], [false, 'nowrap'], 'one line, cut off with …');
  assert.equal(closed.text, 'Koakmoss redeemed Pick the next map and the loadout for the whole squad for one round', 'nothing but its words: no See it on …');
  // pointing at it: it can open
  await ev(0).hover();
  assert.deepEqual(await ev(0).evaluate(e => [e.classList.contains('al-can'), e.getAttribute('aria-expanded'), getComputedStyle(e).cursor, e.title]), [true, 'false', 'pointer', 'Show all of it']);
  // a click: open, the same short words wrapped onto more lines
  await ev(0).click();
  const open = await state(0);
  assert.deepEqual([open.open, open.can, open.expanded, open.wrap, open.text], [true, true, 'true', 'normal', closed.text]);
  assert.ok(open.h > closed.h * 1.5, `taller once open (${closed.h} -> ${open.h})`);
  assert.equal(await ev(0).evaluate(e => e.querySelector('.al-evw').scrollWidth <= e.querySelector('.al-evw').clientWidth), true, 'nothing cut off');
  // it stays open when ALL is drawn again (Events: full, its own look, then short again)
  await page.click('.all-filt');
  await page.click('.all-fm [aria-label="Events"] >> text=Full');
  await page.click('.all-filt');
  assert.deepEqual(await ev(0).evaluate(e => [e.classList.contains('al-full'), e.classList.contains('al-open'), e.hasAttribute('aria-expanded')]), [true, false, false], 'full: the site\'s own words, nothing to open');
  await ev(0).click();
  assert.equal(await ev(0).evaluate(e => e.classList.contains('al-open')), false, 'a click on a full line does nothing');
  await page.click('.all-filt');
  await page.click('.all-fm [aria-label="Events"] >> text=Short');
  await page.click('.all-filt');
  assert.equal((await state(0)).open, true, 'open again, back on short');
  // another click: one line again
  await ev(0).click();
  const again = await state(0);
  assert.deepEqual([again.open, again.expanded, again.h], [false, 'false', closed.h]);
  // one that fits: no pointer, a click does nothing
  await ev(1).hover();
  assert.deepEqual(await state(1).then(s => [s.can, s.expanded, s.cursor]), [false, null, 'auto']);
  await ev(1).click();
  assert.equal((await state(1)).open, false);
  // a sub's message cut off: it opens too, under its words; a link in it opens in your browser, the line stays open
  assert.equal(await ev(2).evaluate(e => getComputedStyle(e.querySelector('.al-evm')).textOverflow), 'ellipsis');
  await ev(2).click();
  assert.equal((await state(2)).open, true);
  assert.ok(await ev(2).evaluate(e => e.querySelector('.al-evm').getBoundingClientRect().top >= e.querySelector('.al-evw').getBoundingClientRect().bottom - 1), 'its message under its words');
  await ev(2).locator('.al-link').click();
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://clips.example.com/jean']);
  assert.equal((await state(2)).open, true, 'the link: not a toggle');
  // selecting its text doesn't close it
  await ev(2).evaluate(e => getSelection().selectAllChildren(e.querySelector('.al-evm')));
  await ev(2).evaluate(e => e.querySelector('.al-evm').click());
  assert.equal((await state(2)).open, true, 'not while text is selected');
});

test('ALL: a shoutout\'s and a raid\'s Open › and a gift\'s recipients button keep their own click, also on a line cut off', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const hermes = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
  const N = (id, tags) => TW({ 'display-name': 'BrightWick', login: 'brightwick', id, ...tags }, ':tmi.twitch.tv USERNOTICE #quietkoala');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [hermes('create', { shoutoutID: 's9', sourceLogin: 'quietkoala', targetLogin: 'novalynxthelongestnamed', targetUserDisplayName: 'NovalynxTheLongestNamed' }),
    N('g1', { 'msg-id': 'submysterygift', 'msg-param-mass-gift-count': '2', 'msg-param-community-gift-id': '777' }),
    N('g2', { 'msg-id': 'subgift', 'msg-param-recipient-display-name': 'Sol', 'msg-param-recipient-user-name': 'sol', 'msg-param-community-gift-id': '777' }),
    N('g3', { 'msg-id': 'subgift', 'msg-param-recipient-display-name': 'Rue', 'msg-param-recipient-user-name': 'rue', 'msg-param-community-gift-id': '777' })] });
  // (a narrow ALL: the lines are cut off)
  await page.$eval('.all-list', l => { l.style.width = '170px'; });
  const so = page.locator('.all-list .al-ev').first(), gift = page.locator('.all-list .al-ev.al-gift');
  await so.hover();
  assert.equal(await so.evaluate(e => e.classList.contains('al-can')), true, 'cut off');
  await gift.hover();
  assert.equal(await gift.evaluate(e => e.classList.contains('al-can')), true, 'cut off');
  await gift.locator('.al-gto').click();
  assert.deepEqual(await gift.evaluate(e => [e.classList.contains('al-open'), e.querySelector('.al-gto').getAttribute('aria-expanded'), e.querySelectorAll('.al-gc').length]), [false, 'true', 2], 'who got them, the line not opened');
  // a raid's Open ›
  await page.evaluate(() => window.allChat.allRaid('tw:quietkoala', 'tw:emberfall'));
  await page.click('.all-list [data-cmd="all.raidOpen"]');
  assert.ok(await page.evaluate(() => window.openWins().some(w => w.channel === 'tw:emberfall')));
  assert.equal(await page.locator('.all-list .al-raidout .al-tag-raid').textContent(), 'Opened');
  // a shoutout's Open ›
  await so.locator('[data-cmd="all.shoutoutOpen"]').evaluate(b => b.click());   // (under the raid's new window now)
  assert.ok(await page.evaluate(() => window.openWins().some(w => w.channel === 'tw:novalynxthelongestnamed')), 'Open: that channel, in a window of its own');
  assert.equal(await so.evaluate(e => e.classList.contains('al-open')), false, 'not a toggle');
});

test('ALL: Kick\'s raids: one coming in is an event (with its message); one going out is the raid\'s line with Open ›, one line also when the raid is followed too', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const KC = (event, data, channel) => JSON.stringify({ push: { channel, pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
  const hosted = (id, who, n, said = null) => KC('StreamHostedEvent', { message: { id, numberOfViewers: n, optionalMessage: said, createdAt: new Date().toISOString() }, user: { id: 9, username: who } }, 'chatrooms.1');
  const moved = (to, n) => KC('ChatMoveToSupportedChannelEvent', { channel: { id: 1, slug: 'quietkoala', current_livestream: { viewer_count: n } }, slug: to, hosted: { id: 2, username: to, slug: to, viewers_count: 300, is_live: true } }, 'channel.1');
  await feed(page, 'quietkoala', { s: 'kick', raw: [hosted('h1', 'Novalynx', 264), hosted('h2', 'Pixelmoth', 1, 'bringing the squad')] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [hosted('h1', 'Novalynx', 264)] });
  assert.deepEqual(await lines(page), ['al-ev | KNovalynx raided with 264 viewers', 'al-ev | KPixelmoth raided with 1 viewerbringing the squad'], 'the same raid sent again: one line');
  assert.equal(await page.textContent('.all-list .al-ev .al-amt'), '264 viewers', 'how many picked out');
  // going out: the raid's line, Open ›; the raid followed after (windows/raids.js): the same line
  await feed(page, 'quietkoala', { s: 'kick', raw: [moved('emberfall', 412)] });
  await page.evaluate(() => window.allChat.allRaid('quietkoala', 'emberfall'));
  await feed(page, 'quietkoala', { s: 'kick', raw: [moved('emberfall', 412)] });
  const out = () => page.$$eval('.all-list .al-raidout', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(await out(), ['Kquietkoala raided emberfall on Kick · 412 viewersOpen ›'], 'one line for one raid');
  assert.ok(await page.$eval('.all-list .al-raidout', e => e.classList.contains('al-k') && !e.classList.contains('al-raidsoon')), 'Kick\'s, gone (no countdown)');
  // the other way round: followed first, then Kick says so (its viewers added to the line)
  await page.evaluate(() => window.allChat.allRaid('quietkoala', 'sablewing'));
  await feed(page, 'quietkoala', { s: 'kick', raw: [moved('sablewing', 87)] });
  assert.deepEqual((await out()).slice(1), ['Kquietkoala raided sablewing on Kick · 87 viewersOpen ›']);
  // Open ›: that channel in a window of its own
  await page.click('.all-list .al-raidout >> nth=0 >> [data-cmd="all.raidOpen"]');
  assert.ok(await page.evaluate(() => window.openWins().some(w => w.channel === 'emberfall')));
  assert.equal(await page.locator('.all-list .al-raidout >> nth=0 >> .al-tag-raid').textContent(), 'Opened');
  // Kick sending it again later (within a few minutes): still the one line
  await feed(page, 'quietkoala', { s: 'kick', raw: [moved('emberfall', 5)] });
  assert.equal(await page.locator('.all-list .al-raidout').count(), 2, 'within a few minutes of the last one: still its line');
});

test('ALL: a Kick resub shared with a message is an event with its months and the message, as Twitch\'s is; a celebration of a kind ALL doesn\'t know is the message', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const cel = (id, celebration, content) => KF('ChatMessageEvent', { id, content, type: 'celebration', created_at: new Date().toISOString(),
    sender: { id: 7, username: 'Oakmoss', slug: 'oakmoss', identity: { color: '#31D6C2', badges: [{ type: 'subscriber', count: 16 }] } }, metadata: { celebration } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [cel('c1', { id: 'cb1', type: 'subscription_renewed', total_months: 16 }, 'sixteen months, still here'), cel('c2', { id: 'cb2', type: 'something_new' }, 'what is this')] });
  assert.deepEqual(await lines(page), ['al-ev | KOakmoss subscribed · 16 monthssixteen months, still here', 'al-m | KOakmoss: what is this']);
  assert.equal(await page.textContent('.all-list .al-ev .al-amt'), '16 months', 'the months picked out');
  assert.equal(await page.textContent('.all-list .al-ev .al-evm'), 'sixteen months, still here', 'the message under its words');
  // Events: full: its own words; hidden: gone
  await page.click('.all-filt');
  await page.click('.all-fm [aria-label="Events"] >> text=Full');
  assert.equal((await lines(page))[0], 'al-ev | KOakmoss subscribed · 16 monthssixteen months, still here');
  await page.click('.all-fm [aria-label="Events"] >> text=Hidden');
  assert.deepEqual(await lines(page), ['al-m | KOakmoss: what is this']);
});

test('ALL: a YouTube message marked deleted is deleted: struck with Deleted where you moderate, gone where you don\'t', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const YT = (id, who, text) => ({ addChatItemAction: { item: { liveChatTextMessageRenderer: { id, authorName: { simpleText: who }, timestampUsec: String(Date.now() * 1000), message: { runs: [{ text }] } } } } });
  const marked = id => ({ clickTrackingParams: 'x', markChatItemAsDeletedAction: { deletedStateMessage: { runs: [{ text: 'Message deleted' }] }, targetItemId: id } });
  await page.evaluate(() => window.allChat.modKnown.set('tw:quietkoala', true));
  await feed(page, 'tw:quietkoala', { s: 'youtube', raw: [YT('y1', '@Mika', 'hello'), YT('y2', '@Rowan', 'buy followers here'), YT('y3', '@Sol', 'nice')] });
  await feed(page, 'tw:quietkoala', { s: 'youtube', raw: [marked('y2'), marked('y2')] });
  assert.deepEqual(await lines(page), ['al-m | Y@Mika: hello', 'al-m al-del | Y@Rowan: buy followers hereDeleted', 'al-m | Y@Sol: nice'], 'a mod: kept, struck (sent again: the same)');
  await page.evaluate(() => window.allChat.modKnown.set('tw:quietkoala', false));
  await feed(page, 'tw:quietkoala', { s: 'youtube', raw: [marked('y3')] });
  assert.deepEqual(await lines(page), ['al-m | Y@Mika: hello', 'al-m al-del | Y@Rowan: buy followers hereDeleted'], 'not a mod: gone');
  assert.equal(await page.evaluate(() => window.allHealth.healthOf.get('tw:quietkoala').bad), 0, 'read, not unreadable');
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
  assert.equal(await page.$eval('.all-in', b => b.value), '');
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
  await page.waitForFunction(() => document.querySelectorAll('.al-mine-sent').length === 2);
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
  assert.equal(await page.$eval('.all-in', b => b.value), 'again');
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
  assert.equal(await page.$eval('.all-in', b => b.value), 'nice one @Lofi_Kick ');
  assert.equal(await page.isVisible('.all-at'), false);
  assert.match(await page.textContent('.all-rb'), /Mentioning on Kick · Kick names only/);
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on Kick');
  await page.keyboard.type('and @lo');
  assert.deepEqual(await list(), ['KLofi_KickKick*', 'KlowtideKick'], 'only Kick names now');
  assert.match(await page.textContent('.all-at'), /Kick names/);
  await page.click('.all-at .all-ati >> nth=1');
  assert.equal(await page.$eval('.all-in', b => b.value), 'nice one @Lofi_Kick and @lowtide ');
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

test('ALL: mod actions where you\'re a mod: the hover\'s Delete, the menu (timeout lengths, ban asks first), keys on a name; a Kick mod\'s message deleted, not timed out or banned; not for a Twitch mod, the streamer or where you aren\'t one', async t => {
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
  // the hover: Delete only for someone you can moderate (a Kick mod's message too)
  assert.deepEqual(await page.$$eval('.all-list .al-m', l => l.map(e => !!e.querySelector('[data-cmd="all.delete"]'))), [true, true, false, false, false]);
  const sh = process.platform === 'darwin' ? '⇧' : 'Shift', ct = process.platform === 'darwin' ? '⌘' : 'Ctrl';
  assert.deepEqual(await page.$$eval('.all-list .al-m .al-n', l => l.slice(0, 3).map(n => n.title.split('\n')[1] || '')),
    [`${sh}-click: delete · ${ct}-click: time out (10m) · ${ct}+${sh}-click: ban`, `${sh}-click: delete`, ''], 'the name says which keys work');
  await page.hover(line(0)); await page.click(`${line(0)} >> [data-cmd="all.delete"]`);
  await page.waitForFunction(() => window.__acts.length === 1);
  assert.deepEqual(await acts(), [['delete', 'quietkoala', 'k1']]);
  assert.match(await page.textContent('#msg'), /Deleted loudmouth's message on Kick/);
  // the menu: timeout lengths (remembered), pin, ban after asking
  await page.click(line(0), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li', l => l.map(b => b.textContent.trim() + (b.disabled ? ' (off)' : ''))).then(x => x.map(s => s.replace(/\s+/g, ' '))),
    ['Reply', 'Pin message', 'Open profile on Kick', /Delete message.*click name/.source && 'Delete message' + (process.platform === 'darwin' ? '⇧-click name' : 'Shift-click name'),
     'Timeout' + (process.platform === 'darwin' ? '⌘-click name' : 'Ctrl-click name'), 'Ban' + (process.platform === 'darwin' ? '⌘+⇧-click name' : 'Ctrl+Shift-click name'), 'Copy message', 'Copy message with emotes', 'Open Kick mod view'].map(x => x));
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
  // a Kick mod's message: deleted (Kick lets a mod do that), but they aren't timed out or banned
  await page.click(`${line(1)} >> .al-n`, { modifiers: ['Shift'] });
  await page.waitForFunction(() => window.__acts.length === 7);
  assert.deepEqual((await acts())[6], ['delete', 'quietkoala', 'k2']);
  for (const keys of [[mod], [mod, 'Shift']]){
    await page.click(`${line(1)} >> .al-n`, { modifiers: keys });
    await page.waitForFunction(() => /nightowl_mod is a mod on Kick/.test(document.querySelector('#msg')?.textContent || ''));
    await page.evaluate(() => { document.querySelector('#msg').textContent = ''; });
  }
  assert.equal((await acts()).length, 7, 'not timed out or banned');
  await page.click(line(1), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li:disabled', l => l.map(b => b.textContent.replace(/[⇧⌘+]|Shift|Ctrl|-click name/g, '').trim() + ': ' + (b.title || b.dataset.tipTitle))),
    ['Timeout: nightowl_mod is a mod on Kick', 'Ban: nightowl_mod is a mod on Kick']);
  assert.equal(await page.locator('.all-lm .all-durs').count(), 0, 'no timeout lengths');
  await page.click('.all-lm [data-cmd="all.menuDelete"]');
  await page.waitForFunction(() => window.__acts.length === 8);
  assert.deepEqual((await acts())[7], ['delete', 'quietkoala', 'k2']);
  // can't: the streamer, you; and a site where you aren't a mod
  for (const [n, why] of [[2, /quietkoala is the streamer/], [3, /That's you/], [4, /You're not a mod on Twitch/]]){
    await page.click(`${line(n)} >> .al-n`, { modifiers: ['Shift'] });
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), why.source);
  }
  await page.click(line(2), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li:disabled', l => l.map(b => b.title || b.dataset.tipTitle)), ['quietkoala is the streamer', 'quietkoala is the streamer', 'quietkoala is the streamer']);
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-lm'), false, 'Esc closes it');
  await page.click(line(4), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li', l => l.map(b => b.textContent.trim())), ['Reply', 'Open profile on Twitch', 'Copy message', 'Copy message with emotes'], 'no mod part where you aren\'t a mod');
  await page.mouse.click(5, 5);
  // a Twitch mod's message, where you're a mod too: Twitch doesn't let a mod delete it, so nothing is offered
  await page.evaluate(() => window.allChat.modKnown.set('tw:quietkoala', true));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'owl_twmod', badges: 'moderator/1', id: 't2' }, ':owl_twmod!t@t PRIVMSG #quietkoala :behave')] });
  assert.equal(await page.locator(`${line(5)} [data-cmd="all.delete"]`).count(), 0, 'no Delete on the hover');
  assert.doesNotMatch(await page.getAttribute(`${line(5)} >> .al-n`, 'title'), /click/);
  await page.click(`${line(5)} >> .al-n`, { modifiers: ['Shift'] });
  await page.waitForFunction(() => /owl_twmod is a mod on Twitch/.test(document.querySelector('#msg')?.textContent || ''));
  await page.click(line(5), { button: 'right' });
  assert.deepEqual(await page.$$eval('.all-lm .all-li:disabled', l => l.map(b => b.title || b.dataset.tipTitle)), ['owl_twmod is a mod on Twitch', 'owl_twmod is a mod on Twitch', 'owl_twmod is a mod on Twitch']);
  await page.keyboard.press('Escape');
  assert.equal((await acts()).length, 8);
  // a message gone from the site's chat, and a site that won't take it
  for (const [ans, want] of [['no-line', /That message has gone from Kick's chat/], ['no-button', /Kick doesn't offer that there/], ['nope', /Kick didn't take it/]]){
    await page.evaluate(a => { window.__modAnswer = a; }, ans);
    await page.click(`${line(0)} >> .al-n`, { modifiers: ['Shift'] });
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), want.source);
  }
  // a timeout whose command needed the app's real press of the site's Send (as on YouTube): done once that sent it
  await page.evaluate(() => { window.allChat.sender.send = async (m, text) => { window.__acts.push(['send', m.channel, text]); return { press: { x: 3, y: 4 }, start: 7 }; };
    window.allChat.sender.press = async (m, r, text) => { window.__acts.push(['press', m.channel, r, text]); return window.__pressAnswer; }; });
  for (const [ans, want] of [['sent', /Timed out loudmouth on Kick/], ['not-sent', /Kick didn't take it/]]){
    await page.evaluate(a => { window.__acts = []; window.__pressAnswer = a; document.querySelector('#msg').textContent = ''; }, ans);
    await page.click(`${line(0)} >> .al-n`, { modifiers: [mod] });
    await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#msg')?.textContent || ''), want.source);
    assert.deepEqual(await acts(), [['send', 'quietkoala', '/timeout loudmouth 60'], ['press', 'quietkoala', { press: { x: 3, y: 4 }, start: 7 }, '/timeout loudmouth 60']]);
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
  assert.equal(await page.$eval('.all-in', b => b.value), '', 'the box is free for the next one');
  // Enter again while it's sending: nothing sent twice
  await page.fill('.all-in', 'second one');
  await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => /Still sending the last one/.test(document.querySelector('#msg')?.textContent || ''));
  assert.deepEqual(await page.evaluate(() => window.__sends), ['first one']);
  assert.equal(await page.$eval('.all-in', b => b.value), 'second one', 'kept');
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
  assert.equal(await page.$eval('.all-in', b => b.value), 'edit me');
  assert.equal(await page.locator('.al-mine-failed').count(), 0, 'its line goes');
});

test('ALL: a chat that never answers can\'t leave your line on Sending: after the limit it\'s not sent, with why, and Retry works; if it went after all, the real line takes its place', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  await page.evaluate(() => { window.allChat.SEND_LIMIT.ms = 400; window.__sends = []; window.allChat.sender.send = (m, text) => { window.__sends.push(text); return window.__answer ? Promise.resolve(window.__answer) : new Promise(() => {}); }; });
  const mine = () => page.$$eval('.all-list .al-mine', l => l.map(e => e.className.replace(/.*al-mine-/, '') + ' | ' + e.textContent.replace(/\s+/g, ' ').trim()));
  await page.fill('.all-in', 'anyone there');
  await page.press('.all-in', 'Enter');
  await page.waitForSelector('.al-mine-sending');
  assert.equal(await page.$eval('.all-send-b', b => b.title), 'Sending…');
  await page.waitForSelector('.al-mine-failed');
  assert.match((await mine())[0], /^failed \| .*anyone thereNot sentKick's chat didn't answer in time/);
  assert.match(await page.textContent('#msg'), /Not sent: Kick's chat didn't answer in time/);
  assert.notEqual(await page.$eval('.all-send-b', b => b.title), 'Sending…', 'free to send again');
  await page.evaluate(() => { window.__answer = 'sent'; });
  await page.click('.al-mine-failed [data-cmd="all.retry"]');
  await page.waitForSelector('.al-mine-sent');
  assert.deepEqual(await page.evaluate(() => window.__sends), ['anyone there', 'anyone there']);
  // one that didn't answer in time, then its chat brings it back: it went, so the real line takes its place
  await page.evaluate(() => { window.__answer = null; });
  await page.fill('.all-in', 'late but sent');
  await page.press('.all-in', 'Enter');
  await page.waitForSelector('.al-mine-failed');
  const KF = (data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify(data) } } } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF({ id: 'k10', content: 'late but sent', type: 'message', sender: { id: 2, username: 'MeKick', slug: 'mekick', identity: { badges: [] } } })] });
  assert.equal(await page.locator('.al-mine-failed').count(), 0, 'not left as not sent');
  assert.match((await lines(page)).at(-1), /late but sent/);
});

test('ALL: your line while it sends has your badges as your real line has them (the sites\' pictures, Kick\'s icons, the sub badge for your months); kept for next time, for each chat (the newest 50), saved only when it changes', async t => {
  const others = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['c' + i, { sender: 'Me', login: 'me', color: '', badges: [] }]));
  const page = await allApp(t, { allOpen: '["s1"]', allMyLook: JSON.stringify(others) });
  await page.waitForSelector('.all-view');
  const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  await page.route('https://ext.cdn.kick.com/**', r => r.fulfill({ body: Buffer.from(img.split(',')[1], 'base64'), contentType: 'image/gif' }));   // (Kick's badge pictures: a stand-in)
  // (the chats' pages "loaded", their badges' pictures in, Kick's moderator icon drawn; sends wait)
  const ready = async () => page.evaluate(([live, img]) => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    window.allChat.gotBadges('quietkoala', { kick: { subs: [{ months: 1, url: img + '#s1' }, { months: 3, url: img + '#s3' }] } });
    window.allChat.gotBadges('tw:quietkoala', { twitch: { own: { 'subscriber/12': { url: img + '#sub12', title: '1-Year Subscriber' } }, global: {} } });
    window.allChat.gotKickIcons({ moderator: '<svg viewBox="0 0 20 20"><path d="M1 1h2v2H1z"/></svg>' });
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push(text); return 'sent'; };
    window.__saves = 0; const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v){ if (k === 'kickMultiview.allMyLook') window.__saves++; return set.call(this, k, v); };
  }, [LIVE, img]);
  await ready();
  const who = sel => page.$eval(sel, w => [...w.children].map(c => c.className + (c.tagName === 'IMG' ? ' ' + c.getAttribute('src').replace(/^data:[^#]*|^https:\/\/ext\.cdn\.kick\.com\/chat\/badges\//, '') + ' ' + c.title : c.title ? ' ' + c.title : '')));
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.allMyLook')));
  const send = async text => { const n = await page.evaluate(() => window.__sends.length); await page.fill('.all-in', text); await page.press('.all-in', 'Enter'); await page.waitForFunction(n => window.__sends.length === n + 1 && document.querySelectorAll('.al-mine-sent').length === n + 1, n); };
  const meKick = id => KF('ChatMessageEvent', { id, content: 'hey ' + id, type: 'message', sender: { id: 2, username: 'MeKick', slug: 'mekick', identity: { color: '#4fd1c5',
    badges: [{ type: 'moderator', text: 'Moderator', sort_order: 1 }, { type: 'subscriber', count: 4, sort_order: 9 }], badges_v2: [{ name: 'Star', image_url: 'https://ext.cdn.kick.com/chat/badges/star.png', selected: true, sort_order: 4 }] } } });
  // your messages: your look saved once (the same look again, or someone else's message: nothing written)
  await feed(page, 'quietkoala', { s: 'kick', raw: [meKick('k1')] });
  await feed(page, 'quietkoala', { s: 'kick', raw: [meKick('k2'), KF('ChatMessageEvent', { id: 'k3', content: 'yo', type: 'message', sender: { id: 3, username: 'Lowtide', slug: 'lowtide', identity: { badges: [{ type: 'vip' }] } } })] });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'MeTwitch', id: 't1', color: '#9146FF', badges: 'subscriber/12', 'badge-info': 'subscriber/14' }, ':metwitch!m@m PRIVMSG #quietkoala :hello')] });
  assert.equal(await page.evaluate(() => window.__saves), 2, 'once for each chat');
  const kickReal = await who('.all-list [data-key="kick:k2"] .al-who'), twReal = await who('.all-list [data-key="twitch:t1"] .al-who');
  assert.deepEqual(kickReal, ['pi pi-kick Kick', 'al-bk Moderator', 'al-bi star.png Star', 'al-bi #s3 4-Month Subscriber']);
  assert.deepEqual(twReal, ['pi pi-twitch Twitch', 'al-bi #sub12 14-Month Subscriber (1-Year Badge)']);
  const kept = await saved();
  assert.equal(Object.keys(kept).length, 50, 'the newest 50');
  assert.deepEqual(Object.keys(kept).slice(-3), ['c49', 'quietkoala', 'tw:quietkoala'], 'the oldest out');
  assert.deepEqual(kept.quietkoala, { sender: 'MeKick', login: 'mekick', color: '#4fd1c5', badges: ['mod', 'sub'],
    pics: [{ set: 'moderator', v: '1', title: 'Moderator' }, { url: 'https://ext.cdn.kick.com/chat/badges/star.png', title: 'Star' }, { set: 'subscriber', v: '4' }] }, 'only what your line draws');
  // sending on Kick, then on Twitch: as your real line there
  await send('on kick');
  assert.deepEqual(await who('.all-list .al-mine:last-child .al-who'), kickReal);
  await page.focus('.all-in'); await page.keyboard.press('Tab');
  await send('on twitch');
  assert.deepEqual(await who('.all-list .al-mine:last-child .al-who'), twReal);
  assert.equal(await page.locator('.al-mine .al-b').count(), 0, 'not ALL\'s own icons');
  // next time, with no message of yours in ALL yet: as you looked there last
  await page.evaluate(() => localStorage.setItem('kickMultiview.allSend', JSON.stringify({ s1: 'quietkoala' })));
  await page.reload();
  await page.waitForSelector('.all-view');
  await ready();
  assert.equal(await page.locator('.all-list .al-m').count(), 0);
  await send('after a reload');
  assert.deepEqual(await who('.all-list .al-mine:last-child .al-who'), kickReal);
  assert.equal(await page.$eval('.al-mine .al-n', n => n.textContent), 'MeKick');
  // your message again, the same look: not saved again
  await feed(page, 'quietkoala', { s: 'kick', raw: [meKick('k4')] });
  assert.equal(await page.evaluate(() => window.__saves), 0);
});

test('ALL: your line while it sends, with nothing of yours seen or kept in that chat: your name, no badges (the streamer\'s in your own channel); a look kept under a name you no longer use, or damaged, isn\'t used', async t => {
  const look = { sender: 'OldName', login: 'oldname', color: '#ff0000', badges: ['sub'], pics: [{ set: 'subscriber', v: '4' }] };
  const page = await allApp(t, { allOpen: '["s1"]', allMyLook: JSON.stringify({ quietkoala: look, 'tw:quietkoala': { sender: 'MeTwitch', login: 'metwitch', color: 7, badges: 'sub', pics: [null, { url: 'javascript:alert(1)' }, { set: 'subscriber', v: '12', months: 14, extra: 'x' }, { url: 'https://x.test/b.png', title: 'B', months: -1 }] }, junk: 'x', empty: { sender: '' } }) });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push(text); return 'sent'; }; }, LIVE);
  const mine = () => page.$$eval('.al-mine', l => l.map(e => [...e.querySelector('.al-who').children].map(c => c.className + (c.tagName === 'IMG' ? ' ' + c.getAttribute('src') : '')).join(', ') + ' | ' + e.querySelector('.al-n').textContent));
  await page.fill('.all-in', 'hi'); await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => window.__sends.length === 1 && document.querySelector('.al-mine-sent'));
  assert.deepEqual(await mine(), ['pi pi-kick | mekick'], 'your name now, not the old one\'s look');
  // a damaged look: only what's sound (here: no picture of its own, so ALL's sub icon until Twitch's pictures come)
  await page.focus('.all-in'); await page.keyboard.press('Tab');
  await page.fill('.all-in', 'hey'); await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.al-mine-sent').length === 2);
  assert.deepEqual((await mine())[1], 'pi pi-twitch, al-b al-b-sub, al-bi https://x.test/b.png | MeTwitch');
  // in your own channel: the streamer's badge
  await page.evaluate(() => localStorage.setItem('kickMultiview.myName', 'quietkoala'));
  await page.reload();
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push(text); return 'sent'; }; }, LIVE);
  await page.evaluate(() => localStorage.setItem('kickMultiview.allSend', JSON.stringify({ s1: 'quietkoala' })));
  await page.fill('.all-in', 'hi'); await page.press('.all-in', 'Enter');
  await page.waitForFunction(() => window.__sends.length === 1 && document.querySelector('.al-mine-sent'));
  assert.deepEqual(await mine(), ['pi pi-kick, al-b al-b-host | quietkoala']);
});

test('ALL: your line while it sends shows the emotes you picked as their pictures (and add-on emotes), sending or not sent; the real line still takes its place; Edit puts them back', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.kmv = { ...(window.kmv || {}), emotesPick: async () => [{ id: 'kick-global', label: 'Kick', emotes: [{ name: 'KEKW', url: img, send: '[emote:9:KEKW]' }] }, { id: '7tv', label: '7TV', emotes: [{ name: 'catJAM', url: img, send: 'catJAM' }] }] };
    window.__sends = []; window.allChat.sender.send = (m, text) => new Promise(r => { window.__sends.push(text); window.__done = r; });
  }, LIVE);
  const shows = () => page.$$eval('.all-list .al-mine', l => l.map(e => e.className.replace(/.*al-mine-/, '') + ' | ' + [...e.querySelector('.al-txt').childNodes]
    .map(n => (n.nodeName === 'IMG' ? `[${n.alt} ${n.dataset.send}]` : n.textContent)).join('')));
  const pick = async () => { await page.keyboard.type(':ke'); await page.waitForSelector('.all-at:not([hidden]) .all-emi'); await page.keyboard.press('Enter'); };
  await page.focus('.all-in');
  await page.keyboard.type('that clutch '); await pick(); await page.keyboard.type('so KEKWgood');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends), ['that clutch [emote:9:KEKW] so KEKWgood']);
  assert.deepEqual(await shows(), ['sending | that clutch [KEKW [emote:9:KEKW]] so KEKWgood'], 'sending: the picked emote as its picture; a word that only has its name in it stays a word');
  await page.evaluate(() => window.__done('sent'));
  await page.waitForSelector('.al-mine-sent');
  assert.deepEqual(await shows(), ['sent | that clutch [KEKW [emote:9:KEKW]] so KEKWgood']);
  // the chat brings it back (the emote as Kick writes it): the real line, in its place
  const KF = (data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify(data) } } } });
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF({ id: 'k9', content: 'that clutch [emote:9:KEKW] so KEKWgood', type: 'message', sender: { id: 2, username: 'MeKick', slug: 'mekick', identity: { badges: [] } } })] });
  assert.deepEqual(await shows(), []);
  // (Kick's emote picture can't load here: its name, once it has failed; the picture, by its name, until then)
  assert.deepEqual(await page.$$eval('#stage .win.chat:not(.tab-hidden) .all-list > .al-m', l => l.map(e => { const c = e.cloneNode(true); c.querySelectorAll('img.al-e').forEach(i => i.replaceWith(i.alt)); return c.textContent.replace(/\s+/g, ' ').trim(); })),
    ['KMeKick: that clutch KEKW so KEKWgood']);
  // not sent: still its picture; Edit puts the text and the emote back in the box
  await page.evaluate(() => { window.allChat.sender.send = async () => 'not-sent'; });
  await pick(); await page.keyboard.type('again');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.al-mine-failed');
  assert.deepEqual(await shows(), ['failed | [KEKW [emote:9:KEKW]] again']);
  await page.click('.al-mine-failed [data-cmd="all.edit"]');
  assert.equal(await page.$eval('.all-in', b => [...b.childNodes].map(n => (n.nodeName === 'IMG' ? `[${n.alt}]` : n.textContent)).join('')), '[KEKW] again', 'the emote back as its picture');
  // with no emote picked: text, with an add-on emote's name as its picture (as on the other lines)
  await page.fill('.all-in', 'vibing catJAM here');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.al-mine-failed .al-txt img[alt=catJAM]');
  assert.deepEqual(await shows(), ['failed | vibing [catJAM catJAM] here'], 'its 7TV emote');
  assert.equal(await page.$eval('.al-mine-failed .al-txt img', i => i.title), 'catJAM · 7TV');
});

test('ALL: a site that only takes a real press on its Send (YouTube): the app presses it there, then it\'s sent or not sent', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  await page.evaluate(() => { window.__calls = [];
    window.allChat.sender.send = async (m, text) => { window.__calls.push(['send', m.channel, text]); return window.__answer; };
    window.allChat.sender.press = async (m, r, text) => { window.__calls.push(['press', m.channel, r, text]); return window.__pressAnswer; }; });
  const mine = () => page.$$eval('.all-list .al-mine', l => l.map(e => e.className.replace(/.*al-mine-/, '') + ' | ' + e.textContent.replace(/\s+/g, ' ').trim()));
  const at = { press: { x: 412, y: 630 }, start: 1234 };
  await page.evaluate(at => { window.__answer = at; window.__pressAnswer = 'sent'; }, at);
  await page.fill('.all-in', 'Haii King');
  await page.press('.all-in', 'Enter');
  await page.waitForSelector('.al-mine-sent');
  assert.deepEqual(await page.evaluate(() => window.__calls), [['send', 'quietkoala', 'Haii King'], ['press', 'quietkoala', at, 'Haii King']], 'pressed where the page said, with what was sent');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('all-in')), true, 'the keyboard still in ALL\'s box');
  await page.evaluate(() => { window.__calls = []; window.__pressAnswer = 'not-sent'; });
  await page.fill('.all-in', 'try again');
  await page.press('.all-in', 'Enter');
  await page.waitForSelector('.al-mine-failed');
  assert.match((await mine()).pop(), /^failed \| .*try againNot sentKick didn't send it: it's still in its chat box/);
  assert.equal((await page.evaluate(() => window.__calls)).length, 2);
  await page.evaluate(() => { window.__calls = []; window.__answer = 'sent'; });   // a plain answer: no press
  await page.click('.al-mine-failed [data-cmd="all.retry"]');
  await page.waitForSelector('.al-mine-failed', { state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.__calls), [['send', 'quietkoala', 'try again']]);
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
  assert.deepEqual(await lines(page), ['al-m | Kdriftwood_7: say hi to samShoutout', 'al-ev | Koakmoss redeemed Hydrate', 'al-ev | KJshoti sent Full Send · 100 Kicks',
    'al-ev | Kbrightwick gifted 2 subs2 recipients', 'al-m | Ttinroof: play the new mapChannel points']);
  assert.equal(await page.$$eval('.all-list .al-rw', l => l.length), 2, 'redeems: their own edge');
  assert.equal(await page.$eval('.al-tag-rw', e => e.style.getPropertyValue('--rw')), '#00F1FF', 'in the reward\'s colour');
});

test('ALL: a YouTube gift is an event (the gift picked out); YouTube\'s stand-ins for held messages, its ticker and its own notice are left out, and don\'t count as unreadable', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const YT = (type, r) => ({ addChatItemAction: { item: { [type]: r } } });
  await feed(page, 'tw:quietkoala', { s: 'youtube', raw: [YT('liveChatPlaceholderItemRenderer', { id: 'p1', timestampUsec: '1' }), YT('liveChatViewerEngagementMessageRenderer', { id: 'n1', message: { runs: [{ text: 'Welcome to live chat!' }] } }),
    { addLiveChatTickerItemAction: { item: { liveChatTickerPaidMessageItemRenderer: { id: 't1' } } } },
    YT('giftMessageViewModel', { id: 'g1', text: { content: 'sent Pepero yummy!' }, authorName: { content: '@Mika ' } })] });
  assert.deepEqual(await lines(page), ['al-ev | Y@Mika sent Pepero yummy!']);
  assert.equal(await page.$eval('.all-list .al-ev .al-amt', e => e.textContent), 'Pepero yummy!', 'the gift: picked out, as an amount is');
  assert.deepEqual(await page.evaluate(() => { const h = window.allHealth.healthOf.get('tw:quietkoala'); return [h.read, h.bad, h.badRaws.length]; }), [1, 0, 0], 'left out: neither read nor unreadable');
  await feed(page, 'tw:quietkoala', { s: 'youtube', raw: [YT('somethingNew', { id: 'x' })] });
  assert.equal(await page.evaluate(() => window.allHealth.healthOf.get('tw:quietkoala').bad), 1, 'one it doesn\'t know still counts');
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
  // a press on the message: all of it, over several lines; again: one line. Its link opens without that
  await feed(page, 'quietkoala', { s: 'kick', raw: [kpin('k6', 'scrims at 8pm, sign up at tilt.fyi/71JEms and read the rules first, all of them, twice over please')] });
  assert.deepEqual(await page.$eval('.all-pin-t', e => [getComputedStyle(e).whiteSpace, e.getAttribute('aria-expanded'), e.dataset.cmd]), ['nowrap', 'false', 'all.pinFull']);
  await page.click('.all-pin-t b');
  assert.deepEqual(await page.$eval('.all-pin-t', e => [getComputedStyle(e).whiteSpace, e.getAttribute('aria-expanded')]), ['normal', 'true']);
  await page.evaluate(() => { window.__opened = []; window.open = url => { window.__opened.push(url); return null; }; });
  await page.click('.all-pin-t .al-link');
  assert.deepEqual(await page.evaluate(() => window.__opened), ['https://tilt.fyi/71JEms']);
  assert.equal(await page.getAttribute('.all-pin-t', 'aria-expanded'), 'true', 'the link: not a press on the message');
  await page.click('.all-pin-t b');
  assert.equal(await page.getAttribute('.all-pin-t', 'aria-expanded'), 'false');
  await feed(page, 'quietkoala', { s: 'kick', raw: [kpin('k5', 'scrims at 8pm')] });
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
  assert.deepEqual(await lines(page), ['al-ev | TBrightWick gifted 3 subs2 recipients', 'al-ev | TBrightWick gifted a sub to Sol'], 'one line for the gift; a gift of its own stays a line');
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
  assert.match((await lines(page)).pop(), /^al-ev \| KYajeli gifted 2 subs2 recipientsTo you$/);
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
  await page.waitForFunction(() => document.querySelectorAll('.al-mine-sent').length === 2);
  // as it changes live: followers only for 10 minutes (Kick's event), and you only followed a minute ago
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, follower: true, followedAt: Date.now() - 60000 } }));
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatroomUpdatedEvent', { slow_mode: { enabled: false }, followers_mode: { enabled: true, min_duration: 10 }, subscribers_mode: { enabled: false }, emotes_mode: { enabled: false } })] });
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Can’t send on Kick', 'the bar says why');
  assert.equal(await page.isDisabled('.all-in'), true);
  assert.equal(await bar(), 'Followers onlyYou can chat in 9 min', 'said once: not its chip as well');
  assert.deepEqual(await page.$eval('.all-mb', e => [e.querySelector('b').textContent, e.querySelector('small').textContent, e.title]), ['Followers only', 'You can chat in 9 min', 'Followers only · you can chat in 9 min'], 'two lines: what\'s in the way, what to do');
  // subscribers only, not subscribed; then a ban
  await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatroomUpdatedEvent', { followers_mode: { enabled: false }, subscribers_mode: { enabled: true } })] });
  assert.equal(await bar(), 'Subscribers onlySubscribe on Kick to chat');
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, banned: true } }));
  assert.equal(await page.$eval('.all-mb', e => e.querySelectorAll('small').length), 0, 'one sentence: one line');
  assert.equal(await bar(), 'You’re banned from this Kick chatSubscribers only', 'not the mode it\'s because of: its chip stays');
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Can’t send on Kick');
  // a moderator: the modes show, quieter, and don't apply
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, mod: true } }));
  assert.equal(await page.isDisabled('.all-in'), false);
  assert.equal(await bar(), 'Subscribers onlyexempt');
  // Twitch (Tab): its ROOMSTATE, its own modes; YouTube's words where its box would be
  await page.evaluate(() => window.allChat.setModes('tw:quietkoala', { me: { signedIn: true, follower: false } }));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'followers-only': '0', 'room-id': '1' }, ':tmi.twitch.tv ROOMSTATE #quietkoala')] });
  await page.focus('.all-in'); await page.keyboard.press('Tab');
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Can’t send on Twitch');
  assert.equal(await bar(), 'Followers onlyFollow on Twitch to chat');
  await page.evaluate(() => window.allChat.setModes('yt:quietkoala', { blocked: 'Sign in to chat' }));
});

test('ALL: YouTube asking you to sign in says so once, plainly; signed in since (a whole answer without a block), its box works again; its other blocks keep its words', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const live = { ...LIVE, 'yt:@quietkoala': { live: true, checked: Date.now() } };
  await page.evaluate(live => { window.smvNotes.liveStatus(live); window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, live);
  await page.waitForFunction(() => window.openWins().some(w => w.kind === 'chat' && w.channel === 'yt:@quietkoala'));
  const bar = () => page.$eval('.all-modes', e => (e.hidden ? '' : e.textContent.replace(/\s+/g, ' ').trim()));
  await page.focus('.all-in'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on YouTube');
  // signed out: YouTube's two lines ("All messages … publicly", "Sign in to chat") aren't shown run together, the app says it
  await page.evaluate(() => window.allChat.setModes('yt:@quietkoala', { blocked: 'All messages that you send will appear publicly · Sign in to chat', signIn: true }));
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Can’t send on YouTube');
  assert.equal(await page.isDisabled('.all-in'), true);
  assert.deepEqual(await page.$eval('.all-mb', e => [e.querySelector('b').textContent, e.querySelector('small').textContent]), ['Not signed in to YouTube', 'Sign in from Settings › Accounts to chat']);
  // a mode change from its messages (no answer about you) leaves the block
  await page.evaluate(() => window.allChat.setModes('yt:@quietkoala', { modes: { slow: 5 } }));
  assert.equal(await page.isDisabled('.all-in'), true);
  // signed in and reloaded: its box is there (modesAgent's answer has no block): the box works and the bar's gone
  await page.evaluate(() => window.allChat.setModes('yt:@quietkoala', { modes: {}, me: { signedIn: true } }));
  assert.equal(await page.isDisabled('.all-in'), false);
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on YouTube');
  assert.equal(await page.$eval('.all-view', e => e.classList.contains('all-blocked')), false);
  assert.equal(await bar(), 'Slow 5s', 'only its modes');
  assert.deepEqual(await page.evaluate(() => { const m = window.allChat.modesOf.get('yt:@quietkoala'); return [m.blocked, m.signIn]; }), ['', false]);
  // members only: YouTube's words, its lines as what's in the way, then what to do
  await page.evaluate(() => window.allChat.setModes('yt:@quietkoala', { blocked: 'Members-only mode · Join this channel to chat' }));
  assert.deepEqual(await page.$eval('.all-mb', e => [e.querySelector('b').textContent, e.querySelector('small').textContent]), ['Members-only mode', 'Join this channel to chat']);
  // Kick's answers clear a block the same way
  assert.equal(await page.evaluate(() => { window.allChat.setModes('quietkoala', { blocked: 'Something in the way' }); window.allChat.setModes('quietkoala', { modes: { slow: 0 }, me: { signedIn: true } }); return window.allChat.modesOf.get('quietkoala').blocked; }), '');
});

test('ALL: Reload on its window reloads each site chat it reads (their hidden tabs too); a site\'s own tab reloads only its chat', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const live = { ...LIVE, 'yt:@quietkoala': { live: true, videoId: 'koalaLive01', checked: Date.now() } };
  await page.evaluate(live => window.smvNotes.liveStatus(live), live);
  await page.waitForFunction(() => window.openWins().filter(w => w.kind === 'chat' && w.view).length === 3);
  const blank = () => page.evaluate(() => window.openWins().forEach(w => { if (w.kind === 'chat') w.view.src = 'about:blank'; }));
  const loaded = () => page.evaluate(() => window.openWins().filter(w => w.kind === 'chat' && w.view.getAttribute('src') !== 'about:blank').map(w => w.channel).sort());
  const reload = () => page.$eval('#stage .win.chat:not(.tab-hidden) [data-a=reload]', b => b.click());   // (in the bar's overflow: as its command presses it)
  await blank();
  await reload();
  assert.deepEqual(await loaded(), ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala']);
  // Twitch's own tab: only its chat
  await page.click('#stage .win.chat:not(.tab-hidden) .ptabs button:text-is("T")');
  await page.waitForSelector('#stage .win.chat:not(.tab-hidden):not(.all-on)');
  await blank();
  await reload();
  assert.deepEqual(await loaded(), ['tw:quietkoala']);
});

test('ALL: YouTube\'s chat blocked as it loads is asked again a moment later (its box drawn since clears it); a chat closed forgets its rules, opened again it reads them afresh', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => window.smvNotes.liveStatus(live), { ...LIVE, 'yt:@quietkoala': { live: true, videoId: 'koalaLive01', checked: Date.now() } });
  await page.waitForFunction(() => window.openWins().some(w => w.kind === 'chat' && w.channel === 'yt:@quietkoala' && w.view));
  // its page answers "Sign in" first (its box not drawn yet), its box after
  const load = answers => page.evaluate(async answers => {
    const { feedReady } = await import('./page/chat/all-chat.js');
    const w = window.openWins().find(o => o.kind === 'chat' && o.channel === 'yt:@quietkoala');
    window.__modesAsked = 0;
    feedReady(w, { executeJavaScript: async code => (code.startsWith('(async function modesAgent(') ? answers[Math.min(window.__modesAsked++, answers.length - 1)] : null), getWebContentsId: () => 1 });
  }, answers);
  const st = () => page.evaluate(() => { const m = window.allChat.modesOf.get('yt:@quietkoala'); return m ? m.blocked : null; });
  await load([{ blocked: 'Sign in to chat', signIn: true }, { modes: {}, me: { signedIn: true } }]);
  await page.waitForFunction(() => window.__modesAsked === 1);
  assert.equal(await st(), 'Sign in to chat');
  await page.waitForFunction(() => window.__modesAsked === 2, null, { timeout: 10000 });
  await page.waitForFunction(() => window.allChat.modesOf.get('yt:@quietkoala').blocked === '');
  // signed in: not asked again. Nothing to read yet, then blocked every time: asked twice more, no more
  await load([null, { blocked: 'Members-only mode · Join this channel to chat' }]);
  await page.waitForFunction(() => window.__modesAsked === 3, null, { timeout: 15000 });
  await page.waitForTimeout(4500);
  assert.equal(await page.evaluate(() => window.__modesAsked), 3);
  assert.equal(await st(), 'Members-only mode · Join this channel to chat');
  // the window closed: its chats' rules go; opened again, a signed-in answer is all it knows
  await page.evaluate(() => window.allChat.setModes('quietkoala', { modes: { slow: 3 }, me: { signedIn: true } }));
  await page.$eval('#stage .win.chat:not(.tab-hidden) [data-a=close]', b => b.click());
  await page.waitForFunction(() => !window.openWins().some(w => w.kind === 'chat'));
  assert.deepEqual(await page.evaluate(() => [...window.allChat.modesOf.keys()]), []);
  await page.evaluate(live => { window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala']); window.smvNotes.liveStatus(live); }, { ...LIVE, 'yt:@quietkoala': { live: true, videoId: 'koalaLive02', checked: Date.now() } });
  await page.waitForFunction(() => window.openWins().some(w => w.kind === 'chat' && w.channel === 'yt:@quietkoala'));
  await load([{ modes: {}, me: { signedIn: true } }]);
  await page.waitForFunction(() => window.__modesAsked === 1);
  assert.equal(await st(), '');
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

test('ALL: Twitch\'s raid countdown is one line, kept up to date and counting down; going, it\'s the raid\'s line (Open ›), also once the raid is followed, either way round; called off, it says so', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const pub = obj => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify(obj) } });
  const sec = Math.floor(Date.now() / 1000);
  const raid = (type, id, to, viewers, start = sec - 45) => pub({ type, raid: { id, source_display_name: 'Quietkoala', target_login: to, target_display_name: to, force_raid_now_seconds: 90, viewer_count: viewers, raid_created_at: start } });
  const raids = async () => (await lines(page)).filter((l, i, all) => /rai/.test(l));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_update_v2', 'r7', 'pixelmoth', 1)] });
  assert.match((await raids()).join('\n'), /^al-ev \| Tquietkoala is raiding pixelmoth · 1 viewerin 4[4-6]s$/);
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_update_v2', 'r7', 'pixelmoth', 27)] });
  const two = await raids();
  assert.equal(two.length, 1, 'the same line, not another');
  assert.match(two[0], /pixelmoth · 27 viewersin \d+s$/);
  const left = () => page.$eval('.al-raidin', e => +e.textContent.replace(/\D/g, ''));
  const was = await left();
  await page.waitForFunction(n => +document.querySelector('.al-raidin').textContent.replace(/\D/g, '') < n, was, { timeout: 3000 });
  // going: the raid's line, Open › (the raid followed afterwards finds it: no second line)
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_go_v2', 'r7', 'pixelmoth', 27)] });
  assert.deepEqual(await raids(), ['al-ev | Tquietkoala raided pixelmoth on Twitch · 27 viewersOpen ›']);
  assert.equal(await page.locator('.al-raidin').count(), 0);
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:pixelmoth', true));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_update_v2', 'r7', 'pixelmoth', 30)] });
  assert.deepEqual(await raids(), ['al-ev | Tquietkoala raided pixelmoth on Twitch · 27 viewersOpen ›'], 'one line for one raid; late news changes nothing');
  await page.click('[data-cmd="all.raidOpen"]');
  assert.equal((await raids()).pop(), 'al-ev | Tquietkoala raided pixelmoth on Twitch · 27 viewersOpened');
  // called off; news after that changes nothing, and a cancel for a raid it never saw adds nothing
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_update_v2', 'r8', 'novalynx', 12), raid('raid_cancel_v2', 'r8', 'novalynx', 12), raid('raid_go_v2', 'r8', 'novalynx', 12), raid('raid_cancel_v2', 'r0', 'tinroof', 3)] });
  assert.equal((await raids()).pop(), 'al-ev | Tquietkoala called off the raid on novalynx');
  assert.equal((await raids()).length, 2);
  // the raid followed first (windows/raids.js), then Twitch's go: still one line, with its viewers
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:brightwick', true));
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_go_v2', 'r9', 'brightwick', 8)] });
  assert.equal((await raids()).pop(), 'al-ev | Tquietkoala raided brightwick on Twitch · 8 viewersOpen ›');
  assert.equal((await raids()).length, 3);
  // a countdown the raid followed ends too; one past its time says any moment, one without a start no time
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_update_v2', 'r10', 'tinroof', 5, sec - 200)] });
  assert.equal((await raids()).pop(), 'al-ev | Tquietkoala is raiding tinroof · 5 viewersany moment');
  await page.evaluate(() => window.followRaid('tw:quietkoala', 'tw:tinroof', true));
  assert.equal((await raids()).pop(), 'al-ev | Tquietkoala raided tinroof on Twitch · 5 viewersOpen ›');
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [raid('raid_update_v2', 'r11', 'pixelmoth', 0, 0)] });
  assert.equal((await raids()).pop(), 'al-ev | Tquietkoala is raiding pixelmoth');
  assert.equal((await raids()).length, 5);
});

test('ALL: a gift sub paid forward (from someone, or an anonymous one) and a goal reached are events', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const fwd = (id, prm) => TW({ 'display-name': 'Brightwick', login: 'brightwick', id, 'msg-id': 'communitypayforward', 'system-msg': 'Brightwick\\sis\\spaying\\sforward\\sthe\\sGift', ...prm }, ':tmi.twitch.tv USERNOTICE #quietkoala');
  const goal = g => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'goal_achieved', data: { goal: { id: 'g1', state: 'ACTIVE', currentContributions: 230, targetContributions: 230, ...g } } }) } });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [fwd('p1', { 'msg-param-prior-gifter-anonymous': 'false', 'msg-param-prior-gifter-display-name': 'Tinroof' }),
    fwd('p2', { 'msg-param-prior-gifter-anonymous': 'true', 'msg-param-prior-gifter-display-name': 'AnAnonymousGifter' }),
    goal({ contributionType: 'FOLLOWERS', description: '' }), goal({ id: 'g2', contributionType: 'SUBS', currentContributions: 50, targetContributions: 50, description: 'Road to 50' })] });
  assert.deepEqual(await lines(page), ['al-ev | TBrightwick paid forward the gift sub from Tinroof', 'al-ev | TBrightwick paid forward an anonymous gift sub',
    'al-ev | TFollower goal reached · 230', 'al-ev | TSub goal reached · 50Road to 50']);
  assert.deepEqual(await page.$$eval('.al-ev .al-amt', l => l.map(e => e.textContent)), ['Tinroof', '230', '50'], 'who gave it, and the count, picked out');
});

test('ALL\'s health: a site whose chat has new messages while ALL read none is loaded again once, then its badge turns amber with a line (See it on …, ✕); messages no reader understood, and sends failing twice, too; it clears itself', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(() => {
    window.__probe = 0; window.__reloads = 0;
    const w = window.openWins().find(o => o.channel === 'tw:quietkoala');
    w.ready = true; w.feedOn = true;
    w.view.executeJavaScript = async js => (/lineProbe|rows\[rows.length - 1\]/.test(js) ? { n: 50, last: 'line ' + (++window.__probe) } : true);
    w.view.reload = () => { window.__reloads++; };
  });
  const check = () => page.evaluate(() => window.allHealth.checkAll());
  const banner = () => page.$eval('.all-health', e => (e.hidden ? '' : e.textContent.replace(/\s+/g, ' ').trim()));
  await check();                                   // (the first look: what its chat shows now)
  await check();                                   // new lines there, none read: once is no reason (a site's own line, a message drawn again)
  assert.equal(await page.evaluate(() => window.__reloads), 0, 'not for one check');
  // a chat page that loads again starts from what it shows then (its history doesn't come over its connection)
  await page.evaluate(() => window.allHealth.chatLoaded('tw:quietkoala'));
  await check();                                   // (its first look again)
  await check();
  assert.equal(await page.evaluate(() => window.__reloads), 0, 'loaded: from there');
  // not while you've just sent there: loading it again would hold your message up
  await page.evaluate(() => { window.allHealth.noteSend('tw:quietkoala', 'sent'); });
  await check();
  assert.equal(await page.evaluate(() => window.__reloads), 0, 'just sent: not loaded again');
  await page.evaluate(() => { window.allHealth.healthOf.get('tw:quietkoala').sentAt = 0; });
  await check();                                   // twice in a row, nothing sent lately: loaded again
  assert.equal(await page.evaluate(() => window.__reloads), 1);
  assert.equal(await banner(), '', 'not yet: it tries again first');
  await check(); await check();
  assert.equal(await banner(), 'TALL isn\'t reading Twitch\'s messages: its chat has new onesReport for a fixSee it on Twitch ›');
  assert.equal(await page.$eval('.all-sites .pi-twitch', e => e.classList.contains('warn')), true);
  // read again: it clears itself
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'drift', id: 'a' }, ':drift!d@d PRIVMSG #quietkoala :back')] });
  await check();
  assert.equal(await banner(), '');
  assert.equal(await page.$eval('.all-sites .pi-twitch', e => e.classList.contains('warn')), false);
  // what no reader understood, more than what it read
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: Array.from({ length: 6 }, (_, i) => '@@ a shape Twitch never sent ' + i) });
  await check();
  assert.match(await banner(), /^TALL can't make sense of Twitch's messages \(6 of the last 6\)/);
  await page.click('.all-hl-x');
  assert.equal(await banner(), '', '✕: hidden');
  // sending failing twice for the same reason
  await page.evaluate(() => { window.allHealth.noteSend('quietkoala', 'not-filled', 'Couldn\'t type into Kick\'s chat box'); window.allHealth.noteSend('quietkoala', 'disabled'); window.allHealth.noteSend('quietkoala', 'not-filled', 'Couldn\'t type into Kick\'s chat box'); });
  assert.match(await banner(), /^KSending on Kick isn't working: Couldn't type into Kick's chat box/);
  await page.evaluate(() => window.allHealth.noteSend('quietkoala', 'sent'));
  assert.equal(await banner(), '');
  // See it on …: that site's own chat
  await page.evaluate(() => window.allHealth.broke('tw:quietkoala', 'read', 'x'));
  await page.click('.all-hl [data-cmd="all.healthSee"]');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T*', 'Y']);
});

test('ALL: :name suggests the send site\'s emotes (with pictures), the smiley opens its picker; picking one locks the box to that site and sends it as the site writes it', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.__asked = [];
    window.kmv = { ...(window.kmv || {}), emotesPick: async ch => { window.__asked.push(ch); return ch === 'quietkoala'
      ? [{ id: 'kick-channel', label: 'Channel', pic: img, emotes: [{ name: 'koalaHype', url: img, send: '[emote:1:koalaHype]', subs: true }, { name: 'koalaWave', url: img, send: '[emote:2:koalaWave]' }] },
         { id: 'kick-yours', label: 'Sub emotes', emotes: [{ name: 'otterWave', url: img, send: '[emote:4:otterWave]', from: 'Otter' }, { name: 'otterLUL', url: img, send: '[emote:5:otterLUL]', from: 'Otter' }, { name: 'foxHi', url: img, send: '[emote:6:foxHi]', from: 'Fox' }], channels: [{ name: 'Otter', pic: img }, { name: 'Fox' }] },
         { id: 'kick-global', label: 'Kick', emotes: [{ name: 'KEKW', url: img, send: '[emote:9:KEKW]' }] }]
      : [{ id: 'twitch-channel', label: 'Channel', emotes: [{ name: 'koalaTwHi', url: img, send: 'koalaTwHi' }] }, { id: 'twitch-global', label: 'Twitch', emotes: [{ name: 'Kappa', url: img, send: 'Kappa' }] }]; } };
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push([m.channel, text]); return 'sent'; };
  }, LIVE);
  // :name
  await page.focus('.all-in');
  await page.keyboard.type('gg :ke');
  await page.waitForSelector('.all-at:not([hidden]) .all-emi');
  assert.deepEqual(await page.$$eval('.all-at .all-emi', l => l.map(b => b.textContent)), ['KEKWKick']);
  assert.match(await page.textContent('.all-at-h'), /Kick emotes/);
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.all-in', b => b.value), 'gg KEKW ');
  const boxShows = () => page.$eval('.all-in', b => [...b.childNodes].map(n => (n.nodeName === 'IMG' ? `[${n.alt}]` : n.textContent)).join(''));
  assert.equal(await boxShows(), 'gg [KEKW] ', 'the emote picked: its picture in the box');
  // the caret after it: typing goes on after the emote, Backspace takes it out whole
  await page.keyboard.type('nice');
  assert.equal(await page.$eval('.all-in', b => b.value), 'gg KEKW nice');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  assert.deepEqual(await page.$eval('.all-in', b => [b.value, b.selectionStart]), ['gg KEKW', 7]);
  await page.keyboard.press('Backspace');
  assert.equal(await page.$eval('.all-in', b => b.value), 'gg ');
  await page.keyboard.type(':ke'); await page.waitForSelector('.all-at:not([hidden]) .all-emi'); await page.keyboard.press('Enter');
  assert.equal(await boxShows(), 'gg [KEKW] ');
  assert.match(await page.textContent('.all-rb'), /Emotes from Kick · sends on Kick only/, 'locked to Kick');
  await page.keyboard.press('Tab');
  assert.match(await page.textContent('#msg'), /Locked to Kick while using its emotes/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends[0]), ['quietkoala', 'gg [emote:9:KEKW]'], 'as Kick writes it');
  assert.equal(await page.$eval('.al-mine .al-txt', t => [...t.childNodes].map(n => (n.nodeName === 'IMG' ? `[${n.alt}]` : n.textContent)).join('')), 'gg [KEKW]', 'your line shows its picture');
  assert.equal(await page.isVisible('.all-rb'), false, 'sent: unlocked');
  assert.deepEqual(await page.$eval('.all-in', b => [b.value, b.childNodes.length]), ['', 0], 'sent: the box empty (its placeholder shows)');
  // a sub emote from another channel: its channel beside it
  await page.focus('.all-in'); await page.keyboard.type(':otterl');
  await page.waitForSelector('.all-at:not([hidden]) .all-emi');
  assert.deepEqual(await page.$$eval('.all-at .all-emi', l => l.map(b => b.textContent)), ['otterLULOtter']);
  await page.keyboard.press('Escape'); await page.fill('.all-in', '');
  // the smiley: all of them, under a heading for each kind (each channel you're subscribed to with its picture)
  await page.click('.all-emo-b');
  await page.waitForSelector('.all-ep .all-ep-e');
  // (a heading: its icon's kind, then its words)
  const icon = e => { const i = e.querySelector('.all-ep-pic, .all-ep-ic, .pi, .ch-av'); return !i ? '' : i.classList.contains('all-ep-pic') ? (i.querySelector('img') ? '[pic] ' : '[letter] ') : i.classList.contains('ch-av') ? '[channel] ' : i.classList.contains('pi') ? `[${i.textContent}] ` : `[${[...i.classList].pop()}] `; };
  const words = e => [...e.childNodes].filter(n => n.nodeType === 3 || n.tagName === 'SMALL').map(n => n.textContent).join(' ');
  const grid = () => page.$$eval('.all-ep-grid > *', (l, [icon, words]) => { const ic = eval(icon), w = eval(words); return l.map(e => e.classList.contains('all-ep-sec') ? `# ${ic(e)}${w(e)}` : e.title); }, [icon.toString(), words.toString()]);
  assert.deepEqual(await grid(), ['# [pic] Channel', 'koalaHype (subscribers)', 'koalaWave', '# [K] Kick', 'KEKW', '# [pic] Otter Sub emotes', 'otterWave · Otter', 'otterLUL · Otter', '# [letter] Fox Sub emotes', 'foxHi · Fox'], 'the channel\'s picture; the site\'s badge; Sub emotes last (a channel without a picture: its first letter)');
  // search: across them, under their headings
  await page.fill('.all-ep-q', 'wave');
  assert.deepEqual(await grid(), ['# [pic] Channel', 'koalaWave', '# [pic] Otter Sub emotes', 'otterWave · Otter']);
  await page.fill('.all-ep-q', 'zzz');
  assert.match(await page.textContent('.all-ep-grid'), /No Kick emote matches “zzz”/);
  await page.fill('.all-ep-q', '');
  // beside the search: show one kind, or one channel (with their pictures in its list)
  assert.deepEqual(await page.$$eval('.all-ep-f option', l => l.map(o => o.textContent)), ['All emotes', 'Channel', 'Kick', 'Sub emotes', 'Otter', 'Fox']);
  await page.click('.all-ep-f');
  assert.deepEqual(await page.$$eval('.dd-list button', (l, icon) => { const ic = eval(icon); return l.map(b => ic(b) + (b.querySelector('.dd-t') || b).textContent); }, icon.toString()), ['[all] All emotes', '[pic] Channel', '[K] Kick', '[yours] Sub emotes', '[pic] Otter', '[letter] Fox'], 'each with its icon');
  // its list stays inside the picker
  assert.equal(await page.evaluate(() => { const l = document.querySelector('.dd-list').getBoundingClientRect(), e = document.querySelector('.all-ep').getBoundingClientRect(); return l.bottom <= e.bottom + 0.5 && l.top >= e.top - 0.5 && l.right <= e.right + 0.5 && l.left >= e.left - 0.5; }), true);
  assert.deepEqual(await page.$eval('.dd-list .all-ep-pic', e => { const c = getComputedStyle(e); return [c.width, c.height, c.borderRadius]; }), ['16px', '16px', '50%'], 'small circles, as the window swap list\'s');
  await page.keyboard.press('Escape');
  await page.selectOption('.all-ep-f', 'kick-yours');
  assert.deepEqual(await grid(), ['# [pic] Otter Sub emotes', 'otterWave · Otter', 'otterLUL · Otter', '# [letter] Fox Sub emotes', 'foxHi · Fox']);
  await page.selectOption('.all-ep-f', 'kick-yours/Fox');
  assert.deepEqual(await grid(), ['# [letter] Fox Sub emotes', 'foxHi · Fox']);
  await page.selectOption('.all-ep-f', 'kick-global');
  await page.click('.all-ep-e');
  assert.equal(await page.$eval('.all-in', b => b.value), 'KEKW ');
  assert.equal(await boxShows(), '[KEKW] ', 'from the picker too: its picture');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-ep'), false, 'Esc closes it');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('.all-rb'), false, 'Esc: unlocked');
  assert.equal(await boxShows(), 'KEKW ', 'unlocked: a word again (sent as one)');
  // on Twitch an emote is its name; a word that only looks like an emote stays a word
  await page.fill('.all-in', '');
  await page.keyboard.press('Tab');
  await page.keyboard.type(':kap');
  await page.waitForSelector('.all-at:not([hidden]) .all-emi');
  await page.keyboard.press('Tab');
  await page.keyboard.type('KEKW');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.al-mine-sent').length === 2);
  assert.deepEqual(await page.evaluate(() => window.__sends[1]), ['tw:quietkoala', 'Kappa KEKW']);
  assert.deepEqual(await page.evaluate(() => window.__asked), ['quietkoala', 'tw:quietkoala'], 'each site\'s asked once');
  // Twitch's picker: a channel group without its picture (the site didn't send one): the app's own for the channel
  await page.click('.all-emo-b');
  await page.waitForSelector('.all-ep .all-ep-e');
  assert.deepEqual(await page.$$eval('.all-ep-sec', l => l.map(e => (e.querySelector('.ch-av') ? '[channel] ' : e.querySelector('.pi') ? `[${e.querySelector('.pi').textContent}] ` : '') + [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))), ['[channel] Channel', '[T] Twitch']);
});

test('ALL: the emotes you used last, in a row over the box (as Kick\'s chat has): for the site it sends on, the ones its channel can use, the newest first, as many as fit; picked from the smiley or sent from the row, to the front (from :name, or sent in a message, not); a click sends one; kept', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  const ready = live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; });
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', e = (name, send) => ({ name, url: img, send: send || name });
    const many = Array.from({ length: 24 }, (_, i) => 'm' + String(i + 1).padStart(2, '0'));
    window.kmv = { ...(window.kmv || {}), emotesPick: async ch => (ch === 'quietkoala'
      ? [{ id: 'kick-channel', label: 'Channel', emotes: [e('koalaHype', '[emote:1:koalaHype]'), e('koalaWave', '[emote:2:koalaWave]')] }, { id: 'kick-global', label: 'Kick', emotes: [e('KEKW', '[emote:9:KEKW]')] },
         { id: '7tv', label: '7TV', emotes: many.map(n => e(n)) }]
      : [{ id: 'twitch-global', label: 'Twitch', emotes: [e('Kappa')] }]) };
    window.__sends = []; window.allChat.sender.send = async (m, text) => { window.__sends.push([m.channel, text]); return window.__answer || 'sent'; };
    window.smvNotes.liveStatus(live);
  };
  await page.evaluate(ready, LIVE);
  const row = () => page.$$eval('.all-re:not([hidden]) .all-re-e', l => l.map(b => b.title || b.dataset.tipTitle));
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.allRecentEmotes')));
  const rowIs = async (l, why) => { await page.waitForFunction(l => [...document.querySelectorAll('.all-re:not([hidden]) .all-re-e')].map(b => b.title).join() === l.join(), l, { timeout: 3000 }).catch(() => {}); assert.deepEqual(await row(), l, why); };
  const sends = () => page.evaluate(() => window.__sends.length);
  const sendBox = async () => { const n = await sends(); await page.focus('.all-in'); await page.keyboard.press('Enter');
    await page.waitForFunction(n => window.__sends.length > n && !document.querySelector('.all-view').querySelector('.al-mine-sending'), n); };
  const fromSmiley = async name => {
    await page.click('.all-emo-b'); await page.waitForSelector('.all-ep .all-ep-e');
    await page.click(`.all-ep-e[aria-label="${name}"]`);
    await page.click('.all-in'); await page.waitForSelector('.all-ep', { state: 'hidden' });   // (closed by a press outside: Escape would unlock the box too)
  };
  assert.equal(await page.isVisible('.all-re'), false, 'nothing picked yet: no row');
  // picked from :name, and sent: not in the row, nothing saved
  await page.focus('.all-in'); await page.keyboard.type(':ke'); await page.waitForSelector('.all-at:not([hidden]) .all-emi'); await page.keyboard.press('Enter');
  await page.keyboard.type('gg');
  await sendBox();
  assert.deepEqual(await page.evaluate(() => window.__sends[0]), ['quietkoala', '[emote:9:KEKW] gg'], 'still sent as the emote');
  assert.equal(await page.isVisible('.all-re'), false, ':name: no row');
  assert.equal(await saved(), null, ':name: nothing saved');
  // picked from the smiley: to the front of the site's list at once (saved), before it's sent, the row shows them
  await fromSmiley('koalaWave');
  await rowIs(['koalaWave'], 'picked: in the row straight away');
  await fromSmiley('KEKW');
  await rowIs(['KEKW', 'koalaWave'], 'the newest first');
  assert.deepEqual(await saved(), { kick: ['KEKW', 'koalaWave'] });
  assert.deepEqual(await page.$eval('.all-re-e', b => [b.dataset.cmd, b.getAttribute('aria-label'), b.querySelector('img').getBoundingClientRect().width, b.getBoundingClientRect().height]), ['all.emoteSend', 'KEKW', 22, 26], 'small, still easy to press');
  assert.equal(await page.evaluate(() => { const r = document.querySelector('.all-re').getBoundingClientRect(), b = document.querySelector('.all-box').getBoundingClientRect(); return b.top - r.bottom >= 0 && b.top - r.bottom < 10; }), true, 'just over the box');
  // sent: no change (the order as picked)
  await sendBox();
  assert.deepEqual(await page.evaluate(() => window.__sends[1]), ['quietkoala', '[emote:2:koalaWave] [emote:9:KEKW]']);
  assert.deepEqual(await saved(), { kick: ['KEKW', 'koalaWave'] }, 'sending doesn\'t move them');
  // one in the row picked again from :name: stays where it is
  await page.focus('.all-in'); await page.keyboard.type(':koalaw'); await page.waitForSelector('.all-at:not([hidden]) .all-emi'); await page.keyboard.press('Tab');
  await sendBox();
  await rowIs(['KEKW', 'koalaWave'], ':name doesn\'t move it to the front');
  assert.deepEqual(await saved(), { kick: ['KEKW', 'koalaWave'] });
  // again from the smiley: to the front, once
  await fromSmiley('koalaWave');
  await rowIs(['koalaWave', 'KEKW']);
  await page.fill('.all-in', 'just words');
  await sendBox();
  assert.deepEqual(await page.evaluate(() => window.__sends[3]), ['quietkoala', 'just words']);
  assert.deepEqual(await saved(), { kick: ['koalaWave', 'KEKW'] }, 'once');
  // the smiley's picker opens over the row, not half over it
  await page.click('.all-emo-b');
  await page.waitForSelector('.all-ep .all-ep-e');
  await page.click('.all-ep-e[aria-label="koalaHype"]');
  await rowIs(['koalaHype', 'koalaWave', 'KEKW']);
  assert.equal(await page.evaluate(() => document.querySelector('.all-ep').getBoundingClientRect().bottom <= document.querySelector('.all-re').getBoundingClientRect().top), true, 'the picker over the row');
  await page.keyboard.press('Escape'); await page.focus('.all-in'); await page.keyboard.press('Escape'); await page.fill('.all-in', '');
  await page.focus('.all-in'); await page.keyboard.type(':koalaw'); await page.waitForSelector('.all-at:not([hidden]) .all-emi');
  assert.equal(await page.evaluate(() => document.querySelector('.all-at').getBoundingClientRect().bottom <= document.querySelector('.all-re').getBoundingClientRect().top), true, 'the :name list over the row too');
  await page.keyboard.press('Escape'); await page.fill('.all-in', '');
  await page.evaluate(() => localStorage.setItem('kickMultiview.allRecentEmotes', JSON.stringify({ kick: ['koalaWave', 'KEKW'] })));
  // another site: its own list (none yet: no row); only the ones its channel can use
  await page.focus('.all-in'); await page.keyboard.press('Tab');
  assert.equal(await page.getAttribute('.all-in', 'placeholder'), 'Send a message on Twitch');
  assert.equal(await page.isVisible('.all-re'), false, 'nothing sent on Twitch yet');
  await page.evaluate(() => localStorage.setItem('kickMultiview.allRecentEmotes', JSON.stringify({ kick: ['koalaWave', 'KEKW'], twitch: ['notYours', 'Kappa'] })));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('.all-re:not([hidden]) .all-re-e').length === 1);
  assert.deepEqual(await row(), ['Kappa'], 'an emote that channel can\'t use isn\'t there');
  // a click: sends it on its own at once, as your line in ALL; what's in the box stays, the keyboard still in it
  await page.keyboard.type('hi');
  await page.click('.all-re-e');
  await page.waitForFunction(() => window.__sends.length === 5);
  assert.deepEqual(await page.evaluate(() => window.__sends[4]), ['tw:quietkoala', 'Kappa']);
  await page.waitForSelector('.al-mine-sent .al-mine-e, .al-mine-sent img');
  assert.equal(await page.$eval('.all-in', b => b.value), 'hi');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'all-in');
  assert.equal(await page.isVisible('.all-rb'), false, 'not locked');
  assert.deepEqual(await saved(), { kick: ['koalaWave', 'KEKW'], twitch: ['Kappa', 'notYours'] }, 'sent: in front');
  await page.fill('.all-in', '');
  // kept: after a reload, Kick's row as it was
  await page.evaluate(() => localStorage.setItem('kickMultiview.allSend', JSON.stringify({ s1: 'quietkoala' })));
  await page.reload();
  await page.waitForSelector('.all-view');
  await page.evaluate(ready, LIVE);
  await page.waitForFunction(() => document.querySelectorAll('.all-re:not([hidden]) .all-re-e').length === 2);
  assert.deepEqual(await row(), ['koalaWave', 'KEKW']);
  // a click on one further along: sent, and it moves to the front
  await page.evaluate(() => window.allChat.setModes('quietkoala', { modes: { slow: 30 }, me: { signedIn: true } }));
  await page.click('.all-re-e[aria-label="KEKW"]');
  await page.waitForFunction(() => window.__sends.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__sends[0]), ['quietkoala', '[emote:9:KEKW]'], 'as its site writes it');
  await rowIs(['KEKW', 'koalaWave']);
  assert.equal(await page.$eval('.all-in', b => b.value), '');
  // slow mode, that one sent a moment ago: another isn't sent, the row as it was
  await page.waitForSelector('.all-modes.waiting');
  await page.click('.all-re-e[aria-label="koalaWave"]');
  assert.equal(await page.evaluate(() => window.__sends.length), 1, 'not while waiting');
  assert.deepEqual(await row(), ['KEKW', 'koalaWave']);
  await page.evaluate(() => window.allChat.setModes('quietkoala', { modes: { slow: 0 }, me: { signedIn: true } }));
  // 20 kept for each site; the row one line, as many as fit (no wrapping, no scrollbar)
  await page.evaluate(() => localStorage.setItem('kickMultiview.allRecentEmotes', JSON.stringify({ kick: Array.from({ length: 20 }, (_, i) => 'm' + String(i + 1).padStart(2, '0')) })));
  await page.focus('.all-in'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('.all-re:not([hidden]) .all-re-e').length === 20);
  const fit = await page.$eval('.all-re', r => { const top = r.getBoundingClientRect().top, bs = [...r.children].map(b => b.getBoundingClientRect());
    return { shown: bs.filter(b => b.top === top && b.right <= r.getBoundingClientRect().right + 0.5).length, height: r.getBoundingClientRect().height, scrolls: r.scrollWidth > r.clientWidth || getComputedStyle(r).overflowY !== 'hidden' }; });
  assert.ok(fit.shown > 3 && fit.shown < 20, `some fit, whole (${fit.shown})`);
  assert.deepEqual([fit.height, fit.scrolls], [26, false], 'one line');
  await fromSmiley('m21');
  await page.waitForFunction(() => document.querySelector('.all-re .all-re-e').getAttribute('aria-label') === 'm21');
  assert.deepEqual((await saved()).kick, ['m21', ...Array.from({ length: 19 }, (_, i) => 'm' + String(i + 1).padStart(2, '0'))], 'the newest in front, the oldest out');
});

test('ALL\'s box keeps the caret in sight as emotes go in: picked from the smiley one after another (the box not focused), and from :name inside a long line', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; });
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.kmv = { ...(window.kmv || {}), emotesPick: async () => [{ id: 'kick-global', label: 'Kick', emotes: ['koalaWave', 'KEKW'].map(n => ({ name: n, url: img, send: n })) }] };
    window.smvNotes.liveStatus(live);
  }, LIVE);
  // the caret: its place in the box as you see it, and whether it's inside
  const caret = () => page.evaluate(() => { const b = document.querySelector('.all-in'), r = b.getBoundingClientRect(), c = getSelection().getRangeAt(0).getClientRects()[0] || getSelection().getRangeAt(0).getBoundingClientRect();
    return { at: b.selectionStart, len: b.value.length, inside: c.left >= r.left - 0.5 && c.right <= r.right + 0.5, scrolled: b.scrollLeft > 0, overflows: b.scrollWidth > b.clientWidth }; });
  await page.click('.all-list');
  await page.click('.all-emo-b'); await page.waitForSelector('.all-ep .all-ep-e');
  for (let i = 0; i < 12; i++){
    await page.click(`.all-ep-e[aria-label="${i % 2 ? 'KEKW' : 'koalaWave'}"]`);
    const c = await caret();
    assert.equal(c.at, c.len, 'after the newest');
    assert.equal(c.inside, true, `in sight after pick ${i + 1}`);
  }
  assert.deepEqual(await caret().then(c => [c.overflows, c.scrolled]), [true, true], 'more than fits: scrolled along');
  await page.keyboard.type('X');
  assert.match(await page.$eval('.all-in', b => b.value), /KEKW X$/, 'typing goes on after them');
  // :name near the start of a long line: the caret just after it, in sight
  await page.keyboard.press('Escape'); await page.fill('.all-in', '');
  await page.focus('.all-in'); await page.keyboard.type('a long line of words that is far wider than the box can show at once');
  await page.keyboard.press('Home'); await page.keyboard.type('hi :ke');
  await page.waitForSelector('.all-at:not([hidden]) .all-emi'); await page.keyboard.press('Enter');
  assert.deepEqual(await caret().then(c => [c.at, c.inside]), ['hi KEKW '.length, true]);
});

test('ALL at its newest line stays there as what\'s over the box comes and goes (the row of emotes, the reply bar, the modes); scrolled up, it stays put; in a short chat the row, then the pins, then the health line give way; not while you can\'t send', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; });
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.kmv = { ...(window.kmv || {}), emotesPick: async () => [{ id: 'kick-channel', label: 'Channel', emotes: [{ name: 'koalaWave', url: img, send: '[emote:2:koalaWave]' }] }] };
    window.allChat.sender.send = async () => 'sent';
    window.smvNotes.liveStatus(live);
  }, LIVE);
  for (let i = 1; i <= 30; i++) await feed(page, 'quietkoala', { s: 'kick', raw: [KF('ChatMessageEvent', { id: 'n' + i, content: 'line ' + i, type: 'message', sender: { id: i, username: 'pebble_moth', identity: {} } })] });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // the newest line: its bottom inside the list as you see it
  const newestShows = async () => { await frame(); return page.evaluate(() => { const l = document.querySelector('.all-list'), r = l.getBoundingClientRect(), b = l.lastElementChild.getBoundingClientRect(); return b.bottom <= r.bottom + 0.5 && b.top >= r.top; }); };
  const shown = sel => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && !!e.offsetHeight; }, sel);
  assert.equal(await newestShows(), true);
  assert.equal(await shown('.all-re'), false, 'nothing used yet: no row');
  // the row appears (an emote picked from the smiley): the list stays at its newest line
  await page.click('.all-emo-b'); await page.waitForSelector('.all-ep .all-ep-e'); await page.click('.all-ep-e[aria-label="koalaWave"]');
  await page.click('.all-in'); await page.waitForSelector('.all-ep', { state: 'hidden' });
  await page.waitForFunction(() => !!document.querySelector('.all-re').offsetHeight);
  assert.equal(await newestShows(), true, 'the row appeared: the newest line still shows');
  // sent: your line, then the reply bar and the modes over the box
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.all-list .al-mine-sent'));
  assert.equal(await newestShows(), true, 'your line');
  await page.evaluate(() => { const l = [...document.querySelectorAll('.all-list .al-m:not(.al-mine)')].pop(); l.querySelector('[data-cmd="all.reply"]').click(); });
  await page.waitForSelector('.all-rb:not([hidden])');
  assert.equal(await newestShows(), true, 'the reply bar');
  await page.evaluate(() => window.allChat.setModes('quietkoala', { modes: { slow: 30, emotes: true }, me: { signedIn: true, follower: true } }));
  await page.waitForSelector('.all-modes:not([hidden])');
  assert.equal(await newestShows(), true, 'the modes');
  assert.equal(await page.$eval('.all-modes', e => e.getBoundingClientRect().height), 24, 'the modes: one line');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.all-rb', { state: 'hidden' });
  assert.equal(await newestShows(), true, 'the reply bar gone');
  // scrolled up to read: the bars coming and going leave it where it is
  await page.$eval('.all-list', l => { l.scrollTop = 120; });
  await frame();
  await page.evaluate(() => { const l = [...document.querySelectorAll('.all-list .al-m:not(.al-mine)')].pop(); l.querySelector('[data-cmd="all.reply"]').click(); });
  await page.waitForSelector('.all-rb:not([hidden])');
  await frame();
  assert.equal(await page.$eval('.all-list', l => l.scrollTop), 120, 'scrolled up: it stays put');
  await page.keyboard.press('Escape');
  await page.$eval('.all-list', l => { l.scrollTop = l.scrollHeight; });
  // a short chat: the row gives way first (the list keeps three lines' room), then the pins' strip, then the health line
  await page.evaluate(([ch, b]) => window.allChat.ingest(ch, b), ['quietkoala', { s: 'kick', raw: [KF('PinnedMessageCreatedEvent', { message: { id: 'p1', content: 'giveaway at 8pm', type: 'message', sender: { username: 'quietkoala', identity: {} } }, pinned_by: { username: 'nightowl_mod' } })] }]);
  await page.click('.all-pinchip');
  await page.evaluate(() => window.allHealth.broke('tw:quietkoala', 'read', 'ALL isn\'t reading Twitch\'s messages: its chat has new ones'));
  await page.waitForSelector('.all-health:not([hidden])');
  const size = h => page.evaluate(h => { document.querySelector('#stage .win.chat:not(.tab-hidden)').style.height = h + 'px'; }, h);
  const state = async () => { await frame(); return page.evaluate(() => ({ re: !!document.querySelector('.all-re').offsetHeight, pins: !!document.querySelector('.all-pins').offsetHeight, health: !!document.querySelector('.all-health').offsetHeight,
    room: document.querySelector('.all-list').clientHeight >= 3 * 27 + 14, box: document.querySelector('.all-box').getBoundingClientRect().bottom <= document.querySelector('#stage .win.chat:not(.tab-hidden)').getBoundingClientRect().bottom })); };
  await size(640);
  assert.deepEqual(await state(), { re: true, pins: true, health: true, room: true, box: true }, 'room for everything');
  await size(400);
  assert.deepEqual(await state(), { re: false, pins: true, health: true, room: true, box: true }, 'the row gives way');
  await size(350);
  assert.deepEqual(await state(), { re: false, pins: false, health: true, room: true, box: true }, 'then the pins\' strip (the pill says how many)');
  assert.equal(await shown('.all-pinchip'), true);
  await size(260);
  assert.deepEqual(await state(), { re: false, pins: false, health: false, room: true, box: true }, 'then the health line (its badge says so)');
  assert.equal(await newestShows(), true, 'short: the newest line still shows');
  await size(640);
  assert.deepEqual(await state(), { re: true, pins: true, health: true, room: true, box: true }, 'room again: all back');
  assert.equal(await newestShows(), true);
  // you can't send there (a ban, followers only…): no row, its emotes can't be used
  await page.evaluate(() => window.allChat.setModes('quietkoala', { me: { signedIn: true, banned: true } }));
  await page.waitForSelector('.all-view.all-blocked');
  assert.equal(await shown('.all-re'), false, 'can\'t send: no row');
  assert.equal(await newestShows(), true);
});

test('ALL\'s box: one line of text (pasted or dropped in: its text on one line), no longer than the site takes, its placeholder when emptied', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live); }, LIVE);
  await page.focus('.all-in');
  const put = (type, text) => page.$eval('.all-in', (b, [type, text]) => { const dt = new DataTransfer(); dt.setData('text/plain', text); dt.setData('text/html', '<b>bold</b><img src=x>');
    b.dispatchEvent(type === 'paste' ? new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }) : new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, [type, text]);
  await put('paste', 'line one\nline two');
  assert.deepEqual(await page.$eval('.all-in', b => [b.value, b.querySelectorAll('*').length]), ['line one line two', 0], 'its text, on one line');
  await put('drop', ' and more');
  assert.equal(await page.$eval('.all-in', b => b.value), 'line one line two and more');
  assert.equal(await page.$eval('.all-in', b => { const e = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }); b.dispatchEvent(e); return e.defaultPrevented; }), true, 'no new line');
  await page.$eval('.all-in', b => { b.maxLength = 10; });
  await page.keyboard.type('x');
  assert.equal(await page.$eval('.all-in', b => b.value), 'line one l', 'no longer than it takes');
  await page.keyboard.press('Control+A'); await page.keyboard.press('Meta+A'); await page.keyboard.press('Backspace');
  assert.deepEqual(await page.$eval('.all-in', b => [b.value, b.childNodes.length, getComputedStyle(b, '::before').content]), ['', 0, '"Send a message on Kick"'], 'emptied: its placeholder');
  assert.equal(await page.$eval('.all-in', b => b.selectionStart), 0);
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

test('names as each site\'s own chat shows them: Twitch made readable (its own colour for someone with none), YouTube by who they are; again in a light theme; YouTube\'s own badges and colours once its chat says them', async t => {
  const page = await allApp(t);
  await page.evaluate(now => window.smvNotes.liveStatus({ 'yt:@quietkoala': { live: true, checked: now } }), Date.now());
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala']));
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  const YT = (id, name, badges = []) => ({ addChatItemAction: { item: { liveChatTextMessageRenderer: { id, timestampUsec: String(Date.now() * 1000), authorName: { simpleText: name }, authorExternalChannelId: 'UC' + id,
    message: { runs: [{ text: 'hi' }] }, authorBadges: badges.map(type => ({ liveChatAuthorBadgeRenderer: { icon: { iconType: type }, tooltip: type } })) } } } });
  await feed(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ color: '#0000FF', 'display-name': 'deepnavy', id: 't1' }, ':deepnavy!d@d PRIVMSG #quietkoala :hi'),
    TW({ color: '#000000', 'display-name': 'inkblot', id: 't2' }, ':inkblot!i@i PRIVMSG #quietkoala :hi'), TW({ color: '', 'display-name': 'paperwren', id: 't3' }, ':paperwren!p@p PRIVMSG #quietkoala :hi'),
    TW({ badges: 'lead_moderator/1', color: '#8A2BE2', 'display-name': 'leadfox', id: 't4' }, ':leadfox!l@l PRIVMSG #quietkoala :hi')] });
  await feed(page, 'yt:@quietkoala', { s: 'youtube', raw: [YT('y1', '@moss.runner'), YT('y2', '@hollowpine', ['MODERATOR']), YT('y3', '@quietkoala', ['OWNER']), YT('y4', '@verified.one', ['VERIFIED'])] });
  const names = () => page.$$eval('.all-list .al-m .al-n', l => Object.fromEntries(l.map(n => [n.textContent, n.style.color + (n.classList.contains('al-pill') ? ' on ' + n.style.backgroundColor : '')])));
  assert.deepEqual(await names(), { deepnavy: 'rgb(139, 88, 255)', inkblot: 'rgb(122, 122, 122)', paperwren: 'rgb(210, 105, 30)', leadfox: 'rgb(180, 84, 255)',
    '@moss.runner': 'rgba(255, 255, 255, 0.7)', '@hollowpine': 'rgb(62, 166, 255)', '@quietkoala': 'rgb(17, 17, 17) on rgb(255, 214, 0)', '@verified.one': 'rgba(255, 255, 255, 0.7)' });
  assert.ok(await page.$('.all-list [data-key="twitch:t4"] .al-b-mod'), 'a lead moderator has the mod badge');
  // a light theme: the same names as the sites' light themes show them
  await page.keyboard.press('ControlOrMeta+k');
  await page.fill('#palQ', ''); await page.type('#palQ', 'theme: daylight'); await page.waitForTimeout(60);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('theme-light'));
  assert.deepEqual(await names(), { deepnavy: 'rgb(0, 0, 255)', inkblot: 'rgb(0, 0, 0)', paperwren: 'rgb(177, 78, 0)', leadfox: 'rgb(138, 43, 226)',
    '@moss.runner': 'rgb(96, 96, 96)', '@hollowpine': 'rgb(6, 95, 212)', '@quietkoala': 'rgb(0, 0, 0) on rgb(251, 192, 45)', '@verified.one': 'rgb(96, 96, 96)' });
  // YouTube's chat says how it draws them (ytLookAgent): its colours (in its light: a dark page's aren't used here), its icons in their colour, cleaned
  const look = icons => page.evaluate(([icons]) => { window.__ran = 0; window.allChat.gotYtLook({ dark: false, names: { mod: 'rgb(94, 132, 241)', member: 'url(x)', ownerBg: 'rgba(0, 0, 0, 0)' }, icons }); return window.__ran; }, [icons]);
  assert.equal(await look({ moderator: { svg: '<svg viewBox="0 0 16 16" onload="window.__ran++"><path d="M8 1l6 3v4z" onclick="window.__ran++"/><script>window.__ran++</script></svg>', color: 'rgb(62, 166, 255)' },
    member: { svg: '<svg viewBox="0 0 16 16"/>', color: 'red' }, verified: { svg: 'not svg', color: 'red' } }), 0);
  assert.deepEqual(await page.evaluate(() => window.allChat.ytLook()), { dark: false, names: { mod: 'rgb(94, 132, 241)' }, icons: { moderator: { svg: '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v4z"/></svg>', color: 'rgb(62, 166, 255)' } } },
    'only colours, only its moderator, verified and streamer icons, only shapes');
  assert.equal((await names())['@hollowpine'], 'rgb(94, 132, 241)');
  assert.deepEqual(await page.$eval('.all-list [data-key="youtube:y2"] .al-by', b => [b.style.color, b.title, b.innerHTML]), ['rgb(62, 166, 255)', 'Moderator', '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v4z"></path></svg>'], 'its shield, in its colour');
  assert.equal(await page.$('.all-list [data-key="youtube:y4"] .al-by'), null, 'a badge it didn\'t draw: ALL\'s own');
  // the same answer again: nothing redrawn
  const before = await page.$('.all-list [data-key="youtube:y2"]');
  await look({ moderator: { svg: '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v4z"/></svg>', color: 'rgb(62, 166, 255)' } });
  assert.equal(await before.evaluate(e => e.isConnected), true);
});

test('the emote picker starts with your recent emotes: the newest first, ones the channel can use, up to 3 rows; not while searching or showing one kind', async t => {
  const names = Array.from({ length: 20 }, (_, i) => 'e' + i);
  const page = await allApp(t, { allOpen: '["s1"]', allRecentEmotes: JSON.stringify({ kick: ['gone', ...names] }) });
  await page.waitForSelector('.all-view');
  await page.evaluate(([live, names]) => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.kmv = { ...(window.kmv || {}), emotesPick: async ch => ch === 'quietkoala' ? [{ id: 'kick-global', label: 'Kick', emotes: [...names].reverse().map((name, i) => ({ name, url: img, send: `[emote:${i}:${name}]` })) }] : [] };
  }, [LIVE, names]);
  await page.addStyleTag({ content: '.all-ep{width:230px !important;max-width:230px !important}' });   // (a narrow picker: fewer emotes a row)
  await page.click('.all-emo-b');
  await page.waitForSelector('.all-ep .all-ep-e');
  const grid = () => page.$eval('.all-ep-grid', g => {
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length, recent = [...g.querySelectorAll('.all-ep-e.recent')];
    return { cols, heads: [...g.querySelectorAll('.all-ep-sec')].map(s => s.textContent), recent: recent.map(b => b.title), rows: new Set(recent.map(b => b.offsetTop)).size };
  });
  const g = await grid();
  assert.deepEqual(g.heads, ['Recent', 'KKick']);
  assert.ok(g.cols * 3 < names.length, 'more than 3 rows of them');
  assert.deepEqual(g.recent, names.slice(0, g.cols * 3), 'the newest first, as many as 3 rows hold; one the channel doesn\'t have isn\'t there');
  assert.equal(g.rows, 3);
  // searching, or one kind: no Recent
  await page.fill('.all-ep-q', 'e1');
  assert.deepEqual((await grid()).heads, ['KKick']);
  await page.fill('.all-ep-q', '');
  assert.deepEqual((await grid()).heads, ['Recent', 'KKick']);
  await page.evaluate(() => { const s = document.querySelector('.all-ep-f'); s.value = 'kick-global'; s.dispatchEvent(new Event('change')); });
  assert.deepEqual((await grid()).heads, ['KKick']);
  // a recent one picked: in the box, as from its own section
  await page.evaluate(() => { const s = document.querySelector('.all-ep-f'); s.value = ''; s.dispatchEvent(new Event('change')); });
  await page.click('.all-ep-e.recent >> nth=1');
  assert.equal(await page.$eval('.all-in', b => b.value), 'e1 ');
});

test('reloading ALL asks again for its chats\' emotes, not from the last 10 minutes: one the streamer just added shows', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.waitForSelector('.all-view');
  await page.evaluate(live => {
    window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    const img = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.__asked = []; window.__added = false;
    window.kmv = { ...(window.kmv || {}), emotesPick: async (ch, fresh) => { window.__asked.push([ch, !!fresh]);
      return ch === 'quietkoala' ? [{ id: 'kick-channel', label: 'Channel', emotes: [{ name: 'koalaWave', url: img, send: '[emote:2:koalaWave]' }, ...(window.__added ? [{ name: 'koalaNew', url: img, send: '[emote:3:koalaNew]' }] : [])] }] : []; } };
  }, LIVE);
  const suggest = async () => {
    await page.fill('.all-in', ''); await page.focus('.all-in'); await page.keyboard.type(':koala');
    await page.waitForSelector('.all-at:not([hidden]) .all-emi');
    const r = await page.$$eval('.all-at .all-emi', l => l.map(b => b.textContent.replace(/(Kick|Channel)$/, '')));
    await page.keyboard.press('Escape'); await page.fill('.all-in', '');
    return r;
  };
  assert.deepEqual(await suggest(), ['koalaWave']);
  assert.ok((await page.evaluate(() => window.__asked)).every(([, fresh]) => !fresh), 'asked as usual');
  await page.evaluate(() => { window.__added = true; window.__asked = []; });
  assert.deepEqual(await suggest(), ['koalaWave'], 'kept: not asked again by itself');
  await page.$eval('#stage .win.chat:not(.tab-hidden) [data-a=reload]', b => b.click());   // (in the bar's overflow: as its command presses it)
  await page.waitForFunction(() => window.__asked.some(([ch, fresh]) => ch === 'quietkoala' && fresh));
  assert.deepEqual((await page.evaluate(() => window.__asked)).filter(([, fresh]) => fresh).map(([ch]) => ch).sort(), ['quietkoala', 'tw:quietkoala'], 'each chat ALL reads, asked afresh');
  assert.deepEqual((await suggest()).sort(), ['koalaNew', 'koalaWave'], 'the new one too');
});

test('a YouTube poll: a card over ALL while it\'s open, its votes as they come (the leading one brighter), Vote on YouTube shows its chat, gone when closed; someone\'s messages all taken away go from ALL', async t => {
  const page = await allApp(t, { allOpen: '["s1"]' });
  await page.evaluate(now => window.smvNotes.liveStatus({ 'yt:@quietkoala': { live: true, checked: now } }), Date.now());
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala']));
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  const runs = t => ({ runs: [{ text: t }] });
  const poll = ratios => ({ liveChatPollId: 'p1', header: { pollHeaderRenderer: { pollQuestion: runs('Which game next?'), metadataText: runs('quietkoala • 12 votes') } },
    choices: ['Deadlock', 'Balatro'].map((t, i) => ({ text: runs(t), ...(ratios ? { voteRatio: ratios[i] } : {}) })) });
  const yt = raw => feed(page, 'yt:@quietkoala', { s: 'youtube', raw });
  await yt([{ showLiveChatActionPanelAction: { panelToShow: { liveChatActionPanelRenderer: { id: 'p1', contents: { pollRenderer: poll() } } } } }]);
  const card = () => page.$eval('.all-poll', p => p.hidden ? null : { q: p.querySelector('.all-poll-q').textContent, rows: [...p.querySelectorAll('.all-poll-c')].map(c => c.textContent + (c.classList.contains('top') ? ' *' : '') + ' ' + c.querySelector('.all-poll-bar').style.width), m: (p.querySelector('.all-poll-m') || {}).textContent || '' });
  assert.deepEqual(await card(), { q: 'Which game next?', rows: ['Deadlock 0%', 'Balatro 0%'], m: 'quietkoala • 12 votes' }, 'no votes yet: no numbers');
  await yt([{ updateLiveChatPollAction: { pollToUpdate: { pollRenderer: poll([0.25, 0.75]) } } }]);
  assert.deepEqual((await card()).rows, ['Deadlock25% 25%', 'Balatro75% * 75%']);
  // Vote on YouTube: its own chat
  await page.click('.all-poll-go');
  assert.deepEqual(await tabs(page), ['ALL', 'K', 'T', 'Y*']);
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  assert.equal((await card()).q, 'Which game next?', 'still there back on ALL');
  // another poll's close: this one stays; its own: gone
  await yt([{ closeLiveChatActionPanelAction: { targetPanelId: 'p9' } }]);
  assert.ok(await card());
  await yt([{ closeLiveChatActionPanelAction: { targetPanelId: 'p1' } }]);
  assert.equal(await card(), null);
  // all of someone's messages taken away (not a mod here: gone)
  const msg = (id, name, cid) => ({ addChatItemAction: { item: { liveChatTextMessageRenderer: { id, timestampUsec: String(Date.now() * 1000), authorName: { simpleText: name }, authorExternalChannelId: cid, message: runs('hello there') } } } });
  await yt([msg('y1', '@spammy', 'UCbad'), msg('y2', '@kind', 'UCok'), msg('y3', '@spammy', 'UCbad')]);
  assert.equal((await lines(page)).length, 3);
  await yt([{ removeChatItemByAuthorAction: { externalChannelId: 'UCbad' } }]);
  assert.deepEqual((await lines(page)).map(l => l.split(' | ')[1]), ['Y@kind: hello there']);
});
