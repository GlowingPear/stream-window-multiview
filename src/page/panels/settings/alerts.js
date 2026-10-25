import { SOUND_KEY, alerts, playSound, saveAlerts } from '../../alerts/alerts.js';
import { revealChat, spamOpts } from '../../alerts/spam-alerts.js';
import { SmvSpam } from '../../alerts/spam.js';
import { $, ROLE, wins } from '../../core.js';
import { pushMyName } from '../bell/all-notifications.js';
import { dropNotes, mentOn, notes, timeAgo } from '../bell/bell.js';
import { syncLiveAlerts } from './notifications.js';
import { closeSettings, openSettings, settingsDlg } from './settings.js';
import { chLabelP } from '../../platforms/platforms.js';
import { ask } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { element, esc } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';

/* Mentions and spam alert options: every control with data-al="kind.option" */
function syncAlertControls(){
  settingsDlg.querySelectorAll('[data-al]').forEach(c => {
    const [kind, k] = c.dataset.al.split('.'), v = alerts[kind][k];
    if (c.classList.contains('seg')) c.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-checked', String(b.dataset.v === v)); });
    else if (c.type === 'checkbox') c.checked = !!v; else c.value = String(v);
  });
  ['mention', 'spam', 'support'].forEach(kind => {
    settingsDlg.querySelectorAll(`[data-dep="${kind}.until"]`).forEach(r => r.classList.toggle('st-dim', alerts[kind].hl !== 'until'));
  });
  settingsDlg.querySelectorAll('.st-opts[data-for=mention]').forEach(el => el.classList.toggle('st-dim', !mentOn));
  settingsDlg.querySelectorAll('.st-opts[data-for=spam]').forEach(el => el.classList.toggle('st-dim', !alerts.spam.on));
  settingsDlg.querySelectorAll('.st-opts[data-for=support]').forEach(el => el.classList.toggle('st-dim', !alerts.support.on));
  $('#spamOn').checked = !!alerts.spam.on;
  if ($('#mentOn')) $('#mentOn').checked = mentOn;
  const pill = settingsDlg.querySelector('.st-rail [data-s=spam] .st-pill');
  if (pill) pill.textContent = alerts.spam.on ? 'On' : 'Mod';
  syncScoring();
}
function pickSound(kind){
  return new Promise(resolve => {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'audio/*';
    f.onchange = () => {
      const file = f.files && f.files[0];
      if (!file) return resolve(false);
      if (file.size > 1.5e6){ flash('That sound file is too big. Pick one under 1.5 MB.'); return resolve(false); }
      const r = new FileReader();
      r.onload = () => { if (settings.set(SOUND_KEY(kind), r.result)) resolve(true); else { flash('Couldn\'t keep that sound file. Try a smaller one.'); resolve(false); } };
      r.onerror = () => resolve(false);
      r.readAsDataURL(file);
    };
    f.addEventListener('cancel', () => resolve(false));
    f.click();
  });
}
// One alert option changed, in whichever place it's shown (Settings > Notifications, Mentions or Spam alerts).
async function setAlert(kind, k, v){
  if (k === 'sound' && v === 'custom' && !await pickSound(kind)) v = alerts[kind].sound;
  alerts[kind][k] = v; saveAlerts(); syncAlertControls();
  if (k === 'sharedBots'){ renderSpamLists(); renderSpamHist(); flash(v ? 'Spam alerts use the chat bot list from Mentions' : 'Spam alerts have their own chat bot list'); }
  if (k === 'sound' || k === 'vol') playSound(kind, true);
  if (k === 'color') wins.forEach(w => { if (w.alert && w.alert.kind === kind) w.el.style.setProperty('--al', v); });
  if (kind === 'live' && k === 'notify') syncLiveAlerts();
  if (kind === 'support' && k === 'on'){                     // the chats start or stop looking for it
    if (typeof pushMyName === 'function') pushMyName();
    flash(v ? 'Support alerts on' : 'Support alerts off');
  }
}
/* Spam alerts: allowed sites, promo words, known bot lines, chat bots to ignore, and the abuse lists. Mentions: chat
   bots to ignore ('mbots'), which spam alerts show (read-only) and use instead of their own while they share it. */
