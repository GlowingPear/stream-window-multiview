// Shoutouts (src/page/chat/shoutout-text.js, issue #300): the message, People rows, Kick's addresses, who streams,
// and who a run of recent chatters shouts out. The names are made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../../../../src/page/chat/shoutout-text.js');

test('the message: {name}, {link}, {links} and {game}; a [ ] part is left out without a game; never "undefined" or two spaces', async () => {
  const { fillShout, SHOUT_TPL } = await load();
  const v = { name: 'Pixelfox', link: 'https://kick.com/pixelfox', links: 'https://kick.com/pixelfox https://twitch.tv/pixelfox', game: 'Tidepool' };
  assert.equal(fillShout(SHOUT_TPL, v), 'Go check out Pixelfox! Last seen playing Tidepool → https://kick.com/pixelfox');
  assert.equal(fillShout(SHOUT_TPL, { ...v, game: '' }), 'Go check out Pixelfox! → https://kick.com/pixelfox');
  assert.equal(fillShout('Hi {name}, playing {game}! {links}', { ...v, game: undefined }), 'Hi Pixelfox, playing! https://kick.com/pixelfox https://twitch.tv/pixelfox', 'outside [ ]: left out, the space closed up');
  assert.equal(fillShout('', v), fillShout(SHOUT_TPL, v), 'empty: the default message');
  assert.equal(fillShout('  [{game} fans:]  go see   {name}  ', { name: 'Lumen' }), 'go see Lumen');
  assert.equal(fillShout('x'.repeat(600), v).length, 450, 'never longer than a chat takes');
  assert.equal(fillShout('{nope} {name}', v), '{nope} Pixelfox', 'only the four');
});

test('links are full https:// addresses, lower case; Kick tries the name, then - for _ (only when it differs)', async () => {
  const { shoutLink, kickTries } = await load();
  assert.equal(shoutLink('kick', 'Pixel_Fox'), 'https://kick.com/pixel_fox');
  assert.equal(shoutLink('twitch', 'Lumen'), 'https://twitch.tv/lumen');
  assert.equal(shoutLink('youtube', 'x'), '');
  assert.equal(shoutLink('kick', ''), '');
  assert.deepEqual(kickTries('@Pixel_Fox_'), ['pixel_fox_', 'pixel-fox-']);
  assert.deepEqual(kickTries('maplemoth'), ['maplemoth']);
  assert.deepEqual(kickTries('  '), []);
  assert.deepEqual(kickTries(null), []);
});

test('People rows: a linked streamer\'s covers all their sites, with an optional message for one site; anyone else\'s their site, or every site', async () => {
  const { shoutRow, shoutFor } = await load();
  const people = [
    { streamer: 's1', msg: 'Cozy crew! {link}', sites: { twitch: 'Follow the crew at {link}' } },
    { site: 'kick', login: 'driftwood_7', msg: 'Captain {name}: {links}' },
    { site: 'twitch', login: 'lanternfern', to: { site: 'twitch', login: 'Pebblesong', name: 'Pebblesong' } },
    { site: 'twitch', login: 'pebblesong', msg: 'Pebble time {link}' },
    { site: 'kick', login: 'oakmoss', every: true, msg: 'Oak {link}' }];
  const maple = { site: 'kick', login: 'maplemoth', name: 'MapleMoth', streamer: 's1' };
  assert.equal(shoutRow(people, maple), people[0]);
  assert.equal(shoutRow(people, { ...maple, site: 'twitch' }), people[0], 'the same row on Twitch');
  assert.equal(shoutRow(people, { site: 'twitch', login: 'driftwood_7' }), null, 'not linked: only on the site it was added from');
  assert.equal(shoutRow(people, { site: 'twitch', login: 'OakMoss' }), people[4], 'unless it says every site');
  assert.equal(shoutRow(people, null), null);
  assert.equal(shoutRow(null, maple), null);
  const tpl = 'Go see {name} {link}';
  assert.equal(shoutFor({ tpl, people, person: maple, site: 'kick' }).text, 'Cozy crew! https://kick.com/maplemoth');
  assert.equal(shoutFor({ tpl, people, person: { ...maple, site: 'twitch', login: 'maplemoth_tv' }, site: 'twitch' }).text, 'Follow the crew at https://twitch.tv/maplemoth_tv', 'its Twitch message, its Twitch link');
  assert.equal(shoutFor({ tpl, people, person: { site: 'kick', login: 'driftwood_7', name: 'driftwood_7' }, site: 'kick', linksOf: () => ['https://twitch.tv/driftwood7', 'https://kick.com/driftwood_7'] }).text,
    'Captain driftwood_7: https://kick.com/driftwood_7 https://twitch.tv/driftwood7', '{links}: each once, theirs on this site first');
  const lf = shoutFor({ tpl, people, person: { site: 'twitch', login: 'lanternfern', name: 'lanternfern' }, site: 'twitch' });
  assert.equal(lf.to.login, 'pebblesong');
  assert.equal(lf.text, 'Pebble time https://twitch.tv/pebblesong', 'another channel instead: that channel, with its own row\'s message');
  assert.equal(shoutFor({ tpl, people: [people[2]], person: { site: 'twitch', login: 'lanternfern' }, site: 'twitch' }).text, 'Go see Pebblesong https://twitch.tv/pebblesong', 'no row of its own: yours');
  assert.equal(shoutFor({ tpl: 'Go see {name}[, playing {game}]', people: [], person: { site: 'twitch', login: 'lumen' }, site: 'twitch', gameOf: p => p.login === 'lumen' ? 'Inkwell' : '' }).text, 'Go see lumen, playing Inkwell', 'no name shown: the address');
});

