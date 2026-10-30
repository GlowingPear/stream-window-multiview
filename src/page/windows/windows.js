import { allOn, allTabFor, modViewChs, openModViews, reloadAll } from '../chat/all-chat.js';
import { toggleStreamOverlay } from '../chat/chat-overlay.js';
import { resolveYt } from '../chat/view-menu.js';
import { BAR, MIN_H, MIN_W, ROLE, colsMode, coreVars, lastLayout, mutedChk, sizehint, snapChk, stage, wins } from '../core.js';
import { VOL_JS } from '../in-site/volume.js';
import { startSwapDrag } from '../layout/chat-focus.js';
import { isRail } from '../layout/chat-rail.js';
import { isStage } from '../layout/chat-stage.js';
import { startColDrag } from '../layout/column-drag.js';
import { columnsLayout } from '../layout/columns.js';
import { syncSwitcher } from '../layout/focus-only.js';
import { SH, SW, edges, focusWin, near, setRect, showHint, snapE } from '../layout/geometry.js';
import { colKey, layoutVars, linked, setFeatured, toggleFeatured } from '../layout/layouts.js';
import { locked, refitLocked, toggleMax } from '../layout/lock.js';
import { addChatBeside } from '../layout/placement.js';
import { atChannels, nh, syncAtBtn, toggleChatMentions } from '../panels/bell/bell.js';
import { toggleSaved } from '../panels/channels/channels.js';
import { copyWinState, devOn, inspectWin } from '../panels/developer/developer.js';
import { openExtMenu } from '../panels/extensions/extensions.js';
import { openLinkCard } from '../panels/linked/link-card.js';
import { openProfile } from '../panels/profiles/profiles.js';
import { arrangeButtons, syncBarName } from '../panels/settings/windows-pane.js';
import { save } from '../persistence.js';
import { linkedOn, nameOf } from '../platforms/linked.js';
import { chLabel, chLabelP, checkMod, externalFor, isModOf, modUrl, openModView, platOf, platform } from '../platforms/platforms.js';
import { syncLike, toggleLike } from '../platforms/youtube-options.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { store } from '../shared/store.js';
import { soon } from '../shared/timers.js';
import { chAvatar, swapWindows } from './channel-picker.js';
import { closeFrame, renderSiteTabs } from './frames.js';
import { PLAYING, pauseEvents } from './pause-state.js';
import { isPaused } from './pause.js';
import { arrangedByHand } from './raids.js';
import { askIn, runIn, setMuted } from './view.js';
import { mountView, reloadWin, ytCache } from './views.js';
import { openBarMenu, watchBar } from './window-bar.js';

