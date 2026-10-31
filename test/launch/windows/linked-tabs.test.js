// Linked channels in the real app: a streamer's window with a tab per site. The tab you're not watching keeps its
// player loaded and playing, muted, under the one you watch; switching moves the sound. Players are stand-in pages
// (see app.js).
const test = require('node:test');
const { launchApp, assert, openChannel, setMode } = require('../app');

const T = { timeout: 90000 };
let a;
test.before(async () => { a = await launchApp(); });
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

// each stream window's channel, whether it's the tab you can't see, and its player: loaded, muted (the app's own)
const streams = () => a.win.evaluate(async () => Promise.all(window.openWins().filter(w => w.kind === 'stream').map(async w => {
  const v = w.el.querySelector('webview');
  let page = null;
  try { page = await v.executeJavaScript('({ video: !!document.querySelector("video"), hidden: document.visibilityState === "hidden" })'); } catch {}
  return { ch: w.channel, hiddenTab: !!w.hiddenTab, muted: !!w.muted, ready: !!w.ready, opacity: getComputedStyle(w.el).opacity, page };
})));

test('a tab you can\'t see keeps its player loaded and playing, muted; switching moves the sound', T, async () => {
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true);
    window.linkedApi.link('alpha', 'tw:alpha');
    window.smvNotes.liveStatus({ alpha: { live: true, checked: Date.now() }, 'tw:alpha': { live: true, checked: Date.now() } });
    window.frames_.openStreamer('alpha', 'stream', ['alpha', 'tw:alpha']);
  });
  await a.win.waitForFunction(() => window.openWins().filter(w => w.kind === 'stream' && w.ready).length === 2, null, { timeout: 30000 });
  let s = await streams();
  const shown = s.find(x => !x.hiddenTab), hidden = s.find(x => x.hiddenTab);
  assert.equal(shown.ch, 'alpha'); assert.equal(hidden.ch, 'tw:alpha');
  assert.equal(hidden.opacity, '0', 'invisible, under the one you watch');
  assert.ok(hidden.page && hidden.page.video, 'its player is loaded');
  assert.equal(hidden.page.hidden, false, 'and its page isn\'t paused as hidden');
  assert.equal(hidden.muted, true, 'muted');
  // unmute the window, then switch: the sound moves with the tab you watch
  await a.win.evaluate(() => { const w = window.openWins().find(x => x.kind === 'stream' && !x.hiddenTab); w.muted = false; w.vol = 0.6; });
  await a.win.click('#stage .win.stream:not(.tab-hidden) .ptab.twitch');
  s = await streams();
  assert.deepEqual(s.map(x => [x.ch, x.hiddenTab, x.muted]).sort(), [['alpha', true, true], ['tw:alpha', false, false]]);
  // the window's ✕ closes both
  await a.win.click('#stage .win.stream:not(.tab-hidden) [data-a=close]');
  assert.equal((await streams()).length, 0);
});

