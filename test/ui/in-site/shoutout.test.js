// Shoutouts inside the Kick and Twitch chat pages (in-site/shoutout.js): a Shout out button at the start of each
// message's hover bar (or a bar of its own), a pill on a raid's line, who sent a message from the line's own data (Kick's
// slug: an address can have - where the name has _), the right-click menu's sender, the chat's recent people, and
// all of it gone when shoutouts are switched off. Stand-in lines in the app's own page, with the React data the sites
// draw them from. The names are made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');
const { openApp } = setup();

const ICON = '<button aria-label="Reply">r</button><button aria-label="Pin">p</button>';
// Kick: a row ([data-index]) with its hover bar (group-hover:flex), its data on the row's .group
const KICK = (i, name, slug, text, { bar = true, data = true } = {}) => ({ html: `<div data-index="${i}"><div class="group"><div><div><button data-prevent-expand>${name}</button></div><span aria-hidden="true">:&nbsp;</span></div><span class="font-normal">${text}</span>`
  + (bar ? `<div class="hidden group-hover:flex">${ICON}</div>` : '') + '</div></div>', data: data && { i, message: { id: 'm' + i, created_at: new Date(Date.now() - (9 - i) * 1000).toISOString(), sender: { username: name, slug } } } });
async function page(t, rows, site = 'kick'){
  const p = await openApp(t, { width: 520, height: 640 });
  const logs = [];
  p.on('console', m => { if (m.text().startsWith('__kmv:shoutout ')) logs.push(JSON.parse(m.text().slice(15))); });
  await p.evaluate(([rows, site]) => {
    const c = document.createElement('div'); c.id = 'chat';
    c.style.cssText = 'position:fixed;left:10px;right:10px;top:60px;z-index:2147483646;background:#0e1112;font:15px sans-serif;color:#fff;padding:20px 0';
    c.innerHTML = rows.map(r => r.html).join(''); document.body.append(c);
    rows.forEach(r => {
      if (!r.data) return;
      const el = document.querySelector(site === 'kick' ? `[data-index="${r.data.i}"] .group` : `.chat-line__message[data-i="${r.data.i}"]`);
      el['__reactFiber$t'] = { memoizedProps: {}, return: { memoizedProps: { message: r.data.message } } };
    });
    window.messageAgent();
    window.shoutAgent(true, { site });
  }, [rows, site]);
  p.logs = logs;
  return p;
}

