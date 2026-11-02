// ALL's helpers inside a chat page (in-site/feed.js): find a message by its id (Copy message HTML), start the site's own reply
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

test('Copy message HTML (developer tools): the line with that id, by React props or its own id; another id isn\'t found', async t => {
  const page = await openApp(t);
  await addLines(page);
  assert.match(await page.evaluate(() => window.messageHtml('tw1')), /^<div class="chat-line__message">.*tinroof/);
  assert.match(await page.evaluate(() => window.messageHtml('yt1')), /^<yt-live-chat-text-message-renderer id="yt1">/);
  assert.equal(await page.evaluate(() => window.messageHtml('nope')), '');
  assert.equal(await page.evaluate(() => window.messageHtml('nope', true)), null, 'Why didn\'t this alert?: nothing to explain');
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

test('held messages: Allow and Deny press only the site\'s own button on that card (Twitch: AutoMod\'s card around the message; YouTube: its held item\'s Show or Hide)', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    window.__clicks = [];
    const btn = (label, what, text) => { const b = document.createElement('button'); if (label) b.setAttribute('aria-label', label); if (text) b.textContent = text; b.onclick = () => window.__clicks.push(what); return b; };
    // Twitch: the card holds AutoMod's line and the message (its id); Allow and Deny by their words
    const card = document.createElement('div'); card.id = 'hd-tw';
    const auto = document.createElement('span'); auto.dataset.aUser = 'automod';
    const msg = document.createElement('div'); msg.id = 'h-1'; msg.className = 'message'; msg.append(btn('Unban user1', 'unban'));
    card.append(auto, msg, btn('', 'allow', 'Allow'), btn('', 'deny', 'Deny'));
    const lone = document.createElement('div'); lone.className = 'chat-line__message';   // (an ordinary line: not a hold, and the card's Allow isn't its)
    const inLine = document.createElement('span'); inLine.id = 'h-2'; lone.append(inLine);
    // YouTube: its held item, by its data's id, with Show, Hide and Hide user…
    const yt = document.createElement('yt-live-chat-auto-mod-message-renderer'); yt.data = { id: 'y-1' };
    yt.append(btn('Show', 'show'), btn('Hide', 'hide'), btn('Hide user on this channel', 'hideUser'));
    document.body.append(card, lone, yt);
  });
  const act = (a, id, site) => page.evaluate(([a, id, site]) => window.heldAgent(a, id, site), [a, id, site]);
  assert.equal(await act('allow', 'h-1', 'twitch'), 'done');
  assert.equal(await act('deny', 'h-1', 'twitch'), 'done');
  assert.equal(await act('deny', 'y-1', 'youtube'), 'done');
  assert.equal(await act('allow', 'y-1', 'youtube'), 'done');
  assert.deepEqual(await page.evaluate(() => window.__clicks), ['allow', 'deny', 'hide', 'show'], 'never Unban or Hide user');
  assert.equal(await act('allow', 'h-2', 'twitch'), 'no-line', 'not a held card');
  assert.equal(await act('allow', 'gone', 'twitch'), 'no-line');
  assert.equal(await act('allow', 'gone', 'youtube'), 'no-line');
  assert.equal(await act('ban', 'h-1', 'twitch'), 'no-button');
  await page.evaluate(() => document.querySelectorAll('#hd-tw > button').forEach(b => b.remove()));
  assert.equal(await act('allow', 'h-1', 'twitch'), 'no-button', 'expired: no Allow on its card');
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
      // a raid coming in (the raided chat's), and going out (the raiding channel's, its chat moved to the raided one)
      frame('App\\Events\\StreamHostedEvent', { message: { id: 'h1', numberOfViewers: 5 }, user: { username: 'novalynx' } }), frame('App\\Events\\ChatMoveToSupportedChannelEvent', { hosted: { slug: 'emberfall' } }),
      // what comes together in one message, a line each: each one passed on by itself
      [frame('App\\Events\\ChatMessageEvent', { id: 'k2', content: 'gg' }), frame('PointsUpdated', {}), frame('App\\Events\\ChatMessageEvent', { id: 'k3', content: '[emote:1:KEKW]' })].join('\n')])
      ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  await page.waitForFunction(() => true, null, { timeout: 100 }).catch(() => {});
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard.length, 1, 'one batch');
  assert.equal(heard[0].s, 'kick');
  assert.deepEqual(heard[0].raw.map(r => JSON.parse(r).push.pub.data.event), ['App\\Events\\ChatMessageEvent', 'App\\Events\\MessageDeletedEvent', 'RewardRedeemedEvent',
    'App\\Events\\StreamHostedEvent', 'App\\Events\\ChatMoveToSupportedChannelEvent', 'App\\Events\\ChatMessageEvent', 'App\\Events\\ChatMessageEvent'], 'Kick\'s newer events have no App\\Events');
  assert.deepEqual(heard[0].raw.slice(5).map(r => JSON.parse(JSON.parse(r).push.pub.data.data).id), ['k2', 'k3'], 'the messages of one websocket message, a line each');
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
    for (const f of ['@id=a :x!x@x PRIVMSG #q :hi\r\nPING :tmi', hermes('pin-message'), hermes('viewcount'), hermes('unpin-message'), hermes('reward-redeemed'), hermes('create'), hermes('drop-progress'), hermes('commercial'), hermes('raid_update_v2'), hermes('raid_go_v2'), hermes('raid_cancel_v2'), hermes('goal_achieved'), hermes('goal_updated'), hermes('automod_caught_message'), hermes('chat-highlight'), hermes('collaboration-status-refetch')]) ws.dispatchEvent(new MessageEvent('message', { data: f }));
  });
  for (let i = 0; i < 30 && !heard.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(heard[0].s, 'twitch');
  assert.deepEqual(heard[0].raw.map(r => r.startsWith('{') ? JSON.parse(JSON.parse(r).notification.pubsub).type : r), ['@id=a :x!x@x PRIVMSG #q :hi', 'pin-message', 'unpin-message', 'reward-redeemed', 'create', 'raid_update_v2', 'raid_go_v2', 'raid_cancel_v2', 'goal_achieved', 'automod_caught_message', 'chat-highlight']);
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

test('a Twitch chat\'s channel id (twRoomAgent): its user\'s id, by its login; null for no name, an odd answer or a site that won\'t answer', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(async () => {
    const asked = [];
    window.fetch = async (url, o = {}) => ({ json: async () => { asked.push(String(url) + ' ' + JSON.parse(o.body).query); return /odd/.test(o.body) ? { data: { user: { id: 'x1' } } } : /gone/.test(o.body) ? { data: { user: null } } : { data: { user: { id: '111' } } }; } });
    const out = [await window.twRoomAgent('QuietKoala'), await window.twRoomAgent('odd'), await window.twRoomAgent('gone'), await window.twRoomAgent('')];
    window.fetch = async () => { throw new Error('offline'); };
    out.push(await window.twRoomAgent('quietkoala'));
    return { out, asked };
  });
  assert.deepEqual(got.out, ['111', null, null, null, null]);
  assert.equal(got.asked[0], 'https://gql.twitch.tv/gql query { user(login: "quietkoala") { id } }');
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

test('how a YouTube chat draws names and badges (ytLookAgent): its colours, the names it drew over them, its badges\' icons in their colour', async t => {
  const page = await openApp(t);
  const look = () => page.evaluate(() => window.ytLookAgent());
  const got = await page.evaluate(() => {
    const root = document.documentElement;
    root.setAttribute('dark', '');
    [['--yt-live-chat-secondary-text-color', 'rgba(255,255,255,0.7)'], ['--yt-live-chat-moderator-color', '#5e84f1'], ['--yt-live-chat-new-moderator-color', '#3ea6ff'],
      ['--yt-live-chat-sponsor-color', '#2ba640'], ['--yt-live-chat-author-chip-owner-text-color', '#111'], ['--yt-live-chat-author-chip-owner-background-color', '#ffd600']].forEach(([k, v]) => root.style.setProperty(k, v));
    const line = (cls, style, chipAttr) => { const l = document.createElement('yt-live-chat-text-message-renderer'), chip = document.createElement('yt-live-chat-author-chip'), n = document.createElement('span');
      if (chipAttr) chip.setAttribute(chipAttr, ''); n.id = 'author-name'; if (cls) n.className = cls; Object.assign(n.style, style); chip.append(n); l.append(chip); return l; };
    const badge = (type, color) => { const b = document.createElement('yt-live-chat-author-badge-renderer'); b.setAttribute('type', type); b.style.color = color; b.innerHTML = '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v4c0 4-6 7-6 7S2 12 2 8V4z"/></svg>'; return b; };
    const box = document.createElement('div'); box.id = 'yt-box';
    box.append(line('', { color: 'rgb(170, 170, 170)' }), badge('moderator', 'rgb(62, 166, 255)'), badge('member', 'red'));
    document.body.append(box);
    const before = window.ytLookAgent();
    // the new moderator colour: its chip says so; a highlighted name (yours, mentioned) isn't how others look
    box.append(line('owner', { color: 'rgb(15, 15, 15)', backgroundColor: 'rgb(241, 241, 241)' }), line('moderator', { color: 'rgb(1, 2, 3)' }, 'is-highlighted'));
    box.firstChild.querySelector('yt-live-chat-author-chip').setAttribute('enable-new-moderator-text-color', '');
    const after = window.ytLookAgent();
    box.remove(); root.removeAttribute('dark'); root.removeAttribute('style');
    return { before, after };
  });
  assert.equal(got.before.dark, true);
  assert.deepEqual(got.before.names, { viewer: 'rgb(170, 170, 170)', mod: '#5e84f1', member: '#2ba640', owner: '#111', ownerBg: '#ffd600' }, 'its colours, a viewer\'s as it drew one');
  assert.deepEqual(Object.keys(got.before.icons), ['moderator'], 'its moderator, verified and streamer badges only');
  assert.match(got.before.icons.moderator.svg, /^<svg viewBox="0 0 16 16"><path/);
  assert.equal(got.before.icons.moderator.color, 'rgb(62, 166, 255)');
  assert.deepEqual(got.after.names, { viewer: 'rgb(170, 170, 170)', mod: '#3ea6ff', member: '#2ba640', owner: 'rgb(15, 15, 15)', ownerBg: 'rgb(241, 241, 241)' }, 'the new moderator blue, and the streamer as drawn');
  assert.equal((await look()).dark, false);
});

test('a hype train already running (hypeAgent): Twitch\'s GraphQL for the chat\'s channel; none, or one that has ended, or no answer: null', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(async () => {
    const real = window.fetch, asked = [];
    const run = async answer => { window.fetch = async (url, o) => { asked.push(JSON.parse(o.body).query.replace(/\s+/g, ' ').slice(0, 60)); if (answer === 'fail') throw new Error('offline'); return { json: async () => answer }; }; try { return await window.hypeAgent('quietkoala'); } finally { window.fetch = real; } };
    const ex = x => ({ data: { user: { channel: { hypeTrain: { execution: x } } } } });
    const r = [await run(ex({ id: 'ht-1', expiresAt: '2026-10-30T22:16:02Z', endedAt: null, progress: { goal: 2, progression: 1, level: { value: 3 } } })), await run(ex(null)),
      await run(ex({ id: 'ht-0', endedAt: '2026-10-30T22:16:02Z' })), await run({ errors: [{}] }), await run('fail'), await window.hypeAgent('')];
    return { r, asked };
  });
  assert.equal(got.r[0].id, 'ht-1');
  assert.deepEqual(got.r.slice(1), [null, null, null, null, null]);
  assert.match(got.asked[0], /^query \{ user\(login: "quietkoala"\) \{ channel \{ hypeTrain \{ ex/);
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

test('Chat events: the reader counts every kind its connection brings (named by kind, a few samples first, then one a minute each) while sampling is on, also with ALL off', async t => {
  const page = await openApp(t);
  const sent = [];
  page.on('console', m => { if (m.text().startsWith('__kmv:samples ')) sent.push(JSON.parse(m.text().slice(14))); });
  const run = (site, frames) => page.evaluate(([site, frames]) => {
    delete window.__kmvFeed; window.feedAgent(site); window.__kmvFeed.samp = true; window.__kmvFeed.sampMs = 60;
    const ws = new WebSocket('ws://127.0.0.1:9'); ws.onerror = () => {}; ws.addEventListener('message', e => e.data);
    for (const f of frames) ws.dispatchEvent(new MessageEvent('message', { data: f }));
  }, [site, frames]);
  const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
  await run('kick', [KF('ChatMessageEvent', { type: 'message' }), KF('ChatMessageEvent', { type: 'reply' }), KF('ChatMessageEvent', { type: 'message' }), KF('ChatMessageEvent', { type: 'message' }),
    JSON.stringify({ push: { channel: 'channel_9', pub: { data: { event: 'NewActivityFeedEvent', data: '{}' } } } }), '{"id":1,"connect":{}}', 'not json']);
  for (let i = 0; i < 40 && !sent.length; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(sent[0].s, 'kick');
  assert.deepEqual(Object.fromEntries(Object.entries(sent[0].k).map(([k, v]) => [k, [v.n, v.xs.length]])), { ChatMessageEvent: [3, 3], 'ChatMessageEvent:reply': [1, 1], NewActivityFeedEvent: [1, 1] }, 'a kind\'s first 3 all kept; nothing about ALL: it\'s off');
  // a kind sampled 3 times already, a moment ago: counted, no sample again for a minute
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

test('Chat events: a rare kind\'s first 3 samples are all kept, and each new status (an AutoMod hold, then a mod allowing it); a busy kind still one a minute', async t => {
  const page = await openApp(t);
  const sent = [];
  page.on('console', m => { if (m.text().startsWith('__kmv:samples ')) sent.push(JSON.parse(m.text().slice(14))); });
  await page.evaluate(() => { delete window.__kmvFeed; window.feedAgent('twitch'); window.__kmvFeed.samp = true; window.__kmvFeed.sampMs = 60; });
  const send = frames => page.evaluate(frames => {
    const ws = new WebSocket('ws://127.0.0.1:9'); ws.onerror = () => {}; ws.addEventListener('message', e => e.data);
    for (const f of frames) ws.dispatchEvent(new MessageEvent('message', { data: f }));
  }, frames);
  const batch = async frames => { const at = sent.length; await send(frames); for (let i = 0; i < 40 && sent.length === at; i++) await new Promise(r => setTimeout(r, 50)); return sent[at].k; };
  // hermes: its pubsub a JSON string inside JSON, so the status is escaped (\"status\":\"PENDING\")
  const held = (status, id) => JSON.stringify({ type: 'notification', notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'automod_caught_message', data: { message: { id }, status } }) } });
  const raid = n => JSON.stringify({ type: 'notification', notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'raid_update_v2', raid: { n } }) } });
  const line = n => '@id=a' + n + ' :x!x@x PRIVMSG #q :hi ' + n;
  const statuses = k => k.xs.map(x => /PENDING|ALLOWED|DENIED/.exec(x)[0]);
  let k = await batch([raid(1), raid(2), raid(3), raid(4), line(1), line(2), line(3), line(4)]);
  assert.deepEqual([k['hermes:raid_update_v2'].n, k['hermes:raid_update_v2'].xs.length, k.PRIVMSG.n, k.PRIVMSG.xs.length], [4, 3, 4, 3], 'the first 3 of each, in one go');
  k = await batch([raid(5), line(5), line(6)]);
  assert.deepEqual([k['hermes:raid_update_v2'], k.PRIVMSG], [{ n: 1 }, { n: 2 }], 'after 3: one a minute (a busy kind too)');
  // a held message, then a mod allowing it, within a second: both kept; another PENDING too (its first 3)
  k = await batch([held('PENDING', 'm1'), held('ALLOWED', 'm1')]);
  assert.deepEqual(statuses(k['hermes:automod_caught_message']), ['PENDING', 'ALLOWED']);
  k = await batch([held('PENDING', 'm2'), held('PENDING', 'm3'), held('DENIED', 'm3'), held('ALLOWED', 'm4')]);
  assert.deepEqual([k['hermes:automod_caught_message'].n, statuses(k['hermes:automod_caught_message'])], [4, ['PENDING', 'DENIED']], 'its third, then the status not sampled yet; not one it has had (in a minute)');
  // escaped twice (a JSON string inside one inside JSON), and moderation_action: a variant too
  const deep = action => JSON.stringify({ type: 'notification', notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'chat_moderator_actions', data: JSON.stringify({ moderation_action: action }) }) } });
  k = await batch([deep('ban'), deep('ban'), deep('ban'), deep('ban')]);
  assert.equal(k['hermes:chat_moderator_actions'].xs.length, 3);
  k = await batch([deep('ban'), deep('timeout'), deep('delete'), deep('untimeout'), deep('unban')]);
  assert.deepEqual(k['hermes:chat_moderator_actions'].xs.map(x => /moderation_action\\+":\\+"(\w+)/.exec(x)[1]), ['timeout', 'delete', 'untimeout'], 'each new one, up to 3 a batch');
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
    // signed out: its lines once each, as what's in the way · what to do, and that it's its sign-in (its button, or its words)
    wrap.innerHTML = '<yt-live-chat-restricted-participation-renderer><div>All messages that you send will appear publicly.</div><div><a href="https://accounts.google.com/ServiceLogin?service=youtube">Sign in to chat</a></div></yt-live-chat-restricted-participation-renderer>';
    out.ytSignIn = await window.modesAgent('youtube');
    wrap.innerHTML = '<div id="input-panel"><div>Sign in to chat</div><div>Sign in to chat</div></div>';
    out.ytSignInWords = await window.modesAgent('youtube');
    // its box built after the page loaded: waited for
    wrap.innerHTML = ''; setTimeout(() => { wrap.innerHTML = '<yt-live-chat-text-input-field-renderer><div id="input"></div></yt-live-chat-text-input-field-renderer>'; }, 300);
    out.ytLater = await window.modesAgent('youtube', '', 3000);
    wrap.innerHTML = ''; const t0 = Date.now(); out.ytNone = await window.modesAgent('youtube', '', 300); out.ytWaited = Date.now() - t0; wrap.remove();
    return { out, asked };
  });
  const o = got.out;
  assert.deepEqual(o.kick, { modes: { slow: 5, followers: 10, subs: false, emotes: true, verified: false }, me: { signedIn: true, follower: true, followedAt: Date.parse('2026-10-01T00:00:00Z'), sub: false, mod: false, vip: false, host: false, banned: false } });
  assert.deepEqual(o.twitch, { modes: { slow: 0, followers: 1440, subs: false, emotes: false, verified: true }, me: { signedIn: true, follower: false, followedAt: 0, sub: true, mod: false, vip: true, host: false, banned: false } });
  assert.deepEqual([o.kickOut.me, o.twitchOut.me], [{ signedIn: false }, { signedIn: false }], 'signed out: the modes, no you');
  assert.deepEqual([o.none, o.failed, o.noUser], [[null, null], null, null]);
  assert.deepEqual([o.ytBox, o.ytSaid, o.ytNone], [{ modes: {}, me: { signedIn: true } }, { blocked: 'Subscribers-only mode. Subscribe to chat' }, null]);
  assert.deepEqual([o.ytSignIn, o.ytSignInWords], [{ blocked: 'All messages that you send will appear publicly · Sign in to chat', signIn: true }, { blocked: 'Sign in to chat', signIn: true }]);
  assert.deepEqual(o.ytLater, { modes: {}, me: { signedIn: true } });
  assert.ok(o.ytWaited >= 250, 'nothing there yet: waited before saying it can\'t read it');
  assert.deepEqual(got.asked.slice(0, 4), ['/api/v2/channels/quietkoala/chatroom ', '/api/v2/channels/quietkoala/me Bearer tok1', 'gql ', 'gql OAuth tok2']);
});

