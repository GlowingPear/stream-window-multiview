/* ---- Mod actions from ALL (chat/all-chat.js) that need a message: runs inside the chat page of its site ----
   Delete and Pin use the site's own buttons on that message, found by its id (Twitch's and Kick's in the line's React
   props) and only by their labels ("Delete", "Delete message", "Pin", "Pin this message…"), so nothing else on the
   line is ever pressed. Timeouts and bans don't come here: they're the site's own slash commands (in-site/send.js).
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
  return 'done';
}

export { modAgent };