test('Kick: the button first in a message\'s hover bar; a press says who, by their address from the line\'s data; a raid\'s line gets a pill; no data: the name, said to be a name', async t => {
  const p = await page(t, [KICK(1, 'Pixel_Fox', 'pixel-fox', 'hello there'), KICK(2, 'MapleMoth', 'maplemoth', 'MapleMoth is now hosting with 23 viewers', { bar: false }),
    KICK(3, 'Oak_Moss', '', 'no data here', { data: false }), KICK(4, 'Fern', 'fern', 'a reward card', { bar: false })]);
  await p.hover('[data-index="1"]');
  assert.deepEqual(await p.$$eval('[data-index="1"] .group-hover\\:flex button', l => l.map(b => b.getAttribute('aria-label'))), ['Shout out Pixel_Fox', 'Reply', 'Pin'], 'first in its hover bar');
  assert.equal(await p.getAttribute('[data-index="1"] .kmv-so-b', 'title'), 'Shout out Pixel_Fox (Stream Multiview)');
  await p.click('[data-index="1"] .kmv-so-b');
  await p.waitForTimeout(100);
  assert.deepEqual(p.logs, [{ site: 'kick', login: 'pixel-fox', name: 'Pixel_Fox', named: false }], 'its address, not the name shown');
  // a raid's line: a pill
  await p.hover('[data-index="2"]');
  assert.equal(await p.textContent('[data-index="2"] .kmv-so-pill'), 'Shout out');
  await p.click('[data-index="2"] .kmv-so-pill');
  // no data: the name on screen, said to be a name (the app looks its address up)
  await p.hover('[data-index="3"]');
  await p.click('[data-index="3"] .kmv-so-b');
  // no hover bar (a reward card): a bar of its own
  await p.hover('[data-index="4"]');
  assert.equal(await p.locator('[data-index="4"] .kmv-so-own .kmv-so-b').count(), 1);
  await p.waitForTimeout(100);
  assert.deepEqual(p.logs.slice(1), [{ site: 'kick', login: 'maplemoth', name: 'MapleMoth', named: false }, { site: 'kick', login: 'oak_moss', name: 'Oak_Moss', named: true }]);
  assert.equal(await p.locator('.kmv-so-b, .kmv-so-pill').count(), 4, 'one each, however often the pointer comes by');
  await p.hover('[data-index="1"]'); await p.hover('[data-index="2"]');
  assert.equal(await p.locator('.kmv-so-b, .kmv-so-pill').count(), 4);
  // the people who chatted here, oldest first
  assert.deepEqual(await p.evaluate(() => window.__kmvShout.chatters().map(x => [x.login, x.named, x.raid, x.t > 0])),
    [['pixel-fox', false, false, true], ['maplemoth', false, true, true], ['oak_moss', true, false, false], ['fern', false, false, true]]);
  // the right-click menu: who sent it
  await p.click('[data-index="1"] .font-normal', { button: 'right' });
  assert.deepEqual((await p.evaluate(() => window.__kmvMsg.ctx())).shout, { site: 'kick', login: 'pixel-fox', name: 'Pixel_Fox', named: false });
  // off: all of it gone, and the menu doesn't offer it; on again: back
  await p.evaluate(() => window.shoutAgent(false));
  assert.equal(await p.locator('[data-kmv-so]').count(), 0);
  await p.click('[data-index="1"] .font-normal', { button: 'right' });
  assert.equal((await p.evaluate(() => window.__kmvMsg.ctx())).shout, undefined);
  await p.hover('[data-index="3"]');
  assert.equal(await p.locator('.kmv-so-b').count(), 0, 'nothing added while off');
  await p.evaluate(() => window.shoutAgent(true));
  await p.hover('[data-index="1"]');
  assert.equal(await p.locator('[data-index="1"] .kmv-so-b').count(), 1);
});

test('Twitch: the button first in a message\'s icons, who from the line\'s data (its login); a press while off sends nothing', async t => {
  const TW = (i, name, login) => ({ html: `<div class="chat-line__message" data-i="${i}"><span class="chat-line__icons"><div><button aria-label="Reply">r</button></div></span>`
    + `<span class="chat-author__display-name">${name}</span>: <span>hey</span></div>`, data: { i, message: { id: 't' + i, timestamp: Date.now(), user: { userLogin: login, userDisplayName: name } } } });
  const p = await page(t, [TW(1, 'Lumen', 'lumen_fox'), { html: '<div class="chat-line__message" data-i="2"><span>Welcome to the chat room!</span></div>' }], 'twitch');
  await p.hover('.chat-line__message[data-i="1"]');
  assert.equal(await p.$eval('.chat-line__message[data-i="1"] .chat-line__icons', e => e.firstElementChild.className), 'kmv-so-b');
  await p.click('.chat-line__message[data-i="1"] .kmv-so-b');
  await p.waitForTimeout(100);
  assert.deepEqual(p.logs, [{ site: 'twitch', login: 'lumen_fox', name: 'Lumen', named: false }]);
  await p.hover('.chat-line__message[data-i="2"]');
  assert.equal(await p.locator('.chat-line__message[data-i="2"] [data-kmv-so]').count(), 0, 'a notice with no one: nothing');
  // switched off with the button already there: its press does nothing
  await p.evaluate(() => { window.__kmvShout.on = false; });
  await p.click('.chat-line__message[data-i="1"] .kmv-so-b', { force: true });
  await p.waitForTimeout(100);
  assert.equal(p.logs.length, 1);
});
