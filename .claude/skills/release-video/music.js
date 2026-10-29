// Backing track for the release videos, made from scratch (no samples, nothing to license).
// Bright future-funk / electro-pop in C major at about 122 BPM: the tempo is nudged within 118–128 so the
// song's last phrase ends just before the fade-out.
//   intro      Fmaj7–G6–Em7–Am9 on pads that open up from muffled, a pluck, then hats, kick and a riser
//   verse      Am9–Fmaj7–Cmaj9–G6: four on the floor, electric piano chops, a bouncing bass, a pluck arpeggio
//   lift       Dm7–Em7–Fmaj7–Gsus4/G7: the pads open, a snare build and a riser, a breath before the drop
//   chorus     Fmaj7–G6–Em7–Am9: supersaw pads pumping with the kick, octave bass, open hats, the lead hook
//   breakdown  no drums, the hook echoing over the pads, building back into the chorus
// After intro, verse, lift, chorus, breakdown, chorus it cycles from the verse for as long as needed, always
// ending on a chorus and a held Cmaj9 that rings out into the fade.
// pauses: [{ from, to }] (seconds) where it fades out so a sound from the app can be heard.
//   node music.js <seconds> <out.wav>      or   require('./music').write(seconds, file, { pauses })
const fs = require('fs');

const SR = 44100;
const hz = m => 440 * 2 ** ((m - 69) / 12);
// PolyBLEP saw: a saw wave without the aliasing whine of a naive one
const blep = (p, dt) => p < dt ? (p /= dt, p + p - p * p - 1) : p > 1 - dt ? (p = (p - 1) / dt, p * p + p + p + 1) : 0;
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);

// state-variable filter (Simper's), stable while its cutoff moves: run() returns the low-pass, .bp / .hp the others
class SVF {
  constructor(f = 1000, q = .707) { this.c1 = this.c2 = this.bp = this.hp = 0; this.set(f, q); }
  set(f, q = this.q) {
    const g = Math.tan(Math.PI * Math.min(f, SR * .45) / SR);
    this.q = q; this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
    return this;
  }
  run(v) {
    const v3 = v - this.c2, v1 = this.a1 * this.c1 + this.a2 * v3, v2 = this.c2 + this.a2 * this.c1 + this.a3 * v3;
    this.c1 = 2 * v1 - this.c1; this.c2 = 2 * v2 - this.c2; this.bp = v1; this.hp = v - this.k * v1 - v2;
    return v2;
  }
}

// chords: [bass root, voicing] as MIDI notes
const CHORDS = {
  Fmaj7: [41, [53, 57, 60, 64]], G6: [43, [55, 59, 62, 64]], Em7: [40, [52, 55, 59, 62]], Am9: [45, [57, 60, 64, 67, 71]],
  Cmaj9: [48, [48, 52, 55, 59, 62]], Dm7: [38, [50, 53, 57, 60]], Gsus4: [43, [55, 60, 62, 65]], G7: [43, [55, 59, 62, 65]],
};
const CHORUS = ['Fmaj7', 'G6', 'Em7', 'Am9'];
const PROG = { intro: CHORUS, verse: ['Am9', 'Fmaj7', 'Cmaj9', 'G6'], lift: ['Dm7', 'Em7', 'Fmaj7', ['Gsus4', 'G7']], chorus: CHORUS, break: CHORUS };
// the lead hook, a bar per line as [16th, length in 16ths, note]: a call, its answer, the call again, a higher ending
const CALL = [[[0, 2, 76], [2, 2, 79], [4, 3, 81], [7, 1, 79], [8, 2, 81], [10, 4, 84]], [[0, 2, 83], [2, 2, 81], [4, 4, 79], [10, 2, 76], [12, 4, 74]]];
const HOOK = [...CALL,
  [[0, 2, 76], [2, 2, 79], [4, 3, 83], [7, 1, 81], [8, 2, 79], [10, 2, 76], [12, 4, 79]], [[0, 6, 81], [6, 2, 79], [8, 6, 76]],
  ...CALL,
  [[0, 2, 76], [2, 2, 79], [4, 2, 83], [6, 4, 86], [10, 2, 83], [12, 4, 81]], [[0, 2, 84], [2, 2, 83], [4, 10, 81]]];

