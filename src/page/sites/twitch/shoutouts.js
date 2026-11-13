// Twitch's shoutouts (chat/shoutout.js; Settings › Shoutouts), plugged into site.js as its `shoutouts`. Nothing here
// touches the page (the unit tests load it on its own).

// Who sent a line in its chat (in-site/shoutout.js, run inside its chat page, so self-contained): from the line's React
// props (m: its message), its user's login, or a raid's notice's params (who raided). -> { login, name, named }, or null
function twitchShoutSender(m, clean){
  const u = m.user || null;
  if (u && u.userLogin) return { login: clean(u.userLogin).toLowerCase(), name: clean(u.userDisplayName || u.userLogin), named: false };
  const p = m.params || m.msgParams;   // (a raid's notice: who raided)
  if (p && (p.login || p['msg-param-login'])) return { login: clean(p.login || p['msg-param-login']).toLowerCase(), name: clean(p.displayName || p['msg-param-displayName'] || p.login), named: false };
  return null;
}

// tries: null (a name in its chat is its address). command: its own shoutout command, sent after the message where
// you're a mod (Settings › Shoutouts › Twitch's own shoutout too). page: how its chat page draws a message
// (in-site/shoutout.js's look).
const twitchShoutouts = {
  tries: null,
  command: '/shoutout',
  page: {
    line: '.chat-line__message, .user-notice-line',   // a message's line
    bar: '.chat-line__icons',                          // its hover bar
    special: ['.user-notice-line', '[class*="channel-points-reward"]'],   // its lines without a hover bar
    name: '.chat-author__display-name, [data-a-target="chat-message-username"]',   // where a line shows its sender's name
    namesDiffer: false,                                // a name shown is its login
    sender: twitchShoutSender
  }
};

export { twitchShoutouts };
