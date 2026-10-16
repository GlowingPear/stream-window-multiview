import './translate.js';   // runs after it (see app.js)
import { fromApp, fromSite } from '../shared/incoming.js';
import { store } from '../shared/store.js';
import { stopWinTimer, stopWinTimers, winTimer } from '../shared/timers.js';
import { runIn, zoomOf } from '../windows/view.js';
import { coreVars, wins } from '../core.js';
import { DESKTOP } from '../shared/env.js';
import { chLabel, rememberName } from '../platforms/platforms.js';
import { mountView, ytCache } from '../windows/views.js';
import { winOfView } from './translate.js';
import { addNote, noteActs } from '../panels/bell/bell.js';
import { forgetChat } from '../alerts/spam-alerts.js';
import { flash } from '../shared/flash.js';
import { dropMini } from '../layout/switch-control.js';
import { save } from '../persistence.js';
import { stopCapture } from '../windows/capture.js';

/* The right-click menu on an emote in a chat: the main process sends its items (the same ones the system menu would
   have, from src/context-menu.js) with the emote, and gets back the one you chose. It looks and works like a
   system menu (arrows, Enter, Esc, typing a letter), but stays inside this window. */
const EMOTE_SITE = { Kick: ['#53fc18', '#0a0c0d', 'Kick emote'], Twitch: ['#8a4fff', '#fff', 'Twitch emote'], YouTube: ['#ff3d3d', '#fff', 'YouTube emoji'],
  '7TV': ['#353e43', '#e7ede9', 'From the 7TV add-on'], BTTV: ['#353e43', '#e7ede9', 'From the BetterTTV add-on'], FFZ: ['#353e43', '#e7ede9', 'From the FrankerFaceZ add-on'] };
