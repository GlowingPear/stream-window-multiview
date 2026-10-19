import { stickAgent } from '../in-site/stick-bottom.js';
import { platform } from '../platforms/platforms.js';
import { runIn } from '../windows/view.js';

/* ---- Chats stay at their newest messages: the script inside each chat (in-site/stick-bottom.js) puts the chat back
   at the bottom when the site leaves it a few lines up (after it was out of sight, resized or zoomed), unless you
   scrolled up to read. A chat you switch to (Chat Stage's stage, Chat Rail's rail) goes to its newest messages at once. */

// Starts it in a chat, when its page is ready
function startStick(w){
  if (!w || w.kind !== 'chat' || !w.view || !w.ready) return;
  runIn(w.view, `(${stickAgent.toString()})(${JSON.stringify(platform(w.channel).chatScroll || {})})`);
}
// A chat you just switched to: its newest messages
function toNewest(w){
  if (w && w.kind === 'chat' && w.view) runIn(w.view, 'window.__kmvStick && window.__kmvStick.now()');
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.stickAgent = stickAgent;   // for the tests
}

export { init, startStick, toNewest };
