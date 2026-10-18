import { $ } from '../../core.js';
import { chipFor } from './connected.js';
import { linkActivity, linkIcon, linkOn, linkState } from '../../platforms/pear-drops.js';
import { element } from '../../shared/element.js';
import { fromApp } from '../../shared/incoming.js';
import { store } from '../../shared/store.js';

/* ---- Settings › Connected apps › Activity: what went between this app and Pear Drops this run (src/main/activity.js),
   newest first. The totals, a chart of the last 30 minutes, and the messages a page at a time, as many as fit (Settings
   never scrolls), each in plain words; a click shows its fields. It takes the place of the card; the back arrow or Esc
   go back. Text from the messages comes from Kick through Pear Drops: it only goes in as text. ---- */
const ACT_ROW_H = 46;              // px: a row, its border included (activity.css .act-row)
const ACT_FLASH_MS = 1600;         // how long a new row stays lit
const PD = 'Pear Drops', ME = 'Stream Multiview';
const ACT_FILTERS = [['all', 'All'], ['out', 'Sent'], ['in', 'Received'], ['problems', 'Problems']];
const actSvg = p => `<svg viewBox="0 0 24 24">${p}</svg>`;
const ACT_IC = {
  back: actSvg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  out: actSvg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  in: actSvg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  alert: actSvg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  pulse: actSvg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  link: actSvg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  prev: actSvg('<path d="M15 6l-6 6 6 6"/>'),
  next: actSvg('<path d="M9 6l6 6-6 6"/>'),
  top: actSvg('<path d="M6 15l6-6 6 6"/>'),
  copy: actSvg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  check: actSvg('<path d="M5 12l5 5 9-10"/>')
};
const act = {
  open: false,
  filter: 'all',
  before: null,          // the page: entries older than this one (null: the newest)
  pages: [],             // the `before` of each newer page, for Newer
  limit: 6,
  data: null,
  shown: null,           // the entry open with its fields
  seen: Infinity,        // the newest entry already shown: newer ones flash as they come in
  lit: new Map(),        // entry -> when it came in
  copied: null,
  loading: false,
  queued: false
};
let actView, actPane, actCard, actLogo = '';

const actSize = b => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? (b / 1024).toFixed(b >= 102400 ? 0 : 1) + ' KB' : b + ' B');
const actMs = ms => (ms < 1 ? '<1 ms' : Math.round(ms) + ' ms');
const actClock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const actTime = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const actAgo = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; };
const actNames = list => (Array.isArray(list) && list.length ? list.join(', ') : 'nothing');
const actPlural = (n, one) => n + ' ' + one + (n === 1 ? '' : 's');

// drops.farming's state, in words (null with no state: its fields say it).
function farmingWords(f){
  if (!f.state) return null;
  if (f.state === 'farming' && f.drop){
    const where = f.channel && (f.channel.name || f.channel.slug), p = f.drop.progress;
    return 'Farming ' + (f.drop.campaign || f.drop.category || 'a drop') + (where ? ' on ' + where : '') + (p ? ' · ' + Math.floor(p.done) + ' of ' + p.total + ' min' : '');
  }
  return { farming: 'Farming', paused: 'Paused', done: 'Every drop is done', 'signed-out': 'Signed out of Kick', waiting: 'Waiting for a stream with drops' }[f.state] || 'State: ' + f.state;
}

// players' state (what this app sends), in words.
function playersWords(p){
  const k = p && p.platforms && p.platforms.kick;
  if (!k || !k.open || !k.open.length) return 'No Kick players open';
  const mode = { 'signed-in': 'always signed in', 'signed-out': 'always signed out', auto: 'signed out while you farm' }[k.mode] || k.mode;
  return actPlural(k.open.length, 'Kick player') + ' open, ' + (k.signedIn ? 'signed in' : 'signed out') + (mode ? ' · ' + mode : '');
}

