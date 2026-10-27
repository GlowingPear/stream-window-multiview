import { $, ROLE, colsMode, coreVars, stage } from '../core.js';
import { chatRailLayout } from '../layout/chat-rail.js';
import { chatStageLayout } from '../layout/chat-stage.js';
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
import { commands } from '../shared/commands.js';
import { DESKTOP } from '../shared/env.js';
import { icon } from '../shared/icons.js';
import { closeOnOutside } from '../shared/popover.js';
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

// The search box's (Ctrl/⌘+K): each layout, and everything in the Layout menu
const LAYOUT_KEYS = { focus: 'F', game: 'G', columns: 'C', chatfocus: 'Shift+C', stage: 'K', rail: 'Shift+K', auto: 'A', tile: 'T' };
const LAYOUT_SHORT = { focus: 'One stream big with its chat, the rest beside it', game: 'Your game big, streams and chats beside it', columns: 'Every stream above its chat',
  chatfocus: 'Streams down the side, chats get the rest', stage: 'One stream and its chat in big text', rail: 'Every stream, one chat in a rail', auto: 'Streams in a grid, chats on the right',
  tile: 'Everything fits the screen' };
const LAYOUT_WORDS = { focus: ['big stream', 'spotlight'], game: ['play', 'gaming'], columns: ['side by side'], chatfocus: ['chats'],
  stage: ['big chat', 'read chat'], rail: ['grid', 'chat tabs'], auto: ['grid'], tile: ['even', 'grid', 'equal'] };
function openLayoutMenuAt(t){
  if (layoutMenu.hidden) layoutBtn.click();
  layoutMenu.querySelector('.lm-tabs').selectTab(t);
}
function addLayoutCommands(){
  layoutMenu.querySelectorAll('.lm-tabs [data-t]').forEach(b => { b.dataset.cmd = 'layoutMenu.' + b.dataset.t; });
  layoutMenu.querySelectorAll('button[data-l]').forEach(b => {
    const l = b.dataset.l;
    commands.add({ id: 'layout.' + l, kind: 'layout', group: 'Layouts', title: b.querySelector('b').textContent, sub: LAYOUT_SHORT[l] || b.querySelector('span').textContent,
      words: [...(LAYOUT_WORDS[l] || []), 'layout'], pic: l, keys: LAYOUT_KEYS[l], verb: 'Use', button: `#layoutMenu button[data-l="${l}"]`, when: () => true,
      boost: () => curLayout() === l ? -20 : 0, tags: () => curLayout() === l ? ['In use'] : [] });
  });
  commands.add([
    { id: 'switch.toggle', group: 'Switch control', title: 'Switch control', sub: 'Show it as a panel you can move and resize, in any layout (again to put it away)', words: ['switcher'], icon: 'float', keys: 'S', button: '#swBtn' },
    { id: 'layout.menu', group: 'More', title: 'Layout menu', sub: 'The layouts, your saved layouts and their options', icon: 'layout', keys: 'L', button: '#layoutBtn' },
    { id: 'layout.settings', group: 'More', title: 'Layout settings', sub: 'Settings › Layouts', icon: 'gear', button: '#layoutSet', when: () => true },
    { id: 'layout.linked', kind: 'action', group: 'Layout options', title: 'Stream and chat together', sub: 'Each stream and its chat move together (Columns, Focus view)', words: ['linked', 'move together', 'link chat'],
      icon: 'link', toggle: { get: () => linked, set: on => setLinked(on) } },
    { id: 'layout.autofit', group: 'Layout options', title: 'Fit in channels that open by themselves', sub: 'Auto layout: added as the last stream when they go live',
      icon: 'bolt', when: () => curLayout() === 'auto', toggle: { get: () => $('#lmAutoFit').checked, set: on => { $('#lmAutoFit').checked = on; $('#lmAutoFit').dispatchEvent(new Event('change')); } } },
    ...[1, 2, 3].map(n => ({ id: 'layout.cols' + n, group: 'Layout options', title: `Stream columns: ${n}`, sub: 'Chat focus: streams down the side in ' + n + (n > 1 ? ' columns' : ' column'),
      words: ['chat focus columns'], icon: 'colsview', button: `#lmCols button[data-n="${n}"]`, when: () => curLayout() === 'chatfocus' })),
    ...[['dock', 'Docked', 'Under the big stream, in Focus view only'], ['float', 'Floating', 'A panel you can move and resize, in every layout'], ['window', 'Own window', 'Put it anywhere, even on another monitor']]
      .map(([k, t, d]) => ({ id: 'switch.' + k, group: 'Switch control', title: 'Switch control: ' + t, sub: d, words: ['switcher'], icon: k === 'window' ? 'popwin' : k,
        button: `button[data-sw="${k}"]`, when: () => !!$(`#swModes button[data-sw="${k}"]`), tags: () => switchMode === k ? ['In use'] : [] })),
    ...[['top', 'Top', 'A bar across the top of the window'], ['left', 'Left', 'A column down the side, each button with its name'], ['icons', 'Left, icons only', 'A slim column: the most room for the streams']]
      .map(([k, t, d]) => ({ id: 'toolbar.' + k, group: 'Toolbar', title: 'Toolbar: ' + t, sub: d, words: ['bar position', 'sidebar'], icon: 'hidebar',
        button: `#layoutMenu button[data-tbv="${k}"]`, when: () => true, tags: () => document.querySelector(`#layoutMenu button[data-tbv="${k}"]`)?.classList.contains('on') ? ['In use'] : [] })),
    ...[['layouts', 'Layouts'], ['switch', 'Switch control'], ['toolbar', 'Toolbar']].map(([t, n]) => ({ id: 'layoutMenu.' + t, kind: 'tab', group: 'Layout menu',
      title: 'Layout menu: ' + n, sub: 'The Layout menu, on its ' + n + ' tab', icon: 'layout', run: () => openLayoutMenuAt(t) }))
  ]);
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
    if (!DESKTOP) document.querySelectorAll('#swModes .desk-only, #layoutMenu .zoom-row, #settingsDlg .st-zoom').forEach(b => b.remove());
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
      else if (l === 'stage') chatStageLayout();
      else if (l === 'rail') chatRailLayout();
      else if (l === 'auto'){ coreVars.lastLayout = 'auto'; autoLayout(); }   // first, so its save() stores it
      else tile();
      store.changed('layout');
    });
    closeOnOutside(layoutMenu, { button: layoutBtn });
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
    addLayoutCommands();
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
