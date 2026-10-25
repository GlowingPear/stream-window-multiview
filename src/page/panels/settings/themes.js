import { $ } from '../../core.js';
import { pushSwitcherState, swCss, switchVars } from '../../layout/switch-control.js';
import { notes } from '../bell/bell.js';
import { ask } from '../../shared/ask.js';
import { commands } from '../../shared/commands.js';
import { element, esc } from '../../shared/element.js';
import { flash } from '../../shared/flash.js';
import { icon } from '../../shared/icons.js';
import { settings } from '../../shared/settings.js';
import { panel } from '../../toolbar/toolbar.js';

/* ===================== 2.4: colours and themes ===================== */
const THEME_VARS = [
  ['--bg', 'Background', 'Behind everything'],
  ['--panel', 'Panels', 'Toolbar, menus, title bars'],
  ['--panel2', 'Raised panels', 'Buttons and cards'],
  ['--line', 'Borders', 'Thin dividing lines'],
  ['--line2', 'Strong borders', 'Button and box outlines'],
  ['--text', 'Text', 'Main text'],
  ['--muted', 'Quiet text', 'Hints and labels'],
  ['--accent', 'Accent', 'Highlights and active things'],
  ['--accent-ink', 'Text on accent', 'Text on accent-coloured buttons'],
  ['--danger', 'Warning', 'Mute, remove and errors'],
  ['--frame', 'Window border', 'Selected and big windows. Same as Accent until you set it']
];
const TV = (bg, panel, panel2, line, line2, text, muted, accent, ink, danger) =>
  ({ '--bg': bg, '--panel': panel, '--panel2': panel2, '--line': line, '--line2': line2, '--text': text, '--muted': muted, '--accent': accent, '--accent-ink': ink, '--danger': danger });