// The sections for N bars, in 4-bar phrases: intro, then verse, lift, chorus, breakdown, chorus as often as they fit,
// then what's left as a shorter run that still ends on a chorus.
function plan(N) {
  if (N < 4) return N ? [['intro', N]] : [];
  const out = [['intro', 4 + N % 4]];
  let u = Math.floor(N / 4) - 1, cycles = 0;
  for (; u >= 8; u -= 8, cycles++) out.push(['verse', 8], ['lift', 4], ['chorus', 8], ['break', 4], ['chorus', 8]);
  const rest = { 4: [['verse', 4], ['lift', 4], ['chorus', 8]], 5: [['verse', 8], ['lift', 4], ['chorus', 8]],
    6: [['verse', 8], ['lift', 4], ['chorus', 12]], 7: [['verse', 4], ['lift', 4], ['chorus', 8], ['break', 4], ['chorus', 8]] };
  if (u >= 4) out.push(...rest[u]);
  else if (u === 3) out.push(cycles ? ['break', 4] : ['lift', 4], ['chorus', 8]);
  else if (u && cycles) out[out.length - 1][1] += 4 * u;   // a longer last chorus
  else if (u) out.push(['chorus', 4 * u]);
  return out;
}

function write(seconds, file, { bpm, seed = 7, pauses = [] } = {}) {
  const n = Math.max(1, Math.ceil(seconds * SR)), TAIL = 3.6;
  if (!bpm) bpm = Math.min(128, Math.max(118, Math.max(1, Math.round((seconds - TAIL) / (240 / 122) / 4)) * 960 / (seconds - TAIL)));
  const beat = 60 / bpm, bar = 4 * beat, st = beat / 4, N = Math.max(0, Math.floor((seconds - 2.6) / bar));
  const bars = [], seen = {};
  for (const [sec, len] of plan(N)) { seen[sec] = (seen[sec] || 0) + 1; for (let i = 0; i < len; i++) bars.push({ sec, i, len, num: seen[sec] }); }
  bars.forEach((b, k) => { b.next = bars[k + 1] ? bars[k + 1].sec : 'end'; });

  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, noise = () => rnd() * 2 - 1;
  const cache = new Map(), memo = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };
  const buf = sec => new Float32Array(Math.max(1, Math.round(sec * SR)));
  // a short fade on the end of a sound, and optionally scale it to a peak
  const tidy = (x, peak, xr) => {
    const m = Math.min(x.length, Math.round(.008 * SR));
    for (const y of xr ? [x, xr] : [x]) for (let k = 0; k < m; k++) y[y.length - 1 - k] *= k / m;
    if (peak) { let p = 1e-9; for (const y of xr ? [x, xr] : [x]) for (const v of y) p = Math.max(p, Math.abs(v)); for (const y of xr ? [x, xr] : [x]) for (let k = 0; k < y.length; k++) y[k] *= peak / p; }
    return xr ? [x, xr] : x;
  };

  // kick: a sine falling from ~180 Hz to 47 Hz with a short click on top, lightly saturated
  const KICK = (() => {
    const x = buf(.42), lp = new SVF(3500, .7); let ph = 0;
    for (let k = 0; k < x.length; k++) {
      const t = k / SR; ph += 2 * Math.PI * (47 + 135 * Math.exp(-t * 30)) / SR;
      x[k] = Math.tanh(1.8 * (Math.sin(ph) * Math.exp(-t * 5.5) * Math.min(1, t * 2000) + lp.run(noise()) * Math.exp(-t * 350) * .7));
    }
    return tidy(x, .8);
  })();
  // clap: three quick band-passed noise bursts and a tail, over a short pitched snare body
  const CLAP = (() => {
    const x = buf(.34), bp = new SVF(1500, .9), lp = new SVF(7000, .7); let ph = 0;
    for (let k = 0; k < x.length; k++) {
      const t = k / SR; let e = t > .022 ? .5 * Math.exp(-(t - .022) * 13) : 0;
      for (const d of [0, .011, .022]) if (t >= d) e = Math.max(e, Math.exp(-(t - d) * 230));
      bp.run(lp.run(noise())); ph += 2 * Math.PI * (180 + 60 * Math.exp(-t * 50)) / SR;
      x[k] = bp.bp * e * 2.2 + Math.sin(ph) * Math.exp(-t * 28) * .5;
    }
    return tidy(x, 2.8);
  })();
  // hats and shaker: high-passed noise, rolled off on top so they're crisp but not hissy
  const hiss = (sec, f, q, decay, attack = .0005, top = 10000) => {
    const x = buf(sec), hp = new SVF(f, q), lp = new SVF(top, .7);
    for (let k = 0; k < x.length; k++) { const t = k / SR; hp.run(noise()); x[k] = lp.run(hp.hp) * Math.min(1, t / attack) * Math.exp(-t * decay); }
    return tidy(x, 2.8);
  };
  const HAT = hiss(.06, 7500, .8, 60), OPEN = hiss(.3, 7000, .8, 11), SHAKER = (() => {
    const x = buf(.09), bp = new SVF(5200, 1.3);
    for (let k = 0; k < x.length; k++) { const t = k / SR; bp.run(noise()); x[k] = bp.bp * Math.min(1, t / .008) * Math.exp(-t * 38); }
    return tidy(x, 2.8);
  })();
  // crash, riser and down-sweep: stereo noise, band-passed from `from` to `to` (or, given hpf, high-passed there and low-passed at `from`)
  const sweep = (sec, from, to, shape, hpf = 0) => {
    const L = buf(sec), R = buf(sec), f = [new SVF(from, 1.4), new SVF(from, 1.4)], h = [new SVF(hpf || 20), new SVF(hpf || 20)];
    for (let k = 0; k < L.length; k++) {
      const x = k / L.length; if (!(k & 31) && !hpf) { const c = from * (to / from) ** x; f[0].set(c); f[1].set(c); }
      for (const [y, j] of [[L, 0], [R, 1]]) { h[j].run(noise()); const v = hpf ? f[j].run(h[j].hp) : (f[j].run(noise()), f[j].bp); y[k] = v * shape(x, k / SR); }
    }
    return tidy(L, 2, R);
  };
  const CRASH = sweep(2.4, 9000, 9000, (x, t) => Math.min(1, t / .002) * Math.exp(-t * 1.9), 3500);
  const DOWN = sweep(1.8, 5000, 250, x => (1 - x) ** 2 * Math.min(1, x * 40));
  const riser = sec => memo('rise' + sec, () => sweep(sec, 250, 6500, x => x ** 2.2 * Math.min(1, (1 - x) * 60)));
  // boom: a low sine drop under the chorus's first beat
  const BOOM = (() => { const x = buf(1.2); let ph = 0; for (let k = 0; k < x.length; k++) { const t = k / SR; ph += 2 * Math.PI * (38 + 40 * Math.exp(-t * 4)) / SR; x[k] = Math.sin(ph) * Math.exp(-t * 3.2) * Math.min(1, t * 400); } return tidy(x, 1); })();

  // supersaw pad: seven detuned PolyBLEP saws per note, spread across the stereo field (the bus filter shapes its tone)
  const DET = [-1, -.62, -.28, 0, .28, .62, 1];
  const pad = (name, dur) => memo('pad' + name + dur, () => {
    const notes = CHORDS[name][1], L = buf(dur + .4), R = buf(dur + .4), env = new Float32Array(L.length), g = 1 / Math.sqrt(notes.length * 7);
    for (let k = 0; k < env.length; k++) { const t = k / SR; env[k] = Math.min(1, t / .06) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / .4) ** 2) * g; }
    for (const m of notes) for (let v = 0; v < 7; v++) {
      const dt = hz(m + DET[v] * .17) / SR, pan = DET[v] * .85, gl = (v === 3 ? 1 : .75) * Math.min(1, 1 - pan), gr = (v === 3 ? 1 : .75) * Math.min(1, 1 + pan);
      let p = rnd();
      for (let k = 0; k < L.length; k++) { const y = saw(p, dt) * env[k]; L[k] += y * gl; R[k] += y * gr; p += dt; if (p >= 1) p -= 1; }
    }
    return [L, R];
  });
  // electric piano: a two-operator FM tone with a soft bell on the attack and a gentle stereo tremolo
  const ep = (name, dur) => memo('ep' + name + dur, () => {
    const notes = CHORDS[name][1], L = buf(dur + .5), R = buf(dur + .5), g = 1 / notes.length ** .7;
    for (const m of notes) {
      const w = 2 * Math.PI * hz(m);
      for (let k = 0; k < L.length; k++) {
        const t = k / SR, env = Math.min(1, t / .003) * Math.exp(-t * 1.4) * (t < dur ? 1 : Math.exp(-(t - dur) * 12)) * g;
        const y = (Math.sin(w * t + (1.5 * Math.exp(-t * 5) + .4) * Math.sin(w * t)) + .1 * Math.sin(4 * w * t) * Math.exp(-t * 10)) * env, tr = .18 * Math.sin(2 * Math.PI * 4.2 * t);
        L[k] += y * (1 + tr); R[k] += y * (1 - tr);
      }
    }
    return tidy(L, 0, R);
  });
  // bass: a PolyBLEP saw through a plucky low-pass, a sine an octave below for the sub, lightly saturated
  const bass = (m, dur, soft) => memo('bass' + m + dur + soft, () => {
    const x = buf(dur + .04), dt = hz(m) / SR, flt = new SVF(800, .9); let p = 0, ps = 0;
    for (let k = 0; k < x.length; k++) {
      const t = k / SR; if (!(k & 15)) flt.set(soft ? 300 : 230 + 1100 * Math.exp(-t * 16), .9);
      const env = Math.min(1, t / .003) * (t < dur ? 1 - .2 * (1 - Math.exp(-t * 8)) : Math.max(0, 1 - (t - dur) / .04));
      x[k] = Math.tanh((flt.run(saw(p, dt)) * .6 + Math.sin(2 * Math.PI * ps) * .8) * 1.3 * env);
      p += dt; if (p >= 1) p -= 1; ps += dt / 2; if (ps >= 1) ps -= 1;
    }
    return x;
  });
  // pluck: saw and sine with a fast-closing filter, for the arpeggio
  const pluck = m => memo('pl' + m, () => {
    const x = buf(.45), dt = hz(m) / SR, flt = new SVF(2000, 1.1); let p = 0;
    for (let k = 0; k < x.length; k++) {
      const t = k / SR; if (!(k & 15)) flt.set(500 + 3500 * Math.exp(-t * 18));
      x[k] = flt.run(saw(p, dt) * .55 + Math.sin(2 * Math.PI * p) * .45) * Math.min(1, t / .002) * Math.exp(-t * 7.5) * 5;
      p += dt; if (p >= 1) p -= 1;
    }
    return tidy(x);
  });
  // lead: two slightly detuned saws and a sine, low-passed, with a vibrato that comes in on held notes
  const lead = (m, dur, soft) => memo('ld' + m + dur + soft, () => {
    const x = buf(dur + .25), f = hz(m), flt = new SVF(2000, .75); let p1 = 0, p2 = .5, p3 = 0;
    for (let k = 0; k < x.length; k++) {
      const t = k / SR, vib = 2 ** (.1 * Math.min(1, Math.max(0, (t - .2) / .3)) * Math.sin(2 * Math.PI * 5.3 * t) / 12);
      if (!(k & 15)) flt.set((soft ? 1300 : Math.min(4200, 1200 + f * 1.8)) + 900 * Math.exp(-t * 9));
      const d1 = f * vib * 1.0035 / SR, d2 = f * vib * .9965 / SR, d3 = f * vib / SR;
      const env = Math.min(1, t / .012) * (1 - .25 * Math.min(1, t / .2)) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / .2));
      x[k] = flt.run(saw(p1, d1) * .4 + saw(p2, d2) * .4 + Math.sin(2 * Math.PI * p3) * .5) * env * 2;
      p1 = (p1 + d1) % 1; p2 = (p2 + d2) % 1; p3 = (p3 + d3) % 1;
    }
    return x;
  });

  // buses: main (drums, lead, effects), pads (filtered and pumped), keys (piano and pluck, pumped a little), bass, sends
  const main = [new Float32Array(n), new Float32Array(n)], pads = [new Float32Array(n), new Float32Array(n)], keys = [new Float32Array(n), new Float32Array(n)];
  const bassBus = new Float32Array(n), revIn = new Float32Array(n), dlyIn = new Float32Array(n), pumps = [];
  const mix = (dst, i0, x, g) => { for (let k = Math.max(0, -i0), m = Math.min(x.length, n - i0); k < m; k++) dst[i0 + k] += x[k] * g; };
  // a sound (or a stereo pair) on a bus at t seconds: g its level, pan -1..1, xr its right side, rev / dly how much goes to the reverb and delay
  const place = (bus, t, x, { g = 1, pan = 0, xr = x, rev = 0, dly = 0 } = {}) => {
    if (Array.isArray(x)) [x, xr] = x;   // a stereo pair
    const i0 = Math.round(t * SR); if (i0 >= n) return;
    if (Array.isArray(bus)) { mix(bus[0], i0, x, g * Math.min(1, 1 - pan)); mix(bus[1], i0, xr, g * Math.min(1, 1 + pan)); } else mix(bus, i0, x, g);
    for (const [send, a] of [[revIn, rev], [dlyIn, dly]]) if (a) { mix(send, i0, x, g * a / 2); mix(send, i0, xr, g * a / 2); }
  };

  const swing = .1, T = (b, s) => b * bar + s * st + (s % 2 ? swing * st : 0);   // a 16th of bar b, the off ones a little late
  const chordsOf = b => { if (b >= bars.length) return [['Cmaj9', 0, 16]]; const c = PROG[bars[b].sec][bars[b].i % 4]; return Array.isArray(c) ? [[c[0], 0, 8], [c[1], 8, 8]] : [[c, 0, 16]]; };
  const BASS = { verse: [[0, 3, 0], [3, 1, 0], [4, 2, 12], [6, 2, 0], [8, 3, 0], [11, 1, 0], [12, 2, 7], [14, 2, 'next']],
    chorus: [[0, 2, 0], [2, 2, 12], [4, 2, 0], [6, 2, 12], [8, 2, 0], [10, 2, 12], [12, 2, 0], [14, 1, 12], [15, 1, 'next']],
    lift: [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 1.4, 0]) };
  const KEYS = { verse: [[0, 5, 1], [6, 2, .7], [10, 3, .85], [14, 2, .6]], lift: [[0, 2, .8], [4, 2, .7], [8, 2, .8], [12, 2, .7]], break: [[0, 16, .9]] };
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2], VERSE_ARP = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0];

  bars.forEach(({ sec, i, len, num, next }, b) => {
    const t0 = b * bar, at = s => T(b, s), chs = chordsOf(b), last = i === len - 1, drums = sec === 'verse' || sec === 'lift' || sec === 'chorus';
    const chordAt = s => chs.filter(c => c[1] <= s).pop()[0], nextRoot = CHORDS[chordsOf(b + 1)[0][0]][0];
    const breath = sec === 'lift' && last;   // the last beat before a chorus drops out

    // kick on every beat (the pads and bass duck with it); a ghost pump keeps the pulse where there's no kick
    for (let q = 0; q < 4; q++) {
      if (drums && !(breath && q === 3) || sec === 'intro' && i >= len - 2) { place(main, t0 + q * beat, KICK, { g: sec === 'intro' ? .65 : .85 }); pumps.push([t0 + q * beat, 1]); }
      else if (sec === 'break' || sec === 'intro') pumps.push([t0 + q * beat, .35]);
    }
    // clap on 2 and 4, rolls into the chorus, fills at the ends of sections
    if (drums && !(sec === 'lift' && i >= len - 2)) for (const q of [4, 12]) place(main, at(q), CLAP, { g: .42, rev: .22 });
    if (sec === 'lift' && i === len - 2 && len > 1) for (let q = 0; q < 16; q += 2) place(main, at(q), CLAP, { g: .12 + .2 * q / 16, rev: .22 });
    if (breath) for (let q = 0; q < 12; q++) place(main, at(q), CLAP, { g: .22 + .22 * q / 12, rev: .25 });
    if (sec === 'break' && last) for (let q = 0; q < 16; q += q < 8 ? 2 : 1) place(main, at(q), CLAP, { g: .08 + .28 * q / 16, rev: .3 });
    if (sec === 'chorus' && last) for (const [q, g] of [[13, .14], [14, .2], [15, .26]]) place(main, at(q), CLAP, { g, rev: .2 });
    if (sec === 'verse' && last) place(main, at(15), CLAP, { g: .18, rev: .2 });
    // hats: swung, humanised 16ths (offbeat open hats in the chorus), and a shaker once things get going
    if (drums || sec === 'intro' && i >= len - 2) for (let q = 0; q < 16; q++) {
      const t = at(q) + (rnd() - .5) * .004, v = .8 + .4 * rnd(), off = q % 4 === 2;
      if (sec === 'intro') { if (off) place(main, t, HAT, { g: .17 * v, pan: .3 }); continue; }
      if (sec === 'chorus' && off || sec === 'verse' && q === 14 && i % 2) place(main, t, OPEN, { g: .13 * v, pan: .25, rev: .08 });
      else place(main, t, HAT, { g: [.19, .08, .16, .09][q % 4] * v, pan: .3 });
      if (sec !== 'verse' || num > 1) place(main, t, SHAKER, { g: [.06, .04, .09, .04][q % 4] * v, pan: -.35 });
    }
    // crash and boom into sections, risers before them, a down-sweep into the breakdown
    if (i === 0 && (sec === 'chorus' || sec === 'verse')) place(main, t0, CRASH, { g: sec === 'chorus' ? .12 : .08, rev: .25 });
    if (i === 0 && sec === 'chorus') place(main, t0, BOOM, { g: .3 });
    if (i === 0 && sec === 'break') place(main, t0, DOWN, { g: .06, rev: .3 });
    const rise = sec === 'lift' ? len : sec === 'break' || sec === 'intro' ? Math.min(2, len) : 0;
    if (rise && i === len - rise) place(main, t0, riser(rise * bar), { g: .07, rev: .2 });

    // bass: bouncing in the verse, disco octaves in the chorus, straight eighths in the lift, held in the breakdown
    if (BASS[sec]) for (const [q, l, iv] of BASS[sec]) {
      if (breath && q >= 12) continue;
      const root = CHORDS[chordAt(q)][0];
      place(bassBus, at(q), bass(iv === 'next' ? nextRoot : root + iv, +(l * st * .85).toFixed(3)), { g: .5 });
    }
    if (sec === 'break' && !last) place(bassBus, t0, bass(CHORDS[chs[0][0]][0], +(bar * .95).toFixed(3), true), { g: .38 });
    // pads: one long chord a bar (two in the lift's last bar), quieter under the verse
    const padG = { intro: .8, verse: .42, lift: .5 + .08 * i, chorus: .58, break: .58 }[sec];
    for (const [name, q, l] of chs) place(pads, at(q), pad(name, +(l * st).toFixed(3)), { g: padG });
    // electric piano chops
    if (KEYS[sec]) for (const [q, l, v] of KEYS[sec]) if (!(breath && q >= 12)) place(keys, at(q), ep(chordAt(q), +(l * st * .9).toFixed(3)), { g: .54 * v, rev: .15 });
    // pluck arpeggio over the chord (through the pads' filter in the intro), echoing on the delay
    if (sec !== 'break') for (let q = 0; q < 16; q++) {
      if (sec === 'intro' && q % 2 || sec === 'verse' && !VERSE_ARP[q] || breath && q >= 12) continue;
      const notes = CHORDS[chordAt(q)][1], g = { intro: .3, verse: .15, lift: .12, chorus: .085 }[sec] * (q % 4 ? .8 : 1);
      place(sec === 'intro' ? pads : keys, at(q), pluck(notes[ARP[q] % notes.length] + 12), { g, pan: q % 2 ? .35 : -.35, dly: .25, rev: .1 });
    }
    // the lead hook: the chorus plays it (doubled an octave down after the first time), the breakdown echoes its first half
    if (sec === 'chorus') for (const [q, l, m] of HOOK[i % 8]) {
      const d = +(l * st * .92).toFixed(3);
      place(main, at(q), lead(m, d), { g: .17, dly: .22, rev: .2 });
      if (num > 1) place(main, at(q), lead(m - 12, d), { g: .08, rev: .15 });
    }
    if (sec === 'break' && !last) for (const [q, l, m] of HOOK[i % 4]) place(main, at(q), lead(m, +(l * st * .92).toFixed(3), true), { g: .13, dly: .45, rev: .35 });
  });

  // the ending: a held Cmaj9 with a kick, crash and the lead's last note, ringing out into the fade
  const te = bars.length * bar;
  if (te < seconds) {
    place(main, te, KICK, { g: .95 }); place(main, te, BOOM, { g: .3 }); place(main, te, CRASH, { g: .12, rev: .3 });
    place(pads, te, pad('Cmaj9', 3.2), { g: .58 }); place(keys, te, ep('Cmaj9', 3), { g: .54, rev: .3 });
    place(bassBus, te, bass(48, 2.2, true), { g: .5 }); place(main, te, lead(76, 2.2), { g: .15, dly: .3, rev: .3 });
  }

  // mix the buses: pads through their moving low-pass, pads / bass / keys ducking with the kick (sidechain-style pumping)
  const CUT = { intro: [300, 3500], verse: [2200, 2200], lift: [2000, 5000], chorus: [4800, 4800], break: [700, 3500] };
  const padCut = t => { const b = Math.floor(t / bar); if (b >= bars.length) return 3500; const { sec, i, len } = bars[b], [a, z] = CUT[sec]; return a * (z / a) ** ((i + t / bar - b) / len); };
  pumps.sort((a, b) => a[0] - b[0]);
  const fl = [new SVF(), new SVF()], W = .9 * beat; let pi = -1;
  for (let k = 0; k < n; k++) {
    const t = k / SR; while (pi + 1 < pumps.length && pumps[pi + 1][0] <= t) pi++;
    let pu = 0; if (pi >= 0) { const d = t - pumps[pi][0]; if (d < W) pu = pumps[pi][1] * (1 - d / W) ** 2 * Math.min(1, d / .004); }
    if (!(k & 31)) { const f = padCut(t); fl[0].set(f, .8); fl[1].set(f, .8); }
    const pl = fl[0].run(pads[0][k]), pr = fl[1].run(pads[1][k]);
    revIn[k] += (pl + pr) * .1;
    main[0][k] += pl * (1 - .7 * pu) + keys[0][k] * (1 - .3 * pu) + bassBus[k] * (1 - .45 * pu);
    main[1][k] += pr * (1 - .7 * pu) + keys[1][k] * (1 - .3 * pu) + bassBus[k] * (1 - .45 * pu);
  }
  // ping-pong delay, a dotted eighth, each repeat darker
  { const D = Math.round(.75 * beat * SR), dl = new Float32Array(D), dr = new Float32Array(D); let j = 0, hl = 0, hx = 0, fl1 = 0, fr1 = 0;
    for (let k = 0; k < n; k++) {
      hl = .97 * (hl + dlyIn[k] - hx); hx = dlyIn[k];   // high-pass so the echoes don't muddy the low end
      const yl = dl[j], yr = dr[j]; fl1 += .4 * (yl - fl1); fr1 += .4 * (yr - fr1);
      dl[j] = hl + fr1 * .42; dr[j] = fl1 * .42; j = j + 1 === D ? 0 : j + 1;
      main[0][k] += yl * .5; main[1][k] += yr * .5;
      revIn[k] += (yl + yr) * .05;
    } }
  // reverb: Freeverb's eight combs and four all-passes per side, after a short pre-delay and a high-pass
  { const pre = Math.round(.018 * SR); let h = 0, x0 = 0;
    for (let k = n - 1; k >= 0; k--) revIn[k] = k >= pre ? revIn[k - pre] : 0;
    for (let k = 0; k < n; k++) { const x = revIn[k]; h = .965 * (h + x - x0); x0 = x; revIn[k] = h; }
    const C = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], A = [556, 441, 341, 225], ROOM = .85, DAMP = .35;
    for (let ch = 0; ch < 2; ch++) {
      const out = main[ch], cb = C.map(d => new Float32Array(d + ch * 23)), ci = new Int32Array(8), cf = new Float64Array(8);
      const ab = A.map(d => new Float32Array(d + ch * 23)), ai = new Int32Array(4);
      for (let k = 0; k < n; k++) {
        const x = revIn[k] * .015; let y = 0;
        for (let c = 0; c < 8; c++) { const b = cb[c], i = ci[c], o = b[i]; cf[c] = o * (1 - DAMP) + cf[c] * DAMP; b[i] = x + cf[c] * ROOM; ci[c] = i + 1 === b.length ? 0 : i + 1; y += o; }
        for (let c = 0; c < 4; c++) { const b = ab[c], i = ai[c], o = b[i]; b[i] = y + o * .5; ai[c] = i + 1 === b.length ? 0 : i + 1; y = o - y; }
        out[k] += y * 3;
      }
    } }
  // master tone: a high-pass for DC and rumble, a gentle roll-off of the very top
  for (const x of main) { let h = 0, x0 = 0, l = 0; const a = 1 - Math.exp(-2 * Math.PI * 25 / SR), b = 1 - Math.exp(-2 * Math.PI * 14000 / SR);
    for (let k = 0; k < n; k++) { h = (1 - a) * (h + x[k] - x0); x0 = x[k]; l += b * (h - l); x[k] = l; } }

  // master: soft saturation and a look-ahead limiter at -1 dBFS, with the level set so it's about -15 LUFS
  const [oL, oR] = pads, req = revIn, lim = dlyIn, CEIL = .89, LA = Math.round(.004 * SR), rel = 1 - Math.exp(-1 / (.12 * SR));
  const master = G => {
    for (let k = 0; k < n; k++) { oL[k] = Math.tanh(main[0][k] * G); oR[k] = Math.tanh(main[1][k] * G); const p = Math.max(Math.abs(oL[k]), Math.abs(oR[k])); req[k] = p > CEIL ? CEIL / p : 1; }
    const q = new Int32Array(LA + 2); let h = 0, tl = 0;   // sliding minimum of the gain needed over the next LA samples
    for (let k = n - 1; k >= 0; k--) {
      while (tl > h && req[q[(tl - 1) % q.length]] >= req[k]) tl--;
      q[tl++ % q.length] = k; while (q[h % q.length] > k + LA) h++;
      lim[k] = req[q[h % q.length]];
    }
    const ring = new Float64Array(LA).fill(1); let e = 1, sum = LA;   // instant attack, smooth release, then a short average
    for (let k = 0; k < n; k++) {
      e = Math.min(lim[k], e + (1 - e) * rel); sum += e - ring[k % LA]; ring[k % LA] = e;
      const g = Math.min(1, sum / LA); oL[k] *= g; oR[k] *= g;
    }
  };
  // integrated loudness (ITU BS.1770: K-weighting, 400 ms blocks, absolute and relative gates)
  const lufs = () => {
    const biq = (f, type) => { const w = 2 * Math.PI * f / SR, c = Math.cos(w), sn = Math.sin(w);
      if (type === 'hp') { const al = sn / (2 * .5), a0 = 1 + al; return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0]; }
      const A = 10 ** (4 / 40), al = sn / 2 * Math.SQRT2, sA = 2 * Math.sqrt(A) * al, a0 = (A + 1) - (A - 1) * c + sA;
      return [A * ((A + 1) + (A - 1) * c + sA) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - sA) / a0, 2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - sA) / a0]; };
    const fs2 = [biq(1682, 'shelf'), biq(38, 'hp')], seg = Math.round(.1 * SR), ms = new Float64Array(Math.floor(n / seg));
    for (const x of [oL, oR]) { const z = [[0, 0], [0, 0]];
      for (let k = 0; k < ms.length * seg; k++) { let v = x[k];
        for (let j = 0; j < 2; j++) { const [b0, b1, b2, a1, a2] = fs2[j], y = b0 * v + z[j][0]; z[j][0] = b1 * v - a1 * y + z[j][1]; z[j][1] = b2 * v - a2 * y; v = y; }
        ms[(k / seg) | 0] += v * v; } }
    const blocks = []; for (let j = 3; j < ms.length; j++) blocks.push((ms[j] + ms[j - 1] + ms[j - 2] + ms[j - 3]) / (4 * seg));
    const L = z => -.691 + 10 * Math.log10(z), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const abs = blocks.filter(z => L(z) > -70); if (!abs.length) return -70;
    const rel2 = abs.filter(z => L(z) > L(mean(abs)) - 10); return L(mean(rel2));
  };
  let G = 1;
  for (let it = 0; it < 3; it++) { master(G); G = Math.min(G * 10 ** ((-15 - lufs()) / 20), 100); }
  master(G);

  const fadeIn = 1 * SR, fadeOut = 3 * SR, out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  const clip = v => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  // 0 inside a pause, fading out over .5 s before it and back in over .6 s after it
  const duck = t => pauses.reduce((g, p) => Math.min(g, t < p.from ? Math.min(1, (p.from - t) / .5) : t > p.to ? Math.min(1, (t - p.to) / .6) : 0), 1);
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fadeIn) * Math.min(1, (n - i) / fadeOut) * (pauses.length ? duck(i / SR) : 1);
    out.writeInt16LE(clip(oL[i] * g), 44 + i * 4); out.writeInt16LE(clip(oR[i] * g), 46 + i * 4);
  }
  fs.writeFileSync(file, out);
  return file;
}

if (require.main === module) console.log(write(+process.argv[2] || 30, process.argv[3] || 'music.wav'));
module.exports = { write };
