// The rule for Kick players while a linked Pear Drops farms (Settings › Connected apps), as plain functions:
// platforms/pear-drops.js applies it. Kick credits drop watch time to one stream per account, so a signed-in
// Kick player here would take Pear Drops' credit. Nothing here touches the page (the unit tests load it).

// How long Kick players stay signed out after Pear Drops stops farming: it often waits a moment between streams,
// and every sign-in or -out starts each player again.
const SIGN_BACK_IN_MS = 300_000;

// Whether Kick players have to be signed out now: Auto is on, Pear Drops is farming (any other state, even
// one this app doesn't know, isn't), and it isn't farming with a different Kick account than yours.
function needOut({ auto, farming, mine }){
  if (!auto || !farming || farming.state !== 'farming') return false;
  const theirs = farming.account && farming.account.user;
  return !(theirs && mine && String(theirs).toLowerCase() !== String(mine).toLowerCase());
}

// The next sign-out state ({ out, backAt }), given whether they need to be out now:
// out at once (remount: true), and back in only once they haven't needed to be for `wait` ms. backAt is when
// that will be (null when not waiting); asked again then, they're back in (remount: true).
function nextKickOut({ out, backAt }, need, now, wait = SIGN_BACK_IN_MS){
  if (need) return { out: true, backAt: null, remount: !out };
  if (!out) return { out: false, backAt: null, remount: false };
  if (backAt == null) return { out: true, backAt: now + wait, remount: false };
  if (now >= backAt) return { out: false, backAt: null, remount: true };
  return { out: true, backAt, remount: false };
}

// Whether a site's players play as your account: your own "Watch signed in" choice, except Kick while Auto is on
// (signed in unless signed out for Pear Drops).
const effectiveSignedIn = (p, { auto, out, watch }) => (p === 'kick' && auto ? !out : !!watch[p]);
const kickMode = ({ auto, watch }) => (auto ? 'auto' : watch.kick ? 'signed-in' : 'signed-out');

// What players.changed says about this window's Kick players. open: the Kick channels of its stream windows.
function playersReport({ auto, out, watch, mine, open }){
  const seen = new Set();
  const list = open.filter(slug => slug && !seen.has(slug) && seen.add(slug)).slice(0, 100).map(slug => ({ platform: 'kick', slug }));
  return { platforms: { kick: {
    signedIn: effectiveSignedIn('kick', { auto, out, watch }),
    mode: kickMode({ auto, watch }),
    account: mine ? { platform: 'kick', user: String(mine).slice(0, 100) } : null,
    open: list
  } } };
}

// Auto taking over your Kick choice, and giving it back: turning it on keeps your choice (before), turning it off
// gives it back. -> { watchKick, before } (before null once given back).
function autoSwitched(wasAuto, isAuto, watchKick, before){
  if (!wasAuto && isAuto) return { watchKick, before: !!watchKick };
  if (wasAuto && !isAuto) return { watchKick: typeof before === 'boolean' ? before : watchKick, before: null };
  return { watchKick, before };
}

export { autoSwitched, effectiveSignedIn, needOut, nextKickOut, playersReport, SIGN_BACK_IN_MS };
