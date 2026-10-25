import { $ } from '../../core.js';
import { monitorsVars, partsFor, refreshMonitors, setPart, setTogether } from '../../layout/monitors.js';
import { commands } from '../../shared/commands.js';
import { element } from '../../shared/element.js';
import { DESKTOP } from '../../shared/env.js';
import { store } from '../../shared/store.js';

/* ---- Settings > Layouts > Monitors: a picture of your monitors as the system arranges them, Identify monitors, and
   for each layout the monitor its streams, chats and switch control go on (layout/monitors.js does the moving). */
const PARTS = [
  ['streams', 'Streams on', 'With the chats'],
  ['chats', 'Chats on', 'Where this window is'],
  ['switch', 'Switch control on', 'With the chats']
];
const monName = m => `${m.n} · ${m.w} × ${m.h}${m.primary ? ' (main)' : ''}`;
const keyOf = m => ({ id: m.id, label: m.label, x: m.x, y: m.y, w: m.w, h: m.h });
// a saved monitor among the ones there now (as the desktop app finds it: id, else name and size, else size and place)
const findMon = (key, list) => !key ? null : list.find(m => m.id === key.id)
  || (key.label ? list.find(m => m.label === key.label && m.w === key.w && m.h === key.h) : null)
  || list.find(m => m.w === key.w && m.h === key.h && m.x === key.x && m.y === key.y) || null;

// The monitors to scale, where the system has them; the one this window is on is marked
function renderMap(){
  const map = $('#moMap'), list = monitorsVars.monitors;
  if (!list.length){ map.replaceChildren(element('p', 'mo-none', 'Looking for your monitors…')); return; }
  const x0 = Math.min(...list.map(m => m.x)), y0 = Math.min(...list.map(m => m.y));
  const W = Math.max(...list.map(m => m.x + m.w)) - x0, H = Math.max(...list.map(m => m.y + m.h)) - y0;
  const k = Math.min(360 / W, 150 / H);
  map.style.width = Math.round(W * k) + 'px'; map.style.height = Math.round(H * k) + 'px';
  map.replaceChildren(...list.map(m => element('div', {
    class: 'mo-mon' + (m.primary ? ' main' : '') + (m.id === monitorsVars.mainId ? ' here' : '') + (m.portrait ? ' tall' : ''),
    style: { left: Math.round((m.x - x0) * k) + 'px', top: Math.round((m.y - y0) * k) + 'px', width: Math.round(m.w * k) - 3 + 'px', height: Math.round(m.h * k) - 3 + 'px' },
    title: `Monitor ${m.n}: ${m.w} × ${m.h}${m.primary ? ', the main one' : ''}${m.id === monitorsVars.mainId ? ', this window is on it' : ''}`
  }, element('b', null, String(m.n)), element('span', null, `${m.w} × ${m.h}`), m.primary ? element('em', null, 'main') : null)));
}
// One row per layout in the Layout menu, a monitor picker for each part
function renderTable(){
  const table = $('#moTable'), list = monitorsVars.monitors;
  const head = element('div', { class: 'mo-row mo-head', role: 'row' }, element('span', { role: 'columnheader' }, 'Layout'),
    ...PARTS.map(([, label]) => element('span', { role: 'columnheader' }, label)));
  const rows = [...document.querySelectorAll('#layoutMenu .lm-grid button[data-l]')].map(b => {
    const l = b.dataset.l, parts = partsFor(l);
    return element('div', { class: 'mo-row', role: 'row', 'data-l': l }, element('span', { class: 'mo-l', role: 'rowheader' }, b.querySelector('b').textContent),
      ...PARTS.map(([part, label, none]) => {
        const key = parts[part], m = findMon(key, list);
        const sel = element('select', { 'data-part': part, 'aria-label': `${b.querySelector('b').textContent}: ${label}`, onchange: e => {
          const v = e.target.value;
          if (v === 'gone') return;
          setPart(l, part, v ? keyOf(list.find(x => String(x.id) === v)) : null);
        } }, element('option', { value: '' }, none), ...list.map(x => element('option', { value: String(x.id) }, monName(x))),
          key && !m ? element('option', { value: 'gone' }, `${key.w} × ${key.h} (not plugged in)`) : null);
        sel.value = key ? (m ? String(m.id) : 'gone') : '';
        return element('span', { role: 'cell' }, sel);
      }));
  });
  table.replaceChildren(head, ...rows);
}
function render(){
  if (!$('#moMap')) return;
  renderMap(); renderTable();
  $('#moTogether').checked = monitorsVars.saved.together !== false;
}

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  const pane = document.querySelector('#settingsDlg [data-s=layouts] .st-subpane[data-t=monitors]');
  if (!(window.kmv && window.kmv.monitors)){             // only in the desktop app
    pane?.remove(); document.querySelector('#lyTabs [data-t=monitors]')?.remove();
    return;
  }
  $('#moIdentify').onclick = () => window.kmv.identifyMonitors && window.kmv.identifyMonitors();
  commands.add({ id: 'monitors.identify', group: 'Settings', title: 'Identify monitors', sub: 'Each monitor\'s number on it for a moment (Settings › Layouts › Monitors)', words: ['screens', 'displays'],
    icon: 'capture', button: '#moIdentify', when: () => DESKTOP && !!window.kmv.identifyMonitors });
  $('#moTogether').addEventListener('change', e => setTogether(e.target.checked));
  // drawn when the tab opens (the monitors may have changed since) and whenever they change
  document.querySelector('#lyTabs [data-t=monitors]').addEventListener('click', () => refreshMonitors());
  store.watch('monitors', render);
  render();
}

export { init };
