// The app's own sounds in the video: everything the window plays through WebAudio (the built-in alert sounds,
// e.g. the mention chime and the spam knock) is recorded with its real timing, so the music can pause for it.
// A custom sound file the user picked (an <audio> element) isn't recorded; demos use the built-in sounds.
//   await sounds.start(page)   before the capture starts
//   const s = await sounds.stop(page, dir)  ->  { clips: [{ file, at }], events: [at] }   (at: ms since 1970)
const fs = require('fs');
const path = require('path');

const start = page => page.evaluate(() => {
  const S = window.__sfx = { clips: [], events: [] }, taps = new Map();
  const connect = AudioNode.prototype.connect;
  // anything connected to a context's speakers is also connected to a recorder for that context
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      const c = dest.context;
      if (!taps.has(c)) {
        const tap = c.createMediaStreamDestination(), rec = new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus' });
        const clip = { start: Date.now(), chunks: [], rec };
        rec.ondataavailable = e => e.data.size && clip.chunks.push(e.data);
        rec.start(1000);
        S.clips.push(clip); taps.set(c, tap);
      }
      connect.call(this, taps.get(c));
      S.events.push(Date.now());
    }
    return connect.call(this, dest, ...rest);
  };
});

async function stop(page, dir) {
  const got = await page.evaluate(async () => {
    const S = window.__sfx;
    if (!S) return { clips: [], events: [] };
    const clips = [];
    for (const c of S.clips) {
      await new Promise(r => { c.rec.onstop = r; c.rec.stop(); });
      const b = new Uint8Array(await new Blob(c.chunks, { type: 'audio/webm' }).arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      clips.push({ start: c.start, data: btoa(s) });
    }
    return { clips, events: S.events };
  });
  fs.mkdirSync(dir, { recursive: true });
  const clips = got.clips.map((c, i) => {
    const file = path.join(dir, `sound-${i}.webm`);
    fs.writeFileSync(file, Buffer.from(c.data, 'base64'));
    return { file, at: c.start };
  });
  return { clips, events: got.events };
}

// Sound times (seconds into the video) as the stretches the music pauses for: sounds closer than `gap`
// share one pause, which lasts `hold` after the last of them.
function pauses(events, t0, { hold = 1.6, gap = 1 } = {}) {
  const out = [];
  for (const t of events.map(e => (e - t0) / 1000).filter(t => t >= 0).sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && t - last.to < gap) last.to = t + hold;
    else out.push({ from: t, to: t + hold });
  }
  return out;
}

module.exports = { start, stop, pauses };
