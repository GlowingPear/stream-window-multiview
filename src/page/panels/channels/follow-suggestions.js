import './channels.js';   // runs after it (see app.js)
import { $, ROLE, input } from '../../core.js';
import { PLAT_NAME } from '../../platforms/platforms.js';
import { channelRow, fmtViewers, loadSavedProfiles, persistSaved, renderSaved, saved, savedTab } from './channels.js';
import { addParsed } from '../../layout/placement.js';
import { flash } from '../../shared/flash.js';
import { panel } from '../../toolbar/toolbar.js';

/* Suggestions from the channels you follow (src/follows.js): under the saved matches while you type ("From your
   follows"), or the live ones when the box is empty ("Live now from your follows"). Only channels you haven't
   saved, at most 5, on the tab's site. The main process keeps the lists (Kick from the live checks, Twitch and
   YouTube from Import follows); a site you aren't signed in to has none. Click or Enter opens it as the Stream /
   Chat dropdown says; ☆ saves it. */
let follows = { on: false, items: [], live: {} }, fsProf = {};
const followsApi = () => ROLE === 'main' && window.kmv && window.kmv.followsGet ? window.kmv : null;
function loadFollows(){
  const k = followsApi(); if (!k) return;
  k.followsGet().then(f => {
    follows = { on: !!(f && f.on), items: (f && Array.isArray(f.items)) ? f.items : [], live: (f && f.live) || {} };
    const fo = $('#followsOn');
    if (fo){ fo.hidden = !k.followsSetOn; fo.setAttribute('aria-checked', follows.on); fo.innerHTML = `Suggest channels you follow<small>${follows.on ? 'On' : 'Off'}</small>`; }
    if (k.profileList && follows.items.length && !panel.hidden) k.profileList(follows.items.slice(0, 2000).map(x => x.ch)).then(l => { fsProf = l || {}; if (!panel.hidden) renderSaved(); }).catch(() => {});
    if (!panel.hidden) renderSaved();
  }).catch(() => {});
}
function followSugs(q){
  if (!follows.on || !follows.items.length || !window.SmvFollows) return [];
  const items = savedTab === 'all' ? follows.items : follows.items.filter(f => f.site === savedTab);
  return SmvFollows.suggest({ follows: items, saved, live: follows.live, q, max: 5 });
}
function appendFollowSugs(list, q){
  if (!q && input.value.trim()) return;                  // a link in the box: nothing to suggest
  const rows = followSugs(q); if (!rows.length) return;
  const h = document.createElement('div'); h.className = 'sv-sec fs-sec' + (q ? '' : ' live');
  h.textContent = q ? 'From your follows' : 'Live now from your follows';
  list.appendChild(h);
  rows.forEach(f => {
    const info = follows.live[f.ch] || {}, live = f.live, prof = (fsProf[f.ch] && fsProf[f.ch].info) || {};
    const { row, meta, acts } = channelRow({ ch: f.ch, name: f.name, site: f.site, live, photo: prof.avatar, cls: 'fsug ',
      sub: live ? [...new Set([info.category, info.title].filter(Boolean))].join(' · ') : '', subTitle: info.title || '',
      title: `Open it (as set in the Stream / Chat dropdown). You follow ${f.name} on ${PLAT_NAME[f.site]}` });
    row.dataset.ch = f.ch; row.tabIndex = 0; row.setAttribute('role', 'button');
    if (live && info.viewers != null) meta.insertAdjacentHTML('beforeend', `<span class="sv-view" title="Watching now">${fmtViewers(info.viewers)}</span>`);
    const st = document.createElement('button'); st.className = 'fsave'; st.textContent = '☆'; st.title = 'Save it to your channels';
    st.onclick = e => { e.stopPropagation(); if (!saved.includes(f.ch)){ saved.push(f.ch); persistSaved(); loadSavedProfiles(); flash(`Saved ${f.name}`); } };
    acts.appendChild(st);
    const open = () => addParsed({ channel: f.ch, only: null });
    row.onclick = open;
    row.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === row){ e.preventDefault(); e.stopPropagation(); open(); } });
    list.appendChild(row);
  });
}

export { appendFollowSugs, follows, followsApi, loadFollows };