const SPAM_LIST = { allow: () => SmvSpam.ALLOWED, words: () => SmvSpam.WORDS, openers: () => SmvSpam.OPENERS, ignore: () => SmvSpam.BOTS, mbots: () => SmvSpam.BOTS,
  abuseWords: () => SmvSpam.ABUSE, slurs: () => SmvSpam.SLURS, swears: () => SmvSpam.SWEARS };
const listKey = which => which === 'ignore' && alerts.spam.sharedBots ? 'mbots' : which;
const listStore = which => which === 'mbots' ? [alerts.mention, 'bots'] : [alerts.spam, which];
const listOf = which => { const [a, k] = listStore(listKey(which)); return (a[k] || SPAM_LIST[which]()).slice(); };
// The abuse lists are offensive to read, so they stay blurred under a cover until you choose to show them, each time
// Settings opens.
const shownLists = new Set();
function veilList(which, n){
  const veil = settingsDlg.querySelector(`[data-list="${which}"]`).parentNode;
  if (!veil.classList.contains('st-veil')) return;
  const hide = !shownLists.has(which) && n > 0;
  veil.classList.toggle('veiled', hide);
  veil.firstChild.inert = hide;   // (nor read out, or tabbed to)
  veil.querySelector('.st-reveal small').textContent = `Click to show ${n === 1 ? 'it' : `all ${n}`}`;
  settingsDlg.querySelector(`[data-hide="${which}"]`).hidden = hide || !n;
}
function showList(which, on){
  if (on) shownLists.add(which); else shownLists.delete(which);
  veilList(which, listOf(which).length);
}
function veilLists(){ shownLists.clear(); renderSpamLists(); }
function renderSpamLists(){
  const shared = !!alerts.spam.sharedBots;
  settingsDlg.querySelectorAll('[data-s=spam] .ly-panel[data-l=ignore] [data-own]').forEach(el => { el.hidden = shared; });
  settingsDlg.querySelectorAll('[data-s=spam] .ly-panel[data-l=ignore] [data-shared]').forEach(el => { el.hidden = !shared; });
  Object.keys(SPAM_LIST).forEach(which => {
    const ro = which === 'ignore' && shared;   // changed in Mentions
    const box = settingsDlg.querySelector(`[data-list="${which}"]`); box.innerHTML = '';
    const n = settingsDlg.querySelector(`[data-lcount="${which}"]`); if (n) n.textContent = listOf(which).length;
    listOf(which).forEach(item => {
      const c = document.createElement('span'); c.className = ro ? 'st-chip ro' : 'st-chip';
      c.innerHTML = ro ? '<span></span>' : `<span></span><button title="Remove">${icon.close}</button>`;
      c.firstChild.textContent = item;
      if (!ro) c.querySelector('button').onclick = () => setSpamList(which, listOf(which).filter(x => x !== item));
      box.appendChild(c);
    });
    veilList(which, listOf(which).length);
  });
}
function setSpamList(which, list){
  const def = SPAM_LIST[which](), [a, k] = listStore(listKey(which));
  a[k] = list && !(list.length === def.length && list.every((x, i) => x === def[i])) ? list : null;
  saveAlerts(); renderSpamLists(); renderSpamHist();
}
// "Not spam: ignore this account" in the History tab.
function ignoreSender(name){
  const l = listOf('ignore'), v = String(name).trim().toLowerCase();
  if (!l.includes(v)) setSpamList('ignore', [...l, v]);
  flash(`${name} added to the chat bot list: never flagged as spam${alerts.spam.sharedBots ? ' or counted as a mention' : ''}`);
}
function addSpamItem(which){
  const inp = settingsDlg.querySelector(`[data-add="${which}"]`);
  let v = inp.value.trim().replace(/\s+/g, ' ');
  if (which !== 'openers') v = v.toLowerCase();   // bot lines keep their capitals: they're shown as typed
  if (which === 'ignore' || which === 'mbots') v = v.replace(/^@/, '');
  if (which === 'allow') v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\s+(?=[a-z]{2,6}$)/, '.');
  if (!/[a-z0-9]/i.test(v) || (which === 'allow' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v))){ inp.focus(); flash(which === 'allow' ? 'Type a site like example.com' : which === 'openers' ? 'Type a line a bot posts' : which === 'ignore' || which === 'mbots' ? "Type a chat bot's name" : 'Type a word or phrase'); return; }
  const l = listOf(which); if (!l.some(x => x.toLowerCase() === v.toLowerCase())) l.push(v);
  setSpamList(which, l); inp.value = '';
}
/* Spam alerts > Scoring: each sign's points on a slider (0 to 8), and what may go wrong with them */
function scoreRow(s){
  const range = element('input', { type: 'range', min: 0, max: SmvSpam.POINT_MAX, step: 1, 'aria-label': s.label,
    oninput: () => setPoints(s.key, +range.value), ondblclick: () => setPoints(s.key, s.points) });
  return element('div', { class: 'sc-row', dataset: { pt: s.key } },
    element('span', { class: 'sc-name', title: s.label + (s.note ? ` (${s.note.toLowerCase()})` : '') }, s.short),
    warnIcon(),
    element('span', { class: 'sc-flag', title: s.flags ? 'This sign can flag a message' : '' }, s.flags ? '⚑' : ''),
    element('span', { class: 'sc-slider', title: `Built-in: ${s.points}. Double-click to put it back.` }, range,
      element('i', { class: 'sc-def', style: { '--at': s.points / SmvSpam.POINT_MAX } })),
    element('b', 'sc-val'));
}
// A warning about the points, where it applies (a sign's row, a group's heading, or the line above them): its
// message shows on hover.
const warnIcon = () => element('span', { class: 'sc-warn-ico', role: 'img', hidden: true }, '⚠');
function showWarn(ico, list){
  ico.hidden = !list.length;
  ico.title = list.map(w => w.text).join('\n');
  ico.setAttribute('aria-label', ico.title);
}
// Spam's signs on the left, abuse's on the right.
function buildScoring(){
  [['spam', 'Spam'], ['abuse', 'Abuse']].forEach(([g, name]) => $(`#spamPoints [data-col=${g}]`).replaceChildren(element('div', { class: 'sc-group', dataset: { g } },
    element('div', 'sc-head', name, warnIcon()), ...SmvSpam.SIGNS.filter(s => s.group === g).map(scoreRow))));
}
function syncScoring(){
  const box = $('#spamPoints'); if (!box || !box.querySelector('.sc-row')) return;
  const now = SmvSpam.pointsOf(alerts.spam.points), abuseOn = alerts.spam.abuse !== false;
  SmvSpam.SIGNS.forEach(s => {
    const row = box.querySelector(`.sc-row[data-pt="${s.key}"]`), v = now[s.key];
    if (+row.querySelector('input').value !== v) row.querySelector('input').value = v;
    row.querySelector('.sc-val').textContent = v ? String(v) : 'Off';
    row.classList.toggle('off', !v);
    row.classList.toggle('changed', v !== s.points);
  });
  box.querySelector('.sc-group[data-g=abuse]').classList.toggle('st-dim', !abuseOn);
  box.querySelector('.sc-group[data-g=abuse]').title = abuseOn ? '' : 'Abuse is off (Alerts › Also flag abuse)';
  $('#spamPointsReset').disabled = !alerts.spam.points;
  const warn = SmvSpam.scoringWarnings(now, alerts.spam.sens, abuseOn);
  SmvSpam.SIGNS.forEach(s => showWarn(box.querySelector(`.sc-row[data-pt="${s.key}"] .sc-warn-ico`), warn.filter(w => w.sign === s.key)));
  box.querySelectorAll('.sc-group').forEach(g => showWarn(g.querySelector('.sc-head .sc-warn-ico'), warn.filter(w => w.group === g.dataset.g)));
  showWarn($('#spamWarnAll'), warn.filter(w => !w.sign && !w.group));
}
// Only the points that differ from the built-in ones are kept (null: all built-in).
function setPoints(key, v){
  const p = { ...(alerts.spam.points || {}), [key]: v };
  SmvSpam.SIGNS.forEach(s => { if (p[s.key] === s.points) delete p[s.key]; });
  alerts.spam.points = Object.keys(p).length ? p : null;
  saveAlerts(); syncScoring();
  if (!$('#spamRes').hidden) trySpam();   // Try it: with the new points
}
async function resetPoints(){
  if (!alerts.spam.points || !await ask('Reset the points?', 'Every sign goes back to its built-in points.', { ok: 'Reset' })) return;
  alerts.spam.points = null; saveAlerts(); syncScoring();
  if (!$('#spamRes').hidden) trySpam();
  flash('Points back to the built-in ones');
}
/* Spam alerts: try a message */
function trySpam(){
  const text = $('#spamTry').value.trim(), out = $('#spamRes');
  if (!text){ out.hidden = true; return; }
  const sender = $('#spamTrySender').value.trim().replace(/^@/, '');
  const r = SmvSpam.score({ sender: sender || 'someone', body: text, chat: '', t: Date.now() }, {}, spamOpts());
  out.hidden = false; out.classList.toggle('bad', r.spam);
  if (r.ignored){ out.innerHTML = `Not checked: <b></b> is on the chat bot list, so it's never flagged.`; out.querySelector('b').textContent = sender; return; }
  const head = r.spam ? `<b>Would be flagged${r.abuse ? ' as abusive' : ''}</b> (${r.need} points needed)` : r.score >= r.need ? `Not flagged: it has ${r.score} points but no sign that can flag it (like a link or an insult)` : `Not flagged (${r.score} of the ${r.need} points needed)`;
  out.innerHTML = head + (r.signs.length ? '<table>' + r.signs.map(s => `<tr><td>${esc(s.text)}</td><td>+${s.points}</td></tr>`).join('') + `<tr class="tot"><td>Total</td><td>${r.score}</td></tr></table>` : '<div>No signs of spam.</div>');
}
/* Spam alerts: history of flagged messages */
function renderSpamHist(){
  const list = $('#spamHist'); if (!list || $('#settingsDlg').hidden) return;   // (drawn when Settings opens)
  const spamHist = notes.filter(n => n.kind === 'spam');   // the bell's Spam tab
  $('#spamHistClear').hidden = !spamHist.length;
  list.innerHTML = '';
  if (!spamHist.length){ list.innerHTML = '<div class="sv-empty">Nothing flagged yet.</div>'; return; }
  spamHist.forEach(h => {
    const row = document.createElement('div'); row.className = 'sh-row';
    row.innerHTML = `<div class="mp-top"><b></b><span class="sh-score"></span><span class="mp-time"></span></div><div class="mp-where"></div><div class="mp-body"></div><div class="sh-signs"></div>`;
    row.querySelector('b').textContent = h.sender;
    row.querySelector('.sh-score').textContent = `${h.abuse ? 'Abusive · ' : ''}${h.score} / ${h.need} points`;
    row.querySelector('.sh-score').title = `${h.score} points; ${h.need} needed to be flagged`;
    row.querySelector('.mp-where').textContent = chLabelP(h.channel);
    row.querySelector('.mp-time').textContent = timeAgo(h.t);
    row.querySelector('.mp-body').textContent = h.body;
    row.querySelector('.sh-signs').innerHTML = (h.signs || []).map(x => `<span>${esc(x.text)} <i>+${x.points}</i></span>`).join('');
    const acts = document.createElement('div'); acts.className = 'sh-acts';
    if (SmvSpam.ignored(h.sender, spamOpts().ignore)) acts.innerHTML = '<span>On the chat bot list: no longer flagged</span>';
    else {
      acts.innerHTML = '<button class="btn sh-ign">Not spam: ignore this account</button>';
      acts.firstChild.title = `Add ${h.sender} to the chat bot list (Lists tab), so its messages are never flagged`;
      acts.firstChild.onclick = e => { e.stopPropagation(); ignoreSender(h.sender); };
    }
    row.appendChild(acts);
    if (ROLE === 'main'){ row.title = 'Show this chat'; row.onclick = () => { closeSettings(); revealChat(h.channel); }; }
    list.appendChild(row);
  });
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  settingsDlg.addEventListener('change', e => {
    const c = e.target.closest('[data-al]'); if (!c || c.classList.contains('seg')) return;
    const [kind, k] = c.dataset.al.split('.');
    setAlert(kind, k, c.type === 'checkbox' ? c.checked : c.type === 'range' || k === 'esc' || /^min[A-Z]/.test(k) ? +c.value : c.value);
  });
  settingsDlg.addEventListener('click', e => {
    const b = e.target.closest('[data-play]'); if (b) playSound(b.dataset.play, true);
    const s = e.target.closest('.seg[data-al] button');
    if (s){ const [kind, k] = s.parentNode.dataset.al.split('.'); setAlert(kind, k, s.dataset.v); }
  });
  $('#spamOn').addEventListener('change', e => {
    alerts.spam.on = e.target.checked; saveAlerts(); syncAlertControls();
    if (typeof pushMyName === 'function') pushMyName();      // the chats start or stop handing over their messages
    flash(alerts.spam.on ? 'Spam alerts on, in chats you moderate' : 'Spam alerts off');
  });
  $('#mentTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    $('#mentTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    settingsDlg.querySelectorAll('[data-s=mentions] .st-subpane').forEach(p => { p.hidden = p.dataset.t !== b.dataset.t; });
  });
  $('#ntTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    $('#ntTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    settingsDlg.querySelectorAll('[data-s=notify] .st-subpane').forEach(p => { p.hidden = p.dataset.t !== b.dataset.t; });
  });
  // Spam alerts > Lists: pick a list on the left, it shows on the right.
  $('#spamListPick').addEventListener('click', e => {
    const b = e.target.closest('button[data-l]'); if (!b) return;
    $('#spamListPick').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
    settingsDlg.querySelectorAll('[data-s=spam] .ly-panel[data-l]').forEach(p => { p.hidden = p.dataset.l !== b.dataset.l; });
  });
  $('#spamTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    $('#spamTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    settingsDlg.querySelectorAll('[data-s=spam] .st-subpane').forEach(p => { p.hidden = p.dataset.t !== b.dataset.t; });
    if (b.dataset.t === 'history') renderSpamHist();   // fresh "x min ago"
  });

  settingsDlg.querySelectorAll('[data-addbtn]').forEach(b => { b.onclick = () => addSpamItem(b.dataset.addbtn); });
  settingsDlg.querySelectorAll('[data-add]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') addSpamItem(i.dataset.add); }));
  settingsDlg.querySelectorAll('[data-reset]').forEach(b => { b.onclick = () => setSpamList(b.dataset.reset, null); });
  settingsDlg.querySelectorAll('[data-reveal]').forEach(b => { b.onclick = () => showList(b.dataset.reveal, true); });
  settingsDlg.querySelectorAll('[data-hide]').forEach(b => { b.onclick = () => showList(b.dataset.hide, false); });

  $('#spamTryBtn').onclick = trySpam;
  // the search box's: each of Spam alerts' lists (opened on it), and its Reset
  const listsPane = async l => { await openSettings('spam', { sub: 'lists' }); $(`#spamListPick [data-l="${l}"]`)?.click(); };
  document.querySelectorAll('#spamListPick .ly-item[data-l]').forEach(b => {
    const l = b.dataset.l, name = b.querySelector('span').textContent.trim(), reset = $(`#settingsDlg .ly-panel[data-l="${l}"] [data-reset]`);
    b.dataset.cmd = 'spam.list.' + l;
    commands.add({ id: 'spam.list.' + l, kind: 'tab', group: 'Settings', title: name, sub: 'Settings › Spam alerts › Lists', words: ['spam list'], icon: 'mod',
      when: () => DESKTOP && ROLE === 'main', run: () => listsPane(l) });
    if (reset){
      reset.dataset.cmd = 'spam.reset.' + l;
      commands.add({ id: 'spam.reset.' + l, kind: 'setting', group: 'Settings', title: `${name}: Reset`, sub: 'Back to the list the app came with (Settings › Spam alerts › Lists)', icon: 'mod',
        when: () => DESKTOP && ROLE === 'main', run: async () => { await listsPane(l); reset.click(); } });
    }
  });
  // the search box's (when nothing else is found): the words typed, checked as Spam alerts › Try it does
  commands.provide('spam.try', q => q && DESKTOP && ROLE === 'main' ? [{ id: 'spam.try', kind: 'setting', fallback: true, group: 'Nothing found', title: `Check “${q}” for spam`,
    sub: 'Settings › Spam alerts › Try it', icon: 'mod', verb: 'Check', run: async () => { await openSettings('spam', { sub: 'try' }); $('#spamTry').value = q; trySpam(); } }] : []);
  buildScoring();
  $('#spamPointsReset').onclick = resetPoints;

  $('#spamHistClear').onclick = () => dropNotes(n => n.kind === 'spam');
  ['#spamTry', '#spamTrySender'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') trySpam(); }));
  syncAlertControls(); renderSpamLists(); renderSpamHist();
}

export { ignoreSender, init, renderSpamHist, syncAlertControls, veilLists };
