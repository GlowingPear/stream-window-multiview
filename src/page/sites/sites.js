import { kick } from './kick/site.js';
import { twitch } from './twitch/site.js';
import { youtube } from './youtube/site.js';

// The sites, as the page sees them: each one's module (its folder's site.js), by its id, in the order of the list both
// sides share (src/shared/sites.js, window.SmvSites). platform(ch) (platforms/platforms.js) is a channel's.
// Nothing here touches the page (the unit tests load it on its own, after setting globalThis.SmvSites).
//
// A site's folder holds everything that's only about it: site.js (what the rest of the page asks it: its addresses,
// what it can do, and its parts below), and the parts with code of their own, which site.js plugs in: feed.js (its chat's
// data as ALL's messages), shoutouts.js, in-site/ (scripts that run inside its pages), site.css (its colours), and
// features only it has (Kick's poll, prediction and clip panels). A new site: its folder, a line here, and the rest of
// README.md's "Adding a site".
const PLATFORMS = { kick, twitch, youtube };

export { PLATFORMS };
