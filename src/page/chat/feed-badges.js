// The badges ALL draws (host, mod, vip, sub, og, verified, staff, gifter), from each site's own name for them: for the
// sites' chat readers (sites/<id>/feed.js) and ALL's badge pictures (chat/all-chat.js). Imports nothing.
const BADGES = {
  broadcaster: 'host', owner: 'host', moderator: 'mod', lead_moderator: 'mod', vip: 'vip', subscriber: 'sub', founder: 'sub', member: 'sub',
  og: 'og', verified: 'verified', partner: 'verified', staff: 'staff', admin: 'staff', global_mod: 'staff', sub_gifter: 'gifter'
};
const badgeKinds = list => [...new Set(list.map(b => BADGES[String(b).toLowerCase()]).filter(Boolean))];

export { badgeKinds, BADGES };
