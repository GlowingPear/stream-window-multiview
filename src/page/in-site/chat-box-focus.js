/* ---- Runs inside a Kick, Twitch or YouTube chat page (turned into text: see src/page/README.md). Puts the keyboard in
   the chat box, so you can type straight away in a chat you just switched to with Tab (windows/frames.js). A chat
   that's still loading draws its box later: it waits for it, up to ms. Not when you pressed or typed somewhere in the
   chat first. sel: the site module's chatBox.box. Says how it went (a promise): 'focused', 'left' (you pressed or
   typed first) or 'none' (no box in time: this may be a page before the chat, like Kick's Cloudflare check). */
function focusBoxAgent(sel, ms = 10000){
  return new Promise(done => {
    let stop = false;
    const off = () => { stop = true; };
    const opts = { capture: true, once: true };
    window.addEventListener('pointerdown', off, opts);
    window.addEventListener('keydown', off, opts);
    const end = r => { window.removeEventListener('pointerdown', off, opts); window.removeEventListener('keydown', off, opts); done(r); };
    const until = Date.now() + ms;
    const go = () => {
      if (stop) return end('left');
      const b = document.querySelector(sel);
      if (b){ b.focus(); return end(document.activeElement === b ? 'focused' : 'none'); }
      if (Date.now() < until) setTimeout(go, 150); else end('none');
    };
    go();
  });
}

export { focusBoxAgent };
