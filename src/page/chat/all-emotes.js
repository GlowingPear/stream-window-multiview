import { sendSite, setLock } from './all-chat.js';
import { PLAT_NAME, platOf } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { chAvatar } from '../windows/channel-picker.js';

/* ---- Emotes in ALL's box (chat/all-chat.js): :name suggests the send site's emotes, the smiley opens its picker ----
   The desktop app gathers each channel's emotes with their pictures (main/emote-picker.js): Kick's channel, site and
   emoji sets; on Twitch the ones your account can use; 7TV, BetterTTV and FrankerFaceZ. An emote is one site's, so
   picking one locks the box to that site, as @ and replies do. What's sent is what that site expects: Kick's
   [emote:<id>:<name>], elsewhere the name. */

const emoteCache = new Map();   // channel -> a promise of its groups ([{ id, label, emotes: [{ name, url, send }] }]), while it has a chat open
// A group several chats have (Kick's and Twitch's own sets, the ones your account can use, a streamer's 7TV set on each
// of their sites) is kept once: the first chat's copy, until the last chat with it closes
const shared = new Map();       // the group's id, size and a hash of it -> { g, n: how many chats have it }
const hashOf = t => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193); return (h >>> 0).toString(36); };
const keyOf = g => { const t = JSON.stringify(g); return `${g.id}|${t.length}|${hashOf(t)}`; };
const share = gs => gs.map(g => { const k = keyOf(g), had = shared.get(k); if (had){ had.n++; return had.g; } shared.set(k, { g, n: 1 }); return g; });
function emoteGroups(ch){
  if (!emoteCache.has(ch)){
    const ask = window.kmv && window.kmv.emotesPick;
    const p = (ask ? Promise.resolve(ask(ch)).catch(() => null) : Promise.resolve(null)).then(g => Array.isArray(g) && emoteCache.get(ch) === p ? share(g) : []);
    emoteCache.set(ch, p);
    p.then(g => { if (!g.length && emoteCache.get(ch) === p) emoteCache.delete(ch); });   // (nothing: ask again next time)
  }
  return emoteCache.get(ch);
}
// The channel has no chat open any more: its emotes go (and a shared group with the last chat that had it)
function forgetEmotes(ch){
  const p = emoteCache.get(ch); if (!p) return;
  emoteCache.delete(ch); addons.delete(ch);
  p.then(gs => gs.forEach(g => { const k = keyOf(g), had = shared.get(k); if (had && had.g === g && --had.n <= 0) shared.delete(k); }));
}
// The channel's 7TV, BetterTTV and FrankerFaceZ emotes by name (the picker's), for its messages in ALL as the site's chat
// shows them with those add-ons: null until they've come, then ready() (ALL draws its lines again)
const ADDON = { '7tv': '7TV', bttv: 'BetterTTV', ffz: 'FrankerFaceZ' };
const addons = new Map();   // channel -> { size, get(name) -> { url, src } } or null while asking
const byName = new WeakMap();   // a group -> Map(name -> { url, src }) (made once for a shared group)
function namesOf(g){
  if (!byName.has(g)){ const m = new Map(); g.emotes.forEach(e => { if (!m.has(e.name)) m.set(e.name, { url: e.url, src: ADDON[g.id] }); }); byName.set(g, m); }
  return byName.get(g);
}
function addonEmotes(ch, ready){
  if (!addons.has(ch)){
    addons.set(ch, null);
    emoteGroups(ch).then(gs => {
      if (!emoteCache.has(ch)) return addons.delete(ch);   // (its chat closed meanwhile)
      const maps = gs.filter(g => ADDON[g.id]).map(namesOf), size = maps.reduce((n, m) => n + m.size, 0);
      addons.set(ch, { size, get: name => { for (const m of maps){ const e = m.get(name); if (e) return e; } } });   // (the first group's, as before)
      if (size && ready) ready();
    });
  }
  return addons.get(ch);
}
const emoteImg = e => { const img = element('img', { src: e.url, alt: e.name, loading: 'lazy', referrerPolicy: 'no-referrer', draggable: false }); img.onerror = () => { img.style.visibility = 'hidden'; }; return img; };

