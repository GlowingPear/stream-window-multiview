// Chat Rail in the real app: the chat in the rail is drawn bigger than the others (its own view is scaled, as
// Chromium shares a page's zoom between every page of the same site), a tab moves the big text to another chat, and
// a chat out of sight counts its new messages on its tab.
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

test('Chat Rail: only the rail chat is bigger, and a tab moves the big text to another chat', { timeout: 60000 }, async () => {
  await a.win.evaluate(() => document.activeElement && document.activeElement.blur());
  await a.win.keyboard.press('Shift+K');
  await a.win.waitForSelector('#stage .win.rl-chat');
  await near('alpha', 1.3, 'in the rail: 130%');
  await near('bravo', 1, 'the other chat of the same site: as it was');
  await a.win.click('#railTabs [data-s="1"]');
  await near('alpha', 1.5, 'A+');
  await a.win.click('#railTabs .rl-tab[data-ch="bravo"]');
  await near('bravo', 1.5, 'the chat now in the rail');
  await near('alpha', 1, 'out of the rail');
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu button[data-l=tile]');
  await near('bravo', 1, 'Tile');
});

test('Chat Rail: a tab shows how many new messages a chat out of sight has had', { timeout: 60000 }, async () => {
  await a.win.evaluate(() => document.activeElement && document.activeElement.blur());
  await a.win.keyboard.press('Shift+K');
  await a.win.waitForSelector('#railTabs .rl-tab.on');
  const off = await a.win.$eval('#railTabs .rl-tab:not(.on)', b => b.dataset.ch);
  const shown = await a.win.$eval('#railTabs .rl-tab.on', b => b.dataset.ch);
  const say = (ch, sender, text) => inView(a.win, ch, 'chat', ([s, t]) => {
    const d = document.createElement('div'); d.className = 'row';
    d.innerHTML = '<b></b>: <span></span>'; d.querySelector('b').textContent = s; d.querySelector('span').textContent = t;
    document.getElementById('chat').appendChild(d);
  }, [sender, text]);
  // the chat out of sight counts once Chat Rail has asked it once and its helper is armed (2.5 s later)
  const armed = () => inView(a.win, off, 'chat', () => !!(window.__kmvMention && window.__kmvMention.ready && window.__kmvMention.ready()));
  for (const end = Date.now() + 15000; !(await armed()); ) {
    assert.ok(Date.now() < end, 'the chat helper never started counting');
    await new Promise(r => setTimeout(r, 250));
  }
  await say(off, 'quietkoala', 'one'); await say(off, 'tinycomet', 'two'); await say(off, 'ferngully', 'three');
  await say(shown, 'glowmoth', 'in the rail: you can see it');
  await a.win.waitForFunction(ch => document.querySelector(`#railTabs .rl-tab.new[data-ch="${ch}"] .rl-n`)?.textContent === '3', off, { timeout: 15000 });
  assert.equal(await a.win.$eval('#railTabs .rl-tab.on', b => b.classList.contains('new')), false);
});
