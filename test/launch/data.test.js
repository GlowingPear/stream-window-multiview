// The app's own data in the real desktop app (src/main/db.js): what an older version kept in profiles.json,
// event-samples.json and follows.json is copied into stream-multiview.db as it starts, once; the files stay as they
// were, and what the app saves after that lasts to the next start.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { launchApp, assert, saved } = require('./app');
const { tempDir } = require('../helpers');

const T = { timeout: 120000 };

test('an older version\'s files are copied in once and left where they were; the data lasts to the next start', T, async () => {
  const data = tempDir('data'), home = path.join(data, 'Stream Multiview');
  fs.mkdirSync(home, { recursive: true });
  const now = Date.now();
  const files = {
    'profiles.json': { v: 1, ch: { alpha: { tracked: now - 1000, sessions: [], followers: [], info: { name: 'Alpha' } } }, meta: { alpha: { notes: 'Raid train', tags: [] } } },
    'event-samples.json': { kick: { MysteryEvent: { n: 3, first: now, last: now, samples: [] } }, twitch: {}, youtube: {} },
    'follows.json': { sites: { kick: { at: now, items: [{ ch: 'delta', name: 'Delta' }] } } }
  };
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(home, f), JSON.stringify(v));
  let a = await launchApp({ data, hidden: true });
  try {
    assert.ok(await a.win.evaluate(async () => (await window.kmv.samplesInfo()).kick.MysteryEvent.n === 3), 'the chat events');
    const p = saved(data).profiles();
    assert.equal(p.ch.alpha.info.name, 'Alpha');
    assert.equal(p.meta.alpha.notes, 'Raid train');
    assert.ok(saved(data).get('follows'), 'the follow lists');
    assert.deepEqual(saved(data).get('imported').files, ['profiles.json', 'event-samples.json', 'follows.json']);
    await a.win.evaluate(() => window.kmv.samplesAdd('kick', { MysteryEvent: { n: 2 } }));
  } finally { await a.close(); }
  for (const f of Object.keys(files)) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, f), 'utf8')), files[f], `${f} left as it was`);
  // a changed old file isn't copied in again: the database is what counts now
  fs.writeFileSync(path.join(home, 'event-samples.json'), JSON.stringify({ kick: {}, twitch: {}, youtube: {} }));
  a = await launchApp({ data, hidden: true });
  try {
    assert.equal(await a.win.evaluate(async () => (await window.kmv.samplesInfo()).kick.MysteryEvent.n), 5, 'what was saved at quit');
  } finally { await a.close(); }
});
