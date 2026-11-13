import { modesAgent } from '../in-site/feed.js';
import { PLATFORMS } from './sites.js';

// The scripts that run inside the sites' pages (in-site/), with each site's part of them. A script there is the shared
// part; what differs by site is in the site's folder (sites/<id>/in-site/, shoutouts.js), plugged into its site.js
// (inSite, send, shoutouts.page), and passed in as the page builds the script's text: as the script runs inside the
// site's page it can't import or see anything, so a site's part goes in the text with it (a function as its own text;
// never eval or new Function in the site's page, whose rules may block them). A site without a part has null there,
// and the caller skips it. Nothing here touches the page.

// A value as JavaScript text: a function as its own text (an arrow or function expression, not a method's shorthand),
// a list or object of them as one, anything else as JSON
const toJs = v => typeof v === 'function' ? String(v)
  : Array.isArray(v) ? '[' + v.map(toJs).join(', ') + ']'
  : v && typeof v === 'object' ? '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + toJs(x)).join(', ') + '}'
  : v === undefined ? 'undefined' : JSON.stringify(v);
// A script to run in a site's page: fn (self-contained) called with args, which can hold the site's parts
const inSiteCall = (fn, ...args) => `(${fn})(${args.map(toJs).join(', ')})`;
// A site's parts of the scripts (its site.js's inSite; {} for a site that has none)
const inSiteOf = site => (PLATFORMS[site] || {}).inSite || {};
// How in-site/send.js types and sends in a site's chat: its box (its chatBox.box) and its send button (its send)
const sendSpec = site => { const p = PLATFORMS[site] || {}; return { box: (p.chatBox || {}).box || null, ...(p.send || {}) }; };
// How in-site/shoutout.js reads a site's chat lines (its shoutouts' page), with its id; null for a site without shoutouts
const shoutPage = site => { const so = (PLATFORMS[site] || {}).shoutouts; return so && so.page ? { site, ...so.page } : null; };
// Each site's emotes, for the emote card (in-site/emote-preview.js): its name, the card's look and its find
const emoteSites = () => Object.values(PLATFORMS).filter(p => p.inSite && p.inSite.emote && p.inSite.emote.find)
  .map(p => ({ name: p.name, look: p.inSite.emote.look, find: p.inSite.emote.find }));
// Where the sites keep their emotes' pictures, for reading the emotes in a message (in-site/mentions.js) and marking new
// ones (in-site/new-emotes.js): [{ host, path }], regular expressions' text
const emoteHosts = () => Object.values(PLATFORMS).map(p => p.inSite && p.inSite.emote).filter(e => e && e.host)
  .map(e => ({ host: e.host, path: e.path || null }));
// The emote add-ons any site's chat can have (7TV, BetterTTV, FrankerFaceZ): their emote card's badge, and where their
// pictures are (after https://, a regular expression's text)
const ADD_ONS = { '7TV': ['#353e43', '#e7ede9', 'From the 7TV add-on'], BTTV: ['#353e43', '#e7ede9', 'From the BetterTTV add-on'], FFZ: ['#353e43', '#e7ede9', 'From the FrankerFaceZ add-on'] };
const ADD_ON_PICS = '([\\w-]+\\.)?7tv\\.app\\/|cdn\\.betterttv\\.net\\/|cdn\\.frankerfacez\\.com\\/';
// An emote's card badge by where it's from (a site's name, or an add-on's): [background, colour, words], or null
const emoteLook = from => (emoteSites().find(s => s.name === from) || {}).look || ADD_ONS[from] || null;
// The emote pictures the page shows: the sites' and the add-ons'. inMessages: only the sites whose emotes are read in a
// message's words (their emote.host: a mention's emotes, kept in the bell)
const emotePics = ({ inMessages = false } = {}) => new RegExp('^https:\\/\\/(' + [...Object.values(PLATFORMS).map(p => p.inSite.emote)
  .filter(e => e && (!inMessages || e.host)).map(e => e.pics), ADD_ON_PICS].join('|') + ')');
// The chat's modes and you there (in-site/feed.js modesAgent), in a site's chat page
const modesJs = site => inSiteCall(modesAgent, site, inSiteOf(site).modes);

export { emoteHosts, emoteLook, emotePics, emoteSites, inSiteCall, inSiteOf, modesJs, sendSpec, shoutPage };
