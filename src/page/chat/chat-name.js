import { CHAT_NAME_IDEAS, chatNameText } from './chat-name-text.js';
import { $, wins } from '../core.js';
import { chatNameAgent } from '../in-site/chat-name.js';
import { chLabel, platform } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { soon } from '../shared/timers.js';
import { runIn } from '../windows/view.js';

/* ---- Channel name in chat boxes (Settings > Chat, off unless switched on): each chat box says which channel
   it sends to instead of the site's "Send a message", with your own text around the name if you like
   (chat-name-text.js). The script inside each chat (in-site/chat-name.js) keeps it there. */
const SAMPLE_NAME = 'Pixel_Bandit';      // the sample chat box's made-up channel
let nameOn = false, nameTpl = '';
let pushSoon = null;

// What a chat window's box should say, or '' for the site's own text
const boxText = w => (nameOn ? chatNameText(nameTpl, chLabel(w.channel)) : '');
// Puts it in one chat (when its page is ready, or the setting or the channel's name changed)
function syncChatName(w){
  const cfg = w && w.kind === 'chat' && w.view && platform(w.channel).chatBox;
  if (!cfg || !w.ready) return;
  const t = boxText(w);
  if (t) runIn(w.view, `(${chatNameAgent.toString()})(${JSON.stringify(cfg)});window.__kmvName.set(${JSON.stringify(t)})`);
  else runIn(w.view, 'window.__kmvName && window.__kmvName.set("")');
}
const syncAll = () => wins.forEach(syncChatName);

// The settings row: the text field shows only while it's on, the sample shows what a box will say
function showSetting(){
  $('#chatNameSet').checked = nameOn;
  $('#chatNameRow').hidden = !nameOn;
  const f = $('#chatNameText');
  if (document.activeElement !== f) f.value = nameTpl;
  $('#chatNameSample').textContent = chatNameText(f.value, SAMPLE_NAME);
  $('#chatNameIdeas').querySelectorAll('button').forEach(b => b.classList.toggle('on', (f.value.trim() || '{channel}') === b.dataset.t));
}
function readSettings(){ nameOn = settings.flag('chatName', false); nameTpl = settings.text('chatNameText') || ''; }

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  readSettings();
  pushSoon = soon(syncAll, 250);
  $('#chatNameIdeas').replaceChildren(...CHAT_NAME_IDEAS.map(t => element('button', { type: 'button', 'data-t': t, title: `Use “${t}”`, onclick: () => {
    $('#chatNameText').value = t === '{channel}' ? '' : t;
    $('#chatNameText').dispatchEvent(new Event('input'));
  } }, t)));
  $('#chatNameSet').addEventListener('change', e => {
    nameOn = e.target.checked;
    settings.set('chatName', nameOn);
    showSetting(); syncAll();
  });
  $('#chatNameText').addEventListener('input', e => {
    nameTpl = e.target.value.trim() === '{channel}' ? '' : e.target.value;
    if (nameTpl.trim()) settings.set('chatNameText', nameTpl); else settings.remove('chatNameText');
    showSetting(); pushSoon();                                   // the sample at once, the chats a moment later
  });
  // changed in the other window
  settings.onChange(['chatName', 'chatNameText'], () => { readSettings(); showSetting(); syncAll(); });
  // a channel's name learned from the site (PixelBandit for pixelbandit): its box says it the new way
  store.watch('names', () => { if (nameOn) pushSoon(); });
  showSetting();
  window.chatNameAgent = chatNameAgent;   // for the tests
}

export { init, syncChatName };
