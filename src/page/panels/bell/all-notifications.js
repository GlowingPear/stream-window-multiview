import { alerts } from '../../alerts/alerts.js';
import { revealChat } from '../../alerts/spam-alerts.js';
import { overlayIsOn } from '../../chat/chat-overlay.js';
import { $, ROLE, wins } from '../../core.js';
import { MENTION_JS } from '../../in-site/mentions.js';
import { EMPTY, TAB_NAME, bell, bellVars, drawNotes, dropNotes, mentMuted, mentNameFor, mentOn, mentWords, myName,
  myTwitch, nh, noteRow, notes, partsText, readNotes, renderBell, seeBell, subName, timeAgo } from './bell.js';
import { SmvNotes } from './notifications.js';
import { openSettings } from '../settings/settings.js';
import { chLabel, platform } from '../../platforms/platforms.js';
import { ask } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { runIn } from '../../windows/view.js';

/* All notifications: every one kept, with search and filters, grouped by day. */
// tab: one of its tabs; sub: a filter in it (Replies), q: words in its search box, pick: one chat, unread: only new ones
function openNoteHistory(tab, { sub, q, pick, unread } = {}){
  const d = $('#noteDlg'); if (!d) return;
  if (tab){ nh.tab = tab; nh.sub = sub || (bell.tab === tab ? bell.sub : 'all'); nh.pick = pick || ''; }
  if (unread !== undefined){ nh.unread = !!unread; $('#nhUnread').checked = nh.unread; }
  if (q !== undefined) $('#nhQ').value = q;
  d.hidden = false;
  renderNoteHistory();
  $('#nhQ').focus();
}
/* ---- the search box's (Ctrl/⌘+K) notifications ----
   All notifications at each tab and filter, the bell at each tab, the notifications themselves (Enter shows that
   chat; Tab: the buttons on it, each doing what that button does), and the words searched for in All notifications. */
