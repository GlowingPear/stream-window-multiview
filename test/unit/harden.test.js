// Login encryption: reading and turning on Electron's cookie-encryption fuse.
// Uses small fake engine files instead of the real Electron binary.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { harden, readFuse } = require('../../harden');

const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
const ON = 0x31, OFF = 0x30, REMOVED = 0x72;

// A fake engine file: some bytes, the fuse wire (sentinel, version 1, length, fuses), more bytes.
function engine(fuses, { copies = 1 } = {}) {
  const wire = Buffer.concat([Buffer.from(SENTINEL), Buffer.from([1, fuses.length]), Buffer.from(fuses)]);
  const parts = [Buffer.alloc(64, 7)];
  for (let i = 0; i < copies; i++) parts.push(wire, Buffer.alloc(32, 9));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smv-fuse-')), 'engine');
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}
const fuseByte = file => { const b = fs.readFileSync(file); return b[b.indexOf(SENTINEL) + SENTINEL.length + 2 + 1]; };

test('readFuse reports off, on and removed', () => {
  assert.equal(readFuse(engine([ON, OFF, ON])).state, 'off');
  assert.equal(readFuse(engine([ON, ON, ON])).state, 'on');
  assert.equal(readFuse(engine([ON, REMOVED])).state, 'removed');
});

test('harden turns the fuse on and changes nothing else', () => {
  const file = engine([OFF, OFF, OFF, OFF]);
  const before = fs.readFileSync(file);
  assert.equal(harden(file, { resign: false }), 'turned-on');
  const after = fs.readFileSync(file);
  assert.equal(readFuse(file).state, 'on');
  const diff = [...after].map((b, i) => (b !== before[i] ? i : -1)).filter(i => i >= 0);
  assert.equal(diff.length, 1, 'exactly one byte changed');
  assert.equal(after[diff[0]], ON);
});

test('harden fixes every copy of the fuse wire', () => {
  const file = engine([ON, OFF], { copies: 2 });
  assert.equal(harden(file, { resign: false }), 'turned-on');
  const r = readFuse(file);
  assert.equal(r.positions.length, 2);
  assert.equal(r.state, 'on');
});

test('harden leaves the file alone when the fuse is already on, when only checking, or when there is no fuse', () => {
  const on = engine([ON, ON]);
  assert.equal(harden(on), 'on');

  const off = engine([ON, OFF]);
  assert.equal(harden(off, { check: true }), 'off');
  assert.equal(fuseByte(off), OFF);

  const removed = engine([ON, REMOVED]);
  assert.equal(harden(removed), 'removed');
  assert.equal(fuseByte(removed), REMOVED);

  const plain = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smv-fuse-')), 'engine');
  fs.writeFileSync(plain, Buffer.alloc(200, 1));
  assert.equal(harden(plain), 'unknown');
  assert.deepEqual(fs.readFileSync(plain), Buffer.alloc(200, 1));
});
