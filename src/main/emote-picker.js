// Emotes to pick from in a linked streamer's ALL tab (page/chat/all-emotes.js): each one's name, its picture, and what
// to send for it (Kick: [emote:<id>:<name>], which its chat shows as the emote; elsewhere the name).
//
// Each source is one group: the channel's own emotes and the site's (Kick), the sets your Twitch account can use, and
// the channel's 7TV, BetterTTV and FrankerFaceZ add-on emotes.

const MAX = 1500;
const clean = list => {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(e => e && e.name && e.url && e.name.length <= 60 && !seen.has(e.name) && seen.add(e.name)).slice(0, MAX);
};
const group = (id, label, emotes) => { const e = clean(emotes); return e.length ? { id, label, emotes: e } : null; };
// The emotes of other channels you're subscribed to: each with its channel (from), and the channels with their pictures
// (channels: [{ name, pic }], once each), for the picker's row of them and their headings
const PIC = /^https:\/\//;
function subGroup(id, label, sets){
  const g = group(id, label, sets.flatMap(s => s.emotes.map(e => e && { ...e, from: s.name })));
  if (!g) return null;
  const has = new Set(g.emotes.map(e => e.from)), seen = new Set();
  g.channels = sets.filter(s => has.has(s.name) && !seen.has(s.name) && seen.add(s.name)).map(s => ({ name: s.name, ...(PIC.test(s.pic || '') ? { pic: s.pic } : {}) }));
  return g;
}

// Kick: kick.com/emotes/<slug> -> [{ slug, user, emotes: [{ id, name, subscribers_only }] }, …the other channels you're
// subscribed to (signed in: theirs you can use in any chat), { id: 'Global', … }, { id: 'Emoji', … }, { id: 'Collectibles', … }
// (signed in: the ones you've collected)]
function kickGroups(d, slug) {
  if (!Array.isArray(d)) return null;
  const emote = e => e && e.id != null && { name: String(e.name || ''), url: `https://files.kick.com/emotes/${encodeURIComponent(e.id)}/fullsize`, send: `[emote:${e.id}:${e.name}]`,
    ...(e.subscribers_only ? { subs: true } : {}) };
  const own = d.filter(s => s && Array.isArray(s.emotes) && String(s.slug || '').toLowerCase() === String(slug).toLowerCase());
  const yours = d.filter(s => s && Array.isArray(s.emotes) && s.slug && String(s.slug).toLowerCase() !== String(slug).toLowerCase());
  const other = id => d.filter(s => s && Array.isArray(s.emotes) && String(s.id) === id);
  return [
    group('kick-channel', 'Channel', own.flatMap(s => s.emotes.map(emote))),
    // (yours to use: not marked subs)
    subGroup('kick-yours', 'Sub emotes', yours.map(s => ({ name: String((s.user && s.user.username) || s.slug), pic: s.user && s.user.profile_pic,
      emotes: s.emotes.map(e => { const x = emote(e); if (x) delete x.subs; return x; }) }))),
    group('kick-collectibles', 'Collectibles', other('Collectibles').flatMap(s => s.emotes.map(emote))),
    group('kick-global', 'Kick', other('Global').flatMap(s => s.emotes.map(emote))),
    group('kick-emoji', 'Emoji', other('Emoji').flatMap(s => s.emotes.map(emote)))
  ].filter(Boolean);
}
// Twitch: currentUser { emoteSets { id owner { login displayName profileImageURL } emotes { id token } } }: what your account can use
function twitchGroups(d, login) {
  const sets = d && d.data && d.data.currentUser && d.data.currentUser.emoteSets;
  if (!Array.isArray(sets)) return null;
  const emote = e => e && e.id && { name: String(e.token || ''), url: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(e.id)}/default/dark/1.0`, send: String(e.token || '') };
  const owner = s => String((s.owner && (s.owner.login || s.owner.displayName)) || '').toLowerCase();
  const of = test => sets.filter(s => s && Array.isArray(s.emotes) && test(s)).flatMap(s => s.emotes.map(emote));
  return [
    group('twitch-channel', 'Channel', of(s => owner(s) === String(login).toLowerCase())),
    subGroup('twitch-yours', 'Sub emotes', sets.filter(s => s && Array.isArray(s.emotes) && owner(s) && owner(s) !== String(login).toLowerCase() && owner(s) !== 'twitch')
      .map(s => ({ name: String(s.owner.displayName || s.owner.login), pic: s.owner.profileImageURL, emotes: s.emotes.map(emote) }))),
    group('twitch-global', 'Twitch', of(s => !owner(s) || owner(s) === 'twitch'))
  ].filter(Boolean);
}
// 7TV: users/<platform>/<id> -> { emote_set: { emotes: [{ name, data: { host: { url } } }] } }
const stvGroup = d => d && d.emote_set && Array.isArray(d.emote_set.emotes)
  ? group('7tv', '7TV', d.emote_set.emotes.map(e => e && e.data && e.data.host && e.data.host.url && { name: String(e.name || ''), url: `https:${e.data.host.url}/1x.webp`, send: String(e.name || '') })) : null;
// BetterTTV: cached/users/twitch/<id> -> { channelEmotes: [{ id, code }], sharedEmotes: [{ id, code }] }
const bttvGroup = d => d && (Array.isArray(d.channelEmotes) || Array.isArray(d.sharedEmotes))
  ? group('bttv', 'BTTV', [...(d.channelEmotes || []), ...(d.sharedEmotes || [])].map(e => e && e.id && { name: String(e.code || ''), url: `https://cdn.betterttv.net/emote/${encodeURIComponent(e.id)}/1x`, send: String(e.code || '') })) : null;
// FrankerFaceZ: room/id/<id> -> { sets: { <id>: { emoticons: [{ name, urls: { 1: url } }] } } }
const ffzGroup = d => d && d.sets && typeof d.sets === 'object'
  ? group('ffz', 'FFZ', Object.values(d.sets).flatMap(s => (s && Array.isArray(s.emoticons) ? s.emoticons : []).map(e => e && e.urls && e.urls['1'] && { name: String(e.name || ''),
    url: /^https?:/.test(e.urls['1']) ? e.urls['1'] : 'https:' + e.urls['1'], send: String(e.name || '') }))) : null;

module.exports = { kickGroups, twitchGroups, stvGroup, bttvGroup, ffzGroup };
