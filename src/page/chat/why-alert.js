import { alerts } from '../alerts/alerts.js';
import { spamFirst, spamOpts } from '../alerts/spam-alerts.js';
import { SmvSpam } from '../alerts/spam.js';
import { winOfView } from './translate.js';
import { dndOn, mentMuted, mentNameFor, mentOn, mentWords, notes } from '../panels/bell/bell.js';
import { openSettings } from '../panels/settings/settings.js';
import { PLAT_NAME, chLabel, platOf, platform } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { flash } from '../shared/flash.js';
import { fromApp } from '../shared/incoming.js';
import { askIn } from '../windows/view.js';

/* ---- Why didn't this alert? (a chat's right-click menu, with Settings › Developer › Developer tools on): how the
   mention and spam alerts read that message. Each check in the order the app makes them, what the chat's helper
   decided when the message came in (in-site/mentions.js: explain()), and the first reason it didn't alert. ---- */
const WHY_SEEN = {
  before: [false, 'It was already in the chat when alerts started there (only new messages alert)'],
  own: [false, 'It\'s your own message'],
  translated: [false, 'It was read before it was translated'],
  redrawn: [false, 'The chat drew a message again that was already read'],
  busy: [false, 'Too many alerts were waiting for the app at the time'],
  off: [false, 'There was no name or word to look for'],
  nomatch: [false, 'Read when it came in: it didn\'t mention you or a word you watch for'],
  alerted: [true, 'Read when it came in, and alerted']
};
const KIND_WORD = { reply: 'a reply to you', mention: 'a mention', word: 'a word you watch for' };
const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// The checks: [{ ok: true | false | null (not checked), text, note? }] and the verdict, from what the chat said (r).
function whyChecks(w, r){
  const ch = w.channel, site = platform(ch), name = PLAT_NAME[platOf(ch)] || '', me = mentNameFor(ch);
  const out = [], fail = [];
  const add = (ok, text, note) => { out.push({ ok, text, note }); if (ok === false) fail.push(text); };
  if (!r || !r.found){
    add(false, 'Read as a message', r && r.text ? `The helper couldn't find “${r.text.slice(0, 60)}” among the chat's messages` : 'The chat\'s helper didn\'t answer (reload the chat, then try again)');
    return { checks: out, verdict: { alert: false, text: fail[0] } };
  }
  add(true, `Read as a message: name ${r.sender}, text “${r.body.slice(0, 120)}”`);
  if (!site.mentions) add(false, `Mention alerts read Kick and Twitch chats, not ${name}`);
  else {
    add(mentOn, mentOn ? 'Mention alerts are on' : 'Mention alerts are off', mentOn ? '' : 'Settings › Mentions');
    add(!mentMuted.has(ch), mentMuted.has(ch) ? 'Mentions are off for this chat' : 'Mentions are on for this chat', mentMuted.has(ch) ? 'The @ button on its title bar' : '');
    if (r.own) add(false, 'It\'s your own message');
    const bots = alerts.mention.bots || SmvSpam.BOTS;
    if (SmvSpam.ignored(r.sender, bots)) add(false, `${r.sender} is on the chat bot list`, 'Never a mention');
    if (!me) add(false, `No ${name} username to look for`, 'Settings › Mentions › Your usernames');
    else add(r.at, r.at ? `Mentions you (@${me})` : `Mentions you: looked for @${me}`);
    if (mentWords.length) add(r.word ? true : null, r.word ? `Has “${r.word}”, a word you watch for` : `Words to watch: none of yours (${mentWords.slice(0, 4).join(', ')}${mentWords.length > 4 ? ', …' : ''})`);
    else out.push({ ok: null, text: 'Words to watch: none set' });
    const d = r.decided, seen = d && WHY_SEEN[d.v];
    if (seen) add(seen[0], d.v === 'alerted' ? `Alerted as ${KIND_WORD[d.kind] || 'a mention'} at ${clock(d.t)}` : seen[1]);
    else out.push({ ok: null, text: r.armed ? 'Not read yet by the helper' : 'Alerts hadn\'t started in this chat yet' });
  }
  // spam alerts: its score now (the other chats' messages and who spoke first count too)
  if (!alerts.spam.on || !site.spamAlerts) out.push({ ok: null, text: `Spam alerts: ${!site.spamAlerts ? 'not for ' + name : 'off'}` });
  else {
    const s = SmvSpam.score({ sender: r.sender, body: r.body, chat: ch, t: Date.now() }, { recent: [], firstSeen: spamFirst }, spamOpts());
    out.push({ ok: s.spam ? true : null, text: s.ignored ? 'Spam alerts: on the chat bot list (never flagged)' : s.spam ? `Spam alerts: would flag it (${s.score} of ${s.need} points)` : `Spam alerts: ${s.score} of the ${s.need} points needed`,
      note: (s.signs || []).map(x => `${x.text} +${x.points}`).join(' · ') });
  }
  if (dndOn()) out.push({ ok: null, text: 'Do not disturb is on', note: 'Alerts still go under the bell, without pop-ups or sounds' });
  const inBell = notes.find(n => n.channel === ch && n.sender && n.sender.toLowerCase() === r.sender.toLowerCase() && String(n.body || '').trim() && r.body.includes(String(n.body).trim().slice(0, 40)));
  if (inBell) out.push({ ok: true, text: `It's under the bell (${clock(inBell.t)})` });
  const alerted = !!inBell || (r.decided && r.decided.v === 'alerted');
  return { checks: out, verdict: alerted ? { alert: true, text: 'It did alert' + (inBell ? ': it\'s under the bell' : '') } : { alert: false, text: fail[0] || 'It didn\'t match anything that alerts' } };
}
const whyText = (w, r, res) => [`How this message was read · ${chLabel(w.channel)} · ${PLAT_NAME[platOf(w.channel)] || ''}`, r && r.found ? `${r.sender}: ${r.body}` : '',
  ...res.checks.map(c => `${c.ok === true ? '✓' : c.ok === false ? '✗' : '–'} ${c.text}${c.note ? ` (${c.note})` : ''}`), (res.verdict.alert ? 'Alerted: ' : 'No alert: ') + res.verdict.text].filter(Boolean).join('\n');

