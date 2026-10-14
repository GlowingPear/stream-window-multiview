// Spam alerts: scores a chat message for the signs promo bots leave. Used by the app page (as
// window.SmvSpam) and by the tests (require). One sign alone never flags a message: normal links,
// clip links and someone saying "check kick com/..." stay unflagged. The exceptions are a word flood
// and a known bot opening line.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmvSpam = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ALLOWED = ['kick.com', 'twitch.tv', 'youtube.com', 'youtu.be', 'discord.gg', 'discord.com', 'x.com', 'twitter.com',
    'instagram.com', 'tiktok.com', 'reddit.com', 'imgur.com', 'streamable.com', 'medal.tv', 'github.com', 'spotify.com'];
  const WORDS = ['upgrade', 'viewers', 'followers', 'boost', 'promo', 'promote', 'zero cost', 'cheap', 'free followers', 'grow your'];
  // Greetings promo bots open with, a few lines before the link. Matched whole, ignoring case and punctuation.
  const OPENERS = ['Hey stranger, still running the show?'];
  // Endings a bot uses for its site. Kept short so "the com" in normal chat rarely looks like a domain.
  const TLDS = 'com|net|org|io|xyz|gg|tv|me|co|shop|site|online|store|live|app|pro|top|club|info|biz|ru|cc|link|ly|fun|space|vip';
  // Endings that count with just a space before them ("botkiva com"). The rest are everyday words or chat
  // ("call me", "going live", "art site", "watch tv", "nice gg"), so they need a [.], (.), "dot" or " . ".
  const SPACE_TLDS = 'com|net|org|io|xyz|ru|cc|biz';
  const NOT_NAMES = new Set(['dot', 'the', 'and', 'for', 'you', 'your', 'this', 'that', 'with', 'from', 'its', 'not', 'are', 'was',
    'call', 'text', 'follow', 'read', 'going', 'stream']);
  // Chat bots that post intros, rules, socials and timers, often the same text in several chats, and repeat
  // names back ("thanks for the follow, @you"). Never flagged as spam, and never a mention.
  const BOTS = ['botrix', 'nightbot', 'streamelements', 'fossabot', 'moobot', 'streamlabs', 'wizebot', 'sery_bot', 'kickbot',
    'griddlebot', 'kickpulsebot', 'kicklet', 'lumiastream'];
  // The bots offered before the app remembered which ones it had offered.
  const FIRST_BOTS = BOTS.slice(0, 9);
  const LEVELS = { relaxed: 6, balanced: 5, strict: 4 };
  const WINDOW_MS = 5 * 60 * 1000;

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const flat = s => norm(String(s || '').replace(/['’]/g, ''));   // "don't" and "dont" alike
  const domainOk = (d, allowed) => allowed.some(a => d === a || d.endsWith('.' + a));
  const cleanList = l => [...new Set((l || []).map(x => String(x).trim().toLowerCase()).filter(Boolean))];

  // Sites in a message: { plain: ['site.com'], hidden: ['botkiva.com'] } (hidden = written with [.], (.),
  // "dot" or a space (only before SPACE_TLDS) instead of the dot, so the chat doesn't turn it into a link).
  function sites(text) {
    const plain = [], hidden = [], t = String(text || '');
    const plainRe = new RegExp(`(?:https?://)?((?:[a-z0-9-]+\\.)+(?:${TLDS}))(?![a-z0-9])`, 'gi');
    const hiddenRe = new RegExp(`(?<![a-z0-9.])([a-z0-9-]{3,})(?:\\s*\\[\\s*\\.\\s*\\]\\s*|\\s*\\(\\s*\\.\\s*\\)\\s*|\\s+dot\\s+|\\s+\\.\\s*|\\s*\\.\\s+)(${TLDS})(?![a-z0-9])|(?<![a-z0-9.])([a-z0-9-]{3,})\\s+(${SPACE_TLDS})(?![a-z0-9])`, 'gi');
    let m;
    while ((m = plainRe.exec(t))) plain.push(m[1].toLowerCase());
    while ((m = hiddenRe.exec(t))) {
      const name = m[1] || m[3], end = m[2] || m[4];
      if (!NOT_NAMES.has(name.toLowerCase())) hidden.push(`${name}.${end}`.toLowerCase());
    }
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

  // Whether a sender is on the chat bot list (default BOTS): the whole name, ignoring case.
  function ignored(sender, list) {
    const name = String(sender || '').trim().toLowerCase();
    return !!name && cleanList(Array.isArray(list) ? list : BOTS).includes(name);
  }

  /**
   * withNewBots(list, offered) -> { list, offered }
   * A chat bot list you changed is saved whole, so bots added to BOTS later would never reach it. This adds
   * the ones not offered before, once: a bot you removed stays removed. list: your saved list (null: the
   * built-in one, nothing to add). offered: the built-in bots already offered (null: FIRST_BOTS).
   */
  function withNewBots(list, offered) {
    if (!Array.isArray(list)) return { list: null, offered: BOTS.slice() };
    const before = new Set(cleanList(Array.isArray(offered) ? offered : FIRST_BOTS)), have = cleanList(list);
    const add = BOTS.filter(b => !before.has(b) && !have.includes(b));
    return { list: add.length ? [...list, ...add] : list, offered: BOTS.slice() };
  }

  /**
   * score(msg, ctx, opts) -> { score, need, spam, signs: [{ text, points }] }
   * msg:  { sender, body, chat, t }
   * ctx:  { recent: [{ sender, body, chat, t }], firstSeen: { [chat + '\n' + sender]: time } }
   *       recent holds the other messages seen lately (any chat, including this one).
   *       firstSeen can also be a Map with the same keys.
   * opts: { sensitivity, allowed, words, openers, ignore }   (openers, ignore: an empty list matches nothing)
   *       ignore: senders never flagged (exact name, any case); the result then has ignored: true.
   */
  function score(msg, ctx = {}, opts = {}) {
    const allowed = cleanList(opts.allowed && opts.allowed.length ? opts.allowed : ALLOWED);
    const words = cleanList(opts.words && opts.words.length ? opts.words : WORDS);
    const openers = (Array.isArray(opts.openers) ? opts.openers : OPENERS).map(x => String(x).trim()).filter(x => flat(x));
    const need = LEVELS[opts.sensitivity] || LEVELS.balanced;
    if (ignored(msg.sender, opts.ignore)) return { score: 0, need, spam: false, signs: [], ignored: true };
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

    const opener = openers.find(o => ` ${flat(body)} `.includes(` ${flat(o)} `));
    if (opener) sign(`Known bot opening line: "${opener}"`, 6);

    const recent = (ctx.recent || []).filter(r => t - (r.t || 0) < WINDOW_MS && r !== msg);
    const key = norm(body);
    if (key.length >= 12) {
      const elsewhere = new Set(recent.filter(r => r.chat !== msg.chat && norm(r.body) === key).map(r => r.chat));
      if (elsewhere.size) sign(`Same message in ${elsewhere.size === 1 ? 'another open chat' : elsewhere.size + ' other open chats'}`, 3);
    }

    const seenKey = `${msg.chat}\n${String(msg.sender || '').toLowerCase()}`;
    const first = ctx.firstSeen instanceof Map ? ctx.firstSeen.get(seenKey) : (ctx.firstSeen || {})[seenKey];
    const isNew = first && t - first < WINDOW_MS;
    if (isNew) {
      const before = recent.filter(r => r.chat === msg.chat && String(r.sender).toLowerCase() === String(msg.sender).toLowerCase() && (r.t || 0) <= t);
      const filler = before.filter(r => !/@|https?:|\.\w{2,4}\b/.test(r.body) && norm(r.body).split(' ').length >= 3);
      if (filler.length >= 2) sign('Friendly filler lines just before', 1);
      else sign('Started chatting in the last few minutes', 1);
    }

    const total = signs.reduce((a, x) => a + x.points, 0);
    // A link (disguised or not) is needed: without one there's nothing to promote. A word flood and a known
    // bot opening line are spam on their own.
    const spam = total >= need && (hidden.length > 0 || plain.length > 0 || !!fl || !!opener || signs.some(x => /^Same message/.test(x.text)));
    return { score: total, need, spam, signs };
  }

  return { score, sites, ignored, withNewBots, ALLOWED, WORDS, OPENERS, BOTS, LEVELS };
});
