// Streamer profiles in the real desktop app: the Profiles directory, a profile with what Kick says and
// what the app recorded, notes, Unfollow on Kick (from a profile and from the Import follows list), and
// recording streams from the live checks. kick.com is a stand-in that answers like Kick's API, so
// nothing reaches the real sites; the history starts from a made-up profiles.json.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, assert, openChannel } = require('../../app');
const { tempDir } = require('../../../helpers');

const T = { timeout: 60000 };
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = Date.now();
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 500)); } };   // waitForFunction doesn't wait for an async check
const kickTime = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19);

// Six weeks of a streamer who streams Tue-Thu from 7 PM: past broadcasts and streams the app saw.
function history() {
  const sessions = [];
  for (let d = 42; d >= 1; d--) {
    const day = new Date(now - d * DAY), wd = (day.getDay() + 6) % 7;
    if (wd < 1 || wd > 3) continue;
    const s = new Date(day); s.setHours(19, 0, 0, 0);
    const app = d % 2 === 0;
    sessions.push({ start: s.getTime(), end: s.getTime() + 4 * HOUR, last: s.getTime() + 4 * HOUR, exact: true, src: app ? 'app' : 'vod', vod: app ? undefined : 'v' + d,
      title: 'Route practice', cat: 'Hollow Run', peak: app ? 900 : null, vsum: app ? 8000 : 0, vn: app ? 10 : 0, samples: [], titles: [], cats: [{ at: s.getTime(), c: 'Hollow Run' }] });
  }
  return { tracked: now - 43 * DAY, sessions, followers: [], info: { name: 'Alpha', avatar: '', followers: 1500 } };
}
const KICK = {
  alpha: { slug: 'alpha', followers_count: 1500, verified: true, user: { username: 'Alpha', bio: 'Speedruns most weeknights.', instagram: 'alpha.live', profile_pic: '' },
    livestream: { is_live: true, session_title: 'Any% attempts', viewer_count: 321, start_time: kickTime(now - 90 * MIN), categories: [{ name: 'Hollow Run' }] },
    chatroom: { followers_mode: true, following_min_duration: 10, slow_mode: true, message_interval: 5 } },
  bravo: { slug: 'bravo', followers_count: 20, user: { username: 'bravo', bio: '' }, livestream: null, chatroom: {} },
  echo: { slug: 'echo', followers_count: 77, user: { username: 'Echo', bio: '', profile_pic: 'https://files.kick.com/images/echo.png' }, livestream: null, chatroom: {} }
};

let a;
test.before(async () => {
  const data = tempDir('prof');
  fs.mkdirSync(path.join(data, 'Stream Multiview'), { recursive: true });
  fs.writeFileSync(path.join(data, 'Stream Multiview', 'profiles.json'), JSON.stringify({ v: 1, ch: { alpha: history() },
    meta: { bravo: { notes: 'old friend', tags: ['Friends'], fav: true, nick: 'Bee' } } }));
  a = await launchApp({ data, realExists: true, storage: { 'kickMultiview.saved': ['alpha', 'bravo', 'tw:charlie'] } });
  // kick.com answers like Kick's API; you're logged in to Kick; Unfollow is recorded
  await a.app.evaluate(async ({ session, ipcMain }, KICK) => {
    const s = session.fromPartition('persist:kick');
    // signed in first: the live checks are already running, and a profile fetched before the cookie is kept for 10 minutes
    await s.cookies.set({ url: 'https://kick.com', name: 'session_token', value: 'test' });
    s.protocol.unhandle('https');
    const t = globalThis.__t = { unfollowed: [], asked: [] };
    s.protocol.handle('https', req => {
      const u = new URL(req.url), m = u.pathname.match(/^\/api\/v2\/channels\/([\w-]+)(\/[\w-]+)?$/);
      const json = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { 'content-type': 'application/json' } });
      if (m) {
        t.asked.push(req.method + ' ' + u.pathname);
        if (m[2] === '/follow' && req.method === 'DELETE') { t.unfollowed.push(m[1]); return new Response(null, { status: 204 }); }
        const c = KICK[m[1]];
        if (!c) return json({ message: 'Not found' }, 404);
        if (m[2] === '/videos') return json([]);
        if (m[2] === '/me') return json({ following: true });
        return json(c);
      }
      return new Response('<!doctype html><title>kick</title>', { headers: { 'content-type': 'text/html' } });
    });
    ipcMain.removeHandler('mod:check'); ipcMain.handle('mod:check', (_e, ch) => ch === 'alpha');
  }, KICK);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const asked = () => a.app.evaluate(() => globalThis.__t);

