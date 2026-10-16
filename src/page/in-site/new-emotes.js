import './emote-preview.js';   // runs after it (see app.js)

/* ---- New emotes: emotes a channel added since you last opened its chat glow until you point at one (#new-emotes).
   The app works out which are new (src/main/emote-lists.js, asked when the chat opens); this marks them in the chat page,
   also in messages that come in later, and tells the app when you've pointed at one. */
function newEmoteAgent(){
  if (window.__kmvNew) return true;
  let fresh = new Set(), queued = false;
  const HOST = /^(files\.kick\.com|static-cdn\.jtvnw\.net|([\w-]+\.)?7tv\.app|cdn\.betterttv\.net|([\w-]+\.)?frankerfacez\.com)$/;
  const nameOf = img => {
    try { if (!HOST.test(new URL(img.currentSrc || img.src).hostname)) return ''; } catch { return ''; }
    return String(img.getAttribute('data-emote-name') || img.alt || img.title || '').replace(/^:|:$/g, '').trim();
  };
  function mark(){
    queued = false;
    document.querySelectorAll('img').forEach(i => {
      const on = fresh.has(nameOf(i));
      if (on !== i.hasAttribute('data-kmv-new')) on ? i.setAttribute('data-kmv-new', '') : i.removeAttribute('data-kmv-new');
    });
  }
  const soon = () => { if (!queued){ queued = true; requestAnimationFrame(mark); } };
  new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
  // pointing at one: it isn't new any more, anywhere
  document.addEventListener('pointerover', e => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.hasAttribute('data-kmv-new')) return;
    const n = nameOf(t);
    fresh.delete(n); mark();
    console.log('__kmv:emote-seen ' + JSON.stringify({ name: n }));
  }, true);
  window.__kmvNew = { set(list){ fresh = new Set(Array.isArray(list) ? list.map(String) : []); mark(); }, list: () => [...fresh] };
  return true;
}
const NEW_EMOTE_JS = `(${newEmoteAgent.toString()})()`;
// The glow: put in by the app (a page's own rules can't block it), in the theme's accent colour.
const NEW_EMOTE_CSS = () => { const a = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#53fc18';
  return `img[data-kmv-new]{outline:2px solid ${a} !important;outline-offset:1px;border-radius:4px;animation:kmvNewEmote 1.6s ease-in-out infinite}
  @keyframes kmvNewEmote{0%,100%{box-shadow:0 0 0 0 ${a}00}50%{box-shadow:0 0 10px 3px ${a}cc}}`; };

export { NEW_EMOTE_CSS, NEW_EMOTE_JS, newEmoteAgent };
