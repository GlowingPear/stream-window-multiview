// Sync between computers (#337): what each computer's file holds, and how the files are merged. No files, no
// timers and no Electron here (sync.js does those), so the unit tests load it on its own.
//
// Each computer keeps a record of its own synced values, whether sync is on or not:
//   settings: { key: { v, at, dev, value } }   value: the setting's text as the page stores it (null: not set)
//   channels: { ch: { at, dev, removed?, autoOpen?, notifyOff?, name? } }
// `at` is a logical clock (tick()), `dev` the computer that made the change. The newest entry wins, key by key and
// channel by channel; ties go to the device id, so every computer picks the same one.
const FORMAT = 1;                                // the device file's format (see readDevice())
const KEEP_MS = 183 * 24 * 3600e3;               // removed channels' markers, and computers not seen: about 6 months
// The page's channel settings, synced as one table of channels rather than as settings.
const CHANNEL_KEYS = ['saved', 'autoOpen', 'notifyOff', 'chNames', 'ytNames'];
const SOUND_RE = /^alertSound\.\w+$/;
const kindOf = key => CHANNEL_KEYS.includes(key) ? 'channels' : SOUND_RE.test(key) ? 'sounds' : 'settings';

const parse = (text, def) => { try { const v = JSON.parse(text); return v ?? def; } catch { return def; } };
const list = text => { const v = parse(text, []); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; };
const obj = text => { const v = parse(text, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };

// A new stamp: now, or later than any stamp seen, so a change made after seeing another computer's value beats it
// even when that computer's clock is ahead.
const tick = (clock, now) => Math.max(Math.floor(now), (clock || 0) + 1);
// Does entry a beat entry b?
const beats = (a, b) => !b || a.at > b.at || (a.at === b.at && String(a.dev) > String(b.dev));

// The saved channels, from the page's own values: { ch: { autoOpen?, notifyOff?, name? } }
function channelsOf(values) {
  const auto = new Set(list(values.autoOpen)), off = new Set(list(values.notifyOff));
  const names = { ...obj(values.ytNames), ...obj(values.chNames) };
  const out = {};
  for (const ch of list(values.saved)) {
    const c = out[ch] = {};
    if (auto.has(ch)) c.autoOpen = true;
    if (off.has(ch)) c.notifyOff = true;
    if (typeof names[ch] === 'string' && names[ch]) c.name = names[ch];
  }
  return out;
}
const sameChannel = (a, b) => !!a.removed === !!b.removed && !!a.autoOpen === !!b.autoOpen && !!a.notifyOff === !!b.notifyOff;

/* This computer's values (all of them, or the ones that changed) into its record. A value that differs from the
   record gets a new stamp; the first time there's no record at all, every value starts at 0 (from before sync kept
   change times), so a stamped value from another computer beats it. versions: { key: v } of this copy.
   Any of the channel keys in values means all of them are (sync.js keeps them). -> { clock, changed: [keys] }
   (record is changed in place) */
function recordLocal(record, values, { dev, now, clock = 0, versions = {}, first = false }) {
  const changed = [];
  const stamp = () => (first ? 0 : (clock = tick(clock, now)));
  for (const [key, value] of Object.entries(values)) {
    if (kindOf(key) === 'channels') continue;
    const had = record.settings[key], v = versions[key] || 1;
    if (had ? had.value === value : value === null) continue;
    record.settings[key] = { v, at: stamp(), dev, value };
    changed.push(key);
  }
  if (CHANNEL_KEYS.some(k => k in values)) {
    const chs = channelsOf(values);
    for (const [ch, c] of Object.entries(chs)) {
      const had = record.channels[ch];
      if (had && sameChannel(had, c)) { if (c.name && had.name !== c.name) had.name = c.name; continue; }
      record.channels[ch] = { at: stamp(), dev, ...c };
      changed.push('ch:' + ch);
    }
    for (const [ch, had] of Object.entries(record.channels)) {
      if (had.removed || chs[ch]) continue;
      record.channels[ch] = { at: stamp(), dev, removed: true };
      changed.push('ch:' + ch);
    }
  }
  return { clock, changed };
}

/* A device file as read from the folder (parsed JSON) -> { ok, newer, file }. Older formats are converted here,
   one step at a time (none yet: format 1 is the first). A newer format is left alone: that computer's newer copy
   wrote it, and this one can't know what's in it. */
function readDevice(d) {
  if (!d || typeof d !== 'object' || typeof d.device !== 'string' || !d.device) return { ok: false };
  const format = Number(d.format) || 0;
  if (format > FORMAT) return { ok: false, newer: true, file: { device: d.device, name: String(d.name || ''), os: String(d.os || ''), app: String(d.app || ''), at: +d.at || 0, format } };
  if (format < 1) return { ok: false };
  const settings = {}, channels = {};
  for (const [k, e] of Object.entries(d.settings && typeof d.settings === 'object' ? d.settings : {}))
    if (e && typeof e === 'object' && Number.isFinite(e.at)) settings[k] = { v: +e.v || 1, at: e.at, dev: String(e.dev || d.device), value: typeof e.value === 'string' ? e.value : null, ...(e.file ? { file: true } : {}) };
  for (const [ch, e] of Object.entries(d.channels && typeof d.channels === 'object' ? d.channels : {}))
    if (e && typeof e === 'object' && Number.isFinite(e.at)) channels[ch] = { at: e.at, dev: String(e.dev || d.device),
      ...(e.removed ? { removed: true } : {}), ...(e.autoOpen ? { autoOpen: true } : {}), ...(e.notifyOff ? { notifyOff: true } : {}), ...(typeof e.name === 'string' && e.name ? { name: e.name } : {}) };
  return { ok: true, file: { format, device: d.device, name: String(d.name || '').slice(0, 40), os: String(d.os || ''), app: String(d.app || ''), at: +d.at || 0, what: d.what || null, settings, channels } };
}

/* This computer's file. what: { channels, settings, sounds }: only what it syncs goes in. Sounds are files of
   their own (sounds/<device>/<key>), so the entry only says when it changed. */
function deviceFile(record, { device, name, os, app, at, what }) {
  const settings = {}, channels = {};
  for (const [k, e] of Object.entries(record.settings)) {
    const kind = kindOf(k);
    if (!what[kind]) continue;
    settings[k] = kind === 'sounds' ? { v: e.v, at: e.at, dev: e.dev, value: null, ...(e.value !== null ? { file: true } : {}) } : { v: e.v, at: e.at, dev: e.dev, value: e.value };
  }
  if (what.channels) for (const [ch, e] of Object.entries(record.channels)) channels[ch] = { ...e };
  return { format: FORMAT, device, name, os, app, at, what: { channels: !!what.channels, settings: !!what.settings, sounds: !!what.sounds }, settings, channels };
}

/* Merges the other computers' files into this computer's record.
   files: readDevice() files (sound entries that win carry their value, read by sync.js). values: this computer's
   page values (for the channel lists). versions: { key: v } of this copy; a key it doesn't know, or a value
   written by a newer version of a setting, is left for later (its stamp stays, so it's applied after an update).
   -> { apply: { key: value }, applyV: { key: the version it was written with }, before: { key: value }, summary: { added, removed, changed, keys }, from: device | null,
   clock, touched } */
function merge(record, files, { values, versions, what, clock = 0 }) {
  const apply = {}, before = {}, applyV = {}, summary = { added: [], removed: [], keys: [] };
  let touched = false;                       // the record changed (it has to be written again)
  const fromAt = new Map();                  // device -> the newest stamp it won with (who to say it came from)
  const won = (e, f) => { if (f !== undefined) fromAt.set(f, Math.max(fromAt.get(f) || -Infinity, e.at)); clock = Math.max(clock, e.at); };
  for (const f of files) {
    for (const [k, e] of Object.entries(f.settings)) {
      const kind = kindOf(k);
      if (kind === 'channels' || !what[kind] || !(k in versions) || e.v > versions[k]) continue;
      const own = record.settings[k];
      if (!beats(e, own)) { clock = Math.max(clock, e.at); continue; }
      if (kind === 'sounds' && e.file && typeof e.value !== 'string') continue;   // (its sound file isn't here yet)
      const value = e.value;
      if (!own || own.value !== value) {
        if (!(k in before)) before[k] = own ? own.value : null;
        apply[k] = value; applyV[k] = e.v;
        if (!summary.keys.includes(k)) summary.keys.push(k);
        won(e, f.device);
      } else clock = Math.max(clock, e.at);
      record.settings[k] = { v: e.v, at: e.at, dev: e.dev, value }; touched = true;
    }
  }
  for (const k of summary.keys) if (apply[k] === before[k]) { delete apply[k]; delete before[k]; }
  summary.keys = summary.keys.filter(k => k in apply);

  if (what.channels) {
    const changed = new Map();               // ch -> the winning entry
    for (const f of files) for (const [ch, e] of Object.entries(f.channels)) {
      const own = record.channels[ch];
      if (!beats(e, own)) { clock = Math.max(clock, e.at); continue; }
      record.channels[ch] = { ...e }; touched = true;
      if (own && sameChannel(own, e)) { clock = Math.max(clock, e.at); continue; }
      if (!own && e.removed) { clock = Math.max(clock, e.at); continue; }
      changed.set(ch, { e, from: f.device });
    }
    // a channel this computer's record removed (the first sync's "Use theirs") that the page still has
    const inSaved = new Set(list(values.saved));
    for (const [ch, e] of Object.entries(record.channels)) if (e.removed && inSaved.has(ch) && !changed.has(ch)) changed.set(ch, { e });
    if (changed.size) {
      const saved = new Set(list(values.saved)), auto = new Set(list(values.autoOpen)), off = new Set(list(values.notifyOff));
      const names = obj(values.chNames);
      let namesChanged = false;
      for (const [ch, { e, from }] of changed) {
        if (e.removed) { if (saved.delete(ch)) summary.removed.push(ch); auto.delete(ch); off.delete(ch); }
        else {
          if (!saved.has(ch)) { saved.add(ch); summary.added.push(ch); }
          e.autoOpen ? auto.add(ch) : auto.delete(ch);
          e.notifyOff ? off.add(ch) : off.delete(ch);
          if (e.name && !names[ch]) { names[ch] = e.name; namesChanged = true; }
        }
        won(e, from);
      }
      const set = (k, v) => { const text = JSON.stringify(v); if (text !== (values[k] ?? null)) { before[k] = values[k] ?? null; apply[k] = text; } };
      set('saved', [...saved]); set('autoOpen', [...auto]); set('notifyOff', [...off]);
      if (namesChanged) set('chNames', names);
      summary.changed = [...changed.keys()].filter(ch => !summary.added.includes(ch) && !summary.removed.includes(ch));
    }
  }
  let from = null, best = -Infinity;
  for (const [d, at] of fromAt) if (at > best) { best = at; from = d; }
  return { apply, applyV, before, summary, from, clock, touched };
}

/* The first sync, when the folder already has other computers' files. mode: 'combine' (the usual merge), 'theirs'
   (the others' values win, and channels only this computer has go), 'mine' (this computer's values win, and
   channels only the others have go). Changes the record in place, before the merge. -> clock */
function firstSync(record, files, mode, { dev, now, clock = 0 }) {
  if (mode !== 'theirs' && mode !== 'mine') return clock;
  const theirs = new Set(files.flatMap(f => Object.entries(f.channels).filter(([, e]) => !e.removed).map(([ch]) => ch)));
  if (mode === 'theirs') {
    for (const e of Object.values(record.settings)) e.at = -1;
    for (const [ch, e] of Object.entries(record.channels)) {
      if (theirs.has(ch)) e.at = -1;
      else if (!e.removed) record.channels[ch] = { at: (clock = tick(clock, now)), dev, removed: true };
    }
    return clock;
  }
  for (const f of files) {
    for (const [k, e] of Object.entries(f.settings)) clock = Math.max(clock, e.at);
    for (const e of Object.values(f.channels)) clock = Math.max(clock, e.at);
  }
  const keys = new Set([...Object.keys(record.settings), ...files.flatMap(f => Object.keys(f.settings))]);
  for (const k of keys) {
    const e = record.settings[k];
    record.settings[k] = { v: e ? e.v : 1, at: (clock = tick(clock, now)), dev, value: e ? e.value : null };
  }
  for (const ch of new Set([...Object.keys(record.channels), ...theirs])) {
    const e = record.channels[ch];
    record.channels[ch] = e ? { ...e, at: (clock = tick(clock, now)), dev } : { at: (clock = tick(clock, now)), dev, removed: true };
  }
  return clock;
}

// Removed channels' markers older than about 6 months go; so do files of computers not seen for as long.
function prune(record, now) {
  for (const [ch, e] of Object.entries(record.channels)) if (e.removed && e.at > 0 && now - e.at > KEEP_MS) delete record.channels[ch];
}
const stale = (file, now) => now - (file.at || 0) > KEEP_MS;

module.exports = { FORMAT, KEEP_MS, CHANNEL_KEYS, kindOf, tick, beats, channelsOf, recordLocal, readDevice, deviceFile, merge, firstSync, prune, stale };
