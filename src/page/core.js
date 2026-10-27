const $ = s => document.querySelector(s);
let stage, input, modeSel, mutedChk, snapChk, msg, empty, sizehint;
let ROLE;
const BAR = 30, MIN_W = 220, MIN_H = 140, SNAP = 12, GAP = 6;
let STORE;
let popped = false;          // main window: are streams currently in their own window?
let lastLayout = null, streamCols = 1;
let colsMode = false, colWidth = 0, colCount = 0;   // Columns mode (scrolls sideways)
let wins = [], zTop = 10, uid = 0;
var refreshAccountsPane = null;   // Settings > Accounts (desktop app)
// The windows on screen: a window with several sites (windows/frames.js) counts once, as the tab you're watching.
// Layouts, placement and the window lists use these; what each site does by itself (ad skips, mentions, raids)
// goes over every window in wins, the tabs you can't see too.
const shownWins = () => wins.filter(w => !w.hiddenTab);

// Other files change these through coreVars: a variable imported from another file can't be assigned to.
const coreVars = {
  get popped(){ return popped; }, set popped(v){ popped = v; },
  get lastLayout(){ return lastLayout; }, set lastLayout(v){ lastLayout = v; },
  get streamCols(){ return streamCols; }, set streamCols(v){ streamCols = v; },
  get colsMode(){ return colsMode; }, set colsMode(v){ colsMode = v; },
  get colCount(){ return colCount; }, set colCount(v){ colCount = v; },
  get colWidth(){ return colWidth; }, set colWidth(v){ colWidth = v; },
  get zTop(){ return zTop; }, set zTop(v){ zTop = v; },
  get uid(){ return uid; }, set uid(v){ uid = v; },
  get wins(){ return wins; }, set wins(v){ wins = v; },
  get refreshAccountsPane(){ return refreshAccountsPane; }, set refreshAccountsPane(v){ refreshAccountsPane = v; },
};

// What this part does as the page starts (app.js runs each part's init(), in the order it lists).
function init(){
  stage = $('#stage'), input = $('#savedInput'), modeSel = $('#mode'), mutedChk = $('#muted'),
        snapChk = $('#snap'), msg = $('#msg'), empty = $('#empty'), sizehint = $('#sizehint');
  // This page runs as the main window, or (?role=streams) as the popped-out streams window.
  ROLE = new URLSearchParams(location.search).get('role') === 'streams' ? 'streams' : 'main';
  STORE = ROLE === 'streams' ? 'streams.v1' : 'v1';   // this window's windows, as a saved setting (shared/settings.js)
}

export { $, BAR, colCount, colsMode, colWidth, coreVars, empty, GAP, init, input, lastLayout, MIN_H, MIN_W, modeSel,
  msg, mutedChk, popped, refreshAccountsPane, ROLE, shownWins, sizehint, SNAP, snapChk, stage, STORE, streamCols,
  wins, zTop };
