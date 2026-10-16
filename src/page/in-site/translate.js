import './new-emotes.js';   // runs after it (see app.js)
import { restore } from '../persistence.js';
import { ask } from '../shared/ask.js';

/* ---- Translating a chat (right-click a chat > Translate this chat): runs inside each chat page.
   Each message's own text is translated where it is, and a TRANSLATED · <language> badge goes on its end (click: the
   original, and back). Emotes, @mentions, links and names stay as they are: only the text around them is sent.
   The app does the asking (console message "__kmv:tr", answered with got()), and nothing is sent until you choose it. */
function translateAgent(){
  if (window.__kmvTr) return true;
  // each site's message text: Twitch, YouTube, Kick (the part after the name and its colon)
  const BODY = '[data-a-target="chat-line-message-body"], yt-live-chat-text-message-renderer #message, [data-index] div:has(> span[aria-hidden="true"]) + span';
  const SKIP = 'a, button, img, svg, [data-emote-name], [data-a-target="chat-message-mention"], .mention-fragment, [data-kmv-trb], kmv-emote-card';
  // kept as they are inside a message's text: @names and links (and a piece with no words isn't sent)
  const KEEP = /(@[A-Za-z0-9_]{2,30}|https?:\/\/\S+|www\.\S+)/;
  const CSS = '[data-kmv-trb]{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font:700 9.5px/1.7 system-ui,sans-serif;letter-spacing:.04em;'
    + 'color:#c9d1cc;background:rgba(135,146,140,.22);vertical-align:1px;cursor:pointer;white-space:nowrap;user-select:none}'
    + '[data-kmv-trb]::after{content:"TRANSLATED · " attr(data-from)} [data-kmv-trb][data-orig]::after{content:"ORIGINAL · " attr(data-from)}'
    + '[data-kmv-trb]:hover{background:rgba(135,146,140,.38)}';
  let on = false, auto = false, flushT = 0, scanT = 0, obs = null;
  const answers = new Map(), waiting = new Set(), failed = new Map(), queue = [], allowed = new Set(), shown = new Set();
  const orig = new WeakMap(), trans = new WeakMap();
  let send = (what, d) => console.log('__kmv:' + what + ' ' + JSON.stringify(d));
  const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
  const worth = t => (t.match(/\p{L}/gu) || []).length >= 2;
  // a text node's pieces: [{ t, ask }] where ask means "send it" (the rest stays)
  function runs(text){
    return text.split(KEEP).filter(x => x !== '').map(t => ({ t, ask: !KEEP.test(t) && worth(t) }));
  }
  const keyOf = t => t.trim();
  function textNodes(body){
    const out = [], walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()){
      const p = n.parentElement;
      if (!p || p.closest(SKIP) || !n.nodeValue.trim()) continue;
      out.push(n);
    }
    return out;
  }
  function css(){
    if (document.getElementById('kmv-tr-css')) return;
    const st = document.createElement('style'); st.id = 'kmv-tr-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function ask(t){
    const k = keyOf(t);
    if (!k || answers.has(k) || waiting.has(k) || (failed.get(k) || 0) > Date.now()) return;
    waiting.add(k); queue.push(k);
    clearTimeout(flushT); flushT = setTimeout(flush, 120);
  }
  function flush(){
    const texts = queue.splice(0, 25);
    if (texts.length) send('tr', { texts });
    if (queue.length) flushT = setTimeout(flush, 120);
  }
  // one message: translate its text nodes when every piece has an answer
  function apply(body){
    const nodes = textNodes(body);
    if (!nodes.length) return;
    let from = '';
    for (const n of nodes){
      const was = orig.has(n) && n.nodeValue === trans.get(n) ? orig.get(n) : n.nodeValue;
      if (orig.has(n) && n.nodeValue === trans.get(n)) continue;          // already done
      if (body.hasAttribute('data-kmv-show-orig') && orig.has(n) && n.nodeValue === orig.get(n)) continue;
      const rs = runs(was);
      const pending = rs.filter(r => r.ask && !answers.has(keyOf(r.t)));
      if (pending.length){
        const k = flat(was);
        if (auto || allowed.has(k)) pending.forEach(r => ask(r.t));   // with new messages off: only what was shown when it started
        continue;
      }
      const tr = rs.map(r => {
        const a = r.ask ? answers.get(keyOf(r.t)) : null;
        if (!a || a.same || !a.text) return r.t;
        if (!from) from = a.fromName || a.from || '';
        return r.t.match(/^\s*/)[0] + a.text + r.t.match(/\s*$/)[0];
      }).join('');
      if (tr === was) continue;
      if (window.__kmvMention && window.__kmvMention.look) try { window.__kmvMention.look(); } catch {}   // the original is read first (mentions)
      orig.set(n, was); trans.set(n, tr);
      n.nodeValue = tr;
    }
    if (from && !body.querySelector(':scope > [data-kmv-trb]')){
      const b = document.createElement('span');
      b.setAttribute('data-kmv-trb', ''); b.setAttribute('data-from', from.toUpperCase());
      b.title = 'Translated from ' + from + '. Click to see the original';
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); toggle(body, b); }, true);
      body.appendChild(b);
      shown.add(flat(body.innerText));
    }
  }
  function toggle(body, b){
    const showOrig = !b.hasAttribute('data-orig');
    for (const n of textNodes(body)) if (orig.has(n)) n.nodeValue = showOrig ? orig.get(n) : trans.get(n);
    if (showOrig){ b.setAttribute('data-orig', ''); body.setAttribute('data-kmv-show-orig', ''); b.title = 'The original. Click to see it translated'; }
    else { b.removeAttribute('data-orig'); body.removeAttribute('data-kmv-show-orig'); b.title = 'Translated. Click to see the original'; shown.add(flat(body.innerText)); }
  }
  function scan(){ if (on) document.querySelectorAll(BODY).forEach(apply); }
  function scanSoon(){ clearTimeout(scanT); scanT = setTimeout(scan, 200); }
  function restore(){
    document.querySelectorAll('[data-kmv-trb]').forEach(b => b.remove());
    document.querySelectorAll(BODY).forEach(body => {
      for (const n of textNodes(body)) if (orig.has(n)) n.nodeValue = orig.get(n);
      body.removeAttribute('data-kmv-show-orig');
    });
  }
  window.__kmvTr = {
    state(){ return { on, auto }; },
    // a: also new messages as they come
    start(a){
      css();
      if (!on){
        allowed.clear();
        document.querySelectorAll(BODY).forEach(b => textNodes(b).forEach(n => allowed.add(flat(n.nodeValue))));
      }
      on = true; auto = !!a;
      if (!obs){ obs = new MutationObserver(scanSoon); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); }
      scan();
    },
    setAuto(a){ if (!on) return this.start(a); auto = !!a; scan(); },
    stop(){ on = auto = false; if (obs){ obs.disconnect(); obs = null; } queue.length = 0; waiting.clear(); restore(); },
    // the app's answers: one for each text, in order ({ text, from, fromName } | { same: true } | null: couldn't)
    got(texts, list){
      if (!Array.isArray(texts) || !Array.isArray(list)) return;
      texts.forEach((t, i) => {
        waiting.delete(t);
        const a = list[i];
        if (a && (a.same || typeof a.text === 'string')){ answers.set(t, a.same ? { same: true } : { text: String(a.text), from: String(a.from || ''), fromName: String(a.fromName || a.from || '') }); }
        else failed.set(t, Date.now() + 30000);              // not now (offline or refused): later, quietly
      });
      if (answers.size > 4000) answers.delete(answers.keys().next().value);
      scan();
    },
    // a message line the chat now shows translated (the mention reader skips those: it saw the original)
    has(text){ return shown.has(flat(text)); },
    setSend(fn){ if (typeof fn === 'function') send = fn; }
  };
  return true;
}
const TRANSLATE_JS = `(${translateAgent.toString()})()`;

export { TRANSLATE_JS, translateAgent };