const NH_TITLE = { all: 'All notifications', mentions: 'All mentions', spam: 'All spam alerts', live: 'All live alerts', app: 'All app messages' };
const NH_SUB = { mention: 'All @ mentions', reply: 'All replies', word: 'All words', support: 'All support alerts', live: 'All went live', raid: 'All raids', auto: 'All opened by itself' };
function noteHistoryCommands(){
  const out = [];
  for (const t of SmvNotes.TABS){
    if (t !== 'all') out.push({ id: 'notes.' + t, kind: 'tab', group: 'Notifications', title: NH_TITLE[t], sub: 'All notifications › ' + TAB_NAME[t], words: ['history', 'notifications'], icon: 'bell', run: () => openNoteHistory(t, { sub: 'all' }) });
    if (t !== 'all') for (const s of SmvNotes.SUBS[t]) if (s !== 'all')
      out.push({ id: `notes.${t}.${s}`, kind: 'tab', group: 'Notifications', title: NH_SUB[s] || `App messages: ${subName(t, s)}`, sub: `All notifications › ${TAB_NAME[t]} › ${subName(t, s)}`,
        words: ['notifications'], icon: 'bell', run: () => openNoteHistory(t, { sub: s }) });
  }
  out.push({ id: 'notes.unread', kind: 'tab', group: 'Notifications', title: 'Unread notifications only', sub: 'All notifications, only the new ones', words: ['new'], icon: 'bell', run: () => openNoteHistory('all', { sub: 'all', unread: true }) });
  return out;
}
function openBellAt(t){
  bell.tab = t; bell.sub = 'all'; bell.pick = '';
  const p = $('#bellPanel');
  if (p.hidden) $('#bellBtn').click(); else { renderBell(); seeBell(); }
}
// what a notification says, in a line
function noteTitle(n){
  const tab = SmvNotes.tabOf(n);
  if (tab === 'mentions') return `${n.sender} in ${chLabel(n.channel)}'s chat`;
  if (n.kind === 'spam') return `${n.abuse ? 'Abusive' : 'Spam'}: ${n.sender} in ${chLabel(n.channel)}'s chat`;
  if (n.kind === 'live') return `${n.label || chLabel(n.channel)} went live`;
  if (n.kind === 'raid') return `${n.label || chLabel(n.channel)} raided by ${n.from ? chLabel(n.from) : 'someone'}`;
  return n.text || 'App message';
}
// its buttons (Show chat, Not spam, Watch, Undo…), as on its row
function noteButtons(n){
  const row = noteRow(n, {});
  return [...row.querySelectorAll('.nc-acts button')].map((b, i) => ({ id: `note:${n.id}:${i}`, group: noteTitle(n), title: b.textContent.trim(), sub: b.title || '', icon: 'point', run: () => b.click() }));
}
function noteItems(q){
  const list = notes.slice(0, 60).map(n => ({ id: 'note:' + n.id, kind: 'note', group: 'Notifications', title: noteTitle(n),
    sub: [timeAgo(n.t), n.body || (Array.isArray(n.parts) ? partsText(n.parts) : '') || n.title || n.detail || ''].filter(Boolean).join(' · '), icon: { mentions: 'at', spam: 'mod', live: 'live', app: 'bell' }[SmvNotes.tabOf(n)] || 'bell',
    verb: n.channel ? 'Show chat' : 'Show', run: () => { if (n.channel && SmvNotes.tabOf(n) !== 'live') revealChat(n.channel); else openNoteHistory(SmvNotes.tabOf(n), { q: '' }); },
    more: () => noteButtons(n) }));
  if (q && DESKTOP && window.kmv.notifyEnabled) list.push({ id: 'notes.search', kind: 'note', group: 'Nothing found', title: `Search all notifications for “${q}”`, sub: 'All notifications', icon: 'search', fallback: true,
    run: () => openNoteHistory('all', { sub: 'all', q }) });
  return list;
}
// Closing it counts as having seen them all.
function closeNoteHistory(){
  const d = $('#noteDlg'); if (!d || d.hidden) return;
  d.hidden = true;
  readNotes();
}
function renderNoteHistory(){
  const d = $('#noteDlg'); if (!d || d.hidden) return;
  const q = $('#nhQ').value;
  const shown = drawNotes(d, nh, { q, onTab: renderNoteHistory });
  $('#nhUnread').checked = nh.unread;
  const u = notes.filter(n => n.unread).length;
  d.querySelector('.mh-count').textContent = notes.length ? `${notes.length} kept${u ? ` · ${u} new` : ''}` : '';
  const inTab = SmvNotes.filter(notes, { tab: nh.tab });
  $('#nhRead').disabled = !inTab.some(n => n.unread); $('#nhClear').disabled = !inTab.length;
  const list = $('#nhList'); list.innerHTML = '';
  if (!shown.length){ list.innerHTML = `<div class="sv-empty">${inTab.length ? 'Nothing matches.' : EMPTY[nh.tab]}</div>`; return; }
  SmvNotes.byDay(shown).forEach(g => {
    const h = document.createElement('div'); h.className = 'mh-day'; h.innerHTML = '<b></b><span></span>';
    h.firstChild.textContent = g.day; h.lastChild.textContent = String(g.items.length);
    const box = document.createElement('div'); box.className = 'mh-group';
    g.items.forEach(n => box.appendChild(noteRow(n, { clock: true, close: closeNoteHistory, onDelete: n => dropNotes(x => x === n) })));
    list.append(h, box);
  });
}
// The names or words changed (Settings > Mentions).
function renderMentions(){
  const note = $('#mentNote');
  if (note) note.textContent = myName || myTwitch ? '' : mentWords.length ? 'Without a username, only your words are found (and your own messages can count).' : 'Needed for mention alerts. Click Detect, or type them in.';
  renderBell();
}
function setMentWords(list){
  bellVars.mentWords = [...new Set(list.map(x => String(x || '').trim().replace(/^@/, '').replace(/\s+/g, ' ')).filter(x => x.length >= 2 && x.length <= 40))].slice(0, 30);
  settings.set('mentWords', mentWords);
  renderMentWords(); pushMyName(); renderMentions();
}
function renderMentWords(){
  const box = $('#mentWords'); if (!box) return;
  box.innerHTML = '';
  mentWords.forEach(w => {
    const c = document.createElement('span'); c.className = 'st-chip';
    c.innerHTML = `<span></span><button title="Remove">${icon.close}</button>`;
    c.firstChild.textContent = w;
    c.querySelector('button').onclick = () => setMentWords(mentWords.filter(x => x !== w));
    box.appendChild(c);
  });
}
function addMentWord(){
  const i = $('#mentWordIn'), v = i.value.trim().replace(/^@/, '');
  if (v.length < 2){ flash('Type a word or name (2 letters or more)'); return; }
  if (mentWords.some(x => x.toLowerCase() === v.toLowerCase())){ i.value = ''; return; }
  setMentWords([...mentWords, v]); i.value = '';
}
function pushMyName(){
  wins.forEach(w => { if (w.kind === 'chat' && w.ready) injectMention(w); });
}
function setMyTwitch(n){
  bellVars.myTwitch = String(n || '').trim().replace(/^@/, '');
  if (myTwitch && !/^[A-Za-z0-9_]{2,30}$/.test(myTwitch)) bellVars.myTwitch = '';
  settings.set('myTwitch', myTwitch);
  const f = $('#mentTwitch'); if (f) f.value = myTwitch;
  pushMyName(); renderMentions();
}
function injectMention(w){
  const site = platform(w.channel);
  const off = !mentOn || mentMuted.has(w.channel) || !site.mentions;
  const who = off ? '' : mentNameFor(w.channel), words = off ? [] : mentWords;
  const watch = !!alerts.spam.on && site.spamAlerts;
  const sup = alerts.support.on && site.support ? site.support : null;   // Settings > Mentions > Support (your own never counts)
  runIn(w.view, `${MENTION_JS};window.__kmvMention.setMe(${JSON.stringify(who)},${JSON.stringify(words)});window.__kmvMention.setWatch(${watch});window.__kmvMention.setFeed(${overlayIsOn()});` +
    `window.__kmvMention.setSupport(${JSON.stringify(sup)},${JSON.stringify(mentNameFor(w.channel))})`);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  {
    $('#mentWordAdd').onclick = addMentWord;
    $('#mentWordIn').addEventListener('keydown', e => { if (e.key === 'Enter') addMentWord(); });
    renderMentWords();
    const d = $('#noteDlg');
    d.querySelector('.help-x').onclick = closeNoteHistory;
    d.addEventListener('pointerdown', e => { if (e.target === d) closeNoteHistory(); });
    $('#nhQ').addEventListener('input', renderNoteHistory);
    d.querySelector('.nc-pick').addEventListener('change', e => { nh.pick = e.target.value; renderNoteHistory(); });
    $('#nhUnread').addEventListener('change', e => { nh.unread = e.target.checked; renderNoteHistory(); });
    $('#nhRead').onclick = () => readNotes(n => nh.tab === 'all' || SmvNotes.tabOf(n) === nh.tab);
    $('#nhClear').onclick = async () => {
      const list = SmvNotes.filter(notes, { tab: nh.tab });
      if (!await ask(nh.tab === 'all' ? 'Clear every notification?' : `Clear every ${TAB_NAME[nh.tab].toLowerCase()} notification?`,
        `All ${list.length} kept here are deleted. The chats themselves aren't changed.`, { ok: 'Clear all', danger: true })) return;
      const gone = new Set(list); dropNotes(n => gone.has(n));
    };
    const p = $('#bellPanel');
    p.querySelector('.nc-pick').addEventListener('change', e => { bell.pick = e.target.value; renderBell(); seeBell(); });
    $('#bellRead').onclick = () => readNotes(n => bell.tab === 'all' || SmvNotes.tabOf(n) === bell.tab);
    $('#bellClear').onclick = () => { const gone = new Set(SmvNotes.filter(notes, { tab: bell.tab })); dropNotes(n => gone.has(n)); };
    $('#bellAll').onclick = () => { p.hidden = true; openNoteHistory(bell.tab); };
    $('#bellSettings').onclick = () => { p.hidden = true; openSettings('notify'); };
  }
  if (DESKTOP && ROLE === 'main' && window.kmv.notifyEnabled){
    commands.add(noteHistoryCommands());
    [['#nhRead', 'bell.read'], ['#nhClear', 'bell.clear']].forEach(([sel, id]) => { $(sel).dataset.cmd = id; });
  }
  // the bell (the main window's): the search box's, and what its buttons are (for the test that every button has one)
  if (ROLE === 'main'){
    commands.add([
      { id: 'bell.open', group: 'Notifications', title: 'Notifications', sub: 'The bell: mentions, spam alerts, channels going live and the app\'s messages', words: ['bell'], icon: 'bell', button: '#bellBtn' },
      ...SmvNotes.TABS.map(t => ({ id: 'bell.' + t, kind: 'tab', group: 'Notifications', title: 'Bell: ' + TAB_NAME[t], sub: 'The bell, on its ' + TAB_NAME[t] + ' tab', words: ['notifications'], icon: 'bell', run: () => openBellAt(t) })),
      { id: 'bell.read', group: 'Notifications', title: 'Mark all notifications read', icon: 'check', disabled: () => !notes.some(n => n.unread) && 'Nothing new', run: () => readNotes() },
      { id: 'bell.clear', group: 'Notifications', title: 'Clear the bell\'s tab', sub: () => 'The notifications in its ' + TAB_NAME[bell.tab] + ' tab', icon: 'bin', button: '#bellClear', when: () => SmvNotes.filter(notes, { tab: bell.tab }).length > 0 },
      { id: 'bell.settings', group: 'Notifications', title: 'Notification settings', sub: 'Settings › Notifications', icon: 'gear', button: '#bellSettings', when: () => true },
      { id: 'notes.all', kind: 'tab', group: 'Notifications', title: 'All notifications', sub: 'Every notification kept, with search and filters', words: ['history'], icon: 'bell', button: '#bellAll', when: () => DESKTOP && !!window.kmv.notifyEnabled }
    ]);
    $('#bellRead').dataset.cmd = 'bell.read';
    commands.provide('notes', noteItems);
  }
  window.openNoteHistory = openNoteHistory;   // for the tests
}

export { closeNoteHistory, init, injectMention, pushMyName, renderMentions, renderNoteHistory, setMyTwitch };
