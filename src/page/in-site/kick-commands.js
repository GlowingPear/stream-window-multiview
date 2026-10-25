import { makeClip } from '../chat/kick-clip.js';
import { openPollForm } from '../chat/kick-poll.js';
import { openPredictionForm } from '../chat/kick-prediction.js';
import { messageAgent } from './chat-message.js';
import { emoteAgent } from './emote-preview.js';
import { MENTION_JS, mentionAgent } from './mentions.js';
import { newEmoteAgent } from './new-emotes.js';
import { translateAgent } from './translate.js';
import { platOf } from '../platforms/platforms.js';
import { fromSite } from '../shared/incoming.js';

// Kick chat commands that only work on the channel page: the popout chat (what the app shows) knows them but has nowhere to
// show their popup, so they do nothing there. The chat window gets a copy of what Kick shows instead: /poll its poll form
// (chat/kick-poll.js), /prediction its prediction window (chat/kick-prediction.js), /clip its clip and Share Clip
// (chat/kick-clip.js).
const KICK_PAGE_CMDS = ['clip', 'poll', 'prediction'];
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

// A command the chat page stopped: the chat window shows Kick's copy of it, given what followed the command
function kickCmdHeard(w, data, view){
  if (w.view !== view) return;
  let m; try { m = JSON.parse(data); } catch { return; }
  if (!m || !KICK_PAGE_CMDS.includes(m.cmd) || platOf(w.channel) !== 'kick') return;
  const text = typeof m.text === 'string' ? m.text : '';
  if (m.cmd === 'poll') openPollForm(w, text);
  else if (m.cmd === 'prediction') openPredictionForm(w, text);
  else makeClip(w, text);
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  KICK_CMD_JS = `(${kickCmdAgent.toString()})(${JSON.stringify(KICK_PAGE_CMDS)})`;
  fromSite('kick-cmd', kickCmdHeard);   // see kickCmdAgent
  window.chatAgentJs = MENTION_JS; window.newEmoteAgent = newEmoteAgent; window.mentionAgent = mentionAgent; window.emoteAgent = emoteAgent; window.translateAgent = translateAgent; window.messageAgent = messageAgent;   // for the tests
  window.kickCmdAgent = kickCmdAgent; window.kickCmdHeard = kickCmdHeard; window.KICK_PAGE_CMDS = KICK_PAGE_CMDS;
}

export { init, KICK_CMD_JS };
