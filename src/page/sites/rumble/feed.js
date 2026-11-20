import { badgeKinds } from '../../chat/feed-badges.js';

/* ---- Rumble's chat data (its in-site/feed tap) as ALL's messages (chat/feed-parse.js says what a message is) ----
   Its tap passes on each thing on its own, with what ALL needs to read it (the sender, their badges' pictures, the
   message's emotes' pictures): { t: 'message' | 'rant' | 'pin' | 'shown', m, u, pics, emotes | parts },
   { t: 'delete', id }, { t: 'mute', id } (a person's id) or { t: 'unpin' }. Nothing here touches the page (the unit tests
   load it on its own). */

// Its badges' names (a person's badges in its chat) as ALL's: its subscribers (Rumble's own and Locals'), its staff
const RUMBLE_BADGES = { recurring_subscription: 'subscriber', locals_supporter: 'subscriber', locals: 'subscriber', admin: 'admin', moderator: 'moderator',
  verified: 'verified', premium: '', whale: '' };
const rumbleBadges = list => badgeKinds((list || []).map(b => (b in RUMBLE_BADGES ? RUMBLE_BADGES[b] : b)));
// A message's words, with each of its emotes (":name:", the chat's list: emotes { ':name:': url }) as a picture
function rumbleParts(text, emotes = {}){
  const parts = [];
  String(text || '').split(/(:[\w+-]+:)/).forEach(x => {
    if (!x) return;
    if (emotes[x]) parts.push({ emote: emotes[x], name: x.slice(1, -1) });
    else if (parts.length && parts[parts.length - 1].text !== undefined) parts[parts.length - 1].text += x;
    else parts.push({ text: x });
  });
  return parts;
}
// A rant's amount (its price in cents) as words: "$5", "$2.50"
const dollars = cents => '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

function rumbleMsg(r){
  const m = r.m || {}, u = r.u || {};
  if (!m.id) return null;
  const sender = u.username || '';
  return { site: 'rumble', kind: 'message', id: String(m.id), t: Date.parse(m.time) || Date.now(), sender, login: sender.toLowerCase(),
    color: /^#[0-9a-f]{6}$/i.test(u.color || '') ? u.color : '', userId: u.id ? String(u.id) : '', badges: rumbleBadges(u.badges),
    pics: Array.isArray(r.pics) ? r.pics.filter(p => p && p.url) : [], parts: Array.isArray(r.parts) ? r.parts : rumbleParts(m.text, r.emotes || {}) };
}
function parseRumble(r){
  if (!r || typeof r !== 'object') return null;
  if (r.t === 'delete') return r.id ? { site: 'rumble', kind: 'delete', target: String(r.id), t: Date.now() } : null;
  // someone muted (Rumble's timeout and ban): their messages go
  if (r.t === 'mute') return r.id ? { site: 'rumble', kind: 'clear', userId: String(r.id), t: Date.now() } : null;
  if (r.t === 'unpin') return { site: 'rumble', kind: 'unpin', t: Date.now() };
  const msg = rumbleMsg(r);
  if (!msg) return null;
  if (r.t === 'pin') return { site: 'rumble', kind: 'pin', id: msg.id, msg, t: Date.now() };
  // a rant: a message paid for, shown at the top of its chat for a while (as a Super Chat: Settings › Support)
  const cents = r.m.rant && +r.m.rant.cents;
  if (r.t === 'rant' && cents > 0){
    const amount = dollars(cents), who = msg.sender || 'Someone';
    return { ...msg, kind: 'event', event: 'rant', amount, text: `${who} sent a Rant · ${amount}`,
      summary: [{ strong: who }, { text: ' Rant ' }, { strong: amount }], support: { kind: 'superchat', who, n: cents / 100, amt: amount } };
  }
  return r.t === 'message' || r.t === 'shown' || r.t === 'rant' ? msg : null;   // (a rant without its amount: a message)
}

// What chat/feed-parse.js asks a site's reader (sites/twitch/feed.js says what each is). Its tap's kinds are its
// events' types (a message batch with a rant in it: 'messages:rant')
const rumbleFeed = {
  parse: parseRumble,
  known: { messages: 'messages', 'messages:rant': 'messages with a Rant (a paid message)', delete_messages: 'messages deleted', mute_users: 'someone muted (their messages go)',
    pin_message: 'a pin', unpin_message: 'a pin taken down', init: 'the chat as it opens (its pin; its badges’ pictures)' },
  ignored: { livestream_started: 'the stream starting', livestream_playable: 'the stream ready to play', livestream_stopped: 'the stream stopping',
    livestream_ended: 'the stream ending', host_ad_read: 'the streamer’s sponsor note', qr_code_render: 'a QR code over the player', live_gate: 'the stream’s paywall countdown',
    locals_supporter: 'your own Locals support', wallet_transaction_initiated: 'your own wallet', wallet_transaction_completed: 'your own wallet',
    subscribers_only: 'the chat’s subscribers-only mode' },
  ignoredMore: () => '',
  kindOf: null,
  rumbleParts, rumbleBadges
};

export { rumbleFeed };
