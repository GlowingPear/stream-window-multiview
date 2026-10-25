import { alerts } from './alerts.js';
import { wins } from '../core.js';
import { element } from '../shared/element.js';
import { icon } from '../shared/icons.js';
import { winTimer } from '../shared/timers.js';

/* ---- Support on the stream's picture (Settings > Mentions > Support > Show it on the stream's picture, on unless
   switched off): when a support or raid alert comes (alerts/spam-alerts.js), that channel's stream window shows who and
   what along its bottom edge, in any layout (Chat Stage's strip, Chat Rail's grid, Focus view, Tile…), for about 10 s.
   Several in a row wait their turn (the newest five). The bell keeps the list. */
const BANNER_MS = 10000, BANNER_QUEUE = 5;

function supportBanner(ch, who, what, kind){
  if (!alerts.support.banner) return;
  wins.filter(w => w.kind === 'stream' && w.channel === ch).forEach(w => {
    const q = w.supQ || (w.supQ = []);
    q.push({ who, what, kind });
    if (q.length > BANNER_QUEUE) q.splice(0, q.length - BANNER_QUEUE);
    if (!w.el.querySelector('.sup-banner')) nextBanner(w);
  });
}
// The next one waiting on this window, if any
function nextBanner(w){
  const s = w.supQ && w.supQ.shift(), body = w.el.querySelector('.body');
  if (!s || !body) return;
  const b = element('div', { class: 'sup-banner', role: 'status' },
    element('span', { class: 'sup-ico', html: icon[s.kind === 'raid' ? 'raid' : 'gift'] }),
    element('span', 'sup-txt', element('b', null, s.who), ' ' + s.what));
  b.style.setProperty('--sup', alerts.support.color);
  body.append(b);
  winTimer(w, 'supBanner', () => {
    b.classList.add('out');
    winTimer(w, 'supBanner', () => { b.remove(); nextBanner(w); }, 400);
  }, BANNER_MS);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.supportBanner = supportBanner;   // for the tests
}

export { init, supportBanner };
