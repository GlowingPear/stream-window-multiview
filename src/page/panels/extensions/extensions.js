import '../../toolbar/toolbar-fit.js';   // runs after it (see app.js)
import { reloadView, viewId } from '../../windows/view.js';
import { $, wins } from '../../core.js';
import { icon } from '../../shared/icons.js';
import { DESKTOP } from '../../shared/env.js';
import { PLAT_NAME, extCount, platOf, platformVars, viewPartition, watchSignedIn } from '../../platforms/platforms.js';
import { openSettings, settingsDlg, settingsTab } from '../settings/settings.js';
import { ask } from '../../shared/ask.js';

/* ---------- Chrome extensions (desktop app) ----------
   Settings > Extensions lists them, each with a grid: on or off per site and per window type. Each stream
   and chat window has an extensions button: the extensions in that window, their popups and options, and
   for logged-out streams (each has its own session) switching one on or off for just that window. */
const extPane = $('#settingsDlg .st-pane[data-s=extensions]');
const EXT_PLATS = ['kick', 'twitch', 'youtube'], EXT_COL = { kick: '#53fc18', twitch: '#a970ff', youtube: '#ff3d3d' };
const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
// A site watched signed in has one switch for its chats and streams (they share a session), shown as one
// cell across both rows. A site the extension doesn't name in its manifest is dimmed but can still be set.
function extGridHtml(grid, sites){
  const runs = p => !sites || sites.includes(p);
  let h = '<span class="h"></span>' + EXT_PLATS.map(p => `<span class="h${runs(p) ? '' : ' ex-off'}"><span><i class="pdot" style="background:${EXT_COL[p]}"></i>${PLAT_NAME[p]}`
    + (watchSignedIn[p] ? '<em class="ex-chip">signed in</em>' : '') + '</span>' + (runs(p) ? '' : '<small>Doesn\'t run here</small>') + '</span>').join('');
  for (const [k, label] of [['stream', 'Streams'], ['chat', 'Chats']]){
    h += `<span class="rl">${label}</span>`;
    EXT_PLATS.forEach((p, i) => {
      const at = `grid-column:${i + 2}`, off = runs(p) ? '' : ' ex-off';
      if (!watchSignedIn[p]) h += `<span class="${off}" style="${at}"><input type="checkbox" data-p="${p}" data-k="${k}" aria-label="${PLAT_NAME[p]} ${label.toLowerCase()}"${grid[p][k] ? ' checked' : ''}></span>`;
      else if (k === 'stream') h += `<label class="ex-both${off}" style="${at};grid-row:span 2"><input type="checkbox" data-p="${p}" data-k="chat" aria-label="${PLAT_NAME[p]} chats and streams"${grid[p].chat ? ' checked' : ''}><span>Chats &amp; streams<br>(signed in)</span></label>`;
    });
  }
  return h;
}
const extSignedNote = () => EXT_PLATS.some(p => watchSignedIn[p])
  ? 'Signed-in streams share their chat\'s login, so they share its extensions. To set them separately, watch them logged out in <button class="linkish" data-go="accounts">Accounts</button>.' : '';