const VM_SRC = /^https:\/\/(files\.kick\.com\/emotes\/|static-cdn\.jtvnw\.net\/|([\w-]+\.)?7tv\.app\/|cdn\.betterttv\.net\/|cdn\.frankerfacez\.com\/|([\w-]+\.)?ggpht\.com\/|www\.gstatic\.com\/)/;
let viewMenu = null;
fromSite('emote-menu-close', (w, data, view) => { if (data === '{}' && viewMenu && viewMenu.view === view) closeViewMenu(); });
function closeViewMenu(chosen){
  const m = viewMenu; if (!m) return;
  viewMenu = null;
  m.el.remove();
  removeEventListener('blur', m.off); removeEventListener('resize', m.off);
  document.removeEventListener('pointerdown', m.out, true);
  runIn(m.view, 'window.__kmvEmote && window.__kmvEmote.menuClosed()');
  if (chosen == null && window.kmv && window.kmv.viewMenuClose) window.kmv.viewMenuClose(m.id);
}
// d: { emote: { name, site, big, small, animated, x, y }, items: [{ label, enabled, checked } | { sep }] }; x, y: in the chat page
function showViewMenu(view, id, d, pick){
  closeViewMenu();
  const e = d.emote || {}, el = document.createElement('div');
  el.className = 'vmenu'; el.setAttribute('role', 'menu'); el.tabIndex = -1;
  el.setAttribute('aria-label', e.name ? `Emote ${e.name}` : 'Menu');
  if (e.name){
    const pre = document.createElement('div'); pre.className = 'vm-pre'; pre.setAttribute('aria-hidden', 'true');
    const s = EMOTE_SITE[e.site] || ['#353e43', '#e7ede9', 'Emote'], addOn = /^(7TV|BTTV|FFZ)$/.test(e.site);
    pre.innerHTML = '<div class="vm-pic"><img alt="" referrerpolicy="no-referrer"></div><div><div class="vm-top"><span class="vm-nm"></span><span class="vm-badge"></span></div><div class="vm-sub"></div></div>';
    const img = pre.querySelector('img');
    if (VM_SRC.test(e.big)) img.src = e.big;
    img.onerror = () => { if (VM_SRC.test(e.small) && img.src !== e.small) img.src = e.small; else img.remove(); };
    if (e.animated) pre.querySelector('.vm-pic').insertAdjacentHTML('beforeend', '<span class="vm-anim">ANIMATED</span>');
    pre.querySelector('.vm-nm').textContent = e.name;
    const b = pre.querySelector('.vm-badge'); b.textContent = addOn ? 'Add-on' : (e.site || ''); b.style.background = s[0]; b.style.color = s[1];
    pre.querySelector('.vm-sub').textContent = s[2];
    el.append(pre);
  }
  const rows = [];
  (d.items || []).forEach((x, i) => {
    if (x.sep){ const r = document.createElement('div'); r.setAttribute('role', 'separator'); el.append(r); return; }
    const b = document.createElement('div');
    b.setAttribute('role', 'checked' in x && x.checked ? 'menuitemcheckbox' : 'menuitem');
    if (x.checked) b.setAttribute('aria-checked', 'true');
    if (x.enabled === false) b.setAttribute('aria-disabled', 'true');
    b.textContent = x.label; b.dataset.i = i; b.tabIndex = -1;
    b.addEventListener('pointermove', () => cur(rows.indexOf(b)));
    b.addEventListener('pointerleave', () => cur(-1));
    b.addEventListener('click', () => choose(b));
    el.append(b); rows.push(b);
  });
  let at = -1;
  function cur(n){ at = n; rows.forEach((r, j) => r.classList.toggle('cur', j === n)); if (n >= 0) rows[n].focus({ preventScroll: true }); else el.focus({ preventScroll: true }); }
  const usable = r => r.getAttribute('aria-disabled') !== 'true';
  function step(dir){
    for (let k = 1; k <= rows.length; k++){ const n = ((at < 0 && dir < 0 ? rows.length : at) + dir * k + rows.length * 2) % rows.length; if (usable(rows[n])){ cur(n); return; } }
  }
  function choose(b){
    if (!b || !usable(b)) return;
    const i = +b.dataset.i;
    closeViewMenu(i);
    pick(i);
  }
  el.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown'){ ev.preventDefault(); step(1); }
    else if (ev.key === 'ArrowUp'){ ev.preventDefault(); step(-1); }
    else if (ev.key === 'Home'){ ev.preventDefault(); at = -1; step(1); }
    else if (ev.key === 'End'){ ev.preventDefault(); at = -1; step(-1); }
    else if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); if (at >= 0) choose(rows[at]); }
    else if (ev.key === 'Escape' || ev.key === 'Tab'){ ev.preventDefault(); closeViewMenu(); if (view) view.focus(); }
    else if (ev.key.length === 1 && /\S/.test(ev.key)){   // type a letter: the next item starting with it
      const k = ev.key.toLowerCase();
      for (let j = 1; j <= rows.length; j++){ const n = (at + j + rows.length) % rows.length; if (usable(rows[n]) && rows[n].textContent.trim().toLowerCase().startsWith(k)){ cur(n); break; } }
    }
    ev.stopPropagation();
  });
  document.body.append(el);
  // where you right-clicked (the chat may be zoomed), kept inside this window: flipped up or left near an edge
  const r = view ? view.getBoundingClientRect() : { left: 0, top: 0 };
  const z = zoomOf(view);
  const px = r.left + (+e.x || 0) * z, py = r.top + (+e.y || 0) * z, W = el.offsetWidth, H = el.offsetHeight, M = 4;
  let left = px + W + M > innerWidth ? px - W : px, top = py + H + M > innerHeight ? py - H : py;
  left = Math.max(M, Math.min(innerWidth - W - M, left)); top = Math.max(M, Math.min(innerHeight - H - M, top));
  el.style.left = left + 'px'; el.style.top = top + 'px';
  const off = () => closeViewMenu();
  const out = ev => { if (!el.contains(ev.target)) closeViewMenu(); };
  addEventListener('blur', off); addEventListener('resize', off);
  document.addEventListener('pointerdown', out, true);
  el.addEventListener('focusout', ev => { if (!el.contains(ev.relatedTarget)) setTimeout(() => { if (viewMenu && viewMenu.el === el && !el.contains(document.activeElement)) closeViewMenu(); }, 0); });
  viewMenu = { el, view, id, off, out };
  el.focus({ preventScroll: true });
  return el;
}
fromApp('onViewMenu', (id, d) => {
  const w = winOfView(id);
  showViewMenu(w && w.view, id, d, i => window.kmv.viewMenuAct(id, i));
});
window.showViewMenu = showViewMenu; window.closeViewMenu = closeViewMenu;   // for the tests
fromSite('emote-dl', (w, json) => saveEmote(json));
async function saveEmote(json){
  let d; try { d = JSON.parse(json); } catch { return; }
  if (!d || typeof d.url !== 'string' || typeof d.name !== 'string' || !window.kmv || !window.kmv.emoteDownload) return;
  const r = await window.kmv.emoteDownload(d.url, d.name, typeof d.small === 'string' ? d.small : '').catch(() => null);
  if (r && r.saved){
    const n = addNote({ kind: 'app', subject: 'downloads', text: `Saved emote “${d.name}”`, detail: r.file || '', act: r.id ? { t: 'folder' } : null }, `Saved ${d.name}`);
    if (n && r.id && window.kmv.emoteShow) noteActs.set(n.id, { run: () => window.kmv.emoteShow(r.id).then(ok => { if (!ok) flash('That file isn\'t there any more'); }) });
  }
  else if (!r || r.error) flash(`Couldn’t download ${d.name}`, { subject: 'downloads' });
}
function setWait(w, text, retry){
  const wait = w.el.querySelector('.waitmsg');
  wait.hidden = false;
  wait.querySelector('span').textContent = text;
  wait.querySelector('button').hidden = !retry;
}
async function resolveYt(w){
  if (!wins.includes(w) || w.view) return;
  if (!DESKTOP || !window.kmv.ytResolve){ setWait(w, 'YouTube channels need the desktop app. Paste a video link instead.', false); return; }
  if (w.ytBusy) return;
  w.ytBusy = true;
  setWait(w, `Looking for ${chLabel(w.channel)}'s live stream…`, false);
  let r = ytCache[w.channel] && Date.now() - ytCache[w.channel].t < 30000 ? ytCache[w.channel].r : undefined;
  if (r === undefined){
    try { r = await window.kmv.ytResolve(w.channel); } catch { r = null; }
    ytCache[w.channel] = { r, t: Date.now() };
  }
  w.ytBusy = false;
  if (!wins.includes(w)) return;
  if (r && r.name) rememberName(w.channel, r.name);
  if (r && r.live && r.videoId){ w.ytVid = r.videoId; mountView(w); return; }
  setWait(w, !r ? 'Couldn’t reach YouTube. Trying again in 2 minutes.'
              : r.missing ? `Couldn’t find ${chLabel(w.channel)} on YouTube.`
              : `${chLabel(w.channel)} isn’t live right now. Checking again every 2 minutes.`, true);
  stopWinTimer(w, 'yt');
  if (!(r && r.missing)) winTimer(w, 'yt', () => resolveYt(w), 120000);
}

// Everything a window holds besides its element: timers, a screen capture, its mini preview.
function releaseWin(w){
  stopWinTimers(w);
  stopCapture(w);
  if (typeof dropMini === 'function') dropMini(w);
  w.el.remove();
}
function closeWin(w){
  releaseWin(w);
  coreVars.wins = wins.filter(o => o !== w); store.changed('wins'); save();
  if (w.kind === 'chat') forgetChat(w.channel);
}

export { closeWin, releaseWin, resolveYt, setWait };
