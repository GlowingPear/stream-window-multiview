// Connected apps (Settings › Connected apps): the link with Pear Drops, through Grapevine
// (@streamorchard/grapevine). Pear Drops says what it's farming (drops.farming); this app says whether its
// Kick players are signed in (players), so they can leave the drop credit to Pear Drops while it farms. It
// also says how Kick's daily reward is coming along (rewards.daily), for the toolbar's chest: claiming is there.
// Pear Drops connects (its slug sorts first); this app only listens. The page decides who's signed in:
// this only passes things on. Nothing here needs Electron, so the unit tests run it as it is.
const path = require('path');
const { grapevine } = require('../../package.json');

const PEAR_DROPS = 'com.streamorchard.peardrops';

// opts: version (this app's), userData and appData (Electron's folders), dev (a developer copy or a test),
// env, safeStorage (to encrypt the pairing keys, when it can), send(state) (to both windows), activity() (the
// Activity log has something new), and for the tests timing, log and strict (a message that doesn't fit its
// schema throws). Async: it asks safeStorage whether it can encrypt before it reads the pairing keys.
async function createPearLink({ version, userData, appData, dev = false, env = process.env, safeStorage = null, send = () => {}, activity: changed = () => {}, timing, log, strict } = {}) {
  const { createLink, fileKeyStore, KNOWN_APPS, iconDataUrl, paths } = require('@streamorchard/grapevine');   // (loaded when used)
  const { createActivity } = require('./activity');
  const self = KNOWN_APPS.find(a => a.id === grapevine.app);
  const peerApp = KNOWN_APPS.find(a => a.id === PEAR_DROPS);
  // Where apps find each other: GRAPEVINE_DIR if set; a developer copy or a test uses a folder of its own, so it
  // never pairs with the apps you really use. Likewise "Not installed" looks in a folder of its own there.
  const place = env.GRAPEVINE_DIR ? { env } : dev ? { env: { ...env, GRAPEVINE_DIR: path.join(userData, 'grapevine') } } : undefined;
  // The pairing keys (<userData>/grapevine.json): read up front, and link.start() waits for them (keys.ready)
  const keys = fileKeyStore(path.join(userData, 'grapevine.json'), await safeCrypt(safeStorage));
  let on = false;              // the page's link.peardrops setting
  let farming = null;          // the last drops.farming.changed from Pear Drops
  let reward = null;           // the last rewards.daily.changed from Pear Drops
  let running = false;
  const link = createLink({
    app: { id: self.id, formerIds: [], slug: self.slug, name: self.name, version, summary: self.summary, homepage: self.homepage, download: self.download, icon: self.icon },
    provides: grapevine.provides,
    uses: grapevine.uses,
    allowed: id => id === PEAR_DROPS && on,
    confirmPairing: true,        // a first pairing waits for Allow on the card: another program can't pair as Pear Drops by itself
    keys,
    appDataDir: dev ? path.join(userData, 'demo-apps') : appData,
    ...(place ? { place } : {}),
    ...(timing ? { timing } : {}),
    ...(log ? { log } : {}),
    ...(strict !== undefined ? { strict } : {})
  });

  // What the page shows: the switch, Pear Drops' card (without its logo, sent once by icon()), what it's farming
  // and its daily reward while connected, and whether it's open at all (its socket is there), for holding Kick players at start-up.
  function state() {
    const { icon, ...peer } = link.peers().find(p => p.id === PEAR_DROPS) || {};
    const connected = link.isConnected(PEAR_DROPS);
    return { on, peer, farming: connected ? farming : null, reward: connected ? reward : null, open: paths.listSlugs(place).includes(peerApp.slug), wait: +env.SMV_LINK_SIGN_BACK_IN_MS || null };
  }
  const push = () => send(state());
  keys.ready.then(push);               // the saved keys are read: the card says when it was paired
  link.on('change', push);
  link.on('connected', push);
  link.on('disconnected', () => { farming = null; reward = null; push(); });

  // Settings › Connected apps › Activity: every message each way this run, and what happened to the link
  // (activity.js). Grapevine's warnings and errors go in too: a message it dropped is a problem.
  const activity = createActivity();
  const noted = (o) => { activity.note(PEAR_DROPS, o); changed(); };
  // (the hello's refusal while Pear Drops waits for Allow carries nothing to say so: the card does)
  const waiting = () => (link.peers().find(p => p.id === PEAR_DROPS) || {}).status === 'confirm';
  link.on('message', m => {
    const allow = m.method === 'link.hello' && m.kind === 'error' && m.dir === 'out' && waiting();
    if (activity.add(allow ? { ...m, waitsForAllow: true } : m)) changed();
  });
  link.on('connected', id => { if (id === PEAR_DROPS) noted({ tone: 'ok', text: 'Connected to ' + peerApp.name }); });
  link.on('disconnected', (id, reason) => {
    if (id !== PEAR_DROPS) return;
    activity.ended(id);
    noted({ text: 'Disconnected from ' + peerApp.name + (reason ? ': ' + reason : '') });
  });
  link.on('unpaired', id => { if (id === PEAR_DROPS) noted({ tone: 'warn', text: peerApp.name + ' disconnected: both apps forgot the pairing' }); });
  link.on('log', (level, text) => { if (level === 'warn' || level === 'error') noted({ kind: 'note', tone: level === 'error' ? 'bad' : 'warn', text }); });
  const activityPage = opts => activity.page(PEAR_DROPS, opts);
  // What the page noticed about its Kick players (Pear Drops stopped farming: the wait to sign them back in), as
  // a note. Only text, and not too much of it.
  function playersNote(text) {
    if (typeof text !== 'string' || !text.trim()) return;
    noted({ text: text.trim().slice(0, 200), about: 'players' });
  }
  link.on('event', (from, name, params) => {
    if (from !== PEAR_DROPS) return;
    if (name === 'drops.farming.changed') farming = params;
    else if (name === 'rewards.daily.changed') reward = params;
    else return;
    push();
  });

  // The players each window reported (the main one and the streams window): merged into one players.changed,
  // sent only when it differs from the last one. players.get answers with the last one by itself.
  const reports = { main: null, streams: null };
  let lastSent = '';
  function playersReport(role, report) {
    reports[role === 'streams' ? 'streams' : 'main'] = report && report.platforms ? report : null;
    const merged = mergePlayers(reports.main, reports.streams);
    if (!merged) return null;
    const text = JSON.stringify(merged);
    if (text === lastSent) return null;
    lastSent = text;
    return link.publish('players.changed', merged);
  }
  // The streams window closed: its players are gone.
  const streamsClosed = () => playersReport('streams', null);

  async function setOn(v) {
    on = !!v;
    if (on && !running) { running = true; try { await link.start(); } catch (e) { running = false; if (log) log('error', String(e && e.message || e)); } }
    else if (!on && running) { running = false; await link.stop(); farming = null; reward = null; }
    link.refresh();
    push();
    return state();
  }
  async function disconnect() {
    await link.disconnect(PEAR_DROPS);
    return setOn(false);
  }
  function pairAgain() { link.pairAgain(PEAR_DROPS); return state(); }
  // Allow on the card: Pear Drops (the app asking) may pair, for the next two minutes.
  function allowPairing() { link.allowPairing(PEAR_DROPS); noted({ tone: 'ok', text: 'Allowed ' + peerApp.name + ' to pair' }); return state(); }
  const icon = () => iconDataUrl(peerApp.icon);
  const showPearDrops = () => link.request(PEAR_DROPS, 'drops.farming.show').catch(() => ({ shown: false }));
  // The toolbar's chest: Pear Drops comes to the front with the daily reward's card open.
  const showReward = () => link.request(PEAR_DROPS, 'rewards.daily.show', {}).catch(() => ({ shown: false }));
  async function test() {
    const r = await link.test(PEAR_DROPS);
    noted({ tone: r.ok ? 'ok' : 'warn', text: 'Test: ' + r.text });
    return r;
  }
  async function stop() { if (running) { running = false; await link.stop(); } }

  return { link, state, setOn, disconnect, pairAgain, allowPairing, icon, showPearDrops, showReward, test, activityPage, playersNote, playersReport, streamsClosed, stop };
}