function extFill(box, x){
  const warn = box.querySelector('.ex-warn');
  warn.hidden = !x.compat.length && !x.noBlock;
  warn.textContent = x.noBlock
    ? 'It won\'t block anything here: this app doesn\'t have Chrome\'s blocking rules (declarativeNetRequest).' + (x.compat.length ? ` It also uses ${andList(x.compat)}, which aren't here either.` : '')
    : x.compat.length ? `Partly works here: it uses ${andList(x.compat)}, which this app doesn't have.` : '';
  box.querySelector('.ex-grid').innerHTML = extGridHtml(x.grid, x.sites);
  const note = box.querySelector('.ex-note'), t = extSignedNote();
  if (note){ note.hidden = !t; note.innerHTML = t; }
  const ul = box.querySelector('.ex-perms');
  ul.replaceChildren(...(x.perms.length ? x.perms : ['No special access']).map(t => Object.assign(document.createElement('li'), { textContent: t })));
  const img = box.querySelector('.ex-ico');
  if (x.icon) img.src = x.icon; else { img.removeAttribute('src'); img.classList.add('none'); }
}
function extCard(x){
  const el = document.createElement('div');
  el.className = 'ex-card'; el.dataset.id = x.id;
  el.innerHTML = `<div class="ex-top"><img class="ex-ico" alt=""><div class="ex-t"><b></b><small></small></div><input type="checkbox" class="st-sw ex-on" aria-label="On"></div>
    <div class="ex-warn" hidden></div><div class="ex-grid"></div><p class="ex-note" hidden></p>
    <div class="ex-cfoot"><button class="btn ex-pm">Permissions</button>${x.source === 'folder'
      ? `<button class="btn ex-reload" title="Read its folder again, after changing its files">${icon.reload}<span>Reload</span></button>` : ''}<button class="btn ex-rm">Remove</button></div><ul class="ex-perms" hidden></ul>`;
  el.querySelector('.ex-t b').textContent = x.name;
  el.querySelector('.ex-t small').textContent = [x.version && 'v' + x.version, x.source === 'folder' ? 'Loaded from a folder' : 'Chrome Web Store',
    x.missing && (x.source === 'folder' ? 'It couldn\'t be loaded from its folder: fix it and click Reload' : 'Its files are missing: remove it and install it again')].filter(Boolean).join(' · ');
  el.querySelector('.ex-on').checked = x.enabled;
  extFill(el, x);
  el.querySelector('.ex-grid').classList.toggle('st-dim', !x.enabled);
  return el;
}
async function renderExtPane(){
  if (!DESKTOP) return;
  let xs = [];
  try { xs = await window.kmv.extList(); } catch {}
  platformVars.extCount = xs.length;
  extPane.querySelector('.ex-list').replaceChildren(...xs.map(extCard));
  extPane.querySelector('.ex-empty').hidden = xs.length > 0;
  refreshExtButtons();
}
function extMsg(t, ok){
  const m = extPane.querySelector('.ex-msg');
  m.hidden = !t; m.textContent = t || ''; m.classList.toggle('ok', !!ok);
}
async function extInstall(run, busy){
  extMsg(busy, true);
  let r = {};
  try { r = await run(); } catch (e) { r = { error: 'That didn\'t work: ' + e.message }; }
  extMsg(r.error || '', false);
  if (r.id){ extPane.querySelector('.ex-linkrow').hidden = true; renderExtPane(); }
  return r;
}
extPane.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const card = b.closest('.ex-card'), id = card && card.dataset.id;
  if (b.classList.contains('ex-store')) window.kmv.extOpenStore();
  else if (b.classList.contains('ex-link')){
    const row = extPane.querySelector('.ex-linkrow');
    row.hidden = !row.hidden;
    if (!row.hidden) row.querySelector('input').focus();
  }
  else if (b.classList.contains('ex-folder')) extInstall(() => window.kmv.extLoadFolder(), '');
  else if (b.classList.contains('ex-pm')){ const ul = card.querySelector('.ex-perms'); ul.hidden = !ul.hidden; }
  else if (b.classList.contains('ex-reload')){
    b.disabled = true; b.classList.add('spin'); b.querySelector('span').textContent = 'Reloading…';
    extMsg('', false);
    let r = {};
    try { r = await window.kmv.extReload(id); } catch (err) { r = { error: 'That didn\'t work: ' + err.message }; }
    if (r.error) extMsg(r.error, false);
    else if (r.id) extMsg(`Reloaded ${r.name}${r.version ? ' v' + r.version : ''}.`, true);
    renderExtPane();
  }
  else if (b.classList.contains('ex-rm')){
    const name = card.querySelector('.ex-t b').textContent;
    if (!(await ask(`Remove ${name}?`, 'It goes from every window, with its settings.', { ok: 'Remove', danger: true }))) return;
    await window.kmv.extRemove(id);
    renderExtPane();
  }
});
extPane.querySelector('.ex-linkrow').addEventListener('submit', e => {
  e.preventDefault();
  const v = e.target.querySelector('input').value.trim();
  if (v) extInstall(() => window.kmv.extInstallLink(v), 'Downloading…').then(r => { if (r.id) e.target.querySelector('input').value = ''; });
});
extPane.addEventListener('change', async e => {
  const card = e.target.closest('.ex-card'); if (!card) return;
  const id = card.dataset.id, t = e.target;
  if (t.classList.contains('ex-on')){ card.querySelector('.ex-grid').classList.toggle('st-dim', !t.checked); await window.kmv.extSet(id, { enabled: t.checked }); }
  else if (t.dataset.p) await window.kmv.extSet(id, { plat: t.dataset.p, kind: t.dataset.k, on: t.checked });
});

