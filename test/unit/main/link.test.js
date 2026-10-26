// The link with Pear Drops (src/main/link.js), with Grapevine's stand-in Pear Drops in a folder of the test's own:
// the switch starts and stops it, what Pear Drops farms reaches the page, and players.changed goes out only when
// it changes, in the shape Grapevine's schema asks for.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPearLink, mergePlayers, safeCrypt, PEAR_DROPS } = require('../../../src/main/link');
// Grapevine is a dependency of the app: the quick tests (npm test with nothing installed) skip what needs it,
// and the app tests, after npm install, run everything.
const HAVE = (() => { try { require.resolve('@streamorchard/grapevine'); return true; } catch { return false; } })();
const NEEDS = { skip: !HAVE && 'needs @streamorchard/grapevine (npm install)' };
const { standInPeer } = HAVE ? require('@streamorchard/grapevine/stand-in-peer') : {};
const { fixtures } = HAVE ? require('@streamorchard/grapevine/fixtures') : {};
const { paths } = HAVE ? require('@streamorchard/grapevine') : {};

const FAST = { pollMs: 50, backoffMs: [50] };
const MULTIVIEW = require('../../../package.json').grapevine.app;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(20)) if (await fn()) return true;
  throw new Error('timed out waiting for ' + fn);
}
const farmingFixture = () => { const { seq, at, ...data } = fixtures('drops.farming', 1).valid.find(f => f.name === 'farming').params; return data; };