let BUILTIN_THEMES;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const cleanVars = v => { const o = {}; THEME_VARS.forEach(([k]) => { if (v && HEX_RE.test(v[k] || '')) o[k] = v[k].toLowerCase(); }); return o; };
const isLight = v => { const h = (v['--bg'] || '#000000').slice(1); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5; };
let myThemes = [];
let theme;
// Contrast between two colours (1 = the same, 21 = black on white), as in the accessibility guidelines.
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => { const c = parseInt(hex.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
let contrast;
// The colours actually used: fills in the window border, and fixes text on accent buttons
// that would be unreadable (e.g. a black accent with dark text turned the buttons solid black).
function themeFixes(v){
  const out = { ...v }, notes = [];
  if (!HEX_RE.test(out['--frame'] || '')) out['--frame'] = v['--accent'];
  out['--accent-edge'] = v['--accent'];
  if (contrast(v['--accent'], v['--accent-ink']) < 3){
    out['--accent-ink'] = contrast(v['--accent'], '#ffffff') >= contrast(v['--accent'], '#000000') ? '#ffffff' : '#000000';
    notes.push(`Text on accent is too close to Accent to read, so accent buttons use ${out['--accent-ink'] === '#ffffff' ? 'white' : 'black'} text instead.`);
  }
  if (contrast(v['--accent'], v['--panel']) < 1.6 || contrast(v['--accent'], v['--bg']) < 1.6){
    out['--accent-edge'] = v['--line2'];
    notes.push('Accent is very close to the background, so highlighted things will be hard to see. To change only the border around windows, use Window border instead.');
  }
  return { vars: out, notes };
}
function applyTheme(persist){
  const v = theme.vars, light = isLight(v), fx = themeFixes(v);
  $('#themeVars').textContent = ':root{' + Object.entries(fx.vars).map(([k, x]) => `${k}:${x}`).join(';') + `;color-scheme:${light ? 'light' : 'dark'}}`;
  const warn = $('#themePane .th-warn');
  if (warn){ warn.textContent = fx.notes.join(' '); warn.hidden = !fx.notes.length; }
  document.body.classList.toggle('theme-light', light);
  if (persist){ settings.set('theme', { name: theme.name, vars: v, light, edited: theme.edited }); }
  if (typeof swCss !== 'undefined'){ switchVars.swCss = null; switchVars.swLastSig = ''; if (typeof pushSwitcherState === 'function') pushSwitcherState(true); }
}
let themeDlg;
const swatch = v => `<span class="sw">${['--bg', '--panel2', '--text', '--accent', '--danger'].map(k => `<i style="background:${v[k]}"></i>`).join('')}</span>`;
function renderThemeList(){
  const list = themeDlg.querySelector('.th-list');
  list.innerHTML = '';
  const row = (t, mine) => {
    const b = element('div', { class: 'th-item' + (!theme.edited && theme.name === t.name ? ' on' : ''), tabIndex: 0, html: swatch(t.vars) },
      element('span', 'th-txt', element('b', null, t.name), t.note && element('small', null, t.note)),
      mine && element('button', { class: 'th-del', title: 'Delete this theme', html: icon.close }));
    b.onclick = async e => {
      if (e.target.closest('.th-del')){
        if (!await ask(`Delete the theme “${t.name}”?`, 'This can\'t be undone.', { ok: 'Delete', danger: true })) return;
        myThemes = myThemes.filter(x => x !== t); saveMyThemes(); renderThemeList(); return;
      }
      setTheme(t);
    };
    list.appendChild(b);
  };
  BUILTIN_THEMES.forEach(t => row(t, false));
  if (myThemes.length){ const h = document.createElement('div'); h.className = 'th-sec'; h.style.marginTop = '10px'; h.textContent = 'Your themes'; list.appendChild(h); myThemes.forEach(t => row(t, true)); }
}
const saveMyThemes = () => { settings.set('themes', myThemes); };
// A theme from the list (Settings › Themes, and the search box)
function setTheme(t){
  theme = { name: t.name, vars: { ...BUILTIN_THEMES[0].vars, ...t.vars }, edited: false };
  applyTheme(true); renderThemeDlg();
}
// the search box's (Ctrl/⌘+K): each theme, and (when nothing else is found) saving the one in use under the words typed
function themeItems(q){
  const cur = t => !theme.edited && theme.name === t.name;
  const out = [...BUILTIN_THEMES, ...myThemes].map(t => ({ id: 'theme:' + t.name, kind: 'theme', group: 'Themes', title: 'Theme: ' + t.name, sub: t.note || 'Your theme',
    words: [t.name, 'colours', 'colors', isLight(t.vars) ? 'light mode' : 'dark mode'], icon: 'palette', tags: cur(t) ? ['In use'] : [], verb: 'Use',
    run: () => { setTheme(t); flash(`Theme: ${t.name}`); } }));
  if (q && q.length <= 30) out.push({ id: 'theme.save', kind: 'theme', group: 'Nothing found', title: `Save theme as “${q}”`, sub: 'The colours in use, as a theme of your own', icon: 'palette',
    fallback: true, run: () => { themeDlg.querySelector('.th-name').value = q; saveThemeFromInput(); } });
  return out;
}
function renderThemeVars(){
  const box = themeDlg.querySelector('.th-vars');
  box.innerHTML = '';
  THEME_VARS.forEach(([k, label, hint]) => {
    const r = document.createElement('label'); r.className = 'th-var'; r.dataset.k = k;
    r.innerHTML = `<span></span><input type="color"><input class="hex" maxlength="7" spellcheck="false">`;
    r.querySelector('span').innerHTML = `${esc(label)}<small>${esc(hint)}</small>`;
    const c = r.querySelector('input[type=color]'), h = r.querySelector('.hex');
    c.value = h.value = theme.vars[k] || (k === '--frame' ? theme.vars['--accent'] : '#000000');
    const set = val => {
      if (!HEX_RE.test(val)) return false;
      theme.vars[k] = val.toLowerCase(); theme.edited = true;
      applyTheme(true); themeDlg.querySelector('.th-cur').textContent = `${theme.name} · edited`;
      if (k === '--accent' && !theme.vars['--frame']){          // the window border follows Accent until it's set
        const fr = themeDlg.querySelector('.th-var[data-k="--frame"]');
        if (fr) fr.querySelector('input[type=color]').value = fr.querySelector('.hex').value = theme.vars[k];
      }
      themeDlg.querySelectorAll('.th-item.on').forEach(x => x.classList.remove('on'));
      return true;
    };
    c.addEventListener('input', () => { h.value = c.value; set(c.value); });
    h.addEventListener('input', () => { let v = h.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (set(v)) c.value = v; });
    box.appendChild(r);
  });
}
function renderThemeDlg(){
  renderThemeList(); renderThemeVars();
  themeDlg.querySelector('.th-cur').textContent = theme.edited ? `${theme.name} · edited` : `(${theme.name})`;
}
const saveThemeFromInput = async () => {
  const inp = themeDlg.querySelector('.th-name');
  let name = inp.value.trim().slice(0, 30);
  if (!name){ inp.focus(); flash('Type a name for your theme first'); return; }
  if (BUILTIN_THEMES.some(t => t.name.toLowerCase() === name.toLowerCase())) name += ' (mine)';
  const i = myThemes.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
  if (i >= 0 && !await ask(`Replace “${myThemes[i].name}”?`, 'You already have a theme with this name. Saving replaces it.', { ok: 'Replace' })) return;
  const t = { name, vars: { ...theme.vars } };
  if (i >= 0) myThemes[i] = t; else myThemes.push(t);
  saveMyThemes();
  theme = { name, vars: { ...theme.vars }, edited: false }; applyTheme(true);
  inp.value = ''; renderThemeDlg(); flash(`Saved theme “${name}”`);
};

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  BUILTIN_THEMES = [
    { name: 'Pear', note: 'The original green', vars: TV('#0a0c0d', '#131719', '#1b2023', '#283034', '#353e43', '#e7ede9', '#87928c', '#53fc18', '#0a0c0d', '#ff5f5f') },
    { name: 'Purple Night', note: 'Deep purple', vars: TV('#0e0e10', '#18181b', '#1f1f23', '#2a2a2f', '#3a3a40', '#efeff1', '#adadb8', '#a970ff', '#ffffff', '#ff4f4d') },
    { name: 'Ocean', note: 'Calm blues', vars: TV('#08111a', '#0e1a26', '#142333', '#1e3246', '#2a4259', '#e4eef7', '#8aa1b5', '#3fb6ff', '#04121d', '#ff6b6b') },
    { name: 'Sunset', note: 'Warm orange', vars: TV('#140c0a', '#1d1311', '#261916', '#36231e', '#4a2f28', '#f6e9e2', '#b39486', '#ff8a3d', '#1a0d05', '#ff5577') },
    { name: 'Cherry', note: 'Bold red-pink', vars: TV('#12080b', '#1b0e12', '#241318', '#351c23', '#4a2730', '#f5e6ea', '#b08a94', '#ff3d6e', '#ffffff', '#ffb020') },
    { name: 'Neon Arcade', note: 'Hot pink on violet', vars: TV('#090713', '#120e22', '#1a142f', '#2a2148', '#3a2e61', '#efe9ff', '#9b8fc4', '#ff2fd5', '#12001a', '#ff5f5f') },
    { name: 'Retro Amber', note: 'Old terminal glow', vars: TV('#0c0a05', '#15120a', '#1d190e', '#2d2614', '#3e351c', '#f3e7c4', '#a8996c', '#ffbf2e', '#1a1200', '#ff5f45') },
    { name: 'Midnight Mono', note: 'Black and white', vars: TV('#0b0b0c', '#141416', '#1c1c1f', '#2a2a2e', '#3a3a3f', '#ececee', '#8d8d94', '#e8e8ea', '#111113', '#ff5f5f') },
    { name: 'Daylight', note: 'Light mode', vars: TV('#eef1f3', '#ffffff', '#f3f5f7', '#dde2e6', '#c8cfd5', '#15191c', '#5f6b73', '#1f9d3a', '#ffffff', '#d93030') },
    { name: 'Paper', note: 'Soft light mode', vars: TV('#f4efe6', '#fffaf2', '#f7f1e6', '#e6dccb', '#d4c6ae', '#2b241a', '#7a6c58', '#c2571a', '#ffffff', '#c0392b') },
    { name: 'Hikari', note: 'Blue and white', vars: TV('#eaf2fd', '#ffffff', '#f3f8ff', '#d4e3f7', '#b8cfee', '#0f2a4a', '#5a7396', '#1e6fe8', '#ffffff', '#e0394a') },
    { name: 'Tron (princess)', note: 'Pretty in pink', vars: { ...TV('#16080f', '#210d18', '#2b1220', '#3f1d31', '#562a45', '#ffe8f4', '#c992b0', '#ff5fae', '#2b0017', '#ffb547'), '--frame': '#ff9fd0' } }
  ];
  try { myThemes = [].concat(settings.json('themes', [])).filter(t => t && t.name && t.vars).map(t => ({ name: String(t.name).slice(0, 30), vars: cleanVars(t.vars) })); } catch {}
  theme = { name: 'Pear', vars: { ...BUILTIN_THEMES[0].vars }, edited: false };
  try { const t = settings.json('theme'); if (t && t.vars) theme = { name: t.name || 'Custom', vars: { ...BUILTIN_THEMES[0].vars, ...cleanVars(t.vars) }, edited: !!t.edited }; } catch {}
  contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  applyTheme(false);
  settings.onChange('theme', (_, v) => {          // the other window changed the theme
    try { const t = JSON.parse(v || 'null'); if (t && t.vars){ theme = { name: t.name, vars: { ...BUILTIN_THEMES[0].vars, ...cleanVars(t.vars) }, edited: !!t.edited }; applyTheme(false); } } catch {}
  });
  themeDlg = $('#themePane');   // the Themes tab in Settings
  themeDlg.querySelector('.th-reset').onclick = () => { theme = { name: 'Pear', vars: { ...BUILTIN_THEMES[0].vars }, edited: false }; applyTheme(true); renderThemeDlg(); };
  themeDlg.querySelector('.th-savebtn').onclick = saveThemeFromInput;
  themeDlg.querySelector('.th-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveThemeFromInput(); });
  commands.add({ id: 'theme.reset', kind: 'theme', group: 'Themes', title: 'Back to Pear', sub: 'The original colours', words: ['reset theme', 'default colours'], icon: 'palette', button: '#themePane .th-reset', when: () => true });
  commands.provide('themes', themeItems);
}

export { init, renderThemeDlg };
