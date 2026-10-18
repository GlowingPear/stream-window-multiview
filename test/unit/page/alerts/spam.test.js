// Spam alerts: which chat messages get flagged, and why.
const test = require('node:test');
const assert = require('node:assert/strict');
const { score, sites, contact, ignored, withNewBots, abuse, pointsOf, scoringWarnings, BOTS, POINTS, POINT_MAX, SIGNS } = require('../../../../src/page/alerts/spam.js').SmvSpam;

const T = 1_700_000_000_000;
const msg = (body, extra = {}) => ({ sender: 'newacct', body, chat: 'alpha', t: T, ...extra });
const flagged = (body, ctx, opts) => score(msg(body), ctx, opts).spam;

test('the promo bot from the example is flagged, with its reasons', () => {
  const r = score(msg('hq ai stream upgrades botkiva com emojiBlowKiss zero cost upgrades emojiBlowKiss'));
  assert.equal(r.spam, true);
  assert.deepEqual(r.signs.map(s => s.text), ['Disguised link: botkiva com', 'Promo words: upgrade, zero cost', 'Emotes breaking up the words']);
  assert.equal(r.score, 6);
  // the chat shows emotes as pictures, so they're often missing from the text: still flagged
  assert.equal(flagged('hq ai stream upgrades botkiva com  zero cost upgrades'), true);
});

test('normal links, clip links and a single sign are never enough', () => {
  for (const body of [
    'clip it kick.com/someone/clips/abc',
    'lol go to kick com/someone',
    'https://clips.twitch.tv/SomeClip and youtu.be/abc',
    'check out my site com',
    'zero cost upgrades for your stream',
    'great upgrade on that gpu, got it from newegg.com',
    'I dot com mean, whatever'
  ]) assert.equal(flagged(body), false, body);
});

test('disguised links are found however the dot is hidden, and allowed sites never count', () => {
  assert.deepEqual(sites('a botkiva com b').hidden, ['botkiva.com']);
  assert.deepEqual(sites('botkiva[.]com').hidden, ['botkiva.com']);
  assert.deepEqual(sites('botkiva (.) net').hidden, ['botkiva.net']);
  assert.deepEqual(sites('botkiva dot xyz').hidden, ['botkiva.xyz']);
  assert.equal(score(msg('go watch kick com/x on twitch tv')).signs.length, 0);
  assert.equal(flagged('cheap viewers at botkiva com', {}, { allowed: ['botkiva.com'] }), false, 'a site you allow');
});

test('the same message in another open chat is a strong sign', () => {
  const body = 'best viewers at botkiva[.]com';
  assert.equal(flagged(body), false, 'on its own: 4 points');
  const ctx = { recent: [{ sender: 'other', body: 'Best viewers at botkiva[.]com!', chat: 'bravo', t: T - 60_000 }] };
  const r = score(msg(body), ctx);
  assert.equal(r.spam, true);
  assert.ok(r.signs.some(s => s.text === 'Same message in another open chat'));
  ctx.recent[0].t = T - 10 * 60_000;
  assert.equal(score(msg(body), ctx).spam, false, 'not when it was long ago');
});

test('friendly filler lines from a new chatter just before add to the score', () => {
  const firstSeen = { 'alpha\nnewacct': T - 60_000 };
  const recent = [
    { sender: 'newacct', body: 'Hey stranger, still running the show?', chat: 'alpha', t: T - 50_000 },
    { sender: 'newacct', body: "Don't work too hard, leave some success for the rest of us.", chat: 'alpha', t: T - 40_000 }
  ];
  const r = score(msg('best viewers at botkiva[.]com'), { recent, firstSeen });
  assert.ok(r.signs.some(s => s.text === 'Friendly filler lines just before'));
  assert.equal(r.spam, true);
});

test('firstSeen can be a Map', () => {
  const firstSeen = new Map([['alpha\nnewacct', T - 60_000]]);
  assert.ok(score(msg('hello there friends'), { firstSeen }).signs.some(s => s.text === 'Started chatting in the last few minutes'));
  firstSeen.set('alpha\nnewacct', T - 10 * 60_000);
  assert.ok(!score(msg('hello there friends'), { firstSeen }).signs.some(s => s.text === 'Started chatting in the last few minutes'));
});

