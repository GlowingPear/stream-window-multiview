import { element } from './element.js';

/* ---------- tooltips ----------
   The app shows its own tooltips instead of the browser's (on a Mac those are separate system windows
   that pop up over everything, including these). Buttons that show only an icon (or whose words are
   hidden because the toolbar is narrow) get a one- or two-word name, with their longer title underneath
   when it says more. Anything else with a title shows that. While the pointer rests on something, its
   title and its parents' titles are put aside so the browser has none to show, and put back after. */
const ttl = b => b.title || b.dataset.tipTitle || '';   // its title (put aside while the pointer is on it)
let TIPS;
// words it shows (not the keys it shows: "Ctrl K" on the Search button)
const hasWords = el => /[A-Za-z]{2,}/.test([...el.querySelectorAll('kbd')].reduce((t, k) => t.replace(k.innerText, ''), el.innerText || ''));
// The short name for a control that shows no words, or '' when it doesn't need one (its words are showing).
// A control's short name from TIPS, or ''.
function tipName(el){
  for (const [sel, name] of TIPS) if (el.matches(sel)) return typeof name === 'function' ? name(el) : name;
  return '';
}
function tipFor(el){
  if (!el || hasWords(el)) return '';
  const name = tipName(el); if (name) return name;
  if (el.dataset.label) return el.dataset.label;                        // a toolbar item showing its icon only
  const hidden = (el.textContent || '').replace(/\s+/g, ' ').trim();   // words hidden by the narrow toolbar
  return /[A-Za-z]{2,}/.test(hidden) ? el.textContent.trim() : '';
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  TIPS = [
    ['#moreBtn', 'More'], ['[data-play]', 'Play'], ['.st-chip button', 'Remove'],
    ['[data-a=feat]', b => b.classList.contains('on') ? 'Normal size' : 'Highlight'],
    ['[data-a=star]', b => b.classList.contains('on') ? 'Unsave' : 'Save'],
    ['[data-a=like]', b => b.classList.contains('on') ? 'Remove like' : 'Like'],
    ['[data-a=reload]', b => /different window/i.test(ttl(b)) ? 'Pick window' : 'Reload'],
    ['[data-a=profile]', 'Profile'], ['#profBtn', 'Profiles'], ['#palBtn', 'Search'], ['.sv .prof', 'Profile'],
    ['[data-a=pop]', 'Pop out'], ['[data-a=max]', 'Maximize'], ['[data-a=mod]', 'Mod view'], ['[data-a=close]', 'Close'],
    ['[data-a=ext]', 'Extensions'], ['[data-a=at]', 'Mentions'], ['[data-a=more]', 'More'],
    ['[data-a=state]', 'Copy window state'], ['[data-a=inspect]', 'Inspect'],
    ['[data-v=mute], .fs-mute', 'Mute'],
    ['[data-z="-1"]', 'Smaller text'], ['[data-z="1"]', 'Bigger text'],
    ['#colNav [data-d="-1"]', 'Scroll left'], ['#colNav [data-d="1"]', 'Scroll right'],
    ['.cs-btn[data-d="-1"]', 'Previous'], ['.cs-btn[data-d="1"]', 'Next'],
    ['.fs-mdock', 'Dock'], ['.fs-mfloat', 'Float'], ['.fs-mwin', 'Own window'],
    ['.fs-play', b => /^play/i.test(ttl(b)) ? 'Play' : 'Pause'], ['.fs-rl', b => /reconnect/i.test(ttl(b)) ? 'Reconnect' : 'Refresh'],
    ['.fs-pv', b => /^hide/i.test(ttl(b)) ? 'Hide preview' : 'Show preview'], ['.fs-x', 'Remove'], ['.fs-grip', 'Move'],
    ['.help-x', 'Close'], ['.pr-up', 'Update'], ['.pr-x', 'Delete'], ['.th-del', 'Delete'],
    ['#savedList .auto', 'Auto-open'], ['#savedList .bell', 'Notify'], ['#savedList .rm', 'Remove'],
    // linked accounts: a site's tab on a title bar, + after them, the ⋯ menu's Link accounts, a Channels row's ▾
    ['.ptab', b => (b.getAttribute('aria-label') || '').split(' · ')[0]], ['.ptab-add', 'Open again'], ['[data-a=link]', 'Link accounts'],
    ['#savedList .exp', 'Accounts'], ['.lc-x', 'Remove'], ['.lc-no', 'Not the same']
  ];
  window.tipFor = tipFor;   // for the tests
  (function(){
    const tip = document.createElement('div'); tip.id = 'tip'; document.body.appendChild(tip);
    let target = null, timer = null, aside = [];
    const hide = () => {
      clearTimeout(timer); tip.classList.remove('on');
      aside.forEach(el => { if (!el.title) el.title = el.dataset.tipTitle; delete el.dataset.tipTitle; });   // a title set meanwhile wins
      aside = []; target = null;
    };
    const show = el => {
      if (!el.isConnected) return;
      const name = tipFor(el), text = el.dataset.tipTitle || '';
      if (!name && !text) return;
      tip.innerHTML = '';
      tip.classList.toggle('plain', !name);
      if (name){
        tip.append(name);
        if (el.dataset.keys) tip.append(' ', element('kbd', null, el.dataset.keys));   // its keys, drawn as a key
        const norm = t => t.toLowerCase().replace(/[^a-z]/g, '');
        const more = text.startsWith(name + '\n') ? text.slice(name.length + 1) : text;   // a title whose first line is the name: the rest
        if (more && norm(more) !== norm(name)){ const sm = document.createElement('small'); sm.textContent = more; tip.appendChild(sm); }
      } else tip.append(text);
      const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      if (document.body.classList.contains('bar-left') && el.closest('header')){     // beside the left toolbar
        tip.style.left = Math.round(el.closest('header').getBoundingClientRect().right + 8) + 'px';
        tip.style.top = Math.round(Math.max(6, Math.min(innerHeight - tr.height - 6, r.top + r.height / 2 - tr.height / 2))) + 'px';
        tip.classList.add('on');
        return;
      }
      const below = r.bottom + 6 + tr.height < innerHeight;
      tip.style.left = Math.round(Math.max(6, Math.min(innerWidth - tr.width - 6, r.left + r.width / 2 - tr.width / 2))) + 'px';
      tip.style.top = Math.round(below ? r.bottom + 6 : r.top - 6 - tr.height) + 'px';
      tip.classList.add('on');
    };
    document.addEventListener('pointerover', e => {
      const t = e.target.closest ? e.target : null;
      const el = t && (t.closest('button, .fs-grip') || t.closest('[title], [data-tip-title]'));
      if (el === target) return;
      hide();
      if (!t) return;
      for (let n = t; n && n !== document.documentElement; n = n.parentElement)   // nothing left for the browser to show
        if (n.title){ n.dataset.tipTitle = n.title; n.removeAttribute('title'); aside.push(n); }
      if (!el || !(tipFor(el) || el.dataset.tipTitle)) return;
      target = el;
      timer = setTimeout(() => { if (target === el) show(el); }, 400);
    });
    document.addEventListener('pointerout', e => { if (!target || !e.relatedTarget || !target.contains(e.relatedTarget)) hide(); });   // not when moving onto the icon inside
    ['pointerdown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, hide, true));
    window.addEventListener('blur', hide);
  })();
}

export { init, tipName };
