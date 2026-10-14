// The right-click menu in chat and stream windows (their <webview>s), modelled on Chrome's: only the items
// that fit what was clicked. Plain data, so it can be tested: menuFor() gives the items, each with an
// `act` that main.js carries out (open in the browser, copy, save, edit commands…).

// The language to translate into: the system's first preferred language, as Google Translate names it.
function translateTarget(langs) {
  const l = String((Array.isArray(langs) && langs[0]) || 'en').replace('_', '-');
  const [base, region] = l.split('-');
  if (/^zh$/i.test(base)) return /^(TW|HK|MO|Hant)$/i.test(region || '') ? 'zh-TW' : 'zh-CN';
  if (/^(iw|he)$/i.test(base)) return 'iw';
  return /^[a-z]{2,3}$/i.test(base) ? base.toLowerCase() : 'en';
}
// Its name in that language ("English", "Deutsch", "日本語"), as Chrome shows it.
function languageName(code) {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return n && n !== code ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code;
  } catch { return code; }
}
const quoteShort = (t, n = 24) => { const s = String(t).replace(/\s+/g, ' ').trim(); return '“' + (s.length > n ? s.slice(0, n - 1) + '…' : s) + '”'; };
const translateUrl = (text, tl) => `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(tl)}&text=${encodeURIComponent(String(text).slice(0, 5000))}&op=translate`;
const searchUrl = text => `https://www.google.com/search?q=${encodeURIComponent(String(text).slice(0, 500))}`;
const webUrl = u => /^https?:\/\//i.test(String(u || ''));

// params: Electron's context-menu params. opts: { langs, dev }
// -> [{ label, act, enabled? } | { type: 'separator' }]
function menuFor(params, { langs = ['en'], dev = false } = {}) {
  const p = params || {}, f = p.editFlags || {}, out = [];
  const group = items => { const list = items.filter(Boolean); if (!list.length) return; if (out.length) out.push({ type: 'separator' }); out.push(...list); };
  const sel = String(p.selectionText || '').trim();
  const tl = translateTarget(langs);

  // a misspelled word in a text box: the suggestions first, like Chrome
  if (p.isEditable && p.misspelledWord) {
    const sug = (p.dictionarySuggestions || []).slice(0, 5).map(w => ({ label: w, act: { do: 'replaceMisspelling', word: w } }));
    group([...(sug.length ? sug : [{ label: 'No spelling suggestions', enabled: false }]), { label: 'Add to dictionary', act: { do: 'addWord', word: p.misspelledWord } }]);
  }
  if (webUrl(p.linkURL)) group([
    { label: 'Open link in your browser', act: { do: 'external', url: p.linkURL } },
    { label: 'Copy link address', act: { do: 'copyText', text: p.linkURL } }
  ]);
  if (p.mediaType === 'image' && webUrl(p.srcURL)) group([
    { label: 'Open image in new window', act: { do: 'openImage', url: p.srcURL } },
    { label: 'Save image as…', act: { do: 'saveImage', url: p.srcURL, name: p.altText || p.titleText || '' } },
    { label: 'Copy image', act: { do: 'copyImage', x: p.x, y: p.y } },
    { label: 'Copy image address', act: { do: 'copyText', text: p.srcURL } }
  ]);
  if (p.isEditable) group([
    { label: 'Undo', act: { do: 'undo' }, enabled: !!f.canUndo },
    { label: 'Redo', act: { do: 'redo' }, enabled: !!f.canRedo },
    { type: 'separator' },
    { label: 'Cut', act: { do: 'cut' }, enabled: !!f.canCut },
    { label: 'Copy', act: { do: 'copy' }, enabled: !!f.canCopy },
    { label: 'Paste', act: { do: 'paste' }, enabled: !!f.canPaste },
    { label: 'Select all', act: { do: 'selectAll' }, enabled: f.canSelectAll !== false }
  ]);
  if (sel) group([
    p.isEditable ? null : { label: 'Copy', act: { do: 'copy' }, enabled: f.canCopy !== false },
    { label: `Translate ${quoteShort(sel)} to ${languageName(tl)}`, act: { do: 'external', url: translateUrl(sel, tl) } },
    { label: `Search Google for ${quoteShort(sel)}`, act: { do: 'external', url: searchUrl(sel) } }
  ]);
  // nothing in particular: the page itself
  if (!out.length) group([{ label: 'Reload', act: { do: 'reload' } }]);
  if (dev) group([{ label: 'Inspect', act: { do: 'inspect', x: p.x, y: p.y } }]);
  return out;
}

module.exports = { menuFor, translateTarget, languageName, translateUrl, searchUrl };
