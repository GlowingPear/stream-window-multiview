// Linked channels in the real app: a streamer's window with a tab per site. The tab you're not watching keeps its
// player loaded and playing, muted, under the one you watch; switching moves the sound. Players are stand-in pages
// (see app.js).
const test = require('node:test');
const { launchApp, assert } = require('../app');

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
const tabIn = async (ch, back) => { await bothLive(ch); await a.win.waitForSelector('#stage .win.chat:not(.tab-hidden) .ptab:not(.on):not(.locked)'); await inChat(ch, back => { const b = document.querySelector('[contenteditable]'); b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: back, bubbles: true, cancelable: true })); }, back); };
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
  // ⇧Tab back: Kick's chat is loaded, its box gets the keyboard at once (it doesn't have it from before)
  await inChat('alpha', () => document.activeElement.blur());
  await tabIn('tw:alpha', true);
  await boxFocused('alpha');
  await a.win.click('#stage .win.chat:not(.tab-hidden) [data-a=close]');
  await a.win.evaluate(() => localStorage.removeItem('kickMultiview.linkedOpts'));
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
