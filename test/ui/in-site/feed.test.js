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
    for (const f of [frame('App\\Events\\ChatMessageEvent', { id: 'k1', content: 'hi' }), frame('App\\Events\\MessageDeletedEvent', { message: { id: 'k1' } }), frame('RewardRedeemedEvent', { reward_title: 'Hydrate' }), frame('GoalProgressUpdateEvent', {}), 'not json',
      // what comes together in one message, a line each: each one passed on by itself
      [frame('App\\Events\\ChatMessageEvent', { id: 'k2', content: 'gg' }), frame('PointsUpdated', {}), frame('App\\Events\\ChatMessageEvent', { id: 'k3', content: '[emote:1:KEKW]' })].join('\n')])
      ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => {});
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard.length, 1, 'one batch');
  assert.equal(heard[0].s, 'kick');
  assert.deepEqual(heard[0].raw.map(r => JSON.parse(r).push.pub.data.event), ['App\\Events\\ChatMessageEvent', 'App\\Events\\MessageDeletedEvent', 'RewardRedeemedEvent', 'App\\Events\\ChatMessageEvent', 'App\\Events\\ChatMessageEvent'], 'Kick\'s newer events have no App\\Events');
  assert.deepEqual(heard[0].raw.slice(3).map(r => JSON.parse(JSON.parse(r).push.pub.data.data).id), ['k2', 'k3'], 'the messages of one websocket message, a line each');
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

test('the reader on Twitch: its chat lines, and a pin or its taking down, a reward redeemed and a shoutout from its other connection; not its other news', async t => {
  const page = await openApp(t);
  const heard = [];
  page.on('console', m => { if (m.text().startsWith('__kmv:feed ')) heard.push(JSON.parse(m.text().slice(11))); });
  await page.evaluate(() => {
    window.feedAgent('twitch'); window.__kmvFeed.on = true;
    const ws = new WebSocket('ws://127.0.0.1:9'); ws.onerror = () => {}; ws.addEventListener('message', e => e.data);
    const hermes = type => JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type, data: { id: 'p1' } }) } });
    for (const f of ['@id=a :x!x@x PRIVMSG #q :hi\r\nPING :tmi', hermes('pin-message'), hermes('viewcount'), hermes('unpin-message'), hermes('reward-redeemed'), hermes('create'), hermes('drop-progress'), hermes('commercial')]) ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard[0].s, 'twitch');
  assert.deepEqual(heard[0].raw.map(r => r.startsWith('{') ? JSON.parse(JSON.parse(r).notification.pubsub).type : r), ['@id=a :x!x@x PRIVMSG #q :hi', 'pin-message', 'unpin-message', 'reward-redeemed', 'create']);
});