test('sensitivity moves the line', () => {
  const body = 'best viewers at botkiva[.]com';        // 4 points
  assert.equal(flagged(body, {}, { sensitivity: 'strict' }), true);
  assert.equal(flagged(body, {}, { sensitivity: 'balanced' }), false);
  const ex = 'hq ai stream upgrades botkiva com zero cost upgrades';   // 5 points
  assert.equal(flagged(ex, {}, { sensitivity: 'relaxed' }), false);
  assert.equal(flagged(ex, {}, { sensitivity: 'balanced' }), true);
});

test('your own promo words', () => {
  assert.equal(flagged('subs here at botkiva com, sub4sub deal'), false);
  assert.equal(flagged('subs here at botkiva com, sub4sub deal', {}, { words: ['sub4sub', 'subs here'] }), true);
});

test('a wall of one word is spam on its own, with no link needed', () => {
  const wall = 'FuckFuckFuckFuckFuck FuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuck FuckFuckFuckFuckFuck FuckFuckFuckFuckFuck FuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuckFuck';
  const r = score(msg(wall), {}, { sensitivity: 'relaxed' });
  assert.equal(r.spam, true);
  assert.deepEqual(r.signs, [{ key: 'flood', text: 'The same word over and over: "fuck" ×45', points: 6 }]);
  assert.equal(flagged('BuyNow! BuyNow!BuyNow!BuyNow! BuyNow!BuyNow!BuyNow!BuyNow!BuyNow!BuyNow!'), true, 'punctuation between');
  assert.equal(flagged(Array(25).fill('Fuck').join(' ')), true, 'spaced out, 25 times');
});

test('a known bot opening line is spam on its own, with no link needed', () => {
  const r = score(msg('Hey stranger, still running the show?'), {}, { sensitivity: 'relaxed' });
  assert.equal(r.spam, true);
  assert.deepEqual(r.signs, [{ key: 'opener', text: 'Known bot opening line: "Hey stranger, still running the show?"', points: 6 }]);
  assert.equal(flagged('hey   STRANGER still running the show!!'), true, 'case, spacing and punctuation ignored');
  assert.equal(flagged('lol hey stranger, still running the show? haha'), true, 'inside a longer message');
});

test('the "something special, friend" bot: its opening line, then asking to be added on Discord', () => {
  const firstSeen = { 'alpha\nnewacct': T - 3_000 };
  const hello = { sender: 'newacct', body: 'Your stream’s got something special, friend.I’m busy at the moment but I’ll be back with my squad.', chat: 'alpha', t: T - 3_000 };
  const r1 = score(msg(hello.body, { t: hello.t }), { recent: [hello], firstSeen }, { sensitivity: 'relaxed' });
  assert.equal(r1.spam, true);
  assert.equal(r1.signs[0].text, 'Known bot opening line: "Your stream’s got something special, friend"');
  assert.equal(flagged("your stream's got something special friend"), true, 'straight apostrophe, no comma');
  const r2 = score(msg('Add me up on discord bram209'), { recent: [hello], firstSeen });
  assert.equal(r2.spam, true);
  assert.deepEqual(r2.signs, [{ key: 'contact', text: 'Asks to be added off-site: discord bram209', points: 4 }, { key: 'newbie', text: 'Started chatting in the last few minutes', points: 1 }]);
  assert.equal(r2.score, 5);
  // from someone who's been chatting a while it's only enough on Strict
  assert.equal(flagged('Add me up on discord bram209'), false);
  assert.equal(flagged('Add me up on discord bram209', {}, { sensitivity: 'strict' }), true);
});

test('asking to be added off-site: the app and the name, however it\'s written', () => {
  for (const [body, want] of [
    ['Add me up on discord bram209', 'discord bram209'],
    ['add me on Discord: @Bram_209.', 'discord Bram_209'],
    ['dm me on telegram: @cryptoguy', 'telegram cryptoguy'],
    ['hit me up on snap - xx.yy', 'snap xx.yy'],
    ['message me via whatsapp id 5551234', 'whatsapp 5551234'],
    ['my discord is bram#1234', 'discord bram#1234'],
    ['my telegram username is @grow_fast', 'telegram grow_fast'],
    ['add me on discord isabel', 'discord isabel']
  ]) assert.equal(contact(body), want, body);
  // no name, or not asking: nothing
  for (const body of ['add me on discord later', 'add me on discord pls', 'join the discord', 'my discord is down',
    'my discord server is fun', 'see you on discord tonight', 'whats your discord?', 'add me on discord', '', null])
    assert.equal(contact(body), null, String(body));
  // a name to add counts as something to promote, like a link: with enough points it's flagged
  assert.equal(score(msg('add me on telegram @promo_king for cheap viewers'), {}).spam, true);
});

