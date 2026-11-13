/* ---- YouTube's parts of the scripts that read its chat page for ALL (in-site/feed.js has the shared part of each),
   and the scripts only YouTube's chat needs ----
   Each one runs inside a YouTube chat page, as text (see "Scripts that run inside the sites" in src/page/README.md):
   it can't use anything outside itself, only what it's given. site.js plugs them in (its inSite slot), and the page
   passes them to in-site/feed.js's agents as it builds the script (sites/in-site.js). */

// feedAgent's tap: YouTube's chat has no live connection of its own to hear: its page asks for new messages
// (get_live_chat), and each answer's actions are passed on (push) and counted for Settings › Developer › Chat events
// (sample: the action, and its item). It hooks fetch itself. -> null (nothing to hear in a websocket)
function youtubeTap({ F, push, sample }){
  const ytKind = a => { const k = Object.keys(a || {}).find(x => x !== 'clickTrackingParams') || ''; const v = a && a[k] || {}, it = v.item || v.replacementItem || v.bannerRenderer;
    return k + (it ? ':' + (Object.keys(it)[0] || '') : ''); };
  const f = window.fetch;
  window.fetch = async function(...a){
    const r = await f.apply(this, a);
    try {
      if ((F.on || F.samp) && /\/live_chat\/get_live_chat\b/.test(String(a[0] && a[0].url || a[0])))
        r.clone().json().then(j => { const acts = j && j.continuationContents && j.continuationContents.liveChatContinuation && j.continuationContents.liveChatContinuation.actions; if (Array.isArray(acts)) acts.forEach(x => { push(x); sample(ytKind(x), JSON.stringify(x)); }); }).catch(() => {});
    } catch (e) {}
    return r;
  };
  return null;
}

// pinAgent's part: a pin already up, from the page's first data (YouTube sends a pin only as it's made), as its live
// pin action. -> [it] or null
async function youtubePins(){
  const acts = (((window.ytInitialData || {}).contents || {}).liveChatRenderer || {}).actions || [];
  const pins = acts.filter(a => a && a.addBannerToLiveChatCommand);
  return pins.length ? pins : null;
}

// shownAgent's part: the messages the chat already shows, as its actions (each line's own data). -> [action] (none: [])
async function youtubeShown(){
  const KIND = { 'yt-live-chat-text-message-renderer': 'liveChatTextMessageRenderer', 'yt-live-chat-paid-message-renderer': 'liveChatPaidMessageRenderer',
    'yt-live-chat-paid-sticker-renderer': 'liveChatPaidStickerRenderer', 'yt-live-chat-membership-item-renderer': 'liveChatMembershipItemRenderer' };
  return [...document.querySelectorAll(Object.keys(KIND).join(','))].slice(-300).map(el => (el.data && el.data.id ? { addChatItemAction: { item: { [KIND[el.tagName.toLowerCase()]]: JSON.parse(JSON.stringify(el.data)) } } } : null)).filter(Boolean);
}

// modesAgent's part: what its chat says where its box would be (sign in, members only), as it doesn't say more; it builds
// that after the page loads, so it's waited for (up to wait ms). Its box, or what it says instead (Sign in to chat,
// members only, …): each of its lines once, as "what · what to do" (its lines run together read as one sentence), and
// whether it's its sign-in
async function youtubeModes({ wait }){
  for (const end = Date.now() + wait; ; await new Promise(r => setTimeout(r, 250))){
    if (document.querySelector('yt-live-chat-text-input-field-renderer #input')) return { modes: {}, me: { signedIn: true } };
    const say = document.querySelector('yt-live-chat-restricted-participation-renderer, #input-panel');
    const lines = say ? [...new Set(say.innerText.split(/\n+/).map(l => l.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim()).filter(Boolean))] : [];
    if (lines.length){
      const signIn = !!say.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google."], #sign-in-button') || lines.some(l => /\bsign in\b/i.test(l));
      return { blocked: lines.join(' · ').slice(0, 160), ...(signIn ? { signIn } : {}) };
    }
    if (Date.now() >= end) return null;
  }
}

// How its chat page draws names and badges, for ALL to do the same (YouTube changes them as it tries things: a
// moderator's shield and lighter blue, the streamer's pill). From the names it has drawn, else its colours (CSS
// variables); the badges' icons as it drew them, with their colour.
// -> { dark, names: { viewer, mod, member, owner, ownerBg }, icons: { moderator: { svg, color }, … } }
function ytLookAgent(){
  const root = document.documentElement, v = n => getComputedStyle(root).getPropertyValue(n).trim();
  const newMod = !!document.querySelector('yt-live-chat-author-chip[enable-new-moderator-text-color]');
  const names = { viewer: v('--yt-live-chat-secondary-text-color'), mod: v(newMod ? '--yt-live-chat-new-moderator-color' : '--yt-live-chat-moderator-color'),
    member: v('--yt-live-chat-sponsor-color'), owner: v('--yt-live-chat-author-chip-owner-text-color'), ownerBg: v('--yt-live-chat-author-chip-owner-background-color') };
  document.querySelectorAll('yt-live-chat-text-message-renderer yt-live-chat-author-chip:not([is-highlighted]) #author-name').forEach(n => {
    const role = ['owner', 'moderator', 'member'].find(r => n.classList.contains(r)), s = getComputedStyle(n);
    if (!role) names.viewer = s.color;
    else if (role === 'owner'){ names.owner = s.color; names.ownerBg = s.backgroundColor; }
    else names[role === 'moderator' ? 'mod' : 'member'] = s.color;
  });
  Object.keys(names).forEach(k => { if (!names[k]) delete names[k]; });
  const icons = {};
  document.querySelectorAll('yt-live-chat-author-badge-renderer[type]').forEach(b => {
    const type = b.getAttribute('type'), svg = b.querySelector('svg');
    if (svg && /^(moderator|verified|owner)$/.test(type) && !icons[type]) icons[type] = { svg: svg.outerHTML.slice(0, 20000), color: getComputedStyle(b).color };
  });
  return { dark: root.hasAttribute('dark'), names, icons };
}

// heldAgent's part (in-site/mod.js): its held item for the message with that id (its id, as its element's or in its
// data). -> it, or null
function youtubeHeldCard(id){
  return [...document.querySelectorAll('yt-live-chat-auto-mod-message-renderer')].find(el => el.id === id || (el.data && el.data.id === id)) || null;
}

export { youtubeHeldCard, youtubeModes, youtubePins, youtubeShown, youtubeTap, ytLookAgent };
