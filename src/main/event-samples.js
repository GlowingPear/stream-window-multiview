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

// A sample's variant: the value of the first status or moderation_action field in its text, at any depth of quoting
// (an AutoMod hold's PENDING, then ALLOWED or DENIED); '' for one without. The page's sampler reads it the same way.
const VARIANT = /(\\*)"(status|moderation_action)\1"\s*:\s*\1"([^"\\]{1,40})\1"/;
const variantOf = x => { const m = VARIANT.exec(x); return m ? m[2] + '=' + m[3] : ''; };
// Past SAMPLES, the oldest sample whose variant a newer one also has goes first, so the last of a variant stays
// (a PENDING among many ALLOWEDs); when every one differs, the oldest
function trim(samples) {
  while (samples.length > SAMPLES) {
    const vs = samples.map(x => variantOf(x.x));
    const i = vs.findIndex((v, j) => vs.indexOf(v, j + 1) > j);
    samples.splice(i < 0 ? 0 : i, 1);
  }
}

// saved: what toSave() gave at the end of the last run. now: the clock (for the tests).
function createSampleStore({ saved, now = () => Date.now() } = {}) {
  let data = tidy(saved);
  return {
    // kinds: { "<kind>": { n: how many since the last time, xs?: samples' texts, oldest first } } from one chat of that site
    add(site, kinds) {
      if (!SITES.includes(site) || !kinds || typeof kinds !== 'object') return false;
      const t = now(), d = data[site];
      for (const [k, v] of Object.entries(kinds).slice(0, 200)) {
        if (typeof k !== 'string' || !k || k.length > KIND_MAX || !v || typeof v !== 'object') continue;
        const e = d[k] || (d[k] = { n: 0, first: t, last: t, samples: [] });
        e.n += Math.max(1, Math.min(1e6, +v.n || 1)); e.last = t;
        if (Array.isArray(v.xs)) {
          v.xs.slice(0, 20).filter(x => typeof x === 'string' && x).slice(0, SAMPLES).forEach(x => e.samples.push({ t, x: x.slice(0, SAMPLE_MAX) }));
          trim(e.samples);
        }
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
// Names go by what a field is called, wherever it is: anything ending in login, user name, display name or slug
// (source_display_name, target_login, curator_login, clip_slug, sourceLogin, targetUserDisplayName, …)
const NAME_KEY = /(^|_)(user_?name|login|display_?name|slug|sender_?name|author_?name|channel_?name|broadcaster_?name)$|^(last_subscriber|recipient.*name)$|[a-z](login|display_?name|user_?name|channel_?name)$/i;
const NAMES_KEY = /(^|_)usernames$/i;
const ID_KEY = /^(id|uuid|.*_id|.*Id|.*ID|correlation_id|target|nonce|client-nonce)$/;
const KEEP_KEY = /emot|emoji|badge|gift_id|setID|reward_id|sticker|icon|type$/i;   // ids of public things: kept
const TEXT_KEY = /^(content|text|message|body|user_input|optional_message|simpleText|msg|system-msg|reason)$/i;
// A stream's or clip's title (session_title, target_stream_name, a clip's title, the stream's status): its words out.
// A reward's title stays (Kick's reward_title, Twitch's reward.title): it's the channel's reward, not a person.
const TITLE_KEY = /(^|_)title$|_stream_name$|^(old_)?status$/i;
const URL_KEY = /picture|photo|avatar|thumbnail|profile_image|banner_image|image_url|url/i;
const PERSON = /^(sender|user|author|gifter|host|pinned_?by|pinnedBy|banned_by|unbanned_by|moderator|recipient|owner|channel|broadcaster|chatter)$/i;
// Kick's connection names (chatrooms.123.v2, channel_123, private-channelpoints-123): the name stays, its id doesn't
const KICK_CHANNEL = /^(chatrooms?|channel|private(-[a-z]+)*|[a-z]+-channel)([._-])(\d+)(\.v\d+)?$/;

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
const numId = (v, ph) => +ph('', v).replace(/\D/g, '') || 0;

// One value, by its field's name. ctx: { person: inside someone, reward: inside a reward, pic: inside a picture's
// field, whose links are named by their size (Twitch's profile_image_urls: { "150x150": … }; a field named as a size is
// one too, for JSON cut short) }
function anonValue(key, v, ph, ctx = {}) {
  if (typeof v === 'number') return ID_KEY.test(key) && !KEEP_KEY.test(key) && v > 999 ? numId(v, ph) : v;
  if (typeof v !== 'string' || !v || KEEP_KEY.test(key)) return v;
  if ((URL_KEY.test(key) || ctx.pic || /^\d+x\d*$/.test(key)) && /^https?:|^\/\//.test(v)) return 'https://example.invalid/' + ph('file', v);
  if (NAME_KEY.test(key) || (ctx.person && /^(name|simpleText|text)$/i.test(key))) return ph('user', v);
  if (key === 'channel') { const m = v.match(KICK_CHANNEL); return m ? v.replace(/\d+/, d => numId(+d, ph)) : ph('channel', v); }
  if (ID_KEY.test(key)) return ph('id', v);
  if (TEXT_KEY.test(key) || (TITLE_KEY.test(key) && !ctx.reward && !/reward/i.test(key))) return words(v);
  return v;
}

function anonJson(v, ph, key = '', ctx = {}) {
  if (Array.isArray(v)) return v.map(x => (NAMES_KEY.test(key) && typeof x === 'string' ? ph('user', x) : anonJson(x, ph, key, ctx)));
  if (v && typeof v === 'object') {
    const out = {};
    // a status next to an old_status is the stream's title (Twitch's broadcast_settings_update); elsewhere a status is a state
    for (const [k, x] of Object.entries(v)) out[k] = anonJson(x, ph, k === 'status' && !('old_status' in v) ? 'state' : k,
      { person: ctx.person || PERSON.test(k) || /^author/i.test(k), reward: ctx.reward || /reward/i.test(k), pic: ctx.pic || URL_KEY.test(k) });
    return out;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.stringify(anonJson(JSON.parse(t), ph, key, ctx)); } catch {}
    }
  }
  return anonValue(key, v, ph, ctx);
}

// JSON cut short (a sample past its size): it can't be read whole, so each "field": value pair in it, at any depth of
// quoting (a JSON string inside JSON), goes by its field's name as above, and a value the cut leaves open goes
const PAIR = /(\\*)"([^"\\]+)\1"(\s*:\s*)(?:\1"([^"\\]*)\1"|(-?\d+)(?=\s*[,}\]\\]))/g;
function anonCut(text, ph) {
  let last = 0;
  const out = text.replace(PAIR, (m, q, k, sep, str, num, at) => {
    last = at + m.length;
    return `${q}"${k}${q}"${sep}` + (str !== undefined ? `${q}"${anonValue(k, str, ph)}${q}"` : String(anonValue(k, +num, ph)));
  });
  const cut = out.length - (text.length - last);
  return out.slice(0, cut) + out.slice(cut).replace(/(\\*)"([^"\\]*)$/, '$1"…');
}

