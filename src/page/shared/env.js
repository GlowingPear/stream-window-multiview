import './icons.js';   // runs after it (see app.js)

const DESKTOP = !!(window.kmv && window.kmv.desktop);
// Shortcut names for this computer: Ctrl on Windows and Linux, ⌘ on a Mac.
const IS_MAC = (window.kmv && window.kmv.platform === 'darwin') || /Mac/i.test(navigator.platform || '');
const keyName = s => IS_MAC ? String(s).replace(/Ctrl\+/g, '⌘+') : String(s);

export { DESKTOP, IS_MAC, keyName };
