// Runs in every page of the YouTube login storage, but only acts on Google's sign-in pages.
// There the app presents itself as Firefox (the user agent is switched by the app): Firefox has no
// navigator.userAgentData and no window.chrome, so those Chrome-only features are hidden to match.
const { contextBridge, webFrame } = require('electron');
function hideChrome() {
  if (!/^(accounts\.google\.com|accounts\.youtube\.com)$/.test(location.hostname)) return;
  try { delete Navigator.prototype.userAgentData; } catch (e) {}
  try { Object.defineProperty(Navigator.prototype, 'vendor', { get: () => '', configurable: true }); } catch (e) {}
  try { delete window.chrome; } catch (e) {}
  try { Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true }); } catch (e) {}
}
try {
  if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: hideChrome });
  else webFrame.executeJavaScript('(' + hideChrome.toString() + ')()');
} catch (e) {}
