import './layout-menu.js';   // runs after it (see app.js)
import { SmvNotes } from '../panels/bell/notifications.js';
import { esc } from '../shared/element.js';
import { fromApp } from '../shared/incoming.js';
import { closeOnOutside } from '../shared/popover.js';
import { settings } from '../shared/settings.js';
import { reloadView } from '../windows/view.js';
import { $, ROLE, coreVars, msg, popped, wins } from '../core.js';
import { icon } from '../shared/icons.js';
import { DESKTOP } from '../shared/env.js';
import { PLAT_NAME, checkMod, modOk, platOf, rememberNames, setWatchSignedIn, watchSignedIn } from '../platforms/platforms.js';
import { channelVars, persistSaved, saved } from '../panels/channels/channels.js';
import { dropNotes, myName, myTwitch, setMyName } from '../panels/bell/bell.js';
import { setMyTwitch } from '../panels/bell/all-notifications.js';
import { flash } from '../shared/flash.js';
import { spotlight } from '../layout/spotlight.js';
import { popOutStreams, popoutVars, receiveChat, receiveStreams, streamsCameBack, updatePopBtn } from '../windows/popout.js';
import { ZOOMS, applyChatZoom, zoomIdx, zoomVars } from '../chat/chat-zoom.js';
import { esRefresh } from '../panels/empty-stage/empty-stage.js';
import { placeMenu, showSpMenu } from './toolbar.js';
import { showHelp } from '../panels/help/help.js';
import { openSettings } from '../panels/settings/settings.js';
import { unfollowKick } from '../panels/profiles/profiles.js';
import { ask } from '../shared/ask.js';

