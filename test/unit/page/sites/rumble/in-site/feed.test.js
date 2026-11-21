// Rumble's parts of the scripts inside its chat page (src/page/sites/rumble/in-site/feed.js): its tap (what its chat's
// EventSource brings, passed on a thing at a time with what ALL needs), the lines it already shows, and its cookie
// question answered. Its page is faked with what each one reads. Made-up people and messages.
const test = require('node:test');
const assert = require('node:assert/strict');

let rumbleTap, rumbleShown, rumbleConsent, rumbleSignedOut, rumbleModAction;
test.before(async () => { ({ rumbleTap, rumbleShown, rumbleConsent, rumbleSignedOut, rumbleModAction } = await import('../../../../../../src/page/sites/rumble/in-site/feed.js')); });

// its chat page: where it is, and its emote list's answer
function page(emotes = { data: { items: [{ emotes: [{ name: 'r+wave', file: 'https://hugh.cdn.rumble.cloud/w.gif' }, { name: 'bad' }] }, null] } }) {
  globalThis.location = { pathname: '/chat/popup/186945454' };
  const asked = [];
  globalThis.fetch = async url => { asked.push(url); return { json: async () => emotes }; };
  return asked;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const ev = (type, data) => JSON.stringify({ type, data });

test('its tap: each message on its own, with its sender, their badges\' pictures and its emotes; every kind counted', async () => {
  const asked = page();
  const pushed = [], samples = [];
  const heard = rumbleTap({ F: { on: true }, push: x => pushed.push(x), sample: (k, x) => samples.push([k, x.length > 0]) });
  assert.equal(heard.events, true, 'it hears an EventSource');
  assert.deepEqual(asked, ['/service.php?name=emote.list&chat_id=186945454']);
  await tick();
  heard(ev('init', { config: { badges: { moderator: { icons: { 48: 'https://hugh.cdn.rumble.cloud/mod48.png' }, label: { en: 'Moderator' } }, premium: { icons: {} } } },
    users: [{ id: '1', username: 'Pip', color: '#417eeb', badges: ['moderator', 'premium'] }], channels: [{ id: '7', username: 'OwlChannel' }],
    pinned_message: { id: 'p1', user_id: '1', text: 'welcome' } }));
  heard(ev('messages', { users: [{ id: '2', username: 'Wren' }], messages: [{ id: 'm1', user_id: '1', time: '2026-11-20T21:05:45+00:00', text: 'hi :r+wave: :bad:' },
    { id: 'm2', user_id: '9', channel_id: '7', text: 'as my channel' }, { id: '' }] }));
  heard(ev('messages', { messages: [{ id: 'm3', user_id: '2', text: 'take my money', rant: { price_cents: 1000, duration: 300 } }] }));
  heard(ev('delete_messages', { message_ids: [11, 12] }));
  heard(ev('mute_users', { user_ids: [2] }));
  heard(ev('pin_message', { message: { id: 'p2', user_id: '2', text: 'pinned' } }));
  heard(ev('unpin_message', {}));
  heard(ev('livestream_started', {}));
  heard('not json'); heard('{"no":"type"}');
  assert.deepEqual(pushed[0], { t: 'pin', m: { id: 'p1', time: '', text: 'welcome', rant: null }, u: { id: '1', username: 'Pip', color: '#417eeb', badges: ['moderator', 'premium'] },
    pics: [{ url: 'https://hugh.cdn.rumble.cloud/mod48.png', title: 'Moderator' }], emotes: {} });
  assert.deepEqual(pushed[1].emotes, { ':r+wave:': 'https://hugh.cdn.rumble.cloud/w.gif' }, 'only its emotes the chat has');
  assert.deepEqual(pushed[2].u, { id: '7', username: 'OwlChannel', color: '', badges: [] }, 'a message sent as a channel is the channel\'s');
  assert.deepEqual([pushed[3].t, pushed[3].m.rant], ['rant', { cents: 1000 }]);
  assert.deepEqual(pushed.slice(4).map(x => [x.t, x.id || (x.m && x.m.id) || '']), [['delete', '11'], ['delete', '12'], ['mute', '2'], ['pin', 'p2'], ['unpin', '']]);
  assert.deepEqual(samples.map(s => s[0]), ['init', 'messages', 'messages:rant', 'delete_messages', 'mute_users', 'pin_message', 'unpin_message', 'livestream_started']);
  heard(ev('messages', { messages: [{ id: 'm4', user_id: '1', channel_id: '7', text: 'my channel' }] }));
  assert.deepEqual(pushed[pushed.length - 1].u, { id: '1', username: 'OwlChannel', color: '#417eeb', badges: ['moderator', 'premium'] }, '... with the person\'s id, colour and badges');
});

test('its tap without a chat to ask about, and with an emote list it can\'t read', async () => {
  globalThis.location = { pathname: '/somewhere' };
  let asked = 0; globalThis.fetch = async () => { asked++; throw new Error('offline'); };
  const pushed = [];
  const heard = rumbleTap({ F: { on: true }, push: x => pushed.push(x), sample: () => {} });
  heard(ev('messages', { messages: [{ id: 'm1', user_id: 'x', text: 'hi' }] }));
  assert.equal(asked, 0);
  assert.deepEqual([pushed[0].u, pushed[0].pics], [null, []], 'someone it hasn\'t heard of');
  page({ nope: 1 });
  rumbleTap({ F: {}, push: () => {}, sample: () => {} });
  await tick();
});

// its chat's lines, as its page draws them
function line({ id, user = '1', name = 'Pip', color = 'rgb(232, 8, 8)', nodes, badges = [] }) {
  const el = (tag, props) => ({ tagName: tag, nodeType: 1, classList: { contains: c => (props.cls || []).includes(c) }, ...props });
  const body = { innerText: nodes.map(n => n.nodeValue || n.innerText || '').join(''), childNodes: nodes };
  return { dataset: { messageId: id, messageUserId: user, username: name },
    querySelector: s => (s === '.chat-history--username' ? { innerText: name, style: { color } } : s === '.js-chat-message' ? body : null),
    querySelectorAll: s => (s === 'img.chat-history--user-badge' ? badges : []), el };
}
const text = t => ({ nodeType: 3, nodeValue: t });
const img = (src, alt, cls) => ({ nodeType: 1, tagName: 'IMG', src, alt, classList: { contains: c => c === cls } });

test('the lines it already shows, in the tap\'s shape, with its emotes as pictures; it waits for them', async () => {
  const rows = [line({ id: 'a', nodes: [text('hi '), img('https://hugh.cdn.rumble.cloud/e.png', 'wave', 'chat-history--emote'), { nodeType: 1, tagName: 'A', innerText: 'x.com' }, { nodeType: 8 }],
    badges: [{ src: 'https://hugh.cdn.rumble.cloud/b.png', title: 'Verified' }] })];
  let calls = 0;
  globalThis.document = { querySelectorAll: () => (++calls < 2 ? [] : rows) };
  const got = await rumbleShown({ wait: 2000 });
  assert.deepEqual(got, [{ t: 'shown', m: { id: 'a', time: '', text: 'hi x.com', rant: null }, u: { id: '1', username: 'Pip', color: 'rgb(232, 8, 8)', badges: [] },
    pics: [{ url: 'https://hugh.cdn.rumble.cloud/b.png', title: 'Verified' }], parts: [{ text: 'hi ' }, { emote: 'https://hugh.cdn.rumble.cloud/e.png', name: 'wave' }, { text: 'x.com' }] }]);
  globalThis.document = { querySelectorAll: () => [{ dataset: {}, querySelector: () => null, querySelectorAll: () => [] }] };
  assert.deepEqual(await rumbleShown({ wait: 0 }), [], 'a line without its message is left out');
  globalThis.document = { querySelectorAll: () => [] };
  assert.deepEqual(await rumbleShown({ wait: 0 }), []);
});

test('its cookie question: "Reject all" pressed as its banner shows, once; other buttons left alone', () => {
  const pressed = [];
  const btn = (label, cls, text = '') => ({ className: cls, innerText: text, getAttribute: n => (n === 'aria-label' ? label : null), click: () => pressed.push(label || text) });
  let buttons = [btn('Accept All', 'ketch-relative'), btn('', 'chat--send', 'Send')];
  let watcher = null;
  globalThis.window = {};
  globalThis.document = { documentElement: {}, querySelectorAll: () => buttons };
  globalThis.MutationObserver = class { constructor(fn){ watcher = fn; this.off = false; } observe(){} disconnect(){ this.off = true; } };
  assert.equal(rumbleConsent(), true);
  assert.deepEqual(pressed, [], 'no banner yet');
  buttons = [...buttons, btn('Reject All', 'ketch-relative ketch-inline-flex')];
  watcher();
  assert.deepEqual(pressed, ['Reject All']);
  assert.equal(rumbleConsent(), true, 'once a page');
  delete globalThis.window; delete globalThis.document; delete globalThis.MutationObserver;
});

test('whether its chat shows you signed out: its "Sign in to chat!", its box, or neither yet', () => {
  const page = shown => { globalThis.document = { querySelector: s => (shown[s] === undefined ? null : { offsetParent: shown[s] ? {} : null }) }; };
  page({ '#chat-signin-trigger': true }); assert.equal(rumbleSignedOut(), true);
  page({ '#chat-signin-trigger': false, '#chat-message-text-input': true }); assert.equal(rumbleSignedOut(), false);
  page({}); assert.equal(rumbleSignedOut(), null);
  delete globalThis.document;
});

test('its tap: gifts (as bought, in a message), its notices, a raid going out (also one on its way as the chat opens)', async () => {
  page();
  const pushed = [], samples = [];
  const heard = rumbleTap({ F: { on: true }, push: x => pushed.push(x), sample: k => samples.push(k) });
  heard(ev('init', { users: [{ id: '1', username: 'Pip' }], raid: { target_url: 'https://rumble.com/v6abcde-x.html', target_channel_name: 'Night Owl', audience: 40, start_ts: 9 } }));
  heard(ev('messages', { messages: [{ id: 'g1', user_id: '1', text: '', gift_purchase_notification: { gift_type: 'rumble', total_gifts: 3 } }] }));
  heard(ev('messages', { messages: [{ id: 'n1', user_id: '1', text: '', notification: { text: 'just subscribed!', badge: 'recurring_subscription' } }] }));
  heard(ev('gift_purchased', { user_id: '1', total_gifts: 2, gift_type: 'premium' }));
  heard(ev('gift_purchased', { user_id: '1' }));
  heard(ev('raid_confirmed', { target_url: 'https://rumble.com/v7zzz-y.html', audience: 12 }));
  heard(ev('raid_confirmed', {}));
  assert.deepEqual(pushed.map(x => x.t), ['raid', 'message', 'message', 'gift', 'raid']);
  assert.deepEqual(pushed[0].d, { url: 'https://rumble.com/v6abcde-x.html', name: 'Night Owl', title: '', viewers: 40, at: 9 });
  assert.deepEqual(pushed[1].m.gift, { type: 'rumble', n: 3 });
  assert.deepEqual(pushed[2].m.note, { text: 'just subscribed!', badge: 'recurring_subscription' });
  assert.deepEqual(pushed[3].d, { user: '1', who: 'Pip', n: 2, type: 'premium', time: '' }, 'its name from the people it knows');
  assert.deepEqual(samples, ['init', 'messages:gift', 'messages:notification', 'gift_purchased', 'gift_purchased', 'raid_confirmed', 'raid_confirmed']);
});

test('ALL\'s mod actions from its chat page: a message deleted, someone timed out or banned (muted), with your login', async () => {
  const calls = [];
  let status = 200, body = { data: { success: true } };
  globalThis.location = { pathname: '/chat/popup/186945454' };
  globalThis.fetch = async (url, o) => { calls.push({ url, method: o.method, body: o.body instanceof FormData ? Object.fromEntries(o.body) : o.body, cred: o.credentials }); return { ok: status < 300, status, json: async () => body }; };
  assert.equal(await rumbleModAction('delete', { id: 'm 1' }), 'done');
  assert.deepEqual(calls[0], { url: 'https://web7.rumble.com/chat/api/chat/186945454/message/m%201', method: 'DELETE', body: undefined, cred: 'include' });
  assert.equal(await rumbleModAction('timeout', { name: 'Pip', secs: 600 }), 'done');
  assert.deepEqual(calls[1], { url: '/service.php?name=moderation.mute', method: 'POST', cred: 'include',
    body: { user_to_mute: 'Pip', entity_type: 'user', video: '186945454', type: 'channel', duration: '600' } });
  assert.equal(await rumbleModAction('ban', { name: 'Pip', secs: 0 }), 'done');
  assert.equal('duration' in calls[2].body, false, 'a ban: for good');
  body = { errors: [{ message: 'nope' }] };
  assert.equal(await rumbleModAction('ban', { name: 'Pip' }), 'failed', 'its answer says no');
  status = 404;
  assert.equal(await rumbleModAction('delete', { id: 'gone' }), 'no-line');
  status = 500;
  assert.equal(await rumbleModAction('delete', { id: 'x' }), 'failed');
  assert.equal(await rumbleModAction('pin', { id: 'x' }), 'no-button', 'pinning isn\'t one of them');
  assert.equal(await rumbleModAction('nonsense', { id: 'x' }), 'no-button');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await rumbleModAction('delete', { id: 'x' }), 'failed');
  globalThis.location = { pathname: '/elsewhere' };
  assert.equal(await rumbleModAction('delete', { id: 'x' }), 'failed', 'not its chat page');
});
