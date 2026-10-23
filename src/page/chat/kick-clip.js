import { askKick, kickIcon, kickPanel, openInBrowser, openKickPage } from './kick-panel.js';
import { kickClearBox, kickFillBox } from '../in-site/kick-box.js';
import { element } from '../shared/element.js';
import { focusView, runIn } from '../windows/view.js';

// Kick's /clip in a chat window. On the channel page, "/clip [seconds] [title]" makes a clip of the last 30 seconds (or
// the seconds given, 10 to 180) straight away, titled with what followed or the stream's title, then shows "Share Clip".
// The popout chat the app shows can't, so the chat window does the same (chat/kick-panel.js): the same checks, wording
// and requests as Kick's (read from kick.com, October 2026), made from the chat's page with its login, and a copy of its
// Share Clip panel, the chat's full width over its bottom.
const CLIP_LIMITS = { seconds: 30, min: 10, max: 180, title: 50 };   // the default length, the shortest and longest; title characters
const CLIP_TEXT = {
  create: 'Create Clip', share: 'Share Clip', making: 'Creating your clip...', close: 'Close',
  noLive: 'There is no active livestream.', badLength: `Clip duration must be between ${CLIP_LIMITS.min} and ${CLIP_LIMITS.max} seconds.`,
  failed: 'There was an error creating the clip. Please try again.',
  rateLimit: 'You\'ve exceeded the rate limit. Please wait a minute before initializing another clip.',
  signIn: 'You need to be signed in to Kick to make a clip.',
  done: 'You have successfully published your clip. You can now share it to other places.',
  replaceTitle: 'Discard this clip?', replace: 'You have a clip in progress. Starting a new one will discard it.',
  keep: 'Keep editing', startNew: 'Start new clip',
  copy: 'Copy', copied: 'Copied', download: 'Download', chat: 'Chat'
};
const CLIP_WEB = 'https://web.kick.com/api/v1/clips';

// What followed /clip, read as Kick reads it: the first word is the length in seconds, the rest the title
function clipArgs(text){
  const words = String(text || '').replace(/\s{2,}/g, ' ').trim().split(/\s/);
  return { seconds: words[0] ? Number(words[0]) : CLIP_LIMITS.seconds, title: words.slice(1).join(' ').trim() };
}
// Kick's title: the one given, else the stream's, cut to 50 characters with "..."
function clipTitle(given, stream){
  const t = given || stream || '';
  return t.length > CLIP_LIMITS.title ? t.slice(0, CLIP_LIMITS.title - 3) + '...' : t;
}
const clipFailText = r => r.status === 401 ? CLIP_TEXT.signIn : r.status === 429 ? CLIP_TEXT.rateLimit : CLIP_TEXT.failed;
const clipUrl = (ch, id) => `https://kick.com/${encodeURIComponent(ch)}/clips/${encodeURIComponent(id)}`;

