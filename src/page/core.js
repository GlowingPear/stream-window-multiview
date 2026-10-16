const $ = s => document.querySelector(s);
const stage = $('#stage'), input = $('#savedInput'), modeSel = $('#mode'), mutedChk = $('#muted'),
      snapChk = $('#snap'), msg = $('#msg'), empty = $('#empty'), sizehint = $('#sizehint');
// This page runs as the main window, or (?role=streams) as the popped-out streams window.
const ROLE = new URLSearchParams(location.search).get('role') === 'streams' ? 'streams' : 'main';
const STREAMS_STORE = 'kickMultiview.streams.v1', POPPED_KEY = 'kickMultiview.popped';
const BAR = 30, MIN_W = 220, MIN_H = 140, SNAP = 12, GAP = 6,
      STORE = ROLE === 'streams' ? STREAMS_STORE : 'kickMultiview.v1';
let popped = false;          // main window: are streams currently in their own window?
let lastLayout = null, streamCols = 1;
let colsMode = false, colWidth = 0, colCount = 0;   // Columns mode (scrolls sideways)
let wins = [], zTop = 10, uid = 0;
var refreshAccountsPane = null;   // Settings > Accounts (desktop app)

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

export { $, BAR, colCount, colsMode, colWidth, coreVars, empty, GAP, input, lastLayout, MIN_H, MIN_W, modeSel, msg,
  mutedChk, popped, POPPED_KEY, refreshAccountsPane, ROLE, sizehint, SNAP, snapChk, stage, STORE, streamCols,
  STREAMS_STORE, wins, zTop };
