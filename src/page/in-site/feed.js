/* ---- The chat's messages as the site sends them, for a linked streamer's ALL tab (chat/all-chat.js) ----
   Runs inside each chat page (Kick, Twitch, YouTube). It doesn't read the page: it hears what the site's own
   connection brings, as the page reads it, so nothing the page skips or hasn't drawn yet is missed, and deletions
   arrive as they happen. Twitch: the lines of its chat connection (IRC: messages, subs and gifts, deletions,
   timeouts). Kick: the events of its live connection (messages, deletions). YouTube: the answers to the page's
   requests for new messages. A websocket message is seen when the page reads it (MessageEvent's data), so it works
   for a connection that was open before this ran; YouTube's answers through fetch. Only what the app uses is passed
   on, a batch at a time, while the app has it on (window.__kmvFeed.on): "__kmv:feed {"s":"twitch","raw":[...]}". */
function feedAgent(){
  if (window.__kmvFeed) return true;
  const F = window.__kmvFeed = { on: false };
  const site = /(^|\.)kick\.com$/.test(location.hostname) ? 'kick' : /(^|\.)twitch\.tv$/.test(location.hostname) ? 'twitch' : 'youtube';
  let batch = [], timer = 0;
  const send = () => { timer = 0; if (!batch.length) return; const raw = batch; batch = []; console.log('__kmv:feed ' + JSON.stringify({ s: site, raw })); };
  const push = x => { if (!F.on) return; batch.push(x); if (batch.length > 400) batch.splice(0, batch.length - 400); if (!timer) timer = setTimeout(send, 250); };
  // Twitch's chat lines that ALL shows; Kick's events
  const TW = / (PRIVMSG|USERNOTICE|CLEARMSG|CLEARCHAT) #/;
  const KICK = /App\\Events\\(ChatMessageEvent|MessageDeletedEvent|UserBannedEvent|ChatroomClearEvent)/;
  function heard(data){
    if (typeof data !== 'string') return;
    if (site === 'twitch'){ if (data.includes(' #')) data.split('\r\n').forEach(l => { if (TW.test(l)) push(l); }); }
    else if (site === 'kick' && data.startsWith('{"push"') && KICK.test(data)) push(data);
  }
  const seen = new WeakSet(), d = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
  if (d && d.get) Object.defineProperty(MessageEvent.prototype, 'data', { configurable: true, enumerable: d.enumerable, get(){
    const v = d.get.call(this);
    try { if (F.on && !seen.has(this) && this.target instanceof WebSocket){ seen.add(this); heard(v); } } catch (e) {}
    return v;
  } });
  if (site === 'youtube'){
    const f = window.fetch;
    window.fetch = async function(...a){
      const r = await f.apply(this, a);
      try {
        if (F.on && /\/live_chat\/get_live_chat\b/.test(String(a[0] && a[0].url || a[0])))
          r.clone().json().then(j => { const acts = j && j.continuationContents && j.continuationContents.liveChatContinuation && j.continuationContents.liveChatContinuation.actions; if (Array.isArray(acts)) acts.forEach(push); }).catch(() => {});
      } catch (e) {}
      return r;
    };
  }
  return true;
}

// "See it on …" in ALL: scrolls the site's chat to the message with that id and flashes it. Twitch and Kick keep the id
// in each line's React props (message.id), YouTube as the line's own id. -> whether it was found
function seekAgent(id){
  const rows = document.querySelectorAll('.chat-line__message, .chat-line__status, [class*="user-notice-line"], [data-index], yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer');
  const idOf = el => {
    if (el.id && el.id === id) return id;
    const k = Object.keys(el).find(x => x.startsWith('__reactFiber'));
    for (let f = k && el[k], i = 0; f && i < 6; f = f.return, i++){ const p = f.memoizedProps || {}, m = p.message || p.notice || p.msg; if (m && m.id) return m.id; }
    return '';
  };
  const hit = [...rows].reverse().find(el => idOf(el) === id);
  if (!hit) return false;
  hit.scrollIntoView({ block: 'center' });
  const was = hit.style.outline;
  hit.style.outline = '2px solid #53fc18'; hit.style.outlineOffset = '-2px';
  setTimeout(() => { hit.style.outline = was; }, 2500);
  return true;
}

export { feedAgent, seekAgent };
