import { Site } from '../adapter.js';
import { rumbleFeed } from './feed.js';
import { rumbleConsent, rumbleShown, rumbleTap } from './in-site/feed.js';

// Rumble, as the rest of the page sees it (the same shape as kick.js, which says more).
// Rumble's channel ids are "ru:name" (rumble.com/c/name), "ru:u:name" (rumble.com/user/name) or "ru:v:v35waq4" (one
// video, by its page's id: rumble.com/v35waq4-….html). Like YouTube, a live stream is a video of its own, looked up
// while the channel is live (liveVideo): its id here is "<embed id>.<chat id>" (its player is rumble.com/embed/<embed
// id>/, its chat rumble.com/chat/popup/<chat id>), which the app's main process finds (src/main/sites/rumble/).

// A live stream's id here ("<embed id>.<chat id>") as its two parts, or null
const vidParts = vid => { const m = /^(v[a-z0-9]+)\.(\d+)$/.exec(vid || ''); return m ? { embed: m[1], chat: m[2] } : null; };
const rumbleName = s => (/^[A-Za-z0-9_.-]{1,60}$/.test(s || '') ? s.toLowerCase() : null);
const pageOf = ch => (ch.startsWith('ru:u:') ? 'https://rumble.com/user/' + ch.slice(5) : ch.startsWith('ru:v:') ? `https://rumble.com/${ch.slice(5)}.html` : 'https://rumble.com/c/' + ch.slice(3));