// :name in the box (two letters or more): the send site's emotes that match, the ones starting with it first
async function suggestEmote(view, w){
  const v = view.input, upto = v.value.slice(0, v.selectionStart ?? v.value.length), mm = /(^|\s):([\w]{2,})$/.exec(upto);
  if (!mm){ if (view.atMode === 'emote') view.at.hidden = true; return; }
  const ch = sendSite(w); if (!ch) return;
  const q = mm[2].toLowerCase(), groups = await emoteGroups(ch);
  if (v.value.slice(0, v.selectionStart ?? v.value.length) !== upto) return;   // (typed on since)
  const all = groups.flatMap(g => g.emotes.map(e => ({ ...e, group: g.label })));
  const starts = all.filter(e => e.name.toLowerCase().startsWith(q)), has = all.filter(e => !e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q));
  const seen = new Set(), list = [...starts, ...has].filter(e => !seen.has(e.name) && seen.add(e.name)).slice(0, 8);
  view.atMode = 'emote'; view.atList = list.map(e => ({ ...e, ch })); view.atSel = 0; view.atQ = mm[2];
  if (!list.length){ view.at.hidden = true; return; }
  renderEmoteList(view);
  view.at.hidden = false;
}
function renderEmoteList(view){
  const p = PLAT_NAME[platOf(view.atList[0].ch)];
  view.at.replaceChildren(element('div', 'all-at-h', `${p} emotes`),
    ...view.atList.map((e, i) => element('button', { type: 'button', role: 'option', class: 'all-ati all-emi' + (i === view.atSel ? ' on' : ''), 'aria-selected': String(i === view.atSel), dataset: { cmd: 'all.emotePick' },
      onmousedown: ev => ev.preventDefault(), onclick: () => pickEmote(view, view.w, e) }, emoteImg(e), element('span', null, e.name), element('small', null, e.from || e.group + (e.subs ? ' · subs' : '')))),
    element('div', 'all-mh', element('kbd', null, '↑'), element('kbd', null, '↓'), ' pick · ', element('kbd', null, 'Tab'), ' or ', element('kbd', null, 'Enter'), ` adds it and locks to ${p}`));
}
// An emote into the box (in place of the :name typed, or at the caret), the box locked to its site
function pickEmote(view, w, e){
  if (!e) return;
  const v = view.input, at = v.selectionStart ?? v.value.length;
  const before = v.value.slice(0, at).replace(/(^|\s):[\w]*$/, '$1'), after = v.value.slice(at);
  const pad = before && !/\s$/.test(before) ? ' ' : '';
  v.value = before + pad + e.name + ' ' + after.replace(/^\s+/, '');
  v.selectionStart = v.selectionEnd = (before + pad + e.name + ' ').length;
  view.at.hidden = true; view.atMode = '';
  (view.emoteSends || (view.emoteSends = new Map())).set(e.name, e.send);
  if (!view.lock) setLock(view, w, { kind: 'emote', ch: e.ch });
  v.focus();
}
// What's sent: each emote picked here as its site writes it (a word that only looks like one stays a word)
function withEmotes(view, text){
  const m = view.emoteSends; if (!m || !m.size) return text;
  return text.split(/(\s+)/).map(word => m.has(word) ? m.get(word) : word).join('');
}