// Makes the clip for what followed /clip in w's chat window, then offers to share it. While one is being made or shared,
// Kick first asks whether to discard it.
function makeClip(w, text = ''){
  if (!w || !w.el) return null;
  const had = w.el.querySelector('.body .kclip');
  if (had){ had.__kclipAgain?.(text); return had; }
  let run = 0;                                     // which clip is being made: an answer for an older one is dropped
  const p = kickPanel(w, 'kclip', CLIP_TEXT.create, () => { run++; });
  runIn(w.view, `(${kickClearBox})()`);            // "/clip …" leaves the chat box, as on Kick's channel page
  let asking = null;                               // while Kick's "Discard this clip?" is up: what to show once it's answered
  const show = (heading, ...children) => {
    if (asking){ asking.next = [heading, children]; return; }
    p.title.textContent = heading; p.card.setAttribute('aria-label', heading);
    p.body.replaceChildren(...children.flat().filter(Boolean));   // (a part that isn't there is null)
    (p.body.querySelector('.kcl-b') || p.card).focus({ preventScroll: true });   // (Close or Keep editing, else the panel, for Esc)
  };
  const closeBtn = () => element('div', 'kcl-foot', element('button', { type: 'button', class: 'kcl-b', onclick: p.close }, CLIP_TEXT.close));
  const failed = text => { p.card.removeAttribute('aria-busy'); show(CLIP_TEXT.create, element('p', { class: 'kcl-err', role: 'alert' }, kickIcon('crossCircle'), element('span', null, text)), closeBtn()); };

  async function start(text){
    const me = ++run, still = () => me === run && p.card.isConnected;
    p.card.setAttribute('aria-busy', 'true');
    show(CLIP_TEXT.create, element('div', { class: 'kcl-making', role: 'status' }, CLIP_TEXT.making));
    const { seconds, title } = clipArgs(text);
    const info = await askKick(w, `https://kick.com/api/v2/channels/${encodeURIComponent(w.channel)}/info`);
    if (!still()) return;
    const live = info.ok && info.data && info.data.livestream;
    if (!info.ok && (info.status === 401 || info.status === 0)) return failed(clipFailText(info));
    if (!live || !live.vod_id) return failed(CLIP_TEXT.noLive);
    if (!Number.isInteger(seconds) || seconds < CLIP_LIMITS.min || seconds > CLIP_LIMITS.max) return failed(CLIP_TEXT.badLength);
    const made = await askKick(w, CLIP_WEB, 'POST', { video_id: live.vod_id });
    if (!still()) return;
    if (!made.ok || !made.data || !made.data.id) return failed(clipFailText(made));
    const clip = await askKick(w, `${CLIP_WEB}/${encodeURIComponent(made.data.id)}/finalize`, 'POST',
      { title: clipTitle(title, live.session_title), trim_duration: seconds, trim_start: Math.max(0, (Number(made.data.source_duration) || 0) - seconds) });
    if (!still()) return;
    if (!clip.ok || !clip.data || !clip.data.id) return failed(clipFailText(clip));
    p.card.removeAttribute('aria-busy');
    share(clip.data);
  }

  // Share Clip: its picture and title, its link to copy, and where to send it
  function share(clip){
    const link = clipUrl(w.channel, clip.id), title = String(clip.title || '');
    const copy = element('button', { type: 'button', class: 'kcl-copy', title: CLIP_TEXT.copy, 'aria-label': CLIP_TEXT.copy }, kickIcon('copy'));
    // Copied: a tick for a second, as on Kick (its title stays: the app's tooltips keep it aside while the pointer's on it)
    const mark = done => { copy.replaceChildren(kickIcon(done ? 'check' : 'copy')); copy.setAttribute('aria-label', done ? CLIP_TEXT.copied : CLIP_TEXT.copy); };
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(link); } catch { return; }
      mark(true);
      setTimeout(() => mark(false), 1000);
    };
    const tile = (icon, label, onclick) => element('button', { type: 'button', class: 'kcl-t', onclick }, kickIcon(icon), element('span', null, label));
    const thumb = element('div', 'kcl-thumb', clip.thumbnail_url ? element('img', { src: String(clip.thumbnail_url), alt: title }) : null);
    show(CLIP_TEXT.share,
      element('div', 'kcl-done', kickIcon('checkCircle'), element('span', null, CLIP_TEXT.done)),
      element('div', 'kcl-card', thumb, element('span', { class: 'kcl-title', title }, title)),
      element('div', 'kcl-url', element('input', { type: 'text', disabled: true, value: link, 'aria-label': 'Clip link' }), copy),
      element('div', 'kcl-tiles',
        // (Kick's Download opens its own download window: here the clip's page, which has it)
        tile('download', CLIP_TEXT.download, () => { p.close(); openKickPage(link); }),
        // (Kick's Chat sends the link at once: here it's put in the chat box, to send with Enter)
        tile('chat', CLIP_TEXT.chat, () => { p.close(); runIn(w.view, `(${kickFillBox})(${JSON.stringify(link)})`); focusView(w.view); }),
        tile('facebook', 'Facebook', () => openInBrowser(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&t=${encodeURIComponent(title)}`)),
        tile('x', 'X', () => openInBrowser(`https://twitter.com/share?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`))));
  }

  // Another /clip while this one is open: Kick's question, here in the panel
  p.card.__kclipAgain = text => {
    if (asking) return;
    const now = { next: [p.title.textContent, [...p.body.childNodes]] };
    const answer = fresh => { asking = null; if (fresh) start(text); else show(...now.next); };
    show(CLIP_TEXT.replaceTitle, element('p', 'kcl-d', CLIP_TEXT.replace),
      element('div', 'kcl-foot',
        element('button', { type: 'button', class: 'kcl-b', onclick: () => answer(false) }, CLIP_TEXT.keep),
        element('button', { type: 'button', class: 'kcl-b danger', onclick: () => answer(true) }, CLIP_TEXT.startNew)));
    asking = now;
  };

  start(text);
  return p.card;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.makeClip = makeClip; window.kickFillBox = kickFillBox;   // for the tests
}

export { init, makeClip };
