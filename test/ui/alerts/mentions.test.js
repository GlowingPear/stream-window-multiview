// Mentions: your own words (nicknames) found in chat as whole words, and the mentions history window
// (search, filters, grouped by day). The chat helper runs on a small stand-in chat page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, mode, win, midday } = require('../app');
const { openApp } = setup();

// (names need 2+ letters, like real ones)
const row = (name, body) => `<div class="row"><span>12:01 PM </span><b>${name}</b>: <span>${body}</span></div>`;

test('the chat helper finds your words as whole words, any case, but not inside other words or in your own messages', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  await page.setContent(`<div id="chat">${row('regular', 'pear was here earlier')}</div>`);
  await page.evaluate(js);
  await page.evaluate(() => window.__kmvMention.setMe('Mod_Me', ['pear', '@Big Boss', 'x']));   // "x" is too short to count
  await page.waitForTimeout(2800);                         // what's already in the chat counts as old
  const say = (n, b) => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), row(n, b));
  await say('ann', 'hi Pear!');
  await say('bob', 'pears and appearance');
  await say('cat', 'is the BIG boss around?');
  await say('dan', '@mod_me pear');
  await say('mod_me', 'pear here');
  await say('eve', 'max x mix');
  const q = await page.evaluate(() => window.__kmvMention.take());
  assert.deepEqual(q.m.map(m => [m.sender, m.kind, m.word || '']), [
    ['ann', 'word', 'Pear'],
    ['cat', 'word', 'BIG boss'],
    ['dan', 'mention', '']                                    // an @mention counts as a mention, once
  ]);

  // words only (no username for this site): still found
  await page.evaluate(() => window.__kmvMention.setMe('', ['pear']));
  await page.waitForTimeout(2800);
  await say('fay', 'pear!');
  assert.deepEqual((await page.evaluate(() => window.__kmvMention.take())).m.map(m => m.word), ['pear']);
});

test('a clock with no name after it is not a sender, and what you send yourself is never an alert', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  await page.setContent('<div id="chat"></div><div contenteditable="true" id="box"></div><button id="send">Chat</button>');
  await page.evaluate(js);
  await page.evaluate(() => window.__kmvMention.setMe('glowingpear', ['pear']));
  await page.waitForTimeout(2800);
  const line = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', `<div>${h}</div>`), h);
  const send = async (text, how) => {
    await page.click('#box'); await page.keyboard.type(text);
    if (how === 'click') await page.click('#send'); else await page.keyboard.press('Enter');
    await page.evaluate(() => { document.getElementById('box').textContent = ''; });
  };
  // the chat shows your message without your name, the time stuck to it
  await send('great joke pear it only took 3 times pear');
  await line('09:23 PMgreat joke pear it only took 3 times pear');
  await line('09:24 PMsomeone says pear');                       // no name: can't tell who, so no alert
  await send('pear by the button', 'click');
  await line('ann: pear by the button');                          // shown under another name: still yours (once)
  await line('cat: pear by the button');                          // the same words again later: theirs
  await send('x');                                                // too short to remember
  await line('09:25 bob: pear time');                             // a clock and then a name: fine
  const q = await page.evaluate(() => window.__kmvMention.take());
  assert.deepEqual(q.m.map(m => [m.sender, m.body]), [['cat', 'pear by the button'], ['bob', 'pear time']]);
});

