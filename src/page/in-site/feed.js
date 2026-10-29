/* ---- The chat's messages as the site sends them, for a linked streamer's ALL tab (chat/all-chat.js) ----
   Runs inside each chat page (Kick, Twitch, YouTube). It doesn't read the page: it hears what the site's own
   connection brings, as the page reads it, so nothing the page skips or hasn't drawn yet is missed, and deletions
   arrive as they happen. Twitch: the lines of its chat connection (IRC: messages, subs and gifts, deletions,
   timeouts). Kick: the events of its live connection (messages, deletions). YouTube: the answers to the page's
   requests for new messages. A websocket message is seen when the page reads it (MessageEvent's data), so it works
   for a connection that was open before this ran; YouTube's answers through fetch. Only what the app uses is passed
   on, a batch at a time, while the app has it on (window.__kmvFeed.on): "__kmv:feed {"s":"twitch","raw":[...]}".
   Settings › Developer › Chat events (#233), while window.__kmvFeed.samp is on: every kind of thing the connection
   brings, counted, with one of each now and then (at most once a minute a kind), every 10 seconds:
   "__kmv:samples {"s":"kick","k":{"<kind>":{"n":3,"x":"<one of them>"}}}" (chat/event-samples.js). */
function feedAgent(as){
  if (window.__kmvFeed) return true;
  const F = window.__kmvFeed = { on: false, samp: false, sampMs: 10000, recent: [] };   // (sampMs: the tests' shorter wait)   // recent: what the connection brought lately (in-site/send.js checks it before pressing again)
  const site = as || (/(^|\.)kick\.com$/.test(location.hostname) ? 'kick' : /(^|\.)twitch\.tv$/.test(location.hostname) ? 'twitch' : 'youtube');   // (as: the tests')
  let batch = [], timer = 0;
  const send = () => { timer = 0; if (!batch.length) return; const raw = batch; batch = []; console.log('__kmv:feed ' + JSON.stringify({ s: site, raw })); };
  const push = x => { if (!F.on) return; batch.push(x); if (batch.length > 400) batch.splice(0, batch.length - 400); if (!timer) timer = setTimeout(send, 250); };
  // Twitch's chat lines that ALL shows; Kick's events
  const TW = / (PRIVMSG|USERNOTICE|CLEARMSG|CLEARCHAT|ROOMSTATE) #/;
  // (in the frame's text the event's name is JSON: App\\Events\\…, its backslashes doubled; the newer ones have no App\\Events)
  const KICK = /"event":"(App\\+Events\\+)?(ChatMessageEvent|MessageDeletedEvent|UserBannedEvent|UserUnbannedEvent|ChatroomClearEvent|RewardRedeemedEvent|KicksGifted|GiftedSubscriptionsEvent|LuckyUsersWhoGotGiftSubscriptionsEvent|SubscriptionEvent|ChannelSubscriptionEvent|StreamHostEvent|PinnedMessageCreatedEvent|PinnedMessageDeletedEvent|ChatroomUpdatedEvent)"/;
  // Chat events: what kind each thing is. Kick: its event's name (a chat message's type too); Twitch: the line's command
  // (a message's kind, a notice's msg-id, a clear's), or its other connection's type; YouTube: the action (and its item)
  const S = { k: {}, at: {}, timer: 0 };
  function sample(kind, x){
    if (!F.samp || !kind) return;
    const e = S.k[kind] || (S.k[kind] = { n: 0 }); e.n++;
    if (e.x === undefined && Date.now() - (S.at[kind] || 0) > 60000) e.x = String(x).slice(0, 8000);
    if (!S.timer) S.timer = setTimeout(() => {
      S.timer = 0; const k = S.k; S.k = {};
      Object.keys(k).forEach(n => { if (k[n].x !== undefined) S.at[n] = Date.now(); });
      console.log('__kmv:samples ' + JSON.stringify({ s: site, k }));
    }, F.sampMs);
  }
  const tagOf = (tags, name) => { const m = new RegExp('(?:^|;)' + name + '=([^;]*)').exec(tags); return m ? m[1] : ''; };
  function ircKind(line){
    const m = /^(?:@(\S+) )?(?::\S+ )?([A-Z]+|\d{3})(?: #\S+)?( :.*)?/.exec(line); if (!m) return '';
    const tags = m[1] || '', cmd = m[2];
    if (cmd === 'PRIVMSG') return 'PRIVMSG' + (tagOf(tags, 'custom-reward-id') ? ':reward' : tagOf(tags, 'bits') ? ':bits' : tagOf(tags, 'reply-parent-msg-id') ? ':reply' : tagOf(tags, 'msg-id') ? ':' + tagOf(tags, 'msg-id') : '');
    if (cmd === 'USERNOTICE' || cmd === 'NOTICE') return cmd + ':' + (tagOf(tags, 'msg-id') || '?');
    if (cmd === 'CLEARCHAT') return 'CLEARCHAT:' + (tagOf(tags, 'ban-duration') ? 'timeout' : m[3] ? 'ban' : 'all');
    return cmd;
  }
  const ytKind = a => { const k = Object.keys(a || {}).find(x => x !== 'clickTrackingParams') || ''; const v = a && a[k] || {}, it = v.item || v.replacementItem || v.bannerRenderer;
    return k + (it ? ':' + (Object.keys(it)[0] || '') : ''); };
  function sampleAll(data){
    if (!F.samp || typeof data !== 'string') return;
    if (site === 'kick') data.split('\n').forEach(l => {
      let j; try { j = JSON.parse(l); } catch (e) { return; }
      const pub = j && j.push && j.push.pub; if (!pub || !pub.data) return;
      let ev = String(pub.data.event || Object.keys(pub.data).join(',')).replace(/^App\\Events\\/, '');
      if (ev === 'ChatMessageEvent'){ try { const t = JSON.parse(pub.data.data).type; if (t && t !== 'message') ev += ':' + t; } catch (e) {} }
      sample(ev, l);
    });
    else if (site === 'twitch'){
      if (data.startsWith('{')){ let j; try { j = JSON.parse(data); } catch (e) { return; }
        let t = j && j.type; try { if (j.notification && j.notification.pubsub) t = JSON.parse(j.notification.pubsub).type; } catch (e) {}
        if (t !== 'keepalive') sample('hermes:' + (t || '?'), data); }
      else data.split('\r\n').forEach(l => { const k = l && ircKind(l); if (k && k !== 'PING' && k !== 'PONG') sample(k, l); });
    }
  }
  function heard(data){
    sampleAll(data);
    if (typeof data !== 'string') return;
    if (site === 'twitch'){
      if (data.includes(' #')) data.split('\r\n').forEach(l => { if (TW.test(l)) push(l); });
      else if (data.startsWith('{') && /\\"((un)?pin-message|updated_room|moderation_action)\\"/.test(data)) push(data);   // (its other connection: a message pinned or taken down, the chat's modes, what a moderator did)
    }
    else if (site === 'kick' && data.startsWith('{"push"') && KICK.test(data)) push(data);
  }
  const seen = new WeakSet(), d = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
  if (d && d.get) Object.defineProperty(MessageEvent.prototype, 'data', { configurable: true, enumerable: d.enumerable, get(){
    const v = d.get.call(this);
    try { if ((F.on || F.samp) && !seen.has(this) && this.target instanceof WebSocket){ seen.add(this); heard(v); if (typeof v === 'string'){ F.recent.push({ t: Date.now(), v: v.slice(0, 4000) }); if (F.recent.length > 60) F.recent.shift(); } } } catch (e) {}
    return v;
  } });
  if (site === 'youtube'){
    const f = window.fetch;
    window.fetch = async function(...a){
      const r = await f.apply(this, a);
      try {
        if ((F.on || F.samp) && /\/live_chat\/get_live_chat\b/.test(String(a[0] && a[0].url || a[0])))
          r.clone().json().then(j => { const acts = j && j.continuationContents && j.continuationContents.liveChatContinuation && j.continuationContents.liveChatContinuation.actions; if (Array.isArray(acts)) acts.forEach(x => { push(x); sample(ytKind(x), JSON.stringify(x)); }); }).catch(() => {});
      } catch (e) {}
      return r;
    };
  }
  return true;
}

// A pin already up when ALL starts reading this chat (the sites send a pin only as it's made). Each site's chat page
// asks for its pin as it loads: Kick with the chat's history, Twitch with a pinnedChatMessages query, YouTube in the
// page's first data. -> { s, raw: [it as the live pin event] } for feedAgent's batch shape, or null (none, or unreadable)
async function pinAgent(as, nameAs){
  const site = as || (/(^|\.)kick\.com$/.test(location.hostname) ? 'kick' : /(^|\.)twitch\.tv$/.test(location.hostname) ? 'twitch' : 'youtube');
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];   // (as, nameAs: the tests')
  try {
    if (site === 'kick'){
      if (!name) return null;
      const ch = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}`, { credentials: 'include' })).json();
      const h = await (await fetch(`https://web.kick.com/api/v1/chat/${encodeURIComponent(ch.id)}/history`, { credentials: 'include' })).json();
      const pm = h && h.data && h.data.pinned_message;
      if (!pm || !pm.message) return null;
      return { s: 'kick', raw: [JSON.stringify({ push: { channel: `chatrooms.${ch.chatroom ? ch.chatroom.id : 0}.v2`, pub: { data: { event: 'App\\Events\\PinnedMessageCreatedEvent', data: JSON.stringify({ message: pm.message, pinned_by: pm.pinned_by || null }) } } } })] };
    }
    if (site === 'twitch'){
      if (!name) return null;
      const query = `query { user(login: ${JSON.stringify(decodeURIComponent(name).toLowerCase())}) { channel { pinnedChatMessages(first: 1) { edges { node { id pinnedBy { displayName }
        pinnedMessage { id sentAt content { text fragments { text content { __typename ... on Emote { id } } } } sender { id login displayName chatColor displayBadges { setID version } } } } } } } } }`;
      const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json();
      const node = (((((r && r.data && r.data.user) || {}).channel || {}).pinnedChatMessages || {}).edges || [])[0];
      const n = node && node.node, m = n && n.pinnedMessage;
      if (!m || !m.id) return null;
      const u = m.sender || {}, c = m.content || {};
      const message = { id: m.id, sent_at: Math.floor((Date.parse(m.sentAt) || Date.now()) / 1000), content: { text: c.text || '', fragments: (c.fragments || []).map(f => f.content && f.content.__typename === 'Emote' && f.content.id ? { text: f.text, emoticon: { emoticonID: f.content.id } } : { text: f.text }) },
        sender: { id: u.id, login: u.login, display_name: u.displayName, chat_color: u.chatColor, badges: (u.displayBadges || []).map(b => ({ id: b.setID, version: b.version })) } };
      return { s: 'twitch', raw: [JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'pin-message', data: { id: n.id, pinned_by: { display_name: (n.pinnedBy || {}).displayName || '' }, message } }) } })] };
    }
    const acts = (((window.ytInitialData || {}).contents || {}).liveChatRenderer || {}).actions || [];
    const pins = acts.filter(a => a && a.addBannerToLiveChatCommand);
    return pins.length ? { s: 'youtube', raw: pins } : null;
  } catch (e) { return null; }
}

