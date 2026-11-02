// Flagged (Settings › Flagged): what Twitch and YouTube flag for moderators (held messages, suspicious users) alerts in
// chats you moderate, from ALL or from a chat without it: the window, a pop-up, a note under the bell with Allow, Deny
// and Show me while a hold waits. Off by default.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, mode } = require('../app');
const { openApp } = setup();

const now = Date.now();
const LIVE = { quietkoala: { live: true, checked: now }, 'tw:quietkoala': { live: true, checked: now }, 'yt:@quietkoala': { live: false, checked: now } };
const STREAMER = { id: 's1', name: '', main: 'quietkoala', accounts: ['quietkoala', 'tw:quietkoala', 'yt:@quietkoala'] };
const HM = (type, data) => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data }) } });
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;
const caught = (id, status, extra = {}) => HM('automod_caught_message', { id, content_classification: { category: 'smart-detection', level: 2 },
  message: { id, content: { text: 'you are so bad at this' }, sender: { login: 'saltymike', display_name: 'Saltymike' } }, resolver_login: '', status, ...extra });
const lowTrust = (id, who, ev, tr) => HM('low_trust_user_new_message', { low_trust_user: { sender: { login: who, display_name: who }, ban_evasion_evaluation: ev, treatment: tr },
  message_content: { text: 'hey remember me' }, message_id: id });

// A linked streamer's chat with ALL (Twitch's chat in it), Flagged as given, you a moderator there unless mod is false
async function allApp(t, { flagged = { on: true }, mod = true } = {}){
  const set = { saved: JSON.stringify(STREAMER.accounts), intro: JSON.stringify({ done: true, tips: true }), linkedTip: '1', linkedOn: '1', streamers: JSON.stringify([STREAMER]),
    myName: 'mekick', myTwitch: 'metwitch', allOpen: '["s1"]', alerts: JSON.stringify({ flagged }) };
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v); }` });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  await page.evaluate(() => window.frames_.openStreamer('quietkoala', 'chat', ['quietkoala', 'tw:quietkoala']));
  await page.waitForSelector('.all-view');
  await page.evaluate(([live, mod]) => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.smvNotes.liveStatus(live);
    window.allChat.modKnown.set('tw:quietkoala', mod); window.allChat.modKnown.set('quietkoala', mod);
    window.__held = []; window.allChat.sender.held = async (c, action, id) => { window.__held.push([action, id]); return 'done'; }; }, [LIVE, mod]);
  return page;
}
const feed = (page, raw) => page.evaluate(r => window.allChat.ingest('tw:quietkoala', { s: 'twitch', raw: [r] }), raw);
const notes = page => page.evaluate(() => (JSON.parse(localStorage.getItem('kickMultiview.notifications')) || []).filter(n => n.kind === 'flagged')
  .map(n => [n.what, n.sender, n.why, n.done || ''].join(' | ')));
const alerted = page => page.evaluate(() => { const w = window.openWins().find(o => o.kind === 'chat' && o.channel === 'tw:quietkoala'); return w.alert ? w.alert.kind : ''; });
const bellRow = (page, who) => page.locator(`#bellList .nc-row.k-flagged:has(.mp-top b:text-is("${who}"))`);

test('Flagged: a hold alerts once (window, pop-up, bell); Allow from the bell presses the site\'s button and ends it; another moderator\'s Deny, and AutoMod letting it go, end theirs', async t => {
  const page = await allApp(t);
  await feed(page, caught('h1', 'PENDING'));
  assert.equal(await alerted(page), 'flagged', 'the chat window lights up');
  assert.match(await page.textContent('#msg'), /^AutoMod held Saltymike's message in .*quietkoala's chat$/);
  await feed(page, caught('h1', 'PENDING'));
  assert.deepEqual(await notes(page), ['held | Saltymike | Smart detection · level 2 | '], 'once, however often it comes');
  await page.click('#bellBtn');
  const row = bellRow(page, 'Saltymike');
  assert.equal(await row.locator('.mp-kind').textContent(), 'Held by AutoMod · Smart detection · level 2');
  assert.equal(await row.locator('.mp-body').textContent(), 'you are so bad at this');
  assert.deepEqual(await row.locator('.nc-acts button').allTextContents(), ['✓ Allow', '✕ Deny', 'Show me']);
  await row.locator('button:text-is("✓ Allow")').click();
  await page.waitForFunction(() => window.__held.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__held), [['allow', 'h1']]);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kickMultiview.notifications')) || []).some(n => n.done === 'allowed'));
  assert.deepEqual(await notes(page), ['held | Saltymike | Smart detection · level 2 | allowed']);
  assert.equal(await alerted(page), '', 'nothing else waits there: the window stops calling');
  assert.match(await page.textContent('.all-list [data-key="twitch:h1"]'), /✓ allowed by you$/, 'ALL\'s card too');
  await page.click('#bellBtn'); await page.click('#bellBtn');
  await page.click('#bellPanel .nc-tabs [data-tab=spam]');
  assert.deepEqual(await page.$$eval('#bellPanel .nc-chips button', e => e.map(b => b.textContent)), ['All 1', 'Spam', 'Flagged 1'], 'the Mod tab: spam, and Flagged');
  assert.equal(await bellRow(page, 'Saltymike').locator('.nc-note').textContent(), 'Allowed by you');
  assert.deepEqual(await bellRow(page, 'Saltymike').locator('.nc-acts button').allTextContents(), ['Show me'], 'handled: no Allow or Deny');
  await page.click('#bellBtn');
  // another moderator denies one; AutoMod lets another go (it says nothing)
  await feed(page, caught('h2', 'PENDING'));
  await feed(page, caught('h2', 'DENIED', { resolver_login: 'nightowl_mod' }));
  await page.evaluate(() => { window.allChat.heldWait.ms = 100; });
  await feed(page, caught('h3', 'PENDING'));
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kickMultiview.notifications')) || []).some(n => n.done === 'expired'));
  assert.deepEqual(await notes(page), ['held | Saltymike | Smart detection · level 2 | expired', 'held | Saltymike | Smart detection · level 2 | denied',
    'held | Saltymike | Smart detection · level 2 | allowed']);
  assert.equal(await alerted(page), '');
});

