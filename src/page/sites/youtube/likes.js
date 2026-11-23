/* YouTube's like (windows/likes.js has the button): the watch page keeps YouTube's own like button (hidden with the rest
   of the page, see YT_CSS in site.js), so it's read once a second and clicked for you. It works when the player uses
   your login: Watch signed in for YouTube (Settings › Accounts), and signed in. */
function ytLikeAgent(click){
  const b = document.querySelector('ytd-watch-metadata like-button-view-model button[aria-pressed]');
  const signedIn = !!(window.ytcfg && window.ytcfg.get && window.ytcfg.get('LOGGED_IN'));
  const vid = new URLSearchParams(location.search).get('v');
  // the stream itself is playing: no ad, and no cookie question waiting for an answer
  const p = document.getElementById('movie_player'), dlg = document.querySelector('ytd-consent-bump-v2-lightbox tp-yt-paper-dialog');
  const playing = !!(p && p.getPlayerState && p.getPlayerState() === 1 && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting') && !(dlg && dlg.opened));
  if (!b) return { vid, signedIn, liked: null, playing };
  let liked = b.getAttribute('aria-pressed') === 'true';
  if (click && signedIn){ b.click(); liked = !liked; }
  return { vid, signedIn, liked, playing };
}
// Its site.js's likes: read and press it in the watch page
const youtubeLikes = {
  read: (w, io) => io.askIn(w.view, `(${ytLikeAgent})(false)`),
  press: (w, io) => io.askIn(w.view, `(${ytLikeAgent})(true)`),
  watch: true,
  missing: 'YouTube\'s like button isn\'t on this page',
  auto: { on: 'ytAutoLike', done: 'ytAutoLiked', box: '#ytAutoLike' }
};

export { youtubeLikes, ytLikeAgent };
