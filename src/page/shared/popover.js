// A menu or panel that closes when you press outside it, and outside the button that opens it (the button opens
// and closes it itself). button: the element, or a function giving the current one (menus shared by several
// buttons); close: how it closes (hiding it, unless given); capture: before the page's own handlers see the press.
function closeOnOutside(el, { button = null, close = () => { el.hidden = true; }, capture = false } = {}){
  document.addEventListener('pointerdown', e => {
    const b = typeof button === 'function' ? button() : button;
    if (!el.hidden && !el.contains(e.target) && !(b && b.contains(e.target))) close();
  }, capture);
}

export { closeOnOutside };
