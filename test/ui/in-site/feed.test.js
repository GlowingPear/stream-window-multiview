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
    for (const f of [frame('App\\Events\\ChatMessageEvent', { id: 'k1', content: 'hi' }), frame('App\\Events\\MessageDeletedEvent', { message: { id: 'k1' } }), frame('RewardRedeemedEvent', { reward_title: 'Hydrate' }), frame('GoalProgressUpdateEvent', {}), 'not json'])
      ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => {});
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard.length, 1, 'one batch');
  assert.equal(heard[0].s, 'kick');
  assert.deepEqual(heard[0].raw.map(r => JSON.parse(r).push.pub.data.event), ['App\\Events\\ChatMessageEvent', 'App\\Events\\MessageDeletedEvent', 'RewardRedeemedEvent'], 'Kick\'s newer events have no App\\Events');
});

test('a Twitch reply: the line found and scrolled to, where the pointer goes; then its Reply (not the thread\'s) pressed; a line that isn\'t there: no', async t => {
  const page = await openApp(t);
  await addLines(page);
  await page.evaluate(() => {
    const line = document.querySelector('.chat-line__message'), box = document.createElement('div'); box.className = 'chat-line__message-container';
    line.replaceWith(box); box.append(line);
    const thread = document.createElement('button'); thread.setAttribute('aria-label', 'Reply in thread'); thread.onclick = () => window.__clicks.push('thread');
    const rep = document.createElement('button'); rep.setAttribute('aria-label', 'Click to reply to @tinroof'); rep.onclick = () => window.__clicks.push('tw-reply');
    window.__rep = rep;
    box.append(thread, rep);
  });
  const at = await page.evaluate(() => window.twReplyAt('tw1'));
  assert.ok(at && at.x > 0 && at.y >= 0, 'a point over the line');
  assert.equal(await page.evaluate(() => window.twReplyAt('nope')), null);
  assert.equal(await page.evaluate(() => window.twReplyPress('tw1')), 'ok');
  assert.deepEqual(await page.evaluate(() => window.__clicks), ['tw-reply']);
  await page.evaluate(() => window.__rep.setAttribute('aria-label', 'You can\'t reply now due to Followers-Only Chat'));
  assert.equal(await page.evaluate(() => window.twReplyPress('tw1')), 'cant', 'Twitch says you can\'t');
  assert.equal(await page.evaluate(() => window.twReplyPress('nope')), '', 'no such line (or no Reply on it)');
});

test('the reader on Twitch: its chat lines, and a pin or its taking down from its other connection; not its other news', async t => {
  const page = await openApp(t);
  const heard = [];
  page.on('console', m => { if (m.text().startsWith('__kmv:feed ')) heard.push(JSON.parse(m.text().slice(11))); });
  await page.evaluate(() => {
    window.feedAgent('twitch'); window.__kmvFeed.on = true;
    const ws = new WebSocket('ws://127.0.0.1:9'); ws.onerror = () => {}; ws.addEventListener('message', e => e.data);
    const hermes = type => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data: { id: 'p1' } }) } });
    for (const f of ['@id=a :x!x@x PRIVMSG #q :hi\r\nPING :tmi', hermes('pin-message'), hermes('viewcount'), hermes('unpin-message')]) ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard[0].s, 'twitch');
  assert.deepEqual(heard[0].raw.map(r => r.startsWith('{') ? JSON.parse(JSON.parse(r).notification.pubsub).type : r), ['@id=a :x!x@x PRIVMSG #q :hi', 'pin-message', 'unpin-message']);
});