test('Profiles lists the saved streamers, with search and filters', T, async () => {
  const w = a.win;
  assert.equal(await w.isVisible('#profBtn'), true);
  await w.click('#profBtn');
  await w.waitForSelector('#profDlg .pf-card[data-ch=alpha]');
  const cards = () => w.$$eval('#profDlg .pf-card', e => e.map(c => c.dataset.ch));
  assert.deepEqual((await cards()).sort(), ['alpha', 'bravo', 'tw:charlie']);
  // (the app's live checks may already have seen alpha live)
  assert.match(await w.textContent('.pf-card[data-ch=alpha] .pf-st'), /Last live (\d+ (days?|h|min) ago|yesterday)|LIVE/, 'from the recorded history (an hour ago just after midnight)');
  assert.match(await w.textContent('.pf-card[data-ch=bravo] .pf-nm'), /★\s*Bee/, 'favourite and nickname');
  await w.click('.pf-chips[data-g=flag] [data-v=fav]');
  assert.deepEqual(await cards(), ['bravo']);
  await w.click('.pf-chips[data-g=flag] [data-v=fav]');
  await w.click('.pf-chips[data-g=plat] [data-v=twitch]');
  assert.deepEqual(await cards(), ['tw:charlie']);
  await w.click('.pf-chips[data-g=plat] [data-v=all]');
  await w.fill('#pfQ', 'friends');
  assert.deepEqual(await cards(), ['bravo'], 'tags are searched');
  await w.fill('#pfQ', 'zzznobody');
  assert.equal(await w.isVisible('.pf-look .pf-find'), true, 'a name that isn\'t saved can be looked up');
  await w.fill('#pfQ', '');
});

test('a profile: what Kick says, the live stream, numbers from the history, and where they come from', T, async () => {
  const w = a.win;
  await w.click('.pf-card[data-ch=alpha]');
  await w.waitForSelector('.pf-prof h2');
  await w.waitForFunction(() => /Verified/.test(document.querySelector('.pf-prof h2').textContent), null, { timeout: 20000 });
  assert.match(await w.textContent('.pf-prof .pf-bio'), /Speedruns most weeknights/);
  assert.match(await w.textContent('.pf-prof h2'), /You moderate/);
  assert.match(await w.textContent('.pf-prof .pf-socials'), /Instagram\s*alpha\.live/);
  assert.match(await w.textContent('.pf-now'), /Live now.*up 1h 30m/s);
  assert.match(await w.textContent('.pf-now'), /Any% attempts/);
  assert.match(await w.textContent('.pf-now'), /followers-only chat \(10 min\), 5s slow mode/);
  const tiles = await w.$$eval('.pf-tile', e => Object.fromEntries(e.map(t => [t.querySelector('.k').textContent, t.querySelector('.v').textContent + ' | ' + t.querySelector('.s').textContent])));
  assert.match(tiles['Followers'], /^1\.5K/);
  assert.match(tiles['Avg viewers'], /^\d{3} \| seen by the app/);
  assert.match(tiles['Avg length'], /^4h 00m/);
  // times as this computer writes them (7:00 PM or 19:00)
  const clock = h => w.evaluate(h => new Date(2026, 0, 1, h).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), h);
  const re = s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s'));
  const [six, seven, eleven] = [await clock(18), await clock(19), await clock(23)];
  const startsAt = t => new RegExp('^' + re(t).source.replace(':00', ':\\d\\d') + ' \\| Tue–Thu');   // 6 or 7 PM, any minute
  assert.ok([six, seven].some(t => startsAt(t).test(tiles['Usually starts'])), tiles['Usually starts']);
  assert.match(await w.textContent('.pf-cov'), /Tracking since .* seen by the app, \d+ more from Kick's past broadcasts/);
  assert.ok(await w.$('.pf-heat-g'), 'the heatmap is drawn');
  assert.match(await w.textContent('.pf-heat-k b'), re(`Tue–Thu, ${seven} – ${eleven}`));
  const rows = await w.$$eval('.pf-hist tbody tr', e => e.map(r => r.textContent));
  assert.ok(rows.length >= 10);
  assert.ok(rows.some(r => /VOD/.test(r)) && rows.some(r => !/VOD/.test(r)), 'past broadcasts are marked');
  assert.equal(await w.evaluate(() => JSON.parse(localStorage.getItem('kickMultiview.chNames') || '{}').alpha), 'Alpha', 'Kick\'s name for the channel is used in the rest of the app');
});

