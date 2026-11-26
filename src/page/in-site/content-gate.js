/* ---- Runs inside a stream's player page (turned into text: see src/page/README.md). Says when you press the player's own
   "Watch Anyway" on its content gate (sel: its site's contentGate.press), so the app can load the stream again without
   the gate (windows/content-gate.js): Twitch's embedded player keeps the gate up after that press when your Twitch
   content preferences limit the stream's labels. Only a real press counts. */
function gateAgent(sel){
  if (window.__kmvGate) return;
  window.__kmvGate = true;
  document.addEventListener('click', e => {
    if (e.isTrusted && e.target instanceof Element && e.target.closest(sel)) console.log('__kmv:watch-anyway {}');
  }, true);
}

export { gateAgent };
