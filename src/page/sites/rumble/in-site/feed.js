/* ---- Rumble's parts of the scripts that read its chat page for ALL (in-site/feed.js has the shared part of each),
   and the one that answers its cookie question ----
   Each one runs inside a Rumble page, as text (see "Scripts that run inside the sites" in src/page/README.md): it
   can't use anything outside itself, only what it's given. site.js plugs them in (its inSite slot and cookieJs), and the
   page passes them to in-site/feed.js's agents as it builds the script (sites/in-site.js). */

// feedAgent's tap: what Rumble's chat connection brings (an EventSource: each event a JSON text, { type, data }, with
// the people its messages are from in data.users and data.channels, and in "init" the chat's badges, config.badges).
// Each message is passed on (push) with its sender, their badges' pictures and its emotes' pictures, so ALL can read it
// on its own; every kind counted for Settings › Developer › Chat events (sample: its type; a paid message, a rant,
// 'messages:rant'). Its emotes (":name:" in the text) are the chat's list, asked once.
// -> heard(text), for each text the connection brings (heard.events: from an EventSource, not a websocket)
function rumbleTap({ F, push, sample }){
  const chatId = (location.pathname.match(/\/chat\/popup\/(\d+)/) || [])[1] || '';
  const users = {}, channels = {}, badges = {}, emotes = {};
  if (chatId) fetch('/service.php?name=emote.list&chat_id=' + chatId, { credentials: 'include' }).then(r => r.json())
    .then(j => ((j && j.data && j.data.items) || []).forEach(g => (g.emotes || []).forEach(e => { if (e && e.name && e.file) emotes[':' + e.name + ':'] = e.file; })))
    .catch(() => {});
  const person = u => (u ? { id: String(u.id || ''), username: String(u.username || ''), color: String(u.color || ''), badges: Array.isArray(u.badges) ? u.badges.map(String) : [] } : null);
  const pics = u => (u ? u.badges : []).map(b => { const c = badges[b]; const url = c && c.icons && (c.icons[48] || c.icons[24] || Object.values(c.icons)[0]);
    return url ? { url: String(url), title: String((c.label && (c.label.en || Object.values(c.label)[0])) || b) } : null; }).filter(Boolean);
  const raw = (t, m) => {
    if (!m || !m.id) return null;
    const u = person((m.channel_id && channels[m.channel_id]) || users[m.user_id]), e = {};
    String(m.text || '').replace(/:[\w+-]+:/g, x => { if (emotes[x]) e[x] = emotes[x]; return x; });
    return { t, m: { id: String(m.id), time: m.time || '', text: String(m.text || ''), rant: m.rant && m.rant.price_cents ? { cents: +m.rant.price_cents } : null }, u, pics: pics(u), emotes: e };
  };
  const heard = text => {
    let d; try { d = JSON.parse(text); } catch (e) { return; }
    if (!d || typeof d.type !== 'string') return;
    const data = d.data || {}, list = Array.isArray(data.messages) ? data.messages : [];
    (Array.isArray(data.users) ? data.users : []).forEach(u => { if (u && u.id) users[u.id] = u; });
    (Array.isArray(data.channels) ? data.channels : []).forEach(c => { if (c && c.id) channels[c.id] = c; });
    if (data.config && data.config.badges && typeof data.config.badges === 'object') Object.assign(badges, data.config.badges);
    sample(d.type === 'messages' && list.some(m => m && m.rant) ? 'messages:rant' : d.type, text);
    if (d.type === 'messages') list.forEach(m => { const r = raw(m && m.rant ? 'rant' : 'message', m); if (r) push(r); });
    else if (d.type === 'init' && data.pinned_message){ const r = raw('pin', data.pinned_message); if (r) push(r); }
    else if (d.type === 'delete_messages') (data.message_ids || []).forEach(id => push({ t: 'delete', id: String(id) }));
    else if (d.type === 'mute_users') (data.user_ids || []).forEach(id => push({ t: 'mute', id: String(id) }));
    else if (d.type === 'pin_message'){ const r = raw('pin', data.message); if (r) push(r); }
    else if (d.type === 'unpin_message') push({ t: 'unpin' });
  };
  heard.events = true;
  return heard;
}

// shownAgent's part: the messages the chat already shows (its lines: each has its message's and sender's ids, the
// name in its colour, and the message with its emotes as pictures), in the tap's shape. -> [raw] (none: [])
async function rumbleShown({ wait }){
  const rows = () => [...document.querySelectorAll('#chat-history-list li[data-message-id]')];
  for (const end = Date.now() + wait; !rows().length && Date.now() < end; ) await new Promise(r => setTimeout(r, 250));
  return rows().slice(-300).map(li => {
    const name = li.querySelector('.chat-history--username'), body = li.querySelector('.js-chat-message');
    if (!body) return null;
    const parts = [];
    body.childNodes.forEach(n => {
      if (n.nodeType === 3) parts.push({ text: n.nodeValue });
      else if (n.tagName === 'IMG' && n.classList.contains('chat-history--emote')) parts.push({ emote: n.src, name: n.alt || '' });
      else if (n.nodeType === 1) parts.push({ text: n.innerText });
    });
    const pics = [...li.querySelectorAll('img.chat-history--user-badge')].map(b => ({ url: b.src, title: b.title || '' }));
    return { t: 'shown', m: { id: li.dataset.messageId, time: '', text: body.innerText, rant: null },
      u: { id: li.dataset.messageUserId || '', username: li.dataset.username || (name ? name.innerText : ''), color: name ? name.style.color : '', badges: [] }, pics, parts };
  }).filter(Boolean);
}

// Its cookie question (a Ketch banner on every rumble.com page: its chat and its player): answered "Reject all" as
// it shows, by its own button, which saves the answer and loads the page again without it. Run in its stream and chat
// pages as they load (cookieJs); it watches for a minute, as the banner comes a moment after the page.
function rumbleConsent(){
  if (window.__kmvConsent) return true;
  window.__kmvConsent = true;
  const press = () => {
    const b = [...document.querySelectorAll('button')].find(x => /^reject all$/i.test(x.getAttribute('aria-label') || x.innerText.trim()) && /ketch/.test(x.className));
    if (b){ b.click(); obs.disconnect(); }
  };
  const obs = new MutationObserver(press);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60000);
  press();
  return true;
}

export { rumbleConsent, rumbleShown, rumbleTap };
