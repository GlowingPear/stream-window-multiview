/* ---- What a chat box says instead of the site's "Send a message" (Settings > General > Channel name in chat boxes):
   your text with {channel} replaced by the channel's name. Empty: just the name. Without {channel}: the name goes
   at the end, so the box always says which channel it is. Plain text: it goes into the site's page as text. */
const CHAT_NAME_MAX = 60;           // what you type in the setting, at most
const CHAT_NAME_TOKEN = '{channel}';
const CHAT_NAME_IDEAS = ['{channel}', 'Chat in {channel}', 'Typing in {channel}', 'Message {channel}', '→ {channel}'];

function chatNameText(tpl, name){
  let t = String(tpl == null ? '' : tpl).replace(/\s+/g, ' ').trim().slice(0, CHAT_NAME_MAX);
  if (!t) t = CHAT_NAME_TOKEN;
  if (!t.includes(CHAT_NAME_TOKEN)) t += ' ' + CHAT_NAME_TOKEN;
  return t.split(CHAT_NAME_TOKEN).join(String(name == null ? '' : name)).trim();
}

export { CHAT_NAME_IDEAS, chatNameText };
