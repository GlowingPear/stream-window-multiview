import { BADGES, badgeKinds } from './feed-badges.js';
import { PLATFORMS } from '../sites/sites.js';

/* ---- Each site's chat data (its in-site/feed tap) as one kind of message, for the ALL tab (chat/all-chat.js) ----
   Each site's reader is its folder's feed.js (sites/<id>/feed.js, its module's `feed`): this is what they share.
   A message: { site, kind, id, t, sender, login, color, badges: ['moderator', …], parts: [{ text } | { emote, name }],
   reply?: { id, sender, login, body }, action?, highlight?, bits?, text? (an event's own words), userId?, pics?, support? }.
   support: someone supporting the stream, for support alerts (alerts/spam-alerts.js): { kind, who, n, unit?, amt?, to?, group? },
   kind as the sites' support wordings name it (kicks, bits, gifts, gift, sub, superchat, member, raid).
   pics: its badges as the site shows them, in its order, for their pictures: [{ set, v } (the site's badge and version,
   its picture asked for once: in-site/feed.js badgesAgent) | { url, title } (the picture came with it)].
   kind: 'message', 'event' (a sub, gift, raid, Super Chat…), 'delete' ({ target, ai?, rules? }) or 'clear' (all of
   one person's messages: { login } or { userId }). Anything it can't read is left out (null). */

// Every message in a batch from one chat ("__kmv:feed"), in order: unreadable ones left out (and none from a site
// without a reader)
function parseFeed(batch){
  const f = batch && PLATFORMS[batch.s] && PLATFORMS[batch.s].feed;
  return f && Array.isArray(batch.raw) ? batch.raw.map(r => { try { return f.parse(r); } catch { return null; } }).filter(Boolean) : [];
}
// The sites with a reader, and theirs
const sitesWithFeed = () => Object.values(PLATFORMS).filter(p => p.feed);

// What ALL does with each kind of event, named as the chats' readers count them (each site's in-site/feed tap), for
// Settings › Developer › Chat events: a kind here that hasn't come yet is one ALL still needs; one that came and isn't
// here, ALL doesn't know. A new kind ALL reads goes in its site's feed.js (known). { site: { kind: what ALL does } }
const known = () => Object.fromEntries(sitesWithFeed().map(p => [p.id, p.feed.known]));
// Kinds ALL hears and leaves out on purpose, and why (Settings › Developer › Chat events lists them as Ignored, not
// unknown): the connections' own housekeeping, news only for you (your points), and the sites' panels (goals,
// leaderboards). One the sites start sending that ALL has no use for goes in its site's feed.js (ignored).
const ignored = () => Object.fromEntries(sitesWithFeed().map(p => [p.id, p.feed.ignored]));
// Why ALL leaves a kind out, or ''
const ignoredWhy = (site, kind) => { const f = PLATFORMS[site] && PLATFORMS[site].feed; return !f ? '' : f.ignored[kind] || f.ignoredMore(kind); };
// Whether ALL leaves out something a chat handed over on purpose (not one it couldn't read): a site whose tap passes on
// everything (YouTube's: its feed's kindOf), the ones ALL ignores too (the others' leave those out)
const leftOut = (site, raw) => { const f = PLATFORMS[site] && PLATFORMS[site].feed; return !!(f && f.kindOf) && !!raw && typeof raw === 'object' && !!ignoredWhy(site, f.kindOf(raw)); };
// The kinds heard (samples: { site: { kind: … } }) that ALL leaves out on purpose: { site: { kind: why } }, for the
// chat events' export and ALL's report
const ignoredKinds = samples => Object.fromEntries(sitesWithFeed().map(p => [p.id, Object.fromEntries(Object.keys((samples && samples[p.id]) || {})
  .filter(k => !p.feed.known[k] && ignoredWhy(p.id, k)).map(k => [k, ignoredWhy(p.id, k)]))]));

// (one object; each site's own readers are its feed: PLATFORMS[site].feed)
const feedParse = { known, ignored, ignoredWhy, ignoredKinds, leftOut, parseFeed, badgeKinds, BADGES };

export { feedParse };
