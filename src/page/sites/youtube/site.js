import { Site } from '../adapter.js';
import { youtubeFeed } from './feed.js';
import { youtubeEmote } from './in-site/emotes.js';
import { youtubeHeldCard, youtubeModes, youtubePins, youtubeShown, youtubeTap, ytLookAgent } from './in-site/feed.js';
import { youtubeSignedOut } from './in-site/signed-out.js';

// YouTube, as the rest of the page sees it (the same shape as kick.js, which says more).
// YouTube's channel ids are "yt:@handle", "yt:c:UC…" (a channel id) or "yt:v:VIDEOID" (a specific video). A
// channel's stream and chat need its live video's id (vid), which the app looks up when needed.

// Turns a YouTube watch page into a bare player that fills the window.
const YT_PLAYERS = '#movie_player, ytd-reel-video-renderer[is-active] #shorts-player';
const YT_CSS = `
html, body { overflow: hidden !important; background: #000 !important; }
ytd-app { visibility: hidden !important; }
ytd-app, ytd-page-manager, ytd-watch-flexy, ytd-shorts, #columns, #primary, #primary-inner, #player,
#player-container-outer, #player-container-inner, #player-container, #ytd-player, #container.ytd-player,
#full-bleed-container, #player-full-bleed-container, #player-theater-container, ytd-reel-video-renderer,
#shorts-container, #shorts-inner-container, ytd-player, #player-wide-container {
  contain: none !important; transform: none !important; filter: none !important; will-change: auto !important; }
${YT_PLAYERS} {
  visibility: visible !important; position: fixed !important; inset: 0 !important;
  width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important;
  margin: 0 !important; border-radius: 0 !important; z-index: 2147483646 !important; background: #000 !important; }
${YT_PLAYERS.split(', ').map(x => x + ' .html5-video-container').join(', ')} { width: 100% !important; height: 100% !important; }
${YT_PLAYERS.split(', ').map(x => x + ' video.html5-main-video').join(', ')} {
  width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; object-fit: contain !important; }
.ytp-chrome-bottom { left: 12px !important; right: 12px !important; width: auto !important; }
.ytp-miniplayer-button, .ytp-size-button, .ytp-fullscreen-button { display: none !important; }
/* Two of YouTube's questions keep the video paused until answered (the cookie question, "Continue watching?"):
   show those over the player. Its other pop-ups (offers, promos) stay hidden. */
ytd-consent-bump-v2-lightbox, ytd-popup-container tp-yt-paper-dialog:has(yt-confirm-dialog-renderer) { visibility: visible !important; }
ytd-popup-container, ytd-consent-bump-v2-lightbox { position: relative !important; z-index: 2147483647 !important; }
`;
// Nudges YouTube's player to re-measure itself after the CSS above resizes it.
const YT_FIT_JS = `(function(){
  const kick = () => window.dispatchEvent(new Event('resize'));
  if (!window.__kmvYt){
    window.__kmvYt = true;
    window.addEventListener('yt-navigate-finish', () => [100, 600, 1500].forEach(t => setTimeout(kick, t)));
  }
  [0, 300, 1000, 2500, 5000].forEach(t => setTimeout(kick, t));
})()`;

// Its chat's name colours (its live chat page's, read 2026-10-30): a viewer, a moderator (the shield's blue: YouTube
// still shows some an older blue, #5e84f1, which its page then says), a member, and the streamer on a pill
const YT_NAMES = {
  dark: { viewer: 'rgba(255,255,255,0.7)', mod: '#3ea6ff', member: '#2ba640', owner: '#111111', ownerBg: '#ffd600' },
  light: { viewer: '#606060', mod: '#065fd4', member: '#107516', owner: '#000000', ownerBg: '#fbc02d' }
};

