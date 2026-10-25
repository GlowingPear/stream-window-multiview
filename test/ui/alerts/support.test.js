// Support alerts (Settings > Mentions > Support): the chat helper spots someone supporting the stream in the site's
// own notices (Kick's rows as in its chat: a community gift with its goal, the subs it gave, KICKs sent; Twitch's
// notice lines and cheers; YouTube's Super Chat, gift and member items), and the app turns them into an alert and a
// line in the bell, with the smallest amount that alerts for each kind.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add } = require('../app');
const { kickRow, KICK_CSS } = require('./kick-rows');
const { openApp } = setup();

// The helper in the app's own page (so its code counts for coverage), reading a stand-in chat there with the site's
// support wording as the app gives it
async function chatPage(t, site, html, you = '') {
  const page = await openApp(t);
  await page.evaluate(async ([site, html, css, you]) => {
    const cfg = (await import(`./page/platforms/${site}.js`))[site].support;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const d = document.createElement('div'); d.id = 'sup-chat'; d.innerHTML = html; document.body.append(d);
    window.mentionAgent();
    window.__kmvMention.setSupport(cfg, you);
  }, [site, html, KICK_CSS, you]);
  await page.waitForTimeout(2800);                           // what's already in the chat is old
  return page;
}
const put = (page, html) => page.evaluate(h => document.getElementById('sup-chat').insertAdjacentHTML('beforeend', h), html);
const found = page => page.evaluate(() => window.__kmvMention.take().s.map(s => [s.kind, s.who, s.n, s.to || s.amt || s.unit || '']));
// a Kick notice row (not someone's message), built like the ones in its chat
const kickNote = (i, name, text, goal = '') => `<div data-index="${i}"><div class="flex"><div><span>${name}</span><div>${text}</div></div>${goal ? `<span>${goal}</span>` : ''}</div></div>`;

test('Kick: a community gift once (not once per sub it gave), KICKs, a gift to someone; not your own, a bot thanking, or what was there before', async t => {
  const page = await chatPage(t, 'kick', kickNote(1, 'oldfriend', 'sent 5000', '88 / 10K'), 'GlowingPear');
  await put(page, kickNote(2, 'giftfox88', 'Gifted 5 subscriptions to the community! They\'ve gifted 5 subscriptions in the channel.', '7 / 10'));
  for (const [i, to] of [[3, 'mossy_rock'], [4, 'ann'], [5, 'bob']]) await put(page, kickNote(i, 'giftfox88', `gifted a sub to ${to}`));
  await put(page, kickNote(6, 'quietkoala', 'sent 1,000', '688 / 10K'));
  await put(page, kickNote(7, 'GlowingPear', 'sent 100', '788 / 10K'));                    // your own
  await put(page, kickRow(8, 'BotRix', 'Thanks @quietkoala for the 1000 KICKs!'));           // a message, not a notice
  await put(page, kickNote(9, 'tinycomet', 'gifted a sub to mossyrock'));
  await put(page, kickNote(10, 'sundew', 'subscribed for 3 months'));
  assert.deepEqual(await found(page), [
    ['gifts', 'giftfox88', 5, ''],
    ['kicks', 'quietkoala', 1000, ''],
    ['gift', 'tinycomet', 1, 'mossyrock'],
    ['sub', 'sundew', 3, '']
  ]);
  assert.deepEqual(await found(page), [], 'each one once');
  // switched off: nothing more
  await page.evaluate(() => window.__kmvMention.setSupport(null));
  await put(page, kickNote(11, 'quietkoala', 'sent 500'));
  assert.deepEqual(await found(page), []);
});

test('Kick KICKs: KickBot\'s "@name just gifted 100 KICKs!" (Kick\'s real message rows), only from KickBot, and once with the "sent" box', async t => {
  const page = await chatPage(t, 'kick', kickRow(1, 'KickBot', '@oldfan just gifted 100 KICKs!'), 'GlowingPear');
  await put(page, kickRow(2, 'KickBot', '@quietkoala just gifted 500 KICKs!'));
  await put(page, kickRow(3, 'BotRix', 'Thanks @quietkoala for the 500 KICKs!'));               // another bot thanking: not counted
  await put(page, kickRow(4, 'someone', '@tinycomet just gifted 1000 KICKs!'));                 // a viewer saying it: not counted
  await put(page, kickRow(5, 'KickBot', '@GlowingPear just gifted 50 KICKs!'));                 // your own
  assert.deepEqual(await found(page), [['kicks', 'quietkoala', 500, '']]);
  // the box (with the time and the KICK icon's words around the number) and KickBot's message: one gift
  await put(page, kickNote(6, '07:55 PM zestyplum', 'sent KICK 100', '688 / 10K'));
  await put(page, kickRow(7, 'KickBot', '@zestyplum just gifted 100 KICKs!'));
  assert.deepEqual(await found(page), [['kicks', 'zestyplum', 100, '']]);
  // the same words again in another row within a minute: taken as the same gift
  await put(page, kickRow(8, 'KickBot', '@quietkoala just gifted 500 KICKs!'));
  assert.deepEqual(await found(page), [], 'within a minute of the same one: taken as the same gift');
});