// A multiview link and (optionally) a stand-in Pear Drops sharing a temporary Grapevine folder. Everything is
// stopped before the folder goes: a link still running could make it again while it's removed.
async function setup(t, { peer = true, peerTiming = {}, provides = { 'drops.farming': '1.0' }, ...o } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-link-'));
  const dir = path.join(root, 'gv');
  const sent = [];
  const pl = await createPearLink({ version: '0.4.0', userData: path.join(root, 'data'), appData: root, dev: true, env: { GRAPEVINE_DIR: dir }, send: st => sent.push(st), timing: FAST, strict: true, ...o });
  const stand = peer ? await standInPeer({ as: PEAR_DROPS, dir, version: '0.1.6', provides, uses: { players: '1.0' }, timing: { ...FAST, ...peerTiming } }) : null;
  const heard = [];
  stand?.link.on('event', (from, name, params) => heard.push({ name, params }));
  const alive = setInterval(() => {}, 1000);    // a request's timeout timer doesn't keep the process alive by itself
  t.after(async () => {
    clearInterval(alive);
    await pl.stop();
    await stand?.stop();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { pl, stand, sent, heard, dir, root };
}
const connected = pl => pl.state().peer.status === 'connected';
// A first pairing waits for Allow on the card (confirmPairing): it asks, Allow pairs. This side is connected one
// message before the stand-in is: wait for both, or what the stand-in does next (e.g. Disconnect) finds no link.
async function allowed(pl, stand) {
  await until(() => pl.state().peer.status === 'confirm' || connected(pl));
  if (!connected(pl)) pl.allowPairing();
  await until(() => connected(pl) && stand.link.isConnected(MULTIVIEW));
}

test('the switch starts and stops the link: off, no socket; on, Pear Drops connects', NEEDS, async t => {
  const { pl, dir } = await setup(t);
  const slugs = () => paths.listSlugs({ env: { GRAPEVINE_DIR: dir } });
  assert.deepEqual(slugs(), ['pear-drops'], 'off: only Pear Drops listens');
  let st = pl.state();
  assert.equal(st.on, false);
  assert.equal(st.peer.status, 'off');
  assert.equal(st.open, true, 'Pear Drops is open');
  assert.equal(st.peer.icon, undefined, 'the logo goes on its own');
  assert.equal(st.peer.installed, false, 'not installed: a test looks in its own folder');
  st = await pl.setOn(true);
  assert.equal(st.on, true);
  assert.ok(slugs().includes('stream-multiview'), 'on: it listens');
  // the first pairing waits for Allow: another program running as you can't pair as Pear Drops by itself
  await until(() => pl.state().peer.status === 'confirm');
  assert.deepEqual(pl.state().peer.asking, { name: 'Pear Drops (stand-in)', version: '0.1.6' }, 'who asks');
  await sleep(200);
  assert.equal(pl.state().peer.status, 'confirm', 'nothing pairs until Allow');
  assert.equal(pl.allowPairing().on, true);
  await until(() => connected(pl));
  assert.equal(pl.state().peer.version, '0.1.6');
  await pl.setOn(true);                                 // again: nothing changes
  await pl.setOn(false);
  assert.deepEqual(slugs(), ['pear-drops'], 'off again: no socket');
  assert.equal(pl.state().peer.status, 'off');
});

test('what Pear Drops farms reaches the page (both windows), and goes when it disconnects', NEEDS, async t => {
  const { pl, stand, sent } = await setup(t);
  await pl.setOn(true);
  await allowed(pl, stand);
  stand.link.publish('drops.farming.changed', farmingFixture());
  await until(() => pl.state().farming);
  assert.equal(pl.state().farming.state, 'farming');
  assert.equal(pl.state().farming.channel.slug, 'pixelpear');
  assert.equal(sent.at(-1).farming.channel.slug, 'pixelpear', 'pushed to the page');
  await stand.stop();
  await until(() => !connected(pl));
  assert.equal(pl.state().farming, null, 'disconnected: not farming any more');
});

test('Pear Drops\' daily reward reaches the page, is gone when it disconnects or is switched off, and the chest asks it to show it', NEEDS, async t => {
  const { pl, stand, sent } = await setup(t, { provides: { 'drops.farming': '1.0', 'rewards.daily': '1.0' } });
  let shown = 0;
  stand.link.handle('rewards.daily.show', () => { shown++; return { shown: true }; });
  assert.deepEqual(await pl.showReward(), { shown: false }, 'not connected: nothing to ask');
  await pl.setOn(true);
  await allowed(pl, stand);
  assert.equal(pl.state().reward, null, 'nothing said yet');
  assert.deepEqual(pl.state().peer.shares.in, ['drops.farming', 'rewards.daily']);
  const ready = fixtures('rewards.daily', 1).valid.find(f => f.name === 'ready').params;
  const { seq, at, ...data } = ready;
  stand.link.publish('rewards.daily.changed', data);
  await until(() => pl.state().reward);
  assert.equal(pl.state().reward.state, 'ready');
  assert.equal(sent.at(-1).reward.state, 'ready', 'pushed to the page');
  stand.link.publish('drops.farming.changed', farmingFixture());
  await until(() => pl.state().farming);
  assert.equal(pl.state().reward.state, 'ready', 'farming doesn\'t touch it');
  assert.deepEqual(await pl.showReward(), { shown: true });
  assert.equal(shown, 1);
  await pl.setOn(false);
  assert.equal(pl.state().reward, null, 'switched off: gone');
  await pl.setOn(true);
  await allowed(pl, stand);
  await until(() => pl.state().reward, 5000);    // a subscriber gets the last one at once
  await stand.stop();
  await until(() => !connected(pl));
  assert.equal(pl.state().reward, null, 'disconnected: gone');
});

test('an older Pear Drops, without rewards.daily: no reward, and Show asks nothing', NEEDS, async t => {
  const { pl, stand } = await setup(t);
  await pl.setOn(true);
  await allowed(pl, stand);
  assert.deepEqual(pl.state().peer.shares.in, ['drops.farming']);
  assert.equal(pl.state().reward, null);
  assert.deepEqual(await pl.showReward(), { shown: false });
});

test('players.changed goes out only when it changes, merged from both windows, in the schema\'s shape', NEEDS, async t => {
  const { pl, stand, heard } = await setup(t);
  await pl.setOn(true);
  await allowed(pl, stand);
  const site = (signedIn, open) => ({ platforms: { kick: { signedIn, mode: 'auto', account: { platform: 'kick', user: 'pearfan' }, open: open.map(slug => ({ platform: 'kick', slug })) } } });
  const sent = pl.playersReport('main', site(true, ['pixelpear']));
  assert.ok(sent && sent.seq >= 1 && sent.at, 'published, with seq and at');
  const valid = fixtures('players', 1).valid.find(f => f.name === 'signed-out').params;
  assert.deepEqual(Object.keys(sent.platforms.kick).sort(), Object.keys(valid.platforms.kick).sort(), 'the fields of Grapevine\'s example');
  assert.equal(pl.playersReport('main', site(true, ['pixelpear'])), null, 'the same again: not sent');
  const merged = pl.playersReport('streams', site(true, ['retrorally', 'pixelpear']));
  assert.deepEqual(merged.platforms.kick.open.map(c => c.slug), ['pixelpear', 'retrorally'], 'both windows\' streams');
  assert.equal(pl.playersReport('main', site(false, ['pixelpear'])).platforms.kick.signedIn, false);
  assert.deepEqual(pl.streamsClosed().platforms.kick.open.map(c => c.slug), ['pixelpear'], 'the streams window closed: its streams are gone');
  assert.equal(pl.playersReport('main', null), null, 'nothing reported: nothing to send');
  await until(() => heard.some(h => h.name === 'players.changed' && h.params.platforms.kick.signedIn === false));
  assert.throws(() => pl.playersReport('main', { platforms: { kick: { signedIn: 'yes', mode: 'auto', account: null, open: [] } } }), /schema/, 'a wrong shape is caught (strict in tests)');
});

test('Test: a round trip when connected; why not when Pear Drops isn\'t open', NEEDS, async t => {
  const { pl, stand } = await setup(t);
  assert.equal((await pl.test()).reason, 'off', 'switched off here');
  await pl.setOn(true);
  await allowed(pl, stand);
  const ok = await pl.test();
  assert.equal(ok.ok, true);
  assert.match(ok.text, /^Pear Drops 0\.1\.6 answered in \d+ ms$/);
  await stand.stop();
  await until(() => !connected(pl));
  const no = await pl.test();
  assert.deepEqual([no.ok, no.reason], [false, 'not-running']);
  assert.match(no.text, /isn't open/);
});

test('Open Pear Drops asks it to come to the front; the logo; Pair again and Disconnect forget the pairing', NEEDS, async t => {
  const { pl, stand, root } = await setup(t);
  let shown = 0;
  stand.link.handle('drops.farming.show', () => { shown++; return { shown: true }; });
  assert.deepEqual(await pl.showPearDrops(), { shown: false }, 'not connected: nothing to ask');
  await pl.setOn(true);
  await allowed(pl, stand);
  assert.deepEqual(await pl.showPearDrops(), { shown: true });
  assert.equal(shown, 1);
  assert.match(pl.icon(), /^data:image\/png;base64,/);
  const keys = () => JSON.parse(fs.readFileSync(path.join(root, 'data', 'grapevine.json'), 'utf8')).peers;
  assert.ok(keys()[PEAR_DROPS], 'paired: the key is kept');
  assert.ok(pl.state().peer.pairedAt);
  assert.equal(pl.state().peer.keysEncrypted, false, 'no safeStorage: stored as they are');
  assert.equal(pl.pairAgain().peer.status, 'connected', 'Pair again keeps the open connection');
  const st = await pl.disconnect();
  assert.equal(st.on, false, 'Disconnect switches it off');
  assert.equal(keys()[PEAR_DROPS], undefined, 'and forgets the pairing');
});

// a stand-in for Electron's safeStorage (its async calls; the sync ones are gone in Electron 46)
const fakeSafe = (o = {}) => ({
  isAsyncEncryptionAvailable: async () => o.available !== false,
  encryptStringAsync: async s => Buffer.from('enc:' + s),
  decryptStringAsync: async b => { const t = b.toString(); if (!t.startsWith('enc:')) throw new Error('not ours'); return { result: t.slice(4), shouldReEncrypt: !!o.rotate }; }
});
test('with safeStorage, the pairing keys are stored encrypted', NEEDS, async t => {
  const { pl, stand, root } = await setup(t, { safeStorage: fakeSafe() });
  await pl.setOn(true);
  await allowed(pl, stand);
  assert.equal(pl.state().peer.keysEncrypted, true);
  const file = path.join(root, 'data', 'grapevine.json');
  await until(() => JSON.parse(fs.readFileSync(file, 'utf8')).peers[PEAR_DROPS]);
  const kept = JSON.parse(fs.readFileSync(file, 'utf8')).peers[PEAR_DROPS];
  assert.equal(kept.encrypted, true);
  assert.match(Buffer.from(kept.key, 'base64').toString(), /^enc:/);
});

test('the pairing kept: the app started again connects with its key, without asking to pair again', NEEDS, async t => {
  const safe = fakeSafe();
  const { pl, stand, root, dir } = await setup(t, { safeStorage: safe });
  await pl.setOn(true);
  await allowed(pl, stand);
  const file = path.join(root, 'data', 'grapevine.json');
  await until(() => JSON.parse(fs.readFileSync(file, 'utf8')).peers[PEAR_DROPS]);
  await pl.stop();
  const again = await createPearLink({ version: '0.4.0', userData: path.join(root, 'data'), appData: root, dev: true, env: { GRAPEVINE_DIR: dir }, safeStorage: safe, timing: FAST, strict: true });
  t.after(() => again.stop());
  await until(() => again.state().peer.pairedAt);
  const seen = new Set();
  await again.setOn(true);
  await until(() => { seen.add(again.state().peer.status); return connected(again); });
  assert.ok(!seen.has('confirm'), 'no Allow: still paired');
  await again.stop();
});

test('the key store: keys saved before (by the sync calls, or unencrypted) still read, a rotated key is saved again, one that can\'t be read is not paired', NEEDS, async t => {
  const { fileKeyStore } = require('@streamorchard/grapevine');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-keys-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'grapevine.json');
  const enc = k => Buffer.from('enc:' + k).toString('base64');
  fs.writeFileSync(file, JSON.stringify({ peers: {
    a: { key: enc('KEY-A'), encrypted: true, pairedAt: '2026-10-01T00:00:00.000Z' },       // as fileKeyStore wrote it with encryptString
    b: { key: 'PLAIN-B', pairedAt: '2026-10-02T00:00:00.000Z' },                          // from before encryption
    c: { key: Buffer.from('other keychain').toString('base64'), encrypted: true, pairedAt: 'x' }
  } }));
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8')).peers;
  let rotated = 0;
  const ks = fileKeyStore(file, await safeCrypt({ ...fakeSafe({ rotate: true }), encryptStringAsync: async s => { rotated++; return Buffer.from('enc:' + s); } }));
  await ks.ready;
  assert.equal(ks.encrypted, true);
  assert.deepEqual(ks.get('a'), { key: 'KEY-A', pairedAt: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(ks.get('b'), { key: 'PLAIN-B', pairedAt: '2026-10-02T00:00:00.000Z' });
  assert.equal(ks.get('c'), null, 'can\'t be read: as good as not paired');
  await until(() => rotated === 1);
  assert.equal(read().a.encrypted, true, 'rotated: saved again, still encrypted');
  // a new key: written encrypted, never as it is
  ks.set('e', 'KEY-E');
  await until(() => read().e);
  assert.equal(Buffer.from(read().e.key, 'base64').toString(), 'enc:KEY-E');
  assert.ok(!JSON.stringify(read()).includes('KEY-E'));
});

test('safeCrypt: safeStorage\'s async calls, or none (keys as they are) when it can\'t encrypt', async () => {
  const c = await safeCrypt(fakeSafe({ rotate: true }));
  const stored = await c.encrypt('KEY');
  assert.equal(Buffer.from(stored, 'base64').toString(), 'enc:KEY', 'base64, as Grapevine stores it');
  assert.deepEqual(await c.decrypt(stored), { text: 'KEY', reEncrypt: true });
  assert.deepEqual(await (await safeCrypt(fakeSafe())).decrypt(stored), { text: 'KEY', reEncrypt: false });
  await assert.rejects(c.decrypt(Buffer.from('other keychain').toString('base64')));
  assert.deepEqual(await safeCrypt(fakeSafe({ available: false })), {});
  assert.deepEqual(await safeCrypt({ isAsyncEncryptionAvailable: () => Promise.reject(new Error('no keychain')) }), {});
  assert.deepEqual(await safeCrypt(null), {});
});

test('where it looks for apps: GRAPEVINE_DIR, else a developer copy\'s own folder, else the system\'s', NEEDS, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dev = await createPearLink({ version: '0.4.0', userData: root, appData: root, dev: true, env: {} });
  fs.mkdirSync(path.join(root, 'demo-apps', 'Pear Drops'), { recursive: true });
  assert.equal(dev.state().peer.installed, true, 'a developer copy: "installed" in its own folder');
  assert.equal(dev.state().open, false);
  await dev.setOn(true);
  assert.ok(fs.existsSync(path.join(root, 'grapevine')) || paths.listSlugs({ env: { GRAPEVINE_DIR: path.join(root, 'grapevine') } }).includes('stream-multiview'), 'its own folder');
  await dev.stop();
  const real = await createPearLink({ version: '0.4.0', userData: root, appData: path.join(root, 'nowhere'), env: {} });
  assert.equal(real.state().peer.installed, false, 'the installed app looks in the system\'s app data folder');
  assert.equal(real.state().wait, null);
});

test('a link that can\'t start (another copy is using Grapevine) says why', NEEDS, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-link-'));
  const env = { GRAPEVINE_DIR: path.join(root, 'gv'), SMV_LINK_SIGN_BACK_IN_MS: '500' };
  const first = await createPearLink({ version: '0.4.0', userData: path.join(root, 'a'), appData: root, env });
  const logs = [];
  const second = await createPearLink({ version: '0.4.0', userData: path.join(root, 'b'), appData: root, env, log: (level, text) => logs.push([level, text]) });
  t.after(async () => { await first.stop(); await second.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  await first.setOn(true);
  const st = await second.setOn(true);
  assert.equal(st.on, true);
  assert.equal(st.wait, 500, 'the tests\' shorter wait to sign back in');
  assert.ok(logs.some(([level, text]) => level === 'error' && /already using Grapevine/.test(text)), 'the error is logged');
  await second.setOn(false);
});

test('the Activity log: the hello without its data, what each side sends, the widget\'s round trip, a Test and a Grapevine error as notes, the heartbeat, the disconnect', NEEDS, async t => {
  let told = 0;
  const { pl, stand } = await setup(t, { strict: false, peerTiming: { pingMs: 100 }, activity: () => told++ });
  stand.link.handle('drops.farming.show', () => ({ shown: true }));
  await pl.setOn(true);
  await allowed(pl, stand);
  const all = (filter = 'all') => pl.activityPage({ filter, limit: 50 }).entries;
  await until(() => all().some(e => e.kind === 'status' && e.text === 'Connected to Pear Drops' && e.tone === 'ok'));
  const hello = all().filter(e => e.method === 'link.hello');
  assert.deepEqual(hello.map(e => [e.dir, e.kind]).reverse(), [['in', 'request'], ['out', 'error'], ['in', 'request'], ['out', 'reply']],
    'Pear Drops says hello, and is told to wait for Allow; once allowed, this side answers');
  assert.equal(pl.activityPage({ filter: 'problems' }).entries.length, 0, 'waiting for Allow isn\'t a problem');
  assert.ok(hello.every(e => e.data === undefined && e.bytes > 0), 'without the pairing\'s secrets');
  assert.ok(all().filter(e => e.method === 'link.auth').every(e => e.data === undefined));
  // received and sent
  stand.link.publish('drops.farming.changed', farmingFixture());
  await until(() => all('in').some(e => e.method === 'drops.farming.changed'));
  assert.equal(all('in').find(e => e.method === 'drops.farming.changed').data.channel.slug, 'pixelpear');
  pl.playersReport('main', { platforms: { kick: { signedIn: false, mode: 'auto', account: { platform: 'kick', user: 'pearfan' }, open: [{ platform: 'kick', slug: 'pixelpear' }] } } });
  const out = all('out').find(e => e.method === 'players.changed');
  assert.equal(out.kind, 'event');
  assert.equal(out.data.platforms.kick.signedIn, false);
  // the widget's click: a request, and its reply with how long it took
  await pl.showPearDrops();
  const show = all().filter(e => e.method === 'drops.farming.show');
  assert.deepEqual(show.map(e => [e.dir, e.kind]), [['in', 'reply'], ['out', 'request']]);
  assert.equal(typeof show[0].ms, 'number');
  assert.deepEqual(show[0].data, { shown: true });
  // a Test is a note, not a message
  await pl.test();
  assert.match(all().find(e => e.kind === 'status' && /^Test: /.test(e.text)).text, /^Test: Pear Drops 0\.1\.6 answered in \d+ ms$/);
  // a message Grapevine wouldn't send lands under Problems
  assert.equal(pl.activityPage().problems, 0);
  pl.playersReport('main', { platforms: { kick: { signedIn: 'yes', mode: 'auto', account: null, open: [] } } });
  const bad = all('problems');
  assert.ok(bad.length && bad.every(e => e.kind === 'note' && e.tone === 'bad'), 'Grapevine\'s errors, as notes');
  assert.match(bad[0].text, /^Not sent: players\.changed doesn't fit/);
  // the heartbeat: Pear Drops asks, this side answers; counted, never listed
  await until(() => pl.activityPage().totals.pings > 0);
  assert.ok(Date.now() - pl.activityPage().totals.heard < 2000, 'heard just now');
  assert.ok(!all().some(e => e.method === 'link.ping'));
  assert.ok(told > 0, 'the page is told there\'s something new');
  // the disconnect: a note, and the heartbeat forgotten
  await stand.stop();
  await until(() => all().some(e => e.kind === 'status' && /^Disconnected from Pear Drops/.test(e.text)));
  assert.equal(pl.activityPage().totals.heard, null);
  assert.equal(pl.activityPage({ before: 2, limit: 50 }).entries.length, 1, 'paged by before');
});

test('the Activity log notes Pear Drops forgetting the pairing, and a Test that fails', NEEDS, async t => {
  const { pl, stand } = await setup(t);
  await pl.setOn(true);
  await allowed(pl, stand);
  await stand.link.disconnect(MULTIVIEW);
  // (the stand-in asks to pair again straight away, and keeps asking every 50 ms until Allow: a bigger page)
  const all = () => pl.activityPage({ limit: 500 }).entries;
  // (among the problems: the stand-in keeps asking to pair again, and its hellos fill the newest entries)
  await until(() => pl.activityPage({ filter: 'problems', limit: 50 }).entries.some(e => e.kind === 'status' && e.tone === 'warn' && e.text === 'Pear Drops disconnected: both apps forgot the pairing'));
  await stand.stop();
  await until(() => !connected(pl));
  await pl.test();
  assert.ok(all().some(e => e.kind === 'status' && e.tone === 'warn' && /^Test: .*isn't open/.test(e.text)), 'a failed Test is a warning');
});

test('the Activity log takes the page\'s notes about its Kick players: text only, and not too much of it', NEEDS, async t => {
  let told = 0;
  const { pl } = await setup(t, { peer: false, activity: () => told++ });
  const all = () => pl.activityPage({ limit: 50 }).entries;
  pl.playersNote('  Farming stopped · Kick players sign back in at 17:05:00 (in 5 min) ');
  assert.deepEqual(all().map(e => [e.kind, e.tone, e.about, e.text]), [['status', '', 'players', 'Farming stopped · Kick players sign back in at 17:05:00 (in 5 min)']]);
  assert.equal(told, 1, 'the page is told');
  for (const bad of [null, 42, { text: 'x' }, '', '   ']) pl.playersNote(bad);
  assert.equal(all().length, 1, 'anything else is ignored');
  pl.playersNote('x'.repeat(500));
  assert.equal(all()[0].text.length, 200);
});

test('mergePlayers: both windows\' players as one', () => {
  const a = { platforms: { kick: { signedIn: true, mode: 'auto', account: null, open: [{ platform: 'kick', slug: 'a' }] } } };
  const b = { platforms: { kick: { signedIn: false, mode: 'auto', account: null, open: [{ platform: 'kick', slug: 'a' }, { platform: 'kick', slug: 'b' }] }, twitch: { signedIn: false, mode: 'signed-out', account: null, open: [] } } };
  assert.equal(mergePlayers(null, null), null);
  assert.deepEqual(mergePlayers(a, null), a);
  assert.deepEqual(mergePlayers(null, b), b);
  const m = mergePlayers(a, b);
  assert.equal(m.platforms.kick.signedIn, true, 'the main window\'s word');
  assert.deepEqual(m.platforms.kick.open.map(c => c.slug), ['a', 'b']);
  assert.deepEqual(m.platforms.twitch, b.platforms.twitch);
});
