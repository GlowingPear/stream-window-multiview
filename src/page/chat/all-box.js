import { element } from '../shared/element.js';

/* ---- ALL's box (chat/all-chat.js): one line to type in, with the emotes picked in it as their pictures ----
   An editable element that reads and writes as the text box it replaced: value (an emote in it is its name),
   selectionStart and selectionEnd (counted in value's characters), placeholder, disabled and maxLength, so the code that
   fills it, reads it and puts the caret in it is the same. pics() -> the emotes picked (name -> picture), or null: a word
   in it with one of those names shows as its picture (a word that only looks like an emote stays a word). Pasted or
   dropped in: text only, on one line. */
function emoteBox(props, pics){
  const box = element('div', { class: 'all-in', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'false', spellcheck: 'true', ...props });
  let max = 500;
  const valueOf = n => (n.nodeType === 3 ? n.nodeValue.replace(/ /g, ' ') : n.nodeName === 'IMG' ? n.alt : n.nodeName === 'BR' ? '' : [...n.childNodes].map(valueOf).join(''));
  const lengthOf = n => valueOf(n).length;
  // where (node, offset) is in value
  const offsetOf = (node, off) => {
    let at = 0, done = false;
    const walk = el => {
      [...el.childNodes].forEach((c, i) => {
        if (done) return;
        if (el === node && i === off){ done = true; return; }
        if (c === node && c.nodeType === 3){ at += off; done = true; return; }
        if (c.nodeType === 3 || c.nodeName === 'IMG') at += lengthOf(c); else walk(c);
      });
      if (el === node) done = true;
    };
    walk(box);
    return at;
  };
  const range = () => { const s = getSelection(); return s && s.rangeCount && box.contains(s.getRangeAt(0).startContainer) ? s.getRangeAt(0) : null; };
  // the caret at a place in value (inside an emote's name: after the emote)
  const caretAt = n => {
    const r = document.createRange(); let left = Math.max(0, n), set = false;
    const walk = el => [...el.childNodes].forEach(c => {
      if (set) return;
      if (c.nodeType === 3){ if (left <= c.nodeValue.length){ r.setStart(c, left); set = true; } else left -= c.nodeValue.length; }
      else if (c.nodeName === 'IMG'){ if (left <= 0){ r.setStartBefore(c); set = true; } else { left -= c.alt.length; if (left <= 0){ r.setStartAfter(c); set = true; } } }
      else walk(c);
    });
    walk(box);
    if (!set){ r.selectNodeContents(box); r.collapse(false); }
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  const draw = text => {
    const m = pics() || new Map(), out = [];
    String(text || '').split(/(\s+)/).forEach(word => {
      const url = word && m.get(word);
      if (url){ const img = element('img', { class: 'all-ie', src: url, alt: word, draggable: false, referrerPolicy: 'no-referrer' }); img.onerror = () => img.replaceWith(document.createTextNode(word)); out.push(img); }
      else if (word){ if (typeof out[out.length - 1] === 'string') out[out.length - 1] += word; else out.push(word); }
    });
    box.replaceChildren(...out);
  };
  Object.defineProperties(box, {
    value: { get: () => valueOf(box), set: v => draw(v) },
    selectionStart: { get(){ const r = range(); return r ? offsetOf(r.startContainer, r.startOffset) : this.value.length; }, set: n => caretAt(n) },
    selectionEnd: { get(){ const r = range(); return r ? offsetOf(r.endContainer, r.endOffset) : this.value.length; }, set: n => caretAt(n) },
    placeholder: { get: () => box.getAttribute('placeholder') || '', set: v => box.setAttribute('placeholder', v) },
    disabled: { get: () => box.getAttribute('aria-disabled') === 'true', set: v => { box.setAttribute('aria-disabled', String(!!v)); box.contentEditable = v ? 'false' : 'true'; } },
    maxLength: { get: () => max, set: v => { max = +v || 500; } }
  });
  // one line: no new lines (Enter sends: chat/all-chat.js), text only in, nothing left over when it's emptied, no more than maxLength
  const insertText = t => document.execCommand('insertText', false, String(t || '').replace(/\s*[\r\n]+\s*/g, ' '));
  box.addEventListener('beforeinput', e => { if (/^insert(Paragraph|LineBreak)$/.test(e.inputType)) e.preventDefault(); });
  box.addEventListener('paste', e => { e.preventDefault(); insertText(e.clipboardData && e.clipboardData.getData('text/plain')); });
  box.addEventListener('drop', e => { e.preventDefault(); box.focus(); insertText(e.dataTransfer && e.dataTransfer.getData('text/plain')); });
  box.addEventListener('input', () => {
    const v = box.value;
    if (!v && box.firstChild) box.replaceChildren();   // (the placeholder shows again)
    else if (v.length > max){ draw(v.slice(0, max)); caretAt(max); }
  });
  return box;
}

export { emoteBox };