test('the badges\' pictures (badgesAgent): Kick\'s channel sub badges by months; Twitch\'s channel badges, and its own only when asked for; none for YouTube, or a site that won\'t answer', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(async () => {
    const asked = [];
    const badge = (setID, version, title, imageURL = `https://static-cdn.jtvnw.net/badges/v1/${setID}${version}/2`) => ({ setID, version, title, imageURL });
    window.fetch = async (url, o = {}) => ({ json: async () => {
      url = String(url); asked.push(url + (o.body ? ' ' + JSON.parse(o.body).query.replace(/\s+/g, ' ').slice(0, 15) : ''));
      if (/\/api\/v2\/channels\/quietkoala$/.test(url)) return { id: 77, subscriber_badges: [{ months: 6, badge_image: { src: 'https://files.kick.com/channel_subscriber_badges/6.png' } }, { months: 1, badge_image: { src: 'https://files.kick.com/channel_subscriber_badges/1.png' } }, { months: 3, badge_image: { src: 'http://not-https' } }] };
      const all = /badges \{/.test(JSON.parse(o.body).query);
      return { data: { ...(all ? { badges: [badge('moderator', '1', 'Moderator'), badge('premium', '1', 'Prime Gaming', '')] } : {}), user: { broadcastBadges: [badge('subscriber', '24', '2-Year Subscriber')] } } };
    } });
    const out = { kick: await window.badgesAgent(false, 'kick', 'quietkoala'), twitch: await window.badgesAgent(false, 'twitch', 'quietkoala'), twitchAll: await window.badgesAgent(true, 'twitch', 'quietkoala'),
      youtube: await window.badgesAgent(true, 'youtube', 'quietkoala'), noName: await window.badgesAgent(true, 'kick', '') };
    window.fetch = async () => { throw new Error('offline'); };
    out.failed = [await window.badgesAgent(true, 'kick', 'quietkoala'), await window.badgesAgent(true, 'twitch', 'quietkoala')];
    return { out, asked };
  });
  assert.deepEqual(got.out.kick, { kick: { subs: [{ months: 1, url: 'https://files.kick.com/channel_subscriber_badges/1.png' }, { months: 6, url: 'https://files.kick.com/channel_subscriber_badges/6.png' }] } }, 'by months; not a picture that isn\'t https');
  const sub = { 'subscriber/24': { url: 'https://static-cdn.jtvnw.net/badges/v1/subscriber24/2', title: '2-Year Subscriber' } };
  assert.deepEqual(got.out.twitch, { twitch: { own: sub } }, 'Twitch\'s own not asked for: ALL has them');
  assert.deepEqual(got.out.twitchAll, { twitch: { own: sub, global: { 'moderator/1': { url: 'https://static-cdn.jtvnw.net/badges/v1/moderator1/2', title: 'Moderator' } } } });
  assert.deepEqual([got.out.youtube, got.out.noName, ...got.out.failed], [null, null, null, null]);
  assert.deepEqual(got.asked, ['/api/v2/channels/quietkoala', 'https://gql.twitch.tv/gql query { user(lo', 'https://gql.twitch.tv/gql query { badges ']);
});

test('Kick\'s own badge icons as its chat draws them (kickIconsAgent): by type, a gift by its icon name, a level\'s; not the ones ALL has, nor a picture', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(() => {
    const badge = (type, inner) => { const d = document.createElement('div'); d.dataset.testid = 'identity-badge-' + type; d.innerHTML = inner; return d; };
    const box = document.createElement('div');
    box.append(badge('founder', '<svg data-ds-icon="FounderBadge" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#feb635"/></svg>'),
      badge('sub_gifter', '<svg data-ds-icon="Gift25" viewBox="0 0 20 20"><path d="M1 1h18v18H1z" fill="#53fc18"/></svg>'),
      badge('moderator', '<svg data-ds-icon="ModeratorBadge" viewBox="0 0 20 20"><path d="M2 2h16v16H2z"/></svg>'),
      badge('subscriber', '<img src="https://files.kick.com/channel_subscriber_badges/1.png" alt="1-Month Subscriber">'));
    box.insertAdjacentHTML('beforeend', '<div><svg data-ds-icon="Level24" viewBox="0 0 20 20"><path d="M1 1h2v2H1z"/></svg></div>');
    document.body.append(box);
    const r = window.kickIconsAgent(['moderator']);
    box.remove();
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.match(/data-ds-icon="(\w+)"/)[1]]));
  });
  assert.deepEqual(got, { founder: 'FounderBadge', Gift25: 'Gift25', Level24: 'Level24' });
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

