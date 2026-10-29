import { feedParse } from './feed-parse.js';
import { $, wins } from '../core.js';
import { copyText, devTab } from '../panels/developer/developer.js';
import { PLAT_NAME, platOf } from '../platforms/platforms.js';
import { ask } from '../shared/ask.js';
import { commands } from '../shared/commands.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { fromSite } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { runIn } from '../windows/view.js';

/* ---- Settings › Developer › Chat events (#233): every kind of event the sites' chat connections send ----
   Each chat's reader (in-site/feed.js) counts every kind of thing its connection brings, in every chat you have open
   (read-only, whether ALL shows or not), and sends one of each now and then; the desktop app keeps them
   (main/event-samples.js). The tab sorts them by what ALL does with each: the kinds it knows but hasn't heard yet
   (what it still needs), the ones it doesn't know, and the ones it shows. Export saves them without names, ids or
   words, to hand over for fixing ALL's readers (chat/feed-parse.js) and testing them with what the sites really send. */
let samplesOn = true;
const evs = { open: '' };       // the kind whose samples are open ("<site> <kind>")
const EV_SITES = ['kick', 'twitch', 'youtube'];
const EV_SAMP_JS = on => `window.__kmvFeed && (window.__kmvFeed.samp = ${!!on})`;

// A chat page's reader (feedReady in chat/all-chat.js loads it): counting, or not
function sampleIn(view){ runIn(view, EV_SAMP_JS(samplesOn)); }
function setSamples(on){
  samplesOn = !!on;
  settings.set('eventSamples', samplesOn ? '1' : '0');
  wins.forEach(w => { if (w.kind === 'chat' && w.ready && w.view) runIn(w.view, EV_SAMP_JS(samplesOn)); });
  renderEvents();
}
const evAgo = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const evCount = n => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
// A sample as it came: JSON laid out (a string of JSON inside it too), a chat line as it is
function evPretty(x){
  const deep = v => (typeof v === 'string' && /^\s*[{[]/.test(v) ? (() => { try { return deep(JSON.parse(v)); } catch { return v; } })() : Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, y]) => [k, deep(y)])) : v);
  try { return JSON.stringify(deep(JSON.parse(x)), null, 2); } catch { return String(x); }
}