// The chat's modes and where you stand in it, for ALL's box (chat/all-chat.js): asked as ALL starts reading the chat;
// changes come live after (feed-parse.js). Kick: its chatroom (the modes) and your /me there (with the chat's login);
// Twitch: chatSettings, and you there (with the page's login); YouTube: what its chat says where its box would be
// (sign in, members only), as it doesn't say more. -> { modes: { slow, followers, subs, emotes, verified }, me: { signedIn,
// follower, followedAt, sub, mod, vip, host, banned } } or { blocked: "<the site's words>" }, or null (unreadable)
async function modesAgent(as, nameAs){
  const site = as || (/(^|\.)kick\.com$/.test(location.hostname) ? 'kick' : /(^|\.)twitch\.tv$/.test(location.hostname) ? 'twitch' : 'youtube');
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];
  const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
  try {
    if (site === 'kick'){
      if (!name) return null;
      const r = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}/chatroom`, { headers: { Accept: 'application/json' } })).json();
      const on = x => !!(x && x.enabled);
      const modes = { slow: on(r.slow_mode) ? +r.slow_mode.message_interval || 0 : 0, followers: on(r.followers_mode) ? +r.followers_mode.min_duration || 0 : null,
        subs: on(r.subscribers_mode), emotes: on(r.emotes_mode), verified: false };
      const tok = ck('session_token');
      if (!tok) return { modes, me: { signedIn: false } };
      const me = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}/me`, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + tok } })).json();
      return { modes, me: { signedIn: !me.message, follower: !!me.is_following, followedAt: Date.parse(me.following_since) || 0, sub: !!me.subscription,
        mod: !!me.is_moderator, vip: false, host: !!me.is_broadcaster, banned: !!me.banned } };
    }
    if (site === 'twitch'){
      if (!name) return null;
      const login = decodeURIComponent(name).toLowerCase(), tok = ck('auth-token');
      const gql = (query, auth) => fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json', ...(auth ? { Authorization: 'OAuth ' + tok } : {}) },
        body: JSON.stringify({ query }) }).then(r => r.json());
      const s = (((await gql(`query { user(login: ${JSON.stringify(login)}) { chatSettings { slowModeDurationSeconds followersOnlyDurationMinutes isSubscribersOnlyModeEnabled isEmoteOnlyModeEnabled requireVerifiedAccount } } }`)).data || {}).user || {}).chatSettings;
      if (!s) return null;
      const modes = { slow: +s.slowModeDurationSeconds || 0, followers: s.followersOnlyDurationMinutes == null ? null : +s.followersOnlyDurationMinutes, subs: !!s.isSubscribersOnlyModeEnabled,
        emotes: !!s.isEmoteOnlyModeEnabled, verified: !!s.requireVerifiedAccount };
      if (!tok) return { modes, me: { signedIn: false } };
      const d = (await gql(`query { user(login: ${JSON.stringify(login)}) { self { follower { followedAt } subscriptionBenefit { id } isModerator isVIP } } currentUser { login } }`, true)).data || {};
      const self = (d.user || {}).self || {}, you = ((d.currentUser || {}).login || '').toLowerCase();
      return { modes, me: { signedIn: !!you, follower: !!self.follower, followedAt: self.follower ? Date.parse(self.follower.followedAt) || 0 : 0, sub: !!self.subscriptionBenefit,
        mod: !!self.isModerator, vip: !!self.isVIP, host: !!you && you === login, banned: false } };
    }
    // YouTube: its box, or what it says instead (Sign in to chat, members only, …)
    const box = document.querySelector('yt-live-chat-text-input-field-renderer #input');
    if (box) return { modes: {}, me: { signedIn: true } };
    const say = document.querySelector('yt-live-chat-restricted-participation-renderer, #input-panel');
    const text = say ? say.innerText.replace(/\s+/g, ' ').trim() : '';
    return text ? { blocked: text.slice(0, 160) } : null;
  } catch (e) { return null; }
}

