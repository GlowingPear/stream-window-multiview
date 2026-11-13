// The sites the app knows, and their channel ids, for both sides: the main process (require) and the app page
// (window.SmvSites, read by each site's module in src/page/sites/). src/shared/ is for code both sides load, so it
// stays in a form both can: require() and a plain <script>. A new site is an entry here, and a folder on each side:
// src/page/sites/<id>/ and src/main/sites/<id>/ (README.md, "Adding a site").
//
// A channel id is the site's prefix and the channel's name there: Kick "name" (the site with no prefix), Twitch
// "tw:name", YouTube "yt:@handle" | "yt:c:UC…" (a channel's id) | "yt:v:VIDEOID" (one video, not a channel).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmvSites = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // id: what the app calls it (saved settings, messages, CSS: .pi-<id>); name and letter: how it's shown (its badge);
  // prefix: what its channel ids start with ('' for the one site without); partition: the storage its chats, its login
  // window and signed-in players share; hosts: its web addresses (a page there opens with its login), signIn: the
  // sign-in pages it sends you to (they open with its login too); ids: what its channel ids look like (after norm),
  // video: the ids that are one video rather than a channel; keepCase: the ids whose case matters (norm keeps it), null
  // for none;
  // home: a channel's page is home + its name there (lower case).
  const SITES = [
    { id: 'kick', name: 'Kick', letter: 'K', prefix: '', partition: 'persist:kick', hosts: ['kick.com'], signIn: [], home: 'https://kick.com/',
      ids: [/^[a-z0-9_-]{1,40}$/i], video: null, keepCase: null },
    { id: 'twitch', name: 'Twitch', letter: 'T', prefix: 'tw:', partition: 'persist:twitch', hosts: ['twitch.tv'], signIn: [], home: 'https://twitch.tv/',
      ids: [/^tw:[a-z0-9_]{1,25}$/], video: null, keepCase: null },
    { id: 'youtube', name: 'YouTube', letter: 'Y', prefix: 'yt:', partition: 'persist:youtube', hosts: ['youtube.com', 'youtu.be'],
      signIn: ['google.com'], home: 'https://www.youtube.com/', ids: [/^yt:@[\w.\-]{1,100}$/, /^yt:c:UC[\w-]{10,40}$/, /^yt:v:[\w-]{11}$/],
      video: /^yt:v:/, keepCase: /^yt:(v|c):/i }
  ];

  // The list's helpers, for a list of sites (the tests make one with a made-up site too). DEFAULT: the site a bare
  // name is on (the one without a prefix: Kick)
  function make(SITES, DEFAULT) {
    const IDS = SITES.map(s => s.id);
    const byId = Object.fromEntries(SITES.map(s => [s.id, s]));
    // the sites with a prefix, longest first (so "yt:" never takes a longer one that starts the same)
    const PREFIXED = SITES.filter(s => s.prefix).sort((a, b) => b.prefix.length - a.prefix.length);

    // A channel id's site (its id: 'kick', 'twitch', …), '' for none
    function siteOf(ch) {
      if (!ch) return '';
      const c = String(ch).toLowerCase();
      return (PREFIXED.find(s => c.startsWith(s.prefix)) || byId[DEFAULT]).id;
    }
    const siteOfId = ch => byId[siteOf(ch)] || null;
    // A channel id as it's kept: lower case, except the part of an id whose case matters (YouTube's video and channel ids)
    function normCh(c) {
      c = String(c || '').trim();
      const s = byId[siteOf(c)];
      if (s && s.keepCase && s.keepCase.test(c)) {
        const m = s.keepCase.exec(c)[0];
        return m.toLowerCase() + c.slice(m.length);
      }
      return c.toLowerCase();
    }
    // (names an object already has, like __proto__, never: channels are keys in the saved lists)
    const OBJECT_NAMES = new Set(['__proto__', 'constructor', 'prototype', 'tostring', 'valueof', 'hasownproperty']);
    // The channel's name on its site: the id without the prefix ("yt:@handle" -> "@handle", "yt:c:UC…" -> "UC…")
    function bare(ch) {
      const s = siteOfId(ch); ch = String(ch || '');
      if (!s) return ch;
      const r = ch.slice(s.prefix.length);
      return s.keepCase && s.keepCase.test(ch) ? r.replace(/^[a-z]:/i, '') : r;
    }
    // Whether it's a channel id of one of the sites (a kept one: normCh first)
    function validCh(c) {
      if (typeof c !== 'string') return false;
      const s = siteOfId(c);
      if (!s || OBJECT_NAMES.has(bare(c).replace(/^@/, ''))) return false;
      return s.ids.some(re => re.test(c));
    }
    // One video rather than a channel (no profile, no channel settings, no live checks of its own)
    const isVideo = ch => { const s = siteOfId(ch); return !!(s && s.video && s.video.test(String(ch))); };
    // The site a web address's host belongs to (its pages or the sign-in pages it uses), or null
    const hostIn = (h, list) => list.some(d => h === d || h.endsWith('.' + d));
    function siteOfHost(host, { signIn = true } = {}) {
      const h = String(host || '').toLowerCase();
      return SITES.find(s => hostIn(h, s.hosts) || (signIn && hostIn(h, s.signIn))) || null;
    }

    return { SITES, IDS, DEFAULT, byId, siteOf, normCh, bare, validCh, isVideo, siteOfHost, make };
  }
  return make(SITES, 'kick');   // (a bare name is a Kick channel)
});
