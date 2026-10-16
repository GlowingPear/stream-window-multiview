import './column-drag.js';   // runs after it (see app.js)
import { $, MIN_H, MIN_W, colsMode, coreVars, lastLayout, streamCols, wins } from '../core.js';
import { SH, SW, setRect } from './geometry.js';
import { createWin, pushVol } from '../windows/windows.js';
import { closeWin } from '../chat/view-menu.js';
import { autoFit, fitOn } from '../panels/channels/channels.js';
import { flash } from '../shared/flash.js';
import { autoLayout, builtinLinked, chatFocusLayout, colOrder, featBase, featuredCh, layoutVars, linked, liveLinked,
  setColsMode, setFeatured, tile, updateLinkBtn } from './layouts.js';
import { pageStep, scrollVars } from './sideways-scroll.js';
import { refreshPicks } from '../windows/channel-picker.js';
import { buildCols, columnVars, columnsLayout, sideCols } from './columns.js';
import { updateLayoutMenu } from './column-drag.js';
import { updateModeClass } from './chat-focus.js';
import { save } from '../persistence.js';
import { panel } from '../toolbar/toolbar.js';
import { layoutMenuVars, lySel, renderLayoutsPane, selectLayoutPane } from '../toolbar/layout-menu.js';
import { gameLayout } from './game-focus.js';
import { closeSettings } from '../panels/settings/settings.js';
import { ask } from '../shared/ask.js';