// For ALL's check that it reads this chat (chat/all-health.js): how many message lines the page shows, and its newest
// one's text (it changes when a message comes: compared on this computer only). With html: the newest line's HTML for a
// report, its words replaced and only its structure's attributes kept (class, id, role, data-a-target, data-index).
function lineProbe(html){
  const rows = document.querySelectorAll('.chat-line__message, [data-index], yt-live-chat-text-message-renderer');
  const last = rows[rows.length - 1];
  const out = { n: rows.length, last: last ? last.innerText.replace(/\s+/g, ' ').slice(0, 200) : '' };
  if (html && last){
    const c = last.cloneNode(true), keep = /^(class|id|role|data-a-target|data-index|data-testid)$/;
    const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) t.nodeValue = t.nodeValue.replace(/[^\s]+/g, 'word');
    [c, ...c.querySelectorAll('*')].forEach(e => [...e.attributes].forEach(at => { if (!keep.test(at.name)) e.removeAttribute(at.name); }));
    out.html = c.outerHTML.slice(0, 6000);
  }
  return out;
}

// "See it on …" in ALL: scrolls the site's chat to the message with that id and flashes it. Twitch and Kick keep the id
// in each line's React props (message.id), YouTube as the line's own id. -> whether it was found
function seekAgent(id){
  const rows = document.querySelectorAll('.chat-line__message, .chat-line__status, [class*="user-notice-line"], [data-index], yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer');
  const idOf = el => {
    if (el.id && el.id === id) return id;
    const k = Object.keys(el).find(x => x.startsWith('__reactFiber'));
    for (let f = k && el[k], i = 0; f && i < 6; f = f.return, i++){ const p = f.memoizedProps || {}, m = p.message || p.notice || p.msg; if (m && m.id) return m.id; }
    return '';
  };
  const hit = [...rows].reverse().find(el => idOf(el) === id);
  if (!hit) return false;
  hit.scrollIntoView({ block: 'center' });
  const was = hit.style.outline;
  hit.style.outline = '2px solid #53fc18'; hit.style.outlineOffset = '-2px';
  setTimeout(() => { hit.style.outline = was; }, 2500);
  return true;
}

