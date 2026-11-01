/* ---- Mod actions from ALL (chat/all-chat.js) that need a message: runs inside the chat page of its site ----
   Delete and Pin use the site's own buttons on that message, found by its id (Twitch's and Kick's in the line's React
   props) and only by their labels ("Delete", "Delete message", "Pin", "Pin this message…"), so nothing else on the
   line is ever pressed. Timeouts and bans don't come here: Kick's own request (its modRequest), Twitch's slash commands.
   After a pin, Twitch opens its pin's "Unpin After" panel over its chat (where you don't see it from ALL, and it's
   still open when you go there): it's clicked off, as you'd do, leaving Twitch's 20 minutes. (Watched for a few
   seconds after the answer, so ALL doesn't wait for it.)
   -> 'done', 'no-line' (it's gone from the site's chat) or 'no-button' (the site doesn't offer it there). */
async function modAgent(action, id){
  const LABEL = { delete: /^delete( message)?$/i, pin: /^pin( this message.*)?$/i }[action];
  if (!LABEL) return 'no-button';
  const rows = [...document.querySelectorAll('.chat-line__message, [data-index]')].reverse();
  const idOf = el => {
    for (const node of [el, el.querySelector('.group')].filter(Boolean)){
      const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
      for (let f = k && node[k], i = 0; f && i < 8; f = f.return, i++){ const m = (f.memoizedProps || {}).message; if (m && m.id) return m.id; }
    }
    return '';
  };
  const row = rows.find(el => idOf(el) === id);
  if (!row) return 'no-line';
  const hover = row.querySelector('.group') || row;
  ['mouseover', 'mouseenter'].forEach(t => hover.dispatchEvent(new MouseEvent(t, { bubbles: true })));
  await new Promise(r => setTimeout(r, 150));
  const b = [...row.querySelectorAll('button')].find(x => LABEL.test((x.getAttribute('aria-label') || '').trim()));
  if (!b) return 'no-button';
  b.click();
  if (action === 'pin'){
    const panel = () => [...document.querySelectorAll('body *')].find(el => !el.childElementCount && /^Unpin After$/i.test((el.textContent || '').trim()) && el.getClientRects().length);   // (its heading, or the menu's item that opens it)
    const clickOff = () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      const o = { bubbles: true, cancelable: true, clientX: 1, clientY: 1, button: 0 };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => document.body.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, o) : new MouseEvent(t, o)));
    };
    let n = 0;
    const look = () => { const p = panel(); if (p){ clickOff(); return; } if (++n < 20) setTimeout(look, 150); };
    setTimeout(look, 150);
  }
  return 'done';
}

export { modAgent };
