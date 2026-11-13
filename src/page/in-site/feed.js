/* ---- The chat's messages as the site sends them, for a linked streamer's ALL tab (chat/all-chat.js) ----
   Runs inside each chat page, with the site's own part (its tap: sites/<id>/in-site/feed.js, plugged into its
   site.js's inSite). It doesn't read the page: it hears what the site's own connection brings, as the page reads it,
   so nothing the page skips or hasn't drawn yet is missed, and deletions arrive as they happen. A websocket message is
   seen when the page reads it (MessageEvent's data), so it works for a connection that was open before this ran; the
   site's tap says which of its texts ALL uses (push) and what kind each thing is (sample), or hooks what else its
   page reads (YouTube: its fetch of new messages). Only what the app uses is passed on, a batch at a time, while the
   app has it on (window.__kmvFeed.on): "__kmv:feed {"s":"twitch","raw":[...]}".
   Settings › Developer › Chat events (#233), while window.__kmvFeed.samp is on: every kind of thing the connection
   brings, counted, with one of each now and then (at most once a minute a kind), every 10 seconds:
   "__kmv:samples {"s":"kick","k":{"<kind>":{"n":3,"xs":["<one of them>"]}}}" (chat/event-samples.js). A rare kind's first
   3 are all kept, and so is one with a status (or moderation_action) not sampled yet: an AutoMod hold's PENDING, then
   its ALLOWED (up to 3 a kind a batch). site: the chat's site's id; tap: its part ({ F, push, sample } -> heard(text)
   for each websocket text, or null), or null. */
function feedAgent(site, tap){
  if (window.__kmvFeed) return true;
  const F = window.__kmvFeed = { on: false, samp: false, sampMs: 10000, recent: [] };   // (sampMs: the tests' shorter wait)   // recent: what the connection brought lately (in-site/send.js checks it before pressing again)
  let batch = [], timer = 0;
  const send = () => { timer = 0; if (!batch.length) return; const raw = batch; batch = []; console.log('__kmv:feed ' + JSON.stringify({ s: site, raw })); };
  const push = x => { if (!F.on) return; batch.push(x); if (batch.length > 400) batch.splice(0, batch.length - 400); if (!timer) timer = setTimeout(send, 250); };
  // Chat events: what kind each thing is (the site's tap says), and what this page has sampled of each kind (got: how
  // many, which variants: a status or moderation_action in its text, also as escaped JSON inside JSON)
  const S = { k: {}, at: {}, got: {}, timer: 0 };
  const variantOf = x => { const m = /(\\*)"(status|moderation_action)\1"\s*:\s*\1"([^"\\]{1,40})\1"/.exec(x); return m ? m[2] + '=' + m[3] : ''; };
  function sample(kind, x){
    if (!F.samp || !kind) return;
    const e = S.k[kind] || (S.k[kind] = { n: 0 }); e.n++;
    const g = S.got[kind] || (S.got[kind] = { n: 0, v: [] }), text = String(x).slice(0, 8000), v = variantOf(text), had = e.xs ? e.xs.length : 0;
    if ((!had && Date.now() - (S.at[kind] || 0) > 60000) || (had < 3 && (g.n < 3 || (v && !g.v.includes(v))))){
      (e.xs || (e.xs = [])).push(text); g.n++;
      if (v && !g.v.includes(v) && g.v.length < 20) g.v.push(v);
    }
    if (!S.timer) S.timer = setTimeout(() => {
      S.timer = 0; const k = S.k; S.k = {};
      Object.keys(k).forEach(n => { if (k[n].xs) S.at[n] = Date.now(); });
      console.log('__kmv:samples ' + JSON.stringify({ s: site, k }));
    }, F.sampMs);
  }
  const heard = tap ? tap({ F, push, sample }) : null;
  const seen = new WeakSet(), d = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
  if (d && d.get) Object.defineProperty(MessageEvent.prototype, 'data', { configurable: true, enumerable: d.enumerable, get(){
    const v = d.get.call(this);
    try { if ((F.on || F.samp) && !seen.has(this) && this.target instanceof WebSocket){ seen.add(this); if (heard && typeof v === 'string') heard(v); if (typeof v === 'string'){ F.recent.push({ t: Date.now(), v: v.slice(0, 4000) }); if (F.recent.length > 60) F.recent.shift(); } } } catch (e) {}
    return v;
  } });
  return true;
}

// A pin already up when ALL starts reading this chat (the sites send a pin only as it's made). Each site's chat page
// asks for its pin as it loads: the site's part (pins: name -> [it as the live pin event] or null) asks the same.
// -> { s, raw } for feedAgent's batch shape, or null (none, or unreadable)
async function pinAgent(site, pins, nameAs){
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];   // (nameAs: the tests')
  if (!pins) return null;
  try {
    const raw = await pins(name);
    return raw && raw.length ? { s: site, raw } : null;
  } catch (e) { return null; }
}

// The messages the site's chat already shows, for ALL as it starts reading the chat (feedAgent only hears what comes
// after), in feedAgent's batch shape, each as its live connection would have brought it (the site's part, shown:
// ({ name, wait, propsOf }) -> [raw]; it may wait for its lines, up to `wait` ms). -> { s, raw: [...] }, or null (none,
// or unreadable)
async function shownAgent(site, shown, nameAs, wait = 8000){
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];   // (nameAs: the tests')
  // the data a line was drawn from: its React props (on the line or its .group), a few levels up
  const propsOf = (el, key) => {
    for (const node of [el, el.querySelector('.group')].filter(Boolean)){
      const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
      for (let f = k && node[k], i = 0; f && i < 8; f = f.return, i++){ const m = (f.memoizedProps || {})[key]; if (m && m.id) return m; }
    }
    return null;
  };
  if (!shown) return null;
  try {
    const raw = await shown({ name, wait, propsOf });
    return raw && raw.length ? { s: site, raw } : null;
  } catch (e) { return null; }
}

