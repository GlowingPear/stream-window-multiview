// Spam alerts: scores a chat message for the signs promo bots leave. Used by the app page (as
// window.SmvSpam) and by the tests (require). One sign alone never flags a message: normal links,
// clip links and someone saying "check kick com/..." stay unflagged.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmvSpam = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ALLOWED = ['kick.com', 'twitch.tv', 'youtube.com', 'youtu.be', 'discord.gg', 'discord.com', 'x.com', 'twitter.com',
    'instagram.com', 'tiktok.com', 'reddit.com', 'imgur.com', 'streamable.com', 'medal.tv', 'github.com', 'spotify.com'];
  const WORDS = ['upgrade', 'viewers', 'followers', 'boost', 'promo', 'promote', 'zero cost', 'cheap', 'free followers', 'grow your'];
  // Endings a bot uses for its site. Kept short so "the com" in normal chat rarely looks like a domain.
  const TLDS = 'com|net|org|io|xyz|gg|tv|me|co|shop|site|online|store|live|app|pro|top|club|info|biz|ru|cc|link|ly|fun|space|vip';
  const NOT_NAMES = new Set(['dot', 'the', 'and', 'for', 'you', 'your', 'this', 'that', 'with', 'from', 'its', 'not', 'are', 'was']);
  const LEVELS = { relaxed: 6, balanced: 5, strict: 4 };
  const WINDOW_MS = 5 * 60 * 1000;

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const domainOk = (d, allowed) => allowed.some(a => d === a || d.endsWith('.' + a));
  const cleanList = l => [...new Set((l || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))];

  // Sites in a message: { plain: ['site.com'], hidden: ['botkiva.com'] } (hidden = written with a space,
  // [.], (.) or "dot" instead of the dot, so the chat doesn't turn it into a link).
  function sites(text) {
    const plain = [], hidden = [], t = String(text || '');
    const plainRe = new RegExp(`(?:https?://)?((?:[a-z0-9-]+\\.)+(?:${TLDS}))(?![a-z0-9])`, 'gi');
    const hiddenRe = new RegExp(`(?<![a-z0-9.])([a-z0-9-]{3,})(?:\\s*\\[\\s*\\.\\s*\\]\\s*|\\s*\\(\\s*\\.\\s*\\)\\s*|\\s+dot\\s+|\\s+\\.\\s*|\\s*\\.\\s+|\\s+)(${TLDS})(?![a-z0-9])`, 'gi');
    let m;
    while ((m = plainRe.exec(t))) plain.push(m[1].toLowerCase());
    while ((m = hiddenRe.exec(t))) if (!NOT_NAMES.has(m[1].toLowerCase())) hidden.push(`${m[1]}.${m[2]}`.toLowerCase());
    return { plain, hidden };
  }

  // Emote codes and emoji the chat shows as pictures, sitting between the words.
  function junkCount(text) {
    const toks = String(text || '').split(/\s+/).filter(Boolean);
    return toks.filter(w => /^[a-z]{2,}[A-Z][A-Za-z0-9]{2,}$/.test(w) || /^:[\w-]+:$/.test(w) || /^\p{Extended_Pictographic}+$/u.test(w)).length;
  }

  // A wall of one word: glued together ("FuckFuckFuck FuckFuckFuckFuck ...", 10+ times) or spaced out
  // (25+ words). Short pieces like "haha" or "aaaa" glued together are laughing or hype, not a flood.
  function flood(text) {
    const words = String(text || '').toLowerCase().split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]+/gu, '')).filter(Boolean);
    const m = /^(.{2,20}?)\1+$/su.exec(words.join(''));
    if (!m) return null;
    const unit = m[1], times = words.join('').length / unit.length;
    const glued = unit.length >= 4 && times >= 10 && words.some(w => w.length >= unit.length * 3);
    return glued || words.length >= 25 ? { unit, times } : null;
  }

  /**
   * score(msg, ctx, opts) -> { score, need, spam, signs: [{ text, points }] }
   * msg:  { sender, body, chat, t }
   * ctx:  { recent: [{ sender, body, chat, t }], firstSeen: { [chat + '\n' + sender]: time } }
   *       recent holds the other messages seen lately (any chat, including this one).
   * opts: { sensitivity, allowed, words }
   */
  function score(msg, ctx = {}, opts = {}) {
    const allowed = cleanList(opts.allowed && opts.allowed.length ? opts.allowed : ALLOWED);
    const words = cleanList(opts.words && opts.words.length ? opts.words : WORDS);
    const need = LEVELS[opts.sensitivity] || LEVELS.balanced;
    const body = String(msg.body || ''), low = body.toLowerCase(), t = msg.t || Date.now();
    const signs = [];
    const sign = (text, points) => signs.push({ text, points });

    const s = sites(body);
    const hidden = [...new Set(s.hidden.filter(d => !domainOk(d, allowed)))];
    const plain = [...new Set(s.plain.filter(d => !domainOk(d, allowed)))];
    if (hidden.length) sign(`Disguised link: ${hidden.join(', ').replace(/\./g, ' ')}`, 3);
    else if (plain.length) sign(`Link to a site not on the allowed list: ${plain.join(', ')}`, 1);

    const found = words.filter(w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(low));
    if (found.length) sign(`Promo words: ${found.join(', ')}`, Math.min(2, found.length));

    if (junkCount(body) >= 2 && norm(body).split(' ').length >= 4) sign('Emotes breaking up the words', 1);

    const fl = flood(body);
    if (fl) sign(`The same word over and over: "${fl.unit}" ×${fl.times}`, 6);

    const recent = (ctx.recent || []).filter(r => t - (r.t || 0) < WINDOW_MS && r !== msg);
    const key = norm(body);
    if (key.length >= 12) {
      const elsewhere = new Set(recent.filter(r => r.chat !== msg.chat && norm(r.body) === key).map(r => r.chat));
      if (elsewhere.size) sign(`Same message in ${elsewhere.size === 1 ? 'another open chat' : elsewhere.size + ' other open chats'}`, 3);
    }

    const first = (ctx.firstSeen || {})[`${msg.chat}\n${String(msg.sender || '').toLowerCase()}`];
    const isNew = first && t - first < WINDOW_MS;
    if (isNew) {
      const before = recent.filter(r => r.chat === msg.chat && String(r.sender).toLowerCase() === String(msg.sender).toLowerCase() && (r.t || 0) <= t);
      const filler = before.filter(r => !/@|https?:|\.\w{2,4}\b/.test(r.body) && norm(r.body).split(' ').length >= 3);
      if (filler.length >= 2) sign('Friendly filler lines just before', 1);
      else sign('Started chatting in the last few minutes', 1);
    }

    const total = signs.reduce((a, x) => a + x.points, 0);
    // A link (disguised or not) is needed: without one there's nothing to promote. A word flood is spam on its own.
    const spam = total >= need && (hidden.length > 0 || plain.length > 0 || !!fl || signs.some(x => /^Same message/.test(x.text)));
    return { score: total, need, spam, signs };
  }

  return { score, sites, ALLOWED, WORDS, LEVELS };
});