test('normal greetings are not bot opening lines', () => {
  for (const body of ['hey everyone', 'Hey stranger!', 'still running the show?', 'hey strangers, still running the shows?'])
    assert.equal(flagged(body), false, body);
});

test('your own bot opening lines, and an empty list matches nothing', () => {
  assert.equal(flagged("Don't work too hard, leave some success for the rest of us."), false);
  const r = score(msg("don't work too hard, leave some success for the rest of us"), {}, { openers: ["Don't work too hard, leave some success for the rest of us.", ' ', '?!'] });
  assert.deepEqual(r.signs, [{ key: 'opener', text: 'Known bot opening line: "Don\'t work too hard, leave some success for the rest of us."', points: 6 }]);
  assert.equal(r.spam, true);
  assert.equal(flagged('dont work too hard, leave some success for the rest of us', {}, { openers: ["Don’t work too hard, leave some success for the rest of us"] }), true, 'apostrophes ignored');
  assert.equal(flagged('Hey stranger, still running the show?', {}, { openers: [] }), false, 'emptied list');
});

test('hype, laughing and emote walls are not a word flood', () => {
  for (const body of [
    'KEKW KEKW KEKW KEKW KEKW KEKW KEKW KEKW',
    Array(24).fill('LOL').join(' '),
    'hahahahahahahahahahahahahahahahahahahahahahaha',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'GOAL GOALGOALGOAL',
    'no way no way no way no way',
    ''
  ]) assert.equal(score(msg(body)).signs.length, 0, body);
});

test('everyday phrases with a word like "me", "live" or "site" are not disguised links', () => {
  const phrases = [
    'Hi, the name is Sam, can call me Sam or S! Pronouns are She/Her. I love video games and I draw or read in my spare time! Hope we can be friends and you enjoy the stream!',
    'you can call me Sam', 'we are going live soon', 'new stream live now', 'text me later', 'follow me on kick',
    'read me a story', 'check my art site', 'watch tv later', 'nice gg everyone', 'the new app is fun', 'pro tip: top club info'
  ];
  const firstSeen = { 'alpha\nnewacct': T - 60_000 };
  for (const body of phrases) {
    assert.deepEqual(sites(body).hidden, [], body);
    for (const sensitivity of ['relaxed', 'balanced', 'strict'])
      assert.equal(flagged(body, { firstSeen }, { sensitivity }), false, `${body} (${sensitivity}, new sender)`);
  }
});

test('a space only hides the dot before endings that aren\'t everyday words; other separators work for every ending', () => {
  assert.deepEqual(sites('botkiva net, botkiva org and botkiva xyz').hidden, ['botkiva.net', 'botkiva.org', 'botkiva.xyz']);
  assert.deepEqual(sites('botkiva live').hidden, []);
  assert.deepEqual(sites('botkiva[.]live botkiva (.) me botkiva dot site botkiva . app').hidden, ['botkiva.live', 'botkiva.me', 'botkiva.site', 'botkiva.app']);
  assert.deepEqual(sites('call[.]me').hidden, [], 'a common word as the name');
});

test('chat bots on the ignore list are never flagged: whole name, any case', () => {
  assert.ok(BOTS.includes('botrix') && BOTS.includes('nightbot'));
  const spammy = 'hq ai stream upgrades botkiva com emojiBlowKiss zero cost upgrades emojiBlowKiss';
  const r = score(msg(spammy, { sender: 'BotRix' }));
  assert.deepEqual(r, { score: 0, need: 5, spam: false, abuse: false, signs: [], ignored: true });
  assert.equal(score(msg(spammy, { sender: 'botrix_fan' })).spam, true, 'only the whole name');
  assert.equal(score(msg(spammy, { sender: 'MyBot' }), {}, { ignore: ['mybot'] }).ignored, true, 'your own list');
  assert.equal(score(msg(spammy, { sender: 'BotRix' }), {}, { ignore: [] }).spam, true, 'emptied list');
  assert.equal(ignored('', BOTS), false);
  assert.equal(ignored('  NightBot ', undefined), true, 'the built-in list by default');
});

