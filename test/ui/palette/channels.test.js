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
// each button's name (without the keys it shows)
const heroButtons = page => page.$$eval('#palList .pal-row.hero .pal-btn', bs => bs.map(b => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()));
const heroKeys = page => page.$$eval('#palList .pal-row.hero .pal-btn', bs => bs.map(b => (b.querySelector('kbd') || {}).textContent || ''));
const heroText = page => page.textContent('#palList .pal-row.hero');
async function find(page, text){
  if (!(await page.evaluate(() => window.palette.isOpen()))) await page.keyboard.press(K);
  await page.fill('#palQ', ''); await page.type('#palQ', text); await page.waitForTimeout(60);
}

test('a saved channel that isn\'t open: big, first, with Stream + chat (as the Channels box says), Stream only, Chat only, Save…', async t => {
  const page = await openApp(t, { init: saved(['quietkoala', 'quieter']) });
  await page.evaluate(() => window.smvNotes.setInfo('quietkoala', { live: true, viewers: 2140, title: 'Late night', category: 'Just Chatting', startedAt: Date.now() - 130 * 60000 }));
  await find(page, 'quietkoala');
  const r = await rows(page);
  assert.equal(r[0].hero, true);
  assert.equal(r[0].title, 'quietkoala');
  assert.ok(await hero(page));
  // its line: site · title · game · how many watching · for how long; LIVE and Saved beside its name
  assert.equal(await page.textContent('#palList .pal-row.hero .pal-sub'), 'Kick·Late night·Just Chatting·2.1K watching·live 2h 10m');
  assert.equal(await page.textContent('#palList .pal-row.hero .pal-livep'), 'LIVE');
  assert.match(await page.textContent('#palList .pal-row.hero .pal-line'), /Saved/);
  assert.deepEqual(await heroButtons(page), ['Stream + chat', 'Stream only', 'Chat only', 'Saved', 'More…']);
  assert.deepEqual(await heroKeys(page), ['↵', '1', '2', '3', ''].map(k => /^\d$/.test(k) ? (process.platform === 'darwin' ? '⌘' : 'Ctrl') + k : k), 'Enter, Ctrl/⌘+1–9 (More…: none)');
  assert.match(await page.textContent('#palBg .pal-foot'), /←→\s*or\s*Tab⇧Tab\s*pick an action/);
  // → Stream only, Enter: just the stream
  await page.keyboard.press('ArrowRight');
  assert.match(await page.textContent('#palList .pal-btn.on'), /^Stream only/);
  await page.keyboard.press('Enter');
  assert.deepEqual((await windows(page)).map(w => w.kind), ['stream']);
  // the Channels box set to Chat only: that's the first button
  await page.click('#savedBtn'); await page.selectOption('#mode', 'chat'); await page.click('#savedBtn');
  await find(page, 'quieter');
  assert.deepEqual((await heroButtons(page)).slice(0, 3), ['Chat only', 'Stream + chat', 'Stream only']);
  // 3 letters or more of the start, when nothing else comes close
  await find(page, 'qu');
  assert.equal((await rows(page))[0].hero, false, 'under 3 letters: no big row');
  await find(page, 'qui');
  assert.equal((await rows(page))[0].hero, true, 'the best of the channels that start that way');
  assert.equal((await rows(page))[0].hero, true);
});

test('an open channel: Go to it, Make big, Mute, Reload, Pop out, Close, + Chat when only its stream is open', async t => {
  const page = await openApp(t);
  await add(page, 'alpha');
  await find(page, 'alpha');
  assert.match(await page.textContent('#palList .pal-row.hero .pal-tag.on'), /Open · stream \+ chat/);
  assert.match(await page.textContent('#palList .pal-row.hero .pal-sub'), /offline·stream muted/);
  assert.deepEqual(await heroButtons(page), ['Go to it', 'Make big', 'Unmute', 'Reload', 'Pop out', 'Close both', 'More…']);
  // Ctrl/⌘+1: the second button, Make big
  await page.keyboard.press('ControlOrMeta+1');
  assert.equal((await windows(page)).find(w => w.kind === 'stream').featured, true, 'big');
  // close both, then only the stream: + Chat
  await find(page, 'alpha');
  await page.click('#palList .pal-btn:has-text("Close both")');
  assert.deepEqual(await windows(page), []);
  await page.click('#savedBtn'); await page.selectOption('#mode', 'stream'); await page.click('#savedBtn');
  await add(page, 'alpha');
  await find(page, 'alpha');
  assert.ok((await heroButtons(page)).includes('+ Chat'));
  await page.click('#palList .pal-btn:has-text("+ Chat")');
  assert.deepEqual((await windows(page)).map(w => w.kind).sort(), ['chat', 'stream']);
});