test('what the chat already shows (shownAgent): Kick\'s lines and the history its chat loads with, Twitch\'s lines as its chat\'s lines, YouTube\'s lines\' own data; each read as the live ones are', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(async () => {
    const { feedParse } = await import('./page/chat/feed-parse.js');
    const wrap = document.createElement('div'); document.body.append(wrap);
    const line = (cls, message, attrs = {}) => { const el = document.createElement('div'); el.className = cls; Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); el['__reactFiber$t'] = { memoizedProps: {}, return: { memoizedProps: { message } } }; wrap.append(el); return el; };
    const sender = (id, username, badges = []) => ({ id, username, slug: username.toLowerCase(), identity: { color: '#7FD2FF', badges } });
    const asked = [];
    const was = window.fetch;
    window.fetch = async url => { asked.push(String(url)); return { json: async () => (/\/api\/v2\/channels\/quietkoala$/.test(url) ? { id: 77, chatroom: { id: 5 } }
      : /chat\/77\/history$/.test(url) ? { data: { messages: [
        { id: 'k2', content: 'second [emote:39:GG]', type: 'reply', created_at: '2026-10-29T15:13:10Z', metadata: '{"original_sender":{"username":"Tide"},"original_message":{"id":"k0","content":"first?"}}', sender: sender(2, 'Lowtide', [{ type: 'og', sort_order: 7 }]) },
        { id: 'k1', content: 'first', type: 'message', created_at: '2026-10-29T15:13:00Z', metadata: 'null', sender: sender(3, 'Tide') },
        { id: 'kx', content: 'taken down', type: 'message', created_at: '2026-10-29T15:13:01Z', deleted_at: '2026-10-29T15:13:02Z', sender: sender(3, 'Tide') }] } } : {}) }; };
    // Kick: a line drawn since (its props as its live event's), and one it has from its history too
    line('', { id: 'k3', content: 'third', type: 'message', created_at: '2026-10-29T15:13:20Z', sender: sender(4, 'Quill') }, { 'data-index': '3' });
    line('', { id: 'k1', content: 'first', type: 'message', created_at: '2026-10-29T15:13:00Z', sender: sender(3, 'Tide') }, { 'data-index': '1' });
    line('', { id: 'k-no-time', content: 'not a message line', sender: sender(5, 'X') }, { 'data-index': '9' });
    const parse = (b, f = m => [m.id, m.sender, m.parts.map(p => p.text || '[' + p.name + ']').join('')]) => feedParse.parseFeed(b).map(f);
    const out = {};
    out.kick = parse(await window.shownAgent('kick', 'quietkoala'));
    out.kickReply = feedParse.parseFeed(await window.shownAgent('kick', 'quietkoala')).find(m => m.id === 'k2').reply;
    window.fetch = async () => { throw new Error('offline'); };
    out.kickOffline = parse(await window.shownAgent('kick', 'quietkoala'));
    wrap.replaceChildren();
    out.kickNone = await window.shownAgent('kick', 'quietkoala');
    // Twitch: its lines' message props
    line('chat-line__message', { id: 't1', timestamp: 1793286890690, user: { userLogin: 'tinroof', userDisplayName: 'TinRoof', userID: '11', color: '#FF7F50' }, badges: { subscriber: '12', moderator: '1' }, badgeDynamicData: { subscriber: '14' },
      messageParts: [{ type: 0, content: 'gg ' }, { type: 6, content: { emoteID: '25', alt: 'Kappa' } }, { type: 0, content: ' and 😀 ' }, { type: 6, content: { emoteID: '25', alt: 'Kappa' } }, { type: 0, content: ' a;b\\c' }], messageBody: 'x' });
    line('chat-line__message', { id: 't2', timestamp: 1793286891690, user: { userLogin: 'quill', userDisplayName: 'quill' }, badges: {}, messageParts: [{ type: 2, content: { recipient: 'TinRoof' } }, { type: 0, content: ' yes ' }, { type: 3, content: { url: 'https://x.y' } }],
      reply: { parentMsgId: 't1', parentUserLogin: 'tinroof', parentDisplayName: 'TinRoof', parentMessageBody: 'gg Kappa' }, isFirstMsg: true });
    line('chat-line__message', { id: 't3', user: { userLogin: 'gone' }, messageParts: [{ type: 0, content: 'deleted' }], deleted: true });
    line('chat-line__message', { id: 't4', user: { userLogin: 'body' }, messageParts: [], messageBody: 'only its body' });
    out.twitch = feedParse.parseFeed(await window.shownAgent('twitch', 'QuietKoala')).map(m => ({ id: m.id, t: m.t, sender: m.sender, login: m.login, color: m.color, badges: m.badges, pics: m.pics, parts: m.parts.map(p => p.text || '[' + p.name + ']'), reply: m.reply, first: m.first }));
    wrap.replaceChildren();
    // YouTube: its lines' own data
    const yt = (tag, data) => { const el = document.createElement(tag); el.data = data; wrap.append(el); };
    yt('yt-live-chat-text-message-renderer', { id: 'y1', timestampUsec: '1793286890000000', authorName: { simpleText: '@MikaR' }, message: { runs: [{ text: 'clip it' }] } });
    yt('yt-live-chat-paid-message-renderer', { id: 'y2', timestampUsec: '1793286891000000', authorName: { simpleText: '@Fan' }, purchaseAmountText: { simpleText: '$5.00' }, message: { runs: [{ text: 'gg' }] } });
    yt('yt-live-chat-text-message-renderer', null);
    out.youtube = feedParse.parseFeed(await window.shownAgent('youtube')).map(m => [m.kind, m.id, m.sender, m.amount || '']);
    wrap.replaceChildren();
    out.empty = [await window.shownAgent('twitch', 'quietkoala'), await window.shownAgent('youtube')];
    window.fetch = was; wrap.remove();
    return { out, asked };
  });
  assert.deepEqual(got.out.kick, [['k2', 'Lowtide', 'second [GG]'], ['k1', 'Tide', 'first'], ['k3', 'Quill', 'third'], ['k1', 'Tide', 'first']], 'its history (not a deleted one), then its lines (one it has twice: ALL keeps one)');
  assert.deepEqual(got.out.kickReply, { id: 'k0', sender: 'Tide', login: 'tide', body: 'first?' }, 'a reply\'s metadata read');
  assert.deepEqual(got.out.kickOffline, [['k3', 'Quill', 'third'], ['k1', 'Tide', 'first']], 'no history: the lines it shows');
  assert.equal(got.out.kickNone, null);
  assert.deepEqual(got.out.twitch, [
    { id: 't1', t: 1793286890690, sender: 'TinRoof', login: 'tinroof', color: '#FF7F50', badges: ['sub', 'mod'], pics: [{ set: 'subscriber', v: '12', months: 14 }, { set: 'moderator', v: '1' }],
      parts: ['gg ', '[Kappa]', ' and 😀 ', '[Kappa]', ' a;b\\c'], reply: undefined, first: undefined },
    { id: 't2', t: 1793286891690, sender: 'quill', login: 'quill', color: '', badges: [], pics: [], parts: ['yes https://x.y'], reply: { id: 't1', sender: 'TinRoof', login: 'tinroof', body: 'gg Kappa' }, first: true },
    { id: 't4', t: got.out.twitch[2].t, sender: 'body', login: 'body', color: '', badges: [], pics: [], parts: ['only its body'], reply: undefined, first: undefined }], 'as its chat\'s lines: emotes where they are (after an emoji too), its months, a reply without its @; not a deleted line');
  assert.deepEqual(got.out.youtube, [['message', 'y1', '@MikaR', ''], ['event', 'y2', '@Fan', '$5.00']]);
  assert.deepEqual(got.out.empty, [null, null]);
  assert.deepEqual(got.asked.slice(0, 2), ['/api/v2/channels/quietkoala', 'https://web.kick.com/api/v1/chat/77/history']);
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

