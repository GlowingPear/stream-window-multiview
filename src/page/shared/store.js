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
  'live',        // what the live checks last said about them
  'names',       // channel names learned from the sites
  'channelsBox', // the Channels box: its text, site tab and picked site
  'autoOpen',    // channels that open by themselves when they go live
  'liveAlerts',  // which channels you get live notifications for (all, or not these)
  'notes',       // the notifications under the bell
  'layout',      // the layout in use and its options
  'link'         // the link with Pear Drops: its state, what it's farming, Kick players signed out (platforms/pear-drops.js)
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
