// What the page keeps in localStorage, shared by the main window and the streams window. Every key is listed
// here once (stored as "kickMultiview.<name>"). Reading never throws: a blocked storage or a damaged value reads
// as not set. Writing never throws either: set() says whether it worked (a full storage, e.g. a big sound file).
// Nothing here touches the page, so it loads at any point (and the unit tests load it on its own).
const settings = (() => {
const KEY_PREFIX = 'kickMultiview.';
const SETTING_NAMES = new Set([
  // windows and layouts
  'v1',                    // the main window's windows (persistence.js)
  'streams.v1',            // the streams window's windows
  'popped', 'popPartial',  // the streams window is open; only the streams you can't see went to it
  'lastLayout', 'streams.lastLayout', 'cols', 'colOrder', 'linked', 'featured', 'sideCols', 'pageStep',
  'switchMode', 'monitors', 'switchRect', 'layoutLocked', 'focusOnly', 'autoFit', 'autoPause', 'presets', 'game', 'toolbar',
  'chatZoom', 'chatBlowup', 'chatBlowSize', 'stageCh', 'stageSplit', 'stageZoom', 'railCh', 'railZoom', 'lastSession', 'startMuted', 'snap',
  // channels
  'saved', 'savedTab', 'autoOpen', 'notifyAll', 'notifyOff', 'chNames', 'ytNames', 'watchSignedIn',
  'chanOpts',              // Channel settings of a channel that isn't linked: its chat bots, its ALL tab (platforms/linked.js)
  'accounts', 'account', 'profView',
  // Settings › Linked channels: the switch, the linked streamers, pairs answered "Not the same", the page's options,
  // the first-time tip, and tabs closed or split out for each streamer
  'linkedOn', 'streamers', 'linkedNot', 'linkedOpts', 'linkedTip', 'linkedTabs',
  // the ALL tab of a linked streamer's chat window: the streamers it shows for, and whether bots' messages show
  'allOpen', 'allBots', 'allEvents', 'allSend', 'allTimeout',
  'allHype',               // ALL's hype train strip: 'shown' or 'hidden' (its filter menu)
  'allHidden',             // the sites a streamer's ALL hides (its K / T / Y switches): { [streamer id]: ['kick', …] }
  'allRecentEmotes',       // the emotes you sent from ALL last, for each site (the row over its box: chat/all-emotes.js)
  'allMyLook',             // how you looked in each chat (name, colour, badges): your line while it sends from ALL, before your first message there
  // Settings › Windows: the channel's name on stream / chat windows' title bars, and each button's place and ⋯ choice
  'barNameStream', 'barNameChat', 'barButtons',
  // Connected apps: Connect with Pear Drops, sign Kick players out while it farms, your Kick choice from
  // before that took over, the toolbar's farming widget and its daily reward chest
  'link.peardrops', 'link.kickAuto', 'link.kickBefore', 'link.widget', 'link.dailyReward',
  // the bell, mentions and alerts
  'notifications', 'alerts', 'msg', 'mentions', 'spamHistory',   // (the last two: from before the bell, read once)
  'mentOn', 'mentMuted', 'mentWords', 'myName', 'myTwitch', 'bellCount', 'dnd',
  'dndFor', 'desktopNotify',
  // chats
  'autoTranslate', 'noTranslate', 'translateAll', 'emotePreview', 'newEmotes', 'chatName', 'chatNameText', 'chatOverlay', 'chatOverlayOff', 'chatOverlayKeep', 'chatOverlaySecs', 'chatOverlayLines', 'chatCounts',
  // Settings › Chat › Shoutouts (chat/shoutout.js): on, the message, People, Twitch's own, asking again, a run's size, streamers only, the list first;
  // who's who (their address, last game, whether they stream) and when you shouted them out
  'shoutOn', 'shoutText', 'shoutPeople', 'shoutTwitch', 'shoutAgain', 'shoutRunN', 'shoutStreamers', 'shoutListFirst', 'shoutKnown', 'shoutSent',
  // YouTube
  'ytSkip', 'ytConsent', 'ytAutoLike', 'ytAutoLiked', 'ytChatView',
  // the app
  'theme', 'themes', 'settingsTab', 'keys', 'arrowSound', 'intro', 'seenVersion',
  'palette',               // the search box (Ctrl/⌘+K): what you ran last, and how often (shared/commands.js)
  'paletteOn', 'paletteRecent',   // Settings › Search box: the box itself, and remembering what you run
  // Settings › Developer: Developer tools on, and that you were told what Inspect can see
  'dev', 'devWarned',
  'eventSamples'           // Settings › Developer › Chat events: collecting them (on unless switched off)
]);
// your own alert sound for a kind of alert, as a data: URL ('alertSound.mention', …)
const isSetting = name => SETTING_NAMES.has(name) || /^alertSound\.\w+$/.test(name);
const storageKey = name => {
  if (!isSetting(name)) throw new Error(`Not a saved setting: ${name} (add it to src/page/shared/settings.js)`);
  return KEY_PREFIX + name;
};

const readRaw = name => { const k = storageKey(name); try { return localStorage.getItem(k); } catch { return null; } };

return {
  get: readRaw,
  // On/off, stored as '1' / '0'. Off by default: only '1' is on. On by default: only '0' is off.
  flag(name, on = false){ const v = readRaw(name); return on ? v !== '0' : v === '1'; },
  text: (name, def = '') => readRaw(name) || def,
  num: (name, def = 0) => +readRaw(name) || def,
  json(name, def = null) {
    const v = readRaw(name);
    if (v === null) return def;
    try { return JSON.parse(v) ?? def; } catch { return def; }
  },
  // true / false become '1' / '0', strings stay, numbers become text, anything else JSON; null removes it
  set(name, value) {
    const k = storageKey(name);
    try {
      if (value === null || value === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'string' ? value
        : typeof value === 'number' ? String(value) : JSON.stringify(value));
      return true;
    } catch { return false; }
  },
  remove(name){ return this.set(name, null); },
  // Changed in the other window (the storage event, which never fires in the window that made the change):
  // fn(name, newValue) for each of the names.
  onChange(names, fn) {
    const want = new Map([].concat(names).map(n => [storageKey(n), n]));
    window.addEventListener('storage', e => { if (want.has(e.key)) fn(want.get(e.key), e.newValue); });
  }
};
})();

export { settings };