test('the Kick bots griddlebot, kickpulsebot, kicklet and lumiastream are on the built-in list', () => {
  const spammy = 'hq ai stream upgrades botkiva com emojiBlowKiss zero cost upgrades emojiBlowKiss';
  for (const bot of ['griddlebot', 'kickpulsebot', 'kicklet', 'lumiastream']) {
    assert.ok(BOTS.includes(bot), bot);
    assert.equal(score(msg(spammy, { sender: bot.toUpperCase() })).ignored, true, bot);
    assert.equal(ignored('@' + bot), false, 'the @ is dropped when the name is added, not when checking');
  }
});

test('bots added to the built-in list reach a list you changed, once', () => {
  const first = ['botrix', 'nightbot', 'streamelements', 'fossabot', 'moobot', 'streamlabs', 'wizebot', 'sery_bot', 'kickbot'];
  // the built-in list (nothing saved): nothing to add, but what was offered is remembered
  assert.deepEqual(withNewBots(null, null), { list: null, offered: BOTS });
  // changed before the app remembered what it offered: the bots added since are added
  const mine = ['botrix', 'MyTimerBot'];
  const r = withNewBots(mine, null);
  assert.deepEqual(r.list, ['botrix', 'MyTimerBot', ...BOTS.filter(b => !first.includes(b))]);
  assert.deepEqual(r.offered, BOTS);
  // removed afterwards: stays removed
  const removed = r.list.filter(b => b !== 'kicklet');
  assert.deepEqual(withNewBots(removed, r.offered).list, removed);
  assert.equal(withNewBots(removed, r.offered).list, removed, 'the same list when nothing is added');
  // already on your list (any case): not added twice
  assert.deepEqual(withNewBots(['GriddleBot'], first).list, ['GriddleBot', 'kickpulsebot', 'kicklet', 'lumiastream']);
});

test('a bot timer message repeated in several open chats is not flagged', () => {
  const body = 'Follow the socials! Rules are in the panels below, enjoy the stream';
  const recent = [{ sender: 'botrix', body, chat: 'bravo', t: T - 60_000 }, { sender: 'botrix', body, chat: 'charlie', t: T - 30_000 }];
  assert.equal(score(msg(body, { sender: 'botrix' }), { recent }).spam, false);
  assert.equal(score(msg(body, { sender: 'botrix' }), { recent }, { sensitivity: 'strict' }).spam, false);
});

/* ---------- abuse ---------- */
const keys = r => r.signs.map(x => x.key);
const before = (body, ago) => ({ sender: 'newacct', body, chat: 'alpha', t: T - ago });

test('insults aimed at someone: from a new chatter they are flagged as abuse, and each one more adds up', () => {
  for (const body of ['ur a whore', 'your a bish', 'ur a cunt', 'you stupid little b!tch', 'you are a wh0000re', 'u r a c u n t', 'ur a b.i.t.c.h',
    'U R A WHORE', 'you f*cking c*nt', 'ur such a fuckin slut', "you're a twat"])
    assert.ok(abuse(body).insult, body);
  const firstSeen = { 'alpha\nnewacct': T - 60_000 };
  const r = score(msg('ur a whore'), { firstSeen });
  assert.deepEqual([r.spam, r.abuse, r.score, keys(r)], [true, true, 5, ['insult', 'newbie']]);
  assert.equal(r.signs[0].text, 'Insult aimed at someone: "ur a whore"');
  // someone who's been chatting a while: one insult is only enough on Strict, a second one on any sensitivity
  assert.equal(flagged('ur a whore'), false);
  assert.equal(flagged('ur a whore', {}, { sensitivity: 'strict' }), true);
  const r2 = score(msg('ur a cunt'), { recent: [before('ur a whore', 60_000), before('your a bish', 30_000)] }, { sensitivity: 'relaxed' });
  assert.deepEqual([r2.spam, r2.score, keys(r2)], [true, 7, ['insult', 'again']]);
  assert.equal(r2.signs[1].text, 'Keeps at it: 2 more abusive messages in the last 5 minutes');
  assert.equal(score(msg('ur a cunt'), { recent: [before('ur a whore', 30_000)] }).signs[1].text, 'Keeps at it: 1 more abusive message in the last 5 minutes');
  // someone else's, another chat's, or long ago: not them keeping at it
  for (const old of [{ ...before('ur a whore', 30_000), sender: 'other' }, { ...before('ur a whore', 30_000), chat: 'bravo' }, before('ur a whore', 10 * 60_000)])
    assert.deepEqual(keys(score(msg('ur a cunt'), { recent: [old] })), ['insult']);
});

