import { GAP, ROLE, colsMode, lastLayout, shownWins, wins } from '../core.js';
import { buildCols, columnsLayout } from '../layout/columns.js';
import { SW, focusWin, setRect } from '../layout/geometry.js';
import { chatFocusLayout, colKey, colOrder, colX0, featBase, featuredCh, hbar, layoutVars, maxScroll, scrollRaf,
  scrollX, setFeatured, switchMode } from '../layout/layouts.js';
import { scrollCols, setScrollX, snapSoon } from '../layout/sideways-scroll.js';
import { placeSwitcher } from '../layout/switch-control.js';
import { infoFor, svHue, svInitials, svProf } from '../panels/channels/channels.js';
import { nameShown } from '../panels/settings/windows-pane.js';
import { save } from '../persistence.js';
import { nameOf } from '../platforms/linked.js';
import { chLabel, platIcon, platOf } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { soon } from '../shared/timers.js';

let schedulePicks;
function refreshPicks(){
  const order = buildCols().map(c => c.key);
  ['stream', 'chat'].forEach(kind => {
    // the windows on screen (a window with several sites once), by name: the site icon beside it tells them apart
    const list = shownWins().filter(w => w.kind === kind && w.channel)
      .sort((a, b) => order.indexOf(colKey(a)) - order.indexOf(colKey(b)));
    const sig = list.map(o => o.channel + '=' + nameOf(o.channel)).join('|');
    wins.filter(w => w.kind === kind && w.channel).forEach(w => {
      const sel = w.el.querySelector('.col-pick'); if (!sel) return;
      const mine = list.includes(w) ? list : [w, ...list];
      const sg = list.includes(w) ? sig : w.channel + '|' + sig;
      if (sel.dataset.sig !== sg){
        sel.dataset.sig = sg; sel.innerHTML = '';
        mine.forEach(o => { const op = document.createElement('option'); op.value = o.channel; op.textContent = nameOf(o.channel); sel.appendChild(op); });
      }
      if (sel.value !== w.channel) sel.value = w.channel;
      sel.title = (list.length > 1 ? `Swap this ${kind} with another one` : nameOf(w.channel)) + (nameShown(w) ? '' : ` · ${nameOf(w.channel)} · ${kind}`);
    });
  });
  paintBarAvatars(); loadBarAvatars();
}
/* The channel's picture on each window's name dropdown and on the rows of its list, as in the Channels list: the
   picture (or initials), the site's badge, a red ring while live, greyed out when offline (saved channels are checked). */
let barProf = {}, barProfSig = '';
function loadBarAvatars(again){
  if (!DESKTOP || !window.kmv.profileList) return;
  const chs = [...new Set(wins.filter(w => w.channel).map(w => w.channel))], sig = chs.join('|');   // (tabs you can't see too)
  if (!chs.length || (!again && sig === barProfSig)) return;
  barProfSig = sig;
  window.kmv.profileList(chs).then(l => { barProf = l || {}; paintBarAvatars(); }).catch(() => {});
}
// A channel's picture, when the app knows it
const chPhoto = ch => { const p = barProf[ch] || svProf[ch]; return (p && p.info && p.info.avatar) || ''; };
function chAvatar(ch){
  const info = infoFor(ch), p = barProf[ch] || svProf[ch], pic = p && p.info && p.info.avatar;
  const a = document.createElement('span');
  a.className = 'ch-av' + (info ? (info.live ? ' live' : ' off') : '');
  a.style.setProperty('--c', svHue(ch)); a.textContent = svInitials(chLabel(ch));
  a.insertAdjacentHTML('beforeend', platIcon(platOf(ch)));
  if (pic){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = pic; a.appendChild(im); }
  a.dataset.k = [a.className, pic, a.firstChild.textContent].join('|');
  return a;
}
function paintBarAvatars(){
  wins.forEach(w => {
    const old = w.el.querySelector('.bar-av'); if (!old) return;
    const a = chAvatar(w.channel); a.classList.add('bar-av');
    if (old.dataset.k !== a.dataset.k) old.replaceWith(a);       // unchanged: keep it (no picture reloading)
  });
}
function swapWindows(w, otherCh){
  const o = shownWins().find(x => x.kind === w.kind && x.channel === otherCh);
  if (!o || o === w){ refreshPicks(); return; }
  if (ROLE === 'main' && (colsMode || lastLayout === 'chatfocus')){
    const a = colKey(w), b = colKey(o);
    const order = buildCols().map(c => c.key), i = order.indexOf(a), j = order.indexOf(b);
    if (i >= 0 && j >= 0){ [order[i], order[j]] = [order[j], order[i]]; layoutVars.colOrder = order; }
    settings.set('colOrder', colOrder);
    if (colsMode){
      if (featBase.length && featuredCh === a) setFeatured(b);          // picking on the big one puts the other one big
      else if (featBase.length && featuredCh === b) setFeatured(a);
      columnsLayout();                                                    // same scroll spot, so it appears right here
    } else chatFocusLayout();
  } else {
    const ra = { x: w.x, y: w.y, w: w.w, h: w.h }, rb = { x: o.x, y: o.y, w: o.w, h: o.h };
    setRect(w, rb, true); setRect(o, ra, true);
    const i = wins.indexOf(w), j = wins.indexOf(o); [wins[i], wins[j]] = [wins[j], wins[i]];
    if (ROLE === 'streams' && lastLayout === 'spot') focusWin(wins.reduce((p, q) => (q.w * q.h > p.w * p.h ? q : p)));
    save();
  }
  refreshPicks();
}
function updateHbar(){
  if (!colsMode || maxScroll <= 0){ hbar.style.display = 'none'; return; }
  const left = colX0, width = SW() - colX0 - GAP / 2, total = width + maxScroll;
  const tw = Math.max(40, width * width / total);
  Object.assign(hbar.style, { display: 'block', left: left + 'px', width: width + 'px' });
  const th = hbar.firstChild;
  th.style.width = tw + 'px';
  th.style.left = ((width - tw) * (scrollX / maxScroll)) + 'px';
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* Highlight / Columns: the channel name on each side chat is a dropdown to pick which stream that column shows. */
  /* Every stream / chat window's name is a dropdown: pick another one of the same kind to swap them.
     Columns, highlight and Chat focus swap whole stream + chat pairs; any other arrangement swaps the two windows. */
  store.watch(['wins', 'names', 'streamers', 'tabs'], () => schedulePicks());
  schedulePicks = soon(() => { refreshPicks(); if (switchMode !== 'dock') placeSwitcher(); }, 30);
  store.watch('live', () => paintBarAvatars());
  hbar.addEventListener('pointerdown', e => {
    e.preventDefault();
    const th = hbar.firstChild;
    if (e.target !== th){ scrollCols(e.offsetX < th.offsetLeft ? -1 : 1); return; }
    th.setPointerCapture(e.pointerId);
    cancelAnimationFrame(scrollRaf);
    const sx = e.clientX, s0 = scrollX, free = hbar.clientWidth - th.offsetWidth;
    const move = ev => setScrollX(s0 + (ev.clientX - sx) / Math.max(1, free) * maxScroll);
    const up = () => { th.removeEventListener('pointermove', move); th.removeEventListener('pointerup', up); snapSoon(); };
    th.addEventListener('pointermove', move); th.addEventListener('pointerup', up);
  });
}

export { chAvatar, chPhoto, init, loadBarAvatars, refreshPicks, schedulePicks, swapWindows, updateHbar };
