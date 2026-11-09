import { $, wins } from '../core.js';
import { qualityAgent } from '../in-site/quality.js';
import { save } from '../persistence.js';
import { chanOpt, linkOpt, streamerOf } from '../platforms/linked.js';
import { platform } from '../platforms/platforms.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { icon } from '../shared/icons.js';
import { closeOnOutside } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { streamHidden } from './pause.js';
import { STEPS, capFor, choiceName, fitRange, isChoice, qualityOf, rangeName } from './quality-pick.js';
import { askIn } from './view.js';

/* ---- Stream quality: how high each stream window's player may go (what it picks: quality-pick.js) ----
   Settings › General has the choice for every stream (the site's own until you change it), Fits the window's range and
   what streams you can't see play at; Channel settings › Streams a channel's own (a linked streamer's, for all their
   sites); a window's quality button (its title bar: what it plays, "720p") its own, saved with the window. Every few
   seconds each stream's player is told its cap and asked what it plays (in-site/quality.js): Kick puts its own 720p cap
   back whenever its player loads again, and a window's size changes. Tabs you're not watching follow Settings ›
   Linked channels (Playing). Only in the desktop app: a browser can't reach into the players. */
const TICK = 2000;
const HIDDEN_AFTER = 2000;               // a stream out of sight this long plays at its lowest (as auto-pause waits)
let menu, menuFor = null, menuBtn = null;
const siteMax = w => platform(w.channel).quality.siteMax ?? null;
const can = w => DESKTOP && w.kind === 'stream' && !!w.channel && !!platform(w.channel).quality;
const globalChoice = () => qualityOf(settings.text('quality', 'site'));
// A channel's own (Channel settings › Streams): a linked streamer's, or the channel's on its own. null: Settings'
function channelChoice(ch){
  const s = streamerOf(ch), c = s ? s.playQuality : chanOpt(ch, 'quality');
  return isChoice(c) ? c : null;
}
const choiceFor = w => qualityOf(w.quality, channelChoice(w.channel), globalChoice());
// At its lowest now? A tab you're not watching (Settings › Linked channels), or a stream out of sight for a moment
// (off the screen, behind the big stream, or the app's window minimized), unless Settings › General says otherwise
function playsLow(w, now = Date.now()){
  if (w.hiddenTab) return linkOpt('quality') === 'low';
  const hidden = settings.text('qualityHidden', 'low') === 'low' && (document.hidden || streamHidden(w));
  if (!hidden){ w.qHiddenSince = 0; return false; }
  if (!w.qHiddenSince) w.qHiddenSince = now;
  return now - w.qHiddenSince >= HIDDEN_AFTER;
}
// Its picture area on the screen
function sizeOf(w){
  const r = w.view && w.view.getBoundingClientRect();
  return { w: r && r.width || w.w, h: r && r.height || w.h, dpr: window.devicePixelRatio || 1 };
}
const capOf = w => capFor({ choice: choiceFor(w), siteMax: siteMax(w), fit: settings.json('qualityFit', null), size: sizeOf(w), low: playsLow(w) });
// Tell its player its cap, and hear what it plays
async function applyQuality(w){
  if (!can(w) || !w.ready || !w.view) return;
  const view = w.view;
  const r = await askIn(view, `(${qualityAgent})(${JSON.stringify(capOf(w))})`).catch(() => null);
  if (w.view !== view || !wins.includes(w)) return;
  const was = JSON.stringify([w.qNow, w.qAll]);
  w.qNow = r && r.now || null; w.qAll = r && r.all || null;
  if (JSON.stringify([w.qNow, w.qAll]) !== was){ syncQualityBtn(w); if (menuFor === w && !menu.hidden) renderMenu(); }
}
const qualityTick = () => wins.forEach(w => applyQuality(w));
// The title bar's button: what it plays ("720p"), once its player says. Its icon shows in the ⋯ menu only.
function syncQualityBtn(w){
  const b = w.el && w.el.querySelector('.btns [data-a=quality]'); if (!b) return;
  const now = w.qNow;
  b.hidden = !now;
  b.querySelector('.q-n').textContent = now ? now.h + 'p' : '';
  const c = choiceFor(w);
  b.title = `Quality${now ? ': ' + now.name : ''} · ${choiceName(c)}${c === 'fit' ? ` (${rangeName(settings.json('qualityFit', null), siteMax(w))})` : ''}`;
}
// A window's own choice (null: its channel's), from its menu or the search box
function setWinQuality(w, c){
  w.quality = isChoice(c) ? c : null;
  save();
  syncQualityBtn(w);
  if (menuFor === w && !menu.hidden) renderMenu();
  applyQuality(w);
}

/* The window's quality menu (its title bar's button, or the ⋯ menu's row): three tiles (Channel's: what its channel
   and Settings say, Fit, Best), then a row of heights to go up to. Your choice is lit; the one playing has an outline. */
