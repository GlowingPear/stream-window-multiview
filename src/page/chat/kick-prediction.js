import { askKick, kickIcon, kickPanel, openChannelPage, openInBrowser } from './kick-panel.js';
import { kickApi } from '../in-site/kick-api.js';
import { kickClearBox } from '../in-site/kick-box.js';
import { element } from '../shared/element.js';
import { stopWinTimer, winTimer } from '../shared/timers.js';
import { runIn } from '../windows/view.js';

// Kick's /prediction in a chat window. Kick only opens its prediction window on the channel page: the popout chat the app
// shows has nowhere to put it. So the chat window gets a copy, the chat's full width, over its bottom (chat/kick-panel.js):
// the same steps, fields, choices, checks and wording as Kick's own (read from kick.com, October 2026), and the same
// requests, made from the chat's page with its login. Like Kick's, it starts a prediction (the form, then Confirm), or, when
// one is running, manages it: end submissions, choose the outcome, or delete it and return the points.
const PRED_TIMES = [1, 5, 10, 30];                   // Prediction lasts for, in minutes (the first is the default)
const PRED_LIMITS = { title: 40, option: 15 };       // characters
const PRED_TEXT = {
  start: 'Start a prediction', confirm: 'Confirm prediction', manage: 'Manage Prediction', unable: 'Unable to create prediction',
  chooseOutcome: 'Choose outcome', deletePrediction: 'Delete Prediction',
  description: ['Streamers and mods are able to create predictions. Viewers who predict the correct outcome win Channel Points. These predictions must follow our ', 'Terms of Service', '.'],
  pastHistory: 'Past history predictions', pastPick: 'Select a past prediction to get a quick start!',
  title: 'Prediction Title', titlePlaceholder: 'Enter prediction question', options: 'Options', option1: 'Option 1', option2: 'Option 2',
  duration: 'Prediction lasts for', durationNote: 'Time limit viewers have to place a prediction.',
  minutes: m => `${m} ${m === 1 ? 'minute' : 'minutes'}`,
  titleRequired: 'Prediction title is required', titleLong: `Title must be between 1 and ${PRED_LIMITS.title} characters long`,
  option1Required: 'Option 1 is required', option2Required: 'Option 2 is required', optionLong: `Option must be between 1 and ${PRED_LIMITS.option} characters long`,
  confirmText: ['Streamers or moderators must finalize an outcome for the prediction within ', '24 hours', ' of the submission window. Once a prediction has been started, it\'s locked, except for deleting or closing submissions. If no outcome is chosen or the prediction is deleted, all Channel Points will be refunded.'],
  confirmNote: 'Mods who have participated are not able to choose the outcome.',
  cancel: 'Cancel', create: 'Start prediction', gotIt: 'Got it', enableNow: 'Enable now', goBack: 'Go back',
  enableDescription: 'To start a prediction, channel points needs to be enabled by the channel owner in creator dashboard.',
  loadFailedTitle: 'Unable to load', loadFailed: 'Sorry, we couldn\'t load your latest prediction. Please try again later.',
  limited: 'Limited Access', limitedDescription: 'Since you\'ve participated in this prediction, you can no longer manage this event.',
  points: n => `${n} points contributed`, winner: 'Winner', closesIn: 'Prediction closes in ', closed: 'Predictions closed',
  delete: 'Delete', endSubmissions: 'End Submissions', deleteAndReturn: 'Delete & return points',
  outcomeText: ['Are you sure ', ' is the correct outcome? Once you choose the outcome, viewers who have chosen the correct outcome will be awarded ', ' channel points.'],
  outcomeNote: 'You will not be able to reverse your choice and this will end the prediction.', outcomeRequired: 'Please select an outcome',
  deleteText: 'This will remove the ongoing prediction. Viewers will no longer be able to participate, votes are discarded, and Channel Points are automatically returned.',
  deleteNote: n => `Selecting 'Delete & return points' will return ${n} Channel Points to participating viewers.`,
  createInvalid: 'The prediction you\'re trying to create is invalid. Please try again.',
  createExists: 'A prediction already exists for this channel, please close the existing prediction before creating a new one.',
  createDisabled: 'Channel points are disabled on this channel, please enable them in the creator dashboard to create predictions.',
  createFailed: 'An error occurred while creating the prediction. Please try again.',
  updateInvalid: 'The prediction you\'re trying to update is invalid. Please try again.',
  updateBanned: 'You are not allowed to update this prediction.',
  updateNotFound: 'The prediction you\'re trying to update was not found. Please try again.',
  endFailed: 'An error occurred while ending the prediction. Please try again.',
  chooseFailed: 'An error occurred while choosing the outcome. Please try again.',
  deleteFailed: 'An error occurred while deleting the prediction. Please try again.',
  signIn: 'You need to be signed in to Kick to start a prediction.',
  notMod: 'Only the streamer and the channel’s moderators can start predictions.'
};
const PRED_TERMS = 'https://kick.com/channel-points-terms-and-conditions';
const PRED_DASHBOARD = 'https://dashboard.kick.com/channel/community/channel-points';

