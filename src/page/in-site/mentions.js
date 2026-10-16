import '../shared/env.js';   // runs after it (see app.js)

// Runs inside each chat: spots new messages that @mention you or reply to you, and (with spam alerts
// on) hands the app every new message so it can check them, then tags the ones it flags.
// It reads the chat's visible text, so it keeps working if Kick or Twitch change their page code.
function mentionAgent(){
  if (window.__kmvMention) return true;
  const seen = new Set(), marks = new Map(), known = new Set(), said = new Map();
  let me = '', words = [], wordRe = null, watch = false, armed = false, queue = [], lines = [], armT = 0, seenAt = 0;
  // Clicks and typing in the chat: the window may already have focus, so the app sees no new focus to mark it seen.
  // Every kind of click counts, on the window before the page's own handlers: Kick's mod shortcuts on a
  // name (Shift, Cmd/Ctrl, Cmd/Ctrl + Shift + Click: delete, timeout, ban) may stop some of them.
  // What's on screen is read first, so messages you could see are timed before the click.
  const looked = () => { if (Date.now() - seenAt > 300) scan(); seenAt = Date.now(); };
  ['pointerdown', 'mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu', 'keydown'].forEach(t => window.addEventListener(t, looked, true));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const LINE_RE = /^(?:\d{1,2}:\d{2}(?:\s?[AP]M)?\s+)?([A-Za-z0-9_]{2,30})\s?:\s*([\s\S]*)$/i;
  const NAME_RE = /^(?:\d{1,2}:\d{2}(?:\s?[AP]M)?\s+)?[A-Za-z0-9_]{2,30}$/i;
  // A message a moderator removed: the chat shows a notice in its place, or the old text with a note added.
  const MOD_RE = /^[(<[]?\s*(?:message\s+)?(?:deleted|removed)\b|\b(?:deleted|removed)\s+by\s+(?:a\s+)?mod/i;
  function modChange(sender, body){
    const k = sender.toLowerCase(), before = said.get(k) || [];
    const mod = MOD_RE.test(body) || before.some(b => b !== body && b.length >= 12 && (body.includes(b) || (body.length >= 12 && b.includes(body))));
    if (!mod){ before.push(body); if (before.length > 20) before.shift(); said.set(k, before); }
    if (said.size > 2000) said.delete(said.keys().next().value);
    return mod;
  }
  // "name: message", but not a clock with no name after it ("09:23 PMhello" would read as "09" saying "23 PMhello")
  const lineOf = l => { const m = l.match(LINE_RE); return m && !(/^\d+$/.test(m[1]) && /^\d{1,2}:\d{2}/.test(l)) ? m : null; };
  // What you sent in this chat lately: never an alert, even when the chat shows it without your name.
  let sent = [];
  const box = () => { const a = document.activeElement; return a && (a.isContentEditable || /^(TEXTAREA|INPUT)$/.test(a.tagName)) ? a
    : document.querySelector('[contenteditable="true"], textarea'); };
  const noteSent = () => {
    const b = box(), t = b ? flat(b.isContentEditable ? b.innerText : b.value) : '';
    if (t.length < 2) return;
    sent = sent.filter(x => Date.now() - x.t < 120000 && x.text !== t).slice(-9); sent.push({ text: t, t: Date.now() });
  };
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) noteSent(); }, true);
  document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button')) noteSent(); }, true);
  // (each one only once: someone else writing the same thing later is still theirs)
  const mine = l => { const f = flat(l), i = sent.findIndex(x => Date.now() - x.t < 120000 && f.endsWith(x.text)); if (i >= 0) sent.splice(i, 1); return i >= 0; };
  // The text's lines, with each message on one line: Kick shows the name on a line of its own, then ":" and
  // the message, either together (": message") or on lines of their own (":" then "message"), so those are joined
  // (with a space, as flat() below would). Not when the message is only emotes (no text): the next line is then
  // the next name (followed by its ":"), or a reply's "Replying to …".
  function textLines(text){
    const raw = String(text || '').split('\n').map(s => s.trim()).filter(Boolean), out = [];
    for (let i = 0; i < raw.length; i++){
      const l = raw[i], n = out.length - 1, prev = n >= 0 ? out[n] : '';
      if (n >= 0 && l[0] === ':' && NAME_RE.test(prev)) out[n] += ' ' + l;
      else if (n >= 0 && /\s:$/.test(prev) && NAME_RE.test(prev.slice(0, -2)) && !/^Replying to\s/i.test(l)
        && !(NAME_RE.test(l) && (raw[i + 1] || '')[0] === ':')) out[n] += ' ' + l;
      else out.push(l);
    }
    return out;
  }
  function scan(){
    if ((!me && !wordRe && !watch) || !document.body) return;
    const all = textLines(document.body.innerText);
    const replyRe = me && new RegExp('^Replying to\\s+@?' + esc(me) + '(?![A-Za-z0-9_])', 'i');
    const atRe = me && new RegExp('(^|[^A-Za-z0-9_])@' + esc(me) + '(?![A-Za-z0-9_])', 'i');
    let reply = '';
    for (const l of all){
      if (/^Replying to\s/i.test(l)){ reply = l; continue; }
      const m = lineOf(l);
      const r = reply; reply = '';
      if (!m) continue;
      if (window.__kmvTr && window.__kmvTr.has(m[2])){ seen.add(l); continue; }   // shown translated: its original was read already
      // A message line is only ever judged once, even if its "Replying to" line later scrolls away or re-draws.
      const lineNew = !seen.has(l), key = r ? r + '\u0001' + l : '';
      const replyNew = key && !seen.has(key);
      if (!lineNew && !replyNew) continue;
      seen.add(l); if (key) seen.add(key);
      const mod = watch && lineNew && modChange(m[1], m[2]);
      if (!armed){ if (watch && known.size < 2000) known.add(m[1].toLowerCase()); continue; }   // people already chatting before we started
      const sender = m[1], body = m[2];
      if ((me && sender.toLowerCase() === me) || mine(l)) continue;      // your own messages
      if (watch && lineNew && lines.length < 300) lines.push({ sender, body, line: l, t: Date.now(), mod });
      if (!me && !wordRe) continue;
      const toMe = !!me && replyNew && replyRe.test(r), at = !!me && lineNew && atRe.test(body);
      const word = !toMe && !at && lineNew && wordRe ? body.match(wordRe) : null;
      if (queue.length >= 100) continue;                    // the app takes them every few seconds; more means it isn't asking
      if (!toMe && !at && !word) continue;
      const nameRe = new RegExp('(^|[^A-Za-z0-9_])' + esc(sender) + '\\s?:\\s*', 'i');
      let parts = null, qparts = null;
      try { parts = partsFor(l, nameRe, body); } catch {}
      const quoted = toMe ? r.replace(/^Replying to\s+@?[A-Za-z0-9_]+:?\s*/i, '') : '';
      if (toMe && quoted) try { qparts = partsFor(r, /^\s*Replying to\s+@?[A-Za-z0-9_]+:?\s*/i, quoted); } catch {}
      const item = toMe || at ? { sender, body, kind: toMe ? 'reply' : 'mention', quoted, t: Date.now() }
        : { sender, body, kind: 'word', word: word[2], quoted: '', t: Date.now() };
      if (parts) item.parts = parts;
      if (qparts) item.qparts = qparts;
      queue.push(item);
    }
    if (seen.size > 6000){ const keep = [...seen].slice(-3000); seen.clear(); keep.forEach(k => seen.add(k)); }
    marks.forEach(tag);                                      // the chat re-draws messages as it scrolls
  }
  function arm(){
    seen.clear(); said.clear(); armed = false; queue = []; lines = [];
    clearTimeout(armT); scan();                              // everything already in the chat counts as old
    armT = setTimeout(() => { scan(); armed = true; }, 2500);
  }
  // The element showing a message: the biggest one around its text that's still just that message.
  const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
  function rowFor(line){
    const m = lineOf(line); if (!m) return null;
    return elFor(line, m[2]);
  }
  // A message's text and emotes in order, after "name:" (or "Replying to @name:"): [{ t: text } | { e: name, src }].
  // null when it can't be told apart exactly (then the plain text is used, as before).
  const EMOTE_HOST = /^(files\.kick\.com|static-cdn\.jtvnw\.net|(\w+\.)?7tv\.app|cdn\.betterttv\.net|cdn\.frankerfacez\.com)$/;
  function emoteIn(img){
    let u; try { u = new URL(img.currentSrc || img.src); } catch { return null; }
    const name = String(img.getAttribute('data-emote-name') || img.alt || img.title || '').replace(/^:|:$/g, '').trim();
    const r = img.getBoundingClientRect();
    if (u.protocol !== 'https:' || !EMOTE_HOST.test(u.hostname) || !name || name.length > 60 || r.width > 96 || r.height > 96) return null;
    if (u.hostname === 'files.kick.com' && !/^\/emotes\//.test(u.pathname)) return null;
    return { e: name, src: u.href.slice(0, 300) };
  }
  function partsFor(line, prefix, text){
    const el = elFor(line, text, true); if (!el) return null;
    const all = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()){
      if (n.nodeType === 3){
        const p = n.parentElement;
        if (p && p.checkVisibility && !p.checkVisibility()) continue;
        if (n.nodeValue) all.push({ t: n.nodeValue.replace(/\s+/g, ' ') });
      } else if (n.tagName === 'IMG'){ const e = emoteIn(n); if (e) all.push(e); }
    }
    // cut off what comes before the message: the time, badges, the name and its colon
    const full = all.map(x => x.t || '').join(''), cut = full.match(prefix);
    if (!cut) return null;
    let skip = cut.index + cut[0].length;
    const out = [];
    for (const x of all){
      if (skip > 0){ if (x.t){ if (x.t.length <= skip){ skip -= x.t.length; continue; } out.push({ t: x.t.slice(skip) }); skip = 0; } continue; }
      const last = out[out.length - 1];
      if (x.t && last && last.t != null) last.t += x.t; else out.push(x);
    }
    if (out.length && out[0].t != null) out[0].t = out[0].t.replace(/^\s+/, '');
    const lastT = out[out.length - 1]; if (lastT && lastT.t != null) lastT.t = lastT.t.replace(/\s+$/, '');
    const parts = out.filter(x => x.e || x.t);
    if (!parts.some(x => x.e) || parts.filter(x => x.e).length > 20) return null;
    if (flat(parts.map(x => x.t || ' ').join('')) !== flat(text)) return null;   // not the same message after all
    return parts;
  }
  // smallest: the innermost element holding the whole line (for reading it), else the biggest (for marking it)
  function elFor(line, text, smallest){
    // (the first word: an emote can split the text right after it; the whole line is checked below)
    const probe = flat(text).split(' ')[0], want = flat(line);
    if (!probe) return null;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()){
      if (!n.nodeValue.includes(probe)) continue;
      let best = null;
      for (let el = n.parentElement; el && el !== document.body; el = el.parentElement){
        const t = flat(el.innerText);
        const more = textLines(el.innerText).filter(x => !/^Replying to\s/i.test(x)).length > 1;
        if (more || t.length > want.length + 60) break;   // that's more than this one message
        if (t.includes(want)){ best = el; if (smallest) break; }
      }
      if (best) return best;
    }
    return null;
  }
  function tag(m, line){
    if (m.row && m.row.isConnected && m.row.querySelector(':scope > [data-kmv-spam]')) return;   // still there
    const row = m.row = rowFor(line);
    if (!row || row.querySelector(':scope > [data-kmv-spam]')) return;
    if (!document.getElementById('kmv-spam-css')){
      const st = document.createElement('style'); st.id = 'kmv-spam-css';
      // The tag's words come from CSS, so they never become part of the message's text.
      st.textContent = '[data-kmv-spam]::after{content:"LIKELY SPAM";display:inline-block;margin-left:6px;padding:0 4px;border-radius:3px;font:700 9.5px/1.6 system-ui,sans-serif;letter-spacing:.03em;color:#fff;background:var(--kmv-spam);vertical-align:1px;cursor:help}';
      document.head.appendChild(st);
    }
    row.style.setProperty('--kmv-spam', m.color);
    row.style.boxShadow = `inset 3px 0 0 ${m.color}`;
    row.style.background = m.color + '24';
    const t = document.createElement('span');
    t.setAttribute('data-kmv-spam', ''); t.title = m.why;
    row.appendChild(t);
  }
  window.__kmvMention = {
    // u: your username in this chat; w: other words or phrases that count as mentioning you (whole words, any case)
    setMe(u, w){
      const n = String(u || '').trim().replace(/^@/, '').toLowerCase();
      const list = [...new Set((Array.isArray(w) ? w : []).map(x => String(x || '').trim().replace(/^@/, '').toLowerCase()).filter(x => x.length >= 2))];
      if (n === me && list.join('\n') === words.join('\n')) return;
      me = n; words = list;
      // a word on its own: not next to other letters, digits or _ (so "pear" isn't found in "pears" or "appearance")
      wordRe = words.length ? new RegExp('(^|[^\\p{L}\\p{N}_])(' + [...words].sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![\\p{L}\\p{N}_])', 'iu') : null;
      arm();
    },
    setWatch(on){
      on = !!on; if (on === watch) return;
      watch = on; lines = [];
      if (on && !armed) arm();
      else if (on && document.body) textLines(document.body.innerText).forEach(l => { const m = lineOf(l); if (m && known.size < 2000) known.add(m[1].toLowerCase()); });
    },
    mark(line, why, color){
      if (marks.has(line)) return;
      marks.set(line, { why, color }); tag(marks.get(line), line);
      if (marks.size > 200) marks.delete(marks.keys().next().value);
    },
    look(){ scan(); },
    take(){ scan(); const q = { m: queue, l: lines, k: [...known], c: seenAt }; queue = []; lines = []; known.clear(); seenAt = 0; return q; }
  };
  return true;
}
const MENTION_JS = `(${mentionAgent.toString()})()`;

export { MENTION_JS, mentionAgent };
