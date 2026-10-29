import { setSoloAll } from '../../chat/all-chat.js';
import { $ } from '../../core.js';
import { autoOpen, channelVars, infoFor, persistSaved, saved, svHue, svInitials, svProf, toggleAutoOpen } from '../channels/channels.js';
import { openSettings } from '../settings/settings.js';
import { accountsOf, botsOf, canLink, chanOpt, link, linkOpt, linkedOn, nameOf, notSame, ordered, setChanOpt,
  setMain, setOn, setStreamerOpt, streamerBots, streamerName, streamerOf, suggestions, unlink, unlinkAll } from '../../platforms/linked.js';
import { PLATFORMS, PLAT_NAME, chLabel, parseInput, platOf } from '../../platforms/platforms.js';
import { ask } from '../../shared/ask.js';
import { element } from '../../shared/element.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { store } from '../../shared/store.js';

/* ---- Channel settings: a channel's or a linked streamer's card. Its accounts (live or not), the main one, suggestions,
   adding an account by site and name, @handle or link (linking), their own chat bots and their own choices. A channel on
   its own has its bots, Opens by itself and its ALL tab; what only a linked streamer has is greyed, with how to get it.
   Opened from Channels (▾ › Channel settings…), a window's ⋯, a profile, Settings › Linked channels and the search box. ---- */
