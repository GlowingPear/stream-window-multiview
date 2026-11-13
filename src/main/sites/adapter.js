// What every site's main-process module gives main.js, written down once and checked. A site's folder has its site.js,
// which exports create(ctx) (returning new SiteAdapter({ … })) and the plain things in MODULE below. Every slot is
// listed here with what it must be: a required one a site always has; an optional one it leaves out when it hasn't
// got it (it's null then, and main.js skips it). A slot that's missing or the wrong kind, or one that isn't listed
// here (a typo, or something new that belongs on this list first), stops the app as it starts, and every test that
// loads the site, with what's wrong. sites/index.js says what ctx has.

// [kind, required, what it's for]. kind: 'function', 'boolean', 'string', 'object' (with its own slots: then an object
// of the same form), 'array'
const SLOTS = {
  id: ['string', true, 'its id (src/shared/sites.js)'],
  site: ['object', true, 'its entry in src/shared/sites.js'],
  loginUrl: ['string', true, 'the page its login window opens on'],
  named: ['boolean', true, 'its pages say which account is signed in (shown in the Account menu), not only that one is'],
  signedIn: ['function', true, '() -> whether you\'re signed in (follow suggestions)'],
  account: ['function', true, '() -> your name there, or whether you\'re signed in, or null (accounts:status)'],
  liveOne: ['function', true, '(ch) -> its live info, { missing }, or null: is one channel live'],
  profile: ['function', true, '(ch) -> its profile, { missing }, or null'],
  byName: ['function', true, '(name) -> the channel id a plain name is there'],
  fromLink: ['function', true, '(href) -> the channel id a link on its pages is for, or null'],
  openLogin: ['function', false, '() -> signs in some other way, without a login window (YouTube: Firefox)'],
  keeps: ['function', false, '(win) -> a window of its own that logging out leaves open'],
  loggedOut: ['function', false, '() -> after its login is wiped'],
  close: ['function', false, '() -> as the app closes (its hidden windows)'],
  ready: ['function', false, '() -> once the app is ready, before its windows open (what it saved)'],
  signInAs: [{ urls: ['array', true], test: ['function', true], userAgent: ['function', true] }, false,
    'sign-in pages that refuse the app as it is: it shows itself as another browser there'],
  liveBatch: ['function', false, '(chs) -> { results: [[ch, info]], rest: [ch] }: many channels at once (rest: one at a time)'],
  follows: [{ import: ['function', true], tick: ['function', true], retry: ['function', true], live: ['function', false], clearLive: ['function', false] }, false,
    'the channels you follow: Import follows, the background read (tick), who\'s live among them'],
  modCheck: ['function', false, '(ch) -> true | false | null: whether you can moderate the channel'],
  emotes: [{ list: ['function', true], pick: ['function', true], addOns: ['object', true] }, false,
    'its channels\' emotes: the names (new emotes glow), the picker\'s groups, the add-ons (7TV, BTTV, FFZ) it has'],
  emoteHost: ['function', false, '(host) -> its emote pictures\' host (downloads, Copy image)'],
  profileStale: ['function', false, '(kept) -> a kept profile to ask for again'],
  heldTitle: ['string', false, 'a held message\'s notification, when it isn\'t "AutoMod held a message"']
};
// What a site's module exports besides create (needs no app: devlog.js, event-samples.js, context-menu.js read them)
const MODULE = {
  create: ['function', true, '(ctx) -> its SiteAdapter'],
  describeRequest: ['function', true, '(url: URL, body) -> what a request to it is, in words (Settings › Developer), or null'],
  fromLink: ['function', true, '(href) -> the channel id a link on its pages is for, or null'],
  shoutouts: ['boolean', false, 'its chat can shout someone out (Settings › Shoutouts)'],
  ircChat: ['boolean', false, 'its chat\'s events are IRC lines (event-samples.js takes their names out)']
};

const kindOf = v => (v === null || v === undefined ? 'nothing' : Array.isArray(v) ? 'array' : typeof v);
// What's wrong with o against slots (where: its name so far): ['follows.tick must be a function', …]
function problems(o, slots, where = '') {
  if (!o || typeof o !== 'object') return [`${where || 'it'} must be an object`];
  const out = [];
  for (const [name, [kind, required]] of Object.entries(slots)) {
    const v = o[name], at = where + name;
    if (v === undefined || v === null) { if (required) out.push(`${at} is missing`); continue; }
    if (typeof kind === 'object') out.push(...problems(v, kind, at + '.'));
    else if (kindOf(v) !== kind) out.push(`${at} must be ${kind === 'array' ? 'an array' : (/^[aeiou]/.test(kind) ? 'an ' : 'a ') + kind}, not ${kindOf(v)}`);
  }
  for (const name of Object.keys(o)) if (!(name in slots)) out.push(`${where + name} isn't a slot (src/main/sites/adapter.js lists them)`);
  return out;
}

class SiteAdapter {
  constructor(slots) {
    const wrong = problems(slots, SLOTS);
    if (wrong.length) throw new Error(`The ${(slots && slots.id) || '?'} site's main-process adapter: ${wrong.join('; ')}`);
    for (const name of Object.keys(SLOTS)) this[name] = slots[name] === undefined ? null : slots[name];
  }
}
// A site's module (its site.js's exports), checked the same way: throws with what's wrong
function checkModule(id, mod) {
  const wrong = problems(mod, MODULE).filter(p => !/isn't a slot/.test(p));   // (it may export its readers too, for the tests)
  if (wrong.length) throw new Error(`The ${id} site's main-process module (src/main/sites/${id}/site.js): ${wrong.join('; ')}`);
  return mod;
}

module.exports = { SiteAdapter, checkModule, SLOTS, MODULE, problems };
