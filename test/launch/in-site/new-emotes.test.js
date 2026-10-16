// New emotes in the real app: with the setting on, a chat asks for its channel's emote lists (Kick and 7TV here,
// stand-ins), the first time only remembers them, and next time marks what was added and names it in a message.
// Pointing at one is kept. With the setting off nothing is asked.
const test = require('node:test');
process.env.SMV_EMOTE_RECHECK_MS = '1';              // ask each time the chat opens (normally 10 minutes apart)
const { launchApp, inView, viewLoaded, assert, openChannel } = require('../app');

const T = { timeout: 90000 };
let a;
test.before(async () => {
  a = await launchApp({ storage: { 'kickMultiview.intro': '{"done":true,"tips":true}' } });
  await a.app.evaluate(({ session, net }) => {
    const t = globalThis.__e = { kick: ['pearHype'], stv: ['catJam'], asked: [] };
    const json = d => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
    const k = session.fromPartition('persist:kick');
    k.protocol.unhandle('https');
    k.protocol.handle('https', req => {
      const u = new URL(req.url);
      if (u.pathname === '/emotes/alpha'){ t.asked.push('kick'); return json([{ slug: 'alpha', user_id: 9, emotes: t.kick.map(name => ({ name })) }, { id: 'Global', emotes: [{ name: 'KEKW' }] }]); }
      if (/\/popout\/[\w-]+\/chat/.test(u.pathname)) return new Response('<!doctype html><title>chat</title><body><div id="chat"><div class="row"><b>regular</b>: <span>evening all</span></div></div></body>', { headers: { 'content-type': 'text/html' } });
      return new Response('<!doctype html><title>kick</title>', { headers: { 'content-type': 'text/html' } });
    });
    session.defaultSession.protocol.handle('https', req => {
      const u = new URL(req.url);
      if (u.hostname === '7tv.io' && u.pathname === '/v3/users/kick/9'){ t.asked.push('7tv'); return json({ emote_set: { emotes: t.stv.map(name => ({ name })) } }); }
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
  });
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });
const asked = () => a.app.evaluate(() => globalThis.__e.asked);
const openChat = async () => {
  await a.win.evaluate(() => document.querySelectorAll('#stage .win [data-a=close]').forEach(b => b.click()));
  await openChannel(a.win, 'alpha', 'chat');
  await a.win.keyboard.press('Escape');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
};
const emoteRow = () => inView(a.win, 'alpha', 'chat', () => {
  const add = (src, alt) => { const i = document.createElement('img'); i.src = src; i.alt = alt; i.width = i.height = 28; return i; };
  const r = document.createElement('div'); r.className = 'row'; r.append('ann: ', add('https://files.kick.com/emotes/1/fullsize', 'pearHype'), ' ', add('https://files.kick.com/emotes/2/fullsize', 'pearWave'), ' ', add('https://cdn.7tv.app/emote/a/1x.webp', 'dogJam'));
  document.getElementById('chat').append(r); return true;
});
const marked = () => inView(a.win, 'alpha', 'chat', () => [...document.querySelectorAll('img[data-kmv-new]')].map(i => i.alt));

test('off by default: nothing is asked', T, async () => {
  await openChat();
  await a.win.waitForTimeout(800);
  assert.deepEqual(await asked(), []);
});

test('on: the first open remembers, the next marks and names what was added, pointing at one is kept', T, async () => {
  const w = a.win;
  await w.evaluate(() => { document.getElementById('settingsBtn').click(); });
  await w.click('#settingsDlg .st-rail [data-s=general]');
  await w.locator('label:has(#newEmoteSet)').click();
  await w.keyboard.press('Escape');
  assert.equal(await w.evaluate(() => localStorage.getItem('kickMultiview.newEmotes')), '1');
  // switching it on asks for the open chat: the starting point, nothing new
  for (let i = 0; i < 50 && (await asked()).length < 2; i++) await w.waitForTimeout(100);
  assert.deepEqual((await asked()).sort(), ['7tv', 'kick']);
  await emoteRow();
  await w.waitForTimeout(300);
  assert.deepEqual(await marked(), []);

  // the channel adds two emotes; next time its chat opens they're marked and named
  await a.app.evaluate(() => { globalThis.__e.kick = ['pearHype', 'pearWave']; globalThis.__e.stv = ['catJam', 'dogJam']; });
  await openChat();
  await w.waitForFunction(() => /alpha has 2 new emotes: pearWave, dogJam/.test(document.getElementById('msg').textContent));
  await emoteRow();
  for (let i = 0; i < 30 && (await marked()).length < 2; i++) await w.waitForTimeout(100);
  assert.deepEqual(await marked(), ['pearWave', 'dogJam']);
  assert.match(await inView(w, 'alpha', 'chat', () => getComputedStyle(document.querySelector('img[data-kmv-new]')).outlineStyle), /solid/, 'it glows');

  // pointing at one: the app keeps it as seen, so the next open marks only the other
  await inView(w, 'alpha', 'chat', () => { document.querySelector('img[alt=pearWave][data-kmv-new]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return true; });
  for (let i = 0; i < 30 && (await marked()).length !== 1; i++) await w.waitForTimeout(100);
  assert.deepEqual(await marked(), ['dogJam']);
  await w.waitForTimeout(300);
  await openChat();
  await emoteRow();
  for (let i = 0; i < 30 && (await marked()).length < 1; i++) await w.waitForTimeout(100);
  assert.deepEqual(await marked(), ['dogJam']);
  assert.doesNotMatch(await w.textContent('#msg'), /new emote/, 'no message when nothing was added since');
  // switched off: unmarked at once
  await w.evaluate(() => { document.getElementById('settingsBtn').click(); });
  await w.locator('label:has(#newEmoteSet)').click();
  await w.keyboard.press('Escape');
  for (let i = 0; i < 30 && (await marked()).length; i++) await w.waitForTimeout(100);
  assert.deepEqual(await marked(), []);
});
