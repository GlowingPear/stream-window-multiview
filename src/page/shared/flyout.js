/* Submenus of the app's own menus (ALL's line menu, the chats' right-click menu: chat/view-menu.js). A row that opens
   one has an arrow; pointing at it, a click, → or Enter opens its submenu beside it (on the left near the edge), and
   ← or Esc closes it again. The submenu is one element next to the menu (not in it: the menu scrolls, and would cut it
   off), filled with the open row's items; it closes with the menu. Pointing at another row closes it after a moment,
   so the pointer can cross the rows on its way to it.
   flyouts(parent, sub, { zoom }) -> { row(el, items), close() }: items gives the row's items when it opens.
   zoom: the CSS zoom of what the menu sits in (ALL follows its chat's text size). */
const USABLE = '[role^=menuitem]:not(:disabled):not([aria-disabled=true])';
function flyouts(parent, sub, { zoom = () => 1 } = {}){
  let open = null, shutT = 0;
  function close(back = false){
    clearTimeout(shutT);
    if (!open) return;
    const r = open; open = null;
    sub.hidden = true; sub.replaceChildren();
    r.setAttribute('aria-expanded', 'false'); r.classList.remove('open');
    if (back) r.focus({ preventScroll: true });
  }
  // beside the menu, its first item level with the row; inside what it sits in (the window for a fixed one). No room on
  // either side (a narrow chat): under the row (over the rows below it), or over it, so the row stays in sight. Too
  // tall for the room: it scrolls
  function place(r){
    sub.style.maxHeight = '';
    const host = sub.offsetParent, z = zoom() || 1;
    const hr = host ? host.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const mr = parent.getBoundingClientRect(), rr = r.getBoundingClientRect(), W = sub.offsetWidth, M = 4;
    const room = hr.width / z, roomH = hr.height / z, pad = parseFloat(getComputedStyle(sub).paddingTop) || 0;
    const right = (mr.right - hr.left) / z - 2, left = (mr.left - hr.left) / z - W + 2;
    let x, y, H = Math.min(sub.offsetHeight, roomH - 2 * M);
    if (right + W + M <= room || left >= M){ x = right + W + M <= room ? right : left; y = (rr.top - hr.top) / z - pad - 1; }
    else {
      x = (rr.left - hr.left) / z + 24;
      const below = (rr.bottom - hr.top) / z + 2, above = (rr.top - hr.top) / z - 2, under = roomH - M - below, over = above - M;
      H = Math.min(H, Math.max(under, over));
      y = H <= under ? below : above - H;
    }
    sub.style.maxHeight = H + 'px';
    sub.style.left = Math.max(M, Math.min(room - W - M, x)) + 'px';
    sub.style.top = Math.max(M, Math.min(roomH - H - M, y)) + 'px';
  }
  function show(r, items, first){
    clearTimeout(shutT);
    if (open !== r){
      close();
      open = r;
      sub.replaceChildren(...items());
      sub.hidden = false;
      r.setAttribute('aria-expanded', 'true'); r.classList.add('open');
      place(r);
    }
    if (first){ const f = sub.querySelector(USABLE); if (f) f.focus({ preventScroll: true }); }
  }
  function row(r, items){
    r.setAttribute('aria-haspopup', 'menu'); r.setAttribute('aria-expanded', 'false');
    r.addEventListener('pointerenter', () => show(r, items, false));
    r.addEventListener('click', e => { e.stopPropagation(); show(r, items, true); });
    r.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation(); show(r, items, true);
    });
    return r;
  }
  parent.addEventListener('pointerover', e => {
    const r = e.target.closest && e.target.closest('[aria-haspopup=menu]');
    if (open && r !== open){ clearTimeout(shutT); shutT = setTimeout(() => close(), 250); }
  });
  sub.addEventListener('pointerenter', () => clearTimeout(shutT));
  // out of it, other than back to its row: closed after a moment too (it may cover rows, under or over its own)
  sub.addEventListener('pointerleave', e => {
    if (open && !(e.relatedTarget && open.contains(e.relatedTarget))){ clearTimeout(shutT); shutT = setTimeout(() => close(), 250); }
  });
  sub.addEventListener('keydown', e => {
    const list = [...sub.querySelectorAll(USABLE)], at = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const n = list[at < 0 ? (e.key === 'ArrowDown' ? 0 : list.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
      if (n) n.focus({ preventScroll: true });
    }
    else if (e.key === 'Home' || e.key === 'End'){ const n = e.key === 'Home' ? list[0] : list[list.length - 1]; if (n) n.focus({ preventScroll: true }); }
    else if (e.key === 'ArrowLeft' || e.key === 'Escape') close(true);
    else if (e.key === 'Enter' || e.key === ' '){ if (at >= 0) list[at].click(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  // the menu closed (hidden, or taken off the page): so does its submenu
  new MutationObserver(() => { if (parent.hidden || !parent.isConnected) close(); }).observe(parent, { attributes: true, attributeFilter: ['hidden'] });
  return { row, close };
}

export { flyouts };
