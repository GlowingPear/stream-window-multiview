import { $ } from '../../core.js';
import { palItemFace } from '../../palette/palette.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { IS_MAC } from '../../shared/env.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';

/* ---- Settings › Search box: the search box (Ctrl/⌘+K) on or off, Recent on or off, and what it remembers you ran,
   each with its × and Clear all (asking first, in its place). The box's own Recent uses the same actions
   (commands.forget, commands.forgetAll), so removing one in either place removes it in both. ---- */
let sbPane, sbList, sbCount, sbActs;
let sbForgetting = false;          // Clear all asking first: "Forget all 6, and how often you use each?"

// What's remembered that the app still has, newest first (also while Recent is off: it's kept for when it's on)
const sbItems = () => commands.remembered().map(id => commands.find(id)).filter(Boolean);
function sbRow(it){
  return element('div', { class: 'sb-row', role: 'listitem', dataset: { id: it.id } }, ...palItemFace(it),
    element('button', { type: 'button', class: 'sb-x', title: 'Remove from Recent', 'aria-label': `Remove ${it.title} from Recent`, html: icon.close,
      onclick: () => commands.forget(it.id) }));
}
function renderSearchBox(){
  const on = settings.flag('paletteOn', true), recent = settings.flag('paletteRecent', true), items = sbItems();
  $('#palOnSet').checked = on; $('#palRecentSet').checked = recent;
  sbPane.classList.toggle('sb-off', !on);
  sbPane.classList.toggle('sb-norecent', on && !recent);
  if (!items.length) sbForgetting = false;
  sbCount.textContent = sbForgetting || !items.length ? '' : `${items.length} remembered · the box shows up to 5`;
  const clear = (label, onclick, cmd) => element('button', { type: 'button', class: 'sb-clear', dataset: cmd ? { cmd } : {}, onclick }, element('i', { html: icon.bin }), label);
  const done = () => { sbForgetting = false; renderSearchBox(); };
  sbActs.replaceChildren(...(!items.length ? [] : sbForgetting
    ? [element('b', 'sb-ask', `Forget all ${items.length}, and how often you use each?`),
       element('button', { type: 'button', class: 'btn sb-keep', onclick: done }, 'Keep'),
       clear('Clear all', () => { sbForgetting = false; commands.forgetAll(); })]
    : [clear('Clear all', () => { sbForgetting = true; renderSearchBox(); }, 'palette.clearRecent')]));
  sbList.replaceChildren(...(items.length ? items.map(sbRow) : [element('div', 'sb-none', 'Nothing yet')]));
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  sbPane = $('#settingsDlg .st-pane[data-s="search"]'); if (!sbPane) return;
  sbList = $('#sbList'); sbCount = $('#sbCount'); sbActs = $('#sbActs');
  sbPane.querySelectorAll('.sb-k').forEach(k => { k.textContent = IS_MAC ? '⌘K' : 'Ctrl+K'; });
  sbPane.querySelector('.sb-keys').replaceChildren(...(IS_MAC ? [element('kbd', null, '⌘'), element('kbd', null, '⌫'), ' or '] : []), element('kbd', null, 'Del'));
  $('#palOnSet').addEventListener('change', e => { settings.set('paletteOn', e.target.checked); store.changed('recent'); });
  $('#palRecentSet').addEventListener('change', e => { settings.set('paletteRecent', e.target.checked); store.changed('recent'); });
  // what it lists changes with what's remembered, and with what the app has (a window's commands go with it)
  store.watch(['recent', 'wins', 'saved', 'names', 'layout'], () => renderSearchBox());
  renderSearchBox();
}

export { init };
