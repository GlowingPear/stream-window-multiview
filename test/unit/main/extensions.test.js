// Chrome extensions: which sessions get which extension, reading Web Store links, the saved list,
// and what the install dialog says an extension can do (src/extensions.js, without Electron).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const x = require('../../../src/main/extensions');
const { tempDir } = require('../../helpers');

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const entry = over => x.normalizeEntry({ id: ID, ...over });

test('chrome.cookies: only with the cookies permission, and only for the sites the extension may reach', () => {
  const { mayTouchCookie } = require('../../../src/main/extensions');
  const mv3 = { permissions: ['cookies', 'storage'], host_permissions: ['https://*.twitch.tv/*', '*://kick.com/*'] };
  for (const h of ['twitch.tv', '.twitch.tv', 'www.twitch.tv', 'gql.twitch.tv', 'kick.com', '.kick.com']) assert.equal(mayTouchCookie(mv3, h), true, h);
  for (const h of ['youtube.com', '.google.com', 'files.kick.com', 'eviltwitch.tv', '', null]) assert.equal(mayTouchCookie(mv3, h), false, String(h));
  assert.equal(mayTouchCookie({ permissions: ['cookies', '<all_urls>'] }, 'google.com'), true, 'MV2: hosts in permissions');
  assert.equal(mayTouchCookie({ permissions: ['cookies'], host_permissions: ['*://*/*'] }, 'youtube.com'), true);
  assert.equal(mayTouchCookie({ permissions: ['storage'], host_permissions: ['<all_urls>'] }, 'kick.com'), false, 'no cookies permission');
  assert.equal(mayTouchCookie({ permissions: ['cookies'] }, 'kick.com'), false, 'no sites');
  assert.equal(mayTouchCookie({ permissions: ['cookies'], host_permissions: ['https://www.twitch.tv/*'] }, '.twitch.tv'), true, 'a cookie its pages get');
  assert.equal(mayTouchCookie(null, 'kick.com'), false);
});

test('chrome.cookies: the library\'s handlers are wrapped, and a change is only told to extensions that may see it', async () => {
  const { scopeCookies } = require('../../../src/main/extensions');
  const all = [{ name: 'session_token', domain: '.kick.com' }, { name: 'SID', domain: '.google.com' }, { name: 'auth', domain: '.twitch.tv' }];
  const calls = [], sent = [];
  const handlers = new Map(['cookies.get', 'cookies.getAll', 'cookies.set', 'cookies.remove', 'cookies.getAllCookieStores'].map(n => [n, {
    callback: async (_e, d) => { calls.push(n); return n === 'cookies.getAll' ? all : d; }, extensionContext: true }]));
  const exts = { a: { manifest: { permissions: ['cookies'], host_permissions: ['*://kick.com/*'] } }, b: { manifest: { permissions: [] } } };
  const router = { handlers, listeners: new Map([['cookies.onChanged', [{ extensionId: 'a' }, { extensionId: 'b' }]]]),
    session: { extensions: { getExtension: id => exts[id] } },
    sendEvent: (id, ev, info) => sent.push([id, ev, info.cookie.domain]), broadcastEvent: (ev, ...x) => sent.push(['all', ev]) };
  assert.equal(scopeCookies(router), true);
  assert.equal(scopeCookies(null), false);
  assert.equal(handlers.get('cookies.getAll').permission, 'cookies', 'the library checks the permission first');
  assert.equal(handlers.get('cookies.getAllCookieStores').permission, undefined);
  const ev = id => ({ extension: exts[id] });
  assert.deepEqual((await handlers.get('cookies.getAll').callback(ev('a'), {})).map(c => c.name), ['session_token'], 'only its sites\' cookies');
  await assert.rejects(handlers.get('cookies.getAll').callback(ev('a'), { domain: 'google.com' }), /may not/);
  assert.deepEqual(await handlers.get('cookies.get').callback(ev('a'), { url: 'https://kick.com/', name: 'x' }), { url: 'https://kick.com/', name: 'x' });
  assert.throws(() => handlers.get('cookies.get').callback(ev('a'), { url: 'https://www.twitch.tv/', name: 'auth' }), /may not/);
  assert.throws(() => handlers.get('cookies.set').callback(ev('a'), { url: 'not a url' }), /may not/);
  assert.throws(() => handlers.get('cookies.remove').callback({}, { url: 'https://kick.com/' }), /may not/, 'not from an extension');
  router.broadcastEvent('cookies.onChanged', { cookie: { domain: '.kick.com' } });
  router.broadcastEvent('cookies.onChanged', { cookie: { domain: '.google.com' } });
  router.broadcastEvent('tabs.onUpdated', 1);
  assert.deepEqual(sent, [['a', 'cookies.onChanged', '.kick.com'], ['all', 'tabs.onUpdated']]);
});

