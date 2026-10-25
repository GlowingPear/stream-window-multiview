// A menu or panel that closes when you press outside it, and outside the button that opens it (the button opens
// and closes it itself). button: the element, or a function giving the current one (menus shared by several
// buttons); close: how it closes (hiding it, unless given); capture: before the page's own handlers see the press.
// A press in a stream or chat never reaches the page (it's another page, in a <webview>), nor one on the Mac
// toolbar's drag area or in another window: viewPressed() (windows/views.js, when you press in a view) and the
// window losing the focus close it too. The Mac toolbar stops being a drag area while one is open (data-outside,
// toolbar/mac-bar.css), so a press on its empty space closes it.
function closeOnOutside(el, { button = null, close = () => { el.hidden = true; }, capture = false } = {}){
  el.dataset.outside = '';
  document.addEventListener('pointerdown', e => {
    const b = typeof button === 'function' ? button() : button;
    if (!el.hidden && !el.contains(e.target) && !(b && b.contains(e.target))) close();
  }, capture);
  const shut = () => { if (!el.hidden) close(); };
  document.addEventListener('kmv-viewpress', shut);
  window.addEventListener('blur', () => { if (!toView()) shut(); });
}
// You pressed in a stream's or chat's view (shared/dropdown.js hears it too)
const viewPressed = () => document.dispatchEvent(new Event('kmv-viewpress'));
// The window losing the focus to one of its own views (that's viewPressed's, which knows the app's own clicks:
// YouTube's Skip) rather than to another window. Asked as the blur happens.
const toView = () => /^(WEBVIEW|IFRAME)$/.test((document.activeElement || {}).tagName);

export { closeOnOutside, viewPressed };
