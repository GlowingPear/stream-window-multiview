import { RUN_MAX, SHOUT_TOKENS, SHOUT_TPL, fillShout, shoutLink } from '../../chat/shoutout-text.js';
import { $ } from '../../core.js';
import { bellVars, myName } from '../bell/bell.js';
import { listStreamers, streamerOf } from '../../platforms/linked.js';
import { PLAT_NAME, platOf } from '../../platforms/platforms.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { soon } from '../../shared/timers.js';

/* ---- Settings › Chat › Shoutouts (chat/shoutout.js does them): on, your message with a live preview (with a game and
   without one), the People list (their own message, another channel instead, a linked streamer's row for every site
   with an optional message for one site), and how sending and runs of recent chatters go. Off by default. */
const SAMPLE = [   // the preview's made-up channels: one with a last game, one without
  { site: 'kick', name: 'Pixelfox', login: 'pixelfox', game: 'Tidepool' },
  { site: 'twitch', name: 'Lumen', login: 'lumen', game: '' }];
const TOKEN_HELP = { '{name}': 'their name', '{link}': 'their channel', '{links}': 'every site', '{game}': 'last game' };
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
let textEl, previewEl, peopleEl, rows = [];
let saveText = null, savePeople = null;

const chOf = r => (r.site === 'twitch' ? 'tw:' : '') + String(r.login || '').toLowerCase();
// The preview: your message as a chat line, once with a game and once without
function renderPreview(){
  const me = { kick: myName || 'you', twitch: bellVars.myTwitch || 'you' };
  previewEl.replaceChildren(...SAMPLE.map(x => {
    const text = fillShout(textEl.value, { name: x.name, link: shoutLink(x.site, x.login), links: shoutLink(x.site, x.login), game: x.game });
    const parts = text.split(/(https:\/\/\S+)/).map((t, i) => (i % 2 ? element('span', 'lnk', t) : t));
    return element('span', null, element('i', { class: 'pi pi-' + x.site }, PLAT_NAME[x.site][0]), element('b', null, me[x.site]), ': ', ...parts, ...(x.game ? [] : [' ', element('em', null, 'no game found')]));
  }));
}
// Puts a token in the message where the caret is
function addToken(t){
  const s = textEl.selectionStart ?? textEl.value.length, e = textEl.selectionEnd ?? s;
  textEl.value = textEl.value.slice(0, s) + t + textEl.value.slice(e);
  textEl.focus(); textEl.setSelectionRange(s + t.length, s + t.length);
  textEl.dispatchEvent(new Event('input'));
}
const saveRows = () => { settings.set('shoutPeople', rows.filter(r => r.login || r.streamer)); store.changed('shoutouts'); };
// A row's chatter: a linked streamer (all their sites) when the name is one of theirs, else their site's address
function setWho(r, name, site){
  const login = String(name || '').trim().replace(/^@/, '').toLowerCase();
  const s = login ? streamerOf(chOf({ site: site === 'every' ? 'kick' : site, login })) : null;
  Object.assign(r, { login, name: String(name || '').trim().replace(/^@/, ''), site: site === 'every' ? 'kick' : site, every: site === 'every', streamer: s ? s.id : '' });
  if (!s) delete r.sites;
  // a Kick name: its address as Kick has it (a name with _ can have - in its address)
  if (login && r.site === 'kick' && window.shoutouts){
    r.lost = false;
    window.shoutouts.lookUp({ site: 'kick', login, named: true }).then(info => {
      if (!info) return;
      if (info.missing) r.lost = true; else { r.lost = false; r.login = info.login; }
      savePeople(); renderPeople();
    });
  }
}
function renderPeople(){
  if (!rows.length){ peopleEl.replaceChildren(); return; }
  peopleEl.replaceChildren(element('div', 'so-ph', element('span', null, 'Chatter'), element('span', null, 'Shout out'), element('span', null, 'Message'), element('span')),
    ...rows.map(r => {
      const s = r.streamer && listStreamers().find(x => x.id === r.streamer);
      const site = element('select', { 'aria-label': 'Their site', dataset: { cmd: 'settings.shoutPersonSite' }, onchange: e => { setWho(r, r.name, e.target.value); savePeople(); renderPeople(); } },
        ...[['kick', 'Kick'], ['twitch', 'Twitch'], ['every', 'Every site']].map(([v, t]) => element('option', { value: v, selected: (r.every ? 'every' : r.site) === v }, t)));
      const name = element('input', { class: 'st-in', value: r.name || '', placeholder: 'Their name', 'aria-label': 'Their name', spellcheck: 'false', dataset: { cmd: 'settings.shoutPersonName' },
        onchange: e => { setWho(r, e.target.value, r.every ? 'every' : r.site); savePeople(); renderPeople(); } });
      const who = element('span', 'who', ...(s ? [...s.accounts.filter(a => ['kick', 'twitch'].includes(platOf(a))).map(a => element('i', { class: 'pi pi-' + platOf(a), title: PLAT_NAME[platOf(a)] }, PLAT_NAME[platOf(a)][0])), name] : [site, name]));
      const to = element('input', { class: 'st-in', value: r.to ? r.to.name || r.to.login : '', placeholder: 'themselves', 'aria-label': 'Who to shout out instead', spellcheck: 'false', dataset: { cmd: 'settings.shoutPersonTo' },
        onchange: e => { const v = e.target.value.trim().replace(/^@/, ''); r.to = v ? { site: r.site, login: v.toLowerCase(), name: v } : null; savePeople(); } });
      const msg = element('input', { class: 'st-in', value: r.msg || '', placeholder: 'Your message', 'aria-label': 'Their message', spellcheck: 'false', maxlength: '450', dataset: { cmd: 'settings.shoutPersonMsg' },
        oninput: e => { r.msg = e.target.value; savePeople(); } });
      const msgs = element('div', 'msgs', msg);
      // a linked streamer's row: a message for one site only (Kick or Twitch), under the main one
      if (s){
        const other = r.sites && Object.keys(r.sites)[0];
        if (other) msgs.appendChild(element('span', 'site-msg', element('i', { class: 'pi pi-' + other }, PLAT_NAME[other][0]),
          element('input', { class: 'st-in', value: r.sites[other], placeholder: `On ${PLAT_NAME[other]} only`, 'aria-label': `Their message on ${PLAT_NAME[other]}`, maxlength: '450', dataset: { cmd: 'settings.shoutPersonSiteMsg' },
            oninput: e => { r.sites = { [other]: e.target.value }; savePeople(); } })));
        else msgs.appendChild(element('button', { type: 'button', class: 'linkish', dataset: { cmd: 'settings.shoutPersonAddSite' }, onclick: () => { r.sites = { twitch: '' }; renderPeople(); } }, '+ A message for Twitch only'));
      }
      if (r.lost) msgs.appendChild(element('small', { class: 'st-warn' }, 'Couldn\'t find their Kick channel'));
      return element('div', 'so-pr', who, element('span', 'to', to), msgs,
        element('button', { type: 'button', class: 'x', title: 'Remove', 'aria-label': `Remove ${r.name || 'this row'}`, html: X, dataset: { cmd: 'settings.shoutPersonRemove' },
          onclick: () => { rows.splice(rows.indexOf(r), 1); saveRows(); renderPeople(); } }));
    }));
}
function syncShoutSettings(){
  $('#shoutOnSet').checked = settings.flag('shoutOn');
  $('#shoutTwitchSet').checked = settings.flag('shoutTwitch');
  $('#shoutSendSet').checked = settings.flag('shoutSend', true);
  $('#shoutStreamersSet').checked = settings.flag('shoutStreamers', true);
  $('#shoutListSet').checked = settings.flag('shoutListFirst', true);
  const again = settings.num('shoutAgain'), opts = ['5', '15', '60', '0'];
  $('#shoutAgainSet').value = opts.includes(String(again)) && settings.text('shoutAgain') !== '' ? String(again) : '15';
  $('#shoutRunSet .zoomPct').textContent = String(Math.max(1, Math.min(RUN_MAX, settings.num('shoutRunN') || 5)));
  if (document.activeElement !== textEl){ textEl.value = settings.text('shoutText') || SHOUT_TPL; renderPreview(); }
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  textEl = $('#shoutText'); previewEl = $('#shoutPreview'); peopleEl = $('#shoutPeople');
  if (!textEl) return;
  saveText = soon(() => { settings.set('shoutText', textEl.value.trim() === SHOUT_TPL ? '' : textEl.value); store.changed('shoutouts'); }, 500);
  savePeople = soon(saveRows, 500);
  const flag = (sel, key) => { $(sel).onchange = e => { settings.set(key, e.target.checked ? '1' : '0'); store.changed('shoutouts'); }; };
  flag('#shoutOnSet', 'shoutOn'); flag('#shoutSendSet', 'shoutSend'); flag('#shoutTwitchSet', 'shoutTwitch'); flag('#shoutStreamersSet', 'shoutStreamers'); flag('#shoutListSet', 'shoutListFirst');
  $('#shoutAgainSet').onchange = e => { settings.set('shoutAgain', e.target.value); store.changed('shoutouts'); };
  $('#shoutRunSet').addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    settings.set('shoutRunN', Math.max(1, Math.min(RUN_MAX, (settings.num('shoutRunN') || 5) + +b.dataset.z))); store.changed('shoutouts');
  });
  commands.add([
    { id: 'settings.shoutRunMore', kind: 'setting', group: 'Settings', title: 'More recent chatters in a shoutout run', sub: 'Settings › Chat › Shoutouts · up to 20', words: ['shoutout'], icon: 'megaphone', button: '#shoutRunSet [data-z="1"]' },
    { id: 'settings.shoutRunFewer', kind: 'setting', group: 'Settings', title: 'Fewer recent chatters in a shoutout run', sub: 'Settings › Chat › Shoutouts', words: ['shoutout'], icon: 'megaphone', button: '#shoutRunSet [data-z="-1"]' }]);
  textEl.addEventListener('input', () => { renderPreview(); saveText(); });
  $('#shoutTokens').append(...SHOUT_TOKENS.map(t => element('button', { type: 'button', dataset: { cmd: 'settings.shoutToken' }, onclick: () => addToken(t) }, element('code', null, t), ' ' + TOKEN_HELP[t])),
    element('span', 'so-hint', 'Words in [ ] are left out when there\'s no game.'));
  $('#shoutAdd').onclick = () => { rows.push({ site: 'kick', login: '', name: '', msg: '' }); renderPeople(); peopleEl.querySelector('.so-pr:last-child input.st-in')?.focus(); };
  rows = settings.json('shoutPeople', []); if (!Array.isArray(rows)) rows = [];
  renderPeople();
  syncShoutSettings();
  store.watch(['shoutouts'], () => syncShoutSettings());
  store.watch(['streamers'], () => { rows.forEach(r => { if (r.login) setWho(r, r.name || r.login, r.every ? 'every' : r.site); }); renderPeople(); });
  settings.onChange(['shoutPeople'], () => { rows = settings.json('shoutPeople', []); if (!Array.isArray(rows)) rows = []; renderPeople(); });
}

export { init };