test('a window watched by many sessions\' extensions: its listener limit grows with them, once each', async () => {
  const { EventEmitter } = require('events');
  const { watchedBy } = require('../../../src/main/extensions');
  const win = new EventEmitter(), shells = Array.from({ length: 14 }, () => ({}));
  const warned = [], warn = w => warned.push(w.name);
  process.on('warning', warn);
  for (const s of shells){
    assert.equal(watchedBy(win, s), true);
    ['closed', 'focus', 'resized'].forEach(e => win.on(e, () => {}));   // (what the library adds for each)
  }
  assert.equal(watchedBy(win, shells[0]), false, 'once for each');
  assert.equal(win.getMaxListeners(), 24);
  assert.equal(watchedBy(new EventEmitter(), shells[0]), true, 'each window on its own');
  await new Promise(r => setTimeout(r, 20));   // (Node says it a moment later)
  process.off('warning', warn);
  assert.deepEqual(warned, [], 'no memory leak warning');
});

test('an extension opens web pages and its own pages; the store window stays on the store', () => {
  const { extOpenable, storeNavOk } = require('../../../src/main/extensions');
  for (const u of ['https://example.com/welcome', 'http://example.com/', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html'])
    assert.equal(extOpenable(u), true, u);
  for (const u of ['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'data:text/html,x', 'chrome-extension://short/x', 'devtools://x', '', null])
    assert.equal(extOpenable(u), false, String(u));
  for (const u of ['https://chromewebstore.google.com/detail/x', 'https://accounts.google.com/ServiceLogin', 'https://consent.google.com/m'])
    assert.equal(storeNavOk(u), true, u);
  for (const u of ['https://chromewebstore.google.com.evil.example/', 'http://chromewebstore.google.com/', 'https://example.com/', 'https://www.google.com/search', 'nonsense'])
    assert.equal(storeNavOk(u), false, u);
});

test('a site\'s own session is its chats; a stream\'s own session is that stream', () => {
  assert.deepEqual(x.targetOf('persist:twitch'), { plat: 'twitch', kind: 'chat', perWindow: false });
  assert.deepEqual(x.targetOf('persist:kick', 'kick', 'stream'), { plat: 'kick', kind: 'chat', perWindow: false }, 'signed-in streams follow the chats');
  assert.deepEqual(x.targetOf('persist:kmv-stream-tw_bravo', 'twitch', 'stream'), { plat: 'twitch', kind: 'stream', perWindow: true });
  assert.equal(x.targetOf('persist:kmv-stream-alpha', 'kick', 'chat'), null);
  assert.equal(x.targetOf('persist:kmv-stream-alpha', 'other', 'stream'), null);
  assert.equal(x.targetOf('persist:kmv-mini'), null, 'small previews never get extensions');
  assert.equal(x.targetOf(x.STORE_PART), null);
  assert.equal(x.targetOf(undefined), null);
});

test('on where the grid says, unless a stream window chose for itself', () => {
  const e = entry({ grid: { twitch: { chat: true } }, win: { 'persist:kmv-stream-alpha': false } });
  const stream = p => x.targetOf(p, 'kick', 'stream');
  assert.equal(x.isOn(e, x.targetOf('persist:twitch'), 'persist:twitch'), true);
  assert.equal(x.isOn(e, x.targetOf('persist:kick'), 'persist:kick'), false, 'chats are off by default');
  assert.equal(x.isOn(e, stream('persist:kmv-stream-delta'), 'persist:kmv-stream-delta'), true, 'streams are on by default');
  assert.equal(x.isOn(e, stream('persist:kmv-stream-alpha'), 'persist:kmv-stream-alpha'), false, 'that window\'s own choice');
  assert.equal(x.isOn({ ...e, enabled: false }, x.targetOf('persist:twitch'), 'persist:twitch'), false, 'switched off altogether');
  assert.equal(x.isOn(e, null, 'persist:kmv-mini'), false);
  assert.deepEqual(x.wantedIds([e, entry({ id: 'p'.repeat(32), grid: { twitch: { chat: false } } })], x.targetOf('persist:twitch'), 'persist:twitch'), [ID]);
});

test('the saved list: bad entries, duplicates and stray values are dropped', () => {
  const list = x.normalizeList([
    { id: ID, grid: { kick: { stream: false, chat: 'yes' } }, win: { 'persist:kick': false, 'persist:kmv-stream-a': true }, enabled: false },
    { id: ID },                                           // the same one again
    { id: 'not-an-id' }, null, 'text',
    { id: 'p'.repeat(32), source: 'folder' },             // a folder with no path
    { id: 'o'.repeat(32), source: 'folder', path: '/x/ext' }
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: ID, source: 'store', enabled: false,
    grid: { kick: { stream: false, chat: false }, twitch: { stream: true, chat: false }, youtube: { stream: true, chat: false } },
    win: { 'persist:kmv-stream-a': true } });
  assert.deepEqual([list[1].source, list[1].path], ['folder', '/x/ext']);
  assert.deepEqual(x.normalizeList('nope'), []);
});

test('Web Store links and bare IDs give the extension ID; anything else doesn\'t', () => {
  assert.equal(x.idFromInput(`https://chromewebstore.google.com/detail/ublock-origin-lite/${ID}`), ID);
  assert.equal(x.idFromInput(`https://chromewebstore.google.com/detail/${ID}?hl=en`), ID);
  assert.equal(x.idFromInput(`https://chrome.google.com/webstore/detail/name/${ID}/reviews`), ID);
  assert.equal(x.idFromInput(`  ${ID}  `), ID);
  assert.equal(x.idFromInput('https://example.com/not-an-extension'), null);
  assert.equal(x.idFromInput(ID + 'x'), null, 'too long');
  assert.equal(x.idFromInput(''), null);
  assert.equal(x.idFromInput(null), null);
});

test('what it can do, in words, and which Chrome features it needs that the app lacks', () => {
  assert.deepEqual(x.permissionLines({ host_permissions: ['<all_urls>'], permissions: ['tabs', 'storage', 'notifications'] }),
    ['Read and change everything on the pages it\'s switched on for, including while you\'re signed in',
      'See the address and title of every window', 'Show notifications']);
  assert.deepEqual(x.permissionLines({ content_scripts: [{ matches: ['*://*.twitch.tv/*', 'https://kick.com/*'] }] }),
    ['Read and change your data on twitch.tv, kick.com']);
  assert.deepEqual(x.permissionLines({ manifest_version: 2, permissions: ['a.com/*', 'https://b.com/*', 'https://c.com/*', 'https://d.com/*', 'https://e.com/*', 'https://f.com/*'] }),
    ['Read and change your data on b.com, c.com, d.com, e.com and 1 more']);
  assert.deepEqual(x.permissionLines({ permissions: ['https://*/*'] }), [], 'MV3 hosts are in host_permissions only');
  assert.deepEqual(x.permissionLines(null), []);
  const blocker = { permissions: ['declarativeNetRequest', 'offscreen', 'storage'], optional_permissions: ['tabCapture'] };
  assert.deepEqual(x.compat(blocker), ['capturing a page\'s sound (tabCapture)', 'offscreen documents']);
  assert.equal(x.blocksNothing(blocker), true, 'a blocker that can\'t block here');
  assert.equal(x.blocksNothing({ optional_permissions: ['declarativeNetRequestWithHostAccess'] }), true);
  assert.equal(x.blocksNothing({ permissions: ['storage'] }), false);
  assert.deepEqual(x.compat({}), []);
  assert.deepEqual(x.compat(undefined), []);
});

test('which of the sites it runs on, from its manifest', () => {
  assert.deepEqual(x.sitesOf({ content_scripts: [{ matches: ['https://kick.com/*', 'https://www.twitch.tv/*'] }] }), ['kick', 'twitch']);
  assert.deepEqual(x.sitesOf({ host_permissions: ['*://*.youtube.com/*'] }), ['youtube'], 'any subdomain');
  assert.deepEqual(x.sitesOf({ manifest_version: 2, permissions: ['tabs', 'https://player.kick.com:443/*'] }), ['kick'], 'MV2 hosts, with a port');
  assert.deepEqual(x.sitesOf({ host_permissions: ['<all_urls>'] }), ['kick', 'twitch', 'youtube']);
  assert.deepEqual(x.sitesOf({ content_scripts: [{ matches: ['*://*/*'] }] }), ['kick', 'twitch', 'youtube']);
  assert.deepEqual(x.sitesOf({ content_scripts: [{ matches: ['https://notkick.com/*'] }] }), [], 'not a lookalike');
  assert.deepEqual(x.sitesOf({ permissions: ['activeTab'] }), ['kick', 'twitch', 'youtube'], 'no sites named: could be anywhere');
  assert.deepEqual(x.sitesOf(null), ['kick', 'twitch', 'youtube']);
});

test('its icon from the folder, as a picture the page can show', () => {
  const dir = tempDir('ext');
  fs.writeFileSync(path.join(dir, 'i48.png'), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(dir, 'i.svg'), '<svg/>');
  fs.writeFileSync(path.join(dir, 'manifest.json'), '﻿{"name":"x"}');
  assert.equal(x.iconDataUrl(dir, { icons: { 16: 'missing.png', 48: '/i48.png' } }), 'data:image/png;base64,AQID', 'the size nearest 48');
  assert.equal(x.iconDataUrl(dir, { action: { default_icon: 'i.svg' } }), 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'));
  assert.equal(x.iconDataUrl(dir, { icons: { 48: '../../etc/passwd' } }), '', 'never outside its folder');
  assert.equal(x.iconDataUrl(dir, { icons: { 48: 'manifest.json' } }), '', 'only pictures');
  assert.equal(x.iconDataUrl(dir, {}), '');
  assert.deepEqual(x.readManifest(dir), { name: 'x' });
  assert.equal(x.readManifest(path.join(dir, 'nope')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reloading from a folder: its manifest, or what\'s wrong with the folder', () => {
  const dir = tempDir('ext');
  const file = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, '﻿{"name":"x","version":"2"}');
  assert.deepEqual(x.checkFolder(dir), { manifest: { name: 'x', version: '2' } });
  fs.writeFileSync(file, '{ "name": ');
  assert.match(x.checkFolder(dir).error, /^Its manifest\.json has a mistake in it: /, 'with what the mistake is');
  fs.writeFileSync(file, '[]');
  assert.equal(x.checkFolder(dir).error, 'Its manifest.json has a mistake in it.');
  fs.writeFileSync(file, 'null');
  assert.equal(x.checkFolder(dir).error, 'Its manifest.json has a mistake in it.');
  fs.rmSync(file);
  assert.equal(x.checkFolder(dir).error, 'Its folder has no manifest.json any more.');
  assert.equal(x.checkFolder(file).error, 'Its folder isn\'t there any more: ' + file, 'not a folder');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(x.checkFolder(dir).error, 'Its folder isn\'t there any more: ' + dir);
});

test('what a new version can do that the old one couldn\'t', () => {
  const v1 = { content_scripts: [{ matches: ['https://kick.com/*'] }], permissions: ['storage'] };
  assert.deepEqual(x.addedAccess(v1, { ...v1, version: '2' }), [], 'nothing new');
  assert.deepEqual(x.addedAccess(v1, { ...v1, permissions: ['storage', 'tabs', 'cookies'] }),
    ['See the address and title of every window', 'Read and change cookies']);
  assert.deepEqual(x.addedAccess(v1, { ...v1, host_permissions: ['https://twitch.tv/*'] }), ['Read and change your data on twitch.tv, kick.com'], 'more sites');
  assert.deepEqual(x.addedAccess({ ...v1, permissions: ['tabs'] }, v1), [], 'asking for less');
  assert.deepEqual(x.addedAccess(null, { permissions: ['tabs'] }), ['See the address and title of every window']);
});
