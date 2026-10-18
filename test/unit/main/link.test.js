// The link with Pear Drops (src/main/link.js), with Grapevine's stand-in Pear Drops in a folder of the test's own:
// the switch starts and stops it, what Pear Drops farms reaches the page, and players.changed goes out only when
// it changes, in the shape Grapevine's schema asks for.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPearLink, mergePlayers, PEAR_DROPS } = require('../../../src/main/link');
const { standInPeer } = require('@streamorchard/grapevine/stand-in-peer');
const { fixtures } = require('@streamorchard/grapevine/fixtures');
const { paths } = require('@streamorchard/grapevine');

const FAST = { pollMs: 50, backoffMs: [50] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(20)) if (await fn()) return true;
  throw new Error('timed out waiting for ' + fn);
}
const farmingFixture = () => { const { seq, at, ...data } = fixtures('drops.farming', 1).valid.find(f => f.name === 'farming').params; return data; };

// A multiview link and (optionally) a stand-in Pear Drops sharing a temporary Grapevine folder. Everything is
// stopped before the folder goes: a link still running could make it again while it's removed.
async function setup(t, { peer = true, ...o } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-link-'));
  const dir = path.join(root, 'gv');
  const sent = [];
  const pl = createPearLink({ version: '0.4.0', userData: path.join(root, 'data'), appData: root, dev: true, env: { GRAPEVINE_DIR: dir }, send: st => sent.push(st), timing: FAST, strict: true, ...o });
  const stand = peer ? await standInPeer({ as: PEAR_DROPS, dir, version: '0.1.6', provides: { 'drops.farming': '1.0' }, uses: { players: '1.0' }, timing: FAST }) : null;
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

test('the switch starts and stops the link: off, no socket; on, Pear Drops connects', async t => {
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
  await until(() => connected(pl));
  assert.equal(pl.state().peer.version, '0.1.6');
  await pl.setOn(true);                                 // again: nothing changes
  await pl.setOn(false);
  assert.deepEqual(slugs(), ['pear-drops'], 'off again: no socket');
  assert.equal(pl.state().peer.status, 'off');
});

test('what Pear Drops farms reaches the page (both windows), and goes when it disconnects', async t => {
  const { pl, stand, sent } = await setup(t);
  await pl.setOn(true);
  await until(() => connected(pl));
  stand.link.publish('drops.farming.changed', farmingFixture());
  await until(() => pl.state().farming);
  assert.equal(pl.state().farming.state, 'farming');
  assert.equal(pl.state().farming.channel.slug, 'pixelpear');
  assert.equal(sent.at(-1).farming.channel.slug, 'pixelpear', 'pushed to the page');
  await stand.stop();
  await until(() => !connected(pl));
  assert.equal(pl.state().farming, null, 'disconnected: not farming any more');
});

test('players.changed goes out only when it changes, merged from both windows, in the schema\'s shape', async t => {
  const { pl, heard } = await setup(t);
  await pl.setOn(true);
  await until(() => connected(pl));
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

test('Test: a round trip when connected; why not when Pear Drops isn\'t open', async t => {
  const { pl, stand } = await setup(t);
  assert.equal((await pl.test()).reason, 'off', 'switched off here');
  await pl.setOn(true);
  await until(() => connected(pl));
  const ok = await pl.test();
  assert.equal(ok.ok, true);
  assert.match(ok.text, /^Pear Drops 0\.1\.6 answered in \d+ ms$/);
  await stand.stop();
  await until(() => !connected(pl));
  const no = await pl.test();
  assert.deepEqual([no.ok, no.reason], [false, 'not-running']);
  assert.match(no.text, /isn't open/);
});

test('Open Pear Drops asks it to come to the front; the logo; Pair again and Disconnect forget the pairing', async t => {
  const { pl, stand, root } = await setup(t);
  let shown = 0;
  stand.link.handle('drops.farming.show', () => { shown++; return { shown: true }; });
  assert.deepEqual(await pl.showPearDrops(), { shown: false }, 'not connected: nothing to ask');
  await pl.setOn(true);
  await until(() => connected(pl));
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

test('with safeStorage, the pairing keys are stored encrypted', async t => {
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('enc:' + s), decryptString: b => b.toString().slice(4) };
  const { pl, root } = await setup(t, { safeStorage });
  await pl.setOn(true);
  await until(() => connected(pl));
  assert.equal(pl.state().peer.keysEncrypted, true);
  const kept = JSON.parse(fs.readFileSync(path.join(root, 'data', 'grapevine.json'), 'utf8')).peers[PEAR_DROPS];
  assert.equal(kept.encrypted, true);
  assert.match(Buffer.from(kept.key, 'base64').toString(), /^enc:/);
});

test('where it looks for apps: GRAPEVINE_DIR, else a developer copy\'s own folder, else the system\'s', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dev = createPearLink({ version: '0.4.0', userData: root, appData: root, dev: true, env: {} });
  fs.mkdirSync(path.join(root, 'demo-apps', 'Pear Drops'), { recursive: true });
  assert.equal(dev.state().peer.installed, true, 'a developer copy: "installed" in its own folder');
  assert.equal(dev.state().open, false);
  await dev.setOn(true);
  assert.ok(fs.existsSync(path.join(root, 'grapevine')) || paths.listSlugs({ env: { GRAPEVINE_DIR: path.join(root, 'grapevine') } }).includes('stream-multiview'), 'its own folder');
  await dev.stop();
  const real = createPearLink({ version: '0.4.0', userData: root, appData: path.join(root, 'nowhere'), env: {} });
  assert.equal(real.state().peer.installed, false, 'the installed app looks in the system\'s app data folder');
  assert.equal(real.state().wait, null);
});

test('a link that can\'t start (another copy is using Grapevine) says why', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-link-'));
  const env = { GRAPEVINE_DIR: path.join(root, 'gv'), SMV_LINK_SIGN_BACK_IN_MS: '500' };
  const first = createPearLink({ version: '0.4.0', userData: path.join(root, 'a'), appData: root, env });
  const logs = [];
  const second = createPearLink({ version: '0.4.0', userData: path.join(root, 'b'), appData: root, env, log: (level, text) => logs.push([level, text]) });
  t.after(async () => { await first.stop(); await second.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  await first.setOn(true);
  const st = await second.setOn(true);
  assert.equal(st.on, true);
  assert.equal(st.wait, 500, 'the tests\' shorter wait to sign back in');
  assert.ok(logs.some(([level, text]) => level === 'error' && /already using Grapevine/.test(text)), 'the error is logged');
  await second.setOn(false);
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