// The install dialog: from the Web Store window, a link or a folder.
const extDlg = $('#extDlg');
let extDlgReq = null;
function showExtDlg(info){
  if (extDlgReq) extDlgDone(false);
  extDlgReq = info;
  extDlg.querySelector('h3').textContent = `${info.reload ? 'Reload' : 'Add'} ${info.name}?`;
  extDlg.querySelector('.ex-src').textContent = (info.source === 'folder' ? 'From a folder' : 'From the Chrome Web Store') + (info.version ? ' · ' + info.version : '')
    + (info.reload ? ' · It now asks for more than before' : '');
  extDlg.querySelector('.ex-yes').textContent = info.reload ? 'Reload' : 'Add extension';
  extFill(extDlg, info);
  extDlg.hidden = false;
  extDlg.querySelector('.ex-yes').focus();
}
function extDlgDone(ok){
  extDlg.hidden = true;
  if (!extDlgReq) return;
  const grid = {};
  extDlg.querySelectorAll('.ex-grid input').forEach(i => { (grid[i.dataset.p] = grid[i.dataset.p] || {})[i.dataset.k] = i.checked; });
  window.kmv.extConfirmReply(extDlgReq.reqId, { ok, grid });
  extDlgReq = null;
}
extDlg.querySelector('.ex-yes').onclick = () => extDlgDone(true);
extDlg.querySelector('.ex-no').onclick = () => extDlgDone(false);
extDlg.addEventListener('pointerdown', e => { if (e.target === extDlg) extDlgDone(false); });

