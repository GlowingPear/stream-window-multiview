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
  // Settings › General: the streams' quality, Fits the window's range, and what streams you can't see play at (windows/quality.js)
  'quality', 'qualityFit', 'qualityHidden',
  // channels
  'saved', 'savedTab', 'autoOpen', 'notifyAll', 'notifyOff', 'chNames', 'ytNames', 'watchSignedIn',
  'chanOpts',              // Channel settings of a channel that isn't linked: its chat bots, its ALL tab, its streams' quality (platforms/linked.js)
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
  'mentOn', 'mentMuted', 'mentWords', 'myName', 'myTwitch', 'myYouTube', 'bellCount', 'dnd',
  'dndFor', 'desktopNotify',
  // chats
  'autoTranslate', 'noTranslate', 'translateAll', 'emotePreview', 'newEmotes', 'bigEmoteMenu', 'chatName', 'chatNameText', 'chatOverlay', 'chatOverlayOff', 'chatOverlayKeep', 'chatOverlaySecs', 'chatOverlayLines', 'chatCounts',
  // Settings › Shoutouts (chat/shoutout.js): on, only where you're a mod, sending, the message, the channels' cards (#300's People rows, moved over), Twitch's own, asking again, a run's size, streamers only, the list first;
  // who's who (their address, last game, whether they stream) and when you shouted them out
  'shoutOn', 'shoutModOnly', 'shoutSend', 'shoutText', 'shoutChannels', 'shoutPeople', 'shoutTwitch', 'shoutAgain', 'shoutRunN', 'shoutStreamers', 'shoutListFirst', 'shoutKnown', 'shoutSent',
  // YouTube
  'ytSkip', 'ytConsent', 'ytAutoLike', 'ytAutoLiked', 'ytChatView',
  // the app
  'theme', 'themes', 'settingsTab', 'keys', 'arrowSound', 'intro', 'seenVersion',
  'palette',               // the search box (Ctrl/⌘+K): what you ran last, and how often (shared/commands.js)
  'paletteOn', 'paletteRecent',   // Settings › Search box: the box itself, and remembering what you run
  // Settings › Developer: Developer tools on, and that you were told what Inspect can see
  'dev', 'devWarned',
  'eventSamples',          // Settings › Developer › Chat events: collecting them (on unless switched off)
  'syncSeen'               // Settings › Sync was opened (its "New" badge goes)
]);
/* Settings › Sync (#337): which keys go to your other computers. Every key above is in exactly one of these two
   lists (npm test checks), so a new setting has to decide. The channel keys sync as one list of channels, each
   with its auto-open, alerts and name; alertSound.* (not listed) sync as files of their own. Windows, layouts,
   sign-ins, history and what's only about this computer stay here. */