// Starts the site's own reply to the message with that id (Kick: its Reply button on the line, shown on hover), so what's
// sent next goes as a reply. -> whether it did
async function replyAgent(id){
  const find = () => [...document.querySelectorAll('[data-index]')].reverse().find(el => {
    const k = Object.keys(el.querySelector('.group') || el).find(x => x.startsWith('__reactFiber'));
    for (let f = k && (el.querySelector('.group') || el)[k], i = 0; f && i < 8; f = f.return, i++){ const m = (f.memoizedProps || {}).message; if (m && m.id) return m.id === id; }
    return false;
  });
  const row = find(); if (!row) return false;
  (row.querySelector('.group') || row).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
  // the hover bar's Reply (its arrow icon), not the line's other buttons called Reply
  const all = [...row.querySelectorAll('button')].filter(x => /^reply$/i.test(x.getAttribute('aria-label') || ''));
  const b = all.find(x => x.querySelector('svg[data-ds-icon="ArrowCurveLeft"]')) || all[all.length - 1];
  if (!b) return false;
  b.click();
  await new Promise(r => setTimeout(r, 150));
  return true;
}
// Twitch's reply, step 1: the line with that id, scrolled into view -> where the pointer goes over it (CSS pixels from
// the page's top left), or null. Twitch only shows a line's Reply under a real pointer: the app moves it there.
function twReplyAt(id){
  const idOf = el => { const k = Object.keys(el).find(x => x.startsWith('__reactFiber')); for (let f = k && el[k], i = 0; f && i < 8; f = f.return, i++){ const m = (f.memoizedProps || {}).message; if (m && m.id) return m.id; } return ''; };
  const line = [...document.querySelectorAll('.chat-line__message')].reverse().find(el => idOf(el) === id);
  if (!line) return null;
  line.scrollIntoView({ block: 'center' });
  const r = line.getBoundingClientRect();
  return r.width ? { x: r.left + r.width * 0.6, y: r.top + r.height / 2 } : null;
}
// Twitch's reply, step 2 (the pointer is over the line): its Reply ("Click to reply to @…"), which opens Twitch's reply
// above the box -> 'ok'; 'cant' (Twitch says you can't reply there now: followers-only and the like); '' (no Reply: your
// own message, or the line's gone)
async function twReplyPress(id){
  const idOf = el => { const k = Object.keys(el).find(x => x.startsWith('__reactFiber')); for (let f = k && el[k], i = 0; f && i < 8; f = f.return, i++){ const m = (f.memoizedProps || {}).message; if (m && m.id) return m.id; } return ''; };
  for (let t = 0; t < 10; t++){
    const line = [...document.querySelectorAll('.chat-line__message')].reverse().find(el => idOf(el) === id);
    const area = line && (line.closest('.chat-line__message-container') || line.parentElement || line);
    const labels = area ? [...area.querySelectorAll('button')].map(x => [x, x.getAttribute('aria-label') || '']) : [];
    const b = labels.find(([, l]) => /^click to reply\b/i.test(l));
    if (b){ b[0].click(); await new Promise(r => setTimeout(r, 150)); return 'ok'; }
    if (labels.some(([, l]) => /can.t reply/i.test(l))) return 'cant';
    await new Promise(r => setTimeout(r, 80));
  }
  return '';
}
// Clicks the sender's name on the message with that id, so the site opens its own card for them. Self-contained (it runs
// in the page on its own). -> whether it did
function profileAgent(id){
  const rows = document.querySelectorAll('.chat-line__message, [data-index], yt-live-chat-text-message-renderer');
  const idOf = el => {
    if (el.id && el.id === id) return id;
    for (const node of [el, el.querySelector('.group')].filter(Boolean)){
      const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
      for (let f = k && node[k], i = 0; f && i < 6; f = f.return, i++){ const m = (f.memoizedProps || {}).message; if (m && m.id) return m.id; }
    }
    return '';
  };
  const hit = [...rows].reverse().find(el => idOf(el) === id);
  const name = hit && hit.querySelector('[data-a-target="chat-message-username"], .chat-author__display-name, #author-name, button[title], button');
  if (!name) return false;
  hit.scrollIntoView({ block: 'center' });
  name.click();
  return true;
}

export { feedAgent, lineProbe, modesAgent, pinAgent, profileAgent, replyAgent, seekAgent, twReplyAt, twReplyPress };