test('a pin already up (pinAgent): Kick\'s chat history, Twitch\'s pinnedChatMessages, YouTube\'s first data; each as the live pin, which the parser reads', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(async () => {
    const { feedParse } = await import('./page/chat/feed-parse.js');
    const asked = [];
    const answer = (url, body) => {
      asked.push(url + (body ? ' ' + JSON.parse(body).query.replace(/\s+/g, ' ').slice(0, 44).trim() : ''));
      if (/\/api\/v2\/channels\/quietkoala$/.test(url)) return { id: 77, chatroom: { id: 5 } };
      if (/web\.kick\.com\/api\/v1\/chat\/77\/history$/.test(url)) return { data: { messages: [], pinned_message: { message: { id: 'k1', content: 'scrims at 8pm [emote:39:GG]', type: 'message', metadata: '{"message_ref":"1"}', created_at: '2026-10-29T01:10:29Z',
        sender: { id: 2, slug: 'quietkoala', username: 'QuietKoala', identity: { color: '#FEA0CF', badges: [{ type: 'broadcaster', text: 'Broadcaster' }] } } }, pinned_by: { username: 'nightowl_mod' } } } };
      if (/gql\.twitch\.tv/.test(url)) return { data: { user: { channel: { pinnedChatMessages: { edges: [{ node: { id: 'tp1', pinnedBy: { displayName: 'NightOwl' },
        pinnedMessage: { id: 'tm1', sentAt: '2026-10-29T01:14:28Z', content: { text: 'giveaway Kappa', fragments: [{ text: 'giveaway ', content: null }, { text: 'Kappa', content: { __typename: 'Emote', id: '25' } }] },
          sender: { id: '9', login: 'quietkoala', displayName: 'QuietKoala', chatColor: '#FF69B4', displayBadges: [{ setID: 'broadcaster', version: '1' }] } } } }] } } } } };
      return {};
    };
    const was = window.fetch;
    window.fetch = async (url, o = {}) => ({ json: async () => answer(String(url), o.body) });
    window.ytInitialData = { contents: { liveChatRenderer: { actions: [{ addChatItemAction: {} }, { clickTrackingParams: 'x', addBannerToLiveChatCommand: { bannerRenderer: { liveChatBannerRenderer: { actionId: 'b1',
      contents: { liveChatTextMessageRenderer: { id: 'y9', authorName: { simpleText: '@MikaR' }, message: { runs: [{ text: 'clip of the ace' }] } } } } } } }] } } };
    const out = {};
    for (const s of ['kick', 'twitch', 'youtube']){ const b = await window.pinAgent(s, 'quietkoala'); out[s] = feedParse.parseFeed(b).map(m => ({ kind: m.kind, id: m.id, by: m.by || '', sender: m.msg.sender, badges: m.msg.badges, parts: m.msg.parts.map(p => p.text || '[' + p.name + ']') })); }
    // none up, or a site that won't answer: nothing
    window.fetch = async url => ({ json: async () => (/channels\/quietkoala$/.test(url) ? { id: 77 } : /history/.test(url) ? { data: { pinned_message: null } } : { data: { user: { channel: { pinnedChatMessages: { edges: [] } } } } }) });
    window.ytInitialData = { contents: { liveChatRenderer: { actions: [] } } };
    out.none = [await window.pinAgent('kick', 'quietkoala'), await window.pinAgent('twitch', 'quietkoala'), await window.pinAgent('youtube')];
    window.fetch = async () => { throw new Error('offline'); };
    out.failed = [await window.pinAgent('kick', 'quietkoala'), await window.pinAgent('twitch', 'quietkoala'), await window.pinAgent('kick', '')];
    window.fetch = was; delete window.ytInitialData;
    return { out, asked };
  });
  assert.deepEqual(got.out.kick, [{ kind: 'pin', id: 'k1', by: 'nightowl_mod', sender: 'QuietKoala', badges: ['host'], parts: ['scrims at 8pm ', '[GG]'] }]);
  assert.deepEqual(got.out.twitch, [{ kind: 'pin', id: 'tp1', by: 'NightOwl', sender: 'QuietKoala', badges: ['host'], parts: ['giveaway ', '[Kappa]'] }]);
  assert.deepEqual(got.out.youtube, [{ kind: 'pin', id: 'b1', by: '', sender: '@MikaR', badges: [], parts: ['clip of the ace'] }]);
  assert.deepEqual(got.out.none, [null, null, null]);
  assert.deepEqual(got.out.failed, [null, null, null]);
  assert.deepEqual(got.asked, ['/api/v2/channels/quietkoala', 'https://web.kick.com/api/v1/chat/77/history', 'https://gql.twitch.tv/gql query { user(login: "quietkoala") { channel']);
});

