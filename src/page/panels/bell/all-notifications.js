import './bell.js';   // runs after it (see app.js)
import { SmvNotes } from './notifications.js';
import { settings } from '../../shared/settings.js';
import { runIn } from '../../windows/view.js';
import { $, wins } from '../../core.js';
import { icon } from '../../shared/icons.js';
import { MENTION_JS } from '../../in-site/mentions.js';
import { platform } from '../../platforms/platforms.js';
import { EMPTY, TAB_NAME, bell, bellVars, drawNotes, dropNotes, mentMuted, mentNameFor, mentOn, mentWords, myName,
  myTwitch, nh, noteRow, notes, readNotes, renderBell, seeBell } from './bell.js';
import { alerts } from '../../alerts/alerts.js';
import { flash } from '../../shared/flash.js';
import { openSettings } from '../settings/settings.js';
import { ask } from '../../shared/ask.js';

/* All notifications: every one kept, with search and filters, grouped by day. */
function openNoteHistory(tab){
  const d = $('#noteDlg'); if (!d) return;
  if (tab){ nh.tab = tab; nh.sub = bell.tab === tab ? bell.sub : 'all'; nh.pick = ''; }
  d.hidden = false;
  renderNoteHistory();
  $('#nhQ').focus();
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
// The names or words changed (Settings > Mentions).
function renderMentions(){
  const note = $('#mentNote');
  if (note) note.textContent = myName || myTwitch ? '' : mentWords.length ? 'Without a username, only your words are found (and your own messages can count).' : 'Needed for mention alerts. Click Detect, or type them in.';
  renderBell();
}
window.openNoteHistory = openNoteHistory;   // for the tests
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
  runIn(w.view, `${MENTION_JS};window.__kmvMention.setMe(${JSON.stringify(who)},${JSON.stringify(words)});window.__kmvMention.setWatch(${watch})`);
}

export { closeNoteHistory, injectMention, pushMyName, renderMentions, renderNoteHistory, setMyTwitch };