test('Channels: a linked streamer\'s ⚡, bell and profile act on every account', T, async () => {
  await a.win.evaluate(() => {
    localStorage.setItem('kickMultiview.saved', JSON.stringify(['alpha', 'tw:alpha']));
    window.linkedApi.setOn(true); window.linkedApi.link('alpha', 'tw:alpha');
    window.smvNotes.liveStatus({ alpha: { live: false, checked: Date.now() }, 'tw:alpha': { live: false, checked: Date.now() } });
  });
  await a.win.reload(); await a.win.waitForSelector('#savedBtn');
  await a.win.click('#savedBtn');
  await a.win.click('#savedList .sv-multi .auto');
  assert.deepEqual(await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.autoOpen'))), ['alpha'], '⚡ on: the main account opens them');
  await a.win.click('#savedList .sv-multi .auto');
  assert.deepEqual(await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.autoOpen'))), [], 'and off');
  await a.win.click('#savedList .sv-multi .bell');
  assert.deepEqual((await a.win.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.notifyOff')))).sort(), ['alpha', 'tw:alpha'], 'no live notification from any of them');
  await a.win.click('#savedList .sv-multi .bell');
  await a.win.click('#savedList .sv-multi .prof');
  await a.win.waitForSelector('#profDlg:not([hidden])');
  await a.win.keyboard.press('Escape');
});

// Runs fn(arg) in the page of a chat window, by its channel (also a tab you can't see)
const inChat = (ch, fn, arg) => a.win.evaluate(([ch, src, arg]) => window.openWins().find(w => w.kind === 'chat' && w.channel === ch).view.executeJavaScript(`(${src})(${JSON.stringify(arg)})`), [ch, fn.toString(), arg]);
const chatReady = ch => a.win.waitForFunction(ch => { const w = window.openWins().find(o => o.kind === 'chat' && o.channel === ch); try { return !!(w && w.ready && /chat/.test(w.view.getURL())); } catch { return false; } }, ch, { timeout: 30000 });
// the site's chat box (contenteditable, as Kick's and Twitch's are)
const addBox = (ch, attr) => inChat(ch, attr => { const b = document.createElement('div'); b.setAttribute(attr[0], attr[1]); b.contentEditable = 'true'; document.body.append(b); }, attr);
const KICK = ['data-testid', 'chat-input'], TWITCH = ['data-a-target', 'chat-input'];
// both sites live (the app's own check, after a test before loaded the page again, says offline: an offline tab is locked)
const bothLive = ch => a.win.evaluate(ch => window.smvNotes.liveStatus({ [ch]: { live: true, checked: Date.now() }, ['tw:' + ch]: { live: true, checked: Date.now() } }), ch.replace(/^tw:/, ''));
// Tab (⇧Tab) in the chat's empty box
const tabIn = async (ch, back) => { await bothLive(ch); await a.win.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab:not(.on):not(.locked)'); await untilIn(ch, () => !!window.__kmvTabKey?.on, 'Tab switches site in ' + ch); await inChat(ch, back => { const b = document.querySelector('[contenteditable]'); b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: back, bubbles: true, cancelable: true })); }, back); };
// asks the chat's page until it says yes (waitForFunction would take its promise for a yes)
async function untilIn(ch, fn, what, ms = 15000){
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 150)))
    if (await inChat(ch, fn).catch(() => false)) return;
  assert.fail(what);
}
// it loads another page (as Kick's Cloudflare check does), after the first had loaded
async function loadAgain(ch){
  await a.win.waitForFunction(ch => !window.openWins().find(o => o.channel === ch).view.isLoading(), ch);
  await new Promise(r => setTimeout(r, 500));
  await inChat(ch, () => { window.__first = true; location.reload(); });
  await untilIn(ch, () => !window.__first && document.readyState === 'complete', 'the other page loaded');
}
const boxFocused = ch => untilIn(ch, () => document.activeElement?.getAttribute('contenteditable') === 'true', `${ch}'s chat box has the keyboard`);

test('Tab in an empty chat box switches site and the keyboard is in the new chat\'s box, also one still loading', T, async () => {
  await a.win.evaluate(() => {
    localStorage.setItem('kickMultiview.linkedOpts', JSON.stringify({ alsoLive: 'none' }));   // (Twitch's tab only opens with Tab)
    window.linkedApi.setOn(true);
    window.linkedApi.link('alpha', 'tw:alpha');
    window.frames_.openStreamer('alpha', 'chat', ['alpha']);
  });
  await chatReady('alpha');
  await addBox('alpha', KICK);
  // Twitch's chat isn't open yet: its tab opens, and once its page and box are there, the box has the keyboard
  assert.equal(await a.win.evaluate(() => window.openWins().some(w => w.channel === 'tw:alpha')), false, 'not open yet');
  // (the window takes the keyboard back from the chat you pressed Tab in: a view's own focus() can't, while it has it)
  await a.win.evaluate(() => { window.__took = 0; const f = window.focus; window.focus = () => { window.__took++; f.call(window); }; });
  await tabIn('alpha', false);
  assert.equal(await a.win.evaluate(() => window.__took), 1, 'the window took the keyboard back');
  await chatReady('tw:alpha');
  // and it loads another page first: the box is on that one
  await loadAgain('tw:alpha');
  await addBox('tw:alpha', TWITCH);
  await boxFocused('tw:alpha');
  assert.equal(await a.win.evaluate(() => document.activeElement.tagName), 'WEBVIEW', 'the app\'s keyboard is in the chat, not on its tab');
  // ⇧Tab: the window's next tab, ALL (its box has the keyboard); ⇧Tab there: Kick's chat, loaded, its box gets the
  // keyboard at once (it doesn't have it from before)
  await inChat('alpha', () => document.activeElement.blur());
  await tabIn('tw:alpha', true);
  await a.win.waitForSelector('#stage .win.chat:not(.tab-hidden) .all-view');
  assert.equal(await a.win.evaluate(() => document.activeElement.className), 'all-in');
  await a.win.keyboard.press('Shift+Tab');
  await boxFocused('alpha');
  // Twitch goes offline: with ALL, ⇧Tab still steps through the window's tabs (ALL reads the offline chat);
  // without ALL, Tab in Kick's chat is the site's own again (nothing to switch to)
  await a.win.evaluate(() => window.smvNotes.liveStatus({ 'tw:alpha': { live: false, checked: Date.now() } }));
  await untilIn('alpha', () => window.__kmvTabKey && window.__kmvTabKey.on, 'with ALL: still the app\'s');
  await a.win.evaluate(() => window.linkedApi.setOpt('allTab', false));
  await untilIn('alpha', () => window.__kmvTabKey && !window.__kmvTabKey.on, 'Tab is Kick\'s own again');
  await a.win.evaluate(() => window.linkedApi.setOpt('allTab', true));
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
  await a.win.evaluate(() => localStorage.removeItem('kickMultiview.linkedOpts'));
});

test('a channel on its own with its ALL on: ⇧Tab in its chat goes to ALL, and in ALL back to its chat', T, async () => {
  await a.win.evaluate(() => {
    localStorage.setItem('kickMultiview.chanOpts', JSON.stringify({ lynx: { allTab: true } }));
    localStorage.setItem('kickMultiview.allOpen', JSON.stringify([]));
  });
  await setMode(a.win, 'chat');
  await openChannel(a.win, 'lynx');
  await chatReady('lynx');
  await addBox('lynx', KICK);
  await untilIn('lynx', () => !!window.__kmvTabKey?.on, 'Tab switches to ALL in a channel on its own');
  await inChat('lynx', () => { const b = document.querySelector('[contenteditable]'); b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); });
  await a.win.waitForSelector('#stage .win.chat:not(.tab-hidden) .all-view');
  await a.win.focus('.all-in');
  await a.win.keyboard.press('Shift+Tab');
  await a.win.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab.kick.on');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
  await a.win.evaluate(() => { localStorage.removeItem('kickMultiview.chanOpts'); localStorage.removeItem('kickMultiview.allOpen'); });
  await setMode(a.win, 'both');
});

test('the keyboard went somewhere else in the app while the chat loaded: it stays there', T, async () => {
  await a.win.evaluate(() => {
    localStorage.setItem('kickMultiview.linkedOpts', JSON.stringify({ alsoLive: 'none' }));
    window.linkedApi.setOn(true);
    window.linkedApi.link('beta', 'tw:beta');
    window.frames_.openStreamer('beta', 'chat', ['beta']);
  });
  await chatReady('beta');
  await addBox('beta', KICK);
  await tabIn('beta', false);
  await chatReady('tw:beta');
  await a.win.focus('#savedBtn');
  await loadAgain('tw:beta');
  await addBox('tw:beta', TWITCH);
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(await inChat('tw:beta', () => document.activeElement?.getAttribute('contenteditable')), null, 'not in the chat box');
  assert.equal(await a.win.evaluate(() => document.activeElement.id), 'savedBtn', 'still on the button');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
  await a.win.evaluate(() => localStorage.removeItem('kickMultiview.linkedOpts'));
});

test('the mod button: on a site\'s tab where you moderate it; in ALL where you moderate any of their sites, with a menu of them', T, async () => {
  await a.app.evaluate(({ app: eapp, session, ipcMain }) => {
    const fake = s => { try { s.protocol.handle('https', () => new Response('<!doctype html><title>stand-in</title>', { headers: { 'content-type': 'text/html' } })); } catch {} };
    ['persist:kick', 'persist:twitch'].forEach(p => fake(session.fromPartition(p)));
    eapp.on('session-created', fake);
    ipcMain.removeHandler('mod:check'); ipcMain.handle('mod:check', (_e, ch) => ch === 'gamma');
  });
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true);
    window.linkedApi.link('gamma', 'tw:gamma');
    window.smvNotes.liveStatus({ gamma: { live: true, checked: Date.now() }, 'tw:gamma': { live: true, checked: Date.now() } });
    window.frames_.openStreamer('gamma', 'chat', ['gamma', 'tw:gamma']);
  });
  const btn = '#stage .win.chat:not(.tab-hidden) [data-a=mod]';
  const shown = () => a.win.$eval(btn, b => !b.hidden);
  await a.win.waitForSelector(`${btn}:not([hidden])`, { state: 'attached' });   // Kick's tab: you moderate it
  await a.win.click('#stage .win.chat:not(.tab-hidden) .ptab.twitch');
  await a.win.waitForSelector(`${btn}[hidden]`, { state: 'attached' });
  assert.equal(await shown(), false, 'Twitch\'s tab: you don\'t');
  await a.win.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  await a.win.waitForSelector(`${btn}:not([hidden])`, { state: 'attached' });
  assert.equal(await a.win.$eval(btn, b => b.title), 'Mod views: each site where you moderate');
  await a.win.$eval(btn, b => b.click());   // (in a narrow window it's under ⋯)
  assert.deepEqual(await a.win.$$eval('.all-mv .all-li', l => l.map(b => b.textContent.trim() + (b.disabled ? ' (off)' : ''))), ['KKick mod view', 'TTwitch · you\'re not a mod (off)']);
  await a.win.keyboard.press('Escape');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
});

