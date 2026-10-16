// Translating chat messages (src/translate.js): Google Translate's answers, what's kept, and resting after a refusal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeTranslator, parseAnswer } = require('../../../src/main/translate');

// a stand-in Google Translate: "hola" and friends are Spanish; anything with "hello" is English already
const DICT = { hola: 'hello', 'buenas noches': 'good night', 'hola amigos': 'hello friends' };
function stand() {
  const asked = [];
  const fetchJson = async url => {
    const u = new URL(url), q = u.searchParams.get('q');
    asked.push({ q, tl: u.searchParams.get('tl'), sl: u.searchParams.get('sl') });
    if (q === 'busy') { const e = new Error('no'); e.status = 429; throw e; }
    if (q === 'offline') throw new Error('offline');
    if (DICT[q]) return [[[DICT[q], q, null, null, 1]], null, 'es'];
    return [[[q, q, null, null, 1]], null, 'en'];
  };
  return { asked, fetchJson };
}

test('Google\'s answer: the translated pieces joined, and the language it was in', () => {
  assert.deepEqual(parseAnswer([[['Hello. ', 'Hola. '], ['Bye', 'Adiós']], null, 'es']), { text: 'Hello. Bye', from: 'es' });
  assert.equal(parseAnswer(null), null);
  assert.equal(parseAnswer([[]]), null);
  assert.equal(parseAnswer({}), null);
});

test('each text gets an answer in order: translated (with the language\'s name), already yours, or none', async () => {
  const s = stand(), tr = makeTranslator(s.fetchJson);
  const got = await tr(['hola', 'hello there', '', 'buenas noches', 42], 'en');
  assert.deepEqual(got, [
    { text: 'hello', from: 'es', fromName: 'Spanish' },
    { same: true },
    null,
    { text: 'good night', from: 'es', fromName: 'Spanish' },
    null
  ]);
  assert.deepEqual(s.asked.map(x => [x.q, x.tl, x.sl]), [['hola', 'en', 'auto'], ['hello there', 'en', 'auto'], ['buenas noches', 'en', 'auto']]);
  assert.deepEqual((await tr(['hola'], 'de'))[0].fromName, 'Spanisch', 'the language named in yours');
});

test('the same text again isn\'t asked again (emote spam, copypasta)', async () => {
  const s = stand(), tr = makeTranslator(s.fetchJson);
  await tr(['hola', 'hola amigos'], 'en');
  await tr(['hola', 'hola', 'hola amigos'], 'en');
  assert.equal(s.asked.length, 2);
});

test('refused or offline: no answers for a while, then it asks again', async () => {
  let t = 1000;
  const s = stand(), tr = makeTranslator(s.fetchJson, { now: () => t });
  assert.deepEqual(await tr(['busy', 'hola'], 'en').then(x => x[0]), null);
  const n = s.asked.length;
  assert.deepEqual(await tr(['buenas noches'], 'en'), [null], 'resting: nothing is sent');
  assert.equal(s.asked.length, n);
  t += 61000;
  assert.equal((await tr(['buenas noches'], 'en'))[0].text, 'good night', 'a minute later: asked again');
  await tr(['offline'], 'en');
  t += 16000;
  assert.equal((await tr(['hola amigos'], 'en'))[0].text, 'hello friends', 'offline: a shorter rest');
});

test('only sensible requests: a language code, a list, at most 25 texts of 1000 characters', async () => {
  const s = stand(), tr = makeTranslator(s.fetchJson);
  assert.deepEqual(await tr(['hola'], 'not a language'), []);
  assert.deepEqual(await tr('hola', 'en'), []);
  const got = await tr(Array.from({ length: 30 }, (_, i) => 'x' + i), 'en');
  assert.equal(got.length, 25);
  await tr(['y'.repeat(5000)], 'en');
  assert.equal(s.asked.at(-1).q.length, 1000);
  assert.equal((await tr(['hola'], 'pt-BR'))[0].fromName, 'Espanhol');
});
