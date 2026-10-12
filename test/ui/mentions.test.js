// Mentions: your own words (nicknames) found in chat as whole words, and the mentions history window
// (search, filters, grouped by day). The chat helper runs on a small stand-in chat page.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./app');
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

test('the mentions history: grouped by day, search, filters, unread, delete and clear', async t => {
  const page = await openApp(t);
  const now = Date.now(), day = 864e5;
  const m = (o) => ({ label: '', quoted: '', unread: false, ...o });
  await page.evaluate(list => localStorage.setItem('kickMultiview.mentions', JSON.stringify(list)), [
    m({ channel: 'alpha', sender: 'ann', body: 'hey @me look', kind: 'mention', t: now - 60e3, unread: true }),
    m({ channel: 'tw:bravo', sender: 'bob', body: 'is pear around?', kind: 'word', word: 'pear', t: now - 120e3, unread: true }),
    m({ channel: 'alpha', sender: 'cat', body: 'sure thing', kind: 'reply', quoted: 'want to raid?', t: now - day - 60e3 }),
    m({ channel: 'alpha', sender: 'dan', body: 'pear <b>hi</b>', kind: 'word', word: 'pear', t: now - 5 * day })
  ]);
  await page.reload();
  await page.evaluate(() => window.openMentHistory());
  const days = () => page.$$eval('#mhList .mh-day', e => e.map(d => d.textContent));
  const senders = () => page.$$eval('#mhList .mp-row b', e => e.map(b => b.textContent));
  const ds = await days();
  assert.deepEqual(ds.slice(0, 2), ['Today2', 'Yesterday1']);
  assert.equal(ds.length, 3, 'and the older day by its date');
  assert.match(await page.textContent('#mentDlg .mh-count'), /4 kept · 2 unread/);
  assert.deepEqual(await page.$$eval('#mhList .mp-row .mp-kind', e => e.map(k => k.textContent)), ['Mention', 'Word: pear', 'Reply', 'Word: pear']);
  assert.equal(await page.$eval('#mhList .mp-row:nth-child(2) .mp-body', e => e.innerHTML), 'is <mark>pear</mark> around?', 'the word is marked');
  assert.equal(await page.$eval('#mhList .mh-group:last-child .mp-body', e => e.innerHTML), '<mark>pear</mark> &lt;b&gt;hi&lt;/b&gt;', 'and the message stays text');

  await page.click('#mhKinds [data-v=word]');
  assert.deepEqual(await senders(), ['bob', 'dan']);
  assert.equal(await page.textContent('#mhKinds [data-v=word]'), 'Words 2');
  await page.click('#mhKinds [data-v=all]');
  await page.fill('#mhQ', 'raid');
  assert.deepEqual(await senders(), ['cat'], 'search finds the quoted message too');
  await page.fill('#mhQ', '');
  await page.selectOption('#mhChan', 'tw:bravo');
  assert.deepEqual(await senders(), ['bob']);
  await page.selectOption('#mhChan', '');
  await page.check('#mhUnread');
  assert.deepEqual(await senders(), ['ann', 'bob']);
  await page.click('#mhRead');
  assert.match(await page.textContent('#mhList'), /Nothing matches/);
  await page.uncheck('#mhUnread');

  await page.hover('#mhList .mp-row:has-text("cat")');
  await page.click('#mhList .mp-row:has-text("cat") .mp-x');
  assert.deepEqual(await senders(), ['ann', 'bob', 'dan'], 'one deleted');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kickMultiview.mentions'))).length, 3);

  await page.click('#mhClear');
  await page.click('#askDlg .ask-no');
  assert.equal((await senders()).length, 3, 'Clear asks first');
  await page.click('#mhClear');
  await page.click('#askDlg .ask-yes');
  assert.match(await page.textContent('#mhList'), /No mentions yet/);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#mentDlg'));
});
