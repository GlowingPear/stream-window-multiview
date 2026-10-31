import { $, ROLE, wins } from '../core.js';
import { openSettings } from '../panels/settings/settings.js';
import { platOf, watchSignedIn, ytVidOf } from './platforms.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { settings } from '../shared/settings.js';
import { askIn, pressIn, reloadView, runIn } from '../windows/view.js';

/* Settings > YouTube: skip ads, and answer YouTube's cookie question (it keeps the video paused until
   it's answered). Checked once a second in each YouTube player. */
function ytAgent(skip, answer){
  const out = {};
  const lb = answer && document.querySelector('ytd-consent-bump-v2-lightbox');
  const dlg = lb && lb.querySelector('tp-yt-paper-dialog');
  if (dlg && dlg.opened){
    // The button is found by its label in the question's own data, so it works in any language.
    const d = lb.data || {}, br = ((answer === 'accept' ? d.agreeButton : d.disagreeButton) || {}).buttonRenderer || {};
    const label = br.text ? (br.text.simpleText || (br.text.runs || []).map(r => r.text).join('')).trim() : '';
    const b = label && [...lb.querySelectorAll('button')].find(x => x.innerText.trim() === label);
    if (b) b.click();
    out.consent = b ? 'clicked' : 'missing';
  }
  // An ad's Skip button. YouTube ignores clicks made by the page's scripts, so the app clicks it for real.
  const sb = skip && [...document.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')]
    .find(e => e.checkVisibility({ visibilityProperty: true }));
  const r = sb && sb.getBoundingClientRect();
  if (r && r.width && r.height){
    if (window.__kmv) window.__kmv.notYou(1500);   // not you touching the player (VOL_JS)
    out.skip = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }
  return out;
}
let skipChk, consentChk, consentPick;
function loadYtSettings(){
  skipChk.checked = settings.flag('ytSkip', true);
  const c = settings.text('ytConsent', 'reject');
  consentChk.checked = c !== 'off';
  consentPick.value = c === 'accept' ? 'accept' : 'reject';
  consentPick.disabled = !consentChk.checked;
}
function ytTick(view, skip, answer){
  askIn(view, `(${ytAgent})(${skip}, ${JSON.stringify(answer)})`).then(r => {
    if (!r) return;
    // The question is still open 3 s after clicking (or its button wasn't found, e.g. YouTube changed it):
    // save "Reject all" in that player's storage the way YouTube does, and load the stream again.
    view.consentTries = r.consent ? (view.consentTries || 0) + 1 : 0;
    if (view.consentTries >= 3 && !view.consentFellBack && window.kmv.ytConsentFallback){
      view.consentFellBack = true;
      window.kmv.ytConsentFallback(view.getAttribute('partition')).then(() => reloadView(view)).catch(() => {});
    }
    if (!r.skip || !skipChk.checked) return;
    pressIn(view, r.skip.x, r.skip.y);   // (a real click, the keyboard left where you were typing)
  }).catch(() => {});
}
/* The like button on YouTube streams. The watch page keeps YouTube's own like button (hidden with the rest
   of the page, see YT_CSS), so the app reads whether it's pressed once a second and clicks it for you. It
   works when the player uses your login: Watch signed in for YouTube (Settings > Accounts), and signed in. */
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
// w.like: what the page said last ({ signedIn, liked }), or null while it's loading
function syncLike(w){
  const b = w.el.querySelector('[data-a=like]'); if (!b) return;
  const l = w.like, on = !!(l && l.signedIn && l.liked);
  b.classList.toggle('on', on);
  b.classList.toggle('dim', !(l && l.signedIn && l.liked !== null));
  b.setAttribute('aria-pressed', String(on));
  b.title = likeHelp(w) || (on ? 'You like this stream on YouTube: click to remove your like' : 'Like this stream on YouTube');
}
// Why the button can't like right now (or '' when it can)
function likeHelp(w){
  const l = w.like;
  if (!watchSignedIn.youtube) return 'To like streams, tick "Watch signed in" for YouTube in Settings › Accounts';
  if (!l) return 'The stream is still loading';
  if (!l.signedIn) return 'To like streams, sign in to YouTube in Settings › Accounts';
  if (l.liked === null) return 'YouTube\'s like button isn\'t on this page';
  return '';
}
function readLike(w, click){
  const view = w.view;
  return askIn(view, `(${ytLikeAgent})(${!!click})`).then(r => {
    if (!r || w.view !== view || r.vid !== ytVidOf(w)) return;   // an old page's answer
    w.like = { signedIn: r.signedIn, liked: r.liked };
    syncLike(w);
    if (!click) autoLike(w, r);
  }).catch(() => {});
}
let autoLikeChk;
const loadAutoLike = () => { autoLikeChk.checked = settings.flag('ytAutoLike'); };
const likedVids = () => { const l = settings.json('ytAutoLiked', []); return Array.isArray(l) ? l : []; };
function markLiked(vid){
  const l = likedVids().filter(v => v !== vid); l.push(vid);
  settings.set('ytAutoLiked', l.slice(-500));
}
function autoLike(w, r){
  if (!autoLikeChk.checked || !r.signedIn || r.liked === null || !r.vid) return;
  if (likedVids().includes(r.vid)){ w.likeWait = 0; return; }
  if (r.liked){ markLiked(r.vid); return; }                 // already liked (by you, or on youtube.com)
  w.likeWait = r.playing ? (w.likeWait || 0) + 1 : 0;      // seconds the stream itself has been playing
  if (w.likeWait < 3) return;
  w.likeWait = 0; markLiked(r.vid);
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
/* Settings > YouTube > Chat to show: Top chat (YouTube's default, hides some messages) or Live chat (all of
   them, so mention and spam alerts see every message). Runs inside each YouTube chat: in the first moments
   after the chat loads, or after YouTube rebuilds it, it picks the view in the chat's own menu, then stops.
   Switching the view yourself in that menu wins until the chat reloads or the setting changes (force). */
function ytChatAgent(want, force){
  const s = window.__kmvYtChat || (window.__kmvYtChat = { want: 0, mine: false, until: 0, tries: 0, at: 0, el: null });
  const menu = () => document.querySelector('#view-selector yt-sort-filter-sub-menu-renderer');
  // The selected item by its position (0 Top chat, 1 Live chat), from the menu's own data, so it works in any language.
  const view = r => {
    const items = r && r.data && r.data.subMenuItems;
    if (Array.isArray(items) && items.length > 1) return items.findIndex(x => x && x.selected);
    const links = r ? [...r.querySelectorAll('tp-yt-paper-listbox a')] : [];
    return links.length > 1 ? links.findIndex(a => a.getAttribute('aria-selected') === 'true') : -1;
  };
  const start = () => { if (Date.now() > s.until){ s.until = Date.now() + 15000; s.tries = 0; } };
  function tick(){
    // Signed out, YouTube's chat in dark mode is drawn half dark: a white message list under white text, and
    // menus you can't read. Its light theme is complete, so that chat uses it (and keeps it if YouTube switches back).
    const de = document.documentElement, list = document.querySelector('yt-live-chat-renderer');
    if (list && de.hasAttribute('dark') && !s.light){
      const c = (getComputedStyle(list).backgroundColor.match(/\d+/g) || []).map(Number);
      if (c.length >= 3 && c[3] !== 0 && c[0] + c[1] + c[2] > 600){
        s.light = true; de.removeAttribute('dark');
        new MutationObserver(() => { if (de.hasAttribute('dark')) de.removeAttribute('dark'); }).observe(de, { attributes: true, attributeFilter: ['dark'] });
      }
    }
    const r = menu();
    if (r !== s.el){ s.el = r; if (r) start(); }          // a new chat header: YouTube rebuilt the chat (or switched its view)
    if (!r || s.mine || Date.now() > s.until) return;
    const v = view(r);
    if (v < 0) return;
    if (v === s.want){ s.until = 0; return; }             // set: stop until the next rebuild
    if (Date.now() - s.at < 1500 || s.tries >= 3) return;
    const a = r.querySelectorAll('tp-yt-paper-listbox a')[s.want];
    if (!a) return;
    s.at = Date.now(); s.tries++;
    a.click();
  }
  if (!s.timer){
    // A real click or key press in the view menu is you picking the view yourself.
    ['click', 'keydown'].forEach(t => window.addEventListener(t, e => {
      if (e.isTrusted && e.target instanceof Element && e.target.closest('#view-selector tp-yt-paper-listbox')) s.mine = true;
    }, true));
    s.timer = setInterval(tick, 500);
  }
  s.want = want ? 1 : 0;
  if (force){ s.mine = false; s.until = 0; }
  start(); tick();
  return { view: view(menu()), mine: s.mine };
}
let chatViewPick;
const loadChatView = () => { chatViewPick.value = settings.get('ytChatView') === 'live' ? 'live' : 'top'; };
// One YouTube chat window: on load, or with force when the setting changes.
function applyChatView(w, force){
  if (!DESKTOP || w.kind !== 'chat' || !w.ready || platOf(w.channel) !== 'youtube') return;
  runIn(w.view, `(${ytChatAgent})(${chatViewPick.value === 'live'}, ${!!force})`);
}
const applyChatViews = () => wins.forEach(w => applyChatView(w, true));

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  skipChk = $('#ytSkip'), consentChk = $('#ytConsent'), consentPick = $('#ytConsentPick');
  loadYtSettings();
  skipChk.addEventListener('change', () => { settings.set('ytSkip', skipChk.checked); });
  [consentChk, consentPick].forEach(el => el.addEventListener('change', () => {
    consentPick.disabled = !consentChk.checked;
    settings.set('ytConsent', consentChk.checked ? consentPick.value : 'off');
  }));
  settings.onChange(['ytSkip', 'ytConsent'], loadYtSettings);   // main and streams windows
  if (DESKTOP) setInterval(() => {
    const skip = skipChk.checked, answer = consentChk.checked ? consentPick.value : '';
    wins.forEach(w => {
      if (w.kind !== 'stream' || platOf(w.channel) !== 'youtube') return;
      if (w.ready) readLike(w);
      if (!skip && !answer) return;
      if (w.ready) ytTick(w.view, skip, answer);
      if (w.mini && w.mini.ready) ytTick(w.mini.wv, skip, answer);
    });
  }, 1000);
  window.ytAgent = ytAgent;   // for the tests

  /* Settings > YouTube > Like streams automatically: once the stream itself has played for a few seconds (after
     the cookie question and any ads), it's liked. Each video once: one you've liked, or removed the like from,
     isn't touched again (remembered between launches). */
  autoLikeChk = $('#ytAutoLike');
  loadAutoLike();
  autoLikeChk.addEventListener('change', () => { settings.set('ytAutoLike', autoLikeChk.checked); });
  settings.onChange('ytAutoLike', loadAutoLike);   // main and streams windows
  window.ytLikeAgent = ytLikeAgent;   // for the tests

  chatViewPick = $('#ytChatView');
  loadChatView();
  chatViewPick.addEventListener('change', () => {
    settings.set('ytChatView', chatViewPick.value);
    applyChatViews();
  });
  settings.onChange('ytChatView', () => { loadChatView(); applyChatViews(); });   // main and streams windows
  window.ytChatAgent = ytChatAgent;   // for the tests
}

export { applyChatView, init, likeHelp, syncLike, toggleLike };
