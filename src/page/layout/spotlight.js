import { BAR, GAP, coreVars, shownWins } from '../core.js';
import { SH, SW } from './geometry.js';
import { applyRects } from './layouts.js';
import { save } from '../persistence.js';

/* Spotlight (streams window): the selected stream big, the others stacked beside it. */
function spotlight(){
  const vids = shownWins().filter(w => w.kind !== 'chat'); if (!vids.length) return;
  const act = vids.find(w => w.el.classList.contains('active')) || vids[0];
  const others = vids.filter(w => w !== act);
  const W = SW() - GAP, H = SH() - GAP, X = GAP / 2, Y = GAP / 2;
  coreVars.lastLayout = 'spot';
  if (!others.length){ applyRects([act], [{ x: X + GAP / 2, y: Y + GAP / 2, w: W - GAP, h: H - GAP }]); save(); return; }
  const bigW = Math.min((H - GAP - BAR) * 16 / 9 + GAP, W * 0.78);
  const bigH = Math.min(H, (bigW - GAP) * 9 / 16 + BAR + GAP);
  const sideW = W - bigW, n = others.length;
  let best = null;
  for (let c = 1; c <= Math.min(n, 3); c++){
    const r = Math.ceil(n / c), cw = sideW / c;
    const ch = Math.min(H / r, (cw - GAP) * 9 / 16 + BAR + GAP);
    const vw = (ch - GAP - BAR) * 16 / 9;
    if (!best || vw > best.vw + 1) best = { c, ch, cw: Math.min(cw, vw + GAP), vw };
  }
  applyRects([act], [{ x: X + GAP / 2, y: Y + GAP / 2, w: bigW - GAP, h: bigH - GAP }]);
  applyRects(others, others.map((o, i) => ({
    x: X + bigW + (i % best.c) * best.cw + GAP / 2, y: Y + Math.floor(i / best.c) * best.ch + GAP / 2,
    w: best.cw - GAP, h: best.ch - GAP
  })));
  save();
}

export { spotlight };