/* ---------- window creation ---------- */
function createWin(spec, rect){
  const w = { id: ++coreVars.uid, kind: spec.kind, channel: spec.channel, url: spec.url, pause: PLAYING,
              muted: spec.muted ?? mutedChk.checked, vol: spec.vol ?? 0.8, preview: !!spec.preview, max: null, ready: false };
  // a tab of a window with several sites (windows/frames.js): hidden under the one you watch, or a site taken out
  if (spec.frame){ w.frame = spec.frame; w.hiddenTab = !!spec.hiddenTab; w.sbs = !!spec.sbs && !w.hiddenTab; }
  if (spec.split) w.split = true;
  const hasVol = DESKTOP && w.kind === 'stream';
  const el = document.createElement('div');
  el.className = 'win ' + w.kind + (w.channel ? ' plat-' + platOf(w.channel) : '');
  el.innerHTML = `
    <div class="bar">
      ${w.channel ? '<span class="bar-av"></span>' : '<span class="dot"></span>'}<span class="title"></span>${w.channel ? '<select class="col-pick" title="Swap this window with another one"></select><span class="ptabs" role="tablist" aria-label="Sites"></span>' : ''}${w.kind === 'stream' ? '<span class="bar-n" hidden></span>' : ''}<span class="grab"></span>
      ${hasVol ? `<div class="vol" title="Volume (scroll to adjust)"><button data-v="mute" title="Mute / unmute"></button><input type="range" min="0" max="100" step="1" aria-label="Volume"><span class="pct"></span></div>` : ''}
      <div class="btns">
        ${w.kind === 'stream' ? '<button class="txt" data-a="chat" title="Add this channel\'s chat next to it">+ Chat</button>' : ''}
        ${(w.kind === 'stream' || w.kind === 'capture') && ROLE === 'main' ? `<button class="feat" data-a="feat" title="Highlight: make this stream big">${icon.feat}</button>` : ''}
        ${w.kind === 'chat' && DESKTOP && ROLE === 'main' && /^(kick|twitch)$/.test(platOf(w.channel)) ? '<button class="at" data-a="at" hidden></button>' : ''}
        ${w.kind === 'stream' ? '<button class="co-b" data-a="overlay" hidden></button>' : ''}
        ${w.kind === 'stream' && DESKTOP && platform(w.channel)?.likes ? `<button class="like dim" data-a="like" aria-pressed="false">${icon.like}</button>` : ''}
        ${w.channel ? '<button class="star" data-a="star"></button>' : ''}
        ${w.channel && DESKTOP && ROLE === 'main' && !/^yt:v:/.test(w.channel) ? `<button data-a="profile" title="Profile: when they stream, past streams, your notes">${icon.user}</button>` : ''}
        ${DESKTOP && (w.kind === 'stream' || w.kind === 'chat') ? `<button data-a="ext" class="ext-b" title="Extensions in this window" hidden>${icon.ext}<b class="ext-n"></b></button>` : ''}
        ${DESKTOP && (w.kind === 'stream' || w.kind === 'chat') ? `<button data-a="state" class="dev-b" title="Copy what the app knows about this window, for a report"${devOn ? '' : ' hidden'}>${icon.copy}</button><button data-a="inspect" class="dev-b" title="Chrome's developer tools for this window's page"${devOn ? '' : ' hidden'}>${icon.code}</button>` : ''}
        <button data-a="reload" title="Reload">${icon.reload}</button>
        ${modUrl(w.channel) || (w.kind === 'chat' && allTabFor(w)) ? `<button data-a="mod" title="Open the mod view for this channel"${DESKTOP || !modUrl(w.channel) ? ' hidden' : ''}>${icon.mod}</button>` : ''}
        <button data-a="pop" title="Open in its own browser window">${icon.pop}</button>
        <button data-a="max" title="Maximize / restore (or double-click the bar)">${icon.max}</button>
        ${w.channel && !/^yt:v:/.test(w.channel) ? `<button data-a="link" class="link-b" title="Channel settings: its chat bots, ALL, opening when live, and linking its other sites"${linkedOn() ? '' : ' hidden'}>${icon.layers}</button>` : ''}
        <button data-a="more" class="more-b" title="More: the buttons that don't fit" aria-label="More" aria-haspopup="true" hidden>⋯</button>
        <button data-a="close" class="x" title="Close">${icon.close}</button>
      </div>
    </div>
    <div class="body"><div class="waitmsg" hidden><span></span><button class="btn">Check now</button></div><div class="shield"></div></div>
    ${['n','e','s','w','ne','nw','se','sw'].map(d => `<div class="rz rz-${d}" data-d="${d}"></div>`).join('')}`;
  w.el = el;
  el.querySelectorAll('.btns [data-a], .vol [data-v]').forEach(b => { b.dataset.cmd = 'win.' + (b.dataset.a || b.dataset.v); });   // (the search box's Tab list for the window: window-commands.js)
  if (w.kind === 'capture'){ w.srcId = spec.srcId; w.capName = spec.capName || 'Window'; }
  el.querySelector('.title').textContent = w.channel ? nameOf(w.channel) : w.kind === 'capture' ? w.capName : new URL(w.url).hostname;
  el.querySelector('.bar').title = (w.channel ? chLabelP(w.channel) : w.kind === 'capture' ? w.capName + ' (live picture of that window)' : w.url) + ' · ' + w.kind;
  if (w.kind === 'capture'){ el.querySelector('[data-a=pop]').remove(); el.querySelector('[data-a=reload]').title = 'Pick a different window'; }
  el.querySelector('.waitmsg button').onclick = () => { ytCache[w.channel] = null; resolveYt(w); };
  w.view = null;
  if (w.hiddenTab){ el.classList.add('tab-hidden'); el.setAttribute('aria-hidden', 'true'); }
  arrangeButtons(w); syncBarName(w);
  stage.appendChild(el);
  el.style.zIndex = w.hiddenTab ? '1' : ++coreVars.zTop;
  wins.push(w);
  setRect(w, rect);
  el.addEventListener('pointerdown', () => focusWin(w), true);
  renderSiteTabs(w);
  mountView(w);
  checkMod(w);
  syncAtBtn(w);
  syncLike(w);

  /* volume */
  if (hasVol){
    const vb = el.querySelector('.vol'), slider = vb.querySelector('input'), muteBtn = vb.querySelector('button');
    muteBtn.onclick = () => {
      w.muted = !w.muted;
      if (!w.muted && w.vol < 0.02) w.vol = 0.5;
      pushVol(w); save();
    };
    slider.addEventListener('pointerdown', () => { w.adjusting = true; });
    slider.addEventListener('input', () => { w.vol = slider.value / 100; w.muted = w.vol === 0; pushVol(w); });
    slider.addEventListener('change', () => { w.adjusting = false; save(); });
    vb.addEventListener('wheel', e => {
      e.preventDefault(); e.stopPropagation();
      w.vol = Math.min(1, Math.max(0, Math.round((w.vol + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
      w.muted = w.vol === 0;
      pushVol(w); saveSoon();
    }, { passive: false });
    renderVol(w);
  }

  /* buttons */
  el.querySelector('.btns').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close'){ closeFrame(w); refitLocked(); }
    else if (a === 'reload') { if (allOn(w)) reloadAll(w); else reloadWin(w); }   // (ALL: each chat it reads)
    else if (a === 'pop') {
      if (DESKTOP){
        if (w.kind === 'chat') window.kmv.openWindow(externalFor(w), 380, 760);
        else window.kmv.openWindow(externalFor(w), 1100, 700);
      } else {
        const feat = w.kind === 'chat' ? 'width=380,height=760' : 'width=1100,height=680';
        window.open(externalFor(w), 'kmv_' + w.kind + '_' + (w.channel || w.id), feat);
      }
    }
    else if (a === 'mod') { if (allOn(w)) openModViews(w, b.classList.contains('ovf') ? el.querySelector('[data-a=more]') : b); else openModView(w.channel); }
    else if (a === 'max') toggleMax(w);
    else if (a === 'ext') openExtMenu(w, b.classList.contains('ovf') ? el.querySelector('[data-a=more]') : b);   // from the ⋯ menu (always): open under ⋯
    else if (a === 'more') openBarMenu(b);
    else if (a === 'state') copyWinState(w);
    else if (a === 'link') openLinkCard(w.channel);
    else if (a === 'inspect') inspectWin(w);
    else if (a === 'chat'){
      if (ROLE === 'streams'){ window.kmv.addChat(w.channel); flash(`${chLabel(w.channel)}'s chat added to the main window`); }
      else addChatBeside(w);
    }
    else if (a === 'star') toggleSaved(w.channel);
    else if (a === 'like') toggleLike(w);
    else if (a === 'profile') openProfile(w.channel);
    else if (a === 'at') toggleChatMentions(atChannels(w));   // (with ALL showing: every chat of theirs it reads)
    else if (a === 'overlay') toggleStreamOverlay(w);
    else if (a === 'feat'){
      if (!colsMode){ setFeatured(colKey(w)); layoutVars.scrollX = 0; columnsLayout(); }   // from Chat focus: open the highlight view
      else toggleFeatured(colKey(w));
    }
  });

  /* drag */
  const bar = el.querySelector('.bar');
  watchBar(bar);
  bar.addEventListener('dblclick', e => { if (!e.target.closest('button, .vol, select')) toggleMax(w); });
  const pick = el.querySelector('.col-pick');
  if (pick){ pick.addEventListener('change', () => swapWindows(w, pick.value)); pick.ddIcon = o => chAvatar(o.value); }
  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, .vol, select')) return;
    if (colsMode && linked && ROLE === 'main'){
      if (!w.el.classList.contains('featured')){ e.preventDefault(); startColDrag(e, w, bar); }
      return;
    }
    if (ROLE === 'streams' && w.kind === 'stream'){ e.preventDefault(); startSwapDrag(e, w, bar); return; }
    if (isStage() || isRail()){ e.preventDefault(); return; }    // Chat Stage and Chat Rail place every window themselves
    if (!colsMode && lastLayout === 'chatfocus' && w.kind !== 'chat' && ROLE === 'main'){
      e.preventDefault(); startSwapDrag(e, w, bar); return;
    }
    if (locked()){ e.preventDefault(); if (!w.max) startSwapDrag(e, w, bar); return; }   // locked: swap it with another, or it goes back
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    let sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
    if (w.max){ // pull out of maximized state under the cursor
      const r = w.max; w.max = null;
      const fx = (e.clientX - w.x) / w.w;
      ox = e.clientX - r.w * fx; oy = w.y;
      setRect(w, { x: ox, y: oy, w: r.w, h: r.h });
    }
    const { xs, ys } = edges(w);
    document.body.classList.add('dragging');
    const move = ev => {
      let x = ox + ev.clientX - sx, y = oy + ev.clientY - sy;
      if (snapChk.checked){
        const a = near(x, xs), b = near(x + w.w, xs);
        if (a !== null && (b === null || Math.abs(a - x) <= Math.abs(b - x - w.w))) x = a; else if (b !== null) x = b - w.w;
        const c = near(y, ys), d = near(y + w.h, ys);
        if (c !== null && (d === null || Math.abs(c - y) <= Math.abs(d - y - w.h))) y = c; else if (d !== null) y = d - w.h;
      }
      if (!colsMode) x = Math.min(Math.max(x, -(w.w - 80)), SW() - 80);
      y = Math.min(Math.max(y, 0), SH() - BAR);
      setRect(w, { x, y, w: w.w, h: w.h });
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging');
      if (moved) arrangedByHand();
      save();
    };
    let moved = false;
    bar.addEventListener('pointermove', () => { moved = true; }, { once: true });
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });

  /* resize */
  el.querySelectorAll('.rz').forEach(h => h.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (locked()){ e.preventDefault(); e.stopPropagation(); flash('The layout is locked, so windows keep their size. Unlock it in the Layout menu (Shift+L).'); return; }
    e.preventDefault(); e.stopPropagation(); focusWin(w);
    h.setPointerCapture(e.pointerId);
    const d = h.dataset.d, sx = e.clientX, sy = e.clientY, r = { x: w.x, y: w.y, w: w.w, h: w.h };
    const { xs, ys } = edges(w); w.max = null;
    document.body.classList.add('dragging');
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let L = r.x, T = r.y, R = r.x + r.w, B = r.y + r.h;
      if (d.includes('e')) R = snapE(R + dx, xs);
      if (d.includes('w')) L = snapE(L + dx, xs);
      if (d.includes('s')) B = snapE(B + dy, ys);
      if (d.includes('n')) T = Math.max(0, snapE(T + dy, ys));
      if (R - L < MIN_W){ if (d.includes('w')) L = R - MIN_W; else R = L + MIN_W; }
      if (B - T < MIN_H){ if (d.includes('n')) T = B - MIN_H; else B = T + MIN_H; }
      if (ev.shiftKey && w.kind === 'stream'){ // keep the video 16:9
        if (d.includes('e') || d.includes('w')){
          const nh = (R - L) * 9 / 16 + BAR;
          if (d.includes('n')) T = B - nh; else B = T + nh;
        } else {
          const nw = (B - T - BAR) * 16 / 9;
          R = L + nw;
        }
      }
      setRect(w, { x: L, y: T, w: R - L, h: B - T });
      showHint(ev, w);
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging'); sizehint.style.display = 'none';
      if (w.x !== r.x || w.y !== r.y || w.w !== r.w || w.h !== r.h) arrangedByHand();   // just clicking an edge keeps the layout
      save();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  }));

  if (!w.hiddenTab) focusWin(w);
  store.changed('wins');
  return w;
}

