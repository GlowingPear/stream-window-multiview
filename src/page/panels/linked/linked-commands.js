import { modeSel, shownWins, wins } from '../../core.js';
import { addParsed } from '../../layout/placement.js';
import { autoOpen, fmtViewers, infoFor, linkPair, notifyAll, notifyOff, saved, setNotify, svHue, svInitials,
  toggleSaved } from '../channels/channels.js';
import { openLinkCard } from './link-card.js';
import { openProfile } from '../profiles/profiles.js';
import { openSettings } from '../settings/settings.js';
import { canLink, link, linkedOn, listStreamers, notSame, optFor, setMain, setStreamerOpt, streamerName, suggestions,
  unlink, unlinkAll } from '../../platforms/linked.js';
import { PLAT_NAME, chLabel, platOf, platform } from '../../platforms/platforms.js';
import { ask } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { chPhoto } from '../../windows/channel-picker.js';
import { openStreamer, setSideBySide, showTab } from '../../windows/frames.js';

/* ---- The search box (Ctrl/⌘+K) for linked channels: a linked streamer as one result (its sites, each site's
   viewers, Watch as tabs, one site only, Profile, Saved, Linked channels, and everything else under More…), and
   every linking action ("link" finds them, suggestions first). Nothing here while Linked channels is off. ---- */