test('the pointer moved over a chat page (ALL\'s Twitch replies): only a page this window holds; only a move', T, async () => {
  await a.win.evaluate(() => { window.linkedApi.setOn(true); window.linkedApi.link('delta', 'tw:delta'); window.frames_.openStreamer('delta', 'chat', ['delta']); });
  await chatReady('delta');
  await inChat('delta', () => { window.__moves = []; document.addEventListener('mousemove', e => window.__moves.push([e.clientX, e.clientY])); document.addEventListener('click', () => window.__moves.push('click')); });
  const id = await a.win.evaluate(() => window.openWins().find(w => w.kind === 'chat' && w.channel === 'delta').view.getWebContentsId());
  assert.equal(await a.win.evaluate(id => window.kmv.viewHover(id, 40, 30), id), true);
  await untilIn('delta', () => window.__moves.length > 0, 'the page saw the pointer');
  assert.deepEqual(await inChat('delta', () => window.__moves), [[40, 30]], 'a move, no click');
  for (const bad of [[999999, 1, 1], ['x', 1, 1], [id, NaN, 1]])
    assert.equal(await a.win.evaluate(b => window.kmv.viewHover(...b), bad), false, JSON.stringify(bad));
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
});

// A linked streamer's YouTube chat, a tab you can't see: it loads as soon as the live check knows its live video, without
// a click and without waiting for its own 2-minute check. yt:resolve (YouTube's page) answers "not live" here unless a
// test says otherwise: it can lag behind the live check.
const ytWin = ch => a.win.evaluate(ch => {
  const w = window.openWins().find(o => o.kind === 'chat' && o.channel === ch); if (!w) return null;
  const wait = w.el.querySelector('.waitmsg');
  return { hidden: !!w.hiddenTab, src: w.view ? w.view.getAttribute('src') : null, wait: wait.hidden ? '' : wait.querySelector('span').textContent };
}, ch);
const ytAnswers = (live, ms = 0) => a.app.evaluate(({ ipcMain }, [live, ms]) => {
  globalThis.__yt = { live, n: 0 };
  ipcMain.removeHandler('yt:resolve');
  ipcMain.handle('yt:resolve', async () => { globalThis.__yt.n++; if (ms) await new Promise(r => setTimeout(r, ms));
    return globalThis.__yt.live ? { live: true, videoId: 'pageVideo01' } : { live: false }; });
}, [live, ms]);
const asked = () => a.app.evaluate(() => globalThis.__yt.n);
const untilWin = async (ch, test, what) => { await a.win.waitForFunction(([ch, src]) => { const w = window.openWins().find(o => o.kind === 'chat' && o.channel === ch); return !!w && new RegExp(src).test(w.view?.getAttribute('src') || ''); }, [ch, test.source], { timeout: 15000 }).catch(() => { throw new Error('timed out: ' + what); }); };

