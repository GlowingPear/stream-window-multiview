// The page's saved settings (src/page/shared/settings.js): every key listed once, typed reads, and writes that
// never throw, with a stand-in localStorage and window.
const test = require('node:test');
const assert = require('node:assert/strict');

let settings, store, failWrites, failReads;
test.before(async () => {
  store = new Map();
  globalThis.localStorage = {
    getItem: k => { if (failReads) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (failWrites) throw new Error('full'); store.set(k, String(v)); },
    removeItem: k => { store.delete(k); }
  };
  globalThis.window = new EventTarget();
  ({ settings } = await import('../../../../src/page/shared/settings.js'));
});
test.beforeEach(() => { store.clear(); failWrites = failReads = false; });

test('keys are stored as kickMultiview.<name>, and a name that isn\'t listed is a mistake', () => {
  settings.set('savedTab', 'twitch');
  assert.equal(store.get('kickMultiview.savedTab'), 'twitch');
  assert.equal(settings.get('savedTab'), 'twitch');
  settings.set('alertSound.mention', 'data:audio/wav;base64,AA');   // one sound per kind of alert
  assert.equal(store.get('kickMultiview.alertSound.mention'), 'data:audio/wav;base64,AA');
  assert.throws(() => settings.get('savedTabs'), /Not a saved setting: savedTabs/);
  assert.throws(() => settings.set('nope', 1), /Not a saved setting/);
});

test('flags: off by default only "1" is on; on by default only "0" is off', () => {
  assert.equal(settings.flag('autoFit'), false);
  assert.equal(settings.flag('keys', true), true);
  store.set('kickMultiview.autoFit', '1'); store.set('kickMultiview.keys', '0');
  assert.equal(settings.flag('autoFit'), true);
  assert.equal(settings.flag('keys', true), false);
  store.set('kickMultiview.autoFit', 'yes'); store.set('kickMultiview.keys', 'no');
  assert.equal(settings.flag('autoFit'), false, 'anything but "1"');
  assert.equal(settings.flag('keys', true), true, 'anything but "0"');
});

test('text, numbers and JSON, with their defaults for a missing or damaged value', () => {
  assert.equal(settings.text('bellCount', 'ms'), 'ms');
  store.set('kickMultiview.bellCount', ''); assert.equal(settings.text('bellCount', 'ms'), 'ms', 'empty counts as not set');
  assert.equal(settings.num('dnd'), 0);
  store.set('kickMultiview.dnd', '1234'); assert.equal(settings.num('dnd'), 1234);
  store.set('kickMultiview.dnd', 'soon'); assert.equal(settings.num('dnd', 5), 5);
  assert.deepEqual(settings.json('colOrder', []), []);
  store.set('kickMultiview.colOrder', '["alpha","tw:bravo"]'); assert.deepEqual(settings.json('colOrder', []), ['alpha', 'tw:bravo']);
  store.set('kickMultiview.colOrder', '[not json'); assert.deepEqual(settings.json('colOrder', []), []);
  store.set('kickMultiview.colOrder', 'null'); assert.deepEqual(settings.json('colOrder', []), []);
  assert.equal(settings.json('theme'), null, 'no default: null');
});

test('set: true / false as "1" / "0", text as it is, numbers as text, the rest as JSON, null removes it', () => {
  settings.set('autoFit', true); assert.equal(store.get('kickMultiview.autoFit'), '1');
  settings.set('autoFit', false); assert.equal(store.get('kickMultiview.autoFit'), '0');
  settings.set('chatZoom', 0); assert.equal(store.get('kickMultiview.chatZoom'), '0');
  settings.set('toolbar', { pos: 'left', labels: false }); assert.equal(store.get('kickMultiview.toolbar'), '{"pos":"left","labels":false}');
  settings.set('colOrder', ['alpha']); assert.equal(store.get('kickMultiview.colOrder'), '["alpha"]');
  settings.set('featured', null); assert.equal(store.has('kickMultiview.featured'), false);
  settings.set('popPartial', true); settings.remove('popPartial'); assert.equal(store.has('kickMultiview.popPartial'), false);
});

test('a blocked or full storage never throws: reads as not set, and set() says it didn\'t keep it', () => {
  failReads = true;
  assert.equal(settings.get('savedTab'), null);
  assert.equal(settings.flag('keys', true), true);
  assert.deepEqual(settings.json('presets', []), []);
  failReads = false; failWrites = true;
  assert.equal(settings.set('alertSound.spam', 'data:a-big-file'), false);
  failWrites = false;
  assert.equal(settings.set('alertSound.spam', 'data:small'), true);
});

test('onChange: changes made in the other window, for the names asked about only', () => {
  const seen = [];
  settings.onChange(['dnd', 'msg'], (name, v) => seen.push([name, v]));
  settings.onChange('theme', (name, v) => seen.push([name, v]));
  const change = (key, newValue) => window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));
  change('kickMultiview.dnd', '99');
  change('kickMultiview.saved', '[]');
  change('kickMultiview.theme', null);
  change('dnd', '1');                     // not one of the page's keys
  assert.deepEqual(seen, [['dnd', '99'], ['theme', null]]);
});
