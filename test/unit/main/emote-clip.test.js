// Copy image on an emote (src/main/emote-clip.js): which pictures move, 7TV's GIF, the file's name and folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { animated, gifUrl, fileName, saveCopy } = require('../../../src/main/emote-clip');
const { tempDir } = require('../../helpers');

const pad = b => Buffer.concat([b, Buffer.alloc(40)]);
const GCE = Buffer.from([0x21, 0xf9, 0x04, 0, 0, 0, 0, 0]);
const gif = frames => pad(Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(7), ...Array(frames).fill(Buffer.concat([GCE, Buffer.from([0x2c]), Buffer.alloc(9)]))]));
const webp = flags => { const b = pad(Buffer.from('RIFF\0\0\0\0WEBPVP8X\x0a\0\0\0', 'latin1')); b[20] = flags; return b; };
const png = (...chunks) => pad(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks.map(c => Buffer.from(`\0\0\0\0${c}`, 'latin1'))]));
const avif = brands => { const box = Buffer.from(`\0\0\0\0ftyp${brands}`, 'latin1'); box.writeUInt32BE(box.length, 0); return pad(box); };

test('which pictures move: a GIF of more than one frame, an animated WebP, APNG, an AVIF sequence', () => {
  assert.equal(animated(gif(2)), true);
  assert.equal(animated(gif(1)), false, 'one frame');
  assert.equal(animated(gif(0)), false);
  assert.equal(animated(webp(0x02)), true);
  assert.equal(animated(webp(0x10)), false, 'only the animation flag');
  assert.equal(animated(pad(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))), false, 'a plain WebP');
  assert.equal(animated(png('IHDR', 'acTL', 'IDAT')), true);
  assert.equal(animated(png('IHDR', 'IDAT', 'acTL')), false, 'acTL after the picture: not APNG');
  assert.equal(animated(png('IHDR', 'IDAT')), false);
  assert.equal(animated(avif('avisavif')), true);
  assert.equal(animated(avif('avifmif1')), false);
  for (const x of [null, 'GIF89a', Buffer.alloc(10), pad(Buffer.from('<html>'))]) assert.equal(animated(x), false);
});

test('7TV\'s .webp and .avif: their GIF, which plays everywhere; other addresses: nothing to swap', () => {
  assert.equal(gifUrl('https://cdn.7tv.app/emote/01ABC/4x.webp'), 'https://cdn.7tv.app/emote/01ABC/4x.gif');
  assert.equal(gifUrl('https://cdn.7tv.app/emote/01ABC/2x.avif'), 'https://cdn.7tv.app/emote/01ABC/2x.gif');
  for (const u of ['https://cdn.7tv.app/emote/01ABC/4x.gif', 'https://cdn.7tv.app/emote/01ABC/4x', 'https://files.kick.com/emotes/1/fullsize',
    'https://cdn.betterttv.net/emote/abc/3x.webp', 'https://evil7tv.app.example.com/emote/1/4x.webp', 'not a url', undefined]) assert.equal(gifUrl(u), null, u);
});

test('the file\'s name: the emote\'s, with only safe characters, and the picture\'s extension', () => {
  assert.equal(fileName('pear Hype!', '.gif'), 'pear_Hype_.gif');
  assert.equal(fileName('../../etc', '.gif'), 'etc.gif');
  assert.equal(fileName('', '.webp'), 'emote.webp');
  assert.equal(fileName(null, '.gif'), 'emote.gif');
  assert.equal(fileName('x'.repeat(100), '.gif'), 'x'.repeat(60) + '.gif');
});

test('each copy in a folder of its own (names can repeat), only the newest kept', t => {
  const dir = tempDir('emote-clip', t);
  const files = [];
  for (let i = 0; i < 5; i++) {
    files.push(saveCopy(dir, 'pearHype.gif', Buffer.from(`gif ${i}`), 3));
    const old = path.dirname(files[i]);
    fs.utimesSync(old, new Date(Date.now() - (10 - i) * 1000), new Date(Date.now() - (10 - i) * 1000));   // (older first, whatever the clock's step)
  }
  assert.equal(new Set(files).size, 5, 'a new file each time');
  assert.equal(fs.readFileSync(files[4], 'utf8'), 'gif 4');
  assert.equal(path.basename(files[4]), 'pearHype.gif');
  assert.equal(fs.readdirSync(dir).length, 3);
  assert.deepEqual(files.map(f => fs.existsSync(f)), [false, false, true, true, true]);
  // made where there was no folder yet
  const fresh = saveCopy(path.join(dir, 'new'), 'a.gif', Buffer.from('x'));
  assert.equal(fs.readFileSync(fresh, 'utf8'), 'x');
});
