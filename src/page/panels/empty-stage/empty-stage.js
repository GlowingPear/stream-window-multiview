import { $, ROLE, STORE, modeSel, stage, wins } from '../../core.js';
import { autoLayout } from '../../layout/layouts.js';
import { addParsed } from '../../layout/placement.js';
import { fmtViewers, infoFor, liveNow, saved, svHue, svInitials, svProf } from '../channels/channels.js';
import { openSettings } from '../settings/settings.js';
import { restore, save } from '../../persistence.js';
import { accountsOf, groupKey, nameOf, sameStreamer, streamerOf } from '../../platforms/linked.js';
import { PLAT_NAME, parseInput, platIcon, platOf } from '../../platforms/platforms.js';
import { commands } from '../../shared/commands.js';
import { esc } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { closeOverlays, layoutPick } from '../../shortcuts.js';
import { panel, savedBtn, showSpMenu } from '../../toolbar/toolbar.js';
import { openStreamer } from '../../windows/frames.js';

/* ---------- the empty stage: Welcome for a first run, then the Launchpad (#53) ----------
   Welcome: a paste box, logins, Import follows and handy keys; feature cards with "Show me" (seen ones are
   ticked); and a tour of the real toolbar buttons. It switches to the Launchpad once you've opened your first
   stream (or skip it): the paste box, saved channels that are live now, and reopening the last session.
   Progress is kept in kickMultiview.intro and can be reset from Settings > General. */
var intro = {}, esBuilt = false, esPlat = 'kick', esPrevWins = 0, esReady = false;
function saveIntro(){ settings.set('intro', intro); }
const ES_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const ES_FORMATS = `<details class="es-formats"><summary>What can I paste?</summary><ul>
  <li><code>kick.com/nightowl</code> or just <code>nightowl</code>: a Kick stream and chat</li>
  <li><code>twitch.tv/nightowl</code> or <code>tw:nightowl</code>: Twitch</li>
  <li><code>youtube.com/@nightowl</code> or <code>@nightowl</code>: a YouTube channel's live stream</li>
  <li><code>youtube.com/watch?v=…</code> or <code>youtu.be/…</code>: any YouTube video</li>
  <li>A chat link (<code>kick.com/popout/nightowl/chat</code>) opens just the chat; any other web link opens as a page.</li></ul></details>`;
const ES_BOX = `<div class="es-box">${ES_SEARCH}<input class="es-in" placeholder="Paste a link or type a channel name" aria-label="Channel name or link" autocomplete="off" spellcheck="false">
  <span class="es-badge" hidden></span>
  <div class="es-plat" hidden role="radiogroup" aria-label="Site"><button data-p="kick" role="radio">Kick</button><button data-p="twitch" role="radio">Twitch</button><button data-p="youtube" role="radio">YouTube</button></div>
  <select class="es-mode" aria-label="What to open"><option value="both">Stream + chat</option><option value="stream">Stream only</option><option value="chat">Chat only</option></select>
  <button class="btn primary es-go">Open</button></div>${ES_FORMATS}`;
