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
