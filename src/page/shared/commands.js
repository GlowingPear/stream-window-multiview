import { fuzzy } from './fuzzy.js';
import { settings } from './settings.js';

// Everything the search box (Ctrl/⌘+K, palette/palette.js) can find and do. Each part of the app registers its own
// in its init(), so the box never needs to know the parts:
//   commands.add({ id: 'layout.stage', kind: 'layout', group: 'Layouts', title: 'Chat Stage', sub: 'One stream and its chat…',
//     words: ['big chat'], icon: 'layout', keys: 'K',
//     when: () => ROLE === 'main',                            // left out while false
//     disabled: () => !wins.length && 'Open a stream first',  // shown greyed, with the reason
//     run: () => layoutPick('stage'),
//     toggle: { get: () => on, set: on => … } })               // a switch instead: Enter flips it
//   commands.add({ id: 'popout', button: '#popBtn', … })       // runs that button's own click, so the two can't differ
//                                                              // (there while it isn't hidden, greyed while it's disabled)
//   commands.provide('channels', q => [...])                   // lists that change, asked for on every key
// An item can also have: alt (⇧Enter's second choice, with altLabel), more () => [items] (Tab: everything for it),
// buttons [{ label, icon, run }] (a channel's row of actions), avatar / site / live / viewers (how it's drawn),
// boost (a number added to its score: the window you last clicked, live, open…), keep (shown even when nothing
// is typed: the empty box's lists), matched (a provider's own score, for an item that matched in ways the name
// doesn't show: a guide page that mentions the words), fallback (only when nothing else is found).
// What you run is remembered (the 'palette' setting): the empty box's Recent, and used items rank higher (frecency).
// Nothing here touches the page, except a command's button: add() marks it (data-cmd="<id>", for the test that every
// button has a command) and run() clicks it.

// Kinds of item, how a prefix picks them, and which come first when they score the same
const CMD_SCOPES = { '>': { name: 'Actions', kinds: ['action', 'layout', 'theme', 'tab'] }, '@': { name: 'Channels', kinds: ['channel', 'window', 'profile'] },
  '#': { name: 'Settings', kinds: ['setting', 'tab'] }, '?': { name: 'Help', kinds: ['help'] } };
const CMD_RANK = { window: 6, action: 5, layout: 5, tab: 4, channel: 4, theme: 3, setting: 3, profile: 2, help: 2, note: 1 };
const CMD_PER_GROUP = 7, CMD_MAX = 40, CMD_RECENT = 20, CMD_USED = 300;
const CMD_DAY = 86400000;

const cmdItems = new Map();        // id -> item (added)
const cmdProviders = new Map();    // name -> fn(q)
const cmdSeen = new Map();         // id -> the last item a provider gave with that id (so Recent can find it again)

const cmdOn = it => { try { return !it.when || !!it.when(); } catch { return false; } };
const cmdWhy = it => { try { return (it.disabled && it.disabled()) || ''; } catch { return ''; } };
const cmdVal = (v, ...a) => typeof v === 'function' ? v(...a) : v;

function addCommands(list){
  for (const it of [].concat(list)){
    if (!it || !it.id || !it.title) throw new Error('A command needs an id and a title');
    const x = { kind: 'action', group: 'Actions', ...it };
    // a button's command is there while the button is (not hidden), and greyed while it's disabled
    if (typeof it.button === 'string'){
      const b = () => document.querySelector(it.button);
      if (!it.when) x.when = () => { const e = b(); return !!e && !e.hidden; };
      if (!it.disabled) x.disabled = () => { const e = b(); return !!e && e.disabled && (it.offWhy || 'Not available right now'); };
      if (typeof document !== 'undefined') document.querySelectorAll(it.button).forEach(e => { e.dataset.cmd ||= it.id; });
    }
    cmdItems.set(it.id, x);
  }
}
const removeCommand = id => cmdItems.delete(id);
function provideCommands(name, fn){ cmdProviders.set(name, fn); }
// Everything there is right now for what's typed (providers decide for themselves what fits)
function allCommands(q = ''){
  const out = [...cmdItems.values()].filter(cmdOn);
  for (const fn of cmdProviders.values()){
    let got = [];
    try { got = fn(q) || []; } catch {}
    for (const it of got){ if (!it || !it.id) continue; const x = { kind: 'action', group: 'Actions', ...it }; cmdSeen.set(x.id, x); if (cmdOn(x)) out.push(x); }
  }
  return out;
}
function findCommand(id){
  const it = cmdItems.get(id);
  if (it) return cmdOn(it) ? it : null;
  return allCommands('').find(x => x.id === id) || (cmdSeen.has(id) && cmdOn(cmdSeen.get(id)) ? cmdSeen.get(id) : null);
}

