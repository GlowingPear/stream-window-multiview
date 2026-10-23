// What the page does to a stream's or chat's view (the desktop app's <webview>): run a script in its page, add
// CSS, zoom, mute, reload, its id. Every call goes through here, so a view that has gone away (closed, moved to
// another window, or a plain frame in a browser) is ignored the same way everywhere, and a browser version of
// the app would only need to replace this file. Nothing here touches the rest of the page.

// Runs a script in the view's page, for its effect: never fails.
function runIn(view, js){
  if (!view || !view.executeJavaScript) return Promise.resolve();
  try { return view.executeJavaScript(js).catch(() => {}); } catch { return Promise.resolve(); }
}
// Runs a script in the view's page for its result: fails when the page can't run it (the caller decides).
function askIn(view, js){
  if (!view || !view.executeJavaScript) return Promise.reject(new Error('no view'));
  try { return view.executeJavaScript(js); } catch (e) { return Promise.reject(e); }
}
function addCss(view, css){
  try { return Promise.resolve(view.insertCSS(css)).catch(() => {}); } catch { return Promise.resolve(); }
}
// The page's zoom. Chromium shares it between every page of the same site (all Kick chats get the same one).
function setZoom(view, factor){ try { view.setZoomFactor(factor); } catch {} }
// This view only, on top of setZoom: the view is drawn this many times bigger, its page laid out to fit (sharp, and
// the page still fits the window). For making one chat bigger than the others of its site.
function setViewScale(view, factor){ if (view && view.style) view.style.zoom = factor === 1 ? '' : String(factor); }
function zoomOf(view){ try { return view && view.getZoomFactor ? view.getZoomFactor() || 1 : 1; } catch { return 1; } }
function setMuted(view, on){ try { view.setAudioMuted(on); } catch {} }
function reloadView(view){ try { view.reload(); } catch {} }
// Loads an address in the view (also the one it's already on, which setting src again may not do)
function loadView(view, url){
  if (!view || !url) return;
  try { if (view.loadURL) view.loadURL(url).catch(() => {}); else view.src = url; } catch {}
}
// The view's id in the desktop app (the main process names views by it), or null
function focusView(view){ try { view.focus(); } catch {} }   // the keyboard goes to the page in it
function viewId(view){ try { return view && view.getWebContentsId ? view.getWebContentsId() : null; } catch { return null; } }

export { addCss, askIn, focusView, loadView, reloadView, runIn, setMuted, setViewScale, setZoom, viewId, zoomOf };