const youtube = new Site({   // (what each slot is for, and its default: sites/adapter.js)
  id: 'youtube',
  mentions: true,        // mention alerts read its chat's connection (your handle, Settings › Mentions)
  screenMentions: false, // (only from its connection: its chat page's text isn't "name: message")
  mentionEnd: '(?![\\p{L}\\p{N}_-]|\\.[\\p{L}\\p{N}_])',   // a handle can have - and . in it ("@pear" isn't "@pear-x"; "@pear." is)
  threadedReplies: false,   // (no replies in its live chat: ALL replies with an @)
  timeoutCmd: null, banCmd: null, modRequest: null,   // (no chat commands: mod actions from its own tab)
  deleteMods: false,
  spamAlerts: false,
  isHost: () => false,   // (its chat's names aren't its handle: its owner badge says so)
  flagged: true,         // Settings › Flagged: messages held for review, to moderators (alerts/flagged.js)
  feedReaders: true,     // the alerts, chat over the stream and counts read its chat's connection (chat/chat-feed.js)
  emoteLists: false,
  pageCommands: false,
  held: { by: '', expires: false, yours: false, allow: 'Show', deny: 'Hide', denied: 'hidden' },   // (held for review)
  pasteHints: ['<code>youtube.com/@nightowl</code> or <code>@nightowl</code>: a YouTube channel\'s live stream',
    '<code>youtube.com/watch?v=…</code> or <code>youtu.be/…</code>: any YouTube video'],
  following: false,
  roundsFollowers: true,
  offlineChat: false,    // (its live chat is the live stream's)
  liveVideo: true,
  chatMax: 200,
  emotes: { none: 'YouTube\'s emoji are in its own chat box', paste: null },
  feed: youtubeFeed,   // its chat's data as ALL's messages (feed.js; chat/feed-parse.js)
  chat: { ownIcons: false, globalBadges: false, look: true, shared: false, modByLater: false, hypeTrains: false, modesAgain: true },
  // The scripts that run inside its chat page, its parts of them (see kick.js's inSite): in-site/feed.js, in-site/emotes.js, in-site/signed-out.js
  inSite: {
    tap: youtubeTap, pins: youtubePins, shown: youtubeShown, badges: null, modes: youtubeModes,   // (badges: its come with their pictures)
    icons: null, look: ytLookAgent, room: null, hypeTrain: null, channels: null, commands: null,
    reply: null, replyAt: null, replyPress: null, heldCard: youtubeHeldCard, signedOut: youtubeSignedOut,
    emote: { look: ['#ff3d3d', '#fff', 'YouTube emoji'], find: youtubeEmote, host: null, path: null, pics: '([\\w-]+\\.)?ggpht\\.com\\/|www\\.gstatic\\.com\\/' }   // (host: its emoji aren't read in a message's words)
  },
  // How in-site/send.js sends in its chat (see kick.js's send): the <button> inside its #send-button (its
  // yt-button-renderer wrapper comes first in the page and a click on that does nothing), off until it has seen the
  // text, and it may only take a real press
  send: { button: '#send-button', inner: ['button', 'yt-button-renderer'], waitEnabled: true, realPress: true },
  likes: true,
  chatCommands: [],   // (its live chat has no commands)
  liveCommands: null,
  // A name in ALL (see kick.js): YouTube colours a name by who they are, not by them. As its chat page draws them (look:
  // its inSite.look, in-site/feed.js ytLookAgent), when it's in the same light or dark as the app, else its usual colours
  nameStyle(m, { light, look } = {}){
    const c = { ...(light ? YT_NAMES.light : YT_NAMES.dark), ...(look && !look.dark === !!light ? look.names : {}) };
    const role = (m.badges || []).find(b => /^(host|mod|sub)$/.test(b));
    return role === 'host' ? { color: c.owner, bg: c.ownerBg } : { color: role === 'mod' ? c.mod : role === 'sub' ? c.member : c.viewer };
  },
  quality: { siteMax: null },   // its stream's quality can be set (windows/quality.js); by itself it goes as high as the stream
  // your handle: letters, numbers, _, - and . (its chat names people by their handle: @name); its login doesn't say whose
  me: { setting: 'myYouTube', valid: /^[\p{L}\p{N}_.-]{3,30}$/u, at: true, named: false, word: 'handle' },
  login: { fromPages: false, firefox: true, unfollow: false },   // (Google blocks signing in inside the app)
  colors: { dot: '#ff3d3d', brand: '#ff3030' },
  shoutouts: null,
  idFor: name => 'yt:@' + name,
  // "yt:name", "youtube:@name" or just "@name"
  fromText(raw){ const m = raw.match(/^(?:yt|youtube)\s*:\s*@?([\w.\-]{2,100})$/i) || raw.match(/^@([\w.\-]{2,100})$/); return m ? { channel: 'yt:@' + m[1].toLowerCase(), only: null } : undefined; },
  handle: ch => ch.slice(3),
  label(ch){ const r = ch.slice(3); return /^(v|c):/.test(r) ? (r[0] === 'v' ? 'YouTube video' : 'YouTube channel') : r; },
  // A channel or video id takes the name YouTube gives it; an "@handle" is already its name.
  namedBySite: ch => /^yt:(v|c):/.test(ch),
  fromUrl(host, parts, u){
    if (host === 'youtu.be' && /^[\w-]{11}$/.test(parts[0] || '')) return { channel: 'yt:v:' + parts[0], only: null };
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return undefined;
    const v = u.searchParams.get('v');
    if (parts[0] === 'live_chat' && v) return /^[\w-]{11}$/.test(v) ? { channel: 'yt:v:' + v, only: 'chat' } : null;
    if (parts[0] === 'watch' && /^[\w-]{11}$/.test(v || '')) return { channel: 'yt:v:' + v, only: null };
    if (['live', 'shorts', 'embed', 'v'].includes(parts[0]) && /^[\w-]{11}$/.test(parts[1] || '')) return { channel: 'yt:v:' + parts[1], only: null };
    if (parts[0] && parts[0].startsWith('@')) return /^@[\w.\-]{1,100}$/.test(parts[0]) ? { channel: 'yt:' + parts[0].toLowerCase(), only: null } : null;
    if (parts[0] === 'channel' && /^UC[\w-]{10,40}$/.test(parts[1] || '')) return { channel: 'yt:c:' + parts[1], only: null };
    return null;
  },
  // YouTube blocks its embedded player inside apps (error 152-4), so streams load the normal watch page and
  // playerCss trims it down to just the player.
  streamUrl: (ch, muted, vid) => vid ? `https://www.youtube.com/watch?v=${vid}` : null,
  chatUrl: (ch, vid) => vid ? `https://www.youtube.com/live_chat?is_popout=1&v=${vid}` : null,
  pageUrl(ch, kind, vid){
    if (kind === 'chat' && vid) return youtube.chatUrl(ch, vid);
    if (vid) return `https://www.youtube.com/watch?v=${vid}`;
    return ch.startsWith('yt:c:') ? `https://www.youtube.com/channel/${ch.slice(5)}/live` : `https://www.youtube.com/${ch.slice(3)}/live`;
  },
  profileUrl: ch => ch.startsWith('yt:c:') ? 'https://www.youtube.com/channel/' + ch.slice(5) : 'https://www.youtube.com/' + ch.slice(3),
  modUrl: () => null,    // no moderator dashboard for each channel
  chatCss: null,
  // Its chat box's empty text (Settings > Chat > Channel name in chat boxes, in-site/chat-name.js): the box, the
  // element showing the text, the box's attributes with the same text, and the site's usual text (only that one
  // changes: a box that says something else, like followers-only or slow mode, says why you can't chat).
  // (Signed out there's no box, only "Sign in to chat".)
  // Its chat's message list and its own "back to the newest messages" button (in-site/stick-bottom.js keeps the chat at
  // its newest messages; with no list here it uses the biggest box that scrolls).
  chatScroll: { list: 'yt-live-chat-item-list-renderer #item-scroller', resume: 'yt-live-chat-item-list-renderer #show-more' },
  // Someone supporting the stream (Settings > Support, in-site/mentions.js): how its chat shows it. { kind, re }
  // reads a row of the site's own (not someone's message) by its text, with the name (who), the number (n) and who
  // got a gift (to); { kind, row, who, n } an element it draws for it; { kind, re, msg: true } words in a message.
  // kind: kicks, bits, gifts (to the community), gift (to someone), sub, superchat, member. (YouTube has no raids.)
  support: { finds: [
    { kind: 'superchat', row: 'yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer', who: '#author-name', n: '#purchase-amount, #purchase-amount-chip' },
    { kind: 'gifts', unit: 'memberships', row: 'ytd-sponsorships-live-chat-gift-purchase-announcement-renderer', who: '#author-name', re: 'gifted (?<n>\\d+)' },
    { kind: 'member', row: 'yt-live-chat-membership-item-renderer', who: '#author-name' }
  ] },
  chatBox: { box: 'yt-live-chat-text-input-field-renderer #input', hint: 'yt-live-chat-text-input-field-renderer #label', attrs: ['aria-label'], says: '^(chat|say something)(\u2026|\\.\\.\\.)?$' },
  stuckJs: null,   // a stream that comes back is a new video, which resolveYt finds (see kick.js)
  // For its stream windows: the watch page trimmed to the player
  playerCss: YT_CSS,
  playerFitJs: YT_FIT_JS,
  raidTarget: () => null
});

export { youtube };
