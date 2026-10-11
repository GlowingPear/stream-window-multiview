// Spam alerts: which chat messages get flagged, and why.
const test = require('node:test');
const assert = require('node:assert/strict');
const { score, sites } = require('../../src/spam');

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
