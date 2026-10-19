// Chat Rail in the real app: the chat in the rail is drawn bigger than the others (its own view is scaled, as
// Chromium shares a page's zoom between every page of the same site), a tab moves the big text to another chat, and
// a chat out of sight counts its new messages on its tab (Settings › Chat).
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
  await a.win.evaluate(() => { const s = document.getElementById('chatCountsSet'); s.checked = true; s.dispatchEvent(new Event('change')); });   // Settings › Chat
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
  // and on its stream's title bar, after its name, where it can be seen (not under the channel's picture)
  await a.win.waitForFunction(ch => { const b = [...document.querySelectorAll('#stage .win.stream')].find(w => w.querySelector('.title').textContent.toLowerCase() === ch)?.querySelector('.bar-n'); if (!b || b.hidden) return false; const pick = b.parentNode.querySelector('.col-pick').getBoundingClientRect(); return b.textContent === '3' && b.getBoundingClientRect().left >= pick.right - 1; }, off, { timeout: 5000 });
});

test('Chat Rail: → shows the next chat in the rail, in big text, and ← goes back', { timeout: 60000 }, async () => {
  await a.win.evaluate(() => document.activeElement && document.activeElement.blur());
  await a.win.keyboard.press('Shift+K');
  await a.win.waitForSelector('#stage .win.rl-chat');
  const shown = () => a.win.$eval('#stage .win.rl-chat .title', e => e.textContent);
  const first = await shown(), other = first === 'alpha' ? 'bravo' : 'alpha';
  await a.win.evaluate(() => document.activeElement && document.activeElement.blur());
  await a.win.keyboard.press('ArrowRight');
  await a.win.waitForFunction(ch => document.querySelector('#stage .win.rl-chat .title')?.textContent === ch, other);
  await near(other, 1.5, 'the next chat, in the rail\'s big text');
  await near(first, 1, 'the one before, back to normal');
  await a.win.evaluate(() => document.activeElement && document.activeElement.blur());
  await a.win.keyboard.press('ArrowLeft');
  await a.win.waitForFunction(ch => document.querySelector('#stage .win.rl-chat .title')?.textContent === ch, first);
  assert.equal(await shown(), first);
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
// Messages come in while it's out of sight, and the site doesn't keep it at the bottom. How far above it that leaves the
// chat is read in the same step: the chat's own script puts a chat back at the bottom on a timer (in-site/stick-bottom.js)
const addWhileHidden = ch => inView(a.win, ch, 'chat', () => {
  const c = document.getElementById('chat');
  for (let i = 0; i < 25; i++) { const d = document.createElement('div'); d.className = 'row'; d.textContent = 'while hidden ' + i; c.appendChild(d); }
  return Math.round(c.scrollHeight - c.clientHeight - c.scrollTop);
});

test('Chat Rail: a tab shows its chat at the newest messages, even ones that came while it was out of sight', { timeout: 60000 }, async () => {
  await a.win.click('#layoutBtn'); await a.win.click('#layoutMenu button[data-l=rail]');
  await a.win.waitForSelector('#railTabs .rl-tab:not(.on)');
  const off = await a.win.$eval('#railTabs .rl-tab:not(.on)', b => b.dataset.ch);
  await fillChat(off);
  assert.ok(await addWhileHidden(off) > 100, 'left behind');
  await a.win.click(`#railTabs .rl-tab[data-ch="${off}"]`);
  for (let i = 0; i < 30 && await fromBottom(off) > 2; i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(await fromBottom(off) <= 2, `at the bottom (${await fromBottom(off)} px above it)`);
});
