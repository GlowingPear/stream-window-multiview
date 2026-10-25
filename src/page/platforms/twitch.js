// Twitch, as the rest of the page sees it (the same shape as kick.js, which says more).
// Twitch's channel ids are "tw:" and the channel's name: "tw:nightowl".

// twitch.tv/<name> pages that aren't a channel
const NOT_CHANNELS = ['directory', 'videos', 'settings', 'search', 'downloads', 'p', 'subscriptions', 'inventory', 'wallet', 'drops'];

const twitch = {
  id: 'twitch', name: 'Twitch', letter: 'T',
  mentions: true,
  spamAlerts: true,
  emoteLists: true,
  pageCommands: false,
  likes: false,
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
