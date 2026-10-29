// Shared by examples/0.4.0.js: a made-up streamer (pixelpear) on Kick and Twitch, ALL open, and made-up chat lines in each site's own format
const KF = (event, data) => JSON.stringify({ push: { channel: 'chatrooms.1.v2', pub: { data: { event: 'App\\Events\\' + event, data: JSON.stringify(data) } } } });
const TW = (tags, rest) => '@' + Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(';') + ' ' + rest;
let n = 0;
const kmsg = (name, text, ident = {}, extra = {}) => KF('ChatMessageEvent', { id: 'k' + (++n), content: text, type: 'message', created_at: new Date().toISOString(),
  sender: { id: 100 + name.length, username: name, slug: name, identity: { color: ident.color || '#7CFF4F', badges: ident.badges || [] } }, ...extra });
const tmsg = (name, text, tags = {}) => TW({ 'display-name': name, login: name.toLowerCase(), id: 't' + (++n), color: tags.color || '#B98CFF', badges: tags.badges || '', ...tags }, `:${name.toLowerCase()}!u@u PRIVMSG #pixelpear :${text}`);
const K = raw => ({ ch: 'pixelpear', b: { s: 'kick', raw: [raw] } });
const T = raw => ({ ch: 'tw:pixelpear', b: { s: 'twitch', raw: [raw] } });
const CHAT = [
  K(kmsg('mossyrock', 'that split was insane [emote:9100001:pearHype]', { color: '#9ACD32', badges: [{ type: 'subscriber', count: 8 }] })),
  T(tmsg('ByteBun', 'hello from twitch chat!', { color: '#1E90FF', badges: 'subscriber/12' })),
  K(kmsg('sundew', 'gg', { color: '#FF69B4' })),
  T(tmsg('glowmoth', 'how many attempts today?', { color: '#DAA520' })),
  K(kmsg('ravenquill', 'first time catching this live [emote:9100002:owlWave]', { color: '#00CED1', badges: [{ type: 'og' }] })),
  T(tmsg('TinyComet', 'LETS GOOO', { color: '#FF7F50', badges: 'vip/1' })),
  K(kmsg('zestyplum', 'music is great today', { color: '#BA55D3' })),
  T(tmsg('ferngully', 'pb pace?', { color: '#3CB371' })),
  K(kmsg('paperboat', 'that jump though [emote:9100003:arcadeGG]', { color: '#FFA07A', badges: [{ type: 'subscriber', count: 3 }] })),
  T(tmsg('quietkoala', 'clip it', { color: '#87CEFA', badges: 'subscriber/3' })),
  K(kmsg('lowtide', 'hydrate check [emote:9100004:tideLUL]', { color: '#20B2AA' })),
  T(tmsg('driftwood', 'W stream', { color: '#F08080' })),
];
let ci = 0;
const say = (m, x) => m.evaluate(([ch, b]) => window.allChat.ingest(ch, b), [x.ch, x.b]);
async function burst(m, k = 1) { for (let i = 0; i < k; i++) await say(m, CHAT[ci++ % CHAT.length]); }
// Saved settings (you: pearfan on Kick and Twitch), then the page again: before the cards are added (prepare)
async function prepare(m) {
  await m.evaluate(() => {
    const set = { intro: JSON.stringify({ done: true, tips: true }), linkedTip: '1', myName: 'pearfan', myTwitch: 'pearfan' };
    for (const [k, v] of Object.entries(set)) localStorage.setItem('kickMultiview.' + k, v);
  });
  await m.reload(); await m.waitForSelector('#savedBtn');
}
async function setup(m) {
  await m.evaluate(() => {
    window.linkedApi.setOn(true);
    window.linkedApi.link('pixelpear', 'tw:pixelpear');
    window.smvNotes.liveStatus({ pixelpear: { live: true, checked: Date.now(), viewers: 912 }, 'tw:pixelpear': { live: true, checked: Date.now(), viewers: 388 } });
    window.frames_.openStreamer('pixelpear', 'both', ['pixelpear', 'tw:pixelpear']);
  });
  await m.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab.all', { timeout: 20000 });
  await m.waitForFunction(() => window.openWins().filter(w => w.kind === 'chat' && w.ready).length >= 2, null, { timeout: 30000 }).catch(() => {});
  await m.evaluate(() => { document.querySelector('#layoutBtn').click(); document.querySelector('#layoutMenu [data-l="chatfocus"]').click(); });
  await m.keyboard.press('Escape');
  await m.evaluate(() => { const b = document.querySelector('#stage .win.chat:not(.tab-hidden) .ptab.all'); if (!b.classList.contains('on')) b.click(); });
  await m.waitForSelector('.all-view');
}
module.exports = { prepare, KF, TW, kmsg, tmsg, K, T, say, burst, setup, CHAT };
// A steady made-up conversation in ALL (paused while window.__quiet, so a line doesn't move under the pointer)
async function chatter(m, ms = 1700) {
  await m.evaluate(([list, ms]) => {
    let i = 0;
    setInterval(() => { if (window.__quiet) return; const x = list[i++ % list.length]; window.allChat.ingest(x.ch, { s: x.b.s, raw: [x.b.raw[0].replace(/"id":"k\d+"|;id=t\d+;/, s => s.replace(/\d+/, Date.now() + '' + i))] }); }, ms);
  }, [CHAT, ms]);
}
module.exports.chatter = chatter;
