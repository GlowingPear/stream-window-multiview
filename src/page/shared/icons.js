import '../core.js';   // runs after it (see app.js)

const icon = {
  reload:'<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
  mod:'<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  pop:'<svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  max:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
  close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chevDown:'<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  chevUp:'<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  at:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
  atOff:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/><path d="M3 3l18 18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
  reply:'<svg viewBox="0 0 24 24"><path d="M10 8L5 12.5 10 17"/><path d="M5 12.5h9a5 5 0 0 1 5 5V19"/></svg>',
  live:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>',
  raid:'<svg viewBox="0 0 24 24"><path d="M4 12h12"/><path d="M12 7l5 5-5 5"/><path d="M20 5v14"/></svg>',
  download:'<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 20h14"/></svg>',
  bellOff:'<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/><path d="M4 4l16 16"/></svg>',
  user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  float:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="11" y="11" width="8" height="6" rx="1"/></svg>',
  dock:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18"/><path d="M12 6v6M9 9l3 3 3-3"/></svg>',
  grip:'<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  layout:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>',
  lock:'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  palette:'<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.3-1-1.6-1-2.8 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  game:'<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".9" fill="currentColor"/></svg>',
  undo:'<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo:'<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  help:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/></svg>',
  capture:'<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><rect x="11" y="9" width="7" height="5" rx="1"/></svg>',
  keys:'<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
  ext:'<svg viewBox="0 0 24 24"><path d="M10 4.5a2 2 0 0 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 0 0 0 4H19v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 0 0-4 0V20H6a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H5V7a1 1 0 0 1 1-1h4z"/></svg>',
  lock:'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock:'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
  like:'<svg viewBox="0 0 24 24"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M7 10l4-7a2.5 2.5 0 0 1 3 2.6L13.5 9H19a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.7 21H7"/></svg>',
  pin:'<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v6"/></svg>',
  popwin:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="12" rx="2"/><path d="M9 3h12v12"/><path d="M21 3l-7 7"/></svg>',
  colsview:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="16" rx="1"/><rect x="16" y="4" width="5" height="16" rx="1"/></svg>',
  chatview:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><path d="M14 5h7M14 9h7M14 13h7M14 17h5"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/></svg>',
  pause:'<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/></svg>',
  feat:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  link:'<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  volOn:'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  volOff:'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  sliders:'<svg viewBox="0 0 24 24"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  ytPlay:'<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/></svg>',
  update:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>',
  book:'<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4"/><path d="M9 7h6"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  signin:'<svg viewBox="0 0 24 24"><path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M9 17l5-5-5-5"/><path d="M14 12H3"/></svg>',
  bin:'<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M10 11v6M14 11v6"/></svg>',
  hidebar:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18"/><path d="M9 16l3-3 3 3"/></svg>',
  showbar:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18"/><path d="M9 13l3 3 3-3"/></svg>',
  hidebarL:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18"/><path d="M16 9l-3 3 3 3"/></svg>',
  showbarL:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18"/><path d="M13 9l3 3-3 3"/></svg>',
  tile:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
  fold:'<svg viewBox="0 0 24 24"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>',
  unfold:'<svg viewBox="0 0 24 24"><path d="M6 17l5-5-5-5M13 17l5-5-5-5"/></svg>'
};
// Icons in the page's own markup: <i data-ico="name"></i>
const fillIcons = root => root.querySelectorAll('i[data-ico]').forEach(i => { i.innerHTML = icon[i.dataset.ico] || ''; });
fillIcons(document);
// A toolbar item's name (shown on the left toolbar, in ⋯ and as its tooltip) and icon
function setTb(b, label, ico){
  if (!b) return;
  b.dataset.label = label; b.setAttribute('aria-label', label);
  const l = b.querySelector('.tb-l'); if (l) l.textContent = label;
  const i = b.querySelector('i[data-ico]'); if (i && ico && i.dataset.ico !== ico){ i.dataset.ico = ico; i.innerHTML = icon[ico]; }
}

export { icon, setTb };
