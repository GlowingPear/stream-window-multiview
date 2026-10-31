import { SHOUT_MAX, SHOUT_TPL, fillShout, loginOfCh, shoutLink, siteOfCh } from '../../chat/shoutout-text.js';
import { bellVars, myName } from '../bell/bell.js';
import { svHue } from '../channels/channels.js';
import { listStreamers, streamerName, streamerOf } from '../../platforms/linked.js';
import { PLAT_NAME, parseInput } from '../../platforms/platforms.js';
import { element } from '../../shared/element.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { closeOnOutside } from '../../shared/popover.js';
import { settings } from '../../shared/settings.js';

/* ---- A channel's shoutout card (#309): the same editor in Settings › Shoutouts › Channels and in Channel settings ›
   Shoutout. A card is a real channel (chat/shoutout-text.js has its shape): its picture and sites, its message (one, or
   one per site for a linked streamer), a preview for each site it covers, and the chatters whose shoutout is this
   channel's (their other accounts). Closed, it's one line: the message, or "Your general message · also for …". ---- */
const SO_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const SO_CHEV = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
const SO_SAMPLE_GAME = 'Tidepool';   // (the preview's last game: made up)

const soSiteName = site => PLAT_NAME[site] || site;
const soInitials = name => String(name || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';
// The channels a card covers: a linked streamer's Kick and Twitch accounts, else its own
function soCardChs(card){
  const s = card.streamer && listStreamers().find(x => x.id === card.streamer);
  return (s ? s.accounts : [card.ch]).filter(ch => ['kick', 'twitch'].includes(siteOfCh(ch)));
}
// Its picture: theirs (when the site gave one), else their initials on their colour; a channel on one site wears its badge
function soAvatar(card, small){
  const chs = soCardChs(card);
  const av = element('span', { class: 'sc-av' + (small ? ' sm' : ''), style: { background: svHue(card.ch) } }, soInitials(card.name || loginOfCh(card.ch)));
  if (card.avatar && /^https:\/\//.test(card.avatar)){ const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = () => im.remove(); im.src = card.avatar; av.appendChild(im); }
  if (chs.length === 1) av.appendChild(element('i', { class: 'pi pi-' + siteOfCh(chs[0]) }, soSiteName(siteOfCh(chs[0]))[0]));
  return av;
}
// A textarea that grows to show all of its text
function soGrow(t){ const fit = () => { t.style.height = 'auto'; t.style.height = Math.max(44, t.scrollHeight + 2) + 'px'; }; t.addEventListener('input', fit); requestAnimationFrame(fit); return t; }
// The preview of a message in a site's chat, as it would be sent (made-up game; their real link)
function soPreview(card, site, text){
  const ch = soCardChs(card).find(c => siteOfCh(c) === site) || card.ch, login = loginOfCh(ch);
  const msg = fillShout(text || settings.text('shoutText') || SHOUT_TPL, { name: card.name || login, link: shoutLink(site, login), links: soCardChs(card).map(c => shoutLink(siteOfCh(c), loginOfCh(c))).join(' '), game: SO_SAMPLE_GAME });
  const me = (site === 'kick' ? myName : bellVars.myTwitch) || 'you';
  return element('div', 'sc-pv', element('i', { class: 'pi pi-' + site }, soSiteName(site)[0]), element('b', null, me), ': ',
    ...msg.split(/(https:\/\/\S+)/).map((t, i) => (i % 2 ? element('span', 'lnk', t) : t)));
}

/* A card's element. save(card): it changed (the caller saves it); remove(): the card's Remove (none: no Remove).
   open: shown open. bare: only its editor, always open (Channel settings › Shoutout, under the channel's own name). -> the element */
function shoutCardEl(card, { save, remove, open = false, bare = false } = {}){
  if (bare) open = true;
  const chs = soCardChs(card), linked = chs.length > 1;
  const el = element('div', { class: 'sc-card' + (open ? ' open' : '') + (card.lost ? ' lost' : ''), dataset: { ch: card.ch } });
  const sum = () => {
    const also = (card.also || []).map(a => a.name || a.login), msg = card.perSite ? Object.values(card.sites || {}).find(Boolean) : card.msg;
    if (card.lost) return element('span', 'sc-sum sc-lost', `Couldn't find this channel on Kick or Twitch: it's shouted out by its name`);
    return element('span', 'sc-sum' + (msg ? '' : ' gen'), msg || 'Your general message',
      ...(also.length ? [' · also for ', ...also.flatMap((n, i) => [i ? (i === also.length - 1 ? ' and ' : ', ') : '', element('b', null, n)])] : []));
  };
  const toggle = element('button', { type: 'button', class: 'ib sc-tog', 'aria-expanded': String(open), title: open ? 'Close' : 'Edit', 'aria-label': `${open ? 'Close' : 'Edit'} ${card.name}'s shoutout`, html: SO_CHEV, dataset: { cmd: 'settings.shoutCardToggle' },
    onclick: () => { const n = shoutCardEl(card, { save, remove, open: !open }); el.replaceWith(n); if (!open) n.querySelector('textarea')?.focus(); } });
  const head = element('div', { class: 'sc-hd', onclick: e => { if (!e.target.closest('button, input, textarea')) toggle.click(); } }, soAvatar(card),
    element('span', 'tx', element('span', 'nm', card.name || loginOfCh(card.ch), linked && element('span', 'sc-pill', 'Linked')),
      open || linked ? element('span', 'sites', ...chs.map(ch => element('span', 'sc-site', element('i', { class: 'pi pi-' + siteOfCh(ch) }, soSiteName(siteOfCh(ch))[0]), loginOfCh(ch)))) : sum(),
      linked && !open ? sum() : null),
    toggle);
  if (bare) el.classList.add('sc-bare'); else el.appendChild(head);
  if (!open) return el;
  const body = element('div', 'sc-body');
  // their message: one, or (a linked streamer) one for each site
  const sites = chs.map(siteOfCh);
  const field = (site, value, onInput) => {
    const t = soGrow(element('textarea', { class: 'st-in', rows: 2, maxlength: SHOUT_MAX, spellcheck: false, placeholder: 'Your general message (Settings › Shoutouts › Message)', 'aria-label': site ? `Their message on ${soSiteName(site)}` : 'Their message', dataset: { cmd: 'settings.shoutCardMsg' } }));
    t.value = value || '';
    const pvs = element('div', 'sc-pvs', ...(site ? [site] : sites).map(x => soPreview(card, x, t.value)));
    t.addEventListener('input', () => { onInput(t.value); pvs.replaceChildren(...(site ? [site] : sites).map(x => soPreview(card, x, t.value))); });
    return element('div', 'sc-msg', site && element('span', 'mh', element('i', { class: 'pi pi-' + site }, soSiteName(site)[0]), `On ${soSiteName(site)}`), t, pvs);
  };
  const msgs = element('div', 'sc-msgs');
  const drawMsgs = () => msgs.replaceChildren(...(card.perSite ? sites.map(x => field(x, (card.sites || {})[x], v => { card.sites = { ...(card.sites || {}), [x]: v }; save(card); }))
    : [field('', card.msg, v => { card.msg = v; save(card); })]));
  const seg = linked && element('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Their message' }, ...[[false, sites.length === 2 ? 'Same on both' : 'Same on all sites'], [true, 'Per site']].map(([per, t]) =>
    element('button', { type: 'button', role: 'radio', class: !!card.perSite === per ? 'on' : '', 'aria-checked': String(!!card.perSite === per), dataset: { cmd: per ? 'settings.shoutCardPerSite' : 'settings.shoutCardSame' },
      onclick: () => {
        if (!!card.perSite === per) return;
        // (to per site: each site starts with the one message; back to one: the first site's)
        if (per){ card.sites = Object.fromEntries(sites.map(x => [x, (card.sites || {})[x] || card.msg || ''])); card.perSite = true; }
        else { card.msg = card.msg || Object.values(card.sites || {}).find(Boolean) || ''; card.perSite = false; }
        save(card); seg.querySelectorAll('button').forEach(b => { const on = (b.dataset.cmd === 'settings.shoutCardPerSite') === per; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); drawMsgs();
      } }, t)));
  drawMsgs();
  body.append(element('div', 'sc-row', element('span', 'lbl', 'Their message'), seg), msgs);
  // the chatters whose shoutout is this channel's (their other accounts)
  const chips = element('div', 'sc-chips');
  const drawChips = () => chips.replaceChildren(...(card.also || []).map(a => element('span', 'sc-chip', a.site ? element('i', { class: 'pi pi-' + a.site }, soSiteName(a.site)[0]) : element('i', { class: 'pi sc-any', title: 'Any site' }, '∗'), a.name || a.login,
    element('button', { type: 'button', class: 'x', title: `Remove ${a.name || a.login}`, 'aria-label': `Remove ${a.name || a.login}`, html: SO_X, dataset: { cmd: 'settings.shoutChatterRemove' },
      onclick: () => { card.also = card.also.filter(x => x !== a); save(card); drawChips(); } }))), adder());
  let addSite = sites[0] || 'kick';
  const adder = () => {
    const inp = element('input', { class: 'st-in sc-chip-in', placeholder: 'Their name', 'aria-label': 'A chatter whose shoutout is this channel\'s', spellcheck: false, maxlength: 40, dataset: { cmd: 'settings.shoutChatterName' } });
    const next = { kick: 'twitch', twitch: '', '': 'kick' };
    const siteB = element('button', { type: 'button', class: 'so-site so-site-' + (addSite || 'every'), title: `${addSite ? 'On ' + soSiteName(addSite) : 'On any site'} · click to change`, 'aria-label': `Their site: ${addSite ? soSiteName(addSite) : 'any'}`, dataset: { cmd: 'settings.shoutChatterSite' },
      onclick: () => { addSite = next[addSite]; drawChips(); chips.querySelector('.sc-chip-in')?.focus(); } }, addSite ? soSiteName(addSite)[0] : 'All');
    const add = () => {
      const name = inp.value.trim().replace(/^@/, ''); if (!/^[\w-]{2,40}$/.test(name)){ inp.focus(); return; }
      const login = name.toLowerCase();
      if (!(card.also || []).some(a => a.login === login && (a.site || '') === addSite)) card.also = [...(card.also || []), { site: addSite, login, name }];
      save(card); drawChips(); chips.querySelector('.sc-chip-in')?.focus();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } });
    return element('span', 'sc-chip add', siteB, inp, element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'settings.shoutChatterAdd' }, onclick: add }, 'Add'));
  };
  drawChips();
  body.append(element('div', 'sc-al', element('span', 'ah', 'Also for these chatters, ', element('b', null, 'their other accounts'), `: their shoutout is ${card.name || loginOfCh(card.ch)}'s`), chips));
  if (card.lost) body.appendChild(element('div', 'sc-warn', `Couldn't find ${card.name || loginOfCh(card.ch)} on Kick or Twitch. It's shouted out by its name until you remove it and add the right channel.`));
  if (remove) body.appendChild(element('div', 'sc-foot', element('button', { type: 'button', class: 'linkish rm', dataset: { cmd: 'settings.shoutCardRemove' }, onclick: remove }, 'Remove')));
  el.appendChild(body);
  return el;
}

