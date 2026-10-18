import { ROLE, wins } from '../core.js';
import { platOf, setWatchSignedIn, syncStreams, watchSignedIn } from './platforms.js';
import { SIGN_BACK_IN_MS, autoSwitched, needOut, nextKickOut, playersReport } from './players-link.js';
import { fromApp } from '../shared/incoming.js';
import { settings } from '../shared/settings.js';
import { store } from '../shared/store.js';

// Connected apps: the link with Pear Drops (Settings › Connected apps, panels/settings/connected.js). The main
// process keeps the link (src/main/link.js) and sends what Pear Drops is farming; this signs the Kick stream
// players out while it farms (the rule is in players-link.js), and tells it whether they're signed in.
// Chats always stay signed in: only stream players change.
let linkState = null;          // { on, peer, farming, open, wait } from the main process; null until it says
let kickOut = false;           // whether Kick players are signed out for Pear Drops
let backAt = null;             // when they sign back in (Pear Drops stopped farming), or null
let backTimer = null;
let kickHold = null;           // at start-up: Kick stream players wait for what Pear Drops is farming (up to 2 s)
let releaseHold = null;
let lastReport = '';
let iconUrl = null;            // Pear Drops' logo (asked once)
const HOLD_MS = 2000;
// One of the desktop app's calls (window.kmv), or null: the UI tests give the page a stand-in with only some.
const appCall = name => (window.kmv && typeof window.kmv[name] === 'function' ? window.kmv[name] : null);

const linkOn = () => settings.flag('link.peardrops', false);
// "Sign Kick players out while Pear Drops is farming" (on by default), while Connect is on.
const kickAuto = () => linkOn() && settings.flag('link.kickAuto', true);
const kickUser = () => (settings.json('accounts', {}) || {}).kick || settings.text('account');
const linkFarming = () => (linkState && linkState.farming) || null;
const linkConnected = () => !!(linkState && linkState.peer && linkState.peer.status === 'connected');
const kickStreams = () => wins.filter(w => w.kind === 'stream' && w.channel && platOf(w.channel) === 'kick');

// Apply the rule: out at once when Pear Drops starts farming, back in once it hasn't farmed for 5 minutes.
function applyLink(){
  if (!kickAuto()){ kickOut = false; backAt = null; }
  else {
    const wait = (linkState && linkState.wait) || SIGN_BACK_IN_MS;
    const r = nextKickOut({ out: kickOut, backAt }, needOut({ auto: true, farming: linkFarming(), mine: kickUser() }), Date.now(), wait);
    kickOut = r.out; backAt = r.backAt;
  }
  clearTimeout(backTimer); backTimer = null;
  if (backAt != null) backTimer = setTimeout(applyLink, Math.max(0, backAt - Date.now()));
  syncStreams('kick');
  reportPlayers();
  store.changed('link');
}

// What this window's Kick players are, for Pear Drops (players.changed). The main process merges both windows'.
function reportPlayers(){
  if (!appCall('playersReport')) return;
  const r = playersReport({ auto: kickAuto(), out: kickOut, watch: watchSignedIn, mine: kickUser(), open: kickStreams().map(w => w.channel) });
  const text = JSON.stringify(r);
  if (text === lastReport) return;
  lastReport = text;
  window.kmv.playersReport(r);
}

function gotLinkState(st){
  if (!st) return;
  linkState = st;
  if (releaseHold && (st.farming || !st.on)) releaseHold();
  applyLink();
}

// Change the Connect or Auto switch (change() sets it). Auto taking over keeps your own Kick choice
// (link.kickBefore), and giving it back restores it.
function switchLink(change){
  const was = kickAuto();
  change();
  const r = autoSwitched(was, kickAuto(), watchSignedIn.kick, settings.json('link.kickBefore', null));
  settings.set('link.kickBefore', r.before === null ? null : JSON.stringify(r.before));   // (json: true / false)
  setWatchSignedIn('kick', r.watchKick);
  applyLink();
}
async function setLinkOn(on){
  switchLink(() => settings.set('link.peardrops', !!on));
  if (appCall('linkSet')) gotLinkState(await window.kmv.linkSet(!!on).catch(() => null));
}
const setKickAuto = on => switchLink(() => settings.set('link.kickAuto', !!on));
async function disconnectLink(){
  const st = appCall('linkDisconnect') ? await window.kmv.linkDisconnect().catch(() => null) : null;
  switchLink(() => settings.set('link.peardrops', false));
  gotLinkState(st);
}
async function pairAgainLink(){
  if (appCall('linkPairAgain')) gotLinkState(await window.kmv.linkPairAgain().catch(() => null));
}
const linkIcon = () => (iconUrl ??= appCall('linkIcon') ? window.kmv.linkIcon().catch(() => '') : Promise.resolve(''));
const showPearDrops = () => (appCall('linkShowPearDrops') ? window.kmv.linkShowPearDrops().catch(() => null) : Promise.resolve(null));
const testLink = () => (appCall('linkTest') ? window.kmv.linkTest().catch(() => null) : Promise.resolve(null))
  .then(r => (r && r.text ? r : { ok: false, reason: 'unknown', text: "Couldn't test the link" }));

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  window.pearLink = {   // for the tests
    get state(){ return linkState; }, get kickOut(){ return kickOut; }, get backAt(){ return backAt; }, get held(){ return !!kickHold; },
    gotLinkState, applyLink
  };
  if (!appCall('linkSet') || !appCall('linkState')) return;
  // The main window sends the Connect switch (the main process can't read the page's settings); the streams
  // window asks how things are.
  const first = (ROLE === 'main' ? window.kmv.linkSet(linkOn()) : window.kmv.linkState()).catch(() => null);
  if (kickAuto()){
    // Pear Drops is open: Kick players wait for whether it's farming, rather than loading signed in and again.
    kickHold = first.then(st => {
      if (!st || !st.open || st.farming) return;
      return new Promise(res => { releaseHold = res; setTimeout(res, HOLD_MS); });
    }).finally(() => { kickHold = null; releaseHold = null; });
  }
  first.then(gotLinkState);
  fromApp('onLinkState', gotLinkState);
  settings.onChange(['link.peardrops', 'link.kickAuto', 'link.widget', 'accounts', 'account'], () => applyLink());   // changed in the other window
}

export { applyLink, backAt, disconnectLink, init, kickAuto, kickHold, kickOut, linkConnected, linkIcon, linkOn,
  linkState, pairAgainLink, reportPlayers, setKickAuto, setLinkOn, showPearDrops, testLink };
