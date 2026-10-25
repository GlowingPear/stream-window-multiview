// Matching what's typed in the search box (Ctrl/⌘+K, palette/palette.js) against a name, like VS Code's:
//   100  the whole name                       "tile"    → Tile
//    80  the start of the name                "chat s"  → Chat Stage
//    70  the starts of its words, in order    "cs"      → Chat Stage
//    55  the start of any word                "stage"   → Chat Stage
//    35  inside a word                        "tag"     → Chat Stage
//  10–30 its letters in order (2 fewer for each letter between them)   "chtsg" → Chat Stage
// Several words typed ("mute every") each have to match on their own; the name scores the average of theirs,
// a little under a match of the whole. Capitals and accents don't count ("cafe" finds "Café").
// match() also says which letters matched, for drawing them in the accent colour. Nothing here touches the page.

const fuzzy = (() => {
  // The name in lower case without accents, and where each of its letters came from in the original
  function fold(s){
    let low = '';
    const at = [];
    let from = 0;
    for (const ch of String(s)){
      const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      low += base;
    for (let k = 0; k < base.length; k++) at.push(from);   // (one for each unit of the text: an emoji is two)
      from += ch.length;
    }
    return { low, at };
  }
  const isWordStart = (low, i) => i === 0 || !/[\p{L}\p{N}]/u.test(low[i - 1]) || (/\p{N}/u.test(low[i]) && !/\p{N}/u.test(low[i - 1]));
  const span = (from, n) => Array.from({ length: n }, (_, k) => from + k);
  // q from qi on, as the start of each of some of the words from word w on (each at least one letter, and at least
  // two words in all): the indexes it covers, or null
  function byWordStarts(q, low, starts, qi, w, used = 0){
    if (qi === q.length) return used >= 2 ? [] : null;
    for (; w < starts.length; w++){
      const s = starts[w], end = w + 1 < starts.length ? starts[w + 1] : low.length;
      for (let n = 1; s + n <= end && qi + n <= q.length && low[s + n - 1] === q[qi + n - 1]; n++){
        const rest = byWordStarts(q, low, starts, qi + n, w + 1, used + 1);
        if (rest) return [...span(s, n), ...rest];
      }
    }
    return null;
  }

  // One word (or the whole of what's typed) against the folded name: { score, hits: [indexes in low] } or null
  function matchFolded(q, low){
    if (!q) return null;
    // a name that starts with a symbol (a YouTube @handle) counts from its first letter, unless that's typed too
    const lead = /^[\p{L}\p{N}]/u.test(q) ? (/^[^\p{L}\p{N}]*/u.exec(low) || [''])[0].length : 0, name = low.slice(lead);
    if (name === q) return { score: 100, hits: span(lead, q.length) };
    if (name.startsWith(q)) return { score: 80, hits: span(lead, q.length) };
    const starts = Array.from({ length: low.length }, (_, i) => i).filter(i => isWordStart(low, i) && /[\p{L}\p{N}]/u.test(low[i]));
    // the starts of its words, in order: what's typed is the first letters of two or more words ("cs", "chst")
    if (!/\s/.test(q) && q.length > 1 && q.length <= 24){
      const hits = byWordStarts(q, low, starts, 0, 0);
      if (hits) return { score: 70, hits };
    }
    for (const s of starts) if (low.startsWith(q, s)) return { score: 55, hits: span(s, q.length) };
    const inside = low.indexOf(q);
    if (inside >= 0) return { score: 35, hits: span(inside, q.length) };
    // letters in order: the earliest place for each, scored by how spread out they are
    if (/\s/.test(q)) return null;
    const hits = [];
    let from = 0;
    for (const c of q){ const i = low.indexOf(c, from); if (i < 0) return null; hits.push(i); from = i + 1; }
    const gaps = hits[hits.length - 1] - hits[0] + 1 - hits.length;
    return { score: Math.max(10, 30 - gaps * 2), hits };
  }

  // What's typed against a name → { score, marks: [indexes into the name] } or null when it doesn't match
  function match(query, text){
    const q = fold(String(query || '').trim().replace(/\s+/g, ' ')).low;
    if (!q || text == null || text === '') return null;
    const { low, at } = fold(text);
    const toMarks = hits => [...new Set(hits.map(i => at[i]))].sort((a, b) => a - b);
    const whole = matchFolded(q, low);
    const words = q.split(' ');
    if (words.length < 2) return whole && { score: whole.score, marks: toMarks(whole.hits) };
    // several words: each has to match somewhere; the whole of it matching (above) counts if it's better
    const each = words.map(w => matchFolded(w, low));
    if (each.some(m => !m)) return whole && { score: whole.score, marks: toMarks(whole.hits) };
    const avg = Math.round(each.reduce((n, m) => n + m.score, 0) / each.length * 0.9);
    if (whole && whole.score >= avg) return { score: whole.score, marks: toMarks(whole.hits) };
    return { score: avg, marks: toMarks(each.flatMap(m => m.hits)) };
  }

  // An item of the search box against what's typed: its title counts in full, its other names (words: "volume" for
  // Mute) at 0.6 and its second line at 0.3. → { score, marks (in the title) } or null
  function scoreItem(query, { title, words = [], sub = '' }){
    const t = match(query, title);
    let best = t ? t.score : 0;
    for (const w of words){ const m = match(query, w); if (m) best = Math.max(best, m.score * 0.6); }
    const s = sub && match(query, sub);
    if (s) best = Math.max(best, s.score * 0.3);
    return best ? { score: best, marks: t ? t.marks : [] } : null;
  }

  return { match, scoreItem };
})();

export { fuzzy };