test('who streams: any one sign is enough, as saved streams expire (no VODs is no proof)', async () => {
  const { streams } = await load();
  assert.equal(streams(null), false);
  assert.equal(streams({}), false, 'nothing found');
  assert.equal(streams({ vods: 0, recent: [] }), false);
  for (const info of [{ live: true }, { lastBroadcast: { start: 1 } }, { recent: ['VTubers'] }, { vods: 3 }, { partner: true }, { affiliate: true }, { verified: true }, { known: true }])
    assert.equal(streams(info), true, JSON.stringify(info));
  assert.equal(streams({ lastBroadcast: { start: null } }), false, 'Twitch\'s last broadcast with no date: never streamed');
});

test('a run: the last n different streamers, newest first; once each across sites; you, the channel, bots and viewers left out; recent ones listed unticked', async () => {
  const { pickRun } = await load();
  const L = (site, login, t, more = {}) => ({ site, login, name: login, t, ...more });
  const lines = [
    L('kick', 'old', 1), L('kick', 'pebblesong', 2), L('twitch', 'tinroof', 3), L('kick', 'maplemoth', 4, { streamer: 's1' }), L('twitch', 'helper_bot', 5, { bot: true }),
    L('twitch', 'viewer9', 6), L('kick', 'mekick', 7), L('twitch', 'quietkoala', 8), L('kick', 'driftwood_7', 9), L('twitch', 'maple_tv', 10, { streamer: 's1' }),
    L('youtube', 'yt1', 11), L('kick', '', 12), null, L('twitch', 'lumen_fox', 13), L('twitch', 'lumen_fox', 14)];
  const r = pickRun(lines, { n: 5, me: ['kick:mekick', 'metwitch'], host: ['twitch:quietkoala', 'quietkoala'], streamsOf: p => p.login !== 'viewer9',
    sentAt: p => (p.login === 'tinroof' ? 1000 : 0), againMs: 15 * 60000, now: 1000 + 60000 });
  assert.deepEqual(r.list.map(p => [p.login, p.site, p.on, p.why]),
    [['lumen_fox', 'twitch', true, ''], ['maple_tv', 'twitch', true, ''], ['driftwood_7', 'kick', true, ''], ['tinroof', 'twitch', false, 'recent'], ['pebblesong', 'kick', true, '']]);
  assert.equal(r.list[1].at, 10, 'a linked streamer once, at their newest message');
  assert.deepEqual({ ...r.left, viewers: r.left.viewers.map(p => p.login) }, { you: true, host: true, bots: 1, viewers: ['viewer9'] });
  const all = pickRun(lines, { n: 50, onlyStreamers: false, streamsOf: () => false });
  assert.equal(all.list.length, 9, 'everyone but bots, YouTube and nameless lines (no you or channel given)');
  assert.ok(all.list.some(p => p.login === 'viewer9'));
  assert.equal(pickRun(lines, { n: 0 }).list.length, 5, 'n: 5 when not set');
  assert.deepEqual(pickRun(null).list, []);
  assert.equal(pickRun(Array.from({ length: 40 }, (_, i) => L('kick', 'p' + i, i)), { n: 99 }).list.length, 20, 'never more than 20');
});