/* ---- what you ran: Recent, and how often (frecency) ---- */
function cmdMemory(){
  const m = settings.json('palette', {});
  return { recent: Array.isArray(m.recent) ? m.recent.filter(x => typeof x === 'string') : [], used: m.used && typeof m.used === 'object' ? m.used : {} };
}
function cmdRan(id, now = Date.now()){
  if (!id) return;
  const m = cmdMemory();
  m.recent = [id, ...m.recent.filter(x => x !== id)].slice(0, CMD_RECENT);
  const u = m.used[id] || { n: 0, t: 0 };
  m.used[id] = { n: (+u.n || 0) + 1, t: now };
  const keep = Object.entries(m.used).sort((a, b) => b[1].t - a[1].t).slice(0, CMD_USED);
  m.used = Object.fromEntries(keep);
  settings.set('palette', m);
}
// 12 × log2(1 + times run), halved for every 7 days since it was last run
function cmdFrecency(id, now = Date.now(), m = cmdMemory()){
  const u = m.used[id];
  if (!u || !u.n) return 0;
  return 12 * Math.log2(1 + u.n) * Math.pow(0.5, Math.max(0, now - (+u.t || 0)) / (7 * CMD_DAY));
}
const cmdRecent = () => cmdMemory().recent;

/* ---- searching ---- */
// What's typed, split into its prefix (>, @, # or ?) and the words: { scope, q }
function parseQuery(text){
  const t = String(text || '').replace(/^\s+/, '');
  return CMD_SCOPES[t[0]] ? { scope: t[0], q: t.slice(1).trim() } : { scope: '', q: t.trim() };
}
// -> [{ item, score, match, marks }], best first: at most 7 a group (any number with a prefix) and 40 in all. With nothing typed: everything a
// scope lists, or (keep) the items for the empty box. only: search these items instead (Tab's list for a row).
// Items marked fallback are left out: they're for when nothing else is found (fallbacks()).
function searchCommands(text, { scope = '', only = null, keep = false, now = Date.now() } = {}){
  const p = scope || only ? { scope, q: String(text || '').trim() } : parseQuery(text);
  const kinds = p.scope ? CMD_SCOPES[p.scope].kinds : null;
  const m = cmdMemory();
  const scored = [];
  for (const it of only ? only.filter(cmdOn) : allCommands(p.q)){
    if ((kinds && !kinds.includes(it.kind)) || (it.fallback && !only)) continue;
    let s;
    if (p.q){
      s = fuzzy.scoreItem(p.q, { title: it.title, words: cmdVal(it.words) || [], sub: cmdVal(it.sub) || '' })
        || (it.matched ? { score: it.matched, marks: [] } : null);       // (a provider that searched for itself: the guide's pages)
      if (!s) continue;
    }
    else if (only || p.scope || (keep && it.keep)) s = { score: 0, marks: [] };
    else continue;
    const score = s.score + (p.scope || only ? 0 : (CMD_RANK[it.kind] || 0)) + (+cmdVal(it.boost) || 0) + (only ? 0 : cmdFrecency(it.id, now, m));
    scored.push({ item: it, score, match: s.score, marks: s.marks });
  }
  if (!only || p.q) scored.sort((a, b) => b.score - a.score || a.item.title.length - b.item.title.length || a.item.title.localeCompare(b.item.title));
  // when something matches well, letters scattered through other names don't count
  const best = Math.max(0, ...scored.map(r => r.match));
  const per = new Map(), out = [];
  for (const r of scored){
    if (p.q && best >= 55 && r.match < 35) continue;
    const g = r.item.group, n = per.get(g) || 0;
    if (!only && !p.scope && n >= CMD_PER_GROUP) continue;
    per.set(g, n + 1); out.push(r);
    if (!only && out.length >= CMD_MAX) break;
  }
  return out;
}
// When nothing is found: what's still worth offering for the words (Open "xyz" as a channel, search the guide…)
const cmdFallbacks = text => allCommands(String(text || '').trim()).filter(it => it.fallback);
// The results in groups, each group where its best result is: [{ group, rows: [...] }]
function cmdGrouped(results){
  const gs = [];
  for (const r of results){
    let g = gs.find(x => x.group === r.item.group);
    if (!g) gs.push(g = { group: r.item.group, rows: [] });
    g.rows.push(r);
  }
  return gs;
}

/* ---- running ---- */
// how: 'run' (Enter), 'alt' (⇧Enter), or a button's index. -> '' when it ran, else why it didn't
function runCommand(itemOrId, how = 'run'){
  const it = typeof itemOrId === 'string' ? findCommand(itemOrId) : itemOrId;
  if (!it) return 'Not available here';
  const why = cmdWhy(it);
  if (why) return why;
  if (typeof how === 'number'){
    const b = (cmdVal(it.buttons) || [])[how];
    if (!b) return 'Not available here';
    cmdRan(it.id); b.run(); return '';
  }
  cmdRan(it.id);
  if (how === 'alt' && it.alt){ it.alt(); return ''; }
  if (it.toggle){ it.toggle.set(!it.toggle.get()); return ''; }
  if (it.button){ const b = typeof it.button === 'string' ? document.querySelector(it.button) : cmdVal(it.button); if (!b) return 'Not available here'; b.click(); return ''; }
  if (it.run) it.run();
  return '';
}

const commands = { add: addCommands, remove: removeCommand, provide: provideCommands, all: allCommands, find: findCommand, ran: cmdRan, recent: cmdRecent,
  frecency: cmdFrecency, search: searchCommands, fallbacks: cmdFallbacks, grouped: cmdGrouped, run: runCommand, parse: parseQuery, disabledWhy: cmdWhy, SCOPES: CMD_SCOPES };

export { commands };
