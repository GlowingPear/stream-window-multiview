/* ---- The chat message you right-clicked: runs inside each chat page (Kick, Twitch, YouTube), for the right-click
   menu's Copy message, Copy message with emotes and Copy message HTML (src/main/context-menu.js). The main process asks
   it with ctx() before it builds the menu: the message's own text (not who sent it), the same with each emote as what
   you'd type for it, and the whole message's HTML. What the app adds to a message (the translate badge, marks) is left out. */
function messageAgent(){
  if (window.__kmvMsg) return true;
  // each site's message text: Twitch, YouTube, Kick (the part after the name and its colon), as the translator finds it
  const BODY = '[data-a-target="chat-line-message-body"], yt-live-chat-text-message-renderer #message, [data-index] div:has(> span[aria-hidden="true"]) + span';
  // the whole message, with its name and badges
  const LINE = '[data-a-target="chat-line-message"], .chat-line__message, yt-live-chat-text-message-renderer, [data-index]';
  const OURS = '[data-kmv-trb], kmv-emote-card, [data-kmv-spam], [class*="kmv-spam"]';
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
  // the message an element is in: { text, withEmotes, html } | null (not a message)
  function messageOf(el){
    if (el && el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.closest) return null;
    let line = el.closest(LINE);
    while (line && line.matches('[data-index]') && line.parentElement && line.parentElement.closest('[data-index]')) line = line.parentElement.closest('[data-index]');   // Kick: the outermost row
    const body = el.closest(BODY) || (line && line.querySelector(BODY));
    if (!body) return null;
    if (!line || !line.contains(body)) line = body.closest(LINE) || body.parentElement || body;
    return { text: textOf(body, false), withEmotes: textOf(body, true), html: htmlOf(line).slice(0, 100000) };
  }
  document.addEventListener('contextmenu', ev => { ctxAt = { target: ev.target, t: Date.now() }; }, true);
  window.__kmvMsg = {
    messageOf,
    ctx(){
      const c = ctxAt; ctxAt = null;
      return c && Date.now() - c.t < 3000 ? messageOf(c.target) : null;
    }
  };
  return true;
}
let MESSAGE_JS;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  MESSAGE_JS = `(${messageAgent.toString()})()`;
}

export { init, MESSAGE_JS, messageAgent };
