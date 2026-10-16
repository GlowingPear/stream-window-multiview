import { setWait } from '../chat/view-menu.js';
import { $, BAR, ROLE, colsMode, wins } from '../core.js';
import { columnsLayout } from '../layout/columns.js';
import { attachForGame, attachGame, capForGame, gameLayout, gameVars, isGame, saveGame } from '../layout/game-focus.js';
import { colKey } from '../layout/layouts.js';
import { defaultStreamRect } from '../layout/placement.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { store } from '../shared/store.js';
import { createWin } from './windows.js';

/* ---- Window capture: show another app's window (e.g. a Discord pop-out) as a live picture ---- */
function stopCapture(w){
  if (w && w.capStream){ try { w.capStream.getTracks().forEach(t => t.stop()); } catch {} w.capStream = null; }
}
async function mountCapture(w){
  const wait = w.el.querySelector('.waitmsg');
  const btn = wait.querySelector('button');
  btn.textContent = 'Pick a window'; btn.onclick = () => openCapturePicker(w);
  if (!w.view){
    const v = document.createElement('video');
    v.className = 'cap'; v.autoplay = true; v.muted = true; v.playsInline = true;
    w.el.querySelector('.body').prepend(v);
    w.view = v;
  }
  stopCapture(w);
  if (!w.srcId){ setWait(w, 'No window picked yet.', true); return; }
  setWait(w, `Connecting to “${w.capName}”…`, false);
  let st = null;
  try {
    if (window.kmv.captureChoose){ await window.kmv.captureChoose(w.srcId); st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false }); }
  } catch {}
  if (!st){
    try { st = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: w.srcId, maxFrameRate: 30 } } }); } catch {}
  }
  if (!wins.includes(w)){ if (st) st.getTracks().forEach(t => t.stop()); return; }
  if (!st){ setWait(w, `Couldn't show “${w.capName}”. It may have been closed or minimized.`, true); return; }
  w.capStream = st;
  w.view.srcObject = st;
  w.view.play().catch(() => {});
  wait.hidden = true;
  w.ready = true;
  const tr = st.getVideoTracks()[0];
  if (tr) tr.addEventListener('ended', () => { if (w.capStream === st) setWait(w, `“${w.capName}” was closed.`, true); });
}
let capDlg;
let capTarget = null;
async function openCapturePicker(target){
  if (!DESKTOP || !window.kmv.captureSources){ flash('Showing other windows needs the desktop app'); return; }
  capTarget = target && wins.includes(target) ? target : null;
  capDlg.querySelector('h3 span').textContent = attachForGame ? 'Pick your game' : 'Show another window in Stream Multiview';
  capDlg.querySelector('.dlg-sub').textContent = attachForGame
    ? 'Pick the game\'s window. It moves into the game area and stays there, so you play it right inside Stream Multiview. Tip: set the game to Windowed mode first. "Release" gives it back its own window.'
    : 'Pick a window, like a Discord pop-out call or stream. It appears here as a live picture you can move and resize like any other window. To click or type in it, use the real window (it can sit behind this one, but don\'t minimize it).';
  capDlg.hidden = false;
  await fillCapturePicker();
}
async function fillCapturePicker(){
  const grid = capDlg.querySelector('.cap-grid'), note = capDlg.querySelector('.cap-note');
  grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:30px;text-align:center;color:var(--muted)"><span class="spin"></span> Looking for open windows…</div>';
  note.textContent = '';
  let list = [];
  try { list = await window.kmv.captureSources(); } catch {}
  grid.innerHTML = '';
  if (!list.length){ grid.innerHTML = '<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--muted)">No windows found. Open the window you want (e.g. pop out a Discord call), then click Refresh list.</div>'; return; }
  if (attachForGame) list = list.filter(s => !s.screen);
  const wantFirst = s => attachForGame ? 0 : /discord/i.test(s.name) ? 0 : s.screen ? 2 : 1;
  list.sort((a, b) => wantFirst(a) - wantFirst(b));
  list.forEach(s => {
    const b = document.createElement('button'); b.className = 'cap-item';
    b.innerHTML = '<div class="th"></div><div class="nm"></div>';
    if (s.thumb) b.querySelector('.th').style.backgroundImage = `url("${s.thumb}")`;
    const nm = b.querySelector('.nm');
    if (s.icon){ const im = document.createElement('img'); im.src = s.icon; nm.appendChild(im); }
    const sp = document.createElement('span'); sp.textContent = s.screen ? `Whole screen: ${s.name}` : s.name; nm.appendChild(sp);
    b.title = s.name;
    b.onclick = () => {
      capDlg.hidden = true;
      if (attachForGame){ gameVars.attachForGame = false; attachGame(s); return; }
      if (capTarget){ capTarget.srcId = s.id; capTarget.capName = s.name; capTarget.el.querySelector('.title').textContent = s.name; mountCapture(capTarget); return; }
      const r = defaultStreamRect();
      const w = createWin({ kind: 'capture', srcId: s.id, capName: s.name }, { x: r.x + 40, y: r.y + 40, w: Math.min(r.w, 560), h: Math.min(r.h, 560 * 9 / 16 + BAR) });
      store.changed('wins');
      if (capForGame && isGame()){ gameVars.capForGame = false; gameVars.gameMode = 'window'; gameVars.gameKey = colKey(w); saveGame(); gameLayout(); return; }
      gameVars.capForGame = false;
      if (colsMode) columnsLayout(); else if (isGame()) gameLayout();
      flash(`Showing “${s.name}”. Drag it anywhere; use the real window to click or type in it.`);
    };
    grid.appendChild(b);
  });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  capDlg = $('#capDlg');
  capDlg.querySelector('.dlg-cancel').onclick = () => { capDlg.hidden = true; gameVars.capForGame = false; gameVars.attachForGame = false; };
  capDlg.querySelector('.cap-refresh').onclick = fillCapturePicker;
  capDlg.addEventListener('pointerdown', e => { if (e.target === capDlg) capDlg.hidden = true; });
  if (DESKTOP && ROLE === 'main' && window.kmv.captureSources){
    const cb = $('#capBtn'); cb.hidden = false; cb.onclick = () => openCapturePicker(null);
  }
}

export { init, mountCapture, openCapturePicker, stopCapture };
