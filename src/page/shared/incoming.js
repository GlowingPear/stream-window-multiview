// Everything that reaches the page from outside it comes in through here (the other window's changes come
// through settings.onChange, in shared/settings.js):
//   fromApp('onLiveStatus', fn)   the desktop app's main process (window.kmv, see src/preload.js). Does nothing
//                                 outside the desktop app, or when it doesn't send that.
//   fromSite('emote-copy', fn)    the scripts running inside the sites' chat pages (in-site/), which send
//                                 "__kmv:<kind> <data>" console messages: fn(w, data, view) for the chat window
//                                 it came from. data is a JSON object's text unless a pattern says otherwise.
const siteKinds = new Map();     // kind -> { data, fn }

function fromApp(name, fn){
  const on = window.kmv && window.kmv[name];
  if (typeof on === 'function') on(fn);
}
function fromSite(kind, fn, data = /^\{.*\}$/){ siteKinds.set(kind, { data, fn }); }
// A console message from a chat's page (windows/views.js passes them all on)
function siteMessage(w, view, text){
  const m = /^__kmv:([a-z-]+) (.*)$/.exec(String(text || ''));
  const k = m && siteKinds.get(m[1]);
  if (k && k.data.test(m[2])) k.fn(w, m[2], view);
}

export { fromApp, fromSite, siteMessage };
