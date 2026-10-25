import { ROLE, wins } from '../core.js';
import { pushMyName } from '../panels/bell/all-notifications.js';
import { cleanParts, mentBodyNodes } from '../panels/bell/bell.js';
import { chLabel } from '../platforms/platforms.js';
import { commands } from '../shared/commands.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { winTimer } from '../shared/timers.js';

/* ---- Chat over the stream (the toolbar's Chat over streams button, or Settings > Chat > Show new chat messages over
   the streams; off unless switched on): a channel's new chat messages show over its stream window, at the bottom left,
   each for a few seconds (6 at first) or kept on screen, at most 5 at once (both settings), also over streams popped out
   into the Streams window. The button on a stream's
   title bar turns it off for that channel only (remembered). The chat helper inside each chat hands the messages over
   (setFeed, in-site/mentions.js); the alerts' poll in the main window brings them here (alerts/spam-alerts.js), and the
   main process passes them on to the Streams window. */
// how long each line stays (s), how many at once, and whether they stay until newer ones push them out (Settings > Chat)
const SECS = [4, 6, 10, 15, 30], LINES = [3, 5, 8, 10, 15];
let showSecs = 6, maxLines = 5, keepLines = false;
let overlayOn = false, overlayOff = new Set(), lineId = 0;

// New messages from chat window c (the main window): over its channel's streams here and in the Streams window
function chatOverlay(c, msgs){
  if (!overlayOn || !c || overlayOff.has(c.channel) || !msgs || !msgs.length) return;
  const list = msgs.slice(-maxLines).map(m => ({ sender: String(m.sender || '').slice(0, 30), body: String(m.body || '').slice(0, 300), parts: cleanParts(m.parts) }));
  drawLines(c.channel, list);
  if (DESKTOP && ROLE === 'main' && window.kmv.relayChat) window.kmv.relayChat({ ch: c.channel, msgs: list });
}
// Draws them over this window's streams of that channel
function drawLines(ch, list){
  for (const w of wins) {
    if (w.kind !== 'stream' || w.channel !== ch) continue;
    const body = w.el.querySelector('.body'); if (!body) continue;
    let box = body.querySelector('.co-box');
    if (!box) { box = element('div', { class: 'co-box', 'aria-live': 'polite' }); body.append(box); }
    for (const m of list) {
      const parts = cleanParts(m.parts), id = ++lineId;
      const line = element('div', 'co-line', element('b', null, String(m.sender || '').slice(0, 30)), ': ',
        parts ? mentBodyNodes({}, parts, false) : String(m.body || '').slice(0, 300));
      line.dataset.id = id;
      box.append(line);
      while (box.children.length > maxLines) box.firstElementChild.remove();
      if (!keepLines) fadeLater(w, line);
    }
  }
}
// A line fades after the time set, then goes
function fadeLater(w, line, ms = showSecs * 1000){
  const t = 'co' + line.dataset.id;
  winTimer(w, t, () => { line.classList.add('out'); winTimer(w, t, () => line.remove(), 400); }, ms);
}
// The lines on screen after the settings changed: no more than the number set, and kept ones start to fade once kept is off
function refitLines(){
  wins.forEach(w => {
    const box = w.el.querySelector('.co-box'); if (!box) return;
    while (box.children.length > maxLines) box.firstElementChild.remove();
    if (!keepLines) box.querySelectorAll('.co-line:not(.out)').forEach(l => { if (!(w.timers && w.timers['co' + l.dataset.id])) fadeLater(w, l); });
  });
}
// The button on a stream's title bar: on or off for that channel
function syncOverlayBtn(w){
  const b = w.el && w.el.querySelector('[data-a=overlay]'); if (!b) return;
  const off = overlayOff.has(w.channel);
  b.hidden = !overlayOn;
  b.innerHTML = off ? icon.chatOff : icon.chat;
  b.classList.toggle('off', off);
  b.title = off ? 'Chat over this stream is off. Click to turn it on' : 'Its new chat messages show over this stream. Click to turn that off for this stream';
}
function toggleStreamOverlay(w){
  if (overlayOff.has(w.channel)) overlayOff.delete(w.channel); else overlayOff.add(w.channel);
  settings.set('chatOverlayOff', [...overlayOff]);
  wins.forEach(x => { if (x.channel === w.channel){ syncOverlayBtn(x); if (overlayOff.has(w.channel)) x.el.querySelector('.co-box')?.remove(); } });
  flash(overlayOff.has(w.channel) ? `Chat over ${chLabel(w.channel)}'s stream off` : `Chat over ${chLabel(w.channel)}'s stream on`);
}
// On or off for every stream (the toolbar button, Settings, or the other window)
function setOverlay(on){
  settings.set('chatOverlay', !!on); readOverlay();
  if (ROLE === 'main') pushMyName();                         // the chats start or stop handing over their messages
  flash(on ? 'Chat over streams on' : 'Chat over streams off');
}
function readOverlay(){
  overlayOn = settings.flag('chatOverlay', false);
  overlayOff = new Set([].concat(settings.json('chatOverlayOff', [])));
  keepLines = settings.flag('chatOverlayKeep', false);
  showSecs = SECS.includes(settings.num('chatOverlaySecs', 6)) ? settings.num('chatOverlaySecs', 6) : 6;
  maxLines = LINES.includes(settings.num('chatOverlayLines', 5)) ? settings.num('chatOverlayLines', 5) : 5;
  const keep = document.getElementById('chatOverlayKeep'), secs = document.getElementById('chatOverlaySecs'), lines = document.getElementById('chatOverlayLines');
  if (keep) keep.checked = keepLines;
  if (secs){ secs.value = String(showSecs); secs.closest('.st-row').classList.toggle('st-dim', keepLines); }
  if (lines) lines.value = String(maxLines);
  const sw = document.getElementById('chatOverlaySet'); if (sw) sw.checked = overlayOn;
  const tb = document.getElementById('overlayBtn');
  if (tb){ tb.classList.toggle('on', overlayOn); tb.setAttribute('aria-pressed', String(overlayOn)); }
  wins.forEach(w => { syncOverlayBtn(w); if (!overlayOn) w.el.querySelector('.co-box')?.remove(); });
  refitLines();
}
const overlayIsOn = () => overlayOn;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  readOverlay();
  const sw = document.getElementById('chatOverlaySet');
  if (sw) {
    sw.closest('.st-row').hidden = !DESKTOP;                  // the chats are read from the app
    sw.addEventListener('change', () => setOverlay(sw.checked));
  }
  // how long, kept, how many (the rows under it)
  document.querySelectorAll('.co-opt').forEach(r => { r.hidden = !DESKTOP; });
  const keep = document.getElementById('chatOverlayKeep'), secs = document.getElementById('chatOverlaySecs'), lines = document.getElementById('chatOverlayLines');
  if (keep) keep.addEventListener('change', () => { settings.set('chatOverlayKeep', keep.checked); readOverlay(); });
  if (secs) secs.addEventListener('change', () => { settings.set('chatOverlaySecs', +secs.value); readOverlay(); });
  if (lines) lines.addEventListener('change', () => { settings.set('chatOverlayLines', +lines.value); readOverlay(); });
  const tb = document.getElementById('overlayBtn');
  if (tb && DESKTOP) { tb.hidden = false; tb.onclick = () => setOverlay(!overlayOn); }
  commands.add({ id: 'chat.overlay', title: 'Chat over streams', sub: 'Each stream\'s new chat messages over it for a few seconds', words: ['overlay', 'messages on stream'], icon: 'chat',
    button: '#overlayBtn', toggle: { get: () => overlayOn, set: on => setOverlay(on) } });
  settings.onChange(['chatOverlay', 'chatOverlayOff', 'chatOverlayKeep', 'chatOverlaySecs', 'chatOverlayLines'], () => { readOverlay(); if (ROLE === 'main') pushMyName(); });
  store.watch('wins', () => wins.forEach(syncOverlayBtn));
  // the Streams window: the lines the main window passes on
  if (DESKTOP && ROLE === 'streams') fromApp('onStreamsChat', p => {
    if (overlayOn && p && typeof p.ch === 'string' && Array.isArray(p.msgs) && !overlayOff.has(p.ch)) drawLines(p.ch, p.msgs.slice(-maxLines));
  });
  window.chatOverlay = (ch, msgs) => chatOverlay(wins.find(w => w.kind === 'chat' && w.channel === ch), msgs);   // for the tests
  window.drawChatLines = drawLines;   // for the tests
  window.setChatOverlay = setOverlay;   // for the tests
}

export { chatOverlay, init, overlayIsOn, toggleStreamOverlay };
