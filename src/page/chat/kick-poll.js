import { kickClearBox, kickPollPost } from '../in-site/kick-poll.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { askIn, runIn } from '../windows/view.js';

// Kick's /poll in a chat window. Kick only opens its "Create a new poll" form on the channel page: the popout chat the app
// shows has nowhere to put it. So the chat window gets a copy, the chat's full width, over its bottom: the same fields,
// choices, defaults, checks and wording as Kick's own (read from kick.com, October 2026), and Create sends the same request
// from the chat's page, with its login.
const POLL_TIMES = [30, 120, 180, 240, 300];          // Duration, in seconds (the first is the default)
const RESULT_TIMES = [15, 30, 120, 180, 240, 300];    // Result displayed for
const POLL_LIMITS = { options: 6, minOptions: 2, min: 2, max: 64 };   // options; characters in the subject and each option
const timeLabel = s => s < 60 ? `${s} seconds` : `${s / 60} minutes`;
const POLL_TEXT = {
  subjectShort: `The poll's subject needs to be at least ${POLL_LIMITS.min} character(s) long.`,
  subjectLong: `The poll's subject can't be longer than ${POLL_LIMITS.max} character(s).`,
  optionShort: `Option labels need to be at least ${POLL_LIMITS.min} character(s) long.`,
  optionLong: `Option labels can't be longer than ${POLL_LIMITS.max} character(s).`,
  fewOptions: `You need to specify at least ${POLL_LIMITS.minOptions} options.`,
  failed: 'There was an error creating the poll. Please try again.',
  signIn: 'You need to be signed in to Kick to start a poll.',
  notMod: 'Only the streamer and the channel’s moderators can start polls.'
};

// What's wrong with a filled-in form, as Kick checks it: { subject, options: [one per option], list } ('' when fine).
// The subject is measured as typed; an option may be left empty, and is measured without its spaces.
function pollProblems(subject, options){
  const { min, max, minOptions } = POLL_LIMITS;
  return {
    subject: subject.length < min ? POLL_TEXT.subjectShort : subject.length > max ? POLL_TEXT.subjectLong : '',
    options: options.map(o => o.length > max ? POLL_TEXT.optionLong : o.trim() && o.trim().length < min ? POLL_TEXT.optionShort : ''),
    list: options.filter(o => o.trim()).length < minOptions ? POLL_TEXT.fewOptions : ''
  };
}
// What Kick is sent: the options that aren't empty, as typed
const pollBody = (subject, options, duration, result) =>
  ({ duration, result_display_duration: result, options: options.filter(o => o.trim()), title: subject });
// What the form says when Kick didn't start it
function pollFailText(r){
  if (r && r.status === 401) return POLL_TEXT.signIn;
  if (r && r.status === 403) return POLL_TEXT.notMod;
  return (r && r.message) || POLL_TEXT.failed;
}

// The channel's page on kick.com, in its own window with its sound off and your login (also the /clip and /prediction
// card's Open channel page: in-site/kick-commands.js)
function openChannelPage(ch){
  const url = `https://kick.com/${encodeURIComponent(ch)}`;
  if (DESKTOP) window.kmv.openWindow(url, 1280, 800, { muted: true });
  else window.open(url, 'kmv_page_' + ch, 'width=1280,height=800');
}

// One of the two duration lists (the app's own dropdown, looking like Kick's)
const timePick = (label, times) => element('label', 'kp-f', element('span', 'kp-l', label),
  element('span', 'kp-selw', element('select', { class: 'kp-sel', dataset: { ddClass: 'kick' } },
    times.map(s => element('option', { value: String(s) }, timeLabel(s))))));

