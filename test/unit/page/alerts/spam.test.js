// Spam alerts: which chat messages get flagged, and why.
const test = require('node:test');
const assert = require('node:assert/strict');
const { score, sites, contact, ignored, withNewBots, BOTS } = require('../../../../src/page/alerts/spam.js').SmvSpam;

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
  assert.deepEqual(r.signs, [{ text: 'The same word over and over: "fuck" ×45', points: 6 }]);
  assert.equal(flagged('BuyNow! BuyNow!BuyNow!BuyNow! BuyNow!BuyNow!BuyNow!BuyNow!BuyNow!BuyNow!'), true, 'punctuation between');
  assert.equal(flagged(Array(25).fill('Fuck').join(' ')), true, 'spaced out, 25 times');
});

test('a known bot opening line is spam on its own, with no link needed', () => {
  const r = score(msg('Hey stranger, still running the show?'), {}, { sensitivity: 'relaxed' });
  assert.equal(r.spam, true);
  assert.deepEqual(r.signs, [{ text: 'Known bot opening line: "Hey stranger, still running the show?"', points: 6 }]);
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
  assert.deepEqual(r2.signs, [{ text: 'Asks to be added off-site: discord bram209', points: 4 }, { text: 'Started chatting in the last few minutes', points: 1 }]);
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
  assert.deepEqual(r.signs, [{ text: 'Known bot opening line: "Don\'t work too hard, leave some success for the rest of us."', points: 6 }]);
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
  assert.deepEqual(r, { score: 0, need: 5, spam: false, signs: [], ignored: true });
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
