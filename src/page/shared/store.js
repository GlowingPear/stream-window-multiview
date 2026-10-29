// What several parts of the page show, and which parts show it. A part that shows something watches it
// (store.watch('saved', renderSaved)); code that changes it says so (store.changed('saved')) instead of calling
// every part that shows it. The values themselves stay where they're kept (saved channels in
// panels/channels/channels.js, the windows in core.js, …): the store only knows who to tell.
// Watchers run straight away, in the order they started watching, so the page is up to date as soon as
// changed() returns. One changed() call runs each watcher once, even if it watches several of the things that
// changed (watch them with one watch() call). Watchers redraw; saving and telling the main process stay where
// the change is made.
// What can change (the names watch() and changed() take):
const TOPICS = new Set([
  'wins',        // windows opened or closed (core.js wins)
  'unread',      // new messages counted in the chats out of sight (chat/new-messages.js)
  'monitors',    // the monitors there now, and which layout part goes on which (layout/monitors.js)
  'saved',       // the saved channels
  'streamers',   // linked channels: the streamers, their accounts, and the switch (platforms/linked.js)
  'tabs',        // which tab a window with several sites shows, and its tabs (windows/frames.js)
  'barButtons',  // Settings › Windows: the title bars' names and buttons (panels/settings/windows-pane.js)
  'live',        // what the live checks last said about them
  'chatZoom',    // Settings › Chat › Chat text size (chat/chat-zoom.js)
  'chatName',    // Settings › Chat › Channel name in chat boxes: on, its text, or a channel's name learned (chat/chat-name.js)
  'mod',         // which channels you moderate, as the sites answered (platforms/platforms.js modIs)
  'names',       // channel names learned from the sites
  'channelsBox', // the Channels box: its text, site tab and picked site
  'autoOpen',    // channels that open by themselves when they go live
  'liveAlerts',  // which channels you get live notifications for (all, or not these)
  'notes',       // the notifications under the bell
  'layout',      // the layout in use and its options
  'link',        // the link with Pear Drops: its state, what it's farming, Kick players signed out (platforms/pear-drops.js)
  'reward',      // Kick's daily reward from Pear Drops, and whether the toolbar's chest shows (platforms/pear-drops.js)
  'dev',         // Settings › Developer › Developer tools on or off (panels/developer/developer.js)
  'palette',     // something the search box lists changed on its own (an answer from a site: panels/channels/channel-commands.js)
  'recent'       // what the search box remembers you ran (shared/commands.js), and Settings › Search box's switches
]);
const watchers = [];          // { topics, fn }, in the order they started watching
const checkTopic = t => { if (!TOPICS.has(t)) throw new Error(`Not something the store knows about: ${t} (see src/page/shared/store.js)`); };
const store = {
  watch(topics, fn){
    topics = [].concat(topics); topics.forEach(checkTopic);
    watchers.push({ topics: new Set(topics), fn });
  },
  changed(...topics){
    topics.forEach(checkTopic);
    watchers.filter(w => topics.some(t => w.topics.has(t))).forEach(w => w.fn());
  }
};

export { store };