test('Flagged: suspicious users as set (likely evaders and restricted users at first), each person once a stream; Show me goes to ALL\'s card', async t => {
  const page = await allApp(t);
  await feed(page, lowTrust('f1', 'n3wacc', 'POSSIBLE_EVADER', 'ACTIVE_MONITORING'));
  assert.deepEqual(await notes(page), [], 'a possible evader, monitored: not at first');
  await feed(page, lowTrust('f2', 'evader2', 'LIKELY_EVADER', 'NO_TREATMENT'));
  await feed(page, lowTrust('f3', 'evader2', 'LIKELY_EVADER', 'NO_TREATMENT'));
  await feed(page, lowTrust('f4', 'spamlord', 'UNLIKELY_EVADER', 'RESTRICTED'));
  assert.deepEqual(await notes(page), ['flags | spamlord | Restricted | ', 'flags | evader2 | Likely ban evader | '], 'once a stream for each');
  assert.match(await page.textContent('#msg'), /^Restricted: spamlord in .*quietkoala's chat$/);
  // the stream ended and started again: a new stream, so they alert again
  await page.evaluate(live => { window.smvNotes.liveStatus({ ...live, 'tw:quietkoala': { live: false, checked: Date.now() } }); window.smvNotes.liveStatus(live); }, LIVE);
  await feed(page, lowTrust('f4b', 'evader2', 'LIKELY_EVADER', 'NO_TREATMENT'));
  assert.equal((await notes(page))[0], 'flags | evader2 | Likely ban evader | ');
  // every message, and possible evaders too
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=flagged]').hidden = false; window.openSettings('flagged'); });
  await page.selectOption('[data-s=flagged] [data-al="flagged.once"]', 'every');
  await page.selectOption('[data-s=flagged] [data-al="flagged.evader"]', 'any');
  await page.keyboard.press('Escape');
  await feed(page, lowTrust('f5', 'evader2', 'LIKELY_EVADER', 'NO_TREATMENT'));
  await feed(page, lowTrust('f6', 'n3wacc', 'POSSIBLE_EVADER', 'NO_TREATMENT'));
  assert.deepEqual((await notes(page)).slice(0, 2), ['flags | n3wacc | Possible ban evader | ', 'flags | evader2 | Likely ban evader | ']);
  // a held message's flags: its hold's alert says it, not a second one
  await feed(page, caught('h9', 'PENDING'));
  await feed(page, lowTrust('h9', 'saltymike', 'LIKELY_EVADER', 'NO_TREATMENT'));
  assert.equal((await notes(page)).length, 6);
  // Show me: the chat, ALL scrolled to the card
  await page.click('#bellBtn');
  await bellRow(page, 'Saltymike').locator('button:text-is("Show me")').click();
  assert.equal(await page.$eval('.all-list [data-key="twitch:h9"]', e => e.classList.contains('al-held-go')), true);
});

test('Flagged: off by default, and only in chats you moderate', async t => {
  const page = await allApp(t, { flagged: {} });
  await feed(page, caught('h1', 'PENDING'));
  await feed(page, lowTrust('f1', 'evader2', 'LIKELY_EVADER', 'RESTRICTED'));
  assert.deepEqual([await notes(page), await alerted(page)], [[], ''], 'off');
  assert.equal(await page.locator('.all-list [data-key="twitch:h1"].al-held').count(), 1, 'ALL still shows the card');
  const notMod = await allApp(t, { mod: false });
  await feed(notMod, caught('h1', 'PENDING'));
  assert.deepEqual([await notes(notMod), await alerted(notMod)], [[], ''], 'not a moderator there');
});