test('mentions in All notifications (moved over from the old history): grouped by day, search, filters, unread, delete and clear', async t => {
  const now = midday(), day = 864e5;
  const page = await openApp(t, { clock: now });
  const m = (o) => ({ label: '', quoted: '', unread: false, ...o });
  await page.evaluate(list => { localStorage.setItem('kickMultiview.mentions', JSON.stringify(list)); localStorage.removeItem('kickMultiview.notifications'); }, [
    m({ channel: 'alpha', sender: 'ann', body: 'hey @me look', kind: 'mention', t: now - 60e3, unread: true }),
    m({ channel: 'tw:bravo', sender: 'bob', body: 'is pear around?', kind: 'word', word: 'pear', t: now - 120e3, unread: true }),
    m({ channel: 'alpha', sender: 'cat', body: 'sure thing', kind: 'reply', quoted: 'want to raid?', t: now - day - 60e3 }),
    m({ channel: 'alpha', sender: 'dan', body: 'pear <b>hi</b>', kind: 'word', word: 'pear', t: now - 5 * day })
  ]);
  await page.reload();
  await page.evaluate(() => window.openNoteHistory('mentions'));
  const days = () => page.$$eval('#nhList .mh-day', e => e.map(d => d.textContent));
  const senders = () => page.$$eval('#nhList .mp-row .mp-top b', e => e.map(b => b.textContent));
  const ds = await days();
  assert.deepEqual(ds.slice(0, 2), ['Today2', 'Yesterday1']);
  assert.equal(ds.length, 3, 'and the older day by its date');
  assert.match(await page.textContent('#noteDlg .mh-count'), /4 kept · 2 new/);
  assert.deepEqual(await page.$$eval('#nhList .mp-row .mp-kind', e => e.map(k => k.textContent)), ['Mention', 'Word: pear', 'Reply', 'Word: pear']);
  assert.equal(await page.$eval('#nhList .mp-row:nth-child(2) .mp-body', e => e.innerHTML), 'is <mark>pear</mark> around?', 'the word is marked');
  assert.equal(await page.$eval('#nhList .mh-group:last-child .mp-body', e => e.innerHTML), '<mark>pear</mark> &lt;b&gt;hi&lt;/b&gt;', 'and the message stays text');

  await page.click('#noteDlg .nc-chips [data-v=word]');
  assert.deepEqual(await senders(), ['bob', 'dan']);
  assert.equal(await page.textContent('#noteDlg .nc-chips [data-v=word]'), 'Words 2');
  await page.click('#noteDlg .nc-chips [data-v=all]');
  await page.fill('#nhQ', 'raid');
  assert.deepEqual(await senders(), ['cat'], 'search finds the quoted message too');
  await page.fill('#nhQ', '');
  await page.selectOption('#noteDlg .nc-pick', 'tw:bravo');
  assert.deepEqual(await senders(), ['bob']);
  await page.selectOption('#noteDlg .nc-pick', '');
  await page.check('#nhUnread');
  assert.deepEqual(await senders(), ['ann', 'bob']);
  await page.click('#nhRead');
  assert.match(await page.textContent('#nhList'), /Nothing matches/);
  await page.uncheck('#nhUnread');

  await page.hover('#nhList .mp-row:has-text("cat")');
  await page.click('#nhList .mp-row:has-text("cat") .mp-x');
  assert.deepEqual(await senders(), ['ann', 'bob', 'dan'], 'one deleted');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.notifications'))).length, 3);

  await page.click('#nhClear');
  await page.click('#askDlg .ask-no');
  assert.equal((await senders()).length, 3, 'Clear asks first');
  await page.click('#nhClear');
  await page.click('#askDlg .ask-yes');
  assert.match(await page.textContent('#nhList'), /No mentions yet/);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#noteDlg'));
});

test('the chat helper holds a limited number of messages and names between the app\'s polls', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  await page.setContent('<div id="chat"></div>');
  await page.evaluate(js);
  await page.evaluate(() => { window.__kmvMention.setMe('mod_me', []); window.__kmvMention.setWatch(true); });
  await page.waitForTimeout(2800);
  await page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h),
    Array.from({ length: 150 }, (_, i) => row('fan' + i, '@mod_me hi')).join(''));
  assert.equal((await page.evaluate(() => window.__kmvMention.take())).m.length, 100, 'mentions not taken yet: the oldest 100');
  // the people already chatting when spam alerts are turned on
  await page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h),
    Array.from({ length: 2100 }, (_, i) => row('old' + i, 'hello')).join(''));
  await page.evaluate(() => { window.__kmvMention.take(); window.__kmvMention.setWatch(false); window.__kmvMention.setWatch(true); });
  assert.equal((await page.evaluate(() => window.__kmvMention.take())).k.length, 2000);
});

test('when each sender first spoke: kept per open chat, forgotten when its chat closes, and only the latest 20,000', async t => {
  const page = await openApp(t);
  await mode(page, 'chat');
  await add(page, 'alpha', 'bravo');
  await page.evaluate(async () => {
    for (const ch of ['alpha', 'bravo']) await window.spamCheck(ch, [{ sender: 'Ann', body: 'hi', t: 1 }, { sender: 'bob', body: 'yo', t: 2 }]);
  });
  const keys = () => page.evaluate(() => [...spamFirst.keys()]);
  assert.deepEqual(await keys(), ['alpha\nann', 'alpha\nbob', 'bravo\nann', 'bravo\nbob']);
  await win(page, 'alpha', 'chat').locator('[data-a=close]').click();
  assert.deepEqual(await keys(), ['bravo\nann', 'bravo\nbob'], 'alpha\'s chat closed');
  assert.deepEqual(await page.evaluate(() => {
    for (let i = 0; i < 19999; i++) window.firstSpoke('bravo\nfan' + i, i);
    return [spamFirst.size, spamFirst.has('bravo\nann'), spamFirst.has('bravo\nbob'), spamFirst.has('bravo\nfan19998')];
  }), [20000, false, true, true], 'the one seen first went');
  await page.evaluate(() => window.firstSpoke('bravo\nbob', 99));
  assert.equal(await page.evaluate(() => spamFirst.get('bravo\nbob')), 2, 'the first time stays');
});

