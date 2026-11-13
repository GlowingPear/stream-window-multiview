// Kick's shoutouts (chat/shoutout.js; Settings › Shoutouts), plugged into site.js as its `shoutouts`. Nothing here
// touches the page (the unit tests load it on its own).

// Who sent a line in its chat (in-site/shoutout.js, run inside its chat page, so self-contained): from the line's React
// props (m: its message), its sender's slug (its address) and username. A name with _ can have - in its address, so
// without a slug the name is only a name (named: the app looks its address up). -> { login, name, named }, or null
function kickShoutSender(m, clean){
  const s = m.sender || m.user || null;
  return s && (s.slug || s.username) ? { login: clean(s.slug || s.username).toLowerCase(), name: clean(s.username || s.slug), named: !s.slug } : null;
}

// tries(name): the channel addresses a name in its chat can be, in the order to ask the site (the name, then, only if
// Kick hasn't got that one, with - for _, as some Kick names with _ have - in their address and some keep the _).
// command: its own shoutout command (none). page: how its chat page draws a message (in-site/shoutout.js's look).
const kickShoutouts = {
  tries(name){
    const n = String(name || '').trim().replace(/^@/, '').toLowerCase();
    if (!n) return [];
    const dash = n.replace(/_/g, '-');
    return dash === n ? [n] : [n, dash];
  },
  command: null,
  page: {
    line: '[data-index]',                       // a message's line
    bar: 'div[class*="group-hover:flex"]',      // its hover bar
    // its special messages, drawn as cards of their own without a hover bar: a reward redeemed (or a highlighted
    // message), Kicks sent
    special: ['div[class*="border-l-4"]', 'div[class*="border-[#42474D]"]'],
    name: 'button[data-prevent-expand], button.inline.font-bold',   // where a line shows its sender's name
    namesDiffer: true,                          // a name shown isn't always its address (- for _)
    sender: kickShoutSender
  }
};

export { kickShoutouts };
