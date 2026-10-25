import { wins } from '../core.js';
import { TRANSLATE_JS } from '../in-site/translate.js';
import { fromApp, fromSite } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { runIn, viewId } from '../windows/view.js';

/* Translating a chat (see translateAgent): the chat asks through console messages, the main process translates.
   "Translate new messages too" is remembered for each chat. */
const autoTr = new Set();
// Settings > Chat > Translate new messages in every chat (off unless switched on); the chats it's switched off in
let trAll = settings.flag('translateAll');
const noTr = new Set();
const saveAutoTr = () => { settings.set('autoTranslate', [...autoTr].slice(-200)) && settings.set('noTranslate', [...noTr].slice(-200)); };
// Does this chat translate new messages as they come?
const autoTrFor = ch => trAll ? !noTr.has(ch) : autoTr.has(ch);
function setTrAll(on){
  trAll = !!on;
  settings.set('translateAll', trAll);
  // straight away in every open chat: on where it now applies; off, back to each chat's own choice
  wins.forEach(w => {
    if (w.kind !== 'chat' || !w.view || !w.ready) return;
    const js = autoTrFor(w.channel) ? 'window.__kmvTr.start(true)' : 'window.__kmvTr.state().auto && window.__kmvTr.stop()';
    runIn(w.view, `${TRANSLATE_JS};${js}`);
  });
}
async function translateFor(frame, json){
  let d; try { d = JSON.parse(json); } catch { return; }
  const texts = d && Array.isArray(d.texts) ? d.texts.filter(t => typeof t === 'string').slice(0, 25) : [];
  if (!texts.length || !window.kmv || !window.kmv.translate) return;
  const got = await window.kmv.translate(texts).catch(() => null);
  const list = texts.map((_, i) => (Array.isArray(got) && got[i]) || null);
  runIn(frame, `window.__kmvTr && window.__kmvTr.got(${JSON.stringify(texts)}, ${JSON.stringify(list)})`);
}
function translateChat(w, a){
  if (!w || w.kind !== 'chat' || !w.view) return;
  const js = a.do === 'translateStop' ? 'window.__kmvTr.stop()' : a.do === 'translateAuto' ? `window.__kmvTr.setAuto(${!!a.on})` : 'window.__kmvTr.start(window.__kmvTr.state().auto)';
  if (a.do === 'translateStop' || a.do === 'translateAuto'){
    const on = a.do === 'translateAuto' && a.on;
    if (on){ autoTr.add(w.channel); noTr.delete(w.channel); }
    else { autoTr.delete(w.channel); if (trAll) noTr.add(w.channel); }   // with the setting on: off in this chat only
    saveAutoTr();
  }
  runIn(w.view, `${TRANSLATE_JS};${js}`);
}
const winOfView = id => wins.find(w => w.view && viewId(w.view) === id);

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  [].concat(settings.json('autoTranslate', [])).forEach(c => { if (typeof c === 'string') autoTr.add(c); });
  [].concat(settings.json('noTranslate', [])).forEach(c => { if (typeof c === 'string') noTr.add(c); });
  fromSite('tr', (w, json, view) => { if (w.view === view) translateFor(view, json); });
  fromApp('onViewTranslate', (id, a) => translateChat(winOfView(id), a));
}

export { autoTrFor, init, setTrAll, trAll, translateChat, winOfView };
