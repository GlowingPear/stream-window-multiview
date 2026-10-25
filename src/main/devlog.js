// Settings › Developer: what goes wrong (the error log) and what the sites last answered (site responses), for
// finding out why something isn't working and for Copy diagnostics. Plain data, so it can be tested: main.js feeds
// it (its own warnings and errors, the page's, the chat helpers') and stores the error log.
//
// The error log keeps this run's errors and the run before's (a crash or a restart often follows the problem), the
// last MAX of them, newest last. The same error again straight after is counted, not added. Nothing in it leaves the
// computer unless you copy it, and what could be private (logins, keys, cookies) is taken out as it comes in.
const MAX = 200;
const RESPONSES = 40;
const TEXT_MAX = 600;            // an error's text
const BODY_MAX = 20000;          // a request's or response's body (a site's whole page is cut off here)

// Logins, keys and cookies out of anything written down: address parts (?access_token=…, &key=…), headers
// (Authorization: Bearer …, Cookie: …) and JSON fields ("token": "…").
const SECRET = 'access_token|refresh_token|id_token|token|key|api_key|apikey|client_secret|secret|password|pass|auth|authorization|code|session|sessionid|sid|cookie|xsrf|csrf';
const SECRET_RE = [
  [new RegExp(`([?&#](?:${SECRET})=)[^&#\\s"']*`, 'gi'), '$1…'],
  [/\b(Bearer|Basic|OAuth)\s+[\w.~+/=-]{8,}/gi, '$1 …'],
  [/\b((?:set-)?cookie\s*[:=]\s*)[^\n]*/gi, '$1…'],
  [new RegExp(`("(?:${SECRET}|[\\w-]*token|[\\w-]*secret)"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"…"']
];
function redact(text) {
  let s = String(text == null ? '' : text);
  for (const [re, to] of SECRET_RE) s = s.replace(re, to);
  return s;
}
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const SOURCES = ['main', 'page', 'chat', 'stream'];

// opts: max (entries kept), now (the clock, for the tests). saved: the entries stored at the end of the last run.
function createErrorLog({ max = MAX, now = Date.now, saved = [] } = {}) {
  let entries = (Array.isArray(saved) ? saved : []).filter(e => e && typeof e.msg === 'string' && !e.before)
    .map(e => ({ t: +e.t || 0, src: SOURCES.includes(e.src) ? e.src : 'main', where: clip(e.where || '', 80), msg: clip(e.msg, TEXT_MAX), n: Math.max(1, +e.n || 1), before: true }))
    .slice(-max);
  return {
    // src: 'main' (this side), 'page' (the app's page), 'chat' / 'stream' (the helpers inside a site's page)
    // where: what it's about (a channel, a file and line, "live checks"); msg: the error's text
    add(src, where, msg) {
      msg = clip(redact(msg).trim(), TEXT_MAX); where = clip(redact(where || '').trim(), 80);
      if (!msg) return null;
      src = SOURCES.includes(src) ? src : 'main';
      const last = entries[entries.length - 1];
      if (last && !last.before && last.src === src && last.where === where && last.msg === msg) { last.n++; last.t = now(); return last; }
      const e = { t: now(), src, where, msg, n: 1 };
      entries.push(e);
      if (entries.length > max) entries.splice(0, entries.length - max);
      return e;
    },
    // newest first
    list: () => entries.slice().reverse().map(e => ({ ...e })),
    clear() { entries = []; },
    // what to store for the next run: this run's
    toSave: () => entries.filter(e => !e.before).map(({ t, src, where, msg, n }) => ({ t, src, where, msg, n })),
    get size() { return entries.length; }
  };
}

// What a request to a site is, in words: { site, what } (null: not a site the app asks about channels).
function describeRequest(url, body) {
  let u; try { u = new URL(String(url)); } catch { return null; }
  const h = u.hostname, p = u.pathname;
  if (h === 'gql.twitch.tv') {
    const q = String(body || '');
    const what = /users\s*\(\s*logins/.test(q) ? 'live check (many channels)' : /user\s*\(\s*login/.test(q) ? 'live check'
      : /follow/i.test(q) ? 'follows' : /moderat|isModerator|mod\b/i.test(q) ? 'moderator check' : 'GQL';
    return { site: 'twitch', what };
  }
  if (/(^|\.)twitch\.tv$/.test(h)) return { site: 'twitch', what: /^\/[\w]+\/?$/.test(p) ? 'channel page' : 'page' };
  if (h === 'www.googleapis.com' && /^\/youtube\//.test(p)) return { site: 'youtube', what: 'API ' + p.replace(/^\/youtube\/v3\//, '') };
  if (/(^|\.)youtube\.com$/.test(h)) {
    const what = /\/feeds\/videos\.xml$/.test(p) ? 'channel feed' : /\/live$/.test(p) ? 'live page' : /^\/watch/.test(p) ? 'video page' : 'page';
    return { site: 'youtube', what };
  }
  if (/(^|\.)kick\.com$/.test(h)) {
    const what = /follow/i.test(p) ? 'follows' : /\/api\/v\d\/channels\/[^/]+\/?$/.test(p) ? 'channel' : /\/api\//.test(p) ? 'API ' + p.replace(/^\/api\//, '') : 'page';
    return { site: 'kick', what };
  }
  return null;
}

// The last answers from the sites: { t, site, what, method, url, status, ms, request, body }, newest first. status 0:
// no answer (offline, a time limit). What was sent (request) and the answer's text (body) only when asked to keep
// them (Developer tools on): they can be long. Headers aren't kept (that's where the logins go).
function createSiteLog({ max = RESPONSES, now = Date.now } = {}) {
  const entries = [];
  return {
    record({ site, what, method = 'GET', url, status = 0, ms = 0, request, body, error } = {}) {
      const e = { t: now(), site: site || '', what: clip(what || '', 60), method: String(method || 'GET').toUpperCase(), url: clip(redact(url), 240),
        status: +status || 0, ms: Math.max(0, Math.round(+ms || 0)) };
      if (request != null && request !== '') e.request = clip(redact(request), BODY_MAX);
      if (body != null) e.body = clip(redact(body), BODY_MAX);
      if (error) e.error = clip(redact(error), 200);
      entries.unshift(e);
      if (entries.length > max) entries.length = max;
      return e;
    },
    list: () => entries.map(e => ({ ...e })),
    clear() { entries.length = 0; }
  };
}

// Copy diagnostics: the report, as text for an issue. info: { app, sys, page (the page's own part: lines of text),
// errors, responses }. Everything goes through redact() once more.
const two = n => String(n).padStart(2, '0');
const clock = t => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`; };
const pad = (s, n) => String(s).padEnd(n);
function diagnostics({ app = {}, sys = {}, page = [], errors = [], responses = [] } = {}) {
  const out = ['## Stream Multiview diagnostics', ''];
  out.push(pad('version', 10) + [`${app.version || '?'} (${app.packaged ? 'installed' : 'from source'})`, app.electron && 'Electron ' + app.electron, app.chrome && 'Chrome ' + app.chrome].filter(Boolean).join(' · '));
  out.push(pad('system', 10) + [[sys.os, sys.release, sys.arch].filter(Boolean).join(' '), sys.displays != null && `${sys.displays} monitor${sys.displays === 1 ? '' : 's'}`,
    sys.scale && `scale ${sys.scale}`, sys.locale].filter(Boolean).join(' · '));
  for (const l of [].concat(page || [])) out.push(String(l));
  out.push('', `## Errors (${errors.length}${errors.length ? ', newest first' : ''})`);
  if (!errors.length) out.push('none');
  for (const e of errors.slice(0, 50)) out.push(`${clock(e.t)} ${pad(e.src, 6)} ${e.where ? e.where + ': ' : ''}${e.msg}${e.n > 1 ? ` (×${e.n})` : ''}${e.before ? ' [last run]' : ''}`);
  if (errors.length > 50) out.push(`… and ${errors.length - 50} older`);
  out.push('', `## Site responses (${responses.length}${responses.length ? ', newest first' : ''})`);
  if (!responses.length) out.push('none');
  for (const r of responses.slice(0, 20)) out.push(`${clock(r.t)} ${pad(r.site, 8)} ${pad(r.what, 26)} ${r.status || (r.error ? 'failed' : 'no answer')} ${r.ms} ms${r.error ? ' · ' + r.error : ''}`);
  out.push('', '(Logins, cookies and keys are left out. Channel and chat names can be in it.)');
  return redact(out.join('\n'));
}

module.exports = { createErrorLog, createSiteLog, describeRequest, diagnostics, redact, MAX, RESPONSES };
