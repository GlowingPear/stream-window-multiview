import { $, wins } from '../../core.js';
import { autoOpen, linkPair, svHue, svInitials, svProf } from '../channels/channels.js';
import { openLinkCard } from './link-card.js';
import { dismissed, forgetNot, linkOpt, linkedOn, listStreamers, notSame, setOn, setOpt, streamerName, suggestions } from '../../platforms/linked.js';
import { PLAT_NAME, chLabel, platOf } from '../../platforms/platforms.js';
import { element } from '../../shared/element.js';
import { store } from '../../shared/store.js';
import { wireTabs } from '../../toolbar/toolbar.js';

/* ---- Settings › Linked channels: the switch (off by default), then five tabs so nothing scrolls: Tabs, Playing,
   Live & raids, Suggestions (with how many wait) and Linked streamers. Off, the page only says what turning it on
   does. Each option is a .st-row, so the search box finds it with no code of its own. ---- */
let pane;
const laPic = (ch, name) => {
  const a = element('span', { class: 'la-av', style: { '--c': svHue(ch) } }, svInitials(name));
  const p = svProf[ch] && svProf[ch].info; if (p && p.avatar){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = p.avatar; a.appendChild(im); }
  return a;
};
const laSite = (ch, dim) => element('i', { class: 'pi pi-' + platOf(ch) + (dim ? ' dim' : ''), title: PLAT_NAME[platOf(ch)] }, PLAT_NAME[platOf(ch)][0]);
const laAgo = t => { const d = Math.floor((Date.now() - t) / 864e5); return !t ? '' : d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
function renderLinkedPane(){
  if (!pane) return;
  const on = linkedOn();
  $('#linkedOnSet').checked = on;
  $('#laOnSub').textContent = on ? 'Turning it off keeps your linked streamers, and splits their windows back into one per site.'
    : 'Off: every channel stands alone, as before. Turn on to link a streamer\'s Kick, Twitch and YouTube channels.';
  $('#laOff').hidden = on; $('#laRest').hidden = !on;
  pane.querySelectorAll('[data-lo]').forEach(c => { const v = linkOpt(c.dataset.lo); if (c.type === 'checkbox') c.checked = !!v; else c.value = v; });
  // what's playing now: tabs you can't see are streams too
  const hidden = wins.filter(w => w.kind === 'stream' && w.hiddenTab), frames = new Set(hidden.map(w => w.frame));
  $('#laPlaying').textContent = hidden.length ? `Now: ${frames.size} window${frames.size === 1 ? '' : 's'} with ${hidden.length} tab${hidden.length === 1 ? '' : 's'} you're not watching, playing ${linkOpt('quality') === 'low' ? 'at low quality' : 'at your quality'}.`
    : 'Lower quality saves bandwidth: a streamer live on three sites is three streams.';
  // Suggestions, and the ones answered Not the same (Undo brings one back as a suggestion)
  const sugs = on ? suggestions({ all: true }) : [], n = $('#laSugN');
  n.hidden = !sugs.length || !linkOpt('suggest'); n.textContent = sugs.length;
  const dis = dismissed();
  $('#laSugs').replaceChildren(...[   // (without dismissed ones, their heading is null: left out, not shown as text)
    element('div', 'la-sh', `Suggested · ${sugs.length}`),
    ...(sugs.length ? sugs.map(x => element('div', 'la-row', laPic(x.a, chLabel(x.a)), element('span', 'la-t', element('b', null, chLabel(x.a)), laSite(x.a), laSite(x.b), element('small', null, x.why)),
      element('button', { type: 'button', class: 'btn primary', dataset: { cmd: `link.sug:${x.a}|${x.b}` }, onclick: () => linkPair(x.a, x.b) }, 'Link'),
      element('button', { type: 'button', class: 'btn', dataset: { cmd: `link.not:${x.a}|${x.b}` }, onclick: () => notSame(x.a, x.b) }, 'Not the same')))
      : [element('div', 'la-none', linkOpt('suggest') ? 'Nothing to suggest right now. Save or follow a streamer on another site, or use Link channels… on Linked streamers.' : 'Suggestions are off.')]),
    dis.length ? element('div', 'la-sh', `Dismissed · ${dis.length}`, element('span', null, ': never suggested again, unless you undo it')) : null,
    ...dis.map(x => element('div', 'la-row dim', laPic(x.a, chLabel(x.a)), element('span', 'la-t', element('b', null, chLabel(x.a)), laSite(x.a), laSite(x.b), element('small', null, `Not the same · ${laAgo(x.at)}`)),
      element('button', { type: 'button', class: 'btn', dataset: { cmd: `link.undoNot:${x.a}|${x.b}` }, title: 'Suggest them again (doesn\'t link them)', onclick: () => forgetNot(x.a, x.b) }, 'Undo')))].filter(Boolean));
  // Linked streamers, each with its own choices
  const list = listStreamers(), n2 = list.reduce((t, s) => t + s.accounts.length, 0);
  $('#laCount').textContent = list.length ? `${list.length} streamer${list.length === 1 ? '' : 's'} · ${n2} channels` : '';
  $('#laLinked').replaceChildren(...(list.length ? list.map(s => {
    const own = [`Main: ${PLAT_NAME[platOf(s.main)]}`, (s.streams || linkOpt('streams')) === 'separate' ? 'separate windows' : 'tabs in one window'];
    if (s.streams) own[1] += ' (its own choice)';
    if (s.accounts.some(c => autoOpen.includes(c))) own.push('opens by itself, ' + ((s.autoOpen || linkOpt('autoOpen')) === 'separate' ? 'separate' : 'together'));
    return element('div', 'la-row', laPic(s.main, streamerName(s)), element('span', 'la-t', element('b', null, streamerName(s)), ...s.accounts.map(c => laSite(c)), element('small', null, own.join(' · '))),
      element('button', { type: 'button', class: 'btn', dataset: { cmd: 'link.edit:' + s.id }, onclick: () => openLinkCard(s.main) }, 'Edit'));
  }) : [element('div', 'la-none', 'No linked streamers yet. Link channels… starts with one of their channels.')]));
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  pane = $('#settingsDlg .st-pane[data-s="linked"]'); if (!pane) return;
  wireTabs($('#laTabs'), t => pane.querySelectorAll('.st-subpane').forEach(p => { p.hidden = p.dataset.t !== t; }));
  $('#linkedOnSet').addEventListener('change', e => setOn(e.target.checked));
  pane.querySelectorAll('[data-lo]').forEach(c => c.addEventListener('change', () => setOpt(c.dataset.lo, c.type === 'checkbox' ? c.checked : c.value)));
  $('#laAdd').onclick = () => openLinkCard(null);
  store.watch(['streamers', 'saved', 'names', 'live', 'autoOpen', 'tabs'], () => renderLinkedPane());
  renderLinkedPane();
}

export { init };
