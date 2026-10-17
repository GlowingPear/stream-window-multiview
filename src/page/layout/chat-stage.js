import { clearNew, countFor, forgetNew, newCount } from '../chat/new-messages.js';
import { BAR, GAP, ROLE, colsMode, coreVars, lastLayout, stage, wins } from '../core.js';
import { SH, SW, setRect } from './geometry.js';
import { applyRects, colKey, featuredCh, inColOrder, layoutChatsOnly, setColsMode, sortedChats, tile, vidByKey,
  vidLabel } from './layouts.js';
import { save } from '../persistence.js';
import { element } from '../shared/element.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { schedulePicks } from '../windows/channel-picker.js';
import { setViewScale } from '../windows/view.js';

/* ---- Chat Stage: one stream big with its chat beside it in big, easy-to-read text, and every other stream in a
   strip of small live pictures under the big one. Click one in the strip (or its name in the switch control) to put
   it and its chat on the stage. The other chats stay open out of sight, so mentions, alerts and raids still work.
   A picture in the strip shows how many new messages its chat has had since it was on the stage, and @ when its
   chat mentions you. */
const STAGE_SIZES = [1, 1.15, 1.3, 1.5, 1.75, 2];   // the stage chat, times the size of the other chats
const SPLIT_MIN = 0.22, SPLIT_MAX = 0.6, CHAT_MIN = 300, THUMB_MIN = 170;
let stageKey = null, stageSplit = 0.36, stageIdx = 2;
let splitEl = null, alertObs = null, splitting = false;
// Place windows: gliding there, except while you drag the split (they follow the pointer, so a glide still
// running from just before stops)
const place = (list, rects) => splitting
  ? list.forEach((w, i) => { w.max = null; w.el.classList.remove('anim'); setRect(w, rects[i]); })
  : applyRects(list, rects);

const isStage = () => ROLE === 'main' && !colsMode && lastLayout === 'stage';
const stageChatOf = () => wins.find(w => w.kind === 'chat' && w.el.classList.contains('stg-chat')) || null;

// Where everything goes in the area: the big stream, the chat, the pictures in the strip, and where the split is
function stageRects(nThumbs, X, Y, W, H){
  const cw = Math.max(CHAT_MIN, Math.min(W - 320, W * stageSplit));
  const lw = W - cw;
  // the strip: as many rows as needed so each picture is at least THUMB_MIN wide. The big stream gets its exact
  // 16:9 picture when the strip still fits under it, and the strip takes the rest of the height.
  const perRow = nThumbs ? Math.max(1, Math.min(nThumbs, Math.floor(lw / THUMB_MIN))) : 0;
  const rows = nThumbs ? Math.ceil(nThumbs / perRow) : 0;
  const tw = nThumbs ? lw / perRow : 0;
  const minStrip = rows * Math.min((tw - GAP) * 9 / 16 + BAR + GAP, (H * 0.34) / rows);
  const bigH = nThumbs ? Math.min(H - minStrip, (lw - GAP) * 9 / 16 + BAR + GAP) : H;
  const th = rows ? (H - bigH) / rows : 0;
  const thumbs = Array.from({ length: nThumbs }, (_, i) => ({
    x: X + (i % perRow) * tw + GAP / 2, y: Y + bigH + Math.floor(i / perRow) * th + GAP / 2, w: tw - GAP, h: th - GAP
  }));
  return { big: { x: X + GAP / 2, y: Y + GAP / 2, w: lw - GAP, h: bigH - GAP }, chatRect: { x: X + lw + GAP / 2, y: Y + GAP / 2, w: cw - GAP, h: H - GAP }, thumbs, lw };
}