test('the chat helper counts new messages from others for Chat Stage, also with mentions off', async t => {
  // (run in the app's own page, on a stand-in chat added to it, so its code counts for coverage)
  const page = await openApp(t);
  await page.evaluate(h => { const c = document.createElement('div'); c.id = 'chat'; c.innerHTML = h; document.body.append(c); window.mentionAgent(); }, row('regular', 'hello'));
  const ask = () => page.evaluate(() => window.__kmvMention.count());
  const say = (n, b) => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), row(n, b));
  const armed = () => page.waitForFunction(() => window.__kmvMention.ready(), null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__kmvMention.ready()), false, 'nothing has armed it: no name, words or spam alerts');
  assert.equal(await ask(), 0, 'the first time, what is there is old');
  await armed();
  await say('ann', 'hi'); await say('bob', 'yo');
  assert.equal(await ask(), 2);
  assert.equal(await ask(), 0, 'counted once');
  // your own messages don't count
  await page.evaluate(() => window.__kmvMention.setMe('mod_me', []));
  await armed();
  await say('mod_me', 'my own'); await say('cat', 'not mine');
  assert.equal(await ask(), 1);
});

// #44: emotes in mentions
const PIC = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const em = (src, alt) => `<img src="${src}" alt="${alt}" width="28" height="28">`;
const KICK = n => `https://files.kick.com/emotes/${n}/fullsize`, TW = 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0';

test('the chat helper keeps the emotes in a mention, in order, with the reply it answers', async t => {
  // (run in the app's own page, on a stand-in chat added to it, so its code counts for coverage)
  const page = await openApp(t);
  await page.evaluate(h => { const c = document.createElement('div'); c.id = 'chat'; c.innerHTML = h; document.body.append(c); window.mentionAgent(); }, row('regular', 'hello'));
  await page.evaluate(() => window.__kmvMention.setMe('mod_me', ['pear']));
  await page.waitForTimeout(2800);
  const add = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), h);
  // Kick: time, a badge picture, the name, then text and emotes
  await add(`<div class="row"><span>12:01 PM </span><img src="https://files.kick.com/images/badges/sub.png" alt="Subscriber" width="16" height="16"><b>ann</b>: <span>@mod_me ${em(KICK(1), 'pearHype')} gg ${em(KICK(2), 'lulBlob')}</span></div>`);
  // Twitch: name, ": ", text pieces and emote pictures; a word, not a mention
  await add(`<div class="chat-line"><span class="author">bob</span><span>: </span><span>pear time</span>${em(TW, 'Kappa2')}<span> nice</span></div>`);
  // a reply, with an emote in the message it answers
  await add(`<div class="msg"><div>Replying to @mod_me: want to raid? ${em('https://cdn.7tv.app/emote/abc/1x.webp', 'oakCozy')}</div><div><b>cat</b>: <span>sure ${em(KICK(3), 'pearHype')}</span></div></div>`);
  // pictures that aren't emotes, and no emotes at all: plain text as before
  await add(`<div class="row"><b>dan</b>: <span>@mod_me look ${em('https://example.com/x.png', 'x')}</span></div>`);
  const q = (await page.evaluate(() => window.__kmvMention.take())).m;
  const by = n => q.find(m => m.sender === n);
  assert.deepEqual(by('ann').parts, [{ t: '@mod_me ' }, { e: 'pearHype', src: KICK(1) }, { t: ' gg ' }, { e: 'lulBlob', src: KICK(2) }]);
  assert.equal(by('ann').kind, 'mention');
  assert.deepEqual(by('bob').parts, [{ t: 'pear time' }, { e: 'Kappa2', src: TW }, { t: ' nice' }]);
  assert.equal(by('bob').kind, 'word');
  assert.equal(by('cat').kind, 'reply');
  assert.deepEqual(by('cat').parts, [{ t: 'sure ' }, { e: 'pearHype', src: KICK(3) }]);
  assert.deepEqual(by('cat').qparts, [{ t: 'want to raid? ' }, { e: 'oakCozy', src: 'https://cdn.7tv.app/emote/abc/1x.webp' }]);
  assert.equal(by('dan').parts, undefined);
  assert.equal(by('dan').body, '@mod_me look');
});

