// ALL's helpers inside a chat page (in-site/feed.js): find a message by its id (See it on …), start the site's own reply
// to it (Kick), click its sender's name (their card). Stand-in lines in the app's own page, with the id where each site
// keeps it (React props, or the element's id).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

// lines like the sites': Twitch's (.chat-line__message), Kick's ([data-index] .group, its hover buttons), YouTube's (id)
const addLines = page => page.evaluate(() => {
  document.getElementById('fd-wrap')?.remove();
  window.__clicks = [];
  const wrap = document.createElement('div'); wrap.id = 'fd-wrap';
  const props = (el, id) => { el['__reactFiber$t'] = { memoizedProps: {}, return: { memoizedProps: { message: { id } } } }; };
  const tw = document.createElement('div'); tw.className = 'chat-line__message'; props(tw, 'tw1');
  const twName = document.createElement('span'); twName.setAttribute('data-a-target', 'chat-message-username'); twName.textContent = 'tinroof'; twName.onclick = () => window.__clicks.push('tw-name');
  tw.append(twName);
  const kick = document.createElement('div'); kick.setAttribute('data-index', '1');
  const g = document.createElement('div'); g.className = 'group'; props(g, 'k1');
  const quote = document.createElement('button'); quote.setAttribute('aria-label', 'Reply'); quote.onclick = () => window.__clicks.push('quote');
  const rep = document.createElement('button'); rep.setAttribute('aria-label', 'Reply'); rep.innerHTML = '<svg data-ds-icon="ArrowCurveLeft"></svg>'; rep.onclick = () => window.__clicks.push('reply');
  g.addEventListener('mouseover', () => { if (!g.contains(rep)) g.append(rep); });   // (the hover bar shows on hover)
  g.append(quote); kick.append(g);
  const yt = document.createElement('yt-live-chat-text-message-renderer'); yt.id = 'yt1';
  const ytName = document.createElement('span'); ytName.id = 'author-name'; ytName.onclick = () => window.__clicks.push('yt-name'); yt.append(ytName);
  wrap.append(tw, kick, yt); document.body.append(wrap);
});

test('See it on …: the line with that id, by React props or its own id, scrolled to and outlined; another id isn\'t found', async t => {
  const page = await openApp(t);
  await addLines(page);
  assert.equal(await page.evaluate(() => window.seekAgent('tw1')), true);
  assert.ok(await page.$eval('.chat-line__message', e => !!e.style.outline));
  assert.equal(await page.evaluate(() => window.seekAgent('yt1')), true);
  assert.equal(await page.evaluate(() => window.seekAgent('nope')), false);
});

test('a Kick reply: its hover bar\'s Reply (the arrow), not the line\'s other Reply; a line that isn\'t there: no', async t => {
  const page = await openApp(t);
  await addLines(page);
  assert.equal(await page.evaluate(() => window.replyAgent('k1')), true);
  assert.deepEqual(await page.evaluate(() => window.__clicks), ['reply']);
  assert.equal(await page.evaluate(() => window.replyAgent('gone')), false);
});

test('a name: the site\'s own name on that line is clicked (its card); a line that isn\'t there: no', async t => {
  const page = await openApp(t);
  await addLines(page);
  assert.equal(await page.evaluate(() => window.profileAgent('tw1')), true);
  assert.equal(await page.evaluate(() => window.profileAgent('yt1')), true);
  assert.deepEqual(await page.evaluate(() => window.__clicks), ['tw-name', 'yt-name']);
  assert.equal(await page.evaluate(() => window.profileAgent('gone')), false);
});

test('mod actions on a message: only the site\'s buttons labelled Delete or Pin are pressed; a line that\'s gone, or no such button: says so', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    document.getElementById('md-wrap')?.remove(); window.__clicks = [];
    const row = document.createElement('div'); row.id = 'md-wrap'; row.setAttribute('data-index', '1');
    const g = document.createElement('div'); g.className = 'group'; g['__reactFiber$m'] = { memoizedProps: { message: { id: 'k1' } } };
    const add = (label, what) => { const b = document.createElement('button'); b.setAttribute('aria-label', label); b.onclick = () => window.__clicks.push(what); g.append(b); };
    add('Ban', 'ban'); add('Delete', 'delete'); add('Pin', 'pin');
    row.append(g); document.body.append(row);
  });
  assert.equal(await page.evaluate(() => window.modAgent('delete', 'k1')), 'done');
  assert.equal(await page.evaluate(() => window.modAgent('pin', 'k1')), 'done');
  assert.deepEqual(await page.evaluate(() => window.__clicks), ['delete', 'pin'], 'never Ban');
  assert.equal(await page.evaluate(() => window.modAgent('delete', 'gone')), 'no-line');
  assert.equal(await page.evaluate(() => window.modAgent('ban', 'k1')), 'no-button', 'bans are chat commands, not buttons');
  await page.evaluate(() => document.querySelector('#md-wrap [aria-label=Pin]').remove());
  assert.equal(await page.evaluate(() => window.modAgent('pin', 'k1')), 'no-button');
});

test('the reader passes on what the site\'s connection brings, as the page reads it: Kick\'s events (their names as Kick writes them), not its other news', async t => {
  const page = await openApp(t);
  const heard = [];
  page.on('console', m => { if (m.text().startsWith('__kmv:feed ')) heard.push(JSON.parse(m.text().slice(11))); });
  await page.evaluate(() => {
    window.feedAgent('kick'); window.__kmvFeed.on = true;
    const ws = new WebSocket('ws://127.0.0.1:9');   // (never connects: a stand-in for Kick's connection)
    ws.addEventListener('message', e => e.data);    // (the page reads each message)
    ws.onerror = () => {};
    const frame = (ev, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: ev, data: JSON.stringify(data) } } } });
    for (const f of [frame('App\\Events\\ChatMessageEvent', { id: 'k1', content: 'hi' }), frame('App\\Events\\MessageDeletedEvent', { message: { id: 'k1' } }), frame('GoalProgressUpdateEvent', {}), 'not json'])
      ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => {});
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard.length, 1, 'one batch');
  assert.equal(heard[0].s, 'kick');
  assert.deepEqual(heard[0].raw.map(r => JSON.parse(r).push.pub.data.event), ['App\\Events\\ChatMessageEvent', 'App\\Events\\MessageDeletedEvent']);
});
