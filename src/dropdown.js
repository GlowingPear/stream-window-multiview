// In-app dropdowns: every <select> opens this list instead of the system's own menu. On a Mac the system menu
// sits above every app and takes the keyboard, even from a window you can't see (the launch tests' hidden
// windows), and it never matches the app's theme. The <select> stays where it is and keeps its value, so
// code that reads .value or listens for 'change' doesn't notice the difference.
(() => {
  'use strict';
  let open = null;   // { sel, list, items, at }

  const usable = sel => sel instanceof HTMLSelectElement && !sel.multiple && sel.size <= 1 && !sel.disabled;

  function show(sel) {
    close();
    const list = document.createElement('div');
    list.className = 'dd-list';
    list.setAttribute('role', 'listbox');
    const items = [...sel.options].map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1;
      b.setAttribute('role', 'option');
      const ic = sel.ddIcon && sel.ddIcon(o);   // a picture before the text, from the page (a window's channel list)
      if (ic) {                                 // side by side, centred on each other (.dd-list button.ic)
        const t = document.createElement('span');
        t.className = 'dd-t'; t.textContent = o.textContent;
        b.classList.add('ic'); b.append(ic, t);
      } else b.textContent = o.textContent;
      b.disabled = o.disabled;
      if (i === sel.selectedIndex) { b.classList.add('on'); b.setAttribute('aria-selected', 'true'); }
      b.addEventListener('click', () => pick(i));
      b.addEventListener('mouseenter', () => { if (!b.disabled) mark(i, false); });   // the mouse and the keyboard share one highlight
      list.appendChild(b);
      return b;
    });
    // Stays out of the page's own "pressed outside, so close" handlers (a dropdown inside a menu or Settings)
    // and keeps the keyboard on the <select>.
    ['pointerdown', 'mousedown', 'click'].forEach(t => list.addEventListener(t, e => { e.stopPropagation(); if (t !== 'click') e.preventDefault(); }));
    document.body.appendChild(list);
    open = { sel, list, items, at: sel.selectedIndex };
    place();
    sel.setAttribute('aria-expanded', 'true');
    sel.classList.add('dd-open');
    mark(Math.max(0, sel.selectedIndex), true);
  }

  // Below the <select>, or above it when there's more room there; at least as wide as it.
  function place() {
    const { sel, list } = open, r = sel.getBoundingClientRect(), gap = 4, pad = 6;
    list.style.minWidth = Math.round(r.width) + 'px';
    const below = innerHeight - r.bottom - gap - pad, above = r.top - gap - pad;
    const down = below >= Math.min(list.scrollHeight, 240) || below >= above;
    list.style.maxHeight = Math.max(80, Math.floor(down ? below : above)) + 'px';
    const h = list.offsetHeight, w = list.offsetWidth;
    list.style.left = Math.round(Math.max(pad, Math.min(innerWidth - w - pad, r.left))) + 'px';
    list.style.top = Math.round(down ? r.bottom + gap : r.top - gap - h) + 'px';
  }

  function mark(i, scroll) {
    if (!open || !open.items[i]) return;
    open.items.forEach((b, n) => b.classList.toggle('hl', n === i));
    open.at = i;
    if (scroll) open.items[i].scrollIntoView({ block: 'nearest' });
  }

  function pick(i) {
    if (!open) return;
    const { sel } = open;
    close();
    sel.focus({ preventScroll: true });
    if (i === sel.selectedIndex || !sel.options[i] || sel.options[i].disabled) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function close() {
    if (!open) return;
    open.list.remove();
    open.sel.removeAttribute('aria-expanded');
    open.sel.classList.remove('dd-open');
    open = null;
  }

  // the next option that can be picked, going one way
  function step(from, by) {
    const n = open.items.length;
    for (let i = from + by; i >= 0 && i < n; i += by) if (!open.items[i].disabled) return i;
    return from;
  }

  document.addEventListener('mousedown', e => {
    const sel = e.target.closest && e.target.closest('select');
    if (e.button !== 0 || !usable(sel)) return;
    e.preventDefault();                       // no system menu
    const again = open && open.sel === sel;
    sel.focus({ preventScroll: true });
    if (again) close(); else show(sel);
  }, true);

  document.addEventListener('pointerdown', e => {
    if (open && !open.list.contains(e.target) && e.target !== open.sel) close();
  }, true);

  document.addEventListener('keydown', e => {
    const sel = e.target;
    if (open && sel === open.sel) {
      const k = e.key;
      if (k === 'ArrowDown') mark(step(open.at, 1), true);
      else if (k === 'ArrowUp') mark(step(open.at, -1), true);
      else if (k === 'Home') mark(step(-1, 1), true);
      else if (k === 'End') mark(step(open.items.length, -1), true);
      else if (k === 'Enter' || k === ' ') pick(open.at);
      else if (k === 'Escape') close();
      else if (k === 'Tab') { close(); return; }
      else return;
      e.preventDefault(); e.stopPropagation();   // (Escape mustn't also close the dialog it's in)
      return;
    }
    // the keys that open the system menu open this list instead
    if (!usable(sel) || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      show(sel);
    }
  }, true);

  document.addEventListener('focusout', e => { if (open && e.target === open.sel) setTimeout(() => { if (open && document.activeElement !== open.sel) close(); }); });
  document.addEventListener('scroll', e => { if (open && !open.list.contains(e.target)) close(); }, true);
  addEventListener('resize', close);
  addEventListener('blur', close);
})();
