// Before anything is drawn (a plain script in index.html's <head>, not a module, so it runs straight away; the
// page's Content-Security-Policy allows no script in the page itself):
// - macOS: the toolbar is marked first, so it never shows without room for the traffic lights;
// - the saved colour theme goes on, so there's no flash of the default colours.
if (window.kmv && window.kmv.platform === 'darwin' && window.kmv.setLights) document.documentElement.classList.add('mac-bar');
try {
  const t = JSON.parse(localStorage.getItem('kickMultiview.theme') || 'null');
  if (t && t.vars) document.getElementById('themeVars').textContent = ':root{' + Object.entries(t.vars)
    .filter(([k, v]) => /^--[a-z0-9-]+$/.test(k) && /^#[0-9a-f]{6}$/i.test(v)).map(([k, v]) => k + ':' + v).join(';')
    + (t.light ? ';color-scheme:light' : ';color-scheme:dark') + '}';
} catch (e) {}