test('a YouTube chat tab waiting for its channel to go live loads when the live check says it is, without a click', T, async () => {
  await ytAnswers(false);
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true); window.linkedApi.link('echo', 'yt:@echo');
    window.smvNotes.liveStatus({ echo: { live: true, checked: Date.now() } });          // (YouTube: not checked yet)
    window.frames_.openStreamer('echo', 'chat', ['echo', 'yt:@echo']);
  });
  await a.win.waitForFunction(() => /isn’t live right now/.test(window.openWins().find(o => o.channel === 'yt:@echo')?.el.querySelector('.waitmsg span').textContent || ''));
  assert.equal((await ytWin('yt:@echo')).hidden, true, 'a tab you can\'t see');
  assert.equal(await asked(), 1);
  await a.win.evaluate(() => window.smvNotes.liveStatus({ echo: { live: true, checked: Date.now() }, 'yt:@echo': { live: true, videoId: 'liveCheck01', checked: Date.now() } }));
  await untilWin('yt:@echo', /live_chat.*v=liveCheck01/, 'its live chat loads');
  assert.deepEqual(await ytWin('yt:@echo'), { hidden: true, src: 'https://www.youtube.com/live_chat?is_popout=1&v=liveCheck01', wait: '' }, 'no waiting message');
  assert.equal(await a.win.evaluate(() => window.openWins().find(o => o.channel === 'yt:@echo').el.classList.contains('tab-hidden')), true, 'still not shown: nothing was clicked');
  assert.equal(await asked(), 1, 'YouTube wasn\'t asked again');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
});

