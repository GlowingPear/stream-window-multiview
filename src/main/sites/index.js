// The sites' main-process modules, one per site in src/shared/sites.js (in its order). main.js and the rest ask the
// channel's site (sites.of(ch)) or go through them all (sites.list) rather than naming a site, so a new site is its
// entry in sites.js, its folder here (sites/<id>/site.js), added to MODULES below, and its page side
// (src/page/sites/<id>/): README.md, "Adding a site".
//
// What a site's module exports and what its adapter has (create(ctx) returns new SiteAdapter({ … })) is listed, and
// checked as each one loads, in adapter.js.
//
// ctx: what the site shares with main.js (each site gets its own):
//   site                        its entry in sites.js (id, name, prefix, partition, hosts…)
//   session(), sessionOf(p)     its login's storage (Electron's session), and any storage
//   BrowserWindow               for windows of its own (Kick's hidden kick.com window)
//   fetch, pageFetch, getJson   requests: Node's (noted in Settings › Developer), Chromium's without cookies (pages
//                               with big headers), and JSON through Chromium; headers(): a normal browser's
//   netSignal(), netTimeout     a request's time limit
//   sleep(ms), notePageRequest(url, t0, answer) (a request made from inside a site's page, for Settings › Developer)
//   devEnv(name)                a stand-in address the tests give (empty in an installed copy)
//   stateFile(name), safeStorage
//   toMain(channel, …args)      a message to the main window
//   ipc: { app, main }          messages from the app's windows (guard.js): for what only this site has
//   progress(text)              how an import of its follows is getting on
//   follows: { saved(), keep(items), changed() }    its last follow list kept (db.js), and the page told
//   importing: { busy(), run(fn) }                  one follow-list read at a time
//   live: { snapshot(), checkSoon() }               the live checks' last answers, and checking again now
//   scrapeFollowPage(url, { scope, signedOut })     the channels on a page with your login (scrolled to its end)
//   setLoginCookies(cookies)    a login copied in (YouTube's from Firefox)
//   cachedProfile(ch)           the profile last fetched (to change it)
//
const SmvSites = require('../../shared/sites');

const { checkModule } = require('./adapter');
// each site's folder's site.js, checked as it loads (adapter.js: what a site's module and its adapter have)
const MODULES = {
  kick: checkModule('kick', require('./kick/site')),
  twitch: checkModule('twitch', require('./twitch/site')),
  youtube: checkModule('youtube', require('./youtube/site'))
};
const moduleOf = id => (SmvSites.IDS.includes(id) ? MODULES[id] : null);

// ctxFor(site) -> that site's ctx. -> { list (in sites.js order), get(id), of(ch) }
function createSites(ctxFor) {
  const list = SmvSites.SITES.map(s => MODULES[s.id].create(ctxFor(s)));
  const byId = new Map(list.map(a => [a.id, a]));
  const get = id => byId.get(id) || null;
  return { list, get, of: ch => get(SmvSites.siteOf(ch)) };
}

// What a request to a site is, in words: { site, what } (null: not a site the app asks about channels).
function describeRequest(url, body) {
  let u; try { u = new URL(String(url)); } catch { return null; }
  for (const id of SmvSites.IDS) {
    const what = MODULES[id].describeRequest(u, body);
    if (what) return { site: id, what };
  }
  return null;
}
// Whether a site (its id) has one of the plain things above (shoutouts, ircChat)
const has = (id, what) => !!(moduleOf(id) && moduleOf(id)[what] === true);

module.exports = { createSites, describeRequest, has, moduleOf, MODULES };
