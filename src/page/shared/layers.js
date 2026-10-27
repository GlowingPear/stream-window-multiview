/* ---- Dialogs and menus over a dialog ----
   Dialogs (.dlg-bg) share one level in the CSS, and at the same level the one later in the page is drawn on top:
   Settings, near the end, would cover a dialog it opens. So whatever opens while a dialog is open goes above it:
   a dialog, or a menu that closes on a press outside it (closeOnOutside, shared/popover.js, marks it data-outside).
   Only what's needed: one already above every open dialog (the search box's lists, the right-click menus) keeps its
   own level. */
const zOf = el => parseInt(getComputedStyle(el).zIndex, 10) || 0;
function raise(el){
  el.style.zIndex = '';
  const top = Math.max(0, ...[...document.querySelectorAll('.dlg-bg')].filter(d => d !== el && !d.hidden).map(zOf));
  if (zOf(el) <= top) el.style.zIndex = String(top + 1);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  new MutationObserver(changes => changes.forEach(({ target: el }) => { if (!el.hidden && el.matches('.dlg-bg, [data-outside]')) raise(el); }))
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

export { init };
