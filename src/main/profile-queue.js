// Fetches saved streamers' profiles (picture, name, followers, past broadcasts) in the background, so the
// Saved list and the Profiles cards have pictures without opening each profile first.
//
// - Soon (a few seconds apart): a channel that was just saved or imported, or that just went live.
// - Slowly (one every 30 s): saved channels the app knows nothing about yet, or hasn't looked at for a week.
// One at a time, and a channel looked at within the last day is skipped, so a long session or a big
// import doesn't keep asking the sites.
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

function createProfileQueue({ fetch, infoAt, now = () => Date.now(), soonGap = 3000, slowGap = 30000, fresh = DAY, stale = 7 * DAY, retry = HOUR } = {}) {
  let saved = null;                     // null until the first list: then everything is "slow", not "just saved"
  const soon = [], slow = [], tried = new Map(), wasLive = new Set();
  let running = false, stopped = false, wake = null, timer = null;

  const age = ch => { const at = infoAt(ch); return Number.isFinite(at) ? now() - at : Infinity; };
  const failedLately = ch => tried.has(ch) && now() - tried.get(ch) < retry;
  const queued = ch => soon.includes(ch) || slow.includes(ch);

  function addSoon(ch) {
    if (!saved || !saved.has(ch) || age(ch) < fresh || failedLately(ch)) return;
    const i = slow.indexOf(ch); if (i >= 0) slow.splice(i, 1);
    if (!soon.includes(ch)) soon.push(ch);
    kick();
  }
  function addStale() {
    if (!saved) return;
    for (const ch of saved) if (!queued(ch) && age(ch) >= stale && !failedLately(ch)) slow.push(ch);
    kick();
  }

  // The saved channels (every time the list changes). Ones that weren't there before were just saved.
  function setSaved(list) {
    const next = new Set((Array.isArray(list) ? list : []).map(String));
    const first = !saved, before = saved;
    saved = next;
    for (const q of [soon, slow]) for (let i = q.length - 1; i >= 0; i--) if (!next.has(q[i])) q.splice(i, 1);
    if (!first) for (const ch of next) if (!before.has(ch)) addSoon(ch);
    addStale();
  }

  // A round of live checks: channels that went live since the last round (or were live at start-up).
  function sawLive(snap) {
    for (const [ch, info] of Object.entries(snap || {})) {
      const live = !!(info && info.live && !info.missing);
      if (live && !wasLive.has(ch)) addSoon(ch);
      if (live) wasLive.add(ch); else wasLive.delete(ch);
    }
  }

  // Something to do soon while waiting out a slow gap: go once the soon gap has passed.
  let pausedAt = 0;
  function kick() {
    if (wake && soon.length) {
      const w = wake; wake = null; clearTimeout(timer);
      timer = setTimeout(w, Math.max(0, soonGap - (Date.now() - pausedAt)));
    }
    if (!running && !stopped) run();
  }
  const pause = ms => new Promise(r => { pausedAt = Date.now(); wake = r; timer = setTimeout(() => { wake = null; r(); }, ms); });

  async function run() {
    running = true;
    try {
      while (!stopped && (soon.length || slow.length)) {
        const isSoon = soon.length > 0, ch = isSoon ? soon.shift() : slow.shift();
        if (!saved.has(ch) || age(ch) < (isSoon ? fresh : stale) || failedLately(ch)) continue;
        let ok = false;
        try { ok = !!(await fetch(ch)); } catch {}
        if (ok && age(ch) < fresh) tried.delete(ch); else tried.set(ch, now());
        if (stopped) break;
        if (soon.length || slow.length) await pause(soon.length ? soonGap : slowGap);
      }
    } finally { running = false; }
  }

  return {
    setSaved, sawLive, addStale,
    stop() { stopped = true; clearTimeout(timer); if (wake) { const w = wake; wake = null; w(); } },
    pending: () => ({ soon: [...soon], slow: [...slow] }),
    busy: () => running
  };
}

module.exports = { createProfileQueue, DAY };
