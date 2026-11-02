import { alerts, playSound, wantNotify } from '../../alerts/alerts.js';
import { flaggedAct, flaggedWaiting } from '../../alerts/flagged.js';
import { revealChat, spamOpts } from '../../alerts/spam-alerts.js';
import { SmvSpam } from '../../alerts/spam.js';
import { allOn, seeFlagged } from '../../chat/all-chat.js';
import { $, ROLE, wins } from '../../core.js';
import { addParsed } from '../../layout/placement.js';
import { injectMention, pushMyName, renderMentions, renderNoteHistory } from './all-notifications.js';
import { SmvNotes } from './notifications.js';
import { infoFor } from '../channels/channels.js';
import { showHelp } from '../help/help.js';
import { ignoreSender, renderSpamHist } from '../settings/alerts.js';
import { nameOf } from '../../platforms/linked.js';
import { PLAT_NAME, chLabel, chLabelP, platOf } from '../../platforms/platforms.js';
import { element, esc } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { openStreamer, tabChannels } from '../../windows/frames.js';

/* ---------- the notification centre: the toolbar bell ----------
   Chat mentions, likely spam, saved channels going live, raids and the app's own messages, in one list
   (notifications.js) kept in localStorage. Only the main window keeps it. */
const NOTE_SHOWN = 30;    // the latest in each tab of the bell (the rest in All notifications)
const NOTES_KEY = 'notifications';   // (a saved setting: shared/settings.js)
let myName = '', myTwitch = '', mentOn = true, mentMuted = new Set(), mentWords = [];
let notes = settings.json(NOTES_KEY);
function saveNotes(){ settings.set(NOTES_KEY, notes); }
// What each one can still do this session: Undo (a closed channel), Show in folder (a saved emote).
const noteActs = new Map();
// Settings > Notifications: the red number, and Do not disturb (until when; -1: until it's turned off).
let bellCount = 'ms', dndUntil = 0, dndT = 0;
// Other files change these through bellVars: a variable imported from another file can't be assigned to.
const bellVars = {
  get mentWords(){ return mentWords; }, set mentWords(v){ mentWords = v; },
  get myTwitch(){ return myTwitch; }, set myTwitch(v){ myTwitch = v; },
  get mentOn(){ return mentOn; }, set mentOn(v){ mentOn = v; },
  get dndUntil(){ return dndUntil; }, set dndUntil(v){ dndUntil = v; },
  get dndT(){ return dndT; }, set dndT(v){ dndT = v; },
  get bellCount(){ return bellCount; }, set bellCount(v){ bellCount = v; },
};
const dndOn = () => dndUntil < 0 || dndUntil > Date.now();
// The kind of alert settings a notification uses.
const alertKind = n => n.kind === 'support' ? 'support' : SmvNotes.tabOf(n) === 'mentions' ? 'mention' : n.kind;
// Keeps a notification (the main window only) and shows its pop-up, plays its sound and sends its desktop
// notification, as Settings > Notifications says. Mentions and spam make their own sound and desktop
// notification (with the chat window's alert); went live's desktop notification comes from the app itself.
function addNote(n, text, desk = text){
  const kind = alertKind(n), a = alerts[kind] || {}, quiet = dndOn();
  if (text && a.popup !== false && !quiet) flash(text, true);
  if (ROLE !== 'main') return null;
  if (!quiet && (kind === 'live' || kind === 'raid' || kind === 'app')) playSound(kind);
  if (desk && (kind === 'raid' || kind === 'app') && wantNotify(kind) && DESKTOP && window.kmv.notifyMessage) window.kmv.notifyMessage(desk);
  notes = SmvNotes.add(notes, n); saveNotes(); store.changed('notes');
  return notes[0];
}
// Some notes changed (a Flagged hold handled): fn(note) for each that test(note) picks
function updateNotes(test, fn){
  const hit = notes.filter(test); if (!hit.length) return;
  hit.forEach(fn); saveNotes(); store.changed('notes');
}
function dropNotes(test){
  const before = notes.length;
  notes = notes.filter(n => !test(n));
  if (notes.length !== before){ saveNotes(); store.changed('notes'); }
}
// Seen: one chat's mentions and spam (clicking into that chat), a given list, or all of them.
function readNotes(test){
  let n = 0;
  notes.forEach(x => { if (x.unread && (!test || test(x))){ x.unread = false; n++; } });
  if (n){ saveNotes(); store.changed('notes'); }
}
const readChat = ch => readNotes(n => n.channel === ch && (SmvNotes.tabOf(n) === 'mentions' || n.kind === 'spam' || n.kind === 'flagged'));
// Mentions for one chat can be turned off with the @ button on its bar.
const mentNameFor = ch => { const p = platOf(ch); return p === 'kick' ? myName : p === 'twitch' ? myTwitch : ''; };   // YouTube chat isn't covered
const mentCovered = ch => /^(kick|twitch)$/.test(platOf(ch)) && !!(mentNameFor(ch) || mentWords.length);
const mentAny = () => !!(myName || myTwitch || mentWords.length);
// The chats a window's @ button is for: its chat, or with its ALL tab showing every chat of theirs ALL reads
const atChannels = w => (w && allOn(w) ? tabChannels(w).filter(mentCovered) : w ? [w.channel] : []);
// One chat's mentions on or off, or several (a window's ALL): all off unless they all were, then all on
function toggleChatMentions(chs){
  chs = [].concat(chs).filter(Boolean); if (!chs.length) return;
  const off = !chs.every(c => mentMuted.has(c));
  chs.forEach(c => { if (off) mentMuted.add(c); else mentMuted.delete(c); });
  settings.set('mentMuted', [...mentMuted]);
  wins.forEach(x => { if (x.kind === 'chat' && (chs.includes(x.channel) || atChannels(x).some(c => chs.includes(c)))){ syncAtBtn(x); if (x.ready && chs.includes(x.channel)) injectMention(x); } });
  const who = chs.length > 1 ? `${nameOf(chs[0])}'s chats` : `${chLabel(chs[0])}'s chat`;
  flash(off ? `Mentions off for ${who}` : `Mentions on for ${who}`);
}
function syncAtBtn(w){
  const b = w.el && w.el.querySelector('[data-a=at]'); if (!b) return;
  const chs = atChannels(w), all = chs.length > 1, muted = !!chs.length && chs.every(c => mentMuted.has(c));
  b.hidden = !(mentOn && chs.some(mentCovered));
  b.innerHTML = muted ? icon.atOff : icon.at;
  b.classList.toggle('off', muted);
  b.title = all ? (muted ? 'Mentions are off for their chats in ALL. Click to turn them on' : 'Mentions are on for their chats in ALL. Click to turn them off')
    : muted ? 'Mentions are off for this chat. Click to turn them on' : 'Mentions are on for this chat. Click to turn them off';
}
function updateBellBtn(){
  wins.forEach(syncAtBtn);
  const b = $('#bellBtn'); if (!b) return;
  const n = SmvNotes.badge(notes, bellCount), quiet = dndOn();
  b.querySelector('.mb-ico').innerHTML = quiet ? icon.bellOff : icon.bell;
  const c = b.querySelector('.mb-count');
  c.hidden = !n; c.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('off', quiet);
  b.title = quiet ? `Notifications (Do not disturb is on${dndUntil > 0 ? ' until ' + new Date(dndUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''})`
    : 'Notifications: mentions, spam alerts, channels going live and the app\'s messages';
}
function timeAgo(t){ const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }
const MENT_KIND = { mention: 'Mention', reply: 'Reply', word: 'Word', support: 'Support' };
// Emotes in a mention: [{ t: text } | { e: name, src }], from the chat helper (and saved), so checked here.
const EMOTE_SRC = /^https:\/\/(files\.kick\.com\/emotes\/|static-cdn\.jtvnw\.net\/|([\w-]+\.)?7tv\.app\/|cdn\.betterttv\.net\/|cdn\.frankerfacez\.com\/)/;
function cleanParts(p){
  if (!Array.isArray(p) || !p.length || p.length > 80) return null;
  const out = [];
  for (const x of p){
    if (x && typeof x.t === 'string') out.push({ t: x.t.slice(0, 500) });
    else if (x && typeof x.e === 'string' && x.e && typeof x.src === 'string' && EMOTE_SRC.test(x.src) && x.src.length <= 300) out.push({ e: x.e.slice(0, 60), src: x.src });
    else return null;
  }
  const n = out.filter(x => x.e).length;
  return n && n <= 20 ? out : null;
}
// The text with each emote's name in its place (search, notifications, older views)
const partsText = parts => parts.map(x => x.e != null ? x.e : x.t).join('').replace(/\s+/g, ' ').trim();
// The message as elements: text (what made it a mention marked) and emotes at text height.
function mentBodyNodes(m, parts, mark){
  const frag = document.createDocumentFragment();
  const term = !mark ? '' : m.kind === 'word' ? m.word : m.kind === 'mention' ? '@' + (mentNameFor(m.channel) || '') : '';
  const re = term && term !== '@' ? new RegExp('(^|[^\\p{L}\\p{N}_])(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\p{L}\\p{N}_])', 'giu') : null;
  for (const x of parts){
    if (x.e != null){
      const im = document.createElement('img');
      im.className = 'mp-emote'; im.alt = x.e; im.title = x.e; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
      im.onerror = () => im.replaceWith(document.createTextNode(`:${x.e}:`));
      if (EMOTE_SRC.test(x.src)) im.src = x.src; else { frag.append(`:${x.e}:`); continue; }
      frag.append(im); continue;
    }
    if (!re){ frag.append(x.t); continue; }
    let last = 0;
    for (const hit of x.t.matchAll(re)){
      const at = hit.index + hit[1].length;
      frag.append(x.t.slice(last, at));
      const mk = document.createElement('mark'); mk.textContent = hit[2]; frag.append(mk);
      last = at + hit[2].length;
    }
    frag.append(x.t.slice(last));
  }
  return frag;
}
// The message with what made it a mention marked: @you, or the word.
function mentBodyHtml(m){
  const term = m.kind === 'word' ? m.word : m.kind === 'mention' ? '@' + (mentNameFor(m.channel) || '') : '';
  const body = String(m.body || '');
  if (!term || term === '@') return esc(body);
  const re = new RegExp('(^|[^\\p{L}\\p{N}_])(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\p{L}\\p{N}_])', 'giu');
  let out = '', last = 0;
  for (const x of body.matchAll(re)){
    const at = x.index + x[1].length;
    out += esc(body.slice(last, at)) + '<mark>' + esc(x[2]) + '</mark>';
    last = at + x[2].length;
  }
  return out + esc(body.slice(last));
}
/* One row of the bell or All notifications. o: { clock (the time, not "x min ago"), onDelete, close (what's
   open: the bell or the history) } */