test('Chat events: the reader counts every kind its connection brings (named by kind, one sample a minute each) while sampling is on, also with ALL off', async t => {
  const page = await openApp(t);
  const sent = [];
  page.on('console', m => { if (m.text().startsWith('__kmv:samples ')) sent.push(JSON.parse(m.text().slice(14))); });
  const run = (site, frames) => page.evaluate(([site, frames]) => {
    delete window.__kmvFeed; window.feedAgent(site); window.__kmvFeed.samp = true; window.__kmvFeed.sampMs = 60;
    const ws = new WebSocket('ws://127.0.0.1:9'); ws.onerror = () => {}; ws.addEventListener('message', e => e.data);
    for (const f of frames) ws.dispatchEvent(new MessageEvent('message', { data: f }));
  }, [site, frames]);
  const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
  await run('kick', [KF('ChatMessageEvent', { type: 'message' }), KF('ChatMessageEvent', { type: 'reply' }), KF('ChatMessageEvent', { type: 'message' }),
    JSON.stringify({ push: { channel: 'channel_9', pub: { data: { event: 'NewActivityFeedEvent', data: '{}' } } } }), '{"id":1,"connect":{}}', 'not json']);
  for (let i = 0; i < 40 && !sent.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(sent[0].s, 'kick');
  assert.deepEqual(Object.fromEntries(Object.entries(sent[0].k).map(([k, v]) => [k, [v.n, !!v.x]])), { ChatMessageEvent: [2, true], 'ChatMessageEvent:reply': [1, true], NewActivityFeedEvent: [1, true] }, 'nothing about ALL: it\'s off');
  // a kind sampled a moment ago: counted, no sample again for a minute
  await page.evaluate(KF => { const ws = new WebSocket('ws://127.0.0.1:9'); ws.onerror = () => {}; ws.addEventListener('message', e => e.data); ws.dispatchEvent(new MessageEvent('message', { data: KF })); }, KF('ChatMessageEvent', { type: 'message' }));
  for (let i = 0; i < 40 && sent.length < 2; i++) await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(sent[1].k, { ChatMessageEvent: { n: 1 } });
  sent.length = 0;
  const TW = (tags, rest) => '@' + tags + ' ' + rest;
  const hermes = type => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data: {} }) } });
  await run('twitch', [[TW('id=a', ':x!x@x PRIVMSG #q :hi'), TW('reply-parent-msg-id=z', ':x!x@x PRIVMSG #q :@y hi'), TW('bits=100', ':x!x@x PRIVMSG #q :cheer100'), TW('custom-reward-id=r', ':x!x@x PRIVMSG #q :hey'),
    TW('msg-id=highlighted-message', ':x!x@x PRIVMSG #q :look'), TW('msg-id=raid', ':tmi.twitch.tv USERNOTICE #q'), TW('msg-id=slow_on', ':tmi.twitch.tv NOTICE #q :slow'), TW('ban-duration=60', ':tmi.twitch.tv CLEARCHAT #q :x'),
    ':tmi.twitch.tv CLEARCHAT #q :x', ':tmi.twitch.tv CLEARCHAT #q', 'PING :tmi.twitch.tv', ':tmi.twitch.tv ROOMSTATE #q', ':tmi.twitch.tv NOTICE #q :odd', '???'].join('\r\n'), hermes('pin-message'), JSON.stringify({ type: 'keepalive' }), JSON.stringify({ type: 'welcome' }), '{oops']);
  for (let i = 0; i < 40 && !sent.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(Object.keys(sent[0].k).sort(), ['CLEARCHAT:all', 'CLEARCHAT:ban', 'CLEARCHAT:timeout', 'NOTICE:?', 'NOTICE:slow_on', 'PRIVMSG', 'PRIVMSG:bits', 'PRIVMSG:highlighted-message', 'PRIVMSG:reply', 'PRIVMSG:reward', 'ROOMSTATE', 'USERNOTICE:raid', 'hermes:pin-message', 'hermes:welcome']);
  // YouTube: each action of its chat's answers, by action and item; nothing while sampling is off
  sent.length = 0;
  await page.evaluate(() => {
    delete window.__kmvFeed;
    const acts = [{ addChatItemAction: { item: { liveChatTextMessageRenderer: {} } } }, { clickTrackingParams: 'x', addBannerToLiveChatCommand: { bannerRenderer: { liveChatBannerRenderer: {} } } }, { removeChatItemAction: {} }, { replaceChatItemAction: { replacementItem: { liveChatPaidMessageRenderer: {} } } }];
    window.fetch = async () => new Response(JSON.stringify({ continuationContents: { liveChatContinuation: { actions: acts } } }));
    window.feedAgent('youtube'); window.__kmvFeed.sampMs = 60;
    return window.fetch('/youtubei/v1/live_chat/get_live_chat').then(() => { window.__kmvFeed.samp = true; return window.fetch('/youtubei/v1/live_chat/get_live_chat'); });
  });
  for (let i = 0; i < 40 && !sent.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(Object.fromEntries(Object.entries(sent[0].k).map(([k, v]) => [k, v.n])), { 'addChatItemAction:liveChatTextMessageRenderer': 1, 'addBannerToLiveChatCommand:liveChatBannerRenderer': 1, removeChatItemAction: 1, 'replaceChatItemAction:liveChatPaidMessageRenderer': 1 });
});
