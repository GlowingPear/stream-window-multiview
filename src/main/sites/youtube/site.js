// YouTube's main-process side (what every site module gives: sites/index.js). YouTube's pages answer the live checks
// and profiles; with your own API key (Settings › YouTube, optional) the live checks read each channel's feed and ask
// the Data API about its videos instead, far fewer requests. Google blocks signing in inside apps, so the sign-in
// pages are shown a Firefox identity, and Settings › Accounts copies your login out of Firefox (firefox-login.js).
// The top half is plain logic (tested on its own); create() below wires it into the app.
const { SiteAdapter } = require('../adapter');   // (what every site's adapter has: adapter.js)
const fs = require('fs');
const SmvSites = require('../../../shared/sites');
const { toTime, decodeHtml, firefoxUA } = require('../../live');
const { parseYouTubeChannel } = require('../../profiles');
const firefoxLogin = require('../../firefox-login');   // (as an object: the tests stand in for Firefox)
const { LOGIN_COOKIE } = firefoxLogin;

const YT = 'https://www.youtube.com';

// The "/live" address of a channel turns into the live video's page while it's live.
function ytLiveUrl(ch) {
  const r = ch.slice(3);
  if (r.startsWith('v:')) return YT + '/watch?v=' + r.slice(2);
  if (r.startsWith('c:')) return YT + '/channel/' + r.slice(2) + '/live';
  return YT + '/' + r + '/live';
}
function parseYouTube(html, ch) {
  if (typeof html !== 'string' || html.length < 500) return null;
  const canon = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  const vid = canon ? canon[1] : (/^yt:v:/.test(ch) ? ch.slice(5) : null);
  const isLive = /"isLive"\s*:\s*true/.test(html) || /"isLiveNow"\s*:\s*true/.test(html);
  const upcoming = /"isUpcoming"\s*:\s*true/.test(html);
  const live = !!(canon && isLive && !upcoming);
  const title = decodeHtml((html.match(/<meta name="title" content="([^"]*)"/) || [])[1]);
  const owner = (html.match(/"ownerChannelName"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1] ||
                (html.match(/<link itemprop="name" content="([^"]*)"/) || [])[1] ||
                (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '';
  const vc = html.match(/"concurrentViewers"\s*:\s*"(\d+)"/);
  return {
    live, videoId: vid, title: live ? title : '',
    viewers: live && vc ? +vc[1] : null, category: '',
    name: decodeHtml(owner) || ch.replace(/^yt:(v:|c:)?/, ''),
    checked: Date.now()
  };
}

// A channel's feed (https://www.youtube.com/feeds/videos.xml?channel_id=…) -> its latest videos.
function parseYtFeed(xml) {
  if (typeof xml !== 'string' || !/<feed[\s>]/.test(xml)) return null;
  const ids = [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map(m => m[1]);
  const channelId = (xml.match(/<yt:channelId>(UC[\w-]{10,40})<\/yt:channelId>/) || [])[1] || '';
  const name = decodeHtml((xml.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || '');
  return { ids: [...new Set(ids)], channelId, name };
}
// Data API videos.list (part=snippet,liveStreamingDetails) -> Map(videoId -> { state, title, viewers,
// channelId, channelTitle }). state: 'live', 'upcoming', or 'done' (a normal video or a finished stream: never live again).
function parseYtVideos(d) {
  if (!d || !Array.isArray(d.items)) return null;
  const out = new Map();
  for (const v of d.items) {
    if (!v || typeof v.id !== 'string') continue;
    const sn = v.snippet || {}, ld = v.liveStreamingDetails || null;
    const lbc = sn.liveBroadcastContent;
    const state = lbc === 'live' && !(ld && ld.actualEndTime) ? 'live' : lbc === 'upcoming' ? 'upcoming' : 'done';
    out.set(v.id, { state, title: String(sn.title || ''), viewers: ld && ld.concurrentViewers != null && Number.isFinite(+ld.concurrentViewers) ? +ld.concurrentViewers : null,
      startedAt: ld ? toTime(ld.actualStartTime) : null,
      channelId: String(sn.channelId || ''), channelTitle: String(sn.channelTitle || '') });
  }
  return out;
}

// When the API key may be used. fail({ status, reason }) after an error answer; while it can't be
// used, YouTube is checked by reading pages (as without a key).
//   out of quota  -> until the quota resets (midnight Pacific time)
//   too fast      -> 15 min, doubling up to 2 h while it keeps happening
//   key refused   -> until the key is changed
//   anything else -> just this pass
const YT_QUOTA = /^(quotaExceeded|dailyLimitExceeded)$/;
const YT_RATE = /^(rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED)$/;
const YT_BADKEY = /^(keyInvalid|keyExpired|API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|accessNotConfigured|SERVICE_DISABLED|forbidden|ipRefererBlocked)$/;
function nextPacificMidnight(t) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
  const g = k => +(parts.find(p => p.type === k) || {}).value || 0;
  return t - ((g('hour') * 60 + g('minute')) * 60 + g('second')) * 1000 - (t % 1000) + 864e5;
}
// The reason in a Google API error answer ({ error: { errors: [{ reason }], details: [{ reason }], status } }).
function ytErrorReason(d) {
  const e = d && d.error;
  if (!e) return '';
  // details (e.g. API_KEY_INVALID) says more than errors (e.g. badRequest)
  return (Array.isArray(e.details) && (e.details.find(x => x && x.reason) || {}).reason) || (Array.isArray(e.errors) && e.errors[0] && e.errors[0].reason) || e.status || '';
}
function createKeyGate({ now = () => Date.now() } = {}) {
  let st = { state: 'ok', until: 0, backoff: 0, reason: '' };
  return {
    usable: () => st.state === 'ok' || ((st.state === 'quota' || st.state === 'rate') && now() >= st.until),
    ok() { st = { state: 'ok', until: 0, backoff: 0, reason: '' }; },
    fail({ status = 0, reason = '' } = {}) {
      if (YT_QUOTA.test(reason)) st = { state: 'quota', until: nextPacificMidnight(now()), backoff: 0, reason };
      else if (status === 429 || YT_RATE.test(reason)) {
        const backoff = st.state === 'rate' ? Math.min(st.backoff * 2, 2 * 3600e3) : 15 * 60e3;
        st = { state: 'rate', until: now() + backoff, backoff, reason };
      } else if (status === 401 || YT_BADKEY.test(reason)) st = { state: 'badkey', until: 0, backoff: 0, reason };
      return st.state;
    },
    reset() { this.ok(); },
    status: () => ({ ...st })
  };
}
// The channel feeds go down for everyone at once (answering 404), often for minutes, sometimes for hours.
// One gate for all channels: a round where no feed answered is a miss. After 3 misses in a row the feed is down
// and only asked again after 1 min, doubling up to 30 min; any feed answering puts it back up.
function createFeedGate({ now = () => Date.now(), misses = 3 } = {}) {
  let st = { miss: 0, until: 0, backoff: 0 };
  return {
    usable: () => st.miss < misses || now() >= st.until,
    down: () => st.miss >= misses,
    ok() { st = { miss: 0, until: 0, backoff: 0 }; },
    fail() {
      st.miss++;
      if (st.miss >= misses) { st.backoff = st.backoff ? Math.min(st.backoff * 2, 30 * 60e3) : 60e3; st.until = now() + st.backoff; }
    },
    status: () => ({ ...st })
  };
}
// A channel whose feed couldn't be read this round (prev: its last result):
//   'recheck' -> it was live: ask the API about that video again (a stream keeps its video id)
//   'keep'    -> every feed is failing, but not for long yet: keep its last result for now
//   'page'    -> check its page instead
function ytNoFeed(prev, { allFailing, down }) {
  if (prev && prev.live && prev.videoId) return 'recheck';
  if (prev && !prev.missing && allFailing && !down) return 'keep';
  return 'page';
}

/* ---------- Google sign-in inside the app ----------
   Google refuses sign-in from embedded Chromium ("This browser or app may not be secure"): the
   page sees Chromium without the "Google Chrome" brand. Firefox has no such brand list, so the
   sign-in pages are shown a Firefox identity instead (and only those pages). */
const SIGNIN_HOST_RE = /^https:\/\/(accounts\.google\.com|accounts\.youtube\.com)(\/|$)/i;
const isGoogleSignin = url => SIGNIN_HOST_RE.test(String(url || ''));

// Google's "Reject all" answer to its cookie question, as YouTube saves it (the extension store, Google's too, takes it)
const REJECT_ALL = 'CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg';
// The YouTube login: its own cookies and the sign-in ones it checks on google.com
const signedInWith = list => list.some(x => /(youtube|google)\.com$/.test(x.domain) && LOGIN_COOKIE.test(x.name));
// Whether a YouTube page was for someone signed in (its ytcfg's LOGGED_IN), or null when it doesn't say (its cookie
// question, or not a page of its own)
const loggedInOn = html => { const m = /"LOGGED_IN"\s*:\s*(true|false)/.exec(String(html || '')); return m ? m[1] === 'true' : null; };

// A link on the Subscriptions page -> its channel id (or null)
function fromLink(href) {
  let u; try { u = new URL(href, YT); } catch { return null; }
  const p = u.pathname.replace(/\/+$/, '');
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
  let m = p.match(/^\/@([^/]+)$/);
  if (m) { let h; try { h = decodeURIComponent(m[1]); } catch { h = m[1]; } return /^[\w.\-]{1,100}$/.test(h) ? 'yt:@' + h.toLowerCase() : null; }
  m = p.match(/^\/channel\/(UC[\w-]{10,40})$/);
  return m ? 'yt:c:' + m[1] : null;
}
// A request to YouTube, in words for Settings › Developer (devlog.js), or null when it isn't YouTube's
function describeRequest(u) {
  const h = u.hostname, p = u.pathname;
  if (h === 'www.googleapis.com' && /^\/youtube\//.test(p)) return 'API ' + p.replace(/^\/youtube\/v3\//, '');
  if (/(^|\.)youtube\.com$/.test(h)) return /\/feeds\/videos\.xml$/.test(p) ? 'channel feed' : /\/live$/.test(p) ? 'live page' : /^\/watch/.test(p) ? 'video page' : 'page';
  return null;
}

// The Subscriptions page: the channels are in its browse part (not the guide beside it), and it says when you're signed out
const FOLLOW_SCOPE = 'ytd-browse[page-subtype="subscriptions"], ytd-browse[page-subtype="channels"], ytd-browse:not([hidden])';
const SIGNED_OUT_JS = `(!!(window.ytcfg && window.ytcfg.get && window.ytcfg.get('LOGGED_IN') === false)
        || !!document.querySelector('ytd-masthead a[href*="ServiceLogin"], ytd-masthead ytd-button-renderer a[href*="accounts.google.com"]'))`;

/* ---------- the app's side (ctx: sites/index.js) ---------- */
function create(ctx) {
  const { site } = ctx;
  const YT_API = ctx.devEnv('SMV_YT_API') || 'https://www.googleapis.com/youtube/v3';   // tests point this at a stand-in
  const YT_FEED = ctx.devEnv('SMV_YT_FEED') || YT + '/feeds/videos.xml';                // and this
  const YT_PAGES = ctx.devEnv('SMV_YT_PAGES');   // and YouTube's own pages (its live pages)
  const ytPage = url => YT_PAGES ? url.replace(/^https:\/\/www\.youtube\.com/, YT_PAGES) : url;
  // (with YouTube's answer to its cookie question: see pageFetch in main.js)
  const pageHeaders = () => ({ ...ctx.headers(), Cookie: 'SOCS=CAI; CONSENT=YES+1' });
  const signedIn = () => ctx.session().cookies.get({}).then(signedInWith, () => false);

  async function liveOne(ch) {
    try {
      const r = await ctx.pageFetch(ytPage(ytLiveUrl(ch)), { headers: pageHeaders(), signal: ctx.netSignal() });
      if (r.status === 404) return { missing: true };
      if (r.ok) return parseYouTube(await r.text(), ch);
    } catch {}
    return null;
  }
  ctx.ipc.app.handle('yt:resolve', async (_e, ch) => (typeof ch === 'string' && ch.startsWith(site.prefix) ? liveOne(ch) : null));

  /* the API key: optional, stored encrypted with the system's key store, never sent to the page */
  let ytKey = '', ytKeySaved = false;
  const ytGate = createKeyGate();
  const ytKeyFile = () => ctx.stateFile('youtube-key');
  const { safeStorage } = ctx;
  // (safeStorage's async calls, once the app is ready: the sync ones are gone in Electron 46, and what they saved reads the same)
  async function loadYtKey() {
    try {
      const d = JSON.parse(fs.readFileSync(ytKeyFile(), 'utf8'));
      if (!d || !d.enc || !(await safeStorage.isAsyncEncryptionAvailable())) return;
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(d.enc, 'base64'));
      ytKey = result; ytKeySaved = true;
      if (shouldReEncrypt) await storeYtKey(result);       // the system's key changed: saved again with the new one
    } catch {}
  }
  async function storeYtKey(key) {
    ytKey = key; ytKeySaved = false; ytGate.reset();
    try {
      if (!key) fs.rmSync(ytKeyFile(), { force: true });
      else if (await safeStorage.isAsyncEncryptionAvailable()) {
        const enc = await safeStorage.encryptStringAsync(key);
        if (ytKey !== key) return;                          // changed again meanwhile: that one is saved instead
        fs.writeFileSync(ytKeyFile(), JSON.stringify({ enc: enc.toString('base64') })); ytKeySaved = true;
      }
    } catch {}
  }
  const ytKeyStatus = () => ({ set: !!ytKey, saved: ytKeySaved, ...ytGate.status() });
  let lastYtState = 'ok';
  function ytKeyChanged() {
    const st = ytGate.status().state;
    if (st !== lastYtState) { lastYtState = st; ctx.toMain('ytkey:status', ytKeyStatus()); }
  }
  // One Data API call. Error answers go to the gate (which decides when to use the key again) and throw.
  async function ytApi(pathAndQuery, key = ytKey) {
    const r = await ctx.fetch(`${YT_API}/${pathAndQuery}&key=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' }, signal: ctx.netSignal() });
    const d = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error('youtube ' + r.status); e.status = r.status; e.reason = ytErrorReason(d); throw e; }
    return d;
  }
  ctx.ipc.app.handle('ytkey:status', () => ytKeyStatus());
  ctx.ipc.main.handle('ytkey:set', async (_e, key) => {
    key = String(key || '').trim();
    if (!/^[\w-]{20,100}$/.test(key)) return { ...ytKeyStatus(), error: 'format' };
    try { await ytApi('videos?part=id&id=dQw4w9WgXcQ', key); }   // one test question (1 quota unit)
    catch (e) {
      if (!e.status) return { ...ytKeyStatus(), error: 'network' };
      const g = createKeyGate(); const st = g.fail(e);
      if (st === 'badkey') return { ...ytKeyStatus(), error: 'badkey', reason: e.reason };
      // over quota or too fast: the key itself is fine, so keep it
      await storeYtKey(key); ytGate.fail(e); ytKeyChanged(); ctx.live.checkSoon();
      return ytKeyStatus();
    }
    await storeYtKey(key); ytKeyChanged(); ctx.live.checkSoon();
    return ytKeyStatus();
  });
  ctx.ipc.main.handle('ytkey:remove', async () => { await storeYtKey(''); ytKeyChanged(); return ytKeyStatus(); });

  /* many channels at once, with the key: each channel's feed, then one question per 50 videos */
  const ytIds = new Map();      // "yt:@handle" -> "UC…" (asked once: 1 quota unit)
  const ytDone = new Set();     // videos that can never be live (normal videos, finished streams): not asked about again
  async function ytChannelId(ch) {
    if (ch.startsWith('yt:c:')) return ch.slice(5);
    if (ytIds.has(ch)) return ytIds.get(ch);
    const d = await ytApi('channels?part=id&forHandle=' + encodeURIComponent(ch.slice(3)));
    const id = d && Array.isArray(d.items) && d.items[0] ? d.items[0].id : '';
    ytIds.set(ch, id);
    return id;
  }
  const ytFeed = createFeedGate();   // the channel feeds, shared: they go down for everyone at once
  async function liveBatch(chs) {
    if (!chs.length || !ytKey || !ytGate.usable()) return { results: [], rest: chs };
    const results = [], rest = [], feeds = new Map(), ask = new Set(), noFeed = [], recheck = new Map();
    try {
      const tryFeed = ytFeed.usable();
      let answered = false;
      for (const ch of chs) {
        if (ch.startsWith('yt:v:')) { ask.add(ch.slice(5)); continue; }
        const id = await ytChannelId(ch);
        if (!id) { results.push([ch, { missing: true }]); continue; }
        let f = null;
        if (tryFeed) {
          try {
            // A 404 here is the feed being down (it happens to every channel at once), not a missing channel
            const r = await ctx.fetch(YT_FEED + '?channel_id=' + id, { headers: ctx.headers(), signal: ctx.netSignal() });
            if (r.ok) f = parseYtFeed(await r.text());
          } catch {}
        }
        if (!f) { noFeed.push(ch); continue; }
        answered = true;
        feeds.set(ch, f);
        f.ids.forEach(v => { if (!ytDone.has(v)) ask.add(v); });
      }
      if (answered) ytFeed.ok(); else if (tryFeed && noFeed.length) ytFeed.fail();
      const prev = noFeed.length ? ctx.live.snapshot() : {};
      for (const ch of noFeed) {
        const what = ytNoFeed(prev[ch], { allFailing: !answered, down: ytFeed.down() });
        if (what === 'recheck' && !ytDone.has(prev[ch].videoId)) { recheck.set(ch, prev[ch].videoId); ask.add(prev[ch].videoId); }
        else if (what === 'page' || what === 'recheck') rest.push(ch);
        // 'keep': left out of this round, so its last result stays
      }
      const vids = new Map(), ids = [...ask];
      for (let i = 0; i < ids.length; i += 50) {
        const part = ids.slice(i, i + 50);
        const m = parseYtVideos(await ytApi('videos?part=snippet,liveStreamingDetails&id=' + part.join(','))) || new Map();
        for (const v of part) { const x = m.get(v); if (!x || x.state === 'done') ytDone.add(v); else vids.set(v, x); }
      }
      if (ytDone.size > 50000) ytDone.clear();
      ytGate.ok(); ytKeyChanged();
      const at = Date.now();
      const result = (ch, liveId, f) => {
        const v = liveId && vids.get(liveId);
        return [ch, { live: !!v, videoId: liveId || null, title: v ? v.title : '', viewers: v ? v.viewers : null, category: '', startedAt: v ? v.startedAt : null,
          name: (f && f.name) || (v && v.channelTitle) || ch.replace(/^yt:(v:|c:)?/, ''), checked: at }];
      };
      for (const [ch, vid] of recheck) {
        // still live: the same stream. Ended: a new one may have started, which only its page can tell
        if (vids.has(vid) && vids.get(vid).state === 'live') results.push(result(ch, vid, { name: prev[ch].name })); else rest.push(ch);
      }
      for (const ch of chs) {
        if (ch.startsWith('yt:v:')) { const v = ch.slice(5); results.push(result(ch, vids.has(v) && vids.get(v).state === 'live' ? v : null, null)); continue; }
        const f = feeds.get(ch);
        if (!f) continue;
        results.push(result(ch, f.ids.find(v => vids.has(v) && vids.get(v).state === 'live'), f));
      }
      return { results, rest };
    } catch (e) {
      if (e && e.status) { ytGate.fail(e); ytKeyChanged(); }
      return { results: [], rest: chs };   // this round is checked page by page instead
    }
  }

  /* the channels you follow: the Subscriptions page; for suggestions, read again in the background at most once a
     day while you're signed in (no live state) */
  const importFollows = () => ctx.scrapeFollowPage(YT + '/feed/channels', { scope: FOLLOW_SCOPE, signedOut: SIGNED_OUT_JS });
  let followTried = 0;
  async function followsTick(now) {
    const saved = ctx.follows.saved();
    if ((!saved || now - saved.at > 24 * 3600e3) && now - followTried > 6 * 3600e3 && !ctx.importing.busy() && (await signedIn())) {
      await ctx.importing.run(async () => {
        followTried = now;
        const r = await importFollows().catch(() => null);
        if (r && r.items && r.items.length) ctx.follows.keep(r.items.filter(x => SmvSites.validCh(x.ch)));
      });
    }
  }

  /* a streamer's profile: the channel's own page (no API without a key) */
  async function profile(ch) {
    if (SmvSites.isVideo(ch)) return { missing: true, video: true };
    const url = ch.startsWith('yt:c:') ? YT + '/channel/' + ch.slice(5) : YT + '/' + ch.slice(3);
    const r = await ctx.pageFetch(url, { headers: pageHeaders() });
    if (r.status === 404) return { missing: true };
    return r.ok ? parseYouTubeChannel(await r.text(), ch) : null;
  }

  /* YouTube: cookie question
     In some countries YouTube asks about cookies first and keeps the video paused until you answer.
     The stream page clicks the answer chosen in Settings > YouTube; if that doesn't work (YouTube changed
     the question), it asks for this: "Reject all" saved in that player's storage, as YouTube saves it. */
  ctx.ipc.app.handle('youtube:consentFallback', async (_e, part) => {
    if (typeof part !== 'string' || !(part === site.partition || /^persist:kmv-stream-[\w-]{1,120}$/.test(part))) return false;
    try {
      await ctx.sessionOf(part).cookies.set({ url: YT, domain: '.youtube.com', name: 'SOCS', value: REJECT_ALL,
        secure: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 390 * 86400 });
      return true;
    } catch { return false; }
  });
  /* Copy the login from Firefox
     Google blocks signing in to YouTube inside apps, so YouTube sign-in goes through Firefox:
     you sign in there, and the app copies just the YouTube / Google login out of Firefox's
     cookie database (see firefox-login.js). No extension and no exported file. */
  ctx.ipc.main.handle('youtube:fromFirefox', async () => {
    let r;
    try { r = firefoxLogin.youtubeLoginFromFirefox(); } catch { return { error: 'read' }; }
    if (r.error) return r;
    const n = await ctx.setLoginCookies(r.cookies);
    ctx.toMain('account:changed', { platform: site.id, loggedOut: false });
    let signed = false;
    try { signed = (await ctx.session().cookies.get({})).some(c => LOGIN_COOKIE.test(c.name)); } catch {}
    return { ok: true, count: n, profile: r.profile, signedIn: signed };
  });

  return new SiteAdapter({
    id: site.id, site,
    loginUrl: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F',
    // Google blocks signing in to YouTube inside the app: the page shows how to sign in with Firefox instead
    openLogin: () => ctx.toMain('youtube:signin'),
    named: false,                     // YouTube only tells us that you're signed in
    signedIn,
    async account() { try { return signedInWith(await ctx.session().cookies.get({})); } catch { return false; } },
    // Whether its login cookies still sign you in: its home page, with them, says (Google can sign the app out while
    // they're still here)
    async loginWorks() {
      try {
        const r = await ctx.loginFetch(ytPage(YT + '/'), { headers: ctx.headers(), signal: ctx.netSignal() });
        return r.ok ? loggedInOn(await r.text()) : null;
      } catch { return null; }
    },
    ready: loadYtKey,
    signInAs: { urls: ['https://*.google.com/*', 'https://*.youtube.com/*', 'https://*.gstatic.com/*'], test: isGoogleSignin, userAgent: () => firefoxUA() },
    liveOne, liveBatch,
    follows: { import: importFollows, tick: followsTick, retry() { followTried = 0; } },
    emoteHost: h => /^(\w+\.)?ggpht\.com$/.test(h) || h === 'www.gstatic.com',
    profile,
    byName: name => 'yt:@' + name,
    fromLink,
    heldTitle: 'Held for review'      // (the others' chats: AutoMod)
  });
}

module.exports = { create, describeRequest, fromLink, REJECT_ALL, isGoogleSignin, ytLiveUrl, parseYouTube, parseYtFeed, parseYtVideos, ytErrorReason,
  createKeyGate, createFeedGate, ytNoFeed, nextPacificMidnight };