// What's wrong with the form, as Kick checks it: { title, option1, option2 } ('' when fine). Each is measured as typed.
function predictionProblems(title, option1, option2){
  const opt = (o, missing) => !o.length ? missing : o.length > PRED_LIMITS.option ? PRED_TEXT.optionLong : '';
  return {
    title: !title.length ? PRED_TEXT.titleRequired : title.length > PRED_LIMITS.title ? PRED_TEXT.titleLong : '',
    option1: opt(option1, PRED_TEXT.option1Required),
    option2: opt(option2, PRED_TEXT.option2Required)
  };
}
// What Kick is sent to start one
const predictionBody = f => ({ title: f.title, outcomes: [f.option1, f.option2], duration: 60 * Number(f.duration) });
// What the window says when Kick didn't start it, or didn't change it
function createFailText(r){
  if (r.status === 401) return PRED_TEXT.signIn;
  if (r.status === 403) return PRED_TEXT.notMod;
  if (r.status === 400) return PRED_TEXT.createInvalid;
  if (r.status === 409 && r.message === 'PREDICTION_ALREADY_EXISTS') return PRED_TEXT.createExists;
  if (r.status === 412) return PRED_TEXT.createDisabled;
  return PRED_TEXT.createFailed;
}
function updateFailText(r, otherwise){
  if (r.status === 401) return PRED_TEXT.signIn;
  if (r.status === 400) return PRED_TEXT.updateInvalid;
  if (r.status === 403) return PRED_TEXT.updateBanned;
  if (r.status === 404) return PRED_TEXT.updateNotFound;
  return otherwise;
}
// Kick's numbers: points as 1,234, shares as 50%, time left as 04:59 (1:04:59 from an hour)
const predNum = n => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const predPercent = x => new Intl.NumberFormat('en-US', { style: 'percent' }).format(x);
function predTimeLeft(ms){
  const s = Math.max(Math.ceil(Math.max(ms, 0) / 1000), 0), h = Math.floor(s / 3600), two = n => String(n).padStart(2, '0');
  return (h ? h + ':' : '') + two(Math.floor(s % 3600 / 60)) + ':' + two(s % 60);
}
const predTotal = p => p.outcomes.reduce((a, o) => a + (Number(o.total_vote_amount) || 0), 0);

