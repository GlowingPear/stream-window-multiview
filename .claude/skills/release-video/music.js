// Upbeat synth-pop backing track, made from scratch (no samples, nothing to license).
// 124 BPM, C-G-Am-F: kick, snare, hats, a driving bass, a 16th-note arpeggio and a soft pad, with fades.
//   node music.js <seconds> <out.wav>      or   require('./music').write(seconds, file)
const fs = require('fs');

function write(seconds, file, { bpm = 124, seed = 7 } = {}) {
  const SR = 32000, n = Math.ceil(seconds * SR), beat = 60 / bpm, bar = beat * 4;
  const L = new Float32Array(n), R = new Float32Array(n);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const add = (t, x, gl = 1, gr = 1) => { const i0 = Math.round(t * SR); for (let k = 0; k < x.length && i0 + k < n; k++) { L[i0 + k] += x[k] * gl; R[i0 + k] += x[k] * gr; } };
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const gen = (sec, f) => { const out = new Float32Array(Math.round(sec * SR)); for (let k = 0; k < out.length; k++) out[k] = f(k / SR, k); return out; };

  let ph = 0;
  const KICK = gen(.28, t => { ph += 2 * Math.PI * (45 + 110 * Math.exp(-t * 32)) / SR; return Math.sin(ph) * Math.exp(-t * 9) * .95; });
  const SNARE = gen(.2, t => (rnd() * 2 - 1) * .55 * Math.exp(-t * 22) + Math.sin(2 * Math.PI * 190 * t) * .35 * Math.exp(-t * 30));
  const hat = open => { let prev = 0; return gen(open ? .14 : .04, t => { const x = rnd() * 2 - 1, hp = x - prev; prev = x; return hp * .16 * Math.exp(-t * (open ? 14 : 70)); }); };
  const HAT = hat(false), OPEN = hat(true);
  const cache = new Map();
  const tone = (m, d, { shape = 'saw', vol = .2, a = .005, rel = .08, cut = 1 } = {}) => {
    const key = [m, d, shape, vol, a, rel, cut].join();
    if (cache.has(key)) return cache.get(key);
    const f = hz(m); let lp = 0;
    const x = gen(d + rel, t => {
      const p = (t * f) % 1;
      const w = shape === 'saw' ? 2 * p - 1 : shape === 'sq' ? (p < .5 ? 1 : -1) : Math.sin(2 * Math.PI * p);
      const env = Math.min(1, t / a) * (t < d ? 1 : Math.max(0, 1 - (t - d) / rel));
      lp += cut * (w - lp);   // one-pole low-pass
      return lp * env * vol;
    });
    cache.set(key, x); return x;
  };

  const prog = [[48, [60, 64, 67, 72]], [43, [59, 62, 67, 71]], [45, [60, 64, 69, 72]], [41, [60, 65, 69, 72]]];
  for (let b = 0; b * bar < seconds; b++) {
    const t0 = b * bar, [root, ch] = prog[b % 4], intro = b < 2;
    for (let q = 0; q < 4; q++) { add(t0 + q * beat, KICK); if (!intro && q % 2) add(t0 + q * beat, SNARE, .9, 1); }
    for (let e = 0; e < 8; e++) add(t0 + e * beat / 2 + beat / 4, e % 4 === 3 ? OPEN : HAT, .7, 1);
    if (!intro) for (let e = 0; e < 8; e++) add(t0 + e * beat / 2, tone(root + (e % 2 ? 12 : 0), beat / 2 * .8, { vol: .17, cut: .18, rel: .02 }));
    for (let i = 0; i < 16; i++) {
      const m = ch[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]] + (i >= 8 && b % 2 ? 12 : 0);
      add(t0 + i * beat / 4, tone(m, beat / 4 * .6, { shape: 'sq', vol: .05, cut: .35, rel: .05 }), i % 2 ? .55 : 1, i % 2 ? 1 : .55);
    }
    if (!intro) for (const m of ch.slice(0, 3)) add(t0, tone(m - 12, bar * .95, { vol: .035, a: .15, rel: .3, cut: .06 }));
  }

  let peak = 1e-9; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const fadeIn = 1.5 * SR, fadeOut = 3 * SR, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const clip = v => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < n; i++) {
    const g = .85 / peak * Math.min(1, i / fadeIn) * Math.min(1, (n - i) / fadeOut);
    buf.writeInt16LE(clip(L[i] * g), 44 + i * 4); buf.writeInt16LE(clip(R[i] * g), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
  return file;
}

if (require.main === module) console.log(write(+process.argv[2] || 30, process.argv[3] || 'music.wav'));
module.exports = { write };
