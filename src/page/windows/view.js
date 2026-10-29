// What the page does to a stream's or chat's view (the desktop app's <webview>): run a script in its page, add
// CSS, zoom, mute, reload, its id. Every call goes through here, so a view that has gone away (closed, moved to
// another window, or a plain frame in a browser) is ignored the same way everywhere, and a browser version of
// the app would only need to replace this file. Nothing here touches the rest of the page.

// A page still loading: a script waits until it has loaded. Electron's executeJavaScript would wait by itself, but
// with a listener of its own for every call, and a chat asked every second or two while it loads piles them up
// (Node's "MaxListenersExceededWarning: 11 did-stop-loading listeners"). So every call waits on one listener per
// load, and then runs on a loaded page. null: it has loaded, run now.
const loading = new WeakMap();   // view -> the promise of its current load
function whenLoaded(view){
  let busy = false;
  try { busy = !view.getURL() || (view.isLoadingMainFrame ? view.isLoadingMainFrame() : view.isLoading()); } catch { return null; }
  if (!busy || !view.addEventListener) return null;
  let p = loading.get(view);
  if (!p){
    p = new Promise(done => view.addEventListener('did-stop-loading', () => { loading.delete(view); done(); }, { once: true }));
    loading.set(view, p);
  }
  return p;
}
const runNow = (view, js) => { try { return view.executeJavaScript(js); } catch (e) { return Promise.reject(e); } };
// Runs a script in the view's page, for its effect: never fails.
function runIn(view, js){
  if (!view || !view.executeJavaScript) return Promise.resolve();
  const w = whenLoaded(view);
  return (w ? w.then(() => runNow(view, js)) : runNow(view, js)).catch(() => {});
}
// Runs a script in the view's page for its result: fails when the page can't run it (the caller decides).
function askIn(view, js){
  if (!view || !view.executeJavaScript) return Promise.reject(new Error('no view'));
  const w = whenLoaded(view);
  return w ? w.then(() => runNow(view, js)) : runNow(view, js);
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
// A real click (as the pointer's, which a site can't tell from yours) at a point of the view's page, in its CSS pixels
// (scaled by its zoom: the view takes the point in its own pixels; setViewScale doesn't change them): for a button a
// site only takes from a real press (YouTube's Skip ad, its chat's Send). The keyboard stays where it was in this
// page (the click moves it into the view), and the page isn't told you clicked into the view (appPressAt: see
// windows/views.js). false: no view to click.
function pressIn(view, x, y){
  if (!view || !view.sendInputEvent) return false;
  const keep = document.activeElement, z = zoomOf(view);
  if (keep !== view){
    const back = () => { if (keep && keep !== document.body && keep.isConnected) keep.focus(); else view.blur(); };
    view.addEventListener('focus', back, { once: true });
    // the view doesn't always say it took the keyboard (Electron 44): look again a few times
    [50, 200, 500].forEach(ms => setTimeout(() => { if (document.activeElement === view) back(); }, ms));
    setTimeout(() => view.removeEventListener('focus', back), 1000);
  }
  view.appPressAt = Date.now();
  try { ['mouseDown', 'mouseUp'].forEach(type => view.sendInputEvent({ type, x: Math.round(x * z), y: Math.round(y * z), button: 'left', clickCount: 1 })); return true; } catch { return false; }
}
function setMuted(view, on){ try { view.setAudioMuted(on); } catch {} }
function reloadView(view){ try { view.reload(); } catch {} }
// Loads an address in the view (also the one it's already on, which setting src again may not do)
function loadView(view, url){
  if (!view || !url) return;
  try { if (view.loadURL) view.loadURL(url).catch(() => {}); else view.src = url; } catch {}
}
// The view's id in the desktop app (the main process names views by it), or null
// The keyboard goes to the page in it. take: another view has it (you're typing there): the window takes it back first,
// as the view's own focus() then only moves the page's focus. (Only when the window is in front: it would bring it there.)
// A view focused before its page had loaded is focused again, or its page never gets the keyboard.
function focusView(view, { take = false } = {}){
  try { if (take) window.focus(); if (document.activeElement === view) view.blur(); view.focus(); } catch {}
}
function viewId(view){ try { return view && view.getWebContentsId ? view.getWebContentsId() : null; } catch { return null; } }

export { addCss, askIn, focusView, loadView, pressIn, reloadView, runIn, setMuted, setViewScale, setZoom, viewId,
  zoomOf };