test('Kick sub celebrations: the box with the person\'s own message is a sub; the same words typed in a message aren\'t', async t => {
  // the celebration as Kick draws it: who and what, then their message (a real message row) in the same box
  const celebration = (i, name, months, words) => `<div data-index="${i}"><div class="flex"><span>${name}</span></div>`
    + `<div>celebrates their subscription for ${months} months!</div>${kickRow(i, name, words).replace(/^<div data-index="\d+"/, '<div')}</div>`;
  const page = await chatPage(t, 'kick', celebration(1, 'oldfan', 3, 'still here'));
  await put(page, celebration(2, 'mossy_rock', 7, 'Scrib doooooon'));
  await put(page, kickRow(3, 'chatter', 'mossy_rock celebrates their subscription for 7 months!'));   // someone typing it
  assert.deepEqual(await found(page), [['sub', 'mossy_rock', 7, '']]);
});

test('Twitch: a community gift, a sub with its months, and cheers in a message added up; YouTube: Super Chats with their money, gifts and members', async t => {
  const line = t => `<div class="row">${t}</div>`;
  let page = await chatPage(t, 'twitch', line('<b>regular</b>: <span>hi all</span>'));
  await put(page, line('giftfox88 is gifting 5 Tier 1 Subs to pear\'s community! They\'ve gifted a total of 20 in the channel!'));
  await put(page, line('giftfox88 gifted a Tier 1 sub to ann!'));                       // one of those five
  await put(page, line('cat subscribed at Tier 1. They\'ve subscribed for 12 months!'));
  await put(page, line('<b>bob</b>: <span>Cheer100 great run Cheer50</span>'));
  await put(page, line('<b>dan</b>: <span>cheering you on</span>'));
  assert.deepEqual((await found(page)).sort(), [['bits', 'bob', 150, ''], ['gifts', 'giftfox88', 5, ''], ['sub', 'cat', 12, '']], '(cheers are read from the messages, apart from the notices)');

  const yt = (tag, who, inner = '') => `<${tag}><span id="author-name">${who}</span>${inner}</${tag}>`;
  page = await chatPage(t, 'youtube', yt('yt-live-chat-paid-message-renderer', 'Old Fan', '<span id="purchase-amount">$2.00</span>'));
  await put(page, yt('yt-live-chat-paid-message-renderer', 'Pear Lover', '<span id="purchase-amount">€10,50</span><span>love the stream</span>'));
  await put(page, yt('yt-live-chat-paid-sticker-renderer', 'Sticker Sam', '<span id="purchase-amount-chip">CA$5.00</span>'));
  await put(page, yt('ytd-sponsorships-live-chat-gift-purchase-announcement-renderer', 'Big Gifter', '<span>gifted 10 memberships</span>'));
  await put(page, yt('yt-live-chat-membership-item-renderer', 'New Member', '<span>Welcome to the club!</span>'));
  assert.deepEqual(await found(page), [
    ['superchat', 'Pear Lover', 10.5, '€10,50'],
    ['superchat', 'Sticker Sam', 5, 'CA$5.00'],
    ['gifts', 'Big Gifter', 10, 'memberships'],
    ['member', 'New Member', 1, '']
  ]);
});

