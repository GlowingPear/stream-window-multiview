import './follow-suggestions.js';   // runs after it (see app.js)
import { $, input } from '../../core.js';
import { PLAT_NAME, chLabel, parseInput, platOf } from '../../platforms/platforms.js';
import { loadSavedProfiles, persistSaved, renderSaved, saved, tabPlat } from './channels.js';
import { addParsed } from '../../layout/placement.js';
import { flash } from '../../shared/flash.js';

/* Opening a channel from the Channels box. The same box searches your saved channels; for a name or link it
   also offers "Add <name> from Kick / Twitch / YouTube" with Open (Enter) and Open & save. A bare name goes to
   the site picked there (the tab's site at first, Kick on All); a link or @handle picks its own. Before opening,
   the site is asked whether the channel exists: only a definite "no" stops it (a site that can't be reached
   doesn't block anything), and then that site is outlined in red. */
let addPlat = null;      // the site picked for a bare name (null: the tab's)
// Other files change these through openBoxVars: a variable imported from another file can't be assigned to.
const openBoxVars = {
  get addPlat(){ return addPlat; }, set addPlat(v){ addPlat = v; },
};
function addTarget(){
  const raw = input.value.trim(); if (!raw) return null;
  const bare = /^[A-Za-z0-9_-]+$/.test(raw);
  const p = parseInput(raw, addPlat || tabPlat());
  if (!p) return null;
  return { raw, p, bare, plat: p.channel ? platOf(p.channel) : '', name: p.channel ? chLabel(p.channel) : (p.url || raw).replace(/^https?:\/\//, '') };
}
function renderAddRow(){
  const t = addTarget(), row = $('#spAddRow');
  $('#spErr').hidden = true;
  row.hidden = !t;
  if (!t) return;
  $('#spAddName').textContent = t.name;
  $('#spFrom').hidden = $('#spPlat').hidden = !t.plat;
  $('#spPlat').querySelectorAll('button').forEach(b => {
    const on = b.dataset.p === t.plat;
    b.classList.toggle('on', on); b.classList.remove('bad');
    b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1;
    b.disabled = !t.bare && !on;       // a link or @handle is on its own site
  });
  const os = $('#spOpenSave'), isSaved = !!t.p.channel && saved.includes(t.p.channel);
  os.hidden = !t.p.channel || isSaved;
}
let addBusy = false;
async function openFromBox(saveToo){
  if (addBusy) return;
  const t = addTarget();
  if (!t){ if (input.value.trim()) flash('Couldn’t read that link or channel name'); return; }
  const ch = t.p.channel;
  if (ch && window.kmv && window.kmv.channelExists && !/^yt:v:/.test(ch)){
    const btn = saveToo ? $('#spOpenSave') : $('#spOpen');
    addBusy = true; btn.classList.add('busy');
    const r = await window.kmv.channelExists(ch).catch(() => 'unknown');
    addBusy = false; btn.classList.remove('busy');
    if (input.value.trim() !== t.raw) return;          // typed something else meanwhile
    if (r === 'missing'){
      const pb = $(`#spPlat [data-p=${t.plat}]`); if (pb) pb.classList.add('bad');
      const e = $('#spErr');
      e.textContent = `There's no ${PLAT_NAME[t.plat]} channel called “${t.name}”.` + (t.bare ? ' Check the spelling, or pick another site.' : '');
      e.hidden = false;
      return;
    }
  }
  if (saveToo && ch && !saved.includes(ch)){ saved.push(ch); persistSaved(); loadSavedProfiles(); }
  input.value = ''; addPlat = null;
  renderAddRow(); renderSaved();
  addParsed(t.p);
}

export { addPlat, openBoxVars, openFromBox, renderAddRow };
