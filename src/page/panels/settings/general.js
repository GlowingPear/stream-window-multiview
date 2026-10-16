import './settings.js';   // runs after it (see app.js)
import { $, wins } from '../../core.js';
import { DESKTOP } from '../../shared/env.js';
import { emoteAgent } from '../../in-site/emote-preview.js';
import { emoteOn, markNewEmotes, newEmotesOn, pngOf, viewVars } from '../../windows/views.js';
import { setTrAll, trAll } from '../../chat/translate.js';
import { autoFit, setAutoFit } from '../channels/channels.js';
import { liveLinked } from '../../layout/layouts.js';
import { activePreset } from '../../layout/saved-layouts.js';
import { keysOn, setKeysOn } from '../help/help.js';

/* General: on and off switches, remembered */
[['#muted', 'kickMultiview.startMuted'], ['#snap', 'kickMultiview.snap']].forEach(([sel, key]) => {
  const c = $(sel);
  try { const v = localStorage.getItem(key); if (v !== null) c.checked = v === '1'; } catch {}
  c.addEventListener('change', () => { try { localStorage.setItem(key, c.checked ? '1' : '0'); } catch {} });
});
$('#autoFit').checked = $('#lmAutoFit').checked = autoFit;
$('#autoFit').addEventListener('change', e => setAutoFit(e.target.checked));
$('#lyLinked').addEventListener('change', e => { try { localStorage.setItem('kickMultiview.linked', e.target.checked ? '1' : '0'); } catch {} if (!activePreset) liveLinked(e.target.checked); });
$('#keysSet').checked = keysOn;
$('#keysSet').addEventListener('change', e => setKeysOn(e.target.checked));
$('#trAllSet').checked = trAll;
$('#trAllSet').addEventListener('change', e => setTrAll(e.target.checked));
/* Settings > General: emote preview in chats (see emoteAgent) */
$('#emoteSet').checked = emoteOn;
$('#emoteSet').addEventListener('change', e => {
  viewVars.emoteOn = e.target.checked;
  try { localStorage.setItem('kickMultiview.emotePreview', emoteOn ? '1' : '0'); } catch {}
  wins.forEach(w => { if (w.kind === 'chat' && w.ready) w.view.executeJavaScript(`window.__kmvEmote && window.__kmvEmote.on(${emoteOn})`).catch(() => {}); });
});
/* Settings > General: highlight new emotes (off by default) */
$('#newEmoteSet').checked = newEmotesOn;
$('#newEmoteSet').closest('.st-row').hidden = !DESKTOP;   // it asks the sites from the app
$('#newEmoteSet').addEventListener('change', e => {
  viewVars.newEmotesOn = e.target.checked;
  try { localStorage.setItem('kickMultiview.newEmotes', newEmotesOn ? '1' : '0'); } catch {}
  wins.forEach(w => {
    if (w.kind !== 'chat' || !w.ready) return;
    if (newEmotesOn) markNewEmotes(w);
    else w.view.executeJavaScript('window.__kmvNew && window.__kmvNew.set([])').catch(() => {});
  });
});
// Its example: a made-up emote drawn here (nothing is fetched), shown with the same card a chat gets.
const SAMPLE_EMOTE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M33 15c0-4 1-7 3.6-10.2" fill="none" stroke="#7a4b1e" stroke-width="3.4" stroke-linecap="round"/><path d="M36 9.6C40 4.2 47.5 3.2 52.5 5.4 49.6 10.8 42.4 12.8 36 9.6Z" fill="#3fbf1f"/><path d="M32 14C25.6 14 23.4 19.4 23.4 24.6c0 5-3 7-6.2 11C13.2 40.6 12 46.8 14.2 52 17.2 58.8 24.4 62 32 62s14.8-3.2 17.8-10c2.2-5.2 1-11.4-3-16.4-3.2-4-6.2-6-6.2-11C40.6 19.4 38.4 14 32 14Z" fill="#9be35a"/><circle cx="26" cy="38" r="3" fill="#0a0c0d"/><circle cx="38" cy="38" r="3" fill="#0a0c0d"/><path d="M25 46c4 4 10 4 14 0" fill="none" stroke="#0a0c0d" stroke-width="3" stroke-linecap="round"/><path d="M50 30l8-8M54 34l8-4" stroke="#e7ede9" stroke-width="3" stroke-linecap="round"/></svg>');
{
  const pic = $('#emoteSample');
  pic.src = SAMPLE_EMOTE;
  emoteAgent();                                            // the card, here (it doesn't open by itself: it's off in this page)
  window.__kmvEmote.setExampleSend((what, d) => { if (what === 'copy') copySample(d && d.url); });
  const e = () => ({ name: 'pearWave', text: 'pearWave', small: SAMPLE_EMOTE, big: SAMPLE_EMOTE, site: 'Kick', animated: false, addOn: false });
  let t = 0;
  pic.addEventListener('pointerenter', () => { clearTimeout(t); t = setTimeout(() => window.__kmvEmote.preview(pic, e(), true), 120); });
  pic.addEventListener('pointerleave', () => { clearTimeout(t); window.__kmvEmote.hideSoon(); });
  $('#emoteExample').addEventListener('click', () => window.__kmvEmote.preview(pic, e(), true));
}
async function copySample(src){
  const png = src === SAMPLE_EMOTE ? await pngOf(src) : null;
  if (!png) return;
  if (window.kmv && window.kmv.clipboardPng){ await window.kmv.clipboardPng(png).catch(() => {}); return; }
  try { const b = await (await fetch(png)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); } catch {}
}