// Opens the form in w's chat window (or goes back to it when it's open), the subject filled in with what followed /poll
function openPollForm(w, subject = ''){
  if (!w || !w.el) return null;
  const body = w.el.querySelector('.body');
  const had = body.querySelector('.kpoll');
  if (had){ had.querySelector('[name="subject"]').focus(); return had; }
  body.querySelector('.kcmd')?.remove();
  let tried = false, busy = false;

  const err = () => element('div', { class: 'kp-err', hidden: true });
  const subj = element('input', { type: 'text', name: 'subject', placeholder: 'Enter poll subject', autocomplete: 'off', value: subject.slice(0, 200) });
  const opts = element('div', 'kp-opts');
  const listErr = err();
  const dur = timePick('Duration', POLL_TIMES), res = timePick('Result displayed for', RESULT_TIMES);
  const failText = element('span'), openPage = element('button', { type: 'button', class: 'kp-page' }, 'Open channel page');
  const fail = element('div', { class: 'kp-fail', role: 'alert', hidden: true }, failText, openPage);
  const create = element('button', { type: 'submit', class: 'kp-create' }, 'Create');
  const cancel = element('button', { type: 'button', class: 'kp-cancel' }, 'Cancel');
  const form = element('form', { class: 'kp-form', novalidate: true },
    element('label', 'kp-f', element('span', 'kp-l', 'Subject'), subj, err()),
    element('div', 'kp-f', element('span', 'kp-l', `Options (minimum ${POLL_LIMITS.minOptions})`), opts, listErr),
    dur, res, fail, element('div', 'kp-foot', cancel, create));
  const card = element('div', { class: 'kcmd kpoll', role: 'dialog', 'aria-label': 'Create a new poll' },
    element('button', { type: 'button', class: 'kcmd-x', title: 'Close', 'aria-label': 'Close' }, '×'),
    element('h3', null, 'Create a new poll'), form);

  const rows = () => [...opts.children];
  const optionInputs = () => rows().map(r => r.querySelector('input'));
  // Kick's options: two to start with; typing in the last adds another (up to six), emptying one takes it away
  // (while there are more than two) and goes back to the one before
  function addOption(fresh){
    const input = element('input', { type: 'text', autocomplete: 'off' });
    const row = element('div', fresh ? 'kp-o new' : 'kp-o', input, err());
    input.addEventListener('input', () => {
      const all = rows(), i = all.indexOf(row), filled = !!input.value.trim();
      if (all.length > POLL_LIMITS.minOptions && !filled){ row.remove(); all[i - 1]?.querySelector('input').focus(); number(); }
      else if (all.length < POLL_LIMITS.options && filled && i === all.length - 1) addOption(true);
    });
    opts.append(row);
    number();
  }
  const number = () => optionInputs().forEach((x, i) => { x.placeholder = `Option ${i + 1}`; });
  for (let i = 0; i < POLL_LIMITS.minOptions; i++) addOption(false);

  const say = (el, text) => { el.textContent = text; el.hidden = !text; };
  // Kick checks the form when Create is pressed, then again as you type
  function check(){
    const p = pollProblems(subj.value, optionInputs().map(x => x.value));
    say(subj.nextElementSibling, p.subject);
    rows().forEach((r, i) => say(r.querySelector('.kp-err'), p.options[i]));
    say(listErr, p.list);
    return !p.subject && !p.list && p.options.every(x => !x);
  }
  form.addEventListener('input', () => { if (tried) check(); fail.hidden = true; });
  const close = () => card.remove();
  form.onsubmit = async e => {
    e.preventDefault();
    if (busy) return;
    tried = true;
    if (!check()) return;
    const poll = pollBody(subj.value, optionInputs().map(x => x.value), Number(dur.querySelector('select').value), Number(res.querySelector('select').value));
    busy = true; create.disabled = true; card.setAttribute('aria-busy', 'true'); fail.hidden = true;
    const r = await askIn(w.view, `(${kickPollPost})(${JSON.stringify(w.channel)}, ${JSON.stringify(poll)})`).catch(() => null);
    busy = false; create.disabled = false; card.removeAttribute('aria-busy');
    if (r && r.ok) return close();              // Kick's chat shows the poll itself
    failText.textContent = pollFailText(r);
    openPage.hidden = !!r && r.status === 401;  // (the page wouldn't help without a login)
    fail.hidden = false;
  };
  openPage.onclick = () => { close(); openChannelPage(w.channel); };
  cancel.onclick = card.querySelector('.kcmd-x').onclick = close;
  card.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); close(); } });

  body.append(card);
  runIn(w.view, `(${kickClearBox})()`);           // "/poll …" leaves the chat box, as on Kick's channel page
  subj.focus();
  subj.setSelectionRange(subj.value.length, subj.value.length);
  return card;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.openPollForm = openPollForm; window.kickPollPost = kickPollPost; window.kickClearBox = kickClearBox;   // for the tests
}

export { init, openChannelPage, openPollForm };
