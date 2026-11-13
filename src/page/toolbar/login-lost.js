import { ROLE, wins } from '../core.js';
import { dropNotes } from '../panels/bell/bell.js';
import { PLAT_NAME, platOf } from '../platforms/platforms.js';
import { commands } from '../shared/commands.js';
import { element } from '../shared/element.js';
import { DESKTOP } from '../shared/env.js';
import { flash } from '../shared/flash.js';
import { icon } from '../shared/icons.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';
import { winTimer } from '../shared/timers.js';
import { inSiteCall, inSiteOf } from '../sites/in-site.js';
import { PLATFORMS } from '../sites/sites.js';
import { askIn } from '../windows/view.js';
import { reloadWin } from '../windows/views.js';

/* ---- A login a site has taken back: the app still has its cookies, so it would say you're logged in, but the site
   has signed the app out (Google does it to YouTube's now and then; any site can on a password change, or after a
   long time away). Its chats then show you signed out, and sending, follows and mod tools there stop working.
   The app notices in three ways, only for a site it has a login for:
   - it asks the site whether the login still works (the main process's accounts:check, with the login: each site's
     loginWorks in src/main/sites/<id>/site.js): soon after start, when you open Logins (at most every 10 minutes), and
     when a chat of a site whose page can't say (its inSite.signedOut) loads;
   - a chat page that can say (YouTube's "Sign in to chat") says you're signed out: then it asks the site, and a site
     that says the login works gets the chat loaded once more (a login just refreshed: Google changes its cookies
     now and then); still signed out after that, it's lost;
   - ALL can't find a chat box to send in (chat/all-chat.js), or Import follows is told to log in (accounts-menu.js).
   A lost login says so once (a notice under the bell, with Sign in again: one per site, gone once it works again), in the Logins menu and Settings › Accounts
   (accounts-menu.js), with a dot on the Logins button, and in a bar at the top of that site's chat windows (✕ hides
   them until it changes). Logging in again, or the site saying the login works, clears it. */

const ASK_EVERY = 10 * 60e3;     // how often the site is asked again, unless something says the login stopped working
const CHAT_WAIT = 4000;          // after a chat loads: its page has drawn its chat box (or its sign-in) by then
const lost = new Set();          // sites that have signed the app out
const told = new Set();          // ... and that said so under the bell (once each, until you log in again)
const hidden = new Set();        // ... whose bars ✕ hid
const askedAt = new Map();       // site -> when it was last asked
let asking = null;               // the question to the sites now (one at a time)

// Whether the app has a login for the site (Logins says "Logged in"): what accounts-menu.js last saved
const loggedInHere = p => { const a = settings.json('accounts', {}); return !!(a && typeof a === 'object' && a[p]); };
const loginLost = p => lost.has(p);
const lostSites = () => [...lost];

// Its notice under the bell (one per site: a new one takes the last one's place, and it goes once the login works)
const isLostNote = p => n => n.kind === 'app' && n.act && n.act.t === 'login' && n.act.again && n.act.p === p;
function markLost(p){
  if (!PLATFORMS[p] || !loggedInHere(p) || lost.has(p)) return;
  lost.add(p); hidden.delete(p);
  store.changed('logins');
  if (!told.has(p)){
    told.add(p);
    dropNotes(isLostNote(p));
    flash(`${PLAT_NAME[p]} has signed this app out`, { subject: 'accounts',
      detail: `Its chats show you signed out, so chatting, follows and mod tools there don't work. Sign in again to fix it.`, act: { t: 'login', p, again: true } });
  }
}
// The login works (the site said so, or you logged in again, or out): nothing to fix
function markBack(p, { relogged = false } = {}){
  if (relogged) told.delete(p);
  dropNotes(isLostNote(p));   // (also one from before the app started again)
  if (!lost.delete(p)) return;
  hidden.delete(p);
  store.changed('logins');
}

// Ask the sites (one, or all the app has a login for) whether their logins still work; force: now, however recently
// it was asked. -> { [site]: true | false | null }
async function checkLogins(p, { force = false } = {}){
  if (!DESKTOP || !window.kmv.accountsCheck) return {};
  const due = s => loggedInHere(s) && (force || Date.now() - (askedAt.get(s) || 0) >= ASK_EVERY);
  const ids = (p ? [p] : Object.keys(PLATFORMS)).filter(due);
  if (!ids.length) return {};
  if (asking) await asking.catch(() => {});
  ids.forEach(s => askedAt.set(s, Date.now()));
  asking = window.kmv.accountsCheck(p && ids.length === 1 ? p : undefined).catch(() => ({}));
  const r = (await asking) || {};
  asking = null;
  for (const s of ids){
    if (r[s] === false) markLost(s);
    else if (r[s] === true) markBack(s);
  }
  return r;
}