// One entry in plain words, from this app's side: { title (the method, or what happened), kind, text }.
function describeActivity(e){
  if (e.kind === 'status' || e.kind === 'note') return { title: e.kind === 'note' ? 'Noticed' : 'Link', kind: e.kind, text: e.text || '' };
  const d = e.data && typeof e.data === 'object' ? e.data : {}, mine = e.dir === 'out';
  if (e.kind === 'error') return { title: e.method || 'Error', kind: 'error', text: (d.message || 'Failed') + (Number.isInteger(d.code) ? ' (' + d.code + ')' : '') };
  const words = {
    'link.hello': { request: mine ? 'Said hello to ' + PD : PD + ' said hello', reply: mine ? 'Hello back to ' + PD : PD + ' said hello back' },
    'link.auth': { request: 'The pairing proof', reply: 'Pairing proof accepted' },
    'link.subscribe': {
      request: mine ? 'Asked ' + PD + ' for ' + actNames(d.events) : PD + ' asked for ' + actNames(d.events),
      reply: mine ? 'Will send ' + actNames(d.subscribed) : PD + ' will send ' + actNames(d.subscribed)
    },
    'link.unpair': { request: mine ? 'Asked ' + PD + ' to forget the pairing' : PD + ' asked to forget the pairing', reply: 'The pairing is forgotten' },
    'link.bye': { event: 'Goodbye' + (d.reason ? ': ' + d.reason : '') },
    'drops.farming.changed': { event: farmingWords(d) },
    'drops.farming.get': { request: mine ? 'Asked ' + PD + " what's being farmed" : PD + " asked what's being farmed", reply: farmingWords(d) },
    'drops.farming.show': { request: mine ? 'Asked ' + PD + ' to come to the front' : PD + ' asked to be shown', reply: d.shown ? 'Shown' : 'Not shown' },
    'players.changed': { event: playersWords(d) },
    'players.get': { request: mine ? 'Asked ' + PD + ' about its players' : PD + ' asked about the players', reply: playersWords(d) }
  }[e.method];
  const fields = Object.keys(d).filter(k => k !== 'seq' && k !== 'at');
  return { title: e.method || 'Message', kind: e.kind, text: (words && words[e.kind]) || (fields.length ? fields.join(', ') : 'No fields') };
}

// A message's fields as [path, value], arrays as how many items: the first `max`, and how many more.
function activityFields(data, max = 8){
  const out = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) out.push([path, actPlural(v.length, 'item')]);
    else if (v && typeof v === 'object'){
      const keys = Object.keys(v);
      if (!keys.length) out.push([path || '(empty)', '{}']);
      for (const k of keys) walk(v[k], path ? path + '.' + k : k);
    } else out.push([path, v === null ? 'null' : String(v)]);
  };
  walk(data == null ? {} : data, '');
  return { fields: out.slice(0, max), more: Math.max(0, out.length - max) };
}

async function loadActivity(){
  if (!act.open) return;
  if (act.loading){ act.queued = true; return; }
  act.loading = true;
  const data = await linkActivity({ filter: act.filter, before: act.before, limit: act.limit });
  act.loading = false;
  if (!act.open) return;
  if (act.queued){ act.queued = false; loadActivity(); return; }
  act.data = data;
  renderActivity();
}

function openActivity(){
  Object.assign(act, { open: true, filter: 'all', before: null, pages: [], data: null, shown: null, seen: Infinity, copied: null });
  act.lit.clear();
  actPane.classList.add('act-on');
  actView.hidden = false;
  renderActivity();
  loadActivity();
}
function closeActivity(){
  if (!act.open) return;
  act.open = false; act.data = null;
  actPane.classList.remove('act-on');
  actView.hidden = true;
  actView.replaceChildren();
}