/* Adding a channel: a name or link, looked up on Kick and Twitch (and a Kick name with _ as - too), shown with its
   picture to pick; a linked streamer's channel adds the streamer. Without lookups (a browser), the name as typed.
   added(card): a card was picked. -> the element */
function shoutAddEl(added, { taken = () => false } = {}){
  const inp = element('input', { class: 'st-in', placeholder: 'Add a channel: name or link', 'aria-label': 'Add a channel: name or link', spellcheck: false, autocomplete: 'off', dataset: { cmd: 'settings.shoutAddName' } });
  const res = element('div', { class: 'sc-res', hidden: true, role: 'listbox', 'aria-label': 'Channels found' });
  const go = element('button', { type: 'button', class: 'btn', dataset: { cmd: 'settings.shoutAddFind' } }, 'Find');
  closeOnOutside(res, { button: go });
  let picks = [], at = 0;
  const pick = x => { res.hidden = true; inp.value = ''; added(x); };
  // (the one picked: marked, never drawn again under the pointer, so a click lands on it)
  const mark = () => res.querySelectorAll('.sc-ri').forEach((r, i) => { r.classList.toggle('on', i === at); r.setAttribute('aria-selected', String(i === at)); const g = r.querySelector('.go'); if (!picks[i].taken) g.textContent = i === at ? 'Add ↵' : 'Add'; });
  const draw = () => { res.replaceChildren(element('div', 'rh', picks.length ? 'Found' : 'Nothing found'), ...picks.map((x, i) => element('div', { class: 'sc-ri' + (x.taken ? ' taken' : ''), role: 'option', dataset: { cmd: 'settings.shoutAddPick' }, onclick: () => !x.taken && pick(x.card), onpointerenter: () => { at = i; mark(); } },
    soAvatar(x.card, true), element('span', 'tx', element('b', null, x.card.name), element('small', null, x.sub)), element('span', 'go', x.taken ? 'Added' : 'Add')))); mark(); };
  const find = async () => {
    const q = inp.value.trim(); if (!q) return inp.focus();
    const parsed = parseInput(q, 'kick'), ch = parsed && parsed.channel;
    const name = /[/.:]/.test(q) && ch ? loginOfCh(ch) : q.replace(/^@/, '').toLowerCase();
    if (!/^[\w.-]{2,40}$/.test(name)) return flash('Couldn’t read that name or link');
    go.classList.add('busy');
    let found = [];
    if (window.kmv && window.kmv.profileLookup){
      found = await window.kmv.profileLookup(name).catch(() => []) || [];
      if (name.includes('_') && !found.some(f => siteOfCh(f.ch) === 'kick')) found.push(...(await window.kmv.profileLookup(name.replace(/_/g, '-')).catch(() => []) || []).filter(f => siteOfCh(f.ch) === 'kick'));
    } else if (/[/.:]/.test(q) && ch && ['kick', 'twitch'].includes(siteOfCh(ch))) found = [{ ch, name: loginOfCh(ch) }];   // (no lookups here: a link, as it is; a name, on each site)
    else found = [{ ch: name, name }, { ch: 'tw:' + name, name }];
    go.classList.remove('busy');
    const seen = new Set();
    picks = [];
    for (const f of found.filter(f => f && ['kick', 'twitch'].includes(siteOfCh(f.ch)))){
      const s = streamerOf(f.ch);
      const card = s ? { ch: s.main, streamer: s.id, name: streamerName(s), avatar: f.avatar || '', msg: '', perSite: false, sites: {}, also: [] }
        : { ch: f.ch, streamer: '', name: f.name || loginOfCh(f.ch), avatar: f.avatar || '', msg: '', perSite: false, sites: {}, also: [] };
      const key = card.streamer || card.ch; if (seen.has(key)) continue; seen.add(key);
      picks.push({ card, taken: taken(card), sub: s ? `Linked streamer · ${soCardChs(card).map(c => soSiteName(siteOfCh(c))).join(' and ')}` : [soSiteName(siteOfCh(f.ch)), f.live ? 'live now' : '', f.followersText ? f.followersText + ' followers' : ''].filter(Boolean).join(' · ') });
    }
    at = Math.max(0, picks.findIndex(x => !x.taken));
    res.hidden = false; draw();
  };
  go.onclick = find;
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); if (!res.hidden && picks[at] && !picks[at].taken) pick(picks[at].card); else find(); }
    else if (!res.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){ e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : -1) + picks.length) % Math.max(1, picks.length); mark(); }
  });
  inp.addEventListener('input', () => { res.hidden = true; });
  const box = element('div', 'sc-add', element('span', { class: 'sc-mag', html: icon.search }), inp, go, res);
  // Esc anywhere in it (Find has the focus after a press): the list closes, not the window it's in
  box.addEventListener('keydown', e => { if (e.key === 'Escape' && !res.hidden){ e.preventDefault(); e.stopPropagation(); res.hidden = true; inp.focus(); } });
  return box;
}

export { shoutAddEl, shoutCardEl };
