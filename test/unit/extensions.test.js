// Chrome extensions: which sessions get which extension, reading Web Store links, the saved list,
// and what the install dialog says an extension can do (src/extensions.js, without Electron).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const x = require('../../src/extensions');

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const entry = over => x.normalizeEntry({ id: ID, ...over });

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

test('its icon from the folder, as a picture the page can show', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-ext-'));
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
