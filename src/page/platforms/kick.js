// Kick, as the rest of the page sees it. Twitch (twitch.js) and YouTube (youtube.js) have the same shape, and
// platforms.js picks the one for a channel (platform(ch)), so the page asks the site's module instead of
// checking which site it is. Nothing here touches the page (the unit tests load it on its own).
// Kick's channel ids are the channel's name: "nightowl".

// kick.com/<name> pages that aren't a channel
const NOT_CHANNELS = new Set(['login', 'signup', 'register', 'categories', 'category', 'browse', 'following', 'search', 'settings', 'dashboard',
  'subscriptions', 'messages', 'notifications', 'wallet', 'video', 'videos', 'clips', 'clip', 'terms-of-service', 'privacy-policy',
  'community-guidelines', 'dmca-policy', 'popout', 'api', 'auth', 'oauth', 'verify', 'stream', 'chatroom', 'help', 'about', 'careers', 'kick-creators', 'emotes']);

const kick = {
  id: 'kick', name: 'Kick', letter: 'K',
  // What it can do in the app
  mentions: true,        // mention and reply alerts read its chat
  spamAlerts: true,      // spam alerts read its chat
  emoteLists: true,      // the app asks it for a channel's emotes (new emotes glow)
  pageCommands: true,    // /clip, /poll and /prediction in its chat (in-site/kick-commands.js)
  likes: false,          // a like button on its streams
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
    if (parts[0] === 'popout' && parts[1]) return { channel: parts[1].toLowerCase(), only: 'chat' };
    if (parts[0] && parts[1] === 'chatroom') return { channel: parts[0].toLowerCase(), only: 'chat' };
    if (parts[0]) return { channel: parts[0].toLowerCase(), only: null };
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
