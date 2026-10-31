// "Copy image" on an emote: a moving one goes on the clipboard as a file (as Finder or Explorer copy one), next to its
// still PNG. A picture on the clipboard can't move, but chat apps (Discord, Slack, Messages) upload a pasted file as it is.
// Plain functions, so they can be tested: main.js fetches the emote and writes the clipboard.
const fs = require('fs');
const path = require('path');

// Whether the picture moves: a GIF with more than one frame, an animated WebP, APNG or AVIF sequence
function animated(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) return false;
  const head = buf.toString('latin1', 0, 12);
  if (/^GIF8[79]a/.test(head)) {
    let frames = 0;                                   // each frame starts with a graphic control extension (21 F9 04)
    for (let i = buf.indexOf(0x21); i !== -1 && i < buf.length - 2; i = buf.indexOf(0x21, i + 1))
      if (buf[i + 1] === 0xf9 && buf[i + 2] === 0x04 && ++frames > 1) return true;
    return false;
  }
  if (head.startsWith('RIFF') && head.slice(8) === 'WEBP') return buf.toString('latin1', 12, 16) === 'VP8X' && !!(buf[20] & 0x02);
  if (buf.readUInt32BE(0) === 0x89504e47) { const idat = buf.indexOf('IDAT', 8, 'latin1'), actl = buf.indexOf('acTL', 8, 'latin1'); return actl !== -1 && (idat === -1 || actl < idat); }
  if (buf.toString('latin1', 4, 8) === 'ftyp') return /avis/.test(buf.toString('latin1', 8, Math.min(buf.length, 8 + buf.readUInt32BE(0))));
  return false;
}

// The GIF of a 7TV emote (its .webp or .avif), which plays everywhere it's pasted; null: nothing to swap
function gifUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)7tv\.app$/.test(u.hostname) || !/\/emote\/[^/]+\/[1-4]x\.(webp|avif)$/.test(u.pathname)) return null;
    u.pathname = u.pathname.replace(/\.(webp|avif)$/, '.gif');
    return u.href;
  } catch { return null; }
}

// The file's name: the emote's (only safe characters), with the picture's own extension
const fileName = (name, ext) => (String(name || 'emote').replace(/[^\w.\-]+/g, '_').replace(/^[._]+/, '').slice(0, 60) || 'emote') + ext;

// The copied files stay in folders of their own (one per copy, so names can repeat), so a paste works even after the
// app quits. Only the newest `keep` are kept.
function saveCopy(dir, name, buf, keep = 10) {
  const own = path.join(dir, `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(own, { recursive: true });
  const file = path.join(own, name);
  fs.writeFileSync(file, buf);
  let old = [];
  try { old = fs.readdirSync(dir).map(n => path.join(dir, n)).filter(f => f !== own).map(f => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => b.t - a.t); } catch {}
  for (const { f } of old.slice(Math.max(0, keep - 1))) try { fs.rmSync(f, { recursive: true, force: true }); } catch {}
  return file;
}

module.exports = { animated, gifUrl, fileName, saveCopy };