// Opens the window in w's chat window (or goes back to it when it's open), the title filled in with what followed /prediction
function openPredictionForm(w, title = ''){
  if (!w || !w.el) return null;
  const had = w.el.querySelector('.body .kpred');
  if (had){ (had.querySelector('input') || had).focus(); return had; }
  const p = kickPanel(w, 'kpred', PRED_TEXT.start, () => stopWinTimer(w, 'kpred'));
  runIn(w.view, `(${kickClearBox})()`);            // "/prediction" leaves the chat box, as on Kick's channel page
  const url = path => `https://kick.com/api/v2/channels/${encodeURIComponent(w.channel)}${path}`;
  const blank = () => ({ title: '', option1: '', option2: '', duration: PRED_TIMES[0] });
  let values = { ...blank(), title: title.slice(0, 200) };   // what's typed, kept from the form to Confirm and back
  let recent = [], step = '';

  // One step: its title and what's under it
  // (focus moves to its first box on a new step, else to the panel, never onto a button a stray Enter would press; not when
  // the same step is shown again with news)
  function show(name, heading, ...children){
    const fresh = name !== step;
    step = name;
    p.title.textContent = heading; p.card.setAttribute('aria-label', heading || PRED_TEXT.start);
    p.body.replaceChildren(...children.flat());
    if (fresh) (p.body.querySelector('input:not([disabled])') || p.card).focus({ preventScroll: true });
  }
  const btn = (label, kind, onclick) => element('button', { type: onclick ? 'button' : 'submit', class: 'kpr-b ' + kind, onclick }, label);
  const foot = (...buttons) => element('div', 'kpr-foot', buttons);
  const para = (cls, ...text) => element('p', cls, ...text);
  const alertBox = (kind, icon, heading, text) => element('div', { class: 'kpr-alert ' + kind, role: kind === 'error' ? 'alert' : null },
    kickIcon(icon), element('div', null, element('b', null, heading), element('span', null, text)));
  // Kick's toasts, here inside the window: why Kick said no
  const failBox = () => element('div', { class: 'kpr-fail', role: 'alert', hidden: true }, element('span'));
  function fail(box, text, page){
    box.querySelector('span').textContent = text;
    box.querySelector('.kpr-page')?.remove();
    if (page) box.append(element('button', { type: 'button', class: 'kpr-page', onclick: () => { p.close(); openChannelPage(w.channel); } }, 'Open channel page'));
    box.hidden = false;
  }
  function busy(on){
    p.card.toggleAttribute('aria-busy', on);
    p.body.querySelectorAll('.kpr-foot button, .kpr-pick').forEach(b => { b.disabled = on; });
  }

  // While Kick finds out what to show: does the channel have channel points, is a prediction running, the past ones
  async function load(){
    show('loading', '', element('div', 'kpr-skel', [1, 2, 3, 4].map(() => element('i'))));
    busy(true);
    const [settings, latest, past, me] = await Promise.all(['/channel-points/channel-settings', '/predictions/latest', '/predictions/recent', '/me']
      .map(path => askKick(w, url(path))));
    busy(false);
    if (!p.card.isConnected) return;
    recent = past.ok && past.data && Array.isArray(past.data.predictions) ? past.data.predictions.filter(x => x && x.outcomes && x.outcomes.length >= 2) : [];
    if (settings.status === 401 || latest.status === 401) return notice(PRED_TEXT.start, PRED_TEXT.signIn);
    if (!settings.ok) return loadFailed();
    if (!(settings.data && settings.data.channel_points_enabled)) return disabled(!!(me.ok && me.data && me.data.is_broadcaster));
    route(latest);
  }
  // A running prediction is managed, a finished one shown; with none, the form
  function route(latest){
    const pred = latest.ok && latest.data && latest.data.prediction;
    if (!latest.ok && !(latest.status > 0 && latest.status < 500)) return loadFailed();
    if (!pred || !Array.isArray(pred.outcomes) || pred.outcomes.length < 2) return form();
    if (pred.state === 'RESOLVED' || pred.state === 'CANCELLED') return resolved(pred);
    manage(pred, !!latest.data.user_vote);
  }
  const reload = async () => { const latest = await askKick(w, url('/predictions/latest')); if (p.card.isConnected) route(latest); };

  const notice = (heading, text) => show('notice', heading, para('kpr-d', text), foot(btn(PRED_TEXT.gotIt, 'grey', p.close)));
  const loadFailed = () => show('failed', PRED_TEXT.manage, alertBox('error', 'crossCircle', PRED_TEXT.loadFailedTitle, PRED_TEXT.loadFailed),
    foot(btn(PRED_TEXT.gotIt, 'grey', p.close)));
  // Channel points are off: the streamer is sent to turn them on, a mod just told
  const disabled = broadcaster => show('disabled', PRED_TEXT.unable, para('kpr-d', PRED_TEXT.enableDescription),
    broadcaster ? foot(btn(PRED_TEXT.cancel, 'text', p.close), btn(PRED_TEXT.enableNow, 'green', () => { p.close(); openInBrowser(PRED_DASHBOARD); }))
      : foot(btn(PRED_TEXT.gotIt, 'grey', p.close)));

  // The form: checked when Start prediction is pressed, then again as you type; it goes on to Confirm
  function form(){
    let tried = false;
    const err = () => element('p', { class: 'kpr-err', hidden: true }, kickIcon('crossCircle'), element('span', 'kpr-et'));
    const say = (el, text) => { el.querySelector('.kpr-et').textContent = text; el.hidden = !text; };
    const field = (label, ...rest) => element('label', 'kpr-f', element('span', 'kpr-l', label), ...rest);
    const text = (name, value, placeholder) => element('input', { type: 'text', name, value, placeholder, autocomplete: 'off', 'aria-label': placeholder });
    const t = text('title', values.title, PRED_TEXT.titlePlaceholder), o1 = text('option1', values.option1, PRED_TEXT.option1), o2 = text('option2', values.option2, PRED_TEXT.option2);
    const tErr = err(), o1Err = err(), o2Err = err();
    const sel = element('select', { class: 'kpr-sel', name: 'duration', dataset: { ddClass: 'kick kick-lg' } },
      PRED_TIMES.map(m => element('option', { value: String(m) }, PRED_TEXT.minutes(m))));
    sel.value = String(values.duration);
    const tField = field(`${PRED_TEXT.title} *`, t, tErr);
    // Kick's quick start: a past prediction fills in the form
    let past = null;
    if (recent.length){
      const pick = element('select', { class: 'kpr-sel kpr-past', name: 'past', 'aria-label': PRED_TEXT.pastHistory, dataset: { ddClass: 'kick kick-lg' } },
        element('option', { value: '', disabled: true }, PRED_TEXT.pastPick), recent.map((x, i) => element('option', { value: String(i) }, String(x.title))));
      pick.value = '';
      pick.addEventListener('change', () => {
        const x = recent[Number(pick.value)];
        if (!x) return;
        t.value = String(x.title); o1.value = String(x.outcomes[0].title ?? ''); o2.value = String(x.outcomes[1].title ?? '');
        if (PRED_TIMES.includes(x.duration / 60)) sel.value = String(x.duration / 60);
        if (tried) check();
      });
      past = element('div', 'kpr-f', element('span', 'kpr-l', PRED_TEXT.pastHistory), element('span', 'kpr-selw', pick));
    }
    const read = () => ({ title: t.value, option1: o1.value, option2: o2.value, duration: Number(sel.value) });
    function check(){
      const v = read(), e = predictionProblems(v.title, v.option1, v.option2);
      say(tErr, e.title); say(o1Err, e.option1); say(o2Err, e.option2);
      tField.classList.toggle('bad', !!e.title);    // (Kick only marks the title's box, not the options')
      return !e.title && !e.option1 && !e.option2;
    }
    const terms = element('button', { type: 'button', class: 'kpr-link', onclick: () => openInBrowser(PRED_TERMS) }, PRED_TEXT.description[1]);
    const f = element('form', { class: 'kpr-form', novalidate: true },
      para('kpr-d', PRED_TEXT.description[0], terms, PRED_TEXT.description[2]),
      past, element('hr', 'kpr-hr'), tField,
      element('div', 'kpr-f', element('span', 'kpr-l', `${PRED_TEXT.options} *`),
        element('label', 'kpr-o', kickIcon('one'), o1), o1Err, element('label', 'kpr-o', kickIcon('two'), o2), o2Err),
      element('label', 'kpr-f', element('span', 'kpr-l', `${PRED_TEXT.duration} *`), element('span', 'kpr-selw', sel),
        para('kpr-d', PRED_TEXT.durationNote)),
      foot(btn(PRED_TEXT.cancel, 'text', p.close), btn(PRED_TEXT.create, 'green')));
    f.addEventListener('input', () => { if (tried) check(); });
    f.onsubmit = e => {
      e.preventDefault();
      tried = true;
      if (!check()) return;
      values = read();
      confirm();
    };
    show('form', PRED_TEXT.start, f);
    if (title) t.setSelectionRange(t.value.length, t.value.length);
  }

  // Confirm: Kick's terms for running one; Start prediction sends it, Cancel goes back to the form as it was
  function confirm(){
    const box = failBox();
    const go = async () => {
      busy(true); box.hidden = true;
      const r = await askKick(w, url('/predictions'), 'POST', predictionBody(values));
      if (!p.card.isConnected) return;
      busy(false);
      if (r.ok) return p.close();                  // Kick's chat shows the prediction itself
      fail(box, createFailText(r), r.status !== 401);
    };
    show('confirm', PRED_TEXT.confirm,
      para('kpr-d', PRED_TEXT.confirmText[0], element('b', null, PRED_TEXT.confirmText[1]), PRED_TEXT.confirmText[2]),
      para('kpr-d red', PRED_TEXT.confirmNote), box,
      foot(btn(PRED_TEXT.cancel, 'text', form), btn(PRED_TEXT.create, 'green', go)));
  }

  // The prediction's question, points and shares (Kick's ball pit, without the balls), and its two options
  function summary(pred, winner){
    const total = predTotal(pred), share = i => total ? (Number(pred.outcomes[i].total_vote_amount) || 0) / total : 0;
    const w0 = winner && pred.outcomes.findIndex(o => o.id === winner);
    const pit = winner && w0 >= 0
      ? element('div', 'kpr-won', element('span', 'kpr-wl', PRED_TEXT.winner, ' ', kickIcon(w0 ? 'two' : 'one')), element('span', w0 ? 'kpr-p2' : 'kpr-p1', predPercent(share(w0))))
      : element('div', 'kpr-vs', element('span', 'kpr-p1', predPercent(share(0))), element('span', 'kpr-v', 'vs'), element('span', 'kpr-p2', predPercent(share(1))));
    return element('div', 'kpr-sum', para('kpr-q', String(pred.title)), para('kpr-pts', PRED_TEXT.points(predNum(total))), element('div', 'kpr-pit', pit));
  }
  function outcomes(pred, winner){
    const one = (o, i) => element('div', { class: 'kpr-out' + (winner && winner !== o.id ? ' lost' : '') },
      element('div', 'kpr-ot', kickIcon(i ? 'two' : 'one'), element('b', null, String(o.title)), winner === o.id ? element('span', 'kpr-win', PRED_TEXT.winner) : null),
      element('div', { class: 'kpr-st ' + (i ? 'c2' : 'c1') },
        element('span', null, kickIcon('bubbles'), predNum(o.total_vote_amount)),
        element('span', null, kickIcon('chart'), '1:' + Number((Number(o.return_rate) || 0).toFixed(1)), pred.state === 'ACTIVE' ? element('sup', null, '*') : null)));
    return element('div', 'kpr-f', element('span', 'kpr-l sub', PRED_TEXT.options), element('div', 'kpr-outs', pred.outcomes.slice(0, 2).map(one)));
  }

  // A running prediction: how it's going, the time left, and what a mod can do with it (not one who predicted)
  function manage(pred, voted){
    const end = new Date(pred.created_at).getTime() + 1000 * (Number(pred.duration) || 0);
    let timing = null, tick = null;
    if (pred.state === 'ACTIVE'){
      const bar = element('i'), left = element('span', 'kpr-left');
      timing = element('div', 'kpr-time', element('div', 'kpr-bar', bar), element('p', null, PRED_TEXT.closesIn, left));
      tick = () => { const ms = end - Date.now(); left.textContent = predTimeLeft(ms); bar.style.transform = `scaleX(${Math.min(Math.max(ms / 1000 / pred.duration, 0), 1)})`; };
      tick();
    } else if (pred.state === 'LOCKED') timing = element('div', 'kpr-time', element('p', null, PRED_TEXT.closed));
    const box = failBox();
    const update = async (body, otherwise) => {
      busy(true); box.hidden = true;
      const r = await askKick(w, url('/predictions/' + encodeURIComponent(pred.id)), 'PATCH', body);
      if (!p.card.isConnected) return;
      busy(false);
      if (r.ok) return reload();
      fail(box, updateFailText(r, otherwise));
    };
    const buttons = voted ? null : foot(btn(PRED_TEXT.delete, 'text', () => remove(pred)),
      pred.state === 'ACTIVE' ? btn(PRED_TEXT.endSubmissions, 'grey', () => update({ state: 'LOCKED' }, PRED_TEXT.endFailed)) : null,
      pred.state === 'LOCKED' ? btn(PRED_TEXT.chooseOutcome, 'green', () => choose(pred)) : null);
    show('manage', PRED_TEXT.manage,
      voted ? alertBox('info', 'info', PRED_TEXT.limited, PRED_TEXT.limitedDescription) : null,
      summary(pred), outcomes(pred), timing, box, buttons);
    // The time left counts down; Kick's page hears the votes as they come in, here the window asks again every 5 seconds
    // while it's on this step (and not saying why Kick said no). Showing it again starts a new count (one timer per window).
    let n = 0;
    const again = () => winTimer(w, 'kpred', () => {
      if (!p.card.isConnected || step !== 'manage') return;
      tick?.();
      if (++n % 5 || !box.hidden) again(); else reload();
    }, 1000);
    again();
  }

  // Choose outcome: pick the winner (this ends the prediction and pays out)
  function choose(pred){
    let chosen = null;
    const err = element('p', { class: 'kpr-err', hidden: true }, kickIcon('crossCircle'), element('span', null, PRED_TEXT.outcomeRequired));
    const sure = para('kpr-d');
    sure.hidden = true;
    const picks = pred.outcomes.slice(0, 2).map((o, i) => {
      const b = element('button', { type: 'button', class: 'kpr-pick', 'aria-pressed': 'false' },
        kickIcon(i ? 'two' : 'one'), element('b', null, String(o.title)), kickIcon('check', 'ki tick'));
      b.onclick = () => {
        chosen = o; err.hidden = true;
        picks.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        sure.replaceChildren(PRED_TEXT.outcomeText[0], element('b', null, `"${o.title}"`), PRED_TEXT.outcomeText[1], predNum(o.total_vote_amount),
          PRED_TEXT.outcomeText[2], element('br'), element('br'), element('span', 'kpr-warn', PRED_TEXT.outcomeNote));
        sure.hidden = false;
      };
      return b;
    });
    const box = failBox();
    const go = async () => {
      if (!chosen){ err.hidden = false; return; }
      busy(true); box.hidden = true;
      const r = await askKick(w, url('/predictions/' + encodeURIComponent(pred.id)), 'PATCH', { state: 'RESOLVED', winning_outcome_id: chosen.id });
      if (!p.card.isConnected) return;
      busy(false);
      if (r.ok) return reload();
      fail(box, updateFailText(r, PRED_TEXT.chooseFailed));
    };
    show('choose', PRED_TEXT.chooseOutcome,
      element('div', 'kpr-f', element('span', 'kpr-l sub', PRED_TEXT.options), element('div', 'kpr-picks', picks), err), sure, box,
      foot(btn(PRED_TEXT.cancel, 'text', () => manage(pred, false)), btn(PRED_TEXT.chooseOutcome, 'green', go)));
  }

  // Delete: the prediction goes and everyone's points come back
  function remove(pred){
    const box = failBox();
    const go = async () => {
      busy(true); box.hidden = true;
      const r = await askKick(w, url('/predictions/' + encodeURIComponent(pred.id)), 'PATCH', { state: 'CANCELLED' });
      if (!p.card.isConnected) return;
      busy(false);
      if (r.ok) return reload();
      fail(box, updateFailText(r, PRED_TEXT.deleteFailed));
    };
    show('delete', PRED_TEXT.deletePrediction,
      para('kpr-d', PRED_TEXT.deleteText, element('br'), element('br'), element('span', 'kpr-red', PRED_TEXT.deleteNote(predNum(predTotal(pred))))), box,
      foot(btn(PRED_TEXT.goBack, 'text', () => manage(pred, false)), btn(PRED_TEXT.deleteAndReturn, 'danger', go)));
  }

  // The last one, finished: its result, and a new one
  const resolved = pred => show('resolved', PRED_TEXT.manage, summary(pred, pred.winning_outcome_id), outcomes(pred, pred.winning_outcome_id),
    foot(btn(PRED_TEXT.cancel, 'text', p.close), btn(PRED_TEXT.start, 'green', () => { values = blank(); form(); })));

  load();
  return p.card;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.openPredictionForm = openPredictionForm; window.kickApi = kickApi;   // for the tests
}

export { init, openPredictionForm };