// How Grapevine's key store encrypts the pairing keys: safeStorage's async calls (the sync ones are gone in Electron
// 46; what they saved reads the same). A key the system re-keyed is saved again with the new key. Without
// encryption ({}), keys are stored as they are, and the card says so.
async function safeCrypt(safeStorage) {
  let can = false;
  try { can = !!(safeStorage && await safeStorage.isAsyncEncryptionAvailable()); } catch {}
  if (!can) return {};
  return {
    encrypt: async (t) => (await safeStorage.encryptStringAsync(t)).toString('base64'),
    decrypt: async (t) => {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(t, 'base64'));
      return { text: result, reEncrypt: shouldReEncrypt };
    }
  };
}

// Two windows' players.changed fields as one: a site is signed in or out the same in both (the main window's
// word wins, the streams window may not have heard yet), and its open streams are both windows' together.
function mergePlayers(a, b) {
  if (!a && !b) return null;
  if (!a || !b) return { platforms: { ...(a || b).platforms } };
  const platforms = {};
  for (const p of new Set([...Object.keys(a.platforms), ...Object.keys(b.platforms)])) {
    const x = a.platforms[p], y = b.platforms[p];
    if (!x || !y) { platforms[p] = x || y; continue; }
    const seen = new Set(), open = [];
    for (const ch of [...x.open, ...y.open]) { const k = ch.platform + ':' + ch.slug; if (!seen.has(k)) { seen.add(k); open.push(ch); } }
    platforms[p] = { ...x, open };
  }
  return { platforms };
}

module.exports = { createPearLink, mergePlayers, safeCrypt, PEAR_DROPS };
