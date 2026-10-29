// Settings › Developer › Chat events (#233): every kind of event the sites' chat connections send, as the chats in the
// app hear them (page/in-site/feed.js), with how often, when first and last, and its last few samples. Kept in a file
// so they last between runs, and never past a fixed size. Plain data, so it can be tested: main.js stores it.
//
// Export takes out who and what: names, ids and the words of messages become placeholders (the same one each time a
// name comes back), and what's left is each event's shape, to fix and test ALL's readers (page/chat/feed-parse.js).
const SITES = ['kick', 'twitch', 'youtube'];
const KINDS = 300;         // kinds kept for each site (the least recently heard go first)
const SAMPLES = 3;         // samples of each kind, newest last
const SAMPLE_MAX = 8000;   // a sample's text
const KIND_MAX = 120;

const fresh = () => Object.fromEntries(SITES.map(s => [s, {}]));
function tidy(saved) {
  const d = fresh();
  if (!saved || typeof saved !== 'object') return d;
  for (const s of SITES) for (const [k, e] of Object.entries(saved[s] || {})) {
    if (!e || typeof e !== 'object' || typeof k !== 'string' || k.length > KIND_MAX) continue;
    d[s][k] = { n: Math.max(0, +e.n || 0), first: +e.first || 0, last: +e.last || 0,
      samples: (Array.isArray(e.samples) ? e.samples : []).filter(x => x && typeof x.x === 'string').slice(-SAMPLES).map(x => ({ t: +x.t || 0, x: x.x.slice(0, SAMPLE_MAX) })) };
  }
  return d;
}

// saved: what toSave() gave at the end of the last run. now: the clock (for the tests).
function createSampleStore({ saved, now = () => Date.now() } = {}) {
  let data = tidy(saved);
  return {
    // kinds: { "<kind>": { n: how many since the last time, x?: a sample's text } } from one chat of that site
    add(site, kinds) {
      if (!SITES.includes(site) || !kinds || typeof kinds !== 'object') return false;
      const t = now(), d = data[site];
      for (const [k, v] of Object.entries(kinds).slice(0, 200)) {
        if (typeof k !== 'string' || !k || k.length > KIND_MAX || !v || typeof v !== 'object') continue;
        const e = d[k] || (d[k] = { n: 0, first: t, last: t, samples: [] });
        e.n += Math.max(1, Math.min(1e6, +v.n || 1)); e.last = t;
        if (typeof v.x === 'string' && v.x) { e.samples.push({ t, x: v.x.slice(0, SAMPLE_MAX) }); if (e.samples.length > SAMPLES) e.samples.shift(); }
      }
      const keys = Object.keys(d);
      if (keys.length > KINDS) keys.sort((a, b) => d[a].last - d[b].last).slice(0, keys.length - KINDS).forEach(k => delete d[k]);
      return true;
    },
    list: () => data,
    clear() { data = fresh(); },
    toSave: () => data
  };
}

/* ---- export: the shapes without the people ---- */
const NAME_KEY = /^(username|user_name|slug|login|display_?name|displayname|sender_?name|gifter_username|host_username|last_subscriber|author_?name|channel_?name|broadcaster_?(login|name)|user_?login|recipient.*name)$/i;
const NAMES_KEY = /^(gifted_usernames|usernames)$/i;
const ID_KEY = /^(id|uuid|.*_id|.*Id|.*ID|correlation_id|target|nonce|client-nonce)$/;
const KEEP_KEY = /emot|emoji|badge|gift_id|setID|reward_id|sticker|icon|type$/i;   // ids of public things: kept
const TEXT_KEY = /^(content|text|message|body|user_input|optional_message|simpleText|msg|system-msg|reason)$/i;
const URL_KEY = /picture|photo|avatar|thumbnail|profile_image|banner_image|image_url|url$/i;
const PERSON = /^(sender|user|author|gifter|host|pinned_?by|pinnedBy|banned_by|unbanned_by|moderator|recipient|owner|channel|broadcaster|chatter)$/i;

function placeholders() {
  const seen = new Map(), counts = {};
  return (kind, value) => {
    const k = kind + '\n' + String(value).toLowerCase();
    if (!seen.has(k)) { counts[kind] = (counts[kind] || 0) + 1; seen.set(k, `${kind}${counts[kind]}`); }
    return seen.get(k);
  };
}
// The words of a message: each word becomes "word", Kick's [emote:id:name] tags stay (they're the shape)
const words = s => String(s).split(/(\[emote:\d+:[^\]]*\])/).map(p => (/^\[emote:/.test(p) ? p : p.replace(/[^\s]+/g, 'word'))).join('');

function anonJson(v, ph, key = '', inPerson = false) {
  if (Array.isArray(v)) return v.map(x => (NAMES_KEY.test(key) && typeof x === 'string' ? ph('user', x) : anonJson(x, ph, key, inPerson)));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = anonJson(x, ph, k, inPerson || PERSON.test(k) || /^author/i.test(k));
    return out;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.stringify(anonJson(JSON.parse(t), ph, key, inPerson)); } catch {}
    }
    if (!v || KEEP_KEY.test(key)) return v;
    if (URL_KEY.test(key) && /^https?:|^\/\//.test(v)) return 'https://example.invalid/' + ph('file', v);
    if (NAME_KEY.test(key) || (inPerson && /^(name|simpleText|text)$/i.test(key))) return ph('user', v);
    if (ID_KEY.test(key)) return ph('id', v);
    if (TEXT_KEY.test(key)) return words(v);
    return v;
  }
  if (typeof v === 'number' && ID_KEY.test(key) && !KEEP_KEY.test(key) && v > 999) return +ph('', v).replace(/\D/g, '') || 0;
  return v;
}

