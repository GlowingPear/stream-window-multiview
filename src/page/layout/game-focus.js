import { BAR, GAP, ROLE, colsMode, coreVars, lastLayout, wins } from '../core.js';
import { buildCols } from './columns.js';
import { SH, SW, setRect } from './geometry.js';
import { applyRects, chatRects, colKey, gridRects, mkDiv, setColsMode, switchMode } from './layouts.js';
import { placeSwitcher } from './switch-control.js';
import { save } from '../persistence.js';
import { chLabelP } from '../platforms/platforms.js';
import { esc } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { panel } from '../toolbar/toolbar.js';
import { openCapturePicker } from '../windows/capture.js';
import { refreshPicks } from '../windows/channel-picker.js';

/* ===================== 2.3: Game focus layout ===================== */
// The game gets the big area; streams, chats and other windows stack up on the side.
//  - See-through (play): that area is cut out of this window, so the real game running behind
//    Stream Multiview shows there and you play it directly (Windows / Linux).
//  - Show a window: put any stream or other app's window there instead (view-only for apps).
var gameMode = 'see', gameKey = null, gameSize = 'm', gameSide = 'right', gameOnTop = true, capForGame = false;
var attachForGame = false, gameAttached = null, gameStrip = true;      // "Put a game here" (Windows)
// Other files change these through gameVars: a variable imported from another file can't be assigned to.
const gameVars = {
  get capForGame(){ return capForGame; }, set capForGame(v){ capForGame = v; },
  get gameMode(){ return gameMode; }, set gameMode(v){ gameMode = v; },
  get gameKey(){ return gameKey; }, set gameKey(v){ gameKey = v; },
  get attachForGame(){ return attachForGame; }, set attachForGame(v){ attachForGame = v; },
};
const saveGame = () => { settings.set('game', { mode: gameMode, size: gameSize, side: gameSide, onTop: gameOnTop, strip: gameStrip }); };
let shapeOK;
let attachOK;
const GAME_FR = { s: 0.24, m: 0.31, l: 0.40 }, GBAR = 34;
let gameArea;
let gameBar;
function setGameKey(k){ gameKey = k; }
const isGame = () => ROLE === 'main' && !colsMode && lastLayout === 'game';
function gameRects(){
  const W = SW(), H = SH(), pw = Math.round(W * GAME_FR[gameSize]);
  const gx = gameSide === 'right' ? GAP / 2 : pw + GAP / 2, gw = W - pw - GAP;
  const px = gameSide === 'right' ? W - pw : 0;
  return { game: { x: gx, y: GAP / 2, w: gw, h: H - GAP }, panel: { x: px, y: 0, w: pw, h: H } };
}
function gameLayout(){
  if (ROLE !== 'main') return;
  if (colsMode) setColsMode(false);
  coreVars.lastLayout = 'game';
  const { game, panel } = gameRects();
  const occ = gameMode === 'window' && gameKey ? wins.find(w => colKey(w) === gameKey && w.kind !== 'chat') : null;
  if (gameMode === 'window' && gameKey && !occ) gameKey = null;
  Object.assign(gameArea.style, { display: 'block', left: game.x + 'px', top: game.y + 'px', width: game.w + 'px', height: game.h + 'px' });
  Object.assign(gameBar.style, { display: 'flex', left: game.x + 'px', top: game.y + 'px', width: game.w + 'px', height: (GBAR - 4) + 'px' });
  gameArea.classList.toggle('see', gameMode === 'see');
  renderGameBar();
  if (occ){
    occ.max = null;
    setRect(occ, { x: game.x, y: game.y + GBAR, w: game.w, h: game.h - GBAR }, true);
    occ.el.style.zIndex = ++coreVars.zTop;
  }
  // the side panel: videos on top (16:9), chats underneath
  const order = buildCols();
  const vids = order.filter(c => c.top && c.top !== occ).map(c => c.top);
  const chats = order.filter(c => c.chat && c.chat !== occ).map(c => c.chat);
  const X = panel.x + GAP / 2, PW = panel.w - GAP, Hh = panel.h - GAP;
  const one = PW * 9 / 16 + BAR + GAP;
  let vh = 0;
  if (vids.length){
    vh = chats.length ? Math.min(Hh * 0.6, vids.length * one) : Hh;
    if (vids.length * one <= vh) applyRects(vids, vids.map((w, i) => ({ x: X + GAP / 2, y: GAP / 2 + i * one + GAP / 2, w: PW - GAP, h: one - GAP })));
    else applyRects(vids, gridRects(vids.length, X, GAP / 2, PW, vh, 16 / 9));
    if (vids.length * one <= vh) vh = vids.length * one;
  }
  if (chats.length) applyRects(chats, chatRects(chats.length, X, GAP / 2 + vh, PW, Hh - vh));
  save(); store.changed('layout'); refreshPicks();
  if (switchMode !== 'dock') placeSwitcher();
}
function renderGameBar(){
  const vids = buildCols().filter(c => c.top && c.top.kind !== 'chat').map(c => c.top);
  gameBar.innerHTML =
    `<span class="gb-title">${icon.game}<b>Game area</b></span>` +
    (shapeOK ? `<span class="gb-seg"><button data-gm="see" class="${gameMode === 'see' ? 'on' : ''}" title="The real game behind Stream Multiview shows here and you can play it">See-through (play)</button><button data-gm="window" class="${gameMode === 'window' ? 'on' : ''}" title="Show a stream or another app's window here instead">Show a window</button></span>` : '') +
    (gameMode === 'window' ? `<select class="gb-pick" title="What to show in the game area"><option value="">Choose</option>${vids.map(w => `<option value="${esc(colKey(w))}"${colKey(w) === gameKey ? ' selected' : ''}>${esc(w.kind === 'capture' ? (w.capName || 'Window') + ' (window)' : chLabelP(w.channel))}</option>`).join('')}</select>` +
      (DESKTOP && window.kmv.captureSources ? `<button class="gb-btn gb-cap" title="Pick another app's window (e.g. your game) to show here">${icon.capture}<span>Pick window</span></button>` : '') : '') +
    (gameMode === 'see' && attachOK ? (gameAttached
      ? `<span class="gb-game" title="${esc(gameAttached)}">${icon.game}<span>${esc(gameAttached)}</span></span><button class="gb-btn gb-play" title="Click into the game">Play</button><label class="chk gb-strip" title="Hide the game's own title bar and border so it fills the area"><input type="checkbox"${gameStrip ? ' checked' : ''}>No border</label><button class="gb-btn gb-rel" title="Give the game its own window back">Release</button>`
      : `<button class="gb-btn gb-attach primary-ish" title="Pick your game's window: it moves into this area and stays here">${icon.game}<span>Put a game here</span></button>`) : '') +
    `<span class="gb-grow"></span>` +
    (gameMode === 'see' ? `<label class="chk gb-top" title="Keep Stream Multiview above the game, so clicking the game doesn't hide your streams"><input type="checkbox"${gameOnTop ? ' checked' : ''}>Keep on top</label>` : '') +
    `<span class="gb-seg gb-size" title="Side panel width">${['s', 'm', 'l'].map(z => `<button data-gs="${z}" class="${gameSize === z ? 'on' : ''}">${{ s: 'S', m: 'M', l: 'L' }[z]}</button>`).join('')}</span>` +
    `<button class="gb-btn gb-side" title="Move the side panel to the other side">${gameSide === 'right' ? '⇤ Panel left' : 'Panel right ⇥'}</button>`;
  const tip = gameArea.querySelector('.ga-tip');
  tip.innerHTML = gameMode === 'see'
    ? (attachOK ? '<b>Your game goes here.</b><br>Start the game in <b>windowed</b> mode (or borderless), then click <b>Put a game here</b> above and pick it. It moves into this spot and you play it right here.'
                : '<b>Your game shows here.</b><br>Start the game in <b>borderless</b> or <b>windowed</b> mode (not exclusive full screen) and put it behind Stream Multiview. This area turns see-through so you can play it.')
    : '<b>Pick what to show here</b><br>Choose a stream or another app\'s window above, or drag one onto this spot from the switch control.';
}
async function attachGame(src){
  flash(`Moving “${src.name}” into the game area…`);
  let r = null;
  try { r = await window.kmv.gameAttach({ srcId: src.id, name: src.name, strip: gameStrip }); } catch {}
  if (r && r.ok){ gameAttached = r.name || src.name; flash(`“${gameAttached}” is in the game area. Click it to play.`); }
  else flash(r && r.error === 'notfound' ? `Couldn't find “${src.name}”. Is it still open?` : `Couldn't move “${src.name}” into the game area.`);
  if (isGame()) renderGameBar();
}
async function releaseGameWin(say){
  if (!gameAttached) return;
  const n = gameAttached; gameAttached = null;
  try { await window.kmv.gameRelease(); } catch {}
  if (say) flash(`“${n}” is back in its own window`);
  if (isGame()) renderGameBar();
}
// Keep the see-through hole, "keep on top" and the game area's look in step with what's on screen.
let lastShapeSig = '', lastOnTop = null;
function gameTick(){
  const on = isGame();
  if (!on){ gameArea.style.display = 'none'; gameBar.style.display = 'none'; }
  if (gameAttached && (!on || gameMode !== 'see')) releaseGameWin(true);
  const see = on && shapeOK && gameMode === 'see';
  let d = null;
  if (see && !document.querySelector('.dlg-bg:not([hidden])') && !document.body.classList.contains('dragging')){
    const hr = gameArea.querySelector('.ga-hole').getBoundingClientRect();
    const hole = { x: hr.left + 2, y: hr.top + 2, w: hr.width - 4, h: hr.height - 4 };
    const keep = [];
    const add = el => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (r.right <= hole.x || r.left >= hole.x + hole.w || r.bottom <= hole.y || r.top >= hole.y + hole.h) return;
      keep.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    wins.forEach(w => add(w.el));       // windows you put over the game stay visible on top of it
    document.querySelectorAll('#featSwitch.floating, #fsResize, #miniClip, #toast:not([hidden]), .menu:not([hidden]), #savedPanel:not([hidden]), .popover:not([hidden]), #msg').forEach(el => {
      if (getComputedStyle(el).display !== 'none') add(el);
    });
    d = { hole, keep };
  }
  const sig = JSON.stringify(d && { h: Object.values(d.hole).map(Math.round), k: d.keep.map(k => [k.x, k.y, k.w, k.h].map(Math.round)) });
  if (sig !== lastShapeSig){ lastShapeSig = sig; if (shapeOK) window.kmv.gameShape(d); }
  const top = see && gameOnTop;
  if (top !== lastOnTop){ lastOnTop = top; if (shapeOK) window.kmv.gameOnTop(top); }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  { const g = settings.json('game', {});
    if (g.mode === 'see' || g.mode === 'window') gameMode = g.mode;
    if (['s', 'm', 'l'].includes(g.size)) gameSize = g.size;
    if (g.side === 'left' || g.side === 'right') gameSide = g.side;
    if (typeof g.onTop === 'boolean') gameOnTop = g.onTop;
    if (typeof g.strip === 'boolean') gameStrip = g.strip; }
  shapeOK = DESKTOP && ROLE === 'main' && !!(window.kmv && window.kmv.gameShape) && window.kmv.platform !== 'darwin';
  attachOK = shapeOK && window.kmv.platform === 'win32' && !!window.kmv.gameAttach;
  if (!shapeOK) gameMode = 'window';
  gameArea = mkDiv('gameArea', '<div class="ga-hole"><div class="ga-tip"></div></div>');
  gameBar = mkDiv('gameBar');
  gameBar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.gm){ gameMode = b.dataset.gm; saveGame(); gameLayout(); }
    else if (b.dataset.gs){ gameSize = b.dataset.gs; saveGame(); gameLayout(); }
    else if (b.classList.contains('gb-side')){ gameSide = gameSide === 'right' ? 'left' : 'right'; saveGame(); gameLayout(); }
    else if (b.classList.contains('gb-cap')){ capForGame = true; openCapturePicker(null); }
    else if (b.classList.contains('gb-attach')){ attachForGame = true; openCapturePicker(null); }
    else if (b.classList.contains('gb-rel')) releaseGameWin(true);
    else if (b.classList.contains('gb-play')) window.kmv.gameFocus();
  });
  if (attachOK) fromApp('onGameDetached', d => { if (gameAttached){ flash(`“${gameAttached}” was closed`, { subject: 'windows' }); gameAttached = null; if (isGame()) renderGameBar(); } });
  gameBar.addEventListener('change', e => {
    if (e.target.classList.contains('gb-pick')){ gameKey = e.target.value || null; gameLayout(); }
    else if (e.target.closest('.gb-top')){ gameOnTop = e.target.checked; saveGame(); }
    else if (e.target.closest('.gb-strip')){ gameStrip = e.target.checked; saveGame(); window.kmv.gameStrip(gameStrip); }
  });
  if (ROLE === 'main') setInterval(gameTick, 200);
}

export { attachForGame, attachGame, capForGame, gameKey, gameLayout, gameVars, init, isGame, saveGame, setGameKey };
