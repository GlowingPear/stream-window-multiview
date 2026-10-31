/* ---- Emote preview: point at an emote in a chat to see it big, with its name, Copy name and Download.
   Runs inside each chat page (Kick, Twitch, YouTube, and emotes from add-ons like 7TV, BTTV and FFZ). The card
   lives in its own shadow root, styled with a constructed sheet, so the site's styles and rules don't touch it.
   Download is asked of the app through a console message (the chat page can't reach the app any other way). */
function emoteAgent(){
  if (window.__kmvEmote) return true;
  let on = false, host = null, root = null, card = null, cur = null, pending = null, showT = 0, hideT = 0, example = false, ctxAt = null, menuOpen = false, exSend = null;
  // How the card asks the app for things: a console message from a chat page (the app's page swaps this for a direct call)
  const send = (what, d) => console.log('__kmv:emote-' + what + ' ' + JSON.stringify(d));
  // The emote behind a picture: its name, a bigger picture, the site, and whether it moves. null: not an emote.
  function emoteOf(img){
    if (!img || img.tagName !== 'IMG') return null;
    const r = img.getBoundingClientRect();
    if (!r.width || r.width > 96 || r.height > 96) return null;          // a picture in chat, not an avatar or banner
    let u; try { u = new URL(img.currentSrc || img.src); } catch { return null; }
    const name = String(img.getAttribute('data-emote-name') || img.alt || img.title || img.getAttribute('aria-label') || '').replace(/^:|:$/g, '').trim();
    if (!name || name.length > 60) return null;
    const h = u.hostname, path = u.pathname;
    let m, big = null, site = '';
    if (h === 'files.kick.com' && (m = path.match(/^\/emotes\/(\d+)\//))){ site = 'Kick'; big = `https://files.kick.com/emotes/${m[1]}/fullsize`; }
    else if (h === 'static-cdn.jtvnw.net' && /^\/emoticons\//.test(path)){ site = 'Twitch'; big = u.href.replace(/\/[123]\.0(?=$|\?)/, '/3.0'); }
    else if (/(^|\.)7tv\.app$/.test(h) && /\/emote\//.test(path)){ site = '7TV'; big = u.href.replace(/\/[1-3]x(\.\w+)?(?=$|\?)/, '/4x$1'); }
    else if (h === 'cdn.betterttv.net' && /\/emote\//.test(path)){ site = 'BTTV'; big = u.href.replace(/\/[12]x(\.\w+)?(?=$|\?)/, '/3x$1'); }
    else if (/(^|\.)frankerfacez\.com$/.test(h) && /\/emote\//.test(path)){ site = 'FFZ'; big = u.href.replace(/\/[12](?=$|\?)/, '/4'); }
    else if (/(^|\.)ggpht\.com$|^www\.gstatic\.com$/.test(h) && img.closest('yt-live-chat-text-message-renderer, #message')){ site = 'YouTube'; big = u.href.replace(/=w\d+-h\d+/, '=w128-h128'); }
    else return null;
    return { name, text: textOf(img, site, name), small: u.href, big: big || u.href, site, animated: /\/animated\/|\.gif(\?|$)/i.test(u.href), addOn: /^(7TV|BTTV|FFZ)$/.test(site) };
  }
  // What to type (or paste) in this chat to get the emote: its code on Twitch and the add-ons, its name on Kick,
  // and on YouTube a standard emoji itself, or a YouTube or channel emoji's shortcode (":_name:").
  function textOf(img, site, name){
    if (site !== 'YouTube') return name;
    const alt = String(img.alt || '').trim(), tip = String(img.getAttribute('shared-tooltip-text') || '').trim();
    if (alt && /\p{Extended_Pictographic}/u.test(alt) && !/[A-Za-z]/.test(alt)) return alt;
    if (/^:[^\s:]+:$/.test(tip)) return tip;
    if (/^:[^\s:]+:$/.test(alt)) return alt;
    return ':' + name + ':';
  }
  const SITE = { Kick: ['#53fc18', '#0a0c0d', 'Kick emote'], Twitch: ['#8a4fff', '#fff', 'Twitch emote'], YouTube: ['#ff3d3d', '#fff', 'YouTube emoji'],
    '7TV': ['#353e43', '#e7ede9', 'From the 7TV add-on'], BTTV: ['#353e43', '#e7ede9', 'From the BetterTTV add-on'], FFZ: ['#353e43', '#e7ede9', 'From the FrankerFaceZ add-on'] };
  const CSS = `:host{all:initial}
    .card{position:fixed;z-index:2147483647;width:272px;box-sizing:border-box;padding:12px;display:flex;flex-direction:column;gap:10px;
      background:#1b2023;border:1px solid #353e43;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4);
      font:13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#e7ede9;opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s}
    .card.show{opacity:1;transform:none} .card[hidden]{display:none}
    .pic{position:relative;height:136px;border-radius:9px;background:#131719;border:1px solid #283034;display:flex;align-items:center;justify-content:center}
    .pic img{max-width:112px;max-height:112px;width:112px;height:112px;object-fit:contain;image-rendering:auto}
    .anim{position:absolute;right:8px;top:8px;font-size:10px;font-weight:800;letter-spacing:.06em;background:rgba(10,12,13,.8);border:1px solid #353e43;border-radius:4px;padding:1px 5px}
    .top{display:flex;align-items:center;gap:8px;min-width:0} .nm{font-size:16px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .badge{flex:none;font-size:10px;font-weight:800;letter-spacing:.06em;border-radius:4px;padding:1px 5px;text-transform:uppercase}
    .sub{font-size:12px;color:#a7b2ac;margin-top:3px}
    .acts{display:flex;gap:8px;border-top:1px solid #283034;padding-top:10px}
    button{all:unset;flex:1;box-sizing:border-box;height:30px;padding:0 4px;white-space:nowrap;border-radius:7px;border:1px solid #353e43;background:#131719;color:#e7ede9;
      font:600 12px ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer}
    button:hover{border-color:#87928c} button:focus-visible{outline:2px solid #53fc18;outline-offset:1px}
    .tip{position:absolute;width:12px;height:12px;background:#1b2023;transform:rotate(45deg)}
    .tip.down{bottom:-7px;border-right:1px solid #353e43;border-bottom:1px solid #353e43} .tip.up{top:-7px;border-left:1px solid #353e43;border-top:1px solid #353e43}`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function build(){
    host = document.createElement('kmv-emote-card');
    root = host.attachShadow({ mode: 'open' });
    try { const sh = new CSSStyleSheet(); sh.replaceSync(CSS); root.adoptedStyleSheets = [sh]; } catch {}
    card = el('div', 'card'); card.hidden = true;
    card.setAttribute('role', 'tooltip');
    card.addEventListener('pointerenter', () => clearTimeout(hideT));
    card.addEventListener('pointerleave', () => hideSoon());
    root.appendChild(card);
    document.documentElement.appendChild(host);
  }
  function fill(e){
    card.textContent = '';
    const pic = el('div', 'pic'), img = el('img');
    img.alt = e.name; img.referrerPolicy = 'no-referrer'; img.src = e.big;
    img.onerror = () => { if (img.src !== e.small) img.src = e.small; };
    pic.appendChild(img);
    if (e.animated) pic.appendChild(el('span', 'anim', 'ANIMATED'));
    const top = el('div', 'top'), s = SITE[e.site];
    top.append(el('span', 'nm', e.name));
    const b = el('span', 'badge', e.addOn ? 'Add-on' : e.site); b.style.background = s[0]; b.style.color = s[1]; top.append(b);
    const info = el('div'); info.append(top, el('div', 'sub', s[2]));
    const acts = el('div', 'acts'), copy = el('button', '', 'Copy name'), pic2 = el('button', '', 'Copy image'), dl = el('button', '', 'Download');
    copy.type = pic2.type = dl.type = 'button';
    const said = (b, text, back) => { b.textContent = text; setTimeout(() => { b.textContent = back; }, 1200); };
    copy.title = 'Copy “' + (e.text || e.name) + '”, to paste into this chat';
    copy.addEventListener('click', () => {
      const t0 = e.text || e.name, done = () => said(copy, 'Copied', 'Copy name');
      const old = () => { const t = el('textarea'); t.value = t0; t.style.cssText = 'position:fixed;left:-999px'; root.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch {} t.remove(); };
      try { navigator.clipboard.writeText(t0).then(done, old); } catch { old(); }
    });
    pic2.title = e.animated ? 'Copy the picture (it pastes moving where files can be pasted, as in chat apps)' : 'Copy the picture';
    pic2.addEventListener('click', () => { (example && exSend ? exSend : send)('copy', { url: e.big, small: e.small, name: e.name }); said(pic2, 'Copied', 'Copy image'); });
    dl.addEventListener('click', () => {
      if (example){ said(dl, 'Only an example', 'Download'); return; }
      send('dl', { url: e.big, small: e.small, name: e.name }); said(dl, 'Saving…', 'Download');
    });
    acts.append(copy, pic2, dl);
    card.append(pic, info, acts, el('span', 'tip'));
  }
  function place(target){
    const r = target.getBoundingClientRect(), W = 272, H = card.offsetHeight || 260, gap = 10;
    const below = r.top - H - gap < 6 && r.bottom + gap + H <= innerHeight - 6;
    const left = Math.max(6, Math.min(innerWidth - W - 6, r.left + r.width / 2 - 28));
    card.style.left = left + 'px';
    card.style.top = (below ? r.bottom + gap : Math.max(6, r.top - H - gap)) + 'px';
    const tip = card.querySelector('.tip');
    tip.className = 'tip ' + (below ? 'up' : 'down');
    tip.style.left = Math.max(10, Math.min(W - 22, r.left + r.width / 2 - left - 6)) + 'px';
  }
  function show(target, e){
    if (!host || !host.isConnected) build();
    cur = target; fill(e);
    card.hidden = false; card.classList.remove('show');
    place(target);
    requestAnimationFrame(() => { place(target); card.classList.add('show'); });
  }
  function hide(){ clearTimeout(showT); clearTimeout(hideT); cur = null; if (card){ card.hidden = true; card.classList.remove('show'); } }
  function hideSoon(){ clearTimeout(hideT); hideT = setTimeout(hide, 220); }
  document.addEventListener('pointerover', ev => {
    if (!on) return;
    const t = ev.target;
    if (host && ev.composedPath && ev.composedPath().includes(host)) return;
    const e = t && t.tagName === 'IMG' ? emoteOf(t) : null;
    if (!e){ if (cur && t !== cur) hideSoon(); return; }
    clearTimeout(hideT);
    if (t === cur) return;
    clearTimeout(showT);
    pending = t;
    showT = setTimeout(() => { if (pending === t && t.isConnected){ example = false; show(t, e); } }, cur ? 90 : 150);   // from one emote to the next: quicker, but passing over one on the way to the card doesn't count
  }, true);
  document.addEventListener('pointerout', ev => {
    if (ev.target === pending){ pending = null; clearTimeout(showT); }
    if (cur && ev.target === cur) hideSoon();
  }, true);
  // The app's right-click menu on an emote is drawn by the app (with the big picture): what was right-clicked, and where.
  document.addEventListener('contextmenu', ev => { ctxAt = { target: ev.target, x: ev.clientX, y: ev.clientY, t: Date.now() }; hide(); }, true);
  // while that menu is open, scrolling the chat closes it (like a native menu)
  const scrolled = () => { if (menuOpen){ menuOpen = false; send('menu-close', {}); } };
  addEventListener('wheel', scrolled, { capture: true, passive: true });
  addEventListener('scroll', () => { scrolled(); if (cur) hide(); }, true);
  addEventListener('blur', hide);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && cur) hide(); }, true);
  window.__kmvEmote = {
    on(v){ on = !!v; if (!on) hide(); }, emoteOf,
    ctx(){
      const c = ctxAt; ctxAt = null;
      if (!c || Date.now() - c.t > 3000) return null;
      const e = emoteOf(c.target); if (!e) return null;
      menuOpen = true;
      return { ...e, x: c.x, y: c.y };
    },
    menuClosed(){ menuOpen = false; },
    // The card for a picture that isn't in a chat (Settings' example): Download does nothing there.
    preview(target, e, ex){ example = !!ex; clearTimeout(hideT); show(target, e); },
    hideSoon(){ hideSoon(); }, hide(){ hide(); },
    setExampleSend(fn){ if (typeof fn === 'function') exSend = fn; }
  };
  return true;
}
let EMOTE_JS;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  EMOTE_JS = `(${emoteAgent.toString()})()`;
}

export { EMOTE_JS, emoteAgent, init };
