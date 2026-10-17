'use strict';
// Monitors for "Extend across monitors" (Settings > Layouts > Monitors): what each monitor is, finding one saved
// earlier again, and which monitor each part of a layout goes on. Plain functions on Electron's display objects,
// so the unit tests can give them any monitors they like.

// A monitor as the page sees it: numbered left to right (then top to bottom), as in the diagram and Identify.
function describe(displays, primaryId) {
  return [...displays]
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id, n: i + 1, label: d.label || '', primary: d.id === primaryId,
      x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height,
      work: { ...d.workArea }, scale: d.scaleFactor || 1, portrait: d.bounds.height > d.bounds.width
    }));
}
// What the page saves to find a monitor again: its id, and its name, size and place in case the id changes
// (after a restart, a driver update or plugging it into another port).
const keyOf = m => m && { id: m.id, label: m.label, x: m.x, y: m.y, w: m.w, h: m.h };

// A saved monitor among the ones there now: the same id, else the same name and size, else the same size and
// place, else none.
function findMonitor(key, monitors) {
  if (!key) return null;
  return monitors.find(m => m.id === key.id)
    || (key.label ? monitors.find(m => m.label === key.label && m.w === key.w && m.h === key.h) : null)
    || monitors.find(m => m.w === key.w && m.h === key.h && m.x === key.x && m.y === key.y)
    || null;
}

// Where the parts of a layout go: { chats, streams, switch } are saved monitors, or empty for "with the chats"
// (the chats: where the main window is now). Gives a monitor id for each, and missing: true when one of them
// isn't there now (then everything stays on one monitor).
function placeParts(parts, monitors, mainId) {
  const p = parts || {};
  const chatsM = p.chats ? findMonitor(p.chats, monitors) : null;
  const chats = chatsM ? chatsM.id : mainId;
  const pick = key => { if (!key) return { id: chats, ok: true }; const m = findMonitor(key, monitors); return { id: m ? m.id : chats, ok: !!m }; };
  const streams = pick(p.streams), sw = pick(p.switch);
  const missing = (!!p.chats && !chatsM) || !streams.ok || !sw.ok;
  if (missing) return { chats: mainId, streams: mainId, switch: mainId, missing };
  return { chats, streams: streams.id, switch: sw.id, missing };
}

// A window's bounds filling a monitor's work area (the part the taskbar or the Dock leaves)
const fill = (m, inset = 0) => ({ x: m.work.x + inset, y: m.work.y + inset, width: m.work.width - 2 * inset, height: m.work.height - 2 * inset });
// A window of a given size in the middle of a monitor, no bigger than it
function centre(m, width, height) {
  const w = Math.min(width, m.work.width), h = Math.min(height, m.work.height);
  return { x: Math.round(m.work.x + (m.work.width - w) / 2), y: Math.round(m.work.y + (m.work.height - h) / 2), width: w, height: h };
}

module.exports = { centre, describe, fill, findMonitor, keyOf, placeParts };