const SYNCED = new Set([
  'theme', 'themes', 'keys', 'arrowSound', 'barNameStream', 'barNameChat', 'barButtons', 'toolbar', 'paletteOn', 'paletteRecent',
  'saved', 'autoOpen', 'notifyAll', 'notifyOff', 'chNames', 'chanOpts',
  'linkedOn', 'streamers', 'linkedNot', 'linkedOpts', 'allBots', 'allEvents', 'allSend', 'allTimeout', 'allHype', 'allHidden',
  'mentOn', 'mentMuted', 'mentWords', 'myName', 'myTwitch', 'myYouTube', 'dndFor', 'desktopNotify', 'alerts',
  'autoTranslate', 'noTranslate', 'translateAll', 'emotePreview', 'newEmotes', 'bigEmoteMenu', 'chatName', 'chatNameText',
  'chatOverlay', 'chatOverlayOff', 'chatOverlayKeep', 'chatOverlaySecs', 'chatOverlayLines', 'chatCounts',
  'shoutOn', 'shoutModOnly', 'shoutSend', 'shoutText', 'shoutChannels', 'shoutTwitch', 'shoutAgain', 'shoutRunN', 'shoutStreamers', 'shoutListFirst',
  'ytSkip', 'ytAutoLike', 'ytChatView',
  'startMuted', 'autoPause', 'snap', 'quality', 'qualityFit', 'qualityHidden'
]);
const NOT_SYNCED = new Set([
  'v1', 'streams.v1', 'popped', 'popPartial', 'lastLayout', 'streams.lastLayout', 'cols', 'colOrder', 'linked', 'featured', 'sideCols', 'pageStep',
  'switchMode', 'monitors', 'switchRect', 'layoutLocked', 'focusOnly', 'autoFit', 'game', 'chatZoom', 'chatBlowup', 'chatBlowSize',
  'stageCh', 'stageSplit', 'stageZoom', 'railCh', 'railZoom', 'lastSession', 'presets',
  'accounts', 'account', 'link.peardrops', 'link.kickAuto', 'link.kickBefore', 'link.widget', 'link.dailyReward',
  'notifications', 'bellCount', 'msg', 'dnd', 'shoutKnown', 'shoutSent', 'allRecentEmotes', 'allMyLook', 'ytAutoLiked', 'ytConsent', 'spamHistory', 'mentions',
  'dev', 'devWarned', 'eventSamples', 'seenVersion', 'intro', 'settingsTab', 'savedTab', 'profView', 'allOpen', 'linkedTabs', 'linkedTip', 'watchSignedIn', 'palette', 'syncSeen',
  'ytNames', 'shoutPeople'   // (only read once, from older versions)
]);
/* A synced setting's version (1 unless it says otherwise). Changing what a synced setting holds means a new
   version here, a step in UPGRADES that turns the old value into the new one, and a test file for the old one
   (src/page/README.md). Another computer's value from an older version is upgraded when it arrives; one from a
   newer version waits until this copy updates. */
const VERSIONS = {};
const UPGRADES = {};               // { key: [v1 -> v2, v2 -> v3, …] }: each takes the stored text and gives the next
const syncs = name => SYNCED.has(name) || /^alertSound\.\w+$/.test(name);
const afterSet = [];               // fn(name, text) after a synced key is set here (panels/settings/sync.js)
const listeners = [];              // { want, fn }: settings.onChange's, so a synced value is heard in this window too
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
      if (syncs(name)) { const text = readRaw(name); afterSet.forEach(fn => fn(name, text)); }
      return true;
    } catch { return false; }
  },
  remove(name){ return this.set(name, null); },
  // Changed in the other window (the storage event, which never fires in the window that made the change):
  // fn(name, newValue) for each of the names.
  onChange(names, fn) {
    const want = new Map([].concat(names).map(n => [storageKey(n), n]));
    listeners.push({ want, fn });
    window.addEventListener('storage', e => { if (want.has(e.key)) fn(want.get(e.key), e.newValue); });
  },

  // Settings › Sync
  syncs,
  synced: () => [...SYNCED],
  decided: name => SYNCED.has(name) ? 'sync' : NOT_SYNCED.has(name) ? 'local' : '',
  names: () => [...SETTING_NAMES],
  version: name => VERSIONS[name] || 1,
  versions: () => Object.fromEntries([...SYNCED].map(n => [n, VERSIONS[n] || 1])),
  // Another computer's value, written with version v of the setting -> the text for this copy, or undefined when
  // it can't be used here (a newer version, or a step that failed). (steps and to: the tests')
  upgrade(name, v, text, steps = UPGRADES[name] || [], to = VERSIONS[name] || 1) {
    if ((v || 1) > to) return undefined;
    try { for (let at = v || 1; at < to; at++) text = steps[at - 1](text); return text; } catch { return undefined; }
  },
  afterSet(fn){ afterSet.push(fn); },
  // A value from another computer: saved, and heard by this window's onChange handlers as a change from the other
  // window would be (the other window hears it through the storage event as usual). Not passed on to afterSet.
  applySynced(name, text) {
    const k = storageKey(name);
    try { if (text === null || text === undefined) localStorage.removeItem(k); else localStorage.setItem(k, text); } catch { return false; }
    for (const l of listeners) if (l.want.has(k)) { try { l.fn(name, text ?? null); } catch (e) { console.warn('sync: ' + name, e); } }
    return true;
  },
  // Does anything in this window take a change of this setting while the page is open? (every synced key must)
  listening: name => { const k = storageKey(name); return listeners.some(l => l.want.has(k)); }
};
})();

export { settings };