// A Twitch chat line (IRC): who, the channel, ids and the words out; what kind of line and its tags' names stay
const IRC_PERSON_TAG = /^(display-name|login|user-id|room-id|target-user-id|reply-parent-display-name|reply-parent-user-login|reply-parent-user-id|reply-thread-parent-display-name|reply-thread-parent-user-login|reply-thread-parent-user-id|msg-param-(recipient-display-name|recipient-user-name|recipient-id|login|displayName|sender-login|sender-name|gifter-login|gifter-name|origin-id|prior-gifter-display-name|prior-gifter-user-name|prior-gifter-id))$/;
const IRC_ID_TAG = /^(id|target-msg-id|reply-parent-msg-id|reply-thread-parent-msg-id|client-nonce|msg-param-origin-id|custom-reward-id)$/;
const IRC_TEXT_TAG = /^(system-msg|reply-parent-msg-body|msg-param-message)$/;
function anonIrc(line, ph) {
  let rest = String(line), tags = '';
  if (rest.startsWith('@')) { const i = rest.indexOf(' '); tags = rest.slice(1, i < 0 ? undefined : i); rest = i < 0 ? '' : rest.slice(i + 1); }
  const tagOut = tags ? '@' + tags.split(';').map(kv => {
    const i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
    if (!v) return kv;
    if (IRC_PERSON_TAG.test(k)) return `${k}=${/id$/i.test(k) ? ph('id', v) : ph('user', v)}`;
    if (IRC_ID_TAG.test(k)) return `${k}=${ph('id', v)}`;
    if (IRC_TEXT_TAG.test(k)) return `${k}=${v.split('\\s').map(w => (w ? 'word' : w)).join('\\s')}`;
    return kv;
  }).join(';') + ' ' : '';
  const trail = rest.indexOf(' :');
  let head = trail < 0 ? rest : rest.slice(0, trail), text = trail < 0 ? null : rest.slice(trail + 2);
  head = head.replace(/^:([^!\s]+)(![^@\s]+)?(@\S+)?/, (m, nick) => { const u = ph('user', nick); return `:${u}${m.includes('!') ? `!${u}@${u}.tmi.twitch.tv` : ''}`; })
    .replace(/#(\w+)/g, (m, c) => '#' + ph('channel', c));
  if (text !== null && !/^(PING|PONG|CAP|00\d|37\d)\b/.test(head.replace(/^:\S+\s/, ''))) text = words(text);
  return tagOut + head + (text === null ? '' : ' :' + text);
}
function anonymise(site, text, ph) {
  const t = String(text).trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { return anonJson(JSON.parse(t), ph); } catch {} }
  return site === 'twitch' ? anonIrc(t, ph) : words(t);
}

// The export: every kind with its status (known: { site: { kind: what ALL does with it } } from the page), the kinds
// ALL knows that haven't come yet, and the samples without names, ids or words.
// quiet: { site: a pattern (its source) } for the connections' own kinds, marked 'ignored'.
function exportSamples(data, known, { now = () => Date.now(), version = '', quiet = {} } = {}) {
  known = known && typeof known === 'object' ? known : {};
  const ph = placeholders(), d = tidy(data);
  const out = { what: 'Stream Multiview chat event samples (Settings › Developer › Chat events)', version, made: new Date(now()).toISOString(),
    note: 'Names, ids and the words of messages are placeholders (user1, id1, word); the same name is the same placeholder throughout.', sites: {} };
  for (const s of SITES) {
    const k = known[s] && typeof known[s] === 'object' ? known[s] : {};
    let q = null; try { q = quiet && typeof quiet[s] === 'string' && quiet[s] ? new RegExp(quiet[s]) : null; } catch {}
    const kinds = Object.entries(d[s]).sort((a, b) => b[1].last - a[1].last).map(([kind, e]) => ({
      kind, status: k[kind] ? 'shown' : q && q.test(kind) ? 'ignored' : 'unknown', does: k[kind] || '', n: e.n, first: new Date(e.first).toISOString(), last: new Date(e.last).toISOString(),
      samples: e.samples.map(x => anonymise(s, x.x, ph))
    }));
    out.sites[s] = { needed: Object.keys(k).filter(kind => !d[s][kind]), kinds };
  }
  return out;
}

module.exports = { createSampleStore, exportSamples, anonymise, placeholders, SITES };
