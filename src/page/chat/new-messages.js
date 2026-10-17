import { ROLE, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { askIn } from '../windows/view.js';

/* ---- New messages in the chats you can't see, for the layouts that keep some chats open out of sight (Chat Stage,
   Chat Rail). While one of them is on, every chat is asked every 3 s how many new messages others wrote since the
   last time (the chat helper's count(), in-site/mentions.js). A chat out of sight adds them up until it's shown
   again; the one you can see stays at 0. */
// The layouts that count: { on: () => is it the layout now, seen: w => can you see this chat, changed: w => redraw }
const counters = [];
let unread = new WeakMap(), asking = false;

const newCount = w => (w && unread.get(w)) || 0;
function clearNew(w){ unread.delete(w); }
function forgetNew(){ unread = new WeakMap(); }
function countFor(c){ counters.push(c); }
// n new messages in chat w: counted for the layout that's on, unless you can see it
function addNew(w, n){
  const c = counters.find(c => c.on());
  if (!c || !w) return;
  if (c.seen(w)) unread.delete(w);
  else if (n) unread.set(w, newCount(w) + n);
  c.changed(w);
}
async function askChats(){
  if (asking || !counters.some(c => c.on())) return;
  asking = true;
  try {
    for (const w of [...wins]){
      if (w.kind !== 'chat' || !w.ready || !w.view) continue;
      let n;
      try { n = await askIn(w.view, 'window.__kmvMention && window.__kmvMention.count ? window.__kmvMention.count() : 0'); } catch { continue; }
      addNew(w, +n || 0);
    }
  } finally { asking = false; }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  if (DESKTOP && ROLE === 'main') setInterval(askChats, 3000);
  window.chatNew = (ch, n) => addNew(wins.find(w => w.kind === 'chat' && w.channel === ch), n);   // for the tests
}

export { clearNew, countFor, forgetNew, init, newCount };