test('mentions show their emotes inline, safely, with the name when a picture is missing; names are searchable', async t => {
  const page = await openApp(t);
  await page.route(/files\.kick\.com\/emotes\/1\//, r => r.fulfill({ body: Buffer.from(PIC, 'base64'), contentType: 'image/png' }));
  const now = Date.now();
  await page.evaluate(() => localStorage.setItem('kickMultiview.myName', 'me'));
  await page.evaluate(list => { localStorage.setItem('kickMultiview.mentions', JSON.stringify(list)); localStorage.removeItem('kickMultiview.notifications'); }, [
    { channel: 'alpha', sender: 'ann', kind: 'mention', body: '@me pearHype <b>gg</b> gone', unread: true, t: now - 1000, quoted: '',
      parts: [{ t: '@me ' }, { e: 'pearHype', src: KICK(1) }, { t: ' <b>gg</b> ' }, { e: 'gone', src: KICK(9) }] },
    { channel: 'alpha', sender: 'bob', kind: 'reply', body: 'sure', quoted: 'raid? oakCozy', t: now - 2000,
      qparts: [{ t: 'raid? ' }, { e: 'oakCozy', src: KICK(1) }] },
    { channel: 'alpha', sender: 'cat', kind: 'mention', body: '@me old one', t: now - 3000, quoted: '' },          // saved before emotes
    { channel: 'alpha', sender: 'dan', kind: 'mention', body: '@me bad', t: now - 4000, quoted: '',
      parts: [{ t: '@me ' }, { e: 'evil', src: 'https://example.com/x.png' }] }                                    // not an emote site: text only
  ]);
  await page.reload();
  await page.evaluate(() => window.openNoteHistory('mentions'));
  const body = s => page.locator(`#nhList .mp-row:has(.mp-top b:text-is("${s}")) .mp-body`);
  await page.waitForFunction(() => [...document.querySelectorAll('#nhList .mp-emote')].some(i => i.complete && i.naturalWidth));
  assert.equal(await body('ann').locator('img.mp-emote').getAttribute('alt'), 'pearHype');
  assert.equal(await body('ann').locator('b').count(), 0, 'chat text stays text');
  await page.waitForFunction(() => /:gone:/.test(document.querySelector('#nhList .mp-row .mp-body').textContent));
  assert.equal(await body('ann').textContent(), '@me  <b>gg</b> :gone:', 'a picture that can\'t load shows its name');
  assert.ok(await body('ann').locator('mark').count(), 'the @mention is still marked');
  assert.equal(await page.locator('#nhList .mp-row:has(.mp-top b:text-is("bob")) .mp-q img.mp-emote').getAttribute('alt'), 'oakCozy', 'emotes in the reply\'s quote');
  assert.equal(await body('cat').textContent(), '@me old one');
  assert.equal(await body('dan').textContent(), '@me bad', 'a saved entry with a picture from elsewhere shows as text');
  await page.fill('#nhQ', 'pearhype');
  assert.deepEqual(await page.$$eval('#nhList .mp-row .mp-top b', e => e.map(b => b.textContent)), ['ann'], 'emote names are searchable');
});

test('Spam alerts › Chat bots to ignore, shared with Mentions: read-only pills with the name centred (#86)', async t => {
  const page = await openApp(t);
  await page.evaluate(() => { document.querySelector('.st-rail [data-s=spam]').hidden = false; openSettings('spam'); });   // (the desktop app's page)
  await page.click('#spamTabs [data-t=lists]');
  await page.click('#spamListPick [data-l=ignore]');
  const gaps = () => page.$$eval('[data-list=ignore] .st-chip', e => e.map(c => {
    const a = c.getBoundingClientRect(), b = c.firstChild.getBoundingClientRect();
    return [Math.round(b.left - a.left), Math.round(a.right - b.right), c.querySelectorAll('button').length, c.classList.contains('ro')];
  }));
  const shared = await gaps();
  assert.ok(shared.length > 3, 'the Mentions chat bots');
  for (const [l, r, x, ro] of shared){ assert.equal(x, 0, 'nothing to remove here'); assert.ok(ro); assert.ok(Math.abs(l - r) <= 1, `centred: ${JSON.stringify(shared)}`); }
  await page.click('[data-s=spam] [data-al="spam.sharedBots"]');
  for (const [, , x, ro] of await gaps()){ assert.equal(x, 1, 'its own list: each has its ×'); assert.equal(ro, false, 'and the usual spacing for it'); }
});

test('Settings › Mentions opens on Alerts, its first tab, as Notifications and Spam alerts do; links still open their tab (#89)', async t => {
  const page = await openApp(t);
  await page.evaluate(() => { ['mentions', 'spam'].forEach(s => { document.querySelector(`.st-rail [data-s=${s}]`).hidden = false; }); openSettings('mentions'); });   // (the desktop app's pages)
  const tabs = () => page.$$eval('#mentTabs button', e => e.map(b => b.textContent + (b.classList.contains('on') ? ' *' : '')));
  const shown = () => page.$$eval('[data-s=mentions] .st-subpane', e => e.filter(p => !p.hidden).map(p => p.dataset.t));
  assert.deepEqual(await tabs(), ['Alerts *', 'Names & words', 'Chat bots', 'Support']);
  assert.deepEqual(await shown(), ['alerts']);
  assert.ok(await page.isVisible('[data-s=mentions] [data-al="mention.popup"]'), 'its settings show');
  for (const p of ['notify', 'spam']) assert.equal(await page.$eval(`[data-s=${p}] .st-tabs button`, b => b.textContent), 'Alerts', `the same first tab as ${p}`);
  await page.click('#mentTabs [data-t=names]');
  assert.deepEqual(await shown(), ['names']);
  assert.ok(await page.isVisible('#mentUser'));
  // Spam alerts › Lists › Chat bots to ignore links to Mentions › Chat bots
  await page.evaluate(() => openSettings('spam'));
  await page.click('#spamTabs [data-t=lists]');
  await page.click('#spamListPick [data-l=ignore]');
  await page.click('[data-s=spam] [data-go=mentions][data-sub=bots]');
  assert.deepEqual(await tabs(), ['Alerts', 'Names & words', 'Chat bots *', 'Support']);
  assert.deepEqual(await shown(), ['bots']);
});

// #104: Kick's chat now shows the name, ":" and the message on lines of their own (its name block is a flex box)
const kickRow = (name, body, reply) => `<div data-index="1"><div class="group">${reply ? `<button style="display:block"><span>Replying to <span>${reply[0]}</span>: <span>${reply[1]}</span></span></button>` : ''}
  <div><div style="display:inline-flex;align-items:baseline"><span style="display:none">10:34 PM</span><div style="display:inline-flex"><button>${name}</button></div><span style="display:inline-flex" aria-hidden="true">:&nbsp;</span></div><span>${body}</span></div></div></div>`;

test('Kick, with the name, ":" and the message on lines of their own: replies and mentions keep the message (#104)', async t => {
  const page = await openApp(t);
  await page.evaluate(h => { const c = document.createElement('div'); c.id = 'chat'; c.innerHTML = h; document.body.append(c); window.mentionAgent(); }, kickRow('regular', 'hello'));
  assert.match(await page.$eval('#chat', e => e.innerText), /regular\n:\s*\nhello/, 'the stand-in reads like Kick\'s chat');
  await page.evaluate(() => window.__kmvMention.setMe('mod_me', []));
  await page.waitForTimeout(2800);
  const add = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), h);
  await add(kickRow('pixelpear', em(KICK(4), 'pearHype')));   // a message that's only an emote
  await add(kickRow('quietkoala', 'sure, see you there', ['mod_me', 'want to raid later?']));
  await add(kickRow('nightowl', `gg @mod_me ${em(KICK(1), 'pearHype')} nice`));
  await add(kickRow('tidepool', 'not for you', ['someone_else', 'hi']));
  const q = (await page.evaluate(() => window.__kmvMention.take())).m;
  const by = n => q.find(m => m.sender === n);
  assert.deepEqual(q.map(m => [m.sender, m.kind]), [['quietkoala', 'reply'], ['nightowl', 'mention']]);
  assert.equal(by('quietkoala').body, 'sure, see you there', 'the reply itself');
  assert.equal(by('quietkoala').quoted, 'want to raid later?', 'and the message it answers');
  assert.match(by('nightowl').body, /^gg @mod_me\s+nice$/, '(the emote is in parts)');
  assert.deepEqual(by('nightowl').parts, [{ t: 'gg @mod_me ' }, { e: 'pearHype', src: KICK(1) }, { t: ' nice' }]);
});