// The tab (Settings › Developer › Chat events), in the Developer page's list
async function renderEvents(){
  const list = $('#devList'), pane = $('#settingsDlg .st-pane[data-s="developer"]');
  if (!list || !pane || pane.hidden || devTab() !== 'events') return;
  const d = (DESKTOP && window.kmv.samplesInfo ? await window.kmv.samplesInfo().catch(() => null) : null) || {};
  if (devTab() !== 'events') return;
  const known = feedParse.KNOWN, rows = [], needed = [];
  EV_SITES.forEach(s => {
    const got = d[s] || {};
    Object.entries(got).forEach(([kind, e]) => { const q = !known[s][kind] && feedParse.QUIET[s].test(kind); rows.push({ s, kind, e, quiet: q, does: known[s][kind] || (q ? 'the connection’s own' : '') }); });
    Object.entries(known[s]).forEach(([kind, does]) => { if (!got[kind]) needed.push({ s, kind, does }); });
  });
  const unknown = rows.filter(r => !r.does).sort((a, b) => b.e.first - a.e.first), shown = rows.filter(r => r.does).sort((a, b) => a.quiet - b.quiet || b.e.n - a.e.n);
  const tab = $('#devTabs [data-t=events] .dv-n'); if (tab) tab.textContent = unknown.length ? `(${unknown.length} new)` : '';
  const site = s => element('span', 'dv-site dv-' + s, PLAT_NAME[s]);
  const row = r => {
    const key = r.s + ' ' + r.kind, open = evs.open === key, fresh = !r.does && Date.now() - r.e.first < 86400000;
    return [element('button', { type: 'button', class: 'ev-row' + (open ? ' open' : '') + (r.does ? '' : ' ev-unk') + (r.quiet ? ' ev-quiet' : ''), 'aria-expanded': String(open), dataset: { cmd: 'dev.eventOpen' },
      title: r.e.samples.length ? (open ? 'Hide its samples' : 'Show its samples') : 'Counted (no sample kept yet)', onclick: () => { evs.open = open ? '' : key; renderEvents(); } },
      site(r.s), element('span', 'ev-k', element('span', 'ev-kt', r.kind), fresh && element('em', 'ev-new', 'new')), element('span', 'ev-does', r.does || 'not in ALL yet'),
      element('span', 'ev-n', '×' + evCount(r.e.n)), element('span', 'ev-ago', evAgo(r.e.last))),
    open && element('div', 'ev-samples', ...(r.e.samples.length ? [...r.e.samples].reverse().map(x => element('div', 'ev-sample',
      element('div', 'ev-sh', element('span', null, evAgo(x.t)), element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'dev.eventCopy' }, onclick: () => copyText(x.x, 'Copied the sample (as it came: with names)') }, 'Copy')),
      element('pre', null, evPretty(x.x)))) : [element('div', 'dv-empty', 'Counted, but no sample kept yet: one comes within a minute of the next.')]))];
  };
  const section = (cls, title, sub, items) => element('section', 'ev-sec ' + cls, element('div', 'ev-h', element('b', null, title), element('small', null, sub)), ...items);
  list.replaceChildren(
    element('div', 'ev-top',
      element('div', 'st-row ev-on', element('span', 'st-t', 'Collect chat events', element('small', null, 'Every chat you have open, read-only. Each kind is counted, with its last 3 samples, kept on this computer.')),
        element('input', { type: 'checkbox', class: 'st-sw', id: 'evOn', checked: samplesOn, onchange: e => setSamples(e.target.checked) })),
      element('div', 'ev-acts',
        element('div', 'ev-stats', ...EV_SITES.map(s => { const k = Object.values(d[s] || {}); return element('span', 'ev-stat', site(s), element('b', null, String(k.length)), ' kinds · ', element('b', null, evCount(k.reduce((a, e) => a + e.n, 0))), ' heard'); })),
        element('button', { type: 'button', class: 'btn primary', id: 'evExport', dataset: { cmd: 'dev.eventsExport' }, title: 'Saves them as a file, with names, ids and the words of messages replaced', onclick: exportEvents }, 'Export…'),
        element('button', { type: 'button', class: 'btn', id: 'evClear', dataset: { cmd: 'dev.eventsClear' }, onclick: clearEvents }, 'Clear'))),
    section('ev-unknown', 'Unknown', 'Sent by the sites, but ALL doesn\'t know them: the newest first', unknown.length ? unknown.flatMap(row) : [element('div', 'dv-empty', samplesOn ? 'Nothing new yet. They show here as the chats you have open hear them.' : 'Collecting is off.')]),
    section('ev-need', 'Still needed', 'ALL knows these, but none has come yet: they show here once one does', needed.length
      ? [element('div', 'ev-chips', ...needed.map(n => element('span', { class: 'ev-chip', title: `${PLAT_NAME[n.s]}: ${n.does}` }, site(n.s), element('span', 'ev-k', n.kind), element('span', 'ev-does', n.does))))]
      : [element('div', 'dv-empty', 'Every kind ALL knows has come at least once.')]),
    section('ev-shown', 'In ALL', 'What it already shows, the most heard first', shown.length ? shown.flatMap(row) : [element('div', 'dv-empty', 'None heard yet.')]));
}
async function exportEvents(){
  if (!DESKTOP || !window.kmv.samplesExport) return;
  const r = await window.kmv.samplesExport(feedParse.KNOWN, Object.fromEntries(EV_SITES.map(s => [s, feedParse.QUIET[s].source]))).catch(() => null);
  if (r && r.saved) flash('Saved the chat events, without names, ids or words', { subject: 'downloads' });
  else if (r && r.error) flash('Couldn’t save the file');
}
async function clearEvents(){
  if (!(await ask('Clear the chat events?', 'Every kind heard so far and its samples go. New ones are collected again from now.', { ok: 'Clear' }))) return;
  if (window.kmv.samplesClear) await window.kmv.samplesClear().catch(() => {});
  evs.open = ''; renderEvents(); flash('Cleared the chat events');
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  samplesOn = settings.flag('eventSamples', true);
  fromSite('samples', (w, json) => {
    if (!samplesOn || !DESKTOP || !window.kmv.samplesAdd) return;
    let d; try { d = JSON.parse(json); } catch { return; }
    if (d && d.k && typeof d.k === 'object') window.kmv.samplesAdd(platOf(w.channel), d.k);
  });
  commands.add([
    { id: 'dev.eventsExport', group: 'Developer', title: 'Export chat events', sub: 'Every kind the sites send, without names, ids or words', words: ['samples', 'developer', 'events'], icon: 'download', button: '#evExport', when: () => DESKTOP },
    { id: 'dev.eventsClear', group: 'Developer', title: 'Clear the chat events kept', icon: 'bin', button: '#evClear', when: () => DESKTOP }
  ]);
  settings.onChange('eventSamples', (_n, v) => { samplesOn = v !== '0'; renderEvents(); });
  window.chatEvents = { renderEvents, setSamples };   // for the tests
}

export { init, renderEvents, sampleIn };
