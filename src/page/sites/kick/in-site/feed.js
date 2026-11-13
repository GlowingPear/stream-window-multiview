/* ---- Kick's parts of the scripts that read its chat page for ALL (in-site/feed.js has the shared part of each) ----
   Each one runs inside a Kick chat page, as text (see "Scripts that run inside the sites" in src/page/README.md): it
   can't use anything outside itself, only what it's given. site.js plugs them in (its inSite slot), and the page
   passes them to in-site/feed.js's agents as it builds the script (sites/in-site.js). */

// feedAgent's tap: what Kick's live connection brings (its events, a line each in one websocket message: a busy chat's
// messages often come together), the ones ALL uses passed on (push), every kind counted for Settings › Developer ›
// Chat events (sample: its event's name, a chat message's type too). -> heard(text), for each websocket text
function kickTap({ F, push, sample }){
  // (in the frame's text the event's name is JSON: App\\Events\\…, its backslashes doubled; the newer ones have no App\\Events)
  const KICK = /"event":"(App\\+Events\\+)?(ChatMessageEvent|MessageDeletedEvent|UserBannedEvent|UserUnbannedEvent|ChatroomClearEvent|RewardRedeemedEvent|KicksGifted|GiftedSubscriptionsEvent|LuckyUsersWhoGotGiftSubscriptionsEvent|SubscriptionEvent|ChannelSubscriptionEvent|StreamHostEvent|StreamHostedEvent|ChatMoveToSupportedChannelEvent|PinnedMessageCreatedEvent|PinnedMessageDeletedEvent|ChatroomUpdatedEvent)"/;
  return data => {
    if (F.samp) data.split('\n').forEach(l => {
      let j; try { j = JSON.parse(l); } catch (e) { return; }
      const pub = j && j.push && j.push.pub; if (!pub || !pub.data) return;
      let ev = String(pub.data.event || Object.keys(pub.data).join(',')).replace(/^App\\Events\\/, '');
      if (ev === 'ChatMessageEvent'){ try { const t = JSON.parse(pub.data.data).type; if (t && t !== 'message') ev += ':' + t; } catch (e) {} }
      sample(ev, l);
    });
    data.split('\n').forEach(l => { if (l.startsWith('{"push"') && KICK.test(l)) push(l); });
  };
}

// pinAgent's part: a pin already up, from the chat's history (Kick sends a pin only as it's made), as its live pin
// event. -> [it] or null
async function kickPins(name){
  if (!name) return null;
  const ch = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}`, { credentials: 'include' })).json();
  const h = await (await fetch(`https://web.kick.com/api/v1/chat/${encodeURIComponent(ch.id)}/history`, { credentials: 'include' })).json();
  const pm = h && h.data && h.data.pinned_message;
  if (!pm || !pm.message) return null;
  return [JSON.stringify({ push: { channel: `chatrooms.${ch.chatroom ? ch.chatroom.id : 0}.v2`, pub: { data: { event: 'App\\Events\\PinnedMessageCreatedEvent', data: JSON.stringify({ message: pm.message, pinned_by: pm.pinned_by || null }) } } } })];
}

// shownAgent's part: the messages the chat already shows, as its live events: the history its chat loads with, and
// the lines it shows (their React props). -> [event] (none: [])
async function kickShown({ name, propsOf }){
  const frame = d => JSON.stringify({ push: { channel: 'chatrooms.0.v2', pub: { data: { event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify(d) } } } });
  const ok = d => d && d.id && d.sender && d.created_at && typeof d.content === 'string' && !d.deleted_at;
  const meta = d => (typeof d.metadata === 'string' ? { ...d, metadata: (() => { try { return JSON.parse(d.metadata); } catch (e) { return null; } })() } : d);
  let hist = [];
  if (name) try {
    const ch = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}`, { credentials: 'include' })).json();
    const h = await (await fetch(`https://web.kick.com/api/v1/chat/${encodeURIComponent(ch.id)}/history`, { credentials: 'include' })).json();
    hist = ((h && h.data && h.data.messages) || []).filter(ok).map(meta);
  } catch (e) {}   // (then the lines it shows only)
  const shown = [...document.querySelectorAll('[data-index]')].map(el => propsOf(el, 'message')).filter(ok).map(meta);
  return [...hist, ...shown].map(frame);
}

// badgesAgent's part: the channel's sub badges, by months (its other badges come with their pictures, or are its own
// icons: kickIconsAgent). -> { kick: { subs: [{ months, url }] } } or null
async function kickBadges(name){
  const ch = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}`, { credentials: 'include' })).json();
  const subs = (ch && Array.isArray(ch.subscriber_badges) ? ch.subscriber_badges : []).map(b => ({ months: +b.months || 0, url: (b.badge_image && b.badge_image.src) || '' })).filter(b => /^https:\/\//.test(b.url));
  return subs.length ? { kick: { subs: subs.sort((a, b) => a.months - b.months) } } : null;
}

// modesAgent's part: its chatroom (the modes) and your /me there (with the chat's login)
async function kickModes({ name, cookie }){
  if (!name) return null;
  const r = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}/chatroom`, { headers: { Accept: 'application/json' } })).json();
  const on = x => !!(x && x.enabled);
  const modes = { slow: on(r.slow_mode) ? +r.slow_mode.message_interval || 0 : 0, followers: on(r.followers_mode) ? +r.followers_mode.min_duration || 0 : null,
    subs: on(r.subscribers_mode), emotes: on(r.emotes_mode), verified: false };
  const tok = cookie('session_token');
  if (!tok) return { modes, me: { signedIn: false } };
  const me = await (await fetch(`/api/v2/channels/${encodeURIComponent(name)}/me`, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + tok } })).json();
  return { modes, me: { signedIn: !me.message, follower: !!me.is_following, followedAt: Date.parse(me.following_since) || 0, sub: !!me.subscription,
    mod: !!me.is_moderator, vip: false, host: !!me.is_broadcaster, banned: !!me.banned } };
}

// Kick's own badges as its chat draws them (its icons, not pictures: founder, moderator, a sub gifter's gift for how many,
// a level), for ALL's lines to look the same: the ones it has drawn that ALL doesn't have yet (known), by the badge's
// type, a gift's icon name (Gift25) or a level's (Level24). -> { '<key>': '<svg>' } (chat/all-chat.js cleans them)
function kickIconsAgent(known){
  const out = {}, have = new Set(known || []);
  const keep = (k, svg) => { if (k && svg && !have.has(k) && !out[k]) out[k] = svg.outerHTML.slice(0, 20000); };
  document.querySelectorAll('[data-testid^="identity-badge-"]').forEach(b => {
    const type = b.dataset.testid.slice('identity-badge-'.length), svg = b.querySelector('svg');
    if (svg) keep(type === 'sub_gifter' ? svg.dataset.dsIcon : type, svg);
  });
  document.querySelectorAll('svg[data-ds-icon^="Level"]').forEach(svg => keep(svg.dataset.dsIcon, svg));
  return out;
}

// Starts Kick's own reply to the message with that id (its Reply button on the line, shown on hover), so what's sent
// next goes as a reply. -> whether it did
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

export { kickBadges, kickIconsAgent, kickModes, kickPins, kickShown, kickTap, replyAgent };
