// Every test copy of the desktop app: loaded into its main process (with -r, see test/helpers.js) so the tests
// make no sound. The app's own pages (the main window, the switch control) are muted, so its alert sounds still
// play for the tests but you don't hear them. Streams, chats and site windows aren't touched: the tests check
// how the app mutes those itself.
const { app } = require('electron');
app.on('web-contents-created', (_e, wc) => {
  wc.on('did-navigate', (_ev, url) => { if (/^file:/.test(url)) try { wc.setAudioMuted(true); } catch {} });
});
