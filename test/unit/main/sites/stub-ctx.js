// A stand-in for what main.js gives a site module (the ctx: see the top of src/main/sites/index.js). It records what the
// module asks for and sends, so a site's tests run without Electron and offline.
const path = require('path');
const { tempDir } = require('../../../helpers');
const SmvSites = require('../../../../src/shared/sites');

// A site's answer to fetch: { status, json } or { status, text }
const answer = ({ status = 200, json, text } = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => { if (json === undefined) throw new Error('not JSON'); return json; },
  text: async () => (text !== undefined ? text : JSON.stringify(json))
});

// over: { cookies, fetch, pageFetch, loginFetch, getJson, env, safeStorage, snapshot, saved, busy, scrape, profiles, BrowserWindow }
function stubCtx(id, over = {}) {
  const site = SmvSites.byId[id];
  const rec = { handlers: { app: {}, main: {} }, sent: [], progress: [], kept: [], changed: 0, checks: 0, scraped: [], notes: [],
    loginCookies: [], setCookies: [], fetched: [], saved: over.saved || null, cookies: over.cookies || [] };
  const cookieJar = { get: async q => rec.cookies.filter(c => !q || !q.name || c.name === q.name), set: async c => { rec.setCookies.push(c); } };
  const ipc = side => ({ handle: (ch, fn) => { rec.handlers[side][ch] = fn; }, on: (ch, fn) => { rec.handlers[side][ch] = fn; } });
  const ctx = {
    site,
    session: () => ({ cookies: cookieJar }),
    sessionOf: p => { rec.sessionOf = p; if (over.badSession) throw new Error('no such storage'); return { cookies: cookieJar }; },
    BrowserWindow: over.BrowserWindow,
    fetch: async (url, opts) => { rec.fetched.push({ url, opts }); if (!over.fetch) throw new Error('offline'); return over.fetch(url, opts); },
    pageFetch: async (url, opts) => { rec.fetched.push({ url, opts, page: true }); if (!over.pageFetch) throw new Error('offline'); return over.pageFetch(url, opts); },
    loginFetch: async (url, opts) => { rec.fetched.push({ url, opts, login: true }); if (!over.loginFetch) throw new Error('offline'); return over.loginFetch(url, opts); },
    getJson: async (url, opts) => { rec.fetched.push({ url, opts, json: true }); return over.getJson ? over.getJson(url, opts) : null; },
    headers: () => ({ 'User-Agent': 'test' }),
    netSignal: () => undefined, netTimeout: 1000,
    sleep: async () => {},
    notePageRequest: (...a) => rec.notes.push(a),
    devEnv: k => (over.env || {})[k] || '',
    stateFile: name =>   // (its data folder: made when the module first saves something)
      path.join(rec.dir || (rec.dir = tempDir('site')), name + '.json'),
    safeStorage: over.safeStorage,
    toMain: (...a) => rec.sent.push(a),
    ipc: { app: ipc('app'), main: ipc('main') },
    progress: t => rec.progress.push(t),
    follows: { saved: () => rec.saved, keep: items => rec.kept.push(items), changed: () => { rec.changed++; } },
    importing: { busy: () => !!over.busy, run: async fn => { rec.ran = (rec.ran || 0) + 1; return fn(); } },
    live: { snapshot: () => over.snapshot || {}, checkSoon: () => { rec.checks++; } },
    scrapeFollowPage: async (url, opts) => { rec.scraped.push([url, opts]); return over.scrape ? over.scrape(url, opts) : { items: [] }; },
    setLoginCookies: async list => { rec.loginCookies.push(...list); return list.length; },
    cachedProfile: ch => (over.profiles || {})[ch] || null
  };
  return { ctx, rec };
}

module.exports = { stubCtx, answer };