test('a pin from ALL: Twitch\'s "Unpin After" panel that opens after it is clicked off (Escape and a press outside), without ALL waiting for it; nothing else is pressed', async t => {
  const page = await openApp(t);
  await page.evaluate(() => {
    document.getElementById('md-wrap')?.remove(); window.__off = [];
    const row = document.createElement('div'); row.id = 'md-wrap'; row.className = 'chat-line__message'; row['__reactFiber$m'] = { memoizedProps: { message: { id: 'tw9' } } };
    const pin = document.createElement('button'); pin.setAttribute('aria-label', 'Pin this message');
    // Twitch: the pin made, then (a moment later) its panel over the chat, which closes on Escape or a press outside it
    pin.onclick = () => setTimeout(() => {
      const panel = document.createElement('div'); panel.id = 'tw-unpin'; panel.innerHTML = '<p>Unpin After</p><label><input type="radio"> Customized time</label>';
      const close = e => { if (!panel.contains(e.target)){ window.__off.push(e.type); panel.remove(); } };
      document.addEventListener('mousedown', close); document.addEventListener('keydown', e => { if (e.key === 'Escape'){ window.__off.push('Escape'); panel.remove(); } });
      document.body.append(panel);
    }, 400);
    row.append(pin); document.body.append(row);
  });
  const t0 = Date.now();
  assert.equal(await page.evaluate(() => window.modAgent('pin', 'tw9')), 'done');
  assert.ok(Date.now() - t0 < 1500, 'answered without waiting for the panel');
  await page.waitForFunction(() => !document.getElementById('tw-unpin') && window.__off.length);
  assert.equal(await page.evaluate(() => window.__off[0]), 'Escape');
  // a delete: nothing is clicked off
  await page.evaluate(() => { window.__off = []; const d = document.createElement('button'); d.setAttribute('aria-label', 'Delete'); document.querySelector('#md-wrap').append(d);
    const p = document.createElement('div'); p.id = 'other'; p.textContent = 'Unpin After'; document.body.append(p); document.addEventListener('mousedown', () => window.__off.push('mousedown')); });
  assert.equal(await page.evaluate(() => window.modAgent('delete', 'tw9')), 'done');
  await page.waitForTimeout(800);
  assert.deepEqual(await page.evaluate(() => window.__off), [], 'only after a pin');
  await page.evaluate(() => document.getElementById('other').remove());
});

