import { chatZoom } from './chat-zoom.js';
import { wins } from '../core.js';
import { featSwitch } from '../layout/layouts.js';
import { pushSwitcherState } from '../layout/switch-control.js';
import { chLabel } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { fromSite } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { runIn, setZoom } from '../windows/view.js';

/* ---- Blow up chat on click: a mode in the switch control. While it's on, clicking into a chat window lifts it
   to the middle of the screen, big and with bigger text, over a dimmed layout. Esc, Put back, or a click on the
   dimmed part puts it back where it was, at the normal chat text size. */
const BLOW_SIZES = [1.25, 1.5, 1.75, 2, 2.5, 3];   // the blown-up chat's text, times the normal chat text size
let blowOn = false, blowIdx = 2, blown = null, blowBg = null, blowBar = null;

// The text size a chat window should have: bigger while it's blown up
function chatZoomFor(w){ return chatZoom() * (w === blown ? BLOW_SIZES[blowIdx] : 1); }

// again: the blown-up chat's page loaded again (its text size and Esc are set up anew)
function blowUp(w, again = false){
  if (!w || w.kind !== 'chat' || !wins.includes(w) || (w === blown) !== again) return;
  if (!again){
    if (blown) putBack();
    blown = w;
    w.el.classList.add('blown');
    blowBg.hidden = false; blowBar.hidden = false;
    blowBar.querySelector('.bb-name').textContent = w.channel ? chLabel(w.channel) : 'Chat';
    showBlowSize();
  }
  if (w.ready) setZoom(w.view, chatZoomFor(w));
  // Esc while you're typing in the chat: the chat page tells the app (it has the keyboard, not the app's page)
  if (w.ready) runIn(w.view, `(${blowEscAgent})()`);
}
function putBack(){
  const w = blown; if (!w) return;
  blown = null;
  w.el.classList.remove('blown');
  blowBg.hidden = true; blowBar.hidden = true;
  if (w.ready) setZoom(w.view, chatZoom());
  // let go of the keyboard, so a click into this chat blows it up again
  if (document.activeElement === w.view) w.view.blur();
}
function blownWin(){ return blown; }

function blowSize(d){
  const i = Math.max(0, Math.min(BLOW_SIZES.length - 1, blowIdx + d));
  if (i === blowIdx) return;
  blowIdx = i;
  settings.set('chatBlowSize', blowIdx);
  showBlowSize();
  if (blown && blown.ready) setZoom(blown.view, chatZoomFor(blown));
}
function showBlowSize(){
  if (!blowBar) return;
  blowBar.querySelector('.bb-pct').textContent = Math.round(chatZoom() * BLOW_SIZES[blowIdx] * 100) + '%';
  blowBar.querySelector('[data-b="-1"]').disabled = blowIdx === 0;
  blowBar.querySelector('[data-b="1"]').disabled = blowIdx === BLOW_SIZES.length - 1;
}

function setBlowMode(on){
  blowOn = !!on;
  settings.set('chatBlowup', blowOn);
  if (!blowOn) putBack();
  updateBlowBtn();
  pushSwitcherState();
}
function toggleBlowMode(){
  setBlowMode(!blowOn);
  flash(blowOn ? 'Blow up chat is on: click into a chat to make it big. Esc puts it back.' : 'Blow up chat is off');
}
function updateBlowBtn(){
  const b = featSwitch.querySelector('.fs-blow'); if (!b) return;
  b.classList.toggle('on', blowOn);
  b.setAttribute('aria-pressed', String(blowOn));
  b.innerHTML = `${icon.zoomin}<span>Blow up chat on click</span>`;
  b.title = blowOn ? 'On: click into a chat window to make it big and easy to read (Esc puts it back). Click to switch off.'
    : 'Click into a chat window to make it big and easy to read';
}

// Runs inside the chat page: Esc there asks the app to put the chat back.
function blowEscAgent(){
  if (window.__kmvBlowEsc) return;
  window.__kmvBlowEsc = true;
  window.addEventListener('keydown', e => { if (e.key === 'Escape') console.log('__kmv:blow-esc {}'); }, true);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  blowOn = settings.flag('chatBlowup');
  { const s = settings.get('chatBlowSize'); if (s !== null && BLOW_SIZES[+s]) blowIdx = +s; }
  blowBg = element('div', { id: 'blowBg', hidden: true, onclick: putBack });
  blowBar = element('div', { id: 'blowBar', hidden: true },
    element('span', 'bb-icon', ''), element('span', 'bb-name'),
    element('span', 'bb-size', element('span', 'bb-t', 'Text size'),
      element('button', { 'data-b': '-1', 'aria-label': 'Smaller text', onclick: () => blowSize(-1) }, '−'),
      element('span', 'bb-pct'),
      element('button', { 'data-b': '1', 'aria-label': 'Bigger text', onclick: () => blowSize(1) }, '+')),
    element('button', { class: 'bb-back', title: 'Put this chat back where it was (Esc)', onclick: putBack }, 'Put back', element('kbd', '', 'Esc')));
  blowBar.querySelector('.bb-icon').innerHTML = icon.zoomin;
  document.body.append(blowBg, blowBar);
  fromSite('blow-esc', w => { if (w === blown) putBack(); });
  window.addEventListener('resize', () => { if (blown) showBlowSize(); });
  window.blowUpChat = ch => blowUp(wins.find(w => w.kind === 'chat' && w.channel === ch));   // for the tests
  window.blownWin = () => blown && blown.channel;   // for the tests
}

export { blownWin, blowOn, blowUp, chatZoomFor, init, putBack, showBlowSize, toggleBlowMode, updateBlowBtn };