test('swearing and words that only look like insults are not abuse', () => {
  for (const body of ['that was fucking sick', 'life is a bitch', 'your dick joke lol', 'ur assassin build is nuts', 'thank you', 'you guys are great',
    'the classic bass line', 'go to cocktail hour', 'what a shitshow'])
    assert.deepEqual(abuse(body), { insult: null, slur: null, swearOnly: false }, body);
  assert.equal(flagged('holy shit', {}, { sensitivity: 'strict' }), false, 'one swear');
  assert.equal(abuse('').insult, null);
  assert.equal(abuse(null).swearOnly, false);
});

test('a slur or threat is flagged on its own, wherever it is in the message', () => {
  for (const body of ['kys', 'just kill yourself', 'K Y S', 'go neck yourself lol']) {
    const r = score(msg(body));
    assert.deepEqual([r.spam, r.abuse, keys(r)], [true, true, ['slur']], body);
  }
  assert.equal(score(msg('kys')).signs[0].text, 'Slur or threat: "kys"');
  assert.equal(flagged('kys', {}, { sensitivity: 'relaxed' }), false, 'Relaxed needs 6');
  assert.equal(abuse('skys the limit').slur, null, 'not inside other words');
});

test('swearing over and over: the third swear-only message in two minutes is flagged', () => {
  const recent = [before('fuck', 50_000), before('FUCK SHIT', 20_000)];
  const r = score(msg('fuuuck'), { recent });
  assert.deepEqual([r.spam, r.abuse, keys(r)], [true, true, ['swearing']]);
  assert.equal(r.signs[0].text, 'Swearing over and over: 3 messages in 2 minutes');
  assert.equal(flagged('fuck', { recent: recent.slice(1) }), false, 'the second one');
  assert.equal(flagged('fuck', { recent: [before('fuck', 3 * 60_000), before('shit', 20_000)] }), false, 'more than two minutes apart');
  assert.equal(flagged('fuck this game honestly so bad', { recent }), false, 'mostly other words');
  assert.equal(flagged('fuck', { recent: [before('hello', 50_000), before('gg', 20_000)] }), false, 'the ones before were not swearing');
});

test('abuse can be turned off, and its lists changed or emptied', () => {
  assert.equal(score(msg('kys'), {}, { abuse: false }).spam, false);
  assert.deepEqual(score(msg('ur a whore'), {}, { abuse: false }).signs, []);
  assert.equal(abuse('ur a muppet', { abuse: ['muppet'] }).insult, 'ur a muppet');
  assert.equal(abuse('ur a whore', { abuse: ['muppet'] }).insult, null, 'your list instead of the built-in one');
  assert.equal(abuse('kys', { slurs: [] }).slur, null, 'an empty list matches nothing');
  assert.equal(abuse('darn', { swears: ['darn'] }).swearOnly, true);
  assert.equal(score(msg('ur a muppet'), {}, { abuseWords: ['muppet'], sensitivity: 'strict' }).spam, true);
  assert.equal(abuse('u r a', {}).insult, null, 'no word after it');
});

