/* ---- Runs inside a Kick, Twitch or YouTube chat page (turned into text: see src/page/README.md). Puts the keyboard in
   the chat box, so you can type straight away in a chat you just switched to with Tab (windows/frames.js). A chat
   that's still loading draws its box later: it waits for it, up to ms. The sites draw their box before it can take
   the keyboard, and draw it again as they finish loading (Kick): for hold ms after it has the keyboard, it's put back
   when the page drops it. Not when you pressed or typed somewhere in the chat. sel: the site module's chatBox.box.
   Says how it went (a promise): 'focused', 'left' (you pressed or typed) or 'none' (no box in time: this may be a page
   before the chat, like Kick's Cloudflare check). */
function focusBoxAgent(sel, ms = 10000, hold = 3000){
  return new Promise(done => {
    let stop = false, had = 0;
    const off = () => { stop = true; };
    const opts = { capture: true, once: true };
    window.addEventListener('pointerdown', off, opts);
    window.addEventListener('keydown', off, opts);
    const end = r => { window.removeEventListener('pointerdown', off, opts); window.removeEventListener('keydown', off, opts); done(r); };
    const until = Date.now() + ms;
    const go = () => {
      if (stop) return end('left');
      const b = document.querySelector(sel), a = document.activeElement;
      // (once it had it: only when the page dropped it, not when it went to something else in the page)
      if (b && !b.contains(a) && (!had || !a || a === document.body)) b.focus();
      if (b && b.contains(document.activeElement)) had = had || Date.now();
      if (had && Date.now() - had >= hold) return end('focused');
      if (Date.now() < until || had) setTimeout(go, 150); else end('none');
    };
    go();
  });
}

export { focusBoxAgent };
