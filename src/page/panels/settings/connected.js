import { $ } from '../../core.js';
import { allowLink, backAt, disconnectLink, kickAuto, kickOut, linkIcon, linkOn, linkState, pairAgainLink,
  setKickAuto, setLinkOn, testLink } from '../../platforms/pear-drops.js';
import { watchSignedIn } from '../../platforms/platforms.js';
import { effectiveSignedIn } from '../../platforms/players-link.js';
import { element } from '../../shared/element.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';

/* ---- Settings › Connected apps: Pear Drops' card. Its switches, how the link is (a chip), and one status line
   with its button. The link itself is in platforms/pear-drops.js (the page) and src/main/link.js. ---- */
const TEST_SHOW_MS = 15000;     // how long a Test's answer shows in place of the status line
let card, testAnswer = null, testTimer = null, testing = false;

// "18 Oct" (the same everywhere, whatever the computer's language)
const pairedDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// The chip: { text, tone } for the link's status.
function chipFor(peer){
  if (!peer || !peer.status) return { text: 'Off', tone: 'off' };
  if (peer.status === 'connected') return { text: 'Connected' + (peer.version ? ' · ' + peer.version : ''), tone: 'ok' };
  if (peer.status === 'confirm') return { text: 'Asks to pair', tone: 'wait' };          // (it's running, whatever "installed" says)
  if (peer.installed === false) return { text: 'Not installed', tone: 'off' };
  if (peer.status === 'waiting') return { text: 'Waiting', tone: 'wait' };
  if (peer.status === 'pair-again') return { text: 'Pair again', tone: 'wait' };
  if (peer.status === 'incompatible') return { text: "Can't connect", tone: 'bad' };
  return { text: 'Off', tone: 'off' };
}

// The status line: { line: [text or elements], tone, act: 'disconnect' | 'pair' | 'allow' | 'download' | null, paired }.
function lineFor(st, ctx){
  const peer = st && st.peer, farming = st && st.farming;
  if (!peer || !peer.status) return { line: [], tone: 'off', act: null };
  // a first pairing waits for Allow here (another program could claim to be Pear Drops)
  if (peer.status === 'confirm'){
    const who = peer.asking ? [peer.asking.name, peer.asking.version].filter(Boolean).join(' ') : 'Pear Drops';
    return { line: [element('b', null, who), ' asks to pair. Allow it only if you just switched on Connect in Pear Drops.'], tone: 'wait', act: 'allow' };
  }
  if (peer.status !== 'connected' && peer.installed === false) return { line: ['Free for Windows, macOS and Linux.'], tone: 'off', act: 'download' };
  if (peer.status === 'connected'){
    const paired = peer.pairedAt ? 'Paired ' + pairedDay(peer.pairedAt) : '';
    const signed = ctx.signedIn ? 'Kick players are signed in' : 'Kick players are signed out';
    if (peer.report && peer.report.state === 'limited') return { line: [peer.report.text], tone: 'wait', act: 'disconnect', paired };
    if (farming && farming.state === 'farming'){
      const what = (farming.drop && (farming.drop.campaign || farming.drop.category)) || '';
      const where = farming.channel ? (farming.channel.name || farming.channel.slug) : '';
      const tail = ctx.out ? ' · your Kick players are signed out'
        : !ctx.auto ? ' · ' + signed + ' (signing out is off)'
        : ' · on another Kick account, so ' + signed;
      return { line: [element('b', null, what ? 'Farming ' + what : 'Farming'), where ? ' on ' + where : '', tail], tone: 'ok', act: 'disconnect', paired };
    }
    if (ctx.out && ctx.backAt != null) return { line: ['Signing Kick players back in at ' + clock(ctx.backAt)], tone: 'ok', act: 'disconnect', paired };
    return { line: ["Pear Drops isn't farming · " + signed], tone: 'ok', act: 'disconnect', paired };
  }
  if (peer.status === 'waiting'){
    if (peer.reason === 'confirm-there') return { line: ['Press ', element('b', null, 'Allow'), " in Pear Drops' Connected apps to pair."], tone: 'wait', act: null };
    if (peer.reason === 'switched-off') return { line: ['Pear Drops is open, but its own Connect switch is off.'], tone: 'wait', act: null };
    if (peer.reason === 'disconnected-there') return { line: ['Disconnected in Pear Drops. Switch it on there to link again.'], tone: 'wait', act: null };
    return { line: ["Pear Drops isn't open, or its Connect switch is off."], tone: 'wait', act: null };
  }
  if (peer.status === 'pair-again'){
    if (peer.keyHeldBy === 'them') return { line: ['Press ', element('b', null, 'Pair again'), " in Pear Drops' Connected apps."], tone: 'wait', act: null };
    return { line: ["The pairing doesn't match Pear Drops' any more. Pair again to start afresh."], tone: 'wait', act: 'pair' };
  }
  if (peer.status === 'incompatible') return { line: [(peer.report && peer.report.text) || "Can't connect: one of the apps needs updating."], tone: 'bad', act: null };
  return { line: [], tone: 'off', act: null };
}

