import { $ } from '../../core.js';
import { autoOpen, channelVars, infoFor, persistSaved, saved, svHue, svInitials, svProf, toggleAutoOpen } from '../channels/channels.js';
import { accountsOf, canLink, link, linkOpt, linkedOn, nameOf, notSame, ordered, setMain, setOn, setStreamerOpt,
  streamerName, streamerOf, suggestions, unlink, unlinkAll } from '../../platforms/linked.js';
import { PLATFORMS, PLAT_NAME, chLabel, parseInput, platOf } from '../../platforms/platforms.js';
import { ask } from '../../shared/ask.js';
import { element } from '../../shared/element.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { store } from '../../shared/store.js';

/* ---- The Link accounts card: one streamer's accounts (live or not), the main one, suggestions, adding an account
   by site and name, @handle or link, and this streamer's own choices. Opened from Channels (▾ › Link another
   account…), a window's ⋯, a profile, Settings › Linked accounts and the search box. ---- */
let dlg, card, cur = [], curPlat = 'kick', addFocus = false;
function openLinkCard(ch, { add } = {}){
  if (!linkedOn()){ setOn(true); flash('Linked accounts turned on (Settings › Linked accounts)'); }
  cur = ch ? accountsOf(ch) : [];
  addFocus = !!add || !ch;
  dlg.hidden = false;
  renderCard();
}
const closeLinkCard = () => { dlg.hidden = true; };
// The accounts shown: a streamer's, or the ones picked so far (one, before there's a second to link)
function accounts(){
  const s = cur.length ? streamerOf(cur[0]) : null;
  if (s){ cur = ordered(s); return { s, chs: cur }; }
  cur = cur.filter(c => !streamerOf(c) || cur.length === 1);
  return { s: null, chs: cur };
}
function liveText(ch){
  const i = infoFor(ch);
  if (!i) return element('span', 'lc-st', 'Checking…');
  if (i.missing) return element('span', 'lc-st lc-bad', 'Channel not found');
  return i.live ? element('span', 'lc-st lc-live', `Live · ${Number(i.viewers || 0).toLocaleString()} watching`) : element('span', 'lc-st', 'Offline');
}
const lcSite = ch => element('i', { class: 'pi pi-' + platOf(ch) }, PLAT_NAME[platOf(ch)][0]);
function renderCard(){
  if (dlg.hidden) return;
  const { s, chs } = accounts();
  const name = s ? streamerName(s) : chs[0] ? chLabel(chs[0]) : 'Link accounts';
  const prof = chs[0] && svProf[chs[0]] && svProf[chs[0]].info;
  const av = element('span', { class: 'lc-av', style: { '--c': svHue(chs[0] || 'x') } }, svInitials(name));
  if (prof && prof.avatar){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = prof.avatar; av.appendChild(im); }
  const parts = [element('div', 'lc-head', av, element('div', null, element('h3', { id: 'lcName' }, name), element('p', null, chs.length ? 'One streamer, on several sites' : 'Start with one of their channels, then add their other sites')))];
  if (chs.length){
    parts.push(element('div', 'lc-sec', 'Accounts'), ...chs.map(ch => element('div', 'lc-acc', lcSite(ch), element('div', 'lc-acc-t', element('b', null, chLabel(ch)), liveText(ch)),
      s && ch === s.main ? element('span', 'lc-main', 'Main') : s ? element('button', { type: 'button', class: 'btn lc-mk', dataset: { cmd: 'link.main' }, onclick: () => { setMain(ch); renderCard(); } }, 'Make main') : null,
      element('button', { type: 'button', class: 'lc-x', title: s ? `Unlink ${chLabel(ch)} on ${PLAT_NAME[platOf(ch)]}` : 'Remove', 'aria-label': 'Remove', html: icon.close, dataset: { cmd: 'link.unlink' },
        onclick: () => { if (s) unlinkOne(ch); else { cur = cur.filter(c => c !== ch); renderCard(); } } }))));
  }
  // suggestions for these accounts
  const sugs = chs.length ? suggestions({ all: true }).filter(x => chs.includes(x.a) !== chs.includes(x.b) && (chs.includes(x.a) || chs.includes(x.b))).slice(0, 3) : [];
  if (sugs.length){
    parts.push(element('div', 'lc-sec', 'Suggested'), ...sugs.map(x => {
      const other = chs.includes(x.a) ? x.b : x.a, mine = other === x.b ? x.a : x.b;
      return element('div', 'lc-acc lc-sug', lcSite(other), element('div', 'lc-acc-t', element('b', null, chLabel(other)), element('span', 'lc-st', x.why)),
        element('button', { type: 'button', class: 'btn primary', dataset: { cmd: 'link.sug' }, onclick: () => addAccount(other, mine) }, 'Link'),
        element('button', { type: 'button', class: 'btn lc-no', title: 'Not the same streamer (never suggested again)', 'aria-label': 'Not the same', html: icon.close, dataset: { cmd: 'link.not' }, onclick: () => { notSame(mine, other); renderCard(); } }));
    }));
  }
  // add an account: its site, and a name, @handle or link
  const free = Object.keys(PLATFORMS).filter(p => !chs.some(c => platOf(c) === p));
  if (!free.includes(curPlat)) curPlat = free[0] || 'kick';
  if (free.length){
    const inp = element('input', { class: 'st-in lc-in', id: 'lcIn', placeholder: 'Name, @handle or link', autocomplete: 'off', spellcheck: false, 'aria-label': 'Their name, @handle or link' });
    const err = element('div', { class: 'lc-err', hidden: true });
    const go = element('button', { type: 'button', class: 'btn', dataset: { cmd: 'link.add' } }, 'Link');
    const submit = async () => {
      const r = parseInput(inp.value, curPlat), ch = r && r.channel;
      if (!ch){ err.textContent = 'Couldn’t read that link or name'; err.hidden = false; return; }
      if (/^yt:v:/.test(ch)){ err.textContent = 'A video isn’t a channel: paste their channel’s link or @handle'; err.hidden = false; return; }
      if (chs.some(c => platOf(c) === platOf(ch))){ err.textContent = `They already have a ${PLAT_NAME[platOf(ch)]} account here`; err.hidden = false; return; }
      if (window.kmv && window.kmv.channelExists){
        go.classList.add('busy');
        const ok = await window.kmv.channelExists(ch).catch(() => 'unknown');
        go.classList.remove('busy');
        if (ok === 'missing'){ err.textContent = `There's no ${PLAT_NAME[platOf(ch)]} channel called “${chLabel(ch)}”.`; err.hidden = false; return; }
      }
      addAccount(ch, chs[0]);
    };
    go.onclick = submit;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); submit(); } });
    inp.addEventListener('input', () => { err.hidden = true; const r = parseInput(inp.value, curPlat); if (r && r.channel && /[/.:]/.test(inp.value) && free.includes(platOf(r.channel))){ curPlat = platOf(r.channel); segs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === curPlat)); } });
    const segs = element('div', { class: 'seg lc-plat', role: 'radiogroup', 'aria-label': 'Site' }, ...free.map(p => element('button', { type: 'button', class: p === curPlat ? 'on' : '', role: 'radio', 'aria-checked': String(p === curPlat), title: PLAT_NAME[p], dataset: { p },
      onclick: () => { curPlat = p; segs.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.p === p); b.setAttribute('aria-checked', String(b.dataset.p === p)); }); inp.focus(); } }, element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]))));
    parts.push(element('div', 'lc-sec', chs.length ? 'Add an account' : 'Their first channel'), element('div', 'lc-add', segs, inp, go), err);
    if (addFocus) setTimeout(() => inp.focus(), 0);
  }
  // this streamer's own choices
  if (s){
    const sel = (label, sub, opts, val, onchange, cmd) => {
      const se = element('select', { class: 'st-sel', 'aria-label': label, dataset: { cmd } }, ...opts.map(([v, t]) => element('option', { value: v, selected: v === val }, t)));
      se.addEventListener('change', () => onchange(se.value));
      return element('label', 'lc-opt', element('span', 'st-t', label, element('small', null, sub)), se);
    };
    const ao = s.accounts.some(c => autoOpen.includes(c));
    parts.push(element('div', 'lc-sec', 'This streamer'),
      sel('Their streams', 'Settings › Linked accounts says: ' + ({ tabs: 'tabs in one window', separate: 'separate windows' })[linkOpt('streams')],
        [['', 'As in Settings'], ['tabs', 'Tabs in one window'], ['separate', 'Separate windows']], s.streams || '', v => setStreamerOpt(s.id, 'streams', v), 'link.streams'),
      sel('Opens by itself when live ⚡', 'Any of their accounts going live opens them', [['off', 'No'], ['together', 'Together, as tabs'], ['separate', 'Separate windows']],
        ao ? s.autoOpen || 'together' : 'off', v => setAutoOpenFor(s, v), 'link.autoOpen'),
      sel('Name shown', 'In the Channels list, title bars and the bell', [...new Set(s.accounts.map(chLabel))].map(n => [n, n]), streamerName(s), v => setStreamerOpt(s.id, 'name', v === chLabel(s.main) ? '' : v), 'link.name'));
  }
  parts.push(element('div', 'lc-foot',
    s && element('button', { type: 'button', class: 'linkish lc-unlink', dataset: { cmd: 'link.unlinkAll' }, onclick: () => unlinkEvery(s) }, 'Unlink all'),
    element('span', 'lc-gap'),
    element('button', { type: 'button', class: 'btn primary', dataset: { cmd: 'link.done' }, onclick: closeLinkCard }, 'Done')));
  card.replaceChildren(...parts.filter(Boolean));
  addFocus = false;
}
// Add an account to the streamer (or link the first two). The new one is saved too, so its live status is watched.
function addAccount(ch, to){
  if (!to){ cur = [ch]; renderCard(); return; }
  if (!canLink(to, ch)){ flash(`${chLabel(ch)} can't join: one account per site, and a channel belongs to one streamer`); return; }
  const s = link(to, ch); if (!s) return;
  if (s.accounts.some(c => saved.includes(c))){ channelVars.saved = [...new Set([...saved, ...s.accounts])]; persistSaved(); }
  cur = s.accounts; renderCard();
  flash(`Linked ${chLabel(ch)} on ${PLAT_NAME[platOf(ch)]} to ${nameOf(to)}`);
}
function setAutoOpenFor(s, v){
  const on = s.accounts.filter(c => autoOpen.includes(c));
  if (v === 'off') on.forEach(c => toggleAutoOpen(c));
  else { if (!on.length) toggleAutoOpen(s.main); setStreamerOpt(s.id, 'autoOpen', v); }
  renderCard();
}
async function unlinkOne(ch){
  if (!await ask(`Unlink ${chLabel(ch)} on ${PLAT_NAME[platOf(ch)]}?`, 'It becomes its own channel again. Its windows move out of the streamer\'s window.', { ok: 'Unlink' })) return;
  unlink(ch); renderCard();
}
async function unlinkEvery(s){
  if (!await ask(`Unlink ${streamerName(s)}?`, `Back to ${s.accounts.length} separate channels. Notes and tags stay with each account.`, { ok: 'Unlink all', danger: true })) return;
  unlinkAll(s.id); closeLinkCard();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  dlg = $('#linkDlg'); if (!dlg) return;
  card = dlg.querySelector('.link-card');
  dlg.addEventListener('pointerdown', e => { if (e.target === dlg) closeLinkCard(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden){ e.stopPropagation(); closeLinkCard(); } }, true);
  store.watch(['streamers', 'live', 'names', 'saved', 'autoOpen'], () => renderCard());
  window.openLinkCard = openLinkCard;   // for the tests
}

export { init, openLinkCard };