// What a typed or pasted text will open, for the badge: { p: parsed, label } | null
function esRead(text){
  const t = String(text || '').trim(); if (!t) return null;
  const bare = /^[A-Za-z0-9_-]+$/.test(t);
  const p = parseInput(t, esPlat); if (!p) return null;
  if (p.only === 'web'){   // only something that looks like a web address: no spaces, a dot in its name
    let host = ''; try { host = new URL(p.url).hostname; } catch {}
    return /\s/.test(t) || !/^[\w-]+(\.[\w-]+)+$/.test(host) ? null : { p, label: 'Web page', bare };
  }
  const plat = PLAT_NAME[platOf(p.channel)];
  const label = /^yt:v:/.test(p.channel) ? 'YouTube video' : p.only === 'chat' ? `${plat} chat` : `${plat} channel`;
  return { p, label, bare };
}
function esWireBox(root){
  const inp = root.querySelector('.es-in'), badge = root.querySelector('.es-badge'), plat = root.querySelector('.es-plat'), mode = root.querySelector('.es-mode');
  mode.value = modeSel.value;
  const show = () => {
    const r = esRead(inp.value);
    plat.hidden = !(r && r.bare);
    badge.hidden = !r || r.bare;
    if (r && !r.bare) badge.textContent = r.label;
    plat.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.p === esPlat); b.setAttribute('aria-checked', String(b.dataset.p === esPlat)); });
  };
  const go = () => {
    const r = esRead(inp.value);
    if (!r){ if (inp.value.trim()) flash('Couldn’t read that link or channel name'); inp.focus(); return; }
    modeSel.value = mode.value;
    addParsed(r.p);
    inp.value = ''; show();
  };
  inp.addEventListener('input', show);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); go(); } });
  inp.addEventListener('paste', () => setTimeout(() => { const r = esRead(inp.value); if (r && !r.bare) go(); }, 0));   // a pasted link opens straight away
  plat.addEventListener('click', e => { const b = e.target.closest('button'); if (b){ esPlat = b.dataset.p; show(); inp.focus(); } });
  root.querySelector('.es-go').onclick = go;
  show();
}
// The feature cards: what each one shows. sel: a toolbar button to point at; tab: a Settings tab to open.
const ES_LEARN = [
  { id: 'channels', ico: 'star', t: 'Your channels', d: 'Save channels, see who’s live and open them in one click.', sel: '#savedBtn' },
  { id: 'layouts', ico: 'layout', t: 'Layouts', d: 'Columns, Focus, Chat focus, Game and more: one click arranges every window.', sel: '#layoutBtn' },
  { id: 'switch', ico: 'sliders', t: 'Switch control', d: 'Pick the big stream, mute, pause and preview, all from one panel.', sel: '#swBtn' },
  { id: 'alerts', ico: 'bell', t: 'Alerts', d: 'Who went live, @mentions and replies, all under the bell.', sel: '#bellBtn' },
  { id: 'profiles', ico: 'user', t: 'Streamer profiles', d: 'When they usually stream, past streams and your own notes.', sel: '#profBtn' },
  { id: 'capture', ico: 'capture', t: 'Another app’s window', d: 'Show Discord or any other window right inside the multiview.', sel: '#capBtn' },
  { id: 'extensions', ico: 'ext', t: 'Extensions', d: 'Add Chrome extensions to chats and streams.', tab: 'extensions' },
  { id: 'themes', ico: 'palette', t: 'Themes', d: 'Pick the colours, or make your own theme.', tab: 'themes' }
];
const TOUR = [
  { sel: '#savedBtn', t: 'Your channels', d: 'Type or paste a channel here to open it, save the ones you watch, and see who’s live. Shortcut: N.' },
  { sel: '#loginBtn', t: 'Log in', d: 'Log in to Kick, Twitch and YouTube once. Chats use these logins, and Import follows brings in the channels you follow.' },
  { sel: '#layoutBtn', t: 'Layouts', d: 'Arrange every window at once: Columns, Focus with one big stream, Chat focus, Game and more.' },
  { sel: '#swBtn', t: 'Switch control', d: 'One panel for all your streams: pick the big one, mute, pause or preview. Dock it, float it or give it its own window.' },
  { sel: '#bellBtn', t: 'Notifications', d: 'Who just went live, @mentions and replies, and spam alerts if you moderate.' },
  { sel: '#settingsBtn', t: 'Settings', d: 'Accounts, alerts, themes, extensions, and this welcome screen if you want it back.' },
  { sel: '#focusBtn', t: 'Hide the bar', d: 'Give the streams the whole window. Move the mouse to the edge, or press Esc or H, to bring it back.' }
];
const esUsable = sel => { const b = $(sel); return !!b && !b.hidden; };
function esLearnList(){ return ES_LEARN.filter(c => c.sel ? esUsable(c.sel) : c.tab ? !!document.querySelector(`#settingsDlg .st-rail [data-s="${c.tab}"]:not([hidden])`) && (c.tab !== 'extensions' || DESKTOP) : true); }
function esBuild(){
  if (esBuilt || ROLE !== 'main') return;
  esBuilt = true;
  const first = $('#empty .es-first'), pad = $('#empty .es-pad');
  first.innerHTML = `<div class="es-head">${$('.brand .pear') ? $('.brand .pear').outerHTML : ''}<div><h2>Welcome to Stream Multiview</h2><p>Watch Kick, Twitch and YouTube side by side, with their chats.</p></div><button class="linkish es-skip">Skip to the launchpad</button></div>
    <div class="es-cols">
      <div class="es-col es-get"><h3>Get watching</h3>${ES_BOX}
        <div class="desk-blk"><h4>Log in once</h4><div class="es-row es-accts"></div>
        <h4>Import the channels you follow</h4><div class="es-imp">${['kick', 'twitch', 'youtube'].map(p => `<button class="btn" data-imp="${p}" title="Import the channels you follow on ${PLAT_NAME[p]} into your channels">${platIcon(p)} ${PLAT_NAME[p]}</button>`).join('')}</div></div>
        <h4>Handy keys</h4><div class="es-keys"><div><kbd>F1</kbd> All shortcuts</div><div><kbd>N</kbd> Add a channel</div><div><kbd>${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}</kbd>+<kbd>Z</kbd> Undo</div><div><kbd>W</kbd> Another app’s window</div><div><kbd>L</kbd> Layouts</div><div><kbd>Esc</kbd> Close menus</div></div>
      </div>
      <div class="es-col"><h3>Learn the app <small class="es-prog"></small></h3><div class="es-learn"></div>
        <button class="btn primary es-tour">Take the tour</button></div>
    </div>`;
  pad.innerHTML = `<div class="es-pad-in"><h2>What do you want to watch?</h2>${ES_BOX}<div class="es-live"></div>
    <div class="es-acts"><button class="btn es-reopen">${icon.undo}Reopen last session <small></small></button><button class="btn es-impbtn desk-only">${icon.download}Import follows</button><button class="btn es-learnbtn">${icon.book}Learn the app</button></div></div>`;
  [first, pad].forEach(esWireBox);
  first.querySelectorAll('.desk-blk').forEach(e => { e.hidden = !DESKTOP; });
  pad.querySelector('.es-impbtn').hidden = !DESKTOP;
  first.querySelector('.es-skip').onclick = () => { intro.done = true; saveIntro(); esRefresh(); pad.querySelector('.es-in').focus(); };
  pad.querySelector('.es-learnbtn').onclick = () => { intro.done = false; saveIntro(); esRefresh(); };
  first.querySelector('.es-tour').onclick = () => startTour(TOUR, true);
  first.querySelector('.es-imp').addEventListener('click', e => { const b = e.target.closest('[data-imp]'); if (b) esImport(b.dataset.imp); });
  pad.querySelector('.es-impbtn').onclick = () => { savedBtn.click(); const r = $('#importRow'); if (r){ r.hidden = false; r.scrollIntoView({ block: 'nearest' }); } };
  pad.querySelector('.es-reopen').onclick = reopenSession;
  // (the search box's commands for them: init())
  [['.es-tour', 'welcome.tour'], ['.es-skip', 'welcome.skip'], ['.es-learnbtn', 'welcome.learn'], ['.es-reopen', 'welcome.reopen'], ['.es-impbtn', 'channels.import']]
    .forEach(([sel, id]) => [first, pad].forEach(r => r.querySelectorAll(sel).forEach(b => { b.dataset.cmd = id; })));
  first.querySelectorAll('[data-imp]').forEach(b => { b.dataset.cmd = `account.${b.dataset.imp}.import`; });
  first.querySelector('.es-accts').addEventListener('click', e => { const b = e.target.closest('[data-login]'); if (b && window.kmv && window.kmv.openLogin) window.kmv.openLogin(b.dataset.login); });
  first.querySelector('.es-learn').addEventListener('click', e => { const b = e.target.closest('.es-show'); if (b) showMe(b.dataset.id); });
  pad.querySelector('.es-live').addEventListener('click', e => {
    const b = e.target.closest('[data-ch], [data-all]'); if (!b) return;
    if (b.dataset.ch){ if (streamerOf(b.dataset.ch)) openStreamer(b.dataset.ch, 'both'); else addParsed({ channel: b.dataset.ch, only: null }); return; }
    const list = liveNow();
    list.forEach(ch => { if (!wins.some(w => w.kind === 'stream' && sameStreamer(w.channel, ch))) addParsed({ channel: ch, only: null }); });
    if (b.dataset.all === 'focus') layoutPick('focus'); else autoLayout();
  });
}
function esImport(p){ const b = $(`#importRow [data-imp="${p}"]`); if (b) b.click(); }
function esAccounts(){ return settings.json('accounts', {}) || {}; }
// Fill in what changes: which screen, logins, cards seen, live channels, the last session.
function esRefresh(){
  if (ROLE !== 'main' || !esReady) return;
  esBuild();
  const first = $('#empty .es-first'), pad = $('#empty .es-pad');
  const isFirst = !intro.done;
  first.hidden = !isFirst; pad.hidden = isFirst;
  if (isFirst){
    const a = esAccounts();
    first.querySelector('.es-accts').innerHTML = ['kick', 'twitch', 'youtube'].map(p => {
      const v = a[p];
      return `<div class="es-acct${v ? ' on' : ''}">${platIcon(p)}<span>${PLAT_NAME[p]}<small>${v ? (p === 'youtube' ? 'Logged in' : 'Logged in as ' + esc(String(v))) : 'Not logged in'}</small></span>${v ? '' : `<button class="btn" data-login="${p}">Log in</button>`}</div>`;
    }).join('');
    const list = esLearnList(), seen = new Set(intro.seen || []);
    first.querySelector('.es-prog').textContent = `${list.filter(c => seen.has(c.id)).length} of ${list.length} seen`;
    first.querySelector('.es-learn').innerHTML = list.map(c => `<div class="es-card${seen.has(c.id) ? ' seen' : ''}" data-id="${c.id}"><div class="es-ct">${icon[c.ico] || ''}${c.t}</div><p>${c.d}</p><button class="btn es-show" data-id="${c.id}">Show me</button>${seen.has(c.id) ? '<span class="es-tick" title="Seen">✓</span>' : ''}</div>`).join('');
    first.querySelector('.es-tour').textContent = intro.tour ? 'Take the tour again' : 'Take the tour';
  } else {
    // a linked streamer once, with each live site's icon and their viewers added up
    const live = DESKTOP ? [...new Map(liveNow().map(ch => [groupKey(ch), ch])).values()] : [], box = pad.querySelector('.es-live');
    const sitesOf = ch => streamerOf(ch) ? accountsOf(ch).filter(c => infoFor(c) && infoFor(c).live) : [ch];
    const viewersOf = ch => sitesOf(ch).reduce((t, c) => t + (+(infoFor(c) || {}).viewers || 0), 0);
    if (live.length){
      box.innerHTML = `<div class="es-live-h"><b><i></i>Live now · ${live.length}</b><span class="es-gap"></span><button class="btn" data-all="open">Open all ${live.length}</button><button class="btn" data-all="focus">Open as Focus view</button></div>
        <div class="es-cards">${live.slice(0, 12).map(ch => {
          const i = infoFor(ch) || {}, prof = (svProf[ch] && svProf[ch].info) || {}, sub = [i.category, i.title].filter(Boolean).join(' · '), name = nameOf(ch);
          return `<button class="es-lc" data-ch="${esc(ch)}" title="Open ${esc(name)}"><span class="es-av" style="--c:${svHue(ch)}">${esc(svInitials(name))}${prof.avatar ? `<img alt="" referrerpolicy="no-referrer" src="${esc(prof.avatar)}">` : ''}</span>
            <span class="es-lt"><span class="es-ln">${sitesOf(ch).map(c => platIcon(platOf(c))).join('')}<span>${esc(name)}</span></span><span class="es-ls">${esc(sub)}</span></span>${i.viewers != null ? `<span class="es-lv">${fmtViewers(viewersOf(ch))}</span>` : ''}</button>`;
        }).join('')}</div>`;
      box.querySelectorAll('.es-av img').forEach(img => { img.onerror = () => img.remove(); });   // a picture that doesn't load: the initials
    } else if (!saved.length){
      box.innerHTML = `<div class="es-none">You haven’t saved any channels yet.${DESKTOP ? ' <button class="btn" data-imp-any>Import the channels you follow</button>' : ''}</div>`;
      const b = box.querySelector('[data-imp-any]'); if (b) b.onclick = () => pad.querySelector('.es-impbtn').click();
    } else box.innerHTML = `<div class="es-none">${DESKTOP ? 'None of your saved channels are live right now.' : 'Open a saved channel from Channels.'} <button class="btn es-opench">Open Channels</button></div>`;
    const oc = box.querySelector('.es-opench'); if (oc) oc.onclick = () => { if (panel.hidden) savedBtn.click(); };
    const last = lastSession(), rb = pad.querySelector('.es-reopen');
    rb.hidden = !last.length;
    rb.querySelector('small').textContent = last.length ? `${last.length} window${last.length > 1 ? 's' : ''}` : '';
  }
}
// The windows open when the stage last emptied (Clear, or closing the last one).
function lastSession(){ const d = settings.json('lastSession', []); return Array.isArray(d) ? d.filter(x => x && x.kind !== 'capture') : []; }
function reopenSession(){
  const d = lastSession(); if (!d.length) return;
  settings.set(STORE, d);
  restore(); store.changed('wins'); save();
  flash(`Reopened ${d.length} window${d.length > 1 ? 's' : ''}`);
}
function esWinsChanged(){
  if (ROLE !== 'main' || !esReady) return;
  if (!wins.length && esPrevWins){ const cur = settings.get(STORE); if (cur && cur !== '[]') settings.set('lastSession', cur); }
  if (wins.length && !esPrevWins){
    if (!intro.done && wins.some(w => w.kind === 'stream')){ intro.done = true; saveIntro(); }
    if (!intro.tips) showTips();
  }
  esPrevWins = wins.length;
  if (!wins.length) esRefresh();
}
// The window tips, once: in the stage's corner (clear of a left toolbar), clicks pass through, gone after 20 s.
var tipT = 0;
function showTips(){
  const c = $('#tipCard'), r = stage.getBoundingClientRect();
  c.style.left = Math.round(r.left + 12) + 'px';
  c.hidden = false; intro.tips = true; saveIntro();
  clearTimeout(tipT); tipT = setTimeout(() => { c.hidden = true; }, 20000);
}
// "Show me": point at the feature (or open its Settings tab), and tick it off.
function showMe(id){
  const c = ES_LEARN.find(x => x.id === id); if (!c) return;
  intro.seen = [...new Set([...(intro.seen || []), id])]; saveIntro();
  if (c.tab) openSettings(c.tab);
  else startTour([{ sel: c.sel, t: c.t, d: c.d }], false);
  esRefresh();
}
// The tour: a spotlight on each button in turn, with a note beside it. A button that's in the ⋯ menu right now is shown there.
var tour = null;
function startTour(steps, full){
  const list = steps.filter(s => $(s.sel) && !$(s.sel).hidden);
  if (!list.length) return;
  closeOverlays();
  tour = { steps: list, i: 0, full };
  $('#tourLayer').hidden = false;
  showTourStep();
}
function endTour(){
  if (!tour) return;
  if (tour.full){ intro.tour = true; saveIntro(); esRefresh(); }
  tour = null; $('#tourLayer').hidden = true;
}
function showTourStep(){
  const L = $('#tourLayer'), st = tour.steps[tour.i], n = tour.steps.length;
  let el = $(st.sel), r = el.getBoundingClientRect(), where = '';
  if (!r.width || !r.height){ const m = $('#moreBtn'); if (m && !m.hidden){ el = m; r = m.getBoundingClientRect(); where = ' It’s in the ⋯ menu right now, because the window is narrow.'; } }
  const ring = L.querySelector('.tour-ring'), tip = L.querySelector('.tour-tip'), pad = 5;
  Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  tip.querySelector('.tour-step').textContent = n > 1 ? `Step ${tour.i + 1} of ${n}` : 'Here it is';
  tip.querySelector('h4').textContent = st.t;
  tip.querySelector('p').textContent = st.d + where;
  tip.querySelector('.tour-back').hidden = tour.i === 0;
  tip.querySelector('.tour-end').hidden = n === 1;
  tip.querySelector('.tour-next').textContent = tour.i === n - 1 ? (n > 1 ? 'Finish' : 'Got it') : 'Next';
  // beside the button: below it (top toolbar), or to its right (left toolbar)
  const W = tip.offsetWidth, H = tip.offsetHeight, gap = 14;
  let x, y;
  if (r.bottom + gap + H < innerHeight && r.top < innerHeight / 2){ y = r.bottom + gap; x = r.left + r.width / 2 - W / 2; }
  else if (r.right + gap + W < innerWidth){ x = r.right + gap; y = r.top + r.height / 2 - H / 2; }
  else { y = r.top - gap - H; x = r.left + r.width / 2 - W / 2; }
  tip.style.left = Math.max(12, Math.min(innerWidth - W - 12, x)) + 'px';
  tip.style.top = Math.max(12, Math.min(innerHeight - H - 12, y)) + 'px';
  tip.querySelector('.tour-next').focus();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  intro = settings.json('intro', {}) || {};
  // someone who already used the app (before this screen existed): straight to the launchpad, no window tips
  if (intro.done === undefined){ const had = saved.length > 0 || settings.json(STORE, []).length > 0; if (had){ intro.done = true; intro.tips = true; saveIntro(); } }
  // Called whenever the windows change (updateEmpty): keep the session, switch screens, show the window tips once.
  store.watch('wins', () => esWinsChanged());
  store.watch('streamers', () => { if (!wins.length) esRefresh(); });   // a linked streamer's live card
  $('#tipCard .tip-ok').onclick = () => { clearTimeout(tipT); $('#tipCard').hidden = true; };
  $('#introReset').onclick = () => { intro = {}; saveIntro(); esRefresh(); flash('The welcome screen shows again when no windows are open'); };
  // the search box's (Ctrl/⌘+K): the welcome screen's and launchpad's buttons
  const empty = () => ROLE === 'main' && !wins.length;
  commands.add([
    { id: 'welcome.tour', group: 'Help', kind: 'help', title: 'Take the tour', sub: 'A quick look at the toolbar, one button at a time', words: ['tutorial', 'intro'], icon: 'sparkle', when: () => ROLE === 'main', run: () => startTour(TOUR, true) },
    { id: 'welcome.learn', group: 'Help', kind: 'help', title: 'Learn the app', sub: 'The welcome screen and its feature cards (with nothing open)', words: ['welcome'], icon: 'book', when: empty, run: () => { intro.done = false; saveIntro(); esRefresh(); } },
    { id: 'welcome.skip', group: 'Help', kind: 'help', title: 'Skip to the launchpad', icon: 'arrowR', when: () => empty() && !intro.done, run: () => { intro.done = true; saveIntro(); esRefresh(); } },
    { id: 'welcome.reopen', title: 'Reopen last session', sub: 'The windows you had open last time', words: ['restore'], icon: 'undo', when: () => empty() && lastSession().length > 0, run: reopenSession },
    { id: 'channels.import', group: 'Channels', title: 'Import follows', sub: 'The channels you follow on Kick, Twitch or YouTube, into your channels', icon: 'download', when: () => DESKTOP && ROLE === 'main',
      run: () => { if (panel.hidden) savedBtn.click(); showSpMenu(true); const r = $('#importRow'); if (r){ r.hidden = false; r.scrollIntoView({ block: 'nearest' }); } } }
  ]);
  $('#tourLayer .tour-next').onclick = () => { if (!tour) return; if (tour.i < tour.steps.length - 1){ tour.i++; showTourStep(); } else endTour(); };
  $('#tourLayer .tour-back').onclick = () => { if (tour && tour.i > 0){ tour.i--; showTourStep(); } };
  $('#tourLayer .tour-end').onclick = endTour;
  document.addEventListener('keydown', e => {
    if (!tour) return;
    if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); endTour(); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); $('#tourLayer .tour-next').click(); }
    else if (e.key === 'ArrowLeft'){ e.preventDefault(); $('#tourLayer .tour-back').click(); }
  }, true);
  addEventListener('resize', () => { if (tour) showTourStep(); });
  esReady = true; esPrevWins = wins.length;
  if (!wins.length) esRefresh();
}

export { esRefresh, init, startTour };