// #119: a Kick message that's only an emote, as the last one in the chat: whatever is on the page below the
// list (the chat box, a pop-up) used to be read as its text, and sent a new alert each time it changed.
test('Kick: an emote-only reply is one alert with its emote, whatever text follows the chat; another one is a new alert (#119)', async t => {
  const page = await openApp(t);
  await page.evaluate(h => {
    const c = document.createElement('div'); c.id = 'chat'; c.innerHTML = h; document.body.append(c);
    const below = document.createElement('div'); below.id = 'below'; document.body.append(below);
    window.mentionAgent();
  }, kickRow('regular', 'hello'));
  await page.evaluate(() => window.__kmvMention.setMe('mod_me', []));
  await page.waitForTimeout(2800);
  const add = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), h);
  const below = s => page.evaluate(s => { document.getElementById('below').innerText = s; }, s);
  const take = () => page.evaluate(() => window.__kmvMention.take());
  const emoteOnly = n => `<span data-emote-name="${n}">${em(KICK(n === 'pearHype' ? 4 : 5), n)}</span>`;
  const quote = ['mod_me', 'its all in the fanclub lol'];
  await add(kickRow('pixelpear', emoteOnly('pearHype'), quote));
  let q = await take();
  assert.deepEqual(q.m.map(m => [m.sender, m.kind, m.body, m.quoted]), [['pixelpear', 'reply', '', quote[1]]]);
  assert.deepEqual(q.m[0].parts, [{ e: 'pearHype', src: KICK(4) }], 'the emote they sent');
  assert.deepEqual(q.l.map(l => l.body), [], '(spam alerts are off)');
  // text below the chat appears and changes: never part of the message, so no new alerts
  for (const s of ['SO', 'Chat Rules\nAgree', '']){ await below(s); q = await take(); assert.deepEqual(q.m, [], `nothing new with "${s}" below`); }
  // the same person sends another emote-only reply to the same message
  await add(kickRow('pixelpear', emoteOnly('lulBlob'), quote));
  q = await take();
  assert.deepEqual(q.m.map(m => [m.sender, m.kind, m.body]), [['pixelpear', 'reply', '']]);
  assert.deepEqual(q.m[0].parts, [{ e: 'lulBlob', src: KICK(5) }]);
  // a watched word below the chat isn't blamed on them either
  await page.evaluate(() => window.__kmvMention.setMe('mod_me', ['rules']));
  await page.waitForTimeout(2800);
  await below('Chat Rules');
  assert.deepEqual((await take()).m, []);
});