/* ---- Your layouts: save the current arrangement under a name and bring it back from the Layout menu ---- */
let presets = [], activePreset = '';
try { presets = JSON.parse(localStorage.getItem('kickMultiview.presets') || '[]'); } catch {}
function activeP(){ try { return activePreset ? presets.find(p => p.name === activePreset) || null : null; } catch { return null; } }   // (hoisted: used before the presets load)
const presetBase = p => p.mode === 'columns' && p.featured ? 'focus' : p.mode;   // the layout it was made from
function leavePreset(){
  if (!activePreset) return;
  activePreset = '';
  if (builtinLinked() !== linked) liveLinked(builtinLinked());
  $('#lmAutoFit').checked = fitOn();
}
// A saved layout's own options: kept with it, and used straight away if it's the one in use
function setPresetOpt(p, key, val){
  p[key] = val; savePresets();
  if (p.name === activePreset){
    if (key === 'linked') liveLinked(val);
    if (key === 'streamCols' && !colsMode && lastLayout === 'chatfocus'){ coreVars.streamCols = val; chatFocusLayout(); }
  }
  updateLayoutMenu();
}
const savePresets = () => { try { localStorage.setItem('kickMultiview.presets', JSON.stringify(presets)); } catch {} };
const MODE_NAMES = { focus: 'Focus view', game: 'Game focus', columns: 'Columns', chatfocus: 'Chat focus', auto: 'Auto layout', tile: 'Tile', free: 'Free arrangement' };
function capturePreset(name){
  return {
    name, savedAt: Date.now(), sw: SW(), sh: SH(),
    mode: colsMode ? 'columns' : (['chatfocus', 'auto', 'tile', 'game'].includes(lastLayout) ? lastLayout : 'free'),
    featured: colsMode && featBase.length ? featuredCh : null,
    sideCols, linked, streamCols, pageStep, autoFit: fitOn(),
    order: buildCols().map(c => c.key),
    windows: wins.filter(w => w.kind !== 'capture').map(w => ({ kind: w.kind, channel: w.channel, url: w.url, vol: w.vol, muted: w.muted, preview: !!w.preview, x: w.x, y: w.y, w: w.w, h: w.h }))
  };
}
function presetSummary(p){
  const n = p.windows.filter(w => w.kind === 'stream').length, c = p.windows.filter(w => w.kind === 'chat').length;
  return `${MODE_NAMES[p.mode] || 'Layout'}${p.featured ? ' + highlight' : ''} · ${n} stream${n === 1 ? '' : 's'}, ${c} chat${c === 1 ? '' : 's'}`;
}
function renderPresets(){
  const box = $('#presetList'); if (!box) return;
  box.innerHTML = '';
  if (!presets.length) box.innerHTML = '<div class="pr-empty">Arrange things how you like, then name and save it below.</div>';
  presets.forEach(p => {
    const row = document.createElement('div'); row.className = 'pr-row' + (p.name === activePreset ? ' on' : '');
    row.innerHTML = '<button class="pr-load"><b></b><span></span></button>';
    row.querySelector('b').textContent = p.name;
    row.querySelector('span').textContent = presetSummary(p);
    row.querySelector('.pr-load').onclick = () => { $('#layoutMenu').hidden = true; applyPreset(p); };
    box.appendChild(row);
  });
  renderPresetsPane();
}
// Settings > Layouts: your layouts listed under the built-in ones, each with its base layout's options
const OPT_NAMES = { linked: 'Linked', autoFit: 'Fit in channels that open by themselves' };
function renderPresetsPane(){
  const list = $('#lyPresetList'), detail = $('#lyPresetDetail'); if (!list) return;
  list.innerHTML = '<div class="ly-list-sec"><span>Your layouts</span><button class="ly-add" title="Save what\'s on screen as a layout">+ Save</button></div>'
    + (presets.length ? '' : '<div class="ly-empty">Arrange the windows how you like, then save them here.</div>');
  detail.innerHTML = '';
  list.querySelector('.ly-add').onclick = () => { selectLayoutPane('+new'); $('#lyPresetName').focus(); };
  presets.forEach((p, i) => {
    const k = 'p:' + p.name, base = presetBase(p), pic = document.querySelector(`#layoutMenu [data-l="${base}"] .lm-pic`);
    const item = document.createElement('button'); item.className = 'ly-item'; item.dataset.k = k; item.setAttribute('role', 'option');
    item.innerHTML = '<span></span><em></em>';
    item.prepend(pic ? pic.cloneNode(true) : Object.assign(document.createElement('i'), { className: 'ly-free' }));
    item.querySelector('span').textContent = p.name;
    list.appendChild(item);
    const panel = document.createElement('div'); panel.className = 'ly-panel'; panel.dataset.k = k; panel.hidden = true;
    panel.innerHTML = '<div class="ly-head"><b></b><button class="btn ly-use">Use</button></div><p class="ly-desc"></p>'
      + '<div class="ly-acts"><button class="btn pr-ren">Rename</button><button class="btn pr-up" title="Save what\'s on screen now over this one">Update to what\'s on screen</button><button class="btn pr-x">Delete</button></div>';
    if (pic) panel.prepend(pic.cloneNode(true));
    panel.querySelector('b').textContent = p.name;
    panel.querySelector('.ly-desc').textContent = presetSummary(p) + (pic ? ` · Made from ${MODE_NAMES[base]}, with its own options.` : '');
    panel.querySelector('.ly-use').onclick = () => { closeSettings(); applyPreset(p); };
    panel.querySelector('.pr-ren').onclick = () => renamePreset(panel.querySelector('.ly-head b'), p);
    panel.querySelector('.pr-up').onclick = async () => {
      if (!await ask(`Update “${p.name}”?`, `Replace this saved layout with what's on screen now.`, { ok: 'Update' })) return;
      presets[i] = capturePreset(p.name); savePresets(); activePreset = p.name; updateLayoutMenu(); flash(`Updated layout “${p.name}”`, { subject: 'layouts' });
    };
    panel.querySelector('.pr-x').onclick = async () => {
      if (!await ask(`Delete the layout “${p.name}”?`, 'This can\'t be undone.', { ok: 'Delete', danger: true })) return;
      presets.splice(i, 1); savePresets(); if (activePreset === p.name) leavePreset(); updateLayoutMenu();
    };
    // the options of the layout it was made from, its own values
    const sw = (key, on, small) => {
      const o = document.createElement('label'); o.className = 'st-opt';
      o.innerHTML = `<span class="st-t"><span></span><small>${small}</small></span><input type="checkbox" class="st-sw">`;
      o.querySelector('.st-t > span').textContent = OPT_NAMES[key];
      const c = o.querySelector('input'); c.checked = on; c.dataset.opt = key;
      c.addEventListener('change', () => setPresetOpt(p, key, c.checked));
      panel.appendChild(o);
    };
    if (base === 'columns' || base === 'focus') sw('linked', p.linked !== false, 'Each stream and its chat move together. Off: move and resize windows freely.');
    else if (base === 'auto') sw('autoFit', !!p.autoFit, 'A saved channel that opens because it went live goes last (its chat too), and the others keep their order.');
    else if (base === 'chatfocus'){
      const o = document.createElement('div'); o.className = 'st-opt';
      o.innerHTML = '<span class="st-t">Stream columns</span><div class="lm-sw pr-cols">' + [1, 2, 3].map(n => `<button data-n="${n}">${n}</button>`).join('') + '</div>';
      o.querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.n === (p.streamCols || 1)); b.onclick = () => setPresetOpt(p, 'streamCols', +b.dataset.n); });
      panel.appendChild(o);
    } else panel.insertAdjacentHTML('beforeend', '<div class="ly-none">No options for this one.</div>');
    detail.appendChild(panel);
  });
  if (lySel) selectLayoutPane(lySel);      // rebuilt: keep the one that's picked
}
function renamePreset(t, p){
  const inp = document.createElement('input');
  inp.className = 'st-in'; inp.maxLength = 40; inp.value = p.name; inp.spellcheck = false; inp.setAttribute('aria-label', 'New name');
  t.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = keep => {
    if (done) return; done = true;
    const name = inp.value.trim().slice(0, 40);
    if (keep && name && name !== p.name){
      if (presets.some(o => o !== p && o.name.toLowerCase() === name.toLowerCase())) flash(`There's already a layout called “${name}”`);
      else { if (activePreset === p.name) activePreset = name; if (lySel === 'p:' + p.name) layoutMenuVars.lySel = 'p:' + name; p.name = name; savePresets(); }
    }
    updateLayoutMenu(); renderLayoutsPane();
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
}
async function savePresetFromInput(inp = $('#presetName')){
  const name = inp.value.trim().slice(0, 40);
  if (!name){ inp.focus(); return; }
  if (!wins.length){ flash('Open some streams first'); return; }
  const i = presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  if (i >= 0 && !await ask(`Replace “${presets[i].name}”?`, 'A layout with this name already exists. Saving replaces it with what\'s on screen now.', { ok: 'Replace' })) return;
  const p = capturePreset(name);
  if (i >= 0) presets[i] = p; else presets.push(p);
  savePresets(); inp.value = ''; activePreset = name; updateLayoutMenu();
  flash(`Saved layout “${name}”`, { subject: 'layouts' });
  return name;
}
function applyPreset(p, opt = {}){
  // Windows that are already open are kept (no reload); the rest close; missing ones open.
  const want = p.windows.map(x => ({ ...x })), keep = new Set();
  want.forEach(x => {
    const m = wins.find(w => !keep.has(w) && w.kind === x.kind && (x.channel ? w.channel === x.channel : w.url === x.url));
    if (m){ keep.add(m); x.match = m; }
  });
  [...wins].forEach(w => { if (!keep.has(w) && w.kind !== 'capture') closeWin(w); });
  if (colsMode && p.mode !== 'columns') setColsMode(false);
  const fx = SW() / (p.sw || SW()), fy = SH() / (p.sh || SH());
  const scaled = x => ({ x: x.x * fx, y: x.y * fy, w: Math.max(MIN_W, x.w * fx), h: Math.max(MIN_H, x.h * fy) });
  const made = want.map(x => {
    if (x.match){
      const w = x.match; setRect(w, scaled(x), true);
      if (!opt.keepVol && w.kind === 'stream' && (w.vol !== x.vol || w.muted !== x.muted)){ w.vol = x.vol; w.muted = x.muted; pushVol(w); }
      if (w.kind === 'stream' && !!w.preview !== !!x.preview) w.preview = !!x.preview;
      return w;
    }
    return createWin({ kind: x.kind, channel: x.channel, url: x.url, vol: x.vol, muted: x.muted, preview: x.preview }, scaled(x));
  });
  coreVars.wins = [...made, ...wins.filter(w => !made.includes(w))];      // same window order as when saved
  layoutVars.colOrder = (p.order || []).slice();
  try { localStorage.setItem('kickMultiview.colOrder', JSON.stringify(colOrder)); } catch {}
  if (typeof p.linked === 'boolean' && p.linked !== linked){ layoutVars.linked = p.linked; if (opt.quiet) try { localStorage.setItem('kickMultiview.linked', linked ? '1' : '0'); } catch {} updateLinkBtn(); }   // a saved layout's own; undo's are the built-in's
  columnVars.sideCols = p.sideCols || 0; try { localStorage.setItem('kickMultiview.sideCols', String(sideCols)); } catch {}
  coreVars.streamCols = p.streamCols || 1;      // the same default its options show
  if (typeof p.pageStep === 'boolean'){ scrollVars.pageStep = p.pageStep; try { localStorage.setItem('kickMultiview.pageStep', pageStep ? '1' : '0'); } catch {} }
  if (p.mode === 'columns'){
    setFeatured(p.featured || null); layoutVars.scrollX = 0; columnsLayout();
    document.body.classList.toggle('linked', linked);
  } else {
    setFeatured(null);
    if (p.mode === 'chatfocus') chatFocusLayout();
    else if (p.mode === 'tile') tile();
    else if (p.mode === 'auto'){ coreVars.lastLayout = 'auto'; autoLayout(); }
    else if (p.mode === 'game') gameLayout();
    else coreVars.lastLayout = null;
  }
  if (!opt.quiet) activePreset = p.name;
  updateLayoutMenu(); updateModeClass(); refreshPicks(); save();
  if (!opt.quiet) flash(`Layout “${p.name}” loaded`);
}

export { activeP, activePreset, applyPreset, capturePreset, leavePreset, renderPresets, renderPresetsPane,
  savePresetFromInput, setPresetOpt };