function chatStageLayout(){
  if (ROLE !== 'main') return;
  if (colsMode) setColsMode(false);
  const vids = inColOrder(w => w.kind !== 'chat'), chats = sortedChats();
  if (!vids.length || !chats.length){ clearStageLook(); if (vids.length) tile(); else layoutChatsOnly(); return; }
  coreVars.lastLayout = 'stage';
  const on = vids.find(v => colKey(v) === stageKey) || vids.find(v => colKey(v) === featuredCh) || vids[0];
  stageKey = colKey(on);
  const chat = chats.find(c => c.channel === on.channel) || chats[0];
  const others = vids.filter(v => v !== on);
  const W = SW() - GAP, H = SH() - GAP, X = GAP / 2, Y = GAP / 2;
  const r = stageRects(others.length, X, Y, W, H);
  place([on], [r.big]);
  place(others, r.thumbs);
  // the other chats sit under the stage chat, out of sight
  place(chats, chats.map(() => r.chatRect));
  showStageLook(on, chat, others, r);
  save(); schedulePicks();
}
// Put a stream (and its chat) on the stage; the one there goes into the strip.
function putOnStage(key){
  if (!vidByKey(key)) return;
  stageKey = key;
  settings.set('stageCh', key);
  chatStageLayout();
  store.changed('layout');
}

function showStageLook(on, chat, others, r){
  document.body.classList.add('chatstage');
  wins.forEach(w => {
    w.el.classList.toggle('stg-on', w === on);
    w.el.classList.toggle('stg-chat', w === chat);
    w.el.classList.toggle('stg-off', w.kind === 'chat' && w !== chat);
    w.el.classList.toggle('stg-thumb', others.includes(w));
    if (others.includes(w)) addPick(w); else dropPick(w);
    if (w === chat) addSize(w); else dropSize(w);
    if (w.kind === 'chat') setViewScale(w.view, w === chat ? STAGE_SIZES[stageIdx] : 1);   // (this chat only: the site's zoom is shared)
  });
  clearNew(chat);                                            // on the stage: read
  Object.assign(splitEl.style, { display: 'block', left: (GAP / 2 + r.lw - 4) + 'px' });
  watchAlerts();
}
function clearStageLook(){
  if (!document.body.classList.contains('chatstage')) return;
  document.body.classList.remove('chatstage');
  const chat = stageChatOf();
  wins.forEach(w => { w.el.classList.remove('stg-on', 'stg-chat', 'stg-off', 'stg-thumb'); dropPick(w); dropSize(w); });
  if (chat) setViewScale(chat.view, 1);
  splitEl.style.display = 'none';
  forgetNew();
  if (alertObs) alertObs.disconnect();
}
function updateStageLook(){ if (!isStage()) clearStageLook(); }

// A picture in the strip: a click puts it on the stage; @ when its chat mentions you
function addPick(w){
  if (w.el.querySelector('.stg-pick')) return syncAt(w);
  const p = element('button', { class: 'stg-pick', title: `Put ${vidLabel(w)} on the stage`, onclick: () => putOnStage(colKey(w)) },
    element('span', 'stg-badges', element('span', 'stg-n'), element('span', 'stg-at', '@')), element('span', 'stg-go', 'Put on stage'));
  w.el.querySelector('.body').append(p);
  syncAt(w);
}
function dropPick(w){ w.el.querySelector('.stg-pick')?.remove(); }
function syncAt(w){
  const p = w.el.querySelector('.stg-pick'); if (!p) return;
  const c = wins.find(o => o.kind === 'chat' && o.channel === w.channel);
  const at = !!(c && c.alertLvl);
  p.classList.toggle('at', at);
  p.querySelector('.stg-at').title = at ? `${vidLabel(w)}'s chat has something for you` : '';
  const n = newCount(c), nb = p.querySelector('.stg-n');
  nb.textContent = n > 99 ? '99+' : String(n);
  nb.title = n ? `${n} new message${n === 1 ? '' : 's'} in ${vidLabel(w)}'s chat` : '';
  p.classList.toggle('new', n > 0);
}
// New messages counted for a chat (chat/new-messages.js): show them on its stream's picture in the strip
function syncNew(w){ wins.forEach(o => { if (o.el.classList.contains('stg-thumb') && o.channel === w.channel) syncAt(o); }); }
function watchAlerts(){
  if (!alertObs) alertObs = new MutationObserver(() => wins.forEach(w => { if (w.el.classList.contains('stg-thumb')) syncAt(w); }));
  alertObs.disconnect();
  wins.forEach(w => { if (w.kind === 'chat') alertObs.observe(w.el, { attributes: true, attributeFilter: ['class'] }); });
}

