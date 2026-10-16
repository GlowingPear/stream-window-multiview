// New emotes: which of a channel's emotes were added since you last opened its chat.
//
// Each source keeps its own list (the channel's own emotes on Kick or Twitch, and the 7TV, BetterTTV and
// FrankerFaceZ add-ons), so a source that couldn't be reached this time doesn't make all its emotes look new
// next time. The first time a source is seen it only becomes the starting point: nothing is new yet.
// A new emote stays new until you point at it in chat, it leaves the channel, or 14 days pass.

const DAY = 864e5;
const KEEP_NEW = 14 * DAY;
const MAX_CHANNELS = 300;
const MAX_NAMES = 3000;

const names = list => [...new Set((Array.isArray(list) ? list : []).map(x => String(x || '').trim()).filter(n => n && n.length <= 60))].slice(0, MAX_NAMES);

// Kick: kick.com/emotes/<slug> -> [{ slug, user_id, emotes: [{ name }] }, { id: 'Global', … }, { id: 'Emoji', … }]
function parseKickEmotes(d, slug) {
  if (!Array.isArray(d)) return null;
  const own = d.filter(s => s && Array.isArray(s.emotes) && String(s.slug || '').toLowerCase() === String(slug).toLowerCase());
  if (!own.length) return { names: [], userId: null };
  return { names: names(own.flatMap(s => s.emotes.map(e => e && e.name))), userId: own[0].user_id != null ? String(own[0].user_id) : null };
}
// Twitch: user { id, subscriptionProducts { emotes { token } } }
function parseTwitchEmotes(d) {
  const u = d && d.data && d.data.user;
  if (!u) return null;
  const products = Array.isArray(u.subscriptionProducts) ? u.subscriptionProducts : [];
  return { names: names(products.flatMap(p => (p && Array.isArray(p.emotes) ? p.emotes : []).map(e => e && e.token))), userId: u.id ? String(u.id) : null };
}
// 7TV: users/<platform>/<id> -> { emote_set: { emotes: [{ name }] } }
const parse7tv = d => (d && d.emote_set && Array.isArray(d.emote_set.emotes) ? names(d.emote_set.emotes.map(e => e && e.name)) : null);
// BetterTTV: cached/users/twitch/<id> -> { channelEmotes: [{ code }], sharedEmotes: [{ code }] }
const parseBttv = d => (d && (Array.isArray(d.channelEmotes) || Array.isArray(d.sharedEmotes))
  ? names([...(d.channelEmotes || []), ...(d.sharedEmotes || [])].map(e => e && e.code)) : null);
// FrankerFaceZ: room/id/<id> -> { sets: { <id>: { emoticons: [{ name }] } } }
const parseFfz = d => (d && d.sets && typeof d.sets === 'object'
  ? names(Object.values(d.sets).flatMap(s => (s && Array.isArray(s.emoticons) ? s.emoticons : []).map(e => e && e.name))) : null);

// The store: { v: 1, ch: { [channel]: { src: { [source]: [names] }, fresh: { [name]: since }, at } } }
function createEmoteStore(data, { now = () => Date.now() } = {}) {
  const d = data && data.v === 1 && data.ch && typeof data.ch === 'object' ? data : { v: 1, ch: {} };
  let changed = false;

  // This open's lists ({ [source]: [names] }, only the sources that answered) -> the names added since last time
  function update(ch, lists) {
    const t = now();
    const e = d.ch[ch] || (d.ch[ch] = { src: {}, fresh: {}, at: t });
    const added = [];
    for (const [src, list] of Object.entries(lists || {})) {
      if (!Array.isArray(list)) continue;
      const cur = names(list), before = e.src[src];
      if (Array.isArray(before)) {
        const had = new Set(before);
        for (const n of cur) if (!had.has(n) && !e.fresh[n]) { e.fresh[n] = t; added.push(n); }
      }
      e.src[src] = cur;
    }
    // gone from the channel, or new for too long: not new any more
    const all = new Set(Object.values(e.src).flat());
    for (const [n, since] of Object.entries(e.fresh)) if (!all.has(n) || t - since > KEEP_NEW) delete e.fresh[n];
    e.at = t;
    trim();
    changed = true;
    return added;
  }
  const fresh = ch => Object.keys((d.ch[ch] && d.ch[ch].fresh) || {});
  function seen(ch, name) {
    const e = d.ch[ch];
    if (!e || !e.fresh[name]) return false;
    delete e.fresh[name]; changed = true;
    return true;
  }
  function trim() {
    const keys = Object.keys(d.ch);
    if (keys.length <= MAX_CHANNELS) return;
    keys.sort((a, b) => d.ch[a].at - d.ch[b].at).slice(0, keys.length - MAX_CHANNELS).forEach(k => delete d.ch[k]);
  }
  return { update, fresh, seen, data: () => d, takeChanged: () => { const c = changed; changed = false; return c; } };
}

module.exports = { parseKickEmotes, parseTwitchEmotes, parse7tv, parseBttv, parseFfz, createEmoteStore, KEEP_NEW };