test('Twitch\'s chat commands as its own page has them (twCommandsAgent): its getCommands, asked for every level as an editor; none there, or failing: null', async t => {
  const page = await openApp(t);
  const got = await page.evaluate(() => {
    const box = document.createElement('div'); box.setAttribute('data-a-target', 'chat-input'); document.body.append(box);
    const asked = [];
    const provider = { memoizedProps: { getCommands: (level, o) => { asked.push([level, o.isEditor, o.hasPermissions.has('x')]); return [{ name: 'ban', permissionLevel: 2, description: 'Ban.', commandArgs: [{ name: 'username', isRequired: true }, { name: 'reason', isRequired: false }] }, { name: 'raid', permissionLevel: 3, allowEditorUsage: true, description: 'Raid.' }]; } } };
    const rootF = { child: { sibling: provider } }; box['__reactFiber$x'] = { return: rootF };
    const r1 = window.twCommandsAgent();
    provider.memoizedProps.getCommands = () => { throw new Error('changed'); };
    const r2 = window.twCommandsAgent();
    box.remove();
    return { r1, r2, asked, r3: window.twCommandsAgent() };
  });
  assert.deepEqual(got.r1, [{ name: 'ban', args: [{ name: 'username', required: true }, { name: 'reason', required: false }], description: 'Ban.', level: 2, editor: false }, { name: 'raid', args: [], description: 'Raid.', level: 3, editor: true }]);
  assert.deepEqual(got.asked, [[3, true, true]]);
  assert.deepEqual([got.r2, got.r3], [null, null]);
});