test('a YouTube tab that opens while the live check knows its video loads it at once, even if YouTube\'s page says "not live" yet', T, async () => {
  await ytAnswers(false);
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true); window.linkedApi.link('foxtrot', 'yt:@foxtrot');
    window.smvNotes.liveStatus({ foxtrot: { live: true, checked: Date.now() }, 'yt:@foxtrot': { live: true, videoId: 'liveCheck02', checked: Date.now() } });
    window.frames_.openStreamer('foxtrot', 'chat', ['foxtrot', 'yt:@foxtrot']);
  });
  await untilWin('yt:@foxtrot', /v=liveCheck02/, 'the live check\'s video');
  assert.equal(await asked(), 0, 'YouTube wasn\'t asked');
  assert.equal((await ytWin('yt:@foxtrot')).wait, '');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
});

test('YouTube\'s late "not live" answer, after the live check loaded the tab meanwhile, leaves it loaded', T, async () => {
  await ytAnswers(false, 1500);
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true); window.linkedApi.link('golf', 'yt:@golf');
    window.smvNotes.liveStatus({ golf: { live: true, checked: Date.now() } });
    window.frames_.openStreamer('golf', 'chat', ['golf', 'yt:@golf']);
  });
  await a.win.waitForFunction(() => /Looking for/.test(window.openWins().find(o => o.channel === 'yt:@golf')?.el.querySelector('.waitmsg span').textContent || ''));
  await a.win.evaluate(() => window.smvNotes.liveStatus({ golf: { live: true, checked: Date.now() }, 'yt:@golf': { live: true, videoId: 'liveCheck03', checked: Date.now() } }));
  await untilWin('yt:@golf', /v=liveCheck03/, 'the live check\'s video');
  await a.win.waitForFunction(() => !window.openWins().find(o => o.channel === 'yt:@golf').ytBusy, null, { timeout: 5000 });
  assert.deepEqual(await ytWin('yt:@golf'), { hidden: true, src: 'https://www.youtube.com/live_chat?is_popout=1&v=liveCheck03', wait: '' }, 'still that video, no waiting message');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
});

test('ALL: a YouTube channel already live at the first live check (as when the app starts) gets its tab, loaded, without a click', T, async () => {
  await ytAnswers(false);
  await a.win.evaluate(() => {
    window.linkedApi.setOn(true); window.linkedApi.link('hotel', 'tw:hotel'); window.linkedApi.link('hotel', 'yt:@hotel');
    window.smvNotes.liveStatus({ hotel: { live: true, checked: Date.now() }, 'tw:hotel': { live: true, checked: Date.now() } });   // (YouTube: not checked yet)
    window.frames_.openStreamer('hotel', 'chat', ['hotel']);
  });
  await a.win.click('#stage .win.chat:not(.tab-hidden) .ptab.all');
  await a.win.waitForFunction(() => window.openWins().some(o => o.channel === 'tw:hotel'));
  assert.equal(await ytWin('yt:@hotel'), null, 'no YouTube tab while it isn\'t known to be live (its offline channel has no chat)');
  // the first answer about YouTube says live: no "went live" for the tabs (it was never known offline), but ALL reads it
  await a.win.evaluate(() => window.smvNotes.liveStatus({ hotel: { live: true, checked: Date.now() }, 'tw:hotel': { live: true, checked: Date.now() }, 'yt:@hotel': { live: true, videoId: 'liveCheck04', checked: Date.now() } }));
  await untilWin('yt:@hotel', /v=liveCheck04/, 'its live chat loads');
  assert.equal((await ytWin('yt:@hotel')).hidden, true, 'a tab you can\'t see, under ALL');
  assert.equal(await asked(), 0);
  // offline again: its tab goes (ALL keeps only Kick's and Twitch's offline chats)
  await a.win.evaluate(() => window.smvNotes.liveStatus({ hotel: { live: true, checked: Date.now() }, 'tw:hotel': { live: true, checked: Date.now() }, 'yt:@hotel': { live: false, checked: Date.now() } }));
  await a.win.waitForFunction(() => !window.openWins().some(o => o.channel === 'yt:@hotel'));
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
});
