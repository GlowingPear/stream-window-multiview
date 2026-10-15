// Mentions: your own words (nicknames) found in chat as whole words, and the mentions history window
// (search, filters, grouped by day). The chat helper runs on a small stand-in chat page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, mode, win } = require('./app');
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
  const page = await openApp(t);
  const now = Date.now(), day = 864e5;
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
  assert.deepEqual(await tabs(), ['Alerts *', 'Names & words', 'Chat bots']);
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
  assert.deepEqual(await tabs(), ['Alerts', 'Names & words', 'Chat bots *']);
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