const actGo = change => { Object.assign(act, { shown: null }, change); loadActivity(); };
function actOlder(){
  const last = act.data && act.data.entries[act.data.entries.length - 1];
  if (!last) return;
  act.pages.push(act.before);
  actGo({ before: last.n });
}
const actNewer = () => actGo({ before: act.pages.length ? act.pages.pop() : null });
const actNewest = () => actGo({ before: null, pages: [] });
const actFilter = f => actGo({ filter: f, before: null, pages: [] });

async function actCopy(e){
  const text = JSON.stringify({ method: e.method, kind: e.kind, dir: e.dir, at: new Date(e.at).toISOString(), id: e.id, data: e.data }, null, 2);
  try { await navigator.clipboard.writeText(text); } catch {}
  act.copied = e.n; renderActivity();
  setTimeout(() => { if (act.copied === e.n){ act.copied = null; renderActivity(); } }, 1500);
}

// The four tiles: sent, received, the heartbeat (when Pear Drops was last heard: it asks, this side answers), problems.
function actTiles(d){
  const t = (d && d.totals) || { sent: 0, received: 0, bytesOut: 0, bytesIn: 0, heard: null };
  const tile = (cls, ic, label, value, sub) => element('div', 'act-tile ' + cls,
    element('span', { class: 'act-tile-label', html: ACT_IC[ic] }, label),
    element('span', 'act-tile-value', element('b', null, String(value)), sub ? element('em', null, sub) : null));
  return element('div', 'act-tiles',
    tile('out', 'out', 'Sent', t.sent, actSize(t.bytesOut)),
    tile('in', 'in', 'Received', t.received, actSize(t.bytesIn)),
    tile('beat', 'pulse', 'Heartbeat', t.heard ? actAgo(t.heard) : '—', t.heard ? 'last heard' : ''),
    tile(d && d.problems ? 'bad' : 'calm', 'alert', 'Problems', (d && d.problems) || 0, ''));
}

// Messages a minute, the last 30: sent (the accent colour) under received (blue), a red dot for a problem.
function actChart(minutes){
  const top = Math.max(4, ...minutes.map(m => m.out + m.in));
  const last = Math.floor(Date.now() / 60000);
  const pct = n => (n / top * 100) + '%';
  const cols = minutes.map((m, i) => {
    const tip = actClock((last - minutes.length + 1 + i) * 60000) + ' · ' + m.out + ' sent, ' + m.in + ' received' + (m.bad ? ', ' + actPlural(m.bad, 'problem') : '');
    return element('div', { class: 'act-col', title: tip },
      m.out ? element('i', { class: 'act-seg out', style: { height: pct(m.out) } }) : null,
      m.in ? element('i', { class: 'act-seg in', style: { height: pct(m.in) } }) : null,
      m.bad ? element('i', 'act-bad') : null);
  });
  return element('div', 'act-chart',
    element('div', 'act-chart-head', element('b', null, 'Last 30 minutes'),
      element('span', 'act-legend', element('i', 'out'), 'Sent', element('i', 'in'), 'Received', element('i', 'bad'), 'Problem')),
    element('div', 'act-cols', cols),
    element('div', 'act-axis', element('span', null, '30 min ago'), element('span', null, '15 min'), element('span', null, 'now')));
}

function actBar(d){
  const tabs = element('div', 'act-filters', ACT_FILTERS.map(([id, label]) => element('button', { type: 'button', class: 'act-filter' + (act.filter === id ? ' on' : ''), dataset: { f: id }, onclick: () => actFilter(id) },
    label, id === 'problems' && d && d.problems ? element('span', 'act-count', String(d.problems)) : null)));
  if (!d || !d.total) return element('div', 'act-bar', tabs);
  const first = d.newer + 1, lastN = d.newer + d.entries.length;
  return element('div', 'act-bar', tabs, element('div', 'act-pager',
    act.before !== null ? element('button', { type: 'button', class: 'btn act-newest', html: ACT_IC.top, onclick: actNewest }, 'Newest') : null,
    element('span', 'act-range', first + '–' + lastN + ' of ' + d.total),
    element('button', { type: 'button', class: 'btn act-newer', title: 'Newer', html: ACT_IC.prev, disabled: act.before === null, onclick: actNewer }),
    element('button', { type: 'button', class: 'btn act-older', title: 'Older', html: ACT_IC.next, disabled: lastN >= d.total, onclick: actOlder })));
}

