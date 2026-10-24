// Runs inside each chat: spots new messages that @mention you or reply to you, and (with spam alerts
// on) hands the app every new message so it can check them, then tags the ones it flags.
// It reads the chat's visible text, so it keeps working if Kick or Twitch change their page code.
function mentionAgent(){
  if (window.__kmvMention) return true;
  const seen = new Set(), marks = new Map(), known = new Set(), said = new Map(), rowSaid = new WeakMap();
  let me = '', words = [], wordRe = null, watch = false, armed = false, queue = [], lines = [], armT = 0, seenAt = 0;
  let fresh = 0, counting = false;                           // new messages from others since the app last asked (count())
  let sup = null, supQueue = [], supMe = '';                          // support (Settings > Mentions > Support): the site's wording, and what was found
  const supSeen = new Set(), giftsBy = new Map();
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
  // Or a note after it once its sender is banned or timed out ("ur a whore (Banned)"): only with the same message before it.
  const NOTE_RE = /\s*\((?:banned|timed\s*out|deleted|removed)\)\s*$/i;
  function modChange(sender, body){
    const k = sender.toLowerCase(), before = said.get(k) || [];
    const noted = NOTE_RE.test(body) && before.includes(body.replace(NOTE_RE, ''));
    const mod = noted || MOD_RE.test(body) || before.some(b => b !== body && b.length >= 12 && (body.includes(b) || (body.length >= 12 && b.includes(body))));
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
  // A Kick message's actions (Reply, Pin), which only show while the pointer is over it. Kick's own are icons, but
  // an extension can add one with text ("SO"): never part of the message.
  const BAR = '[class*="group-hover:flex"]';
  // A row's text without its actions: they're hidden for a moment while it's read (nothing is drawn in between).
  function rowText(row){
    const bars = [...row.querySelectorAll(BAR)].filter(b => b.querySelector('button') && (!b.checkVisibility || b.checkVisibility()));
    if (!bars.length) return row.innerText;
    const was = bars.map(b => b.getAttribute('style'));
    bars.forEach(b => b.style.setProperty('display', 'none', 'important'));
    try { return row.innerText; }
    finally { bars.forEach((b, i) => was[i] == null ? b.removeAttribute('style') : b.setAttribute('style', was[i])); }
  }
  // A Kick row, read by its parts rather than its text: the name (the last button before the ":" box), the message
  // (the box after the name's), and a reply's quote (in the "Replying to" button above them), each with its emotes.
  // { name, text, parts, reply: { name, text, parts } }, or null for a row that isn't built like that.
  const KICK_NAME = /^[A-Za-z0-9_]{2,30}$/;
  function readRow(row){
    const colon = [...row.querySelectorAll('span[aria-hidden="true"]')].find(s => /^:\s*$/.test(s.textContent) && !s.closest('button'));
    const by = colon && colon.previousElementSibling, msg = colon && colon.parentElement.nextElementSibling;
    const names = by ? by.querySelectorAll('button') : [], name = names.length ? names[names.length - 1].textContent.trim() : '';
    if (!msg || !KICK_NAME.test(name)) return null;
    const out = { name, ...piecesOf(msg) };
    const rb = [...row.querySelectorAll('button')].find(b => /^\s*Replying to\s/i.test(b.textContent));
    const q = rb && rb.querySelector('span') ? [...rb.querySelector('span').children] : [];
    if (q.length >= 2 && KICK_NAME.test(q[0].textContent.trim())) out.reply = { name: q[0].textContent.trim(), ...piecesOf(q[q.length - 1]) };
    return out;
  }
  // An element's text and emotes, in order: { text (without the emotes), parts (null when it has no emotes) }.
  function piecesOf(el){
    const parts = tidy(pieces(el));
    return { text: flat(parts.map(x => x.t || ' ').join('')), parts: parts.some(x => x.e) && parts.filter(x => x.e).length <= 20 ? parts : null };
  }
  // The chat's lines: [{ l: line, row, parts }]. Kick puts each message in a row of its own (div[data-index]), so
  // each row is read on its own, by its parts (its line reads as Kick's text does: "name : message"). Other chats,
  // and a row that isn't built as Kick's: the text, a row at a time or the whole page's, with no parts.
  function chatLines(){
    const rows = [...document.querySelectorAll('[data-index]')].filter(r => !r.parentElement || !r.parentElement.closest('[data-index]'));
    const out = [];
    for (const row of rows){
      const k = readRow(row);
      if (!k){ for (const l of textLines(rowText(row))) out.push({ l, row }); continue; }
      if (k.reply) out.push({ l: `Replying to ${k.reply.name}: ${k.reply.text}`, row, parts: k.reply.parts });
      out.push({ l: `${k.name} : ${k.text}`.trim(), row, parts: k.parts });
    }
    return out.some(x => lineOf(x.l)) ? out : textLines(document.body.innerText).map(l => ({ l }));
  }
  function scan(){
    if ((!me && !wordRe && !watch && !counting && !sup) || !document.body) return;
    if (sup) supScan();
    const all = chatLines();
    const replyRe = me && new RegExp('^Replying to\\s+@?' + esc(me) + '(?![A-Za-z0-9_])', 'i');
    const atRe = me && new RegExp('(^|[^A-Za-z0-9_])@' + esc(me) + '(?![A-Za-z0-9_])', 'i');
    let reply = '', replyParts;
    for (const { l, row, parts: read } of all){
      if (/^Replying to\s/i.test(l)){ reply = l; replyParts = read; continue; }
      const m = lineOf(l);
      const r = reply, rparts = replyParts; reply = ''; replyParts = undefined;
      if (!m) continue;
      const nameRe = () => new RegExp('(^|[^A-Za-z0-9_])' + esc(m[1]) + '\\s?:\\s*', 'i');
      // In a row, its emotes are read from the row (a message that's only emotes has no text to find it by),
      // and they're part of the message: two messages with the same text but other emotes aren't the same line.
      let rowParts = read === undefined ? null : read;
      if (read === undefined && row && row.querySelector('img')) try { rowParts = partsFor(l, nameRe(), m[2], row); } catch {}
      const id = rowParts ? l + '\u0002' + rowParts.filter(x => x.e).map(x => x.e).join(' ') : l;
      if (window.__kmvTr && window.__kmvTr.has(m[2])){ seen.add(id); continue; }   // shown translated: its original was read already
      // A message line is only ever judged once, even if its "Replying to" line later scrolls away or re-draws.
      const lineNew = !seen.has(id), key = r ? r + '\u0001' + id : '';
      const replyNew = key && !seen.has(key);
      if (!lineNew && !replyNew) continue;
      // A row already read, now with more text after its message, or its emotes no longer read (an extension added
      // something): the same message. Kick re-uses rows for other messages, so its data-index has to match too.
      const was = row && rowSaid.get(row), idx = row && row.getAttribute('data-index');
      if (lineNew && was && was.i === idx && was.s === m[1].toLowerCase() && flat(m[2]).startsWith(was.b)){ seen.add(id); if (key) seen.add(key); continue; }
      seen.add(id); if (key) seen.add(key);
      if (row && lineNew) rowSaid.set(row, { i: idx, s: m[1].toLowerCase(), b: flat(m[2]) });
      const mod = watch && lineNew && modChange(m[1], m[2]);
      if (!armed){ if (watch && known.size < 2000) known.add(m[1].toLowerCase()); continue; }   // people already chatting before we started
      const sender = m[1], body = m[2];
      if ((me && sender.toLowerCase() === me) || mine(l)) continue;      // your own messages
      if (lineNew) fresh++;
      if (watch && lineNew && lines.length < 300) lines.push({ sender, body, line: l, t: Date.now(), mod });
      if (!me && !wordRe) continue;
      const toMe = !!me && replyNew && replyRe.test(r), at = !!me && lineNew && atRe.test(body);
      const word = !toMe && !at && lineNew && wordRe ? body.match(wordRe) : null;
      if (queue.length >= 100) continue;                    // the app takes them every few seconds; more means it isn't asking
      if (!toMe && !at && !word) continue;
      let parts = rowParts, qparts = null;
      if (!row) try { parts = partsFor(l, nameRe(), body); } catch {}
      const quoted = toMe ? r.replace(/^Replying to\s+@?[A-Za-z0-9_]+:?\s*/i, '') : '';
      if (toMe && quoted && rparts !== undefined) qparts = rparts;
      else if (toMe && quoted) try { qparts = partsFor(r, /^\s*Replying to\s+@?[A-Za-z0-9_]+:?\s*/i, quoted); } catch {}
      const item = toMe || at ? { sender, body, kind: toMe ? 'reply' : 'mention', quoted, t: Date.now() }
        : { sender, body, kind: 'word', word: word[2], quoted: '', t: Date.now() };
      if (parts) item.parts = parts;
      if (qparts) item.qparts = qparts;
      queue.push(item);
    }
    if (seen.size > 6000){ const keep = [...seen].slice(-3000); seen.clear(); keep.forEach(k => seen.add(k)); }
    marks.forEach(tag);                                      // the chat re-draws messages as it scrolls
  }
  /* Support: someone sent KICKs or bits, gifted subs, subscribed, or sent a Super Chat. The site shows it in a row of
     its own (not "name: message"), read by its text with the site's wording (sup.finds, from its site module):
     { kind, re } for such a row's text, { kind, row, who, n } for an element the site draws for it (its name and
     amount inside), { kind, re, msg: true } for words in a normal message (Twitch's cheer100), { kind, re, page: true }
     for a banner over the chat, outside its rows (Kick's raids). Each one once; what
     was there before it started is old. A community gift is followed by a row for each sub it gave: those are
     part of it. */
  // a number as the site writes it: "1,000", "$5.00", "€10,50"
  const num = t => { const c = String(t || '').replace(/[^\d.,]/g, ''); return +(/,\d{2}$/.test(c) ? c.replace(/\./g, '').replace(',', '.') : c.replace(/,/g, '')) || 0; };
  function supFound(f, key, who, n, extra){
    if (supSeen.has(key)) return;
    supSeen.add(key);
    if (!armed || !who) return;
    who = flat(who);
    if (supMe && who.toLowerCase() === supMe) return;        // your own
    const k = who.toLowerCase();
    if (f.kind === 'gifts') giftsBy.set(k, Date.now());
    if (f.kind === 'gift' && Date.now() - (giftsBy.get(k) || 0) < 60000) return;   // one of a community gift's
    if (supQueue.length < 50) supQueue.push({ kind: f.kind, who, n, unit: f.unit || '', t: Date.now(), ...extra });
  }
  function supScan(){
    const finds = sup.finds || [];
    const rows = [...document.querySelectorAll('[data-index]')].filter(r => !r.parentElement || !r.parentElement.closest('[data-index]'));
    // the site's own rows: a Kick row that isn't someone's message, or a line of the page's text that isn't
    const texts = rows.length ? rows.filter(r => !readRow(r)).map(r => ({ t: flat(rowText(r)), k: r.getAttribute('data-index') }))
      : textLines(document.body.innerText).filter(l => !lineOf(l)).map(l => ({ t: flat(l), k: '' }));
    for (const f of finds) {
      if (f.row) {
        document.querySelectorAll(f.row).forEach(el => {
          const t = flat(el.innerText), m = f.re ? t.match(new RegExp(f.re, 'i')) : null;
          if (f.re && !m) return;
          const w = f.who && el.querySelector(f.who), a = f.n && el.querySelector(f.n);
          const amt = a ? flat(a.innerText) : m && m.groups && m.groups.n || '';
          supFound(f, 'r' + t, w ? w.innerText : m && m.groups && m.groups.who, num(amt) || 1, amt && /\D/.test(amt) ? { amt } : {});   // money keeps its currency
        });
      } else if (f.msg) {
        const re = new RegExp(f.re, 'gi');
        for (const { l } of chatLines()) {
          const m = lineOf(l); if (!m) continue;
          const n = [...m[2].matchAll(re)].reduce((s, x) => s + num(x.groups && x.groups.n), 0);
          if (n) supFound(f, 'm' + l, m[1], n);
        }
      }
    }
    // a banner the site shows over its chat (Kick's raids): a line of the page's text that isn't in a row or a message
    const onPage = finds.filter(f => f.page).map(f => [f, new RegExp(f.re, 'i')]);
    if (onPage.length) {
      for (const l of textLines(document.body.innerText)) {
        if (lineOf(l)) continue;
        const t = flat(l);
        for (const [f, re] of onPage) {
          const m = t.match(re); if (!m) continue;
          const g = m.groups || {};
          supFound(f, 'p' + t, g.who, g.n ? num(g.n) : 1, {});
          break;
        }
      }
    }
    // the site's own rows, in the chat's order: each by the first wording it matches
    const byText = finds.filter(f => !f.row && !f.msg && !f.page).map(f => [f, new RegExp(f.re, 'i')]);
    for (const x of texts) {
      for (const [f, re] of byText) {
        const m = x.t.match(re); if (!m) continue;
        const g = m.groups || {};
        supFound(f, 't' + x.k + x.t, g.who, g.n ? num(g.n) : 1, g.to ? { to: g.to } : {});
        break;
      }
    }
    if (supSeen.size > 3000){ const keep = [...supSeen].slice(-1500); supSeen.clear(); keep.forEach(k => supSeen.add(k)); }
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
  // An element's shown text and emotes, in order, as they are: [{ t: text } | { e: name, src }]
  function pieces(el){
    const all = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()){
      if (n.nodeType === 3){
        const p = n.parentElement;
        if (p && ((p.checkVisibility && !p.checkVisibility()) || p.closest(BAR))) continue;
        if (n.nodeValue) all.push({ t: n.nodeValue.replace(/\s+/g, ' ') });
      } else if (n.tagName === 'IMG' && !n.closest(BAR)){ const e = emoteIn(n); if (e) all.push(e); }
    }
    return all;
  }
  // Text next to text joined, the spaces at either end left out, and nothing empty.
  function tidy(list){
    const out = [];
    for (const x of list){ const last = out[out.length - 1]; if (x.t && last && last.t != null) last.t += x.t; else out.push({ ...x }); }
    if (out.length && out[0].t != null) out[0].t = out[0].t.replace(/^\s+/, '');
    const lastT = out[out.length - 1]; if (lastT && lastT.t != null) lastT.t = lastT.t.replace(/\s+$/, '');
    return out.filter(x => x.e || x.t);
  }
  function partsFor(line, prefix, text, row){
    const el = row || elFor(line, text, true); if (!el) return null;
    const all = pieces(el);
    // cut off what comes before the message: the time, badges, the name and its colon
    const full = all.map(x => x.t || '').join(''), cut = full.match(prefix);
    if (!cut) return null;
    let skip = cut.index + cut[0].length;
    const out = [];
    for (const x of all){
      if (skip > 0){ if (x.t){ if (x.t.length <= skip){ skip -= x.t.length; continue; } out.push({ t: x.t.slice(skip) }); skip = 0; } continue; }
      out.push(x);
    }
    const parts = tidy(out);
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
      st.textContent = '[data-kmv-spam]::after{content:"LIKELY SPAM";display:inline-block;margin-left:6px;padding:0 4px;border-radius:3px;font:700 9.5px/1.6 system-ui,sans-serif;letter-spacing:.03em;color:#fff;background:var(--kmv-spam);vertical-align:1px;cursor:help}' +
        '[data-kmv-spam="abuse"]::after{content:"ABUSIVE"}';
      document.head.appendChild(st);
    }
    row.style.setProperty('--kmv-spam', m.color);
    row.style.boxShadow = `inset 3px 0 0 ${m.color}`;
    row.style.background = m.color + '24';
    const t = document.createElement('span');
    t.setAttribute('data-kmv-spam', m.kind === 'abuse' ? 'abuse' : ''); t.title = m.why;
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
    // support: the site's wording (its module's support), or null when Settings > Mentions > Support is off
    setSupport(cfg, you){
      sup = cfg && Array.isArray(cfg.finds) ? cfg : null; supQueue = [];
      supMe = String(you || '').trim().replace(/^@/, '').toLowerCase();
      if (!sup || !document.body) return;
      const was = armed; armed = false; supScan(); armed = was;   // what's there already is old
      if (!armed) arm();
    },
    setWatch(on){
      on = !!on; if (on === watch) return;
      watch = on; lines = [];
      if (on && !armed) arm();
      else if (on && document.body) chatLines().forEach(({ l }) => { const m = lineOf(l); if (m && known.size < 2000) known.add(m[1].toLowerCase()); });
    },
    // kind: 'abuse' tags it "ABUSIVE" rather than "LIKELY SPAM"
    mark(line, why, color, kind){
      if (marks.has(line)) return;
      marks.set(line, { why, color, kind }); tag(marks.get(line), line);
      if (marks.size > 200) marks.delete(marks.keys().next().value);
    },
    look(){ scan(); },
    // how many new messages others wrote since it was last asked (Chat Stage counts them for the chats out of sight).
    // The first time, what's there is old. With mentions and spam alerts off nothing has armed it yet, and
    // messages only count once it's armed, so the first ask arms it.
    count(){
      const first = !counting; counting = true;
      if (first && !armed) arm(); else scan();
      const n = first ? 0 : fresh; fresh = 0; return n;
    },
    ready(){ return armed; },                                // for the tests: new messages count from now on
    take(){ scan(); const q = { m: queue, l: lines, k: [...known], c: seenAt, s: supQueue }; queue = []; lines = []; supQueue = []; known.clear(); seenAt = 0; return q; }
  };
  return true;
}
let MENTION_JS;

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  MENTION_JS = `(${mentionAgent.toString()})()`;
}

export { init, MENTION_JS, mentionAgent };
