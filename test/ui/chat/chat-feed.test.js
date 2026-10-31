// The app's chat readers on the sites' own connections (src/page/chat/chat-feed.js, #222): a message ALL hears from a
// chat's connection alerts at once, also when the chat's page never draws it (behind ALL), and counts and shows over the
// stream; each once. The messages are handed over as the chats would (window.allChat.ingest, window.chatFeed.fromFeed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, win, press } = require('../app');
const { openApp } = setup();

const now = Date.now();
const LIVE = { quietkoala: { live: true, checked: now }, 'tw:quietkoala': { live: true, checked: now } };
const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala'], bots: [] };
async function allApp(t){
  const set = { saved: JSON.stringify(STREAMER.accounts), intro: JSON.stringify({ done: true, tips: true }), linkedTip: '1', linkedOn: '1', streamers: JSON.stringify([STREAMER]),
    myName: 'mekick', myTwitch: 'metwitch', alerts: JSON.stringify({ mention: { sound: 'none' }, support: { on: true, sound: 'none' } }) };
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v); }` });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala']));
  await page.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab.all');
  await page.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  return page;
}
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;
const KF = (event, data, channel = 'chatrooms.1.v2') => JSON.stringify({ push: { channel, pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
const kick = (id, who, content, extra = {}) => KF('ChatMessageEvent', { id, content, type: 'message', created_at: new Date().toISOString(), sender: { id: 1, username: who, slug: who, identity: {} }, ...extra });
const ingest = (page, ch, batch, quiet, shown) => page.evaluate(([ch, b, q, s]) => window.allChat.ingest(ch, b, q, s), [ch, batch, quiet, shown]);
const notes = (page, kind) => page.evaluate(k => JSON.parse(localStorage.getItem('kickMultiview.notifications') || '[]').filter(n => n.kind === k).map(n => `${n.channel} ${n.sender}: ${n.body}`), kind);

test('ALL: a mention, a reply and support from a chat its page never drew alert at once, once each; your own, ALL\'s history and what it already showed never', async t => {
  const page = await allApp(t);
  await ingest(page, 'quietkoala', { s: 'kick', raw: [kick('k1', 'driftwood_7', 'hey @mekick you there?'), kick('k2', 'driftwood_7', 'just chatting'), kick('k3', 'mekick', '@mekick me')] });
  await ingest(page, 'tw:quietkoala', { s: 'twitch', raw: [TW({ 'display-name': 'Tinroof', id: 't1', 'reply-parent-msg-id': 'p1', 'reply-parent-display-name': 'metwitch', 'reply-parent-user-login': 'metwitch', 'reply-parent-msg-body': 'on\\slater?' }, ':tinroof!t@t PRIVMSG #quietkoala :@metwitch yes, tonight')] });
  assert.deepEqual((await notes(page, 'mention')).concat(await notes(page, 'reply')), ['quietkoala driftwood_7: hey @mekick you there?', 'tw:quietkoala Tinroof: yes, tonight']);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifications')).find(n => n.kind === 'reply').quoted), 'on later?');
  // the same message again (Twitch's two connections, YouTube's re-sends): once
  await ingest(page, 'quietkoala', { s: 'kick', raw: [kick('k1', 'driftwood_7', 'hey @mekick you there?')] });
  await page.evaluate(() => window.chatFeed.fromFeed('quietkoala', { site: 'kick', kind: 'message', id: 'k1', sender: 'driftwood_7', login: 'driftwood_7', parts: [{ text: 'hey @mekick you there?' }], t: Date.now() }));
  assert.equal((await notes(page, 'mention')).length, 1);
  // ALL's pins asked for (quiet) and what the chat already showed (shown): not new, never an alert
  await ingest(page, 'quietkoala', { s: 'kick', raw: [kick('k4', 'oakmoss', '@mekick old one')] }, true, false);
  await ingest(page, 'quietkoala', { s: 'kick', raw: [kick('k5', 'oakmoss', '@mekick older one')] }, false, true);
  assert.equal((await notes(page, 'mention')).length, 1);
  assert.deepEqual(await page.evaluate(() => ['k1', 'k2', 'k3'].map(id => window.chatFeed.decided('quietkoala', id).v)), ['alerted', 'nomatch', 'own']);
  assert.equal(await page.evaluate(() => window.chatFeed.decided('quietkoala', '')), null);
  // support: a cheer, gifted subs and one of their subs (one alert), under the smallest set nothing
  await ingest(page, 'tw:quietkoala', { s: 'twitch', raw: [
    TW({ 'display-name': 'Quill', bits: '500', id: 'b1' }, ':quill!q@q PRIVMSG #quietkoala :Cheer500 gg'),
    TW({ 'display-name': 'Penny', bits: '5', id: 'b2' }, ':penny!p@p PRIVMSG #quietkoala :Cheer5'),
    TW({ 'display-name': 'Giftowl', login: 'giftowl', 'msg-id': 'submysterygift', id: 'g1', 'msg-param-mass-gift-count': '3', 'msg-param-community-gift-id': 'cg1' }, ':tmi.twitch.tv USERNOTICE #quietkoala'),
    TW({ 'display-name': 'Giftowl', login: 'giftowl', 'msg-id': 'subgift', id: 'g2', 'msg-param-recipient-display-name': 'Tinroof', 'msg-param-community-gift-id': 'cg1' }, ':tmi.twitch.tv USERNOTICE #quietkoala'),
    TW({ 'display-name': 'Metwitch', login: 'metwitch', 'msg-id': 'submysterygift', id: 'g3', 'msg-param-mass-gift-count': '9' }, ':tmi.twitch.tv USERNOTICE #quietkoala')] });
  assert.deepEqual((await notes(page, 'support')).sort(), ['tw:quietkoala Giftowl: gifted 3 subs', 'tw:quietkoala Quill: cheered 500 bits']);
  // a site its readers don't read from its connection yet (YouTube): nothing from it
  await page.evaluate(() => window.chatFeed.fromFeed('yt:@quietkoala', { site: 'youtube', kind: 'message', id: 'y1', sender: 'x', parts: [{ text: '@mekick' }] }));
  assert.equal((await notes(page, 'mention')).length, 1);
});

test('chat over the stream and new-message counts from a chat\'s connection, a few at a time; your own counts over the stream only', async t => {
  const page = await openApp(t, { init: `if (window === top) localStorage.setItem('kickMultiview.myName', 'mekick');` });
  await add(page, 'alpha', 'bravo');
  if (await page.isVisible('text=Got it')) await page.click('text=Got it');
  await press(page, 't');
  await page.evaluate(() => { const s = document.getElementById('chatCountsSet'); s.checked = true; s.dispatchEvent(new Event('change')); window.setChatOverlay(true); });
  await win(page, 'alpha').locator('[data-a=max]').click(); await page.waitForTimeout(400);   // alpha's stream over every chat
  const msg = (id, who, text, emote) => ({ site: 'kick', kind: 'message', id, sender: who, login: who, t: Date.now(), parts: emote ? [{ text }, { emote: 'https://files.kick.com/emotes/1/fullsize', name: 'wave' }] : [{ text }] });
  await page.evaluate(([a, b, c]) => { window.chatFeed.fromFeed('bravo', a); window.chatFeed.fromFeed('bravo', b); window.chatFeed.fromFeed('bravo', c); window.chatFeed.flush(); },
    [msg('m1', 'oakmoss', 'hello '), msg('m2', 'tinroof', 'hi', true), msg('m3', 'mekick', 'my own')]);
  assert.equal(await win(page, 'bravo').locator('.bar-n').textContent(), '2', 'counted: not your own');
  assert.deepEqual(await page.$$eval('#stage .win.stream .co-line', l => l.map(x => x.textContent.replace(':wave:', ''))), ['oakmoss: hello', 'tinroof: hi', 'mekick: my own']);   // (the emote's picture doesn't load here: its name)
  assert.equal(await page.evaluate(() => window.chatFeed.decided('bravo', 'm2').v), 'nomatch', 'read for mentions too');
  await page.evaluate(() => window.chatFeed.flush());   // (nothing waiting: nothing)
  assert.equal(await win(page, 'bravo').locator('.bar-n').textContent(), '2');
});
