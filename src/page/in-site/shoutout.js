/* ---- Shoutouts inside a Kick or Twitch chat page (turned into text: see src/page/README.md; chat/shoutout.js runs it
   while Settings › Shoutouts is on, and again with on = false to take it all away). It adds a Shout out button to
   the start of each message's hover bar (the app draws it: it isn't a copy of the site's buttons), and a Shout out pill
   to a raid's line. A message whose hover bar can't be found gets a small bar of its own. Who sent a message comes from
   the line's own data (the React props the site draws it from: Kick's sender slug, Twitch's login), never from the
   name on screen, as a Kick name with _ can have - in its address. A press says so: "__kmv:shoutout" { site, login,
   name, named } (named: the login came from a name). The right-click menu asks who() (chat-message.js ctx()), and a run
   of recent chatters asks chatters(). */
function shoutAgent(on, look){
  const S = window.__kmvShout || (window.__kmvShout = { on: false });
  S.on = !!on;
  const SO = '[data-kmv-so]';
  if (!on){
    document.querySelectorAll(SO).forEach(e => e.remove());
    document.querySelectorAll('[data-kmv-so-line]').forEach(e => e.removeAttribute('data-kmv-so-line'));
    return true;
  }
  if (S.ready) return true;
  S.ready = true;
  const L = look || {};   // (the tests': { site, line, bar })
  const site = L.site || (/(^|\.)kick\.com$/.test(location.hostname) ? 'kick' : 'twitch');
  const LINE = L.line || (site === 'kick' ? '[data-index]' : '.chat-line__message, .user-notice-line');
  const BAR = L.bar || (site === 'kick' ? 'div[class*="group-hover:flex"]' : '.chat-line__icons');
  const RAID = /\b(raid(ed|ing)?|is (now )?hosting|hosted)\b/i;
  const MEGA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.2v3.6a1 1 0 0 0 1 1h2.2L15 19V5L7.2 9.2H5a1 1 0 0 0-1 1z"/><path d="M7.6 14.8 9 19.6h2.6l-1-4"/><path d="M18 9.2a3.6 3.6 0 0 1 0 5.6"/></svg>';
  const css = document.createElement('style');
  css.setAttribute('data-kmv-so', '');
  css.textContent = `
    .kmv-so-b:not(.kmv-so-like){display:inline-grid;place-items:center;width:28px;height:28px;margin:0;padding:0;border:0;border-radius:6px;background:rgba(83,252,24,.12);color:#53fc18;cursor:pointer;flex:none}
    .kmv-so-b:not(.kmv-so-like):hover{background:rgba(83,252,24,.24)}
    .kmv-so-like svg{flex:none}
    .kmv-so-own{position:absolute;right:8px;top:-14px;z-index:20;display:none;padding:3px;border-radius:8px;background:#24292d;border:1px solid #31373c;box-shadow:0 8px 20px rgba(0,0,0,.5)}
    [data-kmv-so-line]:hover>.kmv-so-own,[data-kmv-so-line]:focus-within>.kmv-so-own{display:flex}
    [data-kmv-so-line]:not(:hover):not(:focus-within) [data-kmv-so]:not(.kmv-so-pill){display:none!important}
    .kmv-so-pill{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 10px 3px 8px;border-radius:999px;border:1px solid rgba(83,252,24,.45);background:rgba(83,252,24,.12);color:#53fc18;font:700 12px/1.2 inherit;cursor:pointer;white-space:nowrap;vertical-align:middle}
    .kmv-so-pill:hover{background:rgba(83,252,24,.22)}
    .kmv-so-pill svg{width:13px;height:13px}`;
  (document.head || document.documentElement).appendChild(css);

  // The data the site drew a line from: its React props (on the line or the element it wraps), a few levels up
  const propsOf = (el, key) => {
    for (const node of [el, el.querySelector('.group'), el.firstElementChild].filter(Boolean)){
      const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
      for (let f = k && node[k], i = 0; f && i < 10; f = f.return, i++){ const m = (f.memoizedProps || {})[key]; if (m && typeof m === 'object') return m; }
    }
    return null;
  };
  const clean = s => String(s || '').trim().replace(/^@/, '');
  // Who sent a line: { site, login, name, named }, or null (a line with no sender: a system notice)
  function who(el){
    const line = el && el.closest && el.closest(LINE);
    if (!line) return null;
    const m = propsOf(line, 'message');
    if (site === 'kick'){
      const s = (m && (m.sender || m.user)) || null;
      if (s && (s.slug || s.username)) return { site, login: clean(s.slug || s.username).toLowerCase(), name: clean(s.username || s.slug), named: !s.slug };
    } else {
      const u = (m && m.user) || null;
      if (u && u.userLogin) return { site, login: clean(u.userLogin).toLowerCase(), name: clean(u.userDisplayName || u.userLogin), named: false };
      const p = m && (m.params || m.msgParams);   // (a raid's notice: who raided)
      if (p && (p.login || p['msg-param-login'])) return { site, login: clean(p.login || p['msg-param-login']).toLowerCase(), name: clean(p.displayName || p['msg-param-displayName'] || p.login), named: false };
    }
    // (no data: the name shown, said to be a name, so the app looks the address up)
    const nameEl = line.querySelector(site === 'kick' ? 'button[data-prevent-expand], button.inline.font-bold' : '.chat-author__display-name, [data-a-target="chat-message-username"]');
    const name = nameEl && clean(nameEl.textContent);
    return name && /^[\w-]{2,40}$/.test(name) ? { site, login: name.toLowerCase(), name, named: true } : null;
  }
  const press = p => console.log('__kmv:shoutout ' + JSON.stringify(p));
  // like: one of the site's own buttons in that hover bar: ours takes its look (its classes, so its size, colour and
  // hover; an icon the size of its icon), so it looks like one of theirs. Without one: a look of its own.
  function button(p, like){
    const b = document.createElement('button');
    b.type = 'button'; b.className = like ? `${like.className} kmv-so-b kmv-so-like` : 'kmv-so-b'; b.setAttribute('data-kmv-so', '');
    b.title = `Shout out ${p.name} (Stream Multiview)`; b.setAttribute('aria-label', `Shout out ${p.name}`);
    b.innerHTML = MEGA;
    const theirs = like && like.querySelector('svg'), r = theirs && theirs.getBoundingClientRect();
    if (r && r.width){ const svg = b.querySelector('svg'); svg.setAttribute('width', String(Math.round(r.width))); svg.setAttribute('height', String(Math.round(r.height))); }
    b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); b.blur(); if (S.on) press(who(b) || p); }, true);   // (blur: a click doesn't keep it showing)
    return b;
  }
  // A line under the pointer: its button (in the site's hover bar, else a bar of its own), or a raid's pill
  // (only while the pointer is on the message, as some sites (Twitch) clear their hover bar's own buttons and leave
  // ours; a bar the site drew again without ours gets it again on the next hover)
  function dress(line){
    if (!S.on || line.querySelector('[data-kmv-so]')) return;
    const p = who(line);
    if (!p) return;
    line.setAttribute('data-kmv-so-line', '');
    const raid = RAID.test(line.textContent || '') && line.textContent.length < 300 && !line.querySelector(BAR);
    if (raid){
      const pill = document.createElement('button');
      pill.type = 'button'; pill.className = 'kmv-so-pill'; pill.setAttribute('data-kmv-so', '');
      pill.innerHTML = MEGA + '<span>Shout out</span>';
      pill.title = `Shout out ${p.name} (Stream Multiview)`;
      pill.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); if (S.on) press(p); }, true);
      (line.querySelector('div, span') || line).appendChild(pill);
      return;
    }
    const bar = line.querySelector(BAR), like = bar && bar.querySelector('button:not([data-kmv-so])');
    if (bar){
      const b = button(p, like);
      // (a site that wraps each of its buttons, as Twitch does: ours wrapped the same way)
      const wrap = like && like.parentElement !== bar ? Object.assign(document.createElement(like.parentElement.tagName), { className: like.parentElement.className }) : null;
      if (wrap){ wrap.setAttribute('data-kmv-so', ''); wrap.appendChild(b); }
      bar.insertBefore(wrap || b, bar.firstChild);
      return;
    }
    const own = document.createElement('div');
    own.className = 'kmv-so-own'; own.setAttribute('data-kmv-so', '');
    own.appendChild(button(p));
    if (getComputedStyle(line).position === 'static') line.style.position = 'relative';
    line.appendChild(own);
  }
  document.addEventListener('mouseover', ev => { const line = S.on && ev.target && ev.target.closest && ev.target.closest(LINE); if (line) dress(line); }, true);
  // The people who chatted here, oldest first (for a run of recent chatters): from the lines the chat shows
  function chatters(){
    return [...document.querySelectorAll(LINE)].map(line => {
      const p = who(line), m = propsOf(line, 'message');
      if (!p) return null;
      const t = m && (Date.parse(m.created_at || '') || +m.timestamp) || 0;
      return { ...p, t, raid: RAID.test(line.textContent || '') && line.textContent.length < 300 };
    }).filter(Boolean).slice(-300);
  }
  S.who = who; S.chatters = chatters; S.dress = dress;
  return true;
}

export { shoutAgent };
