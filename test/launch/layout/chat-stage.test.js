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