test('the chat\'s modes and you there (modesAgent): Kick\'s chatroom and /me (its login), Twitch\'s chatSettings and you (its login), YouTube\'s words where its box would be', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(async () => {
    const asked = [], was = window.fetch, out = {};
    document.cookie = 'session_token=tok1'; document.cookie = 'auth-token=tok2';
    window.fetch = async (url, o = {}) => { url = String(url); asked.push(url.replace(/^https:\/\/gql.twitch.tv\/gql$/, 'gql') + ' ' + ((o.headers || {}).Authorization || '')); return { json: async () => {
      if (/\/chatroom$/.test(url)) return { slow_mode: { enabled: true, message_interval: 5 }, followers_mode: { enabled: true, min_duration: 10 }, subscribers_mode: { enabled: false }, emotes_mode: { enabled: true } };
      if (/\/me$/.test(url)) return { is_following: true, following_since: '2026-10-01T00:00:00Z', subscription: null, is_moderator: false, is_broadcaster: false, banned: null };
      const q = JSON.parse(o.body).query;
      if (/chatSettings/.test(q)) return { data: { user: { chatSettings: { slowModeDurationSeconds: null, followersOnlyDurationMinutes: 1440, isSubscribersOnlyModeEnabled: false, isEmoteOnlyModeEnabled: false, requireVerifiedAccount: true } } } };
      return { data: { user: { self: { follower: null, subscriptionBenefit: { id: 's' }, isModerator: false, isVIP: true } }, currentUser: { login: 'metwitch' } } };
    } }; };
    out.kick = await window.modesAgent('kick', 'quietkoala');
    out.twitch = await window.modesAgent('twitch', 'QuietKoala');
    document.cookie = 'session_token=; max-age=0'; document.cookie = 'auth-token=; max-age=0';
    out.kickOut = await window.modesAgent('kick', 'quietkoala');
    out.twitchOut = await window.modesAgent('twitch', 'quietkoala');
    out.none = [await window.modesAgent('kick', ''), await window.modesAgent('twitch', '')];
    window.fetch = async () => { throw new Error('offline'); };
    out.failed = await window.modesAgent('kick', 'quietkoala');
    window.fetch = async () => ({ json: async () => ({ data: { user: null } }) });
    out.noUser = await window.modesAgent('twitch', 'quietkoala');
    window.fetch = was;
    // YouTube: its box, or its words instead
    const wrap = document.createElement('div'); wrap.id = 'yt-wrap'; document.body.append(wrap);
    wrap.innerHTML = '<yt-live-chat-text-input-field-renderer><div id="input"></div></yt-live-chat-text-input-field-renderer>';
    out.ytBox = await window.modesAgent('youtube');
    wrap.innerHTML = '<yt-live-chat-restricted-participation-renderer>Subscribers-only mode.   Subscribe to chat</yt-live-chat-restricted-participation-renderer>';
    out.ytSaid = await window.modesAgent('youtube');
    wrap.innerHTML = ''; out.ytNone = await window.modesAgent('youtube'); wrap.remove();
    return { out, asked };
  });
  const o = got.out;
  assert.deepEqual(o.kick, { modes: { slow: 5, followers: 10, subs: false, emotes: true, verified: false }, me: { signedIn: true, follower: true, followedAt: Date.parse('2026-10-01T00:00:00Z'), sub: false, mod: false, vip: false, host: false, banned: false } });
  assert.deepEqual(o.twitch, { modes: { slow: 0, followers: 1440, subs: false, emotes: false, verified: true }, me: { signedIn: true, follower: false, followedAt: 0, sub: true, mod: false, vip: true, host: false, banned: false } });
  assert.deepEqual([o.kickOut.me, o.twitchOut.me], [{ signedIn: false }, { signedIn: false }], 'signed out: the modes, no you');
  assert.deepEqual([o.none, o.failed, o.noUser], [[null, null], null, null]);
  assert.deepEqual([o.ytBox, o.ytSaid, o.ytNone], [{ modes: {}, me: { signedIn: true } }, { blocked: 'Subscribers-only mode. Subscribe to chat' }, null]);
  assert.deepEqual(got.asked.slice(0, 4), ['/api/v2/channels/quietkoala/chatroom ', '/api/v2/channels/quietkoala/me Bearer tok1', 'gql ', 'gql OAuth tok2']);
});
