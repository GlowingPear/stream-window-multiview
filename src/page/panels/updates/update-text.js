/* ---- Text for the updater (Settings › Updates, the toolbar's chip, the "Updated" card): the changelog's versions,
   how long ago it checked, how far a download has got, a release's date. Imports nothing. ---- */

// CHANGELOG.md -> [{ version, current, lines: [text] }], newest first. current: the version marked "(current)".
function parseChangelog(text){
  const out = [];
  let cur = null;
  for (const line of String(text || '').replace(/^﻿/, '').replace(/\r/g, '').split('\n')){
    let m;
    if ((m = line.match(/^##\s+v?(\d[\w.-]*)\s*(\(current\))?/))){ cur = { version: m[1], current: !!m[2], lines: [] }; out.push(cur); continue; }
    if (/^#/.test(line)){ cur = null; continue; }
    if (!cur) continue;
    if ((m = line.match(/^\s*[-*]\s+(.*)/))) cur.lines.push(m[1].trim());
    else if (/^\s{2,}\S/.test(line) && cur.lines.length) cur.lines[cur.lines.length - 1] += ' ' + line.trim();   // a line that wraps
  }
  return out;
}

// Is version a newer than b? ("0.3.10" > "0.3.9")
function newerVersion(a, b){
  const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// A time as "just now", "4m ago", "6h ago" or "3 days ago" ('' when there's none)
function ago(t, now = Date.now()){
  if (!(t > 0)) return '';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  if (min < 48 * 60) return Math.floor(min / 60) + 'h ago';
  return Math.floor(min / 1440) + ' days ago';
}

// A download's progress (0-1, or null when its size isn't known) as a percent: "42%" ('' when unknown)
const percent = p => (typeof p === 'number' ? Math.floor(Math.max(0, Math.min(1, p)) * 100) + '%' : '');
const megabytes = n => { const m = (+n || 0) / 1e6; return m >= 10 ? String(Math.round(m)) : m.toFixed(1); };
// "42% · 38 of 91 MB", or "12 MB" while the size isn't known
function downloadText({ progress, received, total } = {}){
  if (total && typeof progress === 'number') return `${percent(progress)} · ${megabytes(received)} of ${megabytes(total)} MB`;
  return received ? megabytes(received) + ' MB' : '';
}

// A release's date (GitHub's published_at) as "18 Oct 2026" ('' when there's none)
function releaseDate(iso){
  const d = new Date(iso || '');
  return iso && !isNaN(d) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export { ago, downloadText, newerVersion, parseChangelog, percent, releaseDate };
