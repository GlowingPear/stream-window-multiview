// Settings › Developer (src/main/devlog.js): the error log, the sites' last answers, the report, and what's left out.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createErrorLog, createSiteLog, describeRequest, diagnostics, redact } = require('../../../src/main/devlog');

test('logins, keys and cookies are left out of anything written down', () => {
  assert.equal(redact('GET https://www.googleapis.com/youtube/v3/videos?part=id&key=AIzaSyABC123&id=x'), 'GET https://www.googleapis.com/youtube/v3/videos?part=id&key=…&id=x');
  assert.equal(redact('https://a.b/?access_token=abc#token=def'), 'https://a.b/?access_token=…#token=…');
  assert.equal(redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc'), 'Authorization: Bearer …');
  assert.equal(redact('headers: OAuth abcdef123456'), 'headers: OAuth …');
  assert.equal(redact('Cookie: session_token=abc; XSRF-TOKEN=def'), 'Cookie: …');
  assert.equal(redact('{"session_token":"abc","name":"pixelpear","refresh_token":"x"}'), '{"session_token":"…","name":"pixelpear","refresh_token":"…"}');
  assert.equal(redact('monkey=banana&donkey=1'), 'monkey=banana&donkey=1', 'only whole names after ? & or #');
  assert.equal(redact(null), '');
});

test('the error log: newest first, the same error again counted, the last 200, and the run before kept apart', () => {
  let t = 1000;
  const log = createErrorLog({ now: () => t, max: 3 });
  log.add('page', 'pause.js:88', 'TypeError: x');
  t = 2000; log.add('page', 'pause.js:88', 'TypeError: x');
  assert.deepEqual(log.list(), [{ t: 2000, src: 'page', where: 'pause.js:88', msg: 'TypeError: x', n: 2 }]);
  log.add('chat', 'pixelpear', 'no rows'); log.add('nope', '', 'from somewhere else'); log.add('main', '', 'fourth');
  assert.deepEqual(log.list().map(e => [e.src, e.msg]), [['main', 'fourth'], ['main', 'from somewhere else'], ['chat', 'no rows']], 'the last 3; an unknown source is main');
  assert.equal(log.add('main', '', '   '), null, 'nothing to say: not added');
  assert.equal(log.add('main', '', 'x'.repeat(2000)).msg.length, 600, 'long text is cut');
  assert.equal(log.add('main', 'a', 'Bearer abcdefghijk').msg, 'Bearer …');
  // stored, then read at the next start: kept, marked as the run before, and never counted into a new one
  const next = createErrorLog({ saved: log.toSave(), now: () => 5000 });
  assert.ok(next.list().every(e => e.before));
  next.add('main', 'a', 'Bearer abcdefghijk');
  assert.deepEqual(next.list().map(e => [e.msg, e.n, !!e.before]).slice(0, 2), [['Bearer …', 1, false], ['Bearer …', 1, true]]);
  assert.deepEqual(next.toSave().map(e => e.msg), ['Bearer …'], 'only this run is stored');
  assert.deepEqual(createErrorLog({ saved: [{ before: true, msg: 'two runs ago' }, null, { msg: 5 }] }).list(), [], 'older runs and damaged entries go');
  assert.deepEqual(createErrorLog({ saved: 'damaged' }).list(), []);
  next.clear(); assert.equal(next.size, 0);
});

test('requests to the sites, in words; other addresses aren\'t noted', () => {
  assert.deepEqual(describeRequest('https://gql.twitch.tv/gql', '{"query":"query($l:[String!]){users(logins:$l){login}}"}'), { site: 'twitch', what: 'live check (many channels)' });
  assert.deepEqual(describeRequest('https://gql.twitch.tv/gql', '{"query":"query{user(login:\\"a\\"){login}}"}'), { site: 'twitch', what: 'live check' });
  assert.deepEqual(describeRequest('https://gql.twitch.tv/gql', 'query { currentUser { follows { edges } } }'), { site: 'twitch', what: 'follows' });
  assert.deepEqual(describeRequest('https://gql.twitch.tv/gql', '{"query":"isModerator"}'), { site: 'twitch', what: 'moderator check' });
  assert.deepEqual(describeRequest('https://gql.twitch.tv/gql', ''), { site: 'twitch', what: 'GQL' });
  assert.deepEqual(describeRequest('https://www.twitch.tv/nightowl'), { site: 'twitch', what: 'channel page' });
  assert.deepEqual(describeRequest('https://www.twitch.tv/directory/following'), { site: 'twitch', what: 'page' });
  assert.deepEqual(describeRequest('https://kick.com/api/v2/channels/pixelpear'), { site: 'kick', what: 'channel' });
  assert.deepEqual(describeRequest('https://kick.com/api/v2/channels/followed?cursor=1'), { site: 'kick', what: 'follows' });
  assert.deepEqual(describeRequest('https://kick.com/api/v1/user'), { site: 'kick', what: 'API v1/user' });
  assert.deepEqual(describeRequest('https://kick.com/pixelpear'), { site: 'kick', what: 'page' });
  assert.deepEqual(describeRequest('https://www.youtube.com/@mossfern/live'), { site: 'youtube', what: 'live page' });
  assert.deepEqual(describeRequest('https://www.youtube.com/feeds/videos.xml?channel_id=UC1'), { site: 'youtube', what: 'channel feed' });
  assert.deepEqual(describeRequest('https://www.youtube.com/watch?v=x'), { site: 'youtube', what: 'video page' });
  assert.deepEqual(describeRequest('https://www.youtube.com/@mossfern'), { site: 'youtube', what: 'page' });
  assert.deepEqual(describeRequest('https://www.googleapis.com/youtube/v3/videos?part=x'), { site: 'youtube', what: 'API videos' });
  assert.equal(describeRequest('https://translate.googleapis.com/x'), null);
  assert.equal(describeRequest('not an address'), null);
});

test('site responses: the last 40, newest first, with what could be private left out', () => {
  let t = 0;
  const log = createSiteLog({ now: () => ++t, max: 2 });
  log.record({ site: 'kick', what: 'channel', url: 'https://kick.com/api/v2/channels/a', status: 200, ms: 12.4, body: '{"token":"x","id":1}' });
  log.record({ site: 'youtube', what: 'API videos', url: 'https://www.googleapis.com/youtube/v3/videos?key=SECRET', method: 'post', error: 'timeout' });
  log.record({ site: 'twitch', what: 'live check', url: 'https://gql.twitch.tv/gql', method: 'POST', status: 429, ms: -5, request: '{"query":"q","token":"abc"}', body: 'x'.repeat(30000) });
  const [tw, yt] = log.list();
  assert.equal(log.list().length, 2);
  assert.deepEqual([tw.site, tw.status, tw.ms, tw.body.length, tw.request], ['twitch', 429, 0, 20000, '{"query":"q","token":"…"}']);
  assert.deepEqual([yt.method, yt.status, yt.url, yt.error, 'body' in yt, 'request' in yt], ['POST', 0, 'https://www.googleapis.com/youtube/v3/videos?key=…', 'timeout', false, false]);
  log.clear(); assert.deepEqual(log.list(), []);
  assert.equal(createSiteLog().record().site, '');
});

test('the report: app, system, the page\'s part, errors and site responses, with nothing private', () => {
  const at = new Date(2026, 9, 25, 21, 4, 12).getTime();
  const text = diagnostics({
    app: { version: '0.3.20', packaged: true, electron: '39.2.0', chrome: '142' },
    sys: { os: 'macOS', release: '26.1', arch: 'arm64', displays: 2, scale: 2, locale: 'en-GB' },
    page: ['windows   4 streams, 3 chats', 'token=abc'],
    errors: [{ t: at, src: 'chat', where: 'pixelpear', msg: 'no rows', n: 6 }, { t: at, src: 'main', where: '', msg: 'old one', n: 1, before: true }],
    responses: [{ t: at, site: 'twitch', what: 'live check', status: 429, ms: 95 }, { t: at, site: 'kick', what: 'channel', status: 0, ms: 3, error: 'offline' }]
  });
  assert.match(text, /^## Stream Multiview diagnostics\n\nversion   0\.3\.20 \(installed\) · Electron 39\.2\.0 · Chrome 142\nsystem    macOS 26\.1 arm64 · 2 monitors · scale 2 · en-GB\n/);
  assert.match(text, /windows   4 streams, 3 chats\ntoken=abc\n/, 'the page\'s lines as they are (only address parts are taken out)');
  assert.match(text, /## Errors \(2, newest first\)\n21:04:12 chat   pixelpear: no rows \(×6\)\n21:04:12 main   old one \[last run\]/);
  assert.match(text, /## Site responses \(2, newest first\)\n21:04:12 twitch   live check {17}429 95 ms\n21:04:12 kick     channel {20}failed 3 ms · offline/);
  const none = diagnostics();
  assert.match(none, /version   \? \(from source\)/);
  assert.match(none, /## Errors \(0\)\nnone\n\n## Site responses \(0\)\nnone/);
  assert.match(diagnostics({ sys: { displays: 1 } }), /1 monitor\b/);
  const many = diagnostics({ errors: Array.from({ length: 60 }, (_, i) => ({ t: at, src: 'page', msg: 'e' + i, n: 1 })) });
  assert.match(many, /… and 10 older/);
  assert.match(diagnostics({ page: ['?key=SECRET'] }), /\?key=…/);
});