// Each window's extensions button and menu.
const extMenu = $('#extMenu');
let extMenuFor = null;
function extButton(w){
  const b = w.el && w.el.querySelector('.btns [data-a=ext]');
  if (!b) return;
  b.hidden = !extCount;
  const n = b.querySelector('.ext-n');
  if (!extCount){ n.textContent = ''; return; }
  window.kmv.extWindow(viewPartition(w), platOf(w.channel), w.kind)
    .then(xs => { n.textContent = xs.filter(x => x.on).length || ''; }).catch(() => {});
}
function refreshExtButtons(){ if (DESKTOP) wins.forEach(extButton); }
async function openExtMenu(w, btn){
  if (!extMenu.hidden && extMenuFor && extMenuFor.w === w){ extMenu.hidden = true; return; }
  const part = viewPartition(w), plat = platOf(w.channel);
  let xs = [];
  try { xs = await window.kmv.extWindow(part, plat, w.kind); } catch {}
  let tabId = -1;
  if (w.view && w.ready) tabId = viewId(w.view) ?? -1;
  let state = null;
  if (tabId >= 0) try { state = await window.kmv.extActionState(part); } catch {}
  const badge = id => { const a = state && state.actions && state.actions.find(a => a.id === id); return a ? String((a.tabs && a.tabs[tabId] && a.tabs[tabId].text) ?? a.text ?? '') : ''; };
  extMenuFor = { w, btn, part, tabId };
  const where = w.kind === 'chat' ? `${PLAT_NAME[plat]} chats` : `${PLAT_NAME[plat]} streams`;
  const shared = !xs.length || !xs[0].perWindow;
  extMenu.innerHTML = `<div class="em-h menu-head"><span>Extensions in this window</span><button class="menu-set em-set" title="Extension settings" aria-label="Extension settings">${icon.gear}</button></div>`;
  if (!xs.length) extMenu.insertAdjacentHTML('beforeend', '<div class="em-empty">None are switched on. Change that in Settings.</div>');
  for (const x of xs){
    const row = document.createElement('div');
    row.className = 'em-row'; row.dataset.id = x.id;
    row.innerHTML = `<button class="em-main"><span class="em-ico"><img alt=""><b class="em-badge"></b></span><span class="em-t"><b></b><span></span></span></button>`
      + (x.options && x.on ? `<button class="em-opt" title="Its options (for ${w.kind === 'chat' ? where : 'this stream'})">${icon.sliders}</button>` : '')
      + '<input type="checkbox" class="st-sw em-on" aria-label="On in this window">';
    if (x.icon) row.querySelector('img').src = x.icon;
    row.querySelector('.em-t b').textContent = x.name;
    row.querySelector('.em-t span').textContent = x.own ? (x.on ? 'On in this window only' : 'Off in this window only') : (x.on ? 'On for ' : 'Off for ') + where;
    row.querySelector('.em-badge').textContent = x.on ? badge(x.id) : '';
    const main = row.querySelector('.em-main');
    main.disabled = !x.on || !x.popup || tabId < 0;
    if (!main.disabled) main.title = 'Open ' + x.name;
    const sw = row.querySelector('.em-on');
    sw.checked = x.on;
    sw.disabled = !x.perWindow;
    if (!x.perWindow) sw.title = `The same in every ${w.kind === 'chat' ? PLAT_NAME[plat] + ' chat' : 'window with your ' + PLAT_NAME[plat] + ' login'}: change it in Settings`;
    extMenu.appendChild(row);
  }
  extMenu.insertAdjacentHTML('beforeend', `<div class="em-foot"><span>${shared && xs.length ? 'Same for all ' + (w.kind === 'chat' ? where : PLAT_NAME[plat] + ' chats and signed-in streams') : 'Switching one reloads this window'}</span></div>`);
  extMenu.hidden = false;
  const r = btn.getBoundingClientRect(), mw = extMenu.offsetWidth;
  extMenu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
  extMenu.style.top = Math.min(innerHeight - extMenu.offsetHeight - 8, r.bottom + 4) + 'px';
}
extMenu.addEventListener('click', e => {
  const f = extMenuFor; if (!f) return;
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('.em-row') && b.closest('.em-row').dataset.id;
  if (b.classList.contains('em-set')){ extMenu.hidden = true; openSettings('extensions'); }
  else if (b.classList.contains('em-opt')){ extMenu.hidden = true; window.kmv.extOptions(id, f.part); }
  else if (b.classList.contains('em-main')){
    extMenu.hidden = true;
    const r = f.btn.getBoundingClientRect();
    window.kmv.extActivate(f.part, { eventType: 'click', extensionId: id, tabId: f.tabId,
      anchorRect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, alignment: 'bottom left' }).catch(() => {});
  }
});
extMenu.addEventListener('change', e => {
  const f = extMenuFor, row = e.target.closest('.em-row');
  if (!f || !row || !e.target.classList.contains('em-on')) return;
  extMenu.hidden = true;
  window.kmv.extSet(row.dataset.id, { partition: f.part, on: e.target.checked });
});
document.addEventListener('pointerdown', e => {
  if (!extMenu.hidden && !extMenu.contains(e.target) && !(extMenuFor && extMenuFor.btn.contains(e.target))) extMenu.hidden = true;
});
if (DESKTOP && window.kmv.extList){
  window.kmv.extList().then(xs => { platformVars.extCount = xs.length; refreshExtButtons(); }).catch(() => { platformVars.extCount = 0; });
  window.kmv.onExtConfirm(showExtDlg);
  // An extension was switched on or off somewhere: reload the windows it changed, and show the new state.
  window.kmv.onExtChanged(parts => {
    wins.forEach(w => { if (w.view && w.ready && parts.includes(viewPartition(w))) reloadView(w.view); });
    extMenu.hidden = true;
    if (!settingsDlg.hidden && settingsTab === 'extensions') renderExtPane();
    else window.kmv.extList().then(xs => { platformVars.extCount = xs.length; refreshExtButtons(); }).catch(() => {});
  });
}

export { extButton, extDlgDone, openExtMenu, renderExtPane };
