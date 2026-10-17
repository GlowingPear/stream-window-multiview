/* ---- Runs inside a Kick, Twitch or YouTube chat page (turned into text: see src/page/README.md). Shows the channel's
   name (or your text, chat/chat-name.js) as the chat box's empty text instead of the site's "Send a message", and keeps
   it there as the site redraws its box (React, with Slate or Lexical editors). Only the site's usual text changes: a
   box that says something else (followers-only, slow mode, "Sign in to chat") says why you can't chat, so it stays.
   It changes the words in the site's own text, never the elements around them, so the site's code doesn't notice.
   set('') puts the site's own text back. cfg: the site module's chatBox ({ box, hint, attrs, says }). */
function chatNameAgent(cfg){
  if (window.__kmvName) return true;
  const says = new RegExp(cfg.says, 'i');
  const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
  let text = '', queued = false, obs = null;
  const nodes = new Map(), attrs = new Map();   // what this changed -> the site's own words there
  // the first words in an element (a hint can wrap them in another element)
  function wordsIn(el){
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (flat(n.nodeValue)) return n;
    return null;
  }
  function setWords(n){
    const cur = flat(n.nodeValue);
    if (cur === text || !says.test(cur)) return;
    nodes.set(n, n.nodeValue); n.nodeValue = text;
  }
  function setAttr(el, a){
    const cur = el.getAttribute(a);
    if (cur === null || flat(cur) === text || !says.test(flat(cur))) return;
    const was = attrs.get(el) || {}; was[a] = cur; attrs.set(el, was);
    el.setAttribute(a, text);
  }
  function apply(){
    queued = false;
    if (!text) return;
    document.querySelectorAll(cfg.hint).forEach(h => { const n = wordsIn(h); if (n) setWords(n); if (h.hasAttribute('title')) setAttr(h, 'title'); });
    const box = document.querySelector(cfg.box);
    if (box) cfg.attrs.forEach(a => setAttr(box, a));
  }
  // the site's own words back, where it still shows ours
  function putBack(shown){
    nodes.forEach((was, n) => { if (flat(n.nodeValue) === shown) n.nodeValue = was; });
    attrs.forEach((was, el) => Object.keys(was).forEach(a => { if (flat(el.getAttribute(a)) === shown) el.setAttribute(a, was[a]); }));
    nodes.clear(); attrs.clear();
  }
  const soon = () => { if (!queued){ queued = true; setTimeout(apply, 60); } };
  window.__kmvName = {
    set(t){
      const shown = text;
      text = flat(t).slice(0, 120);
      if (shown && shown !== text) putBack(shown);
      if (!text){ if (obs){ obs.disconnect(); obs = null; } return; }
      apply();
      if (!obs){
        obs = new MutationObserver(soon);
        obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'data-placeholder', 'title'] });
      }
    },
    get: () => text
  };
  return true;
}

export { chatNameAgent };
