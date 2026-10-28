import { alerts } from '../alerts/alerts.js';
import { SmvSpam } from '../alerts/spam.js';
import { feedParse } from './feed-parse.js';
import { wins } from '../core.js';
import { feedAgent, profileAgent, replyAgent, seekAgent } from '../in-site/feed.js';
import { modAgent } from '../in-site/mod.js';
import { sendAgent } from '../in-site/send.js';
import { bellVars, myName } from '../panels/bell/bell.js';
import { infoFor } from '../panels/channels/channels.js';
import { linkOpt, nameOf, streamerBots, streamerOf } from '../platforms/linked.js';
import { PLAT_NAME, modOk, modUrl, platOf, platform } from '../platforms/platforms.js';
import { ask } from '../shared/ask.js';
import { element } from '../shared/element.js';
import { DESKTOP, keyName } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromSite } from '../shared/incoming.js';
import { closeOnOutside } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { focusChatBox, frameOf, leaderOf, renderSiteTabs, showTab, tabChannels } from '../windows/frames.js';
import { askIn, runIn } from '../windows/view.js';

/* ---- ALL: a linked streamer's Kick, Twitch and YouTube chats as one list (issue #203) ----
   An ALL tab before the site tabs of a linked streamer's chat window. It covers the chat you watched with the app's
   own list; the site tabs stay as they are (loaded, playing their part), and clicking one shows that site's chat
   again. The messages come from each site's own connection, heard inside its chat page (in-site/feed.js, read by
   chat/feed-parse.js): only while ALL shows, and only from the tabs that are open (an offline site's isn't loaded).
   Each line has its site's icon and the sender's badges. Messages to you are marked (an @ green, a reply blue),
   bots on the app's chat bot list or the streamer's own are a line each with the text hidden (Show opens one),
   and a deleted message stays struck through with who or what deleted it (Kick's AI moderation and its rule). */
const MAX = 400;                       // lines kept for each streamer
const feeds = new Map();               // streamer id -> { msgs: [], byId: Map }
let botsShown = false;                 // "Bots: shown" (the chip; a saved setting)
let eventsMode = 'short';              // subs, gifts, raids, Super Chats: 'short' (one line), 'full' (the site's words) or 'hidden'

// Whether a window has an ALL tab: a chat window of a linked streamer with tabs for more than one site
function allTabFor(w){
  if (!w || w.kind !== 'chat' || !streamerOf(w.channel)) return false;
  const lead = leaderOf(w);
  return linkOpt('allTab') !== false && !lead.split && !lead.sbs && tabChannels(w).length > 1;
}
const allOpen = () => { const l = settings.json('allOpen', []); return Array.isArray(l) ? l : []; };
// Whether ALL is what the window shows (remembered for each streamer)
const allOn = w => allTabFor(w) && allOpen().includes(streamerOf(w.channel).id);
function setAll(w, on){
  const s = streamerOf(w.channel); if (!s) return;
  const list = allOpen().filter(id => id !== s.id);
  settings.set('allOpen', on ? [...list, s.id] : list);
  syncAll();
  frameOf(w).forEach(renderSiteTabs);
  store.changed('tabs');
  if (on) leaderOf(w).el.querySelector('.all-list')?.focus({ preventScroll: true });
}
const feedOf = s => { let f = feeds.get(s.id); if (!f){ f = { msgs: [], byId: new Map() }; feeds.set(s.id, f); } return f; };

