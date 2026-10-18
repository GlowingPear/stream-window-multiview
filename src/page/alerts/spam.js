// Spam alerts: scores a chat message for the signs promo bots leave, and (with abuse on) for insults, slurs and
// threats. Used by the app page (as SmvSpam) and by the tests. One sign alone never flags a message: normal links,
// clip links and someone saying "check kick com/..." stay unflagged. The exceptions are a word flood, a known bot
// opening line, a slur or threat and someone swearing over and over. Asking to be added on Discord (or Telegram,
// ...) counts like a link. How many points each sign is worth can be changed (POINTS, 0 turns one off).
const SmvSpam = (() => {
  const ALLOWED = ['kick.com', 'twitch.tv', 'youtube.com', 'youtu.be', 'discord.gg', 'discord.com', 'x.com', 'twitter.com',
    'instagram.com', 'tiktok.com', 'reddit.com', 'imgur.com', 'streamable.com', 'medal.tv', 'github.com', 'spotify.com'];
  const WORDS = ['upgrade', 'viewers', 'followers', 'boost', 'promo', 'promote', 'zero cost', 'cheap', 'free followers', 'grow your'];
  // Greetings promo bots open with, a few lines before the link. Matched whole, ignoring case and punctuation.
  const OPENERS = ['Hey stranger, still running the show?', 'Your stream’s got something special, friend'];
  // Apps a bot asks to be added on ("add me up on discord bram209"), to take the scam out of the chat.
  const APPS = 'discord|telegram|tele|whatsapp|snapchat|snap|signal|skype|instagram|insta|ig';
  // Words after the app that aren't a name ("add me on discord later").
  const NOT_HANDLES = new Set(['and', 'or', 'but', 'so', 'if', 'too', 'pls', 'plz', 'please', 'bro', 'man', 'later', 'sometime', 'now',
    'rn', 'tonight', 'tomorrow', 'today', 'then', 'lol', 'lmao', 'haha', 'thanks', 'thx', 'ty', 'when', 'after', 'maybe', 'instead',
    'server', 'as', 'well', 'again', 'yeah', 'yes', 'no', 'it', 'is', 'my', 'me', 'the', 'a', 'an', 'to', 'with', 'for', 'name',
    'id', 'username', 'user', 'handle', 'at', 'on']);
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
  // Abuse. The lists start from dsojevic/profanity-list (https://github.com/dsojevic/profanity-list, MIT, (c) Daniel
  // Sojevic): its "general" words rated Strong or Severe, its racial and anti-LGBTQ slurs that have no everyday
  // meaning, plus chat slang it doesn't have (bish, thot, kys). Matched as whole words, any case, also stretched
  // ("whooore"), with digits or symbols for letters ("wh0re", "b!tch", "f*ck") or spelt out ("c u n t").
  // Insults count after "you" ("ur a whore", "your a bish", "you stupid cunt"): on their own they're often banter.
  const ABUSE = ['whore', 'hoe', 'slut', 'skank', 'thot', 'bitch', 'bish', 'biatch', 'bich', 'cunt', 'twat', 'wanker', 'tosser',
    'bastard', 'prick', 'dick', 'dickhead', 'cock', 'cocksucker', 'asshole', 'arsehole', 'ass', 'dumbass', 'jackass', 'fatass',
    'shithead', 'fuckhead', 'fucktard', 'fuckwit', 'motherfucker', 'retard', 'spastic', 'spaz', 'scumbag', 'piece of shit', 'pos'];
  // Slurs and threats: anywhere in a message.
  const SLURS = ['nigger', 'nigga', 'sand nigger', 'chink', 'gook', 'spic', 'wetback', 'beaner', 'kike', 'raghead', 'towelhead', 'paki',
    'darkie', 'jigaboo', 'porch monkey', 'faggot', 'fag', 'dyke', 'tranny', 'shemale',
    'kys', 'kill yourself', 'kill urself', 'kill ur self', 'kill your self', 'kill yo self', 'neck yourself', 'hang yourself',
    'unalive yourself', 'hope you die', 'hope u die', 'drink bleach'];
  // Swear words: a message of little else, several times in a row, is someone swearing at the chat.
  const SWEARS = ['fuck', 'fuk', 'fck', 'shit', 'cunt', 'bitch', 'dick', 'cock', 'pussy', 'ass', 'asshole', 'arsehole', 'bastard', 'twat',
    'wanker', 'prick', 'piss', 'bollocks', 'bullshit', 'motherfucker', 'dumbass', 'jackass', 'whore', 'slut', 'stfu', 'gtfo'];
  // Each sign's points (0: off, up to POINT_MAX). flags: a message needs one of these to be flagged at all (without
  // one there's nothing to promote and no one abused). words is per promo word, up to two of them. short: its name in
  // Settings › Spam alerts › Scoring, on one line (label is there as its tooltip).
  const POINT_MAX = 8;
  const SIGNS = [
    { key: 'hidden', group: 'spam', points: 3, flags: true, label: 'Disguised link', short: 'Disguised link' },
    { key: 'plain', group: 'spam', points: 1, flags: true, label: 'Link to a site not on the allowed list', short: 'Unlisted link' },
    { key: 'contact', group: 'spam', points: 4, flags: true, label: 'Asks to be added off-site', short: 'Asks to add off-site' },
    { key: 'elsewhere', group: 'spam', points: 3, flags: true, label: 'Same message in another open chat', short: 'Same in another chat' },
    { key: 'flood', group: 'spam', points: 6, flags: true, label: 'The same word over and over', short: 'Word flood' },
    { key: 'opener', group: 'spam', points: 6, flags: true, label: 'Known bot opening line', short: 'Bot opening line' },
    { key: 'words', group: 'spam', points: 1, label: 'Promo words', short: 'Promo words, each', note: 'For each one, up to 2' },
    { key: 'junk', group: 'spam', points: 1, label: 'Emotes breaking up the words', short: 'Emotes between words' },
    { key: 'newbie', group: 'spam', points: 1, label: 'New chatter', short: 'New chatter' },
    { key: 'insult', group: 'abuse', points: 4, flags: true, label: 'Insult aimed at someone', short: 'Insult at someone' },
    { key: 'slur', group: 'abuse', points: 5, flags: true, label: 'Slur or threat', short: 'Slur or threat' },
    { key: 'swearing', group: 'abuse', points: 5, flags: true, label: 'Swearing over and over', short: 'Swearing again and again' },
    { key: 'again', group: 'abuse', points: 3, label: 'Keeps at it', short: 'Keeps at it' }
  ];
  const POINTS = Object.fromEntries(SIGNS.map(s => [s.key, s.points]));
  const FLAGS = new Set(SIGNS.filter(s => s.flags).map(s => s.key));
  const GROUP = Object.fromEntries(SIGNS.map(s => [s.key, s.group]));
  const LEVELS = { relaxed: 6, balanced: 5, strict: 4 };
  const WINDOW_MS = 5 * 60 * 1000;
  const SWEAR_MS = 2 * 60 * 1000;

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

  // The app and name in "add me (up) on discord bram209", "dm me on telegram: x_y", "my discord is bram209"
  // ("discord bram209"), or null. A name is needed: "add me on discord later" asks nothing of anyone yet. After
  // "my discord" it also needs a digit, "." "_" or "#", so "my discord is down" isn't a name.
  function contact(text) {
    const re = new RegExp(`(?:\\b(?:add|hit|dm|message|msg|text|contact|reach|find)\\s+me(?:\\s+up)?\\s+(?:on|at|via|in)\\s+|\\b(my)\\s+)(${APPS})\\b` +
      `(?:\\s*[:@-]|\\s+(?:is|id|name|username|user|handle|tag)(?![\\p{L}\\p{N}]))*\\s*@?([\\p{L}\\p{N}._#]{3,32})`, 'giu');
    let m;
    while ((m = re.exec(String(text || '')))) {
      const name = m[3].replace(/[._]+$/, '');
      if (name.length >= 3 && !NOT_HANDLES.has(name.toLowerCase()) && (!m[1] || /[\d._#]/.test(name))) return `${m[2].toLowerCase()} ${name}`;
    }
    return null;
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

  // A message as the abuse lists read it: lower case, "you're" as "youre", digits and symbols next to letters as the
  // letters they stand for ("wh0re", "b!tch"), dots and dashes between letters as spaces, and letters spelt out one
  // at a time joined back up ("c u n t"), apart from a "u r a" in front of them.
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
  const PEEL = [['u', 'r', 'a'], ['u', 'r'], ['a'], ['u'], []];
  function plainText(text) {
    let t = String(text || '').toLowerCase().replace(/['’]/g, '');
    for (let i = 0; i < 2; i++) t = t.replace(/(?<=[a-z])[0134578@$]|[0134578@$](?=[a-z])|(?<=[a-z])!(?=[a-z])/g, c => LEET[c]);
    t = t.replace(/(?<=[a-z*])[._-](?=[a-z*])/g, ' ').replace(/[^a-z0-9* ]+/g, ' ');
    const toks = t.split(' ').filter(Boolean), out = [];
    for (let i = 0; i < toks.length;) {
      if (toks[i].length > 1) { out.push(toks[i++]); continue; }
      let j = i; while (j < toks.length && toks[j].length === 1) j++;
      const run = toks.slice(i, j), peel = PEEL.find(p => p.every((x, k) => run[k] === x));
      out.push(...(run.length - peel.length >= 3 ? [...peel, run.slice(peel.length).join('')] : run));
      i = j;
    }
    return out.join(' ');
  }
  // "You" and the words that can come between it and the insult ("ur a", "you stupid little"). "your", "ur" and the like
  // also mean "your" ("your dick joke"), so they need an "a" or "such" after them ("your a bish").
  const YOU = '(?:(?:you\\s+are|you\\s+r|u\\s+r|u\\s+are|youre|ure|you|u)\\s+|(?:ur|your|yer|ya)\\s+(?=(?:a+|an|such)\\s))';
  // A list word as a pattern: each letter may be stretched, and any but the first may be a "*".
  const wordPat = w => w.split(' ').map(part => [...part].map((c, i) => i ? `(?:${c}+|\\*)` : `${c}+`).join('')).join('\\s+');
  const FILL = ['a', 'an', 'such', 'so', 'fucking', 'fuckin', 'fking', 'fkn', 'stupid', 'dumb', 'little', 'lil', 'big', 'fat', 'ugly', 'dirty',
    'filthy', 'worthless', 'pathetic', 'useless', 'absolute', 'total', 'complete', 'massive', 'huge', 'nasty', 'braindead', 'actual', 'real',
    'cheap', 'lying', 'sad', 'crazy'];
  const FILL_RE = `(?:(?:${FILL.map(wordPat).join('|')})\\s+){0,3}`;
  const reCache = new Map();
  function listRe(kind, list) {
    const key = kind + '\n' + list.join('\n');
    if (reCache.has(key)) return reCache.get(key);
    const words = cleanList(list).map(w => w.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    const any = words.length ? `(?:${words.map(wordPat).join('|')})(?:s|es|z|ing|in|ed|er|ers|y)?` : '';
    const re = !any ? null : kind === 'insult' ? new RegExp(`(?<![a-z0-9*])${YOU}${FILL_RE}${any}(?![a-z0-9*])`)
      : new RegExp(`(?<![a-z0-9*])${any}(?![a-z0-9*])`, 'g');
    if (reCache.size > 30) reCache.clear();
    reCache.set(key, re);
    return re;
  }
  /**
   * abuse(text, { abuse, slurs, swears }) -> { insult, slur, swearOnly }
   * insult: the words that insult someone ("ur a whore"), slur: a slur or threat, or null. swearOnly: the message is
   * mostly swear words (at least half of its 6 or fewer words). Lists left out are the built-in ones.
   */
  function abuse(text, lists = {}) {
    const t = plainText(text), pick = (l, def) => Array.isArray(l) ? l : def;
    const ins = listRe('insult', pick(lists.abuse, ABUSE)), sl = listRe('slur', pick(lists.slurs, SLURS)), sw = listRe('swear', pick(lists.swears, SWEARS));
    const im = ins && ins.exec(t), sm = sl && t.match(sl), words = t.split(' ').filter(Boolean).length;
    const swears = sw ? (t.match(sw) || []).length : 0;
    return { insult: im ? im[0] : null, slur: sm ? sm[0] : null, swearOnly: swears > 0 && words <= 6 && swears * 2 >= words };
  }

  // Each sign's points: POINTS with yours over them, whole numbers from 0 to POINT_MAX.
  function pointsOf(p) {
    const out = { ...POINTS };
    if (p && typeof p === 'object') for (const k of Object.keys(POINTS)) {
      const v = Math.round(Number(p[k]));
      if (k in p && Number.isFinite(v)) out[k] = Math.max(0, Math.min(POINT_MAX, v));
    }
    return out;
  }

  /**
   * scoringWarnings(points, sensitivity, abuseOn) -> [{ text, sign } | { text, group } | { text }]
   * What may go wrong with these points, and where: on a sign (its key), one that now flags a message on its own,
   * can't be flagged any more, or (a small one) now tips a message over with little else; on a group ('spam',
   * 'abuse'), nothing left in it that can flag; on neither, most signs high. The built-in points have none.
   */
  function scoringWarnings(points, sensitivity, abuseOn = true) {
    const need = LEVELS[sensitivity] || LEVELS.balanced, now = pointsOf(points), out = [];
    const on = SIGNS.filter(s => abuseOn || s.group !== 'abuse');
    const level = Object.keys(LEVELS).find(k => LEVELS[k] === need);
    const lv = level[0].toUpperCase() + level.slice(1);
    // The small signs that can come with a sign that flags: promo words (two of them) with spam, keeps at it with an
    // insult or a slur, emotes and a new chatter with anything.
    const goesWith = (small, big) => small.key === 'words' ? big.group === 'spam' : small.key === 'again' ? /^(insult|slur)$/.test(big.key) : true;
    const times = s => s.key === 'words' ? 2 : 1;
    const extra = (big, pts) => on.filter(s => !s.flags && goesWith(s, big)).reduce((a, s) => a + times(s) * pts[s.key], 0);
    for (const [g, what] of [['spam', 'promo spam'], ['abuse', 'abuse']].filter(([g]) => on.some(s => s.group === g)))
      if (on.filter(s => s.flags && s.group === g).every(s => !now[s.key])) out.push({ text: `Nothing can flag ${what}: every sign that can is off.`, group: g });
    for (const s of on.filter(x => x.flags && now[x.key])) {
      if (now[s.key] >= need && s.points < need)
        out.push({ text: `${s.label} (${now[s.key]}) is now enough on its own on ${lv}: every message with it is flagged.`, sign: s.key });
      else if (s.points + extra(s, POINTS) >= need && now[s.key] + extra(s, now) < need)
        out.push({ text: `${s.label} can't be flagged on ${lv} any more without another strong sign: with every small sign it reaches ${now[s.key] + extra(s, now)} of ${need}.`, sign: s.key });
    }
    for (const s of on.filter(x => !x.flags && now[x.key])) {
      const big = on.filter(b => b.flags && now[b.key] && goesWith(s, b)).sort((a, b) => now[a.key] - now[b.key])[0];
      if (!big || now[big.key] >= need) continue;
      if (times(s) * now[s.key] + now[big.key] >= need && times(s) * s.points + big.points < need)
        out.push({ text: `${s.label} (${now[s.key]}) with just ${big.label.toLowerCase()} (${now[big.key]}) is now enough to flag a message on ${lv}.`, sign: s.key });
    }
    if (on.filter(s => now[s.key] >= 4).length >= on.length * 0.7)
      out.push({ text: 'Most signs are worth 4 or more: almost any message with one of them will be flagged. Expect false alarms.' });
    return out;
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
   * score(msg, ctx, opts) -> { score, need, spam, abuse, signs: [{ key, text, points }] }
   * msg:  { sender, body, chat, t }
   * ctx:  { recent: [{ sender, body, chat, t }], firstSeen: { [chat + '\n' + sender]: time } }
   *       recent holds the other messages seen lately (any chat, including this one).
   *       firstSeen can also be a Map with the same keys.
   * opts: { sensitivity, allowed, words, openers, ignore, abuse, abuseWords, slurs, swears, points }
   *       (openers, ignore, abuseWords, slurs, swears: an empty list matches nothing)
   *       ignore: senders never flagged (exact name, any case); the result then has ignored: true.
   *       abuse: false leaves out insults, slurs and swearing. points: { [sign key]: 0 to POINT_MAX } (see SIGNS).
   * abuse: it was flagged, or would be, for abuse rather than spam (its tag says so).
   */
  function score(msg, ctx = {}, opts = {}) {
    const allowed = cleanList(opts.allowed && opts.allowed.length ? opts.allowed : ALLOWED);
    const words = cleanList(opts.words && opts.words.length ? opts.words : WORDS);
    const openers = (Array.isArray(opts.openers) ? opts.openers : OPENERS).map(x => String(x).trim()).filter(x => flat(x));
    const need = LEVELS[opts.sensitivity] || LEVELS.balanced, pts = pointsOf(opts.points);
    if (ignored(msg.sender, opts.ignore)) return { score: 0, need, spam: false, abuse: false, signs: [], ignored: true };
    const body = String(msg.body || ''), low = body.toLowerCase(), t = msg.t || Date.now();
    const signs = [];
    const sign = (key, text, points) => { if (points > 0) signs.push({ key, text, points }); };   // 0: that sign is off

    const s = sites(body);
    const hidden = [...new Set(s.hidden.filter(d => !domainOk(d, allowed)))];
    const plain = [...new Set(s.plain.filter(d => !domainOk(d, allowed)))];
    if (hidden.length) sign('hidden', `Disguised link: ${hidden.join(', ').replace(/\./g, ' ')}`, pts.hidden);
    else if (plain.length) sign('plain', `Link to a site not on the allowed list: ${plain.join(', ')}`, pts.plain);

    const asks = contact(body);
    if (asks) sign('contact', `Asks to be added off-site: ${asks}`, pts.contact);

    const found = words.filter(w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(low));
    if (found.length) sign('words', `Promo words: ${found.join(', ')}`, Math.min(2, found.length) * pts.words);

    if (junkCount(body) >= 2 && norm(body).split(' ').length >= 4) sign('junk', 'Emotes breaking up the words', pts.junk);

    const fl = flood(body);
    if (fl) sign('flood', `The same word over and over: "${fl.unit}" ×${fl.times}`, pts.flood);

    const opener = openers.find(o => ` ${flat(body)} `.includes(` ${flat(o)} `));
    if (opener) sign('opener', `Known bot opening line: "${opener}"`, pts.opener);

    const recent = (ctx.recent || []).filter(r => t - (r.t || 0) < WINDOW_MS && r !== msg);
    const theirs = recent.filter(r => r.chat === msg.chat && String(r.sender).toLowerCase() === String(msg.sender).toLowerCase() && (r.t || 0) <= t);
    if (opts.abuse !== false) {
      const lists = { abuse: opts.abuseWords, slurs: opts.slurs, swears: opts.swears }, a = abuse(body, lists);
      if (a.insult) sign('insult', `Insult aimed at someone: "${a.insult}"`, pts.insult);
      if (a.slur) sign('slur', `Slur or threat: "${a.slur}"`, pts.slur);
      if (a.swearOnly) {
        const n = theirs.filter(r => t - (r.t || 0) < SWEAR_MS && abuse(r.body, lists).swearOnly).length;
        if (n >= 2) sign('swearing', `Swearing over and over: ${n + 1} messages in 2 minutes`, pts.swearing);
      }
      if (a.insult || a.slur) {
        const n = theirs.filter(r => { const b = abuse(r.body, lists); return b.insult || b.slur; }).length;
        if (n) sign('again', `Keeps at it: ${n} more abusive ${n === 1 ? 'message' : 'messages'} in the last 5 minutes`, pts.again);
      }
    }

    const key = norm(body);
    if (key.length >= 12) {
      const elsewhere = new Set(recent.filter(r => r.chat !== msg.chat && norm(r.body) === key).map(r => r.chat));
      if (elsewhere.size) sign('elsewhere', `Same message in ${elsewhere.size === 1 ? 'another open chat' : elsewhere.size + ' other open chats'}`, pts.elsewhere);
    }

    const seenKey = `${msg.chat}\n${String(msg.sender || '').toLowerCase()}`;
    const first = ctx.firstSeen instanceof Map ? ctx.firstSeen.get(seenKey) : (ctx.firstSeen || {})[seenKey];
    const isNew = first && t - first < WINDOW_MS;
    if (isNew) {
      const filler = theirs.filter(r => !/@|https?:|\.\w{2,4}\b/.test(r.body) && norm(r.body).split(' ').length >= 3);
      if (filler.length >= 2) sign('newbie', 'Friendly filler lines just before', pts.newbie);
      else sign('newbie', 'Started chatting in the last few minutes', pts.newbie);
    }

    const total = signs.reduce((a, x) => a + x.points, 0);
    // A sign that flags is needed (a link, an off-site name, ..., an insult): without one there's nothing to promote
    // and no one abused.
    const spam = total >= need && signs.some(x => FLAGS.has(x.key));
    return { score: total, need, spam, abuse: signs.some(x => FLAGS.has(x.key) && GROUP[x.key] === 'abuse'), signs };
  }

  return { score, sites, contact, ignored, withNewBots, abuse, pointsOf, scoringWarnings, ALLOWED, WORDS, OPENERS, BOTS, LEVELS,
    ABUSE, SLURS, SWEARS, SIGNS, POINTS, POINT_MAX };
})();

export { SmvSpam };
