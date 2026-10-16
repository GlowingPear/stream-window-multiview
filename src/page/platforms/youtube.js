// YouTube, as the rest of the page sees it (the same shape as kick.js, which says more).
// YouTube's channel ids are "yt:@handle", "yt:c:UC…" (a channel id) or "yt:v:VIDEOID" (a specific video). A
// channel's stream and chat need its live video's id (vid), which the app looks up when needed.

// Turns a YouTube watch page into a bare player that fills the window.
const YT_PLAYERS = '#movie_player, ytd-reel-video-renderer[is-active] #shorts-player';
const YT_CSS = `
html, body { overflow: hidden !important; background: #000 !important; }
ytd-app { visibility: hidden !important; }
ytd-app, ytd-page-manager, ytd-watch-flexy, ytd-shorts, #columns, #primary, #primary-inner, #player,
#player-container-outer, #player-container-inner, #player-container, #ytd-player, #container.ytd-player,
#full-bleed-container, #player-full-bleed-container, #player-theater-container, ytd-reel-video-renderer,
#shorts-container, #shorts-inner-container, ytd-player, #player-wide-container {
  contain: none !important; transform: none !important; filter: none !important; will-change: auto !important; }
${YT_PLAYERS} {
  visibility: visible !important; position: fixed !important; inset: 0 !important;
  width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important;
  margin: 0 !important; border-radius: 0 !important; z-index: 2147483646 !important; background: #000 !important; }
${YT_PLAYERS.split(', ').map(x => x + ' .html5-video-container').join(', ')} { width: 100% !important; height: 100% !important; }
${YT_PLAYERS.split(', ').map(x => x + ' video.html5-main-video').join(', ')} {
  width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; object-fit: contain !important; }
.ytp-chrome-bottom { left: 12px !important; right: 12px !important; width: auto !important; }
.ytp-miniplayer-button, .ytp-size-button, .ytp-fullscreen-button { display: none !important; }
/* Two of YouTube's questions keep the video paused until answered (the cookie question, "Continue watching?"):
   show those over the player. Its other pop-ups (offers, promos) stay hidden. */
ytd-consent-bump-v2-lightbox, ytd-popup-container tp-yt-paper-dialog:has(yt-confirm-dialog-renderer) { visibility: visible !important; }
ytd-popup-container, ytd-consent-bump-v2-lightbox { position: relative !important; z-index: 2147483647 !important; }
`;
// Nudges YouTube's player to re-measure itself after the CSS above resizes it.
const YT_FIT_JS = `(function(){
  const kick = () => window.dispatchEvent(new Event('resize'));
  if (!window.__kmvYt){
    window.__kmvYt = true;
    window.addEventListener('yt-navigate-finish', () => [100, 600, 1500].forEach(t => setTimeout(kick, t)));
  }
  [0, 300, 1000, 2500, 5000].forEach(t => setTimeout(kick, t));
})()`;

const youtube = {
  id: 'youtube', name: 'YouTube', letter: 'Y',
  mentions: false,       // (YouTube chat isn't read for mentions or spam)
  spamAlerts: false,
  emoteLists: false,
  pageCommands: false,
  likes: true,
  partition: 'persist:youtube',
  idFor: name => 'yt:@' + name,
  handle: ch => ch.slice(3),
  label(ch){ const r = ch.slice(3); return /^(v|c):/.test(r) ? (r[0] === 'v' ? 'YouTube video' : 'YouTube channel') : r; },
  // A channel or video id takes the name YouTube gives it; an "@handle" is already its name.
  namedBySite: ch => /^yt:(v|c):/.test(ch),
  fromUrl(host, parts, u){
    if (host === 'youtu.be' && /^[\w-]{11}$/.test(parts[0] || '')) return { channel: 'yt:v:' + parts[0], only: null };
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return undefined;
    const v = u.searchParams.get('v');
    if (parts[0] === 'live_chat' && v) return { channel: 'yt:v:' + v, only: 'chat' };
    if (parts[0] === 'watch' && /^[\w-]{11}$/.test(v || '')) return { channel: 'yt:v:' + v, only: null };
    if (['live', 'shorts', 'embed', 'v'].includes(parts[0]) && /^[\w-]{11}$/.test(parts[1] || '')) return { channel: 'yt:v:' + parts[1], only: null };
    if (parts[0] && parts[0].startsWith('@')) return { channel: 'yt:' + parts[0].toLowerCase(), only: null };
    if (parts[0] === 'channel' && /^UC[\w-]{10,40}$/.test(parts[1] || '')) return { channel: 'yt:c:' + parts[1], only: null };
    return null;
  },
  // YouTube blocks its embedded player inside apps (error 152-4), so streams load the normal watch page and
  // playerCss trims it down to just the player.
  streamUrl: (ch, muted, vid) => vid ? `https://www.youtube.com/watch?v=${vid}` : null,
  chatUrl: (ch, vid) => vid ? `https://www.youtube.com/live_chat?is_popout=1&v=${vid}` : null,
  pageUrl(ch, kind, vid){
    if (kind === 'chat' && vid) return youtube.chatUrl(ch, vid);
    if (vid) return `https://www.youtube.com/watch?v=${vid}`;
    return ch.startsWith('yt:c:') ? `https://www.youtube.com/channel/${ch.slice(5)}/live` : `https://www.youtube.com/${ch.slice(3)}/live`;
  },
  profileUrl: ch => ch.startsWith('yt:c:') ? 'https://www.youtube.com/channel/' + ch.slice(5) : 'https://www.youtube.com/' + ch.slice(3),
  modUrl: () => null,    // no moderator dashboard for each channel
  chatCss: null,
  stuckJs: null,   // a stream that comes back is a new video, which resolveYt finds (see kick.js)
  // For its stream windows: the watch page trimmed to the player
  playerCss: YT_CSS,
  playerFitJs: YT_FIT_JS,
  raidTarget: () => null
};

export { youtube };