function actRow(e, now){
  const w = describeActivity(e);
  const lit = act.lit.has(e.n) ? { animationDelay: -(now - act.lit.get(e.n)) + 'ms' } : null;
  const time = element('span', 'act-time', actTime(e.at));
  if (e.kind === 'status' || e.kind === 'note')
    return element('div', { class: 'act-row act-marker tone-' + (e.tone || 'plain') + (lit ? ' fresh' : ''), dataset: { n: e.n }, style: lit },
      time, element('span', 'act-rule'), element('span', { class: 'act-pill', html: ACT_IC[e.kind === 'note' ? 'alert' : 'link'] }, element('span', null, w.text)), element('span', 'act-rule'));
  const cap = (e.method || '').startsWith('link.') ? 'link' : (e.method || '').startsWith('players.') ? 'players' : 'drops';
  const open = act.shown === e.n;
  const head = element('button', { type: 'button', class: 'act-row ' + e.dir + ' k-' + e.kind + (open ? ' open' : '') + (lit ? ' fresh' : ''), dataset: { n: e.n }, style: lit,
    onclick: () => { act.shown = open ? null : e.n; renderActivity(); } },
    time,
    element('span', { class: 'act-dir', title: e.dir === 'out' ? ME + ' → ' + PD : PD + ' → ' + ME, html: ACT_IC[e.kind === 'error' ? 'alert' : e.dir === 'out' ? 'out' : 'in'] }),
    element('span', 'act-body',
      element('span', 'act-title', element('span', 'act-method cap-' + cap, w.title), element('span', 'act-kind', w.kind)),
      element('span', 'act-text', w.text)),
    element('span', 'act-meta', e.ms != null ? element('span', null, actMs(e.ms)) : null, e.bytes ? element('span', null, actSize(e.bytes)) : null));
  if (!open) return head;
  const hidden = e.data === undefined;
  const { fields, more } = activityFields(e.data);
  const body = hidden
    ? element('p', 'act-hidden', "Not shown: the hello and the pairing proof hold the pairing's secrets.")
    : element('dl', 'act-fields', fields.map(([k, v]) => element('div', null, element('dt', null, k), element('dd', { title: v.length > 80 ? v : null }, v.length > 80 ? v.slice(0, 80) + '…' : v))));
  const foot = element('div', 'act-detail-foot',
    element('span', null, [e.id != null ? 'id ' + e.id : '', more ? '+' + actPlural(more, 'more field') : ''].filter(Boolean).join(' · ')),
    hidden ? null : element('button', { type: 'button', class: 'btn act-copy', html: ACT_IC[act.copied === e.n ? 'check' : 'copy'], onclick: () => actCopy(e) }, act.copied === e.n ? 'Copied' : 'Copy JSON'));
  return [head, element('div', 'act-detail', body, foot)];
}

function actEmpty(d){
  const [ic, title, text] = !linkOn()
    ? ['link', 'Connect is off', 'Switch on Connect with ' + PD + ', and the messages between the two show here as they happen.']
    : act.filter === 'problems' ? ['check', 'No problems', 'Everything between ' + ME + ' and ' + PD + ' went through this run.']
      : act.filter !== 'all' ? ['pulse', 'Nothing yet', 'Nothing ' + (act.filter === 'out' ? 'sent' : 'received') + ' this run.']
        : ['pulse', 'Nothing yet', 'Messages between ' + ME + ' and ' + PD + ' show here as they happen.'];
  return d ? element('div', 'act-empty', element('span', { class: 'act-empty-ic', html: ACT_IC[ic] }), element('b', null, title), element('span', null, text)) : null;
}