let dlg, card, cur = [], curPlat = 'kick', botPlat = 'kick', addFocus = false;
function openLinkCard(ch, { add } = {}){
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
const lcPlat = p => element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]);
const lcSite = ch => lcPlat(platOf(ch));
function renderCard(){
  if (dlg.hidden) return;
  const { s, chs } = accounts();
  const name = s ? streamerName(s) : chs[0] ? chLabel(chs[0]) : 'Link channels';
  const prof = chs[0] && svProf[chs[0]] && svProf[chs[0]].info;
  const av = element('span', { class: 'lc-av', style: { '--c': svHue(chs[0] || 'x') } }, svInitials(name));
  if (prof && prof.avatar){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = prof.avatar; av.appendChild(im); }
  const parts = [element('div', 'lc-head', av, element('div', null, element('h3', { id: 'lcName' }, name), element('p', null, s ? 'One streamer, on several sites' : chs.length ? 'Its settings, and its other sites to link' : 'Start with one of their channels, then add their other sites')))];
  if (chs.length){
    parts.push(element('div', 'lc-sec', 'Channels'), ...chs.map(ch => element('div', 'lc-acc', lcSite(ch), element('div', 'lc-acc-t', element('b', null, chLabel(ch)), liveText(ch)),
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
    const inp = element('input', { class: 'st-in lc-in', id: 'lcIn', dataset: { cmd: 'link.card' }, placeholder: 'Name, @handle or link', autocomplete: 'off', spellcheck: false, 'aria-label': 'Their name, @handle or link' });
    const err = element('div', { class: 'lc-err', hidden: true });
    const go = element('button', { type: 'button', class: 'btn', dataset: { cmd: 'link.add' } }, 'Link');
    const submit = async () => {
      const r = parseInput(inp.value, curPlat), ch = r && r.channel;
      if (!ch){ err.textContent = 'Couldn’t read that link or name'; err.hidden = false; return; }
      if (/^yt:v:/.test(ch)){ err.textContent = 'A video isn’t a channel: paste their channel’s link or @handle'; err.hidden = false; return; }
      if (chs.some(c => platOf(c) === platOf(ch))){ err.textContent = `They already have a ${PLAT_NAME[platOf(ch)]} channel here`; err.hidden = false; return; }
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
    parts.push(element('div', 'lc-sec', chs.length ? 'Add a channel' : 'Their first channel'), element('div', 'lc-add', segs, inp, go), err);
    if (addFocus) setTimeout(() => inp.focus(), 0);
  }
  if (chs.length) parts.push(...botsPart(s, chs));
  // their own choices: a streamer's, or a channel's on its own (what only a streamer has: greyed, with how to get it)
  if (chs.length){
    const one = !s, ch = chs[0], LINK = 'Link another channel to use this';
    const sel = (label, sub, opts, val, onchange, cmd, off) => {
      const se = element('select', { class: 'st-sel', 'aria-label': label, disabled: !!off, dataset: { cmd } }, ...opts.map(([v, t]) => element('option', { value: v, selected: v === val }, t)));
      se.addEventListener('change', () => onchange(se.value));
      return element('label', 'lc-opt' + (off ? ' lc-off' : ''), element('span', 'st-t', label, element('small', null, off ? LINK : sub)), se);
    };
    const ao = one ? autoOpen.includes(ch) : s.accounts.some(c => autoOpen.includes(c));
    parts.push(element('div', 'lc-sec', one ? 'This channel' : 'This streamer'),
      sel('Their streams', 'Settings › Linked channels says: ' + ({ tabs: 'tabs in one window', separate: 'separate windows' })[linkOpt('streams')],
        [['', 'As in Settings'], ['tabs', 'Tabs in one window'], ['separate', 'Separate windows']], one ? '' : s.streams || '', v => setStreamerOpt(s.id, 'streams', v), 'link.streams', one),
      one ? sel('Opens by itself when live ⚡', 'Going live opens it', [['off', 'No'], ['on', 'Yes']], ao ? 'on' : 'off', v => { if ((v === 'on') !== ao) toggleAutoOpen(ch); renderCard(); }, 'link.autoOpen')
        : sel('Opens by itself when live ⚡', 'Any of their channels going live opens them', [['off', 'No'], ['together', 'Together, as tabs'], ['separate', 'Separate windows']],
          ao ? s.autoOpen || 'together' : 'off', v => setAutoOpenFor(s, v), 'link.autoOpen'),
      one ? sel('ALL tab', 'Its chat in ALL\'s list, with its badges, emotes and filters', [['off', 'Off'], ['on', 'On']], chanOpt(ch, 'allTab') === true ? 'on' : 'off', v => setSoloAll(ch, v === 'on'), 'link.allTab')
        : sel('ALL tab', 'Their chats as one list. Settings › Linked channels says: ' + (linkOpt('allTab') !== false ? 'on' : 'off'),
          [['', 'As in Settings'], ['on', 'On'], ['off', 'Off']], s.allTab === true ? 'on' : s.allTab === false ? 'off' : '', v => setStreamerOpt(s.id, 'allTab', v === 'on' ? true : v === 'off' ? false : null), 'link.allTab'),
      sel('Name shown', 'In the Channels list, title bars and the bell', (one ? [ch] : [...new Set(s.accounts.map(chLabel))]).map(n => [one ? chLabel(n) : n, one ? chLabel(n) : n]),
        one ? chLabel(ch) : streamerName(s), v => setStreamerOpt(s.id, 'name', v === chLabel(s.main) ? '' : v), 'link.name', one));
  }
  parts.push(element('div', 'lc-foot',
    chs.length && element('button', { type: 'button', class: 'linkish lc-unlink', disabled: !s, title: s ? '' : 'Link another channel to use this', dataset: { cmd: 'link.unlinkAll' }, onclick: () => s && unlinkEvery(s) }, 'Unlink all'),
    element('span', 'lc-gap'),
    element('button', { type: 'button', class: 'btn primary', dataset: { cmd: 'link.done' }, onclick: closeLinkCard }, 'Done')));
  card.replaceChildren(...parts.filter(Boolean));
  addFocus = false;
}
// Their own chat bots: a name on one of their sites, never a mention or spam in their chats there, on top of the app's
// list (Chat › Chat bots). Many streamers run a bot as their own account: then their own messages there count as the bot's.
// A channel on its own: the same, on its site, kept with the channel (they go to the streamer if it's linked).
function botsPart(s, chs){
  const accs = s ? s.accounts : chs, ch = chs[0];
  const bots = s ? botsOf(s) : streamerBots(ch).map(name => ({ p: platOf(ch), name })), sites = [...new Set((s ? ordered(s) : chs).map(platOf))];
  if (!sites.includes(botPlat)) botPlat = sites[0];
  const own = b => accs.some(c => platOf(c) === b.p && chLabel(c).replace(/^@/, '').toLowerCase() === b.name.toLowerCase());
  const save = list => { if (s) setStreamerOpt(s.id, 'bots', list.length ? list : null); else setChanOpt(ch, 'bots', list.map(b => b.name)); renderCard(); };
  const who = s ? streamerName(s) : chLabel(ch);
  const inp = element('input', { class: 'st-in lc-in', id: 'lcBotIn', dataset: { cmd: 'link.botName' }, placeholder: `Bot's name on ${PLAT_NAME[botPlat]}`, maxlength: 40, autocomplete: 'off', spellcheck: false, 'aria-label': 'Their chat bot\'s name' });
  const add = () => {
    const name = inp.value.trim().replace(/^@/, '');
    if (!/[a-z0-9]/i.test(name)){ inp.focus(); flash("Type a chat bot's name"); return; }
    if (bots.some(b => b.p === botPlat && b.name.toLowerCase() === name.toLowerCase())){ inp.value = ''; return; }
    save([...bots, { p: botPlat, name }]);
    setTimeout(() => card.querySelector('#lcBotIn')?.focus(), 0);
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } });
  const segs = element('div', { class: 'seg lc-plat lc-botplat', role: 'radiogroup', 'aria-label': 'Their bot\'s site' }, ...sites.map(p => element('button', { type: 'button', class: p === botPlat ? 'on' : '', role: 'radio', 'aria-checked': String(p === botPlat), title: PLAT_NAME[p], dataset: { bp: p, cmd: 'link.botSite' },
    onclick: () => { botPlat = p; segs.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.bp === p); b.setAttribute('aria-checked', String(b.dataset.bp === p)); }); inp.placeholder = `Bot's name on ${PLAT_NAME[p]}`; inp.focus(); } }, lcPlat(p))));
  const mine = bots.filter(own);
  return [
    element('div', 'lc-sec', 'Their chat bots'),
    element('p', 'lc-desc', `Never a mention or spam in ${who}'s chat${s ? 's on that site' : ''}. Bots for every chat go in `,
      element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'link.botsApp' }, onclick: () => { closeLinkCard(); openSettings('chat', { sub: 'bots' }); } }, 'Chat › Chat bots'), '.'),
    bots.length && element('div', 'st-chips lc-bots', ...bots.map(b => element('span', { class: 'st-chip lc-bot' + (own(b) ? ' lc-own' : '') }, lcPlat(b.p), element('span', null, b.name),
      element('button', { type: 'button', title: `Remove ${b.name}`, 'aria-label': `Remove ${b.name}`, html: icon.close, dataset: { cmd: 'link.botRemove' }, onclick: () => save(bots.filter(x => x !== b)) })))),
    element('div', 'lc-add', segs, inp, element('button', { type: 'button', class: 'btn', dataset: { cmd: 'link.botAdd' }, onclick: add }, 'Add')),
    mine.length && element('div', 'lc-warn', element('span', { class: 'lc-warn-i', 'aria-hidden': 'true' }, '!'),
      element('span', null, ...mine.flatMap((b, i) => [i ? ' ' : '', element('b', null, b.name), ` is their own name on ${PLAT_NAME[b.p]}: everything they type in ${PLAT_NAME[b.p]} chat counts as the bot's.`]),
        ` Their messages on other sites aren't affected.`))
  ].filter(Boolean);
}
// Add a channel to the streamer (or link the first two). The new one is saved too, so its live status is watched.
function addAccount(ch, to){
  if (!to){ cur = [ch]; renderCard(); return; }
  if (!linkedOn()){ setOn(true); flash('Linked channels turned on (Settings › Linked channels)'); }
  if (!canLink(to, ch)){ flash(`${chLabel(ch)} can't join: one channel per site, and a channel belongs to one streamer`); return; }
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
  if (!await ask(`Unlink ${streamerName(s)}?`, `Back to ${s.accounts.length} separate channels. Notes and tags stay with each channel.`, { ok: 'Unlink all', danger: true })) return;
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
