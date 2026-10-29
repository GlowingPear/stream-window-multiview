import { allOn } from './all-chat.js';
import { ROLE, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { leaderOf, tabChannels } from '../windows/frames.js';
import { askIn } from '../windows/view.js';

/* ---- New messages in the chats you can't see (Settings > Chat > Count new messages in chats you can't see, off
   unless switched on). While it's on, every chat is asked every 3 s how many new messages others wrote since the last
   time (the chat helper's count(), in-site/mentions.js). A chat you can't see right now (hidden by Chat Stage or Chat
   Rail, scrolled out of the window, or covered by another window or a dialog) adds them up until you can see it
   again. The parts that show the counts (Chat Stage's strip, Chat Rail's tabs, the switch control, the streams'
   title bars) watch 'unread' in the store. */
let unread = new WeakMap(), asking = false, countsOn = false;

const newCount = w => (countsOn && w && unread.get(w)) || 0;
// A chat's count, by channel (for a stream window or the switch control)
const newFor = ch => newCount(wins.find(w => w.kind === 'chat' && w.channel === ch));
function clearNew(w){ if (unread.has(w)){ unread.delete(w); store.changed('unread'); } }
function forgetNew(){ unread = new WeakMap(); store.changed('unread'); }
// Can you see this chat now: shown, in the window, and not under another window at the points tried
function canSee(w){
  // a hidden tab whose messages its window's ALL tab shows (chat/all-chat.js): seen when that window is
  const lead = w && w.frame && w.hiddenTab ? leaderOf(w) : null;
  if (lead && lead !== w && allOn(lead) && tabChannels(lead).includes(w.channel)) return canSee(lead);
  if (!w || !w.el || !w.el.isConnected || !w.el.offsetParent || getComputedStyle(w.el).visibility === 'hidden') return false;
  const r = w.el.getBoundingClientRect();
  if (r.width < 20 || r.height < 20) return false;
  return [[.5, .5], [.3, .25], [.7, .75]].some(([fx, fy]) => {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const e = document.elementFromPoint(x, y);
    return !!e && w.el.contains(e);
  });
}
// n new messages in chat w: counted unless you can see it, and a chat you can see is read
function addNew(w, n){
  if (!countsOn || !w) return;
  if (canSee(w)){ clearNew(w); return; }
  if (!n) return;
  unread.set(w, newCount(w) + n);
  store.changed('unread');
}
async function askChats(){
  if (asking || !countsOn) return;
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
function setCountsOn(on){
  countsOn = !!on;
  settings.set('chatCounts', countsOn);
  forgetNew();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  countsOn = settings.flag('chatCounts', false);
  if (DESKTOP && ROLE === 'main') setInterval(askChats, 3000);
  const sw = document.getElementById('chatCountsSet');
  if (sw){
    const row = sw.closest('.st-row');
    row.hidden = row.previousElementSibling.hidden = !DESKTOP;   // its group too: the chats are asked from the app
    sw.checked = countsOn;
    sw.addEventListener('change', () => setCountsOn(sw.checked));
  }
  // changed in the other window
  settings.onChange(['chatCounts'], () => { countsOn = settings.flag('chatCounts', false); if (sw) sw.checked = countsOn; forgetNew(); });
  window.chatNew = (ch, n) => addNew(wins.find(w => w.kind === 'chat' && w.channel === ch), n); window.chatNewFor = newFor;   // for the tests
}

export { clearNew, init, newCount, newFor };