const rumble = new Site({   // (what each slot is for, and its default: sites/adapter.js)
  id: 'rumble',
  mentions: true,        // mention alerts read its chat's connection (your name, Settings › Mentions)
  screenMentions: false, // (only from its connection)
  mentionEnd: '\\b',     // its chat's @names are letters, numbers and _
  threadedReplies: false,   // (no replies in its chat: ALL replies with an @)
  timeoutCmd: null, banCmd: null, modRequest: null,   // (moderating from its own chat)
  deleteMods: false,
  spamAlerts: true,      // spam alerts read its chat
  isHost: (ch, name) => !!name && !ch.startsWith('ru:v:') && String(name).toLowerCase() === ch.replace(/^ru:(u:)?/, ''),
  flagged: false,
  feedReaders: true,     // the alerts, chat over the stream and counts read its chat's connection (chat/chat-feed.js)
  emoteLists: false,
  pageCommands: false,
  held: null,
  pasteHints: ['<code>rumble.com/c/nightowl</code> or <code>ru:nightowl</code>: a Rumble channel\'s live stream',
    '<code>rumble.com/v…html</code>: a Rumble live stream or video'],
  following: false,
  roundsFollowers: false,
  offlineChat: false,    // (its chat is the live stream's)
  liveVideo: true,
  // (a video's id here is its page's: its player's and chat's ids are looked up, as for a channel)
  videoId: () => null,
  chatMax: 200,
  emotes: { none: 'Rumble\'s emotes are in its own chat box', paste: null },
  feed: rumbleFeed,   // its chat's data as ALL's messages (feed.js; chat/feed-parse.js)
  chat: { ownIcons: false, globalBadges: false, look: false, shared: false, modByLater: false, hypeTrains: false, modesAgain: false },
  // The scripts that run inside its chat page, its parts of them (see kick.js's inSite): in-site/feed.js
  inSite: {
    tap: rumbleTap, pins: null, shown: rumbleShown, badges: null, modes: null,   // (its pin comes as its chat opens; its badges come with their pictures)
    icons: null, look: null, room: null, hypeTrain: null, channels: null, commands: null,
    reply: null, replyAt: null, replyPress: null, heldCard: null, signedOut: null,
    emote: { look: ['#85c742', '#061726', 'Rumble emote'], find: (img, u) => (u.hostname === 'hugh.cdn.rumble.cloud' && img.classList && img.classList.contains('chat-history--emote') ? { big: u.href } : null),
      host: null, path: null, pics: 'hugh\\.cdn\\.rumble\\.cloud\\/' }   // (host: its emotes aren't read in a message's words)
  },
  // Its cookie question, answered "Reject all" in its stream and chat pages (in-site/feed.js rumbleConsent)
  cookieJs: `(${rumbleConsent})()`,
  // How in-site/send.js sends in its chat (see kick.js's send): its send button, off until it has seen the text
  send: { button: '#chat-message-form .chat--send', inner: null, waitEnabled: true, realPress: false },
  likes: false,
  chatCommands: [],
  liveCommands: null,
  // A name in ALL (see kick.js): Rumble shows the colour each account has
  nameStyle: m => (/^#[0-9a-f]{6}$/i.test(m.color || '') ? { color: m.color } : null),
  quality: null,
  // your username: its chat names people "@name"; its login doesn't say whose
  me: { setting: 'myRumble', valid: /^[A-Za-z0-9_]{2,40}$/, at: true, named: false, word: 'username' },
  login: { fromPages: false, firefox: false, unfollow: false },
  colors: { dot: '#85c742', brand: '#85c742' },
  shoutouts: null,
  idFor: name => 'ru:' + name.replace(/^@/, '').toLowerCase(),
  // "ru:name", "rumble:name"
  fromText(raw){ const m = raw.match(/^(?:ru|rumble)\s*:\s*@?([A-Za-z0-9_.-]{1,60})$/i); return m ? { channel: 'ru:' + m[1].toLowerCase(), only: null } : undefined; },
  handle: ch => ch.replace(/^ru:(u:|v:)?/, ''),
  label: ch => (ch.startsWith('ru:v:') ? 'Rumble video' : ch.replace(/^ru:(u:)?/, '')),
  // A video takes the name Rumble gives it; a channel's name is already its name
  namedBySite: ch => ch.startsWith('ru:v:'),
  fromUrl(host, parts){
    if (host !== 'rumble.com' && !host.endsWith('.rumble.com')) return undefined;
    if (parts[0] === 'c' && parts[1]) return rumbleName(parts[1]) ? { channel: 'ru:' + rumbleName(parts[1]), only: null } : null;
    if (parts[0] === 'user' && parts[1]) return rumbleName(parts[1]) ? { channel: 'ru:u:' + rumbleName(parts[1]), only: null } : null;
    const v = /^(v[a-z0-9]{3,12})(?:-[^/]*)?\.html$/i.exec(parts[0] || '');
    if (v && parts.length === 1) return { channel: 'ru:v:' + v[1].toLowerCase(), only: null };
    return null;   // (its embed and chat addresses are by ids its channels' pages don't show)
  },
  streamUrl: (ch, muted, vid) => { const v = vidParts(vid); return v ? `https://rumble.com/embed/${v.embed}/?pub=4&autoplay=2` : null; },
  chatUrl: (ch, vid) => { const v = vidParts(vid); return v ? `https://rumble.com/chat/popup/${v.chat}` : null; },
  pageUrl: (ch, kind, vid) => (kind === 'chat' && vidParts(vid) ? rumble.chatUrl(ch, vid) : ch.startsWith('ru:v:') ? pageOf(ch) : pageOf(ch) + '/livestreams'),
  profileUrl: pageOf,
  modUrl: () => null,
  chatCss: null,
  // its chat's message list (in-site/stick-bottom.js)
  chatScroll: { list: '#chat-history-list', resume: null },
  // Someone supporting the stream (Settings › Support): a rant, read from its connection (feed.js)
  support: null,
  chatBox: { box: '#chat-message-text-input', hint: '#chat-message-text-input', attrs: ['placeholder'], says: '^your message here!?$' },
  stuckJs: null,   // a stream that comes back is a new video, which the live check finds (see kick.js)
  playerCss: null,
  playerFitJs: null,
  raidTarget: () => null
});

export { rumble };
