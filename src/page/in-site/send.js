/* ---- Sending a message from ALL (chat/all-chat.js): runs inside the chat page of the site it's sent on ----
   The text goes into the site's own chat box as typing would, and is sent as Enter (or the send button) would, so
   the site's own rules apply (slow mode, followers-only, its filters) and it shows in its chat as yours. The box is an
   editor on each site (Kick: Lexical, Twitch: Slate, YouTube: its own): Kick's is given a new state (in-site/kick-box.js
   does the same), Twitch's gets it through its own insertText (typed input alone leaves its state empty, so it sends
   nothing), YouTube's as typed input. -> 'sent', or why not: 'no-box' (signed out, or no chat),
   'disabled' (the site says you can't chat here now), 'not-filled' (the box didn't take it),
   'not-sent' (pressed, but the site kept it in its box). (A promise: it waits a moment
   for the editor before sending.) */
async function sendAgent(site, text, sel){
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
  await new Promise(r => setTimeout(r, 200));   // (the editor draws the text first; a send before that sends nothing)
  // send: the site's button where it has one, else Enter in the box. The site empties its box once it has sent; if it
  // hasn't, its editor wasn't ready for the press (Twitch's can take a moment), so press again, up to three times.
  const btn = () => site === 'twitch' ? document.querySelector('[data-a-target="chat-send-button"]') : site === 'youtube' ? document.querySelector('#send-button button, #send-button yt-button-renderer') : null;
  // (and never again once the site's connection has brought it back: it was sent, whatever the box shows)
  const start = Date.now(), key = (String(text).match(/[\w ]{4,}/g) || []).sort((a, b) => b.length - a.length)[0];
  const echoed = () => { const R = window.__kmvFeed && window.__kmvFeed.recent; return !!(R && key && R.some(x => x.t >= start && x.v.includes(key))); };
  for (let i = 0; i < 3; i++){
    if (i && echoed()) return 'sent';
    const b = btn();
    if (b && !b.disabled) b.click();
    else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    for (let t = 0; t < 8; t++){ await new Promise(r => setTimeout(r, 100)); if (!value() || echoed()) return 'sent'; }
  }
  return 'not-sent';
}

export { sendAgent };
