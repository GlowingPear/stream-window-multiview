import { ROLE, wins } from '../core.js';
import { openSettings } from '../panels/settings/settings.js';
import { platform, sites, watchSignedIn, ytVidOf } from '../platforms/platforms.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { settings } from '../shared/settings.js';
import { askIn } from './view.js';

/* The like button on a stream window (and Like in ALL's line menu, chat/all-chat.js), on a site that has likes (its
   site.js's likes): its stream's like, read and pressed the way that site does it (its likes.read and likes.press:
   YouTube's in its watch page, Rumble's by asking Rumble), once a second while the stream is open. And each site's
   "Like streams automatically" (its likes.auto: its switch in Settings and its saved settings). */

// w.like: what the site said last ({ signedIn, liked }), or null while it's loading
function syncLike(w){
  const b = w.el.querySelector('[data-a=like]'); if (!b) return;
  const l = w.like, on = !!(l && l.signedIn && l.liked);
  b.classList.toggle('on', on);
  b.classList.toggle('dim', !(l && l.signedIn && l.liked !== null));
  b.setAttribute('aria-pressed', String(on));
  const name = platform(w.channel).name;
  b.title = likeHelp(w) || (on ? `You like this stream on ${name}: click to remove your like` : `Like this stream on ${name}`);
}
// Why the button can't like right now (or '' when it can)
function likeHelp(w){
  const s = platform(w.channel), l = w.like;
  if (s.likes.watch && !watchSignedIn[s.id]) return `To like streams, tick "Watch signed in" for ${s.name} in Settings › Accounts`;
  if (!l) return 'The stream is still loading';
  if (!l.signedIn) return `To like streams, sign in to ${s.name} in Settings › Accounts`;
  if (l.liked === null) return s.likes.missing;
  return '';
}
// What a site's likes are given: how to ask in the stream's page, the app's side, the stream's video id, its like now
const likeIo = w => ({ askIn, kmv: window.kmv || {}, vid: ytVidOf(w), like: w.like });
function readLike(w, click){
  const view = w.view, s = platform(w.channel), io = likeIo(w);
  if (!view || !s.likes) return Promise.resolve();
  return Promise.resolve(click ? s.likes.press(w, io) : s.likes.read(w, io)).then(r => {
    if (!r || w.view !== view || r.vid !== ytVidOf(w)) return;   // an old page's answer
    w.like = { signedIn: r.signedIn, liked: r.liked };
    syncLike(w);
    if (!click) autoLike(w, r);
  }).catch(() => {});
}
// Each site's "Like streams automatically": its switch, and the videos it has liked (or you have, or took back)
const autoOn = s => !!(s.likes && s.likes.auto) && settings.flag(s.likes.auto.on);
const likedVids = s => { const l = settings.json(s.likes.auto.done, []); return Array.isArray(l) ? l : []; };
function markLiked(s, vid){
  const l = likedVids(s).filter(v => v !== vid); l.push(vid);
  settings.set(s.likes.auto.done, l.slice(-500));
}
// Once the stream itself has played for a few seconds (after the cookie question and any ads), it's liked. Each video
// once: one you've liked, or removed the like from, isn't touched again (remembered between launches).
function autoLike(w, r){
  const s = platform(w.channel);
  if (!autoOn(s) || !r.signedIn || r.liked === null || !r.vid) return;
  if (likedVids(s).includes(r.vid)){ w.likeWait = 0; return; }
  if (r.liked){ markLiked(s, r.vid); return; }                 // already liked (by you, or on the site)
  w.likeWait = r.playing ? (w.likeWait || 0) + 1 : 0;      // seconds the stream itself has been playing
  if (w.likeWait < 3) return;
  w.likeWait = 0; markLiked(s, r.vid);
  readLike(w, true);
}
function toggleLike(w){
  const help = likeHelp(w);
  if (help){
    flash(help);
    if (ROLE === 'main' && /Settings/.test(help)) openSettings('accounts');
    return;
  }
  readLike(w, true);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  // each site's "Like streams automatically" switch (Settings › its page)
  sites().filter(s => s.likes && s.likes.auto).forEach(s => {
    const box = document.querySelector(s.likes.auto.box); if (!box) return;
    const load = () => { box.checked = settings.flag(s.likes.auto.on); };
    load();
    box.addEventListener('change', () => { settings.set(s.likes.auto.on, box.checked); });
    settings.onChange(s.likes.auto.on, load);   // main and streams windows
  });
  if (DESKTOP) setInterval(() => wins.forEach(w => { if (w.kind === 'stream' && w.ready && platform(w.channel)?.likes) readLike(w); }), 1000);
}

export { init, likeHelp, syncLike, toggleLike };
