// npm run test:launch:hidden: loaded into the desktop app's main process (with -r, see app.js) so the
// launch tests can run while you work. Every window is invisible and lets clicks through, nothing takes
// your keyboard focus, and there are no desktop notifications or fullscreen Spaces. Playwright doesn't
// need the windows to be seen or focused: it sends clicks and typing straight to the page.
// On a Mac the app is never allowed to become the active app ('prohibited'): with 'accessory' it still
// came to the front. Linux can't make windows see-through, but CI runs there under xvfb-run anyway.
const Module = require('module');
const load = Module._load;
let wrapped;
// The app's `require('electron')` gets a copy whose BrowserWindow opens its windows hidden
// (the real module's BrowserWindow can't be replaced, and `show: true` is handled natively).
Module._load = function (req) {
  const m = load.apply(this, arguments);
  if (req !== 'electron' || !m || !m.BrowserWindow) return m;
  return wrapped || (wrapped = wrap(m));
};

function wrap(electron) {
  const { app, BrowserWindow, Notification } = electron;
  const proto = BrowserWindow.prototype;
  const realShowInactive = proto.showInactive, setOpacity = proto.setOpacity;
  const hide = w => { setOpacity.call(w, 0); w.setHasShadow(false); w.setIgnoreMouseEvents(true); };
  const showInactive = function () { hide(this); realShowInactive.call(this); };
  proto.show = proto.showInactive = showInactive;
  proto.focus = function () { this.webContents.focus(); };   // the keyboard moves inside the app, the app stays behind
  proto.moveTop = function () {};
  proto.setOpacity = function () { setOpacity.call(this, 0); };
  proto.setFullScreen = proto.setSimpleFullScreen = function () {};   // would switch to a Space of its own
  app.focus = () => {};
  Notification.prototype.show = function () {};   // tests that check notifications replace this themselves

  class HiddenWindow extends BrowserWindow {
    constructor(opts = {}) {
      super({ ...opts, show: false });
      Object.setPrototypeOf(this, BrowserWindow.prototype);   // Electron only lists windows whose class is BrowserWindow
      if (opts.show !== false) showInactive.call(this);
    }
  }
  // getAllWindows, fromWebContents and the rest only work on the real class
  for (const k of [...Object.getOwnPropertyNames(BrowserWindow), ...Object.getOwnPropertyNames(Object.getPrototypeOf(BrowserWindow))])
    if (typeof BrowserWindow[k] === 'function' && !['length', 'name', 'prototype'].includes(k)) HiddenWindow[k] = (...a) => BrowserWindow[k](...a);
  Object.defineProperty(HiddenWindow, Symbol.hasInstance, { value: o => o instanceof BrowserWindow });
  app.on('browser-window-created', (_e, w) => hide(w));   // windows Electron opens itself (window.open, extension popups)
  app.setActivationPolicy?.('prohibited');
  globalThis.__smvHidden = true;                          // for the test that checks this mode
  return Object.create(electron, { BrowserWindow: { value: HiddenWindow, enumerable: true } });
}
