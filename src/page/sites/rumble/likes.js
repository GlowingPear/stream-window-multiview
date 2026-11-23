/* Rumble's like (windows/likes.js has the button). Its player (its embed) has no like button, so the app asks Rumble
   itself, with your login (the main process: like:state, like:set): whether you like the stream is read from its
   page, now and then (it's a big page) and after each press, and liking it sends what its own 👍 sends. Whether the
   stream is playing (for "Like streams automatically") comes from its player, every time. */

// Whether its player is playing the stream (not paused, not still loading)
const RU_PLAYING = `(() => { const v = document.querySelector('video'); return !!(v && !v.paused && !v.ended && v.readyState > 2); })()`;
// How long a read of your like is kept before Rumble is asked again
const RU_LIKE_KEEP = 120e3;
// Each stream window's last answer from Rumble: { vid, at, st: { signedIn, liked } | null, asking: promise }
const ruLikeOf = new WeakMap();
function ruLikeState(w, io){
  let k = ruLikeOf.get(w);
  if (k && k.vid === io.vid && (k.asking || Date.now() - k.at < RU_LIKE_KEEP)) return k.asking || Promise.resolve(k.st);
  k = { vid: io.vid, at: Date.now(), st: k && k.vid === io.vid ? k.st : null, asking: null };
  ruLikeOf.set(w, k);
  const ask = io.kmv && io.kmv.likeState && io.vid ? io.kmv.likeState(w.channel, io.vid) : Promise.resolve(null);
  k.asking = Promise.resolve(ask).catch(() => null).then(st => { k.asking = null; k.at = Date.now(); if (st) k.st = st; return k.st; });
  return k.asking;
}
const ruPlaying = (w, io) => Promise.resolve(io.askIn(w.view, RU_PLAYING)).then(Boolean, () => false);
const ruAnswer = (io, st, playing) => ({ vid: io.vid, signedIn: !!(st && st.signedIn), liked: st && st.signedIn && typeof st.liked === 'boolean' ? st.liked : null, playing });

const rumbleLikes = {
  read: async (w, io) => { const [st, playing] = await Promise.all([ruLikeState(w, io), ruPlaying(w, io)]); return ruAnswer(io, st, playing); },
  // liked now: take it back; else like it. Rumble says whether it took it.
  press: async (w, io) => {
    const st = await ruLikeState(w, io), playing = await ruPlaying(w, io);
    if (!st || !st.signedIn || typeof st.liked !== 'boolean' || !io.kmv || !io.kmv.likeSet) return ruAnswer(io, st, playing);
    const r = await Promise.resolve(io.kmv.likeSet(w.channel, io.vid, !st.liked)).catch(() => null);
    const k = ruLikeOf.get(w);
    if (r && typeof r.liked === 'boolean' && k && k.vid === io.vid){ k.st = { ...st, liked: r.liked }; k.at = Date.now(); }
    return ruAnswer(io, r && typeof r.liked === 'boolean' ? { ...st, liked: r.liked } : st, playing);
  },
  missing: 'Couldn\'t read your like from Rumble just now',
  auto: { on: 'ruAutoLike', done: 'ruAutoLiked', box: '#ruAutoLike' },
  playingJs: RU_PLAYING, keep: RU_LIKE_KEEP   // (for its tests)
};

export { rumbleLikes };
