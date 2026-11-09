/* ---- What quality a stream window asks its player for (windows/quality.js). Nothing here touches the page (the unit
   tests load it on its own). ----
   A choice is the window's own (its quality menu), else its channel's (Channel settings › Streams), else Settings ›
   General's: 'site' (the site's own choice: Kick's caps itself at 720p), 'fit' (from the window's size on screen,
   between Settings' lowest and highest), 'best', or a highest to go up to ('1080' … '160'). A stream you can't see
   plays at its lowest (Settings › General › Hidden streams play at). */
const QUALITIES = ['site', 'fit', 'best', '1080', '720', '480', '360', '160'];
const STEPS = [160, 360, 480, 720, 1080];            // the heights the menus offer, lowest first
const BEST = 100000;                                  // a cap no stream reaches: its best
const FIT = { min: 160, max: 'site' };                // Fits the window: from 160p up to the site's own highest
const isChoice = c => QUALITIES.includes(c);
// The first of the window's, the channel's and Settings' that is a choice
const qualityOf = (...cs) => cs.find(isChoice) || 'site';
// Settings › General's range for Fits the window, made whole
function fitRange(f){
  const o = f && typeof f === 'object' ? f : {};
  return { min: STEPS.includes(+o.min) ? +o.min : FIT.min, max: STEPS.includes(+o.max) ? +o.max : 'site' };
}
/* The cap for the player (in-site/quality.js): a height, 0 for its lowest, or null for the site's own choice.
   siteMax: how high the site goes by itself (Kick's 720), or null (as high as the stream goes). size: the window's
   picture area in CSS pixels and the screen's pixel ratio ({ w, h, dpr }). low: it plays at its lowest (hidden). */
function capFor({ choice, siteMax = null, fit, size, low }){
  if (low) return 0;
  if (choice === 'best') return BEST;
  if (choice === 'fit') return fitCap(size, fitRange(fit), siteMax);
  if (isChoice(choice) && choice !== 'site') return +choice;
  return siteMax;
}
// Fits the window: the smallest step at least about as tall as the picture on screen (a 16:9 picture, letterboxed in
// the window), kept inside the range. Taller than 1080p: the best there is.
function fitCap(size, { min, max }, siteMax){
  const px = size ? Math.min(size.h, size.w * 9 / 16) * (size.dpr || 1) : 0;
  const step = STEPS.find(s => s >= px * 0.9) ?? BEST;
  const top = max === 'site' ? siteMax ?? BEST : max;
  return Math.min(Math.max(step, min), top);
}
// What a choice is called in the menus: "Fits the window", "Up to 720p"
function choiceName(c){
  if (c === 'site') return 'Site\'s own';
  if (c === 'fit') return 'Fits the window';
  if (c === 'best') return 'Best';
  return isChoice(c) ? `Up to ${c}p` : 'Site\'s own';
}
// Fits the window's range: "160–720p", or "160p up to the site's own"
const rangeName = (f, siteMax) => { const { min, max } = fitRange(f), top = max === 'site' ? siteMax : max;
  return top ? `${min}–${top}p` : `${min}p and up`; };

export { capFor, choiceName, fitRange, isChoice, QUALITIES, qualityOf, rangeName, STEPS };