test('More… and Tab: everything for a channel: open it each way, save it, copy its link, and its windows\' actions', async t => {
  const page = await openApp(t, { init: saved(['charlie']) });
  await add(page, 'charlie');
  await find(page, 'charlie');
  await page.click('#palList .pal-btn:has-text("More…")');
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

test('a saved channel named by the start of its name stays big when a site finds the name typed; the found one is a row under it', async t => {
  const page = await openApp(t, { init: () => {
    try { localStorage.setItem('kickMultiview.saved', JSON.stringify(['sampleplays'])); } catch {}
    window.kmv = { profileLookup: q => new Promise(r => setTimeout(() => r(q === 'sample' ? [{ ch: 'tw:sample', name: 'sample' }] : []), 100)) };
  } });
  await find(page, 'sample');
  let r = await rows(page);
  assert.deepEqual([r[0].id, r[0].hero], ['ch:sampleplays', true], 'before the sites answer');
  await page.waitForFunction(() => !!document.querySelector('#palList .pal-row[data-id="open:tw:sample"]'));
  r = await rows(page);
  assert.deepEqual([r[0].id, r[0].hero], ['ch:sampleplays', true], 'and after: it doesn\'t jump');
  const found = r.find(x => x.id === 'open:tw:sample');
  assert.deepEqual([found.hero, found.group], [false, 'Channels'], 'the one found: a row of its own');
  assert.deepEqual(await page.$$eval('#palList .pal-row[data-id="open:tw:sample"] .pal-site', bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['K', 'T*', 'Y'], 'with its sites');
  // Enter: still the saved one's first button
  assert.match(await page.textContent('#palList .pal-btn.on'), /^Stream \+ chat/);
  // on its row, Tab / ⇧Tab pick its site
  while (await page.getAttribute('#palList .pal-row.on', 'data-id') !== 'open:tw:sample') await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  assert.deepEqual(await page.$$eval('#palList .pal-row.on .pal-site.on', bs => bs.map(b => b.textContent)), ['Y']);
});

test('Tab / ⇧Tab: along the big row\'s buttons and round; Enter on More… lists everything, Tab / ⇧Tab its columns, Esc back', async t => {
  const page = await openApp(t, { init: saved(['charlie']) });
  await find(page, 'charlie');
  const on = () => page.textContent('#palList .pal-btn.on');
  await page.keyboard.press('Tab');
  assert.match(await on(), /^Stream only/, 'Tab: the next button');
  await page.keyboard.press('Tab');
  assert.match(await on(), /^Chat only/);
  await page.keyboard.press('Shift+Tab');
  assert.match(await on(), /^Stream only/, '⇧Tab: the one before');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  assert.match(await on(), /^More…/, 'from the first, round to the last');
  assert.equal(await page.isVisible('#palBg .pal-head'), false, 'Tab and ⇧Tab don\'t open its list');
  await page.keyboard.press('Tab');
  assert.match(await on(), /^Stream \+ chat/, 'and Tab round to the first');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.isVisible('#palBg .pal-head'), true, 'Enter on More…: everything for it');
  assert.equal(await page.getAttribute('#palBg .pal-backb', 'title'), 'Back (Esc)');
  assert.doesNotMatch(await page.textContent('#palBg .pal-head'), /undefined|false|null/, 'only what applies (no live pill: no stray text)');
  assert.equal(await page.locator('#palList.split .pal-col').count(), 2, 'in two columns');
  assert.match(await page.textContent('#palBg .pal-foot'), /Esc back.*Tab⇧Tab\s*other column·Esc\s*back to results/);
  const column = () => page.evaluate(() => [...document.querySelectorAll('#palList .pal-col')].findIndex(c => c.querySelector('.pal-row.on')));
  assert.equal(await column(), 0);
  await page.keyboard.press('Tab');
  assert.equal(await column(), 1, 'Tab: the right column');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await column(), 0, '⇧Tab: back to the left');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#palBg .pal-head'), false, 'Esc: back to the results');
  assert.equal(await page.inputValue('#palQ'), 'charlie');
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

test('a name nobody saved: “Open … as a channel” with K / T / Y (Tab: the next site) while the sites are asked; found, its big row', async t => {
  const page = await openApp(t, { init: () => {
    window.asked = [];
    window.kmv = { profileLookup: q => { window.asked.push(q); return new Promise(r => setTimeout(() => r(q === 'qvbrandy' ? [{ ch: 'tw:qvbrandy', name: 'Qvbrandy', live: { viewers: 214, title: 'Hello' } }] : []), 100)); } };
  } });
  await find(page, 'qvbrandy');
  let r = await rows(page);
  assert.equal(r[0].id, 'open:as');
  assert.match(await page.textContent('#palList .pal-row.on'), /Open “qvbrandy” as a channel.*Checking Kick, Twitch and YouTube…/);
  assert.deepEqual(await page.$$eval('#palList .pal-row.on .pal-site', bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['K*', 'T', 'Y']);
  assert.match(await page.textContent('#palBg .pal-foot'), /Tab⇧Tab\s*next \/ previous site/);
  const site = () => page.$$eval('#palList .pal-row.on .pal-site.on', bs => bs.map(b => b.textContent));
  await page.keyboard.press('Tab');
  assert.deepEqual(await site(), ['T'], 'Tab: the next site');
  await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await site(), ['K'], '⇧Tab: the one before');
  await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await site(), ['Y'], 'from the first, round to the last');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.deepEqual(await site(), ['T'], 'and Tab round again');
  // found on Twitch: its big row, on Twitch, with what each site said
  await page.waitForFunction(() => !!document.querySelector('#palList .pal-row.hero'));
  assert.deepEqual(await page.evaluate(() => window.asked), ['qvbrandy'], 'asked once, 400 ms after the last key');
  r = await rows(page);
  assert.equal(r[0].id, 'open:tw:qvbrandy');
  assert.match(await page.textContent('#palList .pal-row.hero .pal-sub'), /✓ Found on Twitch·live·Hello·214 watching·not on Kick·not on YouTube/);
  assert.deepEqual(await heroButtons(page), ['Open', 'Open & save', 'Stream only', 'Chat only']);
  assert.deepEqual(await page.$$eval('#palList .pal-row.hero .pal-site', bs => bs.map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))), ['K Kick', 'T Twitch*', 'Y YouTube']);
  // its big row: ← → its buttons, Tab / ⇧Tab its sites
  const heroSite = () => page.$$eval('#palList .pal-row.hero .pal-site.on', bs => bs.map(b => b.textContent));
  assert.match(await page.textContent('#palBg .pal-foot'), /←→\s*pick an action·Tab⇧Tab\s*next \/ previous site/);
  await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await heroSite(), ['K Kick'], '⇧Tab: the site before');
  await page.keyboard.press('Tab');
  assert.deepEqual(await heroSite(), ['T Twitch']);
  // another site picked: what it said there
  await page.click('#palList .pal-row.hero .pal-site:has-text("Kick")');
  assert.match(await page.textContent('#palList .pal-row.hero .pal-sub'), /No Kick channel called “qvbrandy”/);
  await page.click('#palList .pal-row.hero .pal-site:has-text("Twitch")');
  await page.click('#palList .pal-btn:has-text("Open & save")');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.saved'))), ['tw:qvbrandy']);
  // asked again: kept for the session
  await find(page, 'qvbrandy');
  await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(() => window.asked), ['qvbrandy']);
  // a name not found anywhere: nothing called it, still offered as a channel on the site picked
  await find(page, 'zzunknown');
  await page.waitForFunction(() => /Not found on Kick, Twitch or YouTube/.test(document.querySelector('#palList').textContent));
  assert.match(await page.textContent('#palList .pal-none'), /Nothing called “zzunknown”/);
  await page.keyboard.press('Enter');
  assert.deepEqual((await windows(page)).map(w => w.title).filter(t => t === 'zzunknown'), ['zzunknown', 'zzunknown'], 'opened on Kick');
});
