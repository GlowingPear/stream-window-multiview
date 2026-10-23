import { openChannelPage, openPollForm } from '../chat/kick-poll.js';
import { emoteAgent } from './emote-preview.js';
import { MENTION_JS, mentionAgent } from './mentions.js';
import { newEmoteAgent } from './new-emotes.js';
import { translateAgent } from './translate.js';
import { platOf } from '../platforms/platforms.js';
import { fromSite } from '../shared/incoming.js';

// Kick chat commands that only work on the channel page: the popout chat (what the app shows) knows them
// but has nowhere to show their popup, so they do nothing there. /poll gets a copy of Kick's form in the chat window
// (chat/kick-poll.js); for the others the app offers to open the channel page.
const KICK_PAGE_CMDS = { clip: 'make a clip', poll: 'start a poll', prediction: 'start a prediction' };
// Runs inside each Kick chat page: a message that is one of these commands isn't sent (Enter or the send
// button); the app is told through a console message instead, with what followed the command.
function kickCmdAgent(names){
  if (window.__kmvKickCmd) return true;
  const re = new RegExp('^\\s*/(' + names.join('|') + ')(?:\\s|$)', 'i');
  const box = () => document.querySelector('[data-testid="chat-input"]') || document.querySelector('[contenteditable="true"], textarea');
  const cmdOf = text => { const m = re.exec(String(text || '')); return m ? m[1].toLowerCase() : null; };
  const restOf = text => { const m = re.exec(String(text || '')); return m ? String(text).slice(m[0].length).trim() : ''; };
  function catchIt(e, tell){
    const b = box(), text = b && (b.isContentEditable ? b.innerText : b.value), cmd = cmdOf(text);
    if (!cmd) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (tell) console.log('__kmv:kick-cmd ' + JSON.stringify({ cmd, text: restOf(text).slice(0, 500) }));
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target && e.target === box()) catchIt(e, true);
  }, true);
  ['pointerdown', 'mousedown', 'click'].forEach(t => document.addEventListener(t, e => {
    if (e.target.closest && e.target.closest('#send-message-button')) catchIt(e, t === 'click');   // the press too, said once
  }, true));
  window.__kmvKickCmd = { cmdOf, restOf };
  return true;
}
let KICK_CMD_JS;
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
  card.querySelector('.kcmd-yes').onclick = () => { card.remove(); openChannelPage(w.channel); };
  body.append(card);   // (not focused: another Enter in the chat mustn't open the page)
}

// A command the chat page stopped: /poll opens the poll form; the others say so in the chat window itself, over its chat
// box, with Cancel / Open channel page (muted, your login).
function kickCmdHeard(w, data, view){
  if (w.view !== view) return;
  let m; try { m = JSON.parse(data); } catch { return; }
  if (!m || typeof m.cmd !== 'string') return;
  if (m.cmd === 'poll' && platOf(w.channel) === 'kick') openPollForm(w, typeof m.text === 'string' ? m.text : '');
  else kickPageCmd(w, m.cmd);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  KICK_CMD_JS = `(${kickCmdAgent.toString()})(${JSON.stringify(Object.keys(KICK_PAGE_CMDS))})`;
  fromSite('kick-cmd', kickCmdHeard);   // see kickCmdAgent
  window.chatAgentJs = MENTION_JS; window.newEmoteAgent = newEmoteAgent; window.mentionAgent = mentionAgent; window.emoteAgent = emoteAgent; window.translateAgent = translateAgent;   // for the tests
  window.kickCmdAgent = kickCmdAgent; window.kickPageCmd = kickPageCmd; window.kickCmdHeard = kickCmdHeard; window.KICK_PAGE_CMDS = KICK_PAGE_CMDS;
}

export { init, KICK_CMD_JS };
