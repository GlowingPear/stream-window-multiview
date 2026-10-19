/* ---- Runs inside a Kick, Twitch or YouTube chat page (turned into text: see src/page/README.md). Keeps the chat at its
   newest messages while you're there. The sites stop following new messages when they think you scrolled up, and
   they think so too when their chat was out of sight for a while (under Chat Stage's stage chat, behind Chat Rail's
   rail) or was resized or zoomed. Only your own scrolling (the wheel, keys, dragging) moves you away from the bottom;
   scrolling back down brings you back. While you're at the bottom it puts the chat back there when the page is
   resized or shown again, and every second, except while the pointer is over the chat (Twitch holds it still then,
   for reading). now() goes to the newest messages at once, wherever you were (a chat you just switched to).
   cfg: the site module's chatScroll ({ list, resume }): its message list, and its own "back to the newest" button. */
function stickAgent(cfg){
  if (window.__kmvStick) return true;
  let follow = true, inputAt = 0, over = false, box = null, scannedAt = 0;
  const scrolls = el => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4;
  // the message list: the site's, or else the biggest box that scrolls (looked for at most every 5 s, unless asked to look)
  function list(look){
    if (box && box.isConnected && scrolls(box)) return box;
    box = null;
    const own = cfg.list && document.querySelector(cfg.list);
    if (own && scrolls(own)) return (box = own);
    if (!look && Date.now() - scannedAt < 5000) return null;
    scannedAt = Date.now();
    let most = 0;
    for (const el of document.body ? document.body.querySelectorAll('*') : [])
      if (el.clientHeight > 80 && el.scrollHeight > most && scrolls(el)){ most = el.scrollHeight; box = el; }
    const page = document.scrollingElement;
    if (!box && page && page.scrollHeight > page.clientHeight + 4) box = page;
    return box;
  }
  // how far above the newest message (a list drawn bottom-up has them at 0)
  const reversed = el => el !== document.scrollingElement && getComputedStyle(el).flexDirection === 'column-reverse';
  const gap = el => reversed(el) ? Math.abs(el.scrollTop) : el.scrollHeight - el.clientHeight - el.scrollTop;
  const atBottom = () => { const el = list(); return !el || gap(el) <= 30; };
  function toBottom(look){
    const el = list(look);
    if (el && gap(el) > 2) el.scrollTop = reversed(el) ? 0 : el.scrollHeight;
    const b = cfg.resume && document.querySelector(cfg.resume);
    if (b && b.offsetParent) b.click();
  }
  const settle = () => [0, 150, 500, 1200].forEach(ms => setTimeout(() => { if (follow) toBottom(true); }, ms));   // the site may draw late
  ['wheel', 'keydown', 'pointerdown', 'touchstart'].forEach(t => addEventListener(t, () => { inputAt = Date.now(); }, { capture: true, passive: true }));
  addEventListener('scroll', () => {
    if (Date.now() - inputAt < 1000) follow = atBottom();          // you scrolled: up to read, or back down
    else if (atBottom()) follow = true;
  }, { capture: true, passive: true });
  document.addEventListener('mouseover', () => { over = true; }, true);
  document.documentElement.addEventListener('mouseleave', () => { over = false; });
  addEventListener('resize', () => { if (follow) settle(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && follow) settle(); });
  setInterval(() => { if (follow && !over && !atBottom()) toBottom(); }, 1000);
  window.__kmvStick = {
    now(){ follow = true; settle(); },
    state: () => ({ follow, atBottom: atBottom() })
  };
  return true;
}

export { stickAgent };
