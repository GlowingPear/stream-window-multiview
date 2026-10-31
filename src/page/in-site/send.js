/* ---- Sending a message from ALL (chat/all-chat.js): runs inside the chat page of the site it's sent on ----
   The text goes into the site's own chat box as typing would, and is sent as Enter (or the send button) would, so
   the site's own rules apply (slow mode, followers-only, its filters) and it shows in its chat as yours. The box is an
   editor on each site (Kick: Lexical, Twitch: Slate, YouTube: its own): Kick's is given a new state (in-site/kick-box.js
   does the same), Twitch's gets it through its own insertText (typed input alone leaves its state empty, so it sends
   nothing), YouTube's as typed input. -> 'sent', or why not: 'no-box' (signed out, or no chat),
   'disabled' (the site says you can't chat here now), 'not-filled' (the box didn't take it),
   'not-sent' (pressed, but the site kept it in its box), or on YouTube { press: { x, y }, start } (its button
   didn't take the script's press: the app presses it for real, then asks sentAgent). (A promise: it waits a moment
   for the editor before sending.) */
async function sendAgent(site, text, sel, fillOnly){
  const BOX = sel || { kick: '[data-testid="chat-input"]', twitch: '[data-a-target="chat-input"]', youtube: 'yt-live-chat-text-input-field-renderer #input' }[site];
  const box = document.querySelector(BOX);
  if (!box) return 'no-box';
  if (box.getAttribute('contenteditable') === 'false' || box.closest('[aria-disabled="true"], [disabled]')) return 'disabled';
  const value = () => (box.isContentEditable ? box.innerText : box.value || '').replace(/[\u200b\ufeff]/g, '').trim();
  box.focus();
  const ed = box.__lexicalEditor;
  // Twitch's Slate editor: found in the box's React props; its own insertText keeps its state in step
  let slate = null;
  const fk = Object.keys(box).find(k => k.startsWith('__reactFiber'));
  for (let f = fk && box[fk], i = 0; f && i < 25 && !slate; f = f.return, i++){ const p = f.memoizedProps || {}; if (p.editor && typeof p.editor.insertText === 'function' && Array.isArray(p.editor.children)) slate = p.editor; }
  if (slate){
    try {
      const end = n => { const path = []; let c = n; while (c.children && c.children.length){ path.push(c.children.length - 1); c = c.children[c.children.length - 1]; } return { path, offset: (c.text || '').length }; };
      slate.selection = { anchor: { path: [0, 0], offset: 0 }, focus: end({ children: slate.children }) };
      if (slate.children.some(b => (b.children || []).some(t => t.text))) slate.deleteFragment();
      slate.insertText(String(text));
    } catch (e) { return 'not-filled'; }
  } else if (ed){
    const t = { detail: 0, format: 0, mode: 'normal', style: '', text: String(text), type: 'text', version: 1 };
    try { ed.setEditorState(ed.parseEditorState(JSON.stringify({ root: { children: [{ children: [t], direction: 'ltr', format: '', indent: 0, type: 'paragraph', version: 1 }], direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } }))); } catch (e) { return 'not-filled'; }
  } else {
    if (!box.isContentEditable && !/^(INPUT|TEXTAREA)$/.test(box.tagName)) return 'not-filled';   // (not something you can type in)
    document.execCommand('selectAll', false);
    if (!document.execCommand('insertText', false, String(text)) || value() !== String(text).trim()){
      if (box.isContentEditable) box.textContent = String(text); else box.value = String(text);
      box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(text) }));
    }
  }
  if (!ed && !slate && value() !== String(text).trim()) return 'not-filled';
  if (fillOnly) return 'filled';   // (only typed into the box, for you to send: Settings › Chat › Shoutouts › Send straight away off)
  await new Promise(r => setTimeout(r, 200));   // (the editor draws the text first; a send before that sends nothing)
  // send: the site's button where it has one, else Enter in the box. The site empties its box once it has sent; if it
  // hasn't, its editor wasn't ready for the press (Twitch's can take a moment), so press again, up to three times.
  // YouTube's button: the <button> inside its #send-button (its yt-button-renderer wrapper comes first in the page and
  // a click on that does nothing). It's off (disabled, or aria-disabled on it or what's around it) until YouTube has
  // seen the text, so it's waited for first.
  const btn = () => {
    if (site === 'twitch') return document.querySelector('[data-a-target="chat-send-button"]');
    const s = site === 'youtube' && document.querySelector('#send-button');
    return s ? s.querySelector('button') || s.querySelector('yt-button-renderer') : null;
  };
  const off = b => { for (let e = b; e; e = e.parentElement){ if (e.disabled || e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true') return true; if (e.id === 'send-button') break; } return false; };
  if (site === 'youtube') for (let t = 0; t < 15 && btn() && off(btn()); t++) await new Promise(r => setTimeout(r, 100));
  // (and never again once the site's connection has brought it back: it was sent, whatever the box shows)
  const start = Date.now(), key = (String(text).match(/[\w ]{4,}/g) || []).sort((a, b) => b.length - a.length)[0];
  const echoed = () => { const R = window.__kmvFeed && window.__kmvFeed.recent; return !!(R && key && R.some(x => x.t >= start && x.v.includes(key))); };
  // YouTube may only take a real press on its button (not a script's): one press here, then the app presses it for real
  // (sender.press in chat/all-chat.js) at its centre, in the page's CSS pixels
  const yt = site === 'youtube' && btn();
  for (let i = 0; i < (yt ? 1 : 3); i++){
    if (i && echoed()) return 'sent';
    const b = btn();
    if (b && !off(b)) b.click();
    else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    for (let t = 0; t < 8; t++){ await new Promise(r => setTimeout(r, 100)); if (!value() || echoed()) return 'sent'; }
  }
  const b = yt && btn(), r = b && !off(b) && b.getBoundingClientRect();
  if (r && r.width && r.height) return { press: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }, start };
  return 'not-sent';
}
// After the app's real press (sendAgent's { press }): 'sent' once the site has emptied its box or its connection has
// brought the message back (since start, sendAgent's), within 1.5 s; else 'not-sent'. Runs inside the chat page too.
async function sentAgent(site, text, start, sel){
  const box = document.querySelector(sel || { kick: '[data-testid="chat-input"]', twitch: '[data-a-target="chat-input"]', youtube: 'yt-live-chat-text-input-field-renderer #input' }[site]);
  const key = (String(text).match(/[\w ]{4,}/g) || []).sort((a, b) => b.length - a.length)[0];
  const echoed = () => { const R = window.__kmvFeed && window.__kmvFeed.recent; return !!(R && key && R.some(x => x.t >= start && x.v.includes(key))); };
  const empty = () => !!box && !(box.isContentEditable ? box.innerText : box.value || '').replace(/[\u200b\ufeff]/g, '').trim();
  for (let t = 0; t < 15; t++){ if (empty() || echoed()) return 'sent'; await new Promise(r => setTimeout(r, 100)); }
  return empty() || echoed() ? 'sent' : 'not-sent';
}

export { sendAgent, sentAgent };