// #124: Kick's message actions (Reply, Pin) only show while the pointer is over the message. Kick's own are icons,
// but an extension can add one with text ("SO"): it used to be read as part of the message once it showed, so the
// message came back as a new alert (an emote-only one as "SO", one with text without its emotes).
const BAR = '<div class="hidden group-hover:flex" style="display:none;position:absolute;right:0;top:0"><button aria-label="Reply"><svg width="12" height="12"></svg></button></div>';
const kickBarRow = (i, name, body, reply) => kickRow(name, body, reply).replace('data-index="1"', `data-index="${i}"`).replace(/<\/div><\/div>$/, `</div>${BAR}</div>`);

test('Kick: a mention or reply is one alert, with its emotes, when a button with text shows in its actions on hover (#124)', async t => {
  const page = await openApp(t);
  await page.evaluate(h => { const c = document.createElement('div'); c.id = 'chat'; c.innerHTML = h; document.body.append(c); window.mentionAgent(); }, kickBarRow(1, 'regular', 'hello'));
  await page.evaluate(() => { window.__kmvMention.setMe('mod_me', []); window.__kmvMention.setWatch(true); });
  await page.waitForTimeout(2800);
  const add = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), h);
  const take = () => page.evaluate(() => window.__kmvMention.take());
  // the extension puts its button in each message's actions, which stay hidden until the pointer is over the message
  const so = () => page.evaluate(() => document.querySelectorAll('#chat [class*="group-hover:flex"]').forEach(b => {
    if (!b.querySelector('[data-so-btn]')) b.insertAdjacentHTML('afterbegin', '<button data-so-btn="true">SO</button>'); }));
  const hover = i => page.evaluate(i => document.querySelectorAll('#chat [class*="group-hover:flex"]').forEach(b => {
    b.style.display = b.closest('[data-index]').dataset.index === String(i) ? 'flex' : 'none'; }), i);
  const quote = ['mod_me', 'who is up next?'];
  await add(kickBarRow(2, 'pixelpear', `<span data-emote-name="pearHype">${em(KICK(4), 'pearHype')}</span>`, quote));
  await add(kickBarRow(3, 'nightowl', `tron song @mod_me ${em(KICK(1), 'pearHype')} ${em(KICK(5), 'lulBlob')}`));
  await so();
  let q = await take();
  assert.deepEqual(q.m.map(m => [m.sender, m.kind, m.body]), [['pixelpear', 'reply', ''], ['nightowl', 'mention', 'tron song @mod_me']]);
  assert.deepEqual(q.m[1].parts, [{ t: 'tron song @mod_me ' }, { e: 'pearHype', src: KICK(1) }, { t: ' ' }, { e: 'lulBlob', src: KICK(5) }]);
  assert.equal(q.l.length, 2, 'two messages for the spam check');
  for (const i of [2, 3, 1, 0]){
    await hover(i);
    assert.match(await page.$eval('#chat', e => e.innerText), i ? /\nSO(\n|$)/ : /^(?![\s\S]*\bSO\b)/, `(the actions ${i ? 'show' : 'are hidden'})`);
    q = await take();
    assert.deepEqual(q.m, [], `no new alert with message ${i}'s actions showing`);
    assert.deepEqual(q.l, [], 'and nothing new for the spam check');
  }
  // the extension adds its button while the actions already show
  await page.evaluate(() => document.querySelectorAll('#chat [data-so-btn]').forEach(b => b.remove()));
  await hover(3); await so();
  assert.deepEqual((await take()).m, []);
  // a new message, with the actions of another one showing: one alert, as it is
  await add(kickBarRow(4, 'tidepool', `@mod_me ${em(KICK(5), 'lulBlob')}`)); await so();
  q = await take();
  assert.deepEqual(q.m.map(m => [m.sender, m.body]), [['tidepool', '@mod_me']]);
  assert.deepEqual(q.m[0].parts, [{ t: '@mod_me ' }, { e: 'lulBlob', src: KICK(5) }]);
  await hover(4);
  assert.deepEqual((await take()).m, []);
});

