// The search box's channels (#184): a channel's name brings it first, drawn big with its own buttons, which depend on
// the channel (not open, open, unknown, a YouTube channel that isn't live); ← → and Enter run them; the same name on
// two sites; a pasted link; and a name nobody saved, asked about on the sites (a stand-in answers).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, windows } = require('../app');
const { openApp } = setup();

const K = 'ControlOrMeta+k';
const saved = list => `try { localStorage.setItem('kickMultiview.saved', ${JSON.stringify(JSON.stringify(list))}) } catch {}`;
const rows = page => page.evaluate(() => window.palette.rows());
const hero = page => page.$('#palList .pal-row.hero');
const heroButtons = page => page.$$eval('#palList .pal-row.hero .pal-btn', bs => bs.map(b => b.textContent.trim()));
const heroText = page => page.textContent('#palList .pal-row.hero');
async function find(page, text){
  if (!(await page.evaluate(() => window.palette.isOpen()))) await page.keyboard.press(K);
  await page.fill('#palQ', ''); await page.type('#palQ', text); await page.waitForTimeout(60);
}

test('a saved channel that isn\'t open: big, first, with Stream + chat (as the Channels box says), Stream only, Chat only, Save…', async t => {
  const page = await openApp(t, { init: saved(['quietkoala', 'quieter']) });
  await page.evaluate(() => window.smvNotes.setInfo('quietkoala', { live: true, viewers: 2140, title: 'Late night', category: 'Just Chatting' }));
  await find(page, 'quietkoala');
  const r = await rows(page);
  assert.equal(r[0].hero, true);
  assert.equal(r[0].title, 'quietkoala');
  assert.ok(await hero(page));
  assert.match(await heroText(page), /Just Chatting · Late night/);
  assert.match(await heroText(page), /LIVE\s*2\.1K/);
  assert.match(await heroText(page), /Saved/);
  assert.deepEqual(await heroButtons(page), ['Stream + chat', 'Stream only', 'Chat only', 'Saved', 'More…']);
  assert.match(await page.textContent('#palBg .pal-foot'), /← →\s*pick an action/);
  // → Stream only, Enter: just the stream
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.textContent('#palList .pal-btn.on'), 'Stream only');
  await page.keyboard.press('Enter');
  assert.deepEqual((await windows(page)).map(w => w.kind), ['stream']);
  // the Channels box set to Chat only: that's the first button
  await page.click('#savedBtn'); await page.selectOption('#mode', 'chat'); await page.click('#savedBtn');
  await find(page, 'quieter');
  assert.deepEqual((await heroButtons(page)).slice(0, 3), ['Chat only', 'Stream only', 'Stream + chat']);
  // 3 letters or more of the start, when nothing else comes close
  await find(page, 'qui');
  assert.equal((await rows(page))[0].hero, false, 'two channels start that way: no big row');
  await find(page, 'quietk');
  assert.equal((await rows(page))[0].hero, true);
});

test('an open channel: Go to it, Make big, Mute, Reload, Pop out, Close, + Chat when only its stream is open', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await find(page, 'alpha');
  assert.match(await heroText(page), /Open/);
  assert.deepEqual(await heroButtons(page), ['Go to it', 'Make big', 'Unmute', 'Reload', 'Pop out', 'Close', 'More…']);
  // Ctrl/⌘+2: Make big
  await page.keyboard.press('ControlOrMeta+2');
  assert.equal((await windows(page)).find(w => w.kind === 'stream').featured, true, 'big');
  // close both, then only the stream: + Chat
  await find(page, 'alpha');
  await page.click('#palList .pal-btn:text-is("Close")');
  assert.deepEqual(await windows(page), []);
  await page.click('#savedBtn'); await page.selectOption('#mode', 'stream'); await page.click('#savedBtn');
  await add(page, 'alpha');
  await find(page, 'alpha');
  assert.ok((await heroButtons(page)).includes('+ Chat'));
  await page.click('#palList .pal-btn:text-is("+ Chat")');
  assert.deepEqual((await windows(page)).map(w => w.kind).sort(), ['chat', 'stream']);
});

