import { $, ROLE } from '../../core.js';
import { tile } from '../../layout/layouts.js';
import { addParsed } from '../../layout/placement.js';
import { bell } from '../bell/bell.js';
import { channelVars, infoFor, liveNow, loadSavedProfiles, notifyAll, notifyOff, persistSaved, saved, sendWatch,
  toggleSaved } from '../channels/channels.js';
import { PLAT_NAME, chLabel, modUrl, normCh, platOf, platform, rememberName, rememberNames } from '../../platforms/platforms.js';
import { ask, askChecked } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { element, esc } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { fromApp } from '../../shared/incoming.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { closeOverlays } from '../../shortcuts.js';
import { loadBarAvatars } from '../../windows/channel-picker.js';

let profDlg;
const pf = { list: {}, plat: 'all', flags: new Set(), sort: 'live', cur: null, data: null, req: 0, look: null, histAll: false, mod: {} };
const pfHue = ch => { let h = 0; for (const c of String(ch)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 35% 36%)`; };
// "NovaKit" -> NK, "ember_and_oak" -> EA, "quietcartographer" -> QU
function pfInitials(n){
  const t = String(n).replace(/^(tw:|yt:c:|yt:@?)/, '').trim();
  const words = t.split(/[\s_.\-]+/).filter(w => /[A-Za-z0-9]/.test(w));
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const caps = t.slice(1).match(/[A-Z]/);
  return (t[0] + (caps ? caps[0] : (t.match(/[A-Za-z0-9]/g) || ['', '?'])[1] || '')).toUpperCase() || '?';
}
function pfAvatar(ch, name, src, live){
  const a = document.createElement('span'); a.className = 'pf-av' + (live ? ' live' : '');
  a.style.setProperty('--c', pfHue(ch)); a.textContent = pfInitials(name || ch);
  if (src){ const i = new Image(); i.alt = ''; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); i.src = src; a.appendChild(i); }
  return a;
}
const pfMeta = ch => (pf.list[ch] && pf.list[ch].meta) || {};
const pfInfo = ch => (pf.list[ch] && pf.list[ch].info) || {};
const pfName = ch => pfMeta(ch).nick || pfInfo(ch).name || chLabel(ch);
const pfLive = ch => !!(infoFor(ch) && infoFor(ch).live);
const fmtN = n => n == null ? '–' : (n = Number(n) || 0) >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
let fmtDur;
const fmtClock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = t => new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDate = t => new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
const keyDate = k => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100).getTime();
function pfAgo(t){
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : 'on ' + fmtDate(t);
}
const minClock = m => { const d = new Date(); d.setHours(Math.floor(m / 60) % 24, m % 60, 0, 0); return fmtClock(d); };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// "Tue–Thu", "Mon, Wed" or "" from streams per weekday
function pfTopDays(counts){
  const max = Math.max(...counts); if (!max) return '';
  const on = counts.map(n => n >= max * 0.6);
  if (on.every(Boolean)) return 'every day';
  const runs = []; let i = 0;
  while (i < 7){ if (!on[i]){ i++; continue; } let j = i; while (j + 1 < 7 && on[j + 1]) j++; runs.push(j - i >= 2 ? `${DAYS[i]}–${DAYS[j]}` : j > i ? `${DAYS[i]}, ${DAYS[j]}` : DAYS[i]); i = j + 1; }
  return runs.join(', ');
}

function openProfiles(){
  if (!window.kmv || !window.kmv.profileList) return;
  closeOverlays();
  profDlg.hidden = false;
  pfShow('dir');
  pfLoadList().then(() => { const q = $('#pfQ'); q.focus(); q.select(); });
}
async function pfLoadList(){
  pf.list = await window.kmv.profileList(saved).catch(() => ({})) || {};
  rememberNames(Object.fromEntries(Object.entries(pf.list).map(([ch, x]) => [ch, x && x.info && x.info.name])));
  pfRenderDir();
}
function pfShow(view){
  profDlg.querySelector('.pf-dir').hidden = view !== 'dir';
  profDlg.querySelector('.pf-prof').hidden = view !== 'prof';
  profDlg.querySelector('.pf-back').hidden = view !== 'prof';
  profDlg.querySelector('#profTitle').textContent = view === 'prof' ? 'Profile' : 'Streamer Profiles';
  profDlg.querySelector('.pf-count').textContent = view === 'dir' ? `${saved.length} saved · ${liveNow().length} live now` : '';
  if (view === 'dir'){ pf.cur = null; pf.req++; }
}
function pfRenderDir(){
  if (profDlg.hidden || profDlg.querySelector('.pf-dir').hidden) return;
  const q = $('#pfQ').value.trim().toLowerCase().replace(/^@/, '');
  profDlg.querySelectorAll('.pf-chips[data-g=plat] button').forEach(b => b.classList.toggle('on', b.dataset.v === pf.plat));
  profDlg.querySelectorAll('.pf-chips[data-g=flag] button').forEach(b => b.classList.toggle('on', pf.flags.has(b.dataset.v)));
  $('#pfSort').value = pf.sort;
  const match = ch => !q || [ch, chLabel(ch), pfMeta(ch).nick, pfInfo(ch).name, ...(pfMeta(ch).tags || [])].some(x => x && String(x).toLowerCase().includes(q));
  const all = saved.filter(ch => !/^yt:v:/.test(ch));
  const chs = all.filter(ch => (pf.plat === 'all' || platOf(ch) === pf.plat) && match(ch)
    && (!pf.flags.has('live') || pfLive(ch)) && (!pf.flags.has('fav') || pfMeta(ch).fav)
    && (!pf.flags.has('notes') || pfMeta(ch).notes) && (!pf.flags.has('tagged') || (pfMeta(ch).tags || []).length));
  const last = ch => pfLive(ch) ? Date.now() : (pf.list[ch] && pf.list[ch].last) || 0;
  const byName = (a, b) => pfName(a).localeCompare(pfName(b), undefined, { sensitivity: 'base' });
  const cmp = {
    live: (a, b) => pfLive(b) - pfLive(a),
    fav: (a, b) => (!!pfMeta(b).fav - !!pfMeta(a).fav) || (pfLive(b) - pfLive(a)),
    recent: (a, b) => last(b) - last(a),
    followers: (a, b) => (pfInfo(b).followers || 0) - (pfInfo(a).followers || 0),
    name: () => 0
  }[pf.sort] || (() => 0);
  chs.sort((a, b) => cmp(a, b) || byName(a, b));
  profDlg.querySelector('.pf-shown').textContent = chs.length === all.length ? `${all.length}` : `${chs.length} of ${all.length}`;
  const grid = profDlg.querySelector('.pf-grid');
  grid.innerHTML = '';
  if (!all.length) grid.innerHTML = '<div class="pf-empty">Nothing saved yet. Type a name above to find a streamer, or click ☆ on any window.</div>';
  else if (!chs.length) grid.innerHTML = '<div class="pf-empty">No saved streamers match.</div>';
  chs.forEach(ch => {
    const live = pfLive(ch), li = infoFor(ch) || {}, m = pfMeta(ch), inf = pfInfo(ch), rec = pf.list[ch] || {};
    const c = document.createElement('button'); c.className = 'pf-card'; c.dataset.ch = ch;
    c.innerHTML = `<div class="pf-top"></div><div class="pf-line"></div><div class="pf-foot"></div>`;
    const top = c.querySelector('.pf-top');
    top.appendChild(pfAvatar(ch, inf.name || chLabel(ch), inf.avatar, live));
    const who = document.createElement('div'); who.className = 'pf-who';
    who.innerHTML = `<div class="pf-nm">${m.fav ? '<span class="pf-fav" title="Favourite">★</span>' : ''}<b></b><span class="pf-plat ${platOf(ch)}">${PLAT_NAME[platOf(ch)]}</span></div><div class="pf-st${live ? ' live' : ''}"></div>`;
    who.querySelector('b').textContent = pfName(ch);
    who.querySelector('.pf-st').textContent = live ? `LIVE${li.viewers != null ? ' · ' + fmtN(li.viewers) + ' watching' : ''}` : rec.last ? `Last live ${pfAgo(rec.last)}` : li.missing ? 'Channel not found' : 'Offline';
    top.appendChild(who);
    const line = c.querySelector('.pf-line');
    line.textContent = live ? [li.category, li.title].filter(Boolean).join(' · ') : rec.streams30 ? `${rec.streams30} stream${rec.streams30 === 1 ? '' : 's'} in the last 30 days` : m.nick ? chLabel(ch) : '';
    line.title = line.textContent;
    const foot = c.querySelector('.pf-foot');
    foot.innerHTML = inf.followers != null ? `<span><b>${fmtN(inf.followers)}</b> followers</span>` : '<span>Open for details</span>';
    if ((m.tags || []).length){ const t = document.createElement('span'); t.className = 'pf-tags'; m.tags.slice(0, 3).forEach(x => { const e = document.createElement('span'); e.className = 'pf-tag'; e.textContent = x; t.appendChild(e); }); foot.appendChild(t); }
    c.onclick = () => openProfile(ch);
    grid.appendChild(c);
  });
  pfRenderLook(q);
}
// "Not saved yet": look the typed name up on all three sites (only when asked: it's three requests).
function pfRenderLook(q){
  const look = profDlg.querySelector('.pf-look'), box = look.querySelector('.pf-look-list');
  const exact = saved.some(ch => ch === q || chLabel(ch).toLowerCase() === q);
  look.hidden = q.length < 2 || exact || !/^[a-z0-9_.\-]{2,40}$/.test(q);
  if (look.hidden) return;
  if (!pf.look || pf.look.q !== q){
    box.innerHTML = '<div class="pf-look-row"><span class="pf-who"><b></b><span>Isn\'t in your saved streamers.</span></span><button class="btn pf-find">Look it up</button></div>';
    box.querySelector('b').textContent = `“${q}” on Kick, Twitch and YouTube`;
    box.querySelector('.pf-find').onclick = () => pfLookup(q);
    return;
  }
  if (pf.look.busy){ box.innerHTML = '<div class="pf-look-row pf-load"><span class="spin"></span> Looking on Kick, Twitch and YouTube…</div>'; return; }
  box.innerHTML = '';
  if (!pf.look.items.length){ box.innerHTML = '<div class="pf-look-row"><span class="pf-who"><b>Nobody by that name</b><span>No Kick, Twitch or YouTube channel is called exactly that. Check the spelling, or paste a link.</span></span></div>'; return; }
  pf.look.items.forEach(x => {
    const row = document.createElement('div'); row.className = 'pf-look-row';
    row.appendChild(pfAvatar(x.ch, x.name, x.avatar, !!x.live));
    const who = document.createElement('div'); who.className = 'pf-who';
    who.innerHTML = `<b><span class="nm"></span> <span class="pf-plat ${platOf(x.ch)}">${PLAT_NAME[platOf(x.ch)]}</span></b><span class="sub"></span>`;
    who.querySelector('.nm').textContent = x.name;
    who.querySelector('.sub').textContent = [x.live ? `Live now${x.live.viewers != null ? ' · ' + fmtN(x.live.viewers) + ' watching' : ''}` : 'Offline',
      x.followers != null ? fmtN(x.followers) + ' followers' : x.followersText || ''].filter(Boolean).join(' · ');
    row.appendChild(who);
    const view = document.createElement('button'); view.className = 'btn'; view.textContent = 'View profile'; view.onclick = () => openProfile(x.ch);
    const sv = document.createElement('button'); sv.className = 'btn primary';
    const isS = saved.includes(x.ch); sv.textContent = isS ? 'Saved' : 'Save'; sv.disabled = isS;
    sv.onclick = () => { if (!saved.includes(x.ch)){ saved.push(x.ch); persistSaved(); } pfLoadList(); };
    row.append(view, sv);
    box.appendChild(row);
  });
}
// Profiles at a filter (a site, or Live now / Favourites / Has notes / Tagged), or looking up a name
async function openProfilesAt({ plat = 'all', flag = '', q = '' } = {}){
  if (profDlg.hidden || pf.cur) openProfiles();
  pfShow('dir');
  pf.plat = plat; pf.flags = new Set(flag ? [flag] : []);
  $('#pfQ').value = q;
  await pfLoadList();
  const name = q.trim().toLowerCase().replace(/^@/, '');
  if (name && !profDlg.querySelector('.pf-look').hidden) pfLookup(name);
}
async function pfLookup(q){
  pf.look = { q, busy: true, items: [] };
  pfRenderLook(q);
  const items = await window.kmv.profileLookup(q).catch(() => []);
  if (!pf.look || pf.look.q !== q) return;
  pf.look = { q, items: items || [] };
  if ($('#pfQ').value.trim().toLowerCase().replace(/^@/, '') === q) pfRenderLook(q);
}

async function openProfile(ch){
  if (!window.kmv || !window.kmv.profileGet || !ch) return;
  ch = normCh(ch);
  if (profDlg.hidden){ closeOverlays(); profDlg.hidden = false; }
  pf.cur = ch; pf.histAll = false;
  const req = ++pf.req;
  pfShow('prof');
  pf.data = { ch, loading: true, meta: (pf.list[ch] || {}).meta, info: (pf.list[ch] || {}).info };
  pfRenderProf();
  profDlg.querySelector('.pf-body').scrollTop = 0;
  const local = await window.kmv.profileGet(ch, { local: true }).catch(() => null);
  if (req !== pf.req) return;
  if (local) { pf.data = { ...local, loading: true }; pfRenderProf(); }
  if (modUrl(ch) && window.kmv.modCheck && pf.mod[ch] === undefined)
    window.kmv.modCheck(ch).then(v => { pf.mod[ch] = v; if (req === pf.req) pfRenderProf(); }).catch(() => {});
  const full = await window.kmv.profileGet(ch).catch(() => null);
  if (req !== pf.req) return;
  pf.data = full ? { ...full, meta: pf.data.meta || full.meta } : { ...pf.data, loading: false, failed: true };
  if (full && full.site) rememberName(ch, full.site.name);
  pfRenderProf();
}
const pfIco = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  unf: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11h5"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};
let pfNotesT = null;
function pfSaveMeta(ch, patch){
  pf.data.meta = { ...(pf.data.meta || {}), ...patch };
  if (pf.list[ch]) pf.list[ch].meta = pf.data.meta;
  clearTimeout(pfNotesT);
  const send = () => window.kmv.profileMeta(ch, pf.data.meta).catch(() => {});
  if ('notes' in patch || 'nick' in patch) pfNotesT = setTimeout(send, 500); else send();
}
async function unfollowKick(ch, name){
  if (!window.kmv || !window.kmv.kickUnfollow) return null;
  const yes = await ask(`Unfollow ${name} on Kick?`, 'This unfollows them on kick.com itself, the same as the Unfollow button on their channel page. You can follow them again on Kick any time.',
    { ok: 'Unfollow on Kick', danger: true, check: saved.includes(ch) ? 'Also remove them from my saved streamers' : '' });
  if (!yes) return null;
  const alsoRemove = askChecked();
  const r = await window.kmv.kickUnfollow(ch).catch(() => null);
  if (r && r.ok){
    if (alsoRemove && saved.includes(ch)) toggleSaved(ch);
    flash(`Unfollowed ${name} on Kick` + (alsoRemove ? ' and removed from Saved' : ''), { subject: 'accounts' });
  } else flash(r && r.error === 'login' ? 'Log in to Kick in this app first, then try again.' : `Couldn't unfollow ${name} on Kick right now. Try again in a minute, or unfollow on kick.com.`,
    { subject: 'accounts', ...(r && r.error === 'login' ? { act: { t: 'login', p: 'kick' } } : {}) });
  return r;
}