test('Kick: text added to a message after it shows (not in its actions) is not a new message; another message in that row is (#124)', async t => {
  const page = await openApp(t);
  await page.evaluate(h => { const c = document.createElement('div'); c.id = 'chat'; c.innerHTML = h; document.body.append(c); window.mentionAgent(); }, kickBarRow(1, 'regular', 'hello'));
  await page.evaluate(() => { window.__kmvMention.setMe('mod_me', []); window.__kmvMention.setWatch(true); });
  await page.waitForTimeout(2800);
  const add = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), h);
  const take = () => page.evaluate(() => window.__kmvMention.take());
  const tail = (i, s) => page.evaluate(([i, s]) => document.querySelector(`#chat [data-index="${i}"] .group > div > span:last-child`).insertAdjacentHTML('beforeend', s), [i, s]);
  const quote = ['mod_me', 'who is up next?'];
  await add(kickBarRow(2, 'pixelpear', `<span data-emote-name="pearHype">${em(KICK(4), 'pearHype')}</span>`, quote));
  await add(kickBarRow(3, 'nightowl', `hi @mod_me ${em(KICK(1), 'pearHype')}`));
  assert.equal((await take()).m.length, 2);
  await tail(2, '<b> SO</b>'); await tail(3, '<b> (SO)</b>');
  let q = await take();
  assert.deepEqual(q.m, [], 'no new alerts');
  assert.deepEqual(q.l, [], 'and nothing new for the spam check');
  // Kick re-uses a row for another message (another data-index): that's a new message, even when it starts the same
  await page.evaluate(() => { const r = document.querySelector('#chat [data-index="3"]'); r.dataset.index = '5'; r.querySelector('.group > div > span:last-child').textContent = 'hi @mod_me again'; });
  assert.deepEqual((await take()).m.map(m => [m.sender, m.body]), [['nightowl', 'hi @mod_me again']]);
});

// Kick's chat as it really is (kick-rows.js, saved from a Kick chat): each message is read by its parts (the name,
// the message, a reply's quote), not by its text, which an emote splits into lines and where a quote ends right
// against the sender's name.
test('Kick, read from its real markup: emote-only replies, text after an emote, quotes with emotes, and the "SO" button', async t => {
  const real = require('./kick-rows');
  const page = await openApp(t);
  await page.evaluate(([h, css]) => {
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const c = document.createElement('div'); c.id = 'chat'; c.style.cssText = 'position:relative;width:340px'; c.innerHTML = h; document.body.append(c);
    window.mentionAgent();
  }, [real.kickRow(1, 'regular', 'hello'), real.KICK_CSS]);
  await page.evaluate(() => window.__kmvMention.setMe('mod_me', ['tron']));
  await page.waitForTimeout(2800);
  const add = h => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), h);
  const take = () => page.evaluate(() => window.__kmvMention.take());
  const e = real.kickEmote;
  await add(real.kickRow(2, 'pixelpear', e(4, 'pearHype') + e(5, 'lulBlob'), ['mod_me', 'that might be the fun police']));
  await add(real.kickRow(3, 'nightowl', `tron has 2 cats ${e(1, 'pearHype')} wasnt that a year ago ${e(5, 'lulBlob')}`));
  await add(real.kickRow(4, 'tidepool', 'nice', ['mod_me', `look ${e(4, 'pearHype')} at this`]));
  await add(real.kickRow(5, 'quietkoala', `hey @mod_me ${e(1, 'pearHype')}`));
  assert.match(await page.$eval('#chat [data-index="3"]', e => e.innerText), /cats \n wasnt/, '(an emote splits the text into lines, as in Kick\'s chat)');
  const q = (await take()).m;
  assert.deepEqual(q.map(m => [m.sender, m.kind, m.body, m.quoted]), [
    ['pixelpear', 'reply', '', 'that might be the fun police'],
    ['nightowl', 'word', 'tron has 2 cats wasnt that a year ago', ''],
    ['tidepool', 'reply', 'nice', 'look at this'],
    ['quietkoala', 'mention', 'hey @mod_me', '']
  ]);
  assert.deepEqual(q[0].parts, [{ e: 'pearHype', src: KICK(4) }, { e: 'lulBlob', src: KICK(5) }], 'the emotes they sent');
  assert.deepEqual(q[1].parts, [{ t: 'tron has 2 cats ' }, { e: 'pearHype', src: KICK(1) }, { t: ' wasnt that a year ago ' }, { e: 'lulBlob', src: KICK(5) }]);
  assert.equal(q[2].parts, undefined, '(no emotes in the reply itself)');
  assert.deepEqual(q[2].qparts, [{ t: 'look ' }, { e: 'pearHype', src: KICK(4) }, { t: ' at this' }], 'the quote\'s emotes');
  assert.deepEqual(q[3].parts, [{ t: 'hey @mod_me ' }, { e: 'pearHype', src: KICK(1) }]);
  // the actions (with the extension's "SO") show while the pointer is over a message: nothing new
  for (const i of [2, 3, 4, 5]){
    await page.evaluate(i => document.querySelectorAll('#chat [class*="group-hover:flex"]').forEach(b => {
      b.style.display = b.closest('[data-index]').dataset.index === String(i) ? 'flex' : ''; }), i);
    assert.match(await page.$eval(`#chat [data-index="${i}"]`, e => e.innerText), /\bSO\b/, '(the actions show)');
    assert.deepEqual((await take()).m, [], `no new alert with message ${i}'s actions showing`);
  }
});