/* ---------- points ---------- */
test('every sign\'s points can be changed, from 0 (off) to 8, and promo words count up to two', () => {
  assert.equal(POINT_MAX, 8);
  assert.deepEqual(Object.keys(POINTS), SIGNS.map(x => x.key));
  assert.deepEqual(pointsOf({ hidden: 12, plain: -3, contact: '2', junk: 'x', words: 1.6, nope: 3 }),
    { ...POINTS, hidden: 8, plain: 0, contact: 2, words: 2 });
  assert.deepEqual(pointsOf(null), POINTS);
  const spammy = 'hq ai stream upgrades botkiva com emojiBlowKiss zero cost upgrades emojiBlowKiss';
  const r = score(msg(spammy), {}, { points: { hidden: 1, words: 3 } });
  assert.deepEqual(r.signs.map(x => [x.key, x.points]), [['hidden', 1], ['words', 6], ['junk', 1]]);
  // a sign at 0 is off: not shown, and it can't flag a message
  const off = score(msg(spammy), {}, { points: { hidden: 0, words: 3 } });
  assert.deepEqual([off.spam, keys(off)], [false, ['words', 'junk']]);
  assert.equal(flagged('kys', {}, { points: { slur: 0 } }), false);
  assert.equal(flagged('Hey stranger, still running the show?', {}, { points: { opener: 4 } }), false, 'no longer enough on Balanced');
  assert.equal(flagged('ur a whore', {}, { points: { insult: 8 }, sensitivity: 'relaxed' }), true);
});

test('the built-in points give no warnings, on any sensitivity', () => {
  for (const sens of ['relaxed', 'balanced', 'strict', undefined]) {
    assert.deepEqual(scoringWarnings(null, sens), [], String(sens));
    assert.deepEqual(scoringWarnings(POINTS, sens, false), [], String(sens));
  }
});

test('warnings: signs now enough on their own, small signs tipping a message over, and most signs high, each where it belongs', () => {
  assert.deepEqual(scoringWarnings({ plain: 5 }, 'balanced'),
    [{ text: 'Link to a site not on the allowed list (5) is now enough on its own on Balanced: every message with it is flagged.', sign: 'plain' }]);
  assert.deepEqual(scoringWarnings({ plain: 5, insult: 6 }, 'balanced').map(w => w.sign), ['plain', 'insult'], 'one for each');
  assert.deepEqual(scoringWarnings({ newbie: 4 }, 'balanced'),
    [{ text: 'New chatter (4) with just link to a site not on the allowed list (1) is now enough to flag a message on Balanced.', sign: 'newbie' }]);
  assert.deepEqual(scoringWarnings({ words: 2 }, 'balanced'),
    [{ text: 'Promo words (2) with just link to a site not on the allowed list (1) is now enough to flag a message on Balanced.', sign: 'words' }], 'two promo words');
  const all8 = Object.fromEntries(Object.keys(POINTS).map(k => [k, 8]));
  const w = scoringWarnings(all8, 'strict');
  assert.deepEqual(w[w.length - 1], { text: 'Most signs are worth 4 or more: almost any message with one of them will be flagged. Expect false alarms.' }, 'about every sign');
  assert.deepEqual(w.slice(0, -1).map(x => x.sign), ['hidden', 'plain', 'elsewhere'], 'the ones below Strict before');
});

test('warnings: nothing left that can flag (on its group), and signs that can no longer be flagged', () => {
  const noSpam = { hidden: 0, plain: 0, contact: 0, elsewhere: 0, flood: 0, opener: 0 };
  assert.deepEqual(scoringWarnings(noSpam, 'balanced'), [{ text: 'Nothing can flag promo spam: every sign that can is off.', group: 'spam' }]);
  assert.deepEqual(scoringWarnings({ insult: 0, slur: 0, swearing: 0 }, 'balanced'), [{ text: 'Nothing can flag abuse: every sign that can is off.', group: 'abuse' }]);
  assert.deepEqual(scoringWarnings({ insult: 0, slur: 0, swearing: 0 }, 'balanced', false), [], 'abuse off: nothing to warn about');
  const short = scoringWarnings({ hidden: 1, words: 0, junk: 0, newbie: 0 }, 'balanced');
  assert.deepEqual(short.map(x => x.sign), ['hidden', 'plain', 'contact', 'elsewhere']);
  assert.equal(short[0].text, 'Disguised link can\'t be flagged on Balanced any more without another strong sign: with every small sign it reaches 1 of 5.');
  assert.deepEqual(scoringWarnings({ insult: 1 }, 'relaxed'), [], 'still reaches 6 with the small signs (1 + 1 + 1 + 3)');
});