// The smiley: all the send site's emotes, under a heading for each kind (each channel you're subscribed to with its
// picture), a search box, and beside it a list to show one kind or one channel only
async function openEmotePicker(view, w){
  const ep = view.ep;
  if (!ep.hidden){ ep.hidden = true; return; }
  const ch = (view.lock && view.lock.ch) || sendSite(w); if (!ch) return;
  const p = PLAT_NAME[platOf(ch)];
  ep.replaceChildren(element('div', 'all-ep-h', `${p} emotes`), element('div', 'all-ep-none', 'Loading…'));
  ep.hidden = false;
  const groups = await emoteGroups(ch);
  if (ep.hidden) return;
  if (!groups.length){
    ep.replaceChildren(element('div', 'all-ep-h', `${p} emotes`), element('div', 'all-ep-none', platOf(ch) === 'youtube' ? 'YouTube\'s emoji are in its own chat box' : `No emotes found: you may need to sign in to ${p} (Settings › Accounts)`));
    return;
  }
  // a section for each kind, and for each channel in Sub emotes: { key, group, label, pic?, emotes }
  const secs = groups.flatMap(g => g.channels && g.channels.length
    ? g.channels.map(c => ({ key: g.id + '/' + c.name, group: g.id, label: c.name, pic: c.pic || '', chan: true, emotes: g.emotes.filter(e => e.from === c.name) }))
    : [{ key: g.id, group: g.id, label: g.label, emotes: g.emotes }]);
  const keys = new Set(['', ...groups.map(g => g.id), ...secs.map(x => x.key)]);
  let show = keys.has(view.epShow) ? view.epShow : '';
  const search = element('input', { type: 'search', class: 'all-ep-q', placeholder: `Search ${p} emotes`, spellcheck: false, dataset: { cmd: 'all.emoteSearch' } });
  const pick = element('select', { class: 'all-ep-f', 'aria-label': 'Show', title: 'Show all of them, one kind, or one channel\'s', dataset: { cmd: 'all.emoteShow' } },
    element('option', { value: '' }, 'All emotes'),
    ...groups.flatMap(g => [element('option', { value: g.id }, g.label), ...secs.filter(x => x.chan && x.group === g.id).map(x => element('option', { value: x.key }, x.label))]));
  pick.value = show;
  pick.ddBounds = () => ep.getBoundingClientRect();   // (its list stays inside the picker)
  pick.ddIcon = o => { const x = secs.find(y => y.chan && y.key === o.value); return x ? chPic(x) : kindIcon(o.value, ch); };   // (each kind's icon, the channels' pictures)
  const grid = element('div', { class: 'all-ep-grid', role: 'listbox' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = secs.filter(x => !show || x.group === show || x.key === show);
    let n = 0;
    const cells = shown.flatMap(x => {
      const list = (q ? x.emotes.filter(e => e.name.toLowerCase().includes(q)) : x.emotes).slice(0, q ? Math.max(0, 300 - n) : Infinity);
      n += list.length;
      if (!list.length) return [];
      return [element('div', { class: 'all-ep-sec' + (x.chan ? ' chan' : ''), role: 'presentation' }, x.chan ? chPic(x) : kindIcon(x.group, ch), x.label, x.chan && element('small', null, 'Sub emotes')),
        ...list.map(e => element('button', { type: 'button', role: 'option', class: 'all-ep-e', title: e.name + (e.from ? ` · ${e.from}` : e.subs ? ' (subscribers)' : ''), 'aria-label': e.name, dataset: { cmd: 'all.emotePick' },
          onclick: () => { pickEmote(view, w, { ...e, ch }); } }, emoteImg(e)))];
    });
    grid.replaceChildren(...(cells.length ? cells : [element('div', 'all-ep-none', `No ${p} emote matches “${search.value.trim()}”`)]));
    grid.scrollTop = 0;
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); ep.hidden = true; view.input.focus(); } });
  pick.addEventListener('change', () => { show = view.epShow = pick.value; draw(); search.focus(); });
  ep.replaceChildren(element('div', 'all-ep-h', `${p} emotes`), element('div', 'all-ep-bar', search, pick), grid);
  draw();
  search.focus();
}
// A channel's picture (its first letter until there is one)
// Each kind's icon, in the list beside the search and its heading: the channel's own picture, the sites' badges, the
// add-ons' letters (as their emotes' cards show them), and a drawing for the rest
const KIND_SVG = {
  all: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg>',
  yours: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  collectibles: '<svg viewBox="0 0 24 24"><path d="M7 4h10l4 5-9 11L3 9z"/><path class="ln" d="M3 9h18M9 4l3 16 3-16"/></svg>',
  hypetrain: '<svg viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5V16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path class="ln" d="M5 11h14M8 21l2-3M16 21l-2-3"/><circle class="hole" cx="8.5" cy="14.5" r="1.2"/><circle class="hole" cx="15.5" cy="14.5" r="1.2"/></svg>'
};
const ADDON_LETTER = { '7tv': '7', bttv: 'B', ffz: 'F' };
function kindIcon(id, ch){
  const kind = String(id || 'all').replace(/^(kick|twitch)-/, '');
  if (kind === 'channel') return chAvatar(ch);
  if (kind === 'global'){ const p = platOf(ch); return element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]); }
  if (ADDON_LETTER[kind]) return element('span', 'all-ep-ic addon', ADDON_LETTER[kind]);
  const svg = kind === 'emoji' ? SMILEY : KIND_SVG[kind];
  return svg ? element('span', { class: 'all-ep-ic ' + kind, html: svg }) : null;
}
const chPic = c => element('span', 'all-ep-pic', c.pic ? element('img', { src: c.pic, alt: '', referrerPolicy: 'no-referrer', loading: 'lazy' }) : (c.label || c.name || '?')[0]);   // (a circle: in its heading, and in the list beside the search)
const SMILEY = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2M9 9.5h.01M15 9.5h.01"/></svg>';

export { addonEmotes, emoteCache, forgetEmotes, openEmotePicker, pickEmote, renderEmoteList, SMILEY, suggestEmote,
  withEmotes };