function renderActivity(){
  if (!act.open) return;
  const d = act.data, now = Date.now();
  // rows that came in since the last look flash once
  const seen = act.seen === Infinity ? (d ? d.latest : 0) : act.seen;
  for (const e of (d && d.entries) || []) if (e.n > seen && !act.lit.has(e.n)) act.lit.set(e.n, now);
  for (const [n, at] of act.lit) if (now - at > ACT_FLASH_MS) act.lit.delete(n);
  if (d && (act.before === null || act.seen === Infinity)) act.seen = d.latest;
  const peer = linkState && linkState.peer;
  const chip = chipFor(linkOn() ? peer : (peer && { ...peer, status: 'off' }));
  const list = element('div', 'act-list', d && d.entries.length ? d.entries.flatMap(e => actRow(e, now)) : actEmpty(d));
  actView.replaceChildren(
    element('div', 'act-top', element('button', { type: 'button', class: 'act-back', title: 'Back to Connected apps', html: ACT_IC.back, onclick: closeActivity }), element('h4', null, 'Activity')),
    element('div', 'act-who', element('img', { class: 'ca-logo act-logo', alt: '', src: actLogo || null }),
      element('div', 'act-who-txt', element('b', null, PD), element('span', null, 'Every message between the two' + (d ? ' since ' + actClock(d.started) : '') + ', kept until ' + ME + ' quits.')),
      element('span', 'ca-chip ' + chip.tone, chip.text)),
    actTiles(d), actChart((d && d.minutes) || Array.from({ length: 30 }, () => ({ out: 0, in: 0, bad: 0 }))), actBar(d), list);
  fitActivity(list);
}

// After drawing: as many rows as the list has room for (it never scrolls), less an open message's fields.
function fitActivity(list){
  if (!list.clientHeight) return;
  const detail = list.querySelector('.act-detail');
  const rows = Math.max(3, Math.floor((list.clientHeight - (detail ? detail.offsetHeight : 0)) / ACT_ROW_H));
  if (rows !== act.limit){ act.limit = rows; loadActivity(); }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  actCard = $('#caPearDrops'); actView = $('#caActivity');
  if (!actCard || !actView) return;
  actPane = actView.closest('.st-pane');
  const btn = actCard.querySelector('.ca-activity');
  actCard.querySelector('.ca-activity-ic').innerHTML = ACT_IC.pulse;
  btn.onclick = openActivity;
  linkIcon().then(src => { actLogo = src || ''; });
  // leaving the tab (or closing Settings) goes back to the card
  new MutationObserver(() => { if (actPane.hidden) closeActivity(); })
    .observe(actPane, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => { if ($('#settingsDlg').hidden) closeActivity(); })
    .observe($('#settingsDlg'), { attributes: true, attributeFilter: ['hidden'] });
  // Esc goes back to the card first, before it closes Settings
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !act.open || actPane.hidden) return;
    const ask = $('#askDlg'); if (ask && !ask.hidden) return;
    e.preventDefault(); e.stopImmediatePropagation();
    closeActivity();
    btn.focus();
  }, true);
  new ResizeObserver(() => { const list = actView.querySelector('.act-list'); if (act.open && list) fitActivity(list); }).observe(actView);
  // new messages: the open log follows them (on its newest page; older pages stay put), and the heartbeat's "ago"
  fromApp('onLinkActivity', () => { if (act.open) loadActivity(); });
  setInterval(() => { if (act.open && act.data && act.data.totals.heard){ const v = actView.querySelector('.act-tile.beat b'); if (v) v.textContent = actAgo(act.data.totals.heard); } }, 1000);
  store.watch('link', renderActivity);
  window.smvActivity = { describeActivity, activityFields, open: openActivity, close: closeActivity, get state(){ return act; } };   // for the tests
}

export { init };
