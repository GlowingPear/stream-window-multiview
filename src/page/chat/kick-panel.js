import { kickApi } from '../in-site/kick-api.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { askIn } from '../windows/view.js';

// What Kick's chat panels share in a chat window: /poll (chat/kick-poll.js), /prediction (chat/kick-prediction.js) and
// /clip (chat/kick-clip.js) each get a copy of what Kick shows for them on the channel page, sliding up over the bottom of
// the chat, its full width (.kcmd in kick-commands.css).

// A kick.com page in its own window with its sound off and your login (the channel's page, a clip's)
function openKickPage(url, name = '_blank'){
  if (DESKTOP) window.kmv.openWindow(url, 1280, 800, { muted: true });
  else window.open(url, name, 'width=1280,height=800');
}
const openChannelPage = ch => openKickPage(`https://kick.com/${encodeURIComponent(ch)}`, 'kmv_page_' + ch);
// A link Kick opens in a new tab (its terms, a share page): in the browser
function openInBrowser(url){
  if (DESKTOP) window.kmv.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

// A request to Kick's API from w's chat page, with its login (in-site/kick-api.js): { ok, status, message, data }, status 0
// when there was no answer (the page couldn't be asked either)
const askKick = (w, url, method = 'GET', body) =>
  askIn(w.view, `(${kickApi})(${[url, method, body].filter(x => x !== undefined).map(x => JSON.stringify(x)).join(', ')})`)
    .catch(() => null).then(r => r || { ok: false, status: 0, message: '', data: null });

// Kick's own icons (from kick.com), 20 × 20
const KICK_ICONS = {
  one: '<svg viewBox="0 0 20 21" fill="#18FBB0"><path fill-rule="evenodd" d="M10 20.5C15.5228 20.5 20 16.0228 20 10.5C20 4.97715 15.5228 0.5 10 0.5C4.47715 0.5 0 4.97715 0 10.5C0 16.0228 4.47715 20.5 10 20.5ZM11.6427 16.3333V4.25H9.24133L6.25 6.14392V8.40955L9.01713 6.67493H9.08793V16.3333H11.6427Z"/></svg>',
  two: '<svg viewBox="0 0 20 21" fill="#FEA0A0"><path fill-rule="evenodd" d="M10 20.5C15.5228 20.5 20 16.0228 20 10.5C20 4.97715 15.5228 0.5 10 0.5C4.47715 0.5 0 4.97715 0 10.5C0 16.0228 4.47715 20.5 10 20.5ZM5.12042 14.8714V16.75H13.9114V14.6185H8.73314V14.5342L10.5335 12.77C11.3805 11.9993 12.0368 11.339 12.5024 10.789C12.968 10.2351 13.2912 9.73129 13.4718 9.2777C13.6565 8.8241 13.7488 8.36448 13.7488 7.89884C13.7488 7.18834 13.5662 6.55812 13.2009 6.00819C12.8356 5.45825 12.3238 5.02874 11.6655 4.71965C11.0112 4.40655 10.2425 4.25 9.35935 4.25C8.50032 4.25 7.74165 4.41257 7.08333 4.73772C6.42502 5.06286 5.91321 5.52248 5.54793 6.11657C5.18264 6.71066 5 7.41113 5 8.21797H7.47471C7.47471 7.82458 7.55098 7.48539 7.70352 7.20039C7.85605 6.91538 8.07282 6.69661 8.35381 6.54408C8.63479 6.39154 8.96395 6.31527 9.34128 6.31527C9.70255 6.31527 10.0257 6.38752 10.3107 6.53203C10.5957 6.67253 10.8205 6.87524 10.9851 7.14017C11.1496 7.40109 11.2319 7.71219 11.2319 8.07346C11.2319 8.3986 11.1657 8.70167 11.0332 8.98266C10.9008 9.25963 10.7061 9.54263 10.4492 9.83165C10.1963 10.1207 9.88319 10.4458 9.50987 10.8071L5.12042 14.8714Z"/></svg>',
  crossCircle: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M10 1.67a8.34 8.34 0 1 0 0 16.67 8.34 8.34 0 0 0 0-16.67m3.93 11.07a.83.83 0 0 1-.6 1.42 1 1 0 0 1-.59-.24L10 11.18l-2.74 2.74a.8.8 0 0 1-.6.24.83.83 0 0 1-.6-1.42L8.84 10 6.08 7.26a.83.83 0 1 1 1.17-1.18l2.74 2.75 2.74-2.75a.83.83 0 1 1 1.18 1.18L11.17 10l2.74 2.74z"/></svg>',
  checkCircle: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M10 1.67a8.34 8.34 0 1 0 0 16.67 8.34 8.34 0 0 0 0-16.67m4.75 5.75-5 6.66c-.22.3-.55.48-.9.5h-.1c-.33 0-.65-.13-.88-.36l-2.5-2.5c-.5-.5-.5-1.29 0-1.77.49-.48 1.28-.5 1.76 0l1.49 1.48 4.13-5.51a1.25 1.25 0 0 1 2 1.5"/></svg>',
  check: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M7.22 17.4a1 1 0 0 1-.71-.33l-4.63-5.55a.93.93 0 1 1 1.43-1.19l3.9 4.68 9.47-12.06a.93.93 0 1 1 1.46 1.14L7.95 17.04a1 1 0 0 1-.7.35z"/></svg>',
  info: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M10 1.67a8.34 8.34 0 1 0 0 16.67 8.34 8.34 0 0 0 0-16.67m1.67 12.5a1.67 1.67 0 0 1-3.33 0V10a1.66 1.66 0 1 1 3.33 0zM10 7.5a1.67 1.67 0 0 1 0-3.33c.92 0 1.67.75 1.67 1.66 0 .92-.75 1.67-1.67 1.67"/></svg>',
  bubbles: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M13.33 11.67a5 5 0 1 0 0-10 5 5 0 0 0 0 10m-7.5 6.66a4.17 4.17 0 1 0 0-8.33 4.17 4.17 0 0 0 0 8.33m9.59 0a2.92 2.92 0 1 0 0-5.83 2.92 2.92 0 0 0 0 5.83"/></svg>',
  chart: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M16.67 1.67H3.33c-.91 0-1.66.75-1.66 1.66v13.34c0 .91.75 1.66 1.66 1.66h13.34c.91 0 1.66-.75 1.66-1.66V3.33c0-.91-.75-1.66-1.66-1.66m-10 12.5a1.67 1.67 0 0 1-3.33 0v-5a1.66 1.66 0 1 1 3.33 0zm5 0a1.67 1.67 0 0 1-3.33 0V12.5a1.66 1.66 0 1 1 3.33 0zm5 0a1.67 1.67 0 0 1-3.33 0V5.83a1.66 1.66 0 0 1 3.33 0z"/></svg>',
  copy: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M15 4.17v-.84c0-.91-.75-1.66-1.67-1.66h-10c-.91 0-1.66.75-1.66 1.66v10c0 .92.75 1.67 1.66 1.67h.84V6.67a2.5 2.5 0 0 1 2.5-2.5z"/><path fill="currentColor" d="M16.67 5h-10C5.75 5 5 5.75 5 6.67v10c0 .92.75 1.66 1.67 1.66h10c.92 0 1.66-.74 1.66-1.66v-10c0-.92-.74-1.67-1.66-1.67"/></svg>',
  download: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M9.4 12.26q.26.25.6.24.34 0 .6-.24l5-5a.83.83 0 1 0-1.18-1.18l-3.58 3.58V2.5a.84.84 0 0 0-.83-.83.84.84 0 0 0-.83.83v7.16L5.6 6.08a.83.83 0 1 0-1.17 1.18l5 5z"/><path fill="currentColor" d="M16.67 9.17h-.84l-1.66 1.66h1.66c.46 0 .84.38.84.84v1.66c0 .46-.38.84-.84.84H4.17a.84.84 0 0 1-.84-.84v-1.66c0-.46.38-.84.84-.84h1.66L4.17 9.17h-.84c-.91 0-1.66.75-1.66 1.66v5.84c0 .91.75 1.66 1.66 1.66h13.34c.91 0 1.66-.75 1.66-1.66v-5.84c0-.91-.75-1.66-1.66-1.66"/></svg>',
  chat: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M16.67 1.67H3.33c-.91 0-1.66.75-1.66 1.66v10c0 .92.75 1.67 1.66 1.67H5v3.33L10 15h6.67c.91 0 1.66-.75 1.66-1.67v-10c0-.91-.75-1.66-1.66-1.66m0 10.83c0 .46-.38.83-.84.83H4.17a.84.84 0 0 1-.84-.83V4.17c0-.46.38-.84.84-.84h11.66c.46 0 .84.38.84.84z"/><path fill="currentColor" d="M5.83 10a1.67 1.67 0 1 0 0-3.33 1.67 1.67 0 0 0 0 3.33M10 10a1.67 1.67 0 1 0 0-3.33A1.67 1.67 0 0 0 10 10m4.17 0a1.67 1.67 0 1 0 0-3.33 1.67 1.67 0 0 0 0 3.33"/></svg>',
  facebook: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M19 9.97A9 9 0 1 0 7.83 18.7v-5.98H5.97V9.97h1.86V8.78c0-3.06 1.38-4.48 4.39-4.48.57 0 1.55.11 1.96.22v2.5q-.35-.04-1.04-.04c-1.48 0-2.05.56-2.05 2.01v.98h2.94l-.5 2.75h-2.44v6.18A9 9 0 0 0 19 9.97"/></svg>',
  x: '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M11.6 8.62 17.85 1h-1.48l-5.43 6.62L6.6 1h-5l6.56 10-6.56 8h1.48l5.74-7 4.58 7h5zM9.57 11.1l-.67-1-5.28-7.93h2.27l4.27 6.4.66 1 5.55 8.3H14.1z"/></svg>'
};
const kickIcon = (name, cls = 'ki') => element('span', { class: cls, 'aria-hidden': 'true', html: KICK_ICONS[name] });

// An empty panel in w's chat window (in place of any other), with its × and title: { card, title, body, close }.
// Esc and × close it, and so does close(); onClose runs once when it goes, however it goes.
function kickPanel(w, cls, label, onClose){
  const body = w.el.querySelector('.body');
  body.querySelector('.kcmd')?.remove();
  const title = element('h3', null, label), content = element('div', 'kcmd-c');
  const card = element('div', { class: 'kcmd ' + cls, role: 'dialog', 'aria-label': label, tabIndex: -1 },
    element('button', { type: 'button', class: 'kcmd-x', title: 'Close', 'aria-label': 'Close' }, '×'), title, content);
  let gone = false;
  const close = () => { card.remove(); };
  new MutationObserver((_, o) => { if (!card.isConnected && !gone){ gone = true; o.disconnect(); onClose?.(); } }).observe(body, { childList: true });
  card.querySelector('.kcmd-x').onclick = close;
  card.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented){ e.preventDefault(); close(); } });
  body.append(card);
  return { card, title, body: content, close };
}

export { askKick, kickIcon, kickPanel, openChannelPage, openInBrowser, openKickPage };
