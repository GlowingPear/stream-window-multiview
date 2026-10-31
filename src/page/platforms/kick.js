// Kick, as the rest of the page sees it. Twitch (twitch.js) and YouTube (youtube.js) have the same shape, and
// platforms.js picks the one for a channel (platform(ch)), so the page asks the site's module instead of
// checking which site it is. Nothing here touches the page (the unit tests load it on its own).
// Kick's channel ids are the channel's name: "nightowl".

// kick.com/<name> pages that aren't a channel
const NOT_CHANNELS = new Set(['login', 'signup', 'register', 'categories', 'category', 'browse', 'following', 'search', 'settings', 'dashboard',
  'subscriptions', 'messages', 'notifications', 'wallet', 'video', 'videos', 'clips', 'clip', 'terms-of-service', 'privacy-policy',
  'community-guidelines', 'dmca-policy', 'popout', 'api', 'auth', 'oauth', 'verify', 'stream', 'chatroom', 'help', 'about', 'careers', 'kick-creators', 'emotes']);

// Its chat's commands, for ALL's box (/ at the start: chat/all-chat.js), as twitch.js says them. As its chat's own list
// shows them (read in live chats 2026-10-31): its words, its order (by name), and who can use each (its commands' own
// minimumRole: viewer, moderator or broadcaster). Its timeout is in minutes. /poll, /prediction and /clip open Kick's own panel from ALL too
// (in-site/kick-commands.js); /user and /category, which open something in its own chat, are left out.
const KICK_COMMANDS = [
  { name: 'ban', args: '<username> [reason]', does: 'Ban a user from the chat', who: 'mod' },
  { name: 'clear', args: '', does: 'Clear the chat', who: 'mod' },
  { name: 'clip', args: '[duration] [title]', does: 'Create a clip', who: 'all' },
  { name: 'emoteonly', args: '<on_off>', does: 'Toggle emote only mode', who: 'mod' },
  { name: 'followonly', args: '<on_off> [minutes]', does: 'Toggle follow only mode', who: 'mod' },
  { name: 'kpp', args: '<on_off>', does: 'Toggle partner income', who: 'host' },
  { name: 'mod', args: '<username>', does: 'Add a moderator to the chat', who: 'host' },
  { name: 'multi', args: '<on_off>', does: 'Toggle multistream', who: 'host' },
  { name: 'og', args: '<username>', does: 'Add an OG to the chat', who: 'host' },
  { name: 'poll', args: '', does: 'Create a poll', who: 'mod' },
  { name: 'polldelete', args: '', does: 'Delete a poll', who: 'mod' },
  { name: 'prediction', args: '', does: 'Create a prediction', who: 'mod' },
  { name: 'raid', args: '[username]', does: 'Raid a channel', who: 'host' },
  { name: 'slow', args: '<on_off> [seconds]', does: 'Toggle slow mode', who: 'mod' },
  { name: 'subonly', args: '<on_off>', does: 'Toggle sub only mode', who: 'mod' },
  { name: 'timeout', args: '<username> <minutes> [reason]', does: 'Timeout a user from the chat', who: 'mod' },
  { name: 'title', args: '<title>', does: 'Set the title of the stream', who: 'mod' },
  { name: 'unban', args: '<username>', does: 'Unban a user from the chat', who: 'mod' },
  { name: 'unmod', args: '<username>', does: 'Remove a moderator from the chat', who: 'host' },
  { name: 'unog', args: '<username>', does: 'Remove an OG from the chat', who: 'host' },
  { name: 'unvip', args: '<username>', does: 'Remove a VIP from the chat', who: 'host' },
  { name: 'vip', args: '<username>', does: 'Add a VIP to the chat', who: 'host' }
];

