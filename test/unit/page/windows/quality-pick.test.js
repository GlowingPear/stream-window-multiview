// What quality a stream window asks its player for (src/page/windows/quality-pick.js): the window's, the channel's
// or Settings' choice, Fits the window from its size, and a stream you can't see at its lowest.
const test = require('node:test');
const assert = require('node:assert/strict');

let Q;
test.before(async () => { Q = await import('../../../../src/page/windows/quality-pick.js'); });
const KICK = 720;                                   // Kick's player caps itself at 720p by itself
const best = () => Q.capFor({ choice: 'best' });   // past any stream's best
const size = (h, w = h * 16 / 9, dpr = 1) => ({ w, h, dpr });

test('the window\'s own choice wins, then its channel\'s, then Settings\'; nothing (or something unknown) is the site\'s own', () => {
  assert.equal(Q.qualityOf('480', 'best', 'fit'), '480');
  assert.equal(Q.qualityOf(null, 'best', 'fit'), 'best');
  assert.equal(Q.qualityOf(null, null, 'fit'), 'fit');
  assert.equal(Q.qualityOf(null, undefined, ''), 'site');
  assert.equal(Q.qualityOf('4k', 720, '360'), '360', 'only the choices count (stored as text)');
});

test('the site\'s own leaves Kick at its 720p and the others free; Best is past any stream; a height is a cap', () => {
  assert.equal(Q.capFor({ choice: 'site', siteMax: KICK }), 720);
  assert.equal(Q.capFor({ choice: 'site' }), null);
  assert.ok(Q.capFor({ choice: 'best', siteMax: KICK }) >= 4320);
  assert.equal(Q.capFor({ choice: '480', siteMax: KICK }), 480);
  assert.equal(Q.capFor({ choice: '1080', siteMax: KICK }), 1080, 'past Kick\'s own 720p');
  assert.equal(Q.capFor({ choice: 'nonsense', siteMax: KICK }), 720);
});

test('a stream you can\'t see plays at its lowest, whatever was picked', () => {
  for (const choice of Q.QUALITIES) assert.equal(Q.capFor({ choice, siteMax: KICK, size: size(1080), low: true }), 0, choice);
});

test('Fits the window: the smallest step about as tall as the picture on screen, in the screen\'s pixels', () => {
  const fit = (s, f = { min: 160, max: 1080 }, siteMax = null) => Q.capFor({ choice: 'fit', fit: f, size: s, siteMax });
  assert.equal(fit(size(120)), 160);
  assert.equal(fit(size(170)), 160, 'a little over 160 is fine');
  assert.equal(fit(size(200)), 360, 'well over 160: the next step');
  assert.equal(fit(size(340)), 360, 'a little under 360 is fine');
  assert.equal(fit(size(450)), 480);
  assert.equal(fit(size(650)), 720);
  assert.equal(fit(size(1000)), 1080);
  assert.equal(fit(size(450, undefined, 2)), 1080, 'a high-density screen has twice the pixels');
  assert.equal(fit(size(1000, 400)), 360, 'a narrow window: the 16:9 picture is only as tall as its width allows');
  assert.equal(fit(undefined), 160, 'no size yet: the lowest');
  assert.equal(fit(size(1400), { min: 160, max: 'site' }), best(), 'taller than 1080p, up to the site\'s own (none): the best');
});

test('Fits the window stays inside Settings\' range; up to the site\'s own is Kick\'s 720p', () => {
  const fit = (h, f, siteMax = null) => Q.capFor({ choice: 'fit', fit: f, size: size(h), siteMax });
  assert.equal(fit(100, { min: 480, max: 1080 }), 480, 'never under the lowest');
  assert.equal(fit(1000, { min: 160, max: 480 }), 480, 'never over the highest');
  assert.equal(fit(1000, { min: 160, max: 'site' }, KICK), 720);
  assert.equal(fit(1000, { min: 160, max: 'site' }), 1080);
  assert.equal(fit(100, { min: 720, max: 360 }), 360, 'a lowest over the highest: the highest wins');
});

test('Fits the window\'s range is made whole from what\'s saved', () => {
  assert.deepEqual(Q.fitRange(null), { min: 160, max: 'site' });
  assert.deepEqual(Q.fitRange({ min: 480, max: 720 }), { min: 480, max: 720 });
  assert.deepEqual(Q.fitRange({ min: '360', max: '1080' }), { min: 360, max: 1080 });
  assert.deepEqual(Q.fitRange({ min: 999, max: 'huge' }), { min: 160, max: 'site' });
  assert.deepEqual(Q.fitRange('nonsense'), { min: 160, max: 'site' });
});

test('what the menus call each choice, and Fits the window\'s range', () => {
  assert.deepEqual(Q.QUALITIES.map(Q.choiceName), ['Site\'s own', 'Fits the window', 'Best', 'Up to 1080p', 'Up to 720p', 'Up to 480p', 'Up to 360p', 'Up to 160p']);
  assert.equal(Q.choiceName('nonsense'), 'Site\'s own');
  assert.equal(Q.rangeName(null, KICK), '160–720p');
  assert.equal(Q.rangeName(null, null), '160p and up');
  assert.equal(Q.rangeName({ min: 360, max: 1080 }, KICK), '360–1080p');
  assert.equal(Q.isChoice('fit'), true);
  assert.equal(Q.isChoice(720), false, 'choices are text');
});
