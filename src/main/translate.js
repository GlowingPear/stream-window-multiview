// Translating chat messages (right-click a chat > Translate this chat): Google Translate's free web
// endpoint, the one its page uses. No key; it can refuse when asked too often, so after a refusal it rests
// a minute (offline: 15 seconds) and every answer meanwhile is "not translated" (the chat just stays as it is). Answers are kept,
// so the same message again (emote spam, copypasta) isn't asked twice. Plain Node, so it can be tested.
const { languageIn } = require('./context-menu');

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MAX_TEXT = 1000, MAX_BATCH = 25, AT_ONCE = 4, KEEP = 3000, REST_MS = 60000, TIMEOUT_MS = 8000;

// Google's answer: [[[translated, original, …], …], …, detected language, …] -> { text, from }
function parseAnswer(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const text = data[0].map(s => (Array.isArray(s) && typeof s[0] === 'string') ? s[0] : '').join('');
  const from = typeof data[2] === 'string' ? data[2] : '';
  return text ? { text, from } : null;
}
const sameLang = (a, b) => String(a || '').toLowerCase().split('-')[0] === String(b || '').toLowerCase().split('-')[0];

// fetchJson(url) -> parsed JSON, or throws ({ status } on a refusal)
function makeTranslator(fetchJson, { now = () => Date.now() } = {}) {
  const kept = new Map();
  let restUntil = 0;
  async function one(text, tl) {
    const key = tl + '\u0001' + text;
    if (kept.has(key)) { const v = kept.get(key); kept.delete(key); kept.set(key, v); return v; }
    if (now() < restUntil) return null;
    let got = null;
    try { got = parseAnswer(await fetchJson(`${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`)); }
    catch (e) { restUntil = now() + (e && (e.status === 429 || e.status === 403) ? REST_MS : REST_MS / 4); return null; }   // refused, or offline
    if (!got) return null;
    // already in your language, or nothing changed: left as it is
    const out = sameLang(got.from, tl) || got.text.trim().toLowerCase() === text.trim().toLowerCase()
      ? { same: true } : { text: got.text, from: got.from, fromName: languageIn(got.from, tl) };
    kept.set(key, out);
    if (kept.size > KEEP) kept.delete(kept.keys().next().value);
    return out;
  }
  // texts: strings -> one answer each, in order: { text, from, fromName } | { same: true } | null (not now)
  return async function translate(texts, tl) {
    if (!Array.isArray(texts) || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(tl || ''))) return [];
    const list = texts.slice(0, MAX_BATCH).map(t => typeof t === 'string' ? t.slice(0, MAX_TEXT) : '');
    const out = new Array(list.length).fill(null);
    let next = 0;
    const worker = async () => { while (next < list.length) { const i = next++; if (list[i].trim()) out[i] = await one(list[i], tl); } };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, list.length) }, worker));
    return out;
  };
}

module.exports = { makeTranslator, parseAnswer, ENDPOINT };
