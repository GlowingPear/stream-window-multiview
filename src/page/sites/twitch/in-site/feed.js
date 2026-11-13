/* ---- Twitch's parts of the scripts that read its chat page for ALL (in-site/feed.js has the shared part of each),
   and the scripts only Twitch's chat needs ----
   Each one runs inside a Twitch chat page, as text (see "Scripts that run inside the sites" in src/page/README.md):
   it can't use anything outside itself, only what it's given. site.js plugs them in (its inSite slot), and the page
   passes them to in-site/feed.js's agents as it builds the script (sites/in-site.js). */

// feedAgent's tap: the lines of Twitch's chat connection (IRC: messages, subs and gifts, deletions, timeouts) that ALL
// shows, and its other connection's (hermes JSON) news ALL uses, passed on (push); every kind counted for Settings ›
// Developer › Chat events (sample: the line's command, a message's kind, a notice's msg-id, a clear's; or the other
// connection's type). -> heard(text), for each websocket text
function twitchTap({ F, push, sample }){
  const TW = / (PRIVMSG|USERNOTICE|CLEARMSG|CLEARCHAT|ROOMSTATE) #/;
  const tagOf = (tags, name) => { const m = new RegExp('(?:^|;)' + name + '=([^;]*)').exec(tags); return m ? m[1] : ''; };
  function ircKind(line){
    const m = /^(?:@(\S+) )?(?::\S+ )?([A-Z]+|\d{3})(?: #\S+)?( :.*)?/.exec(line); if (!m) return '';
    const tags = m[1] || '', cmd = m[2];
    if (cmd === 'PRIVMSG') return 'PRIVMSG' + (tagOf(tags, 'custom-reward-id') ? ':reward' : tagOf(tags, 'bits') ? ':bits' : tagOf(tags, 'reply-parent-msg-id') ? ':reply' : tagOf(tags, 'msg-id') ? ':' + tagOf(tags, 'msg-id') : '');
    if (cmd === 'USERNOTICE' || cmd === 'NOTICE') return cmd + ':' + (tagOf(tags, 'msg-id') || '?');
    if (cmd === 'CLEARCHAT') return 'CLEARCHAT:' + (tagOf(tags, 'ban-duration') ? 'timeout' : m[3] ? 'ban' : 'all');
    return cmd;
  }
  function sampleAll(data){
    if (!F.samp) return;
    if (data.startsWith('{')){ let j; try { j = JSON.parse(data); } catch (e) { return; }
      let t = j && j.type; try { if (j.notification && j.notification.pubsub) t = JSON.parse(j.notification.pubsub).type; } catch (e) {}
      if (t !== 'keepalive') sample('hermes:' + (t || '?'), data); }
    else data.split('\r\n').forEach(l => { const k = l && ircKind(l); if (k && k !== 'PING' && k !== 'PONG') sample(k, l); });
  }
  return data => {
    sampleAll(data);
    if (data.includes(' #')) data.split('\r\n').forEach(l => { if (TW.test(l)) push(l); });
    else if (data.startsWith('{') && /\\"((un)?pin-message|updated_room|moderation_action|reward-redeemed|raid_(update|go|cancel)_v2|goal_achieved|automod_caught_message|low_trust_user_new_message|chat-highlight|hype-train-(start|progression|level-up|end))\\"|\\"type\\":\\"create\\"/.test(data)) push(data);   // (its other connection: a message pinned or taken down, the chat's modes, a reward redeemed, a shoutout, what a moderator did, a raid getting ready, going or called off, a goal reached, a message held by AutoMod, a suspicious user's flags, Twitch's marks on a message, a hype train starting, moving along, levelling up or ending)
  };
}

// pinAgent's part: a pin already up (Twitch sends a pin only as it's made), from a pinnedChatMessages query, as its
// live pin event. -> [it] or null
async function twitchPins(name){
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
  return [JSON.stringify({ notification: { type: 'pubsub', pubsub: JSON.stringify({ type: 'pin-message', data: { id: n.id, pinned_by: { display_name: (n.pinnedBy || {}).displayName || '' }, message } }) } })];
}

// shownAgent's part: the messages the chat already shows, as its chat's lines (IRC, from what each line shows). Twitch
// draws its chat's recent messages a moment after its page loads (as the app starts, later still): it waits for them,
// until its lines stop coming or `wait` ms. -> [line] (none: [])
async function twitchShown({ name, wait, propsOf }){
  const room = decodeURIComponent(name || '').toLowerCase();
  const rows = () => document.querySelectorAll('.chat-line__message');
  for (let n = -1, still = 0, t = Date.now(); Date.now() - t < wait; ){   // (its lines there, and none new for half a second)
    const now = rows().length; still = now && now === n ? still + 1 : 0; n = now;
    if (still >= 2) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const msgs = [...rows()].map(el => propsOf(el, 'message')).filter(Boolean);
  // a shared chat (Twitch's Stream Together): the channel each line was sent in, as its live ones say it, and this
  // channel's id beside it (a line from another channel: the badges it shows are its badges there)
  let own = '';
  if (name && msgs.some(m => m.sourceRoomID)) try {
    const query = `query { user(login: ${JSON.stringify(room)}) { id } }`;
    const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json();
    own = String((r && r.data && r.data.user && r.data.user.id) || '');
  } catch (e) {}
  const tag = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\:').replace(/ /g, '\\s').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const line = m => {
    const u = m.user || {}, login = String(u.userLogin || '').toLowerCase();
    if (!login || m.deleted || m.banned || m.hidden) return null;
    let text = '', at = 0; const emotes = {};
    (m.messageParts || []).forEach(p => {
      const c = p && p.content;
      const t = typeof c === 'string' ? c : c && c.emoteID ? String(c.alt || '') : c && c.recipient ? '@' + c.recipient : c && c.url ? String(c.url) : String((c && (c.alt || c.text)) || '');
      const n = Array.from(t).length;
      if (c && c.emoteID && n) (emotes[c.emoteID] || (emotes[c.emoteID] = [])).push(`${at}-${at + n - 1}`);
      text += t; at += n;
    });
    if (!text) text = String(m.messageBody || '');
    if (!text.trim()) return null;
    const months = m.badgeDynamicData && m.badgeDynamicData.subscriber, r = m.reply;
    const tags = { 'badge-info': months ? `subscriber/${months}` : '', badges: Object.entries(m.badges || {}).map(([k, v]) => `${k}/${v}`).join(','), bits: +m.bits || '',
      color: u.color || '', 'display-name': u.userDisplayName || login, emotes: Object.entries(emotes).map(([id, at]) => `${id}:${at.join(',')}`).join('/'),
      'first-msg': m.isFirstMsg ? '1' : '', id: m.id, login, 'tmi-sent-ts': +m.timestamp || '', 'user-id': u.userID || '',
      ...(m.sourceRoomID ? { 'source-room-id': m.sourceRoomID, 'room-id': own, 'source-badges': Object.entries(m.badges || {}).map(([k, v]) => `${k}/${v}`).join(','), 'source-badge-info': months ? `subscriber/${months}` : '' } : {}),
      ...(r && r.parentMsgId ? { 'reply-parent-msg-id': r.parentMsgId, 'reply-parent-user-login': r.parentUserLogin || '', 'reply-parent-display-name': r.parentDisplayName || '', 'reply-parent-msg-body': r.parentMessageBody || '' } : {}) };
    return '@' + Object.entries(tags).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${tag(v)}`).join(';') + ` :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${room} :${text.replace(/[\r\n]+/g, ' ')}`;
  };
  return msgs.map(line).filter(Boolean);
}

// badgesAgent's part: the channel's badges (subs, bits), and Twitch's own when asked for (global: the same for every
// chat, so ALL keeps them once), by set and version. -> { twitch: { own: { '<set>/<version>': { url, title } }, global?: { … } } } or null
async function twitchBadges(name, global){
  const fields = '{ setID version title imageURL(size: DOUBLE) }';
  const query = `query { ${global ? `badges ${fields} ` : ''}user(login: ${JSON.stringify(decodeURIComponent(name).toLowerCase())}) { broadcastBadges ${fields} } }`;
  const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json();
  const d = (r && r.data) || {}, byKey = list => { const out = {}; (list || []).forEach(b => { if (b && b.setID && /^https:\/\//.test(b.imageURL || '')) out[b.setID + '/' + b.version] = { url: b.imageURL, title: b.title || '' }; }); return out; };
  const own = byKey(d.user && d.user.broadcastBadges), all = global ? byKey(d.badges) : null;
  return Object.keys(own).length || (all && Object.keys(all).length) ? { twitch: { own, ...(all ? { global: all } : {}) } } : null;
}

// modesAgent's part: chatSettings, and you there (with the page's login)
async function twitchModes({ name, cookie }){
  if (!name) return null;
  const login = decodeURIComponent(name).toLowerCase(), tok = cookie('auth-token');
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

// Its chat's commands, as its own / list has them (its getCommands, asked for every level as an editor: each says its
// own level). -> [{ name, args: [{ name, required }], description, level (0 viewer, 1 VIP, 2 moderator, 3 streamer),
// editor }], or null (not there yet, or Twitch changed)
function twCommandsAgent(){
  const box = document.querySelector('[data-a-target="chat-input"]'); if (!box) return null;
  const fk = Object.keys(box).find(k => k.startsWith('__reactFiber')); if (!fk) return null;
  let root = box[fk]; while (root.return) root = root.return;
  let get = null; const stack = [root]; let n = 0;
  while (stack.length && !get && n < 300000){ const f = stack.pop(); n++; const p = f && f.memoizedProps; if (p && typeof p.getCommands === 'function') get = p.getCommands; if (f && f.sibling) stack.push(f.sibling); if (f && f.child) stack.push(f.child); }
  if (!get) return null;
  try {
    const all = get(3, { isEditor: true, hasPermissions: { has: () => true } });
    return Array.isArray(all) ? all.map(c => ({ name: String(c && c.name || ''), args: (c && Array.isArray(c.commandArgs) ? c.commandArgs : []).map(x => ({ name: String(x && x.name || ''), required: !!(x && x.isRequired) })),
      description: String(c && c.description || ''), level: +(c && c.permissionLevel) || 0, editor: !!(c && c.allowEditorUsage) })) : null;
  } catch (e) { return null; }
}

// The hype train already running in its channel (its news only comes as it changes), as Twitch's GraphQL says it ->
// its execution ({ id, expiresAt, endedAt, isGoldenKappaTrain, progress }) or null
async function hypeAgent(nameAs){
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];
  if (!name) return null;
  try {
    const query = `query { user(login: ${JSON.stringify(name)}) { channel { hypeTrain { execution { id startedAt expiresAt endedAt isGoldenKappaTrain progress { goal progression total level { value goal } } } } } } }`;
    const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json();
    const x = r && r.data && r.data.user && r.data.user.channel && r.data.user.channel.hypeTrain && r.data.user.channel.hypeTrain.execution;
    return x && !x.endedAt ? x : null;
  } catch (e) { return null; }
}

// The channels a shared chat's messages come from (Twitch's Stream Together), by their ids, as Twitch's GraphQL says
// them -> [{ id, login, name, pic, color }] (one it doesn't know: left out), or null (no answer)
async function channelsAgent(ids){
  try {
    const query = `query { users(ids: ${JSON.stringify(ids)}) { id login displayName profileImageURL(width: 50) primaryColorHex } }`;
    const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json();
    const users = r && r.data && r.data.users;
    return Array.isArray(users) ? users.filter(u => u && u.id).map(u => ({ id: String(u.id), login: String(u.login || ''), name: String(u.displayName || u.login || ''), pic: String(u.profileImageURL || ''), color: /^[0-9a-f]{6}$/i.test(u.primaryColorHex || '') ? '#' + u.primaryColorHex : '' })) : null;
  } catch (e) { return null; }
}

// Its channel's id (Twitch's room id, which a reward redeemed names), once as ALL starts reading the chat. -> '<id>',
// or null (unreadable)
async function twRoomAgent(nameAs){
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];   // (nameAs: the tests')
  if (!name) return null;
  try {
    const query = `query { user(login: ${JSON.stringify(decodeURIComponent(name).toLowerCase())}) { id } }`;
    const r = await (await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })).json();
    const id = String((r && r.data && r.data.user && r.data.user.id) || '');
    return /^\d+$/.test(id) ? id : null;
  } catch (e) { return null; }
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

// heldAgent's part (in-site/mod.js): AutoMod's card in its chat for the held message with that id: the widest box around
// <div id="<id>" class="message"> with AutoMod's one line in it and no chat line of anyone's. -> it, or null
function twitchHeldCard(id){
  let card = null;
  const msg = [...document.querySelectorAll('[id]')].find(el => el.id === id);
  const one = el => el.querySelectorAll('[data-a-user="automod"]').length === 1 && !el.querySelector('.chat-line__message');
  for (let el = msg; el && el !== document.body; el = el.parentElement){ if (one(el)) card = el; else if (card) break; }
  return card;
}

export { channelsAgent, hypeAgent, twCommandsAgent, twitchBadges, twitchHeldCard, twitchModes, twitchPins,
  twitchShown, twitchTap, twReplyAt, twReplyPress, twRoomAgent };
