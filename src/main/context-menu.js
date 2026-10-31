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

// Language names in another language: "Spanish" for es, in English (the badge on a translated message).
function languageIn(code, inLang) {
  try { const n = new Intl.DisplayNames([inLang], { type: 'language' }).of(code); return n && n !== code ? n.charAt(0).toLocaleUpperCase(inLang) + n.slice(1) : code; } catch { return code; }
}

// params: Electron's context-menu params. opts: { langs, dev, devTools, emote, chat, message }
//   dev: a developer copy (Inspect); devTools: Settings › Developer › Developer tools is on (a Developer group, with Inspect)
//   emote: the emote under the pointer (see emoteAgent in index.html): { name, text, big, small } where text is what to paste in
//     that chat, big and small its pictures' addresses
//   chat: a chat window's translation state (see translateAgent): { on, auto }; null: not a chat
//   message: the chat message under the pointer (see messageAgent): { text, withEmotes, html, shout }; null: not a message.
//     shout: who sent it, while shoutouts are on in that chat (in-site/shoutout.js): { site, login, name }
// -> [{ label, act, enabled?, checked? } | { label, head: true } | { type: 'separator' }]
function menuFor(params, { langs = ['en'], dev = false, devTools = false, emote = null, chat = null, message = null } = {}) {
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
  const em = emote && typeof emote.text === 'string' && emote.text ? emote : null;
  if (em && p.mediaType === 'image') group([{ label: 'Copy emote text', act: { do: 'copyText', text: em.text } }]);
  if (p.mediaType === 'image' && webUrl(p.srcURL)) group([
    { label: 'Open image in new window', act: { do: 'openImage', url: p.srcURL } },
    { label: 'Save image as…', act: { do: 'saveImage', url: p.srcURL, name: (em && em.name) || p.altText || p.titleText || '' } },
    // an emote: the app copies it (a moving one also as a file, so it pastes moving); another picture: as Chrome copies it
    { label: 'Copy image', act: em && webUrl(em.big) ? { do: 'copyEmote', url: em.big, small: webUrl(em.small) ? em.small : '', name: em.name || '' } : { do: 'copyImage', x: p.x, y: p.y } },
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
  // a chat message: its text without who sent it (emotes left out, or as their text)
  const msg = message && typeof message.html === 'string' && message.html && !p.isEditable ? message : null;
  // Settings › Chat › Shoutouts on: shout out who sent it (the app's page sends it, in this chat)
  const shout = msg && msg.shout && typeof msg.shout === 'object' && /^(kick|twitch)$/.test(msg.shout.site) && /^[\w-]{1,40}$/.test(String(msg.shout.login || '')) ? msg.shout : null;
  if (shout) group([{ label: `Shout out ${String(shout.name || shout.login).slice(0, 40)}`, act: { do: 'shoutout', who: { site: shout.site, login: String(shout.login).toLowerCase(), name: String(shout.name || shout.login).slice(0, 40) } } }]);
  if (msg) group([
    { label: 'Copy message', act: { do: 'copyText', text: msg.text || '' }, enabled: !!msg.text },
    { label: 'Copy message with emotes', act: { do: 'copyText', text: msg.withEmotes || '' }, enabled: !!msg.withEmotes }
  ]);
  // a chat: translate all of it (like Chrome's "Translate to English"), and its new messages as they come
  if (chat && !p.isEditable && !webUrl(p.linkURL)) group([
    { label: `Translate this chat to ${languageName(tl)}`, act: { do: 'translateChat', tl }, checked: !!chat.on },
    { label: 'Translate new messages too', act: { do: 'translateAuto', tl, on: !chat.auto }, checked: !!chat.auto },
    chat.on ? { label: 'Stop translating', act: { do: 'translateStop' } } : null
  ]);
  // nothing in particular: the page itself
  if (!out.length || (chat && !sel && !em && !webUrl(p.linkURL) && !p.isEditable && p.mediaType !== 'image')) group([{ label: 'Reload', act: { do: 'reload' } }]);
  // Developer tools: the message's and the chat's HTML, how the message was read for alerts, and Inspect
  if (devTools) group([
    { label: 'Developer', head: true },
    msg ? { label: 'Copy message HTML', act: { do: 'copyText', text: msg.html } } : null,
    chat && !p.isEditable ? { label: 'Copy chat HTML', act: { do: 'copyChatHtml' } } : null,
    msg ? { label: 'Why didn\'t this alert?', act: { do: 'whyAlert' } } : null,
    { label: 'Inspect', act: { do: 'inspect', x: p.x, y: p.y } }
  ]);
  else if (dev) group([{ label: 'Inspect', act: { do: 'inspect', x: p.x, y: p.y } }]);
  return out;
}

module.exports = { menuFor, translateTarget, languageName, languageIn, translateUrl, searchUrl };
