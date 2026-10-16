import { BAR, GAP, colsMode, lastLayout, modeSel, mutedChk, popped, wins } from '../core.js';
import { columnsLayout } from './columns.js';
import { SH, SW, focusWin } from './geometry.js';
import { chatFocusLayout, layoutChatsOnly } from './layouts.js';
import { refitLocked } from './lock.js';
import { save } from '../persistence.js';
import { chLabel, rememberName } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { popPartial } from '../windows/popout.js';
import { createWin } from '../windows/windows.js';

/* ---------- placement ---------- */
function defaultStreamRect(){
  const n = wins.length, off = (n % 8) * 28;
  let vw = Math.min(640, SW() * 0.6);
  let h = vw * 9 / 16 + BAR;
  if (h > SH() - 40){ h = SH() - 40; vw = (h - BAR) * 16 / 9; }
  return { x: 20 + off, y: 20 + off, w: vw, h };
}
function chatRectBeside(r){
  const cw = 340;
  let x = r.x + r.w + GAP;
  if (x + cw > SW()) x = Math.max(0, r.x - cw - GAP);
  return { x, y: r.y, w: cw, h: Math.max(r.h, Math.min(600, SH() - r.y - 20)) };
}
function addChatBeside(sw){
  if (wins.some(o => o.kind === 'chat' && o.channel === sw.channel)){
    flash(`${chLabel(sw.channel)}'s chat is already open`); return;
  }
  createWin({ kind: 'chat', channel: sw.channel }, chatRectBeside(sw)); save();
}

function addParsed(p){
  const mode = modeSel.value;
  // Streams are popped out: send the stream to the streams window, keep its chat here.
  if (popped && !popPartial && p.channel && p.only !== 'chat' && mode !== 'chat'){
    window.kmv.openStreams([{ channel: p.channel, vol: 0.8, muted: mutedChk.checked }]);
    if (mode === 'both' && !wins.some(o => o.kind === 'chat' && o.channel === p.channel)){
      createWin({ kind: 'chat', channel: p.channel }, defaultStreamRect());
      layoutChatsOnly();
    }
    flash(`${chLabel(p.channel)} sent to the streams window`);
    save(); return;
  }
  if (p.channel && p.only !== 'chat' && mode !== 'chat'){
    const ex = wins.find(o => o.kind === 'stream' && o.channel === p.channel);
    if (ex){
      focusWin(ex);
      if (mode === 'both' && !wins.some(o => o.kind === 'chat' && o.channel === p.channel)) addChatBeside(ex);
      else flash(`${chLabel(p.channel)} is already open`);
      return;
    }
  }
  if (p.only === 'web'){ createWin({ kind: 'web', url: p.url }, defaultStreamRect()); }
  else if (p.only === 'chat' || mode === 'chat'){
    const s = wins.find(o => o.kind === 'stream' && o.channel === p.channel);
    if (s) addChatBeside(s);
    else if (popped){
      if (!wins.some(o => o.kind === 'chat' && o.channel === p.channel)){ createWin({ kind: 'chat', channel: p.channel }, defaultStreamRect()); layoutChatsOnly(); }
      else flash(`${chLabel(p.channel)}'s chat is already open`);
    }
    else { const r = defaultStreamRect(); createWin({ kind: 'chat', channel: p.channel }, { x: r.x, y: r.y, w: 340, h: Math.min(640, SH() - r.y - 20) }); }
  } else {
    const r = defaultStreamRect();
    createWin({ kind: 'stream', channel: p.channel }, r);
    if (mode === 'both'){
      if (/^yt:v:/.test(p.channel)) addChatIfLive(p.channel, r);     // a normal YouTube video has no live chat
      else createWin({ kind: 'chat', channel: p.channel }, chatRectBeside(r));
    }
  }
  flash(''); refitLocked(); save();
}
// YouTube video links: add the chat only if the video is a live stream.
async function addChatIfLive(ch, r){
  if (!DESKTOP || !window.kmv.ytResolve) return;
  let info = null; try { info = await window.kmv.ytResolve(ch); } catch {}
  if (info && info.name) rememberName(ch, info.name);
  if (!info || !info.live || wins.some(o => o.kind === 'chat' && o.channel === ch) || !wins.some(o => o.channel === ch)) return;
  createWin({ kind: 'chat', channel: ch }, chatRectBeside(r));
  if (colsMode) columnsLayout(); else if (lastLayout === 'chatfocus') chatFocusLayout();
  save();
}

export { addChatBeside, addParsed, defaultStreamRect };