const site = c => PLAT_NAME[platOf(c)];
const liveIn = s => s.accounts.filter(c => infoFor(c) && infoFor(c).live);
const isOpenS = s => wins.some(w => s.accounts.includes(w.channel));
const andList = l => l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
function streamerItem(s){
  const name = streamerName(s), live = liveIn(s), sv = s.accounts.some(c => saved.includes(c)), open = isOpenS(s);
  const lead = live.includes(s.main) ? s.main : live[0] || s.main, info = infoFor(lead) || {};
  const total = live.reduce((t, c) => t + (+infoFor(c).viewers || 0), 0);
  return { id: 'st:' + s.id, kind: 'channel', group: 'Streamers', title: name.replace(/^@/, ''),
    sub: [live.length ? `live on ${andList(live.map(site))}` : 'offline', `${s.accounts.length} sites`, info.title],
    heroSub: [live.length && info.title && { b: info.title }, live.length && info.category, ...s.accounts.map(c => infoFor(c) && infoFor(c).live ? { b: fmtViewers(infoFor(c).viewers), t: '', pre: site(c) + ' ' } : `${site(c)} offline`)]
      .filter(Boolean).map(x => x && x.pre ? `${x.pre}${x.b}` : x),
    words: [...s.accounts.map(c => platform(c).handle(c).replace(/^@/, '')), ...s.accounts.map(site), 'linked'],
    avatar: chPhoto(s.main), hue: svHue(s.main), initials: svInitials(name.replace(/^@/, '')), live: !!live.length, viewers: total ? fmtViewers(total) : null,
    siteIcons: s.accounts.map(c => ({ p: platOf(c), dim: !live.includes(c) })),
    pills: open ? [{ text: 'Open', accent: true }] : sv ? [{ text: 'Saved' }] : [],
    boost: 14 + (live.length ? 8 : 0) + (open ? 6 : 0) + (sv ? 5 : 0),
    buttons: streamerButtons(s), run: () => streamerButtons(s)[0].run(), verb: 'Watch', more: () => streamerMore(s) };
}
function streamerButtons(s){
  const live = liveIn(s), sv = s.accounts.some(c => saved.includes(c));
  return [
    { label: live.length > 1 ? `Watch: ${live.map(site).join(' + ')} as tabs` : live.length ? `Watch on ${site(live[0])}` : 'Watch', icon: 'colsview', run: () => openStreamer(s.main, modeSel ? modeSel.value : 'both') },
    ...(live.length > 1 ? live.map(c => ({ label: `${site(c)} only`, icon: 'ytPlay', run: () => openStreamer(s.main, modeSel ? modeSel.value : 'both', [c]) })) : []),
    DESKTOP && { label: 'Profile', icon: 'user', run: () => openProfile(s.main) },
    { label: sv ? 'Saved' : 'Save', icon: 'star', on: sv, run: () => saveAll(s, !sv) },
    { label: 'Linked channels', icon: 'layers', run: () => openLinkCard(s.main) },
    { label: 'More…', more: true }
  ].filter(Boolean);
}
function saveAll(s, on){ s.accounts.forEach(c => { if (saved.includes(c) !== on) toggleSaved(c); }); }
// Everything for one streamer (Tab on its row, or More…)
function streamerMore(s){
  const name = streamerName(s), g = name, out = [], live = liveIn(s);
  const add = (id, title, x) => out.push({ id: `st:${s.id}:${id}`, group: x.group || g, title, icon: 'point', ...x });
  const mode = modeSel ? modeSel.value : 'both';
  add('watch', 'Watch: live sites as tabs', { group: 'Watch', icon: 'colsview', sub: live.length ? andList(live.map(site)) : 'Nobody live: the main channel', run: () => openStreamer(s.main, mode) });
  s.accounts.forEach(c => add('on:' + c, `Watch on ${site(c)}`, { group: 'Watch', icon: 'ytPlay', sub: infoFor(c) && infoFor(c).live ? 'live' : 'offline', run: () => openStreamer(s.main, mode, [c]) }));
  add('chats', 'Chats only, as tabs', { group: 'Watch', icon: 'chat', run: () => openStreamer(s.main, 'chat', live.length ? live : [s.main]) });
  add('chatsSide', 'Chats side by side', { group: 'Watch', icon: 'columns', run: () => {
    openStreamer(s.main, 'chat', live.length ? live : s.accounts);
    const c = shownWins().find(w => w.kind === 'chat' && s.accounts.includes(w.channel)); if (c) setSideBySide(c, true);
  } });
  add('each', 'Open each in its own window', { group: 'Watch', icon: 'popwin', sub: 'Ignores Tabs this once', run: () => (live.length ? live : [s.main]).forEach(c => openSeparate(c, mode)) });
  if (DESKTOP) add('profile', 'Profile', { icon: 'user', run: () => openProfile(s.main) });
  add('saved', 'Saved', { icon: 'star', toggle: { get: () => s.accounts.some(c => saved.includes(c)), set: on => saveAll(s, on) } });
  if (DESKTOP) add('alerts', 'Live alerts', { icon: 'bell', disabled: () => !notifyAll && 'Live notifications are off (Channels › the bell)',
    toggle: { get: () => notifyAll && s.accounts.every(c => !notifyOff.includes(c)), set: on => s.accounts.forEach(c => setNotify(c, on)) } });
  add('auto', 'Opens by itself (⚡)', { icon: 'bolt', toggle: { get: () => s.accounts.some(c => autoOpen.includes(c)), set: () => openLinkCard(s.main) }, sub: 'Choose together or separate in the card' });
  add('card', 'Linked channels…', { group: 'Linking', icon: 'layers', run: () => openLinkCard(s.main) });
  add('addAcc', 'Link another channel…', { group: 'Linking', icon: 'plus', run: () => openLinkCard(s.main, { add: true }) });
  s.accounts.filter(c => c !== s.main).forEach(c => add('main:' + c, `Make ${site(c)} the main channel`, { group: 'Linking', icon: 'star', sub: 'First tab, picture and name', run: () => setMain(c) }));
  s.accounts.forEach(c => add('unlink:' + c, `Unlink ${site(c)}`, { group: 'Linking', icon: 'unlink', sub: `${chLabel(c)} becomes its own channel`, run: () => askUnlink(c) }));
  add('unlinkAll', 'Unlink all', { group: 'Linking', icon: 'unlink', sub: `Back to ${s.accounts.length} separate channels`, run: () => askUnlinkAll(s) });
  add('name', 'Name shown…', { group: 'Their choices', icon: 'user', sub: name, run: () => openLinkCard(s.main) });
  ['tabs', 'separate'].forEach(v => add('streams:' + v, `Their streams: ${v === 'tabs' ? 'tabs in one window' : 'separate windows'}`, { group: 'Their choices', icon: 'colsview',
    disabled: () => optFor(s.main, 'streams') === v && 'Already chosen', run: () => setStreamerOpt(s.id, 'streams', v) }));
  ['together', 'separate'].forEach(v => add('auto:' + v, `When they open by themselves: ${v}`, { group: 'Their choices', icon: 'bolt',
    disabled: () => optFor(s.main, 'autoOpen') === v && 'Already chosen', run: () => setStreamerOpt(s.id, 'autoOpen', v) }));
  [[true, 'on'], [false, 'off']].forEach(([v, w]) => add('allTab:' + w, `Their ALL tab: ${w}`, { group: 'Their choices', icon: 'chat', sub: 'Their chats as one list',
    disabled: () => optFor(s.main, 'allTab') === v && 'Already chosen', run: () => setStreamerOpt(s.id, 'allTab', v) }));
  add('copy', 'Copy their links', { group: 'Share', icon: 'copy', sub: 'Every site\'s link, one per line', run: () => copyLinks(s) });
  return out;
}
const openSeparate = (c, mode) => addParsed({ channel: c, only: null, separate: true, mode });
function copyLinks(s){
  const t = s.accounts.map(c => platform(c).pageUrl(c, 'stream')).join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => flash(`Copied ${s.accounts.length} links`), () => flash(t));
}
async function askUnlink(c){
  if (await ask(`Unlink ${chLabel(c)} on ${site(c)}?`, 'It becomes its own channel again. Its windows move out of the streamer\'s window.', { ok: 'Unlink' })) unlink(c);
}
async function askUnlinkAll(s){
  if (await ask(`Unlink ${streamerName(s)}?`, `Back to ${s.accounts.length} separate channels.`, { ok: 'Unlink all', danger: true })) unlinkAll(s.id);
}
// Everything about linking: the suggestions first, then the actions
function linkingItems(){
  const out = [], g = 'Linked channels', act = shownWins().find(w => w.el.classList.contains('active') && w.channel && !/^yt:v:/.test(w.channel));
  suggestions().forEach(x => out.push({ id: `link.sug:${x.a}|${x.b}`, group: 'Suggested links', title: `Link ${chLabel(x.a)} on ${site(x.a)} with ${chLabel(x.b)} on ${site(x.b)}`,
    sub: x.why, words: ['link', 'same streamer'], siteIcons: [{ p: platOf(x.a) }, { p: platOf(x.b) }], icon: 'layers', run: () => linkPair(x.a, x.b),
    alt: () => notSame(x.a, x.b), altLabel: 'not the same' }));
  out.push({ id: 'link.accounts', group: g, title: 'Link channels…', sub: 'Pick a streamer, then add their other sites', icon: 'layers', words: ['link', 'same streamer', 'several sites'], run: () => openLinkCard(null) });
  if (act) out.push({ id: 'link.window', group: g, title: 'Link this window\'s channel with…', sub: [chLabel(act.channel), 'the window you\'re on'], icon: 'layers', words: ['link'], run: () => openLinkCard(act.channel, { add: true }) });
  out.push({ id: 'link.find', group: g, title: 'Find streamers on several sites', sub: 'Checks your saved and followed channels for the same streamer elsewhere', icon: 'search', words: ['link', 'suggest'],
    run: () => { const n = suggestions({ all: true }).length; flash(n ? `${n} streamer${n === 1 ? ' is' : 's are'} on several sites · Settings › Linked channels › Suggestions` : 'No streamers found on several sites'); openSettings('linked', { sub: 'sugs' }); } });
  const list = listStreamers();
  out.push({ id: 'link.list', group: g, title: 'Show linked streamers', sub: `${list.length} streamer${list.length === 1 ? '' : 's'}, ${list.reduce((t, s) => t + s.accounts.length, 0)} channels`, icon: 'list', words: ['linked'], run: () => openSettings('linked', { sub: 'linked' }) });
  const sugs = suggestions({ all: true });
  if (sugs.length > 1) out.push({ id: 'link.all', group: g, title: 'Link every suggestion', sub: `${sugs.length} pairs`, icon: 'layers', words: ['link'], run: () => linkEvery() });
  list.forEach(s => {
    out.push({ id: `link.unlink:${s.id}`, group: g, title: `Unlink ${streamerName(s)}…`, sub: `Back to ${s.accounts.length} separate channels`, icon: 'unlink', words: ['link', 'unlink'], run: () => askUnlinkAll(s) });
    s.accounts.filter(c => c !== s.main).forEach(c => out.push({ id: `link.main:${c}`, group: g, title: `Make ${site(c)} ${streamerName(s)}'s main channel`, sub: 'First tab, picture and name', icon: 'star', words: ['link', 'main'], run: () => setMain(c) }));
  });
  // who's live on several sites right now
  const multi = list.filter(s => liveIn(s).length > 1);
  if (multi.length) out.push({ id: 'link.multiLive', group: g, title: 'Live on more than one site', sub: multi.map(s => `${streamerName(s)} (${liveIn(s).map(site).join(' + ')})`).join(' · '),
    icon: 'live', words: ['live', 'several sites', 'simulcast'], verb: 'Watch them', run: () => multi.forEach(s => openStreamer(s.main, modeSel ? modeSel.value : 'both')) });
  // a site everywhere: every linked window that has it live switches to it
  ['kick', 'twitch', 'youtube'].forEach(p => out.push({ id: `link.prefer:${p}`, group: g, title: `Switch every linked window to ${PLAT_NAME[p]}`, sub: 'Windows where it isn\'t live stay as they are', icon: 'arrowR', words: ['tabs', 'site'],
    disabled: () => !wins.some(w => w.frame && platOf(w.channel) === p && w.hiddenTab) && 'No linked window has it as a tab', run: () => preferSite(p) }));
  return out;
}
async function linkEvery(){
  const sugs = suggestions({ all: true });
  if (!await ask(`Link ${sugs.length} pairs?`, sugs.map(x => `${chLabel(x.a)} on ${site(x.a)} + ${site(x.b)}`).join(' · '), { ok: 'Link all' })) return;
  sugs.forEach(x => { if (canLink(x.a, x.b)) link(x.a, x.b); });
  flash(`Linked ${sugs.length} pairs`);
}
function preferSite(p){
  let n = 0;
  wins.filter(w => w.frame && w.hiddenTab && platOf(w.channel) === p && infoFor(w.channel)?.live && w.kind === 'stream').forEach(w => { showTab(w); n++; });
  flash(n ? `${n} window${n === 1 ? '' : 's'} switched to ${PLAT_NAME[p]}` : `No linked window is live on ${PLAT_NAME[p]}`);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  commands.provide('streamers', () => linkedOn() ? listStreamers().map(streamerItem) : []);
  commands.provide('linking', () => linkedOn() ? linkingItems() : []);
}

export { init };
