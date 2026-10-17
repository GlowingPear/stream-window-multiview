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
    const q = u.searchParams.get('channel');
    if (host.startsWith('player.') && q) return { channel: 'tw:' + q.toLowerCase(), only: null };
    if ((parts[0] === 'popout' || parts[0] === 'embed') && parts[1]) return { channel: 'tw:' + parts[1].toLowerCase(), only: parts[2] === 'chat' ? 'chat' : null };
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
  // Its user card is 340px wide, so in a narrower chat its right side (with the close button) is cut off.
  chatCss: `.viewer-card-layer__draggable { max-width: 100vw !important; left: 0 !important; }
.viewer-card-layer__draggable .viewer-card { width: auto !important; max-width: 100vw !important; min-width: 0 !important; }`,
  // Its chat box's empty text (Settings > Chat > Channel name in chat boxes, in-site/chat-name.js): the box, the
  // element showing the text, the box's attributes with the same text, and the site's usual text (only that one
  // changes: a box that says something else, like followers-only or slow mode, says why you can't chat).
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