// The pictures of the chat's badges, for ALL's lines (feed-parse.js keeps each message's badges as { set, v }): asked
// once as ALL starts reading the chat, of the site's part (badges: (name, global) -> { <site>: … } or null; global:
// also the ones that are the same for every chat, which ALL keeps once). A site whose badges come with their pictures
// has none. -> its answer, or null (none, or unreadable)
async function badgesAgent(site, badges, global, nameAs){
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];   // (nameAs: the tests')
  if (!name || !badges) return null;
  try { return await badges(name, global); } catch (e) { return null; }
}

// The chat's modes and where you stand in it, for ALL's box (chat/all-chat.js): asked as ALL starts reading the chat;
// changes come live after (feed-parse.js). The site's part (modes: ({ name, wait, cookie }) -> its answer) reads them
// from the site, or from what its chat says where its box would be (waiting for it, up to wait ms).
// -> { modes: { slow, followers, subs, emotes, verified }, me: { signedIn, follower, followedAt, sub, mod, vip, host, banned } }
// or { blocked: "<the site's words>", signIn (the site asks you to sign in) }, or null (unreadable)
async function modesAgent(site, modes, nameAs, wait = 8000){
  const name = nameAs || (location.pathname.match(/\/popout\/([^/]+)/) || [])[1];   // (nameAs: the tests')
  const cookie = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
  if (!modes) return null;
  try { return await modes({ name, wait, cookie }); } catch (e) { return null; }
}

// For ALL's check that it reads this chat (chat/all-health.js): how many message lines the page shows, and its newest
// one's text (it changes when a message comes: compared on this computer only). With html: the newest line's HTML for a
// report, its words replaced and only its structure's attributes kept (class, id, role, data-a-target, data-index).
function lineProbe(html){
  const rows = document.querySelectorAll('.chat-line__message, [data-index], yt-live-chat-text-message-renderer');
  const last = rows[rows.length - 1];
  const out = { n: rows.length, last: last ? last.innerText.replace(/\s+/g, ' ').slice(0, 200) : '', id: '' };
  // its message's id (as messageHtml finds it): a line drawn late, of a message already read, is no sign of trouble
  if (last && last.id) out.id = last.id;
  else for (const node of last ? [last, last.querySelector('.group')].filter(Boolean) : []){
    const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
    for (let f = k && node[k], i = 0; f && i < 6 && !out.id; f = f.return, i++){ const p = f.memoizedProps || {}, m = p.message || p.notice || p.msg; if (m && m.id) out.id = String(m.id); }
    if (out.id) break;
  }
  if (html && last){
    const c = last.cloneNode(true), keep = /^(class|id|role|data-a-target|data-index|data-testid)$/;
    const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) t.nodeValue = t.nodeValue.replace(/[^\s]+/g, 'word');
    [c, ...c.querySelectorAll('*')].forEach(e => [...e.attributes].forEach(at => { if (!keep.test(at.name)) e.removeAttribute(at.name); }));
    out.html = c.outerHTML.slice(0, 6000);
  }
  return out;
}

// Developer tools in ALL: that message's line in this chat, found by its id (Twitch and Kick keep it in each line's React
// props, message.id; YouTube as the line's own id): its HTML (Copy message HTML), or with why, how the mention and spam
// alerts read it (Why didn't this alert?: in-site/mentions.js explain)
function messageHtml(id, why){
  const rows = document.querySelectorAll('.chat-line__message, .chat-line__status, [class*="user-notice-line"], [data-index], yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer');
  const idOf = el => {
    if (el.id && el.id === id) return id;
    for (const node of [el, el.querySelector('.group')].filter(Boolean)){   // (Kick's row has props of its own too)
      const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
      for (let f = k && node[k], i = 0; f && i < 6; f = f.return, i++){ const p = f.memoizedProps || {}, m = p.message || p.notice || p.msg; if (m && m.id) return m.id; }
    }
    return '';
  };
  const hit = [...rows].reverse().find(el => idOf(el) === id);
  if (why) return hit && window.__kmvMention ? window.__kmvMention.explain(hit) : null;
  return hit ? hit.outerHTML.slice(0, 50000) : '';
}

// Clicks the sender's name on the message with that id, so the site opens its own card for them. Self-contained (it runs
// in the page on its own). Only the name, each site's in turn: never another button on the line (a moderator's icons
// come before the name, and Twitch's ban icon bans at once). -> whether it did
function profileAgent(id){
  const rows = document.querySelectorAll('.chat-line__message, [data-index], yt-live-chat-text-message-renderer');
  const idOf = el => {
    if (el.id && el.id === id) return id;
    for (const node of [el, el.querySelector('.group')].filter(Boolean)){
      const k = Object.keys(node).find(x => x.startsWith('__reactFiber'));
      for (let f = k && node[k], i = 0; f && i < 6; f = f.return, i++){ const m = (f.memoizedProps || {}).message; if (m && m.id) return m.id; }
    }
    return '';
  };
  const hit = [...rows].reverse().find(el => idOf(el) === id);
  const NAMES = ['[data-a-target="chat-message-username"]', '.chat-author__display-name', '#author-name', 'button[data-prevent-expand]', 'button.inline.font-bold'];
  const name = hit && NAMES.map(s => hit.querySelector(s)).find(Boolean);
  if (!name) return false;
  hit.scrollIntoView({ block: 'center' });
  name.click();
  return true;
}

export { badgesAgent, feedAgent, lineProbe, messageHtml, modesAgent, pinAgent, profileAgent, shownAgent };