function pfRenderProf(){
  const d = pf.data || {}, ch = pf.cur; if (!ch) return;
  const box = profDlg.querySelector('.pf-prof'), scroller = profDlg.querySelector('.pf-body'), keepY = scroller.scrollTop;
  const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const s = d.site || null, sm = d.summary || {}, st = sm.stats || null, m = d.meta || {}, inf = d.info || {};
  const plat = platOf(ch), P = PLAT_NAME[plat], li = infoFor(ch) || null;
  const realName = (s && s.name) || inf.name || (li && li.name) || chLabel(ch);
  const shown = m.nick || realName;
  const liveI = (li && li.live) ? li : null, sl = s && s.live;
  const isLive = liveI ? true : li && !li.live ? false : !!sl || !!sm.live;
  const started = isLive ? ((sl && sl.startedAt) || (li && li.startedAt) || (sm.live && sm.live.start) || null) : null;
  const isSaved = saved.includes(ch);
  const followers = s && s.followers != null ? s.followers : inf.followers;
  box.innerHTML = '';

  /* hero */
  const hero = element('div', 'pf-hero');
  const banner = element('div', 'pf-banner');
  hero.style.setProperty('--pc', { kick: '#53fc18', twitch: '#9146ff', youtube: '#ff3030' }[plat]);
  if (s && s.banner) banner.style.backgroundImage = `url("${s.banner.replace(/"/g, '%22')}")`; else banner.classList.add('none');
  hero.appendChild(banner);
  const main = element('div', 'pf-hero-main'), avw = element('div', 'pf-avwrap');
  avw.appendChild(pfAvatar(ch, realName, (s && s.avatar) || inf.avatar, isLive));
  if (isLive) avw.appendChild(element('span', 'pf-livetag', 'LIVE'));
  main.appendChild(avw);
  const id = element('div', 'pf-id'), h2 = element('h2');
  h2.appendChild(document.createTextNode(shown));
  if (m.nick && m.nick !== realName) h2.appendChild(element('small', '', realName));
  h2.appendChild(element('span', 'pf-plat ' + plat, P));
  if (s && s.verified) h2.appendChild(element('span', 'pf-badge ok', 'Verified'));
  if (s && s.partner) h2.appendChild(element('span', 'pf-badge', 'Partner'));
  else if (s && s.affiliate) h2.appendChild(element('span', 'pf-badge', 'Affiliate'));
  if (pf.mod[ch]) h2.appendChild(element('span', 'pf-badge mod', 'You moderate'));
  id.appendChild(h2);
  const metaBits = [chLabel(ch) !== shown ? chLabel(ch) : '', s && s.created ? `On ${P} since ${new Date(s.created).toLocaleDateString([], { year: 'numeric', month: 'long' })}` : '',
    followers != null ? `${fmtN(followers)} followers` : s && s.followersText ? s.followersText : ''].filter(Boolean);
  if (metaBits.length) id.appendChild(element('div', 'pf-meta', metaBits.join(' · ')));
  if (s && s.bio) id.appendChild(element('p', 'pf-bio', s.bio));
  if (d.loading && !s) { const l = element('div', 'pf-load'); l.innerHTML = `<span class="spin"></span> Asking ${P}…`; id.appendChild(l); }
  else if (!s && (d.failed || d.missing || d.video)) id.appendChild(element('div', 'pf-meta', d.missing ? `${P} says this channel doesn't exist (any more).` : `Couldn't reach ${P} right now, so this shows what the app has recorded.`));
  if (s && s.socials && s.socials.length){
    const so = element('div', 'pf-socials');
    s.socials.forEach(x => { const b = element('button'); b.innerHTML = `<b></b><span></span>`; b.querySelector('b').textContent = x.site; b.querySelector('span').textContent = x.label; b.title = x.url; b.onclick = () => window.kmv.openExternal(x.url); so.appendChild(b); });
    id.appendChild(so);
  }
  main.appendChild(id);
  const acts = element('div', 'pf-acts');
  const fav = element('button', 'btn fav' + (m.fav ? ' on' : '')); fav.innerHTML = pfIco.star + (m.fav ? 'Favourite' : 'Favourite');
  fav.title = m.fav ? 'Remove from favourites' : 'Mark as a favourite (sorts first in Profiles)';
  fav.onclick = () => { pfSaveMeta(ch, { fav: !m.fav }); pfRenderProf(); };
  acts.appendChild(fav);
  if (isSaved && DESKTOP){
    const on = notifyAll && !notifyOff.includes(ch);
    const bell = element('button', 'btn' + (on ? ' on' : '')); bell.innerHTML = (on ? icon.bell : icon.bellOff) + (on ? 'Live alerts on' : 'Live alerts off');
    bell.disabled = !notifyAll; bell.title = !notifyAll ? 'Live notifications are off for every channel (Channels panel)' : on ? 'Notify me when they go live (click to turn off)' : 'No notification for this channel (click to turn on)';
    bell.onclick = () => { channelVars.notifyOff = notifyOff.includes(ch) ? notifyOff.filter(c => c !== ch) : [...notifyOff, ch]; settings.set('notifyOff', notifyOff); sendWatch(); store.changed('liveAlerts'); pfRenderProf(); };
    acts.appendChild(bell);
  }
  if (plat === 'kick' && s && s.loggedIn && s.following !== false){
    const u = element('button', 'btn unf'); u.innerHTML = pfIco.unf + 'Unfollow on Kick';
    u.title = 'Unfollow them on kick.com itself (asks first)';
    u.onclick = async () => { u.disabled = true; const r = await unfollowKick(ch, (pf.data.meta && pf.data.meta.nick) || realName); u.disabled = false; if (r && r.ok && pf.cur === ch && pf.data.site){ pf.data.site.following = false; pfRenderProf(); } };
    acts.appendChild(u);
  }
  const sv = element('button', 'btn', isSaved ? 'Remove from saved' : '★ Save');
  sv.title = isSaved ? 'Remove from your saved streamers (keeps this profile\'s notes and history)' : 'Save: check when they go live and keep a history';
  sv.onclick = () => { toggleSaved(ch); pfLoadList(); pfRenderProf(); };
  acts.appendChild(sv);
  const url = (s && s.url) || platform(ch).profileUrl(ch);
  const ext = element('button', 'btn'); ext.innerHTML = pfIco.ext + 'Open on ' + P; ext.onclick = () => window.kmv.openExternal(url);
  acts.appendChild(ext);
  main.appendChild(acts);
  hero.appendChild(main);
  box.appendChild(hero);

  /* now: live, or the last stream */
  const now = element('div', 'pf-now' + (isLive ? ' live' : ''));
  const thumb = element('div', 'pf-thumb');
  if (isLive && sl && sl.thumb) thumb.style.backgroundImage = `url("${sl.thumb.replace(/"/g, '%22')}")`;
  const txt = element('div', 'pf-now-txt'), btns = element('div', 'pf-now-btns');
  const watch = element('button', 'btn primary', isLive ? 'Watch now' : 'Open anyway');
  watch.onclick = () => { profDlg.hidden = true; addParsed({ channel: ch, only: null }); };
  const chat = element('button', 'btn', 'Chat only');
  chat.onclick = () => { profDlg.hidden = true; addParsed({ channel: ch, only: 'chat' }); };
  btns.appendChild(watch); const row2 = element('div'); row2.appendChild(chat); btns.appendChild(row2);
  if (isLive){
    const title = (liveI && liveI.title) || (sl && sl.title) || (sm.live && sm.live.title) || '';
    const cat = (liveI && liveI.category) || (sl && sl.category) || (sm.live && sm.live.cat) || '';
    const viewers = liveI && liveI.viewers != null ? liveI.viewers : sl ? sl.viewers : null;
    txt.appendChild(element('div', 'pf-now-k', ['Live now', started ? `started ${fmtClock(started)}` : '', started ? `up ${fmtDur(Date.now() - started)}` : ''].filter(Boolean).join(' · ')));
    txt.appendChild(element('div', 'pf-now-t', title || 'Live'));
    const bits = [cat, viewers != null ? `${viewers.toLocaleString()} watching` : '', sm.live && sm.live.peak ? `peak ${sm.live.peak.toLocaleString()} (seen by the app)` : ''];
    if (s && s.chat) bits.push(pfChatRules(s.chat));
    txt.appendChild(element('div', 'pf-now-s', bits.filter(Boolean).join(' · ')));
    if (sl && sl.thumb) now.appendChild(thumb);
  } else {
    const rc = sm.recap, lb = s && s.lastBroadcast;
    if (rc){
      txt.appendChild(element('div', 'pf-now-k', `Offline · last live ${pfAgo(rc.end)}`));
      txt.appendChild(element('div', 'pf-now-t', rc.title || 'Untitled stream'));
      txt.appendChild(element('div', 'pf-now-s', [rc.cat, `${fmtDay(rc.start)}, ${fmtClock(rc.start)} for ${fmtDur(rc.end - rc.start)}`, rc.peak ? `peak ${rc.peak.toLocaleString()} (seen by the app)` : ''].filter(Boolean).join(' · ')));
    } else if (lb && lb.start){
      txt.appendChild(element('div', 'pf-now-k', `Offline · last live ${pfAgo(lb.start)} (started)`));
      txt.appendChild(element('div', 'pf-now-t', lb.title || 'Untitled stream'));
      txt.appendChild(element('div', 'pf-now-s', [lb.category, `${fmtDay(lb.start)}, ${fmtClock(lb.start)}`, `from ${P}`].filter(Boolean).join(' · ')));
    } else {
      txt.appendChild(element('div', 'pf-now-k', li && li.missing ? 'Channel not found' : 'Offline'));
      txt.appendChild(element('div', 'pf-now-t', 'No streams seen yet'));
      txt.appendChild(element('div', 'pf-now-s', isSaved ? 'The app records each stream it sees while it\'s open.' : 'Save them to have the app record their streams.'));
    }
  }
  now.append(txt, btns);
  box.appendChild(now);

  /* stat tiles */
  const tiles = element('div', 'pf-stats');
  const tile = (k, v, sub, cls) => { const t = element('div', 'pf-tile'); t.append(element('span', 'k', k), element('span', 'v' + (v == null ? ' na' : ''), v == null ? 'Not enough data yet' : v), element('span', 's' + (cls ? ' ' + cls : ''), sub || '')); tiles.appendChild(t); };
  const fch = sm.followers && sm.followers.change != null ? sm.followers : null;
  tile('Followers', followers != null ? fmtN(followers) : s && s.followersText ? s.followersText.replace(/ subscribers$/, '') : null,
    fch ? `${fch.change >= 0 ? '+' : ''}${fch.change.toLocaleString()} since ${fmtDay(keyDate(fch.since))}` : followers != null ? `from ${P} · growth shows after a few days` : plat === 'youtube' ? 'from YouTube (rounded)' : `from ${P}`, fch && fch.change > 0 ? 'up' : '');
  tile('Avg viewers', st && st.avgViewers != null ? fmtN(st.avgViewers) : null, st && st.avgViewers != null ? `seen by the app · ${st.seenWithViewers} stream${st.seenWithViewers === 1 ? '' : 's'}, 30 days` : 'counted by the app while it\'s open');
  tile('Streams', st ? String(st.streams30) : null, st ? `last 30 days · ${Math.round(st.hours30)} h live` : 'last 30 days');
  tile('Avg length', st && st.avgLength != null ? fmtDur(st.avgLength) : null, st && st.longest ? `longest ${fmtDur(st.longest)} (90 days)` : '');
  const days = st ? pfTopDays(st.dayCounts) : '';
  tile('Usually starts', st && st.usual ? minClock(st.usual.minute) : null, st && st.usual ? [days, `±${st.usual.spread < 60 ? st.usual.spread + ' min' : Math.round(st.usual.spread / 60) + ' h'}`].filter(Boolean).join(' · ') : 'needs a few streams');
  tile('Live streak', st && sm.sessions ? `${st.streak.current} day${st.streak.current === 1 ? '' : 's'}` : null, st && sm.sessions ? `best ${st.streak.best} day${st.streak.best === 1 ? '' : 's'} in a row` : '');
  box.appendChild(tiles);
  const cov = sm.coverage;
  const covL = element('div', 'pf-cov');
  covL.innerHTML = '<i></i><span></span>';
  covL.querySelector('span').textContent = cov && cov.since
    ? `Tracking since ${fmtDate(cov.since)} · last 30 days: ${cov.appSeen30} stream${cov.appSeen30 === 1 ? '' : 's'} seen by the app${cov.vod30 ? `, ${cov.vod30} more from ${P}'s past broadcasts` : ''}. The app only sees streams while it's open.`
    : isSaved ? 'Tracking starts now: the app records each stream it sees while it\'s open.' : 'Not saved, so the app isn\'t recording their streams.';
  box.appendChild(covL);

  /* columns */
  const cols = element('div', 'pf-cols'), left = element('div', 'pf-main'), right = element('div', 'pf-side');
  // viewer graph
  if (sm.viewers && sm.viewers.length >= 3){
    const g = element('div', 'pf-box pf-graph');
    g.innerHTML = `<h4>${isLive ? 'Viewers this stream' : 'Viewers last stream'} <span>as the app checked, about once a minute</span></h4>`;
    g.insertAdjacentHTML('beforeend', pfGraph(sm.viewers));
    left.appendChild(g);
  }
  // heatmap
  const hb = element('div', 'pf-box');
  hb.innerHTML = `<h4>When they usually stream <span>${sm.heat ? `last ${sm.heat.weeks} week${sm.heat.weeks === 1 ? '' : 's'}, your time` : ''}</span></h4>`;
  if (sm.heat) hb.appendChild(pfHeat(sm.heat, st)); else hb.appendChild(element('div', 'pf-none', 'Not enough streams yet: this fills in as the app sees them stream (and from past broadcasts on Kick and Twitch).'));
  left.appendChild(hb);
  // history
  const hist = element('div', 'pf-box');
  const list = sm.history || [];
  hist.innerHTML = `<h4>Live history <span>${list.length ? `${sm.sessions} stream${sm.sessions === 1 ? '' : 's'} known` : ''}</span></h4>`;
  if (!list.length) hist.appendChild(element('div', 'pf-none', 'No streams known yet. The app records each stream it sees while it\'s open; Kick and Twitch past broadcasts are added when the streamer keeps them.'));
  else {
    const wrap = element('div', 'pf-hist'), tb = document.createElement('table');
    tb.innerHTML = '<thead><tr><th>Date</th><th>Time · length</th><th>Title</th><th>Category</th><th class="n" title="Highest viewer count the app saw (or the broadcast\'s views)">Peak</th></tr></thead><tbody></tbody>';
    const body = tb.querySelector('tbody');
    const rows = pf.histAll ? list : list.slice(0, 20);
    const maxLen = Math.max(...list.map(r => (r.end || Date.now()) - r.start), 1);
    rows.forEach(r => {
      const tr = document.createElement('tr'); if (!r.end) tr.className = 'live';
      const len = (r.end || Date.now()) - r.start;
      tr.innerHTML = '<td></td><td></td><td class="t"></td><td></td><td class="n"></td>';
      const c = tr.children;
      c[0].textContent = r.end ? fmtDay(r.start) : 'Live now';
      if (r.src === 'vod'){ const b = element('span', 'pf-src', 'VOD'); b.title = `From ${P}'s past broadcasts (the app wasn't open)`; c[0].appendChild(b); }
      c[1].textContent = `${r.exact ? '' : '~'}${fmtClock(r.start)} · ${fmtDur(len)}${r.end ? '' : '+'}`;
      if (!r.exact) c[1].title = 'Start time as first seen by the app';
      const bar = element('span', 'bar'), bi = element('i'); bi.style.width = Math.round(len / maxLen * 100) + '%'; bar.appendChild(bi); c[1].appendChild(bar);
      c[2].textContent = r.title || '–'; c[2].title = r.title || '';
      c[3].textContent = r.cat || '–';
      c[4].textContent = r.peak ? r.peak.toLocaleString() : r.views != null ? `${fmtN(r.views)} views` : '–';
      body.appendChild(tr);
    });
    wrap.appendChild(tb); hist.appendChild(wrap);
    if (list.length > 20){ const more = element('button', 'btn', pf.histAll ? 'Show fewer' : `Show all ${list.length}`); more.style.alignSelf = 'flex-start'; more.onclick = () => { pf.histAll = !pf.histAll; pfRenderProf(); }; hist.appendChild(more); }
  }
  left.appendChild(hist);

  // notes, tags, nickname
  const nb = element('div', 'pf-box pf-notes');
  nb.innerHTML = '<h4>Your notes <span>kept on this computer</span></h4>';
  const ta = document.createElement('textarea'); ta.dataset.k = 'notes'; ta.placeholder = `Anything to remember about ${shown}`; ta.setAttribute('aria-label', 'Your notes'); ta.value = m.notes || '';
  ta.oninput = () => pfSaveMeta(ch, { notes: ta.value });
  nb.appendChild(ta);
  const tr = element('div', 'pf-row'); tr.appendChild(element('label', '', 'Tags'));
  (m.tags || []).forEach(t => { const x = element('span', 'pf-tagx', t); const b = element('button', '', '×'); b.title = 'Remove tag'; b.setAttribute('aria-label', `Remove tag ${t}`); b.onclick = () => { pfSaveMeta(ch, { tags: (m.tags || []).filter(y => y !== t) }); pfRenderProf(); }; x.appendChild(b); tr.appendChild(x); });
  const ti = document.createElement('input'); ti.dataset.k = 'tag'; ti.placeholder = 'Add a tag, press Enter'; ti.maxLength = 24; ti.setAttribute('aria-label', 'Add a tag');
  ti.onkeydown = e => { if (e.key === 'Enter' && ti.value.trim()){ e.preventDefault(); pfSaveMeta(ch, { tags: [...(m.tags || []), ti.value.trim()] }); pfRenderProf(); const n = box.querySelector('[data-k=tag]'); if (n) n.focus(); } };
  tr.appendChild(ti); nb.appendChild(tr);
  const nr = element('div', 'pf-row'); nr.appendChild(element('label', '', 'Nickname'));
  const ni = document.createElement('input'); ni.dataset.k = 'nick'; ni.placeholder = `Shown instead of ${realName} in Profiles`; ni.maxLength = 40; ni.value = m.nick || ''; ni.setAttribute('aria-label', 'Nickname');
  // (no redraw here: a redraw when the box loses focus would swallow the click that moved the focus)
  ni.oninput = () => { pfSaveMeta(ch, { nick: ni.value }); h2.firstChild.textContent = ni.value.trim() || realName; };
  nr.appendChild(ni); nb.appendChild(nr);
  right.appendChild(nb);
  // categories
  if (sm.categories && sm.categories.length){
    const cb = element('div', 'pf-box');
    cb.innerHTML = '<h4>Top categories <span>hours streamed, 90 days</span></h4>';
    const top = sm.categories[0].hours || 1;
    sm.categories.forEach(c => { const e = element('div', 'pf-cat'); e.innerHTML = '<div><b></b><span></span></div><i><b></b></i>'; e.querySelector('div b').textContent = c.name; e.querySelector('div span').textContent = c.hours < 1 ? `${Math.round(c.hours * 60)} min` : `${Math.round(c.hours)} h`; e.querySelector('i b').style.width = Math.max(3, Math.round(c.hours / top * 100)) + '%'; cb.appendChild(e); });
    right.appendChild(cb);
  }
  // you and them
  const yb = element('div', 'pf-box'); yb.appendChild(element('h4', '', `You and ${shown}`));
  const kv = element('div', 'pf-kv');
  const row = (k, v) => { if (v == null || v === '') return; const r = element('div'); r.append(element('span', '', k), element('b', '', v)); kv.appendChild(r); };
  if (plat !== 'youtube') row(`Following on ${P}`, !s ? null : s.following === false ? 'No' : s.following && s.following.since ? `Since ${fmtDate(s.following.since)}` : s.following ? 'Yes' : s.loggedIn === false ? `Log in to ${P} to see` : null);
  if (s && s.sub) row('Subscription', [s.sub.tier ? `Tier ${s.sub.tier}` : 'Subscribed', s.sub.prime ? 'Prime' : '', s.sub.months ? `${s.sub.months} months` : ''].filter(Boolean).join(' · '));
  if (pf.mod[ch] != null) row('Moderator', pf.mod[ch] ? 'Yes' : 'No');
  row('Saved in the app', isSaved ? (sm.tracked ? `Since ${fmtDate(sm.tracked)}` : 'Yes') : 'No');
  if (isSaved) row('Live alerts', !notifyAll ? 'Off for every channel' : notifyOff.includes(ch) ? 'Off' : 'On');
  yb.appendChild(kv);
  right.appendChild(yb);
  // chat rules and sub badges
  if (s && s.badges && s.badges.length){
    const bb = element('div', 'pf-box'); bb.innerHTML = '<h4>Subscriber badges</h4>';
    const w = element('div', 'pf-badges');
    s.badges.forEach(b => { const i = new Image(); i.src = b.src; i.alt = b.months ? `${b.months} months` : 'badge'; i.title = i.alt; i.referrerPolicy = 'no-referrer'; i.onerror = () => i.remove(); w.appendChild(i); });
    bb.appendChild(w); right.appendChild(bb);
  }
  cols.append(left, right);
  box.appendChild(cols);
  scroller.scrollTop = keepY;
  if (focused){ const f = box.querySelector(`[data-k="${focused}"]`); if (f){ f.focus(); if (f.value != null) { const n = f.value.length; try { f.setSelectionRange(n, n); } catch {} } } }
}
function pfChatRules(c){
  const r = [];
  if (c.subsOnly) r.push('subscribers-only chat');
  else if (c.followersOnly) r.push(c.followMinutes ? `followers-only chat (${c.followMinutes} min)` : 'followers-only chat');
  if (c.emoteOnly) r.push('emote-only');
  if (c.slowSeconds) r.push(`${c.slowSeconds}s slow mode`);
  return r.join(', ');
}
function pfGraph(samples){
  const W = 600, H = 120, P = 4;
  const t0 = samples[0][0], t1 = samples[samples.length - 1][0] || t0 + 1;
  const vs = samples.map(x => x[1]), max = Math.max(...vs, 1), min = Math.min(...vs);
  const X = t => P + (t - t0) / Math.max(1, t1 - t0) * (W - 2 * P), Y = v => H - 16 - (v / max) * (H - 30);
  const pts = samples.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`);
  const area = `M${X(t0).toFixed(1)},${H - 16} L${pts.join(' L')} L${X(t1).toFixed(1)},${H - 16} Z`;
  const peakI = vs.indexOf(max);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Viewers from ${min.toLocaleString()} to ${max.toLocaleString()}">
    <path d="${area}" fill="var(--accent)" opacity=".14"/><polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(samples[peakI][0]).toFixed(1)}" cy="${Y(max).toFixed(1)}" r="3" fill="var(--accent)"/>
  </svg><div class="pf-heat-k"><span>${esc(fmtClock(t0))}</span><span style="margin-left:auto">peak ${max.toLocaleString()} · low ${min.toLocaleString()}</span><span style="margin-left:auto">${esc(fmtClock(t1))}</span></div>`;
}
function pfHeat(heat, st){
  const wrap = element('div');
  const g = element('div', 'pf-heat'), grid = element('div', 'pf-heat-g');
  grid.appendChild(element('span'));
  for (let h = 0; h < 24; h++) grid.appendChild(element('span', '', h % 3 ? '' : (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? h + 'a' : (h - 12) + 'p')));
  heat.cells.forEach((row, d) => {
    grid.appendChild(element('span', '', DAYS[d]));
    row.forEach((v, h) => { const i = element('i'); if (v > 0) i.style.background = `color-mix(in srgb, var(--accent) ${Math.round(25 + v * 75)}%, var(--line))`; i.title = `${DAYS[d]} ${minClock(h * 60)}: live ${Math.round(v * 100)}% of weeks`; grid.appendChild(i); });
  });
  g.appendChild(grid); wrap.appendChild(g);
  // the hours they're most often live
  const byHour = Array.from({ length: 24 }, (_, h) => heat.cells.reduce((a, r) => a + r[h], 0)), top = Math.max(...byHour);
  const hot = byHour.map(v => top > 0 && v >= top * 0.5);
  let a = hot.indexOf(true), b = a;
  if (a >= 0){ while (b + 1 < 24 && hot[b + 1]) b++; if (a === 0 && hot[23]){ let s = 23; while (s > b && hot[s - 1]) s--; a = s; } }
  const k = element('div', 'pf-heat-k');
  k.innerHTML = '<span>Less</span><i style="background:var(--line)"></i><i style="background:color-mix(in srgb, var(--accent) 45%, var(--line))"></i><i style="background:color-mix(in srgb, var(--accent) 75%, var(--line))"></i><i style="background:var(--accent)"></i><span>More</span>';
  if (a >= 0){ const days = st ? pfTopDays(st.dayCounts) : ''; k.appendChild(element('b', '', `Most often live: ${days ? days + ', ' : ''}${minClock(a * 60)} – ${minClock(((b + 1) % 24) * 60)}`)); }
  wrap.appendChild(k);
  return wrap;
}


// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  /* ---------- Streamer profiles ----------
     A directory of your saved streamers (search and filters) and a profile for each one: what the site
     says about them, plus what the app has recorded from its own live checks (src/main/profiles.js). Every
     number says where it comes from, because the app only sees streams while it's open. */
  profDlg = $('#profDlg');
  { const o = settings.json('profView', {}); if (o.sort) pf.sort = o.sort; }
  fmtDur = ms => { if (ms == null) return '–'; const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
  if (DESKTOP && ROLE === 'main' && window.kmv.profileGet){
    $('#profBtn').hidden = false;
    $('#profBtn').onclick = openProfiles;
    profDlg.querySelector('.help-x').onclick = () => { profDlg.hidden = true; };
    profDlg.querySelector('.pf-back').onclick = () => { pfShow('dir'); pfLoadList(); };
    profDlg.addEventListener('pointerdown', e => { if (e.target === profDlg) profDlg.hidden = true; });
    $('#pfQ').addEventListener('input', pfRenderDir);
    $('#pfQ').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const first = profDlg.querySelector('.pf-card');
      if (first) first.click(); else { const f = profDlg.querySelector('.pf-find'); if (f) f.click(); }
    });
    profDlg.querySelectorAll('.pf-chips').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (g.dataset.g === 'plat') pf.plat = b.dataset.v;
      else pf.flags.has(b.dataset.v) ? pf.flags.delete(b.dataset.v) : pf.flags.add(b.dataset.v);
      pfRenderDir();
    }));
    $('#pfSort').addEventListener('change', () => { pf.sort = $('#pfSort').value; settings.set('profView', { sort: pf.sort }); pfRenderDir(); });
    // a picture fetched in the background (src/main/profile-queue.js): show it in the Saved list and the Profiles cards
    let pfInfoT = null;
    fromApp('onProfileInfo', () => {
      clearTimeout(pfInfoT);
      pfInfoT = setTimeout(() => { loadSavedProfiles(); loadBarAvatars(true); if (!profDlg.hidden && !pf.cur) pfLoadList(); }, 400);
    });
    fromApp('onLiveStatus', () => { if (!profDlg.hidden){ if (pf.cur) { if (!document.activeElement || !profDlg.contains(document.activeElement) || !/^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) pfRenderProf(); } else pfRenderDir(); } });
    // the search box's (Ctrl/⌘+K): Profiles at each filter, and looking a name up (a channel's own profile is on its Tab list)
    commands.add([
      { id: 'profiles', group: 'Profiles', title: 'Streamer profiles', sub: 'Your saved streamers: when they stream, past streams, your notes', words: ['profiles'], icon: 'user', button: '#profBtn' },
      ...[['all', '', 'All'], ['kick', '', 'Kick'], ['twitch', '', 'Twitch'], ['youtube', '', 'YouTube'], ['all', 'live', 'Live now'], ['all', 'fav', 'Favourites'], ['all', 'notes', 'Has notes'], ['all', 'tagged', 'Tagged']]
        .map(([plat, flag, n]) => ({ id: `profiles.${flag || plat}`, kind: 'tab', group: 'Profiles', title: 'Profiles: ' + n, sub: 'Streamer profiles, ' + (flag || plat !== 'all' ? 'only ' + n.toLowerCase() : 'everyone'),
          words: ['favorites'], icon: 'user', run: () => openProfilesAt({ plat, flag }) }))
    ]);
    commands.provide('profiles.lookup', q => /^@?[a-z0-9_.\-]{2,40}$/i.test(q.trim()) ? [{ id: 'profiles.lookup', kind: 'profile', fallback: true, group: 'Nothing found',
      title: `Look up “${q.trim()}” in Profiles`, sub: 'On Kick, Twitch and YouTube', icon: 'user', run: () => openProfilesAt({ q: q.trim() }) }] : []);
    profDlg.querySelectorAll('.pf-chips button').forEach(b => { b.dataset.cmd = 'profiles.' + b.dataset.v; });
    window.openProfile = openProfile;   // for the tests
  }
}

export { init, openProfile, unfollowKick };