if (DESKTOP){
  const lb = $('#loginBtn');
  lb.hidden = false;
  // Accounts menu (log in and out) and Settings > Accounts (that, and everything else about logins)
  const am = $('#accountMenu'), sa = $('#settingsDlg .st-pane[data-s=accounts]'), sy = $('#settingsDlg .st-pane[data-s=youtube]');
  let acct = { kick: '', twitch: '', youtube: false };
  acct = Object.assign(acct, settings.json('accounts', {})); acct.kick = acct.kick || settings.text('account');
  const showAccounts = () => {
    settings.set('accounts', acct);
    const n = [acct.kick, acct.twitch, acct.youtube].filter(Boolean).length;
    lb.classList.toggle('has-acct', !!n);
    lb.title = n ? 'Logged in: ' + [acct.kick && `Kick (${acct.kick})`, acct.twitch && `Twitch (${acct.twitch})`, acct.youtube && 'YouTube'].filter(Boolean).join(', ') : 'Log in to Kick, Twitch or YouTube';
    document.querySelectorAll('#accountMenu .am-row, #settingsDlg .am-row').forEach(row => {
      const p = row.dataset.p, v = acct[p];
      row.querySelector('.am-st').textContent = v ? (p === 'youtube' ? 'Logged in' : `Logged in as ${v}`) : 'Not logged in';
      row.querySelector('.am-in').hidden = !!v;
      row.querySelector('.am-sw').hidden = row.querySelector('.am-out').hidden = !v;
      row.classList.toggle('on', !!v);
    });
    if (window.kmv.accountsState) window.kmv.accountsState({ ...acct });    // the menu bar's Account menu follows
    if (!wins.length) esRefresh();                                         // the welcome screen's logins
  };
  const refreshAccount = async () => {
    const k = window.kmv.detectMe ? await window.kmv.detectMe().catch(() => null) : null;
    const st = window.kmv.accountsStatus ? await window.kmv.accountsStatus().catch(() => null) : null;
    acct.kick = k || ''; if (st){ acct.twitch = st.twitch || ''; acct.youtube = !!st.youtube; }
    showAccounts();
    return acct;
  };
  showAccounts();
  lb.onclick = () => {
    am.hidden = !am.hidden;
    if (!am.hidden){ placeMenu(am, lb); refreshAccount(); }
  };
  closeOnOutside(am, { button: lb });
  const doLogout = async p => {
    await window.kmv.logout(p);
    acct[p] = p === 'youtube' ? false : ''; showAccounts();
    if (ROLE === 'main' && typeof setMyName === 'function'){
      if (p === 'kick') setMyName('');
      if (p === 'twitch') setMyTwitch('');
      if (p !== 'youtube') dropNotes(n => SmvNotes.tabOf(n) === 'mentions' && platOf(n.channel) === p);
    }
    flash(`Logged out of ${PLAT_NAME[p]}`, { subject: 'accounts', detail: 'Log in again to keep chat and follows working.', act: { t: 'login', p } });
  };
  coreVars.refreshAccountsPane = () => { refreshAccount(); refreshSecurity(); };
  const onAccountClick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('am-more')){ am.hidden = true; openSettings('accounts'); return; }
    if (b.closest('.am-yk') || !b.closest('.am-row, .am-alt')) return;   // the YouTube key has its own buttons
    if (b.classList.contains('am-ff')){ openFfDlg(); return; }
    const p = b.closest('.am-row').dataset.p, name = PLAT_NAME[p];
    am.hidden = true;
    if (b.classList.contains('am-imp')){ importFollows(p); return; }
    if (b.classList.contains('am-in')) window.kmv.openLogin(p);
    else if (b.classList.contains('am-out')){ if (await ask(`Log out of ${name}?`, `${name} chats in this app will show as logged out until someone logs in again.`, { ok: 'Log out', danger: true })) await doLogout(p); }
    else if (b.classList.contains('am-sw')){ if (await ask(`Switch ${name} account?`, `This logs out, then opens the ${name} login so someone else can sign in.`, { ok: 'Switch' })){ await doLogout(p); window.kmv.openLogin(p); } }
  };
  am.addEventListener('click', onAccountClick);
  sa.addEventListener('click', onAccountClick);
  sy.addEventListener('click', onAccountClick);
  fromApp('onMenuAccount', async ({ platform: p, action }) => {      // the menu bar's Account menu
    if (!PLAT_NAME[p]) return;
    if (action === 'login') window.kmv.openLogin(p);
    else if (action === 'logout' && await ask(`Log out of ${PLAT_NAME[p]}?`, `${PLAT_NAME[p]} chats in this app will show as logged out until someone logs in again.`, { ok: 'Log out', danger: true })) await doLogout(p);
  });
  fromApp('onAccountChanged', async info => {
    const p = info.platform || 'kick';
    wins.forEach(w => { if ((w.kind === 'chat' || (w.kind === 'stream' && watchSignedIn[p])) && w.ready && platOf(w.channel) === p) reloadView(w.view); });   // that platform's chats (and signed-in streams) pick up the new login
    modOk.clear(); wins.forEach(w => { if (platOf(w.channel) === p) checkMod(w); });
    if (info.loggedOut){ acct[p] = p === 'youtube' ? false : ''; showAccounts(); return; }
    await refreshAccount();
    if (ROLE === 'main' && typeof setMyName === 'function'){
      if (p === 'kick' && acct.kick && !myName) setMyName(acct.kick);
      if (p === 'twitch' && acct.twitch && !myTwitch) setMyTwitch(acct.twitch);
    }
  });
  if (ROLE === 'main') setTimeout(refreshAccount, 5000);

  /* ---- YouTube API key: optional, for live checks. The page only hears whether one is set, never the key. ---- */
  const yk = sy.querySelector('.am-yk'), ykSt = yk.querySelector('.am-yk-st'), ykIn = yk.querySelector('.am-yk-in');
  const hhmm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const YK_ERR = {
    format: 'That doesn\'t look like an API key. Copy the whole key from Google Cloud.',
    network: 'Couldn\'t reach Google to test the key. Check your connection and try again.',
    badkey: 'Google didn\'t accept that key. Check it\'s enabled for "YouTube Data API v3".'
  };
  function showYtKey(st, err){
    if (!st) return;
    yk.querySelector('.am-yk-row:not(.am-yk-set)').hidden = !!st.set;
    yk.querySelector('.am-yk-set').hidden = !st.set;
    let msg = 'Makes live checks for saved YouTube channels faster and more reliable.', warn = false;
    if (err){ msg = YK_ERR[err] || YK_ERR.network; warn = true; }
    else if (st.set){
      if (st.state === 'quota'){ msg = `Over today's quota: checking YouTube pages instead until ${hhmm(st.until)}.`; warn = true; }
      else if (st.state === 'rate'){ msg = `Too many requests: checking YouTube pages instead until ${hhmm(st.until)}.`; warn = true; }
      else if (st.state === 'badkey'){ msg = 'Key not accepted any more: checking YouTube pages instead. Check it\'s enabled for "YouTube Data API v3", or remove it and add a new one.'; warn = true; }
      else msg = 'Key added: YouTube live checks use it.' + (st.saved ? '' : ' It\'s kept until you close the app, because this computer can\'t store it securely.');
    }
    ykSt.textContent = msg; ykSt.classList.toggle('warn', warn);
  }
  if (window.kmv.ytKeyStatus){
    yk.hidden = false; sy.querySelector('.am-yk-sec').hidden = false;
    window.kmv.ytKeyStatus().then(st => showYtKey(st)).catch(() => {});
    fromApp('onYtKeyStatus', st => showYtKey(st));
    const add = async () => {
      const key = ykIn.value.trim(); if (!key) { ykIn.focus(); return; }
      const btn = yk.querySelector('.am-yk-add'); btn.disabled = true; ykSt.textContent = 'Testing the key with Google…'; ykSt.classList.remove('warn');
      let st = null; try { st = await window.kmv.ytKeySet(key); } catch {}
      btn.disabled = false;
      if (st && !st.error) ykIn.value = '';
      showYtKey(st || { set: false }, st ? st.error : 'network');
    };
    yk.querySelector('.am-yk-add').onclick = add;
    ykIn.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); add(); } e.stopPropagation(); });
    yk.querySelector('.am-yk-rm').onclick = async () => {
      if (!await ask('Remove the YouTube API key?', 'YouTube live checks go back to reading each channel\'s page.', { ok: 'Remove', danger: true })) return;
      showYtKey(await window.kmv.ytKeyRemove().catch(() => null));
    };
    yk.querySelector('.am-yk-how').onclick = async () => {
      await showHelp('guide');
      const h = [...document.querySelectorAll('#settingsDlg [data-doc=guide] h3')].find(x => /YouTube API key/i.test(x.textContent));
      if (h) h.scrollIntoView({ block: 'start' });
    };
  }

  /* ---- How logins are kept: encryption status + "forget my login when I close the app" ---- */
  async function refreshSecurity(){
    if (!window.kmv.securityGet) { sa.querySelector('.am-sec').hidden = true; return; }
    let st = null;
    try { st = await window.kmv.securityGet(); } catch {}
    if (!st) return;
    const enc = sa.querySelector('.am-enc'), on = st.encryption === 'on';
    enc.classList.toggle('on', on); enc.classList.toggle('off', !on);
    enc.querySelector('.am-lock').innerHTML = on ? icon.lock : icon.unlock;
    enc.querySelector('.am-enc-txt').textContent = on ? 'Saved logins are encrypted on this computer and locked to your user account.'
      : 'Saved logins are not encrypted yet. Restart the app with its launcher or shortcut to turn encryption on.';
    sa.querySelectorAll('.am-forget input').forEach(i => { i.checked = !!st.forget[i.dataset.f]; });
  }
  sa.querySelectorAll('.am-forget input').forEach(i => i.addEventListener('change', async () => {
    const p = i.dataset.f;
    try { await window.kmv.securitySetForget(p, i.checked); } catch {}
    flash(i.checked ? `${PLAT_NAME[p]} login will be wiped every time you close the app (you'll log in again next time)` : `${PLAT_NAME[p]} login will be remembered again`);
  }));

  /* ---- Watch signed in: a site's stream players use your login too ---- */
  sa.querySelectorAll('.am-watch input').forEach(i => {
    i.checked = !!watchSignedIn[i.dataset.w];
    i.addEventListener('change', () => {
      const p = i.dataset.w;
      setWatchSignedIn(p, i.checked);
      flash(!i.checked ? `${PLAT_NAME[p]} streams play logged out again`
        : acct[p] ? `${PLAT_NAME[p]} streams now play signed in to your account`
        : `${PLAT_NAME[p]} streams will play signed in once you log in to ${PLAT_NAME[p]}`);
    });
  });
  settings.onChange('watchSignedIn', () => {
    sa.querySelectorAll('.am-watch input').forEach(i => { i.checked = !!watchSignedIn[i.dataset.w]; });
  });

  /* ---- Import follows: read the channels you follow (with your login) and pick which to save ---- */
  const dlg = $('#importDlg');
  let impItems = [], impPlat = '', impBusy = false;
  const PCOL = { kick: '#53fc18', twitch: '#a970ff', youtube: '#ff3d3d' };
  const closeImport = () => { dlg.hidden = true; };
  dlg.querySelector('.dlg-cancel').onclick = closeImport;
  dlg.addEventListener('pointerdown', e => { if (e.target === dlg && !impBusy) closeImport(); });
  const impSetup = (p, sub) => {
    impPlat = p;
    dlg.querySelector('.pdot').style.background = PCOL[p];
    dlg.querySelector('.dlg-title').textContent = `Import ${PLAT_NAME[p]} follows`;
    dlg.querySelector('.dlg-sub').innerHTML = sub;
    dlg.querySelector('.dlg-tools').hidden = true;
    dlg.querySelector('.dlg-ok').hidden = true;
    dlg.querySelector('.dlg-note').textContent = '';
    dlg.querySelector('.dlg-list').innerHTML = '';
    dlg.hidden = false;
  };
  const impCount = () => {
    const n = dlg.querySelectorAll('.dlg-list input:checked:not(:disabled)').length;
    const ok = dlg.querySelector('.dlg-ok');
    ok.disabled = !n; ok.textContent = n ? `Add ${n} to Saved` : 'Add to Saved';
  };
  const impRender = () => {
    const q = dlg.querySelector('.dlg-q').value.trim().toLowerCase();
    const list = dlg.querySelector('.dlg-list');
    const keep = new Map([...list.querySelectorAll('input')].map(i => [i.value, i.checked]));
    list.innerHTML = '';
    const shown = impItems.filter(x => !q || x.name.toLowerCase().includes(q) || x.ch.includes(q));
    if (!shown.length){ list.innerHTML = '<div class="empty">Nothing matches.</div>'; impCount(); return; }
    shown.forEach(x => {
      const have = saved.includes(x.ch);
      const l = document.createElement('label'); if (have) l.className = 'have';
      l.innerHTML = '<input type="checkbox"><span class="nm"></span><span class="id"></span>';
      const cb = l.querySelector('input'); cb.value = x.ch;
      cb.checked = have || (keep.has(x.ch) ? keep.get(x.ch) : x.pick !== false); cb.disabled = have;
      cb.onchange = () => { x.pick = cb.checked; impCount(); };
      l.querySelector('.nm').textContent = x.name;
      l.querySelector('.id').textContent = have ? 'already saved' : x.ch.replace(/^(tw:|yt:c:|yt:)/, '');
      if (impPlat === 'kick' && window.kmv.kickUnfollow){
        const u = document.createElement('button'); u.type = 'button'; u.className = 'unf'; u.textContent = 'Unfollow';
        u.title = `Unfollow ${x.name} on kick.com`;
        u.onclick = async e => {
          e.preventDefault(); e.stopPropagation();
          u.disabled = true;
          const r = await unfollowKick(x.ch, x.name);
          u.disabled = false;
          if (r && r.ok){ impItems = impItems.filter(y => y.ch !== x.ch); impRender(); }
        };
        l.appendChild(u);
      }
      list.appendChild(l);
    });
    impCount();
  };
  dlg.querySelector('.dlg-q').addEventListener('input', impRender);
  dlg.querySelector('.dlg-all').onclick = () => { dlg.querySelectorAll('.dlg-list input:not(:disabled)').forEach(i => { i.checked = true; const x = impItems.find(y => y.ch === i.value); if (x) x.pick = true; }); impCount(); };
  dlg.querySelector('.dlg-none').onclick = () => { dlg.querySelectorAll('.dlg-list input:not(:disabled)').forEach(i => { i.checked = false; const x = impItems.find(y => y.ch === i.value); if (x) x.pick = false; }); impCount(); };
  dlg.querySelector('.dlg-ok').onclick = () => {
    const add = impItems.filter(x => x.pick !== false && !saved.includes(x.ch)).map(x => x.ch)
      .filter(ch => [...dlg.querySelectorAll('.dlg-list input')].every(i => i.value !== ch || i.checked));
    if (!add.length) return;
    channelVars.saved = [...saved, ...add];
    persistSaved();
    closeImport();
    flash(`Added ${add.length} ${PLAT_NAME[impPlat]} channel${add.length === 1 ? '' : 's'} to Saved`, { subject: 'accounts' });
  };
  const PEAR = 'M32 14.2C25.6 14.2 23.4 19.4 23.4 24.6 23.4 29.6 20.4 31.6 17.2 35.6 13.2 40.6 12 46.8 14.2 52 17.2 58.8 24.4 62 32 62 39.6 62 46.8 58.8 49.8 52 52 46.8 50.8 40.6 46.8 35.6 43.6 31.6 40.6 29.6 40.6 24.6 40.6 19.4 38.4 14.2 32 14.2Z';
  const impLoading = text => '<div class="empty loading"><svg class="pear-load" viewBox="0 0 64 64" aria-hidden="true">'
    + `<defs><clipPath id="pearLoadClip"><path d="${PEAR}"/></clipPath></defs><path class="body" d="${PEAR}"/>`
    + '<g clip-path="url(#pearLoadClip)"><path class="juice" d="M0 8Q8 3 16 8T32 8T48 8T64 8T80 8T96 8V90H0Z"/></g>'
    + '<path class="leaf" d="M36.2 9.6C40 4.2 47.5 3.2 52.5 5.4 49.6 10.8 42.4 12.8 36.2 9.6Z"/><path class="stem" d="M33.2 15.5C33 11.5 34.2 8 36.6 4.8"/>'
    + `</svg><span class="prog">${esc(text)}</span></div>`;
  fromApp('onFollowsProgress', p => {
    if (p.platform !== impPlat || !impBusy || dlg.hidden) return;
    // only the text changes, so the pear keeps filling smoothly
    const l = dlg.querySelector('.dlg-list');
    const t = l.querySelector('.empty .prog');
    if (t) t.textContent = p.text || 'Working…';
    else l.innerHTML = impLoading(p.text || 'Working…');
  });
  window.importFollows = importFollows;
  async function importFollows(p){
    if (!window.kmv.importFollows || impBusy) return;
    impSetup(p, `Reading the channels you follow on ${PLAT_NAME[p]} with your login in this app. Big lists can take a minute.`);
    dlg.querySelector('.dlg-list').innerHTML = impLoading('Reading the channels you follow…');
    impBusy = true;
    let r = null;
    try { r = await window.kmv.importFollows(p); } catch {}
    impBusy = false;
    if (dlg.hidden || impPlat !== p) return;
    const list = dlg.querySelector('.dlg-list');
    if (!r || r.error){
      const sub = dlg.querySelector('.dlg-sub');
      if (r && r.error === 'login'){
        sub.textContent = `You need to be logged in to ${PLAT_NAME[p]} in this app first.` + (p === 'youtube' ? ' YouTube sign-in currently only works through Firefox.' : '');
        list.innerHTML = `<div class="empty"><button class="btn imp-login">${p === 'youtube' ? 'Sign in to YouTube with Firefox' : 'Log in to ' + PLAT_NAME[p]}</button></div>`;
        list.querySelector('.imp-login').onclick = () => {
          closeImport();
          if (p === 'youtube'){ openFfDlg(); return; }
          window.kmv.openLogin(p); flash(`Log in, close the login window, then click Import follows again.`);
        };
      } else {
        sub.textContent = r && r.error === 'busy' ? 'Another import is still running. Try again in a moment.'
          : `Couldn't read your ${PLAT_NAME[p]} follows right now. ${PLAT_NAME[p]} may have changed its site, or it's asking for a security check. Try again in a minute, or add channels by name.`;
        list.innerHTML = '';
      }
      return;
    }
    impItems = (r.items || []).map(x => ({ ch: x.ch, name: x.name || x.ch, pick: true }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    rememberNames(Object.fromEntries(impItems.map(x => [x.ch, x.name])));
    const fresh = impItems.filter(x => !saved.includes(x.ch)).length;
    dlg.querySelector('.dlg-sub').textContent = !impItems.length ? `No followed ${PLAT_NAME[p]} channels found.`
      : `Found ${impItems.length} channel${impItems.length === 1 ? '' : 's'} you follow` + (fresh < impItems.length ? ` (${impItems.length - fresh} already saved)` : '') + '. Untick any you don\'t want.';
    if (!impItems.length){ list.innerHTML = ''; return; }
    dlg.querySelector('.dlg-tools').hidden = impItems.length < 8;
    dlg.querySelector('.dlg-q').value = '';
    dlg.querySelector('.dlg-ok').hidden = false;
    dlg.querySelector('.dlg-note').textContent = fresh > 40 ? 'Tip: every saved channel is checked for live, so very long lists are checked more slowly.' : '';
    list.innerHTML = '';
    impRender();
  }
  // Saved panel: ⋯ ▸ Import from Kick / Twitch / YouTube
  if (ROLE === 'main'){
    $('#importRow').hidden = false;
    $('#importRow').addEventListener('click', e => { const b = e.target.closest('button[data-imp]'); if (b){ showSpMenu(false); importFollows(b.dataset.imp); } });
  }

  /* ---- YouTube sign-in: copy the login from Firefox (Google blocks signing in inside the app) ---- */
  const ffDlg = $('#ffDlg');
  function openFfDlg(){ ffDlg.querySelector('.ff-note').textContent = ''; ffDlg.hidden = false; }
  fromApp('onYoutubeSignin', openFfDlg);
  ffDlg.querySelector('.dlg-cancel').onclick = () => { ffDlg.hidden = true; };
  ffDlg.addEventListener('pointerdown', e => { if (e.target === ffDlg) ffDlg.hidden = true; });
  ffDlg.querySelector('.ff-copy').onclick = async () => {
    if (!window.kmv.youtubeFromFirefox) return;
    const note = ffDlg.querySelector('.ff-note'), btn = ffDlg.querySelector('.ff-copy');
    note.innerHTML = '<span class="spin"></span> Looking for your Firefox login…';
    btn.disabled = true;
    let r = null;
    try { r = await window.kmv.youtubeFromFirefox(); } catch {}
    btn.disabled = false;
    if (!r || r.error){
      note.textContent = !r || r.error === 'read' ? 'Couldn\'t read Firefox\'s login. Close Firefox and try again.'
        : r.error === 'nofirefox' ? 'Couldn\'t find Firefox on this computer. Install it from firefox.com and sign in to YouTube there first.'
        : 'Firefox isn\'t signed in to YouTube. Open youtube.com in Firefox, sign in, then click the button again.';
      return;
    }
    const st = await refreshAccount();
    if (r.signedIn || st.youtube){ ffDlg.hidden = true; flash('Signed in to YouTube with your Firefox login', { subject: 'accounts' }); }
    else note.textContent = 'Copied the login, but YouTube still looks signed out. Sign out and back in to YouTube in Firefox, then try again.';
  };

  // Chat text size: in the Layout menu and in Settings > Layouts, both the same setting
  document.querySelectorAll('#chatZoom, #lyZoom').forEach(zc => zc.addEventListener('click', e => {
    const b = e.target.closest('button[data-z]'); if (!b) return;
    zoomVars.zoomIdx = Math.min(ZOOMS.length - 1, Math.max(0, zoomIdx + +b.dataset.z));
    applyChatZoom();
  }));
  applyChatZoom();
  fromApp('onReloadAll', () => wins.forEach(w => { if (w.ready) reloadView(w.view); }));

  if (ROLE === 'main'){
    const pb = $('#popBtn');
    pb.hidden = false;
    pb.onclick = () => popped ? window.kmv.closeStreams() : popOutStreams();
    fromApp('onStreamsState', open => {
      coreVars.popped = open; updatePopBtn();
      if (!open){ popoutVars.popPartial = false; settings.remove('popPartial'); }
      settings.set('popped', open ? '1' : null);
    });
    fromApp('onStreamsReturned', streamsCameBack);
    fromApp('onChatAdd', receiveChat);
  } else {
    // Streams window: a trimmed toolbar for watching.
    document.title = 'Stream Multiview – Streams';
    document.body.classList.add('role-streams');
    document.querySelector('.brand').lastChild.textContent = 'Streams';
    ['#savedBtn', '#loginBtn', '#chatFocus', '#auto', '#popBtn', '#clear']
      .forEach(s => { $(s).hidden = true; });
    $('#spotBtn').hidden = false;
    $('#spotBtn').onclick = spotlight;
    const bb = $('#backBtn');
    bb.hidden = false;
    bb.onclick = () => window.kmv.closeStreams();
    $('#empty .es-streams').hidden = false;
    $('#empty .es-streams').innerHTML = '<h2>Streams window</h2>Use <b>Pop out streams</b> in the main window, or add a channel there, and its stream appears here.<ul><li>Drag this window to another monitor and maximize it, or press F11 for full screen.</li><li><b>Tile</b> gives every stream equal space. <b>Spotlight</b> makes the stream you last clicked big.</li><li>Drag a stream by its title bar onto another to swap them.</li><li>Closing this window puts the streams back in the main window.</li></ul>';
    fromApp('onStreamsAdd', receiveStreams);
  }
}