function renderVol(w){
  const vb = w.el.querySelector('.vol'); if (!vb) return;
  const pct = Math.round(w.vol * 100), off = w.muted || pct === 0;
  vb.querySelector('input').value = pct;
  vb.querySelector('.pct').textContent = off ? 'off' : pct + '%';
  const b = vb.querySelector('button');
  b.innerHTML = off ? icon.volOff : icon.volOn;
  b.classList.toggle('muted', off);
  syncSwitcher();
}
function pushVol(w){
  renderVol(w);
  if (!w.ready) return;
  runIn(w.view, `${VOL_JS};window.__kmv.set(${Number(w.vol) || 0},${!!w.muted})`);
}
// A stream's sound is turned on once the app's volume / mute has reached its player (see mountView).
function liftAudio(w){
  const v = w.view;
  if (!w.audioHeld || !w.ready || w.audioLoading || !v) return Promise.resolve(false);   // not the page that's leaving
  return askIn(v, '!!(window.__kmv && window.__kmv.applied())').then(ok => {   // (false when it moved or closed meanwhile)
    if (ok && w.view === v && w.audioHeld){ w.audioHeld = false; setMuted(v, false); }
    return ok;
  }, () => false);
}
// Checked often for its first seconds; after that the slider check below keeps trying.
function liftAudioSoon(w, left = 75){
  setTimeout(() => liftAudio(w).then(ok => { if (!ok && w.audioHeld && left > 1) liftAudioSoon(w, left - 1); }), 200);
}
let saveSoon;

