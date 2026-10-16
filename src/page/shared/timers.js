// Two kinds of timer the page uses again and again.
//   soon(fn, ms)                 fn runs ms after the last call (a debounce): saving, or redrawing after a burst
//                                of changes. soon(…).cancel() drops a run that's waiting.
//   winTimer(w, name, fn, ms)    one of a window's own timers (w.timers): starting it again restarts it, and
//                                closing the window (releaseWin) stops them all with stopWinTimers(w).
function soon(fn, ms){
  let t = 0;
  const run = () => { clearTimeout(t); t = setTimeout(fn, ms); };
  run.cancel = () => clearTimeout(t);
  return run;
}
function winTimer(w, name, fn, ms){
  const t = w.timers || (w.timers = {});
  clearTimeout(t[name]);
  t[name] = setTimeout(() => { delete t[name]; fn(); }, ms);
}
function stopWinTimer(w, name){ if (w.timers){ clearTimeout(w.timers[name]); delete w.timers[name]; } }
function stopWinTimers(w){ for (const n in w.timers || {}) clearTimeout(w.timers[n]); w.timers = {}; }

export { soon, stopWinTimer, stopWinTimers, winTimer };