test('More… and Tab: everything for a channel: open it each way, save it, copy its link, and its windows\' actions', async t => {
  const page = await openApp(t, { init: saved(['charlie']) });
  await add(page, 'charlie');
  await find(page, 'charlie');
  await page.click('#palList .pal-btn:text-is("More…")');
  const all = (await rows(page)).map(r => `${r.group}: ${r.title}`);
  for (const want of ['Open: Stream + chat', 'Open: Stream only', 'Open: Chat only', 'Open: On kick.com', 'Channel: Saved', 'Share: Copy link', 'charlie · stream: Make big', 'charlie · chat: Blow it up'])
    assert.ok(all.includes(want), `${want} in ${all.join(', ')}`);
  // Saved is a switch: it flips where it is
  await page.fill('#palQ', 'saved');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.palette.isOpen()), true);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.saved'))), []);
});

test('the same name on two sites: the best one big (saved before open), the other a row under it', async t => {
  const page = await openApp(t, { init: saved(['tw:nightowl']) });
  await add(page, 'nightowl');
  await find(page, 'nightowl');
  const r = await rows(page);
  assert.equal(r[0].hero, true);
  assert.ok(r.some(x => !x.hero && x.group === 'Channels' && x.title === 'nightowl'), JSON.stringify(r));
  const sites = await page.$$eval('#palList .pal-row[data-id^="ch:"] .pi', is => is.map(i => i.className));
  assert.equal(sites.length, 2);
});

test('a pasted link: that channel first, to open; a YouTube channel that isn\'t live: Check now, Open its page…', async t => {
  const page = await openApp(t);
  await find(page, 'https://www.twitch.tv/somebodynew');
  const r = await rows(page);
  assert.equal(r[0].hero, true);
  assert.equal(r[0].id, 'open:tw:somebodynew');
  assert.equal((await heroButtons(page))[0], 'Open');
  await page.keyboard.press('Enter');
  assert.deepEqual((await windows(page)).map(w => w.title).sort(), ['somebodynew', 'somebodynew']);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kickMultiview.saved') || '[]'); s.push('yt:@sleepytube'); localStorage.setItem('kickMultiview.saved', JSON.stringify(s)); window.dispatchEvent(new StorageEvent('storage', { key: 'kickMultiview.saved', newValue: JSON.stringify(s) })); });
  await find(page, '@sleepytube');      // (@: channels and windows only)
  assert.deepEqual((await heroButtons(page)).slice(0, 2), ['Check now', 'Open its page']);
});

test('a name nobody saved: Open, Open & save…, after asking the sites; where it was found, and where it wasn\'t', async t => {
  const page = await openApp(t, { init: () => {
    window.asked = [];
    window.kmv = { profileLookup: q => { window.asked.push(q); return new Promise(r => setTimeout(() => r(q === 'brandnew' ? [{ ch: 'tw:brandnew', name: 'BrandNew', live: { viewers: 214 } }] : []), 100)); } };
  } });
  await find(page, 'brandnew');
  assert.equal((await rows(page))[0].hero, true);
  assert.deepEqual(await heroButtons(page), ['Open', 'Open & save', 'Stream only', 'Chat only', 'More…']);
  assert.match(await heroText(page), /Checking Kick…/);
  await page.waitForFunction(() => /No Kick channel called “brandnew”/.test(document.querySelector('#palList').textContent));
  assert.deepEqual(await page.evaluate(() => window.asked), ['brandnew'], 'asked once, 400 ms after the last key');
  assert.match(await page.textContent('#palList'), /✓ Found on Twitch · live · 214 watching/);
  assert.ok(!(await rows(page)).some(r => /YouTube/.test(r.title)), 'not where it wasn\'t found');
  // found on Twitch only: that one is the big row now; Open & save
  assert.equal((await rows(page))[0].id, 'open:tw:brandnew');
  await page.click('#palList .pal-btn:text-is("Open & save")');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.saved'))), ['tw:brandnew']);
  // asked again: kept for the session
  await find(page, 'brandnew');
  await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(() => window.asked), ['brandnew']);
});
