import { Site } from '../adapter.js';
import { rumbleFeed } from './feed.js';
import { rumbleConsent, rumbleModAction, rumbleShown, rumbleSignedOut, rumbleTap } from './in-site/feed.js';

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
  timeoutCmd: null, banCmd: null, modRequest: null,   // (ALL's mod actions are its chat page's own requests: inSite.modAction)
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
  // ALL's emote picker: its live chat's emotes (the channel's and Rumble's), sent as ":name:"
  emotes: { none: null, paste: null },
  feed: rumbleFeed,   // its chat's data as ALL's messages (feed.js; chat/feed-parse.js)
  chat: { ownIcons: false, globalBadges: false, look: false, shared: false, modByLater: false, hypeTrains: false, modesAgain: false },
  // The scripts that run inside its chat page, its parts of them (see kick.js's inSite): in-site/feed.js
  inSite: {
    tap: rumbleTap, pins: null, shown: rumbleShown, badges: null, modes: null,   // (its pin comes as its chat opens; its badges come with their pictures)
    icons: null, look: null, room: null, hypeTrain: null, channels: null, commands: null,
    reply: null, replyAt: null, replyPress: null, heldCard: null, signedOut: rumbleSignedOut, modAction: rumbleModAction,
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
  quality: { siteMax: null },   // its stream's quality can be set (windows/quality.js: its player is hls.js); by itself it goes as high as the stream
  // your username: its chat names people "@name"; its login doesn't say whose
  me: { setting: 'myRumble', valid: /^[A-Za-z0-9_]{2,40}$/, at: true, named: true, word: 'username' },
  login: { fromPages: false, firefox: false, unfollow: false },
  colors: { dot: '#85c742', brand: '#85c742' },
  shoutouts: null,
  idFor: name => 'ru:' + name.replace(/^@/, '').toLowerCase(),
  // "ru:name", "rumble:name"
  fromText(raw){ const m = raw.match(/^(?:ru|rumble)\s*:\s*@?([A-Za-z0-9_.-]{1,60})$/i); return m ? { channel: 'ru:' + m[1].toLowerCase(), only: null } : undefined; },
  handle: ch => ch.replace(/^ru:(u:|v:)?/, ''),
  label: ch => (ch.startsWith('ru:v:') ? 'Rumble video' : ch.replace(/^ru:(u:)?/, '')),
  // one person can have a user page and channels of their own, live on either: which kind it is, in words
  idText: ch => (ch.startsWith('ru:u:') ? 'User · ' + ch.slice(5) : ch.startsWith('ru:v:') ? 'Video · ' + ch.slice(5) : 'Channel · ' + ch.slice(3)),
  // A video, and a channel whose address is its number (rumble.com/c/c-7777674: one without its own address), take the
  // name Rumble gives them; another channel's name is already its name
  namedBySite: ch => /^ru:(v:|c-\d+$)/.test(ch),
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
  // Its chat's pop-ups, kept inside the chat window:
  // - the $ (rant) panel opens under the message box, and the two scrolled together, so the scrollbar narrowed the
  //   box's row and moved the send button: only the panel scrolls now
  // - the gift and subscribe panels: a long channel name (one word) pushed their close button past the right edge,
  //   and the chat's pinned and sponsor cards covered them
  // - its emoji picker is 394px wide and slid the whole chat sideways: as wide as the chat, with fewer columns
  // - in a narrow chat the top emotes next to the send button give way to it
  chatCss: `.chat-form-overflow-wrapper { display: flex !important; flex-direction: column !important; overflow: hidden !important; }
.chat-form-overflow-wrapper > * { flex: none; }
.chat-form-overflow-wrapper > #chat-rant-form { flex: 0 1 auto; min-height: 0; overflow-y: auto; }
.chat-form-overflow-wrapper > form.absolute, .chat-form-overflow-wrapper > .chat-subscribe-form { z-index: 3; }
.flex-1:has(> .chat--subscribe-header--image), .chat--subscribe-header--image ~ * { min-width: 0; overflow-wrap: anywhere; }
.cxm:has(> emoji-picker) { left: 4px !important; right: auto !important; max-width: calc(100vw - 8px); }
.cxm > emoji-picker { max-width: 100%; }
@media (max-width: 360px) { emoji-picker { --emote-num-columns: 5 !important; } }
@media (max-width: 328px) { emoji-picker { --num-columns: 7 !important; } }
@media (max-width: 304px) { emoji-picker { --emote-num-columns: 4 !important; } }
@media (max-width: 290px) { emoji-picker { --num-columns: 6 !important; } }
@media (max-width: 252px) { emoji-picker { --emote-num-columns: 3 !important; --num-columns: 5 !important; } }
.chat--rant-row-top-emotes { min-width: 0; flex-wrap: wrap; justify-content: flex-end; height: 36px; overflow: hidden; }`,
  // its chat's message list (in-site/stick-bottom.js)
  chatScroll: { list: '#chat-history-list', resume: null },
  // Someone supporting the stream (Settings › Support): a rant, read from its connection (feed.js)
  support: null,
  chatBox: { box: '#chat-message-text-input', hint: '#chat-message-text-input', attrs: ['placeholder'], says: '^your message here!?$' },
  stuckJs: null,   // a stream that comes back is a new video, which the live check finds (see kick.js)
  // Its player waits on its big play button for a real press (a script's play() or click it ignores): where that is,
  // the player's middle, while its video hasn't started (nothing loaded yet), else null
  startJs: `(() => { const v = document.querySelector('video');
    return v && v.paused && v.readyState === 0 && !v.currentTime ? { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) } : null; })()`,
  playerCss: null,
  playerFitJs: null,
  // A raid: its chat sends you on to the raided live stream's page (rumble.com/v….html), a video of its own
  raidTarget(kind, u){
    const host = u.hostname.replace(/^(www|m)\./, ''), m = /^\/(v[a-z0-9]{3,12})(?:-[^/]*)?\.html$/i.exec(u.pathname);
    return host === 'rumble.com' && m ? 'ru:v:' + m[1].toLowerCase() : null;
  }
});

export { rumble };
