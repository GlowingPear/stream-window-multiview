// What every site gives the page, written down once and checked. A site's folder's site.js is
// `const <id> = new Site({ id: '<id>', … })`: its id, name, letter, channel-id prefix, storage and addresses come from
// the list both sides share (src/shared/sites.js, window.SmvSites), and the rest is listed in SLOTS below with what
// it must be and what it's for. A required slot (REQUIRED) every site has; an optional one has its default here, which
// says the site hasn't got it (null, false or an empty list: the page leaves it out), so a new site only fills in
// what it has. A slot that's missing or the wrong kind, or one that isn't listed (a typo, or something new that belongs
// on this list first), stops the page as it loads, and every test that loads the site, saying what's wrong.
// Nothing here touches the page (the unit tests load it on its own, after setting globalThis.SmvSites).
const REQUIRED = Symbol('required');
const OTHERS = '…';   // in a group's slots: other parts are allowed too (a site's own readers, for its tests)
const noUrl = () => null;

// name: [kind, default (REQUIRED: none), what it's for]. kind: a type ('function', 'boolean', 'string', 'number',
// 'array', 'regexp', 'object', or several: 'boolean|string'), or a group: { slot: [kind, default] } (default null: the
// whole group is optional; default {}: its parts' defaults)
const SLOTS = {
  id: ['string', REQUIRED, 'its id in src/shared/sites.js (its name, letter, prefix, storage and addresses come from there)'],
  // Channel ids and addresses (platforms/platforms.js)
  idFor: ['function', REQUIRED, '(name) -> the channel id of a bare name typed in the Channels box'],
  handle: ['function', REQUIRED, '(ch) -> the channel\'s name on the site'],
  label: ['function', REQUIRED, '(ch) -> what a channel is called until the site\'s own spelling is known'],
  namedBySite: ['function', null, '(ch) -> its name only comes from the site (YouTube\'s channel and video ids); null: a name in other capitals'],
  fromText: ['function', () => undefined, '(raw) -> { channel, only } for text in its own short form ("tw:name", "@handle"), or undefined'],
  fromUrl: ['function', REQUIRED, '(host, parts, url) -> { channel, only } for its link, null for its page that isn\'t a channel, undefined for another site\'s'],
  streamUrl: ['function', REQUIRED, '(ch, muted, video) -> its player\'s address'],
  chatUrl: ['function', REQUIRED, '(ch, video) -> its chat\'s address'],
  pageUrl: ['function', REQUIRED, '(ch, kind, video) -> where "Open in the browser" goes for a stream or chat window'],
  profileUrl: ['function', REQUIRED, '(ch) -> the channel\'s own page (Streamer profiles)'],
  modUrl: ['function', noUrl, '(ch) -> its moderator view, or null (none)'],
  raidTarget: ['function', noUrl, '(kind, url) -> the channel a stream or chat window\'s new address is for (a raid), or null'],
  pasteHints: ['array', [], 'the Welcome screen\'s "What can I paste?" lines for its channels (HTML)'],
  colors: [{ dot: ['string', REQUIRED], brand: ['string', REQUIRED] }, REQUIRED, 'its colours where the page sets them in code (its CSS is its site.css)'],
  // You on it
  me: [{ setting: ['string', REQUIRED], valid: ['regexp', REQUIRED], at: ['boolean', false], named: ['boolean', true], word: ['string', 'username'] }, REQUIRED,
    'your name there (Settings › Mentions): its saved setting, what a name looks like, whether its chat writes it "@name", whether its login says which account it is, what a name is called'],
  login: [{ fromPages: ['boolean', false], firefox: ['boolean', false], unfollow: ['boolean', false] }, {},
    'its login: your name read from its pages (window.kmv.detectMe), sign-in by copying Firefox\'s, Import follows and profiles can unfollow'],
  following: ['boolean', false, 'a profile says whether you follow them'],
  roundsFollowers: ['boolean', false, 'its follower counts are rounded'],
  // Its streams
  liveVideo: ['boolean', false, 'its channel\'s stream is a video of its own, looked up while it\'s live (windows/views.js)'],
  likes: ['boolean', false, 'a like button on its streams (sites/youtube/options.js)'],
  quality: [{ siteMax: ['number', null] }, null, 'its stream\'s quality can be set (windows/quality.js); siteMax: how high its player goes by itself'],
  stuckJs: ['string', null, 'run in its player: \'error\', \'offline\' or \'ok\' (windows/stuck.js); null: it comes back by itself'],
  playerCss: ['string', null, 'its watch page trimmed to the player (YouTube\'s): the CSS'],
  playerFitJs: ['string', null, '... and the script that fits it'],
  // Its chat
  offlineChat: ['boolean', true, 'its chat is there while the channel is offline (YouTube\'s live chat comes with a stream)'],
  chatMax: ['number', 500, 'the longest message its chat takes'],
  chatCss: ['string', null, 'CSS added to its chat page'],
  chatScroll: [{ list: ['string', null], resume: ['string', null] }, null, 'its chat\'s message list and "back to the newest" button (in-site/stick-bottom.js)'],
  chatBox: [{ box: ['string', REQUIRED], hint: ['string', REQUIRED], attrs: ['array', []], says: ['string', REQUIRED] }, null, 'its chat box and its empty text (in-site/chat-name.js)'],
  chatCommands: ['array', [], 'its chat\'s commands, for ALL\'s / list'],
  liveCommands: ['function', null, '(raw) -> its own page\'s command list, read live (twitch), or null'],
  threadedReplies: ['boolean|string', false, 'ALL replies with its own Reply (true; \'pointer\': only under a real pointer), else with an @'],
  mentions: ['boolean', false, 'mention and reply alerts read its chat'],
  screenMentions: ['boolean', false, '... also from its chat page\'s text'],
  mentionEnd: ['string', '\\b', 'what ends an @name in a message (a regular expression\'s text)'],
  spamAlerts: ['boolean', false, 'spam alerts read its chat'],
  isHost: ['function', () => false, '(ch, name) -> whether a name in its chat is the channel\'s own broadcaster'],
  feedReaders: ['boolean', false, 'the alerts, chat over the stream and counts read its chat\'s connection (needs feed)'],
  nameStyle: ['function', () => null, '(message, { light, look }) -> { color, bg? } for a name in ALL, or null (ALL picks one)'],
  support: [{ finds: ['array', REQUIRED] }, null, 'how its chat shows someone supporting the stream (Settings › Support)'],
  emoteLists: ['boolean', false, 'the app asks it for a channel\'s emotes (new emotes glow)'],
  emotes: [{ none: ['string', null], paste: ['function', null] }, {}, 'ALL\'s emote picker: what it says with none; paste(text, add): its emotes pasted in its own form'],
  pageCommands: ['boolean', false, 'commands in its chat that open a panel of its own (Kick\'s /clip, /poll, /prediction: sites/kick/)'],
  // Moderating
  timeoutCmd: ['function', null, '(login, secs) -> ALL\'s timeout, as its chat command'],
  banCmd: ['function', null, '(login) -> ALL\'s ban, as its chat command'],
  modRequest: ['function', null, '(ch, name, secs) -> { url, method, body }: a timeout or ban as its own request (else the command is typed)'],
  deleteMods: ['boolean', false, 'ALL\'s Delete works on another mod\'s message'],
  flagged: ['boolean', false, 'Settings › Flagged: it holds messages, or flags people, for moderators'],
  held: [{ by: ['string', ''], expires: ['boolean', false], yours: ['boolean', false], allow: ['string', REQUIRED], deny: ['string', REQUIRED], denied: ['string', REQUIRED] }, null,
    'held messages: who holds them (\'\': the site, "held for review"), whether a hold runs out, whether yours can be held, its buttons\' words'],
  // Its parts with code of their own (in its folder)
  feed: [{ parse: ['function', REQUIRED], known: ['object', REQUIRED], ignored: ['object', REQUIRED], ignoredMore: ['function', () => ''], kindOf: ['function', null], [OTHERS]: true }, null,
    'its chat\'s data as ALL\'s messages (feed.js; chat/feed-parse.js)'],
  chat: [{ ownIcons: ['boolean', false], globalBadges: ['boolean', false], look: ['boolean', false], shared: ['boolean', false], modByLater: ['boolean', false], hypeTrains: ['boolean', false], modesAgain: ['boolean', false] }, {},
    'what ALL reads from its chat beyond the messages (sites/kick/site.js says what each is)'],
  inSite: [{ tap: ['function', null], pins: ['function', null], shown: ['function', null], badges: ['function', null], modes: ['function', null], icons: ['function', null], look: ['function', null], room: ['function', null],
    hypeTrain: ['function', null], channels: ['function', null], commands: ['function', null], reply: ['function', null], replyAt: ['function', null], replyPress: ['function', null], heldCard: ['function', null], signedOut: ['function', null],
    emote: [{ look: ['array', REQUIRED], find: ['function', REQUIRED], host: ['string', null], path: ['string', null], pics: ['string', REQUIRED] }, null] }, {},
    'its parts of the scripts that run inside its chat page (in-site/; sites/kick/site.js says what each is)'],
  send: [{ button: ['string', null], inner: ['string|array', null], waitEnabled: ['boolean', false], realPress: ['boolean', false] }, {}, 'how in-site/send.js sends in its chat'],
  shoutouts: [{ tries: ['function', null], command: ['string', null], page: ['object', REQUIRED] }, null, 'shoutouts (chat/shoutout.js): its shoutouts.js'],
};