let whyDlg = null;
const closeWhy = () => { if (whyDlg){ whyDlg.remove(); whyDlg = null; } };
async function showWhy(w){
  if (!w || !w.view) return;
  let r = null;
  try { r = await askIn(w.view, 'window.__kmvMention && window.__kmvMsg ? window.__kmvMention.explain(window.__kmvMsg.last()) : null'); } catch {}
  const res = whyChecks(w, r);
  closeWhy();
  const mark = ok => element('span', 'why-m why-' + (ok === true ? 'y' : ok === false ? 'x' : 'n'), ok === true ? '✓' : ok === false ? '✗' : '–');
  const dlg = element('div', { class: 'dlg why', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'whyTitle' },
    element('h3', { id: 'whyTitle' }, 'How this message was read'),
    element('div', 'dlg-sub', `${chLabel(w.channel)}'s chat · ${PLAT_NAME[platOf(w.channel)] || ''}`),
    r && r.found ? element('div', 'why-line', element('b', null, r.sender), ': ' + r.body) : null,
    element('div', 'why-checks', ...res.checks.map(c => element('div', 'why-row', mark(c.ok), element('span', null, c.text, c.note ? element('small', null, c.note) : null)))),
    element('div', 'why-verdict' + (res.verdict.alert ? ' ok' : ''), element('b', null, res.verdict.alert ? 'Alerted: ' : 'No alert: '), res.verdict.text),
    element('div', 'dlg-foot',
      element('button', { class: 'btn', onclick: () => navigator.clipboard.writeText(whyText(w, r, res)).then(() => flash('Copied'), () => flash('Couldn’t copy it')) }, 'Copy'),
      element('button', { class: 'btn', onclick: () => { closeWhy(); openSettings('mentions'); } }, 'Mention settings'),
      element('button', { class: 'btn primary why-ok', onclick: closeWhy }, 'Close')));
  whyDlg = element('div', { class: 'dlg-bg', id: 'whyDlg', onpointerdown: e => { if (e.target === whyDlg) closeWhy(); } }, dlg);
  whyDlg.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeWhy(); } });
  document.body.append(whyDlg);
  dlg.querySelector('.why-ok').focus();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  fromApp('onViewWhy', id => showWhy(winOfView(id)));
  window.showWhy = showWhy; window.whyChecks = whyChecks;   // for the tests
}

export { init };