function openQualityMenu(w, btn){
  if (!menu.hidden && menuFor === w){ menu.hidden = true; return; }
  menuFor = w; menuBtn = btn;
  renderMenu();
  menu.hidden = false;
  const r = btn.getBoundingClientRect(), mw = menu.offsetWidth;
  menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
  menu.style.top = Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px';
}
function renderMenu(){
  const w = menuFor; if (!w || !wins.includes(w)){ menu.hidden = true; return; }
  const own = w.quality || null, theirs = qualityOf(channelChoice(w.channel), globalChoice());
  const fit = rangeName(settings.json('qualityFit', null), siteMax(w));
  const tile = (c, label, ico, tip) => element('button', { type: 'button', role: 'menuitemradio', class: 'qm-tile', 'aria-checked': String(own === c),
    title: tip, dataset: { q: c || 'channel', cmd: 'win.quality.' + (c || 'channel') }, onclick: () => setWinQuality(w, c) },
  element('span', { class: 'qm-ti', html: icon[ico] }), element('span', 'qm-tl', label));
  const has = new Set((w.qAll || []).map(q => q.h)), now = w.qNow && w.qNow.h;
  menu.replaceChildren(
    element('div', 'qm-h', element('span', null, 'Quality'), element('b', null, w.qNow ? w.qNow.name : '')),
    element('div', { class: 'qm-tiles', role: 'group', 'aria-label': 'How it picks' },
      tile(null, 'Channel\'s', 'layers', `As its channel says: ${choiceName(theirs)}${theirs === 'fit' ? ` (${fit})` : ''}. Channel settings › Streams, then Settings › General`),
      tile('fit', 'Fit', 'fit', `Fits the window: ${fit}, from its size on the screen`),
      tile('best', 'Best', 'star', 'The best the stream has')),
    element('div', { class: 'qm-steps', role: 'group', 'aria-label': 'Up to' }, ...[...STEPS].reverse().map(h => element('button', {
      type: 'button', role: 'menuitemradio', class: 'qm-step' + (now === h ? ' now' : '') + (has.size && !has.has(h) ? ' qm-no' : ''),
      'aria-checked': String(own === String(h)), title: `Up to ${h}p${now === h ? ' · playing now' : ''}${has.size && !has.has(h) ? ' · this stream has none: the next one down' : ''}`,
      dataset: { q: String(h), cmd: 'win.quality.' + h }, onclick: () => setWinQuality(w, String(h)) }, String(h)))));
}
// Its choices, for the search box (window-commands.js): the same as its menu
function qualityActions(w){
  if (!can(w)) return [];
  const own = w.quality || null, mark = c => own === c ? ' ✓' : '';
  return [
    { a: 'quality.channel', title: 'Quality: as its channel says' + mark(null), run: () => setWinQuality(w, null), sub: choiceName(qualityOf(channelChoice(w.channel), globalChoice())) },
    { a: 'quality.fit', title: 'Quality: fits the window' + mark('fit'), run: () => setWinQuality(w, 'fit'), sub: rangeName(settings.json('qualityFit', null), siteMax(w)) },
    { a: 'quality.best', title: 'Quality: best' + mark('best'), run: () => setWinQuality(w, 'best') },
    ...[...STEPS].reverse().map(h => ({ a: 'quality.' + h, title: `Quality: up to ${h}p` + mark(String(h)), run: () => setWinQuality(w, String(h)) }))
  ];
}

/* Settings › General: Stream quality (and Fits the window's range under it) and Hidden streams play at */
function syncQualitySettings(){
  const c = globalChoice(), f = fitRange(settings.json('qualityFit', null));
  $('#qualitySet').value = c;
  $('#qualityFitRow').hidden = c !== 'fit';
  $('#qualityMin').value = String(f.min);
  $('#qualityMax').value = String(f.max);
  $('#qualityHidden').value = settings.text('qualityHidden', 'low') === 'same' ? 'same' : 'low';
}
// A setting changed (here, in the other window or on another computer): every window again
function qualityChanged(){
  syncQualitySettings();
  wins.forEach(w => { syncQualityBtn(w); applyQuality(w); });
  if (!menu.hidden) renderMenu();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  menu = $('#qualityMenu');
  closeOnOutside(menu, { button: () => menuBtn, capture: true });
  $('#qualitySet').addEventListener('change', e => { settings.set('quality', e.target.value === 'site' ? null : e.target.value); qualityChanged(); });
  const setFit = () => { settings.set('qualityFit', { min: +$('#qualityMin').value, max: $('#qualityMax').value === 'site' ? 'site' : +$('#qualityMax').value }); qualityChanged(); };
  $('#qualityMin').addEventListener('change', setFit);
  $('#qualityMax').addEventListener('change', setFit);
  $('#qualityHidden').addEventListener('change', e => { settings.set('qualityHidden', e.target.value === 'low' ? null : e.target.value); qualityChanged(); });
  settings.onChange(['quality', 'qualityFit', 'qualityHidden'], qualityChanged);
  syncQualitySettings();
  // a channel's or streamer's own choice, and Settings › Linked channels (tabs you're not watching)
  store.watch('streamers', () => { wins.forEach(w => { syncQualityBtn(w); applyQuality(w); }); if (!menu.hidden) renderMenu(); });
  if (DESKTOP) setInterval(qualityTick, TICK);
  window.quality = { capOf, choiceFor, playsLow, applyQuality, setWinQuality, open: openQualityMenu };   // for the tests
}

export { applyQuality, init, openQualityMenu, qualityActions };