// A chat that loaded (windows/views.js): does it show you signed out? Its page says if its site can (inSite.signedOut:
// true signed out, false signed in, null can't tell); for the others, the site's asked (at most every 10 minutes).
function chatLoginCheck(w){
  if (!DESKTOP || ROLE !== 'main' || w.kind !== 'chat' || !w.channel) return;
  const p = platOf(w.channel);
  if (!loggedInHere(p)) return;
  const part = inSiteOf(p).signedOut;
  if (!part){ checkLogins(p); return; }
  const view = w.view;
  winTimer(w, 'loginCheck', async () => {
    if (w.view !== view || !wins.includes(w)) return;
    const out = await askIn(view, inSiteCall(part)).catch(() => null);
    if (w.view !== view) return;
    if (out === false){ w.loginReloaded = false; markBack(p); return; }
    if (out !== true || lost.has(p)) return;
    const works = (await checkLogins(p, { force: true }))[p];
    if (works === false || w.loginReloaded){ markLost(p); return; }
    w.loginReloaded = true;   // the site says it works (or can't say): load the chat once more, with the login as it is now
    reloadWin(w);
  }, CHAT_WAIT);
}
// ALL found no chat box to send in, on a site the app has a login for: ask the site now
function sendFoundNoBox(p){ if (loggedInHere(p) && !lost.has(p)) checkLogins(p, { force: true }); }

const signInAgain = p => { if (DESKTOP && window.kmv.openLogin) window.kmv.openLogin(p); };
// The bar at the top of a chat window of a site that signed the app out
function syncLoginBar(w){
  if (!w.el || w.kind !== 'chat' || !w.channel) return;
  const p = platOf(w.channel), show = lost.has(p) && !hidden.has(p);
  let bar = w.el.querySelector('.login-lost');
  if (!show){ if (bar) bar.remove(); w.el.classList.remove('has-login-lost'); return; }
  if (bar) return;
  const name = PLAT_NAME[p];
  bar = element('div', { class: 'login-lost', role: 'alert', title: `${name} has signed this app out: its chats show you signed out, so chatting, follows and mod tools there don't work until you sign in again` },
    element('i', { class: 'll-ic', html: icon.alert }),
    element('span', 'll-t', `Signed out by ${name}`),
    element('button', { type: 'button', class: 'll-go', dataset: { cmd: 'login.again' }, title: `Log in to ${name} again`, onclick: () => signInAgain(p) }, 'Sign in again'),
    element('button', { type: 'button', class: 'll-x', 'aria-label': 'Hide', title: 'Hide (it comes back if it changes)', html: icon.close, dataset: { cmd: 'login.hide' },
      onclick: () => { hidden.add(p); wins.forEach(syncLoginBar); } }));
  w.el.querySelector('.body').prepend(bar);
  w.el.classList.add('has-login-lost');
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  store.watch(['logins', 'wins'], () => wins.forEach(syncLoginBar));
  // the search box: each lost login's Sign in again
  commands.provide('loginsLost', () => lostSites().map(p => ({ id: `login.again.${p}`, group: 'Accounts', title: `Sign in to ${PLAT_NAME[p]} again`,
    sub: `${PLAT_NAME[p]} has signed this app out`, icon: 'signin', words: ['log in', 'login', 'account', 'signed out'], run: () => signInAgain(p) })));
  commands.add({ id: 'login.hide', group: 'Accounts', title: 'Hide the signed-out bars', sub: 'Until the login changes', icon: 'close',
    when: () => lostSites().some(p => !hidden.has(p)), run: () => { lost.forEach(p => hidden.add(p)); wins.forEach(syncLoginBar); } });
  commands.add({ id: 'login.again', group: 'Accounts', title: 'Sign in again', sub: 'A site that has signed this app out', icon: 'signin', words: ['log in', 'login'],
    when: () => lost.size > 0, run: () => signInAgain(lostSites()[0]) });
  if (DESKTOP && ROLE === 'main') setTimeout(() => checkLogins(), 8000);   // (after Logins has read the logins: accounts-menu.js)
  window.loginLostTest = { markLost, markBack, checkLogins, lostSites, chatLoginCheck, sendFoundNoBox, reset: () => { lost.clear(); told.clear(); hidden.clear(); askedAt.clear(); store.changed('logins'); } };   // for the tests
}

export { chatLoginCheck, checkLogins, init, loginLost, markBack, markLost, sendFoundNoBox };