test('an abusive message is tagged ABUSIVE, and the same message with "(Banned)" after it is not read again', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  await page.setContent(`<div id="chat">${row('regular', 'hello there')}</div>`);
  await page.evaluate(js);
  await page.evaluate(() => window.__kmvMention.setWatch(true));
  await page.waitForTimeout(2800);                         // what's already in the chat counts as old
  const say = h => page.evaluate(x => document.getElementById('chat').insertAdjacentHTML('beforeend', x), h);
  await say(row('troll', 'ur a whore').replace('<div class="row">', '<div class="row" id="ab">'));
  const q = await page.evaluate(() => window.__kmvMention.take());
  assert.deepEqual(q.l.map(l => [l.sender, l.body, l.mod]), [['troll', 'ur a whore', false]]);
  await page.evaluate(l => window.__kmvMention.mark(l, 'Abusive: test', '#ff5f5f', 'abuse'), q.l[0].line);
  assert.equal(await page.$eval('#ab > [data-kmv-spam]', e => e.title), 'Abusive: test');
  assert.equal(await page.$eval('#ab', e => getComputedStyle(e.lastElementChild, '::after').content), '"ABUSIVE"');

  // a moderator bans them: the chat redraws the message with a note after it
  await page.evaluate(() => document.getElementById('ab').remove());
  await say(row('troll', 'ur a whore (Banned)'));
  assert.deepEqual((await page.evaluate(() => window.__kmvMention.take())).l.map(l => [l.body, l.mod]), [['ur a whore (Banned)', true]], 'a moderator\'s change');
  // typed by someone: a new message, checked like any other
  await say(row('other', 'gg (Banned)'));
  await say(row('troll', 'u r a c u n t (timed out)'));
  assert.deepEqual((await page.evaluate(() => window.__kmvMention.take())).l.map(l => [l.body, l.mod]), [['gg (Banned)', false], ['u r a c u n t (timed out)', false]]);
});

test('Why didn\'t this alert? (explain): how the helper read each line when it came in, and what it finds in it now', async t => {
  const app = await openApp(t);
  const js = await app.evaluate(() => window.chatAgentJs);
  const page = await app.context().newPage();
  await page.setContent(`<div id="chat">${row('early', 'pear before it started')}</div>`);
  await page.evaluate(js);
  await page.evaluate(() => window.__kmvMention.setMe('Mod_Me', ['pear']));
  await page.waitForTimeout(2800);
  const say = (n, b) => page.evaluate(h => document.getElementById('chat').insertAdjacentHTML('beforeend', h), row(n, b));
  await say('dan', '@mod_me look'); await say('eve', 'hello all'); await say('mod_me', 'pear from me'); await say('fay', 'pear pie');
  await page.evaluate(() => window.__kmvMention.take());
  const why = i => page.evaluate(i => { const r = window.__kmvMention.explain(document.querySelectorAll('#chat .row')[i]); return r.found ? [r.sender, r.decided && r.decided.v, r.decided && r.decided.kind, r.at, r.word, r.own, r.me] : r; }, i);
  assert.deepEqual(await why(0), ['early', 'before', undefined, false, 'pear', false, 'mod_me'], 'there before alerts started');
  assert.deepEqual(await why(1), ['dan', 'alerted', 'mention', true, '', false, 'mod_me']);
  assert.deepEqual(await why(2), ['eve', 'nomatch', undefined, false, '', false, 'mod_me']);
  assert.deepEqual(await why(3), ['mod_me', 'own', undefined, false, 'pear', true, 'mod_me']);
  assert.deepEqual(await why(4), ['fay', 'alerted', 'word', false, 'pear', false, 'mod_me']);
  assert.deepEqual(await page.evaluate(() => window.__kmvMention.explain(null)), { found: false });
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<p id="x">not a message line</p>'));
  assert.deepEqual(await page.evaluate(() => { const r = window.__kmvMention.explain(document.getElementById('x')); return [r.found, r.text]; }), [false, 'not a message line']);
  // nothing to look for (spam alerts reading the chat): "off"
  await page.evaluate(() => { window.__kmvMention.setMe('', []); window.__kmvMention.setWatch(true); });
  await page.waitForTimeout(2800);
  await say('gus', 'hi mod_me');
  await page.evaluate(() => window.__kmvMention.take());
  assert.deepEqual((await why(5)).slice(0, 2), ['gus', 'off']);
});