// A Twitch chat line (IRC): who, the channel, ids and the words out; what kind of line and its tags' names stay.
// Tags go by their names too: one ending in a name or login is someone (msg-param-recipient-display-name,
// msg-param-prior-gifter-user-name, …), one ending in id an id (but msg-id is what kind of line), one ending in URL a file.
const IRC_TEXT_TAG = /^(system-msg|reply-parent-msg-body|msg-param-message|msg-param-sub-plan-name|msg-param-goal-description)$/;
const IRC_PERSON_TAG = /(^|-)(display-?name|login|user-?name|user-login|name)$/i;
const IRC_ID_TAG = /((^|-)id|Id)$|^client-nonce$/;
const IRC_KIND_TAG = /^(source-)?msg-id$/;
function anonIrc(line, ph) {
  let rest = String(line), tags = '';
  if (rest.startsWith('@')) { const i = rest.indexOf(' '); tags = rest.slice(1, i < 0 ? undefined : i); rest = i < 0 ? '' : rest.slice(i + 1); }
  const tagOut = tags ? '@' + tags.split(';').map(kv => {
    const i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
    if (!v || IRC_KIND_TAG.test(k)) return kv;
    if (IRC_TEXT_TAG.test(k)) return `${k}=${v.split('\\s').map(w => (w ? 'word' : w)).join('\\s')}`;
    if (/url$/i.test(k) && /^https?:/.test(v)) return `${k}=https://example.invalid/${ph('file', v)}`;
    if (IRC_PERSON_TAG.test(k)) return `${k}=${ph('user', v)}`;
    if (IRC_ID_TAG.test(k)) return `${k}=${ph('id', v)}`;
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
  if (t.startsWith('{') || t.startsWith('[')) { try { return anonJson(JSON.parse(t), ph); } catch { return anonCut(t, ph); } }
  return site === 'twitch' ? anonIrc(t, ph) : words(t);
}

// The export: every kind with its status (known: { site: { kind: what ALL does with it } } from the page), the kinds
// ALL knows that haven't come yet, and the samples without names, ids or words.
// ignored: { site: { kind: why ALL leaves it out } }, marked 'ignored' with why.
// ph: the placeholders to use (the report's, so a name is the same one in its raw messages and its events)
function exportSamples(data, known, { now = () => Date.now(), version = '', ignored = {}, ph = placeholders() } = {}) {
  known = known && typeof known === 'object' ? known : {};
  const d = tidy(data);
  const out = { what: 'Stream Multiview chat event samples (Settings › Developer › Chat events)', version, made: new Date(now()).toISOString(),
    note: 'Names, ids and the words of messages are placeholders (user1, id1, word); the same name is the same placeholder throughout.', sites: {} };
  for (const s of SITES) {
    const k = known[s] && typeof known[s] === 'object' ? known[s] : {};
    const ig = ignored && ignored[s] && typeof ignored[s] === 'object' ? ignored[s] : {};
    const kinds = Object.entries(d[s]).sort((a, b) => b[1].last - a[1].last).map(([kind, e]) => ({
      kind, status: k[kind] ? 'shown' : ig[kind] ? 'ignored' : 'unknown', does: k[kind] || (ig[kind] ? String(ig[kind]) : ''), n: e.n, first: new Date(e.first).toISOString(), last: new Date(e.last).toISOString(),
      samples: e.samples.map(x => anonymise(s, x.x, ph))
    }));
    out.sites[s] = { needed: Object.keys(k).filter(kind => !d[s][kind]), kinds };
  }
  return out;
}

// ALL's report for a fix (page/chat/all-health.js): each site's state, its last raw messages (all, and those no reader
// understood) and its newest chat line's HTML (its words already taken out in the page), plus that site's chat events,
// with names, ids and words replaced throughout (one set of placeholders for the whole report). report.ignored: the
// kinds ALL leaves out on purpose, as for the export
function healthReport(report, data, { now = () => Date.now(), version = '' } = {}) {
  const ph = placeholders(), sites = Array.isArray(report && report.sites) ? report.sites.filter(s => s && SITES.includes(s.site)).slice(0, 6) : [];
  const evs = exportSamples(data, report && report.known, { now, version, ph, ignored: (report && report.ignored) || {} });
  return { what: 'Stream Multiview ALL report (for a fix)', version, made: new Date(now()).toISOString(),
    note: 'Names, ids and the words of messages are placeholders (user1, id1, word).',
    sites: sites.map(s => ({ site: s.site, state: String(s.state || ''), what: String(s.what || ''), why: String(s.why || '').replace(/\b(on|from) \S+$/, '$1 …'),
      since: String(s.since || ''), sends: (Array.isArray(s.sends) ? s.sends : []).map(String).slice(-5), lines: Number.isFinite(s.lines) ? s.lines : null,
      raws: (Array.isArray(s.raws) ? s.raws : []).slice(-20).map(x => anonymise(s.site, x, ph)),
      badRaws: (Array.isArray(s.badRaws) ? s.badRaws : []).slice(-10).map(x => anonymise(s.site, x, ph)),
      lineHtml: String(s.lineHtml || '').slice(0, 6000), events: evs.sites[s.site] })) };
}

module.exports = { createSampleStore, exportSamples, healthReport, anonymise, placeholders, SITES };
