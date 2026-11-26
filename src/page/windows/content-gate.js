import { wins } from '../core.js';
import { gateAgent } from '../in-site/content-gate.js';
import { platform, srcFor } from '../platforms/platforms.js';
import { settings } from '../shared/settings.js';
import { loadView, runEarly } from './view.js';

/* A site's player whose content gate stays up after its own "Watch Anyway" (its site.js's contentGate: Twitch's, for a
   stream whose labels your Twitch content preferences limit). Pressing it there is taken as your answer: the channel's
   streams load again without the gate (contentGate.skip in the player's address), and on this computer it stays that way
   for that channel ("watchAnyway": its channel ids). The gate still shows the first time, so the site's own preference
   holds until you choose to watch. */

const skipped = ch => settings.json('watchAnyway', []).includes(ch);
// A stream's player address, with the gate left out when you pressed its Watch Anyway before (platforms.js streamSrc)
function gateSkip(ch, url){
  const g = ch && platform(ch).contentGate;
  if (!g || !url || !skipped(ch)) return url;
  return url + (url.includes('?') ? '&' : '?') + g.skip;
}
// As a stream's page loads: its player says when you press Watch Anyway (in-site/content-gate.js)
function watchGate(w, view){
  const g = w.channel && platform(w.channel).contentGate;
  if (!g) return;
  w.gateOff = skipped(w.channel);   // (loaded without the gate)
  runEarly(view, `(${gateAgent})(${JSON.stringify(g.press)})`);
}
// A console message from a stream's page (windows/views.js passes them on, for a site with a contentGate)
function gateMessage(w, view, text){
  if (text !== '__kmv:watch-anyway {}' || w.view !== view || !w.channel || !platform(w.channel).contentGate) return;
  if (!skipped(w.channel)) settings.set('watchAnyway', [...settings.json('watchAnyway', []), w.channel]);
  reloadSkipped();
}
// Every stream of a channel in the list that was loaded with its gate: loaded again without it
function reloadSkipped(){
  for (const w of wins){
    if (w.kind !== 'stream' || !w.view || !w.channel || !platform(w.channel).contentGate || !skipped(w.channel)) continue;
    if (w.gateOff) continue;
    w.gateOff = true;
    loadView(w.view, srcFor(w));
  }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  settings.onChange('watchAnyway', reloadSkipped);   // pressed in the other window
}

export { gateMessage, gateSkip, init, watchGate };