test('Settings › Mentions › Support: off at first, switched on and saved; an alert and a Support line in the bell, only from the smallest amount set', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=mentions]').hidden = false; window.openSettings('mentions'); });   // (the desktop app's pages)
  await page.click('#mentTabs [data-t=support]');
  assert.equal(await page.isChecked('#supportOn'), false, 'off at first');
  assert.ok(await page.$eval('.st-opts[data-for=support]', e => e.classList.contains('st-dim')), 'its options dimmed while off');
  await page.click('label:has(#supportOn)');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).support.on), true);
  assert.equal(await page.inputValue('[data-al="support.minKicks"]'), '100');
  await page.selectOption('[data-al="support.minGifts"]', '5');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).support.minGifts), 5, 'a number');
  await page.uncheck('[data-al="support.subs"]');
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.supportFrom('alpha', [
    { kind: 'kicks', who: 'quietkoala', n: 50 },              // under 100
    { kind: 'kicks', who: 'tinycomet', n: 500 },
    { kind: 'gifts', who: 'giftfox88', n: 3 },             // under 5
    { kind: 'gift', who: 'ann', n: 1, to: 'bob' },            // under 5
    { kind: 'gifts', who: 'Big_Gifter', n: 10 },
    { kind: 'sub', who: 'sundew', n: 3 },                     // subs off
    { kind: 'superchat', who: 'Pear Lover', n: 10.5, amt: '€10,50' }
  ]));
  assert.ok(await page.$eval('#stage .win.chat', e => e.classList.contains('al-brief')), 'the chat window glows (a brief glow at first)');
  await page.click('#bellBtn');
  const rows = await page.$$eval('#bellList .nc-row.k-support', l => l.map(r => r.querySelector('.mp-top b').textContent + ' ' + r.querySelector('.mp-body').textContent));
  assert.deepEqual(rows, ['Pear Lover sent a Super Chat: €10,50', 'Big_Gifter gifted 10 subs', 'tinycomet sent 500 KICKs']);
  assert.equal(await page.$eval('#bellList .nc-row.k-support .mp-kind', e => e.textContent), 'Support');
});

test('raids: Kick\'s banner over the chat once (not again as its viewers go up, nor one that was already there), Twitch\'s line, and the smallest raid that alerts', async t => {
  // Kick: the banner is above the chat, not one of its rows
  const banner = (page, text) => page.evaluate(t => {
    let b = document.getElementById('sup-banner');
    if (!b){ b = document.createElement('div'); b.id = 'sup-banner'; document.getElementById('sup-chat').before(b); }
    b.textContent = t;
  }, text);
  let page = await chatPage(t, 'kick', kickRow(1, 'regular', 'evening all'));
  await banner(page, 'oldraider is hosting your channel with 40 viewers');
  await page.evaluate(() => window.__kmvMention.setSupport(null));      // the banner already there when it starts is old
  await page.evaluate(async () => window.__kmvMention.setSupport((await import('./page/platforms/kick.js')).kick.support, ''));
  await page.waitForTimeout(2800);
  await banner(page, 'oldraider is hosting your channel with 44 viewers');
  assert.deepEqual(await found(page), [], 'the same raid, its viewers counted up');
  await banner(page, 'pixelpear is hosting your channel with 120 viewers');
  assert.deepEqual(await found(page), [['raid', 'pixelpear', 120, '']]);
  await banner(page, 'pixelpear is hosting your channel with 131 viewers');
  assert.deepEqual(await found(page), [], 'once, as its viewers go up');
  // Twitch: a line in its chat
  page = await chatPage(t, 'twitch', '<div class="row"><b>regular</b>: <span>hi</span></div>');
  await put(page, '<div class="row">25 raiders from nightowl have joined!</div>');
  assert.deepEqual(await found(page), [['raid', 'nightowl', 25, '']]);

  // the smallest raid that alerts (Settings › Mentions › Support › Raids), and what the bell says
  page = await openApp(t);
  await add(page, 'alpha');
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=mentions]').hidden = false; window.openSettings('mentions'); });   // (the desktop app's pages)
  await page.click('#mentTabs [data-t=support]');
  await page.click('label:has(#supportOn)');
  assert.equal(await page.inputValue('[data-al="support.minRaid"]'), '1', 'any raid at first');
  await page.selectOption('[data-al="support.minRaid"]', '50');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.supportFrom('alpha', [{ kind: 'raid', who: 'tinyraid', n: 12 }, { kind: 'raid', who: 'pixelpear', n: 120 }]));
  await page.click('#bellBtn');
  assert.deepEqual(await page.$$eval('#bellList .nc-row.k-support', l => l.map(r => r.querySelector('.mp-top b').textContent + ' ' + r.querySelector('.mp-body').textContent)),
    ['pixelpear raided with 120 viewers']);
});