// The mod view button: where you moderate its channel, or in ALL, any of the streamer's sites (it opens a menu of them)
function syncModBtn(w){
  const b = w.el && w.el.querySelector('[data-a=mod]'); if (!b || !DESKTOP) return;
  const all = allOn(w) && !w.hiddenTab;
  b.hidden = !(all ? modViewChs(w).length : isModOf(w.channel));
  b.title = all ? 'Mod views: each site where you moderate' : 'Open the mod view for this channel';
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.viewCalls = { runIn, askIn };   // for the tests
  // Keep the slider in step if you change volume with the player's own controls.
  if (DESKTOP) setInterval(() => {
    wins.forEach(w => {
      if (w.kind !== 'stream' || !w.ready) return;
      if (w.audioHeld) liftAudio(w);
      if (w.adjusting) return;
      if (Date.now() < (w.enforceUntil || 0)){ pushVol(w); return; }
      askIn(w.view, 'window.__kmv ? window.__kmv.get() : null').then(r => {
        if (r && typeof r.v === 'number' && isFinite(r.v) && (Math.abs(r.v - w.vol) > 0.005 || !!r.m !== w.muted)){ w.vol = Math.max(0, Math.min(1, r.v)); w.muted = !!r.m; renderVol(w); saveSoon(); }
        if (r && r.p !== isPaused(w)){
          w.pause = r.p ? pauseEvents.youPause(w.pause) : pauseEvents.youPlay(w.pause);   // its own player paused or played
          w.sentPause = r.p; syncSwitcher();
        }
      }).catch(() => {});
    });
  }, 1500);
  saveSoon = soon(() => save(), 600);
}

export { createWin, init, liftAudioSoon, pushVol, saveSoon, syncModBtn };
