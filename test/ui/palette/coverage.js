// Shared by the coverage tests (test/ui/palette/coverage.test.js in a browser, test/launch/palette/coverage.test.js
// in the real app, for what only the desktop app shows): which buttons need no command of their own, and why, and
// the visible buttons, tabs and controls (switches, lists to pick from, boxes to type in) that have none.
const ALLOWED = [
  ['#palBg button, #palBtn', 'the search box itself, and its own button'],
  ['.help-x, .dlg-cancel, .dlg-ok, #askDlg button, .tip-ok', 'closing or answering a dialog'],
  ['#moreBtn, #spMore, [data-a=more], #barMenu button', 'a "more" menu: what\'s in it are commands of their own'],
  ['.st-chips button, .pf-tag button', 'a chip\'s ×: removing one word, bot or tag from a list'],
  ['.sv, .sv button, .pf-card, .ly-item, .mp-row, .mp-row button, .th-item button, .es-live button, .lm-grid button', 'rows of a list: the channels, layouts and notifications are results of their own'],
  ['.gd-toc button, .gd-r, [data-topic], .gd-q, [data-help], [data-go], .gd-chip, .am-yk-how', 'a link to a page of Settings or the guide (each page is a command)'],
  ['#tourLayer button', 'the tour\'s Next, Back and End'],
  ['.es-go, #spOpen, #spOpenSave, #spPlat button, .es-plat button', 'a box\'s own Open, for what\'s typed in it (the search box opens anything typed too)'],
  ['[data-addbtn], #mentWordAdd, .am-yk-add, .upd-save, #spamTryBtn, .ex-linkrow button', 'a box\'s own Add, Save or Check, for what\'s typed in it (the search box\'s Check “…” for spam takes the words typed)'],
  ['.st-play, .st-reveal, [data-play], #emoteExample', 'playing a sound, an example or showing hidden words, right where the option is'],
  ['.es-show', 'the welcome screen\'s "Show me": pointing at where a feature is (each feature is a command, and its guide page)'],
  ['.ly-use, #presetSave, #lyPresetSave', 'Use and Save in the layouts\' own lists'],
  ['.th-savebtn', 'Save theme: the search box\'s Save theme as "…" takes the name typed'],
  ['.lm-sw button, .ly-cards button, .seg button', 'a choice inside an option whose own row is a command'],
  ['.es-in, #savedInput, #gdSearch', 'a box to type a channel or a question in: the search box finds channels and the guide\'s pages too'],
  ['.es-mode, #mode', 'what a channel opens as: each channel in the search box has Stream + chat, Stream only and Chat only'],
  ['.col-pick', 'a window\'s swap list: each window in the search box has Swap with …'],
  ['#presetName', 'the name for Save: the search box\'s Save layout as “…” takes the name typed'],
  ['.nc-pick', 'which chat the bell lists: a filter of the list, not an option'],
  ['.th-var input, .th-name', 'the theme editor\'s colours and name: each theme is a command, and Save theme as “…” takes the name typed'],
  ['#ntGrid input, #ntGrid select', 'the Notifications grid: the same settings as on each alert\'s own page, where they\'re commands'],
  ['#keysOn', 'the same setting as Settings › General › Keyboard shortcuts, a command there'],
  ['.st-add .st-in, .st-try .st-in, .am-yk-in', 'a box for its own Add, Save or Check button (see above)'],
  ['#pfQ, #pfSort, #nhQ, #nhUnread', 'searching, sorting or filtering a list: its rows are results of their own'],
  ['.win .vol input', 'a stream\'s volume slider: each stream in the search box has Volume up, Volume down and Mute']
];

// The visible buttons, tabs and controls without a command, by what they say
const uncovered = page => page.evaluate(allowed => {
  if (window.readSettingsCommands) window.readSettingsCommands();   // Settings' options, as the search box reads them now
  const ok = b => !!b.closest('[data-cmd], [data-cmds]') || allowed.some(([sel]) => b.matches(sel));
  return [...document.querySelectorAll('button, [role=tab], input:not([type=hidden]), select, textarea')]
    .filter(b => b.checkVisibility() && !b.disabled && !ok(b))
    .map(b => `${b.id ? '#' + b.id : ''}.${[...b.classList].join('.')} “${(b.getAttribute('aria-label') || b.textContent || b.title || '').trim().slice(0, 40)}” in ${(b.closest('[id]') || {}).id || '?'}`);
}, ALLOWED);
// each one once, with the first part it showed in
async function check(page, part, seen){
  for (const u of await uncovered(page)) if (!seen.has(u)) seen.set(u, part);
}

module.exports = { ALLOWED, uncovered, check };
