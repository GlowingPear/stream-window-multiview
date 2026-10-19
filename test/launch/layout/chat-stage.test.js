// Chat Stage in the real app: the chat on the stage is drawn bigger than the others. Chromium shares a page's zoom
// between every page of the same site, so this scales the stage chat's own view instead: the other chats of that
// site stay as they are, the normal chat text size still counts for all of them, and it lasts through a reload.
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');

let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await openChannel(a.win, 'bravo');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  await viewLoaded(a.win, 'bravo', 'chat', /popout\/bravo\/chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// how big a chat page is drawn (its zoom times its view's scale), as the page itself sees it
const scale = ch => inView(a.win, ch, 'chat', () => devicePixelRatio);
async function near(ch, want, what){
  for (let i = 0; i < 30 && Math.abs(await scale(ch).catch(() => 0) - want) > 0.005; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal((await scale(ch)).toFixed(3), want.toFixed(3), what);
}

test('Chat Stage: only the stage chat is bigger, the normal text size still counts, and it lasts through a reload', { timeout: 60000 }, async () => {
  await a.win.evaluate(() => document.activeElement && document.activeElement.blur());
  await a.win.keyboard.press('k');
  await a.win.waitForSelector('#stage .win.stg-chat');
  await near('alpha', 1.3, 'on the stage: 130%');
  await near('bravo', 1, 'the other chat of the same site: as it was');
  await a.win.click('.stg-size [data-s="1"]');
  await near('alpha', 1.5, 'A+');
  // the normal chat text size (Layout ▾) counts for both
  await a.win.click('#layoutBtn'); await a.win.click('#chatZoom [data-z="-1"]'); await a.win.keyboard.press('Escape');
  await near('alpha', 0.9 * 1.5, 'a smaller normal size, and still 1.5 times it');
  await near('bravo', 0.9, 'the other one at the normal size');
  // bravo on the stage: its chat is the big one now, alpha's goes back
  await a.win.click('#stage .win.stg-thumb .stg-pick');
  await near('bravo', 0.9 * 1.5, 'the new stage chat');
  await near('alpha', 0.9, 'off the stage');
  // loading again keeps it
  await a.win.evaluate(() => document.querySelector('#stage .win.stg-chat .bar [data-a=reload]').click());
  await new Promise(r => setTimeout(r, 500));
  await viewLoaded(a.win, 'bravo', 'chat', /popout\/bravo\/chat/);
  await near('bravo', 0.9 * 1.5, 'after loading again');
  // another layout: every chat at the normal size
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu button[data-l=tile]');
  await near('bravo', 0.9, 'Tile');
});

test('Chat Stage: the strip shows how many new messages a chat out of sight has had', { timeout: 60000 }, async () => {
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu button[data-l=stage]');
  await a.win.waitForSelector('#stage .win.stg-thumb .stg-pick');
  const off = await a.win.$eval('#stage .win.stg-thumb .title', e => e.textContent);
  const onStage = await a.win.$eval('#stage .win.stg-on .title', e => e.textContent);
  await a.win.evaluate(() => { const s = document.getElementById('chatCountsSet'); s.checked = true; s.dispatchEvent(new Event('change')); });   // Settings › Chat
  const say = (ch, sender, text) => inView(a.win, ch, 'chat', ([s, t]) => {
    const d = document.createElement('div'); d.className = 'row';
    d.innerHTML = '<b></b>: <span></span>'; d.querySelector('b').textContent = s; d.querySelector('span').textContent = t;
    document.getElementById('chat').appendChild(d);
  }, [sender, text]);
  // the chat out of sight counts once Chat Stage has asked it once and its helper is armed (2.5 s later)
  const armed = () => inView(a.win, off, 'chat', () => !!(window.__kmvMention && window.__kmvMention.ready && window.__kmvMention.ready()));
  for (const end = Date.now() + 15000; !(await armed()); ) {
    assert.ok(Date.now() < end, 'the chat helper never started counting');
    await new Promise(r => setTimeout(r, 250));
  }
  await say(off, 'quietkoala', 'first'); await say(off, 'tinycomet', 'second');
  await say(onStage, 'glowmoth', 'on the stage: you can see it');
  await a.win.waitForFunction(() => document.querySelector('#stage .win.stg-thumb .stg-pick.new .stg-n')?.textContent === '2', null, { timeout: 15000 });
});

// A chat like the sites': its messages in a box of their own that scrolls, filled and scrolled to the newest
const fillChat = ch => inView(a.win, ch, 'chat', () => {
  const c = document.getElementById('chat');
  Object.assign(c.style, { height: '100vh', overflowY: 'auto', boxSizing: 'border-box' });
  document.body.style.margin = '0';
  for (let i = 0; i < 150; i++) { const d = document.createElement('div'); d.className = 'row'; d.textContent = 'message ' + i; c.appendChild(d); }
  c.scrollTop = c.scrollHeight;
});
const fromBottom = ch => inView(a.win, ch, 'chat', () => { const c = document.getElementById('chat'); return Math.round(c.scrollHeight - c.clientHeight - c.scrollTop); });

test('Chat Stage: a chat put on the stage shows its newest messages, even ones that came while it was out of sight', { timeout: 60000 }, async () => {
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu button[data-l=stage]');
  await a.win.waitForSelector('#stage .win.stg-thumb .stg-pick');
  const off = await a.win.$eval('#stage .win.stg-thumb .title', e => e.textContent);
  await fillChat(off);
  assert.equal(await fromBottom(off), 0, 'at the bottom while out of sight');
  // messages come in while it's out of sight, and the site doesn't keep it at the bottom (Kick and Twitch stop when their chat can't be seen)
  await inView(a.win, off, 'chat', () => { const c = document.getElementById('chat'); for (let i = 0; i < 25; i++) { const d = document.createElement('div'); d.className = 'row'; d.textContent = 'while hidden ' + i; c.appendChild(d); } });
  assert.ok(await fromBottom(off) > 100, 'left behind');
  await a.win.click('#stage .win.stg-thumb .stg-pick');      // on the stage: its chat drawn bigger
  await a.win.waitForFunction(ch => document.querySelector('#stage .win.stg-chat .title')?.textContent === ch, off);
  for (let i = 0; i < 30 && await fromBottom(off) > 2; i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(await fromBottom(off) <= 2, `still at the bottom (${await fromBottom(off)} px above it)`);
});

test('Chat Stage: the stage chat you scrolled up to read stays there when its text size changes', { timeout: 60000 }, async () => {
  const on = await a.win.$eval('#stage .win.stg-chat .title', e => e.textContent);
  for (let i = 0; i < 30 && await fromBottom(on) > 2; i++) await new Promise(r => setTimeout(r, 100));
  // you scroll up with the wheel to read
  await inView(a.win, on, 'chat', () => { const c = document.getElementById('chat'); c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -600 })); c.scrollTop -= 600; });
  const up = await fromBottom(on);
  assert.ok(up > 300, `scrolled up (${up} px)`);
  await a.win.click('.stg-size [data-s="-1"]');               // A−: the page inside is resized
  await new Promise(r => setTimeout(r, 2000));
  assert.ok(await fromBottom(on) > 200, `still up where you were reading (${await fromBottom(on)} px)`);
});