// The stage chat's text size, in its title bar
function addSize(w){
  if (!w.el.querySelector('.stg-size')){
    const s = element('span', { class: 'stg-size', title: 'Size of the chat on the stage, compared with the other chats' },
      element('button', { 'data-s': '-1', 'aria-label': 'Smaller stage chat text', onclick: e => { e.stopPropagation(); stageSize(-1); } }, 'A−'),
      element('em', 'stg-pct'),
      element('button', { 'data-s': '1', 'aria-label': 'Bigger stage chat text', onclick: e => { e.stopPropagation(); stageSize(1); } }, 'A+'));
    s.addEventListener('pointerdown', e => e.stopPropagation());      // not a drag of the window
    w.el.querySelector('.bar .btns').before(s);
  }
  showSize(w);
}
function dropSize(w){ w.el.querySelector('.stg-size')?.remove(); }
function showSize(w){
  const s = w.el.querySelector('.stg-size'); if (!s) return;
  s.querySelector('.stg-pct').textContent = Math.round(STAGE_SIZES[stageIdx] * 100) + '%';
  s.querySelector('[data-s="-1"]').disabled = stageIdx === 0;
  s.querySelector('[data-s="1"]').disabled = stageIdx === STAGE_SIZES.length - 1;
}
function stageSize(d){
  const i = Math.max(0, Math.min(STAGE_SIZES.length - 1, stageIdx + d));
  if (i === stageIdx) return;
  stageIdx = i;
  settings.set('stageZoom', stageIdx);
  const c = stageChatOf(); if (!c) return;
  showSize(c);
  setViewScale(c.view, STAGE_SIZES[stageIdx]);
}

// Drag the line between the stream and the chat to share the width differently (remembered)
function splitDrag(e){
  e.preventDefault();
  splitEl.setPointerCapture(e.pointerId);
  document.body.classList.add('dragging');
  splitting = true;
  const W = SW() - GAP;
  const move = ev => {
    const x = ev.clientX - stage.getBoundingClientRect().left;
    stageSplit = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, 1 - x / W));
    chatStageLayout();
  };
  const up = () => {
    splitEl.removeEventListener('pointermove', move); splitEl.removeEventListener('pointerup', up); splitEl.removeEventListener('pointercancel', up);
    document.body.classList.remove('dragging');
    splitting = false;
    settings.set('stageSplit', Math.round(stageSplit * 1000) / 1000);
  };
  splitEl.addEventListener('pointermove', move); splitEl.addEventListener('pointerup', up); splitEl.addEventListener('pointercancel', up);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  stageKey = settings.text('stageCh') || null;
  { const s = +settings.get('stageSplit'); if (s >= SPLIT_MIN && s <= SPLIT_MAX) stageSplit = s; }
  { const s = settings.get('stageZoom'); if (s !== null && STAGE_SIZES[+s]) stageIdx = +s; }
  splitEl = element('div', { id: 'stgSplit', title: 'Drag to make the chat wider or narrower' });
  splitEl.addEventListener('pointerdown', splitDrag);
  stage.append(splitEl);
  store.watch('layout', updateStageLook);
  // a window opened or closed: arrange the stage again
  store.watch('wins', () => { if (isStage()) chatStageLayout(); });
  countFor({ on: isStage, seen: w => w === stageChatOf(), changed: syncNew });
  window.putOnStage = putOnStage;   // for the tests
}

export { chatStageLayout, init, isStage, putOnStage };
