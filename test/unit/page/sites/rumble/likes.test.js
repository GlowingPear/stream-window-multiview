// Rumble's like (src/page/sites/rumble/likes.js): asked of Rumble itself (the app's side), kept a while, and whether its
// player is playing
const test = require('node:test');
const assert = require('node:assert/strict');

let likes;
test.before(async () => { likes = await import('../../../../../src/page/sites/rumble/likes.js'); });

const VID = 'v33aw1a.186945454';
// a stream window, Rumble's answers (the app's side), and its player
function setup({ st = { signedIn: true, liked: false }, playing = true, set = on => ({ liked: on }) } = {}) {
  const w = { channel: 'ru:nightowl', view: {} }, asked = [], sent = [];
  const kmv = { likeState: async (ch, vid) => { asked.push([ch, vid]); return typeof st === 'function' ? st() : st; }, likeSet: async (ch, vid, on) => { sent.push([ch, vid, on]); return set(on); } };
  const io = (vid = VID) => ({ vid, kmv, like: null, askIn: async (view, js) => { assert.equal(js, likes.rumbleLikes.playingJs); if (playing instanceof Error) throw playing; return playing; } });
  return { w, io, asked, sent, set: v => { st = v; }, play: v => { playing = v; } };
}

test('read: Rumble\'s answer (asked once, then kept a while), whether its player plays; a new video is asked again', async () => {
  const s = setup();
  assert.deepEqual(await likes.rumbleLikes.read(s.w, s.io()), { vid: VID, signedIn: true, liked: false, playing: true });
  s.set({ signedIn: true, liked: true });
  s.play(false);
  assert.deepEqual(await likes.rumbleLikes.read(s.w, s.io()), { vid: VID, signedIn: true, liked: false, playing: false }, 'kept, but the player asked every time');
  assert.deepEqual(s.asked, [['ru:nightowl', VID]]);
  assert.deepEqual(await likes.rumbleLikes.read(s.w, s.io('v1.2')), { vid: 'v1.2', signedIn: true, liked: true, playing: false }, 'another video: asked');
  assert.equal(s.asked.length, 2);
  // kept no longer than RU_LIKE_KEEP
  const real = Date.now;
  try {
    Date.now = () => real() + likes.rumbleLikes.keep + 1000;
    s.set({ signedIn: true, liked: false });
    assert.equal((await likes.rumbleLikes.read(s.w, s.io('v1.2'))).liked, false);
    assert.equal(s.asked.length, 3);
  } finally { Date.now = real; }
});

test('read: one question at a time; signed out, or can\'t tell; no answer keeps the last one', async () => {
  const s = setup();
  await Promise.all([likes.rumbleLikes.read(s.w, s.io()), likes.rumbleLikes.read(s.w, s.io())]);
  assert.equal(s.asked.length, 1, 'asked once for both');
  const out = setup({ st: { signedIn: false, liked: null } });
  assert.deepEqual(await likes.rumbleLikes.read(out.w, out.io()), { vid: VID, signedIn: false, liked: null, playing: true });
  const unsure = setup({ st: { signedIn: true, liked: null }, playing: new Error('gone') });
  assert.deepEqual(await likes.rumbleLikes.read(unsure.w, unsure.io()), { vid: VID, signedIn: true, liked: null, playing: false }, 'a player that doesn\'t answer isn\'t playing');
  const none = setup({ st: null });
  assert.deepEqual(await likes.rumbleLikes.read(none.w, none.io()), { vid: VID, signedIn: false, liked: null, playing: true });
  const failing = setup({ st: () => { throw new Error('offline'); } });
  assert.deepEqual(await likes.rumbleLikes.read(failing.w, failing.io()), { vid: VID, signedIn: false, liked: null, playing: true });
  const old = { channel: 'ru:x', view: {} };
  assert.deepEqual(await likes.rumbleLikes.read(old, { vid: VID, kmv: {}, askIn: async () => true }), { vid: VID, signedIn: false, liked: null, playing: true }, 'no app side (the UI tests\' page)');
});

test('press: likes it, or takes the like back; what Rumble took is kept; nothing sent when it can\'t tell or you\'re signed out', async () => {
  const s = setup();
  assert.deepEqual(await likes.rumbleLikes.press(s.w, s.io()), { vid: VID, signedIn: true, liked: true, playing: true });
  assert.deepEqual(await likes.rumbleLikes.press(s.w, s.io()), { vid: VID, signedIn: true, liked: false, playing: true }, 'kept: the next press takes it back');
  assert.deepEqual(s.sent, [['ru:nightowl', VID, true], ['ru:nightowl', VID, false]]);
  assert.equal(s.asked.length, 1);
  const refused = setup({ set: () => null });
  assert.equal((await likes.rumbleLikes.press(refused.w, refused.io())).liked, false, 'Rumble didn\'t take it: as it was');
  const throws = setup({ set: () => { throw new Error('offline'); } });
  assert.equal((await likes.rumbleLikes.press(throws.w, throws.io())).liked, false);
  for (const st of [{ signedIn: false, liked: null }, { signedIn: true, liked: null }]) {
    const n = setup({ st });
    await likes.rumbleLikes.press(n.w, n.io());
    assert.deepEqual(n.sent, [], JSON.stringify(st));
  }
  // a press while the window moved on to another video: what Rumble took isn't kept for the new one
  const moved = setup();
  await likes.rumbleLikes.read(moved.w, moved.io());
  const p = likes.rumbleLikes.press(moved.w, moved.io());
  await likes.rumbleLikes.read(moved.w, moved.io('v9.9'));
  await p;
  assert.equal((await likes.rumbleLikes.read(moved.w, moved.io('v9.9'))).liked, false);
  assert.equal(likes.rumbleLikes.auto.on, 'ruAutoLike');
});
