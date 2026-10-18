// The updater's text (src/page/panels/updates/update-text.js): the changelog's versions, how long ago, download sizes, dates.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let T;
test.before(async () => { T = await import('../../../../../src/page/panels/updates/update-text.js'); });

test('parseChangelog reads each version and its lines, newest first, and which one is current', () => {
  const list = T.parseChangelog('﻿# What\'s new\r\n\r\nAn intro line.\r\n\r\n## 0.4.0 (current)\r\n- One thing\r\n- A long line\r\n  that wraps\r\n\r\n## v0.3.9\r\n* Another\r\n\r\n# Something else\r\n- not a version\'s line\n');
  assert.deepEqual(list, [
    { version: '0.4.0', current: true, lines: ['One thing', 'A long line that wraps'] },
    { version: '0.3.9', current: false, lines: ['Another'] }
  ]);
  assert.deepEqual(T.parseChangelog(''), []);
  assert.deepEqual(T.parseChangelog(null), []);
});

test('parseChangelog reads the app\'s own CHANGELOG.md', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../../package.json'), 'utf8'));
  const list = T.parseChangelog(fs.readFileSync(path.join(__dirname, '../../../../../CHANGELOG.md'), 'utf8'));
  assert.ok(list.length > 8);
  assert.equal(list[0].version, pkg.version);
  assert.ok(list[0].current);
  assert.ok(list.every(v => v.lines.length > 0), 'every version has lines');
});

test('newerVersion compares version numbers, not text', () => {
  assert.equal(T.newerVersion('0.3.10', '0.3.9'), true);
  assert.equal(T.newerVersion('0.3.9', '0.3.10'), false);
  assert.equal(T.newerVersion('0.4', '0.3.99'), true);
  assert.equal(T.newerVersion('0.3.9', '0.3.9'), false);
  assert.equal(T.newerVersion('1.0.0', '1.0'), false);
});

test('ago says how long ago, roughly', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  assert.equal(T.ago(now - 20e3, now), 'just now');
  assert.equal(T.ago(now - 4 * 60e3, now), '4m ago');
  assert.equal(T.ago(now - 6 * 3600e3 - 5 * 60e3, now), '6h ago');
  assert.equal(T.ago(now - 47 * 3600e3, now), '47h ago');
  assert.equal(T.ago(now - 3 * 86400e3, now), '3 days ago');
  assert.equal(T.ago(0, now), '', 'never checked');
  assert.equal(T.ago(undefined), '');
  assert.match(T.ago(Date.now() - 120e3), /^2m ago$/, 'now by default');
});

test('percent and downloadText show how far a download has got', () => {
  assert.equal(T.percent(0.42), '42%');
  assert.equal(T.percent(0.999), '99%', 'never 100% until it is');
  assert.equal(T.percent(1), '100%');
  assert.equal(T.percent(1.5), '100%');
  assert.equal(T.percent(null), '', 'the size isn\'t known');
  assert.equal(T.downloadText({ progress: 0.42, received: 38.2e6, total: 91e6 }), '42% · 38 of 91 MB');
  assert.equal(T.downloadText({ progress: 0.5, received: 2.5e6, total: 5e6 }), '50% · 2.5 of 5.0 MB', 'small ones with a decimal');
  assert.equal(T.downloadText({ progress: null, received: 12e6, total: null }), '12 MB', 'only how much while the size isn\'t known');
  assert.equal(T.downloadText({ progress: null, received: 0, total: null }), '');
  assert.equal(T.downloadText(), '');
});

test('releaseDate shows the day a release came out', () => {
  assert.match(T.releaseDate('2026-10-18T12:00:00Z'), /18/);
  assert.match(T.releaseDate('2026-10-18T12:00:00Z'), /2026/);
  assert.match(T.releaseDate('2026-10-18T12:00:00Z'), /Oct/);
  assert.equal(T.releaseDate(''), '');
  assert.equal(T.releaseDate(undefined), '');
  assert.equal(T.releaseDate('not a date'), '');
});