test('Flagged: a chat without ALL hands over its feed for it, and alerts from there', async t => {
  const set = { saved: JSON.stringify(['tw:quietkoala']), intro: JSON.stringify({ done: true, tips: true }), myTwitch: 'metwitch', alerts: JSON.stringify({ flagged: { on: true } }) };
  const page = await openApp(t, { init: `if (window === top && !sessionStorage.getItem('set')){ sessionStorage.setItem('set', '1'); for (const [k, v] of Object.entries(${JSON.stringify(set)})) localStorage.setItem('kickMultiview.' + k, v); }` });
  await page.evaluate(live => window.smvNotes.liveStatus(live), LIVE);
  await mode(page, 'chat'); await add(page, 'twitch.tv/quietkoala');
  await page.waitForFunction(() => window.openWins().some(w => w.kind === 'chat' && w.channel === 'tw:quietkoala' && w.view));
  await page.evaluate(() => { window.openWins().forEach(w => { if (w.kind === 'chat') w.ready = true; }); window.allChat.modKnown.set('tw:quietkoala', true); });
  // (the desktop app's poll asks each chat whether something reads its feed: Flagged does, for a chat you moderate)
  assert.equal(await page.evaluate(async () => { const { syncFeeds } = await import('./page/chat/chat-feed.js'); syncFeeds(); return window.openWins().find(w => w.kind === 'chat').feedRead; }), true);
  await page.evaluate(async raw => {
    const { siteMessage } = await import('./page/shared/incoming.js'), w = window.openWins().find(o => o.kind === 'chat');
    siteMessage(w, w.view, '__kmv:feed ' + JSON.stringify({ s: 'twitch', raw: [raw] }));
  }, caught('h1', 'PENDING'));
  assert.deepEqual(await notes(page), ['held | Saltymike | Smart detection · level 2 | ']);
  assert.equal(await alerted(page), 'flagged');
  // its message comes (let through in Twitch's own chat): handled
  await page.evaluate(async raw => {
    const { siteMessage } = await import('./page/shared/incoming.js'), w = window.openWins().find(o => o.kind === 'chat');
    siteMessage(w, w.view, '__kmv:feed ' + JSON.stringify({ s: 'twitch', raw: [raw] }));
  }, TW({ 'display-name': 'Saltymike', id: 'h1', 'user-id': '5' }, ':saltymike!s@s PRIVMSG #quietkoala :you are so bad at this'));
  assert.deepEqual(await notes(page), ['held | Saltymike | Smart detection · level 2 | allowed']);
  assert.equal(await alerted(page), '');
});

test('Settings › Flagged: off at first; the switch, its tabs and options, and its row in Notifications', async t => {
  const page = await openApp(t);
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=flagged]').hidden = false; window.openSettings('flagged'); });
  const pane = page.locator('.st-pane[data-s=flagged]');
  assert.equal(await pane.locator('#flaggedOn').isChecked(), false, 'off by default');
  assert.equal(await page.textContent('.st-rail [data-s=flagged] .st-pill'), 'Mod');
  assert.equal(await pane.locator('.st-opts[data-for=flagged]').first().evaluate(e => e.classList.contains('st-dim')), true);
  await pane.locator('#flaggedOn').check();
  assert.equal(await page.textContent('#msg'), 'Flagged alerts on, in chats you moderate');
  assert.equal(await page.textContent('.st-rail [data-s=flagged] .st-pill'), 'On');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.alerts')).flagged);
  assert.equal((await saved()).on, true);
  assert.deepEqual(await pane.locator('[data-t=what] [data-al]').evaluateAll(l => l.map(c => [c.dataset.al, c.type === 'checkbox' ? c.checked : c.value])),
    [['flagged.twitchHeld', true], ['flagged.youtubeHeld', true], ['flagged.evader', 'likely'], ['flagged.monitored', false], ['flagged.restricted', true], ['flagged.once', 'stream']]);
  await pane.locator('[data-al="flagged.monitored"]').check();
  assert.equal((await saved()).monitored, true);
  await pane.locator('#flaggedTabs button[data-t=how]').click();
  assert.equal(await pane.locator('.st-subpane[data-t=how]').isVisible(), true);
  assert.equal(await pane.locator('[data-al="flagged.sound"]').inputValue(), 'knock');
  await pane.locator('#flaggedOn').uncheck();
  assert.equal(await page.textContent('#msg'), 'Flagged alerts off');
  assert.equal(await page.locator('#ntGrid .nt-k.k-flagged').count(), 1, 'a row in Notifications');
});
