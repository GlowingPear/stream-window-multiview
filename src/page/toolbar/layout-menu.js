import { $, ROLE, colsMode, coreVars, stage } from '../core.js';
import { curLayout, updateLayoutMenu, updateSwBtn } from '../layout/column-drag.js';
import { columnsLayout } from '../layout/columns.js';
import { gameLayout } from '../layout/game-focus.js';
import { autoLayout, chatFocusLayout, hbar, layoutVars, linked, scrollRaf, scrollX, setColsMode, setFeatured,
  setLinked, switchMode, tile } from '../layout/layouts.js';
import { activeP, activePreset, leavePreset, renderPresetsPane, savePresetFromInput, setPresetOpt } from '../layout/saved-layouts.js';
import { scrollCols, setScrollX, snapSoon } from '../layout/sideways-scroll.js';
import { openFocusView, setSwitchMode } from '../layout/switch-control.js';
import { setAutoFit } from '../panels/channels/channels.js';
import { closeSettings, openSettings } from '../panels/settings/settings.js';
import { DESKTOP } from '../shared/env.js';
import { icon } from '../shared/icons.js';
import { store } from '../shared/store.js';
import { panel, placeMenu, wireTabs } from './toolbar.js';

let layoutMenu, layoutBtn;
function syncLySw(){ document.querySelectorAll('#lySw button').forEach(b => b.classList.toggle('on', b.dataset.sw === switchMode)); }
let lySel = '';
// Other files change these through layoutMenuVars: a variable imported from another file can't be assigned to.
const layoutMenuVars = {
  get lySel(){ return lySel; }, set lySel(v){ lySel = v; },
};
function selectLayoutPane(k){
  lySel = k;
  document.querySelectorAll('#lyList .ly-item').forEach(x => { const on = x.dataset.k === k; x.classList.toggle('sel', on); x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('#lyDetail .ly-panel').forEach(x => { x.hidden = x.dataset.k !== k; });
}
// fresh: opening the tab shows the layout in use
function renderLayoutsPane(fresh){
  renderPresetsPane();
  const cur = curLayout(), now = activePreset ? 'p:' + activePreset : cur, inUse = k => k === now;
  document.querySelectorAll('#lyList .ly-item').forEach(x => { x.classList.toggle('on', inUse(x.dataset.k)); x.querySelector('em').textContent = inUse(x.dataset.k) ? 'In use' : ''; });
  document.querySelectorAll('#lyDetail .ly-panel').forEach(x => {
    const b = x.querySelector('.ly-use'); if (!b) return;
    x.classList.toggle('on', inUse(x.dataset.k)); b.textContent = inUse(x.dataset.k) ? 'In use' : 'Use'; b.disabled = inUse(x.dataset.k);
  });
  const has = k => k === '+new' || (k && document.querySelector(`#lyList .ly-item[data-k="${CSS.escape(k)}"]`));
  if (fresh || !has(lySel)) selectLayoutPane(has(now) ? now : has(lySel) ? lySel : 'focus');
  else selectLayoutPane(lySel);
  $('#lyLinked').checked = linked;
  syncLySw();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* layout menu (main window) */
  layoutMenu = $('#layoutMenu'), layoutBtn = $('#layoutBtn');
  if (ROLE === 'main'){
    layoutBtn.hidden = false;
    $('#tile').hidden = true;
    const swBtn = $('#swBtn');
    swBtn.hidden = false;
    swBtn.onclick = () => setSwitchMode(switchMode === 'dock' ? 'float' : 'dock');
    if (!DESKTOP) document.querySelectorAll('#swModes .desk-only, #layoutMenu .zoom-row, #settingsDlg .ly-zoom').forEach(b => b.remove());
    $('#swModes').querySelectorAll('i[data-ico]').forEach(i => { i.innerHTML = icon[i.dataset.ico]; });
    $('#swModes').addEventListener('click', e => {
      const b = e.target.closest('button[data-sw]'); if (!b) return;
      setSwitchMode(b.dataset.sw);                         // the menu stays open: the tick moves
    });
    // its tabs: Layouts (where it opens), Switch control and Toolbar, like Settings > Layouts
    wireTabs(layoutMenu.querySelector('.lm-tabs'), t => {
      layoutMenu.querySelectorAll('.lm-pane').forEach(p => { const on = p.dataset.t === t; p.classList.toggle('on', on); p.inert = !on; });
    });
    updateSwBtn();
    layoutBtn.onclick = () => {
      layoutMenu.hidden = !layoutMenu.hidden;
      if (!layoutMenu.hidden){
        layoutMenu.querySelector('.lm-tabs').selectTab('layouts');
        store.changed('layout');
        placeMenu(layoutMenu, layoutBtn);
      }
    };
    layoutMenu.addEventListener('click', e => {
      const b = e.target.closest('button[data-l]'); if (!b) return;
      const l = b.dataset.l;
      layoutMenu.hidden = true;
      leavePreset();
      if (l === 'focus'){ openFocusView(); return; }
      if (l === 'game'){ setFeatured(null); setColsMode(false); gameLayout(); return; }
      if (l === 'columns'){ setFeatured(null); layoutVars.scrollX = 0; columnsLayout(); return; }
      setColsMode(false);
      if (l === 'chatfocus') chatFocusLayout();
      else if (l === 'auto'){ coreVars.lastLayout = 'auto'; autoLayout(); }   // first, so its save() stores it
      else tile();
      store.changed('layout');
    });
    document.addEventListener('pointerdown', e => {
      if (!layoutMenu.hidden && !layoutMenu.contains(e.target) && e.target !== layoutBtn) layoutMenu.hidden = true;
    });
    $('#presetSave').onclick = () => savePresetFromInput();
    $('#layoutSet').onclick = () => {                     // Settings > Layouts, on the menu's tab
      const t = layoutMenu.querySelector('.lm-tabs button.on').dataset.t;
      layoutMenu.hidden = true; openSettings('layouts'); $('#lyTabs').selectTab(t);
    };
    const hint = b => { $('#lmHint').textContent = b.querySelector('span').textContent; };
    layoutMenu.querySelectorAll('.lm-grid button').forEach(b => { b.addEventListener('pointerenter', () => hint(b)); b.addEventListener('focus', () => hint(b)); });
    layoutMenu.querySelector('.lm-grid').addEventListener('pointerleave', updateLayoutMenu);
    $('#lmLinked').addEventListener('change', e => setLinked(e.target.checked));
    $('#lmAutoFit').addEventListener('change', e => { const ap = activeP(); if (ap) setPresetOpt(ap, 'autoFit', e.target.checked); else setAutoFit(e.target.checked); });
    $('#lmCols').addEventListener('click', e => {
      const b = e.target.closest('button[data-n]'); if (!b || b.disabled) return;
      const ap = activeP(); if (ap) setPresetOpt(ap, 'streamCols', +b.dataset.n); else { coreVars.streamCols = +b.dataset.n; chatFocusLayout(); store.changed('layout'); }
    });
    // Settings > Layouts: each layout from the menu, with its options under it
    const lyList = $('#lyList');
    layoutMenu.querySelectorAll('button[data-l]').forEach(b => {
      const l = b.dataset.l, name = b.querySelector('b').textContent, pic = b.querySelector('.lm-pic');
      const item = document.createElement('button'); item.className = 'ly-item'; item.dataset.l = item.dataset.k = l; item.setAttribute('role', 'option');
      item.innerHTML = '<span></span><em></em>';
      item.prepend(pic.cloneNode(true)); item.querySelector('span').textContent = name;
      lyList.insertBefore(item, $('#lyPresetList'));
      const panel = document.createElement('div'); panel.className = 'ly-panel'; panel.dataset.l = panel.dataset.k = l; panel.hidden = true;
      panel.innerHTML = '<div class="ly-head"><b></b><button class="btn ly-use">Use</button></div><p class="ly-desc"></p>';
      panel.prepend(pic.cloneNode(true));
      panel.querySelector('b').textContent = name;
      panel.querySelector('.ly-desc').textContent = b.querySelector('span').textContent;
      panel.querySelector('.ly-use').onclick = () => { closeSettings(); b.click(); };
      const opt = document.querySelector(`#settingsDlg [data-opt="${l}"]`);
      if (opt) panel.appendChild(opt); else panel.insertAdjacentHTML('beforeend', '<div class="ly-none">No options for this one.</div>');
      $('#lyDetail').insertBefore(panel, $('#lyPresetDetail'));
    });
    // pick one on the left (click, or the arrow keys) to see it on the right
    lyList.addEventListener('click', e => { const it = e.target.closest('.ly-item'); if (it) selectLayoutPane(it.dataset.k); });
    lyList.addEventListener('keydown', e => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const items = [...lyList.querySelectorAll('.ly-item')], i = items.findIndex(x => x.dataset.k === lySel);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      selectLayoutPane(items[n].dataset.k); items[n].focus();
    });
    wireTabs($('#lyTabs'), t => {
      document.querySelectorAll('#settingsDlg [data-s=layouts] .st-subpane').forEach(p => { p.hidden = p.dataset.t !== t; });
    });
    if (!DESKTOP) $('#lySw .desk-only').remove();
    $('#lySw').querySelectorAll('i[data-ico]').forEach(i => { i.innerHTML = icon[i.dataset.ico]; });
    $('#lySw').addEventListener('click', e => { const b = e.target.closest('button[data-sw]'); if (b) setSwitchMode(b.dataset.sw); });
    const saveFromPane = async () => { const n = await savePresetFromInput($('#lyPresetName')); if (n){ lySel = 'p:' + n; renderLayoutsPane(); } };
    $('#lyPresetSave').onclick = saveFromPane;
    $('#lyPresetName').addEventListener('keydown', e => { if (e.key === 'Enter') saveFromPane(); });
    $('#presetName').addEventListener('keydown', e => { if (e.key === 'Enter') savePresetFromInput(); });
  }
  $('#colNav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) scrollCols(+b.dataset.d); });
  // In Columns mode, scrolling the mouse wheel over title bars or empty space moves sideways.
  stage.addEventListener('wheel', e => {
    if (!colsMode || !(e.target === stage || e.target === hbar || e.target.closest('.bar, #hscroll, #colStrip, #colNav'))) return;
    e.preventDefault();
    cancelAnimationFrame(scrollRaf);
    setScrollX(scrollX + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    snapSoon();
  }, { passive: false });
}

export { init, layoutBtn, layoutMenu, layoutMenuVars, lySel, renderLayoutsPane, selectLayoutPane, syncLySw };
