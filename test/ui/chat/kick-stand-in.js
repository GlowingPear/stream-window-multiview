// For the tests of Kick's chat panels (kick-prediction.test.js, kick-clip.test.js): a chat window for a channel whose view
// runs what the panel sends to the Kick page (the scripts in in-site/, called with the same arguments) in the app's page,
// with Kick's API replaced by a stand-in fetch. It answers by "METHOD url": window.__routes[key] is { status, body }, 'throw'
// (no answer), or a promise of either (to hold it); anything else is a 404. What was asked is in window.__fetched.
async function kickChat(openApp, t, { width = 340, height = 700, ch = 'xqc' } = {}) {
  const page = await openApp(t, { width: 900, height: 800 });
  await page.evaluate(([width, height, ch]) => {
    window.__ran = []; window.__fetched = []; window.__opened = []; window.__external = []; window.__routes = {};
    window.open = (...a) => { window.__opened.push(a.slice(0, 2)); return null; };
    window.fetch = async (url, o = {}) => {
      const key = `${o.method || 'GET'} ${url}`;
      window.__fetched.push({ key, headers: o.headers, body: o.body ? JSON.parse(o.body) : undefined, credentials: o.credentials });
      const a = await window.__routes[key];
      if (a === 'throw') throw new TypeError('Failed to fetch');
      if (!a) return new Response('{"message":"Not Found"}', { status: 404 });
      return new Response(typeof a.body === 'string' ? a.body : JSON.stringify(a.body ?? null), { status: a.status ?? 200 });
    };
    // "(<function>)(<arguments>)": the function that's on window by that name, with those arguments
    const view = { executeJavaScript: js => {
      window.__ran.push(js);
      const name = /^\((?:async )?function (\w+)/.exec(js)[1], args = JSON.parse('[' + js.slice(js.lastIndexOf('})(') + 3, -1) + ']');
      return Promise.resolve(window[name](...args));
    }, focus() { window.__viewFocused = true; } };
    window.__win = (c = ch, v = view) => {
      document.querySelectorAll('.win[data-ch]').forEach(e => e.remove());
      const el = document.createElement('div'); el.className = 'win chat'; el.dataset.ch = c;
      el.style.cssText = `position:fixed;left:10px;top:60px;width:${width}px;height:${height}px;display:flex;flex-direction:column`;
      el.innerHTML = '<div class="body" style="position:relative;flex:1;min-height:0"></div>';
      document.body.append(el);
      return (window.__w = { channel: c, el, view: v });
    };
    document.cookie = 'session_token=' + encodeURIComponent('123|tok en'); document.cookie = 'XSRF-TOKEN=xs%3D';
  }, [width, height, ch]);
  const routes = r => page.evaluate(r => Object.assign(window.__routes, r), r);
  const fetched = () => page.evaluate(() => window.__fetched);
  const settle = () => page.evaluate(() => new Promise(r => setTimeout(r, 30)));   // (the stand-ins answer at once)
  return { page, routes, fetched, settle };
}

module.exports = { kickChat };