const ACTS = { disconnect: 'Disconnect', pair: 'Pair again', allow: 'Allow', download: 'Download' };

function renderCard(){
  if (!card) return;
  const st = linkState, peer = st && st.peer;
  const on = linkOn(), auto = kickAuto();
  card.querySelector('#caConnect').checked = on;
  card.querySelector('#caKickAuto').checked = settings.flag('link.kickAuto', true);
  card.querySelector('#caWidget').checked = settings.flag('link.widget', true);
  if (peer && peer.summary) card.querySelector('.ca-sum').textContent = peer.summary;
  const chip = chipFor(on ? peer : (peer && { ...peer, status: 'off' }));
  const ch = card.querySelector('.ca-chip');
  ch.textContent = chip.text; ch.className = 'ca-chip ' + chip.tone;
  const v = lineFor(on ? st : (st && { ...st, peer: peer && { ...peer, status: 'off' } }), {
    auto, out: kickOut, backAt, signedIn: effectiveSignedIn('kick', { auto, out: kickOut, watch: watchSignedIn })
  });
  const foot = card.querySelector('.ca-foot');
  const shown = testAnswer ? { line: [testAnswer.text], tone: testAnswer.ok ? 'ok' : 'wait' } : v;
  card.querySelector('.ca-line').replaceChildren(...shown.line);
  foot.className = 'ca-foot ' + shown.tone + (testAnswer ? ' tested' : '');
  card.querySelector('.ca-paired').textContent = v.paired || '';
  const act = card.querySelector('.ca-act');
  act.hidden = !v.act; act.textContent = ACTS[v.act] || ''; act.dataset.act = v.act || '';
  act.classList.toggle('primary', v.act === 'download' || v.act === 'allow');
  card.querySelector('.ca-activity').hidden = !on;
  const test = card.querySelector('.ca-test');
  test.hidden = !on;
  test.disabled = testing;
  test.querySelector('span').textContent = testing ? 'Testing…' : 'Test';
  foot.hidden = !shown.line.length && act.hidden && test.hidden;
  card.querySelector('.ca-page').hidden = v.act === 'download';
}

async function runTest(){
  if (testing) return;
  testing = true; renderCard();
  const r = await testLink();
  testing = false;
  testAnswer = r;
  clearTimeout(testTimer);
  testTimer = setTimeout(() => { testAnswer = null; renderCard(); }, TEST_SHOW_MS);
  renderCard();
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  card = $('#caPearDrops');
  if (!card) return;
  card.querySelector('.ca-arrow').innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  card.querySelector('.ca-test-ic').innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>';
  const download = () => { const url = linkState && linkState.peer && linkState.peer.download; if (url && window.kmv && window.kmv.openExternal) window.kmv.openExternal(url); };
  card.querySelector('#caConnect').addEventListener('change', e => setLinkOn(e.target.checked));
  card.querySelector('#caKickAuto').addEventListener('change', e => setKickAuto(e.target.checked));
  card.querySelector('#caWidget').addEventListener('change', e => { settings.set('link.widget', e.target.checked); store.changed('link'); });
  card.querySelector('.ca-page').onclick = download;
  card.querySelector('.ca-test').onclick = runTest;
  card.querySelector('.ca-act').onclick = e => {
    const act = e.currentTarget.dataset.act;
    if (act === 'disconnect') disconnectLink();
    else if (act === 'pair') pairAgainLink();
    else if (act === 'allow') allowLink();
    else if (act === 'download') download();
  };
  linkIcon().then(src => { if (src) card.querySelector('.ca-logo').src = src; });
  store.watch('link', renderCard);
  renderCard();
}

export { chipFor, init };