const andList = l => l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
const NOTE_ICO = { mention: 'at', reply: 'reply', support: 'gift', spam: 'mod', flagged: 'mod', live: 'live', raid: 'raid', accounts: 'user', layouts: 'tile', windows: 'popwin', downloads: 'download', updates: 'update' };
function noteRow(n, o = {}){
  const kind = n.kind || 'mention', tab = SmvNotes.tabOf(n);
  const ico = NOTE_ICO[kind === 'app' ? n.subject : kind];
  const top = element('b'), k = element('span', 'mp-kind'), where = element('span'), q = element('div', { class: 'mp-q', hidden: true }), body = element('div', 'mp-body');
  const tm = element('span', { class: 'mp-time', title: new Date(n.t).toLocaleString() },
    o.clock ? new Date(n.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : timeAgo(n.t));
  const row = element('div', { class: `mp-row nc-row k-${kind} plat-${platOf(n.channel || '')}` + (n.unread ? ' unread' : ''), dataset: { id: n.id || '' } },
    element('span', { class: 'nc-ico', html: ico && icon[ico] ? icon[ico] : '<span class="nc-t">T</span>' }),
    element('div', 'mp-top', top, k, tm),
    element('div', 'mp-where', element('span', 'dot'), where),
    q, body);
  const acts = element('div', 'nc-acts');
  const act = (label, fn, cls = '') => {
    const b = element('button', { class: 'btn ' + cls, onclick: e => { e.stopPropagation(); fn(b); } }, label);
    acts.appendChild(b); return b;
  };
  const close = () => { if (o.close) o.close(); };
  if (tab === 'mentions'){
    top.textContent = n.sender;
    k.textContent = kind === 'word' ? `Word: ${n.word}` : MENT_KIND[kind] || 'Mention';
    k.classList.add(kind);
    where.textContent = chLabelP(n.channel);
    const qp = cleanParts(n.qparts), bp = cleanParts(n.parts);
    q.hidden = !n.quoted;
    if (qp) q.append(mentBodyNodes(n, qp, false)); else q.textContent = n.quoted || '';
    if (bp) body.append(mentBodyNodes(n, bp, true)); else body.innerHTML = mentBodyHtml(n);
    row.title = 'Show this chat';
    row.onclick = () => { close(); revealChat(n.channel); };
  } else if (kind === 'spam'){
    top.textContent = n.sender;
    k.textContent = `${n.abuse ? 'Abusive · ' : ''}${n.score} / ${n.need}`; k.classList.add('spam');
    k.title = `${n.score} points; ${n.need} needed to be marked`;
    where.textContent = chLabelP(n.channel);
    body.textContent = n.body || '';
    act('Show chat', () => { close(); revealChat(n.channel); });
    act(n.abuse ? 'Not abuse' : 'Not spam', () => dropNotes(x => x === n)).title = 'Take it off this list';
    if (SmvSpam.ignored(n.sender, spamOpts(n.channel).ignore)) acts.insertAdjacentHTML('beforeend', '<span class="nc-note">On the chat bot list</span>');
    else act('Add to bots', () => { ignoreSender(n.sender); renderBell(); }, 'danger').title = `Add ${n.sender} to the chat bot list, so its messages are never flagged`;
    const why = element('div', { class: 'nc-why', hidden: true }, spamWhy(n));
    act('Why?', () => { why.hidden = !why.hidden; }, 'linkish');
    row.append(acts, why);
    row.title = 'Show this chat';
    row.onclick = () => { close(); revealChat(n.channel); };
  } else if (kind === 'flagged'){
    // (Settings › Flagged: a held message, while it waits Allow and Deny; a suspicious user's message)
    top.textContent = n.sender;
    k.textContent = n.what === 'held' ? (n.site === 'youtube' ? 'Held for review' : 'Held by AutoMod') + (n.why ? ` · ${n.why}` : '') : n.why || 'Flagged';
    k.classList.add('flagged');
    where.textContent = chLabelP(n.channel);
    body.textContent = n.body || '';
    if (flaggedWaiting(n)){
      act('✓ Allow', b => { b.disabled = true; flaggedAct(n, true); }, 'primary').title = `Let it through, with ${PLAT_NAME[n.site]}'s own button`;
      act('✕ Deny', b => { b.disabled = true; flaggedAct(n, false); }, 'danger').title = `Don't let it through, with ${PLAT_NAME[n.site]}'s own button`;
    } else if (n.what === 'held'){
      const done = { allowed: 'Allowed', denied: n.site === 'youtube' ? 'Hidden' : 'Denied', expired: 'Expired · not posted' }[n.done];
      acts.append(element('span', 'nc-note', done ? done + (n.by && n.done !== 'expired' ? ` by ${n.by}` : '') : 'Handled'));
    }
    act('Show me', () => { close(); seeFlagged(n.channel, n.site, n.hid); });
    row.appendChild(acts);
    row.title = 'Show this chat';
    row.onclick = () => { close(); seeFlagged(n.channel, n.site, n.hid); };
  } else if (kind === 'live' || kind === 'raid'){
    const sites = kind === 'live' && Array.isArray(n.sites) && n.sites.length > 1 ? n.sites : null;   // a linked streamer, live on several
    if (kind === 'live'){ top.textContent = n.label || chLabel(n.channel); k.textContent = sites ? 'is live on ' + andList(sites.map(c => PLAT_NAME[platOf(c)])) : 'went live'; }
    else { top.textContent = n.label || chLabel(n.channel); k.textContent = `raided by ${n.from ? chLabel(n.from) : 'someone'}`; }
    k.classList.add('plain');
    where.textContent = sites ? '' : PLAT_NAME[platOf(n.channel)] || '';
    if (sites) where.append(...sites.map((c, i) => element('span', 'nc-site', element('i', { class: 'pi pi-' + platOf(c) }, PLAT_NAME[platOf(c)][0]),
      ` ${PLAT_NAME[platOf(c)]}` + (n.viewersBy && n.viewersBy[c] != null ? ` · ${Number(n.viewersBy[c]).toLocaleString()}` : '') + (i && n.at && n.at[c] && n.at[sites[0]] ? ` · ${Math.max(1, Math.round((n.at[c] - n.at[sites[0]]) / 60000))} min later` : ''))));
    if (n.auto) where.insertAdjacentHTML('afterend', '<span class="nc-auto">opened by itself</span>');
    const together = sites && n.viewersBy ? sites.reduce((t, c) => t + (+n.viewersBy[c] || 0), 0) : null;
    body.textContent = [n.title, n.category, together ? `${together.toLocaleString()} watching together` : n.viewers != null ? `${Number(n.viewers).toLocaleString()} watching` : ''].filter(Boolean).join(' · ');
    const chs = sites || [n.channel];
    const open = wins.some(w => (w.kind === 'stream' || w.kind === 'chat') && chs.includes(w.channel)), info = infoFor(n.channel);
    if (open) acts.insertAdjacentHTML('beforeend', '<span class="nc-note">Already open</span>');
    else if (!sites && info && info.live === false) acts.insertAdjacentHTML('beforeend', '<span class="nc-note">Offline</span>');
    else if (sites) act('Watch as tabs', () => { close(); openStreamer(n.channel, 'both', sites.filter(c => infoFor(c)?.live)); }, 'primary');
    else {
      act('Watch', () => { close(); addParsed({ channel: n.channel, only: null }); }, 'primary');
      act('Chat only', () => { close(); addParsed({ channel: n.channel, only: 'chat' }); });
    }
    row.appendChild(acts);
  } else {
    top.textContent = n.text || '';
    row.querySelector('.mp-where').remove();
    body.textContent = n.detail || '';
    const a = n.act || {}, live = noteActs.get(n.id);
    if (a.t === 'login' && DESKTOP && window.kmv.openLogin) act('Log in', () => { close(); window.kmv.openLogin(a.p); }, 'primary');
    if (a.t === 'undo' && live && live.ok()) act('Undo', b => { live.run(); noteActs.delete(n.id); b.remove(); }, 'accent');
    if (a.t === 'folder' && live) act('Show in folder', () => live.run());
    if (a.t === 'news') act('What\'s new', () => { close(); showHelp('news'); });
    if (acts.children.length) row.appendChild(acts);
  }
  if (o.onDelete){
    const x = document.createElement('button'); x.className = 'mp-x'; x.innerHTML = icon.close; x.title = 'Delete this one';
    x.onclick = e => { e.stopPropagation(); o.onDelete(n); };
    row.appendChild(x);
  }
  return row;
}
// The same text as the "LIKELY SPAM" (or "ABUSIVE") tag in the chat.
const spamWhy = r => `${r.abuse ? 'Abusive' : 'Likely spam'} (${r.score} points, ${r.need} needed):\n` + (r.signs || []).map(s => `• ${s.text} (+${s.points})`).join('\n');
function setMyName(n){
  myName = String(n || '').trim().replace(/^@/, '');
  if (myName && !/^[A-Za-z0-9_]{2,30}$/.test(myName)) myName = '';
  settings.set('myName', myName);
  $('#mentUser').value = myName;
  pushMyName(); renderMentions();
}

/* The bell and All notifications share how they draw: tabs, the sub-filter chips, the chat (or site) picker
   and the list. v: their filters ({ tab, sub, pick, unread }). */
const bell = { tab: 'all', sub: 'all', pick: '' }, nh = { tab: 'all', sub: 'all', pick: '', unread: false };
const TAB_NAME = { all: 'All', mentions: 'Mentions', spam: 'Mod', live: 'Live', app: 'App' };
const subName = (tab, s) => tab === 'live' && s === 'live' ? 'Went live' : ({ all: 'All', mentions: 'Mentions', spam: tab === 'all' ? 'Mod' : 'Spam', flagged: 'Flagged', live: 'Live', app: 'App',
  mention: '@ Mentions', reply: 'Replies', word: 'Words', support: 'Support', raid: 'Raids', auto: 'Opened by itself',
  accounts: 'Accounts', layouts: 'Layouts', windows: 'Windows', downloads: 'Downloads', updates: 'Updates' })[s];
const pickBy = tab => tab === 'live' ? 'site' : tab === 'app' ? '' : 'chan';
function noteFilter(v, q){
  const by = pickBy(v.tab);
  return { tab: v.tab, sub: v.sub, unread: !!v.unread, q, label: chLabelP, ...(by && v.pick ? { [by]: v.pick } : {}) };
}
function drawNotes(root, v, { limit, q = '', onTab } = {}){
  const tabs = root.querySelector('.nc-tabs');
  tabs.innerHTML = '';
  SmvNotes.TABS.forEach(t => {
    const n = t === 'app' ? 0 : SmvNotes.filter(notes, { tab: t, unread: true }).filter(x => SmvNotes.tabOf(x) !== 'app').length;
    const b = document.createElement('button'); b.dataset.tab = t; b.setAttribute('role', 'tab');
    b.className = t === v.tab ? 'on' : ''; b.setAttribute('aria-selected', String(t === v.tab));
    b.innerHTML = `<span></span>${n ? `<i>${n}</i>` : ''}`; b.firstChild.textContent = TAB_NAME[t];
    b.onclick = () => { if (v.tab === t) return; v.tab = t; v.sub = 'all'; v.pick = ''; if (onTab) onTab(); };
    b.dataset.cmd = (v === bell ? 'bell.' : 'notes.') + t;   // (the search box's)
    tabs.appendChild(b);
  });
  // the picker: chats (sites in Live), not in App
  const by = pickBy(v.tab), sel = root.querySelector('.nc-pick'), inTab = SmvNotes.filter(notes, { tab: v.tab });
  sel.hidden = !by;
  if (by === 'chan'){
    const per = SmvNotes.chats(inTab);
    if (v.pick && !per.some(([c]) => c === v.pick)) v.pick = '';
    sel.innerHTML = '<option value="">All chats</option>' + per.map(([ch, n]) => `<option value="${esc(ch)}">${esc(chLabelP(ch))} (${n})</option>`).join('');
    sel.setAttribute('aria-label', 'Which chat');
  } else if (by === 'site'){
    sel.innerHTML = '<option value="">All sites</option>' + Object.keys(PLAT_NAME).map(p => `<option value="${p}">${PLAT_NAME[p]}</option>`).join('');
    sel.setAttribute('aria-label', 'Which site');
  }
  sel.value = v.pick;
  // the chips (Spam has none: a summary instead). App's only show how many are new.
  const f = noteFilter(v, q), chips = root.querySelector('.nc-chips'), sum = root.querySelector('.nc-sum');
  const subs = SmvNotes.SUBS[v.tab], counts = SmvNotes.subCounts(notes, { ...f, sub: 'all' });
  const fresh = v.tab === 'app' ? SmvNotes.subCounts(notes, { ...f, sub: 'all', unread: true }) : null;
  chips.innerHTML = ''; chips.hidden = subs.length < 2; chips.classList.toggle('small', v.tab === 'app');
  if (!subs.includes(v.sub)) v.sub = 'all';
  subs.length > 1 && subs.forEach(s => {
    const n = fresh ? fresh[s] : counts[s];
    const b = document.createElement('button'); b.dataset.v = s; b.className = s === v.sub ? 'on' : '';
    b.textContent = subName(v.tab, s) + (n ? ' ' + n : '');
    b.onclick = () => { v.sub = s; if (onTab) onTab(); };
    b.dataset.cmd = s === 'all' ? 'notes.' + v.tab : `notes.${v.tab}.${s}`;
    chips.appendChild(b);
  });
  sum.hidden = v.tab !== 'spam';
  if (v.tab === 'spam'){
    const sp = SmvNotes.filter(notes, { ...f, sub: 'all', unread: false, q: '' }), now = Date.now();
    const nw = sp.filter(x => x.unread).length, day = sp.filter(x => now - x.t < 864e5).length;
    sum.textContent = sp.length ? [nw ? `${nw} new` : '', `${day} in the last day`].filter(Boolean).join(' · ') : '';
  }
  return SmvNotes.filter(notes, f).slice(0, limit || Infinity);
}
const EMPTY = {
  all: 'Nothing yet. Mentions, spam alerts, channels going live and the app\'s messages show here.',
  mentions: 'No mentions yet. When someone @mentions you, replies to you or writes one of your words in an open Kick or Twitch chat, it shows here.',
  spam: 'Nothing flagged. Spam alerts watch the chats you moderate (Settings › Spam alerts).',
  live: 'Nobody has gone live yet. Saved channels show here when they go live, and raids the app followed.',
  app: 'No messages from the app.'
};
function renderBell(){
  updateBellBtn();
  renderNoteHistory();
  renderSpamHist();
  const p = $('#bellPanel'); if (!p || p.hidden) return;
  const shown = drawNotes(p, bell, { limit: NOTE_SHOWN, onTab: () => { renderBell(); seeBell(); } });
  const st = $('#mentState');
  st.textContent = !DESKTOP || !['all', 'mentions'].includes(bell.tab) ? '' : !mentAny() ? 'Set your usernames to get mention alerts.' : mentOn ? '' : 'Mention alerts are off.';
  const inTab = SmvNotes.filter(notes, { tab: bell.tab }), unread = inTab.some(n => n.unread);
  $('#bellRead').hidden = !unread; $('#bellClear').hidden = unread || !inTab.length;
  const all = $('#bellAll'); all.textContent = `All notifications (${notes.length}) ›`;
  const list = $('#bellList'); list.innerHTML = '';
  if (!shown.length){ list.innerHTML = `<div class="sv-empty">${inTab.length ? 'Nothing matches.' : EMPTY[bell.tab]}</div>`; return; }
  shown.forEach(n => list.appendChild(noteRow(n, { close: () => { p.hidden = true; } })));
}
// The bell's open tab is seen: its rows keep their "new" mark until it's opened again.
function seeBell(){
  const shown = new Set(SmvNotes.filter(notes, noteFilter(bell, '')).slice(0, NOTE_SHOWN));
  let n = 0; shown.forEach(x => { if (x.unread){ x.unread = false; n++; } });
  if (n){ saveNotes(); updateBellBtn(); renderNoteHistory(); }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.chatMentions = { atChannels, toggleChatMentions };   // for the tests (the @ button is the desktop app's)
  myName = settings.text('myName');
  myTwitch = settings.text('myTwitch');
  mentOn = settings.flag('mentOn', true);
  mentMuted = new Set([].concat(settings.json('mentMuted', [])));
  mentWords = [].concat(settings.json('mentWords', [])).filter(x => typeof x === 'string');
  if (Array.isArray(notes)) notes = notes.filter(n => n && typeof n === 'object');
  else {
    // The first start with the bell: the mentions history and spam alerts' history move in. The old ones are
    // left as they were, so an older version still has them.
    notes = SmvNotes.migrate(settings.json('mentions'), settings.json('spamHistory'));
    if (ROLE === 'main') saveNotes();
  }
  bellCount = settings.text('bellCount', 'ms'); dndUntil = settings.num('dnd');
  // The bell's button, its panel and All notifications show the notifications.
  store.watch('notes', () => renderBell());
}

export { addNote, atChannels, bell, bellCount, bellVars, cleanParts, dndOn, dndT, dndUntil, drawNotes, dropNotes,
  EMPTY, init, mentAny, mentBodyNodes, mentCovered, mentMuted, mentNameFor, mentOn, mentWords, myName, myTwitch, nh,
  noteActs, noteRow, notes, partsText, readChat, readNotes, renderBell, saveNotes, seeBell, setMyName, spamWhy,
  subName, syncAtBtn, TAB_NAME, timeAgo, toggleChatMentions, updateBellBtn, updateNotes };