test('notes, tags and nickname are saved to the computer', T, async () => {
  const w = a.win;
  await w.fill('.pf-notes textarea', 'Raid train on Friday');
  await w.fill('.pf-notes [data-k=tag]', 'Speedrun');
  await w.press('.pf-notes [data-k=tag]', 'Enter');
  await w.waitForSelector('.pf-tagx');
  await w.fill('.pf-notes [data-k=nick]', 'Al');
  const file = path.join(a.data, 'Stream Multiview', 'profiles.json');
  for (let i = 0; i < 50; i++) {
    let m = null; try { m = JSON.parse(fs.readFileSync(file, 'utf8')).meta.alpha; } catch {}
    if (m && m.notes === 'Raid train on Friday' && m.nick === 'Al') { assert.deepEqual(m.tags, ['Speedrun']); return; }
    await new Promise(r => setTimeout(r, 200));
  }
  assert.fail('notes were not saved');
});

test('Unfollow on Kick asks first, then unfollows on kick.com; it can also remove them from Saved', T, async () => {
  const w = a.win;
  // fails now and then on CI; say what the profile showed instead
  await w.waitForSelector('.pf-acts .unf', { timeout: 10000 }).catch(async () => {
    const seen = await w.evaluate(async () => ({ open: !document.querySelector('#profDlg').hidden, title: (document.querySelector('.pf-prof h2') || {}).textContent,
      buttons: (document.querySelector('.pf-acts') || {}).textContent, site: await window.kmv.profileGet('alpha', { local: true }).then(p => p.site && { loggedIn: p.site.loggedIn, following: p.site.following }, () => 'none') }));
    assert.fail('no Unfollow on Kick: ' + JSON.stringify(seen));
  });
  await w.click('.pf-acts .unf');
  await w.waitForSelector('#askDlg:not([hidden])');
  assert.match(await w.textContent('#askTitle'), /Unfollow Al on Kick\?/);
  assert.equal(await w.isVisible('#askDlg .ask-chk'), true);
  await w.click('#askDlg .ask-no');
  assert.deepEqual((await asked()).unfollowed, [], 'Cancel does nothing');
  await w.click('.pf-acts .unf');
  await w.check('#askDlg .ask-chk input');
  await w.click('#askDlg .ask-yes');
  await w.waitForFunction(() => !JSON.parse(localStorage.getItem('kickMultiview.saved')).includes('alpha'));
  assert.deepEqual((await asked()).unfollowed, ['alpha']);
  await w.waitForFunction(() => !document.querySelector('.pf-acts .unf'), null, { timeout: 5000 });
  assert.match(await w.textContent('.pf-acts'), /★ Save/, 'not saved any more, and can be saved again');
  await w.click('.pf-acts .btn:has-text("★ Save")');
  await w.waitForFunction(() => JSON.parse(localStorage.getItem('kickMultiview.saved')).includes('alpha'));
  await w.keyboard.press('Escape');
  assert.equal(await w.isHidden('#profDlg'), true);
});

test('the Import follows list has Unfollow for Kick channels', T, async () => {
  const w = a.win;
  await a.app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('follows:import'); ipcMain.handle('follows:import', () => ({ items: [{ ch: 'bravo', name: 'bravo' }, { ch: 'delta', name: 'Delta' }] })); });
  await w.evaluate(() => window.importFollows('kick'));
  await w.waitForSelector('#importDlg .dlg-list label .unf');
  assert.equal(await w.$$eval('#importDlg .dlg-list label .unf', e => e.length), 2);
  await w.click('#importDlg .dlg-list label:has-text("Delta") .unf');
  await w.waitForSelector('#askDlg:not([hidden])');
  assert.equal(await w.isHidden('#askDlg .ask-chk'), true, 'not saved, so nothing to remove');
  await w.click('#askDlg .ask-yes');
  await w.waitForFunction(() => ![...document.querySelectorAll('#importDlg .dlg-list label')].some(l => /Delta/.test(l.textContent)));
  assert.deepEqual((await asked()).unfollowed, ['alpha', 'delta']);
  assert.equal(await w.isChecked('#importDlg .dlg-list label:has-text("bravo") input'), true, 'clicking Unfollow didn\'t tick or untick the row');
  await w.keyboard.press('Escape');
});

