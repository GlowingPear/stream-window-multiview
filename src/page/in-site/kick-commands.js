import './translate.js';   // runs after it (see app.js)
import { DESKTOP } from '../shared/env.js';
import { MENTION_JS, mentionAgent } from './mentions.js';
import { emoteAgent } from './emote-preview.js';
import { newEmoteAgent } from './new-emotes.js';
import { translateAgent } from './translate.js';
import { platOf } from '../platforms/platforms.js';

// Kick chat commands that only work on the channel page: the popout chat (what the app shows) knows them
// but has nowhere to show their popup, so they do nothing there. The app offers to open the channel page.
const KICK_PAGE_CMDS = { clip: 'make a clip', poll: 'start a poll', prediction: 'start a prediction' };
// Runs inside each Kick chat page: a message that is one of these commands isn't sent (Enter or the send
// button); the app is told through a console message instead.
function kickCmdAgent(names){
  if (window.__kmvKickCmd) return true;
  const re = new RegExp('^\\s*/(' + names.join('|') + ')(?:\\s|$)', 'i');
  const box = () => document.querySelector('[data-testid="chat-input"]') || document.querySelector('[contenteditable="true"], textarea');
  const cmdOf = text => { const m = re.exec(String(text || '')); return m ? m[1].toLowerCase() : null; };
  function catchIt(e, tell){
    const b = box(), cmd = b && cmdOf(b.isContentEditable ? b.innerText : b.value);
    if (!cmd) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (tell) console.log('__kmv:kick-cmd ' + cmd);
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target && e.target === box()) catchIt(e, true);
  }, true);
  ['pointerdown', 'mousedown', 'click'].forEach(t => document.addEventListener(t, e => {
    if (e.target.closest && e.target.closest('#send-message-button')) catchIt(e, t === 'click');   // the press too, said once
  }, true));
  window.__kmvKickCmd = { cmdOf };
  return true;
}
const KICK_CMD_JS = `(${kickCmdAgent.toString()})(${JSON.stringify(Object.keys(KICK_PAGE_CMDS))})`;
// Says so in the chat window itself, over its chat box, with Cancel / Open channel page (muted, your login).
function kickPageCmd(w, cmd){
  if (!KICK_PAGE_CMDS[cmd] || platOf(w.channel) !== 'kick' || !w.el) return;
  const body = w.el.querySelector('.body');
  body.querySelector('.kcmd')?.remove();
  const card = document.createElement('div');
  card.className = 'kcmd'; card.setAttribute('role', 'alertdialog');
  card.innerHTML = '<button class="kcmd-x" title="Close" aria-label="Close">×</button><h3></h3><div class="kcmd-sub"></div>'
    + '<div class="kcmd-foot"><button class="kcmd-no">Cancel</button><button class="kcmd-yes" aria-label="Open channel page"><span class="l3">Open channel page</span><span class="l2">Open channel</span><span class="l1">Open</span></button></div>';
  card.querySelector('h3').textContent = `/${cmd} doesn’t work in this chat`;
  card.querySelector('.kcmd-sub').textContent = `Kick only lets you ${KICK_PAGE_CMDS[cmd]} on the channel page. Open ${w.channel}’s page (muted) to do it there?`;
  card.querySelector('.kcmd-no').onclick = card.querySelector('.kcmd-x').onclick = () => card.remove();
  card.querySelector('.kcmd-yes').onclick = () => {
    card.remove();
    const url = `https://kick.com/${encodeURIComponent(w.channel)}`;
    if (DESKTOP) window.kmv.openWindow(url, 1280, 800, { muted: true });
    else window.open(url, 'kmv_page_' + w.channel, 'width=1280,height=800');
  };
  body.append(card);   // (not focused: another Enter in the chat mustn't open the page)
}
window.chatAgentJs = MENTION_JS; window.newEmoteAgent = newEmoteAgent; window.mentionAgent = mentionAgent; window.emoteAgent = emoteAgent; window.translateAgent = translateAgent;   // for the tests
window.kickCmdAgent = kickCmdAgent; window.kickPageCmd = kickPageCmd; window.KICK_PAGE_CMDS = KICK_PAGE_CMDS;

export { KICK_CMD_JS, kickPageCmd };