/* ---- what the chats hand over ---- */
// Your name on that site: messages to it are marked
const meOn = site => (site === 'kick' ? myName : site === 'twitch' ? bellVars.myTwitch : '').toLowerCase();
const appBots = ch => [...(alerts.mention.bots || SmvSpam.BOTS), ...streamerBots(ch)];
function ingest(w, json){
  const s = streamerOf(w.channel); if (!s) return;
  let batch; try { batch = JSON.parse(json); } catch { return; }
  const f = feedOf(s), view = viewFor(s);
  feedParse.parseFeed(batch).forEach(m => {
    if (m.kind === 'delete' || m.kind === 'clear') return removed(f, view, m);
    m.ch = w.channel;
    const me = meOn(m.site);
    if (me && m.reply && m.reply.login === me) m.toMe = 'reply';
    else if (me && m.parts.some(p => p.text && new RegExp(`(^|[^\\w])@${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p.text))) m.toMe = 'at';
    if (m.kind === 'message' && SmvSpam.ignored(m.sender, appBots(w.channel))) m.bot = true;
    f.msgs.push(m); if (m.id) f.byId.set(m.site + ':' + m.id, m);
    if (f.msgs.length > MAX){ const old = f.msgs.shift(); if (old.id) f.byId.delete(old.site + ':' + old.id); }
    if (view) addLine(view, m);
  });
}
// A deleted message, or all of one person's (a timeout or ban): it stays, struck through, saying why
function removed(f, view, d){
  const hit = d.kind === 'delete' ? [f.byId.get(d.site + ':' + d.target)].filter(Boolean)
    : f.msgs.filter(m => m.site === d.site && (d.login ? m.login === d.login : m.userId === d.userId) && m.kind === 'message');
  hit.forEach(m => {
    m.deleted = d.ai ? { ai: true, rules: d.rules || [] } : { by: d.kind === 'clear' ? (d.until ? 'timeout' : 'ban') : '' };
    const line = view && view.list.querySelector(`.al-m[data-key="${CSS.escape(m.site + ':' + m.id)}"]`);
    if (line) line.replaceWith(lineEl(m));
  });
}

/* ---- the view ---- */
const viewFor = s => {
  const lead = wins.find(o => o.kind === 'chat' && !o.hiddenTab && streamerOf(o.channel) === s && allOn(o));
  return lead && lead.allView || null;
};
const SITE_CLASS = { kick: 'k', twitch: 't', youtube: 'y' };
const BADGE_TIP = { host: 'Streamer', mod: 'Moderator', vip: 'VIP', sub: 'Subscriber', og: 'OG', verified: 'Verified', staff: 'Staff', gifter: 'Sub gifter' };
// a readable colour for a name: the site's, or one from the name
function nameColor(m){
  if (/^#[0-9a-f]{6}$/i.test(m.color)) return m.color;
  let h = 0; for (const c of m.login || m.sender) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 68%)`;
}
function partsEl(parts){
  return parts.map(p => {
    if (!p.emote) return p.text;
    const img = element('img', { class: 'al-e', src: p.emote, alt: p.name, title: p.name, loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.onerror = () => img.replaceWith(document.createTextNode(p.name));
    return img;
  });
}
function lineEl(m){
  const site = PLAT_NAME[m.site] || m.site;
  const who = element('span', 'al-who', element('i', { class: 'pi pi-' + m.site, title: site }, site[0]),
    ...m.badges.map(b => element('i', { class: 'al-b al-b-' + b, title: BADGE_TIP[b] || b, html: BADGE_SVG[b] || '' })));
  const can = m.kind === 'message' && canModerate(m);
  const name = element('b', { class: 'al-n' + (can ? ' can' : ''), style: { color: nameColor(m) }, role: 'button', tabindex: '-1', dataset: { cmd: 'all.profile' },
    title: `${m.sender}'s card on ${site}` + (can ? `\n${kShift()}-click: delete · ${kCtrl()}-click: time out (${durText(lastTimeout())}) · ${kCtrl()}+${kShift()}-click: ban` : ''),
    onclick: e => nameClick(m, e) }, m.sender);
  if (m.kind === 'event'){
    if (eventsMode === 'hidden') return null;
    const full = eventsMode === 'full' || !m.summary;
    const words = full ? [m.text || m.sender] : m.summary.map((x, i) => x.strong ? element('b', i ? 'al-amt' : null, x.strong) : x.text);
    return element('div', { class: `al-ev al-${SITE_CLASS[m.site]}${full ? ' al-full' : ''}`, dataset: { key: m.site + ':' + m.id } }, element('i', { class: 'pi pi-' + m.site }, site[0]),
      element('span', 'al-evt', element('span', 'al-evw', ...words), m.parts.length ? element('span', 'al-evm', ...partsEl(m.parts)) : ''),
      element('button', { type: 'button', class: 'al-go', dataset: { cmd: 'all.seeIt' }, title: `Show it in ${site}'s own chat`, onclick: () => seeIt(m) }, `See it on ${site} ›`));
  }
  const cls = ['al-m', m.toMe === 'reply' ? 'al-rep' : m.toMe === 'at' ? 'al-me' : '', m.bot ? 'al-bot' : '', m.deleted ? 'al-del' : '', m.highlight ? 'al-hl' : '',
    m.announce ? 'al-ann al-ann-' + m.announce : ''].filter(Boolean).join(' ');
  const hideBot = m.bot && !botsShown && !m.open;
  const body = hideBot ? element('span', 'al-hid', 'bot message hidden') : element('span', 'al-txt', ...partsEl(m.parts));
  const tags = [
    m.toMe === 'at' && element('span', 'al-tag al-tag-at', '@YOU'),
    m.toMe === 'reply' && element('span', { class: 'al-tag al-tag-rp' + (m.bot ? ' soft' : '') }, m.bot ? 'TO YOU' : 'REPLY'),
    m.toMe === 'at' && m.bot && element('span', 'al-tag al-tag-rp soft', 'TO YOU'),
    m.highlight && element('span', 'al-tag al-tag-hl', 'Highlighted'),
    m.announce && element('span', 'al-tag al-tag-ann', 'Announcement'),
    m.bits && element('span', 'al-tag al-tag-bits', `${m.bits} bits`),
    m.deleted && element('span', { class: 'al-tag al-tag-del' + (m.deleted.ai ? ' ai' : '') },
      m.deleted.ai ? ['Deleted', 'AI moderation', ...m.deleted.rules].join(' · ') : m.deleted.by === 'ban' ? 'Banned' : m.deleted.by === 'timeout' ? 'Timed out' : 'Deleted'),
    m.bot && !botsShown && element('button', { type: 'button', class: 'al-show linkish', dataset: { cmd: 'all.showBot' }, onclick: e => { m.open = !m.open; e.target.closest('.al-m').replaceWith(lineEl(m)); } }, m.open ? 'Hide' : 'Show')
  ].filter(Boolean);
  if (m.toMe === 'at' && m.bot) tags.splice(0, 1);   // (a bot's @: marked as to you, softly)
  const hover = !m.deleted && element('span', 'al-hb',
    element('button', { type: 'button', title: `Reply on ${site}`, 'aria-label': `Reply to ${m.sender} on ${site}`, html: icon.reply, dataset: { cmd: 'all.reply' }, onclick: () => startReply(m) }),
    can && element('button', { type: 'button', title: `Delete on ${site} (${kShift()}-click the name)`, 'aria-label': `Delete ${m.sender}'s message on ${site}`, html: icon.bin, dataset: { cmd: 'all.delete' }, onclick: () => modAct(m, 'delete') }),
    element('span', 'al-hb-div'),
    element('button', { type: 'button', title: 'More', 'aria-label': 'More', html: DOTS, dataset: { cmd: 'all.more' }, onclick: e => openLineMenu(m, e.currentTarget) }));
  return element('div', { class: cls, dataset: { key: m.site + ':' + m.id }, oncontextmenu: e => { e.preventDefault(); openLineMenu(m, e); } }, hover,
    m.reply && element('span', 'al-q', '↩ replying to ', element('b', null, m.reply.login && m.reply.login === meOn(m.site) ? 'you' : m.reply.sender), m.reply.body ? ': ' + m.reply.body : ''),
    element('div', 'al-line', who, name, m.action ? ' ' : ': ', body, ...tags));
}
function addLine(view, m){
  const list = view.list, stick = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const el = lineEl(m); if (!el) return;
  view.empty.hidden = true;
  list.append(el);
  while (list.children.length > MAX) list.firstChild.remove();
  if (stick) list.scrollTop = list.scrollHeight; else view.more.hidden = false;
}
function buildView(w){
  const s = streamerOf(w.channel), f = feedOf(s);
  const list = element('div', { class: 'all-list', tabindex: '-1', role: 'log', 'aria-label': `${nameOf(w.channel)}'s chats together`, 'aria-live': 'off' });
  const empty = element('div', 'all-empty');
  const more = element('button', { type: 'button', class: 'all-more', hidden: true, dataset: { cmd: 'all.latest' }, onclick: () => { list.scrollTop = list.scrollHeight; more.hidden = true; } }, 'New messages ↓');
  list.addEventListener('scroll', () => { if (list.scrollHeight - list.scrollTop - list.clientHeight < 60) more.hidden = true; });
  const chip = element('button', { type: 'button', class: 'all-chip', dataset: { cmd: 'all.bots' }, 'aria-pressed': String(!botsShown), onclick: () => setBotsShown(!botsShown) });
  const evChip = element('button', { type: 'button', class: 'all-chip all-evchip', dataset: { cmd: 'all.events' }, title: 'Subs, gifts, raids and Super Chats: one short line, the site\'s own words, or hidden',
    onclick: () => setEventsMode({ short: 'full', full: 'hidden', hidden: 'short' }[eventsMode]) });
  const pick = element('button', { type: 'button', class: 'all-pick', dataset: { cmd: 'all.sendSite' }, 'aria-haspopup': 'menu' });
  const input = element('input', { type: 'text', class: 'all-in', autocomplete: 'off', spellcheck: true, maxlength: 500, dataset: { cmd: 'all.message' } });
  const menu = element('div', { class: 'pop all-menu', role: 'menu', hidden: true });
  const bar = element('div', { class: 'all-rb', hidden: true });
  const at = element('div', { class: 'pop all-at', role: 'listbox', hidden: true });
  const lm = element('div', { class: 'pop all-lm', role: 'menu', hidden: true });
  const el = element('div', { class: 'all-view' }, element('div', 'all-top', element('span', 'all-sites'), chip, evChip), list, more, empty,
    element('div', 'all-cmp', bar, element('div', 'all-box', pick, input)), menu, at, lm);
  const view = { el, list, empty, more, chip, evChip, s, pick, input, menu, bar, at, lm, w, lock: null, atList: [], atSel: 0 };
  closeOnOutside(lm);
  closeOnOutside(menu, { button: pick });
  pick.onclick = () => { if (view.lock) return flash('Locked to this site · Esc or ✕ unlocks'); if (menu.hidden) openPickMenu(view, w); else menu.hidden = true; };
  input.addEventListener('keydown', e => {
    if (!at.hidden && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)){
      e.preventDefault();
      if (e.key === 'Escape') at.hidden = true;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ view.atSel = (view.atSel + (e.key === 'ArrowDown' ? 1 : -1) + view.atList.length) % view.atList.length; renderAt(view); }
      else pickAt(view, w, view.atList[view.atSel]);
      return;
    }
    if (e.key === 'Escape' && view.lock){ e.preventDefault(); setLock(view, w, null); }
    else if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); sendNow(view, w); }
    else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey){
      e.preventDefault();
      if (view.lock) flash(`Locked to ${PLAT_NAME[platOf(view.lock.ch)]} while ${view.lock.kind === 'reply' ? 'replying' : 'mentioning'} · Esc unlocks`);
      else if (e.shiftKey) leaveAll(w); else stepSend(view, w, 1);
    }
  });
  input.addEventListener('input', () => { suggestAt(view, w); if (!input.value.trim() && view.lock && view.lock.kind === 'at') setLock(view, w, null); });
  list.append(...f.msgs.map(lineEl).filter(Boolean));
  return view;
}
// The sites it hears, the bots chip, and what it says while it has nothing yet
function renderTop(view, w){
  const chs = tabChannels(w), heard = chs.filter(ch => frameOf(w).some(o => o.channel === ch && o.kind === 'chat'));
  view.el.querySelector('.all-sites').replaceChildren(...chs.map(ch => element('i', { class: 'pi pi-' + platOf(ch) + (heard.includes(ch) ? '' : ' dim'), title: `${PLAT_NAME[platOf(ch)]}${heard.includes(ch) ? '' : ': offline'}` }, PLAT_NAME[platOf(ch)][0])));
  view.chip.replaceChildren(element('i', { html: botsShown ? icon.eye : EYE_OFF }), `Bots: ${botsShown ? 'shown' : 'hidden'}`);
  view.chip.setAttribute('aria-pressed', String(!botsShown));
  view.evChip.textContent = `Events: ${eventsMode}`;
  view.evChip.setAttribute('aria-pressed', String(eventsMode !== 'full'));
  const names = heard.map(ch => PLAT_NAME[platOf(ch)]), off = chs.filter(ch => !heard.includes(ch)).map(ch => PLAT_NAME[platOf(ch)]);
  renderCmp(view, w);
  view.empty.replaceChildren(element('b', null, names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.slice(-1)} chats together` : `${names[0] || 'Their'} chat`),
    off.length ? element('span', null, `${off.join(' and ')} ${off.length > 1 ? 'are' : 'is'} offline`) : '', element('small', null, 'New messages show here as they arrive.'));
  view.empty.hidden = !!view.list.children.length;
}

/* ---- sending: Send on [K ▾] (in-site/send.js types it into that site's own chat box) ---- */
// The sites you can send on: their chat is open in this window and loaded; YouTube only once its live chat is found
function sendSites(w){
  return tabChannels(w).filter(ch => {
    const m = frameOf(w).find(o => o.kind === 'chat' && o.channel === ch);
    return !!m && !!m.ready && (platOf(ch) !== 'youtube' || !!infoFor(ch)?.live);
  });
}
const sendSaved = () => { const o = settings.json('allSend', {}); return o && typeof o === 'object' ? o : {}; };
// The site it sends on: the last one used for this streamer, else their main channel, else the first that can
function sendSite(w){
  const lock = w.allView && w.allView.lock; if (lock) return lock.ch;
  const s = streamerOf(w.channel), ok = sendSites(w), was = sendSaved()[s.id];
  return ok.includes(was) ? was : ok.includes(s.main) ? s.main : ok[0] || null;
}
function setSendSite(view, w, ch){
  settings.set('allSend', { ...sendSaved(), [streamerOf(w.channel).id]: ch });
  renderCmp(view, w);
}
function stepSend(view, w, d){
  const ok = sendSites(w), cur = sendSite(w);
  if (ok.length < 2) return flash(ok.length ? `Only ${PLAT_NAME[platOf(ok[0])]} can be sent on right now` : 'No chat to send on right now');
  setSendSite(view, w, ok[(ok.indexOf(cur) + d + ok.length) % ok.length]);
}
function renderCmp(view, w){
  const ch = sendSite(w), p = ch && platOf(ch);
  view.pick.replaceChildren(p ? element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]) : element('i', { class: 'pi dim' }, '–'),
    view.lock ? element('i', { class: 'all-lock', html: icon.lock, title: 'Locked to this site' }) : element('span', 'all-caret', '▾'));
  view.pick.classList.toggle('locked', !!view.lock);
  renderLock(view, w);
  view.pick.title = view.lock ? `Locked to ${PLAT_NAME[p]} while ${view.lock.kind === 'reply' ? 'replying' : 'mentioning'} (Esc unlocks)` : p ? `Sending on ${PLAT_NAME[p]} (Tab: the next site)` : 'No chat to send on right now';
  view.input.placeholder = p ? `Send a message on ${PLAT_NAME[p]}` : 'No chat to send on right now';
  view.input.disabled = !p;
  view.input.maxLength = p === 'youtube' ? 200 : 500;
  view.el.dataset.send = p || '';
}
// The picker's menu: each of their sites, the ones you can't send on with why
function openPickMenu(view, w){
  const ok = sendSites(w), cur = sendSite(w), main = streamerOf(w.channel).main;
  const why = ch => { const i = infoFor(ch); return platOf(ch) === 'youtube' && !(i && i.live) ? 'no live chat found' : i && !i.live ? 'offline' : 'not open'; };
  view.menu.replaceChildren(
    ...tabChannels(w).map(ch => { const p = platOf(ch), can = ok.includes(ch);
      return element('button', { type: 'button', role: 'menuitemradio', class: 'all-mi' + (ch === cur ? ' on' : ''), disabled: !can, 'aria-checked': String(ch === cur), dataset: { cmd: 'all.sendOn' },
        onclick: () => { setSendSite(view, w, ch); view.menu.hidden = true; view.input.focus(); } },
        element('i', { class: 'pi pi-' + p }, PLAT_NAME[p][0]), element('span', null, PLAT_NAME[p] + (can ? '' : ' · ' + why(ch))), ch === main ? element('small', null, 'Main') : ''); }),
    element('div', 'all-mh', element('kbd', null, 'Tab'), ' next site · ', element('kbd', null, '⇧Tab'), ' its own tab'));
  view.menu.hidden = false;
}
// Shift+Tab: from ALL to the site you send on, its own chat (and its box)
function leaveAll(w){
  const ch = sendSite(w) || leaderOf(w).channel, m = frameOf(w).find(o => o.kind === 'chat' && o.channel === ch);
  setAll(w, false);
  if (m){ showTab(m); focusChatBox(m); }
}
const SEND_FAIL = {
  'no-box': p => `Can't chat on ${p} from here: you may need to sign in to ${p} (Settings › Accounts)`,
  disabled: p => `${p} isn't letting you chat right now (followers-only, slow mode or similar)`,
  'not-filled': p => `Couldn't type into ${p}'s chat box`
};
const sender = {
  mod: (m, action, id) => askIn(m.view, `(${modAgent})(${JSON.stringify(action)}, ${JSON.stringify(id)})`),
  send: (m, text) => askIn(m.view, `(${sendAgent})(${JSON.stringify(platOf(m.channel))}, ${JSON.stringify(text)})`),
  reply: (m, id, text) => askIn(m.view, `(async () => (await (${replyAgent})(${JSON.stringify(id)})) ? (${sendAgent})(${JSON.stringify(platOf(m.channel))}, ${JSON.stringify(text)}) : 'no-reply')()`)
};

/* ---- replies, @ and names: the box locks to one site until it's sent or cancelled ---- */
function startReply(m){
  const view = viewFor(streamerOf(m.ch)); if (!view) return;
  if (!sendSites(view.w).includes(m.ch)) return flash(`Can't send on ${PLAT_NAME[m.site]} right now`);
  setLock(view, view.w, { kind: 'reply', ch: m.ch, msg: m });
  view.input.focus();
}
function setLock(view, w, lock){
  view.lock = lock;
  view.at.hidden = true;
  renderCmp(view, w);
}
// The bar over the box: what it's locked to, and ✕
function renderLock(view, w){
  const l = view.lock, bar = view.bar;
  bar.hidden = !l; if (!l) return bar.replaceChildren();
  const p = PLAT_NAME[platOf(l.ch)];
  const words = l.kind === 'reply'
    ? [element('span', 'all-rb-t', 'Replying to ', element('b', null, l.msg.sender), ' on ', element('b', { class: 'all-rb-site' }, p), platform(l.ch).threadedReplies ? '' : ', as an @mention'),
       element('span', 'all-rb-q', '· ' + l.msg.parts.map(x => x.text || x.name).join(''))]
    : [element('span', 'all-rb-t', 'Mentioning on ', element('b', { class: 'all-rb-site' }, p), ` · ${p} names only`)];
  bar.replaceChildren(element('i', { class: 'all-rb-i', html: l.kind === 'reply' ? icon.reply : icon.at }), ...words,
    element('button', { type: 'button', class: 'all-rb-x', title: 'Cancel (Esc)', 'aria-label': 'Cancel', html: icon.close, dataset: { cmd: 'all.unlock' }, onclick: () => { setLock(view, w, null); view.input.focus(); } }));
}
// @ in the box: names seen in their chats, newest first (only the locked site's while locked)
function suggestAt(view, w){
  const v = view.input, upto = v.value.slice(0, v.selectionStart ?? v.value.length), mm = /(^|\s)@([\w.]*)$/.exec(upto);
  if (!mm){ view.at.hidden = true; return; }
  const q = mm[2].toLowerCase(), lockSite = view.lock && platOf(view.lock.ch), seen = new Set(), list = [];
  for (const m of [...feedOf(view.s).msgs].reverse()){
    if (m.kind !== 'message' || m.bot || !m.sender) continue;
    const key = m.site + ':' + m.login;
    if (seen.has(key) || (lockSite && m.site !== lockSite) || !m.sender.toLowerCase().replace(/^@/, '').startsWith(q)) continue;
    if (!sendSites(w).includes(m.ch)) continue;
    seen.add(key); list.push(m);
    if (list.length >= 6) break;
  }
  view.atList = list; view.atSel = 0; view.atQ = mm[2];
  if (!list.length){ view.at.hidden = true; return; }
  renderAt(view);
  view.at.hidden = false;
}
function renderAt(view){
  view.at.replaceChildren(element('div', 'all-at-h', view.lock ? `${PLAT_NAME[platOf(view.lock.ch)]} names` : 'Names in chat'),
    ...view.atList.map((m, i) => element('button', { type: 'button', role: 'option', class: 'all-ati' + (i === view.atSel ? ' on' : ''), 'aria-selected': String(i === view.atSel), dataset: { cmd: 'all.atPick' },
      onmousedown: e => e.preventDefault(), onclick: () => pickAt(view, view.w, m) },
      element('i', { class: 'pi pi-' + m.site }, PLAT_NAME[m.site][0]), element('span', null, element('b', null, m.sender.slice(0, view.atQ.length + (m.sender.startsWith('@') ? 1 : 0))), m.sender.slice(view.atQ.length + (m.sender.startsWith('@') ? 1 : 0))),
      element('small', null, PLAT_NAME[m.site]))),
    element('div', 'all-mh', element('kbd', null, '↑'), element('kbd', null, '↓'), ' pick · ', element('kbd', null, 'Tab'), ' or ', element('kbd', null, 'Enter'), ' adds it and locks to its site'));
}
function pickAt(view, w, m){
  if (!m) return;
  const v = view.input, at = v.selectionStart ?? v.value.length, before = v.value.slice(0, at).replace(/@[\w.]*$/, ''), after = v.value.slice(at);
  const name = '@' + m.sender.replace(/^@/, '') + ' ';
  v.value = before + name + after.replace(/^\s+/, '');
  v.selectionStart = v.selectionEnd = (before + name).length;
  view.at.hidden = true;
  if (!view.lock) setLock(view, w, { kind: 'at', ch: m.ch });
  v.focus();
}
/* ---- mod actions: the hover's Delete, ⋯ and the right-click menu, and a click on a name with keys held ---- */
// the keys' names, as this computer shows them (⌘ and ⇧ on a Mac)
const kCtrl = () => keyName('Ctrl+').slice(0, -1);
const kShift = () => kCtrl() === 'Ctrl' ? 'Shift' : '⇧';
const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const modKnown = new Map();   // channel -> whether you moderate it (the answer behind its mod view button, platforms.js)
function youMod(ch){
  if (!modKnown.has(ch)){
    modKnown.set(ch, false);
    const p = modOk.get(ch); if (p) p.then(v => { if (v === true){ modKnown.set(ch, true); redrawAll(); } });
  }
  return modKnown.get(ch);
}
// Why you can't moderate them here (nothing: you can)
function whyNot(m){
  const site = PLAT_NAME[m.site];
  if (!platform(m.ch).timeoutCmd) return `From ${site}'s own tab`;
  if (!youMod(m.ch)) return `You're not a mod on ${site}`;
  if (m.login && m.login === meOn(m.site)) return 'That\'s you';
  if (m.badges.includes('host')) return `${m.sender} is the streamer`;
  if (m.badges.includes('mod') || m.badges.includes('staff')) return `${m.sender} is a mod on ${site}`;
  return '';
}
const canModerate = m => !whyNot(m);
const TIMEOUTS = [60, 600, 3600, 86400];
const durText = secs => secs >= 86400 ? `${secs / 86400}d` : secs >= 3600 ? `${secs / 3600}h` : `${Math.round(secs / 60)}m`;
const lastTimeout = () => TIMEOUTS.includes(settings.num('allTimeout')) ? settings.num('allTimeout') : 600;
const chatFor = m => wins.find(o => o.kind === 'chat' && o.channel === m.ch);
async function modAct(m, action, secs){
  const c = chatFor(m), site = PLAT_NAME[m.site], who = m.sender; if (!c) return;
  const why = action === 'pin' ? (youMod(m.ch) && platform(m.ch).timeoutCmd ? '' : whyNot(m) || `You're not a mod on ${site}`) : whyNot(m);
  if (why) return flash(why);
  if (action === 'ban' && !await ask(`Ban ${who} on ${site}?`, `They can't chat on ${site} until they're unbanned. Done with ${site}'s own /ban.`, { ok: 'Ban', danger: true })) return;
  if (action === 'timeout') settings.set('allTimeout', secs);
  let r;
  try {
    if (action === 'delete' || action === 'pin') r = await sender.mod(c, action, m.id);
    else r = (await sender.send(c, action === 'ban' ? platform(m.ch).banCmd(m.login) : platform(m.ch).timeoutCmd(m.login, secs))) === 'sent' ? 'done' : 'failed';
  } catch { r = 'failed'; }
  flash(r === 'done' ? { delete: `Deleted ${who}'s message on ${site}`, pin: `Pinned ${who}'s message on ${site}`, timeout: `Timed out ${who} on ${site} for ${durText(secs)}`, ban: `Banned ${who} on ${site}` }[action]
    : r === 'no-line' ? `That message has gone from ${site}'s chat` : r === 'no-button' ? `${site} doesn't offer that there: try from its own tab` : `${site} didn't take it: try from its own tab`);
}
// A click on a name: their card; with Shift delete, Ctrl / ⌘ time out (the last length), both ban (as Kick's own chat does)
function nameClick(m, e){
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl && !e.shiftKey) return openSiteCard(m);
  e.preventDefault();
  if (ctrl && e.shiftKey) modAct(m, 'ban'); else if (ctrl) modAct(m, 'timeout', lastTimeout()); else modAct(m, 'delete');
}
// ⋯ and the right-click: the line's menu (the mod part only where you're a mod)
function openLineMenu(m, at){
  const view = viewFor(streamerOf(m.ch)); if (!view) return;
  const site = PLAT_NAME[m.site], why = whyNot(m), mod = youMod(m.ch) && !!platform(m.ch).timeoutCmd, lm = view.lm;
  const item = (label, ic, run, more = {}) => element('button', { type: 'button', role: 'menuitem', class: 'all-li' + (more.red ? ' red' : ''), disabled: !!more.off, title: more.off || '', dataset: { cmd: more.cmd },
    onclick: () => { lm.hidden = true; run(); } }, element('i', { html: ic }), element('span', null, label), more.kb ? element('small', null, more.kb) : '');
  const text = m.parts.map(x => x.text || x.name).join('');
  lm.replaceChildren(element('div', 'all-lh', element('i', { class: 'pi pi-' + m.site }, site[0]), element('b', null, m.sender), element('small', null, site)),
    sendSites(view.w).includes(m.ch) && item('Reply', icon.reply, () => startReply(m), { cmd: 'all.menuReply' }),
    mod && item('Pin message', icon.pin, () => modAct(m, 'pin'), { cmd: 'all.menuPin' }),
    item(`Open profile on ${site}`, icon.user, () => openSiteCard(m), { cmd: 'all.menuProfile' }),
    mod && element('hr'),
    mod && item('Delete message', icon.bin, () => modAct(m, 'delete'), { kb: `${kShift()}-click name`, off: why, cmd: 'all.menuDelete' }),
    mod && item('Timeout', TIMER, () => modAct(m, 'timeout', lastTimeout()), { kb: `${kCtrl()}-click name`, off: why, cmd: 'all.menuTimeout' }),
    mod && !why && element('div', 'all-durs', ...TIMEOUTS.map(sec => element('button', { type: 'button', class: sec === lastTimeout() ? 'on' : '', dataset: { cmd: 'all.timeoutFor' }, onclick: () => { lm.hidden = true; modAct(m, 'timeout', sec); } }, durText(sec)))),
    mod && item('Ban', BAN, () => modAct(m, 'ban'), { kb: `${kCtrl()}+${kShift()}-click name`, off: why, red: true, cmd: 'all.menuBan' }),
    element('hr'),
    item('Copy message', icon.copy, () => { navigator.clipboard?.writeText(text).then(() => flash('Copied'), () => flash('Couldn\'t copy it')); }, { cmd: 'all.menuCopy' }),
    mod && modUrl(m.ch) && item(`Open ${site} mod view`, icon.mod, () => { const u = modUrl(m.ch); if (DESKTOP) window.kmv.openWindow(u, 1400, 900); else window.open(u, '_blank'); }, { cmd: 'all.menuModView' }));
  lm.hidden = false;
  const vr = view.el.getBoundingClientRect(), r = at.getBoundingClientRect ? at.getBoundingClientRect() : { left: at.clientX, right: at.clientX, top: at.clientY, bottom: at.clientY };
  const w = lm.offsetWidth, h = lm.offsetHeight;
  lm.style.left = Math.max(6, Math.min(vr.width - w - 6, r.right - vr.left - w)) + 'px';
  lm.style.top = Math.max(6, Math.min(vr.height - h - 6, r.bottom - vr.top + 4)) + 'px';
}
const TIMER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>';
const BAN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';

// A name: their card on their own site (that site's tab, the site opens its card for them)
function openSiteCard(m){
  const c = wins.find(o => o.kind === 'chat' && o.channel === m.ch); if (!c) return;
  setAll(c, false);
  showTab(c);
  if (c.view && m.id) runIn(c.view, `(${profileAgent})(${JSON.stringify(m.id)})`);
}
async function sendNow(view, w){
  let text = view.input.value.trim(); const ch = sendSite(w); if (!text || !ch) return;
  const m = frameOf(w).find(o => o.kind === 'chat' && o.channel === ch), p = PLAT_NAME[platOf(ch)], lock = view.lock;
  const threaded = lock && lock.kind === 'reply' && platform(ch).threadedReplies;
  // a reply where the site has none from here: an @ of them, in front
  if (lock && lock.kind === 'reply' && !threaded && !new RegExp(`^@${lock.msg.login}\\b`, 'i').test(text)) text = `@${lock.msg.sender.replace(/^@/, '')} ${text}`;
  let r; try { r = threaded ? await sender.reply(m, lock.msg.id, text) : await sender.send(m, text); } catch { r = 'error'; }
  if (r === 'sent'){ if (view.input.value.trim()) view.input.value = ''; if (lock) setLock(view, w, null); return; }
  if (r === 'no-reply') return flash(`Couldn't start a reply on ${p}: the message may have scrolled out of its chat`);
  flash((SEND_FAIL[r] || (x => `${x}'s chat didn't answer: try again, or send it from its tab`))(p));
}
function setBotsShown(on){ botsShown = !!on; settings.set('allBots', botsShown ? 'shown' : 'hidden'); redrawAll(); }
function setEventsMode(mode){ eventsMode = mode; settings.set('allEvents', mode); redrawAll(); }
const redrawAll = () => wins.forEach(w => { if (w.allView){ const v = w.allView; v.list.replaceChildren(...feedOf(v.s).msgs.map(lineEl).filter(Boolean)); renderTop(v, w); v.list.scrollTop = v.list.scrollHeight; } });
// "See it on …": that site's chat, scrolled to it (and flashed), where it has its full look and controls
function seeIt(m){
  const c = wins.find(o => o.kind === 'chat' && o.channel === m.ch); if (!c) return;
  setAll(c, false);
  showTab(c);
  if (c.view && m.id) runIn(c.view, `(${seekAgent})(${JSON.stringify(m.id)})`);
}

// ALL shows over the chat of each window that has it on; each chat hands over its messages only while it does
function syncAll(){
  wins.forEach(w => {
    if (w.kind !== 'chat') return;
    const show = !w.hiddenTab && allOn(w);
    if (show && !w.allView){ w.allView = buildView(w); w.el.querySelector('.body').append(w.allView.el); w.allView.list.scrollTop = w.allView.list.scrollHeight; }
    if (!show && w.allView){ w.allView.el.remove(); w.allView = null; }
    w.el.classList.toggle('all-on', show);
    if (show) renderTop(w.allView, w);
    feedOn(w, allOn(w));
  });
}
const FEED_ON = on => `window.__kmvFeed && (window.__kmvFeed.on = ${!!on})`;
function feedOn(w, on){
  if (!w.view || !w.ready || w.feedOn === on) return;
  w.feedOn = on; runIn(w.view, FEED_ON(on));
}
// A chat page loaded (again): its helper, on if ALL shows
function feedReady(w, view){ runIn(view, `(${feedAgent})();${FEED_ON(allOn(w))}`); w.feedOn = allOn(w); }

const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7c1.8 0 3.4-.5 4.8-1.3"/></svg>';
const BADGE_SVG = {
  host: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-4v10l-6-4z"/></svg>',
  mod: '<svg viewBox="0 0 24 24"><path d="M19 5L9 15M5 15l4 4M7 13l4 4M4 20l2-2" fill="none" stroke-width="2.6" stroke-linecap="round"/></svg>',
  vip: '<svg viewBox="0 0 24 24"><path d="M6 4h12l4 5-10 12L2 9z"/></svg>',
  sub: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.2 6.6 19.2l1.3-6-4.5-4 6-.6z"/></svg>',
  og: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6L12 16.2 6.6 19.2l1.3-6-4.5-4 6-.6z"/></svg>',
  verified: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  staff: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z"/></svg>',
  gifter: '<svg viewBox="0 0 24 24"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/></svg>'
};

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  botsShown = settings.text('allBots') === 'shown';
  eventsMode = ['short', 'full', 'hidden'].includes(settings.text('allEvents')) ? settings.text('allEvents') : 'short';
  fromSite('feed', (w, json) => { if (allOn(w)) ingest(w, json); });
  // Esc closes ALL's menus (the line's, Send on's)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    wins.forEach(w => { const v = w.allView; if (!v) return; [v.lm, v.menu].forEach(m => { if (!m.hidden){ m.hidden = true; e.preventDefault(); } }); });
  });
  store.watch(['streamers', 'tabs', 'wins', 'live'], () => syncAll());
  settings.onChange(['allOpen'], () => { syncAll(); wins.forEach(renderSiteTabs); store.changed('tabs'); });
  window.sendAgent = sendAgent; window.modAgent = modAgent; window.replyAgent = replyAgent; window.seekAgent = seekAgent; window.profileAgent = profileAgent;   // for the tests
  window.allChat = { sender, modKnown, ingest: (ch, batch) => { const w = wins.find(o => o.kind === 'chat' && o.channel === ch); if (w) ingest(w, JSON.stringify(batch)); }, feeds, setAll, allOn: ch => allOn(wins.find(w => w.kind === 'chat' && w.channel === ch)) };   // for the tests
}

export { allOn, allTabFor, feedReady, init, setAll };
