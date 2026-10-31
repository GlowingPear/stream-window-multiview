// Twitch, as the rest of the page sees it (the same shape as kick.js, which says more).
// Twitch's channel ids are "tw:" and the channel's name: "tw:nightowl".

// twitch.tv/<name> pages that aren't a channel
const NOT_CHANNELS = ['directory', 'videos', 'settings', 'search', 'downloads', 'p', 'subscriptions', 'inventory', 'wallet', 'drops'];

/* ---- A name's colour as Twitch's own chat shows it (its web chat's code, read 2026-10-30) ----
   Someone who never picked one gets one of these 15, picked at random by each Twitch page (two people can see two
   different ones): here it's picked from the name, so it stays the same. Then "Readable Colors" (on unless you turn it
   off): a colour too dark on its dark background (or too light on its light one) is made lighter (darker) in steps of
   10% of its Lab lightness until it reads (contrast 4.5), one that's nearly black is grey. Its conversions are copied
   as they are, rounding included, so the colours come out the same. */
const TW_COLORS = ['#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50', '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E', '#5F9EA0',
  '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'];
const TW_BG = { dark: [15, 14, 17], light: [250, 249, 250] };
const twDefault = login => { let h = 0; for (const c of String(login || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TW_COLORS[h % TW_COLORS.length]; };
const lum = rgb => { const [r, g, b] = rgb.map(x => (x /= 255) <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return x > y ? x / y : y / x; };
function rgbToLab(rgb){
  const [r, g, b] = rgb.map(x => (x /= 255) > 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) * 100 / 95.047, y = (0.2126 * r + 0.7152 * g + 0.0722 * b), z = (0.0193 * r + 0.1192 * g + 0.9505 * b) * 100 / 108.883;
  const f = t => t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function labToRgb([l, a, b]){
  const yy = l <= 8 ? 100 * l / 903.3 : 100 * Math.pow((l + 16) / 116, 3), fy = l <= 8 ? yy / 100 * 7.787 + 16 / 116 : Math.pow(yy / 100, 1 / 3);
  const x = 95.047 * Math.pow(a / 500 + fy, 3) / 100, y = yy / 100, z = 108.883 * Math.pow(fy - b / 200, 3) / 100;
  const g = c => { c = c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : c * 12.92; return 255 * Math.min(Math.max(0, c), 1); };
  return [g(3.2406 * x - 1.5372 * y - 0.4986 * z), g(-0.9689 * x + 1.8758 * y + 0.0415 * z), g(0.0557 * x - 0.204 * y + 1.057 * z)];
}
const hex = rgb => '#' + rgb.map(c => Math.round(Math.min(Math.max(c, 0), 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
function readable(color, light){
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)), bg = light ? TW_BG.light : TW_BG.dark;
  if (!light && rgb.every(c => c < 36)) return '#7A7A7A';
  let c = rgb, k = contrast(c, bg);
  if (k > 4.5) return color.toUpperCase();
  for (let i = 50; i >= 0 && k < 4.5; i--){ const lab = rgbToLab(c); lab[0] += (light ? -0.1 : 0.1) * lab[0]; c = labToRgb(lab); k = contrast(c, bg); }
  return hex(c);
}

// Its chat's commands, for ALL's box (/ at the start: chat/all-chat.js): { name, args (what goes after it: [optional]),
// does, who: 'all', 'mod' (moderators and the streamer) or 'host' (the streamer; editors too for some) }. As Twitch's own
// chat offers them (its autocomplete's getCommands, read in a live chat 2026-10-31): its words, its order (channel
// management first, then everyone's, each by name with an un… next to its other half). Left out: the ones that open
// something in its own chat (/goal, /poll, /raidbrowser, /user, /sharedchat, /gift) or answer only there (/help, /mods,
// /vips), as from ALL that happens out of sight.
const TW_COMMANDS = [
  { name: "announce", args: "message", does: "Call attention to your message with a highlight", who: 'mod' },
  { name: "announceblue", args: "message", does: "Call attention to your message with a blue highlight", who: 'mod' },
  { name: "announcegreen", args: "message", does: "Call attention to your message with a green highlight", who: 'mod' },
  { name: "announceorange", args: "message", does: "Call attention to your message with an orange highlight", who: 'mod' },
  { name: "announcepurple", args: "message", does: "Call attention to your message with a purple highlight", who: 'mod' },
  { name: "ban", args: "username [reason]", does: "Permanently ban a user from Chat", who: 'mod' },
  { name: "unban", args: "username", does: "Remove a timeout or a permanent ban on a user", who: 'mod' },
  { name: "clear", args: "", does: "Clear chat history for non-Moderator viewers", who: 'mod' },
  { name: "costream", args: "", does: "Start costreaming on behalf of the broadcaster", who: 'host' },
  { name: "costreamend", args: "", does: "End costreaming on behalf of the broadcaster", who: 'host' },
  { name: "deletepoll", args: "", does: "Delete the active poll on the given channel", who: 'mod' },
  { name: "emoteonly", args: "", does: "Restrict Chat to emote-only messages", who: 'mod' },
  { name: "emoteonlyoff", args: "", does: "Turn off emote-only mode", who: 'mod' },
  { name: "endpoll", args: "", does: "End the active poll on the given channel", who: 'mod' },
  { name: "followers", args: "[duration]", does: "Restrict Chat to followers based on their follow duration", who: 'mod' },
  { name: "followersoff", args: "", does: "Turn off followers-only mode", who: 'mod' },
  { name: "leadmod", args: "username", does: "Grant lead moderator status to a user", who: 'host' },
  { name: "unleadmod", args: "username", does: "Revoke lead moderator status from a user", who: 'host' },
  { name: "marker", args: "[description]", does: "Add a stream marker at the current timestamp", who: 'host' },
  { name: "mod", args: "username", does: "Grant moderator status to a user", who: 'host' },
  { name: "unmod", args: "username", does: "Revoke moderator status from a user", who: 'host' },
  { name: "unmonitor", args: "username", does: "Stop monitoring a user\u2019s messages", who: 'mod' },
  { name: "monitor", args: "username", does: "Start monitoring a user\u2019s messages", who: 'mod' },
  { name: "pin", args: "message", does: "Pin a message you send into chat for the channel", who: 'mod' },
  { name: "raid", args: "channel", does: "Send viewers to another channel when your stream ends", who: 'host' },
  { name: "unraid", args: "", does: "Cancel an ongoing Raid", who: 'host' },
  { name: "restrict", args: "username", does: "Start restricting a user\u2019s messages", who: 'mod' },
  { name: "unrestrict", args: "username", does: "Stop restricting a user\u2019s messages", who: 'mod' },
  { name: "shield", args: "", does: "Restrict chat and ban harassing chatters", who: 'mod' },
  { name: "shieldoff", args: "", does: "Deactivate Shield Mode", who: 'mod' },
  { name: "shoutout", args: "username", does: "Highlight a channel for viewers to follow", who: 'mod' },
  { name: "slow", args: "[duration]", does: "Limit how frequently users can send messages in Chat", who: 'mod' },
  { name: "slowoff", args: "", does: "Turn off slow mode", who: 'mod' },
  { name: "subscribers", args: "", does: "Restrict Chat to subscribers", who: 'mod' },
  { name: "subscribersoff", args: "", does: "Turn off subscribers-only mode", who: 'mod' },
  { name: "timeout", args: "username [duration] [reason]", does: "Temporarily ban a user from Chat", who: 'mod' },
  { name: "untimeout", args: "username", does: "Remove a timeout on a user", who: 'mod' },
  { name: "uniquechat", args: "", does: "Prevent users from sending duplicate messages in Chat", who: 'mod' },
  { name: "uniquechatoff", args: "", does: "Turn off unique-chat mode", who: 'mod' },
  { name: "vip", args: "username", does: "Grant VIP status to a user", who: 'host' },
  { name: "unvip", args: "username", does: "Revoke VIP status from a user", who: 'host' },
  { name: "warn", args: "username reason", does: "Issue a warning to a user that they must acknowledge before chatting again in this channel", who: 'mod' },
  { name: "block", args: "username", does: "Block a user from interacting with you on Twitch", who: 'all' },
  { name: "unblock", args: "username", does: "Remove user from your block list", who: 'all' },
  { name: "color", args: "color", does: "Change your username color, i.e. blue, green, etc", who: 'all' },
  { name: "me", args: "message", does: "Express an action in the third person", who: 'all' },
  { name: "vote", args: "index", does: "Vote in the active poll on the given channel", who: 'all' }
];

const twitch = {
  id: 'twitch', name: 'Twitch', letter: 'T',
  mentions: true,
  threadedReplies: 'pointer',   // ALL replies with its own Reply, which only shows under a real pointer: the desktop app moves it (else an @)
  // ALL's timeout and ban: Twitch's chat commands
  timeoutCmd: (login, secs) => `/timeout ${login} ${secs}`,
  banCmd: login => `/ban ${login}`,
  deleteMods: false,     // (a mod's message can't be deleted by another mod)
  spamAlerts: true,
  emoteLists: true,
  pageCommands: false,
  likes: false,
  chatCommands: TW_COMMANDS,
  // A name in ALL as its chat shows it (see kick.js): their colour, or one of Twitch's own, made readable
  nameStyle: (m, { light } = {}) => ({ color: readable(/^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : twDefault(m.login || m.sender), !!light) }),
  lowQualityJs: null,
  partition: 'persist:twitch',
  idFor: name => 'tw:' + name,
  handle: ch => ch.slice(3),
  label: ch => ch.slice(3),
  fromUrl(host, parts, u){
    if (host !== 'twitch.tv' && !host.endsWith('.twitch.tv')) return undefined;
    const q = u.searchParams.get('channel'), name = s => /^[A-Za-z0-9_]{1,25}$/.test(s || '');   // a Twitch name
    if (host.startsWith('player.') && q) return name(q) ? { channel: 'tw:' + q.toLowerCase(), only: null } : null;
    if ((parts[0] === 'popout' || parts[0] === 'embed') && parts[1])
      return name(parts[1]) ? { channel: 'tw:' + parts[1].toLowerCase(), only: parts[2] === 'chat' ? 'chat' : null } : null;
    if (parts[0] && /^[A-Za-z0-9_]{1,25}$/.test(parts[0]) && !NOT_CHANNELS.includes(parts[0].toLowerCase()))
      return { channel: 'tw:' + parts[0].toLowerCase(), only: parts[1] === 'chat' ? 'chat' : null };
    return null;
  },
  stuckJs: null,   // its player comes back by itself (see kick.js)
  streamUrl: (ch, muted) => `https://player.twitch.tv/?channel=${encodeURIComponent(ch.slice(3))}&parent=localhost&autoplay=true&muted=${muted ? 'true' : 'false'}`,
  chatUrl: ch => `https://www.twitch.tv/popout/${encodeURIComponent(ch.slice(3))}/chat?popout=`,
  pageUrl: (ch, kind) => kind === 'chat' ? twitch.chatUrl(ch) : `https://www.twitch.tv/${ch.slice(3)}`,
  profileUrl: ch => 'https://twitch.tv/' + ch.slice(3),
  modUrl: ch => `https://www.twitch.tv/moderator/${encodeURIComponent(ch.slice(3))}`,
  // Its user card is 340px wide, its rewards pop-up (the channel points button: rewards, Watch Streak, …) 324px and its
  // emote picker 320px, so in a narrower chat their right side (with the close button) is cut off. Those two use the
  // chat's whole width instead (their frame would stop them at 90% of it), with the pictures in the rewards inside it.
  chatCss: `.viewer-card-layer__draggable { max-width: 100vw !important; left: 0 !important; }
.viewer-card-layer__draggable .viewer-card { width: auto !important; max-width: 100vw !important; min-width: 0 !important; }
[role="dialog"]:has(.reward-center__content, .emote-picker), [role="dialog"] div:has(.reward-center__content, .emote-picker) { max-width: none !important; }
.reward-center__content { width: min(32.4rem, 100vw - 1.6rem) !important; }
.emote-picker { width: min(32rem, 100vw - 1.6rem) !important; }
.reward-center__content :is(div, img) { max-width: 100% !important; }
.reward-center__content img { height: auto !important; }`,
  // Its chat box's empty text (Settings > Chat > Channel name in chat boxes, in-site/chat-name.js): the box, the
  // element showing the text, the box's attributes with the same text, and the site's usual text (only that one
  // changes: a box that says something else, like followers-only or slow mode, says why you can't chat).
  // Its chat's message list and its own "back to the newest messages" button (in-site/stick-bottom.js keeps the chat at
  // its newest messages; with no list here it uses the biggest box that scrolls).
  chatScroll: { list: '[data-a-target="chat-scroller"] .simplebar-scroll-content', resume: '.chat-paused-footer button, [data-a-target="chat-paused-footer"] button' },
  // Someone supporting the stream (Settings > Support, in-site/mentions.js): how its chat shows it. { kind, re }
  // reads a row of the site's own (not someone's message) by its text, with the name (who), the number (n) and who
  // got a gift (to); { kind, row, who, n } an element it draws for it; { kind, re, msg: true } words in a message;
  // { kind, re, page: true } a banner over the chat. kind: kicks, bits, gifts (to the community), gift (to someone),
  // sub, superchat, member, raid (n: the viewers it brought).
  support: { finds: [
    { kind: 'raid', re: '^(?<n>\\d[\\d,]*) raiders? from (?<who>[A-Za-z0-9_]{2,30}) (?:have|has) joined' },
    { kind: 'gifts', re: '^(?<who>[A-Za-z0-9_]{2,30}) is gifting (?<n>\\d[\\d,]*) (?:tier \\d )?subs? to ' },
    { kind: 'gift', re: '^(?<who>[A-Za-z0-9_]{2,30}) gifted a (?:tier \\d )?sub to (?<to>[A-Za-z0-9_]{2,30})' },
    { kind: 'sub', re: '^(?<who>[A-Za-z0-9_]{2,30}) subscribed (?:at tier \\d|with prime)(?:.*?subscribed for (?<n>\\d+) months)?' },
    { kind: 'bits', msg: true, re: '(?:^| )cheer(?<n>\\d+)(?= |$)' }
  ] },
  chatBox: { box: '[data-a-target="chat-input"]', hint: '.chat-wysiwyg-input__placeholder', attrs: ['aria-label', 'data-placeholder'], says: '^send a message$' },
  raidTarget(kind, u){
    const host = u.hostname.replace(/^(www|m)\./, ''), parts = u.pathname.split('/').filter(Boolean);
    const one = twitch.fromUrl(host, parts, u);
    if (!one) return null;
    const player = host === 'player.twitch.tv';
    return (kind === 'stream' ? player : !player && (one.only === 'chat' || parts.length === 1)) ? one.channel : null;
  }
};

export { twitch };