const kindOf = v => (v === null || v === undefined ? 'nothing' : Array.isArray(v) ? 'array' : v instanceof RegExp ? 'regexp' : typeof v);
const isGroup = kind => !!kind && typeof kind === 'object';
const article = k => (/^[aeiou]/.test(k) ? 'an ' : 'a ') + k;
// o filled in from slots: { value, wrong: ['chat.look must be a boolean, not string', …] }
function fill(o, slots, where = '') {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { value: o, wrong: [`${where.replace(/\.$/, '') || 'it'} must be an object`] };
  const value = {}, wrong = [];
  for (const [name, slot] of Object.entries(slots)) {
    if (name === OTHERS) continue;
    const [kind, def] = slot;
    const v = o[name], at = where + name;
    if (v === undefined || (v === null && def !== REQUIRED)) {
      if (def === REQUIRED) { wrong.push(`${at} is missing`); continue; }
      if (isGroup(kind) && def) { const r = fill({}, kind, at + '.'); value[name] = r.value; wrong.push(...r.wrong); }   // (its parts' defaults)
      else value[name] = Array.isArray(def) ? [...def] : def;
      continue;
    }
    if (isGroup(kind)) { const r = fill(v, kind, at + '.'); value[name] = r.value; wrong.push(...r.wrong); continue; }
    if (!kind.split('|').includes(kindOf(v))) { wrong.push(`${at} must be ${kind.split('|').map(article).join(' or ')}, not ${kindOf(v)}`); continue; }
    value[name] = v;
  }
  for (const name of Object.keys(o)) {
    if (name in slots) continue;
    if (slots[OTHERS]) value[name] = o[name];
    else wrong.push(`${where + name} isn't a slot (src/page/sites/adapter.js lists them)`);
  }
  return { value, wrong };
}

class Site {
  static SLOTS = SLOTS;         // (what each slot is, for the tests and anyone writing a site)
  static REQUIRED = REQUIRED;
  constructor(spec) {
    const id = spec && spec.id, shared = typeof SmvSites !== 'undefined' && SmvSites.byId[id];
    const { value, wrong } = fill(spec, SLOTS);
    if (!shared) wrong.unshift(`${id || 'its id'} isn't in src/shared/sites.js`);
    if (wrong.length) throw new Error(`The ${id || '?'} site (src/page/sites/${id || '?'}/site.js): ${wrong.join('; ')}`);
    Object.assign(this, shared, value);
  }
}

export { Site };
