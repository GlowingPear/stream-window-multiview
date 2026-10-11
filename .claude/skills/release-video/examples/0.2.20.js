// What's new in 0.2.20: streamer profiles. A made-up six weeks of history is written to profiles.json before
// the app starts (seed), so the heatmap, stat tiles and history are full; stage.js answers like Kick's API.
const fs = require('fs');
const path = require('path');

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// streams on the given weekdays (0 = Monday) from `hour`, for six weeks; every other one seen by the app, the rest past broadcasts
function history(days, hour, hours, title, cat, viewers) {
  const now = Date.now(), sessions = [];
  for (let d = 42; d >= 1; d--) {
    const day = new Date(now - d * DAY), wd = (day.getDay() + 6) % 7;
    if (!days.includes(wd)) continue;
    const s = new Date(day); s.setHours(hour, (d * 7) % 25, 0, 0);
    const start = s.getTime(), end = start + (hours + (d % 3) * .5) * HOUR, app = d % 2 === 0, v = Math.round(viewers * (.8 + (d % 5) * .1));
    sessions.push({ start, end, last: end, exact: true, src: app ? 'app' : 'vod', vod: app ? undefined : 'v' + d, title, cat,
      peak: app ? Math.round(v * 1.3) : null, vsum: app ? v * 10 : 0, vn: app ? 10 : 0, samples: [], titles: [], cats: [{ at: start, c: cat }] });
  }
  return { tracked: now - 43 * DAY, sessions, followers: [] };
}

module.exports = {
  name: 'stream-multiview-0.2.20',
  poster: { v: '0.2.20', h: "What's new", p: 'Streamer profiles: who streams when, what they played, and your own notes' },
  features: 4,
  seed(data) {
    const dir = path.join(data, 'Stream Multiview');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ v: 1,
      ch: { pixelpear: history([1, 2, 3], 19, 4, 'Any% practice', 'Speedrun practice', 700),
        nightowl: history([3, 4, 5, 6], 22, 3, 'Late night chill', 'Just Chatting', 180),
        arcadia: history([0, 2, 4], 17, 3, 'High score hunt', 'Retro arcade', 400),
        lofilane: history([0, 1, 2, 3, 4], 9, 6, 'Beats to code to', 'Lo-fi & coding', 1200) },
      meta: { pixelpear: { fav: true, tags: ['Speedrun'] }, lofilane: { notes: 'Great for work mornings', tags: ['Music'] } } }));
  },
  async run(t) {
    const { m, wait, card, uncard, feature, click, moveTo, type, ring, unring } = t;

    // ---- Opening (channels added and saved behind it)
    await card({ h: 'Stream Multiview', odo: ['0.2.19', '0.2.20'], items: ['A Profiles directory for everyone you follow', 'A profile per streamer: when they stream, what they play', 'Your own notes and tags · Unfollow on Kick'] });
    await t.add(t.stage.CHANNELS.slice(0, 4));
    await m.evaluate(() => document.querySelectorAll('#stage .win.stream [data-a="star"]').forEach(b => b.click()));
    await m.evaluate(() => { document.querySelector('#layoutBtn').click(); document.querySelector('#layoutMenu [data-l="auto"]').click(); });
    await m.evaluate(() => window.kmv.checkLiveNow());
    await wait(5000);
    await uncard(); await wait(900);

    // ---- Profiles directory
    await feature('0.2.20', 'Streamer Profiles', "Everyone you've saved, with who's live, when they last streamed and your tags", '0.2.19');
    await click('#profBtn'); await wait(1600);
    await click('.pf-chips[data-g=flag] [data-v=fav]'); await wait(1300);
    await click('.pf-chips[data-g=flag] [data-v=fav]'); await wait(600);
    await type('#pfQ', 'music'); await wait(1400);
    await m.fill('#pfQ', ''); await wait(900);

    // ---- A profile
    await feature('0.2.20', 'A profile for each streamer', 'What the site says, the live stream, and numbers from what the app has seen');
    await click('.pf-card[data-ch=pixelpear]'); await wait(2000);
    await ring('.pf-now'); await wait(2200);
    await ring('.pf-stats'); await wait(2200); await unring();
    await moveTo('.pf-prof', { fy: .6 });
    for (let i = 0; i < 8; i++) { await m.mouse.wheel(0, 60); await wait(70); } await wait(1200);
    await ring('.pf-heat-g'); await wait(2400); await unring();
    for (let i = 0; i < 8; i++) { await m.mouse.wheel(0, 70); await wait(70); } await wait(2200);

    // ---- Notes and tags
    await feature('0.2.20', 'Your own notes, tags and nickname', 'Kept on this computer, and searchable from the directory');
    await type('.pf-notes textarea', 'Raid train on Friday'); await wait(500);
    await type('.pf-notes [data-k=tag]', 'Friends'); await m.keyboard.press('Enter'); await wait(1600);

    // ---- Unfollow on Kick
    await feature('0.2.20', 'Unfollow on Kick', 'From a profile or the Import follows list. It always asks first');
    await click('.pf-acts .unf'); await wait(2600);
    await click('#askDlg .ask-no'); await wait(600);
    await m.keyboard.press('Escape'); await wait(600);
    await t.cap('0.2.20', 'Open a profile from any window', 'The person button on every stream and chat bar');
    await moveTo('#stage .win.stream [data-a=profile]'); await wait(1400);
    await click('#stage .win.stream [data-a=profile]'); await wait(2400);
    await m.keyboard.press('Escape'); await t.uncap(); await wait(500);

    // ---- Outro
    await card({ h: 'Get 0.2.20', p: 'Settings › Updates › Check now', items: ['Streamer profiles · live history · notes and tags', 'Unfollow on Kick · exact stream start times'] });
    await wait(3800);
  }
};
