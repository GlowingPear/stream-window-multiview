// Monitors for Extend across monitors (src/main/monitors.js): numbering them, finding a saved one again, and which
// monitor each part of a layout goes on.
const test = require('node:test');
const assert = require('node:assert/strict');
const { centre, describe, fill, findMonitor, keyOf, placeParts } = require('../../../src/main/monitors');

// Like this computer: the main one in the middle, a smaller one on each side, not lined up at the top
const display = (id, label, x, y, w, h, extra = {}) => ({ id, label, bounds: { x, y, width: w, height: h }, workArea: { x, y, width: w, height: h - 40 }, scaleFactor: 1, ...extra });
const DISPLAYS = [display(2, 'DELL U2412M', 1920, -46, 1440, 900), display(1, 'Main', 0, 0, 1920, 1080), display(3, '', -1920, 80, 1280, 720)];
const MONS = describe(DISPLAYS, 1);

test('monitors are numbered left to right, with their size, place, work area and which is the main one', () => {
  assert.deepEqual(MONS.map(m => [m.n, m.id, m.w + 'x' + m.h, m.primary]), [[1, 3, '1280x720', false], [2, 1, '1920x1080', true], [3, 2, '1440x900', false]]);
  assert.deepEqual(MONS[1].work, { x: 0, y: 0, width: 1920, height: 1040 });
  assert.equal(MONS[0].label, '', 'no name: empty');
  // a monitor stood on its side
  const [tall] = describe([display(9, 'Side', 0, 0, 1080, 1920)], 9);
  assert.equal(tall.portrait, true);
  assert.equal(MONS[1].portrait, false);
  // two lined up vertically: top first
  assert.deepEqual(describe([display(5, '', 0, 1080, 1920, 1080), display(4, '', 0, 0, 1920, 1080)], 4).map(m => m.id), [4, 5]);
  assert.equal(describe([display(6, '', 0, 0, 800, 600, { scaleFactor: undefined })], 6)[0].scale, 1);
});

test('a saved monitor is found by its id, else its name and size, else its size and place', () => {
  const key = keyOf(MONS[2]);
  assert.deepEqual(key, { id: 2, label: 'DELL U2412M', x: 1920, y: -46, w: 1440, h: 900 });
  assert.equal(findMonitor(key, MONS).id, 2);
  // a new id (after a restart or a new port): the same name and size
  const moved = describe([display(22, 'DELL U2412M', -1440, 0, 1440, 900), display(1, 'Main', 0, 0, 1920, 1080)], 1);
  assert.equal(findMonitor(key, moved).id, 22);
  // no name to go by: the same size and place
  const nameless = { ...keyOf(MONS[0]), id: 99 };
  assert.equal(findMonitor(nameless, MONS).id, 3);
  // not there
  assert.equal(findMonitor({ id: 77, label: 'Gone', x: 5000, y: 0, w: 800, h: 600 }, MONS), null);
  assert.equal(findMonitor(null, MONS), null);
  assert.equal(keyOf(null), null);
});

test('a layout\'s parts go on their monitors; empty ones go with the chats, which stay where the main window is', () => {
  const left = keyOf(MONS[0]), right = keyOf(MONS[2]);
  assert.deepEqual(placeParts({}, MONS, 1), { chats: 1, streams: 1, switch: 1, missing: false }, 'nothing set: all on the main window\'s monitor');
  assert.deepEqual(placeParts(undefined, MONS, 2), { chats: 2, streams: 2, switch: 2, missing: false });
  assert.deepEqual(placeParts({ streams: right }, MONS, 1), { chats: 1, streams: 2, switch: 1, missing: false });
  assert.deepEqual(placeParts({ chats: left, switch: right }, MONS, 1), { chats: 3, streams: 3, switch: 2, missing: false }, 'streams with the chats, on the left');
  // one of them isn't plugged in: everything stays on the main window's monitor
  const gone = { id: 77, label: 'Gone', x: 5000, y: 0, w: 800, h: 600 };
  assert.deepEqual(placeParts({ streams: right, switch: gone }, MONS, 1), { chats: 1, streams: 1, switch: 1, missing: true });
  assert.deepEqual(placeParts({ chats: gone }, MONS, 1), { chats: 1, streams: 1, switch: 1, missing: true });
});

test('a window fills a monitor\'s work area, or sits in the middle of it, never bigger than it', () => {
  assert.deepEqual(fill(MONS[1]), { x: 0, y: 0, width: 1920, height: 1040 });
  assert.deepEqual(fill(MONS[1], 40), { x: 40, y: 40, width: 1840, height: 960 });
  assert.deepEqual(centre(MONS[2], 620, 520), { x: 1920 + 410, y: -46 + 170, width: 620, height: 520 });
  assert.deepEqual(centre(MONS[0], 1600, 900), { x: -1920, y: 80, width: 1280, height: 680 }, 'cut down to fit');
});
