import { $ } from '../core.js';
import { kickUser, linkConnected, linkOn, linkReward, rewardShared, showReward } from '../platforms/pear-drops.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';

/* ---- The toolbar's chest: Kick's daily reward (watch an hour signed in, then open a crate), as a linked Pear Drops
   tells it (rewards.daily). A ring fills over the hour; when it's ready the chest hops, as a "Claim reward" chip where
   there's room; claimed, it's the chest alone again. A click brings Pear Drops to the front with the reward's card
   open, where it's claimed: this app never calls Kick for it. Hidden while Pear Drops isn't connected; connected but too old
   to send it, it's a plain chest that opens Kick's own dialog. Settings › Connected apps, "Show Kick's daily reward in the
   toolbar". ---- */
let btn, ring, tick = null;

const KICK_DIALOG = 'https://kick.com/?daily-reward=open';
const RING_C = 2 * Math.PI * 9;          // the ring's circumference (r = 9 in a 22 × 22 box)
const KNOWN = ['earning', 'ready', 'claimed', 'unavailable'];   // any other state shows as unavailable
// The pixels the chest lands in when it hops: [x, y, colour]
const BURST = [
  [2.2, 20.1, 'g'], [4.4, 21.8, 't'], [7.6, 22.7, 'g'], [11, 23.1, 't'], [14.4, 22.9, 'g'], [17.8, 22.4, 't'],
  [20.6, 21.1, 'g'], [21.4, 19.1, 't'], [1.6, 18.3, 't'], [19.2, 17.9, 'g']
];
// Kick's chest (the strap on the left, the notched latch) as a line icon, in its ring: fixed markup.
const chestSvg = () => `<svg class="dr-ring" viewBox="0 0 22 22" aria-hidden="true"><circle class="dr-ring-track" cx="11" cy="11" r="9"/>`
  + `<circle class="dr-ring-value" cx="11" cy="11" r="9" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}" transform="rotate(-90 11 11)"/></svg>`
  + `<svg class="dr-chest-ic" viewBox="0 0 24 24" aria-hidden="true">`
  + `<g class="chest-burst">${BURST.map(([x, y, c]) => `<rect class="${c}" x="${x - 0.7}" y="${y - 0.7}" width="1.4" height="1.4"/>`).join('')}</g>`
  + `<g class="chest-box"><path class="chest-body" d="M3.5 8.5 5.5 4.5h13l2 4v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 9.5h17M8.5 4.5v15"/>`
  + `<path class="chest-latch" d="M12.6 9.5v2.8l2.65 2.1 2.65-2.1V9.5"/></g></svg>`;

const clock = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
// "6h 12m", "23m": how long until a time ('' when it's gone or unknown)
function timeLeft(iso){
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return '';
  const min = Math.max(1, Math.round(ms / 60000));
  return min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + (min % 60) + 'm' : '') : min + 'm';
}
const whole = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

// What the chest shows, or null when it's hidden: { state, frac (the ring, 0–1), tip: [the name, lines under it] }.
// Hidden when switched off, while Pear Drops isn't connected, with no Kick account here, signed out of Kick in
// Pear Drops, or when Pear Drops watches with another Kick account than this app's.
function chestView(){
  if (!settings.flag('link.dailyReward', true) || !linkOn() || !linkConnected()) return null;
  const mine = kickUser();
  if (!mine) return null;
  const r = linkReward();
  if (!rewardShared() || !r || typeof r.state !== 'string') return { state: 'plain', frac: 0, tip: ['Daily reward on Kick'] };
  if (r.state === 'signed-out') return null;
  const theirs = r.account && r.account.user;
  if (!theirs || String(theirs).toLowerCase() !== String(mine).toLowerCase()) return null;
  const state = KNOWN.includes(r.state) ? r.state : 'unavailable';
  const minutes = whole(r.minutes), threshold = whole(r.threshold), ends = r.endsAt ? clock(r.endsAt) : '';
  if (state === 'earning'){
    const has = minutes !== null && threshold > 0;
    return { state, frac: has ? Math.min(1, minutes / threshold) : 0,
      tip: has ? ['Daily reward · ' + minutes + ' of ' + threshold + ' min', Math.max(0, threshold - minutes) + ' min to go'] : ['Daily reward'] };
  }
  if (state === 'ready') return { state, frac: 0, tip: ['Daily reward is ready', ends ? 'Claim before ' + ends : '', 'Open Pear Drops to claim it'].filter(Boolean) };
  if (state === 'claimed'){
    const next = r.endsAt ? timeLeft(r.endsAt) : '';
    return { state, frac: 0, tip: next ? ['Daily reward claimed', 'Next one in ' + next] : ['Daily reward claimed'] };
  }
  return { state, frac: 0, tip: ["Kick's daily reward isn't answering"] };
}

function render(){
  if (!btn) return;
  const v = chestView();
  btn.hidden = !v;
  if (!v){ clearInterval(tick); tick = null; return; }
  btn.className = 'btn tb dr-chest state-' + v.state;
  ring.setAttribute('stroke-dashoffset', (RING_C * (1 - v.frac)).toFixed(2));
  // the left toolbar's label, or the chip's words on top when there's room (toolbar-fit.css drops them in c3)
  btn.querySelector('.tb-l').textContent = v.state !== 'ready' ? 'Daily reward' : document.body.classList.contains('bar-left') ? 'Reward ready' : 'Claim reward';
  // the tooltip: its first line as the name, the rest under it (shared/tooltips.js)
  btn.dataset.label = v.tip[0];
  btn.title = v.tip.join('\n');
  btn.setAttribute('aria-label', v.tip.join('. '));
  if (!tick) tick = setInterval(render, 30000);    // "Next one in" counts down
}

// Linked: Pear Drops shows the reward's card. Otherwise, or if it couldn't, Kick's own dialog, signed in as here.
async function openReward(){
  if (rewardShared()){
    const r = await showReward();
    if (r && r.shown) return;
  }
  if (window.kmv && typeof window.kmv.openWindow === 'function') window.kmv.openWindow(KICK_DIALOG, 1100, 820);
  else window.open(KICK_DIALOG, 'kmv_daily_reward', 'width=1100,height=820');
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  btn = $('#rewardBtn');
  if (!btn) return;
  btn.querySelector('.dr-ic').innerHTML = chestSvg();
  ring = btn.querySelector('.dr-ring-value');
  btn.onclick = openReward;
  store.watch('reward', render);
  // the left toolbar's words for a ready reward differ from the chip's on top
  new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  render();
}

export { init };
