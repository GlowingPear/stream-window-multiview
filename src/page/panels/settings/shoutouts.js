import { RUN_MAX, SHOUT_TOKENS, SHOUT_TPL, fillShout, shoutLink } from '../../chat/shoutout-text.js';
import { soCards, soCheckCards, soSaveCards } from '../../chat/shoutout.js';
import { $ } from '../../core.js';
import { bellVars, myName } from '../bell/bell.js';
import { shoutAddEl, shoutCardEl } from './shout-cards.js';
import { PLAT_NAME } from '../../platforms/platforms.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { settings } from '../../shared/settings.js';
import { store } from '../../shared/store.js';
import { soon } from '../../shared/timers.js';

/* ---- Settings › Shoutouts (chat/shoutout.js does them): on, your message with a live preview (with a game and
   without one), the People list (their own message, another channel instead, a linked streamer's row for every site
   with an optional message for one site), and how sending and runs of recent chatters go. Off by default. */
const SAMPLE = [   // the preview's made-up channels: one with a last game, one without
  { site: 'kick', name: 'Pixelfox', login: 'pixelfox', game: 'Tidepool' },
  { site: 'twitch', name: 'Lumen', login: 'lumen', game: '' }];
const TOKEN_HELP = { '{name}': 'their name', '{link}': 'their channel', '{links}': 'every site', '{game}': 'last game' };
let textEl, previewEl, peopleEl;
let saveText = null, saveCardsSoon = null;

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
/* ---- Channels: a card for each channel with a shoutout of its own (panels/settings/shout-cards.js draws one), and adding
   one by looking it up. Open cards stay open as the list is drawn again. ---- */
let openCards = new Set(), pendingCards = null;
const cardKey = c => c.streamer || c.ch;
function saveCard(card){
  const cards = soCards(), i = cards.findIndex(c => cardKey(c) === cardKey(card));
  if (i >= 0) cards[i] = card; else cards.push(card);
  pendingCards = cards; saveCardsSoon();
}
function renderChannels(){
  const cards = soCards();
  peopleEl.replaceChildren(...(cards.length ? cards.map(c => {
    const el = shoutCardEl(c, { open: openCards.has(cardKey(c)), save: saveCard,
      remove: () => { openCards.delete(cardKey(c)); const base = pendingCards || soCards(); pendingCards = null; soSaveCards(base.filter(x => cardKey(x) !== cardKey(c))); } });   // (what you'd typed in the others, kept; this one's, gone)
    el.addEventListener('click', e => { if (e.target.closest('.sc-tog')) setTimeout(() => { const now = peopleEl.querySelector(`.sc-card[data-ch="${CSS.escape(c.ch)}"]`); if (now && now.classList.contains('open')) openCards.add(cardKey(c)); else openCards.delete(cardKey(c)); }, 0); });
    return el;
  }) : [element('div', 'so-empty', 'No channels yet. Find a channel above to give it a shoutout of its own, or to list the other accounts it\'s for.')]));
}
function syncShoutSettings(){
  $('#shoutOnSet').checked = settings.flag('shoutOn');
  $('#shoutTwitchSet').checked = settings.flag('shoutTwitch');
  $('#shoutSendSet').checked = settings.flag('shoutSend', true);
  $('#shoutModSet').checked = settings.flag('shoutModOnly', true);
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
  // the page's tabs: Message, People, Recent chatters
  $('#soTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    $('#soTabs').querySelectorAll('button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.st-pane[data-s="shoutouts"] .st-subpane').forEach(p => { p.hidden = p.dataset.t !== b.dataset.t; });
  });
  saveText = soon(() => { settings.set('shoutText', textEl.value.trim() === SHOUT_TPL ? '' : textEl.value); store.changed('shoutouts'); }, 500);
  saveCardsSoon = soon(() => { if (pendingCards) soSaveCards(pendingCards); pendingCards = null; }, 400);   // (soon calls it with nothing: the cards wait in pendingCards)
  const flag = (sel, key) => { $(sel).onchange = e => { settings.set(key, e.target.checked ? '1' : '0'); store.changed('shoutouts'); }; };
  flag('#shoutOnSet', 'shoutOn'); flag('#shoutSendSet', 'shoutSend'); flag('#shoutModSet', 'shoutModOnly'); flag('#shoutTwitchSet', 'shoutTwitch'); flag('#shoutStreamersSet', 'shoutStreamers'); flag('#shoutListSet', 'shoutListFirst');
  $('#shoutAgainSet').onchange = e => { settings.set('shoutAgain', e.target.value); store.changed('shoutouts'); };
  $('#shoutRunSet').addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    settings.set('shoutRunN', Math.max(1, Math.min(RUN_MAX, (settings.num('shoutRunN') || 5) + +b.dataset.z))); store.changed('shoutouts');
  });
  commands.add([
    { id: 'settings.shoutRunMore', kind: 'setting', group: 'Settings', title: 'More recent chatters in a shoutout run', sub: 'Settings › Shoutouts · up to 20', words: ['shoutout'], icon: 'megaphone', button: '#shoutRunSet [data-z="1"]' },
    { id: 'settings.shoutRunFewer', kind: 'setting', group: 'Settings', title: 'Fewer recent chatters in a shoutout run', sub: 'Settings › Shoutouts', words: ['shoutout'], icon: 'megaphone', button: '#shoutRunSet [data-z="-1"]' }]);
  textEl.addEventListener('input', () => { renderPreview(); saveText(); });
  $('#shoutTokens').append(...SHOUT_TOKENS.map(t => element('button', { type: 'button', dataset: { cmd: 'settings.shoutToken' }, onclick: () => addToken(t) }, element('code', null, t), ' ' + TOKEN_HELP[t])),
    element('span', 'so-hint', 'Words in [ ] are left out when there\'s no game.'));
  // adding a channel: looked up, then its card, open for its message
  $('#shoutAddBox').replaceWith(shoutAddEl(card => {
    const have = soCards().find(c => cardKey(c) === cardKey(card));
    if (!have) soSaveCards([...soCards(), card]);
    openCards = new Set([cardKey(card)]); renderChannels();   // (only the new one open)
    peopleEl.querySelector(`.sc-card[data-ch="${CSS.escape((have || card).ch)}"] textarea`)?.focus();
  }, { taken: card => soCards().some(c => cardKey(c) === cardKey(card)) }));
  renderChannels();
  // (the Channels tab: cards not checked yet are looked up on Kick and Twitch)
  $('#soTabs').addEventListener('click', e => { if (e.target.closest('[data-t=channels]')) soCheckCards(); });
  syncShoutSettings();
  store.watch(['shoutouts'], () => syncShoutSettings());
  // (drawn again for a change from elsewhere: a check, the other window, linking; never while you type in it)
  store.watch(['shoutouts', 'streamers'], () => { if (!peopleEl.contains(document.activeElement)) renderChannels(); });
}

export { init };
