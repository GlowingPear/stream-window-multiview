/* ---- The chat message you right-clicked: runs inside each chat page (Kick, Twitch, YouTube), for the right-click
   menu's Copy message, Copy message with emotes and Copy message HTML (src/main/context-menu.js). The main process asks
   it with ctx() before it builds the menu: the message's own text (not who sent it), the same with each emote as what
   you'd type for it, the whole message's HTML, and who sent it (Copy with @name). What the app adds to a message (the translate badge, marks) is left out.
   With Developer tools on, the menu also has Copy chat HTML (chatHtml(): the last messages and the list around them)
   and Why didn't this alert? (the mention helper reads last(), the message right-clicked). Errors in the app's own
   scripts in this page (not the site's) go to Settings › Developer's error log as "__kmv:dev-err" messages. */
function messageAgent(){
  if (window.__kmvMsg) return true;
  // each site's message text: Twitch, YouTube, Kick (the part after the name and its colon), as the translator finds it
  const BODY = '[data-a-target="chat-line-message-body"], yt-live-chat-text-message-renderer #message, [data-index] div:has(> span[aria-hidden="true"]) + span';
  // the whole message, with its name and badges
  const LINE = '[data-a-target="chat-line-message"], .chat-line__message, yt-live-chat-text-message-renderer, [data-index]';
  const OURS = '[data-kmv-trb], kmv-emote-card, [data-kmv-spam], [class*="kmv-spam"]';
  // who sent it, as the line shows it: Twitch, YouTube, Kick
  const NAME = '.chat-author__display-name, [data-a-target="chat-message-username"], yt-live-chat-text-message-renderer #author-name, button[data-prevent-expand], button.inline.font-bold';
  let ctxAt = null;
  const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
  // an emote picture as text: what you'd type for it (the emote helper knows), or its name
  function emoteText(img){
    const e = window.__kmvEmote && window.__kmvEmote.emoteOf ? window.__kmvEmote.emoteOf(img) : null;
    return e ? e.text : String(img.getAttribute('data-emote-name') || img.alt || img.title || '').trim();
  }
  function textOf(body, emotes){
    let out = '';
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => n.nodeType === 1 && n.matches(OURS) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()){
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.tagName === 'IMG' && emotes){ const t = emoteText(n); if (t) out += ' ' + t + ' '; }
    }
    return flat(out);
  }
  function htmlOf(line){
    const c = line.cloneNode(true);
    c.querySelectorAll(OURS).forEach(e => e.remove());
    [c, ...c.querySelectorAll('*')].forEach(e => [...e.attributes].forEach(a => { if (/^data-kmv-/.test(a.name)) e.removeAttribute(a.name); }));
    return c.outerHTML;
  }
  // the message an element is in: { line, body } | null (not a message)
  function partsOf(el){
    if (el && el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.closest) return null;
    let line = el.closest(LINE);
    while (line && line.matches('[data-index]') && line.parentElement && line.parentElement.closest('[data-index]')) line = line.parentElement.closest('[data-index]');   // Kick: the outermost row
    const body = el.closest(BODY) || (line && line.querySelector(BODY));
    if (!body) return null;
    if (!line || !line.contains(body)) line = body.closest(LINE) || body.parentElement || body;
    return { line, body };
  }
  function nameOf(m){
    const prev = m.body.previousElementSibling;   // (Kick: the name is before the colon, next to the text)
    const n = [...m.line.querySelectorAll(NAME)].find(e => !m.body.contains(e)) || (prev && [...prev.querySelectorAll('button')].pop());
    return n ? flat(n.textContent).replace(/^@/, '').replace(/:$/, '').slice(0, 40) : '';
  }
  // the message an element is in: { text, withEmotes, html, name } | null (not a message)
  const read = m => m && { text: textOf(m.body, false), withEmotes: textOf(m.body, true), html: htmlOf(m.line).slice(0, 100000), name: nameOf(m) };
  const messageOf = el => read(partsOf(el));
  // The chat's last n messages and what's around them (its list, banners, the pinned message), as HTML for an issue:
  // { html, n, total } | null (no messages). The other messages are left out, and so are scripts, styles, icons'
  // drawings and very long attributes.
  function chatHtml(n){
    const all = [...document.querySelectorAll(LINE)].filter(l => !l.parentElement || !l.parentElement.closest(LINE));
    if (!all.length) return null;
    const keep = all.slice(-Math.max(1, n || 30));
    let box = keep[0].parentElement;
    while (box && !keep.every(l => box.contains(l))) box = box.parentElement;
    for (let b = box; b && b !== document.body && b !== document.documentElement; b = b.parentElement)
      if (/(auto|scroll)/.test(getComputedStyle(b).overflowY)){ box = b; break; }
    if (!box) return null;
    keep.forEach(l => l.setAttribute('data-kmv-keep', ''));
    const c = box.cloneNode(true);
    keep.forEach(l => l.removeAttribute('data-kmv-keep'));
    c.querySelectorAll(LINE).forEach(l => { if (!l.hasAttribute('data-kmv-keep') && !l.closest('[data-kmv-keep]')) l.remove(); });
    c.querySelectorAll(OURS + ', script, style, noscript, template, link').forEach(e => e.remove());
    c.querySelectorAll('svg').forEach(e => { e.innerHTML = ''; });
    [c, ...c.querySelectorAll('*')].forEach(e => [...e.attributes].forEach(a => {
      if (/^data-kmv-/.test(a.name)) e.removeAttribute(a.name);
      else if (a.value.length > 300) e.setAttribute(a.name, a.value.slice(0, 300) + '…');
    }));
    return { html: c.outerHTML.slice(0, 400000), n: keep.length, total: all.length };
  }
  let lastLine = null;
  document.addEventListener('contextmenu', ev => { ctxAt = { target: ev.target, t: Date.now() }; }, true);
  // errors in the app's scripts here: they have no file of their own (the site's do)
  let errs = 0;
  window.addEventListener('error', ev => {
    if (ev.filename || errs >= 20) return;
    errs++;
    console.log('__kmv:dev-err ' + JSON.stringify({ msg: String(ev.message || ev.error || 'error').slice(0, 400), at: ev.lineno ? ev.lineno + ':' + ev.colno : '' }));
  });
  window.__kmvMsg = {
    messageOf, chatHtml,
    ctx(){
      const c = ctxAt; ctxAt = null;
      const m = c && Date.now() - c.t < 3000 ? partsOf(c.target) : null;
      lastLine = m ? m.line : null;
      const r = read(m);
      // (shoutouts on in this chat: who sent it, for the menu's Shout out; in-site/shoutout.js)
      const S = window.__kmvShout;
      if (r && m && S && S.on && S.who) r.shout = S.who(m.line);
      return r;
    },
    // the message last right-clicked (its whole line), while it's still in the chat
    last: () => lastLine && lastLine.isConnected ? lastLine : null
  };
  return true;
}
let MESSAGE_JS;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  MESSAGE_JS = `(${messageAgent.toString()})()`;
}

export { init, MESSAGE_JS, messageAgent };