const kick = {
  id: 'kick', name: 'Kick', letter: 'K',
  // What it can do in the app
  mentions: true,        // mention and reply alerts read its chat
  threadedReplies: true, // ALL replies with its own Reply on the message (chat/all-chat.js)
  // ALL's timeout and ban: Kick's chat commands (its timeouts are in minutes)
  timeoutCmd: (login, secs) => `/timeout ${login} ${Math.max(1, Math.round(secs / 60))}`,
  banCmd: login => `/ban ${login}`,
  deleteMods: true,      // ALL's Delete works on another mod's message, as in its own chat (not their timeout or ban)
  spamAlerts: true,      // spam alerts read its chat
  emoteLists: true,      // the app asks it for a channel's emotes (new emotes glow)
  pageCommands: true,    // /clip, /poll and /prediction in its chat (in-site/kick-commands.js)
  likes: false,          // a like button on its streams
  chatCommands: KICK_COMMANDS,   // its chat's commands, for ALL's / list (above)
  // A name in ALL (chat/all-chat.js) as its own chat shows it: m a message (feed-parse.js), light whether the app's
  // theme is light, look what the site's chat page says about its colours (YouTube's: youtube.js). -> { color, bg? }
  // (bg: a name on a pill), or null: ALL picks one. Kick shows the colour each account has, as it is
  nameStyle: m => /^#[0-9a-f]{6}$/i.test(m.color || '') ? { color: m.color } : null,
  lowQualityJs: null,     // a tab you're not watching: its lowest quality (windows/frames.js). Its embedded player has none to set from outside
  partition: 'persist:kick',   // its chats' storage (and a signed-in player's)
  // A bare name typed in the Channels box, and the name on the site
  idFor: name => name,
  handle: ch => ch,
  // What a channel is called until the site's own spelling is known
  label: ch => ch,
  // A link: { channel, only } ('chat' for a chat link), null for a page of the site that isn't a channel,
  // undefined for another site. host has no "www." or "m.", parts are the path's parts.
  fromUrl(host, parts){
    if (host !== 'kick.com' && !host.endsWith('.kick.com')) return undefined;
    const name = s => /^[A-Za-z0-9_-]{1,40}$/.test(s || '') ? s.toLowerCase() : null;   // anything else isn't a channel's name
    if (parts[0] === 'popout' && parts[1]) return name(parts[1]) ? { channel: name(parts[1]), only: 'chat' } : null;
    if (parts[0] && parts[1] === 'chatroom') return name(parts[0]) ? { channel: name(parts[0]), only: 'chat' } : null;
    if (parts[0]) return name(parts[0]) ? { channel: name(parts[0]), only: null } : null;
    return null;
  },
  streamUrl: (ch, muted) => `https://player.kick.com/${encodeURIComponent(ch)}?autoplay=true&muted=${muted ? 'true' : 'false'}`,
  chatUrl: ch => `https://kick.com/popout/${encodeURIComponent(ch)}/chat`,
  // Where "Open in the browser" goes for a stream or chat window, and the channel's own page (Streamer profiles)
  pageUrl: (ch, kind) => kind === 'chat' ? kick.chatUrl(ch) : `https://kick.com/${encodeURIComponent(ch)}`,
  profileUrl: ch => 'https://kick.com/' + ch,
  modUrl: ch => `https://dashboard.kick.com/moderator/${encodeURIComponent(ch)}`,
  // What its player shows (run in the player's page; windows/stuck.js): 'error' for its error page ("This embed
  // seems to be misconfigured", which never tries again), 'offline' for its offline screen (/<name>/offline, which
  // never goes back to the player when the channel is live again), else 'ok'.
  stuckJs: `(() => /This embed seems to be misconfigured/i.test(document.body ? document.body.innerText : '') ? 'error'
    : /^\\/[^/]+\\/offline\\/?$/i.test(location.pathname) ? 'offline' : 'ok')()`,
  // Its popout chat places a user's card (click a name) to the left of the chat, as on kick.com, which is off
  // the window's left edge here. Keep it inside the window.
  chatCss: `#user-identity { left: 0 !important; right: auto !important; width: min(356px, 100vw) !important;
  max-height: 100vh !important; overflow-y: auto !important; }`,
  // Its chat box's empty text (Settings > Chat > Channel name in chat boxes, in-site/chat-name.js): the box, the
  // element showing the text, the box's attributes with the same text, and the site's usual text (only that one
  // changes: a box that says something else, like followers-only or slow mode, says why you can't chat).
  // Its chat's message list and its own "back to the newest messages" button (in-site/stick-bottom.js keeps the chat at
  // its newest messages; with no list here it uses the biggest box that scrolls).
  chatScroll: { list: '#chatroom-messages', resume: null },   // scrolling down is enough: Kick follows again by itself
  // Someone supporting the stream (Settings > Support, in-site/mentions.js): how its chat shows it. { kind, re }
  // reads a row of the site's own (not someone's message) by its text, with the name (who), the number (n) and who
  // got a gift (to); { kind, row, who, n } an element it draws for it; { kind, re, msg: true, from? } words in a
  // message (from: only that sender's); { kind, re, page: true } a banner over the chat; anyRow: also a row that holds
  // a message (otherwise those are messages, never notices). kind: kicks, bits, gifts (to
  // the community), gift (to someone), sub, superchat, member, raid (n: the viewers it brought).
  // A notice can start with the time (when the chat shows times), and the KICK icon between "sent" and the number can
  // carry words of its own.
  support: { finds: [
    // a raid (Kick calls it hosting) shows as a banner at the top of the chat
    { kind: 'raid', page: true, re: '^(?<who>[A-Za-z0-9_]{2,30}) is (?:hosting|raiding)(?: your channel| the channel)? with (?<n>\\d[\\d,]*) viewers?' },
    { kind: 'gifts', re: '(?:^|\\s)(?<who>[A-Za-z0-9_]{2,30}) gifted (?<n>\\d[\\d,]*) subscriptions? to the community' },
    { kind: 'gift', re: '(?:^|\\s)(?<who>[A-Za-z0-9_]{2,30}) gifted (?:a|(?<n>\\d+)) subs? to (?<to>[A-Za-z0-9_]{2,30})' },
    { kind: 'kicks', re: '(?:^|\\s)(?<who>[A-Za-z0-9_]{2,30}) sent\\D{0,30}?(?<n>\\d[\\d,]*)(?!\\d)' },
    // KickBot, Kick's own bot, says each KICKs gift in the chat: "@name just gifted 100 KICKs!" (a message, read even
    // when the "sent" box isn't drawn; the two are one gift)
    { kind: 'kicks', msg: true, from: 'KickBot', re: '^@?(?<who>[A-Za-z0-9_]{2,30}) just gifted (?<n>\\d[\\d,]*) KICKs?\\b' },
    { kind: 'sub', re: '(?:^|\\s)(?<who>[A-Za-z0-9_]{2,30}) (?:just )?(?:re)?subscribed(?: for (?<n>\\d+) months?)?' },
    // a sub celebrated ("mossy_rock celebrates their subscription for 7 months!"): its box also holds their message, so
    // it's read in rows with a message too (anyRow), and only at the row's start, never from words in a message
    { kind: 'sub', anyRow: true, re: '^(?:\\d{1,2}:\\d{2}(?:\\s?[AP]M)?\\s+)?(?<who>[A-Za-z0-9_]{2,30}) celebrates? their subscription(?: for (?<n>\\d+) months?)?' }
  ] },
  chatBox: { box: '[data-testid="chat-input"]', hint: '[data-testid="chat-input"] ~ div', attrs: [], says: '^send a message$' },
  // A raid: the channel a stream or chat window's new address (a URL) is for, or null when it isn't a channel's
  // player, chat or page.
  raidTarget(kind, u){
    const host = u.hostname.replace(/^(www|m)\./, ''), parts = u.pathname.split('/').filter(Boolean).map(x => x.toLowerCase());
    let ch = null;
    if (kind === 'stream') ch = host === 'player.kick.com' && parts.length === 1 ? parts[0] : null;
    else if (host === 'kick.com'){
      if (parts[0] === 'popout' && parts[2] === 'chat') ch = parts[1];
      else if (parts.length === 1 || (parts.length === 2 && parts[1] === 'chatroom')) ch = parts[0];
    }
    if (ch && (!/^[a-z0-9_-]{3,25}$/.test(ch) || NOT_CHANNELS.has(ch))) ch = null;
    return ch;
  }
};

export { kick };
