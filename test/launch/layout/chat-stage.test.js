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