test('streams are recorded from the live checks, and profiles open from Saved and from a window', T, async () => {
  const w = a.win;
  // the app's own live check sees alpha live (Kick's stand-in says so) and records it
  await w.evaluate(() => window.kmv.checkLiveNow());
  const p = await until(async () => { const p = await w.evaluate(() => window.kmv.profileGet('alpha', { local: true })); return p.summary && p.summary.live && p; });
  assert.equal(p.summary.live.title, 'Any% attempts');
  assert.equal(p.summary.live.exact, true, 'with the start time Kick gave');
  // the Saved panel's profile button
  await w.click('#savedBtn');
  await w.click('#savedList .sv:has-text("bravo") .prof');
  await w.waitForFunction(() => /Bee/.test((document.querySelector('.pf-prof h2') || {}).textContent || ''));
  assert.equal(await w.isHidden('#savedPanel'), true);
  await w.click('#profDlg .pf-back');
  assert.equal(await w.isVisible('.pf-dir'), true);
  await w.keyboard.press('Escape');
  // a stream window's profile button
  await openChannel(w, 'bravo');
  await w.waitForSelector('#stage .win.stream [data-a=profile]');
  await w.click('#stage .win.stream [data-a=profile]');
  await w.waitForFunction(() => /Bee/.test((document.querySelector('.pf-prof h2') || {}).textContent || ''));
  await w.keyboard.press('Escape');
});

test('opening a channel from the Channels box asks Kick whether it exists, and stops only when Kick says it doesn\'t', T, async () => {
  const w = a.win;
  assert.equal(await w.evaluate(() => window.kmv.channelExists('bravo')), 'yes');
  assert.equal(await w.evaluate(() => window.kmv.channelExists('not a channel!')), 'unknown', 'not a channel name: not asked');
  await w.click('#savedBtn');
  await w.fill('#savedInput', 'zzghost');
  await w.click('#spOpen');
  await w.waitForSelector('#spErr:not([hidden])');
  assert.match(await w.textContent('#spErr'), /no Kick channel called “zzghost”/);
  assert.ok(await w.$eval('#spPlat [data-p=kick]', b => b.classList.contains('bad')), 'Kick is outlined in red');
  assert.equal(await w.locator('#stage .win:has(.title:text-is("zzghost"))').count(), 0, 'nothing opens');
  assert.ok((await asked()).asked.includes('GET /api/v2/channels/zzghost'), 'Kick was asked');
  await w.fill('#savedInput', '');
  await w.keyboard.press('Escape');
});

test('a newly saved channel gets its picture in the background, without opening its profile', T, async () => {
  const w = a.win;
  // the picture itself, from a stand-in for Kick's image host
  await a.app.evaluate(({ session, net }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    session.defaultSession.protocol.handle('https', req => /^https:\/\/files\.kick\.com\//.test(req.url)
      ? new Response(png, { headers: { 'content-type': 'image/png' } }) : net.fetch(req, { bypassCustomProtocolHandlers: true }));
  });
  await w.click('#savedBtn');
  await w.fill('#savedInput', 'echo');
  await w.click('#spOpenSave');
  await w.waitForSelector('#savedList .sv:has-text("echo")');
  // asked for once, soon after saving, and the row swaps its letter for the picture by itself
  await w.waitForSelector('#savedList .sv:has-text("echo") .sv-av img', { timeout: 30000 });
  assert.equal(await w.$eval('#savedList .sv:has-text("echo") .sv-av img', i => i.src), 'https://files.kick.com/images/echo.png');
  // and so does the start of its window's name dropdown (it opened when saved)
  const barPic = () => w.evaluate(() => { const s = [...document.querySelectorAll('#stage .win .col-pick')].find(s => s.value === 'echo'); const i = s && s.closest('.bar').querySelector('.bar-av img'); return i && i.src; });
  assert.equal(await until(barPic), 'https://files.kick.com/images/echo.png');
  const info = (await w.evaluate(() => window.kmv.profileList(['echo']))).echo.info;
  assert.equal(info.name, 'Echo');
  assert.equal(info.followers, 77);
  // the profile, fetched once (its past broadcasts are only asked for with it; the live check asks for the channel too)
  assert.equal((await asked()).asked.filter(x => x === 'GET /api/v2/channels/echo/videos').length, 1);
  await w.keyboard.press('Escape');
});

test('a Kick profile seen before you signed in is asked again once you are signed in', T, async () => {
  const w = a.win;
  const cookie = on => a.app.evaluate(({ session }, on) => {
    const c = session.fromPartition('persist:kick').cookies;
    return on ? c.set({ url: 'https://kick.com', name: 'session_token', value: 'test' }) : c.remove('https://kick.com', 'session_token');
  }, on);
  await cookie(false);
  await w.waitForTimeout(500);                                       // the page sees the change
  const before = await w.evaluate(() => window.kmv.profileGet('bravo', { refresh: true }));
  assert.equal(before.site.loggedIn, false);
  await cookie(true);
  await w.waitForTimeout(500);
  const after = await w.evaluate(() => window.kmv.profileGet('bravo'));
  assert.equal(after.site.loggedIn, true, 'not the copy kept from before');
  assert.deepEqual(after.site.following, { since: null });
});
